// 正式發布的唯讀驗證：僅讀取 GitHub 狀態與公開靜態檔案，不登入或讀取 Firebase。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';

const root = resolve(import.meta.dirname, '..');
const options = Object.fromEntries(process.argv.slice(2).map(argument => {
    const matched = /^--([a-z-]+)=(.+)$/.exec(argument);
    assert.ok(matched, '參數格式須為 --attempts=30、--interval-ms=10000 或 --sha=版本提交碼');
    assert.ok(['attempts', 'interval-ms', 'sha'].includes(matched[1]), `未知參數：${matched[1]}`);
    return [matched[1], matched[2]];
}));
const attempts = Number(options.attempts ?? 30);
const interval = Number(options['interval-ms'] ?? 10000);
assert.ok(Number.isInteger(attempts) && attempts >= 1 && attempts <= 60, '驗證次數須介於 1 至 60');
assert.ok(Number.isInteger(interval) && interval >= 1000 && interval <= 30000, '重試間隔須介於 1000 至 30000 毫秒');
const run = (command, arguments_) => execFileSync(command, arguments_, {
    cwd: root, encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
}).trim();
const git = (...arguments_) => run('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...arguments_]);
const remote = git('remote', 'get-url', 'origin');
const repository = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/.exec(remote)?.[1];
assert.ok(repository, '目前只支援 GitHub origin 遠端');
const packageConfig = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const homepage = new URL(`${packageConfig.homepage.replace(/\/$/, '')}/`);
const localVersion = JSON.parse(await readFile(join(root, 'dist/version.json'), 'utf8'));
assert.equal(typeof localVersion.version, 'string', '請先建置 dist/version.json');
const sourceSha = /-([0-9a-f]{7,40})$/i.exec(localVersion.version)?.[1];
assert.ok(sourceSha, '本機版本須包含來源提交碼');
const expectedSource = options.sha || git('rev-parse', 'HEAD');
assert.ok(expectedSource.startsWith(sourceSha) || sourceSha.startsWith(expectedSource),
    '本機建置不是預期來源提交，請先重新建置');
if (!options.sha) {
    const sourceBranch = git('branch', '--show-current');
    assert.ok(sourceBranch, '請從來源分支執行發布查核');
    const pushedSource = git('ls-remote', 'origin', `refs/heads/${sourceBranch}`).split(/\s/)[0];
    assert.equal(pushedSource, expectedSource, '來源提交尚未推送至對應遠端分支');
}
if (options.sha) {
    assert.match(options.sha, /^[0-9a-f]{7,40}$/i, '提交碼格式不正確');
    assert.ok(options.sha.startsWith(sourceSha) || sourceSha.startsWith(options.sha), '指定提交碼與本機建置不同');
}
const moduleSource = html => /<script\b(?=[^>]*\btype=["']module["'])[^>]*\bsrc=["']([^"']+)["'][^>]*>/i.exec(html)?.[1];
const localHtml = await readFile(join(root, 'dist/index.html'), 'utf8');
const localModule = moduleSource(localHtml);
assert.ok(localModule, '本機首頁未找到模組主程式');
const moduleUrl = new URL(localModule, homepage);
assert.equal(moduleUrl.origin, homepage.origin, '主程式須位於相同正式網域');
assert.ok(moduleUrl.pathname.startsWith(homepage.pathname), '主程式須位於專案目錄');
const localModulePath = moduleUrl.pathname.slice(homepage.pathname.length);
assert.ok(!localModulePath.split('/').includes('..'), '主程式路徑不合法');
const localBytes = await readFile(join(root, 'dist', localModulePath));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const localHash = sha256(localBytes);
const phrase = '一鍵打包各班名單';
assert.ok(localBytes.toString('utf8').includes(phrase), '本機主程式未包含班級打包按鈕');
assert.ok(localBytes.toString('utf8').includes(localVersion.version), '本機主程式版本與 version.json 不一致');
const github = endpoint => JSON.parse(run('gh', ['api', `repos/${repository}/${endpoint}`]));
const get = async url => {
    const cacheSafeUrl = new URL(url);
    cacheSafeUrl.searchParams.set('release_check', String(Date.now()));
    const response = await fetch(cacheSafeUrl, { signal: AbortSignal.timeout(15000),
        headers: { 'cache-control': 'no-cache' }, redirect: 'error' });
    assert.ok(response.ok, `正式檔案讀取失敗：${response.status} ${url}`);
    return Buffer.from(await response.arrayBuffer());
};

console.log(`開始唯讀驗證：${homepage.href}`);
console.log(`預期正式版本：${localVersion.version}，最多 ${attempts} 次查核`);
let lastError;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
        const pages = github('pages');
        assert.equal(pages.source?.branch, 'gh-pages', 'Pages 部署來源不是 gh-pages');
        const branchSha = git('ls-remote', 'origin', 'refs/heads/gh-pages').split(/\s/)[0];
        assert.match(branchSha, /^[0-9a-f]{40}$/, '無法取得遠端部署分支提交碼');
        const actions = github('actions/runs?branch=gh-pages&per_page=20');
        const currentRun = actions.workflow_runs.find(item => item.head_sha === branchSha && /pages/i.test(item.name));
        let build;
        try { build = github('pages/builds/latest'); } catch { /* 工作流模式可能沒有傳統建置紀錄。 */ }
        assert.ok(currentRun || build?.commit === branchSha, '尚無對應最新部署分支的 Pages 建置');
        if (currentRun) {
            assert.equal(currentRun.status, 'completed', '最新 Pages 工作流尚未結束');
            assert.equal(currentRun.conclusion, 'success', '最新 Pages 工作流未成功');
        } else assert.equal(build.status, 'built', '最新 Pages 建置尚未完成');
        assert.equal(pages.status, 'built', 'Pages 尚未顯示建置完成');
        const remoteVersion = JSON.parse((await get(new URL('version.json', homepage))).toString('utf8'));
        assert.equal(remoteVersion.version, localVersion.version, '正式版本與本機建置尚未一致');
        assert.equal(remoteVersion.builtAt, localVersion.builtAt, '正式建置時間與本機不同');
        const remoteHtml = (await get(homepage)).toString('utf8');
        assert.equal(moduleSource(remoteHtml), localModule, '正式首頁仍載入不同主程式');
        const remoteBytes = await get(moduleUrl);
        const remoteHash = sha256(remoteBytes);
        assert.equal(remoteHash, localHash, '正式主程式 SHA-256 與本機不同');
        assert.ok(remoteBytes.toString('utf8').includes(phrase), '正式主程式缺少班級打包按鈕');
        assert.ok(remoteBytes.toString('utf8').includes(localVersion.version), '正式主程式版本不符');
        console.log(`驗證完成：第 ${attempt} 次查核全部通過`);
        console.log(`Pages 來源：${pages.source.branch}，狀態：${pages.status}`);
        console.log(`遠端部署提交碼：${branchSha}`);
        console.log(`正式版本：${remoteVersion.version}`);
        console.log(`首頁載入主程式：${localModule}`);
        console.log(`本機與正式 SHA-256：${remoteHash}`);
        console.log(`Pages 建置：${currentRun?.html_url || `https://github.com/${repository}/deployments`}`);
        console.log(`已確認正式主程式含「${phrase}」；未登入後台、未讀取 Firebase 或學生資料。`);
        process.exitCode = 0;
        lastError = undefined;
        break;
    } catch (error) {
        lastError = error;
        // 只回報第一行，避免 CLI 錯誤或遠端內容擠滿終端。
        console.log(`查核 ${attempt}/${attempts} 尚未通過：${String(error.message).split('\n')[0]}`);
        if (attempt < attempts) await pause(interval);
    }
}
if (lastError) {
    console.error('正式發布尚未通過驗證，請確認建置、網路或 GitHub Pages 更新狀態後再試。');
    process.exitCode = 1;
}

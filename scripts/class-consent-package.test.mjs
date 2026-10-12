// 使用合成資料驗證 ZIP／Excel 與隔離後台操作，不存取正式資料。
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import JSZip from 'jszip';
import XLSX from 'xlsx';

const root = resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(join(tmpdir(), 'signature-package-test-'));
const cases = [];
const verify = async (name, run) => {
    await run();
    cases.push(name);
    console.log(`通過：${name}`);
};
const fixture = (id, changes = {}) => ({
    id, city: '桃園市', school: '測試甲校', grade: '6', cls: '1', seat: '1',
    studentName: `合成學生${id}`, parentName: `合成家長${id}`,
    signatureUrl: 'https://example.invalid/signature.png',
    email: 'synthetic@example.invalid', pdfUrl: 'https://example.invalid/consent.pdf',
    timestamp: { toDate: () => new Date('2026-10-01T02:30:00Z'), toMillis: () => 1790821800000 },
    isAgreed: true,
    ...changes,
});
const rows = (workbook, sheet) => XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { defval: '' });
const inspectPackage = async (bytes) => {
    const zip = await JSZip.loadAsync(bytes);
    const workbooks = new Map();
    for (const [name, file] of Object.entries(zip.files)) {
        if (!file.dir && name.endsWith('.xlsx')) {
            workbooks.set(name, XLSX.read(await file.async('nodebuffer'), { type: 'buffer' }));
        }
    }
    return { zip, workbooks };
};

try {
    await build({ entryPoints: [join(root, 'src/utils/classConsentPackage.ts')],
        bundle: true, platform: 'node', format: 'cjs',
        outfile: join(temporary, 'package.cjs'), logLevel: 'silent' });
    const { buildClassConsentPackage, getConsentStatus } =
        (await import(pathToFileURL(join(temporary, 'package.cjs')).href)).default;
    const filters = { searchTerm: '', cityFilter: '', schoolFilter: '', gradeFilter: '', classFilter: '' };
    const detailRows = (pack) => rows(pack.workbooks.get('班級總覽.xlsx'), '全部明細');
    const classBooks = (pack) => [...pack.workbooks].filter(([name]) => name !== '班級總覽.xlsx');

    await verify('意願只接受布林值；缺漏、字串與數字均列為未記錄', () => {
        assert.equal(getConsentStatus(true), '同意');
        assert.equal(getConsentStatus(false), '不同意');
        for (const value of [undefined, null, '', 'false', 'true', 0, 1, {}]) {
            assert.equal(getConsentStatus(value), '意願未記錄');
        }
    });
    const sample = [fixture('a', { seat: '10' }), fixture('b', { seat: '02', cls: '01', grade: '06', isAgreed: false }),
        fixture('c', { seat: '1', isAgreed: undefined }), fixture('d', { seat: '3', isAgreed: null }),
        fixture('e', { school: '測試乙校' })];
    const pack = await inspectPackage(await buildClassConsentPackage(sample, filters));
    await verify('同班跨校分開，數字年班前置零合併，座號依數值排序', () => {
        assert.equal(classBooks(pack).length, 2);
        const schoolA = classBooks(pack).find(([name]) => name.includes('測試甲校'))[1];
        assert.deepEqual(rows(schoolA, '全部明細').map((row) => row['座號']), ['1', '2', '3', '10']);
        assert.deepEqual(rows(schoolA, '全部明細').map((row) => row['紀錄 ID']), ['c', 'b', 'd', 'a']);
        assert.equal(rows(schoolA, '同意').length, 1);
        assert.equal(rows(schoolA, '不同意').length, 1);
        assert.equal(rows(schoolA, '意願未記錄').length, 2);
    });
    await verify('班級總覽與三種意願筆數加總一致，明細完整保留', () => {
        const overview = pack.workbooks.get('班級總覽.xlsx');
        const total = rows(overview, '班級總覽').at(-1);
        assert.equal(total['全部簽署筆數'], 5);
        assert.equal(total['同意簽署筆數'], 2);
        assert.equal(total['不同意簽署筆數'], 1);
        assert.equal(total['意願未記錄簽署筆數'], 2);
        assert.equal(detailRows(pack).length, 5);
        assert.deepEqual(new Set(detailRows(pack).map((row) => row['紀錄 ID'])), new Set(sample.map((item) => item.id)));
        assert.equal(detailRows(pack)[0]['家長 Email'], 'synthetic@example.invalid');
        assert.equal(detailRows(pack)[0]['PDF 連結'], 'https://example.invalid/consent.pdf');
    });
    await verify('無資料的分類工作表仍保留全部欄位表頭', () => {
        const schoolB = classBooks(pack).find(([name]) => name.includes('測試乙校'))[1];
        for (const name of ['不同意', '意願未記錄']) {
            assert.equal(rows(schoolB, name).length, 0);
            assert.deepEqual(XLSX.utils.sheet_to_json(schoolB.Sheets[name], { header: 1 })[0],
                XLSX.utils.sheet_to_json(schoolB.Sheets['全部明細'], { header: 1 })[0]);
        }
    });
    await verify('重複學生與紀錄 ID 不會遭自動去重', async () => {
        const repeated = fixture('repeated', { studentName: '合成重複學生' });
        const repeatedPack = await inspectPackage(await buildClassConsentPackage([repeated,
            { ...repeated }, { ...repeated, id: 'another', isAgreed: false }], filters));
        assert.equal(detailRows(repeatedPack).length, 3);
        assert.equal(detailRows(repeatedPack).filter((row) => row['紀錄 ID'] === 'repeated').length, 2);
    });
    await verify('簽署時間換算臺灣時間，無效時間不捏造現在時間', async () => {
        const times = [undefined, null, '2026-10-01', new Date('invalid'), { toDate() { throw new Error('合成錯誤'); } }];
        const datePack = await inspectPackage(await buildClassConsentPackage([
            fixture('valid'), ...times.map((timestamp, i) => fixture(`invalid${i}`, { timestamp }))], filters));
        for (const row of detailRows(datePack)) {
            assert.equal(row['簽署時間（臺灣）'], row['紀錄 ID'] === 'valid' ? '2026-10-01 10:30:00' : '未記錄');
        }
    });
    await verify('篩選條件與資料限制保存於匯出說明', async () => {
        const selectedFilters = { searchTerm: '合成學生', cityFilter: '桃園市', schoolFilter: '測試甲校', gradeFilter: '6', classFilter: '1' };
        const selected = await inspectPackage(await buildClassConsentPackage([fixture('filter')], selectedFilters));
        for (const book of selected.workbooks.values()) {
            const notes = rows(book, '匯出說明');
            for (const value of Object.values(selectedFilters)) assert.ok(notes.some((row) => row['內容'] === value));
            assert.ok(notes.some((row) => String(row['內容']).includes('無法') && String(row['內容']).includes('尚未簽署')));
            assert.ok(notes.some((row) => String(row['內容']).includes('多次簽署')));
        }
    });
    await verify('非法路徑、大小寫與清理後同名班校不覆蓋資料', async () => {
        const schools = ['測試/校', '測試\\校', '../測試校', 'CON', 'Case', 'case', '', '未填學校'];
        const unsafe = await inspectPackage(await buildClassConsentPackage(schools.map((school, i) => fixture(`path${i}`, { school })), filters));
        assert.equal(classBooks(unsafe).length, schools.length);
        const names = classBooks(unsafe).map(([name]) => name);
        assert.equal(new Set(names.map((name) => name.toLowerCase())).size, schools.length);
        for (const name of names) {
            assert.ok(!name.split('/').includes('..'));
            assert.ok(!/[\\<>:"|?*]/.test(name));
        }
        assert.equal(detailRows(unsafe).length, schools.length);
    });
    await verify('分組鍵含分隔符仍保持不同縣市學校獨立', async () => {
        const adversarial = await inspectPackage(await buildClassConsentPackage([
            fixture('tuple1', { city: '桃園|市', school: '測試校' }),
            fixture('tuple2', { city: '桃園', school: '市|測試校' }),
        ], filters));
        assert.equal(classBooks(adversarial).length, 2);
    });
    await verify('公式樣式的姓名與連結保持文字型別', async () => {
        const formula = await inspectPackage(await buildClassConsentPackage([fixture('formula', {
            studentName: '=SUM(1,2)', parentName: '+合成家長', email: '@example.invalid', signatureUrl: '-合成連結',
        })], filters));
        const sheet = formula.workbooks.get('班級總覽.xlsx').Sheets['全部明細'];
        for (const address of ['F2', 'G2', 'H2', 'K2']) {
            assert.equal(sheet[address].t, 's');
            assert.equal(sheet[address].f, undefined);
        }
        assert.equal(sheet.F2.v, '=SUM(1,2)');
    });
    await verify('空篩選結果明確拒絕打包', async () => {
        await assert.rejects(buildClassConsentPackage([], filters), /沒有簽署資料/);
    });

    // 以真實元件與匯出函式操作瀏覽器，只替換 Firebase 資料來源及加入等待閘門。
    const uiFixtures = [
        fixture('ui-agree', { studentName: '合成學生目標甲' }),
        fixture('ui-disagree', { studentName: '合成學生目標乙', seat: '2', cls: '01', isAgreed: false }),
        fixture('ui-unknown', { studentName: '合成學生目標丙', seat: '3', isAgreed: null }),
        fixture('off-school', { school: '測試乙校', studentName: '合成學生目標丁' }),
        fixture('off-grade', { grade: '5', studentName: '合成學生目標戊' }),
        fixture('off-class', { cls: '2', studentName: '合成學生目標己' }),
        fixture('off-city', { city: '臺北市', studentName: '合成學生目標庚' }),
        fixture('off-search', { studentName: '合成其他學生' }),
    ];
    const utilityPath = join(root, 'src/utils/classConsentPackage.ts').replaceAll('\\', '/');
    const uiEntry = `import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {MemoryRouter} from 'react-router-dom';
        import Dashboard from ${JSON.stringify(join(root, 'src/components/AdminDashboard.tsx').replaceAll('\\', '/'))};
        createRoot(document.getElementById('root')).render(<MemoryRouter><Dashboard /></MemoryRouter>);`;
    await build({ stdin: { contents: uiEntry, loader: 'tsx', resolveDir: root },
        bundle: true, platform: 'browser', format: 'iife', outfile: join(temporary, 'ui.js'),
        define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
        plugins: [{ name: '隔離合成資料', setup(builder) {
            builder.onResolve({ filter: /^(?:\.\.\/firebase|firebase\/firestore|firebase\/auth|\.\.\/utils\/batchDownloader|\.\.\/utils\/classConsentPackage)$/ },
                ({ path }) => ({ path, namespace: 'synthetic' }));
            builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, ({ path }) => {
                let contents;
                if (path === '../firebase') contents = 'export const db = {}; export const auth = {};';
                else if (path === 'firebase/auth') contents = 'export async function signOut() { throw new Error("不允許測試登出"); }';
                else if (path === '../utils/batchDownloader') contents = 'export async function downloadBatchPDFs() { throw new Error("不允許測試其他下載"); }';
                else if (path === '../utils/classConsentPackage') contents = `
                    import {downloadClassConsentPackage as actual, getConsentStatus} from ${JSON.stringify(utilityPath)};
                    export {getConsentStatus};
                    export async function downloadClassConsentPackage(records, filters) {
                        window.__packageCalls = (window.__packageCalls || 0) + 1;
                        window.__lastPayload = {records, filters};
                        await new Promise(resolve => { window.__releasePackage = resolve; });
                        if (window.__failPackage) throw new Error('合成打包失敗');
                        await actual(records, filters);
                    }`;
                else contents = `export class Timestamp {}
                    export const collection = () => ({}); export const query = () => ({}); export const orderBy = () => ({});
                    export const deleteDoc = () => { throw new Error('不允許刪除'); };
                    export const doc = () => ({}); export const writeBatch = () => { throw new Error('不允許批次刪除'); };
                    export async function getDocs() {
                        await new Promise(resolve => { window.__releaseLoad = resolve; });
                        const records = ${JSON.stringify(uiFixtures)};
                        return { docs: records.map(record => ({id: record.id, data: () => ({...record,
                            timestamp: {toDate: () => new Date('2026-10-01T02:30:00Z'), toMillis: () => 1790821800000}})})) };
                    }`;
                return { contents, loader: 'js', resolveDir: root };
            });
        } }] });
    const assetFiles = await readdir(join(root, 'dist/assets'));
    const cssName = assetFiles.find((file) => /^index-.*\.css$/.test(file));
    assert.ok(cssName, '請先執行 npm run build，以正式 CSS 驗證手機版排版');
    const uiBytes = await readFile(join(temporary, 'ui.js'));
    const cssBytes = await readFile(join(root, 'dist/assets', cssName));
    const server = createServer((request, response) => {
        if (request.url === '/ui.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(uiBytes); }
        else if (request.url === '/style.css') { response.setHeader('Content-Type', 'text/css'); response.end(cssBytes); }
        else { response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end('<!doctype html><html lang="zh-Hant"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/ui.js"></script></body></html>'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const runtimeRoot = process.env.CODEX_PLAYWRIGHT_ROOT || 'C:/Users/smes/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
    const { chromium } = await import(pathToFileURL(join(runtimeRoot, 'index.mjs')).href);
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
        await context.route('**/*', route => route.request().url().startsWith(origin) || route.request().url().startsWith('blob:') ? route.continue() : route.abort());
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin);
        await page.waitForFunction(() => typeof window.__releaseLoad === 'function');
        const packageButton = () => page.getByRole('button', { name: /一鍵打包各班名單|正在整理各班名單/ });
        await verify('資料尚未載入時打包按鈕停用', async () => {
            assert.equal(await packageButton().isDisabled(), true);
            await page.evaluate(() => window.__releaseLoad());
            await page.waitForFunction(() => document.body.textContent.includes('目前篩選：8 筆'));
            assert.equal(await packageButton().isEnabled(), true);
        });
        await verify('縣市、學校、年級、班級及搜尋篩選得到三種意願的目標資料', async () => {
            await page.locator('select').nth(0).selectOption('桃園市');
            await page.getByPlaceholder('學校名稱...').fill('測試甲校');
            await page.locator('select').nth(1).selectOption('6');
            await page.locator('select').nth(2).selectOption('1');
            await page.getByPlaceholder('搜尋...').fill('合成學生目標');
            await page.waitForFunction(() => document.body.textContent.includes('目前篩選：3 筆｜同意 1 筆｜不同意 1 筆｜意願未記錄 1 筆'));
            await page.locator('tbody tr').first().locator('td button').first().click();
            assert.ok(await page.getByRole('button', { name: '下載 PDF (1)' }).isEnabled());
        });
        await verify('一鍵下載實際 ZIP 包含全部篩選結果，不受單筆勾選影響', async () => {
            const downloaded = page.waitForEvent('download');
            await packageButton().click();
            await page.waitForFunction(() => typeof window.__releasePackage === 'function');
            assert.equal(await packageButton().isDisabled(), true);
            assert.equal(await packageButton().getAttribute('aria-busy'), 'true');
            await page.evaluate(() => window.__releasePackage());
            const download = await downloaded;
            assert.match(download.suggestedFilename(), /^班級同意書資料包_\d+\.zip$/);
            const downloadedPack = await inspectPackage(await readFile(await download.path()));
            assert.deepEqual(new Set(detailRows(downloadedPack).map(row => row['紀錄 ID'])),
                new Set(['ui-agree', 'ui-disagree', 'ui-unknown']));
            assert.equal(classBooks(downloadedPack).length, 1);
            const received = await page.evaluate(() => ({ ids: window.__lastPayload.records.map(record => record.id), filters: window.__lastPayload.filters, calls: window.__packageCalls }));
            assert.equal(received.calls, 1);
            assert.equal(received.ids.length, 3);
            assert.deepEqual(received.filters, { searchTerm: '合成學生目標', cityFilter: '桃園市', schoolFilter: '測試甲校', gradeFilter: '6', classFilter: '1' });
            await page.getByRole('status').filter({ hasText: 'ZIP 下載已開始' }).waitFor();
            assert.equal(await packageButton().isEnabled(), true);
        });
        await verify('空篩選停用打包，恢復資料後可再次操作', async () => {
            await page.getByPlaceholder('搜尋...').fill('合成無匹配字串');
            assert.equal(await packageButton().isDisabled(), true);
            await page.getByPlaceholder('搜尋...').fill('合成學生目標');
            assert.equal(await packageButton().isEnabled(), true);
        });
        await verify('打包失敗提示後按鈕解除鎖定，重試仍可下載', async () => {
            await page.evaluate(() => { window.__failPackage = true; window.__releasePackage = undefined; });
            await packageButton().click();
            await page.waitForFunction(() => typeof window.__releasePackage === 'function');
            await page.evaluate(() => window.__releasePackage());
            await page.getByRole('alert').filter({ hasText: '班級名單打包失敗' }).waitFor();
            assert.equal(await packageButton().isEnabled(), true);
            await page.evaluate(() => { window.__failPackage = false; window.__releasePackage = undefined; });
            const retryDownload = page.waitForEvent('download');
            await packageButton().click();
            await page.waitForFunction(() => typeof window.__releasePackage === 'function');
            await page.evaluate(() => window.__releasePackage());
            await retryDownload;
            await page.getByRole('status').filter({ hasText: 'ZIP 下載已開始' }).waitFor();
        });
        await verify('桌機與手機寬度無水平溢出，學生資料動畫完成後保持可見', async () => {
            for (const width of [1280, 390]) {
                await page.setViewportSize({ width, height: 900 });
                await page.waitForFunction((mobile) => {
                    const records = mobile ? [...document.querySelectorAll('h3')]
                        .filter(heading => heading.textContent.includes('合成學生目標'))
                        .map(heading => heading.closest('div.border-l-4'))
                        : [...document.querySelectorAll('tbody tr')];
                    return records.length === 3 && records.every(record => record &&
                        record.getBoundingClientRect().width > 0 && Number(getComputedStyle(record).opacity) >= 0.999);
                }, width === 390);
                const bounds = await page.evaluate(() => ({ view: innerWidth, body: document.documentElement.scrollWidth }));
                assert.ok(bounds.body <= bounds.view, `${width} px 溢出：${bounds.body}`);
                assert.equal(await packageButton().isVisible(), true);
                if (width === 390) {
                    for (const name of ['合成學生目標甲', '合成學生目標乙', '合成學生目標丙']) {
                        const heading = page.getByRole('heading', { name, exact: true });
                        await heading.scrollIntoViewIfNeeded();
                        assert.equal(await heading.isVisible(), true);
                        const headingBounds = await heading.boundingBox();
                        assert.ok(headingBounds && headingBounds.y >= 0 && headingBounds.y < 900,
                            `${name} 應能實際捲入手機視窗`);
                        assert.ok(await heading.evaluate(element =>
                            Number(getComputedStyle(element.closest('div.border-l-4')).opacity) >= 0.999));
                    }
                    await page.evaluate(() => window.scrollTo(0, 0));
                }
                if (process.env.CLASS_PACKAGE_SCREENSHOT_DIR) {
                    // 讓全部卡片進入視窗完成繪圖，避免動畫卡片在 fullPage 擷取時仍被裁切。
                    const captureHeight = await page.evaluate(() => document.documentElement.scrollHeight);
                    await page.setViewportSize({ width, height: captureHeight });
                    await page.waitForTimeout(500);
                    await page.screenshot({ path: join(process.env.CLASS_PACKAGE_SCREENSHOT_DIR,
                        width === 1280 ? 'class-package-desktop.png' : 'class-package-mobile.png'), fullPage: true });
                }
            }
            assert.deepEqual(errors, [], '隔離 UI 不應出現執行錯誤');
        });
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
    console.log(`完成 ${cases.length} 項驗證。`);
} finally {
    await rm(temporary, { recursive: true, force: true });
}

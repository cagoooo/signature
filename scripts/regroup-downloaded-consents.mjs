// 僅在本機重新整理已下載的班級名單；不連線、不修改來源、日誌不輸出個人資料。
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, dirname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import JSZip from 'jszip';
import XLSX from 'xlsx';

const root = resolve(import.meta.dirname, '..');
const options = Object.fromEntries(process.argv.slice(2).map(argument => {
    const matched = /^--(input|output)=(.+)$/.exec(argument);
    assert.ok(matched, '用法：node scripts/regroup-downloaded-consents.mjs --input=絕對路徑 [--output=新 ZIP 絕對路徑]');
    return [matched[1], matched[2]];
}));
assert.ok(options.input && isAbsolute(options.input), '輸入必須是已下載 Excel 的絕對路徑');
assert.ok(/\.xlsx$/i.test(options.input), '輸入必須是 XLSX 檔案');
const sourcePath = resolve(options.input);
const outputPath = options.output ? resolve(options.output)
    : join(root, 'node_modules/.tmp', `班級同意書資料包_重新歸類_${Date.now()}.zip`);
assert.ok(!options.output || isAbsolute(options.output), '輸出必須是絕對路徑');
assert.ok(/\.zip$/i.test(outputPath), '輸出必須是新的 ZIP 檔案');
assert.ok(sourcePath.toLowerCase() !== outputPath.toLowerCase(), '不得覆寫輸入檔案');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const inputBytes = await readFile(sourcePath);
const originalHash = digest(inputBytes);
const workbook = XLSX.read(inputBytes, { type: 'buffer' });
assert.ok(workbook.Sheets['全部明細'], '輸入檔案缺少「全部明細」工作表');
const originalRows = XLSX.utils.sheet_to_json(workbook.Sheets['全部明細'], { defval: '' });
assert.ok(originalRows.length > 0, '輸入檔案沒有簽署資料');
const value = (row, name) => String(row[name] ?? '');
const originalField = (row, name) => Object.hasOwn(row, `原始${name}`) ? value(row, `原始${name}`) : value(row, name);
const records = originalRows.map(row => {
    const time = value(row, '簽署時間（臺灣）');
    // 原表時間明確標示臺灣，補入其原有時區，不生成任何新的簽署時間。
    const timestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(time)
        ? `${time.replace(' ', 'T')}+08:00` : undefined;
    const status = value(row, '簽署意願');
    return {
        id: value(row, '紀錄 ID'), city: originalField(row, '縣市'), school: originalField(row, '學校'),
        grade: originalField(row, '年級'), cls: originalField(row, '班級'), seat: originalField(row, '座號'),
        studentName: value(row, '學生姓名'), parentName: value(row, '家長姓名'),
        email: value(row, '家長 Email'), signatureUrl: value(row, '簽名圖檔連結'), pdfUrl: value(row, 'PDF 連結'),
        timestamp, isAgreed: status === '同意' ? true : status === '不同意' ? false : undefined,
    };
});
const noteRows = workbook.Sheets['匯出說明']
    ? XLSX.utils.sheet_to_json(workbook.Sheets['匯出說明'], { defval: '' }) : [];
const note = (...names) => String(noteRows.find(row => names.includes(row['項目']))?.['內容'] ?? '');
const filterValue = (...names) => { const text = note(...names); return text === '全部' ? '' : text; };
const filters = {
    searchTerm: filterValue('搜尋條件', '姓名搜尋'), cityFilter: filterValue('縣市篩選'),
    schoolFilter: filterValue('學校篩選'), gradeFilter: filterValue('年級篩選'), classFilter: filterValue('班級篩選'),
};
const temporaryBase = join(root, 'node_modules/.tmp');
await mkdir(temporaryBase, { recursive: true });
const temporary = await mkdtemp(join(temporaryBase, 'regroup-utility-'));
assert.ok(resolve(temporary).startsWith(`${resolve(temporaryBase)}\\`) || resolve(temporary).startsWith(`${resolve(temporaryBase)}/`),
    '暫存路徑必須位於專案的 node_modules/.tmp');
try {
    await build({ entryPoints: [join(root, 'src/utils/classConsentPackage.ts')], bundle: true,
        platform: 'node', format: 'cjs', outfile: join(temporary, 'package.cjs'), logLevel: 'silent' });
    const { buildClassConsentPackage } = (await import(pathToFileURL(join(temporary, 'package.cjs')).href)).default;
    const bytes = await buildClassConsentPackage(records, filters);
    const zip = await JSZip.loadAsync(bytes);
    assert.ok(zip.file('班級總覽.xlsx'), '重新歸類的 ZIP 缺少總覽');
    const corrected = XLSX.read(await zip.file('班級總覽.xlsx').async('nodebuffer'), { type: 'buffer' });
    const correctedRows = XLSX.utils.sheet_to_json(corrected.Sheets['全部明細'], { defval: '' });
    assert.ok(correctedRows.length === originalRows.length, '重新整理後資料筆數不符，尚未寫入輸出檔');
    const ids = rows => JSON.stringify(rows.map(row => value(row, '紀錄 ID')).sort());
    assert.ok(ids(correctedRows) === ids(originalRows), '重新整理後紀錄 ID 數量不符，尚未寫入輸出檔');
    const statuses = rows => rows.reduce((counts, row) => {
        const text = value(row, '簽署意願');
        counts[text === '同意' ? 0 : text === '不同意' ? 1 : 2] += 1;
        return counts;
    }, [0, 0, 0]);
    assert.ok(JSON.stringify(statuses(correctedRows)) === JSON.stringify(statuses(originalRows)),
        '重新整理後同意狀態筆數不符，尚未寫入輸出檔');
    // 比較全部個人欄位與原值，但斷言失敗也不把值印出日誌。
    const fingerprints = rows => JSON.stringify(rows.map(row => JSON.stringify([
        ...['縣市', '學校', '年級', '班級', '座號'].map(name => originalField(row, name)),
        ...['學生姓名', '家長姓名', '家長 Email', '簽署意願', '簽署時間（臺灣）', '簽名圖檔連結', 'PDF 連結', '紀錄 ID'].map(name => value(row, name)),
    ])).sort());
    assert.ok(fingerprints(correctedRows) === fingerprints(originalRows),
        '重新整理後原始欄位或個人資料不符，尚未寫入輸出檔');
    assert.ok(digest(await readFile(sourcePath)) === originalHash, '輸入檔案發生變動，尚未寫入輸出檔');
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, bytes, { flag: 'wx' });
    const overview = XLSX.utils.sheet_to_json(corrected.Sheets['班級總覽'], { defval: '' })
        .filter(row => row['縣市'] !== '合計');
    console.log(`本機重新歸類完成：${originalRows.length} 筆，${overview.length} 個班級分組。`);
    console.log(`同意／不同意／意願未記錄筆數：${statuses(correctedRows).join('／')}`);
    console.log('全部原始欄位、紀錄 ID、個人資料、簽署時間及來源檔案保持一致。');
    console.log(`新 ZIP：${outputPath}`);
    console.log('來源檔案未覆寫，未連線或讀取其他學生資料。');
} finally {
    await rm(temporary, { recursive: true, force: true });
}

import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { normalizeConsentGrouping, normalizeConsentNumber } from './consentGrouping';
export { normalizeConsentGrouping, matchesSchoolSearch, matchesConsentSearch } from './consentGrouping';

export interface ConsentRecord {
    id: string;
    city?: string;
    school?: string;
    grade: string;
    cls: string;
    seat: string;
    studentName: string;
    parentName: string;
    email?: string;
    signatureUrl: string;
    pdfUrl?: string;
    isAgreed?: boolean | null;
    timestamp?: unknown;
}

export interface PackageFilters {
    searchTerm: string;
    cityFilter: string;
    schoolFilter: string;
    gradeFilter: string;
    classFilter: string;
}

type ConsentStatus = '同意' | '不同意' | '意願未記錄';
type CellValue = string | number;
interface ClassGroup {
    city: string;
    school: string;
    grade: string;
    cls: string;
    needsReview: boolean;
    records: ConsentRecord[];
}

const DETAIL_HEADERS = [
    '縣市', '學校', '年級', '班級', '座號', '學生姓名', '家長姓名',
    '家長 Email', '簽署意願', '簽署時間（臺灣）', '簽名圖檔連結', 'PDF 連結', '紀錄 ID',
    '原始縣市', '原始學校', '原始年級', '原始班級', '原始座號', '歸類說明',
];
const COUNT_NOTE = '數量為簽署筆數，並非學生人數；同一學生的多次簽署全部保留，請依紀錄 ID 與簽署時間核對。';
const ROSTER_NOTE = '系統沒有完整班級名冊，無法由此清單判定尚未簽署的學生；意願未記錄表示已有簽署紀錄，但未保存有效的同意或不同意值。';
const TIME_FORMATTER = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function getConsentStatus(value: unknown): ConsentStatus {
    if (value === true) return '同意';
    if (value === false) return '不同意';
    return '意願未記錄';
}

function normalizeNumber(value: string): string {
    return normalizeConsentNumber(value);
}

function compareNumbers(a: string, b: string): number {
    const left = normalizeNumber(a);
    const right = normalizeNumber(b);
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) return left.length - right.length || left.localeCompare(right);
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return left.localeCompare(right, 'zh-TW');
}

function formatTaiwanDate(date: Date): string {
    const parts = Object.fromEntries(TIME_FORMATTER.formatToParts(date).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function parseDate(value: unknown): Date | undefined {
    try {
        let date: Date | undefined;
        if (value instanceof Date) date = value;
        else if (typeof value === 'number' && Number.isFinite(value)) date = new Date(value);
        // 明確帶時區的日期才能避免依匯出者電腦時區猜測時間。
        else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
            date = new Date(value);
        } else if (value && typeof value === 'object') {
            if ('toDate' in value && typeof value.toDate === 'function') {
                const converted: unknown = value.toDate();
                if (converted instanceof Date) date = converted;
            } else if ('seconds' in value && typeof value.seconds === 'number' && Number.isFinite(value.seconds)) {
                const nanos = 'nanoseconds' in value ? value.nanoseconds : 0;
                if (typeof nanos === 'number' && Number.isFinite(nanos) && nanos >= 0 && nanos < 1e9) {
                    date = new Date(value.seconds * 1000 + nanos / 1e6);
                }
            }
        }
        return date && Number.isFinite(date.getTime()) ? date : undefined;
    } catch {
        return undefined;
    }
}

function detailRow(record: ConsentRecord): CellValue[] {
    const date = parseDate(record.timestamp);
    const grouping = normalizeConsentGrouping(record);
    return [
        grouping.city || '未填縣市', grouping.school || '未填學校',
        grouping.grade, grouping.cls, grouping.seat,
        record.studentName, record.parentName, record.email || '', getConsentStatus(record.isAgreed),
        date ? formatTaiwanDate(date) : '未記錄', record.signatureUrl || '', record.pdfUrl || '', record.id,
        record.city || '', record.school || '', record.grade, record.cls, record.seat,
        `${grouping.needsReview ? '待確認歸類；' : ''}${grouping.notes.join('；') || '依原填資料歸類'}`,
    ];
}

function makeSheet(headers: string[], rows: CellValue[][], widths?: number[]): XLSX.WorkSheet {
    // aoa_to_sheet 將文字建立為字串儲存格，不把 =、+、-、@ 開頭的使用者輸入轉成公式。
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    sheet['!cols'] = headers.map((_, index) => ({ wch: widths?.[index] ?? 20 }));
    sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headers.length - 1 } }) };
    return sheet;
}

function addDetails(workbook: XLSX.WorkBook, records: ConsentRecord[], name: string): void {
    XLSX.utils.book_append_sheet(workbook, makeSheet(
        DETAIL_HEADERS, records.map(detailRow), [14, 26, 8, 8, 8, 16, 16, 30, 16, 24, 55, 55, 30, 14, 30, 14, 18, 12, 70],
    ), name);
}

function addNotes(workbook: XLSX.WorkBook, filters: PackageFilters, createdAt: string, scope: string): void {
    XLSX.utils.book_append_sheet(workbook, makeSheet(['項目', '內容'], [
        ['產生時間（臺灣，Asia/Taipei）', createdAt],
        ['資料範圍', scope],
        ['搜尋條件', filters.searchTerm.trim() || '全部'],
        ['縣市篩選', filters.cityFilter || '全部'],
        ['學校篩選', filters.schoolFilter || '全部'],
        ['年級篩選', filters.gradeFilter || '全部'],
        ['班級篩選', filters.classFilter || '全部'],
        ['計數與重複簽署', COUNT_NOTE],
        ['名冊與未記錄意願', ROSTER_NOTE],
        ['意願判定', '依家長填寫的意願分為同意、不同意；缺漏或無法辨識的舊資料列為意願未記錄。'],
        ['日期與檔案', '簽署時間一律換算臺灣時間；無效或缺漏時間顯示未記錄。簽名與 PDF 提供原始連結，不下載實體檔案。'],
        ['班級整理', '全形、中文數字與前置零統一整理；完整年班寫法須與年級一致才合併。多位數班號不猜測拆解；明確班名的班字後綴統一，例如甲班與甲歸為甲。班內依座號數字排序。'],
        ['學校整理', '桃園市石門國小的已知簡稱與全名統一歸類；不同縣市同名學校不合併。其他學校僅整理字形、空白及國民小學簡稱，保留標點。'],
        ['待確認歸類', '縣市、學校或年班有缺漏或矛盾時，另外列入待確認歸類，並按原填資料隔開，請人工核對後再使用。'],
        ['原始資料', '所有明細保留原始縣市、學校、年級、班級、座號及歸類說明；僅整理下載檔案，不修改系統內的原始簽署資料。'],
    ], [28, 100]), '匯出說明');
}

function sanitizeComponent(value: string): string {
    let safe = [...value.normalize('NFKC')].map(character =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? '_' : character).join('')
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\.{2,}/g, '_')
        .replace(/[. ]+$/g, '').trim().slice(0, 100).replace(/[. ]+$/g, '');
    if (!safe || safe === '.') safe = '未命名';
    if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) safe = `_${safe}`;
    return safe;
}

function allocateComponent(value: string, used: Set<string>): string {
    const base = sanitizeComponent(value);
    let name = base;
    let number = 2;
    while (used.has(name.toLocaleLowerCase('en-US'))) {
        const suffix = `_${number++}`;
        name = `${base.slice(0, 100 - suffix.length)}${suffix}`;
    }
    used.add(name.toLocaleLowerCase('en-US'));
    return name;
}

function workbookBytes(workbook: XLSX.WorkBook): Uint8Array {
    return new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }));
}

export async function buildClassConsentPackage(records: ConsentRecord[], filters: PackageFilters): Promise<Uint8Array> {
    if (!records.length) throw new Error('目前篩選範圍沒有簽署資料，無法打包。');
    const createdAt = formatTaiwanDate(new Date());
    const groups = new Map<string, ClassGroup>();
    for (const record of records) {
        const { city, school, grade, cls, needsReview } = normalizeConsentGrouping(record);
        // tuple 編碼防止縣市、學校或班級文字中的分隔字元造成跨校合併。
        const key = JSON.stringify([city, school, grade, cls, needsReview,
            needsReview ? [record.city || '', record.school || '', record.grade, record.cls] : null]);
        const group = groups.get(key) ?? { city, school, grade, cls, needsReview, records: [] };
        group.records.push(record);
        groups.set(key, group);
    }
    const sortedGroups = [...groups.values()].sort((a, b) =>
        a.city.localeCompare(b.city, 'zh-TW') || a.school.localeCompare(b.school, 'zh-TW') ||
        compareNumbers(a.grade, b.grade) || compareNumbers(a.cls, b.cls));
    const zip = new JSZip();
    const summaryRows: CellValue[][] = [];
    const allRecords: ConsentRecord[] = [];
    const cityPaths = new Map<string, string>();
    const schoolPaths = new Map<string, string>();
    const usedCities = new Set<string>();
    const usedSchools = new Map<string, Set<string>>();
    const usedClasses = new Map<string, Set<string>>();
    let totalAgree = 0;
    let totalDisagree = 0;
    let totalUnknown = 0;
    for (const group of sortedGroups) {
        group.records.sort((a, b) => compareNumbers(normalizeConsentGrouping(a).seat, normalizeConsentGrouping(b).seat) ||
            a.studentName.localeCompare(b.studentName, 'zh-TW') || a.id.localeCompare(b.id));
        allRecords.push(...group.records);
        const agreed = group.records.filter(record => getConsentStatus(record.isAgreed) === '同意');
        const disagreed = group.records.filter(record => getConsentStatus(record.isAgreed) === '不同意');
        const unknown = group.records.filter(record => getConsentStatus(record.isAgreed) === '意願未記錄');
        totalAgree += agreed.length;
        totalDisagree += disagreed.length;
        totalUnknown += unknown.length;
        if (!cityPaths.has(group.city)) {
            cityPaths.set(group.city, allocateComponent(group.city || '未填縣市', usedCities));
            usedSchools.set(group.city, new Set());
        }
        const cityPath = cityPaths.get(group.city)!;
        const schoolKey = JSON.stringify([group.city, group.school]);
        if (!schoolPaths.has(schoolKey)) {
            const schoolName = allocateComponent(group.school || '未填學校', usedSchools.get(group.city)!);
            schoolPaths.set(schoolKey, `${cityPath}/${schoolName}`);
            usedClasses.set(schoolKey, new Set());
        }
        const classLabel = group.needsReview ? `待確認_${group.grade || '未填'}_${group.cls || '未填'}` :
            `${group.grade || '未填'}年${group.cls || '未填'}${group.cls.endsWith('班') ? '' : '班'}`;
        const classFolder = allocateComponent(classLabel, usedClasses.get(schoolKey)!);
        const path = `${schoolPaths.get(schoolKey)!}/${classFolder}/班級簽署明細.xlsx`;
        const workbook = XLSX.utils.book_new();
        addDetails(workbook, group.records, '全部明細');
        addDetails(workbook, agreed, '同意');
        addDetails(workbook, disagreed, '不同意');
        addDetails(workbook, unknown, '意願未記錄');
        addDetails(workbook, group.needsReview ? group.records : [], '待確認歸類');
        addNotes(workbook, filters, createdAt,
            `目前篩選結果中的 ${group.city || '未填縣市'}／${group.school || '未填學校'}／${classLabel}，共 ${group.records.length} 筆簽署`);
        zip.file(path, workbookBytes(workbook));
        summaryRows.push([group.city || '未填縣市', group.school || '未填學校', group.grade, group.cls,
            group.records.length, agreed.length, disagreed.length, unknown.length, path,
            group.needsReview ? '待確認歸類' : '已歸類']);
    }
    summaryRows.push(['合計', '', '', '', records.length, totalAgree, totalDisagree, totalUnknown, '', '']);
    const overview = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(overview, makeSheet([
        '縣市', '學校', '年級', '班級', '全部簽署筆數', '同意簽署筆數', '不同意簽署筆數', '意願未記錄簽署筆數', '班級明細檔案', '歸類狀態',
    ], summaryRows, [14, 26, 8, 8, 18, 18, 20, 24, 65, 18]), '班級總覽');
    addDetails(overview, allRecords, '全部明細');
    addDetails(overview, allRecords.filter(record => normalizeConsentGrouping(record).needsReview), '待確認歸類');
    addNotes(overview, filters, createdAt, `目前篩選結果全部 ${records.length} 筆簽署，不受勾選狀態限制`);
    zip.file('班級總覽.xlsx', workbookBytes(overview));
    zip.file('使用說明.txt', [
        `班級同意書資料包\n產生時間（臺灣）：${createdAt}`,
        '先開啟班級總覽.xlsx 查看各班筆數與全部明細，再依縣市／學校／班級資料夾開啟班級簽署明細.xlsx。',
        '每班包含全部明細、同意、不同意、意願未記錄、待確認歸類與匯出說明；即使某一類沒有紀錄，仍保留欄位表頭。',
        '已知學校別名與可核對的年班寫法自動整理；有矛盾或資訊不足的資料分開放在待確認歸類，請核對原始欄位與歸類說明。',
        COUNT_NOTE, ROSTER_NOTE,
        '資料包只包含目前篩選後的簽署紀錄；勾選單筆或多筆不會縮小打包範圍。',
        '簽名圖檔與 PDF 保留原始連結，未下載實體檔案。請妥善保管家長與學生個人資料。',
    ].join('\n\n'));
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

export async function downloadClassConsentPackage(records: ConsentRecord[], filters: PackageFilters): Promise<void> {
    const bytes = await buildClassConsentPackage(records, filters);
    const timestamp = formatTaiwanDate(new Date()).replace(/[-: ]/g, '');
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    saveAs(new Blob([buffer], { type: 'application/zip' }), `班級同意書資料包_${timestamp}.zip`);
}

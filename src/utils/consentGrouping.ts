export interface ConsentGroupingFields {
    city?: string;
    school?: string;
    grade: string;
    cls: string;
    seat: string;
}

export interface ConsentGrouping {
    city: string;
    school: string;
    grade: string;
    cls: string;
    seat: string;
    needsReview: boolean;
    notes: string[];
}

const CITY_ALIASES: Record<string, string> = {
    桃園: '桃園市', 桃園市: '桃園市', 桃園縣: '桃園市',
    臺北市: '臺北市', 新北市: '新北市', 臺北縣: '新北市',
    臺中市: '臺中市', 臺中縣: '臺中市',
    臺南市: '臺南市', 臺南縣: '臺南市',
    高雄市: '高雄市', 高雄縣: '高雄市',
    基隆市: '基隆市', 新竹市: '新竹市', 新竹縣: '新竹縣',
    嘉義市: '嘉義市', 嘉義縣: '嘉義縣', 苗栗縣: '苗栗縣',
    彰化縣: '彰化縣', 南投縣: '南投縣', 雲林縣: '雲林縣',
    屏東縣: '屏東縣', 宜蘭縣: '宜蘭縣', 花蓮縣: '花蓮縣',
    臺東縣: '臺東縣', 澎湖縣: '澎湖縣', 金門縣: '金門縣', 連江縣: '連江縣',
};
const NUMBER_PATTERN = '[0-9〇零一二三四五六七八九十百千兩]+';
const FULL_CLASS_PATTERN = new RegExp(`^(?:第)?(${NUMBER_PATTERN})(?:年級|年)(?:第)?(${NUMBER_PATTERN})班$`);
const GRADE_PATTERN = new RegExp(`^(?:第)?(${NUMBER_PATTERN})(?:年級|年)?$`);
const CLASS_PATTERN = new RegExp(`^(?:第)?(${NUMBER_PATTERN})(?:班)?$`);
const SEAT_PATTERN = new RegExp(`^(?:第)?(${NUMBER_PATTERN})(?:座號|號)?$`);
const CHINESE_DIGITS: Record<string, number> = {
    零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
const CHINESE_UNITS: Record<string, number> = { 十: 10 };

function compactText(value: string): string {
    return value.normalize('NFKC').replace(/[\p{Z}\s]/gu, '');
}

function compactKnownAlias(value: string): string {
    return compactText(value).replace(/\p{P}/gu, '');
}

function hasAmbiguousNumber(value: string): boolean {
    const numericLooking = /^[0-9〇零一二三四五六七八九十百千兩\p{P}]+(?:班|年級|年|座號|號)?$/u.test(value);
    return numericLooking && /[百千\p{P}]/u.test(value);
}

function schoolText(value: string): string {
    return compactText(value).replace(/國民小學/g, '國小').replace(/台/g, '臺');
}

/** 僅處理已知行政區寫法；新竹、嘉義的市與縣保持分開。 */
export function normalizeCity(value: string): string {
    const compact = compactText(value).replace(/台/g, '臺');
    return Object.hasOwn(CITY_ALIASES, compact) ? CITY_ALIASES[compact] : compact;
}

export function normalizeConsentNumber(value: string): string {
    const compact = compactText(value);
    if (/^\d+$/.test(compact)) return compact.replace(/^0+(?=\d)/, '');
    if (/^[〇零一二三四五六七八九兩]+$/.test(compact)) {
        return [...compact].map(character => CHINESE_DIGITS[character]).join('').replace(/^0+(?=\d)/, '');
    }
    // 百千寫法可能省略低位單位（如一百二），不自行猜成 102 或 120。
    if (!/^[〇零一二三四五六七八九十兩]+$/.test(compact)) return compact;
    let total = 0;
    let digit: number | undefined;
    let previousUnit = Infinity;
    for (const character of compact) {
        const unit = CHINESE_UNITS[character];
        if (unit) {
            if (unit >= previousUnit || digit === 0 || (digit === undefined && total > 0)) return compact;
            total += (digit ?? 1) * unit;
            previousUnit = unit;
            digit = undefined;
        } else {
            const next = CHINESE_DIGITS[character];
            if (digit !== undefined && digit !== 0 && next !== 0) return compact;
            digit = next;
        }
    }
    return String(total + (digit ?? 0));
}

function parseNumber(value: string, pattern: RegExp): string | undefined {
    const match = compactText(value).match(pattern);
    if (!match) return undefined;
    const number = normalizeConsentNumber(match[1]);
    return /^\d+$/.test(number) ? number : undefined;
}

/** 非數字班名保留；完整年班只有在年級相符或缺漏時才拆解。 */
export function normalizeClass(gradeValue: string, classValue: string): Pick<ConsentGrouping, 'grade' | 'cls' | 'needsReview' | 'notes'> {
    const originalGrade = compactText(gradeValue);
    const originalClass = compactText(classValue);
    let grade = parseNumber(gradeValue, GRADE_PATTERN) ?? originalGrade;
    let cls = originalClass;
    let needsReview = false;
    const notes: string[] = [];
    const fullClass = originalClass.match(FULL_CLASS_PATTERN);
    if (fullClass) {
        const embeddedGrade = normalizeConsentNumber(fullClass[1]);
        const embeddedClass = normalizeConsentNumber(fullClass[2]);
        if (!/^\d+$/.test(embeddedGrade) || !/^\d+$/.test(embeddedClass)) {
            needsReview = true;
            notes.push('年班寫法無法可靠辨識，保留原填年級與班級，請人工確認。');
        } else if (grade && grade !== embeddedGrade) {
            grade = originalGrade;
            needsReview = true;
            notes.push('年級與班級內的年級不一致，保留原填資訊，請人工確認。');
        } else {
            grade = embeddedGrade;
            cls = embeddedClass;
            notes.push(originalGrade ? '完整年班寫法已核對年級並整理。' : '年級缺漏，依明確的完整年班寫法整理。');
        }
    } else {
        const numberedClass = parseNumber(classValue, CLASS_PATTERN);
        cls = numberedClass ?? originalClass;
        if (numberedClass === undefined && /^[\p{L}]+班$/u.test(originalClass) &&
            !originalClass.endsWith('班班') && !hasAmbiguousNumber(originalClass)) {
            cls = originalClass.slice(0, -1);
        }
        if (/[年級]/u.test(originalClass) || hasAmbiguousNumber(originalClass) ||
            (CLASS_PATTERN.test(originalClass) && !/^\d+$/.test(cls)) ||
            (numberedClass === undefined && (/\d/u.test(originalClass) || originalClass.endsWith('班班')))) {
            needsReview = true;
            notes.push('班級寫法包含無法可靠解析的數字或年級文字，保留原填資訊，請人工確認。');
        }
    }
    if (!grade || !/^\d+$/.test(grade) || grade === '0') {
        needsReview = true;
        notes.push('年級缺漏或無法辨識，請人工確認。');
    }
    if (!cls || cls === '0') {
        needsReview = true;
        notes.push('班級缺漏或為零，請人工確認。');
    }
    if (!needsReview && (grade !== gradeValue || cls !== classValue) && !notes.length) {
        notes.push('年級與班級的全形、中文數字、前置零或明確班名後綴已整理。');
    }
    if (/^\d{3,}$/.test(cls)) notes.push('多位數班號照原班號保留，未猜測拆成年級與班級。');
    return { grade, cls, needsReview, notes };
}

/** 已知石門別名只在桃園市脈絡合併；其他學校不使用模糊比對。 */
export function normalizeSchool(cityValue: string, schoolValue: string): Pick<ConsentGrouping, 'city' | 'school' | 'needsReview' | 'notes'> {
    let city = normalizeCity(cityValue);
    const school = schoolText(schoolValue);
    const notes: string[] = [];
    let needsReview = false;
    const explicitCity = Object.keys(CITY_ALIASES)
        .filter(name => /[市縣]$/u.test(name)).sort((a, b) => b.length - a.length)
        .find(name => school.startsWith(name));
    const schoolCity = explicitCity ? CITY_ALIASES[explicitCity] : '';
    if (!city && schoolCity) {
        city = schoolCity;
        notes.push('縣市缺漏，依學校全名明示的縣市整理。');
    } else if (city && schoolCity && city !== schoolCity) {
        needsReview = true;
        notes.push('所填縣市與學校全名的縣市不一致，保留原填資訊，請人工確認。');
    }
    if (!city) {
        needsReview = true;
        notes.push('縣市缺漏且學校名稱未明示完整縣市，不猜測跨校合併。');
    } else if (!Object.values(CITY_ALIASES).includes(city)) {
        needsReview = true;
        notes.push('縣市名稱無法可靠確認，保留原填資訊。');
    }
    if (!school) {
        needsReview = true;
        notes.push('學校名稱缺漏，請人工確認。');
    }
    let canonicalSchool = school;
    if (!needsReview && city === '桃園市' && [
        '石門國小', '龍潭區石門國小', '桃園市石門國小', '桃園市龍潭區石門國小',
        '桃園縣石門國小', '桃園縣龍潭鄉石門國小', '龍潭鄉石門國小',
    ].includes(compactKnownAlias(school))) {
        canonicalSchool = '石門國小';
        if (canonicalSchool !== schoolValue) notes.push('桃園市石門國小的已知學校別名已統一。');
    } else if (canonicalSchool !== schoolValue) {
        notes.push('學校名稱僅整理字形、空白與國民小學簡稱，未猜測其他學校別名。');
    }
    if (city !== cityValue && cityValue) notes.push('縣市字形或已知行政區寫法已整理。');
    return { city, school: canonicalSchool, needsReview, notes };
}

export function normalizeConsentGrouping(record: ConsentGroupingFields): ConsentGrouping {
    const school = normalizeSchool(record.city || '', record.school || '');
    const classInfo = normalizeClass(record.grade, record.cls);
    const seat = parseNumber(record.seat, SEAT_PATTERN) ?? compactText(record.seat);
    const notes = [...school.notes, ...classInfo.notes];
    const seatNeedsReview = hasAmbiguousNumber(compactText(record.seat));
    if (seatNeedsReview) notes.push('座號的數字寫法無法可靠辨識，保留原填資訊，請人工確認。');
    if (seat !== record.seat) notes.push('座號的全形、中文數字或前置零已整理。');
    return { city: school.city, school: school.school, grade: classInfo.grade, cls: classInfo.cls, seat,
        needsReview: school.needsReview || classInfo.needsReview || seatNeedsReview, notes };
}

export function matchesSchoolSearch(record: Pick<ConsentGroupingFields, 'city' | 'school'>, query: string): boolean {
    if (!query.trim()) return true;
    const rawQuery = schoolText(query);
    const normalized = normalizeSchool(record.city || '', record.school || '');
    const normalizedQuery = normalizeSchool(normalized.city, query);
    return schoolText(record.school || '').includes(rawQuery) || normalized.school.includes(rawQuery) ||
        (!normalizedQuery.needsReview && !normalized.needsReview && normalized.school.includes(normalizedQuery.school));
}

export function matchesConsentSearch(
    record: ConsentGroupingFields & { studentName?: string; parentName?: string }, query: string,
): boolean {
    if (!query.trim()) return true;
    const normalizedQuery = compactText(query);
    const normalized = normalizeConsentGrouping(record);
    return matchesSchoolSearch(record, query) || [record.studentName || '', record.parentName || '',
        record.seat, normalized.seat, record.city || '', normalized.city, record.grade, normalized.grade,
        record.cls, normalized.cls, `${normalized.grade}年${normalized.cls}班`,
    ].some(value => compactText(value).includes(normalizedQuery));
}

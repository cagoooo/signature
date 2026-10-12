import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db, auth } from '../firebase';
import { collection, getDocs, query, orderBy, Timestamp, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useNavigate, Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { downloadBatchPDFs } from '../utils/batchDownloader';
import { downloadClassConsentPackage, getConsentStatus, normalizeConsentGrouping, matchesSchoolSearch, matchesConsentSearch } from '../utils/classConsentPackage';
import { Download, LogOut, Search, Filter, Loader2, FileText, Trash2, CheckSquare, Square, Home, User, Users, Calendar, PenTool, MapPin, School, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SignatureData {
    id: string;
    city?: string;
    school?: string;
    studentName: string;
    parentName: string;
    grade: string;
    cls: string;
    seat: string;
    signatureUrl: string;
    timestamp: Timestamp;
    email?: string;
    pdfUrl?: string;
    isAgreed?: boolean | null;
}

type SortKey = 'citySchool' | 'grade' | 'cls' | 'seat' | 'studentName' | 'parentName' | 'isAgreed' | 'timestamp';
type SortDirection = 'asc' | 'desc';

interface SortState {
    key: SortKey;
    direction: SortDirection;
}

const TAIWAN_CITIES = [
    "臺北市", "新北市", "基隆市", "桃園市", "新竹市", "新竹縣", "苗栗縣",
    "臺中市", "彰化縣", "南投縣", "雲林縣", "嘉義市", "嘉義縣", "臺南市",
    "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣"
];

const GroupingNote: React.FC<{ record: SignatureData; grouping: ReturnType<typeof normalizeConsentGrouping> }> = ({ record, grouping }) => {
    const hasChanges = (['city', 'school', 'grade', 'cls', 'seat'] as const)
        .some(key => grouping[key] !== String(record[key] ?? ''));
    if (!hasChanges && !grouping.needsReview) return null;
    return (
        <div className="mt-1 text-xs leading-relaxed break-words">
            {grouping.needsReview && (
                <span title={grouping.notes.join('；')} className="inline-block bg-amber-50 text-amber-800 border border-amber-200 rounded-md px-2 py-0.5 font-bold">
                    歸類待確認
                </span>
            )}
            {hasChanges && (
                <p className="text-gray-500 mt-1">
                    已整理：原填 {record.city || '未填縣市'}／{record.school || '未填學校'}／{record.grade || '未填'} 年 {record.cls || '未填'} 班／座號 {record.seat || '未填'}
                </p>
            )}
            {grouping.needsReview && <p className="text-amber-800 mt-1">{grouping.notes.join('；')}</p>}
        </div>
    );
};

const AdminDashboard: React.FC = () => {
    const [signatures, setSignatures] = useState<SignatureData[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [cityFilter, setCityFilter] = useState('');
    const [schoolFilter, setSchoolFilter] = useState('');
    const [gradeFilter, setGradeFilter] = useState('');
    const [classFilter, setClassFilter] = useState('');
    const [sortState, setSortState] = useState<SortState>({ key: 'timestamp', direction: 'desc' });
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isPackaging, setIsPackaging] = useState(false);
    const [packageMessage, setPackageMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const packagingLock = useRef(false);
    const navigate = useNavigate();
    const normalizedSignatures = useMemo(() => signatures.map(record => ({
        record, grouping: normalizeConsentGrouping(record),
    })), [signatures]);

    useEffect(() => {
        fetchSignatures();
    }, []);

    const fetchSignatures = async () => {
        try {
            const q = query(collection(db, "signatures"), orderBy("timestamp", "desc"));
            const querySnapshot = await getDocs(q);
            const data: SignatureData[] = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as SignatureData));
            setSignatures(data);
        } catch (error) {
            console.error("Error fetching signatures: ", error);
            alert("讀取資料失敗，請檢查權限或網路。");
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await signOut(auth);
        navigate('/admin/login');
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("確定要刪除這筆資料嗎？此動作無法復原。")) return;

        try {
            await deleteDoc(doc(db, "signatures", id));
            setSignatures(prev => prev.filter(s => s.id !== id));
            setSelectedIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(id);
                return newSet;
            });
        } catch (error) {
            console.error("Error deleting document: ", error);
            alert("刪除失敗，請稍後再試。");
        }
    };

    const handleBatchDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!window.confirm(`確定要刪除選取的 ${selectedIds.size} 筆資料嗎？此動作無法復原。`)) return;

        try {
            const batch = writeBatch(db);
            selectedIds.forEach(id => {
                batch.delete(doc(db, "signatures", id));
            });
            await batch.commit();

            setSignatures(prev => prev.filter(s => !selectedIds.has(s.id)));
            setSelectedIds(new Set());
        } catch (error) {
            console.error("Error batch deleting: ", error);
            alert("批次刪除失敗，請稍後再試。");
        }
    };

    const toggleSelection = (id: string) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const toggleAll = () => {
        if (selectedIds.size === filteredSignatures.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredSignatures.map(s => s.id)));
        }
    };

    const handleSort = (key: SortKey) => {
        setSortState(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const exportToExcel = () => {
        const dataToExport = filteredRows.map(({ record: item, grouping }) => ({
            "縣市": grouping.city,
            "學校": grouping.school,
            "年級": grouping.grade,
            "班級": grouping.cls,
            "座號": grouping.seat,
            "學生姓名": item.studentName,
            "家長姓名": item.parentName,
            "簽署意願": getConsentStatus(item.isAgreed),
            "家長Email": item.email || '',
            "簽署時間": item.timestamp?.toDate().toLocaleString(),
            "簽名檔連結": item.signatureUrl,
            "同意書PDF連結": item.pdfUrl || '',
            "原填縣市": item.city || '',
            "原填學校": item.school || '',
            "原填年級": item.grade,
            "原填班級": item.cls,
            "原填座號": item.seat,
            "歸類狀態": grouping.needsReview ? '待確認' : '已整理',
            "整理說明": grouping.notes.join('；')
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "簽署名單");
        XLSX.writeFile(wb, `學生活動同意書簽署名單_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const filteredRows = normalizedSignatures.filter(({ record: item, grouping }) => {
        const matchesSearch = matchesConsentSearch(item, searchTerm);
        const matchesCity = cityFilter ? grouping.city === cityFilter : true;
        const matchesSchool = schoolFilter ? matchesSchoolSearch(item, schoolFilter) : true;
        const matchesGrade = gradeFilter ? grouping.grade === gradeFilter : true;
        const matchesClass = classFilter ? grouping.cls === classFilter : true;
        return matchesSearch && matchesCity && matchesSchool && matchesGrade && matchesClass;
    }).sort((left, right) => {
        const a = left.record;
        const b = right.record;
        const direction = sortState.direction === 'asc' ? 1 : -1;
        let comparison = 0;

        switch (sortState.key) {
            case 'citySchool':
                comparison = `${left.grouping.city} ${left.grouping.school}`.localeCompare(
                    `${right.grouping.city} ${right.grouping.school}`,
                    'zh-Hant-TW',
                    { numeric: true, sensitivity: 'base' },
                );
                break;
            case 'grade':
            case 'cls':
            case 'seat':
                comparison = left.grouping[sortState.key].localeCompare(
                    right.grouping[sortState.key], 'zh-Hant-TW', { numeric: true, sensitivity: 'base' },
                );
                break;
            case 'isAgreed':
                comparison = (a.isAgreed === true ? 1 : a.isAgreed === false ? 0 : -1) - (b.isAgreed === true ? 1 : b.isAgreed === false ? 0 : -1);
                break;
            case 'timestamp':
                comparison = (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0);
                break;
            case 'studentName':
            case 'parentName':
                comparison = a[sortState.key].localeCompare(
                    b[sortState.key],
                    'zh-Hant-TW',
                    { numeric: true, sensitivity: 'base' },
                );
                break;
        }

        return comparison * direction;
    });
    // 保留原填紀錄，ZIP 匯出由共用工具處理歸類。
    const filteredSignatures = filteredRows.map(({ record }) => record);
    const needsReviewCount = filteredRows.filter(({ grouping }) => grouping.needsReview).length;

    const consentCounts = filteredSignatures.reduce((counts, item) => {
        if (item.isAgreed === true) counts.agreed += 1;
        else if (item.isAgreed === false) counts.disagreed += 1;
        else counts.unknown += 1;
        return counts;
    }, { agreed: 0, disagreed: 0, unknown: 0 });

    const handlePackageDownload = async () => {
        if (loading || filteredSignatures.length === 0 || packagingLock.current) return;
        packagingLock.current = true;
        setIsPackaging(true);
        setPackageMessage(null);
        try {
            await downloadClassConsentPackage(filteredSignatures, {
                searchTerm, cityFilter, schoolFilter, gradeFilter, classFilter,
            });
            setPackageMessage({
                type: 'success',
                text: 'ZIP 下載已開始，內含各班資料夾與同意、不同意、意願未記錄的詳細名單。',
            });
        } catch (error) {
            console.error('班級名單打包失敗：', error);
            setPackageMessage({ type: 'error', text: '班級名單打包失敗，請稍後重試。' });
        } finally {
            packagingLock.current = false;
            setIsPackaging(false);
        }
    };

    const cities = Array.from(new Set([
        ...TAIWAN_CITIES, ...normalizedSignatures.map(({ grouping }) => grouping.city).filter(Boolean),
    ]));
    const grades = Array.from(new Set(normalizedSignatures.map(({ grouping }) => grouping.grade).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'zh-Hant-TW', { numeric: true, sensitivity: 'base' }));
    const classes = Array.from(new Set(normalizedSignatures.map(({ grouping }) => grouping.cls).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'zh-Hant-TW', { numeric: true, sensitivity: 'base' }));

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans relative overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-50 pointer-events-none"></div>
            <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-100/50 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-pink-100/50 rounded-full blur-3xl pointer-events-none"></div>

            <div className="max-w-7xl mx-auto relative z-10">
                {/* Header */}
                <header className="mb-8 relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-vibrant-blue via-vibrant-purple to-vibrant-pink rounded-[2rem] blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                    <div className="relative flex flex-col md:flex-row justify-between items-center gap-4 bg-white/90 backdrop-blur-xl p-6 rounded-[1.8rem] shadow-xl border border-white/50">
                        <div className="z-10">
                            <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                                <div className="bg-gradient-to-br from-vibrant-blue to-vibrant-purple p-3 rounded-2xl text-white shadow-lg shadow-vibrant-blue/30">
                                    <FileText size={28} />
                                </div>
                                <span className="bg-clip-text text-transparent bg-gradient-to-r from-gray-800 to-gray-600">
                                    簽署管理後台
                                </span>
                            </h1>
                            <p className="text-gray-500 mt-2 ml-1 flex items-center gap-2">
                                <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-lg text-sm font-bold border border-blue-100 shadow-sm">
                                    Total: {signatures.length}
                                </span>
                                <span className="text-sm font-medium">份同意書</span>
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-3 w-full md:w-auto z-10 justify-center md:justify-end">
                            <AnimatePresence>
                                {selectedIds.size > 0 && (
                                    <motion.button
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        onClick={handleBatchDelete}
                                        className="bg-red-50 text-red-600 hover:bg-red-100 px-5 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 border border-red-200 shadow-sm hover:shadow-md"
                                    >
                                        <Trash2 size={18} />
                                        刪除 ({selectedIds.size})
                                    </motion.button>
                                )}
                            </AnimatePresence>

                            <button
                                onClick={() => downloadBatchPDFs(filteredSignatures.filter(s => selectedIds.has(s.id)))}
                                disabled={selectedIds.size === 0}
                                className={`px-5 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 border border-gray-200 shadow-sm ${selectedIds.size > 0 ? 'bg-white hover:bg-gray-50 text-vibrant-purple hover:text-vibrant-pink hover:border-vibrant-purple/30 cursor-pointer' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                            >
                                <FileText size={18} />
                                下載 PDF ({selectedIds.size})
                            </button>

                            <Link to="/" className="bg-white hover:bg-gray-50 text-gray-600 px-5 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 border border-gray-200 shadow-sm hover:shadow-md hover:text-vibrant-blue hover:border-vibrant-blue/30">
                                <Home size={18} />
                                回首頁
                            </Link>

                            <button
                                onClick={exportToExcel}
                                className="bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/40 transition-all flex items-center gap-2 transform hover:-translate-y-0.5"
                            >
                                <Download size={18} />
                                匯出 Excel
                            </button>

                            <button
                                type="button"
                                onClick={handlePackageDownload}
                                disabled={loading || filteredSignatures.length === 0 || isPackaging}
                                aria-busy={isPackaging}
                                className="bg-vibrant-blue hover:bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg transition-all flex items-center gap-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed"
                            >
                                {isPackaging ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                                {isPackaging ? '正在整理各班名單...' : '一鍵打包各班名單'}
                            </button>

                            <button
                                onClick={handleLogout}
                                className="bg-gradient-to-r from-rose-400 to-red-500 hover:from-rose-500 hover:to-red-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-rose-500/30 hover:shadow-rose-500/40 transition-all flex items-center gap-2 transform hover:-translate-y-0.5"
                            >
                                <LogOut size={18} />
                                登出
                            </button>
                        </div>
                    </div>
                </header>

                {/* Filters */}
                <div className="bg-white/80 backdrop-blur-xl p-6 rounded-[2rem] shadow-lg border-2 border-vibrant-purple/10 mb-8 grid grid-cols-1 md:grid-cols-5 gap-4 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-vibrant-blue/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>

                    <div className="relative md:col-span-1 group/input">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within/input:text-vibrant-blue transition-colors" size={20} />
                        <input
                            type="text"
                            placeholder="搜尋..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-3.5 rounded-2xl border-2 border-gray-100 focus:border-vibrant-blue focus:ring-4 focus:ring-vibrant-blue/10 bg-white/50 focus:bg-white outline-none transition-all font-medium text-gray-700 placeholder-gray-400"
                        />
                    </div>

                    {/* City Filter */}
                    <div className="relative group/input">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within/input:text-vibrant-teal transition-colors" size={20} />
                        <select
                            value={cityFilter}
                            onChange={(e) => setCityFilter(e.target.value)}
                            className="w-full pl-12 pr-4 py-3.5 rounded-2xl border-2 border-gray-100 focus:border-vibrant-teal focus:ring-4 focus:ring-vibrant-teal/10 bg-white/50 focus:bg-white outline-none transition-all appearance-none cursor-pointer font-medium text-gray-700"
                        >
                            <option value="">所有縣市</option>
                            {cities.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>

                    {/* School Filter */}
                    <div className="relative group/input">
                        <School className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within/input:text-vibrant-blue transition-colors" size={20} />
                        <input
                            type="text"
                            placeholder="學校名稱..."
                            value={schoolFilter}
                            onChange={(e) => setSchoolFilter(e.target.value)}
                            className="w-full pl-12 pr-4 py-3.5 rounded-2xl border-2 border-gray-100 focus:border-vibrant-blue focus:ring-4 focus:ring-vibrant-blue/10 bg-white/50 focus:bg-white outline-none transition-all font-medium text-gray-700 placeholder-gray-400"
                        />
                    </div>

                    <div className="relative group/input">
                        <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within/input:text-vibrant-purple transition-colors" size={20} />
                        <select
                            value={gradeFilter}
                            onChange={(e) => setGradeFilter(e.target.value)}
                            className="w-full pl-12 pr-4 py-3.5 rounded-2xl border-2 border-gray-100 focus:border-vibrant-purple focus:ring-4 focus:ring-vibrant-purple/10 bg-white/50 focus:bg-white outline-none transition-all appearance-none cursor-pointer font-medium text-gray-700"
                        >
                            <option value="">所有年級</option>
                            {grades.map(g => <option key={g} value={g}>{g} 年級</option>)}
                        </select>
                    </div>
                    <div className="relative group/input">
                        <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within/input:text-vibrant-pink transition-colors" size={20} />
                        <select
                            value={classFilter}
                            onChange={(e) => setClassFilter(e.target.value)}
                            className="w-full pl-12 pr-4 py-3.5 rounded-2xl border-2 border-gray-100 focus:border-vibrant-pink focus:ring-4 focus:ring-vibrant-pink/10 bg-white/50 focus:bg-white outline-none transition-all appearance-none cursor-pointer font-medium text-gray-700"
                        >
                            <option value="">所有班級</option>
                            {classes.map(c => <option key={c} value={c}>{c} 班</option>)}
                        </select>
                    </div>
                </div>

                <div className="mb-6 bg-white/90 rounded-2xl p-4 border border-blue-100 text-sm text-gray-600 space-y-2">
                    <p className="font-bold text-gray-800">
                        目前篩選：{filteredSignatures.length} 筆｜同意 {consentCounts.agreed} 筆｜不同意 {consentCounts.disagreed} 筆｜意願未記錄 {consentCounts.unknown} 筆｜歸類待確認 {needsReviewCount} 筆
                    </p>
                    <p>學校與班級會依共同規則整理，同名學校按縣市分開；待確認紀錄保留原填內容，請核對後再分送各班。</p>
                    <p>本次打包包含目前篩選的全部資料，不受勾選影響；僅含已送出簽署，無法判定未回覆學生。</p>
                    {packageMessage && (
                        <p
                            role={packageMessage.type === 'error' ? 'alert' : 'status'}
                            className={packageMessage.type === 'error' ? 'font-medium text-red-700' : 'font-medium text-green-700'}
                        >
                            {packageMessage.text}
                        </p>
                    )}
                </div>

                {/* Data Display */}
                <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl border border-white/60 overflow-hidden min-h-[400px]">
                    {loading ? (
                        <div className="p-12 flex flex-col items-center justify-center h-full gap-4">
                            <Loader2 className="animate-spin text-blue-600" size={48} />
                            <p className="text-gray-500 font-medium">資料載入中...</p>
                        </div>
                    ) : (
                        <>
                            {/* Desktop Table View */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white">
                                            <th className="p-5 w-16 first:rounded-tl-2xl">
                                                <button onClick={toggleAll} className="text-white/70 hover:text-white transition-colors flex items-center justify-center">
                                                    {selectedIds.size === filteredSignatures.length && filteredSignatures.length > 0 ? <CheckSquare size={20} className="text-white" /> : <Square size={20} />}
                                                </button>
                                            </th>
                                            <th className="p-5 font-bold tracking-wide">
                                                <button
                                                    type="button"
                                                    onClick={() => handleSort('citySchool')}
                                                    className="flex w-full items-center gap-2 text-left transition-colors hover:text-white/80"
                                                    title="依縣市／學校排序"
                                                >
                                                    縣市/學校
                                                    {sortState.key === 'citySchool' ? (sortState.direction === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-60" />}
                                                </button>
                                            </th>
                                            <th className="p-5 font-bold tracking-wide">
                                                <button type="button" onClick={() => handleSort('grade')} className="flex w-full items-center gap-2 transition-colors hover:text-white/80" title="依年級排序">
                                                    年級
                                                    {sortState.key === 'grade' ? (sortState.direction === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-60" />}
                                                </button>
                                            </th>
                                            <th className="p-5 font-bold tracking-wide">
                                                <button type="button" onClick={() => handleSort('cls')} className="flex w-full items-center gap-2 transition-colors hover:text-white/80" title="依班級排序">
                                                    班級
                                                    {sortState.key === 'cls' ? (sortState.direction === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-60" />}
                                                </button>
                                            </th>
                                            <th className="p-5 font-bold tracking-wide">
                                                <button type="button" onClick={() => handleSort('seat')} className="flex w-full items-center gap-2 transition-colors hover:text-white/80" title="依座號排序">
                                                    座號
                                                    {sortState.key === 'seat' ? (sortState.direction === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-60" />}
                                                </button>
                                            </th>
                                            <th className="p-5 font-bold tracking-wide">
                                                <button type="button" onClick={() => handleSort('studentName')} className="flex w-full items-center gap-2 transition-colors hover:text-white/80" title="依學生姓名排序">
                                                    學生姓名
                                                    {sortState.key === 'studentName' ? (sortState.direction === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-60" />}
                                                </button>
                                            </th>
                                            <th className="p-5 font-bold tracking-wide">
                                                <button type="button" onClick={() => handleSort('parentName')} className="flex w-full items-center gap-2 transition-colors hover:text-white/80" title="依家長姓名排序">
                                                    家長姓名
                                                    {sortState.key === 'parentName' ? (sortState.direction === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-60" />}
                                                </button>
                                            </th>
                                            <th className="p-5 font-bold tracking-wide">
                                                <button type="button" onClick={() => handleSort('isAgreed')} className="flex w-full items-center gap-2 transition-colors hover:text-white/80" title="依簽署意願排序">
                                                    簽署意願
                                                    {sortState.key === 'isAgreed' ? (sortState.direction === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-60" />}
                                                </button>
                                            </th>
                                            <th className="p-5 font-bold tracking-wide">
                                                <button type="button" onClick={() => handleSort('timestamp')} className="flex w-full items-center gap-2 transition-colors hover:text-white/80" title="依簽署時間排序">
                                                    簽署時間
                                                    {sortState.key === 'timestamp' ? (sortState.direction === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-60" />}
                                                </button>
                                            </th>
                                            <th className="p-5 font-bold tracking-wide">簽名預覽</th>
                                            <th className="p-5 font-bold tracking-wide text-right last:rounded-tr-2xl">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredSignatures.length > 0 ? (
                                            filteredRows.map(({ record: item, grouping }) => (
                                                <motion.tr
                                                    key={item.id}
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    exit={{ opacity: 0 }}
                                                    className={`hover:bg-blue-50/40 transition-all group ${selectedIds.has(item.id) ? 'bg-blue-50/60' : ''}`}
                                                >
                                                    <td className="p-5">
                                                        <button onClick={() => toggleSelection(item.id)} className="text-gray-300 hover:text-blue-600 transition-colors">
                                                            {selectedIds.has(item.id) ? <CheckSquare size={20} className="text-blue-600" /> : <Square size={20} />}
                                                        </button>
                                                    </td>
                                                    <td className="p-5">
                                                        <div className="flex flex-col">
                                                            <span className="text-xs text-gray-500 font-bold">{grouping.city}</span>
                                                            <span className="text-sm font-bold text-gray-700">{grouping.school}</span>
                                                            <GroupingNote record={item} grouping={grouping} />
                                                        </div>
                                                    </td>
                                                    <td className="p-5">
                                                        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-bold shadow-sm border border-blue-200">
                                                            {grouping.grade}
                                                        </span>
                                                    </td>
                                                    <td className="p-5">
                                                        <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-bold shadow-sm border border-purple-200">
                                                            {grouping.cls}
                                                        </span>
                                                    </td>
                                                    <td className="p-5">
                                                        <span className="bg-pink-100 text-pink-700 px-3 py-1 rounded-full text-sm font-bold shadow-sm border border-pink-200">
                                                            {grouping.seat}
                                                        </span>
                                                    </td>
                                                    <td className="p-5 font-bold text-gray-800 text-lg">{item.studentName}</td>
                                                    <td className="p-5 text-gray-600 font-medium">{item.parentName}</td>
                                                    <td className="p-5">
                                                        <span className={`px-3 py-1 rounded-full text-sm font-bold shadow-sm border ${item.isAgreed === true ? 'bg-green-100 text-green-700 border-green-200' : item.isAgreed === false ? 'bg-red-100 text-red-700 border-red-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                                            {getConsentStatus(item.isAgreed)}
                                                        </span>
                                                    </td>
                                                    <td className="p-5 text-gray-500 text-sm font-mono">
                                                        {item.timestamp?.toDate().toLocaleString()}
                                                    </td>
                                                    <td className="p-5">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-24 h-10 bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-blue-400 hover:shadow-md transition-all group/img relative cursor-pointer">
                                                                <img
                                                                    src={item.signatureUrl}
                                                                    alt="簽名"
                                                                    className="w-full h-full object-contain p-1"
                                                                />
                                                                <a
                                                                    href={item.signatureUrl}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity text-white text-[10px] font-bold backdrop-blur-sm"
                                                                >
                                                                    放大
                                                                </a>
                                                            </div>
                                                            {item.pdfUrl && (
                                                                <a
                                                                    href={item.pdfUrl}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                                    title="下載 PDF"
                                                                >
                                                                    <FileText size={18} />
                                                                </a>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="p-5 text-right">
                                                        <button
                                                            onClick={() => handleDelete(item.id)}
                                                            className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all opacity-0 group-hover:opacity-100"
                                                            title="刪除"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </td>
                                                </motion.tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={10} className="p-16 text-center text-gray-400 flex flex-col items-center justify-center w-full">
                                                    <Search size={48} className="mb-4 opacity-20" />
                                                    <p>沒有符合條件的資料</p>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Card View */}
                            <div className="md:hidden p-4 space-y-4 bg-gray-50/50">
                                {filteredSignatures.length > 0 ? (
                                    filteredRows.map(({ record: item, grouping }) => (
                                        <motion.div
                                            key={item.id}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={`bg-white p-5 rounded-2xl shadow-sm border-l-4 relative overflow-hidden ${selectedIds.has(item.id) ? 'border-l-blue-500 ring-2 ring-blue-100' : 'border-l-indigo-500 border-gray-100'}`}
                                            onClick={() => toggleSelection(item.id)}
                                        >
                                            {/* Selection Overlay */}
                                            {selectedIds.has(item.id) && (
                                                <div className="absolute top-0 right-0 p-2 bg-blue-500 rounded-bl-xl z-10">
                                                    <CheckSquare size={16} className="text-white" />
                                                </div>
                                            )}

                                            <div className="flex justify-between items-start mb-4 pl-1">
                                                <div className="flex items-center gap-4">
                                                    <div className="flex flex-col items-center gap-1">
                                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">座號</span>
                                                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xl font-bold shadow-lg shadow-blue-500/20">
                                                            {grouping.seat}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                                            {item.studentName}
                                                        </h3>
                                                        <div className="flex gap-2 mt-1.5 flex-wrap">
                                                            <span className="bg-teal-50 text-teal-700 px-2 py-0.5 rounded-md text-xs font-bold border border-teal-100 flex items-center gap-1">
                                                                <School size={10} /> {grouping.city} {grouping.school}
                                                            </span>
                                                            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md text-xs font-bold border border-blue-100 flex items-center gap-1">
                                                                <User size={10} /> {grouping.grade}年
                                                            </span>
                                                            <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md text-xs font-bold border border-purple-100 flex items-center gap-1">
                                                                <Users size={10} /> {grouping.cls}班
                                                            </span>
                                                            <span className={`${item.isAgreed === true ? 'bg-green-50 text-green-700 border-green-100' : item.isAgreed === false ? 'bg-red-50 text-red-700 border-red-100' : 'bg-gray-50 text-gray-600 border-gray-100'} px-2 py-0.5 rounded-md text-xs font-bold border flex items-center gap-1`}>
                                                                {getConsentStatus(item.isAgreed)}
                                                            </span>
                                                        </div>
                                                        <GroupingNote record={item} grouping={grouping} />
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                                                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                                                >
                                                    <Trash2 size={20} />
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3 text-sm text-gray-600 mb-4 bg-gray-50 p-3 rounded-xl border border-gray-100">
                                                <div className="flex items-center gap-2">
                                                    <User size={14} className="text-gray-400" />
                                                    <span className="text-gray-500">家長：</span>
                                                    <span className="font-medium text-gray-700">{item.parentName}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Calendar size={14} className="text-gray-400" />
                                                    <span className="text-gray-500">日期：</span>
                                                    <span className="font-medium text-gray-700">{item.timestamp?.toDate().toLocaleDateString()}</span>
                                                </div>
                                            </div>

                                            <div className="relative">
                                                <div className="absolute -top-2.5 left-3 bg-white px-2 text-xs font-bold text-gray-400 flex items-center gap-1">
                                                    <PenTool size={10} /> 簽名檔
                                                </div>
                                                <div className="bg-white rounded-xl p-3 border-2 border-dashed border-gray-200 flex justify-center">
                                                    <img
                                                        src={item.signatureUrl}
                                                        alt="簽名"
                                                        className="h-16 object-contain mix-blend-multiply opacity-80 hover:opacity-100 transition-opacity"
                                                    />
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))
                                ) : (
                                    <div className="text-center py-12 text-gray-400 flex flex-col items-center">
                                        <Search size={48} className="mb-4 opacity-20" />
                                        <p>沒有符合條件的資料</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;

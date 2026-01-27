import React, { useEffect, useState } from 'react';
import { db, auth } from '../firebase';
import { collection, query, orderBy, getDocs, deleteDoc, doc, limit, startAfter, where } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { LogOut, Search, Users, FileSignature, Calendar, Filter, Home, Loader2, CheckCircle, Trash2, AlertTriangle, X, Download, FileSpreadsheet, FileDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { downloadBatchSignatures } from '../utils/batchDownloader';
import { exportToExcel } from '../utils/exporter';
import { generateConsentPDF } from '../utils/pdfGenerator';

interface SignatureData {
    id: string;
    studentName: string;
    parentName: string;
    grade: string;
    cls: string;
    seat: string;
    signatureUrl: string;
    timestamp: any;
    isAgreed: boolean;
}

const PAGE_SIZE = 20;

const Dashboard: React.FC = () => {
    const [signatures, setSignatures] = useState<SignatureData[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterClass, setFilterClass] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const navigate = useNavigate();
    const [selectedSignature, setSelectedSignature] = useState<SignatureData | null>(null);

    // Delete & Selection State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);
    const [isDeleting, setIsDeleting] = useState(false);

    // Pagination State
    const [lastVisible, setLastVisible] = useState<any>(null);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    // Initial Load
    useEffect(() => {
        fetchSignatures(true);
    }, [filterClass]); // Refetch when filter changes

    const fetchSignatures = async (isInitial = false) => {
        if (isInitial) {
            setLoading(true);
            setSignatures([]);
            setLastVisible(null);
            setHasMore(true);
        } else {
            setIsLoadingMore(true);
        }

        try {
            let q = query(collection(db, "signatures"), orderBy("timestamp", "desc"));

            // Apply filters (Client-side filtering for simplicity with pagination, 
            // or Server-side if indexes are set up. For now, we fetch more and filter client-side 
            // OR we just filter by class if selected)

            // Note: Firestore limitation - cannot order by timestamp and filter by class without index.
            // For this demo, we will fetch all (or large batch) if filtering, or use simple pagination for all.
            // To keep it robust without complex indexes, we'll fetch latest 1000 for stats/filtering client side
            // BUT for pagination, we really should use server side.
            // Let's stick to simple pagination for "All" view, and client-side filter for specific class (assuming < 1000 records per class)

            if (filterClass) {
                // If filtering by class, we might need an index. 
                // Let's try client-side filtering on a larger fetched set for now to avoid index errors in demo.
                // OR: just fetch all for that class.
                const classQuery = query(collection(db, "signatures"), where("cls", "==", filterClass), orderBy("timestamp", "desc"));
                const snapshot = await getDocs(classQuery);
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SignatureData[];
                setSignatures(data);
                setHasMore(false); // Disable pagination for filtered view for now
                setLoading(false);
                setIsLoadingMore(false);
                return;
            }

            if (!isInitial && lastVisible) {
                q = query(q, startAfter(lastVisible));
            }

            q = query(q, limit(PAGE_SIZE));

            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                setHasMore(false);
            } else {
                const data = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as SignatureData[];

                setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
                setSignatures(prev => isInitial ? data : [...prev, ...data]);

                if (snapshot.docs.length < PAGE_SIZE) {
                    setHasMore(false);
                }
            }
        } catch (error) {
            console.error("Error fetching signatures:", error);
        } finally {
            setLoading(false);
            setIsLoadingMore(false);
        }
    };

    const handleLogout = async () => {
        await signOut(auth);
        navigate('/admin/login');
    };

    // Client-side filtering for search term
    const filteredSignatures = signatures.filter(sig => {
        const matchSearch = searchTerm ?
            (sig.studentName.includes(searchTerm) || sig.grade.includes(searchTerm)) : true;
        return matchSearch;
    });

    // Get unique classes for filter (from current loaded data - might be incomplete if paginated, 
    // but better than nothing. Ideally should be a separate collection)
    const uniqueClasses = Array.from(new Set(signatures.map(s => s.cls))).sort();

    // Stats (based on loaded data)
    const totalSignatures = signatures.length;
    const todaySignatures = signatures.filter(s => {
        if (!s.timestamp) return false;
        const date = s.timestamp.toDate();
        const today = new Date();
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
    }).length;

    // Selection Logic
    const toggleSelection = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredSignatures.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredSignatures.map(s => s.id)));
        }
    };

    // Delete Logic
    const initiateDelete = (ids: string[]) => {
        setDeleteTargetIds(ids);
        setIsDeleteModalOpen(true);
    };

    const performDelete = async () => {
        setIsDeleting(true);
        try {
            await Promise.all(deleteTargetIds.map(id => deleteDoc(doc(db, "signatures", id))));

            // Remove from local state
            setSignatures(prev => prev.filter(s => !deleteTargetIds.includes(s.id)));

            setSelectedIds(new Set()); // Clear selection
            setIsDeleteModalOpen(false);
        } catch (error) {
            console.error("Error deleting documents:", error);
            alert("刪除失敗，請稍後再試");
        } finally {
            setIsDeleting(false);
        }
    };

    // Batch Actions
    const handleBatchDownload = async () => {
        const targets = selectedIds.size > 0
            ? signatures.filter(s => selectedIds.has(s.id))
            : filteredSignatures;

        if (targets.length === 0) {
            alert("沒有可下載的資料");
            return;
        }

        if (confirm(`確定要下載 ${targets.length} 筆簽名檔嗎？`)) {
            await downloadBatchSignatures(targets, filterClass);
        }
    };

    const handleExportExcel = () => {
        const targets = selectedIds.size > 0
            ? signatures.filter(s => selectedIds.has(s.id))
            : filteredSignatures;

        if (targets.length === 0) {
            alert("沒有可匯出的資料");
            return;
        }

        exportToExcel(targets, filterClass ? `Class_${filterClass}_Signatures` : 'All_Signatures');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 font-sans pb-12">
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 z-30 bg-white/70 backdrop-blur-xl border-b border-white/50 shadow-sm transition-all duration-300">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-2.5 rounded-xl text-white shadow-lg shadow-blue-500/30 ring-1 ring-white/50">
                            <FileSignature size={20} />
                        </div>
                        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-700 tracking-tight">
                            簽名管理後台
                        </h1>
                    </div>
                    <div className="flex items-center gap-3 md:gap-4">
                        <Link
                            to="/"
                            className="flex items-center gap-2 text-gray-600 hover:text-blue-600 transition-all font-medium text-sm px-4 py-2 rounded-xl hover:bg-white/80 active:scale-95"
                        >
                            <Home size={18} />
                            <span className="hidden md:inline">回首頁</span>
                        </Link>
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 text-gray-600 hover:text-red-500 transition-all font-medium text-sm px-4 py-2 rounded-xl hover:bg-red-50/80 active:scale-95"
                        >
                            <LogOut size={18} />
                            <span className="hidden md:inline">登出</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-28">
                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 mb-8">
                    <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-6 rounded-3xl shadow-lg shadow-blue-500/20 text-white relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300">
                        <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-2 -translate-y-2 group-hover:scale-110 transition-transform">
                            <Users size={100} />
                        </div>
                        <div className="relative z-10 flex flex-col h-full justify-between">
                            <div className="bg-white/20 w-fit p-3 rounded-2xl mb-4 backdrop-blur-sm">
                                <Users size={24} className="text-white" />
                            </div>
                            <div>
                                <p className="text-blue-100 text-sm font-medium mb-1">目前顯示</p>
                                <p className="text-4xl font-heading font-bold tracking-tight">{totalSignatures}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-emerald-400 to-teal-600 p-6 rounded-3xl shadow-lg shadow-emerald-500/20 text-white relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300">
                        <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-2 -translate-y-2 group-hover:scale-110 transition-transform">
                            <Calendar size={100} />
                        </div>
                        <div className="relative z-10 flex flex-col h-full justify-between">
                            <div className="bg-white/20 w-fit p-3 rounded-2xl mb-4 backdrop-blur-sm">
                                <Calendar size={24} className="text-white" />
                            </div>
                            <div>
                                <p className="text-emerald-100 text-sm font-medium mb-1">今日新增</p>
                                <p className="text-4xl font-heading font-bold tracking-tight">{todaySignatures}</p>
                            </div>
                        </div>
                    </div>

                    {/* Action Card */}
                    <div className="col-span-2 md:col-span-1 bg-white/60 backdrop-blur-xl p-6 rounded-3xl shadow-sm border border-white/60 flex flex-col justify-center gap-3">
                        <button
                            onClick={handleExportExcel}
                            className="w-full py-3 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                        >
                            <FileSpreadsheet size={20} />
                            匯出 Excel 報表
                        </button>
                        <button
                            onClick={handleBatchDownload}
                            className="w-full py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                        >
                            <Download size={20} />
                            下載簽名圖檔 (ZIP)
                        </button>
                    </div>
                </div>

                {/* Filters & Batch Actions */}
                <div className="bg-white/60 backdrop-blur-xl p-4 rounded-3xl shadow-sm border border-white/60 mb-8 flex flex-col md:flex-row gap-4 items-center justify-between sticky top-20 z-20 md:static transition-all duration-300">
                    <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
                        {selectedIds.size > 0 ? (
                            <div className="flex items-center gap-3 w-full md:w-auto animate-in fade-in slide-in-from-left-4 duration-200">
                                <button
                                    onClick={() => initiateDelete(Array.from(selectedIds))}
                                    className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-red-500/30 transition-all active:scale-95"
                                >
                                    <Trash2 size={18} />
                                    刪除 ({selectedIds.size})
                                </button>
                                <div className="h-8 w-px bg-gray-300 mx-2"></div>
                                <button
                                    onClick={handleBatchDownload}
                                    className="p-3 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                                    title="下載選取項目"
                                >
                                    <Download size={20} />
                                </button>
                                <button
                                    onClick={handleExportExcel}
                                    className="p-3 text-green-600 hover:bg-green-50 rounded-xl transition-colors"
                                    title="匯出選取項目"
                                >
                                    <FileSpreadsheet size={20} />
                                </button>
                                <button
                                    onClick={() => setSelectedIds(new Set())}
                                    className="p-3 text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
                                    title="取消選取"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="relative w-full md:w-72">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                    <input
                                        type="text"
                                        placeholder="搜尋姓名或年級..."
                                        className="w-full pl-12 pr-4 py-3 bg-white/50 border border-gray-200/50 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white outline-none transition-all text-gray-700 placeholder-gray-400"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <div className="relative w-full md:w-auto">
                                    <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                    <select
                                        className="w-full md:w-auto pl-12 pr-12 py-3 bg-white/50 border border-gray-200/50 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white outline-none appearance-none cursor-pointer transition-all text-gray-700 font-medium"
                                        value={filterClass}
                                        onChange={(e) => setFilterClass(e.target.value)}
                                    >
                                        <option value="">所有班級</option>
                                        {uniqueClasses.map(c => (
                                            <option key={c} value={c}>{c} 班</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                    <div className="text-sm text-gray-500 font-medium w-full md:w-auto text-right px-2">
                        共 <span className="text-blue-600 font-bold text-lg mx-1">{filteredSignatures.length}</span> 筆資料
                    </div>
                </div>

                {/* Mobile Card View (md:hidden) */}
                <div className="md:hidden space-y-4">
                    {loading ? (
                        <div className="text-center py-12 text-gray-500 bg-white/50 backdrop-blur-sm rounded-3xl">
                            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-500" />
                            載入中...
                        </div>
                    ) : filteredSignatures.length === 0 ? (
                        <div className="text-center py-12 text-gray-500 bg-white/50 backdrop-blur-sm rounded-3xl border border-white/50">
                            沒有找到相關資料
                        </div>
                    ) : (
                        filteredSignatures.map((sig) => (
                            <div
                                key={sig.id}
                                className={`bg-white/80 backdrop-blur-md p-5 rounded-3xl shadow-sm border transition-all duration-200 ${selectedIds.has(sig.id) ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-white/50'}`}
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(sig.id)}
                                            onChange={() => toggleSelection(sig.id)}
                                            className="w-5 h-5 rounded-md border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <div className="flex items-center gap-2">
                                            <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-xl text-sm font-bold shadow-sm">
                                                {sig.grade}年{sig.cls}班
                                            </span>
                                            <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-xl text-sm font-medium">
                                                {sig.seat}號
                                            </span>
                                            <span className={`px-3 py-1 rounded-xl text-sm font-bold shadow-sm border ${sig.isAgreed ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                                                {sig.isAgreed ? '同意' : '不同意'}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => initiateDelete([sig.id])}
                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>

                                <div className="flex justify-between items-center border-b border-gray-100 pb-4 border-dashed mb-4">
                                    <div>
                                        <p className="text-xs text-gray-400 mb-1 font-medium uppercase tracking-wider">學生姓名</p>
                                        <p className="text-xl font-bold text-gray-800">{sig.studentName}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-gray-400 mb-1 font-medium uppercase tracking-wider">家長姓名</p>
                                        <p className="text-lg font-medium text-gray-600">{sig.parentName}</p>
                                    </div>
                                </div>

                                <button
                                    onClick={() => setSelectedSignature(sig)}
                                    className="w-full py-3 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 text-blue-600 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 group"
                                >
                                    <div className="bg-white p-1.5 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                        <FileSignature size={16} />
                                    </div>
                                    查看簽名
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Desktop Table View (hidden md:block) */}
                <div className="hidden md:block bg-white/70 backdrop-blur-xl rounded-[2rem] shadow-xl shadow-blue-900/5 border border-white/60 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gradient-to-r from-gray-50/80 to-gray-100/80 border-b border-gray-200/60">
                                    <th className="px-6 py-5 w-16">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.size > 0 && selectedIds.size === filteredSignatures.length}
                                            onChange={toggleSelectAll}
                                            className="w-5 h-5 rounded-md border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                    </th>
                                    <th className="px-8 py-5 text-sm font-bold text-gray-500 uppercase tracking-wider">年級</th>
                                    <th className="px-8 py-5 text-sm font-bold text-gray-500 uppercase tracking-wider">班級</th>
                                    <th className="px-8 py-5 text-sm font-bold text-gray-500 uppercase tracking-wider">座號</th>
                                    <th className="px-8 py-5 text-sm font-bold text-gray-500 uppercase tracking-wider">學生姓名</th>
                                    <th className="px-8 py-5 text-sm font-bold text-gray-500 uppercase tracking-wider">家長姓名</th>
                                    <th className="px-8 py-5 text-sm font-bold text-gray-500 uppercase tracking-wider">意願</th>
                                    <th className="px-8 py-5 text-sm font-bold text-gray-500 uppercase tracking-wider">簽名</th>
                                    <th className="px-8 py-5 text-sm font-bold text-gray-500 uppercase tracking-wider">時間</th>
                                    <th className="px-6 py-5 text-sm font-bold text-gray-500 uppercase tracking-wider text-right">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-20 text-center text-gray-500">
                                            <div className="flex flex-col items-center gap-3">
                                                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                                                <p>載入資料中...</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredSignatures.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-20 text-center text-gray-500">
                                            <div className="flex flex-col items-center gap-3 opacity-50">
                                                <Search className="w-12 h-12" />
                                                <p>沒有找到相關資料</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredSignatures.map((sig) => (
                                        <tr
                                            key={sig.id}
                                            className={`hover:bg-blue-50/40 transition-colors group border-l-4 ${selectedIds.has(sig.id) ? 'bg-blue-50/60 border-blue-500' : 'border-transparent hover:border-blue-500'}`}
                                        >
                                            <td className="px-6 py-5">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(sig.id)}
                                                    onChange={() => toggleSelection(sig.id)}
                                                    className="w-5 h-5 rounded-md border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                            </td>
                                            <td className="px-8 py-5 text-gray-700 font-medium">{sig.grade}</td>
                                            <td className="px-8 py-5 text-gray-700 font-medium">{sig.cls}</td>
                                            <td className="px-8 py-5 text-gray-700 font-medium">{sig.seat}</td>
                                            <td className="px-8 py-5 text-gray-900 font-bold text-lg">{sig.studentName}</td>
                                            <td className="px-8 py-5 text-gray-600 font-medium">{sig.parentName}</td>
                                            <td className="px-8 py-5">
                                                <span className={`px-2 py-1 rounded-lg text-xs font-bold border ${sig.isAgreed ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                    {sig.isAgreed ? '同意' : '不同意'}
                                                </span>
                                            </td>
                                            <td className="px-8 py-5">
                                                <button
                                                    onClick={() => setSelectedSignature(sig)}
                                                    className="text-blue-600 text-sm font-bold hover:text-blue-700 flex items-center gap-2 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-all"
                                                >
                                                    <FileSignature size={16} />
                                                    查看
                                                </button>
                                            </td>
                                            <td className="px-8 py-5 text-sm text-gray-400 font-medium">
                                                {sig.timestamp?.toDate().toLocaleString()}
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                <button
                                                    onClick={() => initiateDelete([sig.id])}
                                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="刪除"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Pagination Controls */}
                {!filterClass && (
                    <div className="flex justify-center mt-8">
                        <button
                            onClick={() => fetchSignatures(false)}
                            disabled={!hasMore || isLoadingMore}
                            className="bg-white hover:bg-gray-50 text-gray-700 font-bold py-3 px-8 rounded-2xl shadow-sm border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                        >
                            {isLoadingMore ? (
                                <>
                                    <Loader2 className="animate-spin" size={20} />
                                    載入中...
                                </>
                            ) : hasMore ? (
                                '載入更多資料'
                            ) : (
                                '沒有更多資料了'
                            )}
                        </button>
                    </div>
                )}
            </main>

            {/* Signature Modal */}
            {selectedSignature && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setSelectedSignature(null)}>
                    <div className="bg-white rounded-[2rem] shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-300 ring-1 ring-white/20 relative" onClick={e => e.stopPropagation()}>

                        {/* Header with Gradient */}
                        <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex justify-between items-start relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-4 -translate-y-4">
                                <FileSignature size={120} />
                            </div>
                            <div className="relative z-10">
                                <h3 className="text-2xl font-bold font-heading mb-2">{selectedSignature.studentName} 的家長簽名</h3>
                                <div className="flex flex-wrap gap-2">
                                    <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-lg text-sm font-bold border border-white/10">
                                        {selectedSignature.grade}年{selectedSignature.cls}班 {selectedSignature.seat}號
                                    </span>
                                    <span className="bg-emerald-500/90 backdrop-blur-md px-3 py-1 rounded-lg text-sm font-bold border border-white/10 flex items-center gap-1">
                                        <CheckCircle size={14} />
                                        已簽署
                                    </span>
                                    <span className={`${selectedSignature.isAgreed ? 'bg-green-500/90' : 'bg-red-500/90'} backdrop-blur-md px-3 py-1 rounded-lg text-sm font-bold border border-white/10`}>
                                        {selectedSignature.isAgreed ? '同意授權' : '不同意授權'}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedSignature(null)}
                                className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white/80 hover:text-white backdrop-blur-md"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>

                        {/* Signature Area */}
                        <div className="p-8 bg-gray-50 flex flex-col items-center justify-center min-h-[280px] relative">
                            <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-50"></div>

                            <div className="bg-white p-4 rounded-2xl shadow-xl shadow-gray-200/50 transform rotate-1 transition-transform hover:rotate-0 duration-300 border border-white relative z-10 max-w-full">
                                <div className="absolute -top-3 -left-3 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-md shadow-sm transform -rotate-12">
                                    ORIGINAL
                                </div>
                                <img
                                    src={selectedSignature.signatureUrl}
                                    alt="Signature"
                                    className="max-w-full h-auto max-h-[200px] object-contain"
                                />
                            </div>

                            <div className="mt-8 flex items-center gap-2 text-gray-400 text-sm font-medium bg-white/50 px-4 py-2 rounded-full border border-gray-100">
                                <Users size={16} />
                                家長：<span className="text-gray-700 font-bold">{selectedSignature.parentName}</span>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 bg-white border-t border-gray-100 flex justify-between items-center text-xs text-gray-400 font-medium">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => generateConsentPDF(selectedSignature)}
                                    className="flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors"
                                >
                                    <FileDown size={16} />
                                    下載 PDF
                                </button>
                            </div>
                            <div>
                                {selectedSignature.timestamp?.toDate().toLocaleString()}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {isDeleteModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200 p-6 text-center">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
                            <AlertTriangle size={32} />
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">確定要刪除嗎？</h3>
                        <p className="text-gray-500 mb-6">
                            您即將刪除 <span className="font-bold text-red-500">{deleteTargetIds.length}</span> 筆資料。<br />
                            此動作<span className="font-bold">無法復原</span>，請謹慎操作。
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setIsDeleteModalOpen(false)}
                                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition-colors"
                                disabled={isDeleting}
                            >
                                取消
                            </button>
                            <button
                                onClick={performDelete}
                                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-500/30 transition-all flex items-center justify-center gap-2"
                                disabled={isDeleting}
                            >
                                {isDeleting ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        刪除中...
                                    </>
                                ) : (
                                    '確認刪除'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;

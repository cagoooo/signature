import React, { useEffect, useState } from 'react';
import { db, auth } from '../firebase';
import { collection, getDocs, query, orderBy, Timestamp, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useNavigate, Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Download, LogOut, Search, Filter, Loader2, FileText, Trash2, CheckSquare, Square, Home, User, Users, Calendar, PenTool } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SignatureData {
    id: string;
    studentName: string;
    parentName: string;
    grade: string;
    cls: string;
    seat: string;
    signatureUrl: string;
    timestamp: Timestamp;
    email?: string;
}

const AdminDashboard: React.FC = () => {
    const [signatures, setSignatures] = useState<SignatureData[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [gradeFilter, setGradeFilter] = useState('');
    const [classFilter, setClassFilter] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const navigate = useNavigate();

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

    const exportToExcel = () => {
        const dataToExport = filteredSignatures.map(item => ({
            "年級": item.grade,
            "班級": item.cls,
            "座號": item.seat,
            "學生姓名": item.studentName,
            "家長姓名": item.parentName,
            "家長Email": item.email || '',
            "簽署時間": item.timestamp?.toDate().toLocaleString(),
            "簽名檔連結": item.signatureUrl
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "簽署名單");
        XLSX.writeFile(wb, `學生活動同意書簽署名單_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const filteredSignatures = signatures.filter(item => {
        const matchesSearch = item.studentName.includes(searchTerm) ||
            item.parentName.includes(searchTerm) ||
            item.seat.includes(searchTerm);
        const matchesGrade = gradeFilter ? item.grade === gradeFilter : true;
        const matchesClass = classFilter ? item.cls === classFilter : true;
        return matchesSearch && matchesGrade && matchesClass;
    });

    const grades = Array.from(new Set(signatures.map(s => s.grade))).sort();
    const classes = Array.from(new Set(signatures.map(s => s.cls))).sort();

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans relative overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-50 pointer-events-none"></div>
            <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-100/50 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-pink-100/50 rounded-full blur-3xl pointer-events-none"></div>

            <div className="max-w-7xl mx-auto relative z-10">
                {/* Header */}
                <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 bg-white/80 backdrop-blur-xl p-6 rounded-3xl shadow-lg border border-white/60 relative overflow-hidden group hover:shadow-xl transition-all duration-300">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-vibrant-blue via-vibrant-purple to-vibrant-pink"></div>
                    <div className="z-10">
                        <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 rounded-xl text-white shadow-lg shadow-blue-500/30">
                                <FileText size={28} />
                            </div>
                            簽署管理後台
                        </h1>
                        <p className="text-gray-500 mt-2 ml-1 flex items-center gap-2">
                            <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg text-sm font-bold border border-blue-100">
                                Total: {signatures.length}
                            </span>
                            <span className="text-sm">份同意書</span>
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
                                    className="bg-red-50 text-red-600 hover:bg-red-100 px-5 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 border border-red-200 shadow-sm"
                                >
                                    <Trash2 size={18} />
                                    刪除 ({selectedIds.size})
                                </motion.button>
                            )}
                        </AnimatePresence>

                        <Link to="/" className="bg-white hover:bg-gray-50 text-gray-600 px-5 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 border border-gray-200 shadow-sm hover:shadow-md hover:text-blue-600">
                            <Home size={18} />
                            回首頁
                        </Link>

                        <button
                            onClick={exportToExcel}
                            className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-emerald-500/30 transition-all flex items-center gap-2"
                        >
                            <Download size={18} />
                            匯出 Excel
                        </button>

                        <button
                            onClick={handleLogout}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-5 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2"
                        >
                            <LogOut size={18} />
                            登出
                        </button>
                    </div>
                </header>

                {/* Filters */}
                <div className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl shadow-sm border border-white/60 mb-8 grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="relative md:col-span-2 group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                        <input
                            type="text"
                            placeholder="搜尋姓名、座號..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-100 focus:border-blue-500 focus:bg-white bg-gray-50/50 outline-none transition-all"
                        />
                    </div>
                    <div className="relative group">
                        <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                        <select
                            value={gradeFilter}
                            onChange={(e) => setGradeFilter(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-100 focus:border-blue-500 focus:bg-white bg-gray-50/50 outline-none transition-all appearance-none cursor-pointer"
                        >
                            <option value="">所有年級</option>
                            {grades.map(g => <option key={g} value={g}>{g} 年級</option>)}
                        </select>
                    </div>
                    <div className="relative group">
                        <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                        <select
                            value={classFilter}
                            onChange={(e) => setClassFilter(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-100 focus:border-blue-500 focus:bg-white bg-gray-50/50 outline-none transition-all appearance-none cursor-pointer"
                        >
                            <option value="">所有班級</option>
                            {classes.map(c => <option key={c} value={c}>{c} 班</option>)}
                        </select>
                    </div>
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
                                            <th className="p-5 font-bold tracking-wide">年級</th>
                                            <th className="p-5 font-bold tracking-wide">班級</th>
                                            <th className="p-5 font-bold tracking-wide">座號</th>
                                            <th className="p-5 font-bold tracking-wide">學生姓名</th>
                                            <th className="p-5 font-bold tracking-wide">家長姓名</th>
                                            <th className="p-5 font-bold tracking-wide">簽署時間</th>
                                            <th className="p-5 font-bold tracking-wide">簽名預覽</th>
                                            <th className="p-5 font-bold tracking-wide text-right last:rounded-tr-2xl">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredSignatures.length > 0 ? (
                                            filteredSignatures.map((item) => (
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
                                                        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-bold shadow-sm border border-blue-200">
                                                            {item.grade}
                                                        </span>
                                                    </td>
                                                    <td className="p-5">
                                                        <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-bold shadow-sm border border-purple-200">
                                                            {item.cls}
                                                        </span>
                                                    </td>
                                                    <td className="p-5">
                                                        <span className="bg-pink-100 text-pink-700 px-3 py-1 rounded-full text-sm font-bold shadow-sm border border-pink-200">
                                                            {item.seat}
                                                        </span>
                                                    </td>
                                                    <td className="p-5 font-bold text-gray-800 text-lg">{item.studentName}</td>
                                                    <td className="p-5 text-gray-600 font-medium">{item.parentName}</td>
                                                    <td className="p-5 text-gray-500 text-sm font-mono">
                                                        {item.timestamp?.toDate().toLocaleString()}
                                                    </td>
                                                    <td className="p-5">
                                                        <div className="w-28 h-12 bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-blue-400 hover:shadow-md transition-all group relative cursor-pointer">
                                                            <img
                                                                src={item.signatureUrl}
                                                                alt="簽名"
                                                                className="w-full h-full object-contain p-1"
                                                            />
                                                            <a
                                                                href={item.signatureUrl}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-bold backdrop-blur-sm"
                                                            >
                                                                放大檢視
                                                            </a>
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
                                                <td colSpan={9} className="p-16 text-center text-gray-400 flex flex-col items-center justify-center w-full">
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
                                    filteredSignatures.map((item) => (
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
                                                            {item.seat}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                                            {item.studentName}
                                                        </h3>
                                                        <div className="flex gap-2 mt-1.5">
                                                            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md text-xs font-bold border border-blue-100 flex items-center gap-1">
                                                                <User size={10} /> {item.grade}年
                                                            </span>
                                                            <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md text-xs font-bold border border-purple-100 flex items-center gap-1">
                                                                <Users size={10} /> {item.cls}班
                                                            </span>
                                                        </div>
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

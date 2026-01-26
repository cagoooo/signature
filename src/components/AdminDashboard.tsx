import React, { useEffect, useState } from 'react';
import { db, auth } from '../firebase';
import { collection, getDocs, query, orderBy, Timestamp, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Download, LogOut, Search, Filter, Loader2, FileText, Trash2, CheckSquare, Square } from 'lucide-react';
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
        <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 bg-white p-6 rounded-3xl shadow-lg border border-gray-100 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-vibrant-blue via-vibrant-purple to-vibrant-pink"></div>
                    <div className="z-10">
                        <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                            <div className="bg-blue-100 p-2 rounded-xl text-blue-600">
                                <FileText size={28} />
                            </div>
                            簽署管理後台
                        </h1>
                        <p className="text-gray-500 mt-1 ml-1">共收到 <span className="text-blue-600 font-bold text-lg">{signatures.length}</span> 份同意書</p>
                    </div>
                    <div className="flex gap-3 w-full md:w-auto z-10">
                        <AnimatePresence>
                            {selectedIds.size > 0 && (
                                <motion.button
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    onClick={handleBatchDelete}
                                    className="flex-1 md:flex-none bg-red-50 text-red-600 hover:bg-red-100 px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 border border-red-200"
                                >
                                    <Trash2 size={20} />
                                    刪除 ({selectedIds.size})
                                </motion.button>
                            )}
                        </AnimatePresence>
                        <button
                            onClick={exportToExcel}
                            className="flex-1 md:flex-none bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-green-500/30 transition-all flex items-center justify-center gap-2"
                        >
                            <Download size={20} />
                            匯出 Excel
                        </button>
                        <button
                            onClick={handleLogout}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                        >
                            <LogOut size={20} />
                            登出
                        </button>
                    </div>
                </header>

                {/* Filters */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-8 grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="relative md:col-span-2">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type="text"
                            placeholder="搜尋姓名、座號..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-100 focus:border-blue-500 outline-none transition-all"
                        />
                    </div>
                    <div className="relative">
                        <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <select
                            value={gradeFilter}
                            onChange={(e) => setGradeFilter(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-100 focus:border-blue-500 outline-none transition-all appearance-none bg-white"
                        >
                            <option value="">所有年級</option>
                            {grades.map(g => <option key={g} value={g}>{g} 年級</option>)}
                        </select>
                    </div>
                    <div className="relative">
                        <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <select
                            value={classFilter}
                            onChange={(e) => setClassFilter(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-100 focus:border-blue-500 outline-none transition-all appearance-none bg-white"
                        >
                            <option value="">所有班級</option>
                            {classes.map(c => <option key={c} value={c}>{c} 班</option>)}
                        </select>
                    </div>
                </div>

                {/* Data Display */}
                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden min-h-[400px]">
                    {loading ? (
                        <div className="p-12 flex flex-col items-center justify-center h-full gap-4">
                            <Loader2 className="animate-spin text-blue-600" size={48} />
                            <p className="text-gray-500">載入資料中...</p>
                        </div>
                    ) : (
                        <>
                            {/* Desktop Table View */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-gray-50/50 border-b border-gray-100">
                                        <tr>
                                            <th className="p-6 w-16">
                                                <button onClick={toggleAll} className="text-gray-400 hover:text-blue-600 transition-colors">
                                                    {selectedIds.size === filteredSignatures.length && filteredSignatures.length > 0 ? <CheckSquare size={20} className="text-blue-600" /> : <Square size={20} />}
                                                </button>
                                            </th>
                                            <th className="p-6 font-bold text-gray-600">年級</th>
                                            <th className="p-6 font-bold text-gray-600">班級</th>
                                            <th className="p-6 font-bold text-gray-600">座號</th>
                                            <th className="p-6 font-bold text-gray-600">學生姓名</th>
                                            <th className="p-6 font-bold text-gray-600">家長姓名</th>
                                            <th className="p-6 font-bold text-gray-600">簽署時間</th>
                                            <th className="p-6 font-bold text-gray-600">簽名預覽</th>
                                            <th className="p-6 font-bold text-gray-600 text-right">操作</th>
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
                                                    className={`hover:bg-blue-50/30 transition-colors ${selectedIds.has(item.id) ? 'bg-blue-50/50' : ''}`}
                                                >
                                                    <td className="p-6">
                                                        <button onClick={() => toggleSelection(item.id)} className="text-gray-400 hover:text-blue-600 transition-colors">
                                                            {selectedIds.has(item.id) ? <CheckSquare size={20} className="text-blue-600" /> : <Square size={20} />}
                                                        </button>
                                                    </td>
                                                    <td className="p-6 font-medium text-gray-700">{item.grade}</td>
                                                    <td className="p-6 font-medium text-gray-700">{item.cls}</td>
                                                    <td className="p-6 font-medium text-gray-700">{item.seat}</td>
                                                    <td className="p-6 font-bold text-gray-800">{item.studentName}</td>
                                                    <td className="p-6 text-gray-600">{item.parentName}</td>
                                                    <td className="p-6 text-gray-500 text-sm">
                                                        {item.timestamp?.toDate().toLocaleString()}
                                                    </td>
                                                    <td className="p-6">
                                                        <div className="w-24 h-12 bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-blue-400 transition-colors group relative">
                                                            <img
                                                                src={item.signatureUrl}
                                                                alt="簽名"
                                                                className="w-full h-full object-contain"
                                                            />
                                                            <a
                                                                href={item.signatureUrl}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-bold"
                                                            >
                                                                查看
                                                            </a>
                                                        </div>
                                                    </td>
                                                    <td className="p-6 text-right">
                                                        <button
                                                            onClick={() => handleDelete(item.id)}
                                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                                                            title="刪除"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </td>
                                                </motion.tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={9} className="p-12 text-center text-gray-500">
                                                    沒有符合條件的資料
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Card View */}
                            <div className="md:hidden p-4 space-y-4">
                                {filteredSignatures.length > 0 ? (
                                    filteredSignatures.map((item) => (
                                        <motion.div
                                            key={item.id}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={`bg-white p-5 rounded-2xl shadow-sm border ${selectedIds.has(item.id) ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-100'}`}
                                            onClick={() => toggleSelection(item.id)}
                                        >
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${selectedIds.has(item.id) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                                        {item.seat}
                                                    </div>
                                                    <div>
                                                        <h3 className="text-lg font-bold text-gray-800">{item.studentName}</h3>
                                                        <p className="text-sm text-gray-500">{item.grade}年 {item.cls}班</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                                                >
                                                    <Trash2 size={20} />
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-4">
                                                <div>
                                                    <span className="block text-xs text-gray-400 mb-1">家長姓名</span>
                                                    {item.parentName}
                                                </div>
                                                <div>
                                                    <span className="block text-xs text-gray-400 mb-1">簽署時間</span>
                                                    {item.timestamp?.toDate().toLocaleDateString()}
                                                </div>
                                            </div>

                                            <div className="bg-gray-50 rounded-xl p-2 border border-gray-100">
                                                <img
                                                    src={item.signatureUrl}
                                                    alt="簽名"
                                                    className="h-16 w-full object-contain mix-blend-multiply"
                                                />
                                            </div>
                                        </motion.div>
                                    ))
                                ) : (
                                    <div className="text-center py-12 text-gray-500">
                                        沒有符合條件的資料
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

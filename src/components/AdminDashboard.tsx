import React, { useEffect, useState } from 'react';
import { db, auth } from '../firebase';
import { collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Download, LogOut, Search, Filter, Loader2, FileText } from 'lucide-react';
import { motion } from 'framer-motion';

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

    // Get unique grades and classes for filters
    const grades = Array.from(new Set(signatures.map(s => s.grade))).sort();
    const classes = Array.from(new Set(signatures.map(s => s.cls))).sort();

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                            <FileText className="text-blue-600" />
                            簽署管理後台
                        </h1>
                        <p className="text-gray-500 mt-1">共收到 {signatures.length} 份同意書</p>
                    </div>
                    <div className="flex gap-3 w-full md:w-auto">
                        <button
                            onClick={exportToExcel}
                            className="flex-1 md:flex-none bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-green-600/20 transition-all flex items-center justify-center gap-2"
                        >
                            <Download size={20} />
                            匯出 Excel
                        </button>
                        <button
                            onClick={handleLogout}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
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

                {/* Data Table */}
                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
                    {loading ? (
                        <div className="p-12 flex justify-center">
                            <Loader2 className="animate-spin text-blue-600" size={48} />
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="p-6 font-bold text-gray-600">年級</th>
                                        <th className="p-6 font-bold text-gray-600">班級</th>
                                        <th className="p-6 font-bold text-gray-600">座號</th>
                                        <th className="p-6 font-bold text-gray-600">學生姓名</th>
                                        <th className="p-6 font-bold text-gray-600">家長姓名</th>
                                        <th className="p-6 font-bold text-gray-600">簽署時間</th>
                                        <th className="p-6 font-bold text-gray-600">簽名預覽</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredSignatures.length > 0 ? (
                                        filteredSignatures.map((item) => (
                                            <motion.tr
                                                key={item.id}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                className="hover:bg-blue-50/50 transition-colors"
                                            >
                                                <td className="p-6 font-medium text-gray-700">{item.grade}</td>
                                                <td className="p-6 font-medium text-gray-700">{item.cls}</td>
                                                <td className="p-6 font-medium text-gray-700">{item.seat}</td>
                                                <td className="p-6 font-bold text-gray-800">{item.studentName}</td>
                                                <td className="p-6 text-gray-600">{item.parentName}</td>
                                                <td className="p-6 text-gray-500 text-sm">
                                                    {item.timestamp?.toDate().toLocaleString()}
                                                </td>
                                                <td className="p-6">
                                                    <a
                                                        href={item.signatureUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="block w-24 h-12 bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-blue-400 transition-colors"
                                                    >
                                                        <img
                                                            src={item.signatureUrl}
                                                            alt="簽名"
                                                            className="w-full h-full object-contain"
                                                        />
                                                    </a>
                                                </td>
                                            </motion.tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={7} className="p-12 text-center text-gray-500">
                                                沒有符合條件的資料
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;

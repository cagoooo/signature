import React, { useEffect, useState } from 'react';
import { db, auth } from '../firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { LogOut, Search, Users, FileSignature, Calendar, Filter, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

interface SignatureData {
    id: string;
    studentName: string;
    parentName: string;
    grade: string;
    cls: string;
    seat: string;
    signatureUrl: string;
    timestamp: any;
}

const Dashboard: React.FC = () => {
    const [signatures, setSignatures] = useState<SignatureData[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterClass, setFilterClass] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        const q = query(collection(db, "signatures"), orderBy("timestamp", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as SignatureData[];
            setSignatures(data);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleLogout = async () => {
        await signOut(auth);
        navigate('/admin/login');
    };

    const filteredSignatures = signatures.filter(sig => {
        const matchClass = filterClass ? sig.cls === filterClass : true;
        const matchSearch = searchTerm ?
            (sig.studentName.includes(searchTerm) || sig.grade.includes(searchTerm)) : true;
        return matchClass && matchSearch;
    });

    // Get unique classes for filter
    const uniqueClasses = Array.from(new Set(signatures.map(s => s.cls))).sort();

    // Stats
    const totalSignatures = signatures.length;
    const todaySignatures = signatures.filter(s => {
        if (!s.timestamp) return false;
        const date = s.timestamp.toDate();
        const today = new Date();
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
    }).length;

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            {/* Header */}
            <header className="bg-white shadow-sm sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-vibrant-blue/10 p-2 rounded-lg text-vibrant-blue">
                            <FileSignature size={24} />
                        </div>
                        <h1 className="text-xl font-bold text-gray-800">簽名管理後台</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <Link
                            to="/"
                            className="flex items-center gap-2 text-gray-500 hover:text-vibrant-blue transition-colors font-medium text-sm"
                        >
                            <Home size={18} />
                            回首頁
                        </Link>
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 text-gray-500 hover:text-red-500 transition-colors font-medium text-sm"
                        >
                            <LogOut size={18} />
                            登出
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
                        <div className="bg-blue-50 p-4 rounded-full text-blue-500">
                            <Users size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 font-bold">總簽署人數</p>
                            <p className="text-3xl font-heading font-bold text-gray-800">{totalSignatures}</p>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
                        <div className="bg-green-50 p-4 rounded-full text-green-500">
                            <Calendar size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 font-bold">今日新增</p>
                            <p className="text-3xl font-heading font-bold text-gray-800">{todaySignatures}</p>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                placeholder="搜尋姓名或年級..."
                                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="relative">
                            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <select
                                className="pl-10 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none appearance-none cursor-pointer"
                                value={filterClass}
                                onChange={(e) => setFilterClass(e.target.value)}
                            >
                                <option value="">所有班級</option>
                                {uniqueClasses.map(c => (
                                    <option key={c} value={c}>{c} 班</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="text-sm text-gray-500 font-medium">
                        共 {filteredSignatures.length} 筆資料
                    </div>
                </div>

                {/* Data Table */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="px-6 py-4 text-sm font-bold text-gray-500">年級</th>
                                    <th className="px-6 py-4 text-sm font-bold text-gray-500">班級</th>
                                    <th className="px-6 py-4 text-sm font-bold text-gray-500">座號</th>
                                    <th className="px-6 py-4 text-sm font-bold text-gray-500">學生姓名</th>
                                    <th className="px-6 py-4 text-sm font-bold text-gray-500">家長姓名</th>
                                    <th className="px-6 py-4 text-sm font-bold text-gray-500">簽名預覽</th>
                                    <th className="px-6 py-4 text-sm font-bold text-gray-500">時間</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                                            載入中...
                                        </td>
                                    </tr>
                                ) : filteredSignatures.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                                            沒有找到相關資料
                                        </td>
                                    </tr>
                                ) : (
                                    filteredSignatures.map((sig) => (
                                        <tr key={sig.id} className="hover:bg-blue-50/50 transition-colors group">
                                            <td className="px-6 py-4 text-gray-800 font-medium">{sig.grade}</td>
                                            <td className="px-6 py-4 text-gray-800 font-medium">{sig.cls}</td>
                                            <td className="px-6 py-4 text-gray-800 font-medium">{sig.seat}</td>
                                            <td className="px-6 py-4 text-gray-800 font-bold">{sig.studentName}</td>
                                            <td className="px-6 py-4 text-gray-600">{sig.parentName}</td>
                                            <td className="px-6 py-4 relative">
                                                <span className="text-blue-500 text-sm font-bold cursor-help border-b border-dashed border-blue-300">
                                                    查看簽名
                                                </span>
                                                {/* Hover Preview */}
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-white p-2 rounded-xl shadow-xl border border-gray-100 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                                                    <img src={sig.signatureUrl} alt="Signature" className="w-full h-auto rounded-lg bg-gray-50" />
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-400">
                                                {sig.timestamp?.toDate().toLocaleString()}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Dashboard;

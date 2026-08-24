import React, { useState } from 'react';
import { auth } from '../firebase';
import {
    EmailAuthProvider,
    GoogleAuthProvider,
    linkWithCredential,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    updatePassword,
} from 'firebase/auth';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, Mail, Loader2, AlertCircle, ArrowLeft, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { ADMIN_EMAIL, isAllowedAdminEmail } from '../authPolicy';

const AdminLogin: React.FC = () => {
    const [mode, setMode] = useState<'login' | 'setup'>('login');
    const [email, setEmail] = useState(ADMIN_EMAIL);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setMessage('');

        try {
            const normalizedEmail = email.trim().toLowerCase();
            if (!isAllowedAdminEmail(normalizedEmail)) {
                setError(`此後台僅開放 ${ADMIN_EMAIL} 登入`);
                return;
            }

            const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
            if (!isAllowedAdminEmail(credential.user.email)) {
                await signOut(auth);
                setError(`此後台僅開放 ${ADMIN_EMAIL} 登入`);
                return;
            }
            navigate('/admin/dashboard');
        } catch (err: unknown) {
            console.error("Login failed", err);
            const code = typeof err === 'object' && err !== null && 'code' in err
                ? String((err as { code?: unknown }).code)
                : '';
            if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
                setError('帳號或密碼錯誤');
            } else if (code === 'auth/too-many-requests') {
                setError('嘗試次數過多，請稍後再試');
            } else if (code === 'auth/user-disabled') {
                setError('此帳號已被停用，請聯絡管理者');
            } else {
                setError('登入失敗，請檢查網路或稍後再試');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSetupPassword = async () => {
        setError('');
        setMessage('');

        if (password.length < 12) {
            setError('為了保護後台，密碼至少需要 12 個字元');
            return;
        }
        if (password !== confirmPassword) {
            setError('兩次輸入的密碼不一致');
            return;
        }

        setLoading(true);
        try {
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({
                login_hint: ADMIN_EMAIL,
                prompt: 'select_account',
            });
            const result = await signInWithPopup(auth, provider);
            if (!isAllowedAdminEmail(result.user.email)) {
                await signOut(auth);
                setError(`此後台僅開放 ${ADMIN_EMAIL} 登入`);
                return;
            }

            const passwordProvider = result.user.providerData.some(
                ({ providerId }) => providerId === EmailAuthProvider.PROVIDER_ID,
            );
            if (passwordProvider) {
                await updatePassword(result.user, password);
            } else {
                await linkWithCredential(
                    result.user,
                    EmailAuthProvider.credential(ADMIN_EMAIL, password),
                );
            }

            await signOut(auth);
            setPassword('');
            setConfirmPassword('');
            setMode('login');
            setMessage('密碼已設定完成，現在可以使用 Email／密碼登入。');
        } catch (err: unknown) {
            console.error("Password setup failed", err);
            const code = typeof err === 'object' && err !== null && 'code' in err
                ? String((err as { code?: unknown }).code)
                : '';
            if (code === 'auth/popup-closed-by-user') {
                setError('Google 驗證視窗已關閉，尚未設定密碼');
            } else if (code === 'auth/popup-blocked') {
                setError('瀏覽器封鎖了登入視窗，請允許此網站開啟彈出視窗');
            } else if (code === 'auth/unauthorized-domain') {
                setError('目前網站網域尚未被 Firebase Auth 授權，請聯絡管理者');
            } else if (code === 'auth/weak-password') {
                setError('密碼強度不足，請改用更長的密碼');
            } else {
                setError('密碼設定失敗，請確認使用的是指定的學校 Google 帳號');
            }
        } finally {
            setLoading(false);
        }
    };

    const switchMode = (nextMode: 'login' | 'setup') => {
        setMode(nextMode);
        setError('');
        setMessage('');
        setPassword('');
        setConfirmPassword('');
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-vibrant-blue via-vibrant-purple to-vibrant-pink p-4 relative overflow-hidden">
            {/* Background Blobs */}
            <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-white/20 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-vibrant-yellow/20 rounded-full blur-3xl animate-pulse delay-1000"></div>

            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", duration: 0.6 }}
                className="bg-white/90 backdrop-blur-xl p-8 md:p-12 rounded-[2.5rem] shadow-2xl w-full max-w-md border border-white relative z-10"
            >
                {/* Return to Home Button */}
                <Link
                    to="/"
                    className="absolute top-6 left-6 text-gray-400 hover:text-blue-600 transition-colors p-2 rounded-full hover:bg-blue-50"
                    title="返回首頁"
                >
                    <ArrowLeft size={24} />
                </Link>

                <div className="text-center mb-10 mt-4">
                    <motion.div
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                        className="bg-gradient-to-tr from-blue-500 to-indigo-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/30 text-white transform rotate-3"
                    >
                        <ShieldCheck size={40} />
                    </motion.div>
                    <h2 className="text-3xl font-bold text-gray-800 tracking-tight">
                        {mode === 'login' ? '管理員登入' : '首次設定密碼'}
                    </h2>
                    <p className="text-gray-500 mt-2 font-medium">
                        {mode === 'login' ? '請使用指定的 Email／密碼登入' : '僅第一次需要用 Google 驗證本人'}
                    </p>
                </div>

                {error && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="bg-red-50 text-red-600 p-4 rounded-2xl mb-6 flex items-center gap-3 text-sm font-bold border border-red-100 shadow-sm"
                    >
                        <AlertCircle size={20} className="shrink-0" />
                        {error}
                    </motion.div>
                )}

                {message && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="bg-emerald-50 text-emerald-700 p-4 rounded-2xl mb-6 flex items-center gap-3 text-sm font-bold border border-emerald-100 shadow-sm"
                    >
                        <ShieldCheck size={20} className="shrink-0" />
                        {message}
                    </motion.div>
                )}

                {mode === 'login' ? <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="block text-gray-700 font-bold mb-2 ml-1 text-sm uppercase tracking-wider">Email</label>
                        <div className="relative group">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50/50 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-medium text-gray-700 placeholder-gray-400"
                                placeholder={ADMIN_EMAIL}
                                required
                            />
                        </div>
                        <p className="mt-2 ml-1 text-xs font-medium text-gray-500">
                            允許帳號：{ADMIN_EMAIL}
                        </p>
                    </div>

                    <div>
                        <label className="block text-gray-700 font-bold mb-2 ml-1 text-sm uppercase tracking-wider">密碼</label>
                        <div className="relative group">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50/50 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-medium text-gray-700 placeholder-gray-400"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    </div>

                    <motion.button
                        type="submit"
                        disabled={loading}
                        whileHover={{ scale: 1.02, translateY: -2 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-4 rounded-2xl shadow-xl shadow-blue-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-8"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : '登入系統'}
                    </motion.button>
                    <button
                        type="button"
                        onClick={() => switchMode('setup')}
                        className="w-full text-sm font-bold text-indigo-600 underline underline-offset-4 transition-colors hover:text-pink-600"
                    >
                        第一次使用？先設定 Email 密碼
                    </button>
                </form> : <div className="space-y-6">
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-sm leading-6 text-indigo-800">
                        請用 <strong>{ADMIN_EMAIL}</strong> 登入 Google 完成本人驗證；設定完成後，日常只使用 Email／密碼登入。
                    </div>

                    <div>
                        <label className="block text-gray-700 font-bold mb-2 ml-1 text-sm uppercase tracking-wider">設定新密碼</label>
                        <div className="relative group">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50/50 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-medium text-gray-700 placeholder-gray-400"
                                placeholder="至少 12 個字元"
                                minLength={12}
                                autoComplete="new-password"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-gray-700 font-bold mb-2 ml-1 text-sm uppercase tracking-wider">再次輸入密碼</label>
                        <div className="relative group">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50/50 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-medium text-gray-700 placeholder-gray-400"
                                placeholder="再次輸入相同密碼"
                                minLength={12}
                                autoComplete="new-password"
                                required
                            />
                        </div>
                    </div>

                    <motion.button
                        type="button"
                        onClick={() => void handleSetupPassword()}
                        disabled={loading}
                        whileHover={{ scale: 1.02, translateY: -2 }}
                        whileTap={{ scale: 0.98 }}
                        className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold py-4 rounded-2xl shadow-xl shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : '用 Google 驗證並設定密碼'}
                    </motion.button>

                    <button
                        type="button"
                        onClick={() => switchMode('login')}
                        className="w-full text-sm font-bold text-gray-500 underline underline-offset-4 transition-colors hover:text-indigo-600"
                    >
                        返回 Email／密碼登入
                    </button>
                </div>}
            </motion.div>
        </div>
    );
};

export default AdminLogin;

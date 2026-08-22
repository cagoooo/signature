import SignatureForm from './components/SignatureForm';
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';
import ProtectedRoute from './components/ProtectedRoute';
import { motion } from 'framer-motion';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { useEffect } from 'react';
import { flushSignatureFailureQueue } from './utils/notificationService';

const AUTHOR_PAGE_URL = 'https://www.smes.tyc.edu.tw/modules/school/index.php?department_id=2&zone_id=0&page_id=2&content_id=11&type=news&from_op=all_news#a5';

function Home() {
  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 font-sans relative overflow-hidden">
      {/* Vibrant Animated Background */}
      <div className="absolute inset-0 w-full h-full overflow-hidden -z-10">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-vibrant-purple/30 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob"></div>
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-vibrant-yellow/30 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-vibrant-pink/30 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-4000"></div>
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-vibrant-blue/30 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000"></div>
      </div>

      <div className="max-w-3xl mx-auto relative z-10">
        <motion.header
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, type: "spring" }}
          className="text-center mb-10"
        >
          <h1 className="text-5xl font-heading font-extrabold tracking-tight mb-3 bg-clip-text text-transparent bg-gradient-to-r from-vibrant-blue via-vibrant-purple to-vibrant-pink drop-shadow-sm">
            學生活動肖像使用授權同意書
          </h1>
          <p className="text-xl text-gray-600 font-medium">
            ✨ 家長線上簽名系統 ✨
          </p>
        </motion.header>

        <main>
          <SignatureForm />
        </main>

        <motion.footer
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="relative z-10 mt-16 mb-8 flex justify-center"
          aria-label="網站頁尾"
        >
          <div className="w-full max-w-3xl rounded-3xl bg-gradient-to-r from-vibrant-blue via-vibrant-purple to-vibrant-pink p-[2px] shadow-xl shadow-vibrant-purple/15 transition-shadow duration-300 hover:shadow-vibrant-purple/30">
            <div className="rounded-[calc(1.5rem-2px)] bg-white/90 px-5 py-5 backdrop-blur-xl sm:px-7">
              <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:justify-between sm:text-left">
                <div>
                  <p className="text-xs font-extrabold tracking-[0.18em] text-vibrant-purple">
                    桃園市龍潭區石門國民小學
                  </p>
                  <p className="mt-1 text-sm font-bold text-gray-700">
                    學生活動肖像使用授權同意書
                  </p>
                </div>

                <div className="h-px w-16 bg-gradient-to-r from-vibrant-blue/20 via-vibrant-purple/40 to-vibrant-pink/20 sm:h-12 sm:w-px" aria-hidden="true" />

                <div className="text-sm text-gray-600 sm:text-right">
                  <p className="font-bold text-gray-700">家長線上簽名系統</p>
                  <p className="mt-1 text-xs text-gray-500">簽署完成後可下載 PDF 留存</p>
                </div>
              </div>

              <div className="mt-5 flex flex-col items-center justify-between gap-3 border-t border-gray-200/80 pt-4 text-xs font-medium text-gray-500 sm:flex-row">
                <span>&copy; {currentYear} 石門國小</span>
                <span className="flex items-center gap-1.5">
                  Made with <span aria-label="愛心" className="text-base leading-none">❤️</span> by{' '}
                  <a
                    href={AUTHOR_PAGE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-extrabold text-vibrant-pink underline decoration-vibrant-pink/30 underline-offset-4 transition-colors hover:text-vibrant-purple hover:decoration-vibrant-purple"
                  >
                    阿凱老師
                  </a>
                </span>
              </div>
            </div>
          </div>
        </motion.footer>

        {/* Admin Shortcut */}
        <Link
          to="/admin/dashboard"
          className="fixed bottom-4 left-4 text-2xl opacity-20 hover:opacity-100 transition-opacity duration-300 cursor-pointer z-50 grayscale hover:grayscale-0"
          title="管理後台"
        >
          ⚙️
        </Link>
      </div>
    </div>
  );
}

function App() {
  useEffect(() => {
    void flushSignatureFailureQueue();
  }, []);

  return (
    <Router basename="/signature">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;

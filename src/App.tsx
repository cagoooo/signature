import SignatureForm from './components/SignatureForm';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import ProtectedRoute from './components/ProtectedRoute';
import { motion } from 'framer-motion';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';

function Home() {
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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          className="mt-12 text-center text-sm text-gray-500 font-medium"
        >
          &copy; {new Date().getFullYear()} 學校行政單位 | Designed with 🌈 & ❤️
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
  return (
    <Router basename="/signature">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin/login" element={<Login />} />
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;

import React, { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { db, storage } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { motion } from 'framer-motion';
import { CheckCircle, Loader2, Eraser, PenTool, AlertCircle, User, GraduationCap, Users, Hash, FileText, Mail } from 'lucide-react';
import confetti from 'canvas-confetti';
import { generateConsentPDF } from '../utils/pdfGenerator';
import { sendConsentEmail } from '../utils/emailService';

interface FormData {
    grade: string;
    cls: string;
    seat: string;
    studentName: string;
    parentName: string;
    email: string;
}

const SignatureForm: React.FC = () => {
    const sigCanvas = useRef<SignatureCanvas>(null);
    const [formData, setFormData] = useState<FormData>({
        grade: '',
        cls: '',
        seat: '',
        studentName: '',
        parentName: '',
        email: '',
    });
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [signatureUrl, setSignatureUrl] = useState<string | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        // 限制年級、班級、座號只能輸入數字
        if (['grade', 'cls', 'seat'].includes(name)) {
            if (value === '' || /^\d+$/.test(value)) {
                setFormData({ ...formData, [name]: value });
            }
        } else {
            setFormData({ ...formData, [name]: value });
        }
    };

    const clearCanvas = () => {
        sigCanvas.current?.clear();
    };

    const triggerConfetti = () => {
        const duration = 3 * 1000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

        const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

        const interval: any = setInterval(function () {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 50 * (timeLeft / duration);
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
        }, 250);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (sigCanvas.current?.isEmpty()) {
            alert('請先簽名！');
            return;
        }

        // 檢查簽名複雜度 (防止只點一點)
        const data: any = sigCanvas.current?.toData();
        if (!data || data.length === 0 || (data.length === 1 && data[0]?.points?.length < 5)) {
            alert('簽名過於簡單，請簽署全名。');
            return;
        }

        setLoading(true);

        try {
            // 優化圖片：繪製到固定大小的 Canvas
            const originalCanvas = sigCanvas.current?.getCanvas();
            if (!originalCanvas) return;

            const targetWidth = 600;
            const targetHeight = 300;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = targetWidth;
            tempCanvas.height = targetHeight;
            const ctx = tempCanvas.getContext('2d');

            if (ctx) {
                // 保持透明背景，或設為白色 (視需求而定，這裡保持透明)
                // ctx.fillStyle = '#ffffff';
                // ctx.fillRect(0, 0, targetWidth, targetHeight);

                // 將原始簽名縮放繪製到新 Canvas
                ctx.drawImage(originalCanvas, 0, 0, targetWidth, targetHeight);
            }

            const blob = await new Promise<Blob | null>(resolve => tempCanvas.toBlob(resolve, 'image/png'));
            if (!blob) throw new Error("無法產生圖片");

            const timestamp = Date.now();
            const fileName = `${formData.grade}_${formData.cls}_${formData.seat}_${formData.studentName}_${formData.parentName}_${timestamp}.png`;
            const storageRef = ref(storage, `signatures/${fileName}`);

            await uploadBytes(storageRef, blob, { contentType: 'image/png' });
            const downloadURL = await getDownloadURL(storageRef);
            setSignatureUrl(downloadURL);

            await addDoc(collection(db, "signatures"), {
                ...formData,
                signatureUrl: downloadURL,
                timestamp: serverTimestamp(),
                userAgent: navigator.userAgent
            });

            // Generate PDF Blob and Upload
            let pdfUrl = '';
            try {
                const pdfBlob = await generateConsentPDF({
                    ...formData,
                    signatureUrl: downloadURL,
                    timestamp: { toDate: () => new Date() }
                }, { returnBlob: true });

                if (pdfBlob && pdfBlob instanceof Blob) {
                    const pdfFileName = `${formData.grade}_${formData.cls}_${formData.seat}_${formData.studentName}_同意書_${timestamp}.pdf`;
                    const pdfStorageRef = ref(storage, `consents/${pdfFileName}`);
                    await uploadBytes(pdfStorageRef, pdfBlob, { contentType: 'application/pdf' });
                    pdfUrl = await getDownloadURL(pdfStorageRef);
                }
            } catch (pdfError) {
                console.error("Error generating/uploading PDF:", pdfError);
                // Continue even if PDF fails, so we at least send the email
            }

            // Send Email Notification
            if (formData.email) {
                await sendConsentEmail({
                    to_email: formData.email,
                    to_name: formData.parentName,
                    student_name: formData.studentName,
                    grade: formData.grade,
                    cls: formData.cls,
                    seat: formData.seat,
                    signature_url: downloadURL,
                    timestamp: new Date().toLocaleString(),
                    pdf_link: pdfUrl
                });
            }

            setSubmitted(true);
            triggerConfetti();
        } catch (error) {
            console.error("Error submitting form: ", error);
            alert("上傳失敗，請稍後再試。");
        } finally {
            setLoading(false);
        }
    };

    if (submitted) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center p-12 bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl text-center border-4 border-vibrant-green/20"
            >
                <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 200, damping: 10 }}
                    className="text-vibrant-green mb-6 bg-green-100 p-6 rounded-full"
                >
                    <CheckCircle size={80} />
                </motion.div>
                <h2 className="text-4xl font-heading font-bold text-gray-800 mb-4">簽署完成！🎉</h2>
                <p className="text-gray-600 text-xl mb-8 font-medium">
                    感謝您的配合，資料已成功送出。
                    {formData.email && <span className="block text-sm text-gray-500 mt-2">(副本已寄送至您的信箱)</span>}
                </p>

                <div className="flex flex-col gap-4 w-full max-w-xs mx-auto">
                    <motion.button
                        whileHover={{ scale: 1.05, boxShadow: "0px 10px 20px rgba(37, 99, 235, 0.4)" }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => generateConsentPDF({
                            ...formData,
                            signatureUrl: signatureUrl || '',
                            timestamp: { toDate: () => new Date() }
                        } as any)}
                        className="w-full py-4 px-6 bg-blue-600 text-white rounded-2xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                        <FileText size={24} />
                        下載同意書 PDF
                    </motion.button>

                    <motion.button
                        whileHover={{ scale: 1.05, boxShadow: "0px 10px 20px rgba(16, 185, 129, 0.4)" }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => window.location.reload()}
                        className="w-full py-4 px-6 bg-gradient-to-r from-vibrant-green to-emerald-500 text-white rounded-2xl font-bold text-lg shadow-lg transition-all"
                    >
                        返回首頁
                    </motion.button>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.form
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            onSubmit={handleSubmit}
            className="space-y-6 md:space-y-8 bg-white/80 backdrop-blur-xl p-5 md:p-10 rounded-[2rem] shadow-2xl border border-white/60 relative overflow-hidden"
        >
            {/* Top Gradient Border */}
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-vibrant-blue via-vibrant-purple to-vibrant-pink"></div>

            {/* Consent Box */}
            <div className="bg-gradient-to-r from-vibrant-yellow/10 to-orange-50 border-l-8 border-vibrant-yellow p-5 md:p-8 rounded-r-2xl shadow-sm">
                <div className="flex flex-col md:flex-row items-start gap-4 md:gap-5">
                    {/* Mobile Header: Icon + Title */}
                    <div className="flex items-center gap-3 md:hidden w-full border-b border-orange-100 pb-3 mb-2">
                        <div className="bg-vibrant-yellow/20 p-2 rounded-full shrink-0">
                            <AlertCircle className="text-vibrant-orange" size={24} />
                        </div>
                        <strong className="text-vibrant-orange text-xl font-heading">同意書內容</strong>
                    </div>

                    {/* Desktop Icon */}
                    <div className="hidden md:block bg-vibrant-yellow/20 p-3 rounded-full shrink-0 mt-1">
                        <AlertCircle className="text-vibrant-orange" size={32} />
                    </div>

                    {/* Text Content */}
                    <div className="text-base md:text-xl text-gray-800 leading-loose font-medium tracking-wide text-justify md:text-left">
                        <strong className="hidden md:block mb-3 text-vibrant-orange text-2xl md:text-3xl font-heading">同意書內容</strong>
                        本人同意 貴校於教育活動範圍內，拍攝、錄影及使用本人子女之肖像（包含照片及動態影像），並授權 貴校用於教育推廣、成果發表及校園網頁等非營利目的。
                    </div>
                </div>
            </div>

            {/* Student Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <InputField
                    label="年級" name="grade" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="1"
                    icon={<GraduationCap size={18} />} color="blue"
                    value={formData.grade}
                    onChange={handleChange}
                />
                <InputField
                    label="班級" name="cls" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="101"
                    icon={<Users size={18} />} color="blue"
                    value={formData.cls}
                    onChange={handleChange}
                />
                <InputField
                    label="座號" name="seat" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="5"
                    icon={<Hash size={18} />} color="blue"
                    value={formData.seat}
                    onChange={handleChange}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <InputField
                    label="學生姓名" name="studentName" type="text" placeholder="王小明"
                    icon={<User size={18} />} color="pink"
                    value={formData.studentName}
                    onChange={handleChange}
                />
                <InputField
                    label="家長姓名" name="parentName" type="text" placeholder="王大明"
                    icon={<User size={18} />} color="pink"
                    value={formData.parentName}
                    onChange={handleChange}
                />
            </div>

            {/* Email Field */}
            <InputField
                label="家長 Email (選填，寄送副本用)" name="email" type="email" placeholder="example@email.com"
                icon={<Mail size={18} />} color="orange"
                value={formData.email}
                onChange={handleChange}
            />

            {/* Signature Area */}
            <div className="space-y-4">
                <label className="flex items-center gap-3 text-gray-700 font-bold text-xl">
                    <div className="bg-vibrant-orange/10 p-2 rounded-lg text-vibrant-orange">
                        <PenTool size={24} />
                    </div>
                    請在此簽名
                </label>
                <div className="relative group">
                    <div className="border-4 border-dashed border-orange-200 rounded-3xl overflow-hidden bg-orange-50/30 group-hover:border-vibrant-orange group-hover:bg-orange-50/50 transition-all duration-300 touch-none shadow-inner relative">
                        {/* Background Pattern */}
                        <div className="absolute inset-0 bg-[radial-gradient(#fb923c_1px,transparent_1px)] [background-size:20px_20px] opacity-20 pointer-events-none"></div>

                        <SignatureCanvas
                            ref={sigCanvas}
                            canvasProps={{
                                className: "w-full h-64 cursor-crosshair relative z-10",
                            }}
                            backgroundColor="rgba(255,255,255,0)"
                        />
                    </div>
                    <motion.button
                        type="button"
                        whileHover={{ scale: 1.1, rotate: 10 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={clearCanvas}
                        className="absolute top-4 right-4 p-3 bg-white text-gray-400 rounded-full hover:bg-red-50 hover:text-red-500 transition-colors shadow-md border border-gray-100 z-20"
                        title="清除重簽"
                    >
                        <Eraser size={20} />
                    </motion.button>
                    <div className="absolute bottom-4 right-4 pointer-events-none text-xs font-bold text-orange-200 select-none tracking-widest uppercase z-0">
                        Signature Pad
                    </div>
                </div>
            </div>

            {/* Submit Button */}
            <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.02, translateY: -2 }}
                whileTap={{ scale: 0.98 }}
                className={`w-full py-5 px-6 rounded-2xl text-white font-bold text-xl shadow-xl transition-all flex items-center justify-center gap-3 ${loading
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-vibrant-blue via-vibrant-purple to-vibrant-pink hover:shadow-vibrant-purple/40'
                    }`}
            >
                {loading ? (
                    <>
                        <Loader2 className="animate-spin" />
                        處理中...
                    </>
                ) : (
                    '✨ 送出同意書 ✨'
                )}
            </motion.button>
        </motion.form>
    );
};

// Reusable Input Component with Colorful Styles
const InputField = ({ label, name, type, placeholder, icon, color, onChange, value, inputMode, pattern }: any) => {
    const colorClasses: any = {
        blue: "focus:ring-vibrant-blue focus:border-vibrant-blue text-vibrant-blue bg-blue-50/50 border-blue-100 placeholder-blue-200",
        pink: "focus:ring-vibrant-pink focus:border-vibrant-pink text-vibrant-pink bg-pink-50/50 border-pink-100 placeholder-pink-200",
        orange: "focus:ring-vibrant-orange focus:border-vibrant-orange text-vibrant-orange bg-orange-50/50 border-orange-100 placeholder-orange-200",
    };

    const iconColorClasses: any = {
        blue: "text-vibrant-blue bg-white shadow-sm",
        pink: "text-vibrant-pink bg-white shadow-sm",
        orange: "text-vibrant-orange bg-white shadow-sm",
    };

    const labelColorClasses: any = {
        blue: "text-blue-600",
        pink: "text-pink-600",
        orange: "text-orange-600",
    };

    return (
        <div className="group">
            <label className={`flex items-center gap-2 text-base font-bold mb-2 transition-colors ${labelColorClasses[color]}`}>
                {label}
            </label>
            <div className="relative">
                <div className={`absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-xl ${iconColorClasses[color]} transition-all group-focus-within:scale-110`}>
                    {icon}
                </div>
                <input
                    type={type}
                    name={name}
                    value={value}
                    inputMode={inputMode}
                    pattern={pattern}
                    required={name !== 'email'} // Email is optional
                    placeholder={placeholder}
                    className={`w-full pl-14 pr-4 py-4 border-2 rounded-2xl focus:ring-4 focus:ring-opacity-20 outline-none transition-all font-bold text-lg ${colorClasses[color]}`}
                    onChange={onChange}
                />
            </div>
        </div>
    );
};

export default SignatureForm;

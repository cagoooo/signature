import React, { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { db, storage } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { motion } from 'framer-motion';
import { CheckCircle, Loader2, Eraser, PenTool, AlertCircle, User, GraduationCap, Users, Hash, MapPin, School, Circle, Mail, Download } from 'lucide-react';
import confetti from 'canvas-confetti';
import { sendConsentEmail } from '../utils/emailService';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface FormData {
    city: string;
    school: string;
    grade: string;
    cls: string;
    seat: string;
    studentName: string;
    parentName: string;
    email: string;
}

const TAIWAN_CITIES = [
    "臺北市", "新北市", "基隆市", "桃園市", "新竹市", "新竹縣", "苗栗縣",
    "臺中市", "彰化縣", "南投縣", "雲林縣", "嘉義市", "嘉義縣", "臺南市",
    "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣"
];

const SignatureForm: React.FC = () => {
    const sigCanvas = useRef<SignatureCanvas>(null);
    const pdfRef = useRef<HTMLDivElement>(null); // Reference for the PDF template
    const [formData, setFormData] = useState<FormData>({
        city: '',
        school: '',
        grade: '',
        cls: '',
        seat: '',
        studentName: '',
        parentName: '',
        email: ''
    });
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [signatureImage, setSignatureImage] = useState<string | null>(null); // Store signature for PDF

    // Pen State
    const [penColor, setPenColor] = useState('black');
    const [penWidth, setPenWidth] = useState(2); // Default thickness

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
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

        setLoading(true);

        try {
            // 1. Get Signature Image
            const canvas = sigCanvas.current?.getCanvas();
            if (!canvas) return;
            const signatureDataUrl = canvas.toDataURL('image/png');
            setSignatureImage(signatureDataUrl); // Update state for PDF rendering

            // Wait a bit for the state to update and the hidden PDF component to re-render with the signature
            await new Promise(resolve => setTimeout(resolve, 500));

            // 2. Generate PDF
            if (!pdfRef.current) throw new Error("PDF Template not found");

            const pdfCanvas = await html2canvas(pdfRef.current, {
                scale: 2, // Higher scale for better quality
                useCORS: true,
                logging: false
            });

            const imgData = pdfCanvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (pdfCanvas.height * pdfWidth) / pdfCanvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            const pdfBlob = pdf.output('blob');

            // 3. Upload PDF to Firebase Storage
            const timestamp = Date.now();
            const pdfFileName = `${formData.city}_${formData.school}_${formData.studentName}_${timestamp}.pdf`;
            const storageRef = ref(storage, `consents/${pdfFileName}`);

            await uploadBytes(storageRef, pdfBlob, { contentType: 'application/pdf' });
            const pdfDownloadURL = await getDownloadURL(storageRef);
            setDownloadUrl(pdfDownloadURL);



            // Re-upload signature image for dashboard compatibility
            const sigBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
            if (sigBlob) {
                const sigFileName = `sig_${formData.city}_${formData.school}_${formData.studentName}_${timestamp}.png`;
                const sigRef = ref(storage, `signatures/${sigFileName}`);
                await uploadBytes(sigRef, sigBlob);
                const sigDownloadURL = await getDownloadURL(sigRef);

                // Update Firestore with both URLs
                await addDoc(collection(db, "signatures"), {
                    ...formData,
                    signatureUrl: sigDownloadURL,
                    pdfUrl: pdfDownloadURL,
                    timestamp: serverTimestamp(),
                    userAgent: navigator.userAgent
                });
            }

            // 5. Send Email with PDF Link
            // 5. Send Email with PDF Link
            if (formData.email) {
                await sendConsentEmail({
                    to_email: formData.email,
                    to_name: formData.parentName,
                    city: formData.city,
                    school: formData.school,
                    student_name: formData.studentName,
                    grade: formData.grade,
                    cls: formData.cls,
                    seat: formData.seat,
                    signature_url: pdfDownloadURL, // Use PDF URL here as requested
                    timestamp: new Date().toLocaleString('zh-TW'),
                    pdf_link: pdfDownloadURL
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
                <p className="text-gray-600 text-xl mb-8 font-medium">感謝您的配合，資料已成功送出。</p>

                <div className="flex flex-col gap-4 w-full max-w-xs">
                    {downloadUrl && (
                        <motion.a
                            href={downloadUrl}
                            target="_blank"
                            download={`consent_form_${formData.studentName}.pdf`}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="flex items-center justify-center gap-2 px-8 py-4 bg-vibrant-blue text-white rounded-full font-bold text-lg shadow-lg hover:bg-blue-600 transition-all"
                        >
                            <Download size={20} />
                            下載完整同意書 (PDF)
                        </motion.a>
                    )}

                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => window.location.reload()}
                        className="px-8 py-4 bg-gray-100 text-gray-600 rounded-full font-bold text-lg hover:bg-gray-200 transition-all"
                    >
                        返回首頁
                    </motion.button>
                </div>
            </motion.div>
        );
    }

    return (
        <>
            <motion.form
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                onSubmit={handleSubmit}
                className="space-y-8 bg-white/80 backdrop-blur-xl p-8 md:p-10 rounded-[2rem] shadow-2xl border border-white/60 relative overflow-hidden"
            >
                {/* Top Gradient Border */}
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-vibrant-blue via-vibrant-purple to-vibrant-pink"></div>

                {/* Consent Box */}
                <div className="bg-gradient-to-r from-vibrant-yellow/10 to-orange-50 border-l-8 border-vibrant-yellow p-6 rounded-r-2xl shadow-sm">
                    <div className="flex items-start gap-4">
                        <div className="bg-vibrant-yellow/20 p-2 rounded-full shrink-0">
                            <AlertCircle className="text-vibrant-orange" size={24} />
                        </div>
                        <div className="text-sm text-gray-700 leading-relaxed font-medium">
                            <strong className="block mb-2 text-vibrant-orange text-lg font-heading">同意書內容</strong>
                            本人同意 貴校於教育活動範圍內，拍攝、錄影及使用本人子女之肖像（包含照片及動態影像），並授權 貴校用於教育推廣、成果發表及校園網頁等非營利目的。
                        </div>
                    </div>
                </div>

                {/* School Info Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="group">
                        <label className="flex items-center gap-2 text-sm font-bold text-gray-600 mb-2 group-focus-within:text-gray-800 transition-colors">
                            縣市
                        </label>
                        <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-vibrant-teal bg-teal-50 transition-colors">
                                <MapPin size={18} />
                            </div>
                            <select
                                name="city"
                                required
                                value={formData.city}
                                onChange={handleChange}
                                className="w-full pl-12 pr-4 py-3.5 bg-gray-50/50 border-2 border-gray-100 rounded-2xl focus:ring-4 focus:ring-opacity-20 outline-none transition-all text-gray-700 font-bold focus:ring-vibrant-teal focus:border-vibrant-teal appearance-none cursor-pointer"
                            >
                                <option value="" disabled>請選擇縣市</option>
                                {TAIWAN_CITIES.map(city => (
                                    <option key={city} value={city}>{city}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <InputField
                        label="學校名稱" name="school" type="text" placeholder="例如：石門國小"
                        icon={<School size={18} />} color="teal"
                        onChange={handleChange}
                    />
                </div>

                {/* Student Info Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <InputField
                        label="年級" name="grade" type="number" placeholder="1"
                        icon={<GraduationCap size={18} />} color="blue"
                        onChange={handleChange}
                    />
                    <InputField
                        label="班級" name="cls" type="text" placeholder="2"
                        icon={<Users size={18} />} color="blue"
                        onChange={handleChange}
                    />
                    <InputField
                        label="座號" name="seat" type="number" placeholder="5"
                        icon={<Hash size={18} />} color="blue"
                        onChange={handleChange}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <InputField
                        label="學生姓名" name="studentName" type="text" placeholder="學生姓名"
                        icon={<User size={18} />} color="pink"
                        onChange={handleChange}
                    />
                    <InputField
                        label="家長姓名" name="parentName" type="text" placeholder="家長姓名"
                        icon={<User size={18} />} color="pink"
                        onChange={handleChange}
                    />
                </div>

                {/* Email Field */}
                <div className="grid grid-cols-1">
                    <InputField
                        label="電子郵件 (必填，用於接收備份)" name="email" type="email" placeholder="example@email.com"
                        icon={<Mail size={18} />} color="orange"
                        onChange={handleChange}
                    />
                </div>

                {/* Signature Area */}
                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <label className="flex items-center gap-3 text-gray-700 font-bold text-xl">
                            <div className="bg-vibrant-orange/10 p-2 rounded-lg text-vibrant-orange">
                                <PenTool size={24} />
                            </div>
                            請在此簽名
                        </label>

                        {/* Pen Controls */}
                        <div className="flex items-center gap-3 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
                            {/* Colors */}
                            <div className="flex gap-1 pr-3 border-r border-gray-200">
                                <button type="button" onClick={() => setPenColor('black')} className={`w-6 h-6 rounded-full bg-black transition-transform ${penColor === 'black' ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-110'}`} title="黑色" />
                                <button type="button" onClick={() => setPenColor('#2563eb')} className={`w-6 h-6 rounded-full bg-blue-600 transition-transform ${penColor === '#2563eb' ? 'scale-125 ring-2 ring-offset-1 ring-blue-400' : 'hover:scale-110'}`} title="藍色" />
                                <button type="button" onClick={() => setPenColor('#dc2626')} className={`w-6 h-6 rounded-full bg-red-600 transition-transform ${penColor === '#dc2626' ? 'scale-125 ring-2 ring-offset-1 ring-red-400' : 'hover:scale-110'}`} title="紅色" />
                            </div>

                            {/* Thickness */}
                            <div className="flex gap-1 items-center">
                                <button type="button" onClick={() => setPenWidth(1)} className={`p-1 rounded-lg transition-all ${penWidth === 1 ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'}`} title="細">
                                    <Circle size={8} fill="currentColor" />
                                </button>
                                <button type="button" onClick={() => setPenWidth(2.5)} className={`p-1 rounded-lg transition-all ${penWidth === 2.5 ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'}`} title="中">
                                    <Circle size={12} fill="currentColor" />
                                </button>
                                <button type="button" onClick={() => setPenWidth(5)} className={`p-1 rounded-lg transition-all ${penWidth === 5 ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'}`} title="粗">
                                    <Circle size={16} fill="currentColor" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="relative group">
                        <div className="border-4 border-dashed border-gray-200 rounded-3xl overflow-hidden bg-white group-hover:border-vibrant-orange/50 transition-all duration-300 touch-none shadow-inner">
                            <SignatureCanvas
                                ref={sigCanvas}
                                penColor={penColor}
                                minWidth={penWidth * 0.5}
                                maxWidth={penWidth * 1.5}
                                canvasProps={{
                                    className: "w-full h-64 cursor-crosshair",
                                }}
                                backgroundColor="rgba(255,255,255,0)"
                            />
                        </div>
                        <motion.button
                            type="button"
                            whileHover={{ scale: 1.1, rotate: 10 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={clearCanvas}
                            className="absolute top-4 right-4 p-3 bg-gray-100 text-gray-500 rounded-full hover:bg-red-50 hover:text-red-500 transition-colors shadow-md border border-gray-200"
                            title="清除重簽"
                        >
                            <Eraser size={20} />
                        </motion.button>
                        <div className="absolute bottom-4 right-4 pointer-events-none text-xs font-bold text-gray-200 select-none tracking-widest uppercase">
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

            {/* Hidden PDF Template */}
            <div style={{ position: 'absolute', top: -9999, left: -9999 }}>
                <div ref={pdfRef} style={{ width: '210mm', minHeight: '297mm', padding: '48px', backgroundColor: '#ffffff', color: '#111827', fontFamily: 'sans-serif', position: 'relative' }}>
                    {/* Header */}
                    <div style={{ textAlign: 'center', marginBottom: '40px', borderBottom: '2px solid #1f2937', paddingBottom: '24px' }}>
                        <h1 style={{ fontSize: '30px', fontWeight: 'bold', marginBottom: '8px', letterSpacing: '0.1em' }}>學生活動肖像使用授權同意書</h1>
                        <p style={{ fontSize: '18px', color: '#4b5563' }}>{formData.city} {formData.school}</p>
                    </div>

                    {/* Content */}
                    <div style={{ marginBottom: '40px', lineHeight: '1.6', fontSize: '18px' }}>
                        <p style={{ marginBottom: '24px' }}>
                            親愛的家長您好：
                        </p>
                        <p style={{ marginBottom: '24px' }}>
                            為記錄學生在校學習歷程與活動成果，本校將於教育活動範圍內，拍攝、錄影及使用 貴子弟之肖像（包含照片及動態影像）。
                        </p>
                        <p>
                            茲同意並授權 貴校將上述影像資料用於教育推廣、成果發表、校園網頁、平面刊物及非營利之教育目的使用。
                        </p>
                    </div>

                    {/* Student Info Table */}
                    <div style={{ marginBottom: '40px' }}>
                        <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px', borderLeft: '4px solid #1f2937', paddingLeft: '12px' }}>學生基本資料</h3>
                        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #9ca3af' }}>
                            <tbody>
                                <tr>
                                    <td style={{ border: '1px solid #9ca3af', padding: '16px', backgroundColor: '#f9fafb', fontWeight: 'bold', width: '128px' }}>就讀學校</td>
                                    <td style={{ border: '1px solid #9ca3af', padding: '16px' }} colSpan={3}>{formData.city} {formData.school}</td>
                                </tr>
                                <tr>
                                    <td style={{ border: '1px solid #9ca3af', padding: '16px', backgroundColor: '#f9fafb', fontWeight: 'bold', width: '128px' }}>學生姓名</td>
                                    <td style={{ border: '1px solid #9ca3af', padding: '16px' }}>{formData.studentName}</td>
                                    <td style={{ border: '1px solid #9ca3af', padding: '16px', backgroundColor: '#f9fafb', fontWeight: 'bold', width: '128px' }}>就讀班級</td>
                                    <td style={{ border: '1px solid #9ca3af', padding: '16px' }}>{formData.grade} 年 {formData.cls} 班</td>
                                </tr>
                                <tr>
                                    <td style={{ border: '1px solid #9ca3af', padding: '16px', backgroundColor: '#f9fafb', fontWeight: 'bold' }}>座號</td>
                                    <td style={{ border: '1px solid #9ca3af', padding: '16px' }}>{formData.seat}</td>
                                    <td style={{ border: '1px solid #9ca3af', padding: '16px', backgroundColor: '#f9fafb', fontWeight: 'bold' }}>家長姓名</td>
                                    <td style={{ border: '1px solid #9ca3af', padding: '16px' }}>{formData.parentName}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Signature Section */}
                    <div style={{ marginTop: '64px' }}>
                        <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px', borderLeft: '4px solid #1f2937', paddingLeft: '12px' }}>家長簽署</h3>
                        <div style={{ border: '1px solid #d1d5db', borderRadius: '8px', padding: '24px', height: '192px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb', position: 'relative' }}>
                            {signatureImage ? (
                                <img src={signatureImage} alt="家長簽名" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                            ) : (
                                <span style={{ color: '#9ca3af' }}>（簽名處）</span>
                            )}
                            <div style={{ position: 'absolute', bottom: '8px', right: '16px', fontSize: '14px', color: '#6b7280' }}>
                                簽署日期：{new Date().toLocaleDateString('zh-TW')}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div style={{ position: 'absolute', bottom: '40px', left: '0', width: '100%', textAlign: 'center', fontSize: '14px', color: '#9ca3af' }}>
                        本文件由線上簽名系統自動生成，具備同等法律效力。
                    </div>
                </div>
            </div>
        </>
    );
};

// Reusable Input Component with Colorful Styles
const InputField = ({ label, name, type, placeholder, icon, color, onChange }: any) => {
    const colorClasses: any = {
        blue: "focus:ring-vibrant-blue focus:border-vibrant-blue text-vibrant-blue",
        pink: "focus:ring-vibrant-pink focus:border-vibrant-pink text-vibrant-pink",
        orange: "focus:ring-vibrant-orange focus:border-vibrant-orange text-vibrant-orange",
        teal: "focus:ring-vibrant-teal focus:border-vibrant-teal text-vibrant-teal",
    };

    const iconColorClasses: any = {
        blue: "text-vibrant-blue bg-blue-50",
        pink: "text-vibrant-pink bg-pink-50",
        orange: "text-vibrant-orange bg-orange-50",
        teal: "text-vibrant-teal bg-teal-50",
    };

    return (
        <div className="group">
            <label className="flex items-center gap-2 text-sm font-bold text-gray-600 mb-2 group-focus-within:text-gray-800 transition-colors">
                {label}
            </label>
            <div className="relative">
                <div className={`absolute left-3 top-1/2 -translate-y-1/2 p-1.5 rounded-md ${iconColorClasses[color]} transition-colors`}>
                    {icon}
                </div>
                <input
                    type={type}
                    name={name}
                    required
                    placeholder={placeholder}
                    className={`w-full pl-12 pr-4 py-3.5 bg-gray-50/50 border-2 border-gray-100 rounded-2xl focus:ring-4 focus:ring-opacity-20 outline-none transition-all placeholder-gray-300 text-gray-700 font-bold ${colorClasses[color]}`}
                    onChange={onChange}
                />
            </div>
        </div>
    );
};

export default SignatureForm;

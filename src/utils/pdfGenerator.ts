import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface SignatureData {
    studentName: string;
    parentName: string;
    grade: string;
    cls: string;
    seat: string;
    signatureUrl: string;
    timestamp: any;
    isAgreed: boolean;
}

export const generateConsentPDF = async (data: SignatureData, options?: { returnBlob?: boolean }): Promise<Blob | void> => {
    // Create a temporary container for the PDF content
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '-9999px';
    container.style.left = '-9999px';
    container.style.width = '794px'; // A4 width in px at 96 DPI (approx)
    container.style.minHeight = '1123px'; // A4 height
    container.style.backgroundColor = '#ffffff';
    container.style.padding = '40px';
    container.style.fontFamily = '"Microsoft JhengHei", "Heiti TC", sans-serif'; // Try to use system Chinese fonts
    container.style.color = '#333';

    // Format date
    const date = data.timestamp?.toDate ? data.timestamp.toDate() : new Date();
    const dateStr = `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;

    container.innerHTML = `
        <div style="border: 2px solid #000; padding: 30px; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
                <h1 style="text-align: center; font-size: 28px; margin-bottom: 30px; font-weight: bold;">學生活動肖像使用授權同意書</h1>
                
                <div style="font-size: 16px; line-height: 1.8; margin-bottom: 30px;">
                    <p>親愛的家長您好：</p>
                    <p>為記錄學生在校期間之學習歷程與活動成果，本校將於教育活動中拍攝或錄製學生之肖像（包含照片及動態影像）。</p>
                    <p>茲為符合個人資料保護法及著作權法之規定，特此徵求您的同意，授權本校得將含有 貴子弟肖像之照片或影片，用於本校之教育推廣、成果發表、網站宣傳及非營利之教育目的使用。</p>
                    <p>本授權書僅限於上述目的使用，絕不挪作他用。</p>
                </div>

                <div style="margin-top: 20px; border: 2px solid #000; border-radius: 8px; background-color: ${data.isAgreed ? '#f0fdf4' : '#fef2f2'}; display: flex; justify-content: center; align-items: center; padding: 15px; min-height: 40px;">
                    <p style="font-size: 22px; font-weight: bold; margin: 0; color: ${data.isAgreed ? '#166534' : '#991b1b'}; letter-spacing: 2px;">
                        簽署意願：${data.isAgreed ? '【 我同意授權 】' : '【 我不同意授權 】'}
                    </p>
                </div>

                <div style="margin-top: 30px; border-top: 1px dashed #999; padding-top: 20px;">
                    <h2 style="font-size: 20px; margin-bottom: 20px; font-weight: bold;">學生資料</h2>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                        <tr>
                            <td style="padding: 10px; border-bottom: 1px solid #eee; width: 100px; font-weight: bold;">班級：</td>
                            <td style="padding: 10px; border-bottom: 1px solid #eee;">${data.grade} 年 ${data.cls} 班</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">座號：</td>
                            <td style="padding: 10px; border-bottom: 1px solid #eee;">${data.seat} 號</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">學生姓名：</td>
                            <td style="padding: 10px; border-bottom: 1px solid #eee; font-size: 18px;">${data.studentName}</td>
                        </tr>
                    </table>
                </div>
            </div>

            <div style="margin-top: 50px;">
                <h2 style="font-size: 20px; margin-bottom: 20px; font-weight: bold;">家長簽署</h2>
                <div style="display: flex; align-items: flex-end; justify-content: space-between;">
                    <div style="flex: 1;">
                        <p style="margin-bottom: 10px; font-weight: bold;">立同意書人 (家長/監護人)：</p>
                        <div style="border: 1px solid #ddd; border-radius: 10px; padding: 10px; display: inline-block;">
                            <img src="${data.signatureUrl}" style="height: 100px; max-width: 300px;" crossorigin="anonymous" />
                        </div>
                        <p style="margin-top: 10px; font-size: 18px;">${data.parentName}</p>
                    </div>
                    <div style="text-align: right;">
                        <p style="font-size: 16px;">中華民國 ${dateStr}</p>
                    </div>
                </div>
                <p style="margin-top: 30px; font-size: 12px; color: #666; text-align: center;">本文件由系統自動生成，具備數位簽署效力。</p>
            </div>
        </div>
    `;

    document.body.appendChild(container);

    try {
        // Wait for image to load
        await new Promise(resolve => setTimeout(resolve, 500));

        const canvas = await html2canvas(container, {
            scale: 2, // Higher scale for better quality
            useCORS: true, // Allow loading cross-origin images (Firebase Storage)
            logging: false
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const imgWidth = 210; // A4 width in mm

        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);

        if (options?.returnBlob) {
            return pdf.output('blob');
        } else {
            pdf.save(`${data.grade}${data.cls}_${data.seat}_${data.studentName}_同意書.pdf`);
        }

    } catch (error) {
        console.error('PDF Generation Error:', error);
        alert('PDF 生成失敗，請稍後再試。');
    } finally {
        document.body.removeChild(container);
    }
};

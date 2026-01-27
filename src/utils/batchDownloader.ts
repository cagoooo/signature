import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface SignatureData {
    id: string;
    studentName: string;
    parentName: string;
    grade: string;
    cls: string;
    seat: string;
    signatureUrl: string;
    pdfUrl?: string;
    timestamp: any;
    city?: string;
    school?: string;
}

export const downloadBatchSignatures = async (signatures: SignatureData[], className?: string) => {
    const zip = new JSZip();
    const folderName = className ? `Class_${className}_Signatures` : `All_Signatures`;
    const folder = zip.folder(folderName);

    if (!folder) {
        console.error("Failed to create ZIP folder");
        return;
    }

    // Create a map to track duplicate filenames
    const filenameMap = new Map<string, number>();

    const promises = signatures.map(async (sig) => {
        try {
            // Fetch the image
            const response = await fetch(sig.signatureUrl);
            const blob = await response.blob();

            // Generate filename: Grade_Class_Seat_StudentName.png
            let filename = `${sig.grade}_${sig.cls}_${sig.seat}_${sig.studentName}.png`;

            // Handle duplicates
            if (filenameMap.has(filename)) {
                const count = filenameMap.get(filename)! + 1;
                filenameMap.set(filename, count);
                filename = `${sig.grade}_${sig.cls}_${sig.seat}_${sig.studentName}_(${count}).png`;
            } else {
                filenameMap.set(filename, 0);
            }

            // Add to ZIP
            folder.file(filename, blob);
        } catch (error) {
            console.error(`Failed to download signature for ${sig.studentName}:`, error);
        }
    });

    await Promise.all(promises);

    // Generate ZIP file
    const content = await zip.generateAsync({ type: 'blob' });
    const dateStr = new Date().toISOString().split('T')[0];
    saveAs(content, `${folderName}_${dateStr}.zip`);
};

export const downloadBatchPDFs = async (signatures: SignatureData[], className?: string) => {
    const zip = new JSZip();
    const folderName = className ? `Class_${className}_PDFs` : `All_PDFs`;
    const folder = zip.folder(folderName);

    if (!folder) {
        console.error("Failed to create ZIP folder");
        return;
    }

    // Create a map to track duplicate filenames
    const filenameMap = new Map<string, number>();

    const promises = signatures.map(async (sig) => {
        if (!sig.pdfUrl) return;

        try {
            // Fetch the PDF
            const response = await fetch(sig.pdfUrl);
            const blob = await response.blob();

            // Generate filename: City_School_Grade_Class_Seat_StudentName.pdf
            const city = sig.city || 'Unknown';
            const school = sig.school || 'Unknown';
            let filename = `${city}_${school}_${sig.grade}年${sig.cls}班_${sig.seat}號_${sig.studentName}.pdf`;

            // Handle duplicates
            if (filenameMap.has(filename)) {
                const count = filenameMap.get(filename)! + 1;
                filenameMap.set(filename, count);
                filename = `${city}_${school}_${sig.grade}年${sig.cls}班_${sig.seat}號_${sig.studentName}_(${count}).pdf`;
            } else {
                filenameMap.set(filename, 0);
            }

            // Add to ZIP
            folder.file(filename, blob);
        } catch (error) {
            console.error(`Failed to download PDF for ${sig.studentName}:`, error);
        }
    });

    await Promise.all(promises);

    // Generate ZIP file
    const content = await zip.generateAsync({ type: 'blob' });
    const dateStr = new Date().toISOString().split('T')[0];
    saveAs(content, `${folderName}_${dateStr}.zip`);
};

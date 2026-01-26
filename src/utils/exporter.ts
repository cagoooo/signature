import * as XLSX from 'xlsx';

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

export const exportToExcel = (signatures: SignatureData[], fileName: string = 'signatures_export') => {
    // Format data for Excel
    const data = signatures.map(sig => ({
        '年級': sig.grade,
        '班級': sig.cls,
        '座號': sig.seat,
        '學生姓名': sig.studentName,
        '家長姓名': sig.parentName,
        '簽署時間': sig.timestamp?.toDate ? sig.timestamp.toDate().toLocaleString() : new Date().toLocaleString(),
        '簽名檔連結': sig.signatureUrl
    }));

    // Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(data);

    // Set column widths
    const wscols = [
        { wch: 10 }, // Grade
        { wch: 10 }, // Class
        { wch: 10 }, // Seat
        { wch: 15 }, // Student Name
        { wch: 15 }, // Parent Name
        { wch: 25 }, // Timestamp
        { wch: 50 }  // URL
    ];
    worksheet['!cols'] = wscols;

    // Create workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Signatures');

    // Generate Excel file
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `${fileName}_${dateStr}.xlsx`);
};

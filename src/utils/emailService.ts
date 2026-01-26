import emailjs from '@emailjs/browser';

// TODO: Replace with your actual EmailJS credentials
// Get these from https://dashboard.emailjs.com/
const SERVICE_ID = 'service_3hfwepf';
const TEMPLATE_ID = 'template_0jctoxk';
const PUBLIC_KEY = 'MIaTcBPK7lAoUj5Aj';

interface EmailData {
    to_email: string;
    to_name: string;
    student_name: string;
    grade: string;
    cls: string;
    seat: string;
    signature_url: string;
    timestamp: string;
    pdf_link?: string;
}

export const sendConsentEmail = async (data: EmailData) => {


    try {
        const response = await emailjs.send(
            SERVICE_ID,
            TEMPLATE_ID,
            {
                to_email: data.to_email,
                to_name: data.to_name,
                student_name: data.student_name,
                grade: data.grade,
                cls: data.cls,
                seat: data.seat,
                signature_url: data.signature_url,
                timestamp: data.timestamp,
                pdf_link: data.pdf_link,
                // Add any other template variables here
            },
            PUBLIC_KEY
        );
        return { status: 'success', response };
    } catch (error) {
        console.error('EmailJS Error:', error);
        return { status: 'error', error };
    }
};

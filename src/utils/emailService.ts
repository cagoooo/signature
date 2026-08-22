import emailjs from '@emailjs/browser';

// TODO: Replace with your actual EmailJS credentials
// Get these from https://dashboard.emailjs.com/
const SERVICE_ID = 'service_3hfwepf';
const TEMPLATE_ID = 'template_0jctoxk';
const PUBLIC_KEY = 'MIaTcBPK7lAoUj5Aj';

interface EmailData {
    to_email: string;
    to_name: string;
    city: string;
    school: string;
    student_name: string;
    grade: string;
    cls: string;
    seat: string;
    signature_url: string;
    timestamp: string;
    pdf_link?: string;
    is_agreed_text?: string;
}

export type ConsentEmailResult =
    | { status: 'success'; response: unknown }
    | { status: 'error'; error: unknown; message: string };

const describeEmailError = (error: unknown) => {
    if (typeof error === 'object' && error !== null) {
        const candidate = error as { status?: unknown; text?: unknown };
        const status = typeof candidate.status === 'number' ? `HTTP ${candidate.status}` : '';
        const text = typeof candidate.text === 'string' ? candidate.text.trim() : '';
        return [status, text].filter(Boolean).join(': ') || 'EmailJS 未提供錯誤訊息';
    }

    return String(error || 'EmailJS 未提供錯誤訊息');
};

export const sendConsentEmail = async (data: EmailData): Promise<ConsentEmailResult> => {


    try {
        const response = await emailjs.send(
            SERVICE_ID,
            TEMPLATE_ID,
            {
                to_email: data.to_email,
                to_name: data.to_name,
                city: data.city,
                school: data.school,
                student_name: data.student_name,
                grade: data.grade,
                cls: data.cls,
                seat: data.seat,
                signature_url: data.signature_url,
                timestamp: data.timestamp,
                pdf_link: data.pdf_link,
                is_agreed_text: data.is_agreed_text,
            },
            { publicKey: PUBLIC_KEY }
        );
        return { status: 'success', response };
    } catch (error) {
        const message = describeEmailError(error);
        console.error('EmailJS Error:', { message });
        return { status: 'error', error, message };
    }
};

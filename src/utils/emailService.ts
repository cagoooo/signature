import emailjs from '@emailjs/browser';

// EmailJS settings for the current account/service.
// Keep only public identifiers in the frontend; Gmail OAuth stays in EmailJS.
const SERVICE_ID = 'smes';
const TEMPLATE_ID = 'template_8xr6zqj';
const PUBLIC_KEY = 'lQDG7DY-hliwBDdX_';

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

const describeEmailError = (error: unknown): string => {
    const fallback = 'EmailJS 未提供錯誤訊息';
    const limit = (value: string) => value.trim().slice(0, 500);

    if (typeof error === 'string') return limit(error) || fallback;

    if (error instanceof Error) {
        const message = limit(error.message);
        const name = error.name && error.name !== 'Error' ? `${error.name}: ` : '';
        return `${name}${message}`.slice(0, 500) || fallback;
    }

    if (typeof error === 'object' && error !== null) {
        const candidate = error as { status?: unknown; text?: unknown; message?: unknown; name?: unknown };
        const status = typeof candidate.status === 'number' ? `HTTP ${candidate.status}` : '';
        const text = typeof candidate.text === 'string' ? limit(candidate.text) : '';
        const message = typeof candidate.message === 'string' ? limit(candidate.message) : '';
        const name = typeof candidate.name === 'string' ? limit(candidate.name) : '';
        return [status, text || message || name].filter(Boolean).join(': ').slice(0, 500) || fallback;
    }

    return String(error ?? fallback).slice(0, 500);
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

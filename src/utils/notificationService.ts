import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

type FailureStage =
    | 'prepare'
    | 'generate_pdf'
    | 'upload_pdf'
    | 'get_pdf_url'
    | 'upload_signature'
    | 'save_firestore'
    | 'send_email'
    | 'complete';

interface FailurePayload {
    stage: FailureStage;
    progress: number;
    message: string;
    context?: string;
    recordId?: string;
}

interface QueuedFailure extends FailurePayload {
    id: string;
    createdAt: string;
}

const QUEUE_KEY = 'signature-chat-failure-queue-v1';
const MAX_QUEUE_SIZE = 20;
let isFlushing = false;

const reportSignatureFailure = httpsCallable<FailurePayload, { ok: boolean }>(
    functions,
    'reportSignatureFailure',
);

const readQueue = (): QueuedFailure[] => {
    try {
        const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const saveQueue = (queue: QueuedFailure[]) => {
    try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_SIZE)));
    } catch {
        // 通知不應影響簽名流程；無法使用 localStorage 時仍會嘗試即時送出。
    }
};

const removeFromQueue = (id: string) => {
    saveQueue(readQueue().filter((item) => item.id !== id));
};

export const flushSignatureFailureQueue = async (): Promise<void> => {
    if (isFlushing) return;

    const queue = readQueue();
    if (!queue.length) return;

    isFlushing = true;
    try {
        for (const item of queue) {
            try {
                const result = await reportSignatureFailure({
                    stage: item.stage,
                    progress: item.progress,
                    message: item.message,
                    context: item.context,
                    recordId: item.recordId,
                });

                if (!result.data.ok) break;
                removeFromQueue(item.id);
            } catch {
                // Function 尚未部署或網路暫時失敗時保留，下一次載入再補送。
                break;
            }
        }
    } finally {
        isFlushing = false;
    }
};

export const notifySignatureFailure = (payload: FailurePayload): void => {
    const item: QueuedFailure = {
        ...payload,
        message: payload.message.slice(0, 500),
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
    };

    const queue = readQueue();
    queue.push(item);
    saveQueue(queue);
    void flushSignatureFailureQueue();
};

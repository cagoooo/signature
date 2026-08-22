import { useCallback, useEffect, useRef, useState } from 'react';

type NoticeKind = 'update' | 'chunk-recovery';

type UpdateNotice = {
    kind: NoticeKind;
    version?: string | null;
};

type VersionPayload = {
    version?: unknown;
};

const CHUNK_ERROR_PATTERN = /Loading chunk|Failed to fetch dynamically imported module|ChunkLoadError|Importing a module script failed/i;
const CHUNK_RECOVERY_KEY = 'signature-chunk-recovery-attempted';
const APP_BUILD_VERSION = __SIGNATURE_BUILD_VERSION__;

function isNewerBuildVersion(serverVersion: string, currentVersion: string | null): boolean {
    if (!currentVersion || serverVersion === currentVersion) return false;

    const serverTimestamp = serverVersion.match(/^\d{14}/)?.[0];
    const currentTimestamp = currentVersion.match(/^\d{14}/)?.[0];
    if (serverTimestamp && currentTimestamp) return serverTimestamp > currentTimestamp;

    return serverVersion > currentVersion;
}

function toErrorMessage(value: unknown): string {
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value);
    } catch {
        return '';
    }
}

function isChunkError(message: string): boolean {
    return CHUNK_ERROR_PATTERN.test(message);
}

export default function ServiceWorkerUpdatePrompt() {
    const [notice, setNotice] = useState<UpdateNotice | null>(null);
    const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
    const waitingWorkerRef = useRef<ServiceWorker | null>(null);
    const currentVersionRef = useRef<string | null>(APP_BUILD_VERSION);
    const pendingVersionRef = useRef<string | null>(null);
    const announcedVersionRef = useRef<string | null>(null);
    const reloadingRef = useRef(false);

    const showUpdateNotice = useCallback((version?: string | null, worker?: ServiceWorker | null) => {
        const nextVersion = version ?? pendingVersionRef.current ?? null;
        if (worker) waitingWorkerRef.current = worker;
        if (nextVersion && announcedVersionRef.current === nextVersion) return;
        announcedVersionRef.current = nextVersion || 'pending-update';
        setNotice({ kind: 'update', version: nextVersion });
    }, []);

    const recoverFromChunkError = useCallback(() => {
        try {
            if (sessionStorage.getItem(CHUNK_RECOVERY_KEY) === '1') return;
            sessionStorage.setItem(CHUNK_RECOVERY_KEY, '1');
        } catch {
            // 無法使用 sessionStorage 時仍繼續一次性自癒。
        }

        setNotice({ kind: 'chunk-recovery' });
        void (async () => {
            try {
                if ('serviceWorker' in navigator) {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(registrations.map((registration) => registration.unregister()));
                }
                if ('caches' in window) {
                    const cacheKeys = await caches.keys();
                    await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
                }
            } catch (error) {
                console.warn('[SW] chunk 自癒清理失敗，仍會重新載入頁面', error);
            } finally {
                window.setTimeout(() => window.location.reload(), 1200);
            }
        })();
    }, []);

    const checkVersion = useCallback(async () => {
        if (!import.meta.env.PROD) return;

        const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
        const versionUrl = new URL('version.json', baseUrl);
        versionUrl.searchParams.set('check', String(Date.now()));

        try {
            const response = await fetch(versionUrl, { cache: 'no-store' });
            if (!response.ok) return;
            const payload = await response.json() as VersionPayload;
            const serverVersion = typeof payload.version === 'string' ? payload.version : null;
            if (!serverVersion) return;

            const registration = registrationRef.current;
            if (registration) await registration.update().catch(() => undefined);

            if (!isNewerBuildVersion(serverVersion, currentVersionRef.current)) return;
            pendingVersionRef.current = serverVersion;

            if (registration) {
                if (registration.waiting) {
                    showUpdateNotice(serverVersion, registration.waiting);
                }
            }
        } catch {
            // 離線或 GitHub Pages CDN 暫時不可用時，交由 SW lifecycle 事件繼續偵測。
        }
    }, [showUpdateNotice]);

    useEffect(() => {
        if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return undefined;

        let disposed = false;
        const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
        const swUrl = new URL('sw.js', baseUrl).toString();
        const scope = baseUrl.pathname;

        const watchInstallingWorker = (worker: ServiceWorker) => {
            worker.addEventListener('statechange', () => {
                if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                    showUpdateNotice(pendingVersionRef.current, worker);
                }
            });
        };

        const setupRegistration = async () => {
            try {
                const registration = await navigator.serviceWorker.register(swUrl, {
                    scope,
                    updateViaCache: 'none',
                });
                if (disposed) return;
                registrationRef.current = registration;

                // 新版可能在頁面重新整理前就已進入 waiting，不能只等 updatefound。
                if (registration.waiting && navigator.serviceWorker.controller) {
                    waitingWorkerRef.current = registration.waiting;
                    showUpdateNotice(pendingVersionRef.current, registration.waiting);
                }

                if (registration.installing) watchInstallingWorker(registration.installing);
                registration.addEventListener('updatefound', () => {
                    if (registration.installing) watchInstallingWorker(registration.installing);
                });

                navigator.serviceWorker.addEventListener('message', (event: MessageEvent<{ type?: string; version?: unknown }>) => {
                    if (event.data?.type === 'SW_ACTIVATED' && typeof event.data.version === 'string') {
                        currentVersionRef.current = event.data.version;
                    }
                });

                await checkVersion();
            } catch (error) {
                console.warn('[SW] 註冊失敗（本機開發或瀏覽器不支援時可忽略）', error);
            }
        };

        void setupRegistration();
        const intervalId = window.setInterval(() => { void checkVersion(); }, 3 * 60 * 1000);
        const handleFocus = () => { void checkVersion(); };
        const handleOnline = () => { void checkVersion(); };
        const handlePageShow = () => { void checkVersion(); };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') void checkVersion();
        };

        window.addEventListener('focus', handleFocus);
        window.addEventListener('online', handleOnline);
        window.addEventListener('pageshow', handlePageShow);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        const firstCheckId = window.setTimeout(() => { void checkVersion(); }, 5000);

        return () => {
            disposed = true;
            window.clearInterval(intervalId);
            window.clearTimeout(firstCheckId);
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('pageshow', handlePageShow);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [checkVersion, showUpdateNotice]);

    useEffect(() => {
        if (!import.meta.env.PROD) return undefined;

        const handleWindowError = (event: ErrorEvent) => {
            const target = event.target;
            let targetUrl = '';
            if (target instanceof HTMLScriptElement) targetUrl = target.src;
            if (target instanceof HTMLLinkElement) targetUrl = target.href;
            const message = `${event.message} ${targetUrl}`;
            if (isChunkError(message)) recoverFromChunkError();
        };

        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            if (isChunkError(toErrorMessage(event.reason))) recoverFromChunkError();
        };

        window.addEventListener('error', handleWindowError, true);
        window.addEventListener('unhandledrejection', handleUnhandledRejection);
        return () => {
            window.removeEventListener('error', handleWindowError, true);
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        };
    }, [recoverFromChunkError]);

    const applyUpdate = () => {
        if (reloadingRef.current) return;
        reloadingRef.current = true;
        setNotice(null);

        const waitingWorker = waitingWorkerRef.current ?? registrationRef.current?.waiting;
        if (!waitingWorker) {
            window.location.reload();
            return;
        }

        let reloaded = false;
        const reloadOnce = () => {
            if (reloaded) return;
            reloaded = true;
            navigator.serviceWorker.removeEventListener('controllerchange', reloadOnce);
            window.location.reload();
        };

        navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
        window.setTimeout(reloadOnce, 5000);
    };

    if (!notice) return null;

    const isChunkRecovery = notice.kind === 'chunk-recovery';
    return (
        <div
            role="alert"
            aria-live="assertive"
            className="fixed bottom-4 left-1/2 z-[100] flex w-[min(420px,calc(100vw-28px))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/15 bg-slate-900 px-4 py-3.5 text-white shadow-2xl shadow-slate-900/30"
        >
            <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold">
                    {isChunkRecovery ? '正在同步最新版本…' : '✨ 系統已更新'}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-white/70">
                    {isChunkRecovery
                        ? '偵測到資源版本不一致，系統將自動重新載入。'
                        : '請重新整理，避免使用舊版畫面或舊資料流程。'}
                </p>
            </div>
            {!isChunkRecovery && (
                <button
                    type="button"
                    onClick={applyUpdate}
                    className="shrink-0 rounded-xl bg-white px-3.5 py-2 text-sm font-extrabold text-blue-700 transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-white/80"
                >
                    立刻更新
                </button>
            )}
            {!isChunkRecovery && (
                <button
                    type="button"
                    onClick={() => setNotice(null)}
                    aria-label="稍後再說"
                    className="shrink-0 rounded-lg px-1.5 py-1 text-xl leading-none text-white/70 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/80"
                >
                    ×
                </button>
            )}
        </div>
    );
}

// src/components/SystemNoticeBar.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getSystemNotice } from '../lib/api';

type Severity = 'urgent' | 'warning' | 'info';

type SystemNotice = {
    enabled: boolean;
    severity?: Severity;
    title?: string;
    message?: string;
    updatedAt?: string; // nga mongoose timestamps
    _id?: string;
};

function hashNotice(n: SystemNotice) {
    // Identifikim i qëndrueshëm për "dismiss" (kur admini e ndryshon, hash ndryshon)
    const key = [
        n._id ?? '',
        n.enabled ? '1' : '0',
        n.severity ?? '',
        n.title ?? '',
        n.message ?? '',
        n.updatedAt ?? '',
    ].join('|');
    // hash i thjeshtë
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return String(h);
}

const LS_KEY = 'system_notice_dismissed_v1';

export default function SystemNoticeBar({
    pollMs = 30000, // 30s
}: {
    pollMs?: number;
}) {
    const [notice, setNotice] = useState<SystemNotice | null>(null);
    const [loading, setLoading] = useState(true);
    const [hidden, setHidden] = useState(false);
    const timerRef = useRef<number | null>(null);

    const noticeId = useMemo(() => (notice ? hashNotice(notice) : null), [notice]);

    const dismissed = useMemo(() => {
        if (!noticeId) return false;
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return false;
            const arr = JSON.parse(raw) as string[];
            return Array.isArray(arr) ? arr.includes(noticeId) : false;
        } catch {
            return false;
        }
    }, [noticeId]);

    async function load() {
        try {
            const data = (await getSystemNotice()) as SystemNotice;
            setNotice(data ?? { enabled: false });
        } catch {
            // nëse dështon, mos e prishe UI-n
            setNotice({ enabled: false });
        } finally {
            setLoading(false);
        }
    }

    function dismiss() {
        if (!noticeId) return;
        try {
            const raw = localStorage.getItem(LS_KEY);
            const arr = raw ? (JSON.parse(raw) as string[]) : [];
            const next = Array.isArray(arr) ? Array.from(new Set([...arr, noticeId])) : [noticeId];
            localStorage.setItem(LS_KEY, JSON.stringify(next));
        } catch {
            // ignore
        }
        setHidden(true);
    }

    useEffect(() => {
        load();

        // poll
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = window.setInterval(() => {
            load();
        }, pollMs);

        return () => {
            if (timerRef.current) window.clearInterval(timerRef.current);
            timerRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pollMs]);

    // kur admini e ndryshon notice-in, lejo ta shfaq prap (reset hidden)
    useEffect(() => {
        setHidden(false);
    }, [noticeId]);

    if (loading) return null;
    if (!notice) return null;
    if (!notice.enabled) return null;
    if (dismissed || hidden) return null;

    const severity: Severity = notice.severity ?? 'info';
    const title = notice.title?.trim() || '';
    const message = notice.message?.trim() || '';

    const styles =
        severity === 'urgent'
            ? 'border-red-300 bg-red-50 text-red-900'
            : severity === 'warning'
                ? 'border-amber-300 bg-amber-50 text-amber-950'
                : 'border-blue-300 bg-blue-50 text-blue-950';

    return (
        <div className="w-full">
            <div className={['rounded-xl border px-4 py-3 shadow-sm flex items-start gap-3', styles].join(' ')}>
                <div className="min-w-0 flex-1">
                    {title ? (
                        <div className="font-extrabold uppercase tracking-wide text-sm">{title}</div>
                    ) : (
                        <div className="font-extrabold uppercase tracking-wide text-sm">NJOFTIM</div>
                    )}
                    {message && <div className="mt-1 text-sm leading-relaxed break-words">{message}</div>}
                </div>

                <button
                    type="button"
                    onClick={dismiss}
                    className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold hover:bg-black/5"
                    aria-label="Mbylle njoftimin"
                    title="Mbylle"
                >
                    ✕
                </button>
            </div>
        </div>
    );
}
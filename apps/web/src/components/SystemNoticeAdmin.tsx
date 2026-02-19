// src/components/SystemNoticeAdmin.tsx
import React, { useEffect, useState } from 'react';
import { getSystemNotice, updateSystemNotice, getRole } from '../lib/api';

type Severity = 'urgent' | 'warning' | 'info';

type SystemNotice = {
    enabled: boolean;
    severity: Severity;
    title: string;
    message: string;
    updatedAt?: string;
};

const defaultNotice: SystemNotice = {
    enabled: false,
    severity: 'info',
    title: '',
    message: '',
};

export default function SystemNoticeAdmin() {
    const role = getRole();
    const isAdmin = role === 'ADMIN';

    const [notice, setNotice] = useState<SystemNotice>(defaultNotice);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [ok, setOk] = useState<string | null>(null);

    async function load() {
        setErr(null);
        setOk(null);
        setLoading(true);
        try {
            const data = (await getSystemNotice()) as Partial<SystemNotice>;
            setNotice({
                enabled: !!data.enabled,
                severity: (data.severity as Severity) ?? 'info',
                title: data.title ?? '',
                message: data.message ?? '',
                updatedAt: data.updatedAt,
            });
        } catch (e: any) {
            setErr(e?.response?.data?.message || e?.message || 'Nuk u lexua system notice.');
        } finally {
            setLoading(false);
        }
    }

    async function save() {
        setErr(null);
        setOk(null);
        setSaving(true);
        try {
            const saved = await updateSystemNotice({
                enabled: notice.enabled,
                severity: notice.severity,
                title: notice.title,
                message: notice.message,
            });
            setOk('U ruajt me sukses ✅');
            // rifresko me vlerat që kthen backend
            const data = saved as Partial<SystemNotice>;
            setNotice((prev) => ({
                ...prev,
                enabled: !!data.enabled,
                severity: (data.severity as Severity) ?? prev.severity,
                title: data.title ?? prev.title,
                message: data.message ?? prev.message,
                updatedAt: data.updatedAt,
            }));
            setTimeout(() => setOk(null), 2500);
        } catch (e: any) {
            setErr(e?.response?.data?.message || e?.message || 'S’u ruajt system notice.');
        } finally {
            setSaving(false);
        }
    }

    useEffect(() => {
        if (!isAdmin) return;
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin]);

    if (!isAdmin) {
        return (
            <div className="p-4 rounded-xl border border-gray-200 bg-white">
                <div className="text-sm font-semibold text-gray-900">Nuk ke qasje.</div>
                <div className="text-sm text-gray-600 mt-1">Ky panel është vetëm për ADMIN.</div>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="p-4 border-b bg-gray-50/60 rounded-t-2xl">
                <div className="text-base font-semibold text-gray-900">System Notice (Admin)</div>
                <div className="text-sm text-gray-600 mt-1">
                    Këtu e menaxhon banner-in që shfaqet në krye të sistemit.
                </div>
            </div>

            <div className="p-4 space-y-4">
                {loading ? (
                    <div className="text-sm text-gray-600">Duke u ngarkuar…</div>
                ) : (
                    <>
                        {err && (
                            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {err}
                            </div>
                        )}
                        {ok && (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                                {ok}
                            </div>
                        )}

                        {/* Enabled toggle */}
                        <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3">
                            <div>
                                <div className="text-sm font-semibold text-gray-900">Aktivizo banner-in</div>
                                <div className="text-xs text-gray-500">Nëse është OFF, nuk shfaqet askund.</div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setNotice((n) => ({ ...n, enabled: !n.enabled }))}
                                className={[
                                    'h-10 w-20 rounded-full border transition relative',
                                    notice.enabled ? 'bg-emerald-500 border-emerald-500' : 'bg-gray-200 border-gray-300',
                                ].join(' ')}
                                aria-label="Toggle enabled"
                            >
                                <span
                                    className={[
                                        'absolute top-1 h-8 w-8 rounded-full bg-white shadow transition',
                                        notice.enabled ? 'left-11' : 'left-1',
                                    ].join(' ')}
                                />
                            </button>
                        </label>

                        {/* Severity */}
                        <div className="grid gap-2">
                            <div className="text-sm font-semibold text-gray-900">Severity</div>
                            <select
                                value={notice.severity}
                                onChange={(e) => setNotice((n) => ({ ...n, severity: e.target.value as Severity }))}
                                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                            >
                                <option value="urgent">urgent (e kuqe)</option>
                                <option value="warning">warning (e verdhë)</option>
                                <option value="info">info (blu / neutrale)</option>
                            </select>
                        </div>

                        {/* Title */}
                        <div className="grid gap-2">
                            <div className="text-sm font-semibold text-gray-900">Titulli</div>
                            <input
                                value={notice.title}
                                onChange={(e) => setNotice((n) => ({ ...n, title: e.target.value }))}
                                placeholder="p.sh. 🚨 Njoftim urgjent"
                                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                            />
                        </div>

                        {/* Message */}
                        <div className="grid gap-2">
                            <div className="text-sm font-semibold text-gray-900">Mesazhi</div>
                            <textarea
                                value={notice.message}
                                onChange={(e) => setNotice((n) => ({ ...n, message: e.target.value }))}
                                placeholder="Shkruaj mesazhin…"
                                rows={5}
                                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={save}
                                disabled={saving}
                                className={[
                                    'px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition',
                                    saving ? 'bg-gray-200 text-gray-500' : 'bg-[#2F3E2E] text-white hover:opacity-95',
                                ].join(' ')}
                            >
                                {saving ? 'Duke ruajtur…' : 'Ruaj'}
                            </button>

                            <button
                                type="button"
                                onClick={load}
                                disabled={saving}
                                className="px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 hover:bg-gray-50"
                            >
                                Rifresko
                            </button>

                            {notice.updatedAt && (
                                <div className="ml-auto text-xs text-gray-500">
                                    Updated: {new Date(notice.updatedAt).toLocaleString()}
                                </div>
                            )}
                        </div>

                        {/* Small preview */}
                        <div className="pt-2">
                            <div className="text-xs font-semibold text-gray-500 mb-2">Preview</div>
                            <div
                                className={[
                                    'rounded-xl border px-4 py-3 text-sm shadow-sm',
                                    notice.severity === 'urgent'
                                        ? 'border-red-300 bg-red-50 text-red-800'
                                        : notice.severity === 'warning'
                                            ? 'border-amber-300 bg-amber-50 text-amber-900'
                                            : 'border-blue-300 bg-blue-50 text-blue-900',
                                ].join(' ')}
                            >
                                <div className="font-extrabold uppercase tracking-wide">{notice.title || '—'}</div>
                                <div className="mt-1">{notice.message || '—'}</div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
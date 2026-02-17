// src/pages/PeoplePending.tsx

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
    listPendingPeople,
    approvePerson,
    rejectPerson,
    getPerson,
    type PersonListItem,
    type PersonDetail,
} from '../lib/api';

function initials(first?: string, last?: string) {
    const a = (first ?? '').trim().slice(0, 1).toUpperCase();
    const b = (last ?? '').trim().slice(0, 1).toUpperCase();
    return (a + b).trim() || 'U';
}

function formatDate(v: any) {
    if (!v) return '';
    const s = String(v);
    // nëse vjen ISO, shfaq vetëm YYYY-MM-DD
    if (s.length >= 10) return s.slice(0, 10);
    return s;
}

function statusPill(text: string) {
    const t = (text ?? '').toUpperCase();
    if (t === 'PENDING')
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-900 ring-1 ring-amber-200">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                PENDING
            </span>
        );
    if (t === 'ACTIVE')
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                ACTIVE
            </span>
        );
    if (t === 'REJECTED')
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-900 ring-1 ring-rose-200">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
                REJECTED
            </span>
        );
    return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 ring-1 ring-gray-200">
            {t || '—'}
        </span>
    );
}

function IconRefresh(props: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" className={props.className ?? 'h-4 w-4'} aria-hidden="true">
            <path
                d="M20 12a8 8 0 10-2.34 5.66"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
            <path
                d="M20 8v4h-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function IconEye(props: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" className={props.className ?? 'h-4 w-4'} aria-hidden="true">
            <path
                d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"
                stroke="currentColor"
                strokeWidth="2"
            />
            <path
                d="M12 15a3 3 0 100-6 3 3 0 000 6z"
                stroke="currentColor"
                strokeWidth="2"
            />
        </svg>
    );
}

function IconCheck(props: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" className={props.className ?? 'h-4 w-4'} aria-hidden="true">
            <path
                d="M20 6L9 17l-5-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function IconX(props: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" className={props.className ?? 'h-4 w-4'} aria-hidden="true">
            <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}

export default function PeoplePendingPage() {
    const [items, setItems] = useState<PersonListItem[]>([]);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [loading, setLoading] = useState(false);

    // ✅ Search + filter
    const [query, setQuery] = useState('');
    const [cityFilter, setCityFilter] = useState('');

    // ✅ Modal "Shiko"
    const [open, setOpen] = useState(false);
    const [detail, setDetail] = useState<PersonDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);

    // ✅ Confirm modal (modern) për Refuzim
    const [rejectOpen, setRejectOpen] = useState(false);
    const [rejectId, setRejectId] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [actionBusy, setActionBusy] = useState(false);

    // ✅ Base URL i backend-it (p.sh. http://localhost:4000/api) → për foto duhet pa "/api"
    const uploadBase = useMemo(() => {
        const apiBase = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000/api';
        return String(apiBase).replace(/\/api\/?$/, '');
    }, []);

    function resolvePhotoSrc(photoUrl: string | null | undefined) {
        if (!photoUrl) return null;

        const u = String(photoUrl);

        if (/^https?:\/\//i.test(u)) return u;
        if (u.startsWith('/uploads/')) return `${uploadBase}${u}`;
        return u;
    }

    async function load(p = 1) {
        setLoading(true);
        try {
            const data = await listPendingPeople(p, 10);
            setItems(data.items);
            setPage(data.page);
            setPages(data.pages ?? 1);
        } catch (err) {
            console.error('listPendingPeople error', err);
            setItems([]);
            setPages(1);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load(1);
    }, []);

    // ✅ ESC për modalet
    useEffect(() => {
        if (!open && !rejectOpen) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setOpen(false);
                setDetail(null);
                setRejectOpen(false);
                setRejectId(null);
                setRejectReason('');
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, rejectOpen]);

    async function handleView(id: string) {
        setOpen(true);
        setDetail(null);
        setDetailError(null);
        setDetailLoading(true);

        try {
            const data = await getPerson(id);
            setDetail(data);
        } catch (err: any) {
            console.error('getPerson error', err);
            const code = err?.response?.data?.code;
            if (code === 'FORBIDDEN_UNIT') setDetailError('S’ke akses me pa këtë ushtar (njësi tjetër).');
            else setDetailError('S’u morën të dhënat e ushtarit. Provo prapë.');
        } finally {
            setDetailLoading(false);
        }
    }

    async function handleApprove(id: string) {
        if (!confirm('Je i sigurt që dëshiron ta MIRATOSH këtë ushtar?')) return;

        setActionBusy(true);
        try {
            await approvePerson(id);
            await load(1);

            if (detail?._id === id) {
                setOpen(false);
                setDetail(null);
            }
        } catch (err) {
            console.error('approvePerson error', err);
            alert('Nuk u miratua. Kontrollo API ose provo përsëri.');
        } finally {
            setActionBusy(false);
        }
    }

    function openReject(id: string) {
        setRejectId(id);
        setRejectReason('');
        setRejectOpen(true);
    }

    async function confirmReject() {
        if (!rejectId) return;
        if (!rejectReason.trim()) return;

        setActionBusy(true);
        try {
            await rejectPerson(rejectId, rejectReason.trim());
            await load(1);

            if (detail?._id === rejectId) {
                setOpen(false);
                setDetail(null);
            }
            setRejectOpen(false);
            setRejectId(null);
            setRejectReason('');
        } catch (err) {
            console.error('rejectPerson error', err);
            alert('Nuk u refuzua. Kontrollo API ose provo përsëri.');
        } finally {
            setActionBusy(false);
        }
    }

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const c = cityFilter.trim().toLowerCase();

        return items.filter((p) => {
            const full = `${p.firstName ?? ''} ${p.lastName ?? ''}`.toLowerCase();
            const sn = String((p as any)?.serviceNo ?? '').toLowerCase();
            const city = String((p as any)?.city ?? '').toLowerCase();

            const okQ = !q || full.includes(q) || sn.includes(q);
            const okC = !c || city.includes(c);
            return okQ && okC;
        });
    }, [items, query, cityFilter]);

    const photoSrc = resolvePhotoSrc(detail?.photoUrl);

    // ✅ Modal UI (Portal) — details
    const detailModal =
        open &&
        createPortal(
            <div
                className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4"
                onClick={() => {
                    setOpen(false);
                    setDetail(null);
                }}
            >
                <div
                    className="w-full max-w-3xl rounded-2xl shadow-2xl bg-white overflow-hidden ring-1 ring-black/5"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="px-5 py-4 border-b bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
                        <div>
                            <div className="text-base font-semibold text-slate-900">Verifikimi i ushtarit</div>
                            <div className="text-xs text-slate-500">Shiko detajet dhe vendos Mirato / Refuzo</div>
                        </div>

                        <button
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 text-sm"
                            onClick={() => {
                                setOpen(false);
                                setDetail(null);
                            }}
                        >
                            <IconX className="h-4 w-4" />
                            Mbyll
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-5">
                        {detailLoading && (
                            <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-600">Duke u ngarkuar…</div>
                        )}

                        {detailError && (
                            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{detailError}</div>
                        )}

                        {!detailLoading && !detailError && detail && (
                            <div className="space-y-5">
                                {/* Top card */}
                                <div className="rounded-2xl border bg-white overflow-hidden">
                                    <div className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="h-12 w-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-semibold">
                                                {initials(detail.firstName, detail.lastName)}
                                            </div>
                                            <div>
                                                <div className="text-lg font-semibold text-slate-900">
                                                    {detail.firstName} {detail.lastName}
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                    Nr. Shërbimit: <span className="font-medium text-slate-700">{String(detail.serviceNo ?? '')}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {statusPill(String(detail.status ?? ''))}
                                        </div>
                                    </div>

                                    <div className="border-t bg-slate-50 p-4">
                                        <div className="text-xs text-slate-500 mb-2">Foto</div>
                                        <div className="rounded-xl border bg-white p-2">
                                            {photoSrc ? (
                                                <img
                                                    src={photoSrc}
                                                    alt={`${detail.firstName} ${detail.lastName}`}
                                                    className="w-full max-h-[360px] object-contain rounded-lg"
                                                    loading="lazy"
                                                    onError={(e) => {
                                                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                                                    }}
                                                />
                                            ) : (
                                                <div className="text-sm text-slate-500">Pa foto</div>
                                            )}

                                            {detail.photoUrl ? (
                                                <div className="mt-2 text-[11px] text-slate-400 break-all">Path: {detail.photoUrl}</div>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>

                                {/* Grid info */}
                                <div className="grid md:grid-cols-2 gap-3">
                                    <Info label="Nr. Personal" value={detail.personalNumber ?? ''} />
                                    <Info label="Gjinia" value={detail.gender ?? ''} />
                                    <Info label="Data e lindjes" value={formatDate(detail.birthDate ?? '')} />
                                    <Info label="Fillimi shërbimit" value={formatDate(detail.serviceStartDate ?? '')} />
                                    <Info label="Pozita" value={detail.position ?? ''} />
                                    <Info label="Qyteti" value={detail.city ?? ''} />
                                    <Info label="Adresa" value={detail.address ?? ''} />
                                    <Info label="Telefoni" value={detail.phone ?? ''} />
                                    <Info label="Grada (gradeId)" value={detail.gradeId ?? ''} />
                                    <Info label="Njësia (unitId)" value={(detail as any).unitId ?? ''} />
                                </div>

                                <div>
                                    <div className="text-xs text-slate-500 mb-2">Shënime</div>
                                    <div className="rounded-xl border bg-slate-50 p-3 text-sm text-slate-700 min-h-[44px] whitespace-pre-wrap">
                                        {detail.notes ?? ''}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
                                    <button
                                        disabled={actionBusy}
                                        onClick={() => handleApprove(detail._id)}
                                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                                    >
                                        <IconCheck className="h-4 w-4" />
                                        Mirato
                                    </button>

                                    <button
                                        disabled={actionBusy}
                                        onClick={() => openReject(detail._id)}
                                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                                    >
                                        <IconX className="h-4 w-4" />
                                        Refuzo
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>,
            document.body
        );

    // ✅ Reject modal (Portal)
    const rejectModal =
        rejectOpen &&
        createPortal(
            <div
                className="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center p-4"
                onClick={() => {
                    setRejectOpen(false);
                    setRejectId(null);
                    setRejectReason('');
                }}
            >
                <div
                    className="w-full max-w-lg rounded-2xl shadow-2xl bg-white overflow-hidden ring-1 ring-black/5"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-5 py-4 border-b bg-gradient-to-r from-rose-50 to-white flex items-center justify-between">
                        <div>
                            <div className="text-base font-semibold text-slate-900">Refuzo ushtarin</div>
                            <div className="text-xs text-slate-500">Shkruaj arsyen e refuzimit (e detyrueshme).</div>
                        </div>

                        <button
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 text-sm"
                            onClick={() => {
                                setRejectOpen(false);
                                setRejectId(null);
                                setRejectReason('');
                            }}
                        >
                            <IconX className="h-4 w-4" />
                            Mbyll
                        </button>
                    </div>

                    <div className="p-5 space-y-3">
                        <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            rows={4}
                            placeholder="p.sh. Foto nuk është e qartë / Nr. personal nuk përputhet / Dokument i munguar…"
                            className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
                        />

                        <div className="flex justify-end gap-2">
                            <button
                                disabled={actionBusy}
                                onClick={() => {
                                    setRejectOpen(false);
                                    setRejectId(null);
                                    setRejectReason('');
                                }}
                                className="px-4 py-2.5 rounded-xl border bg-white hover:bg-slate-50 text-sm disabled:opacity-50"
                            >
                                Anulo
                            </button>

                            <button
                                disabled={actionBusy || !rejectReason.trim()}
                                onClick={confirmReject}
                                className="px-4 py-2.5 rounded-xl bg-rose-600 text-white hover:bg-rose-700 text-sm disabled:opacity-50"
                            >
                                {actionBusy ? 'Duke refuzuar…' : 'Refuzo'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>,
            document.body
        );

    const uniqueCities = useMemo(() => {
        const set = new Set<string>();
        items.forEach((p) => {
            const c = String((p as any)?.city ?? '').trim();
            if (c) set.add(c);
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [items]);

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="rounded-2xl border bg-gradient-to-r from-slate-50 to-white p-4 md:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900">Ushtarët në pritje</h1>
                    <div className="text-sm text-slate-600 mt-1">

                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <button
                        onClick={() => load(1)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border bg-white hover:bg-slate-50 text-sm"
                    >
                        <IconRefresh className="h-4 w-4" />
                        Rifresko
                    </button>
                </div>
            </div>

            {/* Toolbar */}
            <div className="rounded-2xl border bg-white p-4 md:p-5">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div className="flex flex-col sm:flex-row gap-2 w-full lg:max-w-2xl">
                        <div className="w-full">
                            <label className="text-xs text-slate-500">Kërko</label>
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Emër / Mbiemër / Nr. shërbimi…"
                                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                            />
                        </div>

                        <div className="w-full sm:max-w-xs">
                            <label className="text-xs text-slate-500">Qyteti</label>
                            <select
                                value={cityFilter}
                                onChange={(e) => setCityFilter(e.target.value)}
                                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
                            >
                                <option value="">— Të gjitha —</option>
                                {uniqueCities.map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {statusPill('PENDING')}
                        <span className="text-sm text-slate-600">
                            Totali: <span className="font-semibold text-slate-900">{filtered.length}</span>
                        </span>
                    </div>
                </div>
            </div>

            {/* Table / Cards */}
            <div className="rounded-2xl border bg-white overflow-hidden">
                {loading ? (
                    <div className="p-5 text-sm text-slate-600">Duke u ngarkuar…</div>
                ) : filtered.length === 0 ? (
                    <div className="p-5">
                        <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-600">
                            Aktualisht nuk ka ushtarë në statusin PENDING (ose filtrat nuk kanë rezultat).
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Desktop table */}
                        <div className="hidden md:block">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50">
                                    <tr className="text-left text-slate-600">
                                        <th className="py-3 px-4 font-medium">Ushtari</th>
                                        <th className="py-3 px-4 font-medium">Nr. Shërbimit</th>
                                        <th className="py-3 px-4 font-medium">Qyteti</th>
                                        <th className="py-3 px-4 font-medium">Status</th>
                                        <th className="py-3 px-4 font-medium text-right">Veprime</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {filtered.map((p) => (
                                        <tr key={p._id} className="border-t hover:bg-slate-50/60">
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-semibold">
                                                        {initials(p.firstName, p.lastName)}
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-slate-900">
                                                            {p.firstName} {p.lastName}
                                                        </div>
                                                        <div className="text-xs text-slate-500">ID: {p._id}</div>
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="py-3 px-4 text-slate-800">{String((p as any)?.serviceNo ?? '')}</td>
                                            <td className="py-3 px-4 text-slate-800">{(p as any)?.city ?? ''}</td>
                                            <td className="py-3 px-4">{statusPill('PENDING')}</td>

                                            <td className="py-3 px-4">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => handleView(p._id)}
                                                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border bg-white hover:bg-slate-50 text-xs"
                                                    >
                                                        <IconEye className="h-4 w-4" />
                                                        Shiko
                                                    </button>

                                                    <button
                                                        disabled={actionBusy}
                                                        onClick={() => handleApprove(p._id)}
                                                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-xs disabled:opacity-50"
                                                    >
                                                        <IconCheck className="h-4 w-4" />
                                                        Mirato
                                                    </button>

                                                    <button
                                                        disabled={actionBusy}
                                                        onClick={() => openReject(p._id)}
                                                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-600 text-white hover:bg-rose-700 text-xs disabled:opacity-50"
                                                    >
                                                        <IconX className="h-4 w-4" />
                                                        Refuzo
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile cards */}
                        <div className="md:hidden divide-y">
                            {filtered.map((p) => (
                                <div key={p._id} className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-semibold">
                                                {initials(p.firstName, p.lastName)}
                                            </div>
                                            <div>
                                                <div className="font-semibold text-slate-900">
                                                    {p.firstName} {p.lastName}
                                                </div>
                                                <div className="text-xs text-slate-500">Nr: {String((p as any)?.serviceNo ?? '')}</div>
                                            </div>
                                        </div>

                                        {statusPill('PENDING')}
                                    </div>

                                    <div className="mt-3 text-sm text-slate-700">
                                        <div>
                                            <span className="text-slate-500 text-xs">Qyteti:</span> {(p as any)?.city ?? ''}
                                        </div>
                                    </div>

                                    <div className="mt-3 flex gap-2">
                                        <button
                                            onClick={() => handleView(p._id)}
                                            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border bg-white hover:bg-slate-50 text-sm"
                                        >
                                            <IconEye className="h-4 w-4" />
                                            Shiko
                                        </button>

                                        <button
                                            disabled={actionBusy}
                                            onClick={() => handleApprove(p._id)}
                                            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-sm disabled:opacity-50"
                                        >
                                            <IconCheck className="h-4 w-4" />
                                            Mirato
                                        </button>

                                        <button
                                            disabled={actionBusy}
                                            onClick={() => openReject(p._id)}
                                            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-rose-600 text-white hover:bg-rose-700 text-sm disabled:opacity-50"
                                        >
                                            <IconX className="h-4 w-4" />
                                            Refuzo
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Pagination */}
                        <div className="border-t bg-slate-50 px-4 py-3 flex items-center justify-between">
                            <div className="text-sm text-slate-600">
                                Faqja <span className="font-semibold text-slate-900">{page}</span> / {pages}
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    disabled={page <= 1 || loading}
                                    onClick={() => load(page - 1)}
                                    className="px-3 py-2 rounded-xl border bg-white hover:bg-slate-50 text-sm disabled:opacity-50"
                                >
                                    ‹ Mbrapa
                                </button>

                                <button
                                    disabled={page >= pages || loading}
                                    onClick={() => load(page + 1)}
                                    className="px-3 py-2 rounded-xl border bg-white hover:bg-slate-50 text-sm disabled:opacity-50"
                                >
                                    Përpara ›
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Portals */}
            {detailModal}
            {rejectModal}
        </div>
    );
}

function Info({ label, value }: { label: string; value: any }) {
    const v = value ?? '';
    return (
        <div className="rounded-xl border bg-white p-3">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-1 text-sm text-slate-900 break-all">{String(v)}</div>
        </div>
    );
}

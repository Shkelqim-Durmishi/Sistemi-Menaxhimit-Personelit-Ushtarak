// src/pages/PeoplePending.tsx

import { useEffect, useMemo, useState } from 'react';
import {
    listPendingPeople,
    approvePerson,
    rejectPerson,
    getPerson,
    type PersonListItem,
    type PersonDetail,
} from '../lib/api';

export default function PeoplePendingPage() {
    const [items, setItems] = useState<PersonListItem[]>([]);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [loading, setLoading] = useState(false);

    // ✅ për modal "Shiko"
    const [open, setOpen] = useState(false);
    const [detail, setDetail] = useState<PersonDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);

    // ✅ Base URL i backend-it (p.sh. http://localhost:4000/api) → për foto duhet pa "/api"
    const uploadBase = useMemo(() => {
        const apiBase = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000/api';
        return String(apiBase).replace(/\/api\/?$/, '');
    }, []);

    function resolvePhotoSrc(photoUrl: string | null | undefined) {
        if (!photoUrl) return null;

        const u = String(photoUrl);

        // already absolute
        if (/^https?:\/\//i.test(u)) return u;

        // backend serves /uploads as static
        if (u.startsWith('/uploads/')) return `${uploadBase}${u}`;

        // fallback: return as-is
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
        }
    }

    async function handleReject(id: string) {
        const reason = prompt('Shkruaj arsyen e refuzimit:');
        if (!reason || reason.trim().length === 0) return;

        try {
            await rejectPerson(id, reason.trim());
            await load(1);

            if (detail?._id === id) {
                setOpen(false);
                setDetail(null);
            }
        } catch (err) {
            console.error('rejectPerson error', err);
            alert('Nuk u refuzua. Kontrollo API ose provo përsëri.');
        }
    }

    const photoSrc = resolvePhotoSrc(detail?.photoUrl);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-2xl font-semibold">Ushtarët në pritje (PENDING)</h1>

                <button
                    onClick={() => load(1)}
                    className="px-3 py-2 border rounded text-sm bg-white hover:bg-gray-50"
                >
                    Rifresko
                </button>
            </div>

            <div className="bg-white p-4 rounded shadow space-y-3">
                {loading && <div className="text-sm text-gray-500">Duke u ngarkuar…</div>}

                {!loading && items.length === 0 && (
                    <div className="text-sm text-gray-500">Aktualisht nuk ka ushtarë në statusin PENDING.</div>
                )}

                {!loading && items.length > 0 && (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b text-left">
                                <th className="py-2">Nr. Shërbimit</th>
                                <th>Emri / Mbiemri</th>
                                <th>Qyteti</th>
                                <th className="w-60">Veprime</th>
                            </tr>
                        </thead>

                        <tbody>
                            {items.map((p) => (
                                <tr key={p._id} className="border-b">
                                    <td className="py-1">{p.serviceNo}</td>
                                    <td>
                                        {p.firstName} {p.lastName}
                                    </td>
                                    <td>{p.city ?? ''}</td>
                                    <td>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleView(p._id)}
                                                className="px-2 py-1 rounded bg-blue-600 text-white text-xs"
                                            >
                                                Shiko / Verifiko
                                            </button>

                                            <button
                                                onClick={() => handleApprove(p._id)}
                                                className="px-2 py-1 rounded bg-green-600 text-white text-xs"
                                            >
                                                Mirato
                                            </button>

                                            <button
                                                onClick={() => handleReject(p._id)}
                                                className="px-2 py-1 rounded bg-red-600 text-white text-xs"
                                            >
                                                Refuzo
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                <div className="flex justify-end items-center gap-2 text-sm">
                    <button
                        disabled={page <= 1}
                        onClick={() => load(page - 1)}
                        className="px-2 py-1 border rounded disabled:opacity-50"
                    >
                        ‹ Mbrapa
                    </button>

                    <span>
                        Faqja {page} / {pages}
                    </span>

                    <button
                        disabled={page >= pages}
                        onClick={() => load(page + 1)}
                        className="px-2 py-1 border rounded disabled:opacity-50"
                    >
                        Përpara ›
                    </button>
                </div>
            </div>

            {/* ✅ MODAL: Shiko/Verifiko */}
            {open && (
                <div
                    className="fixed inset-0 bg-black/40 flex items-center justify-center p-4"
                    onClick={() => {
                        setOpen(false);
                        setDetail(null);
                    }}
                >
                    <div
                        className="bg-white w-full max-w-2xl rounded shadow p-4 space-y-3"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <div className="text-lg font-semibold">Detajet e ushtarit</div>
                            <button
                                className="px-2 py-1 border rounded text-sm"
                                onClick={() => {
                                    setOpen(false);
                                    setDetail(null);
                                }}
                            >
                                Mbyll
                            </button>
                        </div>

                        {detailLoading && <div className="text-sm text-gray-500">Duke u ngarkuar…</div>}

                        {detailError && (
                            <div className="text-sm text-red-600 border border-red-200 bg-red-50 p-2 rounded">
                                {detailError}
                            </div>
                        )}

                        {!detailLoading && !detailError && detail && (
                            <div className="grid md:grid-cols-2 gap-3 text-sm">
                                {/* ✅ FOTO si IMG */}
                                <div className="md:col-span-2">
                                    <div className="text-xs text-gray-500">Foto</div>

                                    <div className="border rounded p-2 bg-white">
                                        {photoSrc ? (
                                            <img
                                                src={photoSrc}
                                                alt={`${detail.firstName} ${detail.lastName}`}
                                                className="w-full max-h-[320px] object-contain rounded"
                                                loading="lazy"
                                                onError={(e) => {
                                                    // nëse foto nuk gjendet
                                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                                }}
                                            />
                                        ) : (
                                            <div className="text-sm text-gray-500">Pa foto</div>
                                        )}

                                        {/* opsionale: e shfaqim path-in poshtë për debug */}
                                        {detail.photoUrl ? (
                                            <div className="mt-2 text-xs text-gray-500 break-all">
                                                Path: {detail.photoUrl}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>

                                <Info label="Nr. Shërbimit" value={detail.serviceNo} />
                                <Info label="Status" value={detail.status ?? ''} />
                                <Info label="Emri" value={detail.firstName} />
                                <Info label="Mbiemri" value={detail.lastName} />
                                <Info label="Nr. Personal" value={detail.personalNumber ?? ''} />
                                <Info label="Grada (gradeId)" value={detail.gradeId ?? ''} />
                                <Info label="Njësia (unitId)" value={detail.unitId ?? ''} />
                                <Info label="Pozita" value={detail.position ?? ''} />
                                <Info label="Data e lindjes" value={detail.birthDate ?? ''} />
                                <Info label="Gjinia" value={detail.gender ?? ''} />
                                <Info label="Qyteti" value={detail.city ?? ''} />
                                <Info label="Adresa" value={detail.address ?? ''} />
                                <Info label="Telefoni" value={detail.phone ?? ''} />
                                <Info label="Fillimi shërbimit" value={detail.serviceStartDate ?? ''} />

                                <div className="md:col-span-2">
                                    <div className="text-xs text-gray-500">Shënime</div>
                                    <div className="border rounded px-2 py-2 bg-gray-50 min-h-[40px]">
                                        {detail.notes ?? ''}
                                    </div>
                                </div>

                                <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                                    <button
                                        onClick={() => handleApprove(detail._id)}
                                        className="px-3 py-2 rounded bg-green-600 text-white text-sm"
                                    >
                                        Mirato
                                    </button>
                                    <button
                                        onClick={() => handleReject(detail._id)}
                                        className="px-3 py-2 rounded bg-red-600 text-white text-sm"
                                    >
                                        Refuzo
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function Info({ label, value }: { label: string; value: any }) {
    const v = value ?? '';
    return (
        <div>
            <div className="text-xs text-gray-500">{label}</div>
            <div className="border rounded px-2 py-1 bg-white break-all">{String(v)}</div>
        </div>
    );
}
// src/pages/profile.tsx

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getCurrentUser, api, toPublicUrl } from '../lib/api';

type MeResponse = {
    id: string;
    username: string;
    role: string;
    unitId: string | null;
    mustChangePassword?: boolean;

    signatureImageUrl?: string | null;
    signatureSignedAt?: string | null;

    // (optional) nese backend e kthen tash
    unit?: { id: string; code?: string; name?: string } | null;
};

async function getMe(): Promise<MeResponse> {
    // ✅ anti-cache
    const { data } = await api.get('/me', { params: { t: Date.now() } });
    return data as MeResponse;
}

/** ✅ Ikona Refresh (SVG) – s’kërkon asnjë library */
function RefreshIcon({ className = '' }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
                d="M20 12a8 8 0 0 1-14.8 4M4 12a8 8 0 0 1 14.8-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
            <path
                d="M20 4v6h-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M4 20v-6h6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/** ✏️ Edit Icon */
function EditIcon({ className = '' }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
                d="M4 20h4l10-10a2 2 0 0 0-4-4L4 16v4z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/** ➕ Plus Icon */
function PlusIcon({ className = '' }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}

export default function ProfilePage() {
    const localUser = getCurrentUser();

    if (!localUser) {
        return (
            <div className="bg-white p-4 rounded shadow">
                <div className="text-sm text-gray-600">Nuk ka user aktiv. Ju lutem login.</div>
            </div>
        );
    }

    const {
        data: me,
        isLoading,
        isError,
        refetch,
        isFetching,
        dataUpdatedAt,
    } = useQuery({
        queryKey: ['me'],
        queryFn: getMe,
        staleTime: 0,
        refetchOnWindowFocus: false,
    });

    const username = me?.username ?? localUser.username ?? '—';
    const role = me?.role ?? localUser.role ?? '—';

    const unitLabel =
        me?.unit?.name
            ? `${me?.unit?.code ? me.unit.code + ' — ' : ''}${me.unit.name}`
            : me?.unitId ?? localUser.unitId ?? '—';

    // URL absolute (http://localhost:4000/uploads/...)
    const sigAbs = toPublicUrl(me?.signatureImageUrl ?? null);

    // ✅ cache-buster: ndryshon sa herë që vjen data e re / rifreskon query
    const sigUrl = useMemo(() => {
        if (!sigAbs) return null;

        const stamp = me?.signatureSignedAt
            ? new Date(me.signatureSignedAt).getTime()
            : dataUpdatedAt || Date.now();

        return `${sigAbs}${sigAbs.includes('?') ? '&' : '?'}t=${stamp}`;
    }, [sigAbs, me?.signatureSignedAt, dataUpdatedAt]);

    const signatureStatusText = isLoading
        ? 'Duke ngarkuar…'
        : isError
            ? 'S’u arrit me i marrë të dhënat e nënshkrimit.'
            : sigUrl
                ? `Vendosur më: ${me?.signatureSignedAt ? new Date(me.signatureSignedAt).toLocaleString() : '—'
                }`
                : 'Nuk keni vendosur ende nënshkrim.';

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-semibold">Profili</h1>

            <div className="bg-white p-4 rounded shadow border border-gray-100">
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <Field label="Username" value={username} />
                    <Field label="Roli" value={role} />
                    <Field label="Njësia" value={unitLabel} />
                </div>

                <div className="mt-4 text-xs text-gray-500">
                    * Këto të dhëna shfaqen vetëm për lexim (read-only).
                </div>
            </div>

            {/* ✅ NËNSHKRIMI */}
            <div className="bg-white p-4 rounded shadow border border-gray-100">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="text-sm font-semibold text-gray-900">Nënshkrimi Digjital</div>
                        <div className="text-xs text-gray-500 mt-0.5">{signatureStatusText}</div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* 🔄 Refresh - icon only */}
                        <button
                            onClick={() => refetch()}
                            type="button"
                            disabled={isFetching}
                            title="Rifresko"
                            className={[
                                'h-9 w-9 flex items-center justify-center rounded-full border',
                                'hover:bg-gray-100 active:bg-gray-200 transition',
                                isFetching ? 'opacity-60 cursor-not-allowed' : '',
                            ].join(' ')}
                        >
                            <RefreshIcon className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                        </button>

                        {/* ✏️ / ➕ Signature - icon only */}
                        <Link
                            to="/signature"
                            title={sigUrl ? 'Ndrysho nënshkrimin' : 'Vendos nënshkrimin'}
                            className="h-9 w-9 flex items-center justify-center rounded-full bg-gray-900 text-white hover:bg-gray-800 transition"
                        >
                            {sigUrl ? <EditIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
                        </Link>
                    </div>
                </div>

                <div className="mt-3">
                    {!sigUrl ? (
                        <div className="text-sm text-gray-600">
                            Sapo ta vendosni nënshkrimin, do të shfaqet këtu.
                        </div>
                    ) : (
                        <div className="max-w-[680px]">
                            <div className="border rounded-md p-2 bg-white">
                                <img
                                    src={sigUrl}
                                    alt="Nënshkrimi"
                                    className="w-full h-[180px] object-contain"
                                    onError={(e) => {
                                        console.log('Signature image failed:', sigUrl);
                                        (e.currentTarget as HTMLImageElement).style.opacity = '0.3';
                                    }}
                                />
                            </div>

                            <div className="mt-2 text-xs text-gray-500">
                                Nëse nuk e shihni menjëherë (cache), klikoni “Rifresko”.
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="text-[11px] uppercase tracking-wider text-gray-400">{label}</div>
            <div className="mt-1 font-semibold text-gray-900 break-words">{value}</div>
        </div>
    );
}

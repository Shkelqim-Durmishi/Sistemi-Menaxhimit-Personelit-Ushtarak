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
};

async function getMe(): Promise<MeResponse> {
    // ✅ anti-cache
    const { data } = await api.get('/me', { params: { t: Date.now() } });
    return data as MeResponse;
}

export default function ProfilePage() {
    const localUser = getCurrentUser();

    // nëse s’ka user lokal (nuk je login)
    if (!localUser) {
        return (
            <div className="bg-white p-4 rounded shadow">
                <div className="text-sm text-gray-600">Nuk ka user aktiv. Ju lutem login.</div>
            </div>
        );
    }

    // ✅ merr info nga backend (signatureImageUrl, signatureSignedAt)
    const { data: me, isLoading, isError, refetch, dataUpdatedAt } = useQuery({
        queryKey: ['me'],
        queryFn: getMe,
        staleTime: 0,
        refetchOnWindowFocus: false,
    });

    const username = me?.username ?? localUser.username ?? '—';
    const role = me?.role ?? localUser.role ?? '—';
    const unitId = (me?.unitId ?? localUser.unitId ?? '—') as string;

    // URL absolute (http://localhost:4000/uploads/...)
    const sigAbs = toPublicUrl(me?.signatureImageUrl ?? null);

    // ✅ cache-buster: ndryshon sa herë që vjen data e re / rifreskon query
    const sigUrl = useMemo(() => {
        if (!sigAbs) return null;

        const stamp =
            me?.signatureSignedAt
                ? new Date(me.signatureSignedAt).getTime()
                : dataUpdatedAt || Date.now();

        return `${sigAbs}${sigAbs.includes('?') ? '&' : '?'}t=${stamp}`;
    }, [sigAbs, me?.signatureSignedAt, dataUpdatedAt]);

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-semibold">Profili</h1>

            <div className="bg-white p-4 rounded shadow border border-gray-100">
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <Field label="Username" value={username} />
                    <Field label="Roli" value={role} />
                    <Field label="Njësia" value={unitId} />
                </div>

                <div className="mt-4 text-xs text-gray-500">
                    * Këto të dhëna shfaqen vetëm për lexim (read-only).
                </div>
            </div>

            {/* ✅ NËNSHKRIMI */}
            <div className="bg-white p-4 rounded shadow border border-gray-100">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-semibold text-gray-900">Nënshkrimi Digjital</div>
                        <div className="text-xs text-gray-500">
                            {isLoading
                                ? 'Duke ngarkuar…'
                                : isError
                                    ? 'S’u arrit me i marrë të dhënat e nënshkrimit.'
                                    : sigUrl
                                        ? `Vendosur më: ${me?.signatureSignedAt ? new Date(me.signatureSignedAt).toLocaleString() : '—'
                                        }`
                                        : 'Nuk keni vendosur ende nënshkrim.'}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => refetch()}
                            className="px-3 py-2 rounded border text-sm hover:bg-gray-50"
                            type="button"
                        >
                            Rifresko
                        </button>

                        <Link
                            to="/signature"
                            className="px-3 py-2 rounded bg-gray-900 text-white text-sm hover:bg-gray-800"
                        >
                            {sigUrl ? 'Ndrysho nënshkrimin' : 'Vendos nënshkrimin'}
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
                                        // nëse prapë s’po hapet, ta shohim në console URL-në reale
                                        // eslint-disable-next-line no-console
                                        console.log('Signature image failed:', sigUrl);
                                        (e.currentTarget as HTMLImageElement).style.opacity = '0.3';
                                    }}
                                />
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

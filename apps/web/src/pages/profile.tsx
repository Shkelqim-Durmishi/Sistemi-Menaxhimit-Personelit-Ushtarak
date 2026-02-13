// src/pages/profile.tsx
import { getCurrentUser } from '../lib/api';

export default function ProfilePage() {
    const user = getCurrentUser();

    if (!user) {
        return (
            <div className="bg-white p-4 rounded shadow">
                <div className="text-sm text-gray-600">Nuk ka user aktiv. Ju lutem login.</div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-semibold">Profili</h1>

            <div className="bg-white p-4 rounded shadow border border-gray-100">
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <Field label="Username" value={user.username ?? '—'} />
                    <Field label="Roli" value={user.role ?? '—'} />
                    <Field label="Njësia" value={user.unitId ?? '—'} />

                </div>

                <div className="mt-4 text-xs text-gray-500">
                    * Këto të dhëna shfaqen vetëm për lexim (read-only).
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
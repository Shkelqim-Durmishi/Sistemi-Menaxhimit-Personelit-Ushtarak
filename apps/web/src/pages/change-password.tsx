// src/pages/change-password.tsx
import { useState, type FormEvent } from 'react';
import { changePassword } from '../lib/api';

export default function ChangePasswordPage() {
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newPassword2, setNewPassword2] = useState('');
    const [loading, setLoading] = useState(false);

    function validate() {
        if (!oldPassword.trim()) return alert('Shkruaj fjalëkalimin aktual.'), false;
        if (!newPassword.trim()) return alert('Shkruaj fjalëkalimin e ri.'), false;
        if (newPassword.length < 6) return alert('Fjalëkalimi i ri duhet të ketë të paktën 6 karaktere.'), false;
        if (newPassword !== newPassword2) return alert('Fjalëkalimi i ri nuk përputhet.'), false;
        if (oldPassword === newPassword) return alert('Fjalëkalimi i ri s’duhet të jetë i njëjtë me të vjetrin.'), false;
        return true;
    }

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        if (!validate()) return;

        setLoading(true);
        try {
            await changePassword(oldPassword, newPassword);
            alert('Fjalëkalimi u ndryshua me sukses.');
            setOldPassword('');
            setNewPassword('');
            setNewPassword2('');
        } catch (err: any) {
            const code = err?.response?.data?.code;
            if (code === 'INVALID_OLD_PASSWORD') {
                alert('Fjalëkalimi aktual nuk është i saktë.');
            } else {
                alert('Nuk u ndryshua fjalëkalimi. Provo përsëri.');
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="space-y-4 max-w-xl">
            <h1 className="text-2xl font-semibold">Ndrysho fjalëkalimin</h1>

            <form onSubmit={onSubmit} className="bg-white p-4 rounded shadow border border-gray-100 space-y-3">
                <div>
                    <label className="text-sm font-medium">Fjalëkalimi aktual</label>
                    <input
                        type="password"
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        className="mt-1 border px-2 py-2 rounded w-full"
                    />
                </div>

                <div>
                    <label className="text-sm font-medium">Fjalëkalimi i ri</label>
                    <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="mt-1 border px-2 py-2 rounded w-full"
                    />
                </div>

                <div>
                    <label className="text-sm font-medium">Përsërite fjalëkalimin e ri</label>
                    <input
                        type="password"
                        value={newPassword2}
                        onChange={(e) => setNewPassword2(e.target.value)}
                        className="mt-1 border px-2 py-2 rounded w-full"
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full px-3 py-2 rounded font-semibold text-white bg-[#2F3E2E] hover:opacity-95 disabled:opacity-60"
                >
                    {loading ? 'Duke ruajtur…' : 'Ndrysho fjalëkalimin'}
                </button>

                <div className="text-xs text-gray-500">
                    Këshillë: përdor kombinim shkronja + numra + simbol.
                </div>
            </form>
        </div>
    );
}
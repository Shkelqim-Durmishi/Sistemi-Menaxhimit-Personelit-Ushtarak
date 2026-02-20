// src/pages/SignaturePage.tsx
import { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { useNavigate } from 'react-router-dom';

import { api, getCurrentUser, setCurrentUser } from '../lib/api';

export default function SignaturePage() {
    const sigRef = useRef<SignatureCanvas>(null);
    const nav = useNavigate();
    const [saving, setSaving] = useState(false);

    const handleClear = () => {
        sigRef.current?.clear();
    };

    const handleSave = async () => {
        if (!sigRef.current) return;

        if (sigRef.current.isEmpty()) {
            alert('Duhet të vendosni nënshkrimin.');
            return;
        }

        const dataUrl = sigRef.current.toDataURL('image/png');

        try {
            setSaving(true);

            // ✅ API_BASE është http://localhost:4000/api
            // prandaj këtu përdorim "/me/signature" (JO "/api/me/signature")
            await api.put('/me/signature', { dataUrl });

            // ✅ rifresko /me që localStorage të ketë signatureImageUrl
            const meRes = await api.get('/me');
            const me = meRes.data;

            const current = getCurrentUser();
            if (current) {
                setCurrentUser({
                    ...current,
                    // nëse don me e pas në user info:
                    signatureImageUrl: me.signatureImageUrl ?? null,
                    signatureSignedAt: me.signatureSignedAt ?? null,
                } as any);
            }

            sigRef.current.clear();

            alert('Nënshkrimi u ruajt me sukses!');
            nav('/profile', { replace: true });
        } catch (e: any) {
            const msg =
                e?.response?.data?.message ||
                e?.response?.data?.code ||
                e?.message ||
                'Gabim gjatë ruajtjes së nënshkrimit.';
            alert(String(msg));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ padding: 30 }}>
            <h2>Vendos Nënshkrimin Digjital</h2>

            <div style={{ border: '2px solid #ccc', width: 600, height: 200 }}>
                <SignatureCanvas
                    ref={sigRef}
                    penColor="black"
                    canvasProps={{ width: 600, height: 200, className: 'sigCanvas' }}
                />
            </div>

            <div style={{ marginTop: 15 }}>
                <button onClick={handleClear} disabled={saving}>
                    Fshije
                </button>
                <button onClick={handleSave} disabled={saving} style={{ marginLeft: 10 }}>
                    {saving ? 'Duke ruajtur...' : 'Ruaje Nënshkrimin'}
                </button>
            </div>
        </div>
    );
}

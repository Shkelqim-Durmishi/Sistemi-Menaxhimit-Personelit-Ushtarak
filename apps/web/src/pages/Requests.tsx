// apps/web/src/pages/Requests.tsx

import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
    getRole,
    getCurrentUnitId,
    listMyRequests,
    listIncomingRequests,
    createRequest,
    approveRequest,
    rejectRequest,
    cancelRequest,
    searchPeople,
    type RequestItem,
    type RequestAction,
    type RequestStatus,
} from '../lib/api';

const ACTIONS: Array<{ value: RequestAction; label: string }> = [
    { value: 'DELETE_PERSON', label: 'Fshi ushtar nga sistemi' },
    { value: 'TRANSFER_PERSON', label: 'Transfero ushtar (në njësi tjetër)' },
    { value: 'CHANGE_GRADE', label: 'Ndrysho gradën' },
    { value: 'CHANGE_UNIT', label: 'Ndrysho njësinë (brenda strukturës)' },
    { value: 'DEACTIVATE_PERSON', label: 'Çaktivizo ushtar' },
    { value: 'UPDATE_PERSON', label: 'Ndrysho të dhënat (kërkesë për përditësim)' },
];

const ACTION_LABEL: Record<string, string> = ACTIONS.reduce((acc, a) => {
    acc[a.value] = a.label;
    return acc;
}, {} as Record<string, string>);

function Badge({ children }: { children: any }) {
    return (
        <span
            style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: 999,
                border: '1px solid rgba(17,24,39,0.6)',
                fontSize: 12,
                opacity: 0.9,
            }}
        >
            {children}
        </span>
    );
}

/** ✅ ICONS */
function IconEye({ size = 18 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
                d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function IconDownload({ size = 18 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M12 3v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 11l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 19h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function IconClose({ size = 18 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function clean(v: string) {
    const s = String(v ?? '').trim();
    return s.length ? s : null;
}

function formatDateTime(v?: any) {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}.${mm}.${yyyy} ${hh}:${mi}`;
}

function getApiOrigin() {
    const base = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000/api';
    return String(base).replace(/\/api\/?$/, '');
}

// ✅ preview/download modes
function openRequestPdf(requestId: string, mode: 'preview' | 'download' = 'preview') {
    const token = localStorage.getItem('token');
    const origin = getApiOrigin();

    const params = new URLSearchParams();
    if (mode === 'download') params.set('download', '1');
    if (token) params.set('auth', token);

    const qs = params.toString();
    const url = `${origin}/api/requests/${requestId}/pdf${qs ? `?${qs}` : ''}`;
    window.open(url, '_blank', 'noopener,noreferrer');
}

function isPrimitive(v: any) {
    return v === null || v === undefined || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

function prettyValue(v: any) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'Po' : 'Jo';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') return v;
    try {
        return JSON.stringify(v);
    } catch {
        return String(v);
    }
}

export default function Requests() {
    const role = getRole();
    const unitId = getCurrentUnitId();
    const qc = useQueryClient();

    const canSeeIncoming = role === 'COMMANDER' || role === 'ADMIN' || role === 'AUDITOR';
    const [tab, setTab] = useState<'MY' | 'INCOMING'>(canSeeIncoming ? 'INCOMING' : 'MY');

    // ✅ Arkiv toggle
    const [view, setView] = useState<'ACTIVE' | 'ARCHIVE'>('ACTIVE');
    const statusParam: RequestStatus = view === 'ARCHIVE' ? 'ARCHIVE' : 'PENDING';

    // Drawer preview state
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [selectedReq, setSelectedReq] = useState<RequestItem | null>(null);

    // Drawer note fields
    const [approveNote, setApproveNote] = useState('');
    const [rejectNote, setRejectNote] = useState('');
    const [drawerError, setDrawerError] = useState<string>('');

    const openDrawer = (it: RequestItem) => {
        setSelectedReq(it);
        setDrawerOpen(true);
        setDrawerError('');
        setApproveNote('');
        setRejectNote('');
    };

    const closeDrawer = () => {
        setDrawerOpen(false);
        setSelectedReq(null);
        setDrawerError('');
        setApproveNote('');
        setRejectNote('');
    };

    useEffect(() => {
        if (!drawerOpen) return;

        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeDrawer();
        };

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drawerOpen]);

    // Create form state
    const [personId, setPersonId] = useState('');
    const [personQuery, setPersonQuery] = useState('');
    const [debouncedQ, setDebouncedQ] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [selectedLabel, setSelectedLabel] = useState('');

    const [action, setAction] = useState<RequestAction>('TRANSFER_PERSON');
    const [targetUnitId, setTargetUnitId] = useState('');
    const [targetGradeId, setTargetGradeId] = useState('');
    const [reason, setReason] = useState('');

    // ✅ UPDATE_PERSON patch fields
    const [patch, setPatch] = useState({
        serviceNo: '',
        firstName: '',
        lastName: '',
        personalNumber: '',
        birthDate: '',
        gender: '' as '' | 'M' | 'F' | 'O',
        city: '',
        address: '',
        phone: '',
        position: '',
        serviceStartDate: '',
        notes: '',
    });

    useEffect(() => {
        const t = setTimeout(() => setDebouncedQ(personQuery.trim()), 300);
        return () => clearTimeout(t);
    }, [personQuery]);

    const myQ = useQuery({
        queryKey: ['requests', 'my', statusParam],
        queryFn: () => listMyRequests({ page: 1, limit: 50, status: statusParam }),
        enabled: true,
    });

    const incQ = useQuery({
        queryKey: ['requests', 'incoming', unitId, statusParam],
        queryFn: () => listIncomingRequests({ page: 1, limit: 50, status: statusParam }),
        enabled: !!canSeeIncoming,
    });

    const peopleQ = useQuery({
        queryKey: ['people-search', debouncedQ],
        queryFn: () => searchPeople(debouncedQ, 1, 8),
        enabled: showDropdown && debouncedQ.length >= 1,
    });

    // ✅ FILTER: vetëm ACTIVE
    const activePeople = useMemo(() => {
        const items = (peopleQ.data?.items ?? []) as any[];
        return items.filter((p) => String(p?.status ?? '').toUpperCase() === 'ACTIVE');
    }, [peopleQ.data]);

    const createM = useMutation({
        mutationFn: async () => {
            const base = {
                personId: personId.trim(),
                type: action,
                payload: {} as any,
            };

            if (action === 'TRANSFER_PERSON' || action === 'CHANGE_UNIT') {
                base.payload = { toUnitId: targetUnitId.trim(), reason: reason.trim() };
                return createRequest(base);
            }

            if (action === 'CHANGE_GRADE') {
                base.payload = { newGradeId: targetGradeId.trim(), reason: reason.trim() };
                return createRequest(base);
            }

            if (action === 'UPDATE_PERSON') {
                const patchObj: any = {
                    serviceNo: clean(patch.serviceNo),
                    firstName: clean(patch.firstName),
                    lastName: clean(patch.lastName),
                    personalNumber: clean(patch.personalNumber),
                    birthDate: clean(patch.birthDate),
                    gender: clean(patch.gender),
                    city: clean(patch.city),
                    address: clean(patch.address),
                    phone: clean(patch.phone),
                    position: clean(patch.position),
                    serviceStartDate: clean(patch.serviceStartDate),
                    notes: clean(patch.notes),
                };

                Object.keys(patchObj).forEach((k) => {
                    if (patchObj[k] === null) delete patchObj[k];
                });

                if (Object.keys(patchObj).length === 0) {
                    throw new Error('Duhet me plotësu të paktën 1 fushë te "Ndryshimet e kërkuara".');
                }

                base.payload = { reason: reason.trim(), meta: { patch: patchObj } };
                return createRequest(base);
            }

            base.payload = { reason: reason.trim() };
            return createRequest(base);
        },
        onSuccess: () => {
            setPersonId('');
            setPersonQuery('');
            setDebouncedQ('');
            setSelectedLabel('');
            setShowDropdown(false);

            setTargetUnitId('');
            setTargetGradeId('');
            setReason('');
            setPatch({
                serviceNo: '',
                firstName: '',
                lastName: '',
                personalNumber: '',
                birthDate: '',
                gender: '',
                city: '',
                address: '',
                phone: '',
                position: '',
                serviceStartDate: '',
                notes: '',
            });

            qc.invalidateQueries({ queryKey: ['requests', 'my'] });
            qc.invalidateQueries({ queryKey: ['requests', 'incoming'] });
            alert('Kërkesa u dërgua ✅');
        },
        onError: (e: any) => {
            const msg = e?.message || e?.response?.data?.message || e?.response?.data?.code || 'Gabim gjatë dërgimit.';
            alert(msg);
        },
    });

    const approveM = useMutation({
        mutationFn: (p: { id: string; note?: string }) => approveRequest(p.id, p.note || ''),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['requests', 'incoming'] });
            qc.invalidateQueries({ queryKey: ['requests', 'my'] });
            closeDrawer();
        },
        onError: (e: any) => {
            const msg = e?.response?.data?.message || 'Gabim gjatë aprovimit.';
            setDrawerError(msg);
            alert(msg);
        },
    });

    const rejectM = useMutation({
        mutationFn: (p: { id: string; note: string }) => rejectRequest(p.id, p.note),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['requests', 'incoming'] });
            qc.invalidateQueries({ queryKey: ['requests', 'my'] });
            closeDrawer();
        },
        onError: (e: any) => {
            const msg = e?.response?.data?.message || 'Gabim gjatë refuzimit.';
            setDrawerError(msg);
            alert(msg);
        },
    });

    const cancelM = useMutation({
        mutationFn: (p: { id: string; note?: string }) => cancelRequest(p.id, p.note || ''),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['requests', 'my'] });
            qc.invalidateQueries({ queryKey: ['requests', 'incoming'] });
            closeDrawer();
        },
        onError: (e: any) => {
            const msg = e?.response?.data?.message || 'Gabim gjatë anulimit.';
            setDrawerError(msg);
            alert(msg);
        },
    });

    const incomingItems = incQ.data?.items ?? [];
    const myItems = myQ.data?.items ?? [];

    const list = useMemo(() => {
        return tab === 'INCOMING' ? incomingItems : myItems;
    }, [tab, incomingItems, myItems]);

    // ✅ Validime minimale për create button
    const canSend =
        !!personId.trim() &&
        !!reason.trim() &&
        (action === 'TRANSFER_PERSON' || action === 'CHANGE_UNIT'
            ? !!targetUnitId.trim()
            : action === 'CHANGE_GRADE'
                ? !!targetGradeId.trim()
                : true);

    return (
        <div style={{ padding: 16, maxWidth: 1100, margin: '0 auto' }}>
            <h2 style={{ marginBottom: 6 }}>Kërkesat</h2>

            <div style={{ opacity: 0.8, marginBottom: 16 }}>
                Operator/Officer dërgon kërkesë → Commander i sheh (unit + nën-njësitë) → aprovon/refuzon. Arkivi mban të
                aprovuara/refuzuara/anuluara.
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                <button
                    onClick={() => setTab('MY')}
                    style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: tab === 'MY' ? 'rgba(255,255,255,0.08)' : 'transparent',
                    }}
                >
                    Kërkesat e mia {myQ.isFetching ? '…' : ''}
                </button>

                {canSeeIncoming && (
                    <button
                        onClick={() => setTab('INCOMING')}
                        style={{
                            padding: '8px 12px',
                            borderRadius: 10,
                            border: '1px solid rgba(255,255,255,0.12)',
                            background: tab === 'INCOMING' ? 'rgba(255,255,255,0.08)' : 'transparent',
                        }}
                    >
                        Kërkesat e ardhura {incQ.isFetching ? '…' : ''}
                    </button>
                )}

                <div style={{ flex: 1 }} />

                {/* Active / Archive toggle */}
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        onClick={() => setView('ACTIVE')}
                        style={{
                            padding: '8px 12px',
                            borderRadius: 10,
                            border: '1px solid rgba(255,255,255,0.12)',
                            background: view === 'ACTIVE' ? 'rgba(255,255,255,0.08)' : 'transparent',
                        }}
                    >
                        Aktive
                    </button>

                    <button
                        onClick={() => setView('ARCHIVE')}
                        style={{
                            padding: '8px 12px',
                            borderRadius: 10,
                            border: '1px solid rgba(255,255,255,0.12)',
                            background: view === 'ARCHIVE' ? 'rgba(255,255,255,0.08)' : 'transparent',
                        }}
                    >
                        Arkiv
                    </button>
                </div>
            </div>

            {/* Create Request (vetëm në view ACTIVE) */}
            {view === 'ACTIVE' && (role === 'OPERATOR' || role === 'OFFICER' || role === 'COMMANDER') && (
                <div
                    style={{
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 14,
                        padding: 14,
                        marginBottom: 18,
                    }}
                >
                    <div style={{ fontWeight: 600, marginBottom: 10 }}>Dërgo kërkesë</div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {/* Autocomplete person */}
                        <label style={{ position: 'relative' }}>
                            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
                                Ushtari (kërko me emër / serviceNo / numër personal)
                            </div>

                            <input
                                value={selectedLabel || personQuery}
                                onFocus={() => setShowDropdown(true)}
                                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                                onChange={(e) => {
                                    setSelectedLabel('');
                                    setPersonId('');
                                    setPersonQuery(e.target.value);
                                    setShowDropdown(true);
                                }}
                                placeholder="Shkruaj p.sh. 'a', '124', 'Arben'..."
                                style={{ width: '100%', padding: 10, borderRadius: 10 }}
                            />

                            {showDropdown && debouncedQ.length >= 1 && !selectedLabel && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        zIndex: 50,
                                        top: '100%',
                                        left: 0,
                                        right: 0,
                                        marginTop: 6,
                                        background: 'rgba(20,20,20,0.98)',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        borderRadius: 12,
                                        overflow: 'hidden',
                                        maxHeight: 280,
                                        overflowY: 'auto',
                                    }}
                                >
                                    {peopleQ.isFetching ? (
                                        <div style={{ padding: 10, opacity: 0.8 }}>Duke kërkuar…</div>
                                    ) : activePeople.length === 0 ? (
                                        <div style={{ padding: 10, opacity: 0.8 }}>S’u gjet asnjë ushtar ACTIVE.</div>
                                    ) : (
                                        activePeople.map((p: any) => {
                                            const label = `${p.serviceNo} • ${p.firstName} ${p.lastName}`;
                                            const sub = `${p.personalNumber ? 'Nr: ' + p.personalNumber : ''}`;
                                            return (
                                                <div
                                                    key={p._id}
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        setPersonId(p._id);
                                                        setSelectedLabel(label);
                                                        setPersonQuery('');
                                                        setShowDropdown(false);
                                                    }}
                                                    style={{
                                                        padding: 10,
                                                        cursor: 'pointer',
                                                        borderTop: '1px solid rgba(255,255,255,0.06)',
                                                    }}
                                                >
                                                    <div style={{ fontWeight: 600 }}>{label}</div>
                                                    <div style={{ fontSize: 12, opacity: 0.75 }}>{sub}</div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}

                            <div style={{ fontSize: 11, opacity: 0.65, marginTop: 6 }}>
                                {personId ? '✅ Ushtari u zgjodh' : 'Zgjidh një ushtar nga lista.'}
                            </div>
                        </label>

                        <label>
                            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Aksioni</div>
                            <select
                                value={action}
                                onChange={(e) => setAction(e.target.value as RequestAction)}
                                style={{ width: '100%', padding: 10, borderRadius: 10 }}
                            >
                                {ACTIONS.map((a) => (
                                    <option key={a.value} value={a.value}>
                                        {a.label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        {(action === 'TRANSFER_PERSON' || action === 'CHANGE_UNIT') && (
                            <label>
                                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>toUnitId</div>
                                <input
                                    value={targetUnitId}
                                    onChange={(e) => setTargetUnitId(e.target.value)}
                                    placeholder="ObjectId i Unit"
                                    style={{ width: '100%', padding: 10, borderRadius: 10 }}
                                />
                            </label>
                        )}

                        {action === 'CHANGE_GRADE' && (
                            <label>
                                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>newGradeId</div>
                                <input
                                    value={targetGradeId}
                                    onChange={(e) => setTargetGradeId(e.target.value)}
                                    placeholder="p.sh. 'G-05' (string)"
                                    style={{ width: '100%', padding: 10, borderRadius: 10 }}
                                />
                            </label>
                        )}

                        {/* ✅ UPDATE_PERSON fields */}
                        {action === 'UPDATE_PERSON' && (
                            <div style={{ gridColumn: '1 / -1' }}>
                                <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>
                                    Zgjedh cilat të dhëna do të ndryshohen (plotëso vetëm ato që do me u ndryshu).
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <label>
                                        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>serviceNo</div>
                                        <input
                                            value={patch.serviceNo}
                                            onChange={(e) => setPatch((p) => ({ ...p, serviceNo: e.target.value }))}
                                            placeholder="Nr shërbimit"
                                            style={{ width: '100%', padding: 10, borderRadius: 10 }}
                                        />
                                    </label>

                                    <label>
                                        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>personalNumber</div>
                                        <input
                                            value={patch.personalNumber}
                                            onChange={(e) => setPatch((p) => ({ ...p, personalNumber: e.target.value }))}
                                            placeholder="Nr personal"
                                            style={{ width: '100%', padding: 10, borderRadius: 10 }}
                                        />
                                    </label>

                                    <label>
                                        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>firstName</div>
                                        <input
                                            value={patch.firstName}
                                            onChange={(e) => setPatch((p) => ({ ...p, firstName: e.target.value }))}
                                            placeholder="Emri"
                                            style={{ width: '100%', padding: 10, borderRadius: 10 }}
                                        />
                                    </label>

                                    <label>
                                        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>lastName</div>
                                        <input
                                            value={patch.lastName}
                                            onChange={(e) => setPatch((p) => ({ ...p, lastName: e.target.value }))}
                                            placeholder="Mbiemri"
                                            style={{ width: '100%', padding: 10, borderRadius: 10 }}
                                        />
                                    </label>

                                    <label>
                                        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>birthDate</div>
                                        <input
                                            type="date"
                                            value={patch.birthDate}
                                            onChange={(e) => setPatch((p) => ({ ...p, birthDate: e.target.value }))}
                                            style={{ width: '100%', padding: 10, borderRadius: 10 }}
                                        />
                                    </label>

                                    <label>
                                        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>gender</div>
                                        <select
                                            value={patch.gender}
                                            onChange={(e) => setPatch((p) => ({ ...p, gender: e.target.value as any }))}
                                            style={{ width: '100%', padding: 10, borderRadius: 10 }}
                                        >
                                            <option value="">—</option>
                                            <option value="M">M</option>
                                            <option value="F">F</option>
                                            <option value="O">O</option>
                                        </select>
                                    </label>

                                    <label>
                                        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>city</div>
                                        <input
                                            value={patch.city}
                                            onChange={(e) => setPatch((p) => ({ ...p, city: e.target.value }))}
                                            placeholder="Qyteti"
                                            style={{ width: '100%', padding: 10, borderRadius: 10 }}
                                        />
                                    </label>

                                    <label>
                                        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>phone</div>
                                        <input
                                            value={patch.phone}
                                            onChange={(e) => setPatch((p) => ({ ...p, phone: e.target.value }))}
                                            placeholder="Telefoni"
                                            style={{ width: '100%', padding: 10, borderRadius: 10 }}
                                        />
                                    </label>

                                    <label style={{ gridColumn: '1 / -1' }}>
                                        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>address</div>
                                        <input
                                            value={patch.address}
                                            onChange={(e) => setPatch((p) => ({ ...p, address: e.target.value }))}
                                            placeholder="Adresa"
                                            style={{ width: '100%', padding: 10, borderRadius: 10 }}
                                        />
                                    </label>

                                    <label>
                                        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>position</div>
                                        <input
                                            value={patch.position}
                                            onChange={(e) => setPatch((p) => ({ ...p, position: e.target.value }))}
                                            placeholder="Pozita"
                                            style={{ width: '100%', padding: 10, borderRadius: 10 }}
                                        />
                                    </label>

                                    <label>
                                        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>serviceStartDate</div>
                                        <input
                                            type="date"
                                            value={patch.serviceStartDate}
                                            onChange={(e) => setPatch((p) => ({ ...p, serviceStartDate: e.target.value }))}
                                            style={{ width: '100%', padding: 10, borderRadius: 10 }}
                                        />
                                    </label>

                                    <label style={{ gridColumn: '1 / -1' }}>
                                        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>notes</div>
                                        <textarea
                                            value={patch.notes}
                                            onChange={(e) => setPatch((p) => ({ ...p, notes: e.target.value }))}
                                            placeholder="Shënime"
                                            rows={3}
                                            style={{ width: '100%', padding: 10, borderRadius: 10 }}
                                        />
                                    </label>
                                </div>
                            </div>
                        )}

                        <label style={{ gridColumn: '1 / -1' }}>
                            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Arsyeja</div>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="Shkruaj arsyetimin…"
                                rows={3}
                                style={{ width: '100%', padding: 10, borderRadius: 10 }}
                            />
                        </label>
                    </div>

                    <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            onClick={() => createM.mutate()}
                            disabled={createM.isPending || !canSend}
                            style={{
                                padding: '10px 14px',
                                borderRadius: 12,
                                border: '1px solid rgba(255,255,255,0.12)',
                                background: 'rgba(255,255,255,0.08)',
                            }}
                        >
                            {createM.isPending ? 'Duke dërguar…' : 'Dërgo kërkesën'}
                        </button>
                    </div>
                </div>
            )}

            {/* List */}
            <div
                style={{
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 14,
                    overflow: 'hidden',
                }}
            >
                <div style={{ padding: 12, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <b>
                        {tab === 'INCOMING' ? 'Kërkesat e ardhura' : 'Kërkesat e mia'} — {view === 'ACTIVE' ? 'Aktive' : 'Arkiv'}
                    </b>
                </div>

                {list.length === 0 ? (
                    <div style={{ padding: 14, opacity: 0.8 }}>Nuk ka kërkesa.</div>
                ) : (
                    <div>
                        {list.map((it: RequestItem) => {
                            const shownType = (it as any).type ?? (it as any).action;
                            const shownReason = (it as any).payload?.reason ?? (it as any).reason ?? '';
                            const shownPerson =
                                (it as any).personId?.serviceNo
                                    ? `${(it as any).personId.serviceNo} ${(it as any).personId.firstName ?? ''} ${(it as any).personId.lastName ?? ''}`
                                    : String((it as any).personId ?? '');

                            const fromUser = (it as any).createdBy?.username ?? '—';
                            const unitShown = (it as any).targetUnitId?.name ?? (it as any).unitId ?? '—';

                            const id = (it as any).id ?? (it as any)._id;
                            const status = (it as any).status;

                            const patchPreview =
                                shownType === 'UPDATE_PERSON' ? (it as any)?.payload?.meta?.patch ?? (it as any)?.payload?.patch ?? null : null;

                            const decisionNote = (it as any)?.decisionNote ?? '';
                            const decidedAt = (it as any)?.decidedAt ?? null;

                            const canDownloadPdf = view === 'ARCHIVE' || status === 'APPROVED' || status === 'REJECTED' || status === 'CANCELLED';

                            const iconBtnStyle = {
                                padding: '8px 10px',
                                borderRadius: 10,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                            } as const;

                            return (
                                <div
                                    key={String(id)}
                                    style={{
                                        padding: 12,
                                        borderTop: '1px solid rgba(255,255,255,0.06)',
                                        display: 'grid',
                                        gridTemplateColumns: '1.2fr 1fr 1fr auto',
                                        gap: 10,
                                        alignItems: 'center',
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: 600 }}>
                                            {shownType} <span style={{ opacity: 0.7 }}>•</span> Person: {shownPerson}
                                        </div>
                                        <div style={{ fontSize: 12, opacity: 0.75 }}>{shownReason}</div>

                                        {patchPreview && (
                                            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                                                <span style={{ opacity: 0.75 }}>Ndryshimet:</span> {Object.keys(patchPreview).join(', ')}
                                            </div>
                                        )}

                                        {decisionNote && (status === 'REJECTED' || status === 'APPROVED' || status === 'CANCELLED') && (
                                            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                                                <span style={{ opacity: 0.75 }}>Vendimi:</span> {decisionNote}
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ fontSize: 12, opacity: 0.85 }}>
                                        Nga: <b>{fromUser}</b>
                                        <div style={{ opacity: 0.7 }}>Unit: {unitShown}</div>
                                    </div>

                                    <div>
                                        <Badge>{status}</Badge>
                                        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                                            Krijuar: {formatDateTime((it as any).createdAt)}
                                            {decidedAt ? <div>Vendosur: {formatDateTime(decidedAt)}</div> : null}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                        {/* ✅ Vetëm 1 buton Detaje */}
                                        <button
                                            onClick={() => openDrawer(it)}
                                            style={{ ...iconBtnStyle, cursor: 'pointer' }}
                                            title="Detaje"
                                            aria-label="Detaje"
                                        >
                                            <IconEye />
                                        </button>

                                        <button
                                            onClick={() => openRequestPdf(String(id), 'download')}
                                            disabled={!canDownloadPdf}
                                            style={{
                                                ...iconBtnStyle,
                                                opacity: !canDownloadPdf ? 0.6 : 1,
                                                cursor: !canDownloadPdf ? 'not-allowed' : 'pointer',
                                            }}
                                            title="Download PDF"
                                            aria-label="Download PDF"
                                        >
                                            <IconDownload />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ✅ Drawer */}
            {drawerOpen && (
                <div
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) closeDrawer();
                    }}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.55)',
                        zIndex: 999,
                        display: 'flex',
                        justifyContent: 'flex-end',
                    }}
                >
                    <div
                        style={{
                            width: 'min(520px, 92vw)',
                            height: '100%',
                            background: 'rgba(218,211,211,0.98)',
                            borderLeft: '1px solid rgba(255,255,255,0.12)',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                            padding: 14,
                            overflowY: 'auto',
                        }}
                    >
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <div style={{ fontWeight: 700, fontSize: 16 }}>Preview kërkese</div>
                            <div style={{ flex: 1 }} />
                            <button
                                onClick={closeDrawer}
                                style={{
                                    borderRadius: 10,
                                    padding: '8px 10px',
                                    border: '1px solid rgba(17,24,39,0.6)',
                                    background: 'transparent',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                }}
                                title="Mbyll"
                                aria-label="Mbyll"
                            >
                                <IconClose />
                            </button>
                        </div>

                        {/* Body */}
                        {(() => {
                            const it = selectedReq as any;
                            if (!it) return null;

                            const shownType = it.type ?? it.action;
                            const labelType = ACTION_LABEL[shownType] || shownType;

                            const shownReason = it.payload?.reason ?? it.reason ?? '';
                            const fromUser = it.createdBy?.username ?? '—';
                            const unitShown = it.targetUnitId?.name ?? it.unitId ?? '—';
                            const status = it.status;
                            const id = it.id ?? it._id;

                            const shownPerson = it.personId?.serviceNo
                                ? `${it.personId.serviceNo} ${it.personId.firstName ?? ''} ${it.personId.lastName ?? ''}`.trim()
                                : String(it.personId ?? '');

                            const createdAt = it.createdAt;
                            const decidedAt = it.decidedAt ?? null;
                            const decisionNote = it.decisionNote ?? '';

                            const patchObj = shownType === 'UPDATE_PERSON' ? it?.payload?.meta?.patch ?? it?.payload?.patch ?? null : null;

                            const canCommanderActions = tab === 'INCOMING' && (role === 'COMMANDER' || role === 'ADMIN' || role === 'AUDITOR');
                            const canMyCancel = tab === 'MY';

                            const canDownloadPdf = view === 'ARCHIVE' || status === 'APPROVED' || status === 'REJECTED' || status === 'CANCELLED';

                            return (
                                <>
                                    <div
                                        style={{
                                            border: '1px solid rgba(17,24,39,0.6)',
                                            borderRadius: 14,
                                            padding: 12,
                                            marginBottom: 12,
                                        }}
                                    >
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                                            <Badge>{status}</Badge>
                                            <div style={{ opacity: 0.8, fontSize: 12 }}>ID: {String(id)}</div>
                                        </div>

                                        <div style={{ fontWeight: 700, marginBottom: 6 }}>{labelType}</div>

                                        <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 6 }}>
                                            <span style={{ opacity: 0.7 }}>Person:</span> <b>{shownPerson}</b>
                                        </div>

                                        <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 6 }}>
                                            <span style={{ opacity: 0.7 }}>Nga:</span> <b>{fromUser}</b>
                                            <span style={{ marginLeft: 10, opacity: 0.7 }}>Unit:</span> <b>{unitShown}</b>
                                        </div>

                                        <div style={{ fontSize: 12, opacity: 0.75 }}>
                                            Krijuar: {formatDateTime(createdAt)}
                                            {decidedAt ? <div>Vendosur: {formatDateTime(decidedAt)}</div> : null}
                                        </div>

                                        {decisionNote && (status === 'REJECTED' || status === 'APPROVED' || status === 'CANCELLED') && (
                                            <div style={{ marginTop: 10, fontSize: 13 }}>
                                                <div style={{ opacity: 0.7, marginBottom: 4 }}>Vendimi</div>
                                                <div style={{ whiteSpace: 'pre-wrap' }}>{decisionNote}</div>
                                            </div>
                                        )}
                                    </div>

                                    <div
                                        style={{
                                            border: '1px solid rgba(17,24,39,0.6)',
                                            borderRadius: 14,
                                            padding: 12,
                                            marginBottom: 12,
                                        }}
                                    >
                                        <div style={{ opacity: 0.75, fontSize: 12, marginBottom: 6 }}>Arsyeja e kërkesës</div>
                                        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{shownReason || '—'}</div>
                                    </div>

                                    {patchObj && (
                                        <div
                                            style={{
                                                border: '1px solid rgba(17,24,39,0.6)',
                                                borderRadius: 14,
                                                padding: 12,
                                                marginBottom: 12,
                                            }}
                                        >
                                            <div style={{ opacity: 0.75, fontSize: 12, marginBottom: 8 }}>Ndryshimet e kërkuara</div>

                                            {Object.keys(patchObj).length === 0 ? (
                                                <div style={{ opacity: 0.8, fontSize: 13 }}>—</div>
                                            ) : (
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                                    {Object.entries(patchObj).map(([k, v]) => (
                                                        <div
                                                            key={k}
                                                            style={{
                                                                border: '1px solid rgba(17,24,39,0.6)',
                                                                borderRadius: 12,
                                                                padding: 10,
                                                            }}
                                                        >
                                                            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{k}</div>
                                                            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>
                                                                {isPrimitive(v) ? prettyValue(v) : prettyValue(v)}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* PDF actions */}
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                                        <button
                                            onClick={() => openRequestPdf(String(id), 'preview')}
                                            style={{
                                                padding: '10px 12px',
                                                borderRadius: 12,
                                                border: '1px solid rgba(17,24,39,0.6)',
                                                background: 'rgba(255,255,255,0.06)',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 8,
                                            }}
                                            title="Preview PDF"
                                        >
                                            <IconEye /> Preview PDF
                                        </button>

                                        <button
                                            onClick={() => openRequestPdf(String(id), 'download')}
                                            disabled={!canDownloadPdf}
                                            style={{
                                                padding: '10px 12px',
                                                borderRadius: 12,
                                                border: '1px solid rgba(17,24,39,0.6)',
                                                background: 'rgba(255,255,255,0.06)',
                                                cursor: !canDownloadPdf ? 'not-allowed' : 'pointer',
                                                opacity: !canDownloadPdf ? 0.6 : 1,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 8,
                                            }}
                                            title="Download PDF"
                                        >
                                            <IconDownload /> Download PDF
                                        </button>
                                    </div>

                                    {/* Decision actions */}
                                    {drawerError ? (
                                        <div
                                            style={{
                                                marginBottom: 10,
                                                padding: 10,
                                                borderRadius: 12,
                                                border: '1px solid rgba(255,0,0,0.25)',
                                                opacity: 0.95,
                                            }}
                                        >
                                            {drawerError}
                                        </div>
                                    ) : null}

                                    {canCommanderActions ? (
                                        <div
                                            style={{
                                                border: '1px solid rgba(17,24,39,0.6)',
                                                borderRadius: 14,
                                                padding: 12,
                                                marginBottom: 10,
                                            }}
                                        >
                                            <div style={{ fontWeight: 700, marginBottom: 10 }}>Veprime (Commander)</div>

                                            <label style={{ display: 'block', marginBottom: 10 }}>
                                                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Shënim për aprovim (opsional)</div>
                                                <textarea
                                                    value={approveNote}
                                                    onChange={(e) => setApproveNote(e.target.value)}
                                                    rows={3}
                                                    style={{ width: '100%', padding: 10, borderRadius: 10 }}
                                                    placeholder="Shkruaj shënimin (nëse ke)…"
                                                />
                                            </label>

                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                <button
                                                    onClick={() => approveM.mutate({ id: String(id), note: approveNote.trim() })}
                                                    disabled={approveM.isPending || status !== 'PENDING' || view === 'ARCHIVE'}
                                                    style={{
                                                        padding: '10px 12px',
                                                        borderRadius: 12,
                                                        border: '1px solid rgba(17,24,39,0.6)',
                                                        background: 'rgba(0,255,0,0.08)',
                                                        cursor: status !== 'PENDING' ? 'not-allowed' : 'pointer',
                                                        opacity: status !== 'PENDING' ? 0.6 : 1,
                                                    }}
                                                >
                                                    {approveM.isPending ? 'Duke aprovuar…' : 'Aprovo'}
                                                </button>
                                            </div>

                                            <div style={{ height: 10 }} />

                                            <label style={{ display: 'block', marginBottom: 10 }}>
                                                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Arsyeja e refuzimit (obligative)</div>
                                                <textarea
                                                    value={rejectNote}
                                                    onChange={(e) => setRejectNote(e.target.value)}
                                                    rows={3}
                                                    style={{ width: '100%', padding: 10, borderRadius: 10 }}
                                                    placeholder="Shkruaj arsyen e refuzimit…"
                                                />
                                            </label>

                                            <button
                                                onClick={() => {
                                                    const n = rejectNote.trim();
                                                    if (!n) return setDrawerError('Duhet me shkru arsyen e refuzimit.');
                                                    rejectM.mutate({ id: String(id), note: n });
                                                }}
                                                disabled={rejectM.isPending || status !== 'PENDING' || view === 'ARCHIVE'}
                                                style={{
                                                    padding: '10px 12px',
                                                    borderRadius: 12,
                                                    border: '1px solid rgba(17,24,39,0.6)',
                                                    background: 'rgba(255,0,0,0.10)',
                                                    cursor: status !== 'PENDING' ? 'not-allowed' : 'pointer',
                                                    opacity: status !== 'PENDING' ? 0.6 : 1,
                                                }}
                                            >
                                                {rejectM.isPending ? 'Duke refuzuar…' : 'Refuzo'}
                                            </button>
                                        </div>
                                    ) : canMyCancel ? (
                                        <div
                                            style={{
                                                border: '1px solid rgba(17,24,39,0.6)',
                                                borderRadius: 14,
                                                padding: 12,
                                                marginBottom: 10,
                                            }}
                                        >
                                            <div style={{ fontWeight: 700, marginBottom: 10 }}>Veprime (Anulo kërkesën)</div>

                                            <label style={{ display: 'block', marginBottom: 10 }}>
                                                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Shënim për anulim (opsional)</div>
                                                <textarea
                                                    value={approveNote}
                                                    onChange={(e) => setApproveNote(e.target.value)}
                                                    rows={3}
                                                    style={{ width: '100%', padding: 10, borderRadius: 10 }}
                                                    placeholder="Shkruaj shënimin (nëse ke)…"
                                                />
                                            </label>

                                            <button
                                                onClick={() => cancelM.mutate({ id: String(id), note: approveNote.trim() })}
                                                disabled={cancelM.isPending || view === 'ARCHIVE' || status !== 'PENDING'}
                                                style={{
                                                    padding: '10px 12px',
                                                    borderRadius: 12,
                                                    border: '1px solid rgba(17,24,39,0.6)',
                                                    background: 'rgba(255,255,255,0.06)',
                                                    cursor: status !== 'PENDING' ? 'not-allowed' : 'pointer',
                                                    opacity: status !== 'PENDING' ? 0.6 : 1,
                                                }}
                                            >
                                                {cancelM.isPending ? 'Duke anuluar…' : 'Anulo'}
                                            </button>
                                        </div>
                                    ) : null}

                                    <div style={{ height: 20 }} />
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
}

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
    type UserRole,
} from '../lib/api';

/* ===============================
   Helpers
================================ */

function cn(...v: Array<string | false | null | undefined>) {
    return v.filter(Boolean).join(' ');
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

function getApiOrigin() {
    const base = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000/api';
    return String(base).replace(/\/api\/?$/, '');
}

// ✅ preview/download modes (opens server PDF with ?auth= token)
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

/* ===============================
   Small UI
================================ */

function Badge({
    children,
    tone = 'neutral',
}: {
    children: any;
    tone?: 'neutral' | 'green' | 'red' | 'amber' | 'blue' | 'purple';
}) {
    const cls =
        tone === 'green'
            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
            : tone === 'red'
                ? 'bg-rose-50 text-rose-700 ring-rose-200'
                : tone === 'amber'
                    ? 'bg-amber-50 text-amber-800 ring-amber-200'
                    : tone === 'blue'
                        ? 'bg-sky-50 text-sky-700 ring-sky-200'
                        : tone === 'purple'
                            ? 'bg-violet-50 text-violet-700 ring-violet-200'
                            : 'bg-slate-50 text-slate-700 ring-slate-200';

    return (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1', cls)}>
            {children}
        </span>
    );
}

/** Icons */
function IconEye({ size = 18 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 11l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 19h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function IconClose({ size = 18 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

/* ===============================
   Actions / Labels
================================ */

// ✅ NOTE: RequestAction from api.ts now includes 'CREATE_USER'. If your api.ts still doesn't,
// update it first (as we did earlier).
const BASE_ACTIONS: Array<{ value: RequestAction; label: string }> = [
    { value: 'DELETE_PERSON', label: 'Fshi ushtar nga sistemi' },
    { value: 'TRANSFER_PERSON', label: 'Transfero ushtar (në njësi tjetër)' },
    { value: 'CHANGE_GRADE', label: 'Ndrysho gradën' },
    { value: 'CHANGE_UNIT', label: 'Ndrysho njësinë (brenda strukturës)' },
    { value: 'DEACTIVATE_PERSON', label: 'Çaktivizo ushtar' },
    { value: 'UPDATE_PERSON', label: 'Ndrysho të dhënat (kërkesë për përditësim)' },
    // ✅ e re: vetëm Commander do ta shohë këtë opsion
    { value: 'CREATE_USER' as RequestAction, label: 'Krijo përdorues (OFFICER/Rreshter/etj.)' },
];

const ACTION_LABEL: Record<string, string> = BASE_ACTIONS.reduce((acc, a) => {
    acc[a.value] = a.label;
    return acc;
}, {} as Record<string, string>);

function statusTone(s: string) {
    const up = String(s || '').toUpperCase();
    if (up === 'APPROVED') return 'green';
    if (up === 'REJECTED') return 'red';
    if (up === 'CANCELLED') return 'amber';
    if (up === 'PENDING') return 'blue';
    return 'neutral';
}

function isValidEmail(email: string) {
    const e = String(email || '').trim();
    if (!e) return false;
    // simple + safe enough for UI
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function dateToISO(d: string) {
    const s = String(d || '').trim();
    return s || null;
}

/* ===============================
   Page
================================ */

export default function Requests() {
    const role = getRole();
    const unitId = getCurrentUnitId();
    const qc = useQueryClient();

    const canSeeIncoming = role === 'COMMANDER' || role === 'ADMIN' || role === 'AUDITOR';
    const [tab, setTab] = useState<'MY' | 'INCOMING'>(canSeeIncoming ? 'INCOMING' : 'MY');

    // ✅ Active/Archive
    const [view, setView] = useState<'ACTIVE' | 'ARCHIVE'>('ACTIVE');
    const statusParam: RequestStatus = view === 'ARCHIVE' ? 'ARCHIVE' : 'PENDING';

    // Drawer state
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [selectedReq, setSelectedReq] = useState<RequestItem | null>(null);
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

    /* ===============================
       Queries
    ============================== */

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

    const incomingItems = incQ.data?.items ?? [];
    const myItems = myQ.data?.items ?? [];

    const list = useMemo(() => {
        return tab === 'INCOMING' ? incomingItems : myItems;
    }, [tab, incomingItems, myItems]);

    /* ===============================
       Create: person-request states
    ============================== */

    const [personId, setPersonId] = useState('');
    const [personQuery, setPersonQuery] = useState('');
    const [debouncedQ, setDebouncedQ] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [selectedLabel, setSelectedLabel] = useState('');

    // ✅ actions: komandanti i sheh edhe CREATE_USER, të tjerët jo
    const availableActions = useMemo(() => {
        if (role === 'COMMANDER') return BASE_ACTIONS;
        return BASE_ACTIONS.filter((a) => a.value !== ('CREATE_USER' as RequestAction));
    }, [role]);

    const [action, setAction] = useState<RequestAction>('TRANSFER_PERSON');
    const [targetUnitId, setTargetUnitId] = useState('');
    const [targetGradeId, setTargetGradeId] = useState('');
    const [reason, setReason] = useState('');

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

    const peopleQ = useQuery({
        queryKey: ['people-search', debouncedQ],
        queryFn: () => searchPeople(debouncedQ, 1, 8),
        // ✅ mos kërko njerëz kur është CREATE_USER
        enabled: showDropdown && debouncedQ.length >= 1 && action !== ('CREATE_USER' as RequestAction),
    });

    const activePeople = useMemo(() => {
        const items = (peopleQ.data?.items ?? []) as any[];
        return items.filter((p) => String(p?.status ?? '').toUpperCase() === 'ACTIVE');
    }, [peopleQ.data]);

    /* ===============================
       Create: user-request states (Commander only)
    ============================== */

    const [newUsername, setNewUsername] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newRole, setNewRole] = useState<UserRole>('OFFICER' as UserRole);

    // kontrata
    const [contractFrom, setContractFrom] = useState('');
    const [contractTo, setContractTo] = useState('');
    const [neverExpires, setNeverExpires] = useState(true);

    // default: kërko me ndërru password
    const [mustChangePassword, setMustChangePassword] = useState(true);

    // ✅ kur roli s’është commander, sigurohu që aksioni s’mund të mbetet CREATE_USER
    useEffect(() => {
        if (role !== 'COMMANDER' && action === ('CREATE_USER' as RequestAction)) {
            setAction('TRANSFER_PERSON');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role]);

    /* ===============================
       Mutations
    ============================== */

    const createM = useMutation({
        mutationFn: async () => {
            // ✅ CREATE_USER (vetëm commander)
            if (action === ('CREATE_USER' as RequestAction)) {
                if (role !== 'COMMANDER') throw new Error('Vetëm Commander mundet me kriju kërkesë për përdorues.');

                const email = newEmail.trim();
                if (!isValidEmail(email)) throw new Error('Email nuk është në format të saktë.');

                // ✅ validate contract dates if not neverExpires
                if (!neverExpires) {
                    if (!contractFrom.trim() || !contractTo.trim()) {
                        throw new Error('Kur kontrata skadon, duhet me zgjedh Data fillimit dhe Data mbarimit.');
                    }
                    const a = new Date(contractFrom);
                    const b = new Date(contractTo);
                    if (!Number.isNaN(a.getTime()) && !Number.isNaN(b.getTime()) && a.getTime() > b.getTime()) {
                        throw new Error('Data e fillimit nuk mundet me qenë pas datës së mbarimit.');
                    }
                }

                const payload: any = {
                    reason: reason.trim(),
                    user: {
                        username: newUsername.trim(),
                        email,
                        role: newRole,
                        unitId: unitId || null, // zakonisht njësia e komandantit
                        contractValidFrom: neverExpires ? null : dateToISO(contractFrom),
                        contractValidTo: neverExpires ? null : dateToISO(contractTo),
                        neverExpires: !!neverExpires,
                        mustChangePassword: !!mustChangePassword,
                    },
                };

                // personId bosh për CREATE_USER
                return createRequest({ personId: '', type: 'CREATE_USER' as any, payload });
            }

            // ✅ request për person
            const base = {
                personId: personId.trim(),
                type: action as any,
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
            // reset person form
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

            // reset user form
            setNewUsername('');
            setNewEmail('');
            setNewRole('OFFICER' as UserRole);
            setContractFrom('');
            setContractTo('');
            setNeverExpires(true);
            setMustChangePassword(true);

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

    /* ===============================
       Validations (send button)
    ============================== */

    const canSend =
        !!reason.trim() &&
        (action === ('CREATE_USER' as RequestAction)
            ? role === 'COMMANDER' &&
            !!newUsername.trim() &&
            isValidEmail(newEmail) &&
            !!String(newRole || '').trim() &&
            (neverExpires ? true : !!contractFrom.trim() && !!contractTo.trim())
            : !!personId.trim() &&
            (action === 'TRANSFER_PERSON' || action === 'CHANGE_UNIT'
                ? !!targetUnitId.trim()
                : action === 'CHANGE_GRADE'
                    ? !!targetGradeId.trim()
                    : true));

    const canCreateBox = view === 'ACTIVE' && (role === 'OPERATOR' || role === 'OFFICER' || role === 'COMMANDER');

    return (
        <div className="mx-auto max-w-6xl px-4 py-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Kërkesat</h1>
                    <p className="text-sm text-slate-600 mt-1">

                    </p>
                </div>
            </div>

            {/* Tabs + View */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                    <button
                        onClick={() => setTab('MY')}
                        className={cn(
                            'px-3 py-2 text-sm rounded-lg transition',
                            tab === 'MY' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                        )}
                    >
                        Kërkesat e mia {myQ.isFetching ? '…' : ''}
                    </button>

                    {canSeeIncoming && (
                        <button
                            onClick={() => setTab('INCOMING')}
                            className={cn(
                                'px-3 py-2 text-sm rounded-lg transition',
                                tab === 'INCOMING' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                            )}
                        >
                            Kërkesat e ardhura {incQ.isFetching ? '…' : ''}
                        </button>
                    )}
                </div>

                <div className="flex-1" />

                <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                    <button
                        onClick={() => setView('ACTIVE')}
                        className={cn(
                            'px-3 py-2 text-sm rounded-lg transition',
                            view === 'ACTIVE' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                        )}
                    >
                        Aktive
                    </button>
                    <button
                        onClick={() => setView('ARCHIVE')}
                        className={cn(
                            'px-3 py-2 text-sm rounded-lg transition',
                            view === 'ARCHIVE' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                        )}
                    >
                        Arkiv
                    </button>
                </div>
            </div>

            {/* Create */}
            {canCreateBox && (
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="px-4 py-3 border-b border-slate-200">
                        <div className="font-semibold">Dërgo kërkesë</div>
                        <div className="text-xs text-slate-600 mt-1">Zgjedh aksionin dhe plotëso fushat. Kërkesa shkon për aprovim sipas rolit.</div>
                    </div>

                    <div className="p-4 space-y-4">
                        {/* Aksioni + Arsyeja */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <label className="space-y-1">
                                <div className="text-xs font-medium text-slate-700">Aksioni</div>
                                <select
                                    value={action}
                                    onChange={(e) => {
                                        const v = e.target.value as RequestAction;
                                        setAction(v);

                                        // reset person picker kur kalon te CREATE_USER
                                        if (v === ('CREATE_USER' as RequestAction)) {
                                            setPersonId('');
                                            setPersonQuery('');
                                            setSelectedLabel('');
                                            setShowDropdown(false);
                                        }
                                    }}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                                >
                                    {availableActions.map((a) => (
                                        <option key={a.value} value={a.value}>
                                            {a.label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="space-y-1">
                                <div className="text-xs font-medium text-slate-700">Arsyeja</div>
                                <textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    rows={3}
                                    placeholder="Shkruaj arsyetimin…"
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                                />
                            </label>
                        </div>

                        {/* CREATE_USER (Commander only) */}
                        {action === ('CREATE_USER' as RequestAction) && role === 'COMMANDER' && (
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                                <div className="font-semibold text-slate-900">Krijo përdorues (kërkesë për Admin)</div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <label className="space-y-1">
                                        <div className="text-xs font-medium text-slate-700">Username</div>
                                        <input
                                            value={newUsername}
                                            onChange={(e) => setNewUsername(e.target.value)}
                                            placeholder="p.sh. rreshter1"
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                                        />
                                    </label>

                                    <label className="space-y-1">
                                        <div className="text-xs font-medium text-slate-700">Email (për njoftim)</div>
                                        <input
                                            value={newEmail}
                                            onChange={(e) => setNewEmail(e.target.value)}
                                            placeholder="p.sh. user@domain.com"
                                            className={cn(
                                                'w-full rounded-xl border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2',
                                                newEmail.trim().length === 0
                                                    ? 'border-slate-200 bg-white focus:ring-slate-300'
                                                    : isValidEmail(newEmail)
                                                        ? 'border-slate-200 bg-white focus:ring-slate-300'
                                                        : 'border-rose-300 bg-rose-50 focus:ring-rose-200'
                                            )}
                                        />
                                        {newEmail.trim().length > 0 && !isValidEmail(newEmail) ? (
                                            <div className="text-xs text-rose-700">Email nuk është valid.</div>
                                        ) : null}
                                    </label>

                                    <label className="space-y-1">
                                        <div className="text-xs font-medium text-slate-700">Roli</div>
                                        <select
                                            value={newRole as any}
                                            onChange={(e) => setNewRole(e.target.value as any)}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                                        >
                                            <option value="OFFICER">OFFICER</option>
                                            <option value="OPERATOR">OPERATOR</option>
                                            <option value="COMMANDER">COMMANDER</option>
                                            <option value="AUDITOR">AUDITOR</option>
                                            <option value="ADMIN">ADMIN</option>
                                        </select>
                                    </label>
                                </div>

                                {/* Kontrata */}
                                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="font-semibold text-sm text-slate-900">Kontrata e vlefshmërisë</div>

                                        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                            <input
                                                type="checkbox"
                                                checked={neverExpires}
                                                onChange={(e) => setNeverExpires(e.target.checked)}
                                                className="h-4 w-4 rounded border-slate-300"
                                            />
                                            Nuk skadon kurrë
                                        </label>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <label className="space-y-1">
                                            <div className="text-xs font-medium text-slate-700">Data fillimit</div>
                                            <input
                                                type="date"
                                                value={contractFrom}
                                                onChange={(e) => setContractFrom(e.target.value)}
                                                disabled={neverExpires}
                                                className={cn(
                                                    'w-full rounded-xl border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2',
                                                    neverExpires ? 'border-slate-200 bg-slate-100 text-slate-500' : 'border-slate-200 bg-white focus:ring-slate-300'
                                                )}
                                            />
                                        </label>

                                        <label className="space-y-1">
                                            <div className="text-xs font-medium text-slate-700">Data mbarimit</div>
                                            <input
                                                type="date"
                                                value={contractTo}
                                                onChange={(e) => setContractTo(e.target.value)}
                                                disabled={neverExpires}
                                                className={cn(
                                                    'w-full rounded-xl border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2',
                                                    neverExpires ? 'border-slate-200 bg-slate-100 text-slate-500' : 'border-slate-200 bg-white focus:ring-slate-300'
                                                )}
                                            />
                                        </label>
                                    </div>

                                    {!neverExpires && contractFrom && contractTo ? (
                                        (() => {
                                            const a = new Date(contractFrom);
                                            const b = new Date(contractTo);
                                            const ok = Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) ? true : a.getTime() <= b.getTime();
                                            return ok ? null : <div className="text-xs text-rose-700">Data fillimit nuk mundet me qenë pas datës së mbarimit.</div>;
                                        })()
                                    ) : null}

                                    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={mustChangePassword}
                                            onChange={(e) => setMustChangePassword(e.target.checked)}
                                            className="h-4 w-4 rounded border-slate-300"
                                        />
                                        Kërko nga përdoruesi të ndryshojë fjalëkalimin në login-in e parë
                                    </label>

                                    <div className="text-xs text-slate-600">* Email përdoret vetëm për njoftim kur Admini e aprovon kërkesën.</div>
                                </div>
                            </div>
                        )}

                        {/* Person-requests (jo CREATE_USER) */}
                        {action !== ('CREATE_USER' as RequestAction) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {/* Person search */}
                                <label className="relative space-y-1">
                                    <div className="text-xs font-medium text-slate-700">Ushtari (kërko me emër / serviceNo / numër personal)</div>
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
                                        placeholder="Kerko ushtarin…"
                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                                    />

                                    {showDropdown && debouncedQ.length >= 1 && !selectedLabel && (
                                        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                                            {peopleQ.isFetching ? (
                                                <div className="px-3 py-2 text-sm text-slate-600">Duke kërkuar…</div>
                                            ) : activePeople.length === 0 ? (
                                                <div className="px-3 py-2 text-sm text-slate-600">S’u gjet asnjë ushtar ACTIVE.</div>
                                            ) : (
                                                <div className="max-h-72 overflow-auto">
                                                    {activePeople.map((p: any) => {
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
                                                                className="cursor-pointer px-3 py-2 hover:bg-slate-50 border-t border-slate-100"
                                                            >
                                                                <div className="text-sm font-semibold text-slate-900">{label}</div>
                                                                <div className="text-xs text-slate-600">{sub}</div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="text-xs text-slate-500">{personId ? '✅ Ushtari u zgjodh' : 'Zgjidh një ushtar nga lista.'}</div>
                                </label>

                                {/* extra inputs */}
                                {(action === 'TRANSFER_PERSON' || action === 'CHANGE_UNIT') && (
                                    <label className="space-y-1">
                                        <div className="text-xs font-medium text-slate-700">toUnitId</div>
                                        <input
                                            value={targetUnitId}
                                            onChange={(e) => setTargetUnitId(e.target.value)}
                                            placeholder="ObjectId i Unit"
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                                        />
                                    </label>
                                )}

                                {action === 'CHANGE_GRADE' && (
                                    <label className="space-y-1">
                                        <div className="text-xs font-medium text-slate-700">newGradeId</div>
                                        <input
                                            value={targetGradeId}
                                            onChange={(e) => setTargetGradeId(e.target.value)}
                                            placeholder="p.sh. 'G-05' (string)"
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                                        />
                                    </label>
                                )}

                                {action === 'UPDATE_PERSON' && (
                                    <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                                        <div className="text-sm font-semibold text-slate-900">Ndryshimet e kërkuara</div>
                                        <div className="text-xs text-slate-600">Plotëso vetëm fushat që do me u ndryshu.</div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {[
                                                ['serviceNo', 'Nr shërbimit'],
                                                ['personalNumber', 'Nr personal'],
                                                ['firstName', 'Emri'],
                                                ['lastName', 'Mbiemri'],
                                                ['city', 'Qyteti'],
                                                ['phone', 'Telefoni'],
                                                ['position', 'Pozita'],
                                            ].map(([key, ph]) => (
                                                <label key={key} className="space-y-1">
                                                    <div className="text-xs font-medium text-slate-700">{key}</div>
                                                    <input
                                                        value={(patch as any)[key]}
                                                        onChange={(e) => setPatch((p) => ({ ...p, [key]: e.target.value }))}
                                                        placeholder={ph}
                                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                                                    />
                                                </label>
                                            ))}

                                            <label className="space-y-1">
                                                <div className="text-xs font-medium text-slate-700">birthDate</div>
                                                <input
                                                    type="date"
                                                    value={patch.birthDate}
                                                    onChange={(e) => setPatch((p) => ({ ...p, birthDate: e.target.value }))}
                                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                                                />
                                            </label>

                                            <label className="space-y-1">
                                                <div className="text-xs font-medium text-slate-700">gender</div>
                                                <select
                                                    value={patch.gender}
                                                    onChange={(e) => setPatch((p) => ({ ...p, gender: e.target.value as any }))}
                                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                                                >
                                                    <option value="">—</option>
                                                    <option value="M">M</option>
                                                    <option value="F">F</option>
                                                    <option value="O">O</option>
                                                </select>
                                            </label>

                                            <label className="space-y-1">
                                                <div className="text-xs font-medium text-slate-700">serviceStartDate</div>
                                                <input
                                                    type="date"
                                                    value={patch.serviceStartDate}
                                                    onChange={(e) => setPatch((p) => ({ ...p, serviceStartDate: e.target.value }))}
                                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                                                />
                                            </label>

                                            <label className="md:col-span-2 space-y-1">
                                                <div className="text-xs font-medium text-slate-700">address</div>
                                                <input
                                                    value={patch.address}
                                                    onChange={(e) => setPatch((p) => ({ ...p, address: e.target.value }))}
                                                    placeholder="Adresa"
                                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                                                />
                                            </label>

                                            <label className="md:col-span-2 space-y-1">
                                                <div className="text-xs font-medium text-slate-700">notes</div>
                                                <textarea
                                                    value={patch.notes}
                                                    onChange={(e) => setPatch((p) => ({ ...p, notes: e.target.value }))}
                                                    rows={3}
                                                    placeholder="Shënime"
                                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                                                />
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex justify-end">
                            <button
                                onClick={() => createM.mutate()}
                                disabled={createM.isPending || !canSend}
                                className={cn(
                                    'rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition',
                                    createM.isPending || !canSend ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-slate-800'
                                )}
                            >
                                {createM.isPending ? 'Duke dërguar…' : 'Dërgo kërkesën'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* List */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <div className="font-semibold">
                        {tab === 'INCOMING' ? 'Kërkesat e ardhura' : 'Kërkesat e mia'} — {view === 'ACTIVE' ? 'Aktive' : 'Arkiv'}
                    </div>
                    <div className="text-xs text-slate-600">{list.length} rezultate</div>
                </div>

                {list.length === 0 ? (
                    <div className="p-4 text-sm text-slate-600">Nuk ka kërkesa.</div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {list.map((it: RequestItem) => {
                            const shownType = (it as any).type ?? (it as any).action;
                            const shownReason = (it as any).payload?.reason ?? (it as any).reason ?? '';
                            const id = (it as any).id ?? (it as any)._id;
                            const status = (it as any).status;

                            // person / user preview
                            const isCreateUser = String(shownType) === 'CREATE_USER';
                            const u = (it as any)?.payload?.user ?? null;

                            const shownPerson =
                                (it as any).personId?.serviceNo
                                    ? `${(it as any).personId.serviceNo} ${(it as any).personId.firstName ?? ''} ${(it as any).personId.lastName ?? ''}`.trim()
                                    : String((it as any).personId ?? '');

                            const titleLeft = isCreateUser ? `CREATE_USER • ${u?.username ?? '—'}` : `${shownType} • Person: ${shownPerson}`;

                            const fromUser = (it as any).createdBy?.username ?? '—';
                            const unitShown = (it as any).targetUnitId?.name ?? (it as any).unitId ?? '—';

                            const patchPreview =
                                shownType === 'UPDATE_PERSON' ? (it as any)?.payload?.meta?.patch ?? (it as any)?.payload?.patch ?? null : null;

                            const decisionNote = (it as any)?.decisionNote ?? '';
                            const decidedAt = (it as any)?.decidedAt ?? null;

                            const canDownloadPdf = view === 'ARCHIVE' || status === 'APPROVED' || status === 'REJECTED' || status === 'CANCELLED';

                            return (
                                <div key={String(id)} className="p-4 grid grid-cols-1 md:grid-cols-[1.6fr_1fr_0.8fr_auto] gap-3 items-start">
                                    <div className="space-y-1">
                                        <div className="font-semibold text-slate-900">{titleLeft}</div>
                                        <div className="text-sm text-slate-600 whitespace-pre-wrap">{shownReason}</div>

                                        {isCreateUser && u ? (
                                            <div className="mt-2 text-xs text-slate-600">
                                                <div>
                                                    <span className="text-slate-500">Email:</span> <b>{u.email ?? '—'}</b>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500">Roli:</span> <b>{u.role ?? '—'}</b>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500">Kontrata:</span>{' '}
                                                    <b>{u.neverExpires ? 'Pa afat skadimi' : `${u.contractValidFrom ?? '—'} → ${u.contractValidTo ?? '—'}`}</b>
                                                </div>
                                            </div>
                                        ) : null}

                                        {patchPreview ? (
                                            <div className="text-xs text-slate-600 mt-2">
                                                <span className="text-slate-500">Ndryshimet:</span> {Object.keys(patchPreview).join(', ')}
                                            </div>
                                        ) : null}

                                        {decisionNote && (status === 'REJECTED' || status === 'APPROVED' || status === 'CANCELLED') ? (
                                            <div className="text-xs text-slate-700 mt-2">
                                                <span className="text-slate-500">Vendimi:</span> {decisionNote}
                                            </div>
                                        ) : null}
                                    </div>

                                    <div className="text-xs text-slate-600">
                                        <div>
                                            Nga: <b className="text-slate-900">{fromUser}</b>
                                        </div>
                                        <div className="mt-1">
                                            Unit: <b className="text-slate-900">{unitShown}</b>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Badge tone={statusTone(status)}>{status}</Badge>
                                        <div className="text-xs text-slate-500">
                                            Krijuar: {formatDateTime((it as any).createdAt)}
                                            {decidedAt ? <div>Vendosur: {formatDateTime(decidedAt)}</div> : null}
                                        </div>
                                    </div>

                                    <div className="flex gap-2 justify-end">
                                        <button
                                            onClick={() => openDrawer(it)}
                                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:bg-slate-50 shadow-sm"
                                            title="Detaje"
                                            aria-label="Detaje"
                                        >
                                            <IconEye />
                                        </button>

                                        <button
                                            onClick={() => openRequestPdf(String(id), 'download')}
                                            disabled={!canDownloadPdf}
                                            className={cn(
                                                'inline-flex items-center justify-center rounded-xl border px-3 py-2 shadow-sm',
                                                canDownloadPdf ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50' : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                            )}
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

            {/* Drawer */}
            {drawerOpen && (
                <div
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) closeDrawer();
                    }}
                    className="fixed inset-0 z-[999] bg-black/50 flex justify-end"
                >
                    <div className="h-full w-[min(560px,92vw)] bg-white border-l border-slate-200 shadow-2xl overflow-y-auto">
                        {/* header */}
                        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
                            <div className="font-semibold">Detaje të kërkesës</div>
                            <div className="flex-1" />
                            <button
                                onClick={closeDrawer}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:bg-slate-50 shadow-sm"
                                title="Mbyll"
                                aria-label="Mbyll"
                            >
                                <IconClose />
                            </button>
                        </div>

                        {/* body */}
                        <div className="p-4">
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

                                // ✅ Admini edhe Commander i kanë actions në INCOMING
                                const canCommanderActions = tab === 'INCOMING' && (role === 'COMMANDER' || role === 'ADMIN' || role === 'AUDITOR');
                                const canMyCancel = tab === 'MY';

                                const canDownloadPdf = view === 'ARCHIVE' || status === 'APPROVED' || status === 'REJECTED' || status === 'CANCELLED';

                                const isCreateUser = String(shownType) === 'CREATE_USER';
                                const u = it?.payload?.user ?? null;

                                return (
                                    <>
                                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                            <div className="flex items-center gap-2">
                                                <Badge tone={statusTone(status)}>{status}</Badge>
                                                <div className="text-xs text-slate-500">ID: {String(id)}</div>
                                            </div>

                                            <div className="mt-3 font-semibold text-slate-900">{labelType}</div>

                                            {!isCreateUser ? (
                                                <div className="mt-2 text-sm text-slate-700">
                                                    <span className="text-slate-500">Person:</span> <b>{shownPerson}</b>
                                                </div>
                                            ) : (
                                                <div className="mt-2 text-sm text-slate-700">
                                                    <span className="text-slate-500">User:</span> <b>{u?.username ?? '—'}</b>
                                                </div>
                                            )}

                                            <div className="mt-2 text-sm text-slate-700">
                                                <span className="text-slate-500">Nga:</span> <b>{fromUser}</b>
                                                <span className="mx-2 text-slate-300">•</span>
                                                <span className="text-slate-500">Unit:</span> <b>{unitShown}</b>
                                            </div>

                                            <div className="mt-2 text-xs text-slate-500">
                                                Krijuar: {formatDateTime(createdAt)}
                                                {decidedAt ? <div>Vendosur: {formatDateTime(decidedAt)}</div> : null}
                                            </div>

                                            {decisionNote && (status === 'REJECTED' || status === 'APPROVED' || status === 'CANCELLED') ? (
                                                <div className="mt-3 text-sm text-slate-700">
                                                    <div className="text-xs text-slate-500 mb-1">Vendimi</div>
                                                    <div className="whitespace-pre-wrap">{decisionNote}</div>
                                                </div>
                                            ) : null}
                                        </div>

                                        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                            <div className="text-xs text-slate-500 mb-2">Arsyeja e kërkesës</div>
                                            <div className="text-sm text-slate-700 whitespace-pre-wrap">{shownReason || '—'}</div>
                                        </div>

                                        {isCreateUser && u ? (
                                            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                                <div className="text-xs text-slate-500 mb-2">Të dhënat e userit (kërkesë)</div>
                                                <div className="text-sm text-slate-700 space-y-1">
                                                    <div>
                                                        <span className="text-slate-500">Email:</span> <b>{u.email ?? '—'}</b>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-500">Roli:</span> <b>{u.role ?? '—'}</b>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-500">Kontrata:</span>{' '}
                                                        <b>{u.neverExpires ? 'Pa afat skadimi' : `${u.contractValidFrom ?? '—'} → ${u.contractValidTo ?? '—'}`}</b>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-500">Must change password:</span> <b>{u.mustChangePassword ? 'Po' : 'Jo'}</b>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : null}

                                        {patchObj ? (
                                            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                                <div className="text-xs text-slate-500 mb-3">Ndryshimet e kërkuara</div>

                                                {Object.keys(patchObj).length === 0 ? (
                                                    <div className="text-sm text-slate-600">—</div>
                                                ) : (
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        {Object.entries(patchObj).map(([k, v]) => (
                                                            <div key={k} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                                                <div className="text-xs text-slate-500 mb-1">{k}</div>
                                                                <div className="text-sm text-slate-700 whitespace-pre-wrap">
                                                                    {isPrimitive(v) ? prettyValue(v) : prettyValue(v)}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ) : null}

                                        {/* PDF actions */}
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            <button
                                                onClick={() => openRequestPdf(String(id), 'preview')}
                                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
                                            >
                                                <IconEye /> Preview PDF
                                            </button>

                                            <button
                                                onClick={() => openRequestPdf(String(id), 'download')}
                                                disabled={!canDownloadPdf}
                                                className={cn(
                                                    'inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm',
                                                    canDownloadPdf ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50' : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                                )}
                                            >
                                                <IconDownload /> Download PDF
                                            </button>
                                        </div>

                                        {/* Errors */}
                                        {drawerError ? (
                                            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{drawerError}</div>
                                        ) : null}

                                        {/* Decision actions */}
                                        {canCommanderActions ? (
                                            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                                <div className="font-semibold text-slate-900 mb-3">Veprime (Admin/Commander)</div>

                                                <label className="block">
                                                    <div className="text-xs font-medium text-slate-700 mb-1">Shënim për aprovim (opsional)</div>
                                                    <textarea
                                                        value={approveNote}
                                                        onChange={(e) => setApproveNote(e.target.value)}
                                                        rows={3}
                                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                                                        placeholder="Shkruaj shënimin (nëse ke)…"
                                                    />
                                                </label>

                                                <div className="mt-3">
                                                    <button
                                                        onClick={() => approveM.mutate({ id: String(id), note: approveNote.trim() })}
                                                        disabled={approveM.isPending || status !== 'PENDING' || view === 'ARCHIVE'}
                                                        className={cn(
                                                            'rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition',
                                                            status !== 'PENDING' || view === 'ARCHIVE'
                                                                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                                                : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                                        )}
                                                    >
                                                        {approveM.isPending ? 'Duke aprovuar…' : 'Aprovo'}
                                                    </button>
                                                </div>

                                                <div className="h-4" />

                                                <label className="block">
                                                    <div className="text-xs font-medium text-slate-700 mb-1">Arsyeja e refuzimit (obligative)</div>
                                                    <textarea
                                                        value={rejectNote}
                                                        onChange={(e) => setRejectNote(e.target.value)}
                                                        rows={3}
                                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                                                        placeholder="Shkruaj arsyen e refuzimit…"
                                                    />
                                                </label>

                                                <div className="mt-3">
                                                    <button
                                                        onClick={() => {
                                                            const n = rejectNote.trim();
                                                            if (!n) return setDrawerError('Duhet me shkru arsyen e refuzimit.');
                                                            rejectM.mutate({ id: String(id), note: n });
                                                        }}
                                                        disabled={rejectM.isPending || status !== 'PENDING' || view === 'ARCHIVE'}
                                                        className={cn(
                                                            'rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition',
                                                            status !== 'PENDING' || view === 'ARCHIVE'
                                                                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                                                : 'bg-rose-600 text-white hover:bg-rose-700'
                                                        )}
                                                    >
                                                        {rejectM.isPending ? 'Duke refuzuar…' : 'Refuzo'}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : canMyCancel ? (
                                            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                                <div className="font-semibold text-slate-900 mb-3">Veprime (Anulo kërkesën)</div>

                                                <label className="block">
                                                    <div className="text-xs font-medium text-slate-700 mb-1">Shënim për anulim (opsional)</div>
                                                    <textarea
                                                        value={approveNote}
                                                        onChange={(e) => setApproveNote(e.target.value)}
                                                        rows={3}
                                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                                                        placeholder="Shkruaj shënimin (nëse ke)…"
                                                    />
                                                </label>

                                                <div className="mt-3">
                                                    <button
                                                        onClick={() => cancelM.mutate({ id: String(id), note: approveNote.trim() })}
                                                        disabled={cancelM.isPending || view === 'ARCHIVE' || status !== 'PENDING'}
                                                        className={cn(
                                                            'rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition',
                                                            status !== 'PENDING' || view === 'ARCHIVE'
                                                                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                                                : 'bg-slate-900 text-white hover:bg-slate-800'
                                                        )}
                                                    >
                                                        {cancelM.isPending ? 'Duke anuluar…' : 'Anulo'}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : null}

                                        <div className="h-6" />
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
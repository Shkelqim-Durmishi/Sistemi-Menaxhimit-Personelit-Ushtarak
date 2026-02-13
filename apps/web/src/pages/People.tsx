// src/pages/people.tsx

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';

import {
    api,
    searchPeople,
    createPerson,
    listUnits,
    getCurrentUser,
    type UnitItem,
    type PersonListItem,
    type PersonStatus,
} from '../lib/api';

function reqLabel(text: string) {
    return (
        <span className="text-sm">
            {text} <span className="text-red-600">*</span>
        </span>
    );
}

function statusBadge(status?: PersonStatus) {
    if (status === 'PENDING') {
        return <span className="px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 text-xs">PENDING</span>;
    }
    if (status === 'ACTIVE') {
        return <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 text-xs">ACTIVE</span>;
    }
    if (status === 'INACTIVE') {
        return <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-800 text-xs">INACTIVE</span>;
    }
    if (status === 'REJECTED') {
        return <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 text-xs">REJECTED</span>;
    }
    return <span className="text-xs text-gray-400">—</span>;
}

// ✅ e zgjerojmë tipin vetëm këtu (pa e prek api.ts)
type PersonListItemEx = PersonListItem & {
    createdBy?: string | { _id?: string; id?: string } | null;

    rejectionReason?: string | null;
    rejectedAt?: string | null;

    personalNumber?: string | null;
    birthDate?: string | null;
    gender?: 'M' | 'F' | 'O' | null;

    city?: string | null;
    address?: string | null;
    phone?: string | null;

    position?: string | null;
    serviceStartDate?: string | null;

    unitId?: any;
    gradeId?: string | null;

    notes?: string | null;
    photoUrl?: string | null; // ✅ nga api.ts tani mund të vijë absolute
};

export default function PeoplePage() {
    // ✅ URL Search Params
    const [sp, setSp] = useSearchParams();
    const qParam = sp.get('q') ?? '';

    // 🔹 Forma (CREATE)
    const [serviceNo, setServiceNo] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [gradeId, setGradeId] = useState('');
    const [unitId, setUnitId] = useState('');

    const [personalNumber, setPersonalNumber] = useState('');
    const [birthDate, setBirthDate] = useState('');
    const [gender, setGender] = useState<'M' | 'F' | 'O' | ''>('');
    const [city, setCity] = useState('');
    const [address, setAddress] = useState('');
    const [phone, setPhone] = useState('');
    const [position, setPosition] = useState('');
    const [serviceStartDate, setServiceStartDate] = useState('');

    // Foto si FILE → base64
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoUrl, setPhotoUrl] = useState<string>(''); // dataURL ose URL
    const [photoPreview, setPhotoPreview] = useState<string>('');

    // opsionale
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    // 🔹 Njësitë
    const [units, setUnits] = useState<UnitItem[]>([]);

    // 🔹 Lista (input që e kontrollon URL)
    const [q, setQ] = useState(qParam);
    const [people, setPeople] = useState<PersonListItemEx[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // ✅ MODAL
    const [reasonOpen, setReasonOpen] = useState(false);
    const [reasonPerson, setReasonPerson] = useState<PersonListItemEx | null>(null);

    // ✅ EDIT në MODAL
    const [editSaving, setEditSaving] = useState(false);

    const [editServiceNo, setEditServiceNo] = useState('');
    const [editFirstName, setEditFirstName] = useState('');
    const [editLastName, setEditLastName] = useState('');
    const [editGradeId, setEditGradeId] = useState('');
    const [editUnitId, setEditUnitId] = useState('');

    const [editPersonalNumber, setEditPersonalNumber] = useState('');
    const [editBirthDate, setEditBirthDate] = useState('');
    const [editGender, setEditGender] = useState<'M' | 'F' | 'O' | ''>('');
    const [editCity, setEditCity] = useState('');
    const [editAddress, setEditAddress] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editPosition, setEditPosition] = useState('');
    const [editServiceStartDate, setEditServiceStartDate] = useState('');

    const [editNotes, setEditNotes] = useState('');
    const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
    const [editPhotoUrl, setEditPhotoUrl] = useState<string>(''); // dataURL (kur zgjedh file)
    const [editPhotoPreview, setEditPhotoPreview] = useState<string>(''); // URL ekzistuese ose dataURL

    const currentUser = getCurrentUser();

    // ✅ ref për scroll brenda modalit
    const modalBodyRef = useRef<HTMLDivElement | null>(null);

    // ✅ ruaj scroll-in e faqes (për lock pa “jump”)
    const pageScrollYRef = useRef<number>(0);

    function getCreatedById(p: PersonListItemEx) {
        const cb: any = (p as any)?.createdBy;
        if (!cb) return null;
        if (typeof cb === 'string') return cb;
        return cb?._id || cb?.id || null;
    }

    function canSeeRejectReason(p: PersonListItemEx) {
        if (!currentUser?.id) return false;
        const createdById = getCreatedById(p);
        return p.status === 'REJECTED' && !!createdById && String(createdById) === String(currentUser.id);
    }

    function closeModal() {
        setReasonOpen(false);
        setReasonPerson(null);
    }

    // ✅ LOCK scroll i faqes + ESC + modal scroll top
    useEffect(() => {
        if (!reasonOpen) return;

        pageScrollYRef.current = window.scrollY || 0;

        const prevPosition = document.body.style.position;
        const prevTop = document.body.style.top;
        const prevLeft = document.body.style.left;
        const prevRight = document.body.style.right;
        const prevWidth = document.body.style.width;

        document.body.style.position = 'fixed';
        document.body.style.top = `-${pageScrollYRef.current}px`;
        document.body.style.left = '0';
        document.body.style.right = '0';
        document.body.style.width = '100%';

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeModal();
        };

        window.addEventListener('keydown', onKeyDown);

        requestAnimationFrame(() => {
            if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0;
        });

        return () => {
            window.removeEventListener('keydown', onKeyDown);

            document.body.style.position = prevPosition;
            document.body.style.top = prevTop;
            document.body.style.left = prevLeft;
            document.body.style.right = prevRight;
            document.body.style.width = prevWidth;

            window.scrollTo(0, pageScrollYRef.current);
        };
    }, [reasonOpen]);

    // ✅ API për update/resubmit (përdor axios instance nga lib/api.ts)
    async function updatePersonApi(id: string, payload: any) {
        const { data } = await api.put(`/people/${id}`, payload);
        return data;
    }

    async function resubmitPersonApi(id: string) {
        const { data } = await api.post(`/people/${id}/resubmit`, {});
        return data;
    }

    // =============== Ngarko njësitë ===============
    useEffect(() => {
        listUnits().then(setUnits).catch(() => setUnits([]));
    }, []);

    // ✅ kur URL ndryshon → mbushe input + kthe page 1
    useEffect(() => {
        setQ(qParam);
        setPage(1);
    }, [qParam]);

    // ✅ debounce input → shkruaje në URL (?q=...)
    useEffect(() => {
        const t = setTimeout(() => {
            const clean = q.trim();
            const current = sp.get('q') ?? '';

            if (clean === current) return;

            setSp((prev) => {
                const next = new URLSearchParams(prev);
                if (!clean) next.delete('q');
                else next.set('q', clean);
                return next;
            });
        }, 300);

        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q, setSp]);

    // =============== Kërko ushtarët ===============
    useEffect(() => {
        let active = true;

        async function load() {
            try {
                const data = await searchPeople(qParam, page, 10);
                if (!active) return;

                setPeople((data.items as any) as PersonListItemEx[]);
                setTotalPages(data.pages ?? 1);
            } catch {
                if (active) {
                    setPeople([]);
                    setTotalPages(1);
                }
            }
        }

        load();
        return () => {
            active = false;
        };
    }, [qParam, page]);

    // =============== Foto: File → base64 (CREATE) ===============
    async function handlePhotoPick(file: File | null) {
        setPhotoFile(file);
        setPhotoUrl('');
        setPhotoPreview('');

        if (!file) return;

        const okTypes = ['image/png', 'image/jpeg'];
        if (!okTypes.includes(file.type)) {
            alert('Lejohen vetëm PNG ose JPEG.');
            setPhotoFile(null);
            return;
        }

        const maxBytes = 2 * 1024 * 1024;
        if (file.size > maxBytes) {
            alert('Foto është shumë e madhe. Zgjedh një foto deri në 2MB.');
            setPhotoFile(null);
            return;
        }

        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        setPhotoUrl(dataUrl);
        setPhotoPreview(dataUrl);
    }

    // =============== Foto: File → base64 (EDIT) ===============
    async function handleEditPhotoPick(file: File | null) {
        setEditPhotoFile(file);
        setEditPhotoUrl('');
        if (!file) return;

        const okTypes = ['image/png', 'image/jpeg'];
        if (!okTypes.includes(file.type)) {
            alert('Lejohen vetëm PNG ose JPEG.');
            setEditPhotoFile(null);
            return;
        }

        const maxBytes = 2 * 1024 * 1024;
        if (file.size > maxBytes) {
            alert('Foto është shumë e madhe. Zgjedh një foto deri në 2MB.');
            setEditPhotoFile(null);
            return;
        }

        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        setEditPhotoUrl(dataUrl);
        setEditPhotoPreview(dataUrl);
    }

    // =============== Validim (CREATE) ===============
    function validate() {
        const missing: string[] = [];

        if (!serviceNo.trim()) missing.push('Nr. Shërbimit');
        if (!firstName.trim()) missing.push('Emri');
        if (!lastName.trim()) missing.push('Mbiemri');
        if (!gradeId.trim()) missing.push('Grada (ID)');
        if (!unitId.trim()) missing.push('Njësia');

        if (!personalNumber.trim()) missing.push('Nr. Personal');
        if (!birthDate.trim()) missing.push('Data e lindjes');
        if (!gender.trim()) missing.push('Gjinia');
        if (!city.trim()) missing.push('Qyteti');
        if (!address.trim()) missing.push('Adresa');
        if (!phone.trim()) missing.push('Telefoni');
        if (!position.trim()) missing.push('Pozita');
        if (!serviceStartDate.trim()) missing.push('Data e fillimit të shërbimit');

        if (missing.length) {
            alert('Plotëso fushat e detyrueshme:\n- ' + missing.join('\n- '));
            return false;
        }

        return true;
    }

    // =============== Validim (EDIT) ===============
    function validateEdit() {
        const missing: string[] = [];

        if (!editServiceNo.trim()) missing.push('Nr. Shërbimit');
        if (!editFirstName.trim()) missing.push('Emri');
        if (!editLastName.trim()) missing.push('Mbiemri');
        if (!editGradeId.trim()) missing.push('Grada (ID)');
        if (!editUnitId.trim()) missing.push('Njësia');

        if (!editPersonalNumber.trim()) missing.push('Nr. Personal');
        if (!editBirthDate.trim()) missing.push('Data e lindjes');
        if (!editGender.trim()) missing.push('Gjinia');
        if (!editCity.trim()) missing.push('Qyteti');
        if (!editAddress.trim()) missing.push('Adresa');
        if (!editPhone.trim()) missing.push('Telefoni');
        if (!editPosition.trim()) missing.push('Pozita');
        if (!editServiceStartDate.trim()) missing.push('Data e fillimit të shërbimit');

        if (missing.length) {
            alert('Plotëso fushat e detyrueshme:\n- ' + missing.join('\n- '));
            return false;
        }

        return true;
    }

    // =============== Create ===============
    async function handleCreatePerson(e: FormEvent) {
        e.preventDefault();
        if (!validate()) return;

        setSaving(true);

        try {
            await createPerson({
                serviceNo: serviceNo.trim(),
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                gradeId: gradeId.trim(),
                unitId: unitId.trim(),

                personalNumber: personalNumber.trim(),
                birthDate,
                gender: gender as any,
                city: city.trim(),
                address: address.trim(),
                phone: phone.trim(),
                position: position.trim(),
                serviceStartDate,

                photoUrl: photoUrl ? photoUrl : null,
                notes: notes?.trim() ? notes.trim() : null,
            });

            alert('Ushtari u regjistrua me sukses. Statusi fillestar: PENDING.');

            setServiceNo('');
            setFirstName('');
            setLastName('');
            setGradeId('');
            setUnitId('');

            setPersonalNumber('');
            setBirthDate('');
            setGender('');
            setCity('');
            setAddress('');
            setPhone('');
            setPosition('');
            setServiceStartDate('');

            setNotes('');
            setPhotoFile(null);
            setPhotoUrl('');
            setPhotoPreview('');

            setPage(1);

            // ✅ rifresko listën me query nga URL (qParam)
            const data = await searchPeople(qParam, 1, 10);
            setPeople((data.items as any) as PersonListItemEx[]);
            setTotalPages(data.pages ?? 1);
        } catch (err: any) {
            console.error('createPerson error', err);

            if (err?.response?.data?.code === 'SERVICE_NO_EXISTS') {
                alert('Ekziston tashmë një ushtar me këtë numër shërbimi.');
            } else if (err?.response?.data?.code === 'PERSONAL_NUMBER_EXISTS') {
                alert('Ekziston tashmë një ushtar me këtë numër personal.');
            } else if (err?.response?.data?.code === 'FORBIDDEN_UNIT_CREATE') {
                alert('Nuk ke të drejtë të regjistrosh ushtar në njësi tjetër.');
            } else if (err?.response?.data?.code === 'NO_UNIT_ASSIGNED') {
                alert('Përdoruesi nuk ka njësi të caktuar.');
            } else {
                alert('Nuk u regjistrua ushtari. Kontrollo të dhënat ose provo përsëri.');
            }
        } finally {
            setSaving(false);
        }
    }

    // ✅ hap modal + mbush edit fields
    function openReasonModal(p: PersonListItemEx) {
        setReasonPerson(p);
        setReasonOpen(true);

        setEditServiceNo(String(p.serviceNo ?? ''));
        setEditFirstName(String(p.firstName ?? ''));
        setEditLastName(String(p.lastName ?? ''));

        setEditGradeId(String((p as any)?.gradeId ?? ''));
        setEditUnitId(String((p as any)?.unitId?._id ?? (p as any)?.unitId ?? ''));

        setEditPersonalNumber(String((p as any)?.personalNumber ?? ''));

        const bd = (p as any)?.birthDate ? String((p as any).birthDate).slice(0, 10) : '';
        const sd = (p as any)?.serviceStartDate ? String((p as any).serviceStartDate).slice(0, 10) : '';
        setEditBirthDate(bd);
        setEditGender(((p as any)?.gender ?? '') as any);

        setEditCity(String((p as any)?.city ?? ''));
        setEditAddress(String((p as any)?.address ?? ''));
        setEditPhone(String((p as any)?.phone ?? ''));
        setEditPosition(String((p as any)?.position ?? ''));
        setEditServiceStartDate(sd);

        setEditNotes(String((p as any)?.notes ?? ''));

        setEditPhotoFile(null);
        setEditPhotoUrl('');
        setEditPhotoPreview(String((p as any)?.photoUrl ?? ''));
    }

    // ✅ UPDATE (në modal)
    async function handleUpdateOnly() {
        if (!reasonPerson?._id) return;
        if (!validateEdit()) return;

        setEditSaving(true);
        try {
            await updatePersonApi(String(reasonPerson._id), {
                serviceNo: editServiceNo.trim(),
                firstName: editFirstName.trim(),
                lastName: editLastName.trim(),
                gradeId: editGradeId.trim(),
                unitId: editUnitId.trim(),

                personalNumber: editPersonalNumber.trim(),
                birthDate: editBirthDate,
                gender: editGender as any,
                city: editCity.trim(),
                address: editAddress.trim(),
                phone: editPhone.trim(),
                position: editPosition.trim(),
                serviceStartDate: editServiceStartDate,

                photoUrl: editPhotoUrl ? editPhotoUrl : null,
                notes: editNotes?.trim() ? editNotes.trim() : null,
            });

            alert('U përditësuan të dhënat e ushtarit.');

            const data = await searchPeople(qParam, page, 10);
            setPeople((data.items as any) as PersonListItemEx[]);
            setTotalPages(data.pages ?? 1);
        } catch (err: any) {
            console.error('update person error', err);
            alert('Nuk u përditësua ushtari. Kontrollo të dhënat ose provo përsëri.');
        } finally {
            setEditSaving(false);
        }
    }

    // ✅ UPDATE + RESUBMIT
    async function handleUpdateAndResubmit() {
        if (!reasonPerson?._id) return;
        if (!validateEdit()) return;

        setEditSaving(true);
        try {
            await updatePersonApi(String(reasonPerson._id), {
                serviceNo: editServiceNo.trim(),
                firstName: editFirstName.trim(),
                lastName: editLastName.trim(),
                gradeId: editGradeId.trim(),
                unitId: editUnitId.trim(),

                personalNumber: editPersonalNumber.trim(),
                birthDate: editBirthDate,
                gender: editGender as any,
                city: editCity.trim(),
                address: editAddress.trim(),
                phone: editPhone.trim(),
                position: editPosition.trim(),
                serviceStartDate: editServiceStartDate,

                photoUrl: editPhotoUrl ? editPhotoUrl : null,
                notes: editNotes?.trim() ? editNotes.trim() : null,
            });

            await resubmitPersonApi(String(reasonPerson._id));

            alert('U dërgua përsëri për miratim (PENDING).');

            closeModal();

            setPage(1);
            const data = await searchPeople(qParam, 1, 10);
            setPeople((data.items as any) as PersonListItemEx[]);
            setTotalPages(data.pages ?? 1);
        } catch (err: any) {
            console.error('update/resubmit error', err);
            alert('Nuk u dërgua për miratim. Kontrollo të dhënat ose provo përsëri.');
        } finally {
            setEditSaving(false);
        }
    }

    // ✅ MODAL UI (Portal)
    const modalUi =
        reasonOpen && reasonPerson
            ? createPortal(
                <div
                    className="fixed inset-0 z-[9999] bg-gray-900/60"
                    style={{ width: '100dvw', height: '100dvh' }}
                    onClick={closeModal}
                >
                    <div className="min-h-[100dvh] w-[100dvw] flex items-center justify-center p-4">
                        <div
                            className="bg-white w-full max-w-3xl rounded shadow-lg max-h-[90dvh] flex flex-col"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header sticky */}
                            <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
                                <div className="text-lg font-semibold">Refuzimi & Përditësimi</div>
                                <button className="px-2 py-1 border rounded text-sm" onClick={closeModal}>
                                    Mbyll
                                </button>
                            </div>

                            {/* BODY scroll vetëm këtu */}
                            <div ref={modalBodyRef} className="p-4 space-y-4 overflow-y-auto overscroll-contain">
                                {/* Arsyeja */}
                                <div className="text-sm">
                                    <div className="text-xs text-gray-500 mb-1">Arsyeja e refuzimit</div>
                                    <div className="border border-red-300 rounded px-3 py-2 bg-red-50 text-red-700 whitespace-pre-wrap">
                                        {reasonPerson?.rejectionReason?.trim() ? reasonPerson.rejectionReason : 'Nuk ka arsye të ruajtur.'}
                                    </div>

                                    {reasonPerson?.rejectedAt ? (
                                        <div className="mt-2 text-xs text-gray-500">Refuzuar më: {String(reasonPerson.rejectedAt)}</div>
                                    ) : null}
                                </div>

                                {/* Detajet (read-only) */}
                                <div className="border rounded p-3 bg-gray-50">
                                    <div className="text-sm font-medium mb-2">Të dhënat aktuale</div>

                                    <div className="grid md:grid-cols-3 gap-2 text-sm">
                                        <div>
                                            <span className="text-gray-500 text-xs">Nr. Shërbimit</span>
                                            <div>{reasonPerson?.serviceNo ?? '—'}</div>
                                        </div>

                                        <div>
                                            <span className="text-gray-500 text-xs">Emri</span>
                                            <div>{reasonPerson?.firstName ?? '—'}</div>
                                        </div>

                                        <div>
                                            <span className="text-gray-500 text-xs">Mbiemri</span>
                                            <div>{reasonPerson?.lastName ?? '—'}</div>
                                        </div>

                                        <div>
                                            <span className="text-gray-500 text-xs">Nr. Personal</span>
                                            <div>{(reasonPerson as any)?.personalNumber ?? '—'}</div>
                                        </div>

                                        <div>
                                            <span className="text-gray-500 text-xs">Data e lindjes</span>
                                            <div>{String((reasonPerson as any)?.birthDate ?? '—')}</div>
                                        </div>

                                        <div>
                                            <span className="text-gray-500 text-xs">Gjinia</span>
                                            <div>{String((reasonPerson as any)?.gender ?? '—')}</div>
                                        </div>

                                        <div>
                                            <span className="text-gray-500 text-xs">Qyteti</span>
                                            <div>{(reasonPerson as any)?.city ?? '—'}</div>
                                        </div>

                                        <div>
                                            <span className="text-gray-500 text-xs">Adresa</span>
                                            <div>{(reasonPerson as any)?.address ?? '—'}</div>
                                        </div>

                                        <div>
                                            <span className="text-gray-500 text-xs">Telefoni</span>
                                            <div>{(reasonPerson as any)?.phone ?? '—'}</div>
                                        </div>

                                        <div>
                                            <span className="text-gray-500 text-xs">Pozita</span>
                                            <div>{(reasonPerson as any)?.position ?? '—'}</div>
                                        </div>

                                        <div>
                                            <span className="text-gray-500 text-xs">Data e fillimit</span>
                                            <div>{String((reasonPerson as any)?.serviceStartDate ?? '—')}</div>
                                        </div>

                                        <div>
                                            <span className="text-gray-500 text-xs">Grada (ID)</span>
                                            <div>{String((reasonPerson as any)?.gradeId ?? '—')}</div>
                                        </div>
                                    </div>

                                    {(reasonPerson as any)?.photoUrl ? (
                                        <div className="mt-3">
                                            <div className="text-xs text-gray-500 mb-1">Foto</div>
                                            <img
                                                src={String((reasonPerson as any)?.photoUrl)}
                                                alt="person"
                                                className="h-20 w-20 rounded object-cover border bg-white"
                                            />
                                        </div>
                                    ) : null}
                                </div>

                                {/* EDIT form */}
                                <div className="border rounded p-3 space-y-3">
                                    <div className="text-sm font-medium">Përditëso të dhënat sipas arsyes</div>

                                    <div className="grid md:grid-cols-3 gap-3">
                                        <div>
                                            <label>{reqLabel('Nr. Shërbimit')}</label>
                                            <input
                                                value={editServiceNo}
                                                onChange={(e) => setEditServiceNo(e.target.value)}
                                                className="border px-2 py-1 rounded w-full"
                                            />
                                        </div>

                                        <div>
                                            <label>{reqLabel('Emri')}</label>
                                            <input
                                                value={editFirstName}
                                                onChange={(e) => setEditFirstName(e.target.value)}
                                                className="border px-2 py-1 rounded w-full"
                                            />
                                        </div>

                                        <div>
                                            <label>{reqLabel('Mbiemri')}</label>
                                            <input
                                                value={editLastName}
                                                onChange={(e) => setEditLastName(e.target.value)}
                                                className="border px-2 py-1 rounded w-full"
                                            />
                                        </div>

                                        <div>
                                            <label>{reqLabel('Grada (ID)')}</label>
                                            <input
                                                value={editGradeId}
                                                onChange={(e) => setEditGradeId(e.target.value)}
                                                className="border px-2 py-1 rounded w-full"
                                            />
                                        </div>

                                        <div>
                                            <label>{reqLabel('Njësia')}</label>
                                            <select
                                                value={editUnitId}
                                                onChange={(e) => setEditUnitId(e.target.value)}
                                                className="border px-2 py-1 rounded w-full"
                                            >
                                                <option value="">— Zgjidh njësinë —</option>
                                                {units.map((u) => (
                                                    <option key={u.id} value={u.id}>
                                                        {u.code} — {u.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label>{reqLabel('Nr. Personal')}</label>
                                            <input
                                                value={editPersonalNumber}
                                                onChange={(e) => setEditPersonalNumber(e.target.value)}
                                                className="border px-2 py-1 rounded w-full"
                                            />
                                        </div>

                                        <div>
                                            <label>{reqLabel('Data e lindjes')}</label>
                                            <input
                                                type="date"
                                                value={editBirthDate}
                                                onChange={(e) => setEditBirthDate(e.target.value)}
                                                className="border px-2 py-1 rounded w-full"
                                            />
                                        </div>

                                        <div>
                                            <label>{reqLabel('Gjinia')}</label>
                                            <select
                                                value={editGender}
                                                onChange={(e) => setEditGender(e.target.value as any)}
                                                className="border px-2 py-1 rounded w-full"
                                            >
                                                <option value="">— Zgjidh —</option>
                                                <option value="M">Mashkull</option>
                                                <option value="F">Femër</option>
                                                <option value="O">Tjetër</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label>{reqLabel('Qyteti')}</label>
                                            <input
                                                value={editCity}
                                                onChange={(e) => setEditCity(e.target.value)}
                                                className="border px-2 py-1 rounded w-full"
                                            />
                                        </div>

                                        <div>
                                            <label>{reqLabel('Adresa')}</label>
                                            <input
                                                value={editAddress}
                                                onChange={(e) => setEditAddress(e.target.value)}
                                                className="border px-2 py-1 rounded w-full"
                                            />
                                        </div>

                                        <div>
                                            <label>{reqLabel('Telefoni')}</label>
                                            <input
                                                value={editPhone}
                                                onChange={(e) => setEditPhone(e.target.value)}
                                                className="border px-2 py-1 rounded w-full"
                                            />
                                        </div>

                                        <div>
                                            <label>{reqLabel('Pozita')}</label>
                                            <input
                                                value={editPosition}
                                                onChange={(e) => setEditPosition(e.target.value)}
                                                className="border px-2 py-1 rounded w-full"
                                            />
                                        </div>

                                        <div>
                                            <label>{reqLabel('Data e fillimit të shërbimit')}</label>
                                            <input
                                                type="date"
                                                value={editServiceStartDate}
                                                onChange={(e) => setEditServiceStartDate(e.target.value)}
                                                className="border px-2 py-1 rounded w-full"
                                            />
                                        </div>

                                        <div>
                                            <label className="text-sm">Foto (opsionale)</label>
                                            <input
                                                type="file"
                                                accept="image/png,image/jpeg"
                                                onChange={(e) => handleEditPhotoPick(e.target.files?.[0] ?? null)}
                                                className="border px-2 py-1 rounded w-full bg-white"
                                            />

                                            {(editPhotoPreview || editPhotoUrl) && (
                                                <div className="mt-2">
                                                    <img
                                                        src={editPhotoPreview || editPhotoUrl}
                                                        alt="preview"
                                                        className="h-16 w-16 rounded object-cover border"
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        <div className="md:col-span-3">
                                            <label className="text-sm">Shënime / Vërejtje (opsionale)</label>
                                            <textarea
                                                value={editNotes}
                                                onChange={(e) => setEditNotes(e.target.value)}
                                                className="border px-2 py-1 rounded w-full"
                                                rows={2}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2 justify-end">
                                        <button
                                            type="button"
                                            disabled={editSaving}
                                            onClick={handleUpdateOnly}
                                            className="px-3 py-2 border rounded bg-white hover:bg-gray-50 disabled:opacity-50"
                                        >
                                            {editSaving ? 'Duke ruajtur…' : 'Përditëso'}
                                        </button>

                                        <button
                                            type="button"
                                            disabled={editSaving}
                                            onClick={handleUpdateAndResubmit}
                                            className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                                        >
                                            {editSaving ? 'Duke dërguar…' : 'Dërgo përsëri për miratim'}
                                        </button>
                                    </div>

                                    <div className="text-xs text-gray-500">
                                        * Pas “Dërgo përsëri për miratim”, pritet të kthehet statusi në <b>PENDING</b>.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )
            : null;

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-semibold">Ushtarët</h1>

            {/* ========== Forma ========== */}
            <form onSubmit={handleCreatePerson} className="bg-white p-4 rounded shadow space-y-3">
                <div className="grid md:grid-cols-3 gap-3">
                    <div>
                        <label>{reqLabel('Nr. Shërbimit')}</label>
                        <input
                            value={serviceNo}
                            onChange={(e) => setServiceNo(e.target.value)}
                            className="border px-2 py-1 rounded w-full"
                            placeholder="p.sh. 10001"
                        />
                    </div>

                    <div>
                        <label>{reqLabel('Emri')}</label>
                        <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="border px-2 py-1 rounded w-full" />
                    </div>

                    <div>
                        <label>{reqLabel('Mbiemri')}</label>
                        <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="border px-2 py-1 rounded w-full" />
                    </div>

                    <div>
                        <label>{reqLabel('Grada (ID)')}</label>
                        <input
                            value={gradeId}
                            onChange={(e) => setGradeId(e.target.value)}
                            className="border px-2 py-1 rounded w-full"
                            placeholder="p.sh. 12121 ose OF-1"
                        />
                    </div>

                    <div>
                        <label>{reqLabel('Njësia')}</label>
                        <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="border px-2 py-1 rounded w-full">
                            <option value="">— Zgjidh njësinë —</option>
                            {units.map((u) => (
                                <option key={u.id} value={u.id}>
                                    {u.code} — {u.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label>{reqLabel('Nr. Personal')}</label>
                        <input
                            value={personalNumber}
                            onChange={(e) => setPersonalNumber(e.target.value)}
                            className="border px-2 py-1 rounded w-full"
                            placeholder="p.sh. 1244088693"
                        />
                    </div>

                    <div>
                        <label>{reqLabel('Data e lindjes')}</label>
                        <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="border px-2 py-1 rounded w-full" />
                    </div>

                    <div>
                        <label>{reqLabel('Gjinia')}</label>
                        <select value={gender} onChange={(e) => setGender(e.target.value as any)} className="border px-2 py-1 rounded w-full">
                            <option value="">— Zgjidh —</option>
                            <option value="M">Mashkull</option>
                            <option value="F">Femër</option>
                            <option value="O">Tjetër</option>
                        </select>
                    </div>

                    <div>
                        <label>{reqLabel('Qyteti')}</label>
                        <input value={city} onChange={(e) => setCity(e.target.value)} className="border px-2 py-1 rounded w-full" placeholder="p.sh. Mitrovicë" />
                    </div>

                    <div>
                        <label>{reqLabel('Adresa')}</label>
                        <input value={address} onChange={(e) => setAddress(e.target.value)} className="border px-2 py-1 rounded w-full" />
                    </div>

                    <div>
                        <label>{reqLabel('Telefoni')}</label>
                        <input value={phone} onChange={(e) => setPhone(e.target.value)} className="border px-2 py-1 rounded w-full" placeholder="p.sh. 049..." />
                    </div>

                    <div>
                        <label>{reqLabel('Pozita')}</label>
                        <input value={position} onChange={(e) => setPosition(e.target.value)} className="border px-2 py-1 rounded w-full" placeholder="p.sh. Operator, Shofer…" />
                    </div>

                    <div>
                        <label>{reqLabel('Data e fillimit të shërbimit')}</label>
                        <input
                            type="date"
                            value={serviceStartDate}
                            onChange={(e) => setServiceStartDate(e.target.value)}
                            className="border px-2 py-1 rounded w-full"
                        />
                    </div>

                    <div>
                        <label className="text-sm">Foto (PNG/JPEG) (opsionale)</label>
                        <input
                            type="file"
                            accept="image/png,image/jpeg"
                            onChange={(e) => handlePhotoPick(e.target.files?.[0] ?? null)}
                            className="border px-2 py-1 rounded w-full bg-white"
                        />
                        {photoPreview && (
                            <div className="mt-2">
                                <img src={photoPreview} alt="preview" className="h-16 w-16 rounded object-cover border" />
                            </div>
                        )}
                    </div>

                    <div className="md:col-span-3">
                        <label className="text-sm">Shënime / Vërejtje (opsionale)</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="border px-2 py-1 rounded w-full"
                            rows={2}
                            placeholder="opsionale"
                        />
                    </div>
                </div>

                <div>
                    <button
                        type="submit"
                        disabled={saving}
                        className="px-3 py-2 bg-green-600 text-white rounded disabled:opacity-50"
                    >
                        {saving ? 'Duke ruajtur…' : 'Regjistro ushtarin'}
                    </button>
                </div>
            </form>

            {/* ========== Lista ========== */}
            <div className="bg-white p-4 rounded shadow space-y-3">
                <div className="flex justify-between items-center gap-3">
                    <h2 className="font-medium">Lista e ushtarëve</h2>

                    <input
                        value={q}
                        onChange={(e) => {
                            setQ(e.target.value);
                            setPage(1);
                        }}
                        placeholder="Kërko sipas emrit / mbiemrit / nr. shërbimit…"
                        className="border px-2 py-1 rounded w-64 max-w-full text-sm"
                    />
                </div>

                {(people?.length ?? 0) === 0 ? (
                    <div className="text-gray-500 text-sm">Nuk ka rezultat.</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b text-left">
                                <th className="py-2">Nr. Shërbimit</th>
                                <th>Emri / Mbiemri</th>
                                <th>Statusi</th>
                                <th>Qyteti</th>
                            </tr>
                        </thead>

                        <tbody>
                            {people.map((p) => (
                                <tr key={p._id} className="border-b">
                                    <td className="py-1">{p.serviceNo}</td>
                                    <td>
                                        {p.firstName} {p.lastName}
                                    </td>

                                    <td>
                                        <div className="flex items-center gap-2">
                                            {statusBadge(p.status)}

                                            {canSeeRejectReason(p) && (
                                                <button
                                                    type="button"
                                                    onClick={() => openReasonModal(p)}
                                                    className="px-2 py-1 rounded border text-xs bg-white hover:bg-gray-50"
                                                >
                                                    Shiko arsyen
                                                </button>
                                            )}
                                        </div>
                                    </td>

                                    <td>{p.city ?? ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                <div className="flex justify-end items-center gap-2 text-sm">
                    <button
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="px-2 py-1 border rounded disabled:opacity-50"
                    >
                        ‹ Mbrapa
                    </button>

                    <span>
                        Faqja {page} / {totalPages}
                    </span>

                    <button
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        className="px-2 py-1 border rounded disabled:opacity-50"
                    >
                        Përpara ›
                    </button>
                </div>
            </div>

            {/* ✅ MODAL (Portal) */}
            {modalUi}
        </div>
    );
}
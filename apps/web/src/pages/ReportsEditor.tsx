import { useEffect, useMemo, useRef, useState } from 'react';

import {
  getCategories,
  searchPeople,
  createReport,
  getReport,
  addRow,
  updateRow,
  deleteRow,
  findReportBy,
  submitReport,
  exportUrl,
  getUpcomingLeave,
  getCurrentUser,
  listReports, // ✅ SHTUAR
} from '../lib/api';

import {
  HiPlus,
  HiRefresh,
  HiOutlineDocumentDownload,
  HiPaperAirplane,
  HiTrash,
  HiSearch,
  HiCheckCircle,
  HiClock,
  HiXCircle,
  HiDocumentText,
  HiX,
} from 'react-icons/hi';

type Cat = { _id: string; code: string; label: string };

type Person = { _id: string; serviceNo: string; firstName: string; lastName: string };

type Row = {
  _id: string;
  personId: { _id: string; serviceNo: string; firstName: string; lastName: string };
  categoryId: { _id: string; code: string; label: string };
  from?: string;
  to?: string;
  location?: string;
  notes?: string;
};

type Upcoming = {
  _id: string;
  categoryCode: string;
  categoryLabel: string;
  from: string;
  to?: string;
};

type ReportStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';

type ReportListItem = {
  _id: string;
  date: string;
  unitId: string;
  status: ReportStatus;
  createdAt?: string;
  updatedAt?: string;
};

function fmtShortDate(iso?: string) {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  if (s.length !== 10) return s;
  const [y, m, d] = s.split('-');
  return `${d}-${m}-${y}`;
}

/**
 * Bllokon DRAFT:
 * - nëse raporti është i ditëve të kaluara
 * - ose nëse raporti është sot dhe ora është >= cutoff (default 16:00)
 *
 * NOTE: përdor kohën lokale të browser-it.
 */
function isAfterCutoff(reportDateISO: string, cutoffHour = 16, cutoffMinute = 0) {
  const now = new Date();

  // reportDateISO pritet "YYYY-MM-DD"
  const reportDate = new Date(reportDateISO + 'T00:00:00'); // lokal
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Ditë e kaluar
  if (reportDate < today) return true;

  // Sot
  if (reportDate.getTime() === today.getTime()) {
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), cutoffHour, cutoffMinute, 0, 0);
    return now >= cutoff;
  }

  // Ditë e ardhshme -> mos e blloko nga koha
  return false;
}

function StatusPill({ status }: { status: ReportStatus | null }) {
  if (!status) return null;

  const map: Record<string, { cls: string; label: string; icon: JSX.Element }> = {
    DRAFT: {
      cls: 'bg-slate-50 text-slate-700 border-slate-200',
      label: 'Draft',
      icon: <HiDocumentText className="text-base" />,
    },
    PENDING: {
      cls: 'bg-amber-50 text-amber-800 border-amber-200',
      label: 'Në pritje',
      icon: <HiClock className="text-base" />,
    },
    APPROVED: {
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      label: 'Miratuar',
      icon: <HiCheckCircle className="text-base" />,
    },
    REJECTED: {
      cls: 'bg-rose-50 text-rose-800 border-rose-200',
      label: 'Refuzuar',
      icon: <HiXCircle className="text-base" />,
    },
  };

  const x = map[status];
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border',
        x.cls,
      ].join(' ')}
    >
      {x.icon}
      {x.label}
    </span>
  );
}

function CategoryBadge({ code }: { code?: string }) {
  if (!code) return null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-gray-50 text-gray-700 border-gray-200">
      {code}
    </span>
  );
}

function DisabledWrap({
  disabled,
  reason,
  children,
}: {
  disabled: boolean;
  reason?: string;
  children: React.ReactNode;
}) {
  if (!disabled) return <>{children}</>;
  return (
    <span title={reason || ''} className="inline-flex cursor-not-allowed">
      {children}
    </span>
  );
}

export default function ReportsEditor() {
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === 'ADMIN';

  const [activeTab, setActiveTab] = useState<'editor' | 'history'>('history');

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [unitId, setUnitId] = useState<string>(() => currentUser?.unitId || 'U-001');

  const [reportId, setReportId] = useState<string | null>(null);
  const [status, setStatus] = useState<ReportStatus | null>(null);

  // ===== TIME LOCK (16:00) =====
  // Për me rifresku automatikisht lock-un kur bie ora 16:00, përdorim "nowTick".
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 30_000); // çdo 30s
    return () => window.clearInterval(t);
  }, []);
  void nowTick; // vetëm që të re-render-ojë (përdoret indirekt)

  const timeLocked = status === 'DRAFT' && isAfterCutoff(date, 16, 0);
  const statusLocked = status === 'PENDING' || status === 'APPROVED';
  const isLocked = timeLocked || statusLocked;

  const [cats, setCats] = useState<Cat[]>([]);

  // Search UI state
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [page, setPage] = useState(1);
  const [openSug, setOpenSug] = useState(false);
  const [loadingSug, setLoadingSug] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const [rows, setRows] = useState<Row[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [selectedCat, setSelectedCat] = useState<string>('');

  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [emergency, setEmergency] = useState<boolean>(false);
  const [chainVacation, setChainVacation] = useState<boolean>(false);
  const [vacationTo, setVacationTo] = useState<string>('');

  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);

  const [busyCreate, setBusyCreate] = useState(false);
  const [busyAdd, setBusyAdd] = useState(false);

  const requiresPeriod = (cat?: Cat) => !!cat && ['01-12', '01-13'].includes(cat.code);

  useEffect(() => {
    if (!isAdmin && currentUser?.unitId) setUnitId(currentUser.unitId);
  }, [isAdmin, currentUser?.unitId]);

  useEffect(() => {
    getCategories().then(setCats).catch(() => setCats([]));
  }, []);

  // close dropdown on outside click + ESC
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpenSug(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenSug(false);
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onEsc);
    };
  }, []);

  // Debounced search
  useEffect(() => {
    let active = true;

    const term = q.trim();
    if (term.length < 2) {
      setPeople([]);
      setPage(1);
      setLoadingSug(false);
      return;
    }

    setLoadingSug(true);
    const t = setTimeout(async () => {
      try {
        const d = await searchPeople(term, 1, 10);
        if (!active) return;

        const items = Array.isArray((d as any)?.items) ? (d as any).items : Array.isArray(d) ? d : [];
        setPeople(items as Person[]);
        setPage((d as any)?.page ?? 1);
        setOpenSug(true);
      } catch {
        if (!active) return;
        setPeople([]);
      } finally {
        if (active) setLoadingSug(false);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q]);

  // upcoming leave when emergency + person selected
  useEffect(() => {
    let active = true;

    async function load() {
      if (!selectedPerson || !emergency) {
        setUpcoming([]);
        return;
      }
      try {
        const res = await getUpcomingLeave(selectedPerson._id);

        const list: Upcoming[] = Array.isArray(res)
          ? res
          : res
            ? [
              {
                _id: (res as any)._id ?? 'upcoming-1',
                categoryCode: (res as any).category?.code ?? (res as any).categoryCode,
                categoryLabel: (res as any).category?.label ?? (res as any).categoryLabel,
                from: (res as any).from,
                to: (res as any).to,
              },
            ]
            : [];

        if (active) setUpcoming(list);
      } catch {
        if (active) setUpcoming([]);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [selectedPerson?._id, emergency]);

  const selectedCatObj = useMemo(() => cats.find((c) => c._id === selectedCat), [selectedCat, cats]);

  async function hydrate(id: string) {
    const full = await getReport(id);
    setRows(Array.isArray(full?.rows) ? full.rows : []);
    setStatus(full?.status ?? 'DRAFT');
  }

  async function handleCreateReport() {
    if (isLocked) {
      alert(
        timeLocked
          ? 'Drafti është i bllokuar pas orës 16:00 (ose është ditë e kaluar). Nuk lejohet ringarkimi për editim.'
          : 'Raporti është në pritje/miratuar dhe nuk mund të ringarkohet për editim.',
      );
      return;
    }

    const effectiveUnitId = isAdmin ? unitId : currentUser?.unitId || null;

    if (!effectiveUnitId) {
      alert('Përdoruesi nuk ka të caktuar njësinë (unitId). Kontakto ADMIN-in.');
      return;
    }

    setBusyCreate(true);
    try {
      const r = await createReport({ date, unitId: effectiveUnitId });
      setReportId(r._id);
      await hydrate(r._id);
      setActiveTab('editor');
    } catch (err: any) {
      if (err?.response?.status === 409) {
        const existing = await findReportBy(date, effectiveUnitId);
        if (existing?._id) {
          setReportId(existing._id);
          await hydrate(existing._id);
          setActiveTab('editor');
        }
        return;
      }
      alert('Nuk mund të krijohet ose ngarkohet raporti.');
      console.error(err);
    } finally {
      setBusyCreate(false);
    }
  }

  async function handleAddRow() {
    if (isLocked) return;
    if (!reportId || !selectedPerson || !selectedCat) return;

    if (!emergency && requiresPeriod(selectedCatObj)) {
      const todayStr = new Date().toISOString().slice(0, 10);
      if (from?.slice(0, 10) === todayStr || to?.slice(0, 10) === todayStr) {
        alert('Kjo kategori s’mund të nis sot (pa emergjencë).');
        return;
      }
    }

    const payload: any = {
      personId: selectedPerson._id,
      categoryId: selectedCat,
      from: from || undefined,
      to: to || undefined,
      location: location || undefined,
      notes: notes || undefined,
      emergency,
    };

    if (emergency && chainVacation) {
      payload.chainVacation = true;
      if (vacationTo) payload.vacationTo = vacationTo;
    }

    setBusyAdd(true);
    try {
      const row = await addRow(reportId, payload);
      setRows((prev) => [row as Row, ...prev]);

      // reset fields
      setSelectedPerson(null);
      setSelectedCat('');
      setQ('');
      setPeople([]);
      setOpenSug(false);

      setFrom('');
      setTo('');
      setLocation('');
      setNotes('');
      setEmergency(false);
      setChainVacation(false);
      setVacationTo('');
      setUpcoming([]);
    } finally {
      setBusyAdd(false);
    }
  }

  async function handleDelete(rowId: string) {
    if (isLocked) return;
    if (!confirm('Je i sigurt që dëshiron ta fshish këtë rresht?')) return;
    await deleteRow(rowId);
    setRows((prev) => prev.filter((r) => r._id !== rowId));
  }

  async function handleInlineUpdate(row: Row, field: 'from' | 'to' | 'location' | 'notes', value: string) {
    if (isLocked) return;
    const update: any = { [field]: value || undefined };
    const updated = await updateRow(row._id, update);
    setRows((prev) => prev.map((r) => (r._id === row._id ? (updated as any) : r)));
  }

  // ======== HISTORIKU (TAB) ========
  const [histLoading, setHistLoading] = useState(false);
  const [histError, setHistError] = useState<string>('');
  const [histItems, setHistItems] = useState<ReportListItem[]>([]);
  const [histStatus, setHistStatus] = useState<'ALL' | ReportStatus>('ALL');
  const [histSearch, setHistSearch] = useState(''); // date or id
  const [histOnlyMyUnit, setHistOnlyMyUnit] = useState(true);

  async function fetchHistory() {
    setHistLoading(true);
    setHistError('');

    try {
      const params: any = {};

      // Admin: lejo me zgjedh unit-in manual; jo-admin: backend vet e filtrin
      if (isAdmin) {
        if (histOnlyMyUnit && currentUser?.unitId) {
          params.unit = String(currentUser.unitId);
        } else if (!histOnlyMyUnit && unitId) {
          params.unit = String(unitId);
        }
      }

      const data = await listReports(params);
      const list: ReportListItem[] = Array.isArray(data)
        ? data
        : Array.isArray((data as any)?.items)
          ? (data as any).items
          : [];

      // sort newest first (by date)
      list.sort((a, b) => String(b.date).localeCompare(String(a.date)));

      setHistItems(list);
    } catch (e: any) {
      console.error(e);
      setHistError('Nuk u arrit me u ngarku historiku. Kontrollo auth/token ose endpointin /reports.');
      setHistItems([]);
    } finally {
      setHistLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const filteredHistory = useMemo(() => {
    let x = [...histItems];

    if (histStatus !== 'ALL') x = x.filter((r) => r.status === histStatus);

    const term = histSearch.trim().toLowerCase();
    if (term) {
      x = x.filter((r) => {
        const id = String(r._id).toLowerCase();
        const d = String(r.date).slice(0, 10).toLowerCase();
        const u = String(r.unitId).toLowerCase();
        return id.includes(term) || d.includes(term) || u.includes(term);
      });
    }

    return x;
  }, [histItems, histStatus, histSearch]);

  const historyCounts = useMemo(() => {
    const c = { DRAFT: 0, PENDING: 0, APPROVED: 0, REJECTED: 0, TOTAL: histItems.length };
    histItems.forEach((r) => {
      if (r.status === 'DRAFT') c.DRAFT++;
      if (r.status === 'PENDING') c.PENDING++;
      if (r.status === 'APPROVED') c.APPROVED++;
      if (r.status === 'REJECTED') c.REJECTED++;
    });
    return c;
  }, [histItems]);

  // Tooltip reasons
  const addDisabled = isLocked || !reportId || !selectedPerson || !selectedCat || busyAdd;
  const addReason = isLocked
    ? timeLocked
      ? 'Drafti është i bllokuar pas 16:00 (ose është ditë e kaluar)'
      : 'Raporti është në pritje/miratuar (i mbyllur për editim)'
    : !reportId
      ? 'Së pari krijo/ngarko raportin'
      : !selectedPerson
        ? 'Zgjidh personin'
        : !selectedCat
          ? 'Zgjidh kategorinë'
          : busyAdd
            ? 'Duke shtuar...'
            : '';

  const canSubmit = !!reportId && status !== 'PENDING' && status !== 'APPROVED' && !timeLocked;
  const submitDisabled = !reportId || !canSubmit;
  const submitReason = !reportId
    ? 'S’ka raport të krijuar'
    : timeLocked
      ? 'Drafti është i bllokuar pas 16:00 (ose është ditë e kaluar)'
      : status === 'PENDING'
        ? 'Raporti është në pritje'
        : status === 'APPROVED'
          ? 'Raporti është miratuar'
          : '';

  const createDisabled = busyCreate || isLocked;
  const createReason = busyCreate
    ? 'Duke krijuar/ngarkuar...'
    : isLocked
      ? timeLocked
        ? 'Drafti është i bllokuar pas 16:00 (ose është ditë e kaluar)'
        : 'Raporti është në pritje/miratuar (nuk lejohet ringarkimi)'
      : '';

  return (
    <div className="space-y-5">
      {/* TITLE + Tabs */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Raport Ditor</h1>

          <div className="flex items-center gap-2">
            <StatusPill status={status} />
            {reportId ? <span className="text-xs text-gray-500 font-mono">ID: {reportId}</span> : null}
          </div>
        </div>

        <div className="inline-flex w-fit rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('editor')}
            className={[
              'px-3 py-2 rounded-xl text-sm font-semibold',
              activeTab === 'editor' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50',
            ].join(' ')}
          >
            Raport Ditor
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={[
              'px-3 py-2 rounded-xl text-sm font-semibold',
              activeTab === 'history' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50',
            ].join(' ')}
          >
            Historiku
          </button>
        </div>
      </div>

      {/* ===== TAB: HISTORIKU ===== */}
      {activeTab === 'history' ? (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex flex-col lg:flex-row lg:items-end gap-3">
              <div className="flex-1">
                <label className="text-xs font-semibold text-gray-600">Kërko (data / id / njësia)</label>
                <div className="mt-1 relative">
                  <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg" />
                  <input
                    value={histSearch}
                    onChange={(e) => setHistSearch(e.target.value)}
                    placeholder="p.sh. 2026-02-12 ose RPT..."
                    className="w-full pl-10 pr-10 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40"
                  />
                  {histSearch && (
                    <button
                      type="button"
                      onClick={() => setHistSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-gray-100 text-gray-400"
                      aria-label="Clear"
                    >
                      <HiX className="text-lg" />
                    </button>
                  )}
                </div>
              </div>

              <div className="w-full lg:w-56">
                <label className="text-xs font-semibold text-gray-600">Status</label>
                <select
                  value={histStatus}
                  onChange={(e) => setHistStatus(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40"
                >
                  <option value="ALL">Të gjitha</option>
                  <option value="DRAFT">Draft</option>
                  <option value="PENDING">Në pritje</option>
                  <option value="APPROVED">Miratuar</option>
                  <option value="REJECTED">Refuzuar</option>
                </select>
              </div>

              {isAdmin ? (
                <div className="w-full lg:w-56">
                  <label className="text-xs font-semibold text-gray-600">Shfaq raportet</label>
                  <div className="mt-1 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
                    <input
                      type="checkbox"
                      checked={histOnlyMyUnit}
                      onChange={(e) => setHistOnlyMyUnit(e.target.checked)}
                    />
                    <span className="text-sm text-gray-800">Vetëm njësia ime</span>
                  </div>
                </div>
              ) : null}

              <button
                onClick={fetchHistory}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:bg-black shadow-sm"
              >
                <HiRefresh className="text-lg" />
                Rifresko
              </button>
            </div>

            {/* quick counts */}
            <div className="mt-3 grid sm:grid-cols-5 gap-2">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wider text-gray-500">Total</div>
                <div className="text-lg font-extrabold text-gray-900">{historyCounts.TOTAL}</div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wider text-slate-600">Draft</div>
                <div className="text-lg font-extrabold text-slate-900">{historyCounts.DRAFT}</div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wider text-amber-700">Në pritje</div>
                <div className="text-lg font-extrabold text-amber-900">{historyCounts.PENDING}</div>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wider text-emerald-700">Miratuar</div>
                <div className="text-lg font-extrabold text-emerald-900">{historyCounts.APPROVED}</div>
              </div>

              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wider text-rose-700">Refuzuar</div>
                <div className="text-lg font-extrabold text-rose-900">{historyCounts.REJECTED}</div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-white flex items-center justify-between">
              <div className="font-semibold text-gray-900">Historiku i raporteve</div>
              <div className="text-xs text-gray-500">
                Shfaqur: <span className="font-mono text-gray-700">{filteredHistory.length}</span>
              </div>
            </div>

            {histLoading ? (
              <div className="p-4 text-sm text-gray-600">Duke ngarkuar…</div>
            ) : histError ? (
              <div className="p-4 text-sm text-rose-700">{histError}</div>
            ) : filteredHistory.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">S’ka raporte për këtë filtër.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[860px] w-full text-sm">
                  <thead className="bg-gray-50/70">
                    <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b">
                      <th className="py-3 px-4">Data</th>
                      <th className="py-3 px-4">Njësia</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">ID</th>
                      <th className="py-3 px-4 w-44">Veprime</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y">
                    {filteredHistory.map((it) => {
                      const itDate = String(it.date).slice(0, 10);
                      const itDraftLocked = it.status === 'DRAFT' && isAfterCutoff(itDate, 16, 0);

                      return (
                        <tr key={it._id} className="hover:bg-gray-50/60">
                          <td className="py-3 px-4 font-mono text-gray-900">{itDate}</td>
                          <td className="py-3 px-4 text-gray-700">{String(it.unitId)}</td>
                          <td className="py-3 px-4">
                            <StatusPill status={it.status} />
                          </td>
                          <td className="py-3 px-4 font-mono text-gray-600">{String(it._id).slice(-12)}</td>

                          <td className="py-3 px-4">
                            {it.status === 'DRAFT' ? (
                              <DisabledWrap
                                disabled={itDraftLocked}
                                reason={itDraftLocked ? 'Drafti është i bllokuar pas 16:00 (ose është ditë e kaluar)' : ''}
                              >
                                <button
                                  disabled={itDraftLocked}
                                  onClick={async () => {
                                    setReportId(it._id);
                                    await hydrate(it._id);
                                    setDate(itDate); // sinkronizo datën e editor-it me item-in
                                    setActiveTab('editor');
                                  }}
                                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:bg-black shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Hap
                                </button>
                              </DisabledWrap>
                            ) : (
                              <a
                                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-gray-200 bg-white hover:bg-gray-50 shadow-sm"
                                href={exportUrl(it._id, 'pdf')}
                                target="_blank"
                                rel="noreferrer"
                                title="Shiko/Shkarko PDF"
                              >
                                <HiOutlineDocumentDownload className="text-lg text-gray-500" />
                                PDF
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* ===== TAB: EDITOR ===== */}
      {activeTab === 'editor' ? (
        <>
          {/* Header card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="grid lg:grid-cols-12 gap-3 items-end">
              <div className="lg:col-span-3">
                <label className="text-xs font-semibold text-gray-600">Data</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={isLocked}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40 disabled:bg-gray-100"
                />
              </div>

              <div className="lg:col-span-4">
                <label className="text-xs font-semibold text-gray-600">Njësia</label>
                {isAdmin ? (
                  <input
                    type="text"
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                    disabled={isLocked}
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40 disabled:bg-gray-100"
                    placeholder="U-001 ose ObjectId i njësisë"
                  />
                ) : (
                  <div className="mt-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    Njësia është e lidhur automatikisht me përdoruesin.
                  </div>
                )}
              </div>

              <div className="lg:col-span-5 flex flex-wrap gap-2">
                <DisabledWrap disabled={createDisabled} reason={createReason}>
                  <button
                    onClick={handleCreateReport}
                    disabled={createDisabled}
                    className="
                      inline-flex items-center gap-2
                      px-3 py-2 rounded-xl text-sm font-semibold text-white
                      bg-gradient-to-r from-[#2F3E2E] to-[#C9A24D]
                      hover:from-[#263325] hover:to-[#b8953f]
                      shadow-sm hover:shadow transition
                      disabled:opacity-60 disabled:cursor-not-allowed
                    "
                  >
                    {reportId ? <HiRefresh className="text-lg" /> : <HiPlus className="text-lg" />}
                    {reportId ? 'Rikargo Raportin' : 'Krijo Raportin'}
                  </button>
                </DisabledWrap>

                {reportId ? (
                  <>
                    <a
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-gray-200 bg-white hover:bg-gray-50 shadow-sm"
                      href={exportUrl(reportId, 'pdf')}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <HiOutlineDocumentDownload className="text-lg text-gray-500" />
                      PDF
                    </a>

                    <a
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-gray-200 bg-white hover:bg-gray-50 shadow-sm"
                      href={exportUrl(reportId, 'xlsx')}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <HiOutlineDocumentDownload className="text-lg text-gray-500" />
                      XLSX
                    </a>

                    <DisabledWrap disabled={submitDisabled} reason={submitReason}>
                      <button
                        disabled={submitDisabled}
                        onClick={async () => {
                          try {
                            await submitReport(reportId);
                            setStatus('PENDING');
                            alert('U dërgua për miratim.');
                          } catch {
                            alert('S’u dërgua për miratim.');
                          }
                        }}
                        className="
                          inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold
                          border border-gray-200 bg-white hover:bg-gray-50 shadow-sm
                          disabled:opacity-50 disabled:cursor-not-allowed
                        "
                      >
                        <HiPaperAirplane className="text-lg text-gray-500" />
                        Dërgo për miratim
                      </button>
                    </DisabledWrap>
                  </>
                ) : null}
              </div>
            </div>

            {isLocked ? (
              <div className="mt-3 text-sm rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                {timeLocked ? (
                  <>
                    Drafti u mbyll automatikisht pas orës <span className="font-semibold">16:00</span> (ose është ditë e
                    kaluar). Nuk lejohet më editimi.
                  </>
                ) : (
                  <>
                    Raporti është <span className="font-semibold">{status}</span> dhe është i mbyllur për ndryshime.
                  </>
                )}
              </div>
            ) : null}
          </div>

          {/* Add row card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-gray-900">Shto rresht</div>

              <div className="text-xs text-gray-500">
                {selectedCatObj ? (
                  <span className="inline-flex items-center gap-2">
                    <CategoryBadge code={selectedCatObj.code} />
                    <span className="hidden sm:inline">{selectedCatObj.label}</span>
                  </span>
                ) : (
                  'Zgjidh personin dhe kategorinë'
                )}
              </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-3">
              {/* Search person */}
              <div className="lg:col-span-4">
                <label className="text-xs font-semibold text-gray-600">Kërko personin</label>

                <div ref={boxRef} className="mt-1 relative">
                  <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg" />

                  <input
                    value={q}
                    disabled={isLocked}
                    onChange={(e) => setQ(e.target.value)}
                    onFocus={() => {
                      if (q.trim().length >= 2) setOpenSug(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setOpenSug(false);
                    }}
                    placeholder="Emri / Mbiemri / Nr. Shërbimi"
                    className="w-full pl-10 pr-10 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40 disabled:bg-gray-100"
                  />

                  {q && !isLocked && (
                    <button
                      type="button"
                      onClick={() => {
                        setQ('');
                        setPeople([]);
                        setOpenSug(false);
                        setSelectedPerson(null);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-gray-100 text-gray-400"
                      aria-label="Clear"
                    >
                      <HiX className="text-lg" />
                    </button>
                  )}

                  {!isLocked && openSug && q.trim().length >= 2 && (
                    <div className="absolute z-40 mt-2 w-full rounded-xl border border-gray-100 bg-white shadow-lg overflow-hidden">
                      <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-gray-400 border-b bg-gray-50/70">
                        {loadingSug ? 'Duke kërkuar…' : 'Rezultatet'}
                      </div>

                      {!loadingSug && (people?.length ?? 0) === 0 ? (
                        <div className="px-3 py-3 text-sm text-gray-500">
                          S’ka rezultate për <span className="font-medium text-gray-700">"{q.trim()}"</span>
                        </div>
                      ) : (
                        <div className="max-h-64 overflow-auto">
                          {(people ?? []).map((p) => (
                            <button
                              key={p._id}
                              type="button"
                              onClick={() => {
                                setSelectedPerson(p);
                                setQ(`${p.serviceNo} — ${p.firstName} ${p.lastName}`);
                                setOpenSug(false);
                                setPeople([]);
                              }}
                              className="w-full text-left px-3 py-2 flex items-center justify-between gap-3 hover:bg-gray-50"
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-gray-900 truncate">
                                  {p.firstName} {p.lastName}
                                </div>
                                <div className="text-xs text-gray-500">
                                  Nr. shërbimi: <span className="font-mono text-gray-700">{p.serviceNo}</span>
                                </div>
                              </div>
                              <span className="text-[11px] text-gray-400">Kliko</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {!loadingSug && (people?.length ?? 0) > 0 && (
                        <div className="border-t bg-white">
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-sm font-semibold text-[#2F3E2E] hover:bg-[#2F3E2E]/5"
                            onClick={async () => {
                              const next = page + 1;
                              try {
                                const d = await searchPeople(q.trim(), next, 10);
                                const items = Array.isArray((d as any)?.items)
                                  ? (d as any).items
                                  : Array.isArray(d)
                                    ? d
                                    : [];
                                setPeople((prev) => [...prev, ...(items as Person[])]);
                                setPage((d as any)?.page ?? next);
                              } catch {
                                /* ignore */
                              }
                            }}
                          >
                            Më shumë…
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Category */}
              <div className="lg:col-span-3">
                <label className="text-xs font-semibold text-gray-600">Kategoria</label>
                <select
                  value={selectedCat}
                  disabled={isLocked}
                  onChange={(e) => setSelectedCat(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40 disabled:bg-gray-100"
                >
                  <option value="">— Zgjidh —</option>
                  {cats.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.code} — {c.label}
                    </option>
                  ))}
                </select>

                {selectedCatObj ? (
                  <div className="mt-1 text-[11px] text-gray-500 flex items-center gap-2">
                    <CategoryBadge code={selectedCatObj.code} />
                    <span className="truncate">{selectedCatObj.label}</span>
                  </div>
                ) : null}
              </div>

              {/* From / To */}
              <div className="lg:col-span-2">
                <label className="text-xs font-semibold text-gray-600">Nga</label>
                <input
                  type="date"
                  value={from}
                  disabled={isLocked}
                  onChange={(e) => setFrom(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40 disabled:bg-gray-100"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="text-xs font-semibold text-gray-600">Deri</label>
                <input
                  type="date"
                  value={to}
                  disabled={isLocked}
                  onChange={(e) => setTo(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40 disabled:bg-gray-100"
                />
              </div>

              {/* Add button */}
              <div className="lg:col-span-1 flex items-end">
                <DisabledWrap disabled={addDisabled} reason={addReason}>
                  <button
                    onClick={handleAddRow}
                    disabled={addDisabled}
                    className="
                      w-full inline-flex items-center justify-center gap-2
                      px-3 py-2 rounded-xl text-sm font-semibold text-white
                      bg-emerald-600 hover:bg-emerald-700
                      shadow-sm hover:shadow transition
                      disabled:opacity-50 disabled:cursor-not-allowed
                    "
                  >
                    <HiPlus className="text-lg" />
                    Shto
                  </button>
                </DisabledWrap>
              </div>

              {/* Location */}
              <div className="lg:col-span-4">
                <label className="text-xs font-semibold text-gray-600">Vend</label>
                <input
                  value={location}
                  disabled={isLocked}
                  onChange={(e) => setLocation(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40 disabled:bg-gray-100"
                  placeholder="p.sh. Spital, jashtë vendit..."
                />
              </div>

              {/* Notes */}
              <div className="lg:col-span-8">
                <label className="text-xs font-semibold text-gray-600">Shënime</label>
                <input
                  value={notes}
                  disabled={isLocked}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40 disabled:bg-gray-100"
                  placeholder="opsionale"
                />
              </div>

              {/* Emergency section */}
              <div className="lg:col-span-12">
                <div className="mt-2 grid sm:grid-cols-3 gap-3 items-center rounded-2xl border border-gray-100 bg-gray-50/60 p-3">
                  <label className="flex items-center gap-2 text-sm text-gray-800">
                    <input
                      type="checkbox"
                      disabled={isLocked}
                      checked={emergency}
                      onChange={(e) => {
                        setEmergency(e.target.checked);
                        if (!e.target.checked) {
                          setChainVacation(false);
                          setVacationTo('');
                          setUpcoming([]);
                        }
                      }}
                    />
                    Emergjencë sot
                  </label>

                  <label className="flex items-center gap-2 text-sm text-gray-800">
                    <input
                      type="checkbox"
                      disabled={isLocked || !emergency}
                      checked={chainVacation}
                      onChange={(e) => setChainVacation(e.target.checked)}
                    />
                    Vazhdo me pushim nga nesër
                  </label>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-700 whitespace-nowrap">Deri (pushimi):</span>
                    <input
                      type="date"
                      disabled={isLocked || !emergency || !chainVacation}
                      value={vacationTo}
                      onChange={(e) => setVacationTo(e.target.value)}
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40 disabled:bg-gray-100"
                    />
                  </div>
                </div>

                {upcoming.length > 0 && (
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <div className="font-semibold mb-1">Ky person ka pushime të miratuara nga nesër:</div>

                    {upcoming.slice(0, 3).map((u) => (
                      <div key={u._id}>
                        <span className="font-semibold">
                          {u.categoryCode} — {u.categoryLabel}
                        </span>{' '}
                        <span className="font-mono text-amber-900/80">
                          ({fmtShortDate(u.from)}
                          {u.to ? ` → ${fmtShortDate(u.to)}` : ''})
                        </span>
                      </div>
                    ))}

                    {upcoming.length > 3 && <div>…dhe {upcoming.length - 3} të tjera.</div>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Rows table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-white flex items-center justify-between">
              <div className="font-semibold text-gray-900">Rreshtat</div>
              <div className="text-xs text-gray-500">
                Totali: <span className="font-mono text-gray-700">{rows?.length ?? 0}</span>
              </div>
            </div>

            {(rows?.length ?? 0) === 0 ? (
              <div className="p-4 text-sm text-gray-500">Ende nuk ka rreshta.</div>
            ) : (
              <div className="overflow-x-auto max-h-[520px]">
                <table className="min-w-[980px] w-full text-sm">
                  <thead className="bg-gray-50/70 sticky top-0 z-10">
                    <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b">
                      <th className="py-3 px-4">Nr. Shërbimi / Emri</th>
                      <th className="py-3 px-4">Kategoria</th>
                      <th className="py-3 px-4">Nga</th>
                      <th className="py-3 px-4">Deri</th>
                      <th className="py-3 px-4">Vend</th>
                      <th className="py-3 px-4">Shënime</th>
                      <th className="py-3 px-4 w-28">Veprime</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y">
                    {(rows ?? []).map((r) => (
                      <tr key={r._id} className="hover:bg-gray-50/60">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-gray-900">
                            <span className="font-mono">{r.personId?.serviceNo}</span> — {r.personId?.firstName}{' '}
                            {r.personId?.lastName}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2 text-gray-900">
                            <CategoryBadge code={r.categoryId?.code} />
                            <span className="truncate">{r.categoryId?.label}</span>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <input
                            type="date"
                            disabled={isLocked}
                            value={r.from?.slice(0, 10) || ''}
                            onChange={(e) => handleInlineUpdate(r, 'from', e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40 disabled:bg-gray-100"
                          />
                        </td>

                        <td className="py-3 px-4">
                          <input
                            type="date"
                            disabled={isLocked}
                            value={r.to?.slice(0, 10) || ''}
                            onChange={(e) => handleInlineUpdate(r, 'to', e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40 disabled:bg-gray-100"
                          />
                        </td>

                        <td className="py-3 px-4">
                          <input
                            disabled={isLocked}
                            value={r.location || ''}
                            onChange={(e) => handleInlineUpdate(r, 'location', e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40 disabled:bg-gray-100"
                            placeholder="—"
                          />
                        </td>

                        <td className="py-3 px-4">
                          <input
                            disabled={isLocked}
                            value={r.notes || ''}
                            onChange={(e) => handleInlineUpdate(r, 'notes', e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40 disabled:bg-gray-100"
                            placeholder="—"
                          />
                        </td>

                        <td className="py-3 px-4">
                          <button
                            disabled={isLocked}
                            onClick={() => handleDelete(r._id)}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            title={
                              isLocked
                                ? timeLocked
                                  ? 'Drafti është i bllokuar pas 16:00 (ose është ditë e kaluar)'
                                  : 'Raporti është i mbyllur për ndryshime'
                                : ''
                            }
                          >
                            <HiTrash className="text-lg" />
                            Fshi
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
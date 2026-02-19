import { useEffect, useMemo, useState } from 'react';

import { listReports, approveReport, rejectReport, getReport } from '../lib/api';

import {
  HiRefresh,
  HiSearch,
  HiCheckCircle,
  HiXCircle,
  HiClock,
  HiDocumentText,
  HiX,
  HiEye,
} from 'react-icons/hi';

type ReportStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';

type UnitBrief = { id: string; code?: string; name?: string };

type Report = {
  _id: string;
  date: string;
  unitId: string;
  unit?: UnitBrief | null; // ✅ backend tash po e kthen kete
  status: ReportStatus;
  reviewComment?: string;
};

type Row = {
  _id: string;
  personId?: { serviceNo?: string; firstName?: string; lastName?: string };
  categoryId?: { code?: string; label?: string };
  from?: string;
  to?: string;
  location?: string;
  notes?: string;
};

function fmtDate(iso?: string) {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  return s.length === 10 ? s : String(iso);
}

function fmtUnit(rep?: { unitId?: string; unit?: UnitBrief | null }) {
  if (!rep) return '—';
  const code = rep.unit?.code?.trim();
  const name = rep.unit?.name?.trim();
  if (code && name) return `${code} — ${name}`;
  if (code) return code;
  if (name) return name;
  return String(rep.unitId ?? '—');
}

function StatusPill({ status }: { status: ReportStatus }) {
  const map: Record<ReportStatus, { cls: string; label: string; icon: JSX.Element }> = {
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

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="font-semibold text-gray-900">{title}</div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
              aria-label="Mbyll"
            >
              <HiX className="text-lg" />
            </button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function Approvals() {
  const [items, setItems] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  const [busyId, setBusyId] = useState<string | null>(null);

  // UI filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ReportStatus>('PENDING');

  // View details
  const [viewOpen, setViewOpen] = useState(false);
  const [viewMeta, setViewMeta] = useState<Report | null>(null);
  const [viewRows, setViewRows] = useState<Row[] | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  // Approve/Reject modal
  const [actionOpen, setActionOpen] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');
  const [actionReport, setActionReport] = useState<Report | null>(null);
  const [comment, setComment] = useState('');

  async function load() {
    setLoading(true);
    try {
      const params: any = {};
      if (statusFilter !== 'ALL') params.status = statusFilter;

      const data = await listReports(params);

      const list: Report[] = Array.isArray(data)
        ? data
        : Array.isArray((data as any)?.items)
          ? (data as any).items
          : [];

      // newest first
      list.sort((a, b) => String(b.date).localeCompare(String(a.date)));

      setItems(list);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;

    return items.filter((it) => {
      const d = fmtDate(it.date).toLowerCase();

      // ✅ lejo search edhe me code/name, jo veq me unitId
      const u = `${it.unit?.code ?? ''} ${it.unit?.name ?? ''} ${it.unitId ?? ''}`.toLowerCase();

      const id = String(it._id).toLowerCase();
      return d.includes(term) || u.includes(term) || id.includes(term);
    });
  }, [items, search]);

  const counts = useMemo(() => {
    const c = { TOTAL: items.length, DRAFT: 0, PENDING: 0, APPROVED: 0, REJECTED: 0 };
    items.forEach((r) => {
      if (r.status === 'DRAFT') c.DRAFT++;
      if (r.status === 'PENDING') c.PENDING++;
      if (r.status === 'APPROVED') c.APPROVED++;
      if (r.status === 'REJECTED') c.REJECTED++;
    });
    return c;
  }, [items]);

  async function handleView(it: Report) {
    setViewMeta(it);
    setViewRows(null);
    setViewOpen(true);
    setViewLoading(true);

    try {
      const full = await getReport(it._id);

      // ✅ nëse getReport kthen unit edhe aty, e bashkojmë me meta
      const fullUnit = (full as any)?.unit;
      if (fullUnit) {
        setViewMeta((prev) => (prev ? { ...prev, unit: fullUnit } : prev));
      }

      setViewRows(Array.isArray((full as any)?.rows) ? (full as any).rows : []);
    } finally {
      setViewLoading(false);
    }
  }

  function openAction(type: 'approve' | 'reject', it: Report) {
    setActionType(type);
    setActionReport(it);
    setComment('');
    setActionOpen(true);
  }

  async function confirmAction() {
    if (!actionReport) return;
    const id = actionReport._id;

    if (actionType === 'reject' && comment.trim().length < 2) {
      alert('Shkruaj arsyen e refuzimit (të paktën 2 karaktere).');
      return;
    }

    setBusyId(id);
    try {
      if (actionType === 'approve') {
        await approveReport(id, comment.trim());
      } else {
        await rejectReport(id, comment.trim());
      }

      setActionOpen(false);

      // nëse je duke e shiku detajin, rifreskoje edhe atë
      if (viewMeta?._id === id) {
        const full = await getReport(id);
        setViewRows(Array.isArray((full as any)?.rows) ? (full as any).rows : []);
        setViewMeta((prev) =>
          prev ? { ...prev, status: actionType === 'approve' ? 'APPROVED' : 'REJECTED' } : prev,
        );
      }

      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Miratime</h1>
            <div className="text-sm text-gray-500">Menaxho raportet dhe miratimet.</div>
          </div>

          <button
            onClick={load}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:bg-black shadow-sm"
          >
            <HiRefresh className="text-lg" />
            Rifresko
          </button>
        </div>

        {/* Quick counts */}
        <div className="grid sm:grid-cols-5 gap-2">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wider text-gray-500">Total</div>
            <div className="text-lg font-extrabold text-gray-900">{counts.TOTAL}</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wider text-slate-600">Draft</div>
            <div className="text-lg font-extrabold text-slate-900">{counts.DRAFT}</div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wider text-amber-700">Në pritje</div>
            <div className="text-lg font-extrabold text-amber-900">{counts.PENDING}</div>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wider text-emerald-700">Miratuar</div>
            <div className="text-lg font-extrabold text-emerald-900">{counts.APPROVED}</div>
          </div>

          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wider text-rose-700">Refuzuar</div>
            <div className="text-lg font-extrabold text-rose-900">{counts.REJECTED}</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="flex-1">
            <label className="text-xs font-semibold text-gray-600">Kërko (data / unit / id)</label>
            <div className="mt-1 relative">
              <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="p.sh. 2026-02-12 ose U-001 ose 69260a..."
                className="w-full pl-10 pr-10 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-gray-100 text-gray-400"
                  aria-label="Clear"
                >
                  <HiX className="text-lg" />
                </button>
              )}
            </div>
          </div>

          <div className="w-full lg:w-60">
            <label className="text-xs font-semibold text-gray-600">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40"
            >
              <option value="PENDING">Vetëm në pritje</option>
              <option value="ALL">Të gjitha</option>
              <option value="DRAFT">Draft</option>
              <option value="APPROVED">Miratuar</option>
              <option value="REJECTED">Refuzuar</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-white flex items-center justify-between">
          <div className="font-semibold text-gray-900">Raportet</div>
          <div className="text-xs text-gray-500">
            Shfaqur: <span className="font-mono text-gray-700">{filtered.length}</span>
          </div>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-gray-600">Duke ngarkuar…</div>
        ) : filtered.length === 0 ? (
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
                  <th className="py-3 px-4 w-[340px]">Veprime</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {filtered.map((it) => (
                  <tr key={it._id} className="hover:bg-gray-50/60">
                    <td className="py-3 px-4 font-mono text-gray-900">{fmtDate(it.date)}</td>

                    {/* ✅ shfaq code/name nese ekziston, perndryshe fallback te unitId */}
                    <td className="py-3 px-4 text-gray-700">{fmtUnit(it)}</td>

                    <td className="py-3 px-4">
                      <StatusPill status={it.status} />
                    </td>

                    <td className="py-3 px-4 font-mono text-gray-600">{String(it._id).slice(-12)}</td>

                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleView(it)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-gray-200 bg-white hover:bg-gray-50 shadow-sm"
                        >
                          <HiEye className="text-lg text-gray-500" />
                          Shiko
                        </button>

                        <button
                          disabled={it.status !== 'PENDING' || busyId === it._id}
                          onClick={() => openAction('approve', it)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          title={it.status !== 'PENDING' ? 'Vetëm raportet në pritje mund të miratohen' : ''}
                        >
                          <HiCheckCircle className="text-lg" />
                          Mirato
                        </button>

                        <button
                          disabled={it.status !== 'PENDING' || busyId === it._id}
                          onClick={() => openAction('reject', it)}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          title={it.status !== 'PENDING' ? 'Vetëm raportet në pritje mund të refuzohen' : ''}
                        >
                          <HiXCircle className="text-lg" />
                          Refuzo
                        </button>

                        {busyId === it._id ? (
                          <span className="text-xs text-gray-500 inline-flex items-center">
                            Duke procesuar…
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* View modal */}
      <Modal
        open={viewOpen}
        title={viewMeta ? `Detajet e raportit — ${fmtDate(viewMeta.date)}` : 'Detajet e raportit'}
        onClose={() => {
          setViewOpen(false);
          setViewMeta(null);
          setViewRows(null);
        }}
      >
        {viewMeta ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div className="text-sm text-gray-700">
              Njësia: <span className="font-mono text-gray-900">{fmtUnit(viewMeta)}</span>
            </div>
            <StatusPill status={viewMeta.status} />
          </div>
        ) : null}

        {viewLoading ? (
          <div className="text-sm text-gray-600">Duke ngarkuar rreshtat…</div>
        ) : !viewRows || viewRows.length === 0 ? (
          <div className="text-sm text-gray-500">Pa rreshta.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="bg-gray-50/70">
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b">
                  <th className="py-3 px-3">Nr.Shërbimi / Emri</th>
                  <th className="py-3 px-3">Kategoria</th>
                  <th className="py-3 px-3">Periudha</th>
                  <th className="py-3 px-3">Vend</th>
                  <th className="py-3 px-3">Shënime</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {viewRows.map((r) => (
                  <tr key={r._id} className="hover:bg-gray-50/60">
                    <td className="py-3 px-3 text-gray-900">
                      <span className="font-mono">{r.personId?.serviceNo}</span> — {r.personId?.firstName}{' '}
                      {r.personId?.lastName}
                    </td>

                    <td className="py-3 px-3 text-gray-700">
                      <span className="font-mono">{r.categoryId?.code}</span> — {r.categoryId?.label}
                    </td>

                    <td className="py-3 px-3 text-gray-700 font-mono">
                      {fmtDate(r.from)} → {fmtDate(r.to)}
                    </td>

                    <td className="py-3 px-3 text-gray-700">{r.location ?? '—'}</td>
                    <td className="py-3 px-3 text-gray-700">{r.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* actions inside view */}
        {viewMeta?.status === 'PENDING' ? (
          <div className="mt-4 flex flex-wrap gap-2 justify-end">
            <button
              onClick={() => openAction('reject', viewMeta)}
              disabled={busyId === viewMeta._id}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-sm disabled:opacity-50"
            >
              <HiXCircle className="text-lg" />
              Refuzo
            </button>

            <button
              onClick={() => openAction('approve', viewMeta)}
              disabled={busyId === viewMeta._id}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm disabled:opacity-50"
            >
              <HiCheckCircle className="text-lg" />
              Mirato
            </button>
          </div>
        ) : null}
      </Modal>

      {/* Approve/Reject modal */}
      <Modal
        open={actionOpen}
        title={actionType === 'approve' ? 'Mirato raportin' : 'Refuzo raportin'}
        onClose={() => setActionOpen(false)}
      >
        <div className="space-y-3">
          <div className="text-sm text-gray-700">
            {actionReport ? (
              <>
                Raporti: <span className="font-mono">{fmtDate(actionReport.date)}</span> — Njësia:{' '}
                <span className="font-mono">{fmtUnit(actionReport)}</span>
              </>
            ) : null}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">
              {actionType === 'approve' ? 'Koment (opsional)' : 'Arsyeja e refuzimit (e detyrueshme)'}
            </label>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              placeholder={actionType === 'approve' ? 'Shkruaj koment...' : 'Shkruaj arsyen...'}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40"
            />

            {actionType === 'reject' ? (
              <div className="mt-1 text-[11px] text-gray-500">Minimum 2 karaktere.</div>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setActionOpen(false)}
              className="px-3 py-2 rounded-xl text-sm font-semibold border border-gray-200 bg-white hover:bg-gray-50 shadow-sm"
            >
              Anulo
            </button>

            <button
              onClick={confirmAction}
              disabled={!actionReport || (actionReport && busyId === actionReport._id)}
              className={[
                'px-3 py-2 rounded-xl text-sm font-semibold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed',
                actionType === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700',
              ].join(' ')}
            >
              {actionType === 'approve' ? 'Mirato' : 'Refuzo'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
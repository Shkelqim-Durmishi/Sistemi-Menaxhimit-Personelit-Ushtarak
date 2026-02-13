import React, { useEffect, useMemo, useState } from 'react';

import {
  getSummary,
  getCharts,
  type MetaCharts,
  getCurrentUser,
  getRole,
  listReports,
  listIncomingRequests,
  type RequestItem,
} from '../lib/api';

import { FiUsers, FiFileText, FiList, FiClock, FiArrowRight, FiInbox } from 'react-icons/fi';
import { Link } from 'react-router-dom';

// ✅ Charts (Recharts)
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
  CartesianGrid,
} from 'recharts';

type Summary = Awaited<ReturnType<typeof getSummary>>;

function fmtDate(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function badgeTone(status?: string) {
  const s = (status || '').toUpperCase();
  if (s.includes('APPROV')) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (s.includes('REJECT')) return 'bg-rose-50 text-rose-700 border-rose-100';
  if (s.includes('SUBMIT') || s.includes('PEND')) return 'bg-amber-50 text-amber-800 border-amber-100';
  return 'bg-slate-50 text-slate-700 border-slate-100';
}

function shortDayLabel(iso: string) {
  // iso "YYYY-MM-DD" -> "MM-DD"
  if (!iso) return '';
  const s = String(iso);
  if (s.length >= 10) return s.slice(5, 10);
  return s;
}

// ✅ YYYY-MM-DD -> DD-MM-YYYY
function fmtDateDMY(iso?: string | null) {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const [y, m, d] = s.split('-');
  return `${d}-${m}-${y}`;
}

const COLORS = ['#2F3E2E', '#C9A24D', '#ef4444', '#64748b', '#10b981', '#f97316'];

export default function Dashboard() {
  const [sum, setSum] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const [charts, setCharts] = useState<MetaCharts | null>(null);
  const [loadingCharts, setLoadingCharts] = useState(true);

  const [recentReports, setRecentReports] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);

  const [incomingReq, setIncomingReq] = useState<RequestItem[]>([]);
  const [loadingReq, setLoadingReq] = useState(true);

  // (nëse s’po e përdor, mundesh me e fshi krejt)
  const user = getCurrentUser();
  const role = getRole();

  const canSeeIncomingRequests =
    role === 'ADMIN' || role === 'AUDITOR' || role === 'COMMANDER' || role === 'OFFICER' || role === 'OPERATOR';

  // SUMMARY
  useEffect(() => {
    (async () => {
      try {
        setSum(await getSummary());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // CHARTS
  useEffect(() => {
    (async () => {
      setLoadingCharts(true);
      try {
        const data = await getCharts();
        setCharts(data);
      } catch {
        setCharts(null);
      } finally {
        setLoadingCharts(false);
      }
    })();
  }, []);

  // Raportet e fundit
  useEffect(() => {
    (async () => {
      setLoadingReports(true);
      try {
        const data = await listReports();
        setRecentReports((data ?? []).slice(0, 6));
      } catch {
        setRecentReports([]);
      } finally {
        setLoadingReports(false);
      }
    })();
  }, []);

  // Kërkesat në pritje (incoming)
  useEffect(() => {
    (async () => {
      if (!canSeeIncomingRequests) {
        setIncomingReq([]);
        setLoadingReq(false);
        return;
      }

      setLoadingReq(true);
      try {
        const page = await listIncomingRequests({ status: 'PENDING', page: 1, limit: 6 });
        setIncomingReq(page?.items ?? []);
      } catch {
        setIncomingReq([]);
      } finally {
        setLoadingReq(false);
      }
    })();
  }, [canSeeIncomingRequests]);

  const cards = useMemo(
    () => [
      {
        title: 'Pjesëtarë aktivë',
        value: sum?.totalPeople ?? 0,
        icon: <FiUsers />,
        tone: 'green' as const,
      },
      {
        title: 'Raporte sot',
        value: sum?.reportsToday ?? 0,
        icon: <FiFileText />,
        tone: 'gold' as const,
      },
      {
        title: 'Rreshta sot',
        value: sum?.rowsToday ?? 0,
        icon: <FiList />,
        tone: 'slate' as const,
      },
      {
        title: 'Në miratim',
        value: sum?.reportsPending ?? 0,
        icon: <FiClock />,
        tone: 'red' as const,
      },
    ],
    [sum]
  );

  // ===== Derived chart datasets =====
  const reportTrendData = useMemo(() => {
    const arr = charts?.reportTrend ?? [];
    return arr.map((x) => ({ ...x, day: shortDayLabel(x.date) }));
  }, [charts]);

  const justTrendData = useMemo(() => {
    const arr = charts?.justificationTrend ?? [];
    return arr.map((x) => ({ ...x, day: shortDayLabel(x.date) }));
  }, [charts]);

  const reportsStatusPie = useMemo(() => {
    const items = charts?.reportsByStatus ?? [];
    const order = ['APPROVED', 'PENDING', 'REJECTED', 'DRAFT'];
    const sorted = [...items].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
    return sorted.map((x) => ({ name: x.status, value: x.count }));
  }, [charts]);

  const justificationTotals = useMemo(() => {
    const arr = charts?.justificationTrend ?? [];
    const total = arr.reduce((acc, x) => acc + (x.rows || 0), 0);
    const emergency = arr.reduce((acc, x) => acc + (x.emergency || 0), 0);
    const normal = Math.max(0, total - emergency);
    return [
      { name: 'Normale', value: normal },
      { name: 'Emergency', value: emergency },
    ];
  }, [charts]);

  const topCategoriesBar = useMemo(() => {
    const arr = charts?.topCategories ?? [];
    return arr.map((x) => ({ name: x.label || x.code || '—', count: x.count, emergency: x.emergency }));
  }, [charts]);

  const topLocationsBar = useMemo(() => {
    const arr = charts?.topLocations ?? [];
    return arr.map((x) => ({ name: x.location, count: x.count }));
  }, [charts]);

  const peopleByStatusBar = useMemo(() => {
    const arr = charts?.peopleByStatus ?? [];
    return arr.map((x) => ({ name: x.status, count: x.count }));
  }, [charts]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Përmbledhje</h1>
          <p className="text-sm text-gray-500 mt-1">Përmbledhje e shpejtë e gjendjes së sistemit.</p>

          {/* ✅ U HOQ pjesa Trend / Unit që e kishe rrethuar me të kuqe */}
        </div>

        {/* ✅ DATËN (format DD-MM-YYYY) */}
        <div className="sm:pt-1">
          {loading ? (
            <div className="h-8 w-48 bg-gray-100 rounded-full animate-pulse" />
          ) : sum ? (
            <div className="inline-flex items-center gap-2 text-xs text-gray-700 bg-white rounded-full border border-gray-100 shadow-sm px-3 py-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C9A24D] opacity-40" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#2F3E2E]" />
              </span>
              Për datën: <span className="font-mono text-gray-900">{fmtDateDMY(sum.date)}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((c) => (
            <StatCard key={c.title} title={c.title} value={c.value} icon={c.icon} tone={c.tone} />
          ))}
        </div>
      )}

      {/* ✅ CHARTS */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Line Chart – Reports trend */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900">Raportet – 7 ditët e fundit</h3>
            {loadingCharts ? <span className="text-xs text-gray-400">Loading…</span> : null}
          </div>

          {loadingCharts ? (
            <ChartSkeleton />
          ) : charts ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={reportTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="reports" stroke="#2F3E2E" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="pending" stroke="#C9A24D" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-sm text-gray-500">S’u arrit me i marrë charts nga backend.</div>
          )}

          <div className="mt-2 text-xs text-gray-500">
            <span className="font-medium text-gray-700">Reports</span> &nbsp;•&nbsp;{' '}
            <span className="font-medium text-gray-700">Pending</span>
          </div>
        </div>

        {/* Pie – Report status */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900">Statusi i raporteve</h3>
            {loadingCharts ? <span className="text-xs text-gray-400">Loading…</span> : null}
          </div>

          {loadingCharts ? (
            <ChartSkeleton />
          ) : charts ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={reportsStatusPie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                  {reportsStatusPie.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-sm text-gray-500">S’u arrit me i marrë charts nga backend.</div>
          )}
        </div>

        {/* Bar – Justifications (totals) */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900">Justifikime (7 ditë)</h3>
            {loadingCharts ? <span className="text-xs text-gray-400">Loading…</span> : null}
          </div>

          {loadingCharts ? (
            <ChartSkeleton />
          ) : charts ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={justificationTotals}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#2F3E2E" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-sm text-gray-500">S’u arrit me i marrë charts nga backend.</div>
          )}
        </div>
      </div>

      {/* ✅ More charts */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Line – Rows trend */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900">Rreshta – 7 ditët e fundit</h3>
            {loadingCharts ? <span className="text-xs text-gray-400">Loading…</span> : null}
          </div>

          {loadingCharts ? (
            <ChartSkeleton />
          ) : charts ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={justTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="rows" stroke="#2F3E2E" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="emergency" stroke="#ef4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-sm text-gray-500">S’u arrit me i marrë charts nga backend.</div>
          )}

          <div className="mt-2 text-xs text-gray-500">
            <span className="font-medium text-gray-700">Rows</span> &nbsp;•&nbsp;{' '}
            <span className="font-medium text-gray-700">Emergency</span>
          </div>
        </div>

        {/* Bar – Top Categories */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900">Top kategori (7 ditë)</h3>
            {loadingCharts ? <span className="text-xs text-gray-400">Loading…</span> : null}
          </div>

          {loadingCharts ? (
            <ChartSkeleton />
          ) : charts ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topCategoriesBar}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" hide />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#2F3E2E" radius={[6, 6, 0, 0]} />
                <Bar dataKey="emergency" fill="#ef4444" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-sm text-gray-500">S’u arrit me i marrë charts nga backend.</div>
          )}

          {!loadingCharts && charts ? (
            <div className="mt-2 text-xs text-gray-500">
              <span className="font-medium text-gray-700">Tip:</span> lëviz kursorin mbi bar për me pa emrin.
            </div>
          ) : null}
        </div>

        {/* Bar – Top Locations */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900">Top lokacione (7 ditë)</h3>
            {loadingCharts ? <span className="text-xs text-gray-400">Loading…</span> : null}
          </div>

          {loadingCharts ? (
            <ChartSkeleton />
          ) : charts ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topLocationsBar}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" hide />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#C9A24D" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-sm text-gray-500">S’u arrit me i marrë charts nga backend.</div>
          )}

          {!loadingCharts && charts ? (
            <div className="mt-2 text-xs text-gray-500">
              <span className="font-medium text-gray-700">Tip:</span> lëviz kursorin mbi bar për me pa lokacionin.
            </div>
          ) : null}
        </div>
      </div>

      {/* ✅ People by status */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900">Pjesëtarë sipas statusit</h3>
          {loadingCharts ? <span className="text-xs text-gray-400">Loading…</span> : null}
        </div>

        {loadingCharts ? (
          <div className="h-20 bg-gray-50 rounded-xl animate-pulse" />
        ) : charts ? (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={peopleByStatusBar}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#2F3E2E" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-sm text-gray-500">S’u arrit me i marrë charts nga backend.</div>
        )}
      </div>

      {/* Lists */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Recent Reports */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="font-semibold text-gray-900">Raportet e fundit</div>
            <Link to="/reports" className="text-sm text-blue-700 hover:underline inline-flex items-center gap-1">
              Shiko krejt <FiArrowRight />
            </Link>
          </div>

          {loadingReports ? (
            <div className="p-4 space-y-3">
              <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-56 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-44 bg-gray-100 rounded animate-pulse" />
            </div>
          ) : recentReports.length ? (
            <div className="divide-y">
              {recentReports.map((r: any) => (
                <div key={r._id || r.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {r.date ? `Raport: ${r.date}` : 'Raport'}
                    </div>
                    <div className="text-xs text-gray-500">
                      Njësia: <span className="font-mono">{r.unitId ?? '—'}</span>
                      <span className="mx-2">•</span>
                      Përditësuar: {fmtDate(r.updatedAt || r.createdAt)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={['text-xs px-2 py-1 rounded-full border', badgeTone(r.status)].join(' ')}>
                      {(r.status || '—').toString()}
                    </span>

                    {r._id || r.id ? (
                      <Link
                        to={`/reports/${r._id || r.id}`}
                        className="text-sm text-gray-700 hover:text-gray-900 underline-offset-4 hover:underline"
                      >
                        Hap
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-sm text-gray-500">S’ka raporte për me shfaqë.</div>
          )}
        </div>

        {/* Incoming Requests */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="font-semibold text-gray-900 inline-flex items-center gap-2">
              <FiInbox />
              Kërkesa në pritje
            </div>
            <Link to="/requests" className="text-sm text-blue-700 hover:underline inline-flex items-center gap-1">
              Shiko krejt <FiArrowRight />
            </Link>
          </div>

          {!canSeeIncomingRequests ? (
            <div className="p-4 text-sm text-gray-500">Nuk ke autorizim për këtë seksion.</div>
          ) : loadingReq ? (
            <div className="p-4 space-y-3">
              <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-56 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-44 bg-gray-100 rounded animate-pulse" />
            </div>
          ) : incomingReq.length ? (
            <div className="divide-y">
              {incomingReq.map((x: any) => (
                <div key={x.id || x._id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {x.type || 'Kërkesë'} •{' '}
                      {x.personId?.firstName || x.personId?.lastName
                        ? `${x.personId?.firstName ?? ''} ${x.personId?.lastName ?? ''}`.trim()
                        : x.personId?.serviceNo || '—'}
                    </div>
                    <div className="text-xs text-gray-500">
                      Krijuar: {fmtDate(x.createdAt)}
                      {x.createdBy?.username ? (
                        <>
                          <span className="mx-2">•</span>
                          Nga: <span className="font-medium">{x.createdBy.username}</span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={['text-xs px-2 py-1 rounded-full border', badgeTone('PENDING')].join(' ')}>
                      PENDING
                    </span>

                    <Link
                      to={`/requests`}
                      className="text-sm text-gray-700 hover:text-gray-900 underline-offset-4 hover:underline"
                    >
                      Hap
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-sm text-gray-500">Aktualisht s’ka kërkesa në pritje.</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================
   Components
========================= */

function StatCard({
  title,
  value,
  icon,
  tone,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  tone: 'green' | 'gold' | 'slate' | 'red';
}) {
  const toneStyles = {
    green: {
      ring: 'hover:ring-[#2F3E2E]/20',
      iconBg: 'bg-[#2F3E2E]/10 text-[#2F3E2E]',
      bar: 'bg-[#2F3E2E]',
      glow: 'from-[#2F3E2E]/10 to-transparent',
    },
    gold: {
      ring: 'hover:ring-[#C9A24D]/25',
      iconBg: 'bg-[#C9A24D]/15 text-[#8a6f2f]',
      bar: 'bg-[#C9A24D]',
      glow: 'from-[#C9A24D]/15 to-transparent',
    },
    slate: {
      ring: 'hover:ring-slate-200',
      iconBg: 'bg-slate-50 text-slate-700',
      bar: 'bg-slate-500',
      glow: 'from-slate-100 to-transparent',
    },
    red: {
      ring: 'hover:ring-rose-200',
      iconBg: 'bg-rose-50 text-rose-700',
      bar: 'bg-rose-500',
      glow: 'from-rose-100 to-transparent',
    },
  }[tone];

  return (
    <div
      className={[
        'group relative bg-white rounded-2xl border border-gray-100 shadow-sm p-4 overflow-hidden',
        'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        'ring-1 ring-transparent',
        toneStyles.ring,
      ].join(' ')}
    >
      <div className={['pointer-events-none absolute inset-0 bg-gradient-to-br', toneStyles.glow].join(' ')} />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-gray-500">{title}</div>
          <div className="text-3xl font-semibold mt-1 text-gray-900">{value}</div>
        </div>

        <div className={['w-10 h-10 rounded-xl flex items-center justify-center shadow-sm', toneStyles.iconBg].join(' ')}>
          <span className="text-lg">{icon}</span>
        </div>
      </div>

      <div className="relative mt-4 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
        <div className={['h-full w-1/3 rounded-full transition-all duration-300 group-hover:w-2/3', toneStyles.bar].join(' ')} />
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 w-full">
          <div className="h-4 w-28 bg-gray-100 rounded animate-pulse" />
          <div className="h-8 w-20 bg-gray-100 rounded animate-pulse" />
        </div>
        <div className="w-10 h-10 bg-gray-100 rounded-xl animate-pulse" />
      </div>

      <div className="mt-4 h-1.5 w-full bg-gray-100 rounded-full animate-pulse" />
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-[220px] bg-gray-50 rounded-xl animate-pulse" />;
}

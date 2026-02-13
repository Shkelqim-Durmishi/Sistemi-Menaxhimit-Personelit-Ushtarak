import { useEffect, useMemo, useState } from 'react';

import {
  getRole,
  getCurrentUnitId,
  listVehicles,
  listVehiclesLive,
  listUnits,
  adminCreateVehicle,
  type UnitItem,
} from '../lib/api';

import { HiRefresh, HiPlus, HiSearch, HiExclamation, HiX, HiLocationMarker } from 'react-icons/hi';

type VehicleRow = {
  id: string;
  plateNumber: string;
  name?: string | null;
  unitId?: string | null;
};

type LiveRow = {
  vehicleId: string;
  lat: number;
  lng: number;
  speed?: number | null;
  heading?: number | null;
  capturedAt: string;
  unitId?: string | null;
};

function fmtDate(v?: string) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function isStale(capturedAt: string, minutes = 5) {
  const t = new Date(capturedAt).getTime();
  if (!t) return true;
  return Date.now() - t > minutes * 60 * 1000;
}

function Badge({
  tone,
  children,
}: {
  tone: 'green' | 'amber' | 'gray' | 'red' | 'slate';
  children: React.ReactNode;
}) {
  const cls =
    tone === 'green'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : tone === 'red'
          ? 'bg-rose-50 text-rose-800 border-rose-200'
          : tone === 'slate'
            ? 'bg-slate-50 text-slate-800 border-slate-200'
            : 'bg-gray-50 text-gray-700 border-gray-200';

  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border',
        cls,
      ].join(' ')}
    >
      {children}
    </span>
  );
}

function StatChip({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-lg font-extrabold text-gray-900">{value}</div>
    </div>
  );
}

export default function VehiclesLive() {
  const role = getRole();
  const unitId = getCurrentUnitId();

  const [loading, setLoading] = useState(false);
  const [pollMs, setPollMs] = useState(5000);
  const [q, setQ] = useState('');

  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [live, setLive] = useState<LiveRow[]>([]);
  const [err, setErr] = useState<string>('');

  const canSee = role === 'ADMIN' || role === 'COMMANDER' || role === 'OFFICER';
  const canSeeAllUnits = role === 'ADMIN';

  // ====== ADMIN: Modal state ======
  const isAdmin = role === 'ADMIN';
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string>('');

  const [form, setForm] = useState({
    name: '',
    plateNumber: '',
    unitId: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE',
    deviceId: '',
  });

  // ===== Row selection (for details panel) =====
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filteredVehicles = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const base = canSeeAllUnits ? vehicles : vehicles.filter((v) => (v.unitId ?? null) === (unitId ?? null));
    if (!qq) return base;
    return base.filter((v) => `${v.plateNumber} ${v.name ?? ''}`.toLowerCase().includes(qq));
  }, [vehicles, q, canSeeAllUnits, unitId]);

  const liveById = useMemo(() => {
    const m = new Map<string, LiveRow>();
    for (const p of live) m.set(p.vehicleId, p);
    return m;
  }, [live]);

  const selectedVehicle = useMemo(() => {
    if (!selectedId) return null;
    return filteredVehicles.find((v) => v.id === selectedId) ?? null;
  }, [selectedId, filteredVehicles]);

  const selectedLive = useMemo(() => {
    if (!selectedVehicle) return null;
    return liveById.get(selectedVehicle.id) ?? null;
  }, [selectedVehicle, liveById]);

  async function loadVehicles() {
    const data: any[] = await listVehicles();
    setVehicles(
      (data ?? []).map((v) => ({
        id: v.id,
        plateNumber: v.plateNumber,
        name: v.name ?? null,
        unitId: v.unit?.id ?? null,
      })),
    );
  }

  async function loadLive() {
    const data: any[] = await listVehiclesLive();

    const rows: LiveRow[] = (data ?? [])
      .map((x) => {
        const vehicleId = x?.vehicle?.id;
        if (!vehicleId) return null;
        return {
          vehicleId,
          lat: x.lat,
          lng: x.lng,
          speed: x.speed ?? null,
          heading: x.heading ?? null,
          capturedAt: x.capturedAt,
          unitId: x?.unitId ?? x?.vehicle?.unit?.id ?? null,
        } as LiveRow;
      })
      .filter(Boolean);

    if (!canSeeAllUnits) setLive(rows.filter((r) => (r.unitId ?? null) === (unitId ?? null)));
    else setLive(rows);
  }

  async function refreshAll() {
    setErr('');
    setLoading(true);
    try {
      await Promise.all([loadVehicles(), loadLive()]);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Gabim gjatë ngarkimit');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canSee) return;
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // polling live
  useEffect(() => {
    if (!canSee) return;
    const id = window.setInterval(() => {
      loadLive().catch(() => { });
    }, Math.max(2000, pollMs));
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollMs, canSee, canSeeAllUnits, unitId]);

  // ADMIN: load units once
  useEffect(() => {
    if (!isAdmin) return;
    listUnits().then(setUnits).catch(() => { });
  }, [isAdmin]);

  // keep selection valid when filtering changes
  useEffect(() => {
    if (!selectedId) return;
    const stillExists = filteredVehicles.some((v) => v.id === selectedId);
    if (!stillExists) setSelectedId(null);
  }, [filteredVehicles, selectedId]);

  function openAdd() {
    setErr('');
    setModalErr('');
    setForm({
      name: '',
      plateNumber: '',
      unitId: units?.[0]?.id ?? '',
      status: 'ACTIVE',
      deviceId: '',
    });
    setShowAdd(true);
  }

  async function submitAdd() {
    setModalErr('');

    if (!form.name.trim() || !form.plateNumber.trim() || !form.unitId) {
      setModalErr('Plotëso Emrin, Targën dhe Unit-in.');
      return;
    }

    setSaving(true);
    try {
      await adminCreateVehicle({
        name: form.name.trim(),
        plateNumber: form.plateNumber.trim(),
        unitId: form.unitId,
        status: form.status,
        deviceId: form.deviceId.trim() ? form.deviceId.trim() : null,
      });

      setShowAdd(false);
      await refreshAll();
    } catch (e: any) {
      setModalErr(e?.response?.data?.message || e?.message || 'Gabim gjatë ruajtjes');
    } finally {
      setSaving(false);
    }
  }

  const stats = useMemo(() => {
    let liveOk = 0;
    let stale = 0;
    let noSignal = 0;

    for (const v of filteredVehicles) {
      const p = liveById.get(v.id);
      if (!p) {
        noSignal++;
        continue;
      }
      if (isStale(p.capturedAt, 5)) stale++;
      else liveOk++;
    }

    return { total: filteredVehicles.length, live: liveOk, stale, noSignal };
  }, [filteredVehicles, liveById]);

  if (!canSee) {
    return (
      <div className="max-w-2xl space-y-3">
        <h1 className="text-xl font-semibold text-gray-900">Veturat (GPS Live)</h1>
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
          Nuk ke autorizim për këtë faqe.
        </div>
      </div>
    );
  }

  const selLat = selectedLive?.lat ?? null;
  const selLng = selectedLive?.lng ?? null;
  const selMapsUrl =
    selLat != null && selLng != null ? `https://www.google.com/maps?q=${encodeURIComponent(selLat)},${encodeURIComponent(selLng)}` : '';

  const selectedStatus = !selectedVehicle
    ? null
    : !selectedLive
      ? 'PA SINJAL'
      : isStale(selectedLive.capturedAt, 5)
        ? 'STALE'
        : 'LIVE';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Veturat (GPS Live)</h1>
            <p className="text-sm text-gray-600">
              {role === 'ADMIN' ? (
                'ADMIN i sheh krejt veturat / lokacionet.'
              ) : (
                <>
                  Sheh vetëm veturat e unit-it tënd{' '}
                  <span className="font-mono text-gray-700">({unitId ?? '—'})</span>.
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={openAdd}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm"
              >
                <HiPlus className="text-lg" />
                Shto veturë
              </button>
            )}

            <button
              onClick={refreshAll}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:bg-black shadow-sm"
            >
              <HiRefresh className="text-lg" />
              Rifresko
            </button>
          </div>
        </div>

        {err ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800 text-sm flex items-start gap-2">
            <HiExclamation className="text-lg mt-0.5" />
            <div className="flex-1">{err}</div>
          </div>
        ) : null}
      </div>

      {/* Filters + stats */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="text-xs font-semibold text-gray-600">Kërko (targa / emër)</label>
            <div className="mt-1 relative">
              <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full pl-10 pr-10 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40"
                placeholder="p.sh. 01-123-AB"
              />
              {q ? (
                <button
                  type="button"
                  onClick={() => setQ('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-gray-100 text-gray-400"
                  aria-label="Clear"
                >
                  <HiX className="text-lg" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="w-full lg:w-56">
            <label className="text-xs font-semibold text-gray-600">Polling</label>
            <select
              value={pollMs}
              onChange={(e) => setPollMs(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40"
            >
              <option value={2000}>2s</option>
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
              <option value={30000}>30s</option>
            </select>
          </div>

          <div className="text-xs text-gray-500">
            {loading ? 'Duke ngarkuar…' : `All: ${vehicles.length} • Live packets: ${live.length}`}
          </div>
        </div>

        <div className="grid sm:grid-cols-4 gap-2">
          <StatChip label="Total" value={stats.total} />
          <StatChip label="Live" value={stats.live} />
          <StatChip label="Stale" value={stats.stale} />
          <StatChip label="Pa sinjal" value={stats.noSignal} />
        </div>
      </div>

      {/* Main layout: table + details */}
      <div className="grid lg:grid-cols-12 gap-4">
        {/* Table */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-white flex items-center justify-between">
            <div className="font-semibold text-gray-900">Lista</div>
            <div className="text-xs text-gray-500">“Stale” = s’është përditësu në 5 minuta</div>
          </div>

          <div className="overflow-x-auto max-h-[560px]">
            <table className="min-w-[1040px] w-full text-sm">
              <thead className="bg-gray-50/70 sticky top-0 z-10">
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b">
                  <th className="px-4 py-3">Targa</th>
                  <th className="px-4 py-3">Emri</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Lat</th>
                  <th className="px-4 py-3">Lng</th>
                  <th className="px-4 py-3">Shpejtësia</th>
                  <th className="px-4 py-3">Heading</th>
                  <th className="px-4 py-3">Përditësuar</th>
                  <th className="px-4 py-3 w-40">Harta</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {filteredVehicles.map((v) => {
                  const p = liveById.get(v.id);
                  const hasLive = !!p;
                  const stale = p ? isStale(p.capturedAt, 5) : true;

                  const lat = p?.lat ?? null;
                  const lng = p?.lng ?? null;

                  const mapsUrl =
                    lat != null && lng != null
                      ? `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`
                      : '';

                  const rowSelected = selectedId === v.id;

                  return (
                    <tr
                      key={v.id}
                      className={[
                        'hover:bg-gray-50/60 cursor-pointer',
                        rowSelected ? 'bg-[#C9A24D]/10' : '',
                      ].join(' ')}
                      onClick={() => setSelectedId(v.id)}
                      title="Kliko për detaje"
                    >
                      <td className="px-4 py-3 font-semibold text-gray-900 font-mono">{v.plateNumber}</td>
                      <td className="px-4 py-3 text-gray-700">{v.name ?? '—'}</td>

                      <td className="px-4 py-3">
                        {!hasLive ? (
                          <Badge tone="gray">PA SINJAL</Badge>
                        ) : stale ? (
                          <Badge tone="amber">STALE</Badge>
                        ) : (
                          <Badge tone="green">LIVE</Badge>
                        )}
                      </td>

                      <td className="px-4 py-3 font-mono text-gray-700">{lat ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-gray-700">{lng ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{p?.speed ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{p?.heading ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{p ? fmtDate(p.capturedAt) : '—'}</td>

                      <td className="px-4 py-3">
                        {mapsUrl ? (
                          <a
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-gray-200 bg-white hover:bg-gray-50 shadow-sm"
                            href={mapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <HiLocationMarker className="text-lg text-gray-500" />
                            Hap në Maps
                          </a>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {!filteredVehicles.length ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-gray-500">
                      S’ka vetura për këtë filtër.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* Details panel */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-gray-900">Detaje</div>
              {selectedId ? (
                <button
                  onClick={() => setSelectedId(null)}
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"
                  aria-label="Clear selection"
                  title="Mbyll"
                >
                  <HiX className="text-lg" />
                </button>
              ) : null}
            </div>

            {!selectedVehicle ? (
              <div className="text-sm text-gray-600">
                Kliko një rresht në tabelë për me i pa detajet e veturës.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wider text-gray-500">Veturë</div>
                  <div className="text-gray-900 font-semibold">
                    <span className="font-mono">{selectedVehicle.plateNumber}</span> — {selectedVehicle.name ?? '—'}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {selectedStatus === 'LIVE' ? (
                    <Badge tone="green">LIVE</Badge>
                  ) : selectedStatus === 'STALE' ? (
                    <Badge tone="amber">STALE</Badge>
                  ) : (
                    <Badge tone="gray">PA SINJAL</Badge>
                  )}
                  <span className="text-xs text-gray-500">
                    {selectedLive ? `Përditësuar: ${fmtDate(selectedLive.capturedAt)}` : 'Nuk ka të dhëna live'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wider text-gray-500">Lat</div>
                    <div className="font-mono text-gray-900">{selLat ?? '—'}</div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wider text-gray-500">Lng</div>
                    <div className="font-mono text-gray-900">{selLng ?? '—'}</div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wider text-gray-500">Shpejtësia</div>
                    <div className="text-gray-900">{selectedLive?.speed ?? '—'}</div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wider text-gray-500">Heading</div>
                    <div className="text-gray-900">{selectedLive?.heading ?? '—'}</div>
                  </div>
                </div>

                {selMapsUrl ? (
                  <a
                    className="inline-flex w-full items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:bg-black shadow-sm"
                    href={selMapsUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <HiLocationMarker className="text-lg" />
                    Hap në Google Maps
                  </a>
                ) : (
                  <div className="text-xs text-gray-500">S’ka koordinata për me hap Maps.</div>
                )}
              </div>
            )}
          </div>

          <div className="mt-3 text-xs text-gray-500">
            ⚙️ Kur t’i kesh pajisjet GPS, backend-i veç duhet me furnizu <span className="font-mono">/vehicles/live</span> me koordinata reale.
          </div>
        </div>
      </div>

      {/* ===== MODAL: Add Vehicle (ADMIN only) ===== */}
      {showAdd && isAdmin ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden border border-gray-100">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold text-gray-900">Shto veturë</div>
              <button
                onClick={() => setShowAdd(false)}
                className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"
                aria-label="Close"
              >
                <HiX className="text-lg" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {modalErr ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800 text-sm">
                  {modalErr}
                </div>
              ) : null}

              <div>
                <label className="text-xs font-semibold text-gray-600">Emri</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40"
                  placeholder="p.sh. Toyota Hilux"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600">Targa</label>
                <input
                  value={form.plateNumber}
                  onChange={(e) => setForm((s) => ({ ...s, plateNumber: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40"
                  placeholder="p.sh. 01-123-AB"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600">Unit</label>
                <select
                  value={form.unitId}
                  onChange={(e) => setForm((s) => ({ ...s, unitId: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40"
                >
                  <option value="">— zgjedh —</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code} — {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as any }))}
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                    <option value="MAINTENANCE">MAINTENANCE</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600">Device ID (opsional)</label>
                  <input
                    value={form.deviceId}
                    onChange={(e) => setForm((s) => ({ ...s, deviceId: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40"
                    placeholder="p.sh. GPS-001"
                  />
                </div>
              </div>
            </div>

            <div className="px-4 py-3 border-t flex justify-end gap-2">
              <button
                onClick={() => setShowAdd(false)}
                className="px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-semibold"
                disabled={saving}
              >
                Anulo
              </button>

              <button
                onClick={submitAdd}
                className="px-3 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-semibold disabled:opacity-60"
                disabled={saving}
              >
                {saving ? 'Duke ruajtur…' : 'Ruaj'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
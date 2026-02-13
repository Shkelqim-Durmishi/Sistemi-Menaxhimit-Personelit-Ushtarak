import { useEffect, useState, useMemo } from 'react';
import { listLoginAudit, LoginAuditItem } from '../lib/api';

export default function LoginAuditPage() {
    const [items, setItems] = useState<LoginAuditItem[]>([]);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [loading, setLoading] = useState(true);

    // 🔍 Filtrat në frontend
    const [usernameFilter, setUsernameFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState<
        '' | 'LOGIN' | 'LOGOUT' | 'INVALID_PASSWORD' | 'AUTO_BLOCK'
    >('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    async function load(p: number) {
        setLoading(true);
        try {
            // momentalisht po marrim vetëm page/limit nga API
            const res = await listLoginAudit({ page: p, limit: 50 });
            setItems(res.items);
            setPage(res.page);
            setPages(res.pages);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load(1);
    }, []);

    // ⚙️ Aplikojmë filtrat mbi item-at e faqe së tanishme
    const filteredItems = useMemo(() => {
        return items.filter((log) => {
            // username
            if (
                usernameFilter.trim() &&
                !log.username.toLowerCase().includes(usernameFilter.trim().toLowerCase())
            ) {
                return false;
            }

            // tipi
            if (typeFilter && log.type !== typeFilter) return false;

            // data
            if (dateFrom || dateTo) {
                const d = log.at.slice(0, 10); // YYYY-MM-DD
                if (dateFrom && d < dateFrom) return false;
                if (dateTo && d > dateTo) return false;
            }

            return true;
        });
    }, [items, usernameFilter, typeFilter, dateFrom, dateTo]);

    function renderTypeBadge(t: LoginAuditItem['type']) {
        let cls = 'px-2 py-1 rounded text-xs ';
        if (t === 'LOGIN') cls += 'bg-green-100 text-green-800';
        else if (t === 'LOGOUT') cls += 'bg-red-100 text-red-800';
        else if (t === 'INVALID_PASSWORD') cls += 'bg-amber-100 text-amber-800';
        else if (t === 'AUTO_BLOCK') cls += 'bg-purple-100 text-purple-800';
        else cls += 'bg-gray-100 text-gray-800';

        return <span className={cls}>{t}</span>;
    }

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-semibold">Login / Logout Audit</h1>

            {/* 🔍 Filtrat */}
            <div className="bg-white rounded shadow p-4 grid gap-3 md:grid-cols-4 lg:grid-cols-5 items-end text-sm">
                <div>
                    <label className="block text-xs text-gray-600 mb-1">Përdoruesi</label>
                    <input
                        value={usernameFilter}
                        onChange={(e) => setUsernameFilter(e.target.value)}
                        placeholder="p.sh. admin"
                        className="border px-2 py-1 rounded w-full"
                    />
                </div>

                <div>
                    <label className="block text-xs text-gray-600 mb-1">Tipi</label>
                    <select
                        value={typeFilter}
                        onChange={(e) =>
                            setTypeFilter(
                                e.target.value as '' | 'LOGIN' | 'LOGOUT' | 'INVALID_PASSWORD' | 'AUTO_BLOCK'
                            )
                        }
                        className="border px-2 py-1 rounded w-full"
                    >
                        <option value="">Të gjitha</option>
                        <option value="LOGIN">LOGIN</option>
                        <option value="LOGOUT">LOGOUT</option>
                        <option value="INVALID_PASSWORD">INVALID_PASSWORD</option>
                        <option value="AUTO_BLOCK">AUTO_BLOCK</option>
                    </select>
                </div>

                <div>
                    <label className="block text-xs text-gray-600 mb-1">Data nga</label>
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="border px-2 py-1 rounded w-full"
                    />
                </div>

                <div>
                    <label className="block text-xs text-gray-600 mb-1">Data deri</label>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="border px-2 py-1 rounded w-full"
                    />
                </div>

                <div className="flex gap-2 justify-end">
                    <button
                        className="px-3 py-1 border rounded text-xs"
                        onClick={() => {
                            setUsernameFilter('');
                            setTypeFilter('');
                            setDateFrom('');
                            setDateTo('');
                        }}
                    >
                        Fshij filtrat
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-gray-500">Po ngarkoj log-et…</div>
            ) : filteredItems.length === 0 ? (
                <div className="text-gray-500 text-sm">S’ka rezultate për këta filtra.</div>
            ) : (
                <>
                    <div className="overflow-x-auto bg-white rounded shadow">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b bg-gray-50">
                                    <th className="text-left px-3 py-2">Koha</th>
                                    <th className="text-left px-3 py-2">Përdoruesi</th>
                                    <th className="text-left px-3 py-2">Roli</th>
                                    <th className="text-left px-3 py-2">Njësia</th>
                                    <th className="text-left px-3 py-2">Tipi</th>
                                    <th className="text-left px-3 py-2">IP</th>
                                    <th className="text-left px-3 py-2">User-Agent</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredItems.map((log) => (
                                    <tr key={log.id} className="border-b">
                                        <td className="px-3 py-2 font-mono text-xs">
                                            {new Date(log.at).toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2">{log.username}</td>
                                        <td className="px-3 py-2">{log.role}</td>
                                        <td className="px-3 py-2">
                                            {log.unit ? `${log.unit.code} — ${log.unit.name}` : '—'}
                                        </td>
                                        <td className="px-3 py-2">{renderTypeBadge(log.type)}</td>
                                        <td className="px-3 py-2 text-xs">{log.ip}</td>
                                        <td className="px-3 py-2 text-xs max-w-xs truncate">{log.userAgent}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {pages > 1 && (
                        <div className="flex items-center gap-2 text-sm mt-2">
                            <button
                                className="px-2 py-1 border rounded disabled:opacity-50"
                                disabled={page <= 1}
                                onClick={() => load(page - 1)}
                            >
                                ‹ Mbrapa
                            </button>
                            <span>
                                Faqja {page} / {pages}
                            </span>
                            <button
                                className="px-2 py-1 border rounded disabled:opacity-50"
                                disabled={page >= pages}
                                onClick={() => load(page + 1)}
                            >
                                Përpara ›
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
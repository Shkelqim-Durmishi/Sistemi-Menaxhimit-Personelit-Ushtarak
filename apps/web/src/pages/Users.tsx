import { useEffect, useState } from 'react';

import {
    listUsers,
    listUnits,
    adminCreateUser,
    adminUpdateUser,
    adminDeleteUser,
    adminBlockUser,
    adminUnblockUser,
    UserRole,
    AdminUser,
    UnitItem,
} from '../lib/api';

export default function UsersPage() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [units, setUnits] = useState<UnitItem[]>([]);
    const [loading, setLoading] = useState(true);

    // modal states
    const [showCreate, setShowCreate] = useState(false);
    const [showEdit, setShowEdit] = useState<null | AdminUser>(null);

    useEffect(() => {
        load();
    }, []);

    async function load() {
        setLoading(true);
        const [u, un] = await Promise.all([listUsers(), listUnits()]);
        setUsers(u);
        setUnits(un);
        setLoading(false);
    }

    async function handleBlockUser(u: AdminUser) {
        if (!confirm(`A je i sigurt që dëshiron ta bllokosh përdoruesin "${u.username}"?`)) return;
        try {
            await adminBlockUser(u.id);
            await load();
        } catch (err) {
            alert('Nuk u bllokua përdoruesi.');
            console.error(err);
        }
    }

    async function handleUnblockUser(u: AdminUser) {
        if (!confirm(`A je i sigurt që dëshiron ta çbllokosh përdoruesin "${u.username}"?`)) return;
        try {
            await adminUnblockUser(u.id);
            await load();
        } catch (err) {
            alert('Nuk u çbllokua përdoruesi.');
            console.error(err);
        }
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-semibold">Menaxhimi i Përdoruesve</h1>
                <button
                    onClick={() => setShowCreate(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700"
                >
                    + Shto Përdorues
                </button>
            </div>

            {loading ? (
                <div className="text-gray-600">Duke u ngarkuar…</div>
            ) : (
                <UserTable
                    users={users}
                    onEdit={setShowEdit}
                    onDelete={async (id) => {
                        if (confirm('A je i sigurt që do ta fshish këtë përdorues?')) {
                            await adminDeleteUser(id);
                            await load();
                        }
                    }}
                    onBlock={handleBlockUser}
                    onUnblock={handleUnblockUser}
                />
            )}

            {showCreate && (
                <CreateModal
                    units={units}
                    onClose={() => setShowCreate(false)}
                    onCreate={async (data) => {
                        await adminCreateUser(data);
                        setShowCreate(false);
                        await load();
                    }}
                />
            )}

            {showEdit && (
                <EditModal
                    user={showEdit}
                    units={units}
                    onClose={() => setShowEdit(null)}
                    onSave={async (id, data) => {
                        await adminUpdateUser(id, data);
                        setShowEdit(null);
                        await load();
                    }}
                />
            )}
        </div>
    );
}

/* ===============================
   TABLE
================================ */

function UserTable({
    users,
    onEdit,
    onDelete,
    onBlock,
    onUnblock,
}: {
    users: AdminUser[];
    onEdit: (u: AdminUser) => void;
    onDelete: (id: string) => void;
    onBlock: (u: AdminUser) => void;
    onUnblock: (u: AdminUser) => void;
}) {
    return (
        <table className="w-full bg-white shadow rounded overflow-hidden">
            <thead className="bg-gray-100 text-sm text-gray-700">
                <tr>
                    <th className="p-2 text-left">Username</th>
                    <th className="p-2 text-left">Roli</th>
                    <th className="p-2 text-left">Njësia</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Kontrata</th>
                    <th className="p-2 text-left">Last Login</th>
                    <th className="p-2"></th>
                </tr>
            </thead>

            <tbody>
                {users.map((u) => {
                    const isBlocked = !!u.isBlocked;
                    const hasContract =
                        (u.contractValidFrom && u.contractValidFrom.length > 0) ||
                        (u.contractValidTo && u.contractValidTo.length > 0) ||
                        u.neverExpires;

                    return (
                        <tr key={u.id} className="border-t hover:bg-gray-50">
                            <td className="p-2">
                                <div className="flex flex-col">
                                    <span>{u.username}</span>
                                    {u.mustChangePassword && (
                                        <span className="mt-0.5 inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-yellow-50 text-yellow-800">
                                            Duhet ta ndryshojë fjalëkalimin
                                        </span>
                                    )}
                                </div>
                            </td>

                            <td className="p-2">{u.role}</td>

                            <td className="p-2">
                                {u.unit ? (
                                    <span>
                                        {u.unit.code} — {u.unit.name}
                                    </span>
                                ) : (
                                    <span className="text-gray-400 italic">Pa njësi</span>
                                )}
                            </td>

                            {/* Statusi i sigurisë */}
                            <td className="p-2">
                                {isBlocked ? (
                                    <div className="flex flex-col gap-0.5">
                                        <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-red-100 text-red-800">
                                            Bllokuar
                                        </span>
                                        {u.blockReason && (
                                            <span className="text-xs text-gray-500">
                                                {u.blockReason}
                                            </span>
                                        )}
                                        {typeof u.failedLoginCount === 'number' &&
                                            u.failedLoginCount > 0 && (
                                                <span className="text-xs text-gray-500">
                                                    Tentativa të dështuara: {u.failedLoginCount}
                                                </span>
                                            )}
                                    </div>
                                ) : (
                                    <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-green-100 text-green-800">
                                        Aktiv
                                    </span>
                                )}
                            </td>

                            {/* Info e kontratës */}
                            <td className="p-2 text-xs text-gray-700">
                                {!hasContract && <span className="text-gray-400">—</span>}

                                {hasContract && (
                                    <div className="flex flex-col">
                                        {u.neverExpires && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-800">
                                                Pa afat skadimi
                                            </span>
                                        )}
                                        <span>
                                            {u.contractValidFrom
                                                ? `Nga: ${new Date(
                                                    u.contractValidFrom
                                                ).toLocaleDateString()}`
                                                : ''}
                                        </span>
                                        <span>
                                            {u.contractValidTo
                                                ? `Deri: ${new Date(
                                                    u.contractValidTo
                                                ).toLocaleDateString()}`
                                                : ''}
                                        </span>
                                    </div>
                                )}
                            </td>

                            <td className="p-2 text-gray-500">
                                {u.lastLogin ? new Date(u.lastLogin).toLocaleString() : '—'}
                            </td>

                            <td className="p-2 flex flex-wrap gap-2">
                                <button
                                    onClick={() => onEdit(u)}
                                    className="px-3 py-1 bg-blue-500 text-white text-sm rounded"
                                >
                                    Ndrysho
                                </button>

                                {/* Blloko / Çblloko */}
                                {isBlocked ? (
                                    <button
                                        onClick={() => onUnblock(u)}
                                        className="px-3 py-1 bg-purple-500 text-white text-sm rounded"
                                    >
                                        Çblloko
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => onBlock(u)}
                                        className="px-3 py-1 bg-orange-500 text-white text-sm rounded"
                                    >
                                        Blloko
                                    </button>
                                )}

                                <button
                                    onClick={() => onDelete(u.id)}
                                    className="px-3 py-1 bg-red-500 text-white text-sm rounded"
                                >
                                    Fshij
                                </button>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

/* ===============================
   CREATE MODAL
================================ */

function CreateModal({
    units,
    onClose,
    onCreate,
}: {
    units: UnitItem[];
    onClose: () => void;
    onCreate: (data: {
        username: string;
        password: string;
        role: UserRole;
        unitId: string | null;

        contractValidFrom?: string | null;
        contractValidTo?: string | null;
        neverExpires?: boolean;

        mustChangePassword?: boolean;
    }) => void;
}) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<UserRole>('OPERATOR');
    const [unitId, setUnitId] = useState<string | null>(null);

    // 📄 kontrata (default: nuk skadon kurrë)
    const [contractFrom, setContractFrom] = useState('');
    const [contractTo, setContractTo] = useState('');
    const [neverExpires, setNeverExpires] = useState<boolean>(true);

    // 🔑 default: po, duhet me e ndërru password-in në login-in e parë
    const [mustChangePassword, setMustChangePassword] = useState<boolean>(true);

    return (
        <Modal title="Krijo Përdorues" onClose={onClose}>
            <div className="space-y-3">
                <Input label="Username" value={username} onChange={setUsername} />
                <Input label="Password" type="password" value={password} onChange={setPassword} />

                <Select label="Roli" value={role} onChange={(v) => setRole(v as UserRole)}>
                    <option value="ADMIN">ADMIN</option>
                    <option value="OFFICER">OFFICER</option>
                    <option value="OPERATOR">OPERATOR</option>
                    <option value="COMMANDER">COMMANDER</option>
                    <option value="AUDITOR">AUDITOR</option>
                </Select>

                <Select
                    label="Njësia"
                    value={unitId ?? ''}
                    onChange={(v) => setUnitId(v || null)}
                >
                    <option value="">— Pa njësi —</option>
                    {units.map((u) => (
                        <option key={u.id} value={u.id}>
                            {u.code} — {u.name}
                        </option>
                    ))}
                </Select>

                {/* Kontrata */}
                <div className="pt-2 border-t mt-2 space-y-2">
                    <div className="font-semibold text-sm">Kontrata e vlefshmërisë</div>

                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={neverExpires}
                            onChange={(e) => setNeverExpires(e.target.checked)}
                        />
                        <span>Nuk skadon kurrë</span>
                    </label>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <label className="block text-sm">
                            <span className="text-gray-700 text-sm">Data fillimit</span>
                            <input
                                type="date"
                                value={contractFrom}
                                onChange={(e) => setContractFrom(e.target.value)}
                                className="mt-1 w-full border rounded px-2 py-1"
                                disabled={neverExpires}
                            />
                        </label>

                        <label className="block text-sm">
                            <span className="text-gray-700 text-sm">Data mbarimit</span>
                            <input
                                type="date"
                                value={contractTo}
                                onChange={(e) => setContractTo(e.target.value)}
                                className="mt-1 w-full border rounded px-2 py-1"
                                disabled={neverExpires}
                            />
                        </label>
                    </div>
                </div>

                {/* Detyrimi për ndryshim password-i */}
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={mustChangePassword}
                        onChange={(e) => setMustChangePassword(e.target.checked)}
                    />
                    <span>Kërko nga përdoruesi të ndryshojë fjalëkalimin në login-in e parë</span>
                </label>

                <button
                    onClick={() =>
                        onCreate({
                            username,
                            password,
                            role,
                            unitId,
                            contractValidFrom: contractFrom || null,
                            contractValidTo: contractTo || null,
                            neverExpires,
                            mustChangePassword,
                        })
                    }
                    className="px-4 py-2 bg-blue-600 text-white rounded"
                >
                    Krijo
                </button>
            </div>
        </Modal>
    );
}

/* ===============================
   EDIT MODAL
================================ */

function EditModal({
    user,
    units,
    onClose,
    onSave,
}: {
    user: AdminUser;
    units: UnitItem[];
    onClose: () => void;
    onSave: (id: string, data: {
        role?: UserRole;
        unitId?: string | null;
        password?: string;
        contractValidFrom?: string | null;
        contractValidTo?: string | null;
        neverExpires?: boolean;
        mustChangePassword?: boolean;
    }) => void;
}) {
    const [role, setRole] = useState<UserRole>(user.role as UserRole);
    const [unitId, setUnitId] = useState<string | null>(user.unit?.id ?? null);
    const [password, setPassword] = useState('');

    // 📄 kontrata
    const [contractFrom, setContractFrom] = useState(
        user.contractValidFrom ? user.contractValidFrom.slice(0, 10) : ''
    );
    const [contractTo, setContractTo] = useState(
        user.contractValidTo ? user.contractValidTo.slice(0, 10) : ''
    );
    const [neverExpires, setNeverExpires] = useState<boolean>(!!user.neverExpires);

    // 🔑 flag për ndryshim password-i
    const [mustChangePassword, setMustChangePassword] = useState<boolean>(
        !!user.mustChangePassword
    );

    return (
        <Modal title="Ndrysho Përdoruesin" onClose={onClose}>
            <div className="space-y-3">
                <Select label="Roli" value={role} onChange={(v) => setRole(v as UserRole)}>
                    <option value="ADMIN">ADMIN</option>
                    <option value="OFFICER">OFFICER</option>
                    <option value="OPERATOR">OPERATOR</option>
                    <option value="COMMANDER">COMMANDER</option>
                    <option value="AUDITOR">AUDITOR</option>
                </Select>

                <Select
                    label="Njësia"
                    value={unitId ?? ''}
                    onChange={(v) => setUnitId(v || null)}
                >
                    <option value="">— Pa njësi —</option>
                    {units.map((u) => (
                        <option key={u.id} value={u.id}>
                            {u.code} — {u.name}
                        </option>
                    ))}
                </Select>

                <Input
                    label="Ndrysho Password-in (opsionale)"
                    type="password"
                    value={password}
                    onChange={setPassword}
                />

                <div className="pt-2 border-t mt-2 space-y-2">
                    <div className="font-semibold text-sm">Kontrata e vlefshmërisë</div>

                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={neverExpires}
                            onChange={(e) => setNeverExpires(e.target.checked)}
                        />
                        <span>Nuk skadon kurrë</span>
                    </label>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <label className="block text-sm">
                            <span className="text-gray-700 text-sm">Data fillimit</span>
                            <input
                                type="date"
                                value={contractFrom}
                                onChange={(e) => setContractFrom(e.target.value)}
                                className="mt-1 w-full border rounded px-2 py-1"
                                disabled={neverExpires}
                            />
                        </label>

                        <label className="block text-sm">
                            <span className="text-gray-700 text-sm">Data mbarimit</span>
                            <input
                                type="date"
                                value={contractTo}
                                onChange={(e) => setContractTo(e.target.value)}
                                className="mt-1 w-full border rounded px-2 py-1"
                                disabled={neverExpires}
                            />
                        </label>
                    </div>
                </div>

                {/* Detyrimi për ndryshim password-i */}
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={mustChangePassword}
                        onChange={(e) => setMustChangePassword(e.target.checked)}
                    />
                    <span>Kërko nga përdoruesi të ndryshojë fjalëkalimin në login-in tjetër</span>
                </label>

                <button
                    onClick={() =>
                        onSave(user.id, {
                            role,
                            unitId,
                            password: password || undefined,
                            contractValidFrom: contractFrom || null,
                            contractValidTo: contractTo || null,
                            neverExpires,
                            mustChangePassword,
                        })
                    }
                    className="px-4 py-2 bg-blue-600 text-white rounded"
                >
                    Ruaj Ndryshimet
                </button>
            </div>
        </Modal>
    );
}

/* ===============================
   MODAL COMPONENT
================================ */

function Modal({ title, onClose, children }: any) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex justify-center items-center z-50">
            <div className="bg-white rounded shadow p-6 w-[420px] max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">{title}</h2>
                    <button onClick={onClose} className="text-gray-600 hover:text-black">
                        ✕
                    </button>
                </div>

                {children}
            </div>
        </div>
    );
}

/* ===============================
   REUSABLE UI
================================ */

function Input({
    label,
    type = 'text',
    value,
    onChange,
}: {
    label: string;
    type?: string;
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <label className="block">
            <span className="text-sm text-gray-700">{label}</span>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="mt-1 w-full border rounded px-2 py-1"
            />
        </label>
    );
}

function Select({
    label,
    value,
    onChange,
    children,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    children: any;
}) {
    return (
        <label className="block">
            <span className="text-sm text-gray-700">{label}</span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="mt-1 w-full border rounded px-2 py-1"
            >
                {children}
            </select>
        </label>
    );
}

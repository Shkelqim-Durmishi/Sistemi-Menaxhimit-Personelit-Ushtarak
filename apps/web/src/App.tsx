// src/App.tsx
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';

import { getRole, getCurrentUser, logout, searchPeople } from './lib/api';

// Icons
import {
  HiHome,
  HiDocumentText,
  HiUsers,
  HiClock,
  HiClipboardList,
  HiCheckCircle,
  HiLocationMarker,
  HiUserGroup,
  HiShieldCheck,
  HiLogout,
  HiSearch,
  HiX,
  HiUserCircle,
  HiKey,
} from 'react-icons/hi';

type SuggestItem = {
  _id: string;
  serviceNo: string;
  firstName: string;
  lastName: string;
  unitId?: string;
};

// ✅ helper: shfaq rolin bukur
function formatRole(role?: string | null) {
  if (!role) return '—';
  return String(role).replaceAll('_', ' ').toUpperCase();
}

export default function App() {
  const loc = useLocation();
  const navigate = useNavigate();

  const role = getRole();

  const isAdmin = role === 'ADMIN';
  const isCommander = role === 'COMMANDER';
  const isOfficer = role === 'OFFICER';
  const isOperator = role === 'OPERATOR';
  const isAuditor = role === 'AUDITOR';

  const user = getCurrentUser();

  const canSeePeople = isAdmin || isOfficer || isOperator || isCommander;
  const canSeePeoplePending = isAdmin || isCommander;
  const canSeeRequests = isAdmin || isAuditor || isCommander || isOfficer || isOperator;
  const canSeeVehiclesLive = isAdmin || isCommander;

  // 🔎 Search (live)
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [loadingSug, setLoadingSug] = useState(false);
  const [sug, setSug] = useState<SuggestItem[]>([]);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const canUseSearch = canSeePeople;

  // Close search dropdown on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!canUseSearch) return;

    const term = q.trim();
    if (term.length < 2) {
      setSug([]);
      setLoadingSug(false);
      return;
    }

    setLoadingSug(true);
    const t = setTimeout(async () => {
      try {
        const res = await searchPeople(term, 1, 6);
        setSug((res.items ?? []) as any);
        setOpen(true);
      } catch {
        setSug([]);
      } finally {
        setLoadingSug(false);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [q, canUseSearch]);

  const goToPeopleSearch = (term: string) => {
    const clean = term.trim();
    if (!clean) return;
    navigate(`/people?q=${encodeURIComponent(clean)}`);
    setOpen(false);
  };

  const placeholder = canUseSearch ? 'Kërko ushtar… (emër, mbiemër, nr. shërbimi)' : 'Search…';

  return (
    <div className="min-h-screen grid grid-cols-[260px_1fr] bg-[#f3f5f8]">
      {/* SIDEBAR */}
      <aside className="bg-white/80 backdrop-blur border-r border-gray-200 flex flex-col">
        {/* Top brand */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#2F3E2E] to-[#C9A24D] shadow-sm" />
            <div className="leading-tight">
              <div className="text-sm tracking-wide text-gray-500">SMPU</div>
              <div className="text-base font-semibold text-gray-900">Paneli</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="px-3 pb-3">
          <div className="px-2 mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Kryesore</div>

          <NavItem to="/" label="Dashboard" current={loc.pathname === '/'} icon={<HiHome />} />

          <NavItem
            to="/reports"
            label="Raport Ditor"
            current={loc.pathname.startsWith('/reports')}
            icon={<HiDocumentText />}
          />

          {canSeePeople && (
            <NavItem
              to="/people"
              label="Ushtarët"
              current={loc.pathname === '/people' || loc.pathname.startsWith('/people/')}
              icon={<HiUsers />}
            />
          )}

          {canSeePeoplePending && (
            <NavItem
              to="/people/pending"
              label="Ushtarët në pritje"
              current={loc.pathname.startsWith('/people/pending')}
              icon={<HiClock />}
            />
          )}

          {canSeeRequests && (
            <NavItem
              to="/requests"
              label="Kërkesat"
              current={loc.pathname.startsWith('/requests')}
              icon={<HiClipboardList />}
            />
          )}

          <NavItem to="/approvals" label="Miratime" current={loc.pathname.startsWith('/approvals')} icon={<HiCheckCircle />} />

          {canSeeVehiclesLive && (
            <NavItem
              to="/vehicles-live"
              label="GPS – Veturat (Live)"
              current={loc.pathname.startsWith('/vehicles-live')}
              icon={<HiLocationMarker />}
            />
          )}

          {isAdmin && (
            <>
              <div className="mt-5 px-2 mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Admin</div>

              <NavItem to="/users" label="Përdoruesit" current={loc.pathname.startsWith('/users')} icon={<HiUserGroup />} />

              <NavItem
                to="/admin/login-audit"
                label="Login / Logout Logs"
                current={loc.pathname.startsWith('/admin/login-audit')}
                icon={<HiShieldCheck />}
              />
            </>
          )}
        </nav>

        {/* Bottom user box */}
        <div className="mt-auto p-4 border-t border-gray-200">
          {user && (
            <div className="mb-3 rounded-xl bg-white shadow-sm border border-gray-100 p-3">
              <div className="text-sm font-semibold text-gray-900">{user.username}</div>
              <div className="mt-0.5 text-[11px] uppercase tracking-wider text-gray-400">{formatRole(user.role)}</div>
              <div className="mt-2 text-xs text-gray-600">
                Njësia:{' '}
                <span className="font-medium">{user.unitId ? user.unitId : '— (ADMIN / pa njësi)'}</span>
              </div>
            </div>
          )}

          <button
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
            className="
              w-full flex items-center justify-center gap-2
              px-3 py-2 rounded-xl text-sm font-semibold
              text-white
              bg-gradient-to-r from-[#2F3E2E] to-[#C9A24D]
              hover:from-[#263325] hover:to-[#b8953f]
              shadow-sm hover:shadow
              transition
            "
          >
            <HiLogout className="text-lg" />
            Dil nga sistemi
          </button>

          <div className="mt-3 text-[11px] text-gray-400 text-center">© 2026 FSK • Sistemi i menaxhimit</div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="p-6 space-y-6">
        {/* HEADER (Search + User Menu) */}
        <div className="flex items-center justify-between gap-4">
          {/* Search */}
          <div ref={boxRef} className="relative w-full max-w-2xl">
            <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => q.trim().length >= 2 && setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (canUseSearch) goToPeopleSearch(q);
                }
                if (e.key === 'Escape') setOpen(false);
              }}
              placeholder={placeholder}
              disabled={!canUseSearch}
              className="
                w-full pl-10 pr-10 py-2.5 rounded-xl
                border border-gray-200 bg-white
                text-sm text-gray-700
                shadow-sm
                focus:outline-none focus:ring-2 focus:ring-[#C9A24D]/40
                disabled:opacity-60 disabled:cursor-not-allowed
              "
            />

            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ('');
                  setSug([]);
                  setOpen(false);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100 text-gray-400"
                aria-label="Clear"
              >
                <HiX className="text-lg" />
              </button>
            )}

            {/* Dropdown */}
            {canUseSearch && open && q.trim().length >= 2 && (
              <div className="absolute z-50 mt-2 w-full rounded-xl border border-gray-100 bg-white shadow-lg overflow-hidden">
                <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-gray-400 border-b bg-gray-50/60">
                  {loadingSug ? 'Duke kërkuar…' : 'Rezultatet'}
                </div>

                {!loadingSug && sug.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-gray-500">
                    S’ka rezultate për <span className="font-medium text-gray-700">"{q.trim()}"</span>
                  </div>
                ) : (
                  <div className="max-h-72 overflow-auto">
                    {sug.map((p) => (
                      <button
                        key={p._id}
                        type="button"
                        onClick={() => goToPeopleSearch(`${p.firstName} ${p.lastName}`)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">
                            {p.firstName} {p.lastName}
                          </div>
                          <div className="text-xs text-gray-500 truncate">
                            Nr. shërbimi: <span className="font-mono">{p.serviceNo}</span>
                          </div>
                        </div>
                        <span className="text-[11px] text-gray-400">Enter</span>
                      </button>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => goToPeopleSearch(q)}
                  className="w-full px-3 py-2 text-sm font-semibold text-[#2F3E2E] hover:bg-[#2F3E2E]/5 border-t"
                >
                  Kërko “{q.trim()}” te Ushtarët
                </button>
              </div>
            )}
          </div>

          {/* User menu */}
          {user && (
            <UserMenu
              user={user}
              onGoProfile={() => navigate('/profile')}
              onGoChangePassword={() => navigate('/change-password')}
              onLogout={async () => {
                await logout();
                navigate('/login', { replace: true });
              }}
            />
          )}
        </div>

        <Outlet />
      </main>
    </div>
  );
}

/** ✅ User menu (clickable user + dropdown) */
function UserMenu({
  user,
  onGoProfile,
  onGoChangePassword,
  onLogout,
}: {
  user: any;
  onGoProfile: () => void;
  onGoChangePassword: () => void;
  onLogout: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // close on outside click + ESC
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onEsc);
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-3 py-2 shadow-sm hover:bg-gray-50 transition"
      >
        <div className="relative">
          <div className="w-9 h-9 rounded-full bg-gradient-to-r from-[#2F3E2E] to-[#C9A24D] text-white flex items-center justify-center text-sm font-semibold">
            {user.username?.slice(0, 1)?.toUpperCase() || 'U'}
          </div>

          {/* ✅ dot mbetet, po s’po shkrujmë ONLINE; vetëm indikator */}
          <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" />
        </div>

        <div className="leading-tight text-left">
          <div className="text-sm font-semibold text-gray-900">{user.username}</div>

          {/* ✅ KËTU: Online -> roli */}
          <div className="text-[11px] uppercase tracking-wider text-gray-400">{formatRole(user.role)}</div>
        </div>

        {/* chevron */}
        <svg className={`h-4 w-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-60 rounded-xl border border-gray-100 bg-white shadow-lg overflow-hidden z-50">
          <div className="px-3 py-2 border-b bg-gray-50/60">
            <div className="text-sm font-semibold text-gray-900">{user.username}</div>
            <div className="text-[11px] uppercase tracking-wider text-gray-400">{formatRole(user.role)}</div>
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onGoProfile();
            }}
            className="w-full px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 flex items-center gap-2"
          >
            <HiUserCircle className="text-lg text-gray-500" />
            Profile
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onGoChangePassword();
            }}
            className="w-full px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 flex items-center gap-2"
          >
            <HiKey className="text-lg text-gray-500" />
            Ndrysho fjalëkalimin
          </button>

          <div className="h-px bg-gray-100" />

          <button
            type="button"
            onClick={async () => {
              setOpen(false);
              await onLogout();
            }}
            className="w-full px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2"
          >
            <HiLogout className="text-lg" />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

function NavItem({
  to,
  label,
  current,
  icon,
}: {
  to: string;
  label: string;
  current: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={[
        'group flex items-center gap-3 px-3 py-2.5 rounded-xl transition',
        current
          ? 'bg-gradient-to-r from-[#2F3E2E]/10 to-[#C9A24D]/10 text-gray-900 border border-[#C9A24D]/30'
          : 'text-gray-700 hover:bg-gray-100',
      ].join(' ')}
    >
      <span className={['text-lg transition', current ? 'text-[#2F3E2E]' : 'text-gray-400 group-hover:text-gray-600'].join(' ')}>
        {icon}
      </span>

      <span className={['text-sm font-medium', current ? 'text-gray-900' : ''].join(' ')}>{label}</span>

      <span className={['ml-auto h-2 w-2 rounded-full transition', current ? 'bg-[#C9A24D]' : 'bg-transparent group-hover:bg-gray-300'].join(' ')} />
    </Link>
  );
}

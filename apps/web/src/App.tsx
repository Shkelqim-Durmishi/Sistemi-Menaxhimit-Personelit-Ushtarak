// src/App.tsx

import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';

import React, { useEffect, useRef, useState } from 'react';

import { getRole, getCurrentUser, logout, searchPeople, getSystemNotice } from './lib/api';

// ✅ vendose logon këtu (ndrysho path sipas projektit tond)
import FSKLogo from './assets/fsk-logo.png';

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
  HiSpeakerphone, // ✅ NEW
  HiLogout,
  HiSearch,
  HiX,
  HiUserCircle,
  HiKey,
  HiChevronLeft,
  HiChevronRight,
  HiMenu,
} from 'react-icons/hi';

type SuggestItem = {
  _id: string;
  serviceNo: string;
  firstName: string;
  lastName: string;
  unitId?: string;
};

// ✅ System Notice type (front)
type SystemNotice = {
  enabled: boolean;
  severity: 'urgent' | 'info' | 'warning';
  title: string;
  message: string;
  updatedAt?: string;
};

// ✅ helper: shfaq rolin bukur
function formatRole(role?: string | null) {
  if (!role) return '—';
  return String(role).replaceAll('_', ' ').toUpperCase();
}

// ✅ hook i lehtë për breakpoint (mobile)
function useIsMobile(breakpointPx = 900) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < breakpointPx;
  });

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpointPx);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpointPx]);

  return isMobile;
}

// ✅ Banner component (brenda App.tsx - s’ka nevojë file tjetër)
function SystemNoticeBar({ notice }: { notice: SystemNotice | null }) {
  if (!notice?.enabled) return null;

  const styles =
    notice.severity === 'urgent'
      ? 'border-red-300 bg-red-50 text-red-800'
      : notice.severity === 'warning'
        ? 'border-amber-300 bg-amber-50 text-amber-900'
        : 'border-blue-300 bg-blue-50 text-blue-900';

  const emoji = notice.severity === 'urgent' ? '🚨' : notice.severity === 'warning' ? '⚠️' : 'ℹ️';

  return (
    <div className={`rounded-xl border px-4 py-3 shadow-sm ${styles}`}>
      <div className="flex items-start gap-3">
        <div className="text-lg font-bold leading-none">{emoji}</div>
        <div className="min-w-0">
          <div className="text-sm font-extrabold uppercase tracking-wide">{notice.title || 'Njoftim'}</div>
          <div className="mt-0.5 text-sm">{notice.message}</div>
        </div>
      </div>
    </div>
  );
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

  const canUseSearch = canSeePeople;

  // ✅ Mobile drawer
  const isMobile = useIsMobile(900);
  const [mobileOpen, setMobileOpen] = useState(false);

  // ✅ Desktop collapse (ruaje në localStorage)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sm_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('sm_sidebar_collapsed', sidebarCollapsed ? '1' : '0');
    } catch {
      // ignore
    }
  }, [sidebarCollapsed]);

  // ✅ kur ndryshon route në mobile, mbylle drawer-in
  useEffect(() => {
    if (isMobile) setMobileOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname, isMobile]);

  // ✅ ESC mbyll drawer-in
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  // 🔎 Search (live)
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [loadingSug, setLoadingSug] = useState(false);
  const [sug, setSug] = useState<SuggestItem[]>([]);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // ✅ System Notice (banner)
  const [systemNotice, setSystemNotice] = useState<SystemNotice | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadNotice() {
      try {
        const data = (await getSystemNotice()) as SystemNotice;
        if (!mounted) return;

        if (data?.enabled) setSystemNotice(data);
        else setSystemNotice(null);
      } catch {
        if (mounted) setSystemNotice(null);
      }
    }

    loadNotice();
    const t = window.setInterval(loadNotice, 30000); // refresh çdo 30 sek
    return () => {
      mounted = false;
      window.clearInterval(t);
    };
  }, []);

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

  // ✅ Sidebar width rules
  const desktopSidebarWidth = sidebarCollapsed ? 'w-[88px]' : 'w-[280px]';

  // ✅ Sidebar component (përdoret për desktop dhe mobile drawer)
  const Sidebar = ({
    collapsed,
    showDesktopHandle,
    onToggleCollapse,
  }: {
    collapsed: boolean;
    showDesktopHandle: boolean;
    onToggleCollapse: () => void;
  }) => {
    return (
      <aside
        className={[
          'relative group',
          'bg-white/80 backdrop-blur border-r border-gray-200',
          'h-screen flex flex-col overflow-hidden shrink-0',
          isMobile ? 'w-[280px]' : desktopSidebarWidth,
          'transition-[width] duration-200',
        ].join(' ')}
      >
        {/* ✅ TOP: LOGO (klik për hap/mbyll) */}
        <div className="px-4 pt-4 pb-3">
          <div className={['flex items-center', collapsed ? 'justify-center' : 'justify-start gap-3'].join(' ')}>
            {/* ✅ LOGO e FSK-së (qendër kur collapsed) */}
            <button
              type="button"
              onClick={() => {
                if (isMobile) return;
                onToggleCollapse();
              }}
              className={[
                'h-11 w-11 rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden shrink-0',
                'flex items-center justify-center',
                !isMobile ? 'cursor-pointer hover:bg-gray-50' : '',
              ].join(' ')}
              title={!isMobile ? (collapsed ? 'Hap navigimin' : 'Mbyll navigimin') : undefined}
              aria-label={!isMobile ? (collapsed ? 'Hap navigimin' : 'Mbyll navigimin') : undefined}
            >
              <img src={FSKLogo} alt="FSK" className="h-9 w-9 object-contain" />
            </button>

            {!collapsed && (
              <div className="leading-tight min-w-0">
                <div className="text-sm tracking-wide text-gray-500 truncate">SISTEMI I MENAXHIMIT</div>
                <div className="text-base font-semibold text-gray-900 truncate">Paneli</div>
              </div>
            )}
          </div>
        </div>

        {/* ✅ DESKTOP: Handle diskret në mes */}
        {showDesktopHandle && !isMobile && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={[
              'absolute top-1/2 -translate-y-1/2 right-[-10px]',
              'h-12 w-6 rounded-full border border-gray-200 bg-white shadow-sm',
              'flex items-center justify-center',
              'opacity-0 group-hover:opacity-100 transition-opacity',
            ].join(' ')}
            aria-label={collapsed ? 'Hap navigimin' : 'Mbyll navigimin'}
            title={collapsed ? 'Hap navigimin' : 'Mbyll navigimin'}
          >
            {collapsed ? (
              <HiChevronRight className="text-lg text-gray-600" />
            ) : (
              <HiChevronLeft className="text-lg text-gray-600" />
            )}
          </button>
        )}

        {/* Navigation */}
        <nav className="px-2 pb-3 flex-1 overflow-y-auto">
          {!collapsed && (
            <div className="px-2 mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Kryesore</div>
          )}

          <NavItem collapsed={collapsed} to="/" label="Dashboard" current={loc.pathname === '/'} icon={<HiHome />} />
          <NavItem
            collapsed={collapsed}
            to="/reports"
            label="Raport Ditor"
            current={loc.pathname.startsWith('/reports')}
            icon={<HiDocumentText />}
          />

          {canSeePeople && (
            <NavItem
              collapsed={collapsed}
              to="/people"
              label="Ushtarët"
              current={
                loc.pathname === '/people' ||
                (loc.pathname.startsWith('/people/') && !loc.pathname.startsWith('/people/pending'))
              }
              icon={<HiUsers />}
            />
          )}

          {canSeePeoplePending && (
            <NavItem
              collapsed={collapsed}
              to="/people/pending"
              label="Ushtarët në pritje"
              current={loc.pathname.startsWith('/people/pending')}
              icon={<HiClock />}
            />
          )}

          {canSeeRequests && (
            <NavItem
              collapsed={collapsed}
              to="/requests"
              label="Kërkesat"
              current={loc.pathname.startsWith('/requests')}
              icon={<HiClipboardList />}
            />
          )}

          <NavItem
            collapsed={collapsed}
            to="/approvals"
            label="Miratime"
            current={loc.pathname.startsWith('/approvals')}
            icon={<HiCheckCircle />}
          />

          {canSeeVehiclesLive && (
            <NavItem
              collapsed={collapsed}
              to="/vehicles-live"
              label="GPS – Veturat (Live)"
              current={loc.pathname.startsWith('/vehicles-live')}
              icon={<HiLocationMarker />}
            />
          )}

          {isAdmin && (
            <>
              {!collapsed && (
                <div className="mt-5 px-2 mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Admin
                </div>
              )}

              <NavItem
                collapsed={collapsed}
                to="/users"
                label="Përdoruesit"
                current={loc.pathname.startsWith('/users')}
                icon={<HiUserGroup />}
              />

              <NavItem
                collapsed={collapsed}
                to="/admin/login-audit"
                label="Login / Logout Logs"
                current={loc.pathname.startsWith('/admin/login-audit')}
                icon={<HiShieldCheck />}
              />

              {/* ✅ NEW: System Notice Admin page */}
              <NavItem
                collapsed={collapsed}
                to="/admin/system-notice"
                label="System Notice"
                current={loc.pathname.startsWith('/admin/system-notice')}
                icon={<HiSpeakerphone />}
              />
            </>
          )}
        </nav>

        {/* ✅ Bottom user box + logout */}
        <div className="p-4 border-t border-gray-200 shrink-0">
          {user && (
            <div
              className={[
                'mb-3 rounded-xl bg-white shadow-sm border border-gray-100',
                collapsed ? 'p-2 flex items-center justify-center' : 'p-3',
              ].join(' ')}
            >
              {collapsed ? (
                <div
                  className="w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-semibold"
                  title={`${user.username} • ${formatRole(user.role)}`}
                >
                  {user.username?.slice(0, 1)?.toUpperCase() || 'U'}
                </div>
              ) : (
                <>
                  <div className="text-sm font-semibold text-gray-900">{user.username}</div>
                  <div className="mt-0.5 text-[11px] uppercase tracking-wider text-gray-400">{formatRole(user.role)}</div>
                  <div className="mt-2 text-xs text-gray-600">
                    Njësia: <span className="font-medium">{user.unitId ? user.unitId : '— (ADMIN / pa njësi)'}</span>
                  </div>
                </>
              )}
            </div>
          )}

          <button
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
            className={[
              'w-full flex items-center justify-center gap-2',
              collapsed ? 'px-2 py-2' : 'px-3 py-2',
              'rounded-xl text-sm font-semibold',
              'text-white bg-red-600 hover:bg-red-700',
              'shadow-sm hover:shadow transition',
            ].join(' ')}
            title="Dil nga sistemi"
          >
            <HiLogout className="text-lg" />
            {!collapsed && 'Dil nga sistemi'}
          </button>

          {!collapsed && <div className="mt-3 text-[11px] text-gray-400 text-center">© 2026 FSK • Sistemi i menaxhimit</div>}
        </div>
      </aside>
    );
  };

  return (
    <div className="h-screen w-full bg-[#f3f5f8] overflow-hidden flex">
      {/* ✅ DESKTOP sidebar */}
      {!isMobile && (
        <Sidebar
          collapsed={sidebarCollapsed}
          showDesktopHandle={true}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        />
      )}

      {/* ✅ MOBILE drawer sidebar */}
      {isMobile && (
        <>
          {mobileOpen && (
            <div
              className="fixed inset-0 bg-gray-900/40 z-[9998]"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
          )}

          <div
            className={[
              'fixed top-0 left-0 z-[9999] h-screen',
              'transition-transform duration-200',
              mobileOpen ? 'translate-x-0' : '-translate-x-full',
            ].join(' ')}
          >
            <Sidebar collapsed={false} showDesktopHandle={false} onToggleCollapse={() => { }} />
          </div>
        </>
      )}

      {/* MAIN */}
      <main className="flex-1 h-screen overflow-y-auto">
        <div className="p-4 md:p-6 space-y-6">
          {/* ✅ SYSTEM NOTICE BANNER */}
          <SystemNoticeBar notice={systemNotice} />

          {/* HEADER */}
          <div className="flex items-center justify-between gap-3">
            {isMobile && (
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="h-11 w-11 rounded-xl bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-50"
                aria-label="Hap navigimin"
                title="Hap navigimin"
              >
                <HiMenu className="text-2xl text-gray-700" />
              </button>
            )}

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
        </div>
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
          <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" />
        </div>

        <div className="leading-tight text-left hidden sm:block">
          <div className="text-sm font-semibold text-gray-900">{user.username}</div>
          <div className="text-[11px] uppercase tracking-wider text-gray-400">{formatRole(user.role)}</div>
        </div>

        <svg
          className={`h-4 w-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
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
  collapsed,
}: {
  to: string;
  label: string;
  current: boolean;
  icon: React.ReactNode;
  collapsed: boolean;
}) {
  return (
    <Link
      to={to}
      title={collapsed ? label : undefined}
      className={[
        'group flex items-center gap-3 px-3 py-2.5 rounded-xl transition',
        current
          ? 'bg-gradient-to-r from-[#2F3E2E]/10 to-[#C9A24D]/10 text-gray-900 border border-[#C9A24D]/30'
          : 'text-gray-700 hover:bg-gray-100',
        collapsed ? 'justify-center' : '',
      ].join(' ')}
    >
      <span className={['text-lg transition', current ? 'text-[#2F3E2E]' : 'text-gray-400 group-hover:text-gray-600'].join(' ')}>
        {icon}
      </span>

      {!collapsed && <span className={['text-sm font-medium', current ? 'text-gray-900' : ''].join(' ')}>{label}</span>}

      {!collapsed && (
        <span
          className={['ml-auto h-2 w-2 rounded-full transition', current ? 'bg-[#C9A24D]' : 'bg-transparent group-hover:bg-gray-300'].join(' ')}
        />
      )}
    </Link>
  );
}
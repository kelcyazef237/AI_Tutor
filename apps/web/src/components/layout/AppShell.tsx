import { AnimatePresence, motion } from 'framer-motion';
import { GraduationCap, LayoutDashboard, Menu, Network, Route, Search, Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useSessionReminder } from '@/lib/reminders';
import { cn } from '@/lib/utils';
import { AIStatusBanner, AIStatusPill } from './AIStatusPill';
import { CommandPalette, useCommandPalette } from './CommandPalette';
import { ALL_NAV } from './nav';
import { Sidebar } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';

const COLLAPSE_KEY = 'psc-sidebar-collapsed';

/** Thumb-reachable primary destinations for phones (drawer holds the rest). */
const MOBILE_TABS = [
  { to: '/', label: 'Home', icon: LayoutDashboard },
  { to: '/train', label: 'Train', icon: GraduationCap },
  { to: '/simulation', label: 'Sim', icon: Route },
  { to: '/diagrams', label: 'Diagram', icon: Workflow },
  { to: '/skills', label: 'Skills', icon: Network },
];

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const palette = useCommandPalette();
  const location = useLocation();
  useSessionReminder();

  const current = ALL_NAV.find((n) => (n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)));

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  }, [collapsed]);

  useEffect(() => {
    document.title = current ? `${current.label} · Pentest Skill Coach` : 'Pentest Skill Coach';
  }, [current]);

  // Close the drawer on navigation + lock body scroll while it is open.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <div className="flex h-full min-h-dvh">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
            <motion.div
              className="absolute inset-y-0 left-0 w-[85vw] max-w-72"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.2 }}
            >
              <Sidebar collapsed={false} mobile onNavigate={() => setMobileOpen(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface/90 px-3 backdrop-blur sm:gap-3 sm:px-6">
          <Button variant="ghost" size="icon" className="min-h-11 min-w-11 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold sm:flex-none">{current?.label ?? 'Pentest Skill Coach'}</h1>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => palette.setOpen(true)}
              className="hidden h-8 items-center gap-2 rounded-lg border border-border px-2.5 text-xs text-faint hover:bg-surface-2 hover:text-muted md:flex"
            >
              <Search className="size-3.5" />
              Search
              <kbd className="ml-4 rounded border border-border px-1 font-mono text-[10px]">Ctrl K</kbd>
            </button>
            <Button variant="ghost" size="icon" className="min-h-11 min-w-11 md:hidden" onClick={() => palette.setOpen(true)} aria-label="Search">
              <Search />
            </Button>
            <AIStatusPill />
            <ThemeToggle />
          </div>
        </header>
        <AIStatusBanner />
        <main className="flex-1 overflow-y-auto overscroll-contain">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="mx-auto w-full max-w-6xl px-3 py-4 pb-24 sm:px-6 sm:py-6 lg:py-8 lg:pb-8"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Mobile bottom nav — thumb-friendly, clears the home indicator. */}
        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur lg:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="grid grid-cols-5">
            {MOBILE_TABS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                    isActive ? 'text-accent' : 'text-muted active:bg-surface-2',
                  )
                }
              >
                <Icon className="size-5" aria-hidden />
                <span className="leading-none">{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
      <CommandPalette open={palette.open} setOpen={palette.setOpen} />
    </div>
  );
}

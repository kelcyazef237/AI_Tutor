import { NavLink } from 'react-router-dom';
import { ChevronsLeft, ShieldHalf } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_INSIGHT, NAV_MAIN, NAV_MANAGE, type NavItem } from './nav';
import { ProfileSwitcher } from './ProfileSwitcher';

function Section({ title, items, collapsed, onNavigate }: { title: string; items: NavItem[]; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <div className="space-y-0.5">
      {!collapsed && <div className="px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-faint">{title}</div>}
      {collapsed && <div className="my-3 h-px bg-border" />}
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onNavigate}
          title={collapsed ? label : undefined}
          className={({ isActive }) =>
            cn(
              'group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-text active:bg-surface-2',
              collapsed && 'justify-center px-0',
            )
          }
        >
          <Icon className="size-[18px] shrink-0" />
          {!collapsed && <span className="truncate">{label}</span>}
        </NavLink>
      ))}
    </div>
  );
}

export function Sidebar({ collapsed, onToggle, onNavigate, mobile = false }: { collapsed: boolean; onToggle?: () => void; onNavigate?: () => void; mobile?: boolean }) {
  return (
    <aside
      className={cn(
        'flex h-full h-dvh flex-col border-r border-border bg-surface',
        collapsed && !mobile ? 'w-16' : 'w-60',
        mobile && 'w-full',
      )}
      style={mobile ? { paddingBottom: 'env(safe-area-inset-bottom)' } : undefined}
    >
      <div className={cn('flex h-14 items-center gap-2.5 px-4', collapsed && 'justify-center px-0')}>
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg">
          <ShieldHalf className="size-[18px]" />
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold">Pentest Skill Coach</div>
            <div className="truncate text-[11px] text-faint">Adaptive assessment</div>
          </div>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <Section title="Practice" items={NAV_MAIN} collapsed={collapsed} onNavigate={onNavigate} />
        <Section title="Insight" items={NAV_INSIGHT} collapsed={collapsed} onNavigate={onNavigate} />
        <Section title="Manage" items={NAV_MANAGE} collapsed={collapsed} onNavigate={onNavigate} />
      </nav>
      <ProfileSwitcher collapsed={collapsed} />
      {!mobile && onToggle && (
        <button
          onClick={onToggle}
          className={cn('m-3 flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-muted hover:bg-surface-2 hover:text-text', collapsed && 'justify-center px-0')}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronsLeft className={cn('size-[18px] transition-transform', collapsed && 'rotate-180')} />
          {!collapsed && <span>Collapse</span>}
        </button>
      )}
    </aside>
  );
}

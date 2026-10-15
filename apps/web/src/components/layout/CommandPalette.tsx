import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'framer-motion';
import { Monitor, Moon, Search, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/lib/theme';
import { ALL_NAV } from './nav';

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return { open, setOpen };
}

const item =
  'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted data-[selected=true]:bg-surface-2 data-[selected=true]:text-text';

export function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const navigate = useNavigate();
  const { setPref } = useTheme();
  const run = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[15vh]">
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.15 }}
            className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
          >
            <Command label="Command palette" loop onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
              <div className="flex items-center gap-3 border-b border-border px-4">
                <Search className="size-4 text-faint" />
                <Command.Input autoFocus placeholder="Go to a page or run a command…" className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-faint" />
                <kbd className="rounded border border-border px-1.5 font-mono text-[10px] text-faint">ESC</kbd>
              </div>
              <Command.List className="max-h-80 overflow-y-auto p-2">
                <Command.Empty className="py-8 text-center text-sm text-muted">No results.</Command.Empty>
                <Command.Group heading="Navigate" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-faint">
                  {ALL_NAV.map(({ to, label, icon: Icon, description }) => (
                    <Command.Item key={to} value={`${label} ${description}`} onSelect={() => run(() => navigate(to))} className={item}>
                      <Icon className="size-4" />
                      <span className="text-text">{label}</span>
                      <span className="ml-auto truncate text-xs text-faint">{description}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
                <Command.Group heading="Theme" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-faint">
                  <Command.Item value="theme light" onSelect={() => run(() => setPref('light'))} className={item}>
                    <Sun className="size-4" /> Light theme
                  </Command.Item>
                  <Command.Item value="theme dark" onSelect={() => run(() => setPref('dark'))} className={item}>
                    <Moon className="size-4" /> Dark theme
                  </Command.Item>
                  <Command.Item value="theme system" onSelect={() => run(() => setPref('system'))} className={item}>
                    <Monitor className="size-4" /> System theme
                  </Command.Item>
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

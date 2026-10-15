import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePref } from '@/lib/theme';
import { cn } from '@/lib/utils';

const OPTIONS: { value: ThemePref; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'system', icon: Monitor, label: 'System' },
  { value: 'dark', icon: Moon, label: 'Dark' },
];

export function ThemeToggle() {
  const { pref, setPref } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className="flex items-center rounded-lg border border-border bg-surface-2 p-0.5">
      {OPTIONS.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          role="radio"
          aria-checked={pref === value}
          aria-label={label}
          title={label}
          onClick={() => setPref(value)}
          className={cn(
            'grid size-7 place-items-center rounded-md text-muted transition-colors hover:text-text',
            pref === value && 'bg-surface text-text shadow-card',
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

import { BarChart3, Table2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
}

/** Card with a Chart / Table toggle. Every chart ships its table twin. */
export function ChartCard<T>({
  title,
  description,
  footnote,
  rows,
  columns,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  footnote?: ReactNode;
  rows: T[];
  columns: Column<T>[];
  children: ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <Card className={cn('flex min-w-0 flex-col', className)}>
      <div className="flex items-start justify-between gap-4 p-5 pb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        <div role="tablist" aria-label={`${title} view`} className="flex shrink-0 rounded-lg border border-border bg-surface-2 p-0.5">
          {(['chart', 'table'] as const).map((v) => {
            const Icon = v === 'chart' ? BarChart3 : Table2;
            return (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                title={v === 'chart' ? 'Chart view' : 'Table view'}
                onClick={() => setView(v)}
                className={cn('grid size-7 place-items-center rounded-md text-muted hover:text-text', view === v && 'bg-surface text-text shadow-card')}
              >
                <Icon className="size-3.5" />
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 px-4 pb-4 sm:px-5 sm:pb-5">
        {view === 'chart' ? (
          <div className="min-w-0">{children}</div>
        ) : (
          <div className="-mx-1 overflow-x-auto overscroll-x-contain px-1">
            <div className="max-h-72 min-w-130 overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2 text-xs text-muted">
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} className={cn('px-3 py-2 font-medium', c.align === 'right' ? 'text-right' : 'text-left')}>
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular-nums">
                {rows.map((r, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c.key} className={cn('px-3 py-1.5', c.align === 'right' ? 'text-right' : 'text-left')}>
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
        {footnote && <p className="mt-3 text-xs text-faint">{footnote}</p>}
      </div>
    </Card>
  );
}

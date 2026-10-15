import { RotateCcw, ServerOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

/** Honest error state for a page whose data could not load (no fabricated preview data). */
export function LoadError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = (error as Error)?.message ?? 'Something went wrong.';
  const backendDown = /backend|reach|server running/i.test(message);
  return (
    <Card>
      <EmptyState
        icon={ServerOff}
        title={backendDown ? 'The backend is not running' : "Couldn't load this page"}
        action={
          onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              <RotateCcw /> Retry
            </Button>
          )
        }
      >
        {backendDown ? 'Start it with ' : ''}
        {backendDown ? <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">npm run dev</code> : message}
        {backendDown ? ', then retry.' : ''}
      </EmptyState>
    </Card>
  );
}

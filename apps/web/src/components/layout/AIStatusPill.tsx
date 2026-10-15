import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

const LABEL: Record<string, string> = {
  quota: 'Quota reached',
  unavailable: 'Model unavailable',
  invalid_output: 'Bad model output',
  timeout: 'Model timeout',
  auth: 'Auth error',
  unknown: 'AI error',
};

export function useAIStatus() {
  return useQuery({ queryKey: ['ai-status'], queryFn: api.aiStatus, refetchInterval: 30_000, retry: false });
}

export function AIStatusPill() {
  const { data, isError } = useAIStatus();
  const state = isError ? 'offline' : !data ? 'loading' : data.ok ? 'ok' : 'error';
  const text =
    state === 'offline' ? 'Backend offline' : state === 'loading' ? 'Checking…' : state === 'ok' ? `AI ready · ${data!.provider}` : LABEL[data!.kind ?? 'unknown'];
  return (
    <Link
      to="/settings"
      title={data?.message ?? text}
      className="hidden h-8 items-center gap-2 rounded-lg border border-border px-2.5 text-xs font-medium text-muted hover:bg-surface-2 hover:text-text sm:flex"
    >
      <span
        className={cn(
          'size-2 rounded-full',
          state === 'ok' && 'bg-success',
          state === 'error' && 'bg-warning',
          state === 'offline' && 'bg-danger',
          state === 'loading' && 'animate-pulse bg-faint',
        )}
      />
      {text}
    </Link>
  );
}

export function AIStatusBanner() {
  const { data, isError } = useAIStatus();
  if (isError) {
    return (
      <div className="border-b border-border bg-danger-soft px-4 py-2 text-center text-sm text-danger sm:px-6">
        Can't reach the backend. Start it with <code className="font-mono">npm run dev</code> from the project root.
      </div>
    );
  }
  if (data && !data.ok) {
    return (
      <div className="border-b border-border bg-warning-soft px-4 py-2 text-center text-sm text-warning sm:px-6">
        <strong className="font-semibold">{LABEL[data.kind ?? 'unknown']}:</strong> {data.message}{' '}
        {data.kind === 'quota' && 'AI calls will fail until the quota resets or credits are added; then use Test evaluator in Settings.'}{' '}
        <Link to="/settings" className="underline underline-offset-2">
          Settings
        </Link>
      </div>
    );
  }
  return null;
}

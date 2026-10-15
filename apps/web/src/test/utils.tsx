import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { ThemeProvider } from '@/lib/theme';

export function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
}

/** Renders `ui` (or full routes) inside the same providers as main.tsx. */
export function renderWithProviders(ui: ReactElement, { route = '/', path }: { route?: string; path?: string } = {}) {
  const client = makeClient();
  const utils = render(
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[route]}>{path ? <Routes><Route path={path} element={ui} /></Routes> : ui}</MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return { ...utils, client };
}

export type Handler = (body: unknown) => { status?: number; body?: unknown } | Promise<{ status?: number; body?: unknown }>;

export interface MockApi {
  calls: { method: string; path: string; body: unknown }[];
  callsTo: (method: string, path: string) => { method: string; path: string; body: unknown }[];
}

/**
 * Replaces global fetch with a tiny router. Keys look like "GET /sessions/s1" (paths after /api).
 * A handler may be an array to return successive responses. Unmatched routes return 404.
 */
export function mockApi(routes: Record<string, Handler | Handler[]>): MockApi {
  const calls: MockApi['calls'] = [];
  const counters: Record<string, number> = {};
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const p = url.replace(/^https?:\/\/[^/]+/, '').replace(/^\/api/, '');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path: p, body });
    const key = `${method} ${p}`;
    const entry = routes[key];
    let h: Handler | undefined;
    if (Array.isArray(entry)) {
      const i = counters[key] ?? 0;
      counters[key] = i + 1;
      h = entry[Math.min(i, entry.length - 1)];
    } else h = entry;
    const res = h ? await h(body) : { status: 404, body: { message: 'Not found' } };
    const status = res.status ?? 200;
    return new Response(res.body === undefined ? '' : JSON.stringify(res.body), { status, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, callsTo: (m, p) => calls.filter((c) => c.method === m && c.path === p) };
}

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramDTO, DiagramSummaryDTO } from '@psc/shared';
import { mockApi, renderWithProviders } from '@/test/utils';
import { DiagramsPage } from './Diagrams';const summary: DiagramSummaryDTO = {
  id: 'd1',
  title: 'Placeholder diagram',
  subtitle: '',
  topic: '',
  prompt: '',
  nodeCount: 2,
  stepCount: 2,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const detail: DiagramDTO = {
  ...summary,
  model: 'mock',
  refinements: [],
  layout: { nodes: {}, zones: {} },
  spec: {
    title: summary.title,
    subtitle: '',
    alt: 'Placeholder alt',
    zones: [{ id: 'z', label: 'LAB', sub: undefined, tone: 'brand', col: 1, span: 12 }],
    nodes: [
      { id: 'a', title: 'Client', sub: undefined, icon: 'laptop', zone: 'z', tags: [], tone: 'std', step: 1 },
      { id: 'b', title: 'Server', sub: undefined, icon: 'server', zone: 'z', tags: [], tone: 'std', step: 1 },
    ],
    edges: [{ id: 'e', from: 'a', to: 'b', label: 'REQ', kind: 'flow', packets: 2, dur: 2.6, route: 'auto', labelAt: 'mid', step: 2 }],
    notes: [],
    steps: [
      { title: '1 · Scene', caption: 'caption one' },
      { title: '2 · Flow', caption: 'caption two' },
    ],
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('DiagramsPage', () => {
  it('shows the topic gallery when nothing is selected', async () => {
    mockApi({ 'GET /diagrams': () => ({ body: [] }) });
    renderWithProviders(<DiagramsPage />, { route: '/diagrams', path: '/diagrams' });
    expect(await screen.findByText('TCP 3-way handshake + teardown')).toBeInTheDocument();
    expect(screen.getByText('Tunneling & pivoting')).toBeInTheDocument();
  });

  it('opens a stored diagram from the library', async () => {
    mockApi({
      'GET /diagrams': () => ({ body: [summary] }),
      'GET /diagrams/d1': () => ({ body: detail }),
    });
    renderWithProviders(<DiagramsPage />, { route: '/diagrams?d=d1', path: '/diagrams' });
    expect(await screen.findByRole('heading', { name: 'Placeholder diagram' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('1 · Scene')).toBeInTheDocument());
    expect(screen.getByRole('img', { name: 'Placeholder alt' })).toBeInTheDocument();
  });

  it('relabels a component in edit mode and autosaves via PATCH', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      'GET /diagrams': () => ({ body: [summary] }),
      'GET /diagrams/d1': () => ({ body: detail }),
      'PATCH /diagrams/d1': (body) => {
        const b = body as { spec: typeof detail.spec; layout: typeof detail.layout };
        return { body: { ...detail, spec: b.spec, layout: b.layout } };
      },
    });
    renderWithProviders(<DiagramsPage />, { route: '/diagrams?d=d1', path: '/diagrams' });
    await screen.findByRole('heading', { name: 'Placeholder diagram' });

    await user.click(screen.getByRole('button', { name: 'Edit diagram' }));
    await user.click(await screen.findByText('Client'));

    expect(await screen.findByText('Edit component')).toBeInTheDocument();
    const title = screen.getByDisplayValue('Client');
    await user.clear(title);
    await user.type(title, 'Renamed host');

    await waitFor(() => expect(api.callsTo('PATCH', '/diagrams/d1').length).toBeGreaterThan(0), { timeout: 3000 });
    const body = api.callsTo('PATCH', '/diagrams/d1')[0]!.body as { spec: typeof detail.spec };
    expect(body.spec.nodes.find((n) => n.id === 'a')?.title).toBe('Renamed host');
  });
});

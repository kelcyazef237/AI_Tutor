import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DiagramSpec } from '@psc/shared';
import { DiagramCanvas } from '@/components/diagram/DiagramCanvas';
import { renderWithProviders } from '@/test/utils';

/** Generic placeholder spec — plumbing only, no teaching content. */
const spec = DiagramSpec.parse({
  title: 'Placeholder diagram',
  subtitle: 'Placeholder subtitle',
  alt: 'Two nodes connected by one wire',
  zones: [{ id: 'z1', label: 'LAB', tone: 'brand', col: 1, span: 12 }],
  nodes: [
    { id: 'a', title: 'Client', sub: '10.0.0.2', icon: 'laptop', zone: 'z1', tags: ['10.0.0.2'], step: 1, explain: '**Client** — a placeholder laptop that starts the request. (test definition)' },
    { id: 'b', title: 'Server', sub: '10.0.0.9', icon: 'server', zone: 'z1', step: 2 },
  ],
  edges: [{ id: 'e1', from: 'a', to: 'b', label: 'REQ', kind: 'flow', packets: 2, step: 2, explain: '**REQ** — the placeholder request that travels along this wire. (test definition)' }],
  steps: [
    { title: '1 · The scene', caption: 'Initial state.' },
    { title: '2 · First contact', caption: 'The wire **appears** now.' },
  ],
});

describe('DiagramCanvas', () => {
  it('renders zones, nodes and step captions', async () => {
    renderWithProviders(<DiagramCanvas spec={spec} />);
    expect(screen.getByRole('img', { name: /two nodes/i })).toBeInTheDocument();
    expect(screen.getByText('LAB')).toBeInTheDocument();
    expect(screen.getByText('Client')).toBeInTheDocument();
    expect(screen.getByText('Server')).toBeInTheDocument();
    expect(screen.getByText('1 · The scene')).toBeInTheDocument();
  });

  it('steps forward and back through the captions', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DiagramCanvas spec={spec} />);
    await user.click(screen.getByRole('button', { name: 'Next step' }));
    expect(screen.getByText('2 · First contact')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(screen.getByText('1 · The scene')).toBeInTheDocument();
  });

  it('reveals edges only from their step onwards', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<DiagramCanvas spec={spec} />);
    const edge = () => container.querySelector('.dg-edge');
    expect(edge()?.getAttribute('class')).toContain('dg-pending');
    await user.click(screen.getByRole('button', { name: 'Step 2' }));
    expect(edge()?.getAttribute('class')).toContain('dg-on');
    // Packets only exist on revealed edges.
    expect(container.querySelectorAll('.dg-pkt').length).toBe(2);
  });

  it('drags a node in edit mode and reports the new position', () => {
    const onMove = vi.fn();
    const { container } = renderWithProviders(<DiagramCanvas spec={spec} editable editing onMoveLayout={onMove} />);
    const canvas = container.querySelector('.dg-canvas') as HTMLElement;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 640, right: 1280, bottom: 640, x: 0, y: 0, toJSON: () => ({}) });

    const node = container.querySelector('.dg-node') as Element;
    fireEvent.pointerDown(node, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(node, { clientX: 148, clientY: 124, pointerId: 1 });
    fireEvent.pointerUp(node, { clientX: 148, clientY: 124, pointerId: 1 });

    expect(onMove).toHaveBeenCalledTimes(1);
    const next = onMove.mock.calls[0]![0] as { nodes: Record<string, { x: number; y: number }> };
    expect(Object.keys(next.nodes)).toHaveLength(1);
    expect(next.nodes.a!.x).toBeGreaterThan(0);
    expect(next.nodes.a!.y).toBeGreaterThan(0);
  });

  it('resizes a selected frame via its corner handle', () => {
    const onMove = vi.fn();
    const { container } = renderWithProviders(
      <DiagramCanvas spec={spec} editable editing selection={{ kind: 'zone', id: 'z1' }} onMoveLayout={onMove} />,
    );
    const canvas = container.querySelector('.dg-canvas') as HTMLElement;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 640, right: 1280, bottom: 640, x: 0, y: 0, toJSON: () => ({}) });

    // Handles only exist for the selected zone, in edit mode.
    const handle = container.querySelector('.dg-handle[data-h="se"]') as Element;
    expect(handle).toBeTruthy();
    fireEvent.pointerDown(handle, { clientX: 200, clientY: 150, pointerId: 2 });
    fireEvent.pointerMove(handle, { clientX: 260, clientY: 210, pointerId: 2 });
    fireEvent.pointerUp(handle, { clientX: 260, clientY: 210, pointerId: 2 });

    expect(onMove).toHaveBeenCalledTimes(1);
    const next = onMove.mock.calls[0]![0] as { zones: Record<string, { x: number; y: number; w: number; h: number }> };
    const z = next.zones.z1!;
    expect(z.w).toBeGreaterThan(600); // grew ~60 units
    expect(z.h).toBeGreaterThan(0);
  });

  it('opens a plain-language popup when a component is clicked (explain mode)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DiagramCanvas spec={spec} />);
    await user.click(screen.getByText('Client'));
    expect(await screen.findByText(/placeholder laptop that starts the request/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close explanation' }));

    // A wire is clickable too (via its hit path / label).
    await user.click(screen.getByText('REQ'));
    expect(await screen.findByText(/placeholder request that travels/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close explanation' }));

    // Toggling explain mode off restores plain clicking (no popup).
    await user.click(screen.getByRole('button', { name: 'Explain mode on' }));
    await user.click(screen.getByText('Client'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('routes "Ask about this" to the chat with the element focused', async () => {
    const user = userEvent.setup();
    const onAsk = vi.fn();
    renderWithProviders(<DiagramCanvas spec={spec} onAsk={onAsk} />);

    await user.click(screen.getByText('Client'));
    await user.click(await screen.findByTestId('explain-ask'));
    expect(onAsk).toHaveBeenCalledWith({ kind: 'node', id: 'a' });

    await user.click(screen.getByRole('button', { name: 'Ask about this diagram' }));
    expect(onAsk).toHaveBeenLastCalledWith(null);
  });
});

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderWithProviders } from '@/test/utils';
import { ChatDrawer } from './ChatDrawer';

afterEach(() => vi.unstubAllGlobals());

const reply = {
  id: 2,
  role: 'assistant' as const,
  content: '**Because both sides must agree** on sequence numbers before data flows.',
  focus: null,
  at: Date.now(),
};

describe('ChatDrawer', () => {
  it('sends a question and renders the saved reply', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      'GET /diagrams/d1/chat': () => ({ body: [] }),
      'POST /diagrams/d1/chat': (body) => ({
        body: [{ id: 1, role: 'user', content: (body as { message: string }).message, focus: (body as { focus?: unknown }).focus ?? null, at: Date.now() }, reply],
      }),
    });
    renderWithProviders(<ChatDrawer diagramId="d1" diagramTitle="Placeholder diagram" open onClose={() => {}} focus={null} onClearFocus={() => {}} />);

    await user.type(await screen.findByLabelText('Message'), 'Why three steps?');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText(/must agree/i)).toBeInTheDocument();
    expect(api.callsTo('POST', '/diagrams/d1/chat')).toHaveLength(1);
  });

  it('carries the element focus on the first question', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const api = mockApi({
      'GET /diagrams/d1/chat': () => ({ body: [] }),
      'POST /diagrams/d1/chat': () => ({ body: [reply] }),
    });
    renderWithProviders(
      <ChatDrawer
        diagramId="d1"
        diagramTitle="Placeholder diagram"
        open
        onClose={() => {}}
        focus={{ kind: 'node', id: 'a', label: 'Client' }}
        onClearFocus={onClear}
      />,
    );

    expect(await screen.findByText(/About: Client/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Message'), 'Explain this more');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    const body = api.callsTo('POST', '/diagrams/d1/chat')[0]!.body as { focus?: { kind: string; id: string } };
    expect(body.focus).toEqual({ kind: 'node', id: 'a' });
    expect(onClear).toHaveBeenCalled();
  });

  it('shows saved history when reopened', async () => {
    const api = mockApi({
      'GET /diagrams/d1/chat': () => ({
        body: [
          { id: 1, role: 'user', content: 'Earlier question', focus: null, at: Date.now() },
          reply,
        ],
      }),
    });
    renderWithProviders(<ChatDrawer diagramId="d1" diagramTitle="Placeholder diagram" open onClose={() => {}} focus={null} onClearFocus={() => {}} />);
    expect(await screen.findByText('Earlier question')).toBeInTheDocument();
    expect(screen.getByText(/must agree/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear chat' })).toBeInTheDocument();
    expect(api.callsTo('GET', '/diagrams/d1/chat')).toHaveLength(1);
  });
});

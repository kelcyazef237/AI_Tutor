import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DOMAIN_BY_ID, type RecallDTO } from '@psc/shared';
import { mockApi, renderWithProviders } from '@/test/utils';
import { coverage, RecallLobby, RecallRun } from './Recall';

const concepts = DOMAIN_BY_ID['dns']!.concepts;

function recall(over: Partial<RecallDTO> = {}): RecallDTO {
  return { id: 'r1', domainId: 'dns', domainName: 'DNS', startedAt: Date.now() - 60_000, submittedAt: null, minutes: 10, status: 'writing', text: '', selfChecked: false, result: null, ...over };
}
const reviewed = (over: Partial<RecallDTO> = {}) =>
  recall({
    status: 'reviewed',
    submittedAt: Date.now(),
    text: 'Placeholder text',
    result: {
      concepts: concepts.map((c, i) => ({ conceptId: c.id, conceptName: c.name, recalled: i === 0 ? 'solid' : i === 1 ? 'partial' : 'none', note: '', scheduled: i === 2 })),
      errors: [{ conceptId: concepts[0]!.id, conceptName: concepts[0]!.name, text: 'Placeholder error' }],
      connections: ['Placeholder connection'],
      feedback: 'Placeholder feedback',
    },
    ...over,
  });

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const renderRun = () => renderWithProviders(<RecallRun />, { route: '/recall/r1', path: '/recall/:id' });

describe('RecallRun', () => {
  it('writes, submits and shows coverage, misses scheduled for review, and errors', async () => {
    const api = mockApi({
      'GET /recall/r1': () => ({ body: recall() }),
      'POST /recall/r1/submit': () => ({ body: { kind: 'reviewed', recall: reviewed() } }),
    });
    const user = userEvent.setup();
    renderRun();
    const box = await screen.findByLabelText('Everything you remember');
    expect(screen.queryByText(concepts[0]!.name)).not.toBeInTheDocument(); // no cueing while writing
    await user.type(box, 'Placeholder text');
    expect(localStorage.getItem('psc-recall-r1')).toBe('Placeholder text');
    await user.click(screen.getByRole('button', { name: /compare/i }));

    const res = await screen.findByTestId('recall-results');
    expect(api.callsTo('POST', '/recall/r1/submit')[0]!.body).toEqual({ text: 'Placeholder text' });
    expect(within(res).getByText(`${Math.round(((1 + 0.5) / concepts.length) * 100)}%`)).toBeInTheDocument();
    expect(within(res).getByText(/1 concept you studied before didn't come back/)).toBeInTheDocument();
    expect(within(res).getByRole('link', { name: /review them now/i })).toHaveAttribute('href', '/train?mode=review');
    expect(within(res).getByText('Placeholder error')).toBeInTheDocument();
    expect(within(res).getByText('Placeholder connection')).toBeInTheDocument();
    expect(localStorage.getItem('psc-recall-r1')).toBeNull();
  });

  it('falls back to a strict self-check when the AI is unavailable', async () => {
    const api = mockApi({
      'GET /recall/r1': () => ({ body: recall() }),
      'POST /recall/r1/submit': () => ({ body: { kind: 'needs_self_check', reason: 'Placeholder reason', recall: recall({ submittedAt: Date.now(), text: 'Placeholder text' }) } }),
      'POST /recall/r1/self-check': () => ({ body: reviewed({ selfChecked: true }) }),
    });
    const user = userEvent.setup();
    renderRun();
    await user.type(await screen.findByLabelText('Everything you remember'), 'Placeholder text');
    await user.click(screen.getByRole('button', { name: /compare/i }));
    const panel = await screen.findByTestId('recall-self-check');
    expect(within(panel).getByText(/Placeholder reason/)).toBeInTheDocument();
    await user.click(within(within(panel).getByRole('radiogroup', { name: concepts[0]!.name })).getByRole('radio', { name: 'Well' }));
    await user.click(screen.getByRole('button', { name: /save self-check/i }));
    expect(await screen.findByTestId('recall-results')).toBeInTheDocument();
    const items = (api.callsTo('POST', '/recall/r1/self-check')[0]!.body as { items: { conceptId: string; recalled: string }[] }).items;
    expect(items).toHaveLength(concepts.length);
    expect(items[0]).toEqual({ conceptId: concepts[0]!.id, recalled: 'solid' });
    expect(items[1]!.recalled).toBe('none');
  });

  it('resumes a submitted but unreviewed recall at the self-check', async () => {
    mockApi({ 'GET /recall/r1': () => ({ body: recall({ submittedAt: Date.now(), text: 'Placeholder text' }) }) });
    renderRun();
    expect(await screen.findByTestId('recall-self-check')).toBeInTheDocument();
  });
});

describe('RecallLobby', () => {
  it('starts a recall for the chosen domain and lists past ones', async () => {
    const api = mockApi({
      'GET /recall': () => ({ body: [reviewed()] }),
      'POST /recall': () => ({ body: recall({ id: 'r2' }) }),
    });
    const user = userEvent.setup();
    renderWithProviders(<RecallLobby />, { route: '/recall' });
    expect(await screen.findByText(/recalled$/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Domain'), 'dns');
    await user.click(screen.getByRole('button', { name: /start writing/i }));
    await waitFor(() => expect(api.callsTo('POST', '/recall')).toHaveLength(1));
    expect(api.callsTo('POST', '/recall')[0]!.body).toEqual({ domainId: 'dns' });
  });

  it('computes coverage', () => {
    expect(coverage(recall())).toBeNull();
    expect(coverage(reviewed())).toBeCloseTo(1.5 / concepts.length);
  });
});

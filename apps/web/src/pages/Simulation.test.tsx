import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SimulationDTO } from '@psc/shared';
import { mockApi, renderWithProviders } from '@/test/utils';
import { layout } from '@/components/simulation/AttackGraph';
import { SimulationLobby, SimulationRun } from './Simulation';

/** Generic placeholder fixture: plumbing only, no teaching content. */
function sim(over: Partial<SimulationDTO> = {}): SimulationDTO {
  return {
    id: 'x1',
    title: 'Placeholder engagement',
    briefing: 'Placeholder briefing',
    scope: '10.0.0.0/30',
    attackerModel: 'Placeholder attacker',
    credentials: 'None',
    timeLimitMinutes: 30,
    difficulty: 2,
    focus: 'web',
    startedAt: Date.now() - 60_000,
    endedAt: null,
    status: 'active',
    phase: 'recon',
    phasesReached: ['recon'],
    objectives: [{ text: 'Placeholder objective', done: false }],
    transcript: [],
    graph: [],
    loop: { observation: 0, hypothesis: 0, test: 0, evidence: 0, conclusion: 0 },
    actions: 0,
    engagementOver: false,
    debrief: null,
    selfDebrief: null,
    reveal: null,
    ...over,
  };
}

const afterStep = sim({
  actions: 1,
  phase: 'enumeration',
  phasesReached: ['recon', 'enumeration'],
  transcript: [
    { id: 1, role: 'user', content: 'Placeholder action', at: Date.now() },
    { id: 2, role: 'system', content: 'Placeholder evidence', at: Date.now(), mentorNote: 'Placeholder note', phase: 'enumeration', reasoning: { actionQuality: 0.6, reasoningQuality: 0.5, stages: ['observation'] } },
  ],
  graph: [
    { id: 'h1', kind: 'host', label: 'Placeholder host', parent: null, discoveredAt: 2 },
    { id: 's1', kind: 'service', label: 'Placeholder service', parent: 'h1', discoveredAt: 2 },
  ],
  loop: { observation: 1, hypothesis: 0, test: 0, evidence: 0, conclusion: 0 },
});

const debrief = {
  summary: 'Placeholder summary',
  overall: 0.62,
  phase_scores: [{ phase: 'recon' as const, score: 0.7, note: '' }],
  strengths: ['Placeholder strength'],
  weaknesses: [],
  missed_opportunities: [],
  reasoning_loop: { observation: 0.8, hypothesis: 0.5, test: 0.4, evidence: 0.3, conclusion: 0.2 },
  concept_updates: [],
  next_steps: [],
  self_assessment_feedback: '',
};

afterEach(() => vi.unstubAllGlobals());

const renderRun = () => renderWithProviders(<SimulationRun />, { route: '/simulation/x1', path: '/simulation/:id' });

describe('SimulationRun', () => {
  it('sends an action, shows evidence, graph and loop, then ends with a debrief', async () => {
    const api = mockApi({
      'GET /simulations/x1': () => ({ body: sim() }),
      'POST /simulations/x1/action': () => ({ body: afterStep }),
      'POST /simulations/x1/end': (b) => ({ body: { ...afterStep, status: 'ended', endedAt: Date.now(), debrief: { ...debrief, self_assessment_feedback: 'Placeholder comparison' }, selfDebrief: (b as { selfDebrief: string }).selfDebrief, reveal: { intendedChain: ['Placeholder step'], vulnerabilities: [] } } }),
    });
    const user = userEvent.setup();
    renderRun();

    expect(await screen.findByText('Placeholder briefing')).toBeInTheDocument();
    expect(screen.getByText(/Authorized lab scope/)).toBeInTheDocument();
    expect(screen.getByText('What do you do first?')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Your next action'), 'Placeholder action{Control>}{Enter}{/Control}');
    expect(await screen.findByText('Placeholder evidence')).toBeInTheDocument();
    expect(screen.getByText('Placeholder note')).toBeInTheDocument();
    expect(api.callsTo('POST', '/simulations/x1/action')[0]!.body).toEqual({ action: 'Placeholder action' });
    expect(screen.getByLabelText('Your next action')).toHaveValue('');
    expect(screen.getByRole('img', { name: /2 discovered items/ })).toBeInTheDocument();
    expect(screen.getByTitle('Observation: present in 100% of your actions')).toBeInTheDocument();
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Enumeration');

    await user.click(screen.getByRole('button', { name: /end engagement/i }));
    expect(screen.getByRole('button', { name: /skip and end/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Your debrief'), 'Placeholder self debrief');
    await user.click(screen.getByRole('button', { name: /end and compare/i }));
    const d = await screen.findByTestId('sim-debrief');
    expect(within(d).getByText('62%')).toBeInTheDocument();
    expect(within(d).getByText('Placeholder strength')).toBeInTheDocument();
    expect(within(d).getByText('Placeholder step')).toBeInTheDocument();
    expect(api.callsTo('POST', '/simulations/x1/end')[0]!.body).toEqual({ selfDebrief: 'Placeholder self debrief' });
    const self = within(d).getByTestId('self-debrief');
    expect(within(self).getByText('Placeholder self debrief')).toBeInTheDocument();
    expect(within(self).getByText('Placeholder comparison')).toBeInTheDocument();
    expect(screen.queryByLabelText('Your next action')).not.toBeInTheDocument();
  });

  it('keeps the action and offers retry when the simulator is unavailable', async () => {
    const api = mockApi({
      'GET /simulations/x1': () => ({ body: sim() }),
      'POST /simulations/x1/action': [() => ({ status: 429, body: { message: 'Placeholder quota message', kind: 'quota' } }), () => ({ body: afterStep })],
    });
    const user = userEvent.setup();
    renderRun();
    await user.type(await screen.findByLabelText('Your next action'), 'Placeholder action');
    await user.click(screen.getByRole('button', { name: /send action/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('AI quota reached');
    expect(alert).toHaveTextContent('Placeholder quota message');
    expect(screen.getByLabelText('Your next action')).toHaveValue('Placeholder action');
    await user.click(within(alert).getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Placeholder evidence')).toBeInTheDocument();
    expect(api.callsTo('POST', '/simulations/x1/action')).toHaveLength(2);
  });

  it('offers a debrief retry for an ended engagement without one', async () => {
    mockApi({
      'GET /simulations/x1': () => ({ body: { ...afterStep, status: 'ended', endedAt: Date.now() } }),
      'POST /simulations/x1/end': () => ({ body: { ...afterStep, status: 'ended', endedAt: Date.now(), debrief } }),
    });
    const user = userEvent.setup();
    renderRun();
    await user.click(await screen.findByRole('button', { name: /get debrief/i }));
    expect(await screen.findByTestId('sim-debrief')).toBeInTheDocument();
  });
});

describe('SimulationLobby', () => {
  it('lists engagements and starts a new one with the chosen focus and difficulty', async () => {
    const api = mockApi({
      'GET /simulations': () => ({ body: [{ id: 'old', title: 'Placeholder old', difficulty: 3, focus: '', startedAt: Date.now() - 86_400_000, endedAt: Date.now(), status: 'ended', phase: 'recon', actions: 4, overall: 0.5 }] }),
      'GET /ai/status': () => ({ body: { ok: true, provider: 'mock', checkedAt: Date.now() } }),
      'POST /simulations': () => ({ body: sim() }),
    });
    const user = userEvent.setup();
    renderWithProviders(<SimulationLobby />, { route: '/simulation' });
    expect(await screen.findByText('Placeholder old')).toBeInTheDocument();
    expect(screen.getByText('Score 50%')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/focus/i), 'linux');
    await user.click(screen.getByRole('radio', { name: /expert/i }));
    await user.click(screen.getByRole('button', { name: /start engagement/i }));
    await waitFor(() => expect(api.callsTo('POST', '/simulations')).toHaveLength(1));
    expect(api.callsTo('POST', '/simulations')[0]!.body).toEqual({ focus: 'linux', difficulty: 5 });
  });
});

describe('attack graph layout', () => {
  it('places children right of parents, centered vertically, and tolerates bad parents', () => {
    const pos = layout([
      { id: 'h', kind: 'host', label: 'h', parent: null, discoveredAt: 1 },
      { id: 'a', kind: 'service', label: 'a', parent: 'h', discoveredAt: 1 },
      { id: 'b', kind: 'service', label: 'b', parent: 'h', discoveredAt: 1 },
      { id: 'o', kind: 'finding', label: 'o', parent: 'missing', discoveredAt: 1 },
    ]);
    expect(pos.get('a')!.x).toBeGreaterThan(pos.get('h')!.x);
    expect(pos.get('h')!.y).toBe((pos.get('a')!.y + pos.get('b')!.y) / 2);
    expect(pos.get('o')!.x).toBe(0);
  });
});

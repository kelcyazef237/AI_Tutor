import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { endData, evaluation, question, session } from '@/test/fixtures';
import { mockApi, renderWithProviders } from '@/test/utils';
import { draftKey, SessionPage } from './Session';

const renderSession = () => renderWithProviders(<SessionPage />, { route: '/session/s1', path: '/session/:id' });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SessionPage', () => {
  it('runs the happy path: answer → feedback → follow-up → next → summary', async () => {
    const followUp = question({ id: 'q2', isFollowUp: true, prompt: 'Placeholder follow-up text', bucket: undefined });
    const api = mockApi({
      'GET /sessions/s1': () => ({ body: session() }),
      'POST /sessions/s1/answer': [
        () => ({ body: { kind: 'evaluated', evaluation: evaluation({ followUp }), session: session({ answered: 1 }) } }),
        () => ({ body: { kind: 'evaluated', evaluation: evaluation({ attemptId: 'a2', result: 'correct', feedback: 'Placeholder feedback two', misconceptions: [], missingPoints: [] }), session: session({ answered: 2 }) } }),
      ],
      'POST /sessions/s1/next': () => ({ body: session({ answered: 2, current: null }) }),
      'POST /sessions/s1/end': () => ({ body: endData() }),
    });
    const user = userEvent.setup();
    renderSession();

    expect(await screen.findByText('Placeholder question text')).toBeInTheDocument();
    expect(screen.getByText('Placeholder greeting')).toBeInTheDocument();
    expect(screen.getByText('Weak area')).toBeInTheDocument();
    expect(screen.getByText('Quick Session')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Your answer'), 'Placeholder answer');
    await user.click(screen.getByRole('radio', { name: 'Fairly sure' }));
    await user.click(screen.getByRole('button', { name: /submit answer/i }));

    // Feedback for the first answer, then the follow-up as the next question.
    expect(await screen.findByText('Placeholder feedback')).toBeInTheDocument();
    expect(screen.getByText('Placeholder misconception')).toBeInTheDocument();
    expect(screen.getByText('Placeholder missing point')).toBeInTheDocument();
    expect(screen.getByText('Placeholder follow-up text')).toBeInTheDocument();
    expect(screen.getByText(/probe this a little further/i)).toBeInTheDocument();
    expect(screen.getByText('50%', { selector: '.text-muted' })).toBeInTheDocument(); // mastery before (3.5/7)
    expect(screen.queryByText('Placeholder greeting')).not.toBeInTheDocument();

    const first = api.callsTo('POST', '/sessions/s1/answer')[0]!.body as Record<string, unknown>;
    expect(first).toMatchObject({ questionId: 'q1', answer: 'Placeholder answer', skipped: false, confidence: 3 });
    expect(typeof first.durationMs).toBe('number');

    // Answer the follow-up.
    await user.type(screen.getByLabelText('Your answer'), 'Placeholder follow-up answer');
    await user.click(screen.getByRole('radio', { name: 'Fairly sure' }));
    await user.click(screen.getByRole('button', { name: /submit answer/i }));
    expect(await screen.findByText('Placeholder feedback two')).toBeInTheDocument();
    expect(api.callsTo('POST', '/sessions/s1/answer')[1]!.body).toMatchObject({ questionId: 'q2', answer: 'Placeholder follow-up answer' });

    const next = screen.getByRole('button', { name: /next question/i });
    expect(next).toHaveFocus();
    await user.click(next);

    expect(await screen.findByText('Session complete')).toBeInTheDocument();
    expect(api.callsTo('POST', '/sessions/s1/next')).toHaveLength(1);
    expect(api.callsTo('POST', '/sessions/s1/end')).toHaveLength(1);
    const summary = screen.getByTestId('session-summary');
    expect(within(summary).getByTestId('count-correct')).toHaveTextContent('1');
    expect(within(summary).getByTestId('count-partial')).toHaveTextContent('1');
    expect(within(summary).getByText('Placeholder misconception')).toBeInTheDocument();
    expect(within(summary).getByText('+10 pts')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /train again/i })).toHaveAttribute('href', '/train?mode=quick');
  });

  it('falls back to self-grading when the AI is unavailable', async () => {
    const api = mockApi({
      'GET /sessions/s1': () => ({ body: session() }),
      'POST /sessions/s1/answer': () => ({
        body: {
          kind: 'needs_self_grade',
          attemptId: 'a9',
          rubric: { keyPoints: ['Placeholder key point'], misconceptions: [], referenceAnswer: 'Placeholder reference answer' },
          reason: 'Placeholder reason',
          session: session({ answered: 1 }),
        },
      }),
      'POST /attempts/a9/self-grade': () => ({ body: evaluation({ attemptId: 'a9', result: 'partial', selfGraded: true }) }),
      'POST /sessions/s1/next': () => ({ body: session({ answered: 1, current: question({ id: 'q2', prompt: 'Placeholder second question' }) }) }),
    });
    const user = userEvent.setup();
    renderSession();

    await user.type(await screen.findByLabelText('Your answer'), 'Placeholder answer');
    await user.click(screen.getByRole('radio', { name: 'Fairly sure' }));
    await user.click(screen.getByRole('button', { name: /submit answer/i }));

    const panel = await screen.findByTestId('self-grade');
    expect(within(panel).getByText('Placeholder reason')).toBeInTheDocument();
    expect(within(panel).getByText('Placeholder answer')).toBeInTheDocument();
    expect(within(panel).getByText('Placeholder key point')).toBeInTheDocument();
    expect(within(panel).getByText('Placeholder reference answer')).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Partly' }));
    const done = await screen.findByTestId('self-graded');
    expect(api.callsTo('POST', '/attempts/a9/self-grade')[0]!.body).toEqual({ score: 0.5 });
    expect(within(done).getByText('Partial')).toBeInTheDocument();

    await user.click(within(done).getByRole('button', { name: /next question/i }));
    expect(await screen.findByText('Placeholder second question')).toBeInTheDocument();
  });

  it('records exam answers and auto-advances, then shows all feedback at the end', async () => {
    const examEnd = endData('exam', {
      evaluations: [{ ...evaluation({ attemptId: 'e1', feedback: 'Placeholder exam feedback' }), conceptName: 'Placeholder exam concept', prompt: 'Placeholder question text' }],
    });
    const api = mockApi({
      'GET /sessions/s1': () => ({ body: session({ mode: 'exam', feedbackMode: 'end', greeting: '' }) }),
      'POST /sessions/s1/answer': () => ({ body: { kind: 'recorded', attemptId: 'e1', session: session({ mode: 'exam', answered: 1 }) } }),
      'POST /sessions/s1/next': () => ({ body: session({ mode: 'exam', feedbackMode: 'end', answered: 1, current: null }) }),
      'POST /sessions/s1/end': () => ({ body: examEnd }),
    });
    const user = userEvent.setup();
    renderSession();

    await user.type(await screen.findByLabelText('Your answer'), 'Placeholder answer');
    await user.click(screen.getByRole('radio', { name: 'Fairly sure' }));
    await user.click(screen.getByRole('button', { name: /submit answer/i }));

    expect(await screen.findByText('Answer recorded')).toBeInTheDocument();
    expect(await screen.findByText('Session complete', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(api.callsTo('POST', '/sessions/s1/next')).toHaveLength(1);
    expect(screen.getByText('Answers and feedback')).toBeInTheDocument();
    expect(screen.getByText(/Placeholder exam concept/)).toBeInTheDocument();
    expect(screen.getByText('Placeholder exam feedback')).toBeInTheDocument(); // inside a collapsed <details>
  });

  it('keeps the draft on an AI quota error and Retry resubmits the same answer', async () => {
    const api = mockApi({
      'GET /sessions/s1': () => ({ body: session() }),
      'POST /sessions/s1/answer': [
        () => ({ status: 429, body: { message: 'Placeholder quota message', kind: 'quota' } }),
        () => ({ body: { kind: 'evaluated', evaluation: evaluation(), session: session({ answered: 1 }) } }),
      ],
    });
    const user = userEvent.setup();
    renderSession();

    const box = await screen.findByLabelText('Your answer');
    await user.type(box, 'Placeholder draft');
    expect(sessionStorage.getItem(draftKey('q1'))).toBe('Placeholder draft');
    await user.click(screen.getByRole('radio', { name: 'Fairly sure' }));
    await user.click(screen.getByRole('button', { name: /submit answer/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('AI quota reached');
    expect(alert).toHaveTextContent('Placeholder quota message');
    expect(screen.getByLabelText('Your answer')).toHaveValue('Placeholder draft');
    expect(sessionStorage.getItem(draftKey('q1'))).toBe('Placeholder draft');

    await user.click(within(alert).getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Placeholder feedback')).toBeInTheDocument();
    const calls = api.callsTo('POST', '/sessions/s1/answer');
    expect(calls).toHaveLength(2);
    expect((calls[1]!.body as { answer: string }).answer).toBe('Placeholder draft');
    expect(sessionStorage.getItem(draftKey('q1'))).toBeNull();
  });

  it('submits with Ctrl+Enter and restores a saved draft', async () => {
    sessionStorage.setItem(draftKey('q1'), 'Placeholder saved draft');
    const api = mockApi({
      'GET /sessions/s1': () => ({ body: session() }),
      'POST /sessions/s1/answer': () => ({ body: { kind: 'evaluated', evaluation: evaluation(), session: session({ answered: 1 }) } }),
    });
    const user = userEvent.setup();
    renderSession();

    const box = await screen.findByLabelText('Your answer');
    await waitFor(() => expect(box).toHaveValue('Placeholder saved draft'));
    box.focus();
    await user.keyboard('{Alt>}3{/Alt}');
    await user.keyboard('{Control>}{Enter}{/Control}');

    expect(await screen.findByText('Placeholder feedback')).toBeInTheDocument();
    expect(api.callsTo('POST', '/sessions/s1/answer')[0]!.body).toMatchObject({ answer: 'Placeholder saved draft' });
  });

  it('sends skipped:true when skipping', async () => {
    const api = mockApi({
      'GET /sessions/s1': () => ({ body: session() }),
      'POST /sessions/s1/answer': () => ({ body: { kind: 'evaluated', evaluation: evaluation({ result: 'incorrect' }), session: session({ answered: 1 }) } }),
    });
    const user = userEvent.setup();
    renderSession();
    await user.click(await screen.findByRole('button', { name: /skip/i }));
    expect(await screen.findByText('Incorrect')).toBeInTheDocument();
    expect(api.callsTo('POST', '/sessions/s1/answer')[0]!.body).toMatchObject({ skipped: true, answer: '' });
  });

  it('ends early through the confirm dialog', async () => {
    const api = mockApi({
      'GET /sessions/s1': () => ({ body: session() }),
      'POST /sessions/s1/end': () => ({ body: endData() }),
    });
    const user = userEvent.setup();
    renderSession();
    await user.click(await screen.findByRole('button', { name: /end session/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('End this session?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /end session/i }));
    expect(await screen.findByText('Session complete')).toBeInTheDocument();
    expect(api.callsTo('POST', '/sessions/s1/end')).toHaveLength(1);
  });

  it('shows a clear empty state when the session engine is missing', async () => {
    mockApi({});
    renderSession();
    expect(await screen.findByText(/session engine isn't available yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to train/i })).toHaveAttribute('href', '/train');
  });

  it('renders artifacts as plain text blocks', async () => {
    mockApi({
      'GET /sessions/s1': () => ({
        body: session({ current: question({ artifact: { kind: 'terminal', title: 'Placeholder title', content: 'placeholder output\n  indented line' } }) }),
      }),
    });
    renderSession();
    const block = await screen.findByText(/placeholder output/);
    expect(block.tagName).toBe('PRE');
    expect(block.textContent).toBe('placeholder output\n  indented line');
    expect(screen.getByText('Placeholder title')).toBeInTheDocument();
  });
});

describe('confidence and reflection', () => {
  it('requires a confidence rating before submitting, but not to skip', async () => {
    const api = mockApi({
      'GET /sessions/s1': () => ({ body: session() }),
      'POST /sessions/s1/answer': () => ({ body: { kind: 'evaluated', evaluation: evaluation({ result: 'incorrect', predicted: 4 }), session: session({ answered: 1 }) } }),
    });
    const user = userEvent.setup();
    renderSession();
    await user.type(await screen.findByLabelText('Your answer'), 'Placeholder answer');
    const submit = screen.getByRole('button', { name: /submit answer/i });
    expect(submit).toBeDisabled();
    expect(screen.getByText(/rate your confidence/i)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Certain' }));
    expect(submit).toBeEnabled();
    await user.click(submit);
    const note = await screen.findByTestId('calibration-note');
    expect(note).toHaveTextContent('You said Certain');
    expect(note).toHaveTextContent(/illusion of knowing/);
    expect(api.callsTo('POST', '/sessions/s1/answer')[0]!.body).toMatchObject({ confidence: 4 });
  });

  it('skipping sends no confidence', async () => {
    const api = mockApi({
      'GET /sessions/s1': () => ({ body: session() }),
      'POST /sessions/s1/answer': () => ({ body: { kind: 'evaluated', evaluation: evaluation(), session: session({ answered: 1 }) } }),
    });
    const user = userEvent.setup();
    renderSession();
    await user.click(await screen.findByRole('button', { name: /skip/i }));
    await waitFor(() => expect(api.callsTo('POST', '/sessions/s1/answer')).toHaveLength(1));
    expect(api.callsTo('POST', '/sessions/s1/answer')[0]!.body).toMatchObject({ skipped: true, confidence: null });
  });

  it('saves an end-of-session reflection', async () => {
    const api = mockApi({
      'GET /sessions/s1': () => ({ body: session({ current: null, answered: 2 }) }),
      'POST /sessions/s1/end': () => ({ body: endData() }),
      'PUT /sessions/s1/reflection': (b) => ({ body: { ...endData().summary, reflection: b } }),
    });
    const user = userEvent.setup();
    renderSession();
    const card = await screen.findByTestId('reflection');
    const save = within(card).getByRole('button', { name: /save reflection/i });
    expect(save).toBeDisabled();
    await user.type(within(card).getByLabelText(/what went well/i), 'Placeholder well');
    await user.click(save);
    expect(await within(card).findByText('Saved')).toBeInTheDocument();
    expect(api.callsTo('PUT', '/sessions/s1/reflection')[0]!.body).toEqual({ wentWell: 'Placeholder well', change: '', connects: '' });
  });
});

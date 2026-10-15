import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ringGeometry } from '@/components/goals/ProgressRing';
import { dashboard, settings } from '@/test/fixtures';
import { mockApi, renderWithProviders } from '@/test/utils';
import { GoalsPage, missedDays } from './Goals';

afterEach(() => vi.unstubAllGlobals());

describe('ringGeometry', () => {
  it('maps progress to stroke offset', () => {
    const g = ringGeometry(5, 10, 50);
    expect(g.circumference).toBeCloseTo(2 * Math.PI * 50);
    expect(g.fraction).toBe(0.5);
    expect(g.dashOffset).toBeCloseTo(g.circumference / 2);
    expect(g.percent).toBe(50);
    expect(g.met).toBe(false);
  });
  it('clamps the arc but not the percentage when over goal', () => {
    const g = ringGeometry(15, 10, 50);
    expect(g.fraction).toBe(1);
    expect(g.dashOffset).toBe(0);
    expect(g.percent).toBe(150);
    expect(g.met).toBe(true);
  });
  it('handles zero and negative inputs', () => {
    expect(ringGeometry(0, 10, 50).dashOffset).toBeCloseTo(2 * Math.PI * 50);
    expect(ringGeometry(-3, 10, 50).fraction).toBe(0);
    expect(ringGeometry(3, 0, 50).fraction).toBe(0);
  });
});

describe('missedDays', () => {
  const a = (day: string, questions: number) => ({ day, questions, correct: 0 });
  it('counts completed days below goal since first activity, excluding today', () => {
    const activity = [a('2026-10-01', 0), a('2026-10-02', 12), a('2026-10-03', 3), a('2026-10-04', 0), a('2026-10-05', 11), a('2026-10-06', 0)];
    const missed = missedDays(activity, 10, '2026-10-06');
    expect(missed.map((d) => d.day)).toEqual(['2026-10-03', '2026-10-04']);
  });
  it('is empty with no activity', () => {
    expect(missedDays([a('2026-10-01', 0)], 10, '2026-10-02')).toEqual([]);
  });
});

describe('GoalsPage', () => {
  it('shows an honest error when the backend is missing (no fabricated data)', async () => {
    mockApi({});
    renderWithProviders(<GoalsPage />);
    expect(await screen.findByText(/backend is not running|Couldn't load/i)).toBeInTheDocument();
    expect(screen.queryByText(/Preview data/)).not.toBeInTheDocument();
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
  });

  it('renders real data and saves edited goals', async () => {
    const d = dashboard();
    d.stats.today = 8;
    d.stats.week = 20;
    const api = mockApi({
      'GET /settings': () => ({ body: settings({ dailyGoal: 8, weeklyGoal: 40 }) }),
      'GET /dashboard': () => ({ body: d }),
      'PUT /settings': (body) => ({ body: settings({ ...(body as object) }) }),
    });
    const user = userEvent.setup();
    renderWithProviders(<GoalsPage />);

    expect(await screen.findByRole('meter', { name: 'Today: 8 of 8' })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'This week: 20 of 40' })).toBeInTheDocument();
    expect(screen.queryByText(/Preview data/)).not.toBeInTheDocument();
    expect(screen.getByText('Goal met')).toBeInTheDocument();
    expect(screen.getByText('20 to go')).toBeInTheDocument();

    const daily = screen.getByLabelText(/Daily goal/);
    await waitFor(() => expect(daily).toHaveValue(8));
    await user.clear(daily);
    await user.type(daily, '12');
    const reminder = screen.getByLabelText(/Reminder time/);
    fireEvent.change(reminder, { target: { value: '18:30' } });
    await user.click(screen.getByRole('button', { name: /save goals/i }));

    await waitFor(() => expect(api.callsTo('PUT', '/settings')).toHaveLength(1));
    expect(api.callsTo('PUT', '/settings')[0]!.body).toEqual({ dailyGoal: 12, weeklyGoal: 40, sessionReminder: '18:30', studyDays: [] });
  });

  it('requests notification permission and sends a test notification', async () => {
    const created: string[] = [];
    class MockNotification {
      static permission: NotificationPermission = 'default';
      static requestPermission = vi.fn(async () => {
        MockNotification.permission = 'granted';
        return 'granted' as const;
      });
      constructor(title: string) {
        created.push(title);
      }
    }
    vi.stubGlobal('Notification', MockNotification);
    mockApi({ 'GET /settings': () => ({ body: settings() }), 'GET /dashboard': () => ({ body: dashboard() }) });
    const user = userEvent.setup();
    renderWithProviders(<GoalsPage />);

    const state = await screen.findByTestId('permission-state');
    expect(state).toHaveTextContent('Not yet allowed');
    expect(screen.getByRole('button', { name: /send test notification/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /enable notifications/i }));
    await waitFor(() => expect(screen.getByTestId('permission-state')).toHaveTextContent('Allowed'));
    expect(MockNotification.requestPermission).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /send test notification/i }));
    expect(created).toEqual(['Test notification']);
  });

  it('handles browsers without notifications', async () => {
    delete (window as unknown as Record<string, unknown>).Notification;
    mockApi({ 'GET /settings': () => ({ body: settings() }), 'GET /dashboard': () => ({ body: dashboard() }) });
    renderWithProviders(<GoalsPage />);
    const card = (await screen.findByText(/doesn't support notifications/)).closest('div')!;
    expect(within(card.parentElement!).queryByRole('button', { name: /enable notifications/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('permission-state')).toHaveTextContent('Not supported');
  });
});

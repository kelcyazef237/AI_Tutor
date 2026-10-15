import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { conceptStates, dashboard, sessionSummaries } from '@/test/fixtures';
import { mockApi, renderWithProviders } from '@/test/utils';
import { AnalyticsPage } from './Analytics';

afterEach(() => vi.unstubAllGlobals());

const CHARTS = ['Mastery over time', 'Answers over time', 'Accuracy by mode', 'Time practiced per week', 'Mastery and confidence by area', 'Concept status'];

const liveApi = (over: Parameters<typeof mockApi>[0] = {}) =>
  mockApi({
    'GET /dashboard': () => ({ body: dashboard() }),
    'GET /sessions': () => ({ body: sessionSummaries() }),
    'GET /concepts': () => ({ body: conceptStates() }),
    ...over,
  });

describe('AnalyticsPage', () => {
  it('renders every chart from live data', async () => {
    liveApi();
    renderWithProviders(<AnalyticsPage />);
    expect(await screen.findByRole('heading', { name: 'Concept status' })).toBeInTheDocument();
    for (const t of CHARTS) expect(screen.getByRole('heading', { name: t })).toBeInTheDocument();
    expect(screen.getByText('Time practiced')).toBeInTheDocument();
    expect(screen.getByText('Concepts assessed')).toBeInTheDocument();
    const legend = screen.getByTestId('status-legend');
    for (const l of ['Not assessed', 'Learning', 'Review due', 'At risk', 'Solid']) expect(within(legend).getByText(l)).toBeInTheDocument();
  });

  it('shows an honest error when an endpoint fails (no fabricated data)', async () => {
    liveApi({ 'GET /dashboard': () => ({ status: 500, body: { message: 'Placeholder failure' } }) });
    renderWithProviders(<AnalyticsPage />);
    expect(await screen.findByText(/Couldn't load this page|backend is not running/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Concept status' })).not.toBeInTheDocument();
  });

  it('switches date range and table view', async () => {
    liveApi();
    const user = userEvent.setup();
    renderWithProviders(<AnalyticsPage />);
    await screen.findByRole('heading', { name: 'Concept status' });
    const all = screen.getByRole('radio', { name: 'All time' });
    await user.click(all);
    expect(all).toHaveAttribute('aria-checked', 'true');
    const card = screen.getByRole('heading', { name: 'Concept status' }).closest('.rounded-xl') as HTMLElement;
    await user.click(within(card).getByTitle('Table view'));
    expect(within(card).getByRole('table')).toBeInTheDocument();
  });

  it('shows the empty state for a range with no graded answers', async () => {
    liveApi({ 'GET /sessions': () => ({ body: [] }) });
    renderWithProviders(<AnalyticsPage />);
    expect(await screen.findByRole('heading', { name: 'Concept status' })).toBeInTheDocument();
    expect(screen.getByText('No graded answers in this range.')).toBeInTheDocument();
  });
});

describe('calibration section', () => {
  it('renders calibration, bias text, retention and confident errors', async () => {
    liveApi();
    renderWithProviders(<AnalyticsPage />);
    const chart = await screen.findByTestId('calibration-chart');
    expect(within(chart).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText(/You tend to be overconfident/)).toBeInTheDocument();
    expect(screen.getByText('Delayed recall')).toBeInTheDocument();
    expect(within(screen.getByTestId('confident-errors')).getAllByRole('listitem')).toHaveLength(3);
  });
});

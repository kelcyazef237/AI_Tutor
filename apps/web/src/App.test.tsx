import { act, screen, waitFor } from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_NAV } from '@/components/layout/nav';
import { mockApi, renderWithProviders } from '@/test/utils';
import { App } from './App';

class Boundary extends Component<{ children: ReactNode; onError: (e: Error) => void }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(e: Error) {
    this.props.onError(e);
  }
  override render() {
    return this.state.failed ? <p>crashed</p> : this.props.children;
  }
}

const ROUTES = [...ALL_NAV.map((n) => n.to), '/session/s1', '/simulation/x1', '/recall/r1', '/no-such-page'];

afterEach(() => vi.unstubAllGlobals());

describe('App routes', () => {
  it.each(ROUTES)('renders %s without crashing (backend missing)', async (route) => {
    mockApi({});
    const errors: Error[] = [];
    renderWithProviders(
      <Boundary onError={(e) => errors.push(e)}>
        <App />
      </Boundary>,
      { route },
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(errors).toEqual([]);
    expect(screen.queryByText('crashed')).not.toBeInTheDocument();
    expect(screen.getByRole('main').textContent?.length).toBeGreaterThan(0);
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProfilesDTO } from '@psc/shared';
import { mockApi, renderWithProviders } from '@/test/utils';
import { ProfileSwitcher } from './ProfileSwitcher';

afterEach(() => vi.unstubAllGlobals());

const profiles = (active = 'p1'): ProfilesDTO => ({
  activeId: active,
  profiles: [
    { id: 'p1', name: 'Alice', createdAt: 1, lastActive: 2, active: active === 'p1' },
    { id: 'p2', name: 'Bob', createdAt: 1, lastActive: 1, active: active === 'p2' },
  ],
});

describe('ProfileSwitcher', () => {
  it('shows the active profile and switches to another', async () => {
    const api = mockApi({
      'GET /profiles': () => ({ body: profiles('p1') }),
      'POST /profiles/p2/activate': () => ({ body: { id: 'p2', name: 'Bob', createdAt: 1, lastActive: 3, active: true } }),
    });
    const user = userEvent.setup();
    renderWithProviders(<ProfileSwitcher collapsed={false} />);
    expect(await screen.findByText('Alice')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /switch profile/i }));
    await user.click(await screen.findByRole('menuitem', { name: /Bob/ }));
    await waitFor(() => expect(api.callsTo('POST', '/profiles/p2/activate')).toHaveLength(1));
  });

  it('creates a new profile by name', async () => {
    const api = mockApi({
      'GET /profiles': () => ({ body: profiles('p1') }),
      'POST /profiles': () => ({ body: { id: 'p3', name: 'Kelcy', createdAt: 1, lastActive: 4, active: true } }),
    });
    const user = userEvent.setup();
    renderWithProviders(<ProfileSwitcher collapsed={false} />);
    await user.click(await screen.findByRole('button', { name: /switch profile/i }));
    await user.click(await screen.findByRole('menuitem', { name: /New profile/i }));
    await user.type(screen.getByLabelText('Profile name'), 'Kelcy');
    await user.click(screen.getByRole('button', { name: /^Create$/ }));
    await waitFor(() => expect(api.callsTo('POST', '/profiles')).toHaveLength(1));
    expect(api.callsTo('POST', '/profiles')[0]!.body).toEqual({ name: 'Kelcy' });
  });
});

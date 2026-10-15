import { QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dashboard, settings } from '@/test/fixtures';
import { makeClient, mockApi } from '@/test/utils';
import { parseReminder, REMINDER_KEY, shouldFireReminder, useSessionReminder } from './reminders';

const created: { title: string; body?: string }[] = [];

function installNotification(permission: NotificationPermission) {
  class MockNotification {
    static permission = permission;
    static requestPermission = vi.fn(async () => MockNotification.permission);
    constructor(title: string, opts?: NotificationOptions) {
      created.push({ title, body: opts?.body });
    }
  }
  vi.stubGlobal('Notification', MockNotification);
}

function Probe() {
  useSessionReminder();
  return null;
}

function mount({ today, dailyGoal = 10, reminder = '09:00' }: { today: number; dailyGoal?: number; reminder?: string }) {
  const s = settings({ dailyGoal, sessionReminder: reminder });
  const d = dashboard();
  d.stats.dailyGoal = dailyGoal;
  d.stats.today = today;
  mockApi({ 'GET /settings': () => ({ body: s }), 'GET /dashboard': () => ({ body: d }) });
  const client = makeClient();
  client.setQueryData(['settings'], s);
  client.setQueryData(['dashboard'], d);
  return render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
}

const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

describe('reminder helpers', () => {
  it('parses HH:MM', () => {
    expect(parseReminder('09:30')).toBe(570);
    expect(parseReminder('')).toBeNull();
    expect(parseReminder('24:00')).toBeNull();
    expect(parseReminder('nope')).toBeNull();
  });

  it('decides when to fire', () => {
    const base = { reminder: '09:00', lastFired: null, permission: 'granted' as const, today: 2, dailyGoal: 10 };
    expect(shouldFireReminder({ ...base, now: new Date(2026, 9, 13, 8, 59) })).toBe(false);
    expect(shouldFireReminder({ ...base, now: new Date(2026, 9, 13, 9, 0) })).toBe(true);
    expect(shouldFireReminder({ ...base, now: new Date(2026, 9, 13, 9, 0), lastFired: '2026-10-13' })).toBe(false);
    expect(shouldFireReminder({ ...base, now: new Date(2026, 9, 13, 9, 0), today: 10 })).toBe(false);
    expect(shouldFireReminder({ ...base, now: new Date(2026, 9, 13, 9, 0), permission: 'default' })).toBe(false);
    expect(shouldFireReminder({ ...base, now: new Date(2026, 9, 13, 9, 0), reminder: '' })).toBe(false);
    // 2026-10-13 is a Tuesday (getDay()===2).
    expect(shouldFireReminder({ ...base, now: new Date(2026, 9, 13, 9, 0), studyDays: [2] })).toBe(true);
    expect(shouldFireReminder({ ...base, now: new Date(2026, 9, 13, 9, 0), studyDays: [1, 3] })).toBe(false);
    expect(shouldFireReminder({ ...base, now: new Date(2026, 9, 13, 9, 0), studyDays: [] })).toBe(true);
  });
});

describe('useSessionReminder', () => {
  beforeEach(() => {
    created.length = 0;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date(2026, 9, 13, 8, 59, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fires once per day at the reminder time', async () => {
    installNotification('granted');
    mount({ today: 3 });
    await advance(10_000);
    expect(created).toHaveLength(0);

    await advance(60_000); // past 09:00
    expect(created).toHaveLength(1);
    expect(created[0]!.title).toBe('Time for your session');
    expect(created[0]!.body).toBe('3 of 10 questions done today.');
    expect(localStorage.getItem(REMINDER_KEY)).toBe('2026-10-13');

    await advance(3 * 3_600_000); // later the same day
    expect(created).toHaveLength(1);

    await advance(24 * 3_600_000); // next day, after 09:00
    expect(created).toHaveLength(2);
  });

  it('does not fire when the daily goal is met', async () => {
    installNotification('granted');
    mount({ today: 10 });
    await advance(5 * 60_000);
    expect(created).toHaveLength(0);
  });

  it('does not fire without permission', async () => {
    installNotification('default');
    mount({ today: 0 });
    await advance(5 * 60_000);
    expect(created).toHaveLength(0);
    expect(localStorage.getItem(REMINDER_KEY)).toBeNull();
  });

  it('does nothing in browsers without Notification support', async () => {
    vi.stubGlobal('Notification', undefined);
    // `'Notification' in window` must be false
    delete (window as unknown as Record<string, unknown>).Notification;
    mount({ today: 0 });
    await advance(5 * 60_000);
    expect(created).toHaveLength(0);
  });
});

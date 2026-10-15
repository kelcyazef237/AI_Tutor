import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from './api';
import { dayKey } from './format';

export const REMINDER_KEY = 'psc-reminder-last-fired';
/** How often the open app checks whether the reminder is due. */
export const REMINDER_CHECK_MS = 30_000;

export type NotifyPermission = NotificationPermission | 'unsupported';

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotifyPermission {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

/** Parses "HH:MM" into minutes after midnight, or null when empty/invalid. */
export function parseReminder(v: string | undefined | null): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((v ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export interface ReminderCheck {
  now: Date;
  reminder: string;
  lastFired: string | null;
  permission: NotifyPermission;
  today: number | null;
  dailyGoal: number;
  /** Weekdays (0=Sun..6=Sat) the learner studies; empty = every day. */
  studyDays?: number[];
}

/** Pure decision: should a reminder notification fire right now? */
export function shouldFireReminder({ now, reminder, lastFired, permission, today, dailyGoal, studyDays }: ReminderCheck): boolean {
  const at = parseReminder(reminder);
  if (at === null) return false;
  if (permission !== 'granted') return false;
  if (lastFired === dayKey(now)) return false;
  if (today !== null && today >= dailyGoal) return false;
  if (studyDays && studyDays.length > 0 && !studyDays.includes(now.getDay())) return false;
  return now.getHours() * 60 + now.getMinutes() >= at;
}

function readLastFired() {
  try {
    return localStorage.getItem(REMINDER_KEY);
  } catch {
    return null;
  }
}

function writeLastFired(v: string) {
  try {
    localStorage.setItem(REMINDER_KEY, v);
  } catch {
    /* storage unavailable */
  }
}

export function progressText(today: number | null, goal: number) {
  return today === null ? `Your daily goal is ${goal} questions.` : `${today} of ${goal} questions done today.`;
}

export function showNotification(title: string, body: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  try {
    new Notification(title, { body, tag: 'psc-reminder' });
    return true;
  } catch {
    return false;
  }
}

/**
 * While the app is open, fires one browser notification per day at the configured
 * reminder time if notifications are allowed and today's goal isn't met yet.
 */
export function useSessionReminder() {
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings, retry: false });
  const reminder = settings.data?.sessionReminder ?? '';
  const enabled = parseReminder(reminder) !== null;
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, retry: false, enabled, refetchInterval: enabled ? 5 * 60_000 : false });

  const latest = useRef({ reminder, today: null as number | null, goal: 10, studyDays: [] as number[] });
  latest.current = {
    reminder,
    today: dashboard.data?.stats.today ?? null,
    goal: settings.data?.dailyGoal ?? dashboard.data?.stats.dailyGoal ?? 10,
    studyDays: settings.data?.studyDays ?? [],
  };

  // Wait for today's progress (or its failure) so a met goal never triggers a reminder.
  const ready = enabled && (dashboard.isSuccess || dashboard.isError);

  useEffect(() => {
    if (!ready) return;
    const check = () => {
      const { reminder, today, goal, studyDays } = latest.current;
      const now = new Date();
      if (!shouldFireReminder({ now, reminder, lastFired: readLastFired(), permission: notificationPermission(), today, dailyGoal: goal, studyDays })) return;
      if (showNotification('Time for your session', progressText(today, goal))) writeLastFired(dayKey(now));
    };
    check();
    const t = setInterval(check, REMINDER_CHECK_MS);
    return () => clearInterval(t);
  }, [ready]);
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, BellRing, CalendarX, CheckCircle2, Circle, Eye, Flame, Loader2, Save, Send, Trophy, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { type DashboardDTO, type Settings } from '@psc/shared';
import { ActivityHeatmap } from '@/components/charts/ActivityHeatmap';
import { ProgressRing } from '@/components/goals/ProgressRing';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { dayKey } from '@/lib/format';
import { LoadError } from '@/components/ui/load-error';
import { notificationPermission, notificationsSupported, parseReminder, progressText, showNotification, type NotifyPermission } from '@/lib/reminders';
import { cn } from '@/lib/utils';

type Day = DashboardDTO['activity'][number];

/** Completed days (today excluded) in the last `window` days, on/after the first active day, that missed the goal. */
export function missedDays(activity: Day[], goal: number, today = dayKey(new Date()), window = 14): Day[] {
  const firstActive = activity.find((d) => d.questions > 0)?.day;
  if (!firstActive) return [];
  const past = activity.filter((d) => d.day < today);
  return past.slice(-window).filter((d) => d.day >= firstActive && d.questions < goal);
}

const weekdayShort = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
const longDay = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

function RingCard({ title, value, goal, sub }: { title: string; value: number; goal: number; sub: string }) {
  const met = value >= goal;
  return (
    <Card className="flex min-w-0 flex-col items-center gap-4 p-5 sm:flex-row">
      <ProgressRing value={value} goal={goal} label={`${title}: ${value} of ${goal}`}>
        <div>
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
          <div className="text-xs text-muted">of {goal}</div>
        </div>
      </ProgressRing>
      <div className="min-w-0 text-center sm:text-left">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted">{sub}</p>
        <p className={cn('mt-2 inline-flex items-center gap-1 text-sm font-medium', met ? 'text-accent' : 'text-muted')}>
          {met ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
          {met ? 'Goal met' : `${goal - value} to go`}
        </p>
      </div>
    </Card>
  );
}

function NotificationsCard({ reminder, today, goal }: { reminder: string; today: number; goal: number }) {
  const [perm, setPerm] = useState<NotifyPermission>(notificationPermission);
  const [asking, setAsking] = useState(false);
  const supported = notificationsSupported();

  const enable = async () => {
    if (!supported) return;
    setAsking(true);
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
    } catch {
      setPerm(notificationPermission());
    } finally {
      setAsking(false);
    }
  };

  const PERM: Record<NotifyPermission, { label: string; icon: typeof Bell; tone: 'accent' | 'neutral' | 'warning' | 'danger' }> = {
    granted: { label: 'Allowed', icon: BellRing, tone: 'accent' },
    default: { label: 'Not yet allowed', icon: Bell, tone: 'neutral' },
    denied: { label: 'Blocked', icon: BellOff, tone: 'warning' },
    unsupported: { label: 'Not supported', icon: BellOff, tone: 'neutral' },
  };
  const P = PERM[perm];

  return (
    <Card>
      <CardHeader
        title="Reminder notifications"
        description={parseReminder(reminder) !== null ? `A reminder fires at ${reminder} while this app is open, unless today's goal is already met.` : 'Set a reminder time above to get a daily nudge.'}
        action={
          <Badge tone={P.tone} data-testid="permission-state">
            <P.icon className="size-3" /> {P.label}
          </Badge>
        }
      />
      <CardBody className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {!supported ? (
          <p className="text-sm text-muted">This browser doesn't support notifications. Your goals and streaks still work.</p>
        ) : (
          <>
            {perm !== 'granted' && (
              <Button variant="secondary" onClick={enable} disabled={asking || perm === 'denied'}>
                {asking ? <Loader2 className="animate-spin" /> : <Bell />} Enable notifications
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={perm !== 'granted'}
              onClick={() => {
                if (showNotification('Test notification', progressText(today, goal))) toast.success('Test notification sent');
              }}
            >
              <Send /> Send test notification
            </Button>
            {perm === 'denied' && <p className="text-sm text-muted">Notifications are blocked. Allow them for this site in your browser's site settings.</p>}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function GoalEditor({ settings, disabled }: { settings: Settings | undefined; disabled: boolean }) {
  const qc = useQueryClient();
  const [daily, setDaily] = useState('');
  const [weekly, setWeekly] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [reminder, setReminder] = useState('');

  useEffect(() => {
    if (!settings) return;
    setDaily(String(settings.dailyGoal));
    setWeekly(String(settings.weeklyGoal));
    setDays(settings.studyDays);
    setReminder(settings.sessionReminder);
  }, [settings]);

  const d = Number(daily);
  const w = Number(weekly);
  const valid = Number.isInteger(d) && d >= 1 && d <= 100 && Number.isInteger(w) && w >= 1 && w <= 700 && (reminder === '' || parseReminder(reminder) !== null);
  const sameDays = (a: number[], b: number[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
  const dirty = !!settings && (d !== settings.dailyGoal || w !== settings.weeklyGoal || reminder !== settings.sessionReminder || !sameDays(days, settings.studyDays));

  const save = useMutation({
    mutationFn: () => api.saveSettings({ dailyGoal: d, weeklyGoal: w, sessionReminder: reminder, studyDays: days }),
    onSuccess: (s) => {
      qc.setQueryData(['settings'], s);
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Goals saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader title="Targets" description={disabled ? 'Editing needs the backend. Start it to change your goals.' : 'Questions answered count toward both goals.'} />
      <CardBody>
        <form
          className="grid grid-cols-1 gap-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && dirty) save.mutate();
          }}
        >
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="goal-daily" hint="1–100 per day">
              Daily goal
            </Label>
            <Input id="goal-daily" type="number" min={1} max={100} value={daily} disabled={disabled} onChange={(e) => setDaily(e.target.value)} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="goal-weekly" hint="1–700 per week">
              Weekly goal
            </Label>
            <Input id="goal-weekly" type="number" min={1} max={700} value={weekly} disabled={disabled} onChange={(e) => setWeekly(e.target.value)} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="goal-reminder" hint="Empty disables it">
              Reminder time
            </Label>
            <Input id="goal-reminder" type="time" value={reminder} disabled={disabled} onChange={(e) => setReminder(e.target.value)} />
          </div>
          <div className="min-w-0 space-y-1.5 sm:col-span-3">
            <Label hint="The days you plan to study. Used for your schedule and reminders.">Study days</Label>
            <div role="group" aria-label="Study days" className="flex flex-wrap gap-1.5">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((lbl, i) => {
                const on = days.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={on}
                    disabled={disabled}
                    onClick={() => setDays((xs) => (xs.includes(i) ? xs.filter((x) => x !== i) : [...xs, i]))}
                    className={cn('h-9 w-12 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50', on ? 'border-accent bg-accent text-accent-fg' : 'border-border bg-surface text-muted hover:text-text')}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
            <Button type="submit" disabled={disabled || !dirty || !valid || save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save goals
            </Button>
            {dirty && !disabled && (
              <Button type="button" variant="ghost" onClick={() => settings && (setDaily(String(settings.dailyGoal)), setWeekly(String(settings.weeklyGoal)), setReminder(settings.sessionReminder), setDays(settings.studyDays))}>
                Discard
              </Button>
            )}
            {!valid && <span className="text-sm text-danger">Check the values: goals must be whole numbers in range.</span>}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function GoalsPage() {
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: api.settings, retry: false });
  const q = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, retry: false });

  const data: DashboardDTO | undefined = q.data;

  const dailyGoal = settingsQ.data?.dailyGoal ?? data?.stats.dailyGoal ?? 10;
  const weeklyGoal = settingsQ.data?.weeklyGoal ?? data?.stats.weeklyGoal ?? 50;
  const today = dayKey(new Date());

  const week = useMemo(() => (data ? data.activity.slice(-7) : []), [data]);
  const missed = useMemo(() => (data ? missedDays(data.activity, dailyGoal, today) : []), [data, dailyGoal, today]);

  const header = (
    <PageHeader
      title="Goals"
      description="Daily and weekly targets, streaks and reminders. Consistency beats volume."
    />
  );

  if (q.isError) return <LoadError error={q.error} onRetry={() => void q.refetch()} />;

  if (!data) {
    return (
      <>
        {header}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      </>
    );
  }

  const s = data.stats;

  return (
    <>
      {header}
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <RingCard title="Today" value={s.today} goal={dailyGoal} sub="Questions answered today." />
          <RingCard title="This week" value={s.week} goal={weeklyGoal} sub="Questions answered this week." />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="min-w-0 p-5">
            <div className="flex items-center gap-2 text-sm text-muted">
              <Flame className="size-4" /> Current streak
            </div>
            <div className="mt-2 text-3xl font-semibold tabular-nums">
              {s.streak} <span className="text-base font-normal text-muted">{s.streak === 1 ? 'day' : 'days'}</span>
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm text-muted">
              <Trophy className="size-4" /> Longest: <span className="font-medium text-text tabular-nums">{s.longestStreak} days</span>
            </div>
          </Card>

          <Card className="min-w-0 lg:col-span-2">
            <CardHeader title="Last 7 days" description={`Daily goal: ${dailyGoal} questions`} />
            <CardBody>
              <ul className="grid grid-cols-7 gap-1.5 sm:gap-2" aria-label="Last 7 days">
                {week.map((d) => {
                  const isToday = d.day === today;
                  const met = d.questions >= dailyGoal;
                  const state = met ? 'Met' : isToday ? 'Today' : 'Missed';
                  const Icon = met ? CheckCircle2 : isToday ? Circle : XCircle;
                  return (
                    <li
                      key={d.day}
                      title={`${longDay(d.day)}: ${d.questions} questions · ${state}`}
                      className={cn('flex min-w-0 flex-col items-center gap-1 rounded-lg border p-1.5 text-center sm:p-2', met ? 'border-accent/40 bg-accent-soft/50' : 'border-border')}
                    >
                      <span className="text-[11px] text-faint">{weekdayShort(d.day)}</span>
                      <Icon className={cn('size-5', met ? 'text-accent' : 'text-faint')} aria-hidden />
                      <span className={cn('text-[11px] font-medium', met ? 'text-accent' : 'text-muted')}>{state}</span>
                      <span className="text-[11px] tabular-nums text-faint">{d.questions}</span>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <CalendarX className="size-4 text-muted" /> Missed days
              </span>
            }
            description={`${missed.length} of the last 14 days fell short of the daily goal (since your first activity).`}
          />
          <CardBody>
            {missed.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {missed.map((d) => (
                  <li key={d.day}>
                    <Badge>
                      <XCircle className="size-3" /> {longDay(d.day)} · {d.questions}/{dailyGoal}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No missed days. Keep it going.</p>
            )}
          </CardBody>
        </Card>

        <ActivityHeatmap activity={data.activity} dailyGoal={dailyGoal} />

        <GoalEditor settings={settingsQ.data} disabled={!settingsQ.data} />
        <NotificationsCard reminder={settingsQ.data?.sessionReminder ?? ''} today={s.today} goal={dailyGoal} />
      </div>
    </>
  );
}

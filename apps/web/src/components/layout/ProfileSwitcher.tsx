import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { ProfileDTO } from '@psc/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Everything that depends on the active profile's data must refetch on switch. */
function useResetOnSwitch() {
  const qc = useQueryClient();
  return () =>
    qc.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey[0];
        return k !== 'ai-status' && k !== 'ai-models';
      },
    });
}

function NameDialog({
  open,
  onOpenChange,
  title,
  initial,
  submitLabel,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  initial?: string;
  submitLabel: string;
  busy: boolean;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initial ?? '');
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) setName(initial ?? '');
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-2xl outline-none">
          <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) onSubmit(name.trim());
            }}
          >
            <Input autoFocus value={name} maxLength={60} placeholder="e.g. Kelcy" onChange={(e) => setName(e.target.value)} className="mt-4" aria-label="Profile name" />
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy && <Loader2 className="animate-spin" />} {submitLabel}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ProfileSwitcher({ collapsed }: { collapsed: boolean }) {
  const qc = useQueryClient();
  const reset = useResetOnSwitch();
  const q = useQuery({ queryKey: ['profiles'], queryFn: api.profiles, retry: false });
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<ProfileDTO | null>(null);

  const refreshProfiles = () => qc.invalidateQueries({ queryKey: ['profiles'] });

  const activate = useMutation({
    mutationFn: (id: string) => api.activateProfile(id),
    onSuccess: (p) => {
      refreshProfiles();
      reset();
      toast.success(`Switched to ${p.name}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const create = useMutation({
    mutationFn: (name: string) => api.createProfile(name),
    onSuccess: (p) => {
      setCreating(false);
      refreshProfiles();
      reset();
      toast.success(`Created and switched to ${p.name}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.renameProfile(id, name),
    onSuccess: () => {
      setRenaming(null);
      refreshProfiles();
      toast.success('Profile renamed');
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteProfile(id),
    onSuccess: () => {
      refreshProfiles();
      reset();
      toast.success('Profile deleted');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const profiles = q.data?.profiles ?? [];
  const active = profiles.find((p) => p.active);

  return (
    <div className="border-t border-border p-3">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            className={cn(
              'flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left hover:bg-surface-2',
              collapsed && 'justify-center px-0',
            )}
            aria-label="Switch profile"
            title={active ? `Profile: ${active.name}` : 'Profiles'}
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
              <UserRound className="size-4" />
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] text-faint">Profile</span>
                  <span className="block truncate text-sm font-medium">{active?.name ?? '…'}</span>
                </span>
                <ChevronsUpDown className="size-4 shrink-0 text-faint" />
              </>
            )}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            side="top"
            sideOffset={8}
            className="z-50 w-60 rounded-xl border border-border bg-surface p-1.5 shadow-xl"
          >
            <DropdownMenu.Label className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">Profiles</DropdownMenu.Label>
            {profiles.map((p) => (
              <div key={p.id} className="group flex items-center gap-1">
                <DropdownMenu.Item
                  disabled={activate.isPending}
                  onSelect={() => !p.active && activate.mutate(p.id)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-2"
                >
                  <Check className={cn('size-4 shrink-0', p.active ? 'text-accent' : 'opacity-0')} />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                </DropdownMenu.Item>
                <button
                  className="grid size-7 shrink-0 place-items-center rounded-md text-faint opacity-0 hover:bg-surface-2 hover:text-text group-hover:opacity-100"
                  aria-label={`Rename ${p.name}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setRenaming(p);
                  }}
                >
                  <Pencil className="size-3.5" />
                </button>
                {profiles.length > 1 && (
                  <button
                    className="grid size-7 shrink-0 place-items-center rounded-md text-faint opacity-0 hover:bg-surface-2 hover:text-danger group-hover:opacity-100"
                    aria-label={`Delete ${p.name}`}
                    onClick={(e) => {
                      e.preventDefault();
                      if (confirm(`Delete profile "${p.name}" and all its progress? This cannot be undone.`)) remove.mutate(p.id);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
            <DropdownMenu.Separator className="my-1.5 h-px bg-border" />
            <DropdownMenu.Item
              onSelect={(e) => {
                e.preventDefault();
                setCreating(true);
              }}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-2"
            >
              <Plus className="size-4" /> New profile…
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <NameDialog open={creating} onOpenChange={setCreating} title="New profile" submitLabel="Create" busy={create.isPending} onSubmit={(name) => create.mutate(name)} />
      <NameDialog
        open={!!renaming}
        onOpenChange={(o) => !o && setRenaming(null)}
        title="Rename profile"
        initial={renaming?.name}
        submitLabel="Save"
        busy={rename.isPending}
        onSubmit={(name) => renaming && rename.mutate({ id: renaming.id, name })}
      />
    </div>
  );
}

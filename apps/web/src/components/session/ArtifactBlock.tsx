import { Check, Copy, FileCode2, Globe, ScrollText, Settings2, SquareTerminal, Waypoints, Network, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import type { Artifact } from '@psc/shared';
import { cn } from '@/lib/utils';

const KIND: Record<Artifact['kind'], { label: string; icon: LucideIcon }> = {
  code: { label: 'Code', icon: FileCode2 },
  config: { label: 'Config', icon: Settings2 },
  terminal: { label: 'Terminal', icon: SquareTerminal },
  http: { label: 'HTTP', icon: Globe },
  dns: { label: 'DNS', icon: Network },
  log: { label: 'Log', icon: ScrollText },
  packet: { label: 'Packet capture', icon: Waypoints },
};

function CopyButton({ text, dark }: { text: string; dark?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium',
        dark ? 'text-zinc-400 hover:bg-white/10 hover:text-zinc-100' : 'text-muted hover:bg-surface hover:text-text',
      )}
      aria-label={copied ? 'Copied' : 'Copy to clipboard'}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/** Renders a question artifact as plain, whitespace-preserving text. Never interprets HTML. */
export function ArtifactBlock({ artifact }: { artifact: Artifact }) {
  const k = KIND[artifact.kind] ?? KIND.log;
  const Icon = k.icon;

  if (artifact.kind === 'terminal') {
    // Always dark, in both themes: fixed zinc palette rather than theme tokens.
    return (
      <figure className="min-w-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-card" data-artifact="terminal">
        <figcaption className="flex items-center gap-2 border-b border-zinc-800 px-3 py-1.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-zinc-700" />
            <span className="size-2.5 rounded-full bg-zinc-700" />
            <span className="size-2.5 rounded-full bg-zinc-700" />
          </span>
          <span className="ml-1 flex min-w-0 items-center gap-1.5 truncate text-xs text-zinc-400">
            <Icon className="size-3.5 shrink-0" /> {artifact.title || k.label}
          </span>
          <span className="ml-auto">
            <CopyButton text={artifact.content} dark />
          </span>
        </figcaption>
        <pre className="overflow-x-auto p-3 font-mono text-[13px] leading-relaxed whitespace-pre text-zinc-100">{artifact.content}</pre>
      </figure>
    );
  }

  const isSource = artifact.kind === 'code' || artifact.kind === 'config';
  return (
    <figure className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface-2" data-artifact={artifact.kind}>
      <figcaption className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted">
        <Icon className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate font-medium text-text">{isSource ? artifact.title || k.label : k.label}</span>
        {isSource && artifact.language && <span className="rounded border border-border px-1.5 font-mono text-[11px] text-faint">{artifact.language}</span>}
        {!isSource && artifact.title && <span className="min-w-0 truncate text-faint">{artifact.title}</span>}
        <span className="ml-auto">
          <CopyButton text={artifact.content} />
        </span>
      </figcaption>
      <pre className="overflow-x-auto p-3 font-mono text-[13px] leading-relaxed whitespace-pre text-text">{artifact.content}</pre>
    </figure>
  );
}

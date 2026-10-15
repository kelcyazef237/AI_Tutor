import {
  ChevronLeft,
  ChevronRight,
  Info,
  Maximize2,
  MessageSquare,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Wind,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CANVAS_W, EDGE_KIND_LABEL, layout, truncate, type DiagramEdge, type DiagramLayoutOverrides, type DiagramSpec } from '@psc/shared';
import { Markdown } from '@/components/Markdown';
import { Button } from '@/components/ui/button';
import { diagramIcon } from '@/lib/diagramIcons';
import { cn } from '@/lib/utils';
import { ExplainDialog, type ExplainTarget } from './ExplainDialog';
import { usePanZoom } from './usePanZoom';
import './diagram.css';

/** ms each step stays on screen while auto-playing. */
const STEP_MS = 3400;

export type DiagramSelection = { kind: 'node' | 'edge' | 'zone'; id: string } | null;

export interface DiagramCanvasProps {
  spec: DiagramSpec;
  className?: string;
  /** Show the edit toggle (drag positions, click to select labels). */
  editable?: boolean;
  editing?: boolean;
  onToggleEdit?: (editing: boolean) => void;
  /** Dragged positions (canvas units). Missing = automatic layout. */
  overrides?: DiagramLayoutOverrides;
  onMoveLayout?: (layout: DiagramLayoutOverrides) => void;
  onResetLayout?: () => void;
  selection?: DiagramSelection;
  onSelect?: (selection: DiagramSelection) => void;
  /** Ask the AI for a plain-language explanation of one element (tap-a-label popup). */
  onExplainRequest?: (target: ExplainTarget) => Promise<string | null>;
  /** Open the saved per-diagram chat (optionally focused on an element). */
  onAsk?: (target: ExplainTarget | null) => void;
}

const EMPTY_OVERRIDES: DiagramLayoutOverrides = { nodes: {}, zones: {} };

function markerFor(kind: DiagramEdge['kind'], on: boolean): string {
  if (kind === 'untrusted') return 'url(#dg-arr-warn)';
  if (kind === 'danger') return 'url(#dg-arr-danger)';
  if (kind === 'signed') return 'url(#dg-arr-ok)';
  return on ? 'url(#dg-arr-live)' : 'url(#dg-arr)';
}

const snap4 = (v: number) => Math.round(v / 4) * 4;

type ZoneHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const ZONE_HANDLES: ZoneHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const MIN_ZONE_W = 80;
const MIN_ZONE_H = 60;

function handlePoint(r: { x: number; y: number; w: number; h: number }, h: ZoneHandle) {
  const x = h.includes('w') ? r.x : h.includes('e') ? r.x + r.w : r.x + r.w / 2;
  const y = h.includes('n') ? r.y : h.includes('s') ? r.y + r.h : r.y + r.h / 2;
  return { x, y };
}

function handleCursor(h: ZoneHandle): string {
  if (h === 'nw' || h === 'se') return 'nwse-resize';
  if (h === 'ne' || h === 'sw') return 'nesw-resize';
  if (h === 'n' || h === 's') return 'ns-resize';
  return 'ew-resize';
}

interface MoveDrag {
  kind: 'move';
  target: 'node' | 'zone';
  id: string;
  startClientX: number;
  startClientY: number;
  baseX: number;
  baseY: number;
  pos: { x: number; y: number };
  moved: boolean;
}

interface ResizeDrag {
  kind: 'resize';
  id: string;
  handle: ZoneHandle;
  startClientX: number;
  startClientY: number;
  base: { x: number; y: number; w: number; h: number };
  rect: { x: number; y: number; w: number; h: number };
  moved: boolean;
}

type DragState = MoveDrag | ResizeDrag | null;

export function DiagramCanvas({
  spec,
  className,
  editable = false,
  editing = false,
  onToggleEdit,
  overrides = EMPTY_OVERRIDES,
  onMoveLayout,
  onResetLayout,
  selection = null,
  onSelect,
  onExplainRequest,
  onAsk,
}: DiagramCanvasProps) {
  const total = spec.steps.length;
  const [step, setStep] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [motion, setMotion] = useState(() => (typeof window === 'undefined' ? true : !window.matchMedia('(prefers-reduced-motion: reduce)').matches));
  const [trace, setTrace] = useState<string | null>(null);
  const [explainMode, setExplainMode] = useState(true);
  const [info, setInfo] = useState<ExplainTarget | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  // Live layout: an in-flight drag overrides the saved positions.
  const effective = useMemo<DiagramLayoutOverrides>(() => {
    if (!drag?.moved) return overrides;
    if (drag.kind === 'resize') return { nodes: overrides.nodes, zones: { ...overrides.zones, [drag.id]: drag.rect } };
    if (drag.target === 'node') return { nodes: { ...overrides.nodes, [drag.id]: drag.pos }, zones: overrides.zones };
    return { nodes: overrides.nodes, zones: { ...overrides.zones, [drag.id]: { ...overrides.zones[drag.id], ...drag.pos } } };
  }, [overrides, drag]);
  const lay = useMemo(() => layout(spec, effective), [spec, effective]);
  const pz = usePanZoom(lay.width, lay.height);

  // Clamp when a refine changes the step count under us.
  useEffect(() => {
    setStep((s) => Math.min(Math.max(1, s), total));
  }, [total]);

  // Auto-play through the steps.
  useEffect(() => {
    if (!playing) return;
    if (step >= total) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStep((s) => Math.min(total, s + 1)), STEP_MS);
    return () => clearTimeout(t);
  }, [playing, step, total]);

  // Packet motion: pause the whole SMIL clock when motion is off, the tab
  // is hidden, or the user prefers reduced motion. (jsdom lacks this API.)
  useEffect(() => {
    const svg: SVGSVGElement | null = svgRef.current;
    if (!svg) return;
    const update = () => {
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      if (motion && !hidden) svg.unpauseAnimations?.();
      else svg.pauseAnimations?.();
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [motion]);

  const toggleFullscreen = useCallback(() => {
    const el = frameRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }, []);

  /* ── drag-to-move / drag-to-resize ────────────────────────── */

  const beginMove = useCallback(
    (e: React.PointerEvent, target: 'node' | 'zone', id: string, baseX: number, baseY: number) => {
      if (!editing) return;
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      setTrace(null);
      onSelect?.({ kind: target, id });
      setDrag({ kind: 'move', target, id, startClientX: e.clientX, startClientY: e.clientY, baseX, baseY, pos: { x: baseX, y: baseY }, moved: false });
    },
    [editing, onSelect],
  );

  const beginResize = useCallback(
    (e: React.PointerEvent, id: string, handle: ZoneHandle, base: { x: number; y: number; w: number; h: number }) => {
      if (!editing) return;
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      setTrace(null);
      setDrag({ kind: 'resize', id, handle, startClientX: e.clientX, startClientY: e.clientY, base, rect: base, moved: false });
    },
    [editing],
  );

  const moveDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!drag) return;
      const r = pz.containerRef.current?.getBoundingClientRect();
      if (!r || r.width <= 0 || r.height <= 0) return;
      const dx = (e.clientX - drag.startClientX) * (pz.vb.w / r.width);
      const dy = (e.clientY - drag.startClientY) * (pz.vb.h / r.height);
      const moved = drag.moved || Math.abs(e.clientX - drag.startClientX) + Math.abs(e.clientY - drag.startClientY) > 3;

      if (drag.kind === 'move') {
        setDrag({ ...drag, moved, pos: { x: snap4(drag.baseX + dx), y: snap4(drag.baseY + dy) } });
        return;
      }

      const b = drag.base;
      let x = b.x;
      let y = b.y;
      let w = b.w;
      let h = b.h;
      if (drag.handle.includes('w')) {
        x = snap4(b.x + dx);
        w = b.w - (x - b.x);
      }
      if (drag.handle.includes('e')) w = snap4(b.w + dx);
      if (drag.handle.includes('n')) {
        y = snap4(b.y + dy);
        h = b.h - (y - b.y);
      }
      if (drag.handle.includes('s')) h = snap4(b.h + dy);
      // Minimum size keeps the opposite edge fixed.
      if (w < MIN_ZONE_W) {
        if (drag.handle.includes('w')) x = b.x + b.w - MIN_ZONE_W;
        w = MIN_ZONE_W;
      }
      if (h < MIN_ZONE_H) {
        if (drag.handle.includes('n')) y = b.y + b.h - MIN_ZONE_H;
        h = MIN_ZONE_H;
      }
      // Keep the frame inside the canvas horizontally.
      if (x < 4) {
        w -= 4 - x;
        x = 4;
      }
      if (x + w > CANVAS_W - 4) w = CANVAS_W - 4 - x;
      setDrag({ ...drag, moved, rect: { x, y, w, h } });
    },
    [drag, pz.vb.w, pz.vb.h],
  );

  const endDrag = useCallback(() => {
    if (!drag) return;
    if (drag.moved) {
      if (drag.kind === 'resize') {
        onMoveLayout?.({ nodes: overrides.nodes, zones: { ...overrides.zones, [drag.id]: drag.rect } });
      } else if (drag.target === 'node') {
        onMoveLayout?.({ nodes: { ...overrides.nodes, [drag.id]: drag.pos }, zones: overrides.zones });
      } else {
        onMoveLayout?.({ nodes: overrides.nodes, zones: { ...overrides.zones, [drag.id]: { ...overrides.zones[drag.id], ...drag.pos } } });
      }
    }
    setDrag(null);
  }, [drag, overrides, onMoveLayout]);

  const current = spec.steps[step - 1];

  // Legend derives from what the spec actually uses.
  const legend = useMemo(() => {
    if (spec.legend?.length) return spec.legend.map((l) => ({ kind: l.kind as string, label: l.label }));
    const out: { kind: string; label: string }[] = [];
    const kinds = new Set(spec.edges.map((e) => e.kind));
    for (const k of ['flow', 'untrusted', 'signed', 'stream', 'optional', 'danger'] as const) {
      if (kinds.has(k)) out.push({ kind: k, label: EDGE_KIND_LABEL[k] });
    }
    if (spec.edges.some((e) => e.packets > 0)) out.push({ kind: 'packet', label: 'data in motion' });
    const tones = new Set(spec.zones.map((z) => z.tone));
    if (tones.has('brand')) out.push({ kind: 'zone', label: 'trusted zone' });
    if (tones.has('warn')) out.push({ kind: 'zone-warn', label: 'untrusted segment' });
    if (tones.has('plain')) out.push({ kind: 'zone-plain', label: 'boundary' });
    return out;
  }, [spec]);

  const hasOverrides = Object.keys(overrides.nodes).length > 0 || Object.keys(overrides.zones).length > 0;
  const explaining = explainMode && !editing;

  return (
    <div className={cn('dg', className, editing && 'dg-editing', explaining && 'dg-explaining', drag?.moved && 'dg-dragging')}>
      <div ref={frameRef} className="dg-frame">
        {/* Canvas */}
        <div
          ref={pz.containerRef}
          className="dg-canvas relative h-[52vh] min-h-[320px] w-full touch-none overflow-hidden rounded-xl border border-border bg-surface-2/40 lg:h-[600px]"
        >
          <svg
            ref={svgRef}
            className={cn('dg-svg', editing ? 'cursor-default' : 'cursor-grab active:cursor-grabbing')}
            viewBox={`${pz.vb.x} ${pz.vb.y} ${pz.vb.w} ${pz.vb.h}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={spec.alt}
            {...pz.handlers}
          >
            <defs>
              <marker id="dg-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" className="dg-arrhead" />
              </marker>
              <marker id="dg-arr-warn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" className="dg-arrhead dg-a-warn" />
              </marker>
              <marker id="dg-arr-danger" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" className="dg-arrhead dg-a-danger" />
              </marker>
              <marker id="dg-arr-ok" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" className="dg-arrhead dg-a-ok" />
              </marker>
              <marker id="dg-arr-live" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" className="dg-arrhead dg-a-live" />
              </marker>
            </defs>

            {/* Zones */}
            {lay.zones.map((z) => {
              const selected = selection?.kind === 'zone' && selection.id === z.spec.id;
              const scale = pz.vb.w / CANVAS_W;
              const hs = Math.min(26, Math.max(10, 10 / scale));
              const hit = hs + Math.max(8, 12 / scale);
              return (
                <g
                  key={z.spec.id}
                  className={cn(
                    'dg-zone',
                    z.spec.tone === 'plain' && 'dg-plain',
                    z.spec.tone === 'warn' && 'dg-warn',
                    editing && 'dg-draggable',
                    selected && 'dg-selected',
                  )}
                  onPointerDown={(e) => beginMove(e, 'zone', z.spec.id, z.x, z.y)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={14} />
                  {z.spec.label && (
                    <text className="dg-zone-label" x={z.x + 16} y={z.y + 23}>
                      {z.spec.label}
                    </text>
                  )}
                  {z.spec.sub && (
                    <text className="dg-zone-sub" x={z.x + 16} y={z.y + (z.spec.label ? 38 : 26)}>
                      {truncate(z.spec.sub, z.w - 34, 5.4)}
                    </text>
                  )}
                  {editing &&
                    selected &&
                    ZONE_HANDLES.map((h) => {
                      const p = handlePoint(z, h);
                      return (
                        <g key={h} onPointerDown={(e) => beginResize(e, z.spec.id, h, { x: z.x, y: z.y, w: z.w, h: z.h })}>
                          <rect className="dg-handle-hit" x={p.x - hit / 2} y={p.y - hit / 2} width={hit} height={hit} style={{ cursor: handleCursor(h) }} />
                          <rect className="dg-handle" data-h={h} x={p.x - hs / 2} y={p.y - hs / 2} width={hs} height={hs} rx={2} />
                        </g>
                      );
                    })}
                </g>
              );
            })}

            {/* Notes */}
            {lay.notes.map((nt, i) => (
              <text
                key={`n-${nt.zone}-${i}`}
                data-step={nt.step ?? 1}
                className={cn('dg-note', nt.style === 'mono' && 'dg-mono', nt.style === 'strong' && 'dg-strong', (nt.step ?? 1) > step && 'dg-pending')}
                x={nt.x}
                y={nt.y}
              >
                {nt.text}
              </text>
            ))}

            {/* Edges */}
            {lay.edges.map((le) => {
              const e = le.spec;
              const on = e.step <= step;
              const lit = trace !== null && (e.from === trace || e.to === trace);
              const dim = trace !== null && !lit;
              const selected = selection?.kind === 'edge' && selection.id === e.id;
              const labelW = e.label ? e.label.length * 6.35 + 14 : 0;
              const onClickEdge = (ev: React.PointerEvent | React.MouseEvent) => {
                if (editing) {
                  ev.stopPropagation();
                  onSelect?.({ kind: 'edge', id: e.id });
                } else if (explainMode) {
                  ev.stopPropagation();
                  setInfo({ kind: 'edge', id: e.id });
                }
              };
              return (
                <g
                  key={e.id}
                  data-step={e.step}
                  className={cn('dg-edge', `dg-${e.kind}`, !on && 'dg-pending', on && 'dg-on', lit && 'dg-lit', dim && 'dg-dim', selected && 'dg-selected')}
                >
                  <path id={`dg-p-${e.id}`} d={le.d} className="dg-wire" markerEnd={markerFor(e.kind, on)} />
                  <path d={le.d} className="dg-wire-glow" />
                  {(editing || explainMode) && <path d={le.d} className="dg-hit" onPointerDown={onClickEdge} onClick={onClickEdge} />}
                  {on &&
                    e.packets > 0 &&
                    Array.from({ length: e.packets }).map((_, i) => (
                      <circle key={`${i}:${le.d}`} r={4} className="dg-pkt">
                        <animateMotion dur={`${e.dur}s`} begin={`${(-(i * e.dur) / e.packets).toFixed(2)}s`} repeatCount="indefinite">
                          <mpath href={`#dg-p-${e.id}`} />
                        </animateMotion>
                      </circle>
                    ))}
                  {e.label && (
                    <g onPointerDown={onClickEdge} onClick={onClickEdge} className={cn((editing || explaining) && 'dg-label-hit')}>
                      <rect className="dg-label-bg" x={le.label.x - labelW / 2} y={le.label.y - 8.5} width={labelW} height={17} rx={5} />
                      <text className={cn('dg-label', e.kind === 'signed' && 'dg-ok', e.kind === 'untrusted' && 'dg-warn')} x={le.label.x} y={le.label.y + 3.5} textAnchor="middle">
                        {e.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {spec.nodes.map((n) => {
              const r = lay.nodes.get(n.id);
              if (!r) return null;
              const Icon = diagramIcon(n.icon);
              const on = n.step <= step;
              const lit = trace === n.id;
              const selected = selection?.kind === 'node' && selection.id === n.id;
              const tx = r.x + (n.icon ? 52 : 14);
              const avail = r.w - (tx - r.x) - 12;
              const title = truncate(n.title, avail, 7.15);
              const sub = n.sub ? truncate(n.sub, avail, 5.35) : '';
              let tagX = r.x + 14;
              const tagY = r.y + r.h - 22;
              return (
                <g
                  key={n.id}
                  data-step={n.step}
                  className={cn(
                    'dg-node',
                    n.tone === 'brand' && 'dg-brand',
                    n.tone === 'warn' && 'dg-warn',
                    !on && 'dg-pending',
                    lit && 'dg-lit',
                    editing && 'dg-draggable',
                    selected && 'dg-selected',
                  )}
                  tabIndex={editing ? -1 : 0}
                  role={editing ? undefined : 'button'}
                  aria-label={`${n.title}${n.sub ? ` — ${n.sub}` : ''}`}
                  onPointerDown={(e) => beginMove(e, 'node', n.id, r.x, r.y)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onClick={() => {
                    if (editing) onSelect?.({ kind: 'node', id: n.id });
                    else if (explainMode) setInfo({ kind: 'node', id: n.id });
                    else setTrace((t) => (t === n.id ? null : n.id));
                  }}
                  onMouseEnter={() => !editing && setTrace(n.id)}
                  onMouseLeave={() => !editing && setTrace(null)}
                  onFocus={() => !editing && setTrace(n.id)}
                  onBlur={() => !editing && setTrace(null)}
                >
                  <rect className="dg-card" x={r.x} y={r.y} width={r.w} height={r.h} rx={10} />
                  {n.icon && (
                    <>
                      <rect className="dg-icbg" x={r.x + 12} y={r.y + 12} width={30} height={30} rx={8} />
                      <Icon className="dg-ic" x={r.x + 18} y={r.y + 18} width={18} height={18} strokeWidth={1.8} />
                    </>
                  )}
                  <text className="dg-title" x={tx} y={r.y + 25}>
                    {title}
                  </text>
                  {sub && (
                    <text className="dg-sub" x={tx} y={r.y + 41}>
                      {sub}
                    </text>
                  )}
                  {n.tags.map((t) => {
                    const w = t.length * 6.35 + 14;
                    const el = (
                      <g key={t}>
                        <rect className="dg-tag" x={tagX} y={tagY} width={w} height={17} rx={5} />
                        <text className="dg-tag-text" x={tagX + 7} y={tagY + 12}>
                          {t}
                        </text>
                      </g>
                    );
                    tagX += w + 6;
                    return el;
                  })}
                </g>
              );
            })}
          </svg>

          {/* Canvas overlay: zoom + edit + present */}
          <div className="absolute right-2 top-2 flex items-center gap-1">
            {editable && (
              <>
                {editing && hasOverrides && (
                  <Button variant="secondary" size="icon" className="size-8 bg-surface/90 backdrop-blur" onClick={onResetLayout} aria-label="Reset positions" title="Reset all positions">
                    <RotateCcw className="size-3.5" />
                  </Button>
                )}
                <Button
                  variant={editing ? 'primary' : 'secondary'}
                  size="icon"
                  className={cn('size-8 backdrop-blur', !editing && 'bg-surface/90')}
                  onClick={() => {
                    onToggleEdit?.(!editing);
                    if (editing) onSelect?.(null);
                  }}
                  aria-label={editing ? 'Done editing' : 'Edit diagram'}
                  title={editing ? 'Done editing' : 'Edit: drag components, change labels'}
                >
                  <Pencil className="size-3.5" />
                </Button>
              </>
            )}
            <Button variant="secondary" size="icon" className="size-8 bg-surface/90 backdrop-blur" onClick={() => pz.zoomBy(0.8)} aria-label="Zoom in">
              <Plus className="size-3.5" />
            </Button>
            <Button variant="secondary" size="icon" className="size-8 bg-surface/90 backdrop-blur" onClick={() => pz.zoomBy(1.25)} aria-label="Zoom out">
              <Minus className="size-3.5" />
            </Button>
            <Button variant="secondary" size="icon" className="size-8 bg-surface/90 backdrop-blur" onClick={() => pz.fit()} aria-label="Fit to view">
              <Maximize2 className="size-3.5" />
            </Button>
            <Button variant="secondary" size="icon" className="hidden size-8 bg-surface/90 backdrop-blur lg:inline-flex" onClick={toggleFullscreen} aria-label="Present fullscreen">
              <Play className="size-3.5" />
            </Button>
          </div>
          <div className="pointer-events-none absolute bottom-2 left-2 hidden text-[10px] text-faint sm:block">
            {editing ? 'drag components to move · drag a selected frame’s handles to resize · click a component or label to edit it' : 'drag to pan · pinch / scroll to zoom · hover a component to trace it'}
          </div>
        </div>

        {/* Controls + caption */}
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-start">
          <div className="flex shrink-0 items-center gap-1.5">
            <Button variant="secondary" size="icon" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step <= 1} aria-label="Previous step">
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="secondary" size="sm" className="w-16" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              {playing ? 'Pause' : 'Play'}
            </Button>
            <Button variant="secondary" size="icon" onClick={() => setStep((s) => Math.min(total, s + 1))} disabled={step >= total} aria-label="Next step">
              <ChevronRight className="size-4" />
            </Button>
            <div className="ml-1 flex items-center gap-1" role="group" aria-label="Steps">
              {spec.steps.map((s, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setPlaying(false);
                    setStep(i + 1);
                  }}
                  aria-pressed={step === i + 1}
                  aria-label={`Step ${i + 1}`}
                  className={cn(
                    'grid size-7 place-items-center rounded-full font-mono text-[11px] transition-colors',
                    step === i + 1 ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:bg-accent-soft hover:text-accent',
                  )}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => {
                  setPlaying(false);
                  setStep(total);
                }}
                className="ml-1 h-7 rounded-full px-2.5 text-xs font-medium text-muted hover:bg-surface-2 hover:text-text"
              >
                All
              </button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className={cn('ml-1', motion && 'text-accent')}
              onClick={() => setMotion((m) => !m)}
              aria-label={motion ? 'Pause packet motion' : 'Resume packet motion'}
              title={motion ? 'Packet motion on' : 'Packet motion off'}
            >
              <Wind className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn('ml-0.5', explainMode && 'text-accent')}
              onClick={() => {
                setExplainMode((m) => !m);
                setInfo(null);
              }}
              aria-label={explainMode ? 'Explain mode on' : 'Explain mode off'}
              title="Explain mode: click any component or link for a plain-language explanation"
            >
              <Info className="size-4" />
            </Button>
            {onAsk && (
              <Button variant="ghost" size="icon" className="ml-0.5" onClick={() => onAsk(null)} aria-label="Ask about this diagram" title="Chat about this diagram — goes deeper than the labels">
                <MessageSquare className="size-4" />
              </Button>
            )}
          </div>
          <div className="min-w-0 flex-1 lg:border-l lg:border-border lg:pl-4" aria-live="polite">
            <div className="text-sm font-semibold">
              <span className="mr-1.5 font-mono text-xs text-faint">
                {step}/{total}
              </span>
              {current?.title}
            </div>
            {current?.caption && (
              <div className="mt-1 text-sm text-muted [&_p]:leading-relaxed">
                <Markdown>{current.caption}</Markdown>
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        {legend.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border pt-3 text-[11.5px] text-muted">
            {legend.map((l) => (
              <span key={`${l.kind}-${l.label}`} className="inline-flex items-center gap-1.5">
                <LegendSwatch kind={l.kind} />
                {l.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <ExplainDialog spec={spec} target={info} onClose={() => setInfo(null)} onExplain={onExplainRequest} onAsk={onAsk ?? undefined} portalContainer={frameRef.current} />
    </div>
  );
}

function LegendSwatch({ kind }: { kind: string }) {
  const base = 'inline-block';
  switch (kind) {
    case 'packet':
      return <i className={cn(base, 'size-2 rounded-full bg-accent')} />;
    case 'zone':
      return <i className={cn(base, 'h-2.5 w-3.5 rounded-[3px] border border-dashed border-accent/40 bg-accent-soft/50')} />;
    case 'zone-warn':
      return <i className={cn(base, 'h-2.5 w-3.5 rounded-[3px] border border-dashed border-warning/40 bg-warning-soft')} />;
    case 'zone-plain':
      return <i className={cn(base, 'h-2.5 w-3.5 rounded-[3px] border border-dashed border-border-strong')} />;
    case 'untrusted':
      return <i className={cn(base, 'w-5 border-t-2 border-dashed border-warning')} />;
    case 'danger':
      return <i className={cn(base, 'w-5 border-t-2 border-dashed border-danger')} />;
    case 'signed':
      return <i className={cn(base, 'w-5 border-t-2 border-success')} />;
    case 'stream':
      return <i className={cn(base, 'w-5 border-t-2 border-dashed border-faint')} />;
    case 'optional':
      return <i className={cn(base, 'w-5 border-t-2 border-dotted border-faint')} />;
    default:
      return <i className={cn(base, 'w-5 border-t-2 border-faint')} />;
  }
}

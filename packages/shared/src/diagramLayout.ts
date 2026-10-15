import type { DiagramEdge, DiagramLayoutOverrides, DiagramNode, DiagramNote, DiagramSpec, DiagramZone } from './diagram';

/**
 * Deterministic layout for DiagramSpec → pixel geometry.
 *
 * The model emits semantics (zone spans on a 12-column grid, node order,
 * edge endpoints); this engine owns every coordinate. Same spec → same
 * picture on every device, which makes the render trivial and testable.
 *
 * Canvas: 1280 user units wide; height grows with content.
 * Zones are packed onto grid rows; nodes flow inside their zone in rows;
 * edges become cubic curves between facing anchor points.
 */

export const CANVAS_W = 1280;
const MARGIN = 26;
const GAP_X = 16; // between nodes in a row
const GAP_Y = 14; // between node rows
const ZONE_PAD_X = 22;
const ZONE_HEADER = 40; // room for the zone label + sub
const ZONE_PAD_B = 18;
const ROW_H_MIN = 96;
const GRID = 12;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LaidZone extends Rect {
  spec: DiagramZone;
}

export interface LaidNode extends Rect {
  spec: DiagramNode;
}

export interface LaidEdge {
  spec: DiagramEdge;
  /** Cubic path in canvas units. */
  d: string;
  /** Where the wire label sits. */
  label: { x: number; y: number };
}

export interface LaidNote {
  x: number;
  y: number;
  text: string;
  style: 'plain' | 'mono' | 'strong';
  step?: number;
  zone: string;
}

export interface DiagramLayout {
  width: number;
  height: number;
  zones: LaidZone[];
  nodes: Map<string, LaidNode>;
  edges: LaidEdge[];
  notes: LaidNote[];
}

/* ── text metrics (Inter approximations, same on every device) ── */
const w13 = (s: string) => s.length * 7.15; // title, 13px semibold
const w11 = (s: string) => s.length * 5.35; // sub, 11px
const wMono = (s: string) => s.length * 6.35; // tags/notes, 9.5-11px mono

export function truncate(text: string, maxWidth: number, perChar: number): string {
  const max = Math.floor(maxWidth / perChar);
  if (text.length <= max) return text;
  return max <= 1 ? '…' : `${text.slice(0, max - 1)}…`;
}

function nodeWidth(n: DiagramNode): number {
  const inset = 14 + (n.icon ? 38 : 0);
  const tagsW = n.tags.reduce((acc, t) => acc + wMono(t) + 20, 0) + Math.max(0, n.tags.length - 1) * 6;
  const content = Math.max(w13(n.title), n.sub ? w11(n.sub) : 0, tagsW);
  return Math.round(Math.min(340, Math.max(172, inset + content + 14)));
}

function nodeHeight(n: DiagramNode): number {
  return (n.sub ? 68 : 54) + (n.tags.length ? 22 : 0);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function clampCol(col: number, span: number): { col: number; span: number } {
  const s = clamp(Math.round(span), 2, GRID);
  const c = clamp(Math.round(col), 1, GRID - s + 1);
  return { col: c, span: s };
}

/* ── zones: pack grid intervals into rows ─────────────────────── */
interface ZoneRow {
  zones: { spec: DiagramZone; col: number; span: number }[];
  occupied: [number, number][]; // [startCol, endCol] inclusive, 0-based
}

function packZoneRows(zones: DiagramZone[]): ZoneRow[] {
  const rows: ZoneRow[] = [];
  for (const spec of zones) {
    const { col, span } = clampCol(spec.col, spec.span);
    const interval: [number, number] = [col - 1, col - 1 + span - 1];
    let row = rows.find((r) => !r.occupied.some(([s, e]) => interval[0] <= e && interval[1] >= s));
    if (!row) {
      row = { zones: [], occupied: [] };
      rows.push(row);
    }
    row.zones.push({ spec, col, span });
    row.occupied.push(interval);
  }
  return rows;
}

/* ── cubic helpers ─────────────────────────────────────────────── */
function cubicPoint(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

/* ── main ──────────────────────────────────────────────────────── */
export function layout(spec: DiagramSpec, overrides?: DiagramLayoutOverrides): DiagramLayout {
  const usable = CANVAS_W - 2 * MARGIN;
  const colW = usable / GRID;

  // Nodes without a zone render in an implicit open strip above everything.
  const loose = spec.nodes.filter((n) => !n.zone);
  const zonesIn = spec.zones;

  const laidZones: LaidZone[] = [];
  const laidNodes = new Map<string, LaidNode>();
  const laidNotes: LaidNote[] = [];

  const xOf = (col: number, span: number) => MARGIN + (col - 1) * colW + 4;
  const wOf = (span: number) => span * colW - 8;

  let cursorY = MARGIN;

  // 1. loose strip
  if (loose.length) {
    const innerW = usable - 2 * ZONE_PAD_X;
    let x = MARGIN + ZONE_PAD_X;
    let rowY = cursorY + 14;
    let rowH = 0;
    for (const n of loose) {
      const w = nodeWidth(n);
      const h = nodeHeight(n);
      if (x + w > MARGIN + usable - ZONE_PAD_X && x > MARGIN + ZONE_PAD_X) {
        rowY += rowH + GAP_Y;
        x = MARGIN + ZONE_PAD_X;
        rowH = 0;
      }
      laidNodes.set(n.id, { spec: n, x, y: rowY, w, h });
      x += w + GAP_X;
      rowH = Math.max(rowH, h);
    }
    cursorY = rowY + rowH + ZONE_PAD_B + 8;
  }

  // 2. named zones, packed into grid rows
  const rows = packZoneRows(zonesIn);
  for (const row of rows) {
    let rowH = ROW_H_MIN;
    const placedInRow: { spec: DiagramZone; rect: Rect; inner: { x: number; y: number; w: number } }[] = [];

    // Compute heights first so the whole row shares one top edge.
    for (const { spec: zn, col, span } of row.zones) {
      const zx = xOf(col, span);
      const zw = wOf(span);
      const innerW = zw - 2 * ZONE_PAD_X;
      const nodes = spec.nodes.filter((n) => n.zone === zn.id);
      const notes = spec.notes.filter((nt) => nt.zone === zn.id);

      let x = zx + ZONE_PAD_X;
      let y = 0; // relative to zone top after header
      let lineH = 0;
      for (const n of nodes) {
        const w = nodeWidth(n);
        const h = nodeHeight(n);
        if (x + w > zx + ZONE_PAD_X + innerW && x > zx + ZONE_PAD_X) {
          y += lineH + GAP_Y;
          x = zx + ZONE_PAD_X;
          lineH = 0;
        }
        laidNodes.set(n.id, { spec: n, x, y: cursorY + ZONE_HEADER + y, w, h });
        x += w + GAP_X;
        lineH = Math.max(lineH, h);
      }
      const nodesH = nodes.length ? y + lineH : 0;
      const notesH = notes.length ? 8 + notes.length * 16 : 0;
      const zh = Math.max(ROW_H_MIN, ZONE_HEADER + nodesH + notesH + ZONE_PAD_B);

      placedInRow.push({ spec: zn, rect: { x: zx, y: cursorY, w: zw, h: zh }, inner: { x: zx + ZONE_PAD_X, y: cursorY + ZONE_HEADER, w: innerW } });
      rowH = Math.max(rowH, zh);
    }

    // Stretch every zone in the row to the row's height for a clean edge.
    for (const p of placedInRow) {
      p.rect.h = rowH;
      laidZones.push({ ...p.rect, spec: p.spec });

      const notes = spec.notes.filter((nt) => nt.zone === p.spec.id);
      notes.forEach((nt, i) => {
        laidNotes.push({
          x: p.inner.x,
          y: p.rect.y + rowH - ZONE_PAD_B - (notes.length - i) * 16 + 4,
          text: truncate(nt.text, p.inner.w - 24, 6.1),
          style: nt.style,
          step: nt.step,
          zone: nt.zone,
        });
      });
    }
    cursorY += rowH + GAP_Y;
  }

  // 3. hand-arranged positions: apply zone moves/resizes (un-pinned children
  //    follow moves), then per-node moves. Edges below are routed from the
  //    final rects, so the wires always track the components.
  if (overrides) {
    for (const z of laidZones) {
      const ov = overrides.zones[z.spec.id];
      if (!ov) continue;
      const nw = clamp(ov.w ?? z.w, 80, CANVAS_W - 8);
      const nh = clamp(ov.h ?? z.h, 60, 5000);
      const nx = clamp(ov.x, 4, CANVAS_W - nw - 4);
      const ny = Math.max(4, ov.y);
      const dx = nx - z.x;
      const dy = ny - z.y;
      const dh = nh - z.h;
      z.x = nx;
      z.y = ny;
      z.w = nw;
      z.h = nh;
      for (const [id, node] of laidNodes) {
        if (node.spec.zone === z.spec.id && !overrides.nodes[id]) {
          node.x += dx;
          node.y += dy;
        }
      }
      // Notes stay glued to the frame's bottom edge as it resizes.
      for (const nt of laidNotes) {
        if (nt.zone === z.spec.id) {
          nt.x += dx;
          nt.y += dy + dh;
        }
      }
    }
    for (const [id, n] of laidNodes) {
      const ov = overrides.nodes[id];
      if (!ov) continue;
      n.x = clamp(ov.x, 4, CANVAS_W - n.w - 4);
      n.y = Math.max(4, ov.y);
    }
  }

  // 4. edges (routed from the final rects — links never break)
  const edges: LaidEdge[] = [];
  for (const e of spec.edges) {
    const a = laidNodes.get(e.from);
    const b = laidNodes.get(e.to);
    if (!a || !b) continue;

    const acx = a.x + a.w / 2;
    const acy = a.y + a.h / 2;
    const bcx = b.x + b.w / 2;
    const bcy = b.y + b.h / 2;
    const dx = bcx - acx;
    const dy = bcy - acy;

    const vertical = e.route === 'v' || (e.route === 'auto' && Math.abs(dy) > Math.abs(dx) * 1.15);
    const bow = e.route === 'below' ? 1 : e.route === 'above' ? -1 : 0;

    let ax: number, ay: number, bx: number, by: number;
    let c1x: number, c1y: number, c2x: number, c2y: number;

    if (!vertical) {
      // horizontal: leave from the facing side
      if (dx >= 0) {
        ax = a.x + a.w;
        bx = b.x;
      } else {
        ax = a.x;
        bx = b.x + b.w;
      }
      ay = acy;
      by = bcy;
      const k = 0.45 * (bx - ax);
      c1x = ax + k;
      c1y = ay + bow * 58;
      c2x = bx - k;
      c2y = by + bow * 58;
    } else {
      if (dy >= 0) {
        ay = a.y + a.h;
        by = b.y;
      } else {
        ay = a.y;
        by = b.y + b.h;
      }
      ax = acx;
      bx = bcx;
      const k = 0.45 * (by - ay);
      c1x = ax + bow * 58;
      c1y = ay + k;
      c2x = bx + bow * 58;
      c2y = by - k;
    }

    const d = `M ${ax.toFixed(1)} ${ay.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${bx.toFixed(1)} ${by.toFixed(1)}`;
    const t = e.labelAt === 'start' ? 0.28 : e.labelAt === 'end' ? 0.72 : 0.5;
    const lx = cubicPoint(t, ax, c1x, c2x, bx);
    const ly = cubicPoint(t, ay, c1y, c2y, by);
    const label = vertical ? { x: lx + 16, y: ly + 4 } : { x: lx, y: ly - 9 };

    edges.push({ spec: e, d, label });
  }

  // Height grows to fit whatever was dragged.
  let maxBottom = 0;
  for (const z of laidZones) maxBottom = Math.max(maxBottom, z.y + z.h);
  for (const n of laidNodes.values()) maxBottom = Math.max(maxBottom, n.y + n.h);
  const height = Math.max(320, maxBottom + MARGIN);
  return { width: CANVAS_W, height, zones: laidZones, nodes: laidNodes, edges, notes: laidNotes };
}

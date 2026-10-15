import { useCallback, useEffect, useRef, useState } from 'react';

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * DIY pan/zoom for an inline SVG canvas (~100 lines, no dependency).
 * Single pointer = pan, two pointers = pinch, wheel = zoom at cursor,
 * double-click = fit. Works on iOS Safari (touch-action: none on the SVG).
 */
export function usePanZoom(contentW: number, contentH: number) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [vb, setVb] = useState<ViewBox>({ x: 0, y: 0, w: contentW, h: contentH });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | { kind: 'pan'; startX: number; startY: number; vb: ViewBox }
    | { kind: 'pinch'; startDist: number; anchorX: number; anchorY: number; vb: ViewBox }
    | null
  >(null);

  const fit = useCallback(() => setVb({ x: 0, y: 0, w: contentW, h: contentH }), [contentW, contentH]);

  // Fit once on mount. (After that, content size may grow while dragging a
  // component — resetting the camera then would yank the view mid-drag.)
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    fitted.current = true;
    fit();
  }, [fit]);

  const rect = () => containerRef.current?.getBoundingClientRect() ?? null;

  const clamp = useCallback(
    (next: ViewBox): ViewBox => {
      const w = Math.min(contentW * 1.6, Math.max(contentW / 7, next.w));
      const h = w * (contentH / contentW);
      const padX = contentW * 0.25;
      const padY = contentH * 0.25;
      const x = Math.min(contentW + padX - w, Math.max(-padX, next.x));
      const y = Math.min(contentH + padY - h, Math.max(-padY, next.y));
      return { x, y, w, h };
    },
    [contentW, contentH],
  );

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const r = rect();
      if (!r) return;
      setVb((prev) => {
        const next = clamp({ ...prev, w: prev.w * factor, h: prev.h * factor });
        // keep the anchor point under the cursor
        const ux = prev.x + ((clientX - r.left) / r.width) * prev.w;
        const uy = prev.y + ((clientY - r.top) / r.height) * prev.h;
        return clamp({
          x: ux - ((clientX - r.left) / r.width) * next.w,
          y: uy - ((clientY - r.top) / r.height) * next.h,
          w: next.w,
          h: next.h,
        });
      });
    },
    [clamp],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const r = rect();
      if (!r) return;
      zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
    },
    [zoomAt],
  );

  // Wheel must be a non-passive native listener so preventDefault works.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0012));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = rect();
      if (!r) return;
      if (pointers.current.size === 1) {
        gesture.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, vb };
      } else if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        const mx = (a!.x + b!.x) / 2;
        const my = (a!.y + b!.y) / 2;
        gesture.current = {
          kind: 'pinch',
          startDist: Math.max(1, dist),
          anchorX: vb.x + ((mx - r.left) / r.width) * vb.w,
          anchorY: vb.y + ((my - r.top) / r.height) * vb.h,
          vb,
        };
      }
    },
    [vb],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gesture.current;
      const r = rect();
      if (!g || !r) return;

      if (g.kind === 'pan' && pointers.current.size === 1) {
        const dx = ((e.clientX - g.startX) / r.width) * g.vb.w;
        const dy = ((e.clientY - g.startY) / r.height) * g.vb.h;
        setVb(clamp({ x: g.vb.x - dx, y: g.vb.y - dy, w: g.vb.w, h: g.vb.h }));
      } else if (g.kind === 'pinch' && pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()];
        const dist = Math.max(1, Math.hypot(a!.x - b!.x, a!.y - b!.y));
        const w = g.vb.w * (g.startDist / dist);
        const h = w * (contentH / contentW);
        const mx = (a!.x + b!.x) / 2;
        const my = (a!.y + b!.y) / 2;
        const next = clamp({
          x: g.anchorX - ((mx - r.left) / r.width) * w,
          y: g.anchorY - ((my - r.top) / r.height) * h,
          w,
          h,
        });
        setVb(next);
      }
    },
    [clamp, contentH, contentW],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
    else if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      gesture.current = { kind: 'pan', startX: p!.x, startY: p!.y, vb };
    }
  }, [vb]);

  return {
    vb,
    containerRef,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onDoubleClick: fit,
    },
    fit,
    zoomBy,
  };
}

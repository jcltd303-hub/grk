import type { Point2D, Skeleton } from './types';

export type SnapKind = 'joint' | 'balanced edge' | 'horizontal' | 'vertical';
export type SnapResult = { point: Point2D; kind: SnapKind | null };

type SnapOptions = {
  enabled: boolean;
  zoom: number;
  skeleton?: Skeleton | null;
  anchor?: Point2D | null;
  excludeBoneId?: string | null;
  alpha?: Uint8Array | null;
  width?: number;
  height?: number;
};

const distance = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y);

export function snapAngle(angle: number): number {
  const cardinal = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
  return Math.abs(cardinal - angle) <= Math.PI / 30 ? cardinal : angle;
}

/** All thresholds are in screen pixels, so snapping feels stable at any zoom. */
export function snapPoint(point: Point2D, options: SnapOptions): SnapResult {
  if (!options.enabled) return { point, kind: null };
  const zoom = Math.max(0.1, options.zoom);
  const jointTolerance = 10 / zoom;
  const excluded = options.skeleton?.bones.find(b => b.id === options.excludeBoneId);
  let nearestJoint: Point2D | null = null;
  let bestDistance = jointTolerance;
  for (const bone of options.skeleton?.bones ?? []) for (const joint of [bone.start, bone.end]) {
    if (bone.id === options.excludeBoneId) continue;
    if (excluded && [excluded.start, excluded.end].some(p => distance(p, joint) < 0.5)) continue;
    if (options.anchor && distance(options.anchor, joint) < 3 / zoom) continue;
    const delta = distance(point, joint);
    if (delta < bestDistance) { bestDistance = delta; nearestJoint = joint; }
  }
  if (nearestJoint) return { point: { ...nearestJoint }, kind: 'joint' };

  const { anchor, alpha, width, height } = options;
  if (anchor && alpha && width && height && alpha.length === width * height) {
    const dx = point.x - anchor.x, dy = point.y - anchor.y;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude >= 8) {
      const ux = dx / magnitude, uy = dy / magnitude;
      const opaque = (step: number) => {
        const x = Math.round(anchor.x + ux * step), y = Math.round(anchor.y + uy * step);
        return x >= 0 && x < width && y >= 0 && y < height && alpha[y * width + x] >= 20;
      };
      if (opaque(0)) {
        let inset = 0;
        while (inset < 17 && opaque(-inset - 1)) inset++;
        if (inset <= 16) {
          let exit = 0;
          const limit = Math.ceil(Math.hypot(width, height)) + 1;
          while (exit < limit && opaque(exit + 1)) exit++;
          if (exit > inset + 8 && exit < limit) {
            const target = { x: anchor.x + ux * (exit - inset), y: anchor.y + uy * (exit - inset) };
            if (distance(point, target) < 12 / zoom) return { point: target, kind: 'balanced edge' };
          }
        }
      }
    }
  }

  if (anchor && distance(anchor, point) >= 10 / zoom) {
    const horizontal = Math.abs(point.y - anchor.y) < 6 / zoom;
    const vertical = Math.abs(point.x - anchor.x) < 6 / zoom;
    if (horizontal && (!vertical || Math.abs(point.y - anchor.y) <= Math.abs(point.x - anchor.x))) {
      return { point: { x: point.x, y: anchor.y }, kind: 'horizontal' };
    }
    if (vertical) return { point: { x: anchor.x, y: point.y }, kind: 'vertical' };
  }
  return { point, kind: null };
}

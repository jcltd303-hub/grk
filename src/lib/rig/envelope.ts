import type { Skeleton } from './types';
import { updateWorldTransforms } from './skeleton';

/** Fit the actual opaque pixels, including features missed by the sparse mesh. */
export function fitEnvelopesToAlpha(
  skeleton: Skeleton,
  alpha: Uint8Array | null | undefined,
  width: number,
  height: number,
  insetTips = false
): void {
  if (!alpha || alpha.length !== width * height || !skeleton.bones.length) return;
  const byId = new Map(skeleton.bones.map(b => [b.id, b]));
  const depth = (bone: typeof skeleton.bones[number]): number => {
    let current = bone, result = 0;
    const visited = new Set<string>([bone.id]);
    while (current.parentId && byId.has(current.parentId) && !visited.has(current.parentId)) {
      current = byId.get(current.parentId)!;
      visited.add(current.id);
      result++;
    }
    return result;
  };
  const ordered = [...skeleton.bones].sort((a,b) => depth(a)-depth(b) || a.id.localeCompare(b.id));


  if (insetTips) {
    for (const bone of ordered) {
      if (skeleton.bones.some((child) => child.parentId === bone.id) || bone.length < 8) continue;
      const dx = (bone.end.x - bone.start.x) / bone.length;
      const dy = (bone.end.y - bone.start.y) / bone.length;
      const opaque = (distance: number) => {
        const x = Math.round(bone.start.x + dx * distance);
        const y = Math.round(bone.start.y + dy * distance);
        return x >= 0 && x < width && y >= 0 && y < height && alpha[y * width + x] >= 20;
      };
      // Only adjust a tip at the silhouette boundary. Keep interior joints stable.
      if (!opaque(bone.length + 2)) {
        let distance = bone.length;
        while (distance > bone.length * 0.75 && !opaque(distance)) distance--;
        if (opaque(distance)) {
          let margin = 0;
          while (margin < 3 && distance > bone.length * 0.75 && opaque(distance)) {
            distance--;
            margin++;
          }
          bone.length = Math.max(4, distance);
          if (skeleton.restBones[bone.id]) skeleton.restBones[bone.id].length = bone.length;
        }
      }
    }
    updateWorldTransforms(skeleton);
  }

  // Measure the silhouette assigned to each nearest bone at positions along its
  // length. Bin maxima preserve tiny features without storing every pixel.
  const bins = 64;
  const required = new Map(skeleton.bones.map((bone) => [bone.id, new Float32Array(bins)]));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (alpha[y * width + x] < 20) continue;
    let nearest: typeof skeleton.bones[number] | undefined;
    let nearestDistance = Infinity;
    let nearestT = 0;
    for (const bone of ordered) {
      const dx = bone.end.x - bone.start.x;
      const dy = bone.end.y - bone.start.y;
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq > 0 ? Math.max(0, Math.min(1,
        ((x - bone.start.x) * dx + (y - bone.start.y) * dy) / lengthSq)) : 0;
      const distance = Math.hypot(x - bone.start.x - t * dx, y - bone.start.y - t * dy);
      if (distance < nearestDistance) { nearest = bone; nearestDistance = distance; nearestT = t; }
    }
    if (nearest) {
      const sample = required.get(nearest.id)!;
      const bin = Math.min(bins - 1, Math.floor(nearestT * bins));
      sample[bin] = Math.max(sample[bin], nearestDistance + 0.5);
    }
  }

  for (const bone of ordered) {
    const sample = required.get(bone.id)!;
    const largest = Math.max(...sample);
    if (largest === 0) {
      // A bone with no assigned visible pixels should not inherit a broad
      // provisional mesh width and overlap neighboring artwork.
      bone.startWidth = bone.endWidth = 2;
      const rest = skeleton.restBones[bone.id];
      if (rest) { rest.startWidth = 2; rest.endWidth = 2; }
      continue;
    }
    // A linear taper must contain each occupied bin at both bin boundaries.
    // Minimize the sum of endpoint radii, which also reduces needless overlap.
    const constraints: Array<{ t: number; radius: number }> = [];
    sample.forEach((radius, i) => {
      if (radius <= 0) return;
      constraints.push({ t: i / bins, radius }, { t: (i + 1) / bins, radius });
    });
    const endRadius = (startRadius: number) => constraints.reduce((radius, point) =>
      point.t === 0
        ? (startRadius + 1e-7 < point.radius ? Infinity : radius)
        : Math.max(radius, (point.radius - (1 - point.t) * startRadius) / point.t), 1);
    let lo = Math.max(1, ...constraints.filter(c => c.t === 0).map(c => c.radius));
    // The optimal start radius may exceed the widest sample slightly: the
    // first bin must stay covered through its far boundary while the tip tapers.
    let hi = Math.max(lo, largest * 2);
    for (let i = 0; i < 42; i++) {
      const a = lo + (hi - lo) / 3;
      const b = hi - (hi - lo) / 3;
      if (a + endRadius(a) < b + endRadius(b)) hi = b;
      else lo = a;
    }
    const startRadius = (lo + hi) / 2;
    bone.startWidth = Math.ceil(2 * startRadius * 100) / 100;
    bone.endWidth = Math.ceil(2 * endRadius(startRadius) * 100) / 100;
    const rest = skeleton.restBones[bone.id];
    if (rest) { rest.startWidth = bone.startWidth; rest.endWidth = bone.endWidth; }
  }
}

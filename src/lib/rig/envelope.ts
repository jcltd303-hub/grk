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

  if (insetTips) {
    for (const bone of skeleton.bones) {
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

  const required = new Map(skeleton.bones.map((bone) => [bone.id, 0]));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (alpha[y * width + x] < 20) continue;
    let nearest: typeof skeleton.bones[number] | undefined;
    let nearestDistance = Infinity;
    for (const bone of skeleton.bones) {
      const dx = bone.end.x - bone.start.x;
      const dy = bone.end.y - bone.start.y;
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq > 0 ? Math.max(0, Math.min(1,
        ((x - bone.start.x) * dx + (y - bone.start.y) * dy) / lengthSq)) : 0;
      const distance = Math.hypot(x - bone.start.x - t * dx, y - bone.start.y - t * dy);
      if (distance < nearestDistance) { nearest = bone; nearestDistance = distance; }
    }
    if (nearest) required.set(nearest.id, Math.max(required.get(nearest.id)!, nearestDistance * 2 + 2));
  }

  for (const bone of skeleton.bones) {
    const diameter = required.get(bone.id)!;
    bone.startWidth = Math.max(bone.startWidth ?? 0, diameter);
    bone.endWidth = Math.max(bone.endWidth ?? 0, diameter);
    const rest = skeleton.restBones[bone.id];
    if (rest) { rest.startWidth = bone.startWidth; rest.endWidth = bone.endWidth; }
  }
}

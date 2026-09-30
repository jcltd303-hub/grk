import type { Skeleton } from './types';
import { updateWorldTransforms } from './skeleton';
import type { PartOwnership } from './part-brush';

/** Fit the actual opaque pixels, including features missed by the sparse mesh. */
export function fitEnvelopesToAlpha(
  skeleton: Skeleton,
  alpha: Uint8Array | null | undefined,
  width: number,
  height: number,
  insetTips = false,
  ownership?: PartOwnership | null
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
    const paintedId = ownership?.width === width && ownership.height === height
      ? ownership.boneIds[ownership.pixels[y * width + x] - 1] : undefined;
    for (const bone of ordered) {
      if (paintedId && bone.id !== paintedId) continue;
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
    const manualStart = bone.manualStartWidth ? bone.startWidth : undefined;
    const manualEnd = bone.manualEndWidth ? bone.endWidth : undefined;
    const sample = required.get(bone.id)!;
    // Local measurements follow the silhouette without extending a narrow
    // protrusion's width along the entire bone. Include adjacent bins at
    // boundaries so interpolation cannot leave a sampled pixel uncovered.
    const profile = Array.from(sample, (radius, i) => Math.max(1,
      radius, sample[Math.max(0, i - 1)], sample[Math.min(bins - 1, i + 1)]) * 2);
    bone.widthProfile = profile;
    const largest = Math.max(...sample);
    if (largest === 0) {
      // A bone with no assigned visible pixels should not inherit a broad
      // provisional mesh width and overlap neighboring artwork.
      bone.startWidth = manualStart ?? 2; bone.endWidth = manualEnd ?? 2;
      bone.widthProfile = new Array(bins).fill(2);
      const rest = skeleton.restBones[bone.id];
      if (rest) { rest.startWidth = 2; rest.endWidth = 2; }
      continue;
    }
    bone.startWidth = manualStart ?? Math.ceil(profile[0] * 100) / 100;
    bone.endWidth = manualEnd ?? Math.ceil(profile[bins - 1] * 100) / 100;
    const rest = skeleton.restBones[bone.id];
    if (rest) { rest.startWidth = bone.startWidth; rest.endWidth = bone.endWidth; }
  }

  // Envelopes meet at a shared pivot even though pixel ownership is exclusive.
  for (const parent of ordered) {
    const children = ordered.filter(child => child.parentId === parent.id);
    if (!children.length) continue;
    const jointWidth = Math.max(parent.endWidth ?? 2, ...children.map(c => c.startWidth ?? 2));
    if (!parent.manualEndWidth) {
      parent.endWidth = jointWidth;
      if (parent.widthProfile) parent.widthProfile[parent.widthProfile.length - 1] = jointWidth;
    }
    for (const child of children) if (!child.manualStartWidth) {
      child.startWidth = jointWidth;
      if (child.widthProfile) child.widthProfile[0] = jointWidth;
    }
    for (const bone of [parent, ...children]) {
      const rest = skeleton.restBones[bone.id];
      if (rest) { rest.startWidth = bone.startWidth; rest.endWidth = bone.endWidth; }
    }
  }
}

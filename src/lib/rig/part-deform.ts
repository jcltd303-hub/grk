import type { RigMesh, Skeleton, Vertex } from './types';
import type { PartOwnership } from './part-brush';

/** Turn painted ownership into a continuous skinning field on the original image. */
export function applyPartWeights(mesh: RigMesh, mask: PartOwnership, skeleton: Skeleton): void {
  if (mask.width !== mesh.width || mask.height !== mesh.height) return;
  const valid = new Set(skeleton.bones.map(b => b.id));
  for (const vertex of mesh.vertices) {
    const x = Math.max(0, Math.min(mask.width - 1, Math.round(vertex.originalX)));
    const y = Math.max(0, Math.min(mask.height - 1, Math.round(vertex.originalY)));
    const owner = mask.boneIds[mask.pixels[y * mask.width + x] - 1];
    if (owner && valid.has(owner)) {
      vertex.weights = [{ boneId: owner, weight: 1 }];
      continue;
    }
    // Transparent vertices still anchor the outer mesh. Prefer the closest
    // painted pixel; fall back to the geometry assignment beyond the artwork.
    let nearest: string | undefined;
    search: for (let r = 1; r <= 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const px = x + dx, py = y + dy;
      if (px < 0 || py < 0 || px >= mask.width || py >= mask.height) continue;
      const id = mask.boneIds[mask.pixels[py * mask.width + px] - 1];
      if (id && valid.has(id)) { nearest = id; break search; }
    }
    const fallback = vertex.weights.find(w => valid.has(w.boneId))?.boneId ?? skeleton.bones[0]?.id;
    if (nearest || fallback) vertex.weights = [{ boneId: nearest ?? fallback!, weight: 1 }];
  }
}

export function constrainAngle(angle: number, bone: Pick<Skeleton['bones'][number], 'minAngle' | 'maxAngle'>): number {
  return Math.max(bone.minAngle ?? -Math.PI, Math.min(bone.maxAngle ?? Math.PI, angle));
}

export function rotationHandle(bone: Pick<Vertex, 'x' | 'y'> & { worldAngle: number }): { x: number; y: number } {
  return { x: bone.x + Math.cos(bone.worldAngle - Math.PI / 3) * 38,
    y: bone.y + Math.sin(bone.worldAngle - Math.PI / 3) * 38 };
}

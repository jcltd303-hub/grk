import type { RigMesh, Skeleton, Vertex } from './types';
import type { PartOwnership } from './part-brush';

/** Turn painted ownership into a continuous skinning field on the original image. */
export function applyPartWeights(mesh: RigMesh, mask: PartOwnership, skeleton: Skeleton): void {
  if (mask.width !== mesh.width || mask.height !== mesh.height) return;
  const valid = new Set(skeleton.bones.map(b => b.id));
  const radius = Math.max(3, Math.min(12, Math.min(mesh.width, mesh.height) / 80));
  const offsets = [-1, 0, 1];
  for (const vertex of mesh.vertices) {
    const scores = new Map<string, number>();
    const x = vertex.originalX, y = vertex.originalY;
    for (const oy of offsets) for (const ox of offsets) {
      const px = Math.max(0, Math.min(mask.width - 1, Math.round(x + ox * radius)));
      const py = Math.max(0, Math.min(mask.height - 1, Math.round(y + oy * radius)));
      const id = mask.boneIds[mask.pixels[py * mask.width + px] - 1];
      if (id && valid.has(id)) scores.set(id, (scores.get(id) ?? 0) + (ox === 0 && oy === 0 ? 4 : 1));
    }
    if (!scores.size) continue;
    // Preserve a small geometric influence around painted boundaries to avoid hard kinks.
    for (const weight of vertex.weights) if (valid.has(weight.boneId)) {
      scores.set(weight.boneId, (scores.get(weight.boneId) ?? 0) + weight.weight * 2);
    }
    const total = [...scores.values()].reduce((a, b) => a + b, 0);
    vertex.weights = [...scores].map(([boneId, score]) => ({ boneId, weight: score / total }));
  }
}

export function constrainAngle(angle: number, bone: Pick<Skeleton['bones'][number], 'minAngle' | 'maxAngle'>): number {
  return Math.max(bone.minAngle ?? -Math.PI, Math.min(bone.maxAngle ?? Math.PI, angle));
}

export function rotationHandle(bone: Pick<Vertex, 'x' | 'y'> & { worldAngle: number }): { x: number; y: number } {
  return { x: bone.x + Math.cos(bone.worldAngle - Math.PI / 3) * 38,
    y: bone.y + Math.sin(bone.worldAngle - Math.PI / 3) * 38 };
}

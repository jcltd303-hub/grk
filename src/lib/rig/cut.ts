import type { Point2D, RigMesh, Triangle, Vertex } from './types';

/** Split textured triangles at a straight seam. Each side gets its own seam vertices. */
export function cutMesh(mesh: RigMesh, start: Point2D, end: Point2D, leftBoneId: string, rightBoneId: string): RigMesh {
  if (mesh.cut) throw new Error('This artwork already has a cut. Undo it before drawing another.');
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length < 4 || leftBoneId === rightBoneId) throw new Error('Draw a longer line and choose two different bones.');
  const signed = (v: Pick<Vertex, 'originalX' | 'originalY'>) =>
    ((end.x - start.x) * (v.originalY - start.y) - (end.y - start.y) * (v.originalX - start.x)) / length;
  const vertices: Vertex[] = [];
  const triangles: Triangle[] = [];
  const keys = new Map<string, number>();
  const sideCounts = [0, 0];
  const index = (key: string, v: Vertex, boneId: string) => {
    const existing = keys.get(key);
    if (existing !== undefined) return existing;
    const result = vertices.length;
    vertices.push({ ...v, x: v.originalX, y: v.originalY, weights: [{ boneId, weight: 1 }], cutBoneId: boneId });
    keys.set(key, result);
    return result;
  };
  for (const triangle of mesh.triangles) {
    for (const side of [1, -1] as const) {
      const boneId = side === 1 ? leftBoneId : rightBoneId;
      type Corner = { vertex: Vertex; key: string; distance: number };
      const corners: Corner[] = triangle.map(i => ({ vertex: mesh.vertices[i], key: String(i), distance: signed(mesh.vertices[i]) * side }));
      const polygon: Corner[] = [];
      for (let i = 0; i < 3; i++) {
        const a = corners[i];
        const b = corners[(i + 1) % 3];
        if (a.distance >= -1e-7) polygon.push(a);
        if (a.distance * b.distance < -1e-12) {
          const t = a.distance / (a.distance - b.distance);
          const av = a.vertex, bv = b.vertex;
          const originalX = av.originalX + (bv.originalX - av.originalX) * t;
          const originalY = av.originalY + (bv.originalY - av.originalY) * t;
          const edge = [triangle[i], triangle[(i + 1) % 3]].sort((x, y) => x - y).join(':');
          polygon.push({ key: `edge:${edge}`, distance: 0, vertex: {
            ...av, originalX, originalY, x: originalX, y: originalY,
            u: av.u + (bv.u - av.u) * t, v: av.v + (bv.v - av.v) * t,
          } });
        }
      }
      for (let i = 1; i + 1 < polygon.length; i++) {
        const [a, b, c] = [polygon[0], polygon[i], polygon[i + 1]];
        const area = (b.vertex.originalX - a.vertex.originalX) * (c.vertex.originalY - a.vertex.originalY)
          - (b.vertex.originalY - a.vertex.originalY) * (c.vertex.originalX - a.vertex.originalX);
        if (Math.abs(area) < 1e-6) continue;
        sideCounts[side === 1 ? 0 : 1]++;
        triangles.push([a, b, c].map(p => index(`${side}:${p.key}`, p.vertex, boneId)) as Triangle);
      }
    }
  }
  if (!sideCounts[0] || !sideCounts[1]) throw new Error('The cut must cross the artwork mesh.');
  return { ...mesh, vertices, triangles, cut: { start, end, leftBoneId, rightBoneId } };
}

import type { Point2D, RigMesh, Triangle, Vertex } from './types';

/** Split textured triangles at a straight seam. Each side gets its own seam vertices. */
export function cutMesh(mesh: RigMesh, start: Point2D, end: Point2D, leftBoneId: string, rightBoneId: string, alpha?: Uint8Array): RigMesh {
  if (mesh.cut) throw new Error('This artwork already has a cut. Undo it before drawing another.');
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length < 4 || leftBoneId === rightBoneId) throw new Error('Draw a longer line and choose two different bones.');
  const nx = -(end.y - start.y) / length, ny = (end.x - start.x) / length;
  const path: Point2D[] = [start];
  if (alpha && alpha.length === mesh.width * mesh.height) {
    const steps = Math.max(2, Math.ceil(length / 3));
    const range = Math.min(12, Math.max(3, length * 0.12));
    let previous = 0;
    for (let step = 1; step < steps; step++) {
      const t = step / steps;
      const baseX = start.x + (end.x - start.x) * t;
      const baseY = start.y + (end.y - start.y) * t;
      let best = previous, cost = Infinity;
      for (let offset = -range; offset <= range; offset++) {
        const x = Math.round(baseX + nx * offset), y = Math.round(baseY + ny * offset);
        if (x < 0 || x >= mesh.width || y < 0 || y >= mesh.height) continue;
        const value = alpha[y * mesh.width + x] / 255;
        const candidate = value * 16 + Math.abs(offset - previous) * 0.35 + Math.abs(offset) * 0.025;
        if (candidate < cost) { cost = candidate; best = offset; }
      }
      previous = best;
      path.push({ x: baseX + nx * best, y: baseY + ny * best });
    }
  }
  path.push(end);
  const signed = (v: Pick<Vertex, 'originalX' | 'originalY'>) => {
    const projection = ((v.originalX-start.x)*(end.x-start.x)+(v.originalY-start.y)*(end.y-start.y))/(length*length);
    const segment = Math.min(path.length-2,Math.max(0,Math.floor(projection*(path.length-1))));
    const a=path[segment], b=path[segment+1];
    return ((b.x-a.x)*(v.originalY-a.y)-(b.y-a.y)*(v.originalX-a.x))/Math.hypot(b.x-a.x,b.y-a.y);
  };
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
          let lo = 0, hi = 1;
          for (let iteration = 0; iteration < 24; iteration++) {
            const mid = (lo + hi) / 2;
            const point = { originalX: a.vertex.originalX + (b.vertex.originalX-a.vertex.originalX)*mid,
              originalY: a.vertex.originalY + (b.vertex.originalY-a.vertex.originalY)*mid };
            if (signed(point) * side * a.distance >= 0) lo = mid; else hi = mid;
          }
          const t = (lo + hi) / 2;
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

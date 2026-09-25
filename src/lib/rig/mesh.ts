import { RigMesh, Skeleton, Triangle, Vertex } from './types';
import { distToSegment } from './math';

/**
 * Generates a regular triangular mesh over an image dimensions, optionally clipped to alpha bounds.
 */
export function generateMesh(
  width: number,
  height: number,
  columns: number = 16,
  rows: number = 24,
  alphaMask?: Uint8Array | null
): RigMesh {
  const vertices: Vertex[] = [];
  const triangles: Triangle[] = [];

  const dx = width / columns;
  const dy = height / rows;

  const gridMap = new Map<string, number>();

  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= columns; c++) {
      const x = c * dx;
      const y = r * dy;
      const u = c / columns;
      const v = r / rows;

      // Check alpha mask if provided
      let keep = true;
      if (alphaMask) {
        const px = Math.min(width - 1, Math.floor(x));
        const py = Math.min(height - 1, Math.floor(y));
        const alpha = alphaMask[py * width + px];
        // Keep vertex if near or inside opaque areas
        if (alpha < 15) {
          // Check small radius around for boundary safety
          let hasNearbyAlpha = false;
          const searchRadius = 6;
          for (let sy = -searchRadius; sy <= searchRadius && !hasNearbyAlpha; sy += 3) {
            for (let sx = -searchRadius; sx <= searchRadius; sx += 3) {
              const nx = Math.max(0, Math.min(width - 1, px + sx));
              const ny = Math.max(0, Math.min(height - 1, py + sy));
              if (alphaMask[ny * width + nx] >= 20) {
                hasNearbyAlpha = true;
                break;
              }
            }
          }
          keep = hasNearbyAlpha;
        }
      }

      if (keep) {
        const index = vertices.length;
        gridMap.set(`${c},${r}`, index);
        vertices.push({
          x,
          y,
          u,
          v,
          originalX: x,
          originalY: y,
          weights: [],
        });
      }
    }
  }

  // Generate triangles for each quad cell
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const topLeft = gridMap.get(`${c},${r}`);
      const topRight = gridMap.get(`${c + 1},${r}`);
      const bottomLeft = gridMap.get(`${c},${r + 1}`);
      const bottomRight = gridMap.get(`${c + 1},${r + 1}`);

      if (topLeft !== undefined && topRight !== undefined && bottomLeft !== undefined) {
        triangles.push([topLeft, topRight, bottomLeft]);
      }
      if (topRight !== undefined && bottomRight !== undefined && bottomLeft !== undefined) {
        triangles.push([topRight, bottomRight, bottomLeft]);
      }
    }
  }

  return {
    vertices,
    triangles,
    width,
    height,
    density: columns,
  };
}

/**
 * Calculates automatic skinning weights for every vertex based on proximity to skeleton bones.
 * Uses an inverse distance power law with smooth falloff and normalizes weights.
 */
export function computeAutoWeights(
  mesh: RigMesh,
  skeleton: Skeleton,
  maxInfluencesPerVertex: number = 4,
  power: number = 2.8
): void {
  if (mesh.vertices.length === 0 || skeleton.bones.length === 0) return;

  const bones = skeleton.bones;
  const safePower = Math.max(1.5, power);
  const influenceLimit = Math.max(1, Math.min(8, Math.floor(maxInfluencesPerVertex)));
  const byId = new Map(bones.map(bone => [bone.id, bone]));
  const depthCache = new Map<string, number>();
  const depthOf = (id: string, visiting = new Set<string>()): number => {
    if (depthCache.has(id)) return depthCache.get(id)!;
    const bone = byId.get(id);
    if (!bone?.parentId || !byId.has(bone.parentId) || visiting.has(id)) return 0;
    visiting.add(id);
    const depth = depthOf(bone.parentId, visiting) + 1;
    visiting.delete(id);
    depthCache.set(id, depth);
    return depth;
  };

  type Candidate = { boneId: string; score: number; distance: number; t: number };
  const candidatesFor = (vertex: Vertex): Candidate[] => {
    const p = { x: vertex.originalX, y: vertex.originalY };
    const candidates: Candidate[] = [];

    for (const bone of bones) {
      const bx = bone.end.x - bone.start.x;
      const by = bone.end.y - bone.start.y;
      const lenSq = bx * bx + by * by;
      let t = 0;
      let distance: number;

      if (lenSq < 0.0001) {
        distance = Math.hypot(p.x - bone.start.x, p.y - bone.start.y);
      } else {
        t = Math.max(0, Math.min(1,
          ((p.x - bone.start.x) * bx + (p.y - bone.start.y) * by) / lenSq
        ));
        const px = bone.start.x + t * bx;
        const py = bone.start.y + t * by;
        distance = Math.hypot(p.x - px, p.y - py);
      }

      const startWidth = Math.max(4, bone.startWidth ?? 24);
      const endWidth = Math.max(4, bone.endWidth ?? 16);
      const radius = Math.max(3, ((1 - t) * startWidth + t * endWidth) * 0.5);

      // A thin feather beyond the envelope blends connected joints. Distant
      // bones cannot leak across the image. Generations share one prior: the
      // root is strongest, siblings equal, grandchildren weaker.
      const normalized = distance / (radius + 1.5);
      const reach = Math.max(0, 1 - normalized / 1.12);
      const score = Math.pow(reach, safePower) * Math.pow(0.72, depthOf(bone.id));

      if (score > 0) {
        candidates.push({ boneId: bone.id, score, distance, t });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  };

  for (const vertex of mesh.vertices) {
    const candidates = candidatesFor(vertex);

    if (candidates.length === 0) {
      // Deterministic nearest-bone fallback.
      let nearest = bones[0];
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const bone of bones) {
        const d = distToSegment(
          { x: vertex.originalX, y: vertex.originalY },
          bone.start,
          bone.end
        );
        if (d < nearestDistance) {
          nearestDistance = d;
          nearest = bone;
        }
      }
      vertex.weights = [{ boneId: nearest.id, weight: 1 }];
      continue;
    }

    const top = candidates.slice(0, influenceLimit);
    const total = top.reduce((sum, candidate) => sum + candidate.score, 0);

    vertex.weights = top.map((candidate) => ({
      boneId: candidate.boneId,
      weight: candidate.score / Math.max(total, 0.000001),
    }));

    normalizeVertexWeights(vertex, top[0].boneId);
  }
}

/**
 * Infers bone envelopes directly from mesh geometry.
 *
 * This intentionally does not read vertex weights or existing bone widths, so
 * automatic rigging cannot become circular or inherit stale/manual weighting.
 */
export function inferBoneWidthsFromMeshGeometry(mesh: RigMesh, skeleton: Skeleton): void {
  if (mesh.vertices.length === 0 || skeleton.bones.length === 0) return;

  type Sample = { t: number; distance: number };
  const samples = new Map<string, Sample[]>();
  for (const bone of skeleton.bones) samples.set(bone.id, []);

  for (const vertex of mesh.vertices) {
    const p = { x: vertex.originalX, y: vertex.originalY };
    let closest: { bone: typeof skeleton.bones[number]; distance: number; t: number } | null = null;

    for (const bone of skeleton.bones) {
      const bx = bone.end.x - bone.start.x;
      const by = bone.end.y - bone.start.y;
      const lenSq = bx * bx + by * by;
      if (lenSq < 0.0001) continue;

      const t = Math.max(0, Math.min(1,
        ((p.x - bone.start.x) * bx + (p.y - bone.start.y) * by) / lenSq
      ));
      const px = bone.start.x + t * bx;
      const py = bone.start.y + t * by;
      const distance = Math.hypot(p.x - px, p.y - py);

      if (!closest || distance < closest.distance) {
        closest = { bone, distance, t };
      }
    }

    if (closest) samples.get(closest.bone.id)!.push({
      t: closest.t,
      distance: closest.distance,
    });
  }

  const percentile = (values: number[], p: number): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const position = (sorted.length - 1) * Math.max(0, Math.min(1, p));
    const lo = Math.floor(position);
    const hi = Math.ceil(position);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (position - lo);
  };

  for (const bone of skeleton.bones) {
    const data = samples.get(bone.id) ?? [];
    const length = Math.max(8, Math.hypot(
      bone.end.x - bone.start.x,
      bone.end.y - bone.start.y
    ));
    const fallbackRadius = Math.max(6, Math.min(80, length * 0.22));

    // Estimate cross-section independently at each end. Using the 75th
    // percentile rejects sparse outliers while preserving broad artwork.
    const startDistances = data
      .filter((s) => s.t <= 0.35)
      .map((s) => s.distance);
    const endDistances = data
      .filter((s) => s.t >= 0.65)
      .map((s) => s.distance);
    const allDistances = data.map((s) => s.distance);

    const middle = percentile(allDistances, 0.65);
    const startRadius = percentile(startDistances, 0.70) || middle || fallbackRadius;
    const endRadius = percentile(endDistances, 0.70) || middle || fallbackRadius;

    bone.startWidth = Math.max(12, Math.min(320, Math.round(startRadius * 2.15)));
    bone.endWidth = Math.max(8, Math.min(320, Math.round(endRadius * 2.15)));
  }

  // Preserve watertight envelopes at shared joints. This is geometry-only and
  // never consults existing vertex weights.
  for (const parent of skeleton.bones) {
    const children = skeleton.bones.filter((child) => child.parentId === parent.id);
    if (children.length === 0) continue;

    const childAverage = children.reduce(
      (sum, child) => sum + (child.startWidth ?? parent.endWidth ?? 20),
      0
    ) / children.length;
    const jointWidth = Math.round(((parent.endWidth ?? 20) + childAverage) * 0.5);

    parent.endWidth = jointWidth;
    for (const child of children) child.startWidth = jointWidth;
  }

  for (const bone of skeleton.bones) {
    const rest = skeleton.restBones?.[bone.id];
    if (rest) {
      rest.startWidth = bone.startWidth;
      rest.endWidth = bone.endWidth;
    }
  }
}

/**
 * Optimizes bone widths from geometry first, then computes smooth automatic weights.
 * This is retained as the public compatibility entry point for existing callers.
 */
export function optimizeBoneWidthsAndComputeWeights(
  mesh: RigMesh,
  skeleton: Skeleton,
  maxInfluencesPerVertex: number = 4,
  power: number = 2.8
): void {
  if (skeleton.bones.length === 0) return;
  inferBoneWidthsFromMeshGeometry(mesh, skeleton);
  computeAutoWeights(mesh, skeleton, maxInfluencesPerVertex, power);
}

/**
 * Normalizes all vertex weights so the sum of bone weights equals exactly 1.0.
 */
export function normalizeVertexWeights(vertex: Vertex, fallbackBoneId: string): void {
  // Filter out microscopic weights
  vertex.weights = vertex.weights.filter((w) => w.weight > 0.001);
  const total = vertex.weights.reduce((sum, w) => sum + w.weight, 0);

  if (total > 0.0001) {
    for (const w of vertex.weights) {
      w.weight /= total;
    }
  } else {
    vertex.weights = [{ boneId: fallbackBoneId, weight: 1.0 }];
  }
}

/**
 * Applies a radial weight brush stamp to the mesh for a specific bone.
 * Supports:
 * - 'add': adds weight with falloff, re-normalizes
 * - 'subtract': reduces weight, re-normalizes
 * - 'set': blends towards targetWeight
 * - 'smooth': laplacian average with neighboring connected mesh vertices
 */
export function applyWeightBrush(
  mesh: RigMesh,
  brushCenter: { x: number; y: number },
  targetBoneId: string,
  allBoneIds: string[],
  settings: {
    radius: number;
    intensity: number;
    mode: 'add' | 'subtract' | 'smooth' | 'set';
    targetWeight?: number;
  },
  useRestCoords: boolean = true
): boolean {
  if (mesh.vertices.length === 0 || !targetBoneId) return false;

  const { radius, intensity, mode, targetWeight = 1.0 } = settings;
  const radiusSq = radius * radius;
  const fallbackBoneId = allBoneIds[0] || targetBoneId;
  let modified = false;

  // Build vertex neighbor adjacency graph if smoothing
  let adjacency: Map<number, number[]> | null = null;
  if (mode === 'smooth') {
    adjacency = new Map();
    for (let i = 0; i < mesh.vertices.length; i++) adjacency.set(i, []);
    for (const [a, b, c] of mesh.triangles) {
      const na = adjacency.get(a)!;
      const nb = adjacency.get(b)!;
      const nc = adjacency.get(c)!;
      if (!na.includes(b)) na.push(b);
      if (!na.includes(c)) na.push(c);
      if (!nb.includes(a)) nb.push(a);
      if (!nb.includes(c)) nb.push(c);
      if (!nc.includes(a)) nc.push(a);
      if (!nc.includes(b)) nc.push(b);
    }
  }

  // Pre-capture current weights for smooth mode so reads aren't distorted
  const originalWeights = mesh.vertices.map((v) => {
    const found = v.weights.find((w) => w.boneId === targetBoneId);
    return found ? found.weight : 0;
  });

  for (let i = 0; i < mesh.vertices.length; i++) {
    const v = mesh.vertices[i];
    const px = useRestCoords ? v.originalX : v.x;
    const py = useRestCoords ? v.originalY : v.y;

    const dx = px - brushCenter.x;
    const dy = py - brushCenter.y;
    const distSq = dx * dx + dy * dy;

    if (distSq > radiusSq) continue;

    const dist = Math.sqrt(distSq);
    // Smooth cosine bell falloff from center (1.0) to edge (0.0)
    const factor = Math.cos((dist / radius) * (Math.PI * 0.5));
    const step = factor * intensity;

    let targetObj = v.weights.find((w) => w.boneId === targetBoneId);
    if (!targetObj) {
      targetObj = { boneId: targetBoneId, weight: 0 };
      v.weights.push(targetObj);
    }

    if (mode === 'add') {
      targetObj.weight = Math.min(1.0, targetObj.weight + step * 0.25);
    } else if (mode === 'subtract') {
      targetObj.weight = Math.max(0.0, targetObj.weight - step * 0.25);
    } else if (mode === 'set') {
      targetObj.weight = targetObj.weight + (targetWeight - targetObj.weight) * Math.min(1.0, step * 0.4);
    } else if (mode === 'smooth' && adjacency) {
      const neighbors = adjacency.get(i) || [];
      if (neighbors.length > 0) {
        let neighborSum = 0;
        for (const nIdx of neighbors) {
          neighborSum += originalWeights[nIdx];
        }
        const avg = neighborSum / neighbors.length;
        targetObj.weight = targetObj.weight + (avg - targetObj.weight) * Math.min(1.0, step * 0.5);
      }
    }

    normalizeVertexWeights(v, fallbackBoneId);
    modified = true;
  }

  return modified;
}


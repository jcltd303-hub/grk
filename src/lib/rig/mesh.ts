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
  if (skeleton.bones.length === 0) return;

  for (const vertex of mesh.vertices) {
    const p = { x: vertex.originalX, y: vertex.originalY };
    const boneScores: { boneId: string; weight: number }[] = [];

    for (const bone of skeleton.bones) {
      const startWidth = Math.max(2, bone.startWidth ?? 24);
      const endWidth = Math.max(2, bone.endWidth ?? 16);

      // Vector from bone start to end
      const bx = bone.end.x - bone.start.x;
      const by = bone.end.y - bone.start.y;
      const lenSq = bx * bx + by * by;

      let t = 0;
      let dist = 0;

      if (lenSq < 0.0001) {
        dist = Math.hypot(p.x - bone.start.x, p.y - bone.start.y);
      } else {
        t = Math.max(0, Math.min(1, ((p.x - bone.start.x) * bx + (p.y - bone.start.y) * by) / lenSq));
        const projX = bone.start.x + t * bx;
        const projY = bone.start.y + t * by;
        dist = Math.hypot(p.x - projX, p.y - projY);
      }

      // Radius of influence envelope at projection point t
      const radiusAtT = ((1 - t) * startWidth + t * endWidth) * 0.5;

      // Normalized distance relative to envelope radius
      const normalizedDist = dist / (radiusAtT + 2);
      const score = 1 / (Math.pow(normalizedDist, power) + 0.005);

      boneScores.push({ boneId: bone.id, weight: score });
    }

    // Sort descending by score
    boneScores.sort((a, b) => b.weight - a.weight);

    // Keep top N influences
    const topInfluences = boneScores.slice(0, maxInfluencesPerVertex);
    const sum = topInfluences.reduce((acc, curr) => acc + curr.weight, 0);

    if (sum > 0.00001) {
      vertex.weights = topInfluences.map((inf) => ({
        boneId: inf.boneId,
        weight: inf.weight / sum,
      }));
    } else {
      vertex.weights = [{ boneId: skeleton.bones[0].id, weight: 1.0 }];
    }
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

  const measurements = new Map<string, { start: number[]; end: number[]; all: number[] }>();
  for (const bone of skeleton.bones) {
    measurements.set(bone.id, { start: [], end: [], all: [] });
  }

  for (const vertex of mesh.vertices) {
    const p = { x: vertex.originalX, y: vertex.originalY };
    let closestBone: { id: string; distance: number; t: number } | null = null;

    for (const bone of skeleton.bones) {
      const bx = bone.end.x - bone.start.x;
      const by = bone.end.y - bone.start.y;
      const lenSq = bx * bx + by * by;
      if (lenSq < 0.0001) continue;

      const t = Math.max(0, Math.min(1, ((p.x - bone.start.x) * bx + (p.y - bone.start.y) * by) / lenSq));
      const projX = bone.start.x + t * bx;
      const projY = bone.start.y + t * by;
      const distance = Math.hypot(p.x - projX, p.y - projY);

      if (!closestBone || distance < closestBone.distance) {
        closestBone = { id: bone.id, distance, t };
      }
    }

    if (!closestBone) continue;
    const measurement = measurements.get(closestBone.id)!;
    measurement.all.push(closestBone.distance);
    if (closestBone.t <= 0.35) measurement.start.push(closestBone.distance);
    if (closestBone.t >= 0.65) measurement.end.push(closestBone.distance);
  }

  const percentile = (values: number[], p: number): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
    return sorted[index];
  };

  for (const bone of skeleton.bones) {
    const measurement = measurements.get(bone.id)!;
    const length = Math.max(8, Math.hypot(bone.end.x - bone.start.x, bone.end.y - bone.start.y));
    const fallback = Math.min(80, Math.max(12, length * 0.22));
    const middle = percentile(measurement.all, 0.65);
    const startRadius = percentile(measurement.start, 0.65) || middle || fallback * 0.5;
    const endRadius = percentile(measurement.end, 0.65) || middle || fallback * 0.5;

    bone.startWidth = Math.max(12, Math.min(320, Math.round(startRadius * 2.2)));
    bone.endWidth = Math.max(8, Math.min(320, Math.round(endRadius * 2.2)));
  }

  // Keep connected envelopes continuous at joints.
  for (const parent of skeleton.bones) {
    const children = skeleton.bones.filter((child) => child.parentId === parent.id);
    if (children.length === 0) continue;
    const childAverage = children.reduce((sum, child) => sum + (child.startWidth ?? 20), 0) / children.length;
    const jointWidth = Math.round(((parent.endWidth ?? 20) + childAverage) * 0.5);
    parent.endWidth = jointWidth;
    for (const child of children) child.startWidth = jointWidth;
  }

  if (skeleton.restBones) {
    for (const bone of skeleton.bones) {
      if (skeleton.restBones[bone.id]) {
        skeleton.restBones[bone.id] = {
          ...skeleton.restBones[bone.id],
          startWidth: bone.startWidth,
          endWidth: bone.endWidth,
        };
      }
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



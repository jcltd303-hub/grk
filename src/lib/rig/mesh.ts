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
 * Optimizes bone start and end widths to closely cover mesh vertex extents,
 * and then computes smooth auto weights.
 */
export function optimizeBoneWidthsAndComputeWeights(
  mesh: RigMesh,
  skeleton: Skeleton,
  maxInfluencesPerVertex: number = 4,
  power: number = 2.8
): void {
  if (skeleton.bones.length === 0) return;

  // First pass: compute initial weights to know vertex association
  computeAutoWeights(mesh, skeleton, maxInfluencesPerVertex, power);

  // Second pass: for each bone, find associated vertices and calculate tight enclosing widths
  for (const bone of skeleton.bones) {
    const bx = bone.end.x - bone.start.x;
    const by = bone.end.y - bone.start.y;
    const lenSq = bx * bx + by * by;
    const len = Math.hypot(bx, by);
    if (len < 0.001) continue;

    let startDistMax = 0;
    let startCount = 0;
    let endDistMax = 0;
    let endCount = 0;

    for (const v of mesh.vertices) {
      const p = { x: v.originalX, y: v.originalY };
      const influence = v.weights.find((w) => w.boneId === bone.id);
      if (!influence || influence.weight < 0.12) continue;

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

      if (t <= 0.5) {
        startDistMax = Math.max(startDistMax, dist);
        startCount++;
      } else {
        endDistMax = Math.max(endDistMax, dist);
        endCount++;
      }
    }

    const defaultStart = Math.min(120, Math.max(20, len * 0.35));
    const defaultEnd = Math.min(100, Math.max(16, len * 0.25));

    const measuredStart = startCount > 0 ? startDistMax * 2 * 1.35 : defaultStart;
    const measuredEnd = endCount > 0 ? endDistMax * 2 * 1.35 : defaultEnd;

    bone.startWidth = Math.max(10, Math.min(400, Math.round(measuredStart)));
    bone.endWidth = Math.max(8, Math.min(400, Math.round(measuredEnd)));
  }

  // Third pass: recompute auto weights with the newly optimized bone widths
  computeAutoWeights(mesh, skeleton, maxInfluencesPerVertex, power);
}


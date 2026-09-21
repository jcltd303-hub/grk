import { Bone, Skeleton, Point2D, RigMesh, Vertex } from './types';
import { normalizeAngle } from './math';

export function updateWorldTransforms(skeleton: Skeleton): void {
  const boneMap = new Map<string, Bone>();
  skeleton.bones.forEach((b) => boneMap.set(b.id, b));

  function computeBone(bone: Bone) {
    if (!bone.parentId) {
      // Root bone starts at skeleton.rootPos
      bone.start = { ...skeleton.rootPos };
      bone.worldAngle = bone.localAngle;
      bone.end = {
        x: bone.start.x + Math.cos(bone.worldAngle) * bone.length,
        y: bone.start.y + Math.sin(bone.worldAngle) * bone.length,
      };
    } else {
      const parent = boneMap.get(bone.parentId);
      if (parent) {
        bone.start = { ...parent.end };
        bone.worldAngle = normalizeAngle(parent.worldAngle + bone.localAngle);
        bone.end = {
          x: bone.start.x + Math.cos(bone.worldAngle) * bone.length,
          y: bone.start.y + Math.sin(bone.worldAngle) * bone.length,
        };
      }
    }
  }

  // Traverse hierarchy in topological order
  const visited = new Set<string>();
  function visit(boneId: string) {
    if (visited.has(boneId)) return;
    const bone = boneMap.get(boneId);
    if (!bone) return;
    if (bone.parentId) visit(bone.parentId);
    computeBone(bone);
    visited.add(boneId);
  }

  skeleton.bones.forEach((b) => visit(b.id));
}

export interface BoneTransformMatrix {
  cos: number;
  sin: number;
  tx: number;
  ty: number;
}

/**
 * Calculates the delta transform matrix from rest pose to current pose for each bone.
 */
export function computeBoneDeltaTransforms(
  skeleton: Skeleton,
  restSkeleton: Skeleton
): Map<string, BoneTransformMatrix> {
  const transforms = new Map<string, BoneTransformMatrix>();
  const restBoneMap = new Map<string, Bone>();
  restSkeleton.bones.forEach((b) => restBoneMap.set(b.id, b));

  for (const bone of skeleton.bones) {
    const restBone = restBoneMap.get(bone.id);
    if (!restBone) continue;

    // Relative rotation between current bone and rest bone
    const dTheta = bone.worldAngle - restBone.worldAngle;
    const cos = Math.cos(dTheta);
    const sin = Math.sin(dTheta);

    // Bone origin shifts:
    // P_current = bone.start + R(dTheta) * (P_rest - restBone.start)
    // P_current = R * P_rest + (bone.start - R * restBone.start)
    const tx = bone.start.x - (cos * restBone.start.x - sin * restBone.start.y);
    const ty = bone.start.y - (sin * restBone.start.x + cos * restBone.start.y);

    transforms.set(bone.id, { cos, sin, tx, ty });
  }

  return transforms;
}

/**
 * Deforms mesh vertices according to Linear Blend Skinning (LBS).
 */
export function deformMesh(mesh: RigMesh, boneTransforms: Map<string, BoneTransformMatrix>): void {
  for (const vertex of mesh.vertices) {
    if (vertex.weights.length === 0) {
      vertex.x = vertex.originalX;
      vertex.y = vertex.originalY;
      continue;
    }

    let dx = 0;
    let dy = 0;
    let totalWeight = 0;

    for (const { boneId, weight } of vertex.weights) {
      const transform = boneTransforms.get(boneId);
      if (!transform || weight <= 0) continue;

      const px = transform.cos * vertex.originalX - transform.sin * vertex.originalY + transform.tx;
      const py = transform.sin * vertex.originalX + transform.cos * vertex.originalY + transform.ty;

      dx += px * weight;
      dy += py * weight;
      totalWeight += weight;
    }

    if (totalWeight > 0.0001) {
      vertex.x = dx / totalWeight;
      vertex.y = dy / totalWeight;
    } else {
      vertex.x = vertex.originalX;
      vertex.y = vertex.originalY;
    }
  }
}

export function cloneSkeleton(skel: Skeleton): Skeleton {
  return {
    bones: skel.bones.map((b) => ({
      ...b,
      start: { ...b.start },
      end: { ...b.end },
    })),
    rootId: skel.rootId,
    rootPos: { ...skel.rootPos },
    restRootPos: { ...skel.restRootPos },
    restBones: { ...skel.restBones },
  };
}

export function getBoneChainToRoot(skeleton: Skeleton, endBoneId: string): Bone[] {
  const chain: Bone[] = [];
  const map = new Map<string, Bone>();
  skeleton.bones.forEach((b) => map.set(b.id, b));

  let current: Bone | undefined = map.get(endBoneId);
  while (current) {
    chain.push(current);
    if (!current.parentId) break;
    current = map.get(current.parentId);
  }
  return chain;
}

/**
 * Resets all mesh vertices to their original, undeformed rest positions.
 * Ensures the character artwork never bends or distorts while in Rig mode.
 */
export function resetMeshToRest(mesh: RigMesh): void {
  for (const vertex of mesh.vertices) {
    vertex.x = vertex.originalX;
    vertex.y = vertex.originalY;
  }
}

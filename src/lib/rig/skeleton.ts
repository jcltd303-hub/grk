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
 * Checks if candidateParentId is a descendant of boneId (to prevent cyclic parenting).
 */
export function isDescendantOf(skeleton: Skeleton, candidateParentId: string, boneId: string): boolean {
  if (candidateParentId === boneId) return true;
  const map = new Map<string, Bone>();
  skeleton.bones.forEach((b) => map.set(b.id, b));

  let curr = map.get(candidateParentId);
  while (curr) {
    if (curr.id === boneId) return true;
    if (!curr.parentId) break;
    curr = map.get(curr.parentId);
  }
  return false;
}

/**
 * Reparents a bone to a new parent while preserving world orientation and position.
 */
export function reparentBone(skeleton: Skeleton, boneId: string, newParentId: string | null): boolean {
  const bone = skeleton.bones.find((b) => b.id === boneId);
  if (!bone) return false;
  if (bone.parentId === newParentId) return false;

  // Cannot parent to self or any descendant
  if (newParentId && isDescendantOf(skeleton, newParentId, boneId)) {
    return false;
  }

  const map = new Map<string, Bone>();
  skeleton.bones.forEach((b) => map.set(b.id, b));

  const currentWorldAngle = bone.worldAngle;

  if (!newParentId) {
    // Becoming a root bone: localAngle becomes worldAngle
    bone.parentId = null;
    bone.localAngle = currentWorldAngle;
  } else {
    const newParent = map.get(newParentId);
    if (!newParent) return false;
    bone.parentId = newParentId;
    bone.localAngle = normalizeAngle(currentWorldAngle - newParent.worldAngle);
  }

  updateWorldTransforms(skeleton);
  return true;
}

/**
 * Mirrors a bone or branch across the character vertical midline (center X).
 */
export function mirrorBone(
  skeleton: Skeleton,
  boneId: string,
  centerX: number
): Bone | null {
  const sourceBone = skeleton.bones.find((b) => b.id === boneId);
  if (!sourceBone) return null;

  // Mirrored local angle flips sign across Y-axis
  // In world coords: newStart.x = 2*centerX - sourceBone.start.x
  // newEnd.x = 2*centerX - sourceBone.end.x
  const newStartX = 2 * centerX - sourceBone.start.x;
  const newStartY = sourceBone.start.y;
  const newEndX = 2 * centerX - sourceBone.end.x;
  const newEndY = sourceBone.end.y;

  const dx = newEndX - newStartX;
  const dy = newEndY - newStartY;
  const mirroredWorldAngle = Math.atan2(dy, dx);

  // Generate mirrored name (swap Left/Right or L/R tags)
  let mirroredName = sourceBone.name;
  if (mirroredName.includes('_L')) mirroredName = mirroredName.replace('_L', '_R');
  else if (mirroredName.includes('_R')) mirroredName = mirroredName.replace('_R', '_L');
  else if (mirroredName.toLowerCase().includes('left')) mirroredName = mirroredName.replace(/left/i, 'Right');
  else if (mirroredName.toLowerCase().includes('right')) mirroredName = mirroredName.replace(/right/i, 'Left');
  else mirroredName = `${mirroredName}_Mirrored`;

  // Find mirrored parent if parent exists
  let newParentId = sourceBone.parentId;
  if (sourceBone.parentId) {
    const sourceParent = skeleton.bones.find((b) => b.id === sourceBone.parentId);
    if (sourceParent) {
      // Check if there is already a mirrored version of the parent
      const mirroredParent = skeleton.bones.find(
        (b) =>
          b.id !== sourceParent.id &&
          (b.name.replace(/_R|_L|Left|Right/i, '') === sourceParent.name.replace(/_R|_L|Left|Right/i, ''))
      );
      if (mirroredParent) newParentId = mirroredParent.id;
    }
  }

  const parentBone = newParentId ? skeleton.bones.find((b) => b.id === newParentId) : null;
  const mirroredLocalAngle = parentBone
    ? normalizeAngle(mirroredWorldAngle - parentBone.worldAngle)
    : mirroredWorldAngle;

  const newBone: Bone = {
    id: `bone_mir_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: mirroredName,
    parentId: newParentId,
    localAngle: mirroredLocalAngle,
    length: sourceBone.length,
    startWidth: sourceBone.startWidth,
    endWidth: sourceBone.endWidth,
    color: sourceBone.color,
    start: { x: newStartX, y: newStartY },
    end: { x: newEndX, y: newEndY },
    worldAngle: mirroredWorldAngle,
    isIKTarget: sourceBone.isIKTarget,
    isPinned: sourceBone.isPinned,
  };

  skeleton.bones.push(newBone);
  skeleton.restBones[newBone.id] = { localAngle: newBone.localAngle, length: newBone.length };
  updateWorldTransforms(skeleton);

  return newBone;
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

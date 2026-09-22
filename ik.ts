import { Skeleton, Point2D, Bone } from './types';
import { updateWorldTransforms, getBoneChainToRoot } from './skeleton';
import { angleBetween, distance, normalizeAngle } from './math';

/**
 * Solves 2D Inverse Kinematics using CCD (Cyclic Coordinate Descent).
 * @param skeleton The skeleton to update in-place
 * @param effectorBoneId The tip bone ID being dragged
 * @param target The target world position
 * @param chainLength How many bones upwards in hierarchy to adjust (default 2 or 3)
 * @param iterations Maximum iterations to converge (default 10)
 * @param tolerance Distance threshold to stop solving (default 1px)
 */
export function solveCCD2D(
  skeleton: Skeleton,
  effectorBoneId: string,
  target: Point2D,
  chainLength: number = 3,
  iterations: number = 12,
  tolerance: number = 1.5
): boolean {
  const fullChain = getBoneChainToRoot(skeleton, effectorBoneId);
  if (fullChain.length === 0) return false;

  // Take up to chainLength bones from effector upwards
  const activeChain = fullChain.slice(0, Math.min(chainLength, fullChain.length));
  const boneMap = new Map<string, Bone>();
  skeleton.bones.forEach((b) => boneMap.set(b.id, b));

  const effector = activeChain[0];

  for (let iter = 0; iter < iterations; iter++) {
    updateWorldTransforms(skeleton);

    const currentEffectorPos = effector.end;
    if (distance(currentEffectorPos, target) <= tolerance) {
      return true;
    }

    // Traverse from effector parent up to root of chain
    for (const bone of activeChain) {
      // If bone is pinned (immobile), it cannot be rotated by IK
      if (bone.isPinned) {
        continue;
      }

      const bonePivot = bone.start;
      const toEffector = angleBetween(bonePivot, effector.end);
      const toTarget = angleBetween(bonePivot, target);
      const deltaAngle = normalizeAngle(toTarget - toEffector);

      // Apply delta rotation to bone's localAngle
      bone.localAngle = normalizeAngle(bone.localAngle + deltaAngle);

      // Apply optional angle constraints if present
      if (bone.minAngle !== undefined && bone.maxAngle !== undefined) {
        bone.localAngle = Math.max(bone.minAngle, Math.min(bone.maxAngle, bone.localAngle));
      }

      updateWorldTransforms(skeleton);

      if (distance(effector.end, target) <= tolerance) {
        return true;
      }
    }
  }

  return distance(effector.end, target) <= tolerance;
}

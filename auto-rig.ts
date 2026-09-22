import { Bone, Point2D, PresetType, RigMesh, Skeleton } from './types';
import { normalizeAngle, distToSegment } from './math';
import { updateWorldTransforms, cloneSkeleton } from './skeleton';
import { computeAutoWeights } from './mesh';

export interface SilhouetteInfo {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  charW: number;
  charH: number;
  centerX: number;
  centerY: number;
  centroidX: number;
  centroidY: number;
  detectedType: PresetType;
  slices: Array<{
    y: number;
    minX: number;
    maxX: number;
    centerX: number;
    width: number;
    count: number;
    spans: Array<{ start: number; end: number; center: number; width: number }>;
  }>;
}

/**
 * Analyzes an alpha mask (or mesh vertices) to extract character bounding box,
 * horizontal slices, limb protrusions, and morphological character type.
 */
export function analyzeSilhouette(
  width: number,
  height: number,
  alphaMask?: Uint8Array | null,
  mesh?: RigMesh | null,
  preferredType?: PresetType
): SilhouetteInfo {
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let sumX = 0;
  let sumY = 0;
  let totalCount = 0;

  if (alphaMask && alphaMask.length === width * height) {
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        if (alphaMask[rowOffset + x] >= 20) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          sumX += x;
          sumY += y;
          totalCount++;
        }
      }
    }
  } else if (mesh && mesh.vertices.length > 0) {
    for (const v of mesh.vertices) {
      const x = v.originalX;
      const y = v.originalY;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      sumX += x;
      sumY += y;
      totalCount++;
    }
  }

  // Fallback if empty or failed detection
  if (totalCount === 0 || maxX <= minX || maxY <= minY) {
    minX = Math.round(width * 0.15);
    maxX = Math.round(width * 0.85);
    minY = Math.round(height * 0.08);
    maxY = Math.round(height * 0.92);
    sumX = ((minX + maxX) / 2) * 100;
    sumY = ((minY + maxY) / 2) * 100;
    totalCount = 100;
  }

  const charW = Math.max(20, maxX - minX);
  const charH = Math.max(30, maxY - minY);
  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  const centroidX = sumX / totalCount;
  const centroidY = sumY / totalCount;

  // Horizontal Slices Analysis
  const sliceCount = 36;
  const slices: SilhouetteInfo['slices'] = [];
  const sliceHeight = charH / sliceCount;

  for (let s = 0; s < sliceCount; s++) {
    const y = Math.min(height - 1, Math.round(minY + (s + 0.5) * sliceHeight));
    let sMinX = width;
    let sMaxX = 0;
    let sSumX = 0;
    let sCount = 0;
    const spans: Array<{ start: number; end: number; center: number; width: number }> = [];

    if (alphaMask && alphaMask.length === width * height) {
      let inSpan = false;
      let spanStart = 0;
      const rowOffset = y * width;

      for (let x = 0; x < width; x++) {
        const isOpaque = alphaMask[rowOffset + x] >= 20;
        if (isOpaque) {
          if (!inSpan) {
            inSpan = true;
            spanStart = x;
          }
          if (x < sMinX) sMinX = x;
          if (x > sMaxX) sMaxX = x;
          sSumX += x;
          sCount++;
        } else if (inSpan) {
          inSpan = false;
          const sEnd = x - 1;
          spans.push({
            start: spanStart,
            end: sEnd,
            center: (spanStart + sEnd) * 0.5,
            width: sEnd - spanStart + 1,
          });
        }
      }
      if (inSpan) {
        const sEnd = width - 1;
        spans.push({
          start: spanStart,
          end: sEnd,
          center: (spanStart + sEnd) * 0.5,
          width: sEnd - spanStart + 1,
        });
      }
    } else if (mesh && mesh.vertices.length > 0) {
      const halfH = Math.max(1, sliceHeight * 0.7);
      for (const v of mesh.vertices) {
        if (Math.abs(v.originalY - y) <= halfH) {
          if (v.originalX < sMinX) sMinX = v.originalX;
          if (v.originalX > sMaxX) sMaxX = v.originalX;
          sSumX += v.originalX;
          sCount++;
        }
      }
      if (sCount > 0) {
        spans.push({
          start: sMinX,
          end: sMaxX,
          center: sSumX / sCount,
          width: sMaxX - sMinX,
        });
      }
    }

    if (sCount === 0) {
      sMinX = centerX;
      sMaxX = centerX;
      sSumX = centerX;
    }

    slices.push({
      y,
      minX: sMinX,
      maxX: sMaxX,
      centerX: sCount > 0 ? sSumX / sCount : centerX,
      width: Math.max(0, sMaxX - sMinX),
      count: sCount,
      spans,
    });
  }

  // Morphological classification
  let detectedType: PresetType = preferredType || 'human';
  if (!preferredType) {
    const aspectRatio = charW / charH;
    if (aspectRatio > 1.3) {
      let multiSpanCount = 0;
      for (let s = Math.floor(sliceCount * 0.6); s < sliceCount; s++) {
        if (slices[s].spans.length >= 2) multiSpanCount++;
      }
      detectedType = multiSpanCount >= 4 ? 'quadruped' : 'fish';
    } else {
      detectedType = 'human';
    }
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    charW,
    charH,
    centerX,
    centerY,
    centroidX,
    centroidY,
    detectedType,
    slices,
  };
}

/**
 * Creates a bone definition and computes local angles and lengths.
 */
function makeBone(
  id: string,
  name: string,
  parentId: string | null,
  start: Point2D,
  end: Point2D,
  parentWorldAngle: number = 0,
  color: string = '#38bdf8',
  isIKTarget: boolean = false
): { bone: Bone; worldAngle: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(8, Math.hypot(dx, dy));
  const worldAngle = Math.atan2(dy, dx);
  const localAngle = parentId !== null ? normalizeAngle(worldAngle - parentWorldAngle) : worldAngle;

  const bone: Bone = {
    id,
    name,
    parentId,
    localAngle,
    length,
    color,
    start: { ...start },
    end: { ...end },
    worldAngle,
    startWidth: 26,
    endWidth: 18,
    isIKTarget,
  };

  return { bone, worldAngle };
}

/**
 * Automatically generates and places an anatomically fitted skeleton for any artwork.
 */
export function autoGenerateSkeleton(
  width: number,
  height: number,
  alphaMask?: Uint8Array | null,
  mesh?: RigMesh | null,
  preferredType?: PresetType
): Skeleton {
  const info = analyzeSilhouette(width, height, alphaMask, mesh, preferredType);
  const type = preferredType || info.detectedType;

  switch (type) {
    case 'quadruped':
      return buildQuadrupedSkeleton(info, width, height);
    case 'fish':
      return buildFishSkeleton(info, width, height);
    case 'biped':
      return buildBipedSkeleton(info, width, height);
    case 'human':
    default:
      return buildHumanSkeleton(info, width, height);
  }
}

/**
 * Generates an anatomically fitted Humanoid skeleton.
 */
function buildHumanSkeleton(info: SilhouetteInfo, _w: number, _h: number): Skeleton {
  const { minX, maxX, minY, maxY, charW, charH, centerX, slices } = info;

  // 1. Head and Neck
  const headTopY = minY + charH * 0.02;
  const headSlice = slices.find((s) => s.y >= minY + charH * 0.08) || slices[2];
  const headBaseY = minY + charH * 0.17;
  const neckBaseY = minY + charH * 0.22;
  const headX = headSlice ? headSlice.centerX : centerX;

  // 2. Torso / Chest / Pelvis
  const chestTopY = neckBaseY;
  const chestSlice = slices.find((s) => s.y >= minY + charH * 0.28) || slices[8];
  const chestX = chestSlice ? chestSlice.centerX : centerX;

  // Detect pelvic hub (where legs split or mid-torso base)
  let legSplitY = minY + charH * 0.52;
  for (let s = Math.floor(slices.length * 0.4); s < Math.floor(slices.length * 0.75); s++) {
    if (slices[s].spans.length >= 2) {
      legSplitY = slices[s].y;
      break;
    }
  }
  const pelvicHubY = Math.max(minY + charH * 0.42, Math.min(minY + charH * 0.58, legSplitY));
  const pelvisSlice = slices.find((s) => s.y >= pelvicHubY) || slices[15];
  const pelvicX = pelvisSlice ? pelvisSlice.centerX : centerX;
  const pelvisStartY = Math.min(maxY - charH * 0.35, pelvicHubY + charH * 0.08);

  const pelvicHub: Point2D = { x: pelvicX, y: pelvicHubY };
  const pelvisStart: Point2D = { x: pelvicX, y: pelvisStartY };
  const shoulderHub: Point2D = { x: chestX, y: chestTopY };
  const neckTop: Point2D = { x: headX, y: headBaseY };
  const headTop: Point2D = { x: headX, y: headTopY };

  // 3. Arms Detection
  let leftHandX = minX;
  let leftHandY = minY + charH * 0.45;
  let rightHandX = maxX;
  let rightHandY = minY + charH * 0.45;

  for (let s = Math.floor(slices.length * 0.22); s < Math.floor(slices.length * 0.65); s++) {
    const sl = slices[s];
    if (sl.minX < leftHandX + 5) {
      leftHandX = sl.minX;
      leftHandY = sl.y;
    }
    if (sl.maxX > rightHandX - 5) {
      rightHandX = sl.maxX;
      rightHandY = sl.y;
    }
  }

  const torsoHalfW = Math.max(16, (chestSlice?.width || charW * 0.4) * 0.48);

  // Left Arm (Screen Left)
  const leftShoulderX = chestX - torsoHalfW;
  const leftHandExtremityX = Math.min(leftShoulderX - 10, leftHandX + 8);
  const leftHandPos: Point2D = { x: leftHandExtremityX, y: Math.max(shoulderHub.y + 20, leftHandY) };
  const leftElbowPos: Point2D = {
    x: (leftShoulderX + leftHandPos.x) * 0.5 - 6,
    y: (shoulderHub.y + leftHandPos.y) * 0.5,
  };

  // Right Arm (Screen Right)
  const rightShoulderX = chestX + torsoHalfW;
  const rightHandExtremityX = Math.max(rightShoulderX + 10, rightHandX - 8);
  const rightHandPos: Point2D = { x: rightHandExtremityX, y: Math.max(shoulderHub.y + 20, rightHandY) };
  const rightElbowPos: Point2D = {
    x: (rightShoulderX + rightHandPos.x) * 0.5 + 6,
    y: (shoulderHub.y + rightHandPos.y) * 0.5,
  };

  // 4. Legs Detection
  let leftFootX = centerX - charW * 0.18;
  let rightFootX = centerX + charW * 0.18;
  const footY = maxY - Math.max(6, charH * 0.02);

  for (let s = slices.length - 1; s >= Math.floor(slices.length * 0.75); s--) {
    const sl = slices[s];
    if (sl.spans.length >= 2) {
      leftFootX = sl.spans[0].center;
      rightFootX = sl.spans[sl.spans.length - 1].center;
      break;
    }
  }

  const leftHipX = pelvicX - torsoHalfW * 0.45;
  const rightHipX = pelvicX + torsoHalfW * 0.45;

  const leftFootPos: Point2D = { x: leftFootX, y: footY };
  const leftKneePos: Point2D = {
    x: (leftHipX + leftFootX) * 0.5 - 4,
    y: pelvicHub.y + (footY - pelvicHub.y) * 0.5,
  };

  const rightFootPos: Point2D = { x: rightFootX, y: footY };
  const rightKneePos: Point2D = {
    x: (rightHipX + rightFootX) * 0.5 + 4,
    y: pelvicHub.y + (footY - pelvicHub.y) * 0.5,
  };

  // Assemble Bone Hierarchy
  const bones: Bone[] = [];

  // Pelvis (root)
  const { bone: root, worldAngle: rootAng } = makeBone(
    'root',
    'Pelvis',
    null,
    pelvisStart,
    pelvicHub,
    0,
    '#38bdf8',
    false
  );
  bones.push(root);

  // Spine & Chest
  const { bone: chest, worldAngle: chestAng } = makeBone(
    'chest',
    'Chest',
    'root',
    pelvicHub,
    shoulderHub,
    rootAng,
    '#0284c7',
    false
  );
  bones.push(chest);

  // Neck & Head
  const { bone: neck, worldAngle: neckAng } = makeBone(
    'neck',
    'Neck',
    'chest',
    shoulderHub,
    neckTop,
    chestAng,
    '#7dd3fc',
    false
  );
  bones.push(neck);

  const { bone: head } = makeBone(
    'head',
    'Head',
    'neck',
    neckTop,
    headTop,
    neckAng,
    '#fbbf24',
    true
  );
  bones.push(head);

  // Left Arm
  const { bone: armL, worldAngle: armLAng } = makeBone(
    'upper_arm_l',
    'UpperArm.L',
    'chest',
    shoulderHub,
    leftElbowPos,
    chestAng,
    '#f43f5e',
    false
  );
  bones.push(armL);

  const { bone: farmL } = makeBone(
    'forearm_l',
    'Forearm.L',
    'upper_arm_l',
    leftElbowPos,
    leftHandPos,
    armLAng,
    '#fb7185',
    true
  );
  bones.push(farmL);

  // Right Arm
  const { bone: armR, worldAngle: armRAng } = makeBone(
    'upper_arm_r',
    'UpperArm.R',
    'chest',
    shoulderHub,
    rightElbowPos,
    chestAng,
    '#10b981',
    false
  );
  bones.push(armR);

  const { bone: farmR } = makeBone(
    'forearm_r',
    'Forearm.R',
    'upper_arm_r',
    rightElbowPos,
    rightHandPos,
    armRAng,
    '#34d399',
    true
  );
  bones.push(farmR);

  // Left Leg
  const { bone: thighL, worldAngle: thighLAng } = makeBone(
    'thigh_l',
    'Thigh.L',
    'root',
    pelvicHub,
    leftKneePos,
    rootAng,
    '#a855f7',
    false
  );
  bones.push(thighL);

  const { bone: shinL } = makeBone(
    'shin_l',
    'Shin.L',
    'thigh_l',
    leftKneePos,
    leftFootPos,
    thighLAng,
    '#c084fc',
    true
  );
  bones.push(shinL);

  // Right Leg
  const { bone: thighR, worldAngle: thighRAng } = makeBone(
    'thigh_r',
    'Thigh.R',
    'root',
    pelvicHub,
    rightKneePos,
    rootAng,
    '#eab308',
    false
  );
  bones.push(thighR);

  const { bone: shinR } = makeBone(
    'shin_r',
    'Shin.R',
    'thigh_r',
    rightKneePos,
    rightFootPos,
    thighRAng,
    '#fde047',
    true
  );
  bones.push(shinR);

  const restBones: Record<string, { localAngle: number; length: number; startWidth?: number; endWidth?: number }> = {};
  bones.forEach((b) => (restBones[b.id] = { localAngle: b.localAngle, length: b.length }));

  const skel: Skeleton = {
    bones,
    rootId: 'root',
    rootPos: { ...pelvisStart },
    restRootPos: { ...pelvisStart },
    restBones,
  };

  updateWorldTransforms(skel);
  return skel;
}

/**
 * Generates an anatomically fitted Mech Biped skeleton.
 */
function buildBipedSkeleton(info: SilhouetteInfo, _w: number, _h: number): Skeleton {
  const { minX, maxX, minY, maxY, charW, charH, centerX } = info;

  const chassisY = minY + charH * 0.46;
  const chassisStart: Point2D = { x: centerX, y: chassisY + charH * 0.1 };
  const chassisEnd: Point2D = { x: centerX, y: chassisY };
  const headEnd: Point2D = { x: centerX, y: minY + charH * 0.05 };

  const bones: Bone[] = [];
  const { bone: root, worldAngle: rootAng } = makeBone('root', 'Chassis', null, chassisStart, chassisEnd, 0, '#10b981', false);
  bones.push(root);

  const { bone: head } = makeBone('head', 'SensorHead', 'root', chassisEnd, headEnd, rootAng, '#34d399', true);
  bones.push(head);

  // Left Arm & Claw
  const armL_End: Point2D = { x: minX + charW * 0.15, y: chassisY + charH * 0.1 };
  const clawL_End: Point2D = { x: minX + 8, y: chassisY + charH * 0.25 };
  const { bone: armL, worldAngle: armLAng } = makeBone('arm_l', 'Arm.L', 'root', chassisEnd, armL_End, rootAng, '#f43f5e', false);
  bones.push(armL);
  const { bone: clawL } = makeBone('claw_l', 'Claw.L', 'arm_l', armL_End, clawL_End, armLAng, '#fb7185', true);
  bones.push(clawL);

  // Right Arm & Claw
  const armR_End: Point2D = { x: maxX - charW * 0.15, y: chassisY + charH * 0.1 };
  const clawR_End: Point2D = { x: maxX - 8, y: chassisY + charH * 0.25 };
  const { bone: armR, worldAngle: armRAng } = makeBone('arm_r', 'Arm.R', 'root', chassisEnd, armR_End, rootAng, '#06b6d4', false);
  bones.push(armR);
  const { bone: clawR } = makeBone('claw_r', 'Claw.R', 'arm_r', armR_End, clawR_End, armRAng, '#22d3ee', true);
  bones.push(clawR);

  // Left Leg & Foot
  const footY = maxY - 6;
  const legL_End: Point2D = { x: centerX - charW * 0.22, y: chassisY + (footY - chassisY) * 0.5 };
  const footL_End: Point2D = { x: centerX - charW * 0.25, y: footY };
  const { bone: legL, worldAngle: legLAng } = makeBone('leg_l', 'Piston.L', 'root', chassisEnd, legL_End, rootAng, '#8b5cf6', false);
  bones.push(legL);
  const { bone: footL } = makeBone('foot_l', 'Foot.L', 'leg_l', legL_End, footL_End, legLAng, '#a78bfa', true);
  bones.push(footL);

  // Right Leg & Foot
  const legR_End: Point2D = { x: centerX + charW * 0.22, y: chassisY + (footY - chassisY) * 0.5 };
  const footR_End: Point2D = { x: centerX + charW * 0.25, y: footY };
  const { bone: legR, worldAngle: legRAng } = makeBone('leg_r', 'Piston.R', 'root', chassisEnd, legR_End, rootAng, '#f59e0b', false);
  bones.push(legR);
  const { bone: footR } = makeBone('foot_r', 'Foot.R', 'leg_r', legR_End, footR_End, legRAng, '#fbbf24', true);
  bones.push(footR);

  const restBones: Record<string, { localAngle: number; length: number; startWidth?: number; endWidth?: number }> = {};
  bones.forEach((b) => (restBones[b.id] = { localAngle: b.localAngle, length: b.length }));

  const skel: Skeleton = {
    bones,
    rootId: 'root',
    rootPos: { ...chassisStart },
    restRootPos: { ...chassisStart },
    restBones,
  };

  updateWorldTransforms(skel);
  return skel;
}

/**
 * Generates an anatomically fitted Quadruped (Beast) skeleton.
 */
function buildQuadrupedSkeleton(info: SilhouetteInfo, _w: number, _h: number): Skeleton {
  const { minX, maxX, minY, maxY, charW, charH } = info;

  const pelvisPos: Point2D = { x: minX + charW * 0.35, y: minY + charH * 0.44 };
  const chestPos: Point2D = { x: minX + charW * 0.68, y: minY + charH * 0.42 };
  const neckPos: Point2D = { x: minX + charW * 0.82, y: minY + charH * 0.30 };
  const headPos: Point2D = { x: maxX - 8, y: minY + charH * 0.22 };
  const tailPos: Point2D = { x: minX + 8, y: minY + charH * 0.32 };
  const pawY = maxY - 6;

  const bones: Bone[] = [];
  const { bone: pelvis, worldAngle: pelvAng } = makeBone('pelvis', 'Pelvis', null, pelvisPos, chestPos, 0, '#8b5cf6', false);
  bones.push(pelvis);

  const { bone: spine, worldAngle: spineAng } = makeBone('spine', 'Chest', 'pelvis', chestPos, neckPos, pelvAng, '#6366f1', false);
  bones.push(spine);

  const { bone: neck, worldAngle: neckAng } = makeBone('neck', 'Neck', 'spine', neckPos, headPos, spineAng, '#06b6d4', false);
  bones.push(neck);

  const { bone: head } = makeBone('head', 'Head', 'neck', headPos, { x: maxX, y: headPos.y - 10 }, neckAng, '#10b981', true);
  bones.push(head);

  const { bone: tail } = makeBone('tail', 'Tail', 'pelvis', pelvisPos, tailPos, pelvAng, '#ec4899', true);
  bones.push(tail);

  // Front Legs
  const frontKneeY = chestPos.y + (pawY - chestPos.y) * 0.5;
  const legFL_Mid: Point2D = { x: chestPos.x - 12, y: frontKneeY };
  const footFL: Point2D = { x: chestPos.x - 14, y: pawY };
  const { bone: legFL, worldAngle: flAng } = makeBone('leg_fl', 'FrontLeg.L', 'spine', chestPos, legFL_Mid, spineAng, '#f43f5e', false);
  bones.push(legFL);
  const { bone: footFLBone } = makeBone('foot_fl', 'FrontPaw.L', 'leg_fl', legFL_Mid, footFL, flAng, '#fb7185', true);
  bones.push(footFLBone);

  const legFR_Mid: Point2D = { x: chestPos.x + 14, y: frontKneeY };
  const footFR: Point2D = { x: chestPos.x + 16, y: pawY };
  const { bone: legFR, worldAngle: frAng } = makeBone('leg_fr', 'FrontLeg.R', 'spine', chestPos, legFR_Mid, spineAng, '#14b8a6', false);
  bones.push(legFR);
  const { bone: footFRBone } = makeBone('foot_fr', 'FrontPaw.R', 'leg_fr', legFR_Mid, footFR, frAng, '#2dd4bf', true);
  bones.push(footFRBone);

  // Back Legs
  const backKneeY = pelvisPos.y + (pawY - pelvisPos.y) * 0.5;
  const legBL_Mid: Point2D = { x: pelvisPos.x - 14, y: backKneeY };
  const footBL: Point2D = { x: pelvisPos.x - 16, y: pawY };
  const { bone: legBL, worldAngle: blAng } = makeBone('leg_bl', 'BackLeg.L', 'pelvis', pelvisPos, legBL_Mid, pelvAng, '#a855f7', false);
  bones.push(legBL);
  const { bone: footBLBone } = makeBone('foot_bl', 'BackPaw.L', 'leg_bl', legBL_Mid, footBL, blAng, '#c084fc', true);
  bones.push(footBLBone);

  const legBR_Mid: Point2D = { x: pelvisPos.x + 12, y: backKneeY };
  const footBR: Point2D = { x: pelvisPos.x + 14, y: pawY };
  const { bone: legBR, worldAngle: brAng } = makeBone('leg_br', 'BackLeg.R', 'pelvis', pelvisPos, legBR_Mid, pelvAng, '#eab308', false);
  bones.push(legBR);
  const { bone: footBRBone } = makeBone('foot_br', 'BackPaw.R', 'leg_br', legBR_Mid, footBR, brAng, '#fde047', true);
  bones.push(footBRBone);

  const restBones: Record<string, { localAngle: number; length: number; startWidth?: number; endWidth?: number }> = {};
  bones.forEach((b) => (restBones[b.id] = { localAngle: b.localAngle, length: b.length }));

  const skel: Skeleton = {
    bones,
    rootId: 'pelvis',
    rootPos: { ...pelvisPos },
    restRootPos: { ...pelvisPos },
    restBones,
  };

  updateWorldTransforms(skel);
  return skel;
}

/**
 * Generates an anatomically fitted Fish / Aquatic Creature skeleton.
 */
function buildFishSkeleton(info: SilhouetteInfo, _w: number, _h: number): Skeleton {
  const { minX, charW, centerY } = info;

  const segmentCount = 4;
  const segW = charW / segmentCount;
  const bones: Bone[] = [];
  let prevBoneId: string | null = null;
  let prevWorldAngle = 0;

  for (let i = 0; i < segmentCount; i++) {
    const startX = minX + i * segW;
    const endX = minX + (i + 1) * segW;
    const isTail = i === segmentCount - 1;
    const id = isTail ? 'tail' : `spine_${i}`;
    const name = isTail ? 'TailFin' : `Spine.${i + 1}`;

    const { bone, worldAngle } = makeBone(
      id,
      name,
      prevBoneId,
      { x: startX, y: centerY },
      { x: endX, y: centerY },
      prevWorldAngle,
      isTail ? '#f43f5e' : '#06b6d4',
      isTail
    );

    bones.push(bone);
    prevBoneId = id;
    prevWorldAngle = worldAngle;
  }

  // Dorsal fin and Side fins
  const midX = minX + charW * 0.45;
  const { bone: finDorsal } = makeBone(
    'fin_dorsal',
    'DorsalFin',
    'spine_1',
    { x: midX, y: centerY },
    { x: midX - 8, y: centerY - charW * 0.2 },
    0,
    '#38bdf8',
    true
  );
  bones.push(finDorsal);

  const { bone: finL } = makeBone(
    'fin_l',
    'PectoralFin.L',
    'spine_0',
    { x: minX + charW * 0.25, y: centerY },
    { x: minX + charW * 0.15, y: centerY + charW * 0.18 },
    0,
    '#a855f7',
    true
  );
  bones.push(finL);

  const { bone: finR } = makeBone(
    'fin_r',
    'PectoralFin.R',
    'spine_0',
    { x: minX + charW * 0.25, y: centerY },
    { x: minX + charW * 0.35, y: centerY + charW * 0.18 },
    0,
    '#eab308',
    true
  );
  bones.push(finR);

  const restBones: Record<string, { localAngle: number; length: number; startWidth?: number; endWidth?: number }> = {};
  bones.forEach((b) => (restBones[b.id] = { localAngle: b.localAngle, length: b.length }));

  const skel: Skeleton = {
    bones,
    rootId: 'spine_0',
    rootPos: { x: minX, y: centerY },
    restRootPos: { x: minX, y: centerY },
    restBones,
  };

  updateWorldTransforms(skel);
  return skel;
}

/**
 * Measures the cross-sectional thickness from mesh vertices projecting onto a bone region,
 * constrained by Voronoi proximity to avoid expanding to distant unrelated limbs.
 */
function measureMeshVertexThickness(
  bone: Bone,
  skeleton: Skeleton,
  mesh: RigMesh,
  tMin: number,
  tMax: number
): number {
  const bx = bone.end.x - bone.start.x;
  const by = bone.end.y - bone.start.y;
  const lenSq = bx * bx + by * by;
  if (lenSq < 0.001) return 0;

  const dists: number[] = [];

  for (const v of mesh.vertices) {
    const p = { x: v.originalX, y: v.originalY };

    // Voronoi check: only associate vertex if this bone is the closest
    const myDist = distToSegment(p, bone.start, bone.end);
    let isClosest = true;
    for (const ob of skeleton.bones) {
      if (ob.id === bone.id) continue;
      const d = distToSegment(p, ob.start, ob.end);
      if (d < myDist * 0.85) {
        isClosest = false;
        break;
      }
    }
    if (!isClosest) continue;

    const t = ((p.x - bone.start.x) * bx + (p.y - bone.start.y) * by) / lenSq;
    if (t >= tMin && t <= tMax) {
      const projX = bone.start.x + t * bx;
      const projY = bone.start.y + t * by;
      const dist = Math.hypot(p.x - projX, p.y - projY);
      dists.push(dist);
    }
  }

  if (dists.length === 0) return 0;
  dists.sort((a, b) => a - b);
  // 90th percentile to prevent outlier noise
  const p90Idx = Math.min(dists.length - 1, Math.floor(dists.length * 0.9));
  return Math.round(dists[p90Idx] * 2);
}

/**
 * Raycasts outward from a point perpendicular to the bone normal vector
 * to directly measure the cross-sectional thickness of the character's opaque silhouette.
 */
function raycastSilhouetteThickness(
  px: number,
  py: number,
  nx: number,
  ny: number,
  alphaMask: Uint8Array,
  width: number,
  height: number,
  maxRadius: number = 180
): number {
  let dPos = 0;
  while (dPos < maxRadius) {
    const x = Math.round(px + nx * dPos);
    const y = Math.round(py + ny * dPos);
    if (x < 0 || x >= width || y < 0 || y >= height) break;
    if (alphaMask[y * width + x] < 18) break;
    dPos++;
  }

  let dNeg = 0;
  while (dNeg < maxRadius) {
    const x = Math.round(px - nx * dNeg);
    const y = Math.round(py - ny * dNeg);
    if (x < 0 || x >= width || y < 0 || y >= height) break;
    if (alphaMask[y * width + x] < 18) break;
    dNeg++;
  }

  return dPos + dNeg;
}

/**
 * Automatically calculates optimal startWidth and endWidth for a single bone
 * based on the character geometry (mesh vertices & alpha mask).
 */
export function calculateSingleBoneWidth(
  bone: Bone,
  skeleton: Skeleton,
  mesh?: RigMesh | null,
  alphaMask?: Uint8Array | null,
  width?: number,
  height?: number
): { startWidth: number; endWidth: number } {
  const dx = bone.end.x - bone.start.x;
  const dy = bone.end.y - bone.start.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return { startWidth: 26, endWidth: 18 };

  const nx = -dy / len;
  const ny = dx / len;

  const w = width || mesh?.width || 512;
  const h = height || mesh?.height || 512;

  let sW = 0;
  let mW = 0;
  let eW = 0;

  if (mesh && mesh.vertices.length > 0) {
    sW = measureMeshVertexThickness(bone, skeleton, mesh, -0.05, 0.35);
    mW = measureMeshVertexThickness(bone, skeleton, mesh, 0.35, 0.65);
    eW = measureMeshVertexThickness(bone, skeleton, mesh, 0.65, 1.05);
  }

  if (sW === 0 && alphaMask && alphaMask.length === w * h) {
    sW = raycastSilhouetteThickness(bone.start.x, bone.start.y, nx, ny, alphaMask, w, h);
  }
  if (mW === 0 && alphaMask && alphaMask.length === w * h) {
    mW = raycastSilhouetteThickness(
      bone.start.x * 0.5 + bone.end.x * 0.5,
      bone.start.y * 0.5 + bone.end.y * 0.5,
      nx,
      ny,
      alphaMask,
      w,
      h
    );
  }
  if (eW === 0 && alphaMask && alphaMask.length === w * h) {
    eW = raycastSilhouetteThickness(bone.end.x, bone.end.y, nx, ny, alphaMask, w, h);
  }

  const defaultBase = Math.min(80, Math.max(20, len * 0.35));
  if (sW === 0) sW = mW > 0 ? mW : defaultBase;
  if (eW === 0) eW = mW > 0 ? mW : Math.max(14, sW * 0.8);

  const startWidth = Math.max(12, Math.min(320, Math.round(sW * 1.15)));
  const endWidth = Math.max(8, Math.min(320, Math.round(eW * 1.15)));

  return { startWidth, endWidth };
}

/**
 * Automatically calculates and sets bone envelopes (startWidth & endWidth)
 * for all bones in the skeleton to tightly and smoothly cover the character geometry.
 */
export function calculateAutomaticBoneWidths(
  skeleton: Skeleton,
  mesh?: RigMesh | null,
  alphaMask?: Uint8Array | null,
  width?: number,
  height?: number
): void {
  if (!skeleton || skeleton.bones.length === 0) return;

  const boneMap = new Map<string, Bone>();
  skeleton.bones.forEach((b) => boneMap.set(b.id, b));

  // Pass 1: Measure raw individual bone widths
  for (const bone of skeleton.bones) {
    const { startWidth, endWidth } = calculateSingleBoneWidth(bone, skeleton, mesh, alphaMask, width, height);
    bone.startWidth = startWidth;
    bone.endWidth = endWidth;
  }

  // Pass 2: Continuity smoothing across connected joints
  // Group children by parent.end joint so branching hubs and linear chains are harmonized
  for (const parent of skeleton.bones) {
    const connectedChildren = skeleton.bones.filter(
      (b) => b.parentId === parent.id && Math.hypot(b.start.x - parent.end.x, b.start.y - parent.end.y) < 8
    );
    if (connectedChildren.length > 0) {
      // Calculate harmonized joint width
      const childWidths = connectedChildren.map((c) => c.startWidth || parent.endWidth || 20);
      const avgChildWidth = childWidths.reduce((a, b) => a + b, 0) / childWidths.length;
      const harmonizedJointWidth = Math.round(((parent.endWidth || 20) + avgChildWidth) * 0.5);
      
      parent.endWidth = harmonizedJointWidth;
      for (const child of connectedChildren) {
        child.startWidth = harmonizedJointWidth;
      }
    }
  }

  // Pass 3: Sync to restBones if present
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
 * Complete, one-step Automatic Rigging pipeline:
 * 1. Automatically generates and places bones fitted to the character's geometry.
 * 2. Automatically measures and sets bone widths.
 * 3. Automatically computes normalized skinning weights.
 */
export function autoRig(
  mesh: RigMesh,
  imageWidth: number,
  imageHeight: number,
  alphaMask?: Uint8Array | null,
  preferredType?: PresetType
): { skeleton: Skeleton; restSkeleton: Skeleton } {
  // Step 1: Bone Creation & Placement
  const skeleton = autoGenerateSkeleton(imageWidth, imageHeight, alphaMask, mesh, preferredType);

  // Step 2: Automatic Bone Widths Setting
  calculateAutomaticBoneWidths(skeleton, mesh, alphaMask, imageWidth, imageHeight);

  // Step 3: Automatic Skinning Weights Setting
  computeAutoWeights(mesh, skeleton, 4, 2.6);

  // Step 4: Create Rest Skeleton clone
  const restSkeleton = cloneSkeleton(skeleton);
  for (const b of skeleton.bones) {
    const rb = restSkeleton.bones.find((r) => r.id === b.id);
    if (rb) {
      rb.startWidth = b.startWidth;
      rb.endWidth = b.endWidth;
    }
  }

  return { skeleton, restSkeleton };
}

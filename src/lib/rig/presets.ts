import { Skeleton, Bone, AnimationClip, PresetType } from './types';
import { degToRad } from './math';
import { updateWorldTransforms } from './skeleton';

export function createEmptySkeleton(width: number = 512, height: number = 512): Skeleton {
  return {
    bones: [],
    rootId: '',
    rootPos: { x: width * 0.5, y: height * 0.5 },
    restRootPos: { x: width * 0.5, y: height * 0.5 },
    restBones: {},
  };
}

export function createDefaultSkeleton(type: PresetType, width: number, height: number): Skeleton {
  let skel: Skeleton;
  switch (type) {
    case 'human':
      skel = createHumanSkeleton(width, height);
      break;
    case 'biped':
      skel = createBipedSkeleton(width, height);
      break;
    case 'quadruped':
      skel = createQuadrupedSkeleton(width, height);
      break;
    case 'fish':
      skel = createFishSkeleton(width, height);
      break;
  }

  // Ensure default widths for all bones
  for (const b of skel.bones) {
    if (b.startWidth === undefined) b.startWidth = 26;
    if (b.endWidth === undefined) b.endWidth = 18;
  }

  return skel;
}

function createHumanSkeleton(w: number, h: number): Skeleton {
  const cx = w * 0.5;
  const cy = h * 0.5;

  const bones: Bone[] = [
    {
      id: 'root',
      name: 'Pelvis',
      parentId: null,
      localAngle: degToRad(-90), // pointing upwards
      length: h * 0.12,
      color: '#38bdf8',
      start: { x: cx, y: cy },
      end: { x: cx, y: cy - h * 0.12 },
      worldAngle: degToRad(-90),
    },
    {
      id: 'chest',
      name: 'Chest',
      parentId: 'root',
      localAngle: 0,
      length: h * 0.14,
      color: '#0284c7',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
    },
    {
      id: 'neck',
      name: 'Neck',
      parentId: 'chest',
      localAngle: 0,
      length: h * 0.05,
      color: '#7dd3fc',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
    },
    {
      id: 'head',
      name: 'Head',
      parentId: 'neck',
      localAngle: 0,
      length: h * 0.12,
      color: '#fbbf24',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
    },
    // Left Arm (Screen left)
    {
      id: 'upper_arm_l',
      name: 'UpperArm.L',
      parentId: 'chest',
      localAngle: degToRad(75), // downward-left
      length: h * 0.15,
      color: '#f43f5e',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
    },
    {
      id: 'forearm_l',
      name: 'Forearm.L',
      parentId: 'upper_arm_l',
      localAngle: degToRad(15),
      length: h * 0.14,
      color: '#fb7185',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
      isIKTarget: true,
    },
    // Right Arm (Screen right)
    {
      id: 'upper_arm_r',
      name: 'UpperArm.R',
      parentId: 'chest',
      localAngle: degToRad(-75), // downward-right
      length: h * 0.15,
      color: '#10b981',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
    },
    {
      id: 'forearm_r',
      name: 'Forearm.R',
      parentId: 'upper_arm_r',
      localAngle: degToRad(-15),
      length: h * 0.14,
      color: '#34d399',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
      isIKTarget: true,
    },
    // Left Leg
    {
      id: 'thigh_l',
      name: 'Thigh.L',
      parentId: 'root',
      localAngle: degToRad(170), // down slightly left
      length: h * 0.22,
      color: '#a855f7',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
    },
    {
      id: 'shin_l',
      name: 'Shin.L',
      parentId: 'thigh_l',
      localAngle: degToRad(5),
      length: h * 0.22,
      color: '#c084fc',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
      isIKTarget: true,
    },
    // Right Leg
    {
      id: 'thigh_r',
      name: 'Thigh.R',
      parentId: 'root',
      localAngle: degToRad(-170), // down slightly right
      length: h * 0.22,
      color: '#eab308',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
    },
    {
      id: 'shin_r',
      name: 'Shin.R',
      parentId: 'thigh_r',
      localAngle: degToRad(-5),
      length: h * 0.22,
      color: '#fde047',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
      isIKTarget: true,
    },
  ];

  const restBones: Record<string, { localAngle: number; length: number }> = {};
  bones.forEach((b) => (restBones[b.id] = { localAngle: b.localAngle, length: b.length }));

  const skel: Skeleton = {
    bones,
    rootId: 'root',
    rootPos: { x: cx, y: cy },
    restRootPos: { x: cx, y: cy },
    restBones,
  };

  updateWorldTransforms(skel);
  return skel;
}

function createBipedSkeleton(w: number, h: number): Skeleton {
  const cx = w * 0.5;
  const cy = h * 0.52;

  const bones: Bone[] = [
    {
      id: 'root',
      name: 'Chassis',
      parentId: null,
      localAngle: degToRad(-90),
      length: h * 0.18,
      color: '#10b981',
      start: { x: cx, y: cy },
      end: { x: cx, y: cy - h * 0.18 },
      worldAngle: degToRad(-90),
    },
    {
      id: 'head',
      name: 'SensorHead',
      parentId: 'root',
      localAngle: 0,
      length: h * 0.18,
      color: '#34d399',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
    },
    {
      id: 'arm_l',
      name: 'Arm.L',
      parentId: 'root',
      localAngle: degToRad(80),
      length: h * 0.18,
      color: '#f43f5e',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
    },
    {
      id: 'claw_l',
      name: 'Claw.L',
      parentId: 'arm_l',
      localAngle: degToRad(15),
      length: h * 0.15,
      color: '#fb7185',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
      isIKTarget: true,
    },
    {
      id: 'arm_r',
      name: 'Arm.R',
      parentId: 'root',
      localAngle: degToRad(-80),
      length: h * 0.18,
      color: '#06b6d4',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
    },
    {
      id: 'claw_r',
      name: 'Claw.R',
      parentId: 'arm_r',
      localAngle: degToRad(-15),
      length: h * 0.15,
      color: '#22d3ee',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
      isIKTarget: true,
    },
    {
      id: 'leg_l',
      name: 'Piston.L',
      parentId: 'root',
      localAngle: degToRad(170),
      length: h * 0.2,
      color: '#8b5cf6',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
    },
    {
      id: 'foot_l',
      name: 'Foot.L',
      parentId: 'leg_l',
      localAngle: degToRad(10),
      length: h * 0.22,
      color: '#a78bfa',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
      isIKTarget: true,
    },
    {
      id: 'leg_r',
      name: 'Piston.R',
      parentId: 'root',
      localAngle: degToRad(-170),
      length: h * 0.2,
      color: '#f59e0b',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
    },
    {
      id: 'foot_r',
      name: 'Foot.R',
      parentId: 'leg_r',
      localAngle: degToRad(-10),
      length: h * 0.22,
      color: '#fbbf24',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
      isIKTarget: true,
    },
  ];

  const restBones: Record<string, { localAngle: number; length: number }> = {};
  bones.forEach((b) => (restBones[b.id] = { localAngle: b.localAngle, length: b.length }));

  const skel: Skeleton = {
    bones,
    rootId: 'root',
    rootPos: { x: cx, y: cy },
    restRootPos: { x: cx, y: cy },
    restBones,
  };

  updateWorldTransforms(skel);
  return skel;
}

function createQuadrupedSkeleton(w: number, h: number): Skeleton {
  const cx = w * 0.35;
  const cy = h * 0.55;

  const bones: Bone[] = [
    {
      id: 'pelvis',
      name: 'Hips',
      parentId: null,
      localAngle: degToRad(0), // horizontal towards head
      length: w * 0.2,
      color: '#f97316',
      start: { x: cx, y: cy },
      end: { x: cx + w * 0.2, y: cy },
      worldAngle: 0,
    },
    {
      id: 'spine',
      name: 'Spine',
      parentId: 'pelvis',
      localAngle: degToRad(-5),
      length: w * 0.2,
      color: '#ea580c',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
    },
    {
      id: 'neck',
      name: 'Neck',
      parentId: 'spine',
      localAngle: degToRad(-35),
      length: w * 0.12,
      color: '#fb923c',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
    },
    {
      id: 'head',
      name: 'Head',
      parentId: 'neck',
      localAngle: degToRad(20),
      length: w * 0.14,
      color: '#fdba74',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
    },
    {
      id: 'tail',
      name: 'Tail',
      parentId: 'pelvis',
      localAngle: degToRad(145), // trailing back
      length: w * 0.22,
      color: '#fbbf24',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
    },
    // Back Leg
    {
      id: 'back_thigh',
      name: 'BackLeg.Upper',
      parentId: 'pelvis',
      localAngle: degToRad(100),
      length: h * 0.22,
      color: '#c084fc',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
    },
    {
      id: 'back_paw',
      name: 'BackLeg.Lower',
      parentId: 'back_thigh',
      localAngle: degToRad(-15),
      length: h * 0.22,
      color: '#e879f9',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
      isIKTarget: true,
    },
    // Front Leg
    {
      id: 'front_shoulder',
      name: 'FrontLeg.Upper',
      parentId: 'spine',
      localAngle: degToRad(95),
      length: h * 0.22,
      color: '#38bdf8',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
    },
    {
      id: 'front_paw',
      name: 'FrontLeg.Lower',
      parentId: 'front_shoulder',
      localAngle: degToRad(-10),
      length: h * 0.22,
      color: '#7dd3fc',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
      isIKTarget: true,
    },
  ];

  const restBones: Record<string, { localAngle: number; length: number }> = {};
  bones.forEach((b) => (restBones[b.id] = { localAngle: b.localAngle, length: b.length }));

  const skel: Skeleton = {
    bones,
    rootId: 'pelvis',
    rootPos: { x: cx, y: cy },
    restRootPos: { x: cx, y: cy },
    restBones,
  };

  updateWorldTransforms(skel);
  return skel;
}

function createFishSkeleton(w: number, h: number): Skeleton {
  const cx = w * 0.72;
  const cy = h * 0.5;

  // Fish runs from right (head) to left (tail)
  const bones: Bone[] = [
    {
      id: 'head',
      name: 'FishHead',
      parentId: null,
      localAngle: degToRad(180), // pointing leftwards along spine
      length: w * 0.2,
      color: '#06b6d4',
      start: { x: cx, y: cy },
      end: { x: cx - w * 0.2, y: cy },
      worldAngle: degToRad(180),
    },
    {
      id: 'spine1',
      name: 'MidSpine',
      parentId: 'head',
      localAngle: 0,
      length: w * 0.22,
      color: '#3b82f6',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
    },
    {
      id: 'spine2',
      name: 'TailRoot',
      parentId: 'spine1',
      localAngle: 0,
      length: w * 0.18,
      color: '#6366f1',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
    },
    {
      id: 'tailFin',
      name: 'TailFin',
      parentId: 'spine2',
      localAngle: 0,
      length: w * 0.15,
      color: '#ec4899',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
      isIKTarget: true,
    },
    {
      id: 'pecFin',
      name: 'SideFin',
      parentId: 'head',
      localAngle: degToRad(65),
      length: w * 0.12,
      color: '#f43f5e',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      worldAngle: 0,
    },
  ];

  const restBones: Record<string, { localAngle: number; length: number }> = {};
  bones.forEach((b) => (restBones[b.id] = { localAngle: b.localAngle, length: b.length }));

  const skel: Skeleton = {
    bones,
    rootId: 'head',
    rootPos: { x: cx, y: cy },
    restRootPos: { x: cx, y: cy },
    restBones,
  };

  updateWorldTransforms(skel);
  return skel;
}

export function getDefaultAnimationClips(type: PresetType): AnimationClip[] {
  switch (type) {
    case 'human':
      return [
        {
          id: 'human_idle',
          name: 'Idle Breathing',
          duration: 2.0,
          fps: 30,
          loop: true,
          keyframes: [
            {
              id: 'k0',
              time: 0.0,
              boneRotations: {
                root: degToRad(-90),
                chest: 0,
                head: 0,
                upper_arm_l: degToRad(75),
                forearm_l: degToRad(15),
                upper_arm_r: degToRad(-75),
                forearm_r: degToRad(-15),
                thigh_l: degToRad(170),
                shin_l: degToRad(5),
                thigh_r: degToRad(-170),
                shin_r: degToRad(-5),
              },
            },
            {
              id: 'k1',
              time: 1.0,
              boneRotations: {
                root: degToRad(-90),
                chest: degToRad(-4),
                head: degToRad(3),
                upper_arm_l: degToRad(82),
                forearm_l: degToRad(20),
                upper_arm_r: degToRad(-82),
                forearm_r: degToRad(-20),
                thigh_l: degToRad(172),
                shin_l: degToRad(3),
                thigh_r: degToRad(-172),
                shin_r: degToRad(-3),
              },
            },
            {
              id: 'k2',
              time: 2.0,
              boneRotations: {
                root: degToRad(-90),
                chest: 0,
                head: 0,
                upper_arm_l: degToRad(75),
                forearm_l: degToRad(15),
                upper_arm_r: degToRad(-75),
                forearm_r: degToRad(-15),
                thigh_l: degToRad(170),
                shin_l: degToRad(5),
                thigh_r: degToRad(-170),
                shin_r: degToRad(-5),
              },
            },
          ],
        },
        {
          id: 'human_walk',
          name: 'Walk Cycle',
          duration: 1.2,
          fps: 30,
          loop: true,
          keyframes: [
            {
              id: 'w0',
              time: 0.0,
              boneRotations: {
                root: degToRad(-90),
                chest: degToRad(5),
                upper_arm_l: degToRad(50),
                forearm_l: degToRad(30),
                upper_arm_r: degToRad(-100),
                forearm_r: degToRad(-10),
                thigh_l: degToRad(195),
                shin_l: degToRad(-10),
                thigh_r: degToRad(-145),
                shin_r: degToRad(20),
              },
            },
            {
              id: 'w1',
              time: 0.3,
              boneRotations: {
                root: degToRad(-90),
                chest: 0,
                upper_arm_l: degToRad(75),
                forearm_l: degToRad(15),
                upper_arm_r: degToRad(-75),
                forearm_r: degToRad(-15),
                thigh_l: degToRad(170),
                shin_l: degToRad(25),
                thigh_r: degToRad(-170),
                shin_r: degToRad(5),
              },
            },
            {
              id: 'w2',
              time: 0.6,
              boneRotations: {
                root: degToRad(-90),
                chest: degToRad(-5),
                upper_arm_l: degToRad(100),
                forearm_l: degToRad(10),
                upper_arm_r: degToRad(-50),
                forearm_r: degToRad(-30),
                thigh_l: degToRad(145),
                shin_l: degToRad(20),
                thigh_r: degToRad(-195),
                shin_r: degToRad(-10),
              },
            },
            {
              id: 'w3',
              time: 0.9,
              boneRotations: {
                root: degToRad(-90),
                chest: 0,
                upper_arm_l: degToRad(75),
                forearm_l: degToRad(15),
                upper_arm_r: degToRad(-75),
                forearm_r: degToRad(-15),
                thigh_l: degToRad(170),
                shin_l: degToRad(5),
                thigh_r: degToRad(-170),
                shin_r: degToRad(25),
              },
            },
            {
              id: 'w4',
              time: 1.2,
              boneRotations: {
                root: degToRad(-90),
                chest: degToRad(5),
                upper_arm_l: degToRad(50),
                forearm_l: degToRad(30),
                upper_arm_r: degToRad(-100),
                forearm_r: degToRad(-10),
                thigh_l: degToRad(195),
                shin_l: degToRad(-10),
                thigh_r: degToRad(-145),
                shin_r: degToRad(20),
              },
            },
          ],
        },
        {
          id: 'human_wave',
          name: 'Heroic Wave',
          duration: 1.5,
          fps: 30,
          loop: true,
          keyframes: [
            {
              id: 'v0',
              time: 0.0,
              boneRotations: {
                root: degToRad(-90),
                chest: 0,
                upper_arm_r: degToRad(-160),
                forearm_r: degToRad(-35),
              },
            },
            {
              id: 'v1',
              time: 0.4,
              boneRotations: {
                root: degToRad(-90),
                chest: degToRad(4),
                upper_arm_r: degToRad(-165),
                forearm_r: degToRad(10),
              },
            },
            {
              id: 'v2',
              time: 0.8,
              boneRotations: {
                root: degToRad(-90),
                chest: degToRad(-2),
                upper_arm_r: degToRad(-160),
                forearm_r: degToRad(-35),
              },
            },
            {
              id: 'v3',
              time: 1.1,
              boneRotations: {
                root: degToRad(-90),
                chest: degToRad(4),
                upper_arm_r: degToRad(-165),
                forearm_r: degToRad(10),
              },
            },
            {
              id: 'v4',
              time: 1.5,
              boneRotations: {
                root: degToRad(-90),
                chest: 0,
                upper_arm_r: degToRad(-160),
                forearm_r: degToRad(-35),
              },
            },
          ],
        },
      ];

    case 'biped':
      return [
        {
          id: 'biped_idle',
          name: 'Servo Idle',
          duration: 1.6,
          fps: 30,
          loop: true,
          keyframes: [
            {
              id: 'b0',
              time: 0.0,
              boneRotations: {
                root: degToRad(-90),
                head: 0,
                arm_l: degToRad(80),
                arm_r: degToRad(-80),
                leg_l: degToRad(170),
                leg_r: degToRad(-170),
              },
            },
            {
              id: 'b1',
              time: 0.8,
              boneRotations: {
                root: degToRad(-90),
                head: degToRad(10),
                arm_l: degToRad(90),
                arm_r: degToRad(-90),
                leg_l: degToRad(165),
                leg_r: degToRad(-165),
              },
            },
            {
              id: 'b2',
              time: 1.6,
              boneRotations: {
                root: degToRad(-90),
                head: 0,
                arm_l: degToRad(80),
                arm_r: degToRad(-80),
                leg_l: degToRad(170),
                leg_r: degToRad(-170),
              },
            },
          ],
        },
      ];

    case 'quadruped':
      return [
        {
          id: 'quad_idle',
          name: 'Resting & Tail Wag',
          duration: 1.6,
          fps: 30,
          loop: true,
          keyframes: [
            {
              id: 'q0',
              time: 0.0,
              boneRotations: {
                pelvis: degToRad(0),
                spine: degToRad(-5),
                neck: degToRad(-35),
                tail: degToRad(130),
              },
            },
            {
              id: 'q1',
              time: 0.4,
              boneRotations: {
                pelvis: degToRad(0),
                spine: degToRad(-3),
                neck: degToRad(-30),
                tail: degToRad(160),
              },
            },
            {
              id: 'q2',
              time: 0.8,
              boneRotations: {
                pelvis: degToRad(0),
                spine: degToRad(-5),
                neck: degToRad(-35),
                tail: degToRad(130),
              },
            },
            {
              id: 'q3',
              time: 1.2,
              boneRotations: {
                pelvis: degToRad(0),
                spine: degToRad(-3),
                neck: degToRad(-30),
                tail: degToRad(160),
              },
            },
            {
              id: 'q4',
              time: 1.6,
              boneRotations: {
                pelvis: degToRad(0),
                spine: degToRad(-5),
                neck: degToRad(-35),
                tail: degToRad(130),
              },
            },
          ],
        },
        {
          id: 'quad_run',
          name: 'Canter / Run',
          duration: 1.0,
          fps: 30,
          loop: true,
          keyframes: [
            {
              id: 'qr0',
              time: 0.0,
              boneRotations: {
                pelvis: degToRad(-10),
                spine: degToRad(5),
                back_thigh: degToRad(70),
                back_paw: degToRad(30),
                front_shoulder: degToRad(130),
                front_paw: degToRad(-40),
                tail: degToRad(160),
              },
            },
            {
              id: 'qr1',
              time: 0.5,
              boneRotations: {
                pelvis: degToRad(10),
                spine: degToRad(-10),
                back_thigh: degToRad(135),
                back_paw: degToRad(-30),
                front_shoulder: degToRad(60),
                front_paw: degToRad(30),
                tail: degToRad(120),
              },
            },
            {
              id: 'qr2',
              time: 1.0,
              boneRotations: {
                pelvis: degToRad(-10),
                spine: degToRad(5),
                back_thigh: degToRad(70),
                back_paw: degToRad(30),
                front_shoulder: degToRad(130),
                front_paw: degToRad(-40),
                tail: degToRad(160),
              },
            },
          ],
        },
      ];

    case 'fish':
      return [
        {
          id: 'fish_swim',
          name: 'Ocean Undulation',
          duration: 1.4,
          fps: 30,
          loop: true,
          keyframes: [
            {
              id: 'f0',
              time: 0.0,
              boneRotations: {
                head: degToRad(180),
                spine1: degToRad(-18),
                spine2: degToRad(22),
                tailFin: degToRad(25),
                pecFin: degToRad(65),
              },
            },
            {
              id: 'f1',
              time: 0.35,
              boneRotations: {
                head: degToRad(180),
                spine1: degToRad(0),
                spine2: degToRad(-15),
                tailFin: degToRad(-10),
                pecFin: degToRad(45),
              },
            },
            {
              id: 'f2',
              time: 0.7,
              boneRotations: {
                head: degToRad(180),
                spine1: degToRad(18),
                spine2: degToRad(-22),
                tailFin: degToRad(-25),
                pecFin: degToRad(65),
              },
            },
            {
              id: 'f3',
              time: 1.05,
              boneRotations: {
                head: degToRad(180),
                spine1: degToRad(0),
                spine2: degToRad(15),
                tailFin: degToRad(10),
                pecFin: degToRad(85),
              },
            },
            {
              id: 'f4',
              time: 1.4,
              boneRotations: {
                head: degToRad(180),
                spine1: degToRad(-18),
                spine2: degToRad(22),
                tailFin: degToRad(25),
                pecFin: degToRad(65),
              },
            },
          ],
        },
      ];
  }
}

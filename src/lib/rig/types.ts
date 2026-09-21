export interface Point2D {
  x: number;
  y: number;
}

export interface Bone {
  id: string;
  name: string;
  parentId: string | null;
  // Local coordinate relative to parent
  localAngle: number; // in radians
  length: number; // in pixels
  color: string;

  // Bone Envelopes / Widths (in pixels)
  startWidth?: number; // width/influence at root/start joint
  endWidth?: number;   // width/influence at tip/end joint

  // World coordinates (computed each frame)
  start: Point2D;
  end: Point2D;
  worldAngle: number;

  // Pinning and constraints
  isPinned?: boolean; // pinned joints stay immobile
  isIKTarget?: boolean;
  minAngle?: number; // radians
  maxAngle?: number; // radians
}

export interface Skeleton {
  bones: Bone[];
  rootId: string;
  rootPos: Point2D;
  restRootPos: Point2D;
  restBones: Record<string, { localAngle: number; length: number }>;
}

export interface VertexWeight {
  boneId: string;
  weight: number;
}

export interface Vertex {
  x: number;
  y: number;
  u: number; // 0 to 1
  v: number; // 0 to 1
  originalX: number;
  originalY: number;
  weights: VertexWeight[];
}

export type Triangle = [number, number, number];

export interface RigMesh {
  vertices: Vertex[];
  triangles: Triangle[];
  width: number;
  height: number;
  density: number;
}

export interface Keyframe {
  id: string;
  time: number; // in seconds (e.g. 0.0, 0.25, 0.5)
  boneRotations: Record<string, number>; // boneId -> localAngle
  rootOffset?: Point2D;
}

export interface AnimationClip {
  id: string;
  name: string;
  duration: number; // seconds
  fps: number;
  loop: boolean;
  keyframes: Keyframe[];
}

export type PresetType = 'human' | 'biped' | 'quadruped' | 'fish';

export type StudioTool = 'select' | 'bone_move' | 'bone_rotate' | 'ik' | 'add_bone' | 'weight_brush';

export type StudioMode = 'rig' | 'pose' | 'animate' | 'weights';

export interface CharacterPreset {
  id: string;
  name: string;
  type: PresetType;
  description: string;
  imageUrl: string;
}

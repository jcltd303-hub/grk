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

export type WeightBrushMode = 'add' | 'subtract' | 'smooth' | 'set';

export interface WeightBrushSettings {
  radius: number;
  intensity: number;
  mode: WeightBrushMode;
  targetWeight: number; // used for 'set' mode (0 to 1)
}

export interface CharacterPreset {
  id: string;
  name: string;
  type: PresetType;
  description: string;
  imageUrl: string;
}

export interface RigExportJSON {
  version: '2.0';
  format: '2d-skeletal-rig-studio';
  name: string;
  exportedAt: string;
  image?: {
    dataUrl?: string;
    width: number;
    height: number;
  };
  skeleton: {
    rootId: string;
    rootPos: Point2D;
    restRootPos: Point2D;
    restBones?: Record<string, { localAngle: number; length: number; startWidth?: number; endWidth?: number }>;
    bones: Array<{
      id: string;
      name: string;
      parentId: string | null;
      length: number;
      localAngle: number;
      worldAngle?: number;
      color: string;
      startWidth?: number;
      endWidth?: number;
      minAngle?: number;
      maxAngle?: number;
      isPinned?: boolean;
      isIKTarget?: boolean;
    }>;
  };
  mesh?: {
    width: number;
    height: number;
    density?: number;
    vertexCount: number;
    triangleCount: number;
    vertices: Array<{
      x: number;
      y: number;
      u: number;
      v: number;
      originalX?: number;
      originalY?: number;
      weights: Array<{ boneId: string; weight: number }>;
    }>;
    triangles: Triangle[];
  };
  animations: AnimationClip[];
}

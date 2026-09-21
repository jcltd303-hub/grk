import {
  Skeleton,
  RigMesh,
  Bone,
  StudioMode,
  StudioTool,
  PresetType,
  AnimationClip,
  Point2D,
  CharacterPreset,
} from '../lib/rig/types';
import { CHARACTER_PRESETS } from '../lib/rig/image-bank';
import { createDefaultSkeleton, createEmptySkeleton, getDefaultAnimationClips } from '../lib/rig/presets';
import { generateMesh, computeAutoWeights, optimizeBoneWidthsAndComputeWeights } from '../lib/rig/mesh';
import { updateWorldTransforms, cloneSkeleton, computeBoneDeltaTransforms, deformMesh, resetMeshToRest } from '../lib/rig/skeleton';
import { solveCCD2D } from '../lib/rig/ik';
import { lerpAngle, normalizeAngle, degToRad } from '../lib/rig/math';
import { extractAlphaMask } from '../lib/rig/bg-remove';

const BONE_PALETTE = [
  '#38bdf8', // sky
  '#0284c7', // light blue
  '#fbbf24', // amber
  '#f59e0b', // orange
  '#f43f5e', // rose
  '#ec4899', // pink
  '#8b5cf6', // purple
  '#a855f7', // violet
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
];

export interface HistorySnapshot {
  skeleton: Skeleton | null;
  restSkeleton: Skeleton | null;
  selectedBoneId: string | null;
  mode: StudioMode;
}

export interface StudioState {
  // Active Character
  activePresetId: string;
  image: HTMLImageElement | null;
  imageLoaded: boolean;
  alphaMask: Uint8Array | null;

  // Rigging & Deformation
  skeleton: Skeleton | null;
  restSkeleton: Skeleton | null;
  mesh: RigMesh | null;

  // Editor State
  mode: StudioMode;
  tool: StudioTool;
  selectedBoneId: string | null;
  hoveredBoneId: string | null;
  hoveredJoint: { boneId: string; type: 'start' | 'end' } | null;
  activeIKEffectorId: string | null;
  ikTargetPos: Point2D | null;

  // View Settings
  showTexture: boolean;
  showMesh: boolean;
  showBones: boolean;
  showWeights: boolean;
  zoom: number;
  pan: Point2D;

  // Animation Engine
  isPlaying: boolean;
  currentTime: number;
  playbackSpeed: number;
  activeClipId: string | null;
  clips: AnimationClip[];

  // Undo / Redo
  canUndo: boolean;
  canRedo: boolean;

  // Actions
  init: () => void;
  selectPreset: (presetId: string) => void;
  loadCustomImage: (dataUrl: string, presetType?: PresetType) => void;
  setMode: (mode: StudioMode) => void;
  setTool: (tool: StudioTool) => void;
  setSelectedBoneId: (id: string | null) => void;
  setHoveredBoneId: (id: string | null) => void;
  setHoveredJoint: (joint: { boneId: string; type: 'start' | 'end' } | null) => void;
  
  // History Actions
  undo: () => void;
  redo: () => void;
  saveHistory: () => void;

  // Bone Transforms & Generation
  addBone: (
    parentId?: string | null,
    targetEndPos?: Point2D,
    startPos?: Point2D,
    options?: { startWidth?: number; endWidth?: number; branchFromStart?: boolean }
  ) => Bone | null;
  deleteBone: (boneId?: string | null) => void;
  clearAllBones: () => void;
  selectPreviousBone: () => void;
  selectNextBone: () => void;
  selectParentBone: () => void;
  selectChildBone: () => void;
  quickRotateBone: (deltaDeg: number) => void;
  resetBoneAngle: (boneId?: string) => void;
  rotateBone: (boneId: string, deltaAngle: number) => void;
  setBoneAngle: (boneId: string, angle: number) => void;
  setBoneLength: (boneId: string, length: number) => void;
  setBoneName: (boneId: string, name: string) => void;
  setBoneStartWidth: (boneId: string, width: number) => void;
  setBoneEndWidth: (boneId: string, width: number) => void;
  setBoneWidths: (boneId: string, startWidth: number, endWidth: number) => void;
  toggleBonePin: (boneId: string) => void;
  moveBoneJoint: (boneId: string, jointType: 'start' | 'end', newPos: Point2D) => void;
  applyIK: (effectorBoneId: string, targetPos: Point2D) => void;
  resetToRestPose: () => void;
  recomputeWeights: () => void;

  // Animation Actions
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  tick: (deltaSeconds: number) => void;
  selectClip: (clipId: string) => void;
  addKeyframeAtCurrentTime: () => void;
  deleteKeyframe: (keyframeId: string) => void;
  setPlaybackSpeed: (speed: number) => void;

  // View
  setZoom: (zoom: number) => void;
  setPan: (pan: Point2D) => void;
  toggleView: (key: 'showTexture' | 'showMesh' | 'showBones' | 'showWeights') => void;
  resetView: () => void;
}

type Listener = () => void;

class StudioStore {
  private state: StudioState;
  private listeners: Set<Listener> = new Set();
  private undoStack: HistorySnapshot[] = [];
  private redoStack: HistorySnapshot[] = [];

  constructor() {
    this.state = {
      activePresetId: 'human',
      image: null,
      imageLoaded: false,
      alphaMask: null,
      skeleton: null,
      restSkeleton: null,
      mesh: null,
      mode: 'rig',
      tool: 'add_bone',
      selectedBoneId: null,
      hoveredBoneId: null,
      hoveredJoint: null,
      activeIKEffectorId: null,
      ikTargetPos: null,
      showTexture: true,
      showMesh: false,
      showBones: true,
      showWeights: false,
      zoom: 1.0,
      pan: { x: 0, y: 0 },
      isPlaying: false,
      currentTime: 0,
      playbackSpeed: 1.0,
      activeClipId: null,
      clips: [],
      canUndo: false,
      canRedo: false,

      init: () => this.init(),
      selectPreset: (id) => this.selectPreset(id),
      loadCustomImage: (url, type) => this.loadCustomImage(url, type),
      setMode: (mode) => this.setMode(mode),
      setTool: (tool) => this.setTool(tool),
      setSelectedBoneId: (id) => this.setSelectedBoneId(id),
      setHoveredBoneId: (id) => this.setHoveredBoneId(id),
      setHoveredJoint: (joint) => this.setHoveredJoint(joint),
      undo: () => this.undo(),
      redo: () => this.redo(),
      saveHistory: () => this.saveHistory(),
      rotateBone: (id, delta) => this.rotateBone(id, delta),
      setBoneAngle: (id, angle) => this.setBoneAngle(id, angle),
      setBoneLength: (id, len) => this.setBoneLength(id, len),
      setBoneName: (id, name) => this.setBoneName(id, name),
      setBoneStartWidth: (id, w) => this.setBoneStartWidth(id, w),
      setBoneEndWidth: (id, w) => this.setBoneEndWidth(id, w),
      setBoneWidths: (id, w1, w2) => this.setBoneWidths(id, w1, w2),
      toggleBonePin: (id) => this.toggleBonePin(id),
      moveBoneJoint: (id, type, pos) => this.moveBoneJoint(id, type, pos),
      addBone: (pId, endPos, startPos, opts) => this.addBone(pId, endPos, startPos, opts),
      deleteBone: (id) => this.deleteBone(id),
      clearAllBones: () => this.clearAllBones(),
      selectPreviousBone: () => this.selectPreviousBone(),
      selectNextBone: () => this.selectNextBone(),
      selectParentBone: () => this.selectParentBone(),
      selectChildBone: () => this.selectChildBone(),
      quickRotateBone: (deg) => this.quickRotateBone(deg),
      resetBoneAngle: (id) => this.resetBoneAngle(id),
      applyIK: (effectorId, target) => this.applyIK(effectorId, target),
      resetToRestPose: () => this.resetToRestPose(),
      recomputeWeights: () => this.recomputeWeights(),
      play: () => this.play(),
      pause: () => this.pause(),
      seek: (t) => this.seek(t),
      tick: (dt) => this.tick(dt),
      selectClip: (id) => this.selectClip(id),
      addKeyframeAtCurrentTime: () => this.addKeyframeAtCurrentTime(),
      deleteKeyframe: (id) => this.deleteKeyframe(id),
      setPlaybackSpeed: (s) => this.setPlaybackSpeed(s),
      setZoom: (z) => this.setZoom(z),
      setPan: (p) => this.setPan(p),
      toggleView: (k) => this.toggleView(k),
      resetView: () => this.resetView(),
    };
  }

  public getState(): StudioState {
    return this.state;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    if (this.state.skeleton) {
      this.state.skeleton = {
        ...this.state.skeleton,
        rootPos: { ...this.state.skeleton.rootPos },
        bones: this.state.skeleton.bones.map((b) => ({
          ...b,
          start: { ...b.start },
          end: { ...b.end },
        })),
      };
    }
    this.state = { ...this.state };
    this.listeners.forEach((l) => l());
  }

  private setState(partial: Partial<StudioState>) {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  /**
   * Captures the current skeleton and rest pose state into the undo history stack.
   */
  public saveHistory() {
    const snapshot: HistorySnapshot = {
      skeleton: this.state.skeleton ? cloneSkeleton(this.state.skeleton) : null,
      restSkeleton: this.state.restSkeleton ? cloneSkeleton(this.state.restSkeleton) : null,
      selectedBoneId: this.state.selectedBoneId,
      mode: this.state.mode,
    };
    this.undoStack.push(snapshot);
    this.redoStack = []; // clear redo on new action
    this.state.canUndo = this.undoStack.length > 0;
    this.state.canRedo = false;
    this.notify();
  }

  public undo() {
    if (this.undoStack.length === 0) return;

    // Push current state to redo
    const currentSnapshot: HistorySnapshot = {
      skeleton: this.state.skeleton ? cloneSkeleton(this.state.skeleton) : null,
      restSkeleton: this.state.restSkeleton ? cloneSkeleton(this.state.restSkeleton) : null,
      selectedBoneId: this.state.selectedBoneId,
      mode: this.state.mode,
    };
    this.redoStack.push(currentSnapshot);

    const prevSnapshot = this.undoStack.pop()!;
    this.state.skeleton = prevSnapshot.skeleton ? cloneSkeleton(prevSnapshot.skeleton) : null;
    this.state.restSkeleton = prevSnapshot.restSkeleton ? cloneSkeleton(prevSnapshot.restSkeleton) : null;
    this.state.selectedBoneId = prevSnapshot.selectedBoneId;
    this.state.canUndo = this.undoStack.length > 0;
    this.state.canRedo = this.redoStack.length > 0;

    if (this.state.skeleton && this.state.mesh) {
      updateWorldTransforms(this.state.skeleton);
      computeAutoWeights(this.state.mesh, this.state.skeleton);
    }
    this.updateDeformedMesh();
  }

  public redo() {
    if (this.redoStack.length === 0) return;

    const currentSnapshot: HistorySnapshot = {
      skeleton: this.state.skeleton ? cloneSkeleton(this.state.skeleton) : null,
      restSkeleton: this.state.restSkeleton ? cloneSkeleton(this.state.restSkeleton) : null,
      selectedBoneId: this.state.selectedBoneId,
      mode: this.state.mode,
    };
    this.undoStack.push(currentSnapshot);

    const nextSnapshot = this.redoStack.pop()!;
    this.state.skeleton = nextSnapshot.skeleton ? cloneSkeleton(nextSnapshot.skeleton) : null;
    this.state.restSkeleton = nextSnapshot.restSkeleton ? cloneSkeleton(nextSnapshot.restSkeleton) : null;
    this.state.selectedBoneId = nextSnapshot.selectedBoneId;
    this.state.canUndo = this.undoStack.length > 0;
    this.state.canRedo = this.redoStack.length > 0;

    if (this.state.skeleton && this.state.mesh) {
      updateWorldTransforms(this.state.skeleton);
      computeAutoWeights(this.state.mesh, this.state.skeleton);
    }
    this.updateDeformedMesh();
  }

  public init() {
    this.selectPreset('human');
  }

  public selectPreset(presetId: string) {
    const preset = CHARACTER_PRESETS.find((p) => p.id === presetId) || CHARACTER_PRESETS[0];
    this.loadCharacter(preset.imageUrl, preset.type, preset.id);
  }

  public loadCustomImage(dataUrl: string, presetType: PresetType = 'human') {
    this.loadCharacter(dataUrl, presetType, 'custom');
  }

  /**
   * Loads a character image without preloading bones.
   * Immediately moves to 'rig' mode and sets 'add_bone' tool so user can build their skeleton cleanly.
   */
  private loadCharacter(imgSrc: string, type: PresetType, presetId: string) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imgSrc;

    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;

      // Extract alpha mask for clean mesh generation
      const alphaMask = extractAlphaMask(img);

      // Generate regular triangular mesh clipped to character outline
      const mesh = generateMesh(w, h, 18, 26, alphaMask);

      // Per user directive: "Don't load skeleton with image. On img load move to rig mode."
      const skeleton = createEmptySkeleton(w, h);
      const restSkeleton = createEmptySkeleton(w, h);

      // Default animation clips
      const clips = getDefaultAnimationClips(type);
      const activeClip = clips.length > 0 ? clips[0] : null;

      this.undoStack = [];
      this.redoStack = [];

      this.setState({
        activePresetId: presetId,
        image: img,
        imageLoaded: true,
        alphaMask,
        mesh,
        skeleton,
        restSkeleton,
        mode: 'rig',
        tool: 'add_bone',
        selectedBoneId: null,
        clips,
        activeClipId: activeClip ? activeClip.id : null,
        currentTime: 0,
        isPlaying: false,
        canUndo: false,
        canRedo: false,
        // Center pan
        pan: { x: -w / 2, y: -h / 2 },
        zoom: Math.min(1.4, 520 / Math.max(w, h)),
      });

      this.updateDeformedMesh();
    };
  }

  public updateDeformedMesh() {
    const { skeleton, restSkeleton, mesh, mode } = this.state;
    if (skeleton) {
      updateWorldTransforms(skeleton);
    }

    if (skeleton && mesh) {
      // In RIG MODE, the character NEVER bends or distorts: keep mesh in pristine rest pose!
      if (mode === 'rig') {
        resetMeshToRest(mesh);
        this.state.restSkeleton = cloneSkeleton(skeleton);
      } else {
        // In POSE or ANIMATE mode: absolutely fuse mesh to skeleton bones using LBS
        if (!restSkeleton || restSkeleton.bones.length === 0) {
          this.state.restSkeleton = cloneSkeleton(skeleton);
        }
        const currentRest = this.state.restSkeleton || skeleton;
        const transforms = computeBoneDeltaTransforms(skeleton, currentRest);
        deformMesh(mesh, transforms);
      }
    }

    this.notify();
  }

  public setMode(mode: StudioMode) {
    if (mode === 'rig') {
      // Switching into Rig mode: unbend character completely back to rest pose
      const { skeleton, restSkeleton, mesh } = this.state;
      if (skeleton && restSkeleton) {
        for (const bone of skeleton.bones) {
          const restBone = restSkeleton.bones.find((rb) => rb.id === bone.id);
          if (restBone) {
            bone.localAngle = restBone.localAngle;
            bone.length = restBone.length;
          }
        }
        updateWorldTransforms(skeleton);
      }
      if (mesh) {
        resetMeshToRest(mesh);
      }
      if (this.state.tool === 'ik') {
        this.state.tool = 'select';
      }
    } else if (mode === 'pose' || mode === 'animate') {
      // Switching out of Rig mode into Pose/Animate mode:
      // Lock the current skeleton configuration as the restSkeleton bind pose
      const { skeleton, mesh } = this.state;
      if (skeleton && skeleton.bones.length > 0) {
        this.state.restSkeleton = cloneSkeleton(skeleton);
        if (mesh) {
          computeAutoWeights(mesh, skeleton);
        }
      }
    }

    this.setState({ mode });
    this.updateDeformedMesh();
  }

  public setTool(tool: StudioTool) {
    this.setState({ tool });
  }

  public setSelectedBoneId(id: string | null) {
    this.setState({ selectedBoneId: id });
  }

  public setHoveredBoneId(id: string | null) {
    this.setState({ hoveredBoneId: id });
  }

  public setHoveredJoint(joint: { boneId: string; type: 'start' | 'end' } | null) {
    this.setState({ hoveredJoint: joint });
  }

  public rotateBone(boneId: string, deltaAngle: number) {
    const { skeleton, mode, mesh } = this.state;
    if (!skeleton) return;
    const bone = skeleton.bones.find((b) => b.id === boneId);
    if (!bone) return;

    bone.localAngle = normalizeAngle(bone.localAngle + deltaAngle);
    updateWorldTransforms(skeleton);

    if (mode === 'rig') {
      if (mesh) resetMeshToRest(mesh);
      this.state.restSkeleton = cloneSkeleton(skeleton);
      if (mesh) computeAutoWeights(mesh, skeleton);
      this.notify();
      return;
    }

    this.updateDeformedMesh();
  }

  public setBoneAngle(boneId: string, angle: number) {
    const { skeleton, mode, mesh } = this.state;
    if (!skeleton) return;
    const bone = skeleton.bones.find((b) => b.id === boneId);
    if (!bone) return;

    bone.localAngle = normalizeAngle(angle);
    updateWorldTransforms(skeleton);

    if (mode === 'rig') {
      if (mesh) resetMeshToRest(mesh);
      this.state.restSkeleton = cloneSkeleton(skeleton);
      if (mesh) computeAutoWeights(mesh, skeleton);
      this.notify();
      return;
    }

    this.updateDeformedMesh();
  }

  public setBoneLength(boneId: string, length: number) {
    const { skeleton, mesh, mode } = this.state;
    if (!skeleton) return;
    const bone = skeleton.bones.find((b) => b.id === boneId);
    if (!bone) return;

    bone.length = Math.max(5, length);
    updateWorldTransforms(skeleton);

    if (mode === 'rig') {
      if (mesh) resetMeshToRest(mesh);
      this.state.restSkeleton = cloneSkeleton(skeleton);
      if (mesh) computeAutoWeights(mesh, skeleton);
      this.notify();
      return;
    }

    this.updateDeformedMesh();
    if (mesh) computeAutoWeights(mesh, skeleton);
  }

  public setBoneName(boneId: string, name: string) {
    const { skeleton } = this.state;
    if (!skeleton) return;
    const bone = skeleton.bones.find((b) => b.id === boneId);
    if (bone) {
      bone.name = name;
      this.notify();
    }
  }

  public setBoneStartWidth(boneId: string, width: number) {
    const { skeleton, mesh } = this.state;
    if (!skeleton) return;
    const bone = skeleton.bones.find((b) => b.id === boneId);
    if (!bone) return;

    bone.startWidth = Math.max(2, Math.min(600, Math.round(width)));
    if (this.state.restSkeleton) {
      const rb = this.state.restSkeleton.bones.find((b) => b.id === boneId);
      if (rb) rb.startWidth = bone.startWidth;
    }

    if (mesh) computeAutoWeights(mesh, skeleton);
    this.updateDeformedMesh();
  }

  public setBoneEndWidth(boneId: string, width: number) {
    const { skeleton, mesh } = this.state;
    if (!skeleton) return;
    const bone = skeleton.bones.find((b) => b.id === boneId);
    if (!bone) return;

    bone.endWidth = Math.max(2, Math.min(600, Math.round(width)));
    if (this.state.restSkeleton) {
      const rb = this.state.restSkeleton.bones.find((b) => b.id === boneId);
      if (rb) rb.endWidth = bone.endWidth;
    }

    if (mesh) computeAutoWeights(mesh, skeleton);
    this.updateDeformedMesh();
  }

  public setBoneWidths(boneId: string, startWidth: number, endWidth: number) {
    const { skeleton, mesh } = this.state;
    if (!skeleton) return;
    const bone = skeleton.bones.find((b) => b.id === boneId);
    if (!bone) return;

    bone.startWidth = Math.max(2, Math.min(600, Math.round(startWidth)));
    bone.endWidth = Math.max(2, Math.min(600, Math.round(endWidth)));
    if (this.state.restSkeleton) {
      const rb = this.state.restSkeleton.bones.find((b) => b.id === boneId);
      if (rb) {
        rb.startWidth = bone.startWidth;
        rb.endWidth = bone.endWidth;
      }
    }

    if (mesh) computeAutoWeights(mesh, skeleton);
    this.updateDeformedMesh();
  }

  public toggleBonePin(boneId: string) {
    this.saveHistory();
    const { skeleton, restSkeleton } = this.state;
    if (!skeleton) return;
    const bone = skeleton.bones.find((b) => b.id === boneId);
    if (bone) {
      bone.isPinned = !bone.isPinned;
      if (restSkeleton) {
        const rb = restSkeleton.bones.find((b) => b.id === boneId);
        if (rb) rb.isPinned = bone.isPinned;
      }
      this.notify();
    }
  }

  public moveBoneJoint(boneId: string, jointType: 'start' | 'end', newPos: Point2D) {
    const { skeleton, mesh, mode } = this.state;
    if (!skeleton) return;
    const bone = skeleton.bones.find((b) => b.id === boneId);
    if (!bone) return;

    if (bone.isPinned && mode !== 'rig') {
      return; // Pinned bones are immobile in pose/anim mode
    }

    if (jointType === 'start' && !bone.parentId) {
      // Moving root joint moves whole skeleton position
      skeleton.rootPos = { ...newPos };
    } else if (jointType === 'end') {
      // Adjust bone length and angle to point towards newPos
      const dx = newPos.x - bone.start.x;
      const dy = newPos.y - bone.start.y;
      bone.length = Math.max(10, Math.sqrt(dx * dx + dy * dy));
      const targetWorldAngle = Math.atan2(dy, dx);

      if (!bone.parentId) {
        bone.localAngle = targetWorldAngle;
      } else {
        const parent = skeleton.bones.find((b) => b.id === bone.parentId);
        if (parent) {
          bone.localAngle = normalizeAngle(targetWorldAngle - parent.worldAngle);
        }
      }
    }

    updateWorldTransforms(skeleton);

    if (mode === 'rig') {
      // In rig mode, adjust rest geometry directly - DO NOT BEND!
      if (mesh) resetMeshToRest(mesh);
      this.state.restSkeleton = cloneSkeleton(skeleton);
      if (mesh) computeAutoWeights(mesh, skeleton);
      this.notify();
      return;
    }

    this.updateDeformedMesh();
    if (mesh) computeAutoWeights(mesh, skeleton);
  }

  /**
   * Adds a bone to the skeleton with inherited width and dynamic branching/chaining.
   */
  public addBone(
    parentId?: string | null,
    targetEndPos?: Point2D,
    startPos?: Point2D,
    options?: { startWidth?: number; endWidth?: number; branchFromStart?: boolean }
  ): Bone | null {
    this.saveHistory();

    const { skeleton, restSkeleton, mesh, image } = this.state;
    const imgW = image?.naturalWidth || image?.width || 360;
    const imgH = image?.naturalHeight || image?.height || 480;

    // Case 1: No skeleton or skeleton has 0 bones -> Create Master / Root Bone!
    if (!skeleton || skeleton.bones.length === 0) {
      const rootStart: Point2D = startPos ? { ...startPos } : { x: imgW * 0.5, y: imgH * 0.55 };
      let length = 60;
      let localAngle = -Math.PI / 2; // pointing upwards

      if (targetEndPos) {
        const dx = targetEndPos.x - rootStart.x;
        const dy = targetEndPos.y - rootStart.y;
        length = Math.max(15, Math.hypot(dx, dy));
        localAngle = Math.atan2(dy, dx);
      }

      const startWidth = options?.startWidth ?? 28;
      const endWidth = options?.endWidth ?? 20;

      const masterBone: Bone = {
        id: `root_${Date.now()}`,
        name: 'Master (Root)',
        parentId: null,
        localAngle,
        length,
        startWidth,
        endWidth,
        color: BONE_PALETTE[0],
        start: { ...rootStart },
        end: {
          x: rootStart.x + Math.cos(localAngle) * length,
          y: rootStart.y + Math.sin(localAngle) * length,
        },
        worldAngle: localAngle,
        isIKTarget: false,
        isPinned: false,
      };

      const newSkeleton: Skeleton = {
        bones: [masterBone],
        rootId: masterBone.id,
        rootPos: { ...rootStart },
        restRootPos: { ...rootStart },
        restBones: {
          [masterBone.id]: { localAngle, length },
        },
      };

      const newRestSkeleton = cloneSkeleton(newSkeleton);

      this.setState({
        skeleton: newSkeleton,
        restSkeleton: newRestSkeleton,
        selectedBoneId: masterBone.id,
      });

      this.updateDeformedMesh();
      if (mesh) computeAutoWeights(mesh, newSkeleton);
      return masterBone;
    }

    // Case 2: Skeleton exists -> Add descendant or branch from parent!
    let parent: Bone | undefined;
    if (parentId !== undefined && parentId !== null) {
      parent = skeleton.bones.find((b) => b.id === parentId);
    } else if (this.state.selectedBoneId) {
      parent = skeleton.bones.find((b) => b.id === this.state.selectedBoneId);
    }
    if (!parent) {
      parent = skeleton.bones[0];
    }

    const branchFromStart = options?.branchFromStart ?? false;
    const boneStartPos: Point2D = branchFromStart ? { ...parent.start } : { ...parent.end };

    // Width inheritance rule:
    // "Bone width needs to be inherited from last bone on root end."
    // When branching from root/start: inherit parent.startWidth
    // When chaining from tip/end: inherit parent.endWidth
    const inheritedStartWidth = branchFromStart
      ? (parent.startWidth ?? 26)
      : (parent.endWidth ?? 20);
    const startWidth = options?.startWidth ?? inheritedStartWidth;
    const endWidth = options?.endWidth ?? Math.max(6, Math.round(startWidth * 0.78));

    let length = Math.max(20, Math.min(80, parent.length * 0.9));
    let localAngle = 0; // Straight continuation by default

    const existingChildren = skeleton.bones.filter((b) => b.parentId === parent!.id);

    if (targetEndPos) {
      const dx = targetEndPos.x - boneStartPos.x;
      const dy = targetEndPos.y - boneStartPos.y;
      length = Math.max(12, Math.hypot(dx, dy));
      const targetWorldAngle = Math.atan2(dy, dx);
      localAngle = normalizeAngle(targetWorldAngle - parent.worldAngle);
    } else {
      if (existingChildren.length === 1) {
        localAngle = degToRad(35);
      } else if (existingChildren.length === 2) {
        localAngle = degToRad(-35);
      } else if (existingChildren.length > 2) {
        localAngle = degToRad(40 * (existingChildren.length % 2 === 1 ? 1 : -1));
      }
    }

    const childIndex = existingChildren.length + 1;
    const isBranch = existingChildren.length > 0 || branchFromStart;
    const cleanParentName = parent.name.replace(/^(Master|Bone)\s*/i, '');
    const newName = isBranch
      ? `${cleanParentName || 'Bone'}.Branch${childIndex}`
      : `${cleanParentName || 'Bone'}.${childIndex}`;

    const colorIndex = skeleton.bones.length % BONE_PALETTE.length;
    const newBone: Bone = {
      id: `bone_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: newName,
      parentId: parent.id,
      localAngle,
      length,
      startWidth,
      endWidth,
      color: BONE_PALETTE[colorIndex],
      start: { ...boneStartPos },
      end: { x: boneStartPos.x, y: boneStartPos.y },
      worldAngle: normalizeAngle(parent.worldAngle + localAngle),
      isIKTarget: false,
      isPinned: false,
    };

    skeleton.bones.push(newBone);
    skeleton.restBones[newBone.id] = { localAngle, length };

    // Update restSkeleton
    if (restSkeleton) {
      const restParent = restSkeleton.bones.find((b) => b.id === parent!.id);
      if (restParent) {
        const restStart = branchFromStart ? { ...restParent.start } : { ...restParent.end };
        restSkeleton.bones.push({
          ...newBone,
          start: restStart,
          end: { ...restStart },
        });
        restSkeleton.restBones[newBone.id] = { localAngle, length };
      }
    }

    updateWorldTransforms(skeleton);
    if (restSkeleton) updateWorldTransforms(restSkeleton);

    this.setState({
      selectedBoneId: newBone.id,
    });

    this.updateDeformedMesh();
    if (mesh) computeAutoWeights(mesh, skeleton);
    return newBone;
  }

  public deleteBone(boneId?: string | null) {
    this.saveHistory();
    const { skeleton, restSkeleton, mesh } = this.state;
    if (!skeleton || skeleton.bones.length === 0) return;

    const targetId = boneId || this.state.selectedBoneId;
    if (!targetId) return;

    const boneIndex = skeleton.bones.findIndex((b) => b.id === targetId);
    if (boneIndex === -1) return;

    const targetBone = skeleton.bones[boneIndex];
    const parentId = targetBone.parentId;

    const children = skeleton.bones.filter((b) => b.parentId === targetId);
    if (targetBone.parentId === null) {
      if (children.length > 0) {
        const newRoot = children[0];
        newRoot.parentId = null;
        skeleton.rootId = newRoot.id;
        skeleton.rootPos = { ...newRoot.start };
        for (let i = 1; i < children.length; i++) {
          children[i].parentId = newRoot.id;
        }
      }
    } else {
      children.forEach((c) => {
        c.parentId = parentId;
      });
    }

    skeleton.bones.splice(boneIndex, 1);
    delete skeleton.restBones[targetId];

    if (restSkeleton) {
      const rIdx = restSkeleton.bones.findIndex((b) => b.id === targetId);
      if (rIdx !== -1) restSkeleton.bones.splice(rIdx, 1);
      delete restSkeleton.restBones[targetId];
      if (children.length > 0 && targetBone.parentId === null) {
        const newRoot = restSkeleton.bones.find((b) => b.id === children[0].id);
        if (newRoot) {
          newRoot.parentId = null;
          restSkeleton.rootId = newRoot.id;
          restSkeleton.rootPos = { ...newRoot.start };
        }
      }
      children.forEach((c) => {
        const rc = restSkeleton.bones.find((b) => b.id === c.id);
        if (rc) rc.parentId = c.parentId;
      });
    }

    const nextSelected = parentId || skeleton.bones[0]?.id || null;

    if (skeleton.bones.length > 0) {
      updateWorldTransforms(skeleton);
      if (restSkeleton) updateWorldTransforms(restSkeleton);
    }

    this.setState({
      selectedBoneId: nextSelected,
    });

    this.updateDeformedMesh();
    if (mesh && skeleton.bones.length > 0) computeAutoWeights(mesh, skeleton);
  }

  public clearAllBones() {
    this.saveHistory();
    const { skeleton, restSkeleton, mesh } = this.state;
    if (!skeleton) return;
    skeleton.bones = [];
    skeleton.restBones = {};
    if (restSkeleton) {
      restSkeleton.bones = [];
      restSkeleton.restBones = {};
    }
    if (mesh) {
      for (const v of mesh.vertices) {
        v.weights = [];
        v.x = v.originalX;
        v.y = v.originalY;
      }
    }
    this.setState({
      selectedBoneId: null,
      tool: 'add_bone',
      mode: 'rig',
    });
    this.notify();
  }

  public selectPreviousBone() {
    const { skeleton, selectedBoneId } = this.state;
    if (!skeleton || skeleton.bones.length === 0) return;
    const idx = skeleton.bones.findIndex((b) => b.id === selectedBoneId);
    const nextIdx = idx <= 0 ? skeleton.bones.length - 1 : idx - 1;
    this.setSelectedBoneId(skeleton.bones[nextIdx].id);
  }

  public selectNextBone() {
    const { skeleton, selectedBoneId } = this.state;
    if (!skeleton || skeleton.bones.length === 0) return;
    const idx = skeleton.bones.findIndex((b) => b.id === selectedBoneId);
    const nextIdx = idx >= skeleton.bones.length - 1 ? 0 : idx + 1;
    this.setSelectedBoneId(skeleton.bones[nextIdx].id);
  }

  public selectParentBone() {
    const { skeleton, selectedBoneId } = this.state;
    if (!skeleton || !selectedBoneId) return;
    const curr = skeleton.bones.find((b) => b.id === selectedBoneId);
    if (curr && curr.parentId) {
      this.setSelectedBoneId(curr.parentId);
    }
  }

  public selectChildBone() {
    const { skeleton, selectedBoneId } = this.state;
    if (!skeleton || !selectedBoneId) return;
    const child = skeleton.bones.find((b) => b.parentId === selectedBoneId);
    if (child) {
      this.setSelectedBoneId(child.id);
    }
  }

  public quickRotateBone(deltaDeg: number) {
    const { selectedBoneId } = this.state;
    if (!selectedBoneId) return;
    this.rotateBone(selectedBoneId, degToRad(deltaDeg));
  }

  public resetBoneAngle(boneId?: string) {
    const id = boneId || this.state.selectedBoneId;
    if (!id) return;
    const { restSkeleton } = this.state;
    const restBone = restSkeleton?.bones.find((b) => b.id === id);
    const targetAngle = restBone ? restBone.localAngle : 0;
    this.setBoneAngle(id, targetAngle);
  }

  public applyIK(effectorBoneId: string, targetPos: Point2D) {
    const { skeleton } = this.state;
    if (!skeleton) return;

    solveCCD2D(skeleton, effectorBoneId, targetPos, 3, 15);
    this.setState({
      activeIKEffectorId: effectorBoneId,
      ikTargetPos: { ...targetPos },
    });
    this.updateDeformedMesh();
  }

  public resetToRestPose() {
    const { skeleton, restSkeleton } = this.state;
    if (!skeleton || !restSkeleton) return;

    skeleton.rootPos = { ...restSkeleton.rootPos };
    skeleton.bones.forEach((b) => {
      const rest = restSkeleton.bones.find((rb) => rb.id === b.id);
      if (rest) {
        b.localAngle = rest.localAngle;
        b.length = rest.length;
      }
    });

    this.setState({ ikTargetPos: null, activeIKEffectorId: null });
    this.updateDeformedMesh();
  }

  public recomputeWeights() {
    const { mesh, skeleton } = this.state;
    if (mesh && skeleton) {
      optimizeBoneWidthsAndComputeWeights(mesh, skeleton);
      if (this.state.restSkeleton) {
        // Sync rest skeleton bone widths as well
        for (const b of skeleton.bones) {
          const rb = this.state.restSkeleton.bones.find((r) => r.id === b.id);
          if (rb) {
            rb.startWidth = b.startWidth;
            rb.endWidth = b.endWidth;
          }
        }
      }
      this.updateDeformedMesh();
      this.notify();
    }
  }

  public play() {
    this.setState({ isPlaying: true });
  }

  public pause() {
    this.setState({ isPlaying: false });
  }

  public seek(time: number) {
    const { clips, activeClipId } = this.state;
    const clip = clips.find((c) => c.id === activeClipId);
    const maxTime = clip ? clip.duration : 1;
    const clampedTime = Math.max(0, Math.min(maxTime, time));

    this.setState({ currentTime: clampedTime });
    this.applyAnimationPose(clampedTime);
  }

  public tick(deltaSeconds: number) {
    const { isPlaying, currentTime, playbackSpeed, clips, activeClipId } = this.state;
    if (!isPlaying) return;

    const clip = clips.find((c) => c.id === activeClipId);
    if (!clip || clip.keyframes.length === 0) return;

    let nextTime = currentTime + deltaSeconds * playbackSpeed;
    if (nextTime >= clip.duration) {
      if (clip.loop) {
        nextTime = nextTime % clip.duration;
      } else {
        nextTime = clip.duration;
        this.pause();
      }
    }

    this.setState({ currentTime: nextTime });
    this.applyAnimationPose(nextTime);
  }

  private applyAnimationPose(time: number) {
    const { clips, activeClipId, skeleton } = this.state;
    const clip = clips.find((c) => c.id === activeClipId);
    if (!clip || !skeleton || clip.keyframes.length === 0) return;

    // Find bounding keyframes
    const sorted = [...clip.keyframes].sort((a, b) => a.time - b.time);
    let prev = sorted[0];
    let next = sorted[sorted.length - 1];

    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].time <= time) {
        prev = sorted[i];
      }
      if (sorted[i].time >= time) {
        next = sorted[i];
        break;
      }
    }

    let alpha = 0;
    if (next.time > prev.time) {
      alpha = (time - prev.time) / (next.time - prev.time);
    }

    // Interpolate bone rotations
    for (const bone of skeleton.bones) {
      const angleA = prev.boneRotations[bone.id] ?? bone.localAngle;
      const angleB = next.boneRotations[bone.id] ?? bone.localAngle;
      bone.localAngle = lerpAngle(angleA, angleB, alpha);
    }

    this.updateDeformedMesh();
  }

  public selectClip(clipId: string) {
    this.setState({ activeClipId: clipId, currentTime: 0 });
    this.applyAnimationPose(0);
  }

  public addKeyframeAtCurrentTime() {
    const { clips, activeClipId, currentTime, skeleton } = this.state;
    if (!skeleton) return;
    const clip = clips.find((c) => c.id === activeClipId);
    if (!clip) return;

    const boneRotations: Record<string, number> = {};
    skeleton.bones.forEach((b) => (boneRotations[b.id] = b.localAngle));

    const newKeyframe = {
      id: `kf_${Date.now()}`,
      time: Math.round(currentTime * 100) / 100,
      boneRotations,
    };

    const existingIdx = clip.keyframes.findIndex((k) => Math.abs(k.time - currentTime) < 0.02);
    if (existingIdx >= 0) {
      clip.keyframes[existingIdx] = newKeyframe;
    } else {
      clip.keyframes.push(newKeyframe);
      clip.keyframes.sort((a, b) => a.time - b.time);
    }

    this.notify();
  }

  public deleteKeyframe(keyframeId: string) {
    const { clips, activeClipId } = this.state;
    const clip = clips.find((c) => c.id === activeClipId);
    if (!clip) return;

    clip.keyframes = clip.keyframes.filter((k) => k.id !== keyframeId);
    this.notify();
  }

  public setPlaybackSpeed(playbackSpeed: number) {
    this.setState({ playbackSpeed });
  }

  public setZoom(zoom: number) {
    this.setState({ zoom: Math.max(0.2, Math.min(4.0, zoom)) });
  }

  public setPan(pan: Point2D) {
    this.setState({ pan });
  }

  public toggleView(key: 'showTexture' | 'showMesh' | 'showBones' | 'showWeights') {
    this.setState({ [key]: !this.state[key] });
  }

  public resetView() {
    const { image } = this.state;
    const w = image?.width || 300;
    const h = image?.height || 400;
    this.setState({
      pan: { x: -w / 2, y: -h / 2 },
      zoom: 1.0,
    });
  }
}

export const studioStore = new StudioStore();

import { useSyncExternalStore } from 'react';

export function useStudioStore<T>(selector: (state: StudioState) => T): T {
  return useSyncExternalStore(
    (onStoreChange) => studioStore.subscribe(onStoreChange),
    () => selector(studioStore.getState())
  );
}

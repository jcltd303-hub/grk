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
  RigExportJSON,
  WeightBrushSettings,
  WeightBrushMode,
} from '../lib/rig/types';
import { CHARACTER_PRESETS, DEFAULT_ARTWORK_URL } from '../lib/rig/image-bank';
import { createDefaultSkeleton, createEmptySkeleton, getDefaultAnimationClips } from '../lib/rig/presets';
import { getStarterRigJSON } from '../lib/rig/starter-rig';
import { generateMesh, computeAutoWeights, optimizeBoneWidthsAndComputeWeights, inferBoneWidthsFromMeshGeometry, applyWeightBrush } from '../lib/rig/mesh';
import {
  updateWorldTransforms,
  cloneSkeleton,
  computeBoneDeltaTransforms,
  deformMesh,
  resetMeshToRest,
  reparentBone,
  mirrorBone,
} from '../lib/rig/skeleton';
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

  // Weight Brush Settings
  weightBrushSettings: WeightBrushSettings;

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
  loadStarterRig: () => Promise<boolean>;
  exportRigJSON: (options?: { embedImage?: boolean; rigName?: string }) => RigExportJSON | null;
  loadRigFromJSON: (jsonString: string) => Promise<{ success: boolean; error?: string; stats?: { bones: number; vertices: number; clips: number; name?: string } }>;
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

  // Bone Transforms, Hierarchy & Generation
  addBone: (
    parentId?: string | null,
    targetEndPos?: Point2D,
    startPos?: Point2D,
    options?: { startWidth?: number; endWidth?: number; branchFromStart?: boolean }
  ) => Bone | null;
  deleteBone: (boneId?: string | null) => void;
  clearAllBones: () => void;
  reparentBone: (boneId: string, newParentId: string | null) => boolean;
  mirrorBone: (boneId: string) => Bone | null;
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

  // Weight Brush Operations
  setWeightBrushSettings: (settings: Partial<WeightBrushSettings>) => void;
  paintWeights: (worldPos: Point2D) => void;
  smoothAllWeightsForBone: (boneId?: string) => void;


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
      weightBrushSettings: {
        radius: 45,
        intensity: 0.35,
        mode: 'add',
        targetWeight: 1.0,
      },
      isPlaying: false,
      currentTime: 0,
      playbackSpeed: 1.0,
      activeClipId: null,
      clips: [],
      canUndo: false,
      canRedo: false,

      init: () => this.init(),
      selectPreset: (id) => this.selectPreset(id),
      loadStarterRig: () => this.loadStarterRig(),
      exportRigJSON: (opts) => this.exportRigJSON(opts),
      loadRigFromJSON: (json) => this.loadRigFromJSON(json),
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
      reparentBone: (boneId, newParentId) => this.reparentBone(boneId, newParentId),
      mirrorBone: (boneId) => this.mirrorBone(boneId),
      selectPreviousBone: () => this.selectPreviousBone(),
      selectNextBone: () => this.selectNextBone(),
      selectParentBone: () => this.selectParentBone(),
      selectChildBone: () => this.selectChildBone(),
      quickRotateBone: (deg) => this.quickRotateBone(deg),
      resetBoneAngle: (id) => this.resetBoneAngle(id),
      applyIK: (effectorId, target) => this.applyIK(effectorId, target),
      resetToRestPose: () => this.resetToRestPose(),
      recomputeWeights: () => this.recomputeWeights(),
      setWeightBrushSettings: (settings) => this.setWeightBrushSettings(settings),
      paintWeights: (worldPos) => this.paintWeights(worldPos),
      smoothAllWeightsForBone: (boneId) => this.smoothAllWeightsForBone(boneId),
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
      this.refreshAutomaticSkinning();
    } else {
      this.updateDeformedMesh();
    }
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
      this.refreshAutomaticSkinning();
    } else {
      this.updateDeformedMesh();
    }
  }

  public init() {
    this.loadStarterRig();
  }

  public selectPreset(_presetId: string) {
    this.loadStarterRig();
  }

  public loadCustomImage(dataUrl: string, _presetType?: PresetType) {
    this.loadArtworkImage(dataUrl);
  }

  /**
   * Loads the starter reference rig using the comprehensive Rig JSON engine.
   */
  public async loadStarterRig(): Promise<boolean> {
    const starterJSON = getStarterRigJSON();
    const result = await this.loadRigFromJSON(starterJSON);
    return result.success;
  }

  /**
   * Generates a comprehensive, self-contained RigExportJSON object representing
   * the exact current skeleton, bone envelopes, skinning weights, mesh geometry,
   * animation keyframes, and optionally embedded artwork data.
   */
  public exportRigJSON(options?: { embedImage?: boolean; rigName?: string }): RigExportJSON | null {
    const { skeleton, clips, mesh, image } = this.state;
    if (!skeleton) return null;

    let imageDataUrl: string | undefined = undefined;
    if (options?.embedImage !== false && image) {
      if (image.src.startsWith('data:')) {
        imageDataUrl = image.src;
      } else {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth || image.width;
          canvas.height = image.naturalHeight || image.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(image, 0, 0);
            imageDataUrl = canvas.toDataURL('image/png');
          }
        } catch {
          imageDataUrl = image.src;
        }
      }
    }

    const exportData: RigExportJSON = {
      version: '2.0',
      format: '2d-skeletal-rig-studio',
      name: options?.rigName || '2D Rig',
      exportedAt: new Date().toISOString(),
      image: image
        ? {
            dataUrl: imageDataUrl,
            width: image.naturalWidth || image.width,
            height: image.naturalHeight || image.height,
          }
        : undefined,
      skeleton: {
        rootId: skeleton.rootId,
        rootPos: { ...skeleton.rootPos },
        restRootPos: { ...(skeleton.restRootPos || skeleton.rootPos) },
        restBones: skeleton.restBones || {},
        bones: skeleton.bones.map((b) => ({
          id: b.id,
          name: b.name,
          parentId: b.parentId,
          length: b.length,
          localAngle: b.localAngle,
          worldAngle: b.worldAngle,
          color: b.color,
          startWidth: b.startWidth ?? 26,
          endWidth: b.endWidth ?? 18,
          minAngle: b.minAngle,
          maxAngle: b.maxAngle,
          isPinned: !!b.isPinned,
          isIKTarget: !!b.isIKTarget,
        })),
      },
      mesh: mesh
        ? {
            width: mesh.width,
            height: mesh.height,
            density: mesh.density,
            vertexCount: mesh.vertices.length,
            triangleCount: mesh.triangles.length,
            vertices: mesh.vertices.map((v) => ({
              x: v.x,
              y: v.y,
              u: v.u,
              v: v.v,
              originalX: v.originalX,
              originalY: v.originalY,
              weights: v.weights.map((w) => ({ boneId: w.boneId, weight: w.weight })),
            })),
            triangles: mesh.triangles,
          }
        : undefined,
      animations: clips.map((c) => ({
        id: c.id,
        name: c.name,
        duration: c.duration,
        fps: c.fps,
        loop: c.loop,
        keyframes: c.keyframes.map((k) => ({
          id: k.id,
          time: k.time,
          boneRotations: { ...k.boneRotations },
          rootOffset: k.rootOffset ? { ...k.rootOffset } : undefined,
        })),
      })),
    };

    return exportData;
  }

  /**
   * Comprehensively loads a 2D skeletal rig from an exported JSON string.
   * Restores embedded texture image, full bone hierarchy & envelopes,
   * mesh skinning weights, and keyframe animations.
   */
  public async loadRigFromJSON(jsonString: string): Promise<{
    success: boolean;
    error?: string;
    stats?: { bones: number; vertices: number; clips: number; name?: string };
  }> {
    try {
      const data = JSON.parse(jsonString);
      if (!data.skeleton || !Array.isArray(data.skeleton.bones) || data.skeleton.bones.length === 0) {
        return {
          success: false,
          error: 'Rig JSON format error: Missing skeleton or bones array.',
        };
      }

      // Determine artwork image source
      let imageSrc = data.image?.dataUrl || data.imageDataUrl || data.imageSrc;
      if (!imageSrc) {
        if (this.state.image?.src) {
          imageSrc = this.state.image.src;
        } else {
          imageSrc = DEFAULT_ARTWORK_URL;
        }
      }

      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = imageSrc;

        img.onload = () => {
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;

          // 1. Build Skeleton from JSON
          const rootPos: Point2D = data.skeleton.rootPos || { x: w * 0.5, y: h * 0.5 };
          const restRootPos: Point2D = data.skeleton.restRootPos || { ...rootPos };

          const skeleton: Skeleton = {
            rootId: data.skeleton.rootId || data.skeleton.bones[0]?.id || 'root',
            rootPos: { ...rootPos },
            restRootPos: { ...restRootPos },
            restBones: data.skeleton.restBones || {},
            bones: data.skeleton.bones.map((b: any, idx: number) => ({
              id: b.id || `bone_${idx}`,
              name: b.name || `Bone ${idx + 1}`,
              parentId: b.parentId !== undefined ? b.parentId : null,
              length: typeof b.length === 'number' ? b.length : 50,
              localAngle: typeof b.localAngle === 'number' ? b.localAngle : 0,
              color: b.color || '#38bdf8',
              start: b.start || { x: 0, y: 0 },
              end: b.end || { x: 0, y: 0 },
              worldAngle: typeof b.worldAngle === 'number' ? b.worldAngle : 0,
              startWidth: typeof b.startWidth === 'number' ? b.startWidth : 26,
              endWidth: typeof b.endWidth === 'number' ? b.endWidth : 18,
              minAngle: typeof b.minAngle === 'number' ? b.minAngle : undefined,
              maxAngle: typeof b.maxAngle === 'number' ? b.maxAngle : undefined,
              isPinned: !!b.isPinned,
              isIKTarget: !!b.isIKTarget,
            })),
          };

          updateWorldTransforms(skeleton);

          // Populate restBones map if missing
          if (Object.keys(skeleton.restBones).length === 0) {
            for (const b of skeleton.bones) {
              skeleton.restBones[b.id] = {
                localAngle: b.localAngle,
                length: b.length,
              };
            }
          }

          // 2. Build or Generate Mesh & Weights
          const alphaMask = extractAlphaMask(img);
          let mesh: RigMesh;

          if (
            data.mesh &&
            Array.isArray(data.mesh.vertices) &&
            data.mesh.vertices.length > 0 &&
            Array.isArray(data.mesh.triangles) &&
            data.mesh.triangles.length > 0
          ) {
            mesh = {
              width: data.mesh.width || w,
              height: data.mesh.height || h,
              density: data.mesh.density || 24,
              triangles: data.mesh.triangles,
              vertices: data.mesh.vertices.map((v: any) => ({
                x: v.x,
                y: v.y,
                u: v.u,
                v: v.v,
                originalX: typeof v.originalX === 'number' ? v.originalX : v.x,
                originalY: typeof v.originalY === 'number' ? v.originalY : v.y,
                weights: Array.isArray(v.weights)
                  ? v.weights.map((w: any) => ({ boneId: w.boneId, weight: w.weight }))
                  : [],
              })),
            };
          } else {
            // Generate regular triangular mesh & auto compute weights
            mesh = generateMesh(w, h, 18, 26, alphaMask);
            inferBoneWidthsFromMeshGeometry(mesh, skeleton);
            computeAutoWeights(mesh, skeleton);
          }

          // Always rebuild automatic envelopes and weights from the current artwork.
          // Imported/manual weights are not treated as the source of truth.
          inferBoneWidthsFromMeshGeometry(mesh, skeleton);
          computeAutoWeights(mesh, skeleton);

          // 3. Create Rest Skeleton clone
          const restSkeleton = cloneSkeleton(skeleton);

          // 4. Restore Animation Clips
          let clips: AnimationClip[] = [];
          if (Array.isArray(data.animations) && data.animations.length > 0) {
            clips = data.animations;
          } else if (Array.isArray(data.clips) && data.clips.length > 0) {
            clips = data.clips;
          } else {
            clips = [
              {
                id: 'clip_rest',
                name: 'Rest Pose',
                duration: 1.0,
                fps: 30,
                loop: true,
                keyframes: [
                  {
                    id: 'kf_0',
                    time: 0,
                    boneRotations: skeleton.bones.reduce(
                      (acc, b) => ({ ...acc, [b.id]: b.localAngle }),
                      {}
                    ),
                  },
                ],
              },
            ];
          }

          const activeClip = clips[0] || null;

          this.undoStack = [];
          this.redoStack = [];

          this.setState({
            activePresetId: '',
            image: img,
            imageLoaded: true,
            alphaMask,
            mesh,
            skeleton,
            restSkeleton,
            mode: 'pose', // Immediately ready for testing and posing!
            tool: 'select',
            selectedBoneId: skeleton.bones[0]?.id || null,
            clips,
            activeClipId: activeClip ? activeClip.id : null,
            currentTime: 0,
            isPlaying: false,
            canUndo: false,
            canRedo: false,
            pan: { x: -w / 2, y: -h / 2 },
            zoom: Math.min(1.4, 520 / Math.max(w, h)),
          });

          this.updateDeformedMesh();

          resolve({
            success: true,
            stats: {
              bones: skeleton.bones.length,
              vertices: mesh.vertices.length,
              clips: clips.length,
              name: data.name,
            },
          });
        };

        img.onerror = () => {
          resolve({
            success: false,
            error: 'Failed to load texture image from data URL.',
          });
        };
      });
    } catch (err) {
      console.error('Failed to parse rig JSON', err);
      return {
        success: false,
        error: `JSON parse error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Loads an artwork image without preloading bones.
   * Moves to 'rig' mode and sets 'add_bone' tool so user can draw bones.
   */
  private loadArtworkImage(imgSrc: string) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imgSrc;

    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;

      const alphaMask = extractAlphaMask(img);
      const mesh = generateMesh(w, h, 18, 26, alphaMask);
      const skeleton = createEmptySkeleton(w, h);
      const restSkeleton = createEmptySkeleton(w, h);

      const clips = getDefaultAnimationClips('human');
      const activeClip = clips.length > 0 ? clips[0] : null;

      this.undoStack = [];
      this.redoStack = [];

      this.setState({
        activePresetId: '',
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
      // In RIG or WEIGHTS mode, keep mesh in rest pose for clean editing & painting!
      if (mode === 'rig' || mode === 'weights') {
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
    // Weight painting is no longer an editing mode. Legacy callers that request
    // "weights" are routed to rig mode so automatic geometry skinning remains canonical.
    if (mode === 'weights') mode = 'rig';
    if (mode === 'rig') {
      // Switching into Rig or Weights mode: unbend character completely back to rest pose
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
      if (this.state.tool === 'ik' || this.state.tool === 'weight_brush') {
        this.state.tool = 'select';
      }
    } else if (mode === 'pose' || mode === 'animate') {
      // Switching out of Rig mode into Pose/Animate mode:
      // Lock the current skeleton configuration as the restSkeleton bind pose
      const { skeleton, mesh } = this.state;
      if (skeleton && skeleton.bones.length > 0) {
        this.state.restSkeleton = cloneSkeleton(skeleton);
        if (mesh) {
          this.refreshAutomaticSkinning();
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
      this.refreshAutomaticSkinning();
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
      this.refreshAutomaticSkinning();
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
      this.refreshAutomaticSkinning();
      this.notify();
      return;
    }

    this.updateDeformedMesh();
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

    this.refreshAutomaticSkinning();
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

    this.refreshAutomaticSkinning();
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

    this.refreshAutomaticSkinning();
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
      this.refreshAutomaticSkinning();
      this.notify();
      return;
    }

    this.updateDeformedMesh();
    this.refreshAutomaticSkinning();
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

      this.refreshAutomaticSkinning();
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

    this.refreshAutomaticSkinning();
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

    if (mesh && skeleton.bones.length > 0) this.refreshAutomaticSkinning();
    else this.updateDeformedMesh();
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
    if (skeleton.bones.length > 0) this.refreshAutomaticSkinning();
    else this.notify();
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

  /** Rebuild the canonical automatic skin from the unposed bind skeleton.
   * Bone edits change the envelopes, so weights are refreshed automatically.
   * Animation/pose changes never invoke this path.
   */
  private refreshAutomaticSkinning() {
    const { mesh, skeleton, restSkeleton } = this.state;
    if (!mesh || !skeleton) return;

    const bindSkeleton = restSkeleton ?? skeleton;
    updateWorldTransforms(bindSkeleton);
    optimizeBoneWidthsAndComputeWeights(mesh, bindSkeleton);

    // Keep active and bind envelopes identical after automatic inference.
    for (const bone of skeleton.bones) {
      const bindBone = bindSkeleton.bones.find((b) => b.id === bone.id);
      if (bindBone) {
        bone.startWidth = bindBone.startWidth;
        bone.endWidth = bindBone.endWidth;
      }
    }
    if (restSkeleton && restSkeleton !== bindSkeleton) {
      updateWorldTransforms(restSkeleton);
    }

    this.updateDeformedMesh();
  }

  public recomputeWeights() {
    this.refreshAutomaticSkinning();
  }

  public reparentBone(boneId: string, newParentId: string | null): boolean {
    const { skeleton, restSkeleton } = this.state;
    if (!skeleton) return false;
    this.saveHistory();

    const ok = reparentBone(skeleton, boneId, newParentId);
    if (ok && restSkeleton) {
      reparentBone(restSkeleton, boneId, newParentId);
      // Sync rest angles
      const bone = skeleton.bones.find((b) => b.id === boneId);
      if (bone) {
        skeleton.restBones[bone.id] = { localAngle: bone.localAngle, length: bone.length };
        restSkeleton.restBones[bone.id] = { localAngle: bone.localAngle, length: bone.length };
      }
    }

    if (ok) this.refreshAutomaticSkinning();
    else this.updateDeformedMesh();
    return ok;
  }

  public mirrorBone(boneId: string): Bone | null {
    const { skeleton, restSkeleton, image, mesh } = this.state;
    if (!skeleton) return null;
    this.saveHistory();

    const centerX = mesh ? mesh.width * 0.5 : image ? image.width * 0.5 : 250;
    const newBone = mirrorBone(skeleton, boneId, centerX);

    if (newBone && restSkeleton) {
      const restCopy: Bone = {
        ...newBone,
        start: { ...newBone.start },
        end: { ...newBone.end },
      };
      restSkeleton.bones.push(restCopy);
      restSkeleton.restBones[newBone.id] = { localAngle: newBone.localAngle, length: newBone.length };
      updateWorldTransforms(restSkeleton);
    }

    if (newBone) {
      this.setSelectedBoneId(newBone.id);
      this.refreshAutomaticSkinning();
    }

    return newBone;
  }

  public setWeightBrushSettings(settings: Partial<WeightBrushSettings>) {
    this.setState({
      weightBrushSettings: {
        ...this.state.weightBrushSettings,
        ...settings,
      },
    });
  }

  public paintWeights(_worldPos: Point2D) {
    // Manual weight painting is intentionally obsolete. Automatic geometry
    // skinning is the single source of truth; keep this method only so older
    // serialized/UI callers do not crash.
    this.refreshAutomaticSkinning();
  }


  public smoothAllWeightsForBone(boneId?: string) {
    const { mesh, skeleton, selectedBoneId } = this.state;
    const targetBoneId = boneId || selectedBoneId;
    if (!mesh || !skeleton || !targetBoneId) return;

    this.saveHistory();
    const allBoneIds = skeleton.bones.map((b) => b.id);

    // Apply smoothing stamps across all vertices of target bone
    for (const v of mesh.vertices) {
      const wObj = v.weights.find((w) => w.boneId === targetBoneId);
      if (wObj && wObj.weight > 0.05) {
        applyWeightBrush(
          mesh,
          { x: v.originalX, y: v.originalY },
          targetBoneId,
          allBoneIds,
          { radius: 60, intensity: 0.6, mode: 'smooth' },
          true
        );
      }
    }

    this.updateDeformedMesh();
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

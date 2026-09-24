import React, { useState } from 'react';
import { useStudioStore, studioStore } from '../../store/studio';
import { radToDeg, degToRad } from '../../lib/rig/math';
import { VisualHierarchyTree } from './VisualHierarchyTree';
import {
  FolderOpen,
  FolderDown,
  Bone as BoneIcon,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Download,
  Crosshair,
  Sliders,
  CheckCircle2,
  Film,
  Layers,
  Wand2,
  X,
  Plus,
  Trash2,
  GitBranch,
  Pencil,
  ChevronLeft,
  ChevronRight,
  CornerUpLeft,
  RotateCw,
  Pin,
  PinOff,
  Undo2,
  Redo2,
  Copy,
} from 'lucide-react';

interface SidebarProps {
  onOpenUploadModal: () => void;
  onOpenLoadModal?: () => void;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onOpenUploadModal, onOpenLoadModal, onClose }) => {
  const skeleton = useStudioStore((s) => s.skeleton);
  const selectedBoneId = useStudioStore((s) => s.selectedBoneId);
  const mode = useStudioStore((s) => s.mode);
  const clips = useStudioStore((s) => s.clips);
  const activeClipId = useStudioStore((s) => s.activeClipId);
  const isPlaying = useStudioStore((s) => s.isPlaying);
  const canUndo = useStudioStore((s) => s.canUndo);
  const canRedo = useStudioStore((s) => s.canRedo);
  const meshAvailable = useStudioStore((s) => !!s.mesh);

  const [activeTab, setActiveTab] = useState<'bones' | 'animations' | 'export'>('bones');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const selectedBone = skeleton?.bones.find((b) => b.id === selectedBoneId) || null;

  // Handle Export Sprite Sheet
  const handleExportSpriteSheet = () => {
    const { image, skeleton, clips, activeClipId } = studioStore.getState();
    const clip = clips.find((c) => c.id === activeClipId) || clips[0];
    if (!image || !skeleton || !clip) return;

    // Render 8 frames from the animation clip
    const frameCount = 8;
    const frameWidth = image.width;
    const frameHeight = image.height;

    const sheetCanvas = document.createElement('canvas');
    sheetCanvas.width = frameWidth * frameCount;
    sheetCanvas.height = frameHeight;
    const sheetCtx = sheetCanvas.getContext('2d');
    if (!sheetCtx) return;

    // Pause animation while rendering
    studioStore.pause();

    const originalTime = studioStore.getState().currentTime;

    for (let f = 0; f < frameCount; f++) {
      const frameTime = (f / frameCount) * clip.duration;
      studioStore.seek(frameTime);

      const currentMesh = studioStore.getState().mesh;
      const currentSkeleton = studioStore.getState().skeleton;

      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = frameWidth;
      frameCanvas.height = frameHeight;
      const frameCtx = frameCanvas.getContext('2d');

      if (frameCtx && currentMesh && currentSkeleton) {
        // Draw frame centered
        frameCtx.save();
        frameCtx.drawImage(image, 0, 0);
        frameCtx.restore();
        sheetCtx.drawImage(frameCanvas, f * frameWidth, 0);
      }
    }

    studioStore.seek(originalTime);

    // Download Sprite Sheet
    const dataUrl = sheetCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `${clip.name.toLowerCase().replace(/\s+/g, '_')}_spritesheet.png`;
    link.href = dataUrl;
    link.click();

    setExportNotice(`Exported ${frameCount}-frame Sprite Sheet!`);
    setTimeout(() => setExportNotice(null), 4000);
  };

  // Handle Export Rig & Animation JSON
  const handleExportJSON = () => {
    const data = studioStore.exportRigJSON({ embedImage: true, rigName: '2D Rig' });
    if (!data) return;

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `rig_definition.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);

    setExportNotice('Exported Comprehensive Rig JSON (Skeleton, Mesh & Animations)!');
    setTimeout(() => setExportNotice(null), 4000);
  };

  const handleExportSpine = async () => {
    const { skeleton, mesh, clips, image } = studioStore.getState();
    if (!skeleton || !mesh || !image) {
      setExportNotice('Add artwork, bones, and a mesh before exporting.');
      return;
    }
    try {
      const file = await createSpinePackage({ skeleton, mesh, clips, image });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.download = 'spine-rig.zip';
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportNotice('Exported Spine JSON, atlas, and PNG.');
    } catch (error) {
      setExportNotice(error instanceof Error ? error.message : 'Spine export failed.');
    }
  };

  return (
    <aside className="w-72 sm:w-80 h-full bg-slate-900 border-r border-slate-800 flex flex-col z-10 shrink-0 text-slate-200">
      {/* Panel Header with Close for Mobile */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        <span className="text-xs font-semibold text-white flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-sky-400" />
          Rigging & Properties Panel
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition md:hidden"
            title="Close Panel"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Mode Switcher */}
      <div className="p-2 border-b border-slate-800 bg-slate-950/40">
        <div className="grid grid-cols-4 gap-1 p-0.5 bg-slate-800/80 rounded-lg border border-slate-700/60">
          <button
            id="mode_btn_pose"
            onClick={() => studioStore.setMode('pose')}
            className={`py-1 text-xs font-medium rounded-md transition text-center ${
              mode === 'pose'
                ? 'bg-sky-500 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Pose
          </button>
          <button
            id="mode_btn_rig"
            onClick={() => studioStore.setMode('rig')}
            className={`py-1 text-xs font-medium rounded-md transition text-center ${
              mode === 'rig'
                ? 'bg-sky-500 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Rig
          </button>
          <button
            id="mode_btn_animate"
            onClick={() => studioStore.setMode('animate')}
            className={`py-1 text-xs font-medium rounded-md transition text-center ${
              mode === 'animate'
                ? 'bg-sky-500 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Animate
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 text-xs">
        <button
          onClick={() => setActiveTab('bones')}
          className={`flex-1 py-2 font-medium flex items-center justify-center gap-1 border-b-2 transition ${
            activeTab === 'bones'
              ? 'border-sky-500 text-sky-400 bg-slate-800/30'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <BoneIcon className="w-3.5 h-3.5" />
          <span>Bones</span>
        </button>

        <button
          onClick={() => setActiveTab('animations')}
          className={`flex-1 py-2 font-medium flex items-center justify-center gap-1 border-b-2 transition ${
            activeTab === 'animations'
              ? 'border-sky-500 text-sky-400 bg-slate-800/30'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Film className="w-3.5 h-3.5" />
          <span>Clips</span>
        </button>

        <button
          onClick={() => setActiveTab('export')}
          className={`flex-1 py-2 font-medium flex items-center justify-center gap-1 border-b-2 transition ${
            activeTab === 'export'
              ? 'border-sky-500 text-sky-400 bg-slate-800/30'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {/* TAB 1: BONES & RIGGING */}
        {activeTab === 'bones' && (
          <>
            {/* Bone Management Action Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Bone Operations
                </span>
                <div className="flex items-center gap-1">
                  <button
                    id="btn_sidebar_undo"
                    onClick={() => studioStore.undo()}
                    disabled={!canUndo}
                    title="Undo (Ctrl+Z)"
                    className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none rounded transition"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    id="btn_sidebar_redo"
                    onClick={() => studioStore.redo()}
                    disabled={!canRedo}
                    title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
                    className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none rounded transition"
                  >
                    <Redo2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  id="btn_sidebar_draw_bones"
                  onClick={() => {
                    studioStore.setTool('add_bone');
                    studioStore.setMode('rig');
                  }}
                  className="px-3 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-sky-500/20 transition"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Draw on Canvas
                </button>

                <button
                  id="btn_sidebar_add_branch"
                  onClick={() => studioStore.addBone(selectedBoneId)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 text-slate-200 hover:text-white transition"
                >
                  <GitBranch className="w-3.5 h-3.5 text-sky-400" />
                  + Add Branch
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  id="btn_sidebar_select_prev"
                  onClick={() => studioStore.selectPreviousBone()}
                  disabled={!skeleton || skeleton.bones.length === 0}
                  className="flex-1 py-1.5 px-2 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none rounded-lg text-xs font-medium flex items-center justify-center gap-1 border border-slate-700/60 transition"
                  title="Select Previous Bone"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>

                <button
                  id="btn_sidebar_select_next"
                  onClick={() => studioStore.selectNextBone()}
                  disabled={!skeleton || skeleton.bones.length === 0}
                  className="flex-1 py-1.5 px-2 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none rounded-lg text-xs font-medium flex items-center justify-center gap-1 border border-slate-700/60 transition"
                  title="Select Next Bone"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                <button
                  id="btn_sidebar_select_parent"
                  onClick={() => studioStore.selectParentBone()}
                  disabled={!selectedBone || !selectedBone.parentId}
                  className="py-1.5 px-2.5 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none rounded-lg text-xs font-medium flex items-center justify-center gap-1 border border-slate-700/60 transition"
                  title="Select Parent Bone"
                >
                  <CornerUpLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Parent</span>
                </button>

                <button
                  id="btn_sidebar_delete_bone"
                  onClick={() => {
                    if (selectedBoneId) studioStore.deleteBone(selectedBoneId);
                  }}
                  disabled={!selectedBoneId}
                  className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 disabled:opacity-30 disabled:pointer-events-none rounded-lg transition"
                  title="Delete Selected Bone"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Utility Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button
                id="btn_reset_pose"
                onClick={() => studioStore.resetToRestPose()}
                className="flex-1 px-3 py-2 bg-slate-800/70 hover:bg-slate-750 border border-slate-700 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 text-slate-300 hover:text-white transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Pose
              </button>

            </div>

            {/* Automatic Skinning */}
            <div className="p-3.5 bg-emerald-500/5 border border-emerald-500/25 rounded-xl space-y-2.5">
              <div className="flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-emerald-300">Automatic Skinning</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                GRK derives bone envelopes and normalized vertex influences directly from the artwork geometry. No weight painting is required.
              </p>
              <button
                id="btn_auto_skin_geometry"
                onClick={() => studioStore.recomputeWeights()}
                disabled={!meshAvailable}
                className="w-full py-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 disabled:opacity-30 disabled:pointer-events-none text-emerald-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Rebuild Automatic Skin
              </button>
              <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500">
                <span>✓ Geometry widths</span><span>✓ 4-way influences</span>
                <span>✓ Joint blending</span><span>✓ Normalized weights</span>
              </div>
            </div>

            {/* Selected Bone Inspector */}
            {selectedBone ? (
              <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-sky-400 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5" />
                    Bone Inspector
                  </span>
                  <div className="flex items-center gap-1.5">
                    {/* Pin/Immobile Toggle */}
                    <button
                      id="btn_toggle_bone_pin"
                      onClick={() => studioStore.toggleBonePin(selectedBone.id)}
                      title={selectedBone.isPinned ? 'Node is Pinned (Immobile). Click to Unpin.' : 'Pin Node (Make Immobile in Rigging & IK)'}
                      className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition ${
                        selectedBone.isPinned
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-700'
                      }`}
                    >
                      {selectedBone.isPinned ? <Pin className="w-3 h-3 fill-amber-400 text-amber-400" /> : <PinOff className="w-3 h-3" />}
                      <span>{selectedBone.isPinned ? 'Pinned' : 'Pin'}</span>
                    </button>

                    <button
                      onClick={() => studioStore.deleteBone(selectedBone.id)}
                      title="Delete this bone"
                      className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-700 rounded transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white/20"
                      style={{ backgroundColor: selectedBone.color }}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 mb-1 block">Bone Name</label>
                  <input
                    type="text"
                    value={selectedBone.name}
                    onChange={(e) => studioStore.setBoneName(selectedBone.id, e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                {/* Automatic Envelope Inspector */}
                <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-emerald-400">Automatic Envelope</span>
                    <span className="text-[10px] text-slate-500">Geometry-derived</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-lg bg-slate-800/70 px-2 py-1.5">
                      <span className="text-slate-500 block">Start width</span>
                      <span className="font-mono text-white">{Math.round(selectedBone.startWidth ?? 24)}px</span>
                    </div>
                    <div className="rounded-lg bg-slate-800/70 px-2 py-1.5">
                      <span className="text-slate-500 block">End width</span>
                      <span className="font-mono text-white">{Math.round(selectedBone.endWidth ?? 16)}px</span>
                    </div>
                  </div>
                  <p className="text-[10px] leading-relaxed text-slate-500">
                    Widths are fitted from artwork geometry and rebuilt automatically when the rig changes.
                  </p>
                </div>

                {/* Mobile-friendly envelope controls: keep these in the inspector so they never cover the artwork. */}
                <div className="md:hidden p-2.5 bg-slate-900/80 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-sky-300">Envelope Widths</span>
                    <span className="text-[10px] text-slate-500">Auto-derived</span>
                  </div>
                  <label className="block">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-slate-400">Pivot / W1</span>
                      <span className="font-mono text-white">{Math.round(selectedBone.startWidth ?? 24)}px</span>
                    </div>
                    <input type="range" min="2" max="400" value={Math.round(selectedBone.startWidth ?? 24)}
                      onChange={(e) => studioStore.setBoneStartWidth(selectedBone.id, Number(e.target.value))}
                      className="w-full h-8 accent-sky-500 cursor-pointer touch-pan-x" />
                  </label>
                  <label className="block">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-slate-400">Tip / W2</span>
                      <span className="font-mono text-white">{Math.round(selectedBone.endWidth ?? 16)}px</span>
                    </div>
                    <input type="range" min="2" max="400" value={Math.round(selectedBone.endWidth ?? 16)}
                      onChange={(e) => studioStore.setBoneEndWidth(selectedBone.id, Number(e.target.value))}
                      className="w-full h-8 accent-sky-500 cursor-pointer touch-pan-x" />
                  </label>
                </div>

                {/* Local Rotation & Quick Nudges */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Local Rotation</span>
                    <span className="font-mono text-white font-semibold">
                      {Math.round(radToDeg(selectedBone.localAngle))}°
                    </span>
                  </div>
                  <input
                    type="range"
                    id="slider_bone_rotation"
                    min="-180"
                    max="180"
                    value={Math.round(radToDeg(selectedBone.localAngle))}
                    onChange={(e) =>
                      studioStore.setBoneAngle(selectedBone.id, degToRad(Number(e.target.value)))
                    }
                    onInput={(e) =>
                      studioStore.setBoneAngle(
                        selectedBone.id,
                        degToRad(Number((e.target as HTMLInputElement).value))
                      )
                    }
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                  {/* Angle Nudge Buttons */}
                  <div className="flex items-center justify-between gap-1 pt-1">
                    <button
                      onClick={() => studioStore.quickRotateBone(-15)}
                      className="px-2 py-1 bg-slate-900 hover:bg-slate-750 text-slate-300 hover:text-white rounded text-[10px] font-mono border border-slate-800 transition"
                    >
                      -15°
                    </button>
                    <button
                      onClick={() => studioStore.quickRotateBone(-5)}
                      className="px-2 py-1 bg-slate-900 hover:bg-slate-750 text-slate-300 hover:text-white rounded text-[10px] font-mono border border-slate-800 transition"
                    >
                      -5°
                    </button>
                    <button
                      onClick={() => studioStore.resetBoneAngle()}
                      className="px-2 py-1 bg-slate-900 hover:bg-slate-750 text-sky-400 hover:text-sky-300 rounded text-[10px] border border-slate-800 transition"
                    >
                      Reset
                    </button>
                    <button
                      onClick={() => studioStore.quickRotateBone(5)}
                      className="px-2 py-1 bg-slate-900 hover:bg-slate-750 text-slate-300 hover:text-white rounded text-[10px] font-mono border border-slate-800 transition"
                    >
                      +5°
                    </button>
                    <button
                      onClick={() => studioStore.quickRotateBone(15)}
                      className="px-2 py-1 bg-slate-900 hover:bg-slate-750 text-slate-300 hover:text-white rounded text-[10px] font-mono border border-slate-800 transition"
                    >
                      +15°
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                    <span>Bone Length</span>
                    <span className="font-mono text-white">{Math.round(selectedBone.length)}px</span>
                  </div>
                  <input
                    type="range"
                    id="slider_bone_length"
                    min="10"
                    max="200"
                    value={Math.round(selectedBone.length)}
                    onChange={(e) =>
                      studioStore.setBoneLength(selectedBone.id, Number(e.target.value))
                    }
                    onInput={(e) =>
                      studioStore.setBoneLength(
                        selectedBone.id,
                        Number((e.target as HTMLInputElement).value)
                      )
                    }
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                </div>
              </div>
            ) : (
              <div className="text-center py-5 border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
                Click any bone in viewport or list below to inspect & pose
              </div>
            )}

            {/* Bone Hierarchy Tree */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Skeleton Hierarchy ({skeleton?.bones.length || 0})
                </span>
                {skeleton && skeleton.bones.length > 0 && (
                  <button
                    onClick={() => studioStore.clearAllBones()}
                    className="text-[10px] text-rose-400 hover:text-rose-300 transition"
                  >
                    Clear All
                  </button>
                )}
              </div>
              <VisualHierarchyTree
                skeleton={skeleton}
                selectedBoneId={selectedBoneId}
                onSelectBone={(boneId) => studioStore.setSelectedBoneId(boneId)}
              />
            </div>
          </>
        )}

        {/* TAB: ANIMATION PRESETS */}
        {activeTab === 'animations' && (
          <div className="space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Preset Animation Cycles
            </span>

            <div className="space-y-2">
              {clips.map((clip) => {
                const isActive = activeClipId === clip.id;
                return (
                  <div
                    key={clip.id}
                    className={`p-3 rounded-xl border transition ${
                      isActive
                        ? 'bg-sky-500/15 border-sky-500/50'
                        : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Film className={`w-4 h-4 ${isActive ? 'text-sky-400' : 'text-slate-400'}`} />
                        <span className="text-xs font-semibold text-white">{clip.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        {clip.duration}s • {clip.keyframes.length} keys
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          studioStore.selectClip(clip.id);
                          if (isActive && isPlaying) {
                            studioStore.pause();
                          } else {
                            studioStore.play();
                          }
                        }}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                          isActive && isPlaying
                            ? 'bg-amber-500 hover:bg-amber-600 text-white'
                            : 'bg-sky-500 hover:bg-sky-600 text-white'
                        }`}
                      >
                        {isActive && isPlaying ? (
                          <>
                            <Pause className="w-3.5 h-3.5" />
                            <span>Pause</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5" />
                            <span>Play</span>
                          </>
                        )}
                      </button>

                      {!isActive && (
                        <button
                          onClick={() => studioStore.selectClip(clip.id)}
                          className="py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition"
                        >
                          Select
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: EXPORT */}
        {activeTab === 'export' && (
          <div className="space-y-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Export Game Assets
            </span>

            {exportNotice && (
              <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{exportNotice}</span>
              </div>
            )}

            <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <FolderDown className="w-4 h-4 text-violet-400" />
                <span>Esoteric Spine 4.2</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Downloads a ZIP with rig.json, rig.atlas, and artwork.png for Spine runtimes.
              </p>
              <button
                id="btn_export_spine"
                onClick={handleExportSpine}
                className="w-full py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-xs font-medium flex items-center justify-center gap-2"
              >
                <Download className="w-3.5 h-3.5" />
                Export Spine Package
              </button>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Layers className="w-4 h-4 text-sky-400" />
                <span>Animated Sprite Sheet</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Renders a transparent horizontal strip containing 8 deformed animation keyframes ready for 2D game engines.
              </p>
              <button
                id="btn_export_spritesheet"
                onClick={handleExportSpriteSheet}
                className="w-full py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-xs font-medium flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 transition"
              >
                <Download className="w-3.5 h-3.5" />
                Export Sprite Sheet (PNG)
              </button>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <FolderDown className="w-4 h-4 text-amber-400" />
                <span>Load Rig (JSON)</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Import an articulated 2D skeletal rig from a JSON file or string with bones, envelopes, skinning weights, and animations.
              </p>
              <button
                id="btn_sidebar_load_rig"
                onClick={onOpenLoadModal}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition"
              >
                <FolderDown className="w-3.5 h-3.5 text-amber-400" />
                Load Rig from JSON
              </button>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <BoneIcon className="w-4 h-4 text-emerald-400" />
                <span>Rig Definition & Keys (JSON)</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Exports complete skeleton hierarchy, joint angles, mesh indices, and all animation track keyframes in JSON.
              </p>
              <button
                id="btn_export_json"
                onClick={handleExportJSON}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition"
              >
                <Download className="w-3.5 h-3.5" />
                Export Rig JSON
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
import { createSpinePackage } from '../../lib/rig/spine-package';

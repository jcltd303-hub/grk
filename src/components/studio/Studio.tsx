import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Viewport } from './Viewport';
import { Timeline } from './Timeline';
import { UploadScreen } from './UploadScreen';
import { LoadRigModal } from './LoadRigModal';
import { studioStore, useStudioStore } from '../../store/studio';
import {
  Bone,
  HelpCircle,
  FolderOpen,
  FolderDown,
  SlidersHorizontal,
  Undo2,
  Redo2,
  Pencil,
  GitBranch,
  RotateCcw,
  Wand2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export const Studio: React.FC = () => {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  // Default sidebar open on desktop
  const [isSidebarOpen, setIsSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  const skeleton = useStudioStore((s) => s.skeleton);
  const mesh = useStudioStore((s) => s.mesh);
  const mode = useStudioStore((s) => s.mode);
  const canUndo = useStudioStore((s) => s.canUndo);
  const canRedo = useStudioStore((s) => s.canRedo);
  const selectedBoneId = useStudioStore((s) => s.selectedBoneId);

  useEffect(() => {
    studioStore.init();

    // Global keyboard shortcuts (Undo, Redo, Delete)
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          studioStore.redo();
        } else {
          studioStore.undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        studioStore.redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const selId = studioStore.getState().selectedBoneId;
        if (selId) {
          e.preventDefault();
          studioStore.deleteBone(selId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none font-sans">
      {/* Top Studio Header */}
      <header className="h-11 sm:h-12 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-2.5 sm:px-4 shrink-0 z-20 gap-2">
        {/* Brand / Logo */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-sky-500/25 shrink-0">
            <Bone className="w-3.5 h-3.5 rotate-45" />
          </div>
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-bold tracking-tight text-white flex items-center gap-1.5 truncate">
              <span>2D Rig Studio</span>
              <span className="text-[9px] uppercase font-semibold px-1.5 py-0.2 bg-sky-500/20 text-sky-400 rounded border border-sky-500/30">
                v2.0
              </span>
            </div>
          </div>
        </div>

        {/* Center: Mode Toggle + Quick Undo / Redo */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Quick Mode Toggle in Header */}
          <div className="flex items-center p-0.5 bg-slate-950/70 rounded-lg border border-slate-800 text-xs">
            {(['pose', 'rig', 'animate'] as const).map((m) => (
              <button
                key={m}
                onClick={() => studioStore.setMode(m)}
                className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[11px] sm:text-xs font-medium capitalize transition ${
                  mode === m
                    ? 'bg-sky-500 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {m === 'rig' ? 'Rig' : m === 'pose' ? 'Pose' : 'Anim'}
              </button>
            ))}
          </div>

          {/* Undo / Redo Quick Header Buttons */}
          <div className="hidden sm:flex items-center bg-slate-950/70 rounded-lg border border-slate-800 p-0.5">
            <button
              id="btn_header_undo"
              onClick={() => studioStore.undo()}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none rounded transition"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              id="btn_header_redo"
              onClick={() => studioStore.redo()}
              disabled={!canRedo}
              title="Redo (Ctrl+Y)"
              className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none rounded transition"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right Actions: Inspector Toggle, Load Rig, Upload, Help */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Toggle Sidebar Button */}
          <button
            id="btn_toggle_sidebar"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition border ${
              isSidebarOpen
                ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                : 'bg-slate-800 hover:bg-slate-750 border-slate-700/70 text-slate-300'
            }`}
            title={isSidebarOpen ? 'Hide Rig Panel' : 'Show Rig Panel'}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Panel</span>
          </button>

          {/* Load Rig Button */}
          <button
            id="btn_header_load_rig"
            onClick={() => setIsLoadModalOpen(true)}
            className="px-2 sm:px-2.5 py-1 sm:py-1.5 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
            title="Load Existing Rig to Test / Play"
          >
            <FolderDown className="w-3.5 h-3.5 text-sky-400" />
            <span>Load Rig</span>
          </button>

          <button
            id="btn_header_upload"
            onClick={() => setIsUploadOpen(true)}
            className="px-2 sm:px-2.5 py-1 sm:py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 transition border border-slate-700/60"
            title="Upload Artwork"
          >
            <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden md:inline">Upload</span>
          </button>

          <button
            onClick={() => setIsHelpOpen(!isHelpOpen)}
            title="User Guide & Controls"
            className="p-1 sm:p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Secondary Tools Header Bar (Collapsed Tools Menu) */}
      <div className="h-9 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between px-3 shrink-0 z-10 text-xs overflow-x-auto custom-scrollbar gap-2">
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            id="btn_toolbar_load_rig"
            onClick={() => setIsLoadModalOpen(true)}
            className="px-2.5 py-1 bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 rounded-lg font-medium flex items-center gap-1 transition text-[11px]"
            title="Load Rig from JSON to Test/Play"
          >
            <FolderDown className="w-3 h-3 text-sky-400" />
            <span>Load Rig</span>
          </button>

          <button
            id="btn_header_draw"
            onClick={() => {
              studioStore.setTool('add_bone');
              studioStore.setMode('rig');
            }}
            className="px-2.5 py-1 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-semibold flex items-center gap-1 shadow-xs transition text-[11px]"
          >
            <Pencil className="w-3 h-3" />
            <span>Draw</span>
          </button>

          <button
            id="btn_header_branch"
            onClick={() => studioStore.addBone(selectedBoneId)}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 hover:text-white rounded-lg font-medium flex items-center gap-1 transition text-[11px]"
          >
            <GitBranch className="w-3 h-3 text-sky-400" />
            <span>+ Branch</span>
          </button>

          <button
            id="btn_header_reset_pose"
            onClick={() => studioStore.resetToRestPose()}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 hover:text-white rounded-lg font-medium flex items-center gap-1 transition text-[11px]"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Pose</span>
          </button>

          <button
            id="btn_header_auto_weights"
            onClick={() => studioStore.recomputeWeights()}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 hover:text-white rounded-lg font-medium flex items-center gap-1 transition text-[11px]"
          >
            <Wand2 className="w-3 h-3 text-emerald-400" />
            <span>Auto-Weights</span>
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0 text-[11px] text-slate-400">
          <span>Bones: <strong className="text-white font-mono">{skeleton?.bones.length || 0}</strong></span>
          <div className="h-3 w-px bg-slate-800 mx-1" />
          <button
            onClick={() => studioStore.selectPreviousBone()}
            disabled={!skeleton || skeleton.bones.length === 0}
            className="p-1 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 rounded transition"
            title="Previous Bone"
          >
            <ChevronLeft className="w-3 h-3" />
          </button>
          <button
            onClick={() => studioStore.selectNextBone()}
            disabled={!skeleton || skeleton.bones.length === 0}
            className="p-1 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 rounded transition"
            title="Next Bone"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Main Studio Body: Sidebar + Viewport */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Desktop Collapsible Sidebar */}
        <div
          className={`hidden md:block transition-all duration-300 ease-in-out h-full ${
            isSidebarOpen ? 'w-72 sm:w-80' : 'w-0 overflow-hidden'
          }`}
        >
          {isSidebarOpen && (
            <Sidebar
              onOpenUploadModal={() => setIsUploadOpen(true)}
              onOpenLoadModal={() => setIsLoadModalOpen(true)}
              onClose={() => setIsSidebarOpen(false)}
            />
          )}
        </div>

        {/* Mobile Slide-Over Drawer Sidebar */}
        {isSidebarOpen && (
          <div className="md:hidden fixed inset-0 z-40 flex">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs transition-opacity"
              onClick={() => setIsSidebarOpen(false)}
            />
            {/* Drawer Content */}
            <div className="relative z-50 h-full max-w-[85vw] shadow-2xl animate-in slide-in-from-left duration-200">
              <Sidebar
                onOpenUploadModal={() => {
                  setIsUploadOpen(true);
                  setIsSidebarOpen(false);
                }}
                onOpenLoadModal={() => {
                  setIsLoadModalOpen(true);
                  setIsSidebarOpen(false);
                }}
                onClose={() => setIsSidebarOpen(false)}
              />
            </div>
          </div>
        )}

        {/* Viewport Canvas (Always gets maximum remaining room) */}
        <main className="flex-1 relative overflow-hidden">
          <Viewport
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            isSidebarOpen={isSidebarOpen}
          />
        </main>
      </div>

      {/* Bottom Animation Timeline */}
      <Timeline />

      {/* Upload & Auto-Rig Modal */}
      <UploadScreen isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} />

      {/* User Help Modal */}
      {isHelpOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-5 space-y-4 text-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-sky-400" />
                Quick Controls & Rigging Guide
              </h3>
              <button
                onClick={() => setIsHelpOpen(false)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded"
              >
                Close
              </button>
            </div>

            <div className="space-y-2.5 text-xs leading-relaxed text-slate-300">
              <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/50">
                <h4 className="font-semibold text-white mb-1">📱 Mobile & Touch Gestures</h4>
                <ul className="list-disc list-inside space-y-1 text-slate-300">
                  <li><strong>1-Finger Drag</strong>: Drag any bone or joint to pose and rotate.</li>
                  <li><strong>Tip Drag</strong>: Dragging the end joint automatically activates Inverse Kinematics (IK).</li>
                  <li><strong>2-Finger Pinch</strong>: Pinch to zoom in/out smoothly.</li>
                  <li><strong>2-Finger Drag</strong>: Pan across the canvas freely.</li>
                </ul>
              </div>

              <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/50">
                <h4 className="font-semibold text-white mb-1">🎮 Posing & IK Mode</h4>
                <ul className="list-disc list-inside space-y-1 text-slate-300">
                  <li>Click and drag any bone to rotate it around its pivot joint.</li>
                  <li>Shift + drag any joint tip to activate real-time 2D Inverse Kinematics (IK).</li>
                  <li>The character mesh deforms continuously with smooth Linear Blend Skinning.</li>
                </ul>
              </div>

              <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/50">
                <h4 className="font-semibold text-white mb-1">🎬 Keyframing & Export</h4>
                <ul className="list-disc list-inside space-y-1 text-slate-300">
                  <li>Scrub the bottom timeline and press <strong>Play</strong> to preview animations.</li>
                  <li>Pose the character and click <strong>+ Keyframe</strong> to record new poses.</li>
                  <li>Export a transparent <strong>Sprite Sheet (PNG)</strong> or <strong>Rig JSON</strong> in the Panel!</li>
                </ul>
              </div>
            </div>

            <button
              onClick={() => setIsHelpOpen(false)}
              className="w-full py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-xs font-semibold transition"
            >
              Got it, let&apos;s animate!
            </button>
          </div>
        </div>
      )}

      {/* Load Existing Rig Modal */}
      <LoadRigModal
        isOpen={isLoadModalOpen}
        onClose={() => setIsLoadModalOpen(false)}
      />
    </div>
  );
};

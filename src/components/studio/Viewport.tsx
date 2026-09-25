import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useStudioStore, studioStore } from '../../store/studio';
import { renderRigScene } from '../../lib/rig/render-gl';
import { Point2D } from '../../lib/rig/types';
import { distance, angleBetween, normalizeAngle, distToSegment, radToDeg } from '../../lib/rig/math';
import {
  Eye,
  EyeOff,
  Grid,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  Crosshair,
  Sparkles,
  SlidersHorizontal,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  CornerUpLeft,
  Check,
  Pencil,
  Zap,
  Pin,
  PinOff,
  Undo2,
  Redo2,
  Sliders,
  Paintbrush,
  Scissors,
} from 'lucide-react';

interface ViewportProps {
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export const Viewport: React.FC<ViewportProps> = ({ onToggleSidebar, isSidebarOpen }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Store selections
  const image = useStudioStore((s) => s.image);
  const mesh = useStudioStore((s) => s.mesh);
  const skeleton = useStudioStore((s) => s.skeleton);
  const mode = useStudioStore((s) => s.mode);
  const tool = useStudioStore((s) => s.tool);
  const weightBrushSettings = useStudioStore((s) => s.weightBrushSettings);
  const showTexture = useStudioStore((s) => s.showTexture);
  const showMesh = useStudioStore((s) => s.showMesh);
  const showBones = useStudioStore((s) => s.showBones);
  const showWeights = useStudioStore((s) => s.showWeights);
  const selectedBoneId = useStudioStore((s) => s.selectedBoneId);
  const hoveredBoneId = useStudioStore((s) => s.hoveredBoneId);
  const hoveredJoint = useStudioStore((s) => s.hoveredJoint);
  const activeIKEffectorId = useStudioStore((s) => s.activeIKEffectorId);
  const ikTargetPos = useStudioStore((s) => s.ikTargetPos);
  const zoom = useStudioStore((s) => s.zoom);
  const pan = useStudioStore((s) => s.pan);
  const isPlaying = useStudioStore((s) => s.isPlaying);
  const canUndo = useStudioStore((s) => s.canUndo);
  const canRedo = useStudioStore((s) => s.canRedo);

  // Interaction State
  const [isPanning, setIsPanning] = useState(false);
  const [cutStart, setCutStart] = useState<Point2D | null>(null);
  const [cutEnd, setCutEnd] = useState<Point2D | null>(null);
  const [cutLeftBone, setCutLeftBone] = useState('');
  const [cutRightBone, setCutRightBone] = useState('');
  const [dragAction, setDragAction] = useState<{
    type: 'bone_rotate' | 'joint_move' | 'ik' | 'paint_weight';
    boneId: string;
    jointType?: 'start' | 'end';
    startAngle?: number;
    mouseStartAngle?: number;
  } | null>(null);

  // Interactive bone creation state (Click 1, 2, 3 branch, 4th click)
  const [pendingMasterStart, setPendingMasterStart] = useState<Point2D | null>(null);
  const [pendingBranchJoint, setPendingBranchJoint] = useState<{
    boneId: string;
    joint: 'start' | 'end';
    pos: Point2D;
    name: string;
    startWidth: number;
  } | null>(null);
  const [cursorWorldPos, setCursorWorldPos] = useState<Point2D | null>(null);

  const pendingMasterStartRef = useRef<Point2D | null>(null);
  pendingMasterStartRef.current = pendingMasterStart;
  const pendingBranchJointRef = useRef<{
    boneId: string;
    joint: 'start' | 'end';
    pos: Point2D;
    name: string;
    startWidth: number;
  } | null>(null);
  pendingBranchJointRef.current = pendingBranchJoint;
  const cursorWorldPosRef = useRef<Point2D | null>(null);
  cursorWorldPosRef.current = cursorWorldPos;

  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Touch tracking
  const touchState = useRef<{
    isMultiTouch: boolean;
    initialPinchDist: number;
    initialZoom: number;
    lastMid: { x: number; y: number };
  }>({
    isMultiTouch: false,
    initialPinchDist: 0,
    initialZoom: 1,
    lastMid: { x: 0, y: 0 },
  });

  const selectedBone = skeleton?.bones.find((b) => b.id === selectedBoneId) || null;

  // Screen to World Transform
  const screenToWorld = useCallback(
    (clientX: number, clientY: number): Point2D => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const originX = canvas.width * 0.5 + pan.x;
      const originY = canvas.height * 0.5 + pan.y;
      return {
        x: (x - originX) / zoom,
        y: (y - originY) / zoom,
      };
    },
    [pan, zoom]
  );

  // Canvas Render Loop
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const render = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      if (isPlaying) {
        studioStore.tick(dt);
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Calculate pending bone preview if in add_bone mode
          let pendingBonePreview: {
            start: Point2D;
            end: Point2D;
            isRoot?: boolean;
            parentName?: string;
            startWidth?: number;
            endWidth?: number;
          } | null = null;
          let branchOriginHint: {
            boneId: string;
            joint: 'start' | 'end';
            pos: Point2D;
            name: string;
          } | null = null;

          if (tool === 'add_bone' && cursorWorldPosRef.current) {
            if (pendingMasterStartRef.current) {
              pendingBonePreview = {
                start: pendingMasterStartRef.current,
                end: cursorWorldPosRef.current,
                isRoot: true,
                startWidth: 28,
                endWidth: 20,
              };
            } else if (pendingBranchJointRef.current) {
              const p = pendingBranchJointRef.current;
              const startW = p.startWidth;
              const endW = Math.max(6, Math.round(startW * 0.75));
              pendingBonePreview = {
                start: p.pos,
                end: cursorWorldPosRef.current,
                isRoot: false,
                parentName: p.name,
                startWidth: startW,
                endWidth: endW,
              };
              branchOriginHint = {
                boneId: p.boneId,
                joint: p.joint,
                pos: p.pos,
                name: p.name,
              };
            } else if (selectedBone) {
              const startW = selectedBone.endWidth ?? 20;
              const endW = Math.max(6, Math.round(startW * 0.75));
              pendingBonePreview = {
                start: selectedBone.end,
                end: cursorWorldPosRef.current,
                isRoot: false,
                parentName: selectedBone.name,
                startWidth: startW,
                endWidth: endW,
              };
            }
          }

          // Weight brush HUD preview (when in weights mode or weight_brush tool)
          let weightBrushPreview = null;
          if ((mode === 'weights' || tool === 'weight_brush') && cursorWorldPosRef.current) {
            weightBrushPreview = {
              pos: cursorWorldPosRef.current,
              radius: weightBrushSettings.radius,
              intensity: weightBrushSettings.intensity,
              mode: weightBrushSettings.mode,
            };
          }

          renderRigScene(ctx, image, mesh, skeleton, {
            mode,
            showTexture,
            showMesh,
            showBones,
            showWeights,
            selectedBoneId,
            hoveredBoneId,
            hoveredJoint,
            activeIKEffectorId,
            ikTargetPos,
            zoom,
            pan,
            pendingBonePreview,
            branchOriginHint,
            weightBrushPreview,
          });
          if (mode === 'rig' && (cutStart || mesh?.cut)) {
            const seam = cutStart && cutEnd ? { start: cutStart, end: cutEnd } : mesh?.cut;
            if (seam) {
              ctx.save();
              ctx.translate(canvas.width / 2 + pan.x, canvas.height / 2 + pan.y);
              ctx.scale(zoom, zoom);
              ctx.strokeStyle = '#f97316';
              ctx.lineWidth = 3 / zoom;
              ctx.setLineDash([8 / zoom, 5 / zoom]);
              ctx.beginPath();
              ctx.moveTo(seam.start.x, seam.start.y);
              ctx.lineTo(seam.end.x, seam.end.y);
              ctx.stroke();
              ctx.restore();
            }
          }
        }
      }
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [
    image,
    mesh,
    skeleton,
    mode,
    showTexture,
    showMesh,
    showBones,
    showWeights,
    selectedBoneId,
    hoveredBoneId,
    hoveredJoint,
    activeIKEffectorId,
    ikTargetPos,
    zoom,
    pan,
    isPlaying,
    tool,
    selectedBone,
    weightBrushSettings,
    cutStart,
    cutEnd,
  ]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.parentElement) return;
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Find hovered bone or joint with generous, accurate hitboxes
  const findHoverTarget = useCallback(
    (worldPos: Point2D) => {
      if (!skeleton || !showBones || skeleton.bones.length === 0) return { boneId: null, joint: null };

      // Generous hit radius in world units scaled by zoom
      const jointHitRadius = 24 / zoom;
      const boneHitRadius = 18 / zoom;

      // 1. Check joints first (prioritize endpoints/tips, then pivots)
      for (const bone of skeleton.bones) {
        if (distance(worldPos, bone.end) < jointHitRadius) {
          return { boneId: bone.id, joint: { boneId: bone.id, type: 'end' as const } };
        }
        if (distance(worldPos, bone.start) < jointHitRadius) {
          return { boneId: bone.id, joint: { boneId: bone.id, type: 'start' as const } };
        }
      }

      // 2. Check bone body using perpendicular distance to segment
      for (const bone of skeleton.bones) {
        const d = distToSegment(worldPos, bone.start, bone.end);
        if (d < boneHitRadius) {
          return { boneId: bone.id, joint: null };
        }
      }

      return { boneId: null, joint: null };
    },
    [skeleton, showBones, zoom]
  );

  // Exact Click-Based Bone Creation Workflow:
  // 1st click: root node
  // 2nd click: end of root bone
  // 3rd click: if clicked near root node, select root node and await 4th click
  // 4th click: produce bone #2 branched at root node. Otherwise chain.
  // Bone width is inherited from last bone on root end.
  const handleAddBoneClick = (worldPos: Point2D) => {
    if (!skeleton || skeleton.bones.length === 0) {
      if (!pendingMasterStart) {
        // 1st click: root node origin
        setPendingMasterStart(worldPos);
      } else {
        // 2nd click: end of root bone
        studioStore.addBone(null, worldPos, pendingMasterStart, { startWidth: 28, endWidth: 20 });
        setPendingMasterStart(null);
        setPendingBranchJoint(null);
      }
      return;
    }

    const rootBone = skeleton.bones.find((b) => !b.parentId) || skeleton.bones[0];
    const hitTolerance = 28 / zoom;

    // Check if clicked near root node (3rd click branch logic)
    const distToRootStart = distance(worldPos, rootBone.start);
    if (distToRootStart < hitTolerance) {
      setPendingBranchJoint({
        boneId: rootBone.id,
        joint: 'start',
        pos: rootBone.start,
        name: 'Root Node',
        startWidth: rootBone.startWidth ?? 28,
      });
      studioStore.setSelectedBoneId(rootBone.id);
      return;
    }

    // Check if clicked near any other joint to branch from it
    for (const bone of skeleton.bones) {
      if (distance(worldPos, bone.end) < hitTolerance) {
        setPendingBranchJoint({
          boneId: bone.id,
          joint: 'end',
          pos: bone.end,
          name: `${bone.name} Tip`,
          startWidth: bone.endWidth ?? 20,
        });
        studioStore.setSelectedBoneId(bone.id);
        return;
      }
      if (distance(worldPos, bone.start) < hitTolerance) {
        setPendingBranchJoint({
          boneId: bone.id,
          joint: 'start',
          pos: bone.start,
          name: `${bone.name} Pivot`,
          startWidth: bone.startWidth ?? 24,
        });
        studioStore.setSelectedBoneId(bone.id);
        return;
      }
    }

    // Clicked in canvas space
    if (pendingBranchJoint) {
      // 4th click (or branch click)
      const isBranchFromStart = pendingBranchJoint.joint === 'start';
      studioStore.addBone(pendingBranchJoint.boneId, worldPos, undefined, {
        branchFromStart: isBranchFromStart,
        startWidth: pendingBranchJoint.startWidth,
        endWidth: Math.max(6, Math.round(pendingBranchJoint.startWidth * 0.75)),
      });
      setPendingBranchJoint(null);
    } else {
      // Chain from selected bone (or last bone)
      const parent = selectedBone || skeleton.bones[skeleton.bones.length - 1];
      const inheritedStartW = parent.endWidth ?? 20;
      studioStore.addBone(parent.id, worldPos, undefined, {
        branchFromStart: false,
        startWidth: inheritedStartW,
        endWidth: Math.max(6, Math.round(inheritedStartW * 0.75)),
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Right click or Middle click = Pan
    if (e.button === 2 || e.button === 1 || (e.shiftKey && e.altKey)) {
      e.preventDefault();
      setIsPanning(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (e.button === 0) {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      if (tool === 'cut' && mode === 'rig') {
        setCutStart(worldPos);
        setCutEnd(worldPos);
        return;
      }

      // WEIGHT BRUSH PAINTING MODE
      if (tool === 'weight_brush' || mode === 'weights') {
        const { boneId } = findHoverTarget(worldPos);
        // If clicked on another bone joint/body and holding Alt/Ctrl or bone found, allow switching active bone
        if (e.altKey && boneId) {
          studioStore.setSelectedBoneId(boneId);
          return;
        }
        if (selectedBoneId) {
          setDragAction({ type: 'paint_weight', boneId: selectedBoneId });
          studioStore.paintWeights(worldPos);
          return;
        } else if (boneId) {
          studioStore.setSelectedBoneId(boneId);
          setDragAction({ type: 'paint_weight', boneId });
          studioStore.paintWeights(worldPos);
          return;
        }
      }

      // ADD BONE / DRAW MODE
      if (tool === 'add_bone') {
        handleAddBoneClick(worldPos);
        return;
      }

      // NORMAL SELECTION & INTERACTION MODE
      const { boneId, joint } = findHoverTarget(worldPos);

      if (boneId) {
        studioStore.setSelectedBoneId(boneId);

        const bone = skeleton?.bones.find((b) => b.id === boneId);
        if (!bone) return;

        // IK Mode or IK tool on tip joint
        if (tool === 'ik' || (mode === 'pose' && e.shiftKey && joint?.type === 'end')) {
          setDragAction({ type: 'ik', boneId });
          studioStore.applyIK(boneId, worldPos);
          return;
        }

        // Rigging mode joint adjustment (rest pose repositioning)
        if (mode === 'rig' && joint) {
          setDragAction({ type: 'joint_move', boneId, jointType: joint.type });
          return;
        }

        // Pose mode: rotate bone smoothly from mouse angle
        const mouseAngle = angleBetween(bone.start, worldPos);
        setDragAction({
          type: 'bone_rotate',
          boneId,
          startAngle: bone.localAngle,
          mouseStartAngle: mouseAngle,
        });
      } else {
        // Clicking empty space starts canvas pan
        setIsPanning(true);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        setPendingMasterStart(null);
        setPendingBranchJoint(null);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    setCursorWorldPos(worldPos);
    if (cutStart && tool === 'cut') { setCutEnd(worldPos); return; }

    if (isPanning) {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      studioStore.setPan({ x: pan.x + dx, y: pan.y + dy });
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (dragAction) {
      if (dragAction.type === 'paint_weight') {
        studioStore.paintWeights(worldPos);
      } else if (dragAction.type === 'ik') {
        studioStore.applyIK(dragAction.boneId, worldPos);
      } else if (dragAction.type === 'joint_move' && dragAction.jointType) {
        studioStore.moveBoneJoint(dragAction.boneId, dragAction.jointType, worldPos);
      } else if (dragAction.type === 'bone_rotate') {
        const bone = skeleton?.bones.find((b) => b.id === dragAction.boneId);
        if (bone && dragAction.startAngle !== undefined && dragAction.mouseStartAngle !== undefined) {
          const currentMouseAngle = angleBetween(bone.start, worldPos);
          const delta = normalizeAngle(currentMouseAngle - dragAction.mouseStartAngle);
          studioStore.setBoneAngle(dragAction.boneId, dragAction.startAngle + delta);
        }
      }
      return;
    }

    // Update hover target
    const { boneId, joint } = findHoverTarget(worldPos);
    studioStore.setHoveredBoneId(boneId);
    studioStore.setHoveredJoint(joint);
  };

  const handleMouseUp = () => {
    if (cutStart && cutEnd && tool === 'cut') {
      try {
        studioStore.cutArtwork(cutStart, cutEnd, cutLeftBone || selectedBoneId || '', cutRightBone || skeleton?.bones.find(b => b.id !== (cutLeftBone || selectedBoneId))?.id || '');
      } catch (error) { window.alert(error instanceof Error ? error.message : 'Cut failed.'); }
      setCutStart(null);
      setCutEnd(null);
    }
    setIsPanning(false);
    setDragAction(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.2, Math.min(4.0, zoom * factor));
    studioStore.setZoom(newZoom);
  };

  // Touch event handlers for mobile devices
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const mid = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
      touchState.current = {
        isMultiTouch: true,
        initialPinchDist: dist,
        initialZoom: zoom,
        lastMid: mid,
      };
      setIsPanning(false);
      setDragAction(null);
      return;
    }

    if (e.touches.length === 1) {
      touchState.current.isMultiTouch = false;
      const t = e.touches[0];
      const worldPos = screenToWorld(t.clientX, t.clientY);
      setCursorWorldPos(worldPos);
      if (tool === 'cut' && mode === 'rig') { setCutStart(worldPos); setCutEnd(worldPos); return; }

      // Handle weight painting on touch
      if (tool === 'weight_brush' || mode === 'weights') {
        if (selectedBoneId) {
          setDragAction({ type: 'paint_weight', boneId: selectedBoneId });
          studioStore.paintWeights(worldPos);
          return;
        }
      }

      // Handle add bone on touch
      if (tool === 'add_bone') {
        handleAddBoneClick(worldPos);
        return;
      }

      const { boneId, joint } = findHoverTarget(worldPos);

      if (boneId) {
        studioStore.setSelectedBoneId(boneId);
        const bone = skeleton?.bones.find((b) => b.id === boneId);
        if (!bone) return;

        if (mode === 'rig' && joint) {
          setDragAction({ type: 'joint_move', boneId, jointType: joint.type });
          return;
        }

        if (tool === 'ik' || joint?.type === 'end') {
          setDragAction({ type: 'ik', boneId });
          studioStore.applyIK(boneId, worldPos);
          return;
        }

        const mouseAngle = angleBetween(bone.start, worldPos);
        setDragAction({
          type: 'bone_rotate',
          boneId,
          startAngle: bone.localAngle,
          mouseStartAngle: mouseAngle,
        });
      } else {
        setIsPanning(true);
        lastMousePos.current = { x: t.clientX, y: t.clientY };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchState.current.isMultiTouch) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const mid = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };

      if (touchState.current.initialPinchDist > 0) {
        const scale = dist / touchState.current.initialPinchDist;
        const newZoom = Math.max(0.2, Math.min(4.0, touchState.current.initialZoom * scale));
        studioStore.setZoom(newZoom);
      }

      const dx = mid.x - touchState.current.lastMid.x;
      const dy = mid.y - touchState.current.lastMid.y;
      studioStore.setPan({ x: pan.x + dx, y: pan.y + dy });
      touchState.current.lastMid = mid;
      return;
    }

    if (e.touches.length === 1 && !touchState.current.isMultiTouch) {
      const t = e.touches[0];
      const worldPos = screenToWorld(t.clientX, t.clientY);
      setCursorWorldPos(worldPos);
      if (cutStart && tool === 'cut') { setCutEnd(worldPos); return; }

      if (isPanning) {
        const dx = t.clientX - lastMousePos.current.x;
        const dy = t.clientY - lastMousePos.current.y;
        studioStore.setPan({ x: pan.x + dx, y: pan.y + dy });
        lastMousePos.current = { x: t.clientX, y: t.clientY };
        return;
      }

      if (dragAction) {
        if (dragAction.type === 'paint_weight') {
          studioStore.paintWeights(worldPos);
        } else if (dragAction.type === 'ik') {
          studioStore.applyIK(dragAction.boneId, worldPos);
        } else if (dragAction.type === 'joint_move' && dragAction.jointType) {
          studioStore.moveBoneJoint(dragAction.boneId, dragAction.jointType, worldPos);
        } else if (dragAction.type === 'bone_rotate') {
          const bone = skeleton?.bones.find((b) => b.id === dragAction.boneId);
          if (bone && dragAction.startAngle !== undefined && dragAction.mouseStartAngle !== undefined) {
            const currentMouseAngle = angleBetween(bone.start, worldPos);
            const delta = normalizeAngle(currentMouseAngle - dragAction.mouseStartAngle);
            studioStore.setBoneAngle(dragAction.boneId, dragAction.startAngle + delta);
          }
        }
      }
    }
  };

  const handleTouchEnd = () => {
    if (cutStart && cutEnd && tool === 'cut') {
      try {
        studioStore.cutArtwork(cutStart, cutEnd, cutLeftBone || selectedBoneId || '', cutRightBone || skeleton?.bones.find(b => b.id !== (cutLeftBone || selectedBoneId))?.id || '');
      } catch (error) { window.alert(error instanceof Error ? error.message : 'Cut failed.'); }
      setCutStart(null);
      setCutEnd(null);
    }
    setIsPanning(false);
    setDragAction(null);
    touchState.current.isMultiTouch = false;
  };

  const isAddBoneMode = tool === 'add_bone';
  const isWeightBrushMode = tool === 'weight_brush' || mode === 'weights';
  const hasBones = skeleton && skeleton.bones.length > 0;

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden select-none">
      {/* Blueprint Grid Background */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, #334155 1px, transparent 1px),
            linear-gradient(to bottom, #334155 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px',
        }}
      />

      {/* Main Interactive Canvas */}
      <canvas
        id="rig_viewport_canvas"
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        className={`absolute inset-0 touch-none ${
          isWeightBrushMode
            ? dragAction?.type === 'paint_weight'
              ? 'cursor-crosshair'
              : 'cursor-crosshair'
            : isAddBoneMode
            ? 'cursor-crosshair'
            : dragAction
            ? 'cursor-grabbing'
            : 'cursor-default'
        }`}
      />

      {/* Top Floating Guide & Mode Banner */}
      <div className="absolute top-2.5 left-2.5 flex items-center gap-2 pointer-events-auto z-20">
        {onToggleSidebar && !isSidebarOpen && (
          <button
            onClick={onToggleSidebar}
            className="md:hidden flex items-center gap-1.5 px-2.5 py-1.5 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-xs font-semibold shadow-lg shadow-sky-500/25 transition"
            title="Open Rigging & Posing Panel"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Tools</span>
          </button>
        )}

        <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-2.5 py-1 rounded-lg border border-slate-800 text-xs text-slate-300 shadow-lg">
          <div className="flex items-center gap-1 font-medium text-sky-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="capitalize text-white bg-sky-500/20 px-1.5 py-0.5 rounded text-[11px] border border-sky-500/30">
              {isAddBoneMode ? 'Draw Bones' : mode}
            </span>
          </div>
          <div className="h-3 w-px bg-slate-700 hidden sm:block" />
          <span className="text-slate-400 text-[11px] hidden sm:inline">
            {isAddBoneMode
              ? !hasBones
                ? !pendingMasterStart
                  ? 'Click 1: Set Root Node position'
                  : 'Click 2: Set Root Bone Tip & Length'
                : pendingBranchJoint
                ? `Awaiting Click 4: Create bone branched from ${pendingBranchJoint.name}`
                : `Click near Root Node (3rd click) to branch, or click empty space to chain`
              : mode === 'rig'
              ? 'Drag joints to reposition rest pose • Bones never bend in Rig mode'
              : 'Drag bones to pose • Character texture bends smoothly with Linear Blend Skinning'}
          </span>
        </div>
      </div>

      {/* Top Right Viewport Controls */}
      <div className="absolute top-2.5 right-2.5 flex items-center gap-0.5 sm:gap-1 bg-slate-900/90 backdrop-blur-md p-1 rounded-lg sm:rounded-xl border border-slate-800 shadow-xl max-w-[calc(100vw-80px)] overflow-x-auto custom-scrollbar z-20">
        <button
          id="btn_toggle_texture"
          onClick={() => studioStore.toggleView('showTexture')}
          title="Toggle Character Texture"
          className={`p-1.5 sm:p-2 rounded-md sm:rounded-lg text-xs font-medium flex items-center gap-1 transition-colors shrink-0 ${
            showTexture ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' : 'text-slate-400 hover:text-white'
          }`}
        >
          {showTexture ? <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
          <span className="hidden sm:inline">Texture</span>
        </button>

        <button
          id="btn_toggle_bones"
          onClick={() => studioStore.toggleView('showBones')}
          title="Toggle Bones Skeleton & Bounding Boxes"
          className={`p-1.5 sm:p-2 rounded-md sm:rounded-lg text-xs font-medium flex items-center gap-1 transition-colors shrink-0 ${
            showBones ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Crosshair className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="hidden sm:inline">Bones</span>
        </button>

        <button
          id="btn_toggle_mesh"
          onClick={() => studioStore.toggleView('showMesh')}
          title="Toggle 2D Deformation Mesh"
          className={`p-1.5 sm:p-2 rounded-md sm:rounded-lg text-xs font-medium flex items-center gap-1 transition-colors shrink-0 ${
            showMesh ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Grid className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="hidden sm:inline">Mesh</span>
        </button>

        <button
          id="btn_toggle_weights"
          onClick={() => studioStore.toggleView('showWeights')}
          title="Toggle Skinning Weight Heatmap"
          className={`p-1.5 sm:p-2 rounded-md sm:rounded-lg text-xs font-medium flex items-center gap-1 transition-colors shrink-0 ${
            showWeights ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-400 hover:text-white'
          }`}
        >
          <span className="hidden sm:inline">Weights</span>
          <span className="sm:hidden text-[10px] px-0.5">W</span>
        </button>

        <div className="h-4 w-px bg-slate-800 mx-0.5 shrink-0" />

        <button
          id="btn_zoom_out"
          onClick={() => studioStore.setZoom(zoom * 0.85)}
          title="Zoom Out"
          className="p-1.5 sm:p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md sm:rounded-lg transition shrink-0"
        >
          <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        <button
          id="btn_zoom_in"
          onClick={() => studioStore.setZoom(zoom * 1.15)}
          title="Zoom In"
          className="p-1.5 sm:p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md sm:rounded-lg transition shrink-0"
        >
          <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        <button
          id="btn_reset_view"
          onClick={() => studioStore.resetView()}
          title="Reset Camera & Center"
          className="p-1.5 sm:p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md sm:rounded-lg transition shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </div>

      {/* DRAW BONES INTERACTIVE INSTRUCTION CARD */}
      {isAddBoneMode && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-slate-900/95 border border-sky-500/40 backdrop-blur-md rounded-2xl px-4 py-2.5 shadow-2xl z-30 flex items-center gap-3 text-xs max-w-lg w-[92%] sm:w-auto">
          <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
            <Pencil className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-white truncate">
              {!hasBones
                ? !pendingMasterStart
                  ? 'Click 1: Set Root Node position'
                  : 'Click 2: Set Root Bone Tip & Length'
                : pendingBranchJoint
                ? `Branch selected from "${pendingBranchJoint.name}". Click to place new bone (Click 4)!`
                : selectedBone
                ? `Chaining from "${selectedBone.name}". Click near Root Node to branch.`
                : 'Click canvas to add bone, or click a joint to branch'}
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              {pendingBranchJoint
                ? 'Width is automatically inherited from the parent joint!'
                : 'Bounding boxes update in real-time to show influence envelopes.'}
            </div>
          </div>
          <button
            id="btn_done_drawing_bones"
            onClick={() => {
              studioStore.setTool('select');
              setPendingMasterStart(null);
              setPendingBranchJoint(null);
            }}
            className="px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white font-medium rounded-xl text-xs flex items-center gap-1.5 shrink-0 shadow-md shadow-sky-500/25 transition"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Done</span>
          </button>
        </div>
      )}

      {/* WEIGHT PAINTING INTERACTIVE INSTRUCTION CARD */}
      {isWeightBrushMode && !isAddBoneMode && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-slate-900/95 border border-emerald-500/40 backdrop-blur-md rounded-2xl px-4 py-2.5 shadow-2xl z-30 flex items-center gap-3 text-xs max-w-lg w-[92%] sm:w-auto">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Paintbrush className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-white truncate flex items-center gap-1.5">
              <span>Painting:</span>
              {selectedBone ? (
                <span className="text-emerald-300 font-bold">{selectedBone.name}</span>
              ) : (
                <span className="text-amber-400">Select a bone to paint weights</span>
              )}
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 uppercase font-mono ml-1">
                {weightBrushSettings.mode} (R:{weightBrushSettings.radius}px)
              </span>
            </div>
            <div className="text-[11px] text-slate-400 truncate">
              Click & drag across mesh vertices to sculpt bone influence heatmap.
            </div>
          </div>
          <button
            id="btn_done_painting_weights"
            onClick={() => {
              studioStore.setTool('select');
              studioStore.setMode('pose');
            }}
            className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-xl text-xs flex items-center gap-1.5 shrink-0 shadow-md shadow-emerald-500/25 transition"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Done</span>
          </button>
        </div>
      )}

      {/* FLOATING SELECTED BONE WIDTH SLIDERS & PIN OVERLAY (When a bone is selected) */}
      {selectedBone && (
        <div className="hidden md:block absolute top-14 left-3 bg-slate-900/90 backdrop-blur-md border border-slate-700/70 rounded-2xl p-3 shadow-2xl z-20 w-64 text-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="w-3 h-3 rounded-full shrink-0 border border-white/20"
                style={{ backgroundColor: selectedBone.color }}
              />
              <span className="font-semibold text-white truncate">{selectedBone.name}</span>
            </div>

            {/* Pin Node Toggle Button */}
            <button
              id="btn_hud_toggle_pin"
              onClick={() => studioStore.toggleBonePin(selectedBone.id)}
              title={
                selectedBone.isPinned
                  ? 'Node is Pinned (Immobile). Click to Unpin.'
                  : 'Pin Node (Make Immobile in Rigging & IK)'
              }
              className={`px-2 py-0.5 rounded-lg text-[11px] font-medium flex items-center gap-1 transition ${
                selectedBone.isPinned
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
              }`}
            >
              {selectedBone.isPinned ? (
                <Pin className="w-3 h-3 fill-amber-400 text-amber-400" />
              ) : (
                <PinOff className="w-3 h-3" />
              )}
              <span>{selectedBone.isPinned ? 'Pinned' : 'Pin'}</span>
            </button>
          </div>

          {/* Envelope Width Slider 1: Start Width (Pivot) */}
          <div className="space-y-1 bg-slate-950/60 p-2 rounded-xl border border-slate-800/80">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">1. Pivot Width (W1)</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() =>
                    studioStore.setBoneStartWidth(
                      selectedBone.id,
                      Math.max(2, (selectedBone.startWidth ?? 24) - 2)
                    )
                  }
                  className="px-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-mono"
                >
                  -
                </button>
                <span className="font-mono text-white font-semibold text-[11px] w-7 text-center">
                  {Math.round(selectedBone.startWidth ?? 24)}
                </span>
                <button
                  onClick={() =>
                    studioStore.setBoneStartWidth(
                      selectedBone.id,
                      Math.min(500, (selectedBone.startWidth ?? 24) + 4)
                    )
                  }
                  className="px-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-mono"
                >
                  +
                </button>
              </div>
            </div>
            <input
              type="range"
              id="hud_slider_start_width"
              min="2"
              max="400"
              value={Math.round(selectedBone.startWidth ?? 24)}
              onChange={(e) =>
                studioStore.setBoneStartWidth(selectedBone.id, Number(e.target.value))
              }
              onInput={(e) =>
                studioStore.setBoneStartWidth(
                  selectedBone.id,
                  Number((e.target as HTMLInputElement).value)
                )
              }
              className="w-full accent-sky-500 cursor-pointer"
            />
          </div>

          {/* Envelope Width Slider 2: End Width (Tip) */}
          <div className="space-y-1 bg-slate-950/60 p-2 rounded-xl border border-slate-800/80">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">2. Tip Width (W2)</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() =>
                    studioStore.setBoneEndWidth(
                      selectedBone.id,
                      Math.max(2, (selectedBone.endWidth ?? 16) - 4)
                    )
                  }
                  className="px-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-mono"
                >
                  -
                </button>
                <span className="font-mono text-white font-semibold text-[11px] w-9 text-center">
                  {Math.round(selectedBone.endWidth ?? 16)}px
                </span>
                <button
                  onClick={() =>
                    studioStore.setBoneEndWidth(
                      selectedBone.id,
                      Math.min(500, (selectedBone.endWidth ?? 16) + 4)
                    )
                  }
                  className="px-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-mono"
                >
                  +
                </button>
              </div>
            </div>
            <input
              type="range"
              id="hud_slider_end_width"
              min="2"
              max="400"
              value={Math.round(selectedBone.endWidth ?? 16)}
              onChange={(e) =>
                studioStore.setBoneEndWidth(selectedBone.id, Number(e.target.value))
              }
              onInput={(e) =>
                studioStore.setBoneEndWidth(
                  selectedBone.id,
                  Number((e.target as HTMLInputElement).value)
                )
              }
              className="w-full accent-sky-500 cursor-pointer"
            />
          </div>
        </div>
      )}

      {/* FLOATING BONE CONTROLS HUD (ADD / DELETE / SELECT / UNDO / REDO / NUDGE POSE) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 sm:gap-2 bg-slate-900/95 backdrop-blur-md p-1.5 sm:p-2 rounded-2xl border border-slate-800/90 shadow-2xl z-20 max-w-[96vw] overflow-x-auto custom-scrollbar">
        {/* UNDO / REDO GROUP */}
        <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800/70">
          <button
            id="btn_hud_undo"
            onClick={() => studioStore.undo()}
            disabled={!canUndo}
            title="Undo action (Ctrl+Z)"
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none rounded-lg transition"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            id="btn_hud_redo"
            onClick={() => studioStore.redo()}
            disabled={!canRedo}
            title="Redo action (Ctrl+Y)"
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none rounded-lg transition"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        {/* BONE SELECTION GROUP */}
        <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800/70">
          <button
            id="btn_select_prev_bone"
            onClick={() => studioStore.selectPreviousBone()}
            disabled={!hasBones}
            title="Select Previous Bone (Left Arrow)"
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none rounded-lg transition"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Quick Bone Selector Dropdown */}
          <select
            id="select_active_bone"
            value={selectedBoneId || ''}
            onChange={(e) => studioStore.setSelectedBoneId(e.target.value || null)}
            disabled={!hasBones}
            className="bg-transparent text-xs font-semibold text-sky-400 focus:outline-none cursor-pointer max-w-[110px] sm:max-w-[140px] truncate py-1 px-1 border-0"
          >
            {!hasBones ? (
              <option value="">No Bones</option>
            ) : (
              skeleton.bones.map((b) => (
                <option key={b.id} value={b.id} className="bg-slate-900 text-white">
                  {b.parentId ? '↳ ' : '★ '}
                  {b.name} {b.isPinned ? '📌' : ''}
                </option>
              ))
            )}
          </select>

          <button
            id="btn_select_next_bone"
            onClick={() => studioStore.selectNextBone()}
            disabled={!hasBones}
            title="Select Next Bone (Right Arrow)"
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none rounded-lg transition"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            id="btn_select_parent_bone"
            onClick={() => studioStore.selectParentBone()}
            disabled={!selectedBone || !selectedBone.parentId}
            title="Select Parent Bone"
            className="hidden sm:flex p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none rounded-lg transition"
          >
            <CornerUpLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ADD & BRANCH & DELETE BONE BUTTONS */}
        <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800/70">
          <button
            id="btn_draw_bone_tool"
            onClick={() => {
              const nextTool = isAddBoneMode ? 'select' : 'add_bone';
              studioStore.setTool(nextTool);
              if (nextTool === 'add_bone') studioStore.setMode('rig');
              setPendingMasterStart(null);
              setPendingBranchJoint(null);
            }}
            title="Click Canvas to Generate Root Bone or Branch Descendants"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shrink-0 ${
              isAddBoneMode
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/25 animate-pulse'
                : 'bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-500/20'
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>{isAddBoneMode ? 'Drawing...' : 'Click-to-Draw'}</span>
          </button>

          <button id="btn_cut_tool" disabled={!mesh || !skeleton || skeleton.bones.length < 2 || !!mesh.cut}
            onClick={() => { studioStore.setMode('rig'); studioStore.setTool(tool === 'cut' ? 'select' : 'cut'); }}
            title={mesh?.cut ? 'Cut applied; undo to draw a different seam' : 'Draw a line to separate artwork between two bones'}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 ${tool === 'cut' ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-200'}`}>
            <Scissors className="w-3.5 h-3.5" /> Cut
          </button>
          {tool === 'cut' && skeleton && <div className="flex items-center gap-1 text-xs text-white">
            <select aria-label="Bone on left of drawn line" value={cutLeftBone || selectedBoneId || ''}
              onChange={e => setCutLeftBone(e.target.value)} className="bg-slate-900 max-w-24">
              <option value="">Left bone</option>
              {skeleton.bones.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select aria-label="Bone on right of drawn line" value={cutRightBone || skeleton.bones.find(b => b.id !== (cutLeftBone || selectedBoneId))?.id || ''}
              onChange={e => setCutRightBone(e.target.value)} className="bg-slate-900 max-w-24">
              <option value="">Right bone</option>
              {skeleton.bones.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>}

          <button
            id="btn_add_branch_bone"
            onClick={() => {
              studioStore.addBone(selectedBoneId);
            }}
            title="Add Child/Branch Bone connected to Selected Bone"
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white rounded-lg text-xs font-medium flex items-center gap-1 transition shrink-0 border border-slate-700/60"
          >
            <GitBranch className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Add Branch</span>
            <span className="sm:hidden">+Branch</span>
          </button>

          <button
            id="btn_delete_selected_bone"
            onClick={() => {
              if (selectedBoneId) studioStore.deleteBone(selectedBoneId);
            }}
            disabled={!selectedBoneId}
            title="Delete Selected Bone"
            className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 disabled:opacity-30 disabled:pointer-events-none rounded-lg transition"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* EASY MOVE & ROTATION NUDGE POSE BUTTONS */}
        <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800/70">
          <button
            id="btn_rotate_neg_15"
            onClick={() => studioStore.quickRotateBone(-15)}
            disabled={!selectedBone}
            title="Rotate Bone -15°"
            className="px-1.5 sm:px-2 py-1 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none rounded-lg text-xs font-mono transition flex items-center gap-0.5"
          >
            <RotateCcw className="w-3 h-3 text-sky-400" />
            <span>-15°</span>
          </button>

          <button
            id="btn_rotate_pos_15"
            onClick={() => studioStore.quickRotateBone(15)}
            disabled={!selectedBone}
            title="Rotate Bone +15°"
            className="px-1.5 sm:px-2 py-1 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none rounded-lg text-xs font-mono transition flex items-center gap-0.5"
          >
            <RotateCw className="w-3 h-3 text-sky-400" />
            <span>+15°</span>
          </button>

          <button
            id="btn_reset_bone_angle"
            onClick={() => studioStore.resetBoneAngle()}
            disabled={!selectedBone}
            title="Reset Bone Angle to Rest Pose"
            className="hidden sm:flex p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none rounded-lg transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            id="btn_toggle_ik_mode"
            onClick={() => studioStore.setTool(tool === 'ik' ? 'select' : 'ik')}
            disabled={!hasBones}
            title="Toggle Inverse Kinematics (IK drag tip)"
            className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition shrink-0 ${
              tool === 'ik'
                ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Zap className="w-3 h-3" />
            <span className="hidden sm:inline">IK</span>
          </button>

          <button
            id="btn_toggle_weight_brush"
            onClick={() => {
              if (tool === 'weight_brush') {
                studioStore.setTool('select');
              } else {
                studioStore.setTool('weight_brush');
                studioStore.setMode('weights');
              }
            }}
            disabled={!hasBones}
            title="Toggle Weight Paint Brush"
            className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition shrink-0 ${
              tool === 'weight_brush' || mode === 'weights'
                ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Paintbrush className="w-3 h-3" />
            <span className="hidden sm:inline">Brush</span>
          </button>
        </div>
      </div>
    </div>
  );
};

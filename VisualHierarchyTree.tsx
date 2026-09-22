import React, { useState } from 'react';
import { Bone, Skeleton } from '../../lib/rig/types';
import { radToDeg } from '../../lib/rig/math';
import { studioStore } from '../../store/studio';
import {
  ChevronRight,
  ChevronDown,
  Pin,
  Plus,
  Trash2,
  Copy,
  FolderTree,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface HierarchyNode {
  bone: Bone;
  children: HierarchyNode[];
  depth: number;
}

interface VisualHierarchyTreeProps {
  skeleton: Skeleton | null;
  selectedBoneId: string | null;
  onSelectBone: (boneId: string) => void;
}

function buildHierarchyTree(skeleton: Skeleton | null): HierarchyNode[] {
  if (!skeleton || skeleton.bones.length === 0) return [];

  const boneMap = new Map<string, Bone>();
  const childrenMap = new Map<string, string[]>();

  skeleton.bones.forEach((b) => {
    boneMap.set(b.id, b);
    childrenMap.set(b.id, []);
  });

  const rootIds: string[] = [];

  skeleton.bones.forEach((b) => {
    if (b.parentId && boneMap.has(b.parentId)) {
      childrenMap.get(b.parentId)!.push(b.id);
    } else {
      rootIds.push(b.id);
    }
  });

  function buildNode(boneId: string, depth: number): HierarchyNode | null {
    const bone = boneMap.get(boneId);
    if (!bone) return null;
    const childIds = childrenMap.get(boneId) || [];
    const children = childIds
      .map((cId) => buildNode(cId, depth + 1))
      .filter((n): n is HierarchyNode => n !== null);

    return { bone, children, depth };
  }

  return rootIds
    .map((rId) => buildNode(rId, 0))
    .filter((n): n is HierarchyNode => n !== null);
}

export const VisualHierarchyTree: React.FC<VisualHierarchyTreeProps> = ({
  skeleton,
  selectedBoneId,
  onSelectBone,
}) => {
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [reparentingBoneId, setReparentingBoneId] = useState<string | null>(null);

  if (!skeleton || skeleton.bones.length === 0) {
    return (
      <div className="text-center py-6 px-3 border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
        <FolderTree className="w-5 h-5 mx-auto mb-1.5 opacity-40 text-slate-400" />
        <p className="font-medium text-slate-400">No Bones Rigged</p>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Draw bones in viewport or click + in toolbar
        </p>
      </div>
    );
  }

  const tree = buildHierarchyTree(skeleton);

  const toggleCollapse = (boneId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(boneId)) next.delete(boneId);
      else next.add(boneId);
      return next;
    });
  };

  const handleReparent = (targetParentId: string | null) => {
    if (!reparentingBoneId) return;
    studioStore.reparentBone(reparentingBoneId, targetParentId);
    setReparentingBoneId(null);
  };

  const renderNode = (node: HierarchyNode) => {
    const { bone, children, depth } = node;
    const isSelected = bone.id === selectedBoneId;
    const hasChildren = children.length > 0;
    const isCollapsed = collapsedNodes.has(bone.id);
    const isBeingReparented = reparentingBoneId === bone.id;
    const isRoot = !bone.parentId;

    return (
      <div key={bone.id} className="select-none text-xs">
        <div
          onClick={() => {
            if (reparentingBoneId && reparentingBoneId !== bone.id) {
              handleReparent(bone.id);
            } else {
              onSelectBone(bone.id);
            }
          }}
          style={{ paddingLeft: `${Math.max(6, depth * 14 + 6)}px` }}
          className={`group flex items-center justify-between py-1.5 pr-2 rounded-xl transition cursor-pointer border ${
            isBeingReparented
              ? 'bg-amber-500/20 border-amber-500 text-amber-200 animate-pulse'
              : isSelected
              ? 'bg-sky-500/20 text-sky-200 border-sky-500/50 shadow-sm'
              : 'hover:bg-slate-800/80 text-slate-300 border-transparent'
          }`}
        >
          {/* Left section: expand arrow, visual hierarchy branch line, color pip, name */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {hasChildren ? (
              <button
                onClick={(e) => toggleCollapse(bone.id, e)}
                className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-white rounded"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            ) : (
              <span className="w-4 flex items-center justify-center text-slate-600 font-mono text-[10px]">
                {depth > 0 ? '└' : '•'}
              </span>
            )}

            {/* Bone color pip */}
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs border border-white/20"
              style={{ backgroundColor: bone.color }}
            />

            {/* Bone Name */}
            <span
              className={`truncate font-medium ${
                isSelected ? 'text-sky-300' : 'text-slate-200'
              }`}
            >
              {bone.name}
            </span>

            {isRoot && (
              <span className="text-[9px] px-1 py-0.2 bg-slate-800 text-slate-400 rounded uppercase font-semibold shrink-0">
                Root
              </span>
            )}

            {bone.isPinned && (
              <span className="text-[10px] text-amber-400 font-semibold shrink-0" title="Pinned Node">
                📌
              </span>
            )}
          </div>

          {/* Right section: Angle, widths, & Action buttons */}
          <div className="flex items-center gap-1 shrink-0 ml-1">
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
              {Math.round(radToDeg(bone.localAngle))}°
            </span>

            {/* Mirror bone button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                studioStore.mirrorBone(bone.id);
              }}
              title="Mirror bone across center line (Left/Right)"
              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-sky-400 rounded transition"
            >
              <Copy className="w-3 h-3" />
            </button>

            {/* Reparent Mode Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setReparentingBoneId(isBeingReparented ? null : bone.id);
              }}
              title={
                isBeingReparented
                  ? 'Cancel Reparenting'
                  : 'Reparent: Click this, then click new parent bone'
              }
              className={`p-1 rounded transition ${
                isBeingReparented
                  ? 'text-amber-400 bg-amber-500/20'
                  : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:text-amber-300'
              }`}
            >
              <ArrowRight className="w-3 h-3" />
            </button>

            {/* Pin Node Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                studioStore.toggleBonePin(bone.id);
              }}
              title={bone.isPinned ? 'Unpin node' : 'Pin node (Immobile)'}
              className={`p-1 rounded transition ${
                bone.isPinned
                  ? 'text-amber-400 hover:text-amber-300'
                  : 'opacity-0 group-hover:opacity-100 text-slate-500 hover:text-amber-400'
              }`}
            >
              <Pin className={`w-3 h-3 ${bone.isPinned ? 'fill-amber-400' : ''}`} />
            </button>

            {/* Add Child Bone */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                studioStore.addBone(bone.id);
              }}
              title="Add child branch to this bone"
              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-emerald-400 rounded transition"
            >
              <Plus className="w-3 h-3" />
            </button>

            {/* Delete Bone */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                studioStore.deleteBone(bone.id);
              }}
              title="Delete this bone"
              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-400 rounded transition"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Child branches */}
        {hasChildren && !isCollapsed && (
          <div className="relative pl-1">
            {/* Hierarchy vertical guide line */}
            <div
              className="absolute top-0 bottom-1 border-l border-slate-700/60"
              style={{ left: `${depth * 14 + 13}px` }}
            />
            {children.map((child) => renderNode(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-1.5">
      {/* Reparenting mode banner */}
      {reparentingBoneId && (
        <div className="p-2 bg-amber-500/15 border border-amber-500/40 rounded-xl text-amber-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Select new parent bone (or click below for Root)</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleReparent(null)}
              className="px-2 py-0.5 bg-amber-500/30 hover:bg-amber-500/40 text-amber-100 rounded text-[10px] font-semibold"
            >
              Make Root
            </button>
            <button
              onClick={() => setReparentingBoneId(null)}
              className="px-1.5 py-0.5 bg-slate-800 text-slate-400 hover:text-white rounded text-[10px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Render Tree */}
      <div className="space-y-0.5 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
        {tree.map((node) => renderNode(node))}
      </div>
    </div>
  );
};

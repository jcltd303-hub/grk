import { RigMesh, Skeleton, Bone, Point2D, StudioMode } from './types';
import { degToRad } from './math';

export interface RenderOptions {
  mode?: StudioMode;
  showTexture: boolean;
  showMesh: boolean;
  showBones: boolean;
  showWeights: boolean;
  selectedBoneId: string | null;
  hoveredBoneId: string | null;
  hoveredJoint: { boneId: string; type: 'start' | 'end' } | null;
  activeIKEffectorId: string | null;
  ikTargetPos: Point2D | null;
  zoom: number;
  pan: Point2D;
  pendingBonePreview?: {
    start: Point2D;
    end: Point2D;
    isRoot?: boolean;
    parentName?: string;
    startWidth?: number;
    endWidth?: number;
  } | null;
  branchOriginHint?: {
    boneId: string;
    joint: 'start' | 'end';
    pos: Point2D;
    name: string;
  } | null;
  weightBrushPreview?: {
    pos: Point2D;
    radius: number;
    intensity: number;
    mode: 'add' | 'subtract' | 'smooth' | 'set';
  } | null;
}

/**
 * Renders the deformed mesh, skeleton, wireframe, and weights on HTML5 Canvas.
 */
export function renderRigScene(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | HTMLCanvasElement | null,
  mesh: RigMesh | null,
  skeleton: Skeleton | null,
  options: RenderOptions
): void {
  const { width, height } = ctx.canvas;
  const isRigMode = options.mode === 'rig';
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  // Apply camera pan & zoom
  ctx.translate(width / 2 + options.pan.x, height / 2 + options.pan.y);
  ctx.scale(options.zoom, options.zoom);

  // 1. Draw Character Texture
  // In RIG MODE, the character NEVER bends or distorts: render original unbent image!
  if (options.showTexture && image) {
    if (isRigMode || !mesh || mesh.triangles.length === 0) {
      ctx.save();
      ctx.drawImage(image, 0, 0, mesh?.width || image.width, mesh?.height || image.height);
      ctx.restore();
    } else {
      drawDeformedMesh(ctx, image, mesh);
    }
  } else if (!options.showTexture && image) {
    // If texture view is disabled, render subtle transparent backdrop of original image
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.drawImage(image, 0, 0, mesh?.width || image.width, mesh?.height || image.height);
    ctx.restore();
  }

  // 2. Draw Weight Heatmap Overlay (if enabled and a bone is selected)
  if (options.showWeights && mesh && options.selectedBoneId) {
    drawWeightHeatmap(ctx, mesh, options.selectedBoneId, isRigMode);
  }

  // 3. Draw Mesh Wireframe
  if (options.showMesh && mesh) {
    drawMeshWireframe(ctx, mesh, isRigMode);
  }

  // 4. Draw Bone Skeleton & Joints
  if (options.showBones && skeleton) {
    drawSkeleton(ctx, skeleton, options);
  }

  // 5. Draw IK Target if active
  if (options.ikTargetPos && options.activeIKEffectorId) {
    drawIKTarget(ctx, options.ikTargetPos);
  }

  // 6. Draw Interactive Weight Brush Ring & Falloff HUD
  if (options.weightBrushPreview) {
    drawWeightBrushHUD(ctx, options.weightBrushPreview);
  }

  ctx.restore();
}

function drawWeightBrushHUD(
  ctx: CanvasRenderingContext2D,
  preview: {
    pos: Point2D;
    radius: number;
    intensity: number;
    mode: 'add' | 'subtract' | 'smooth' | 'set';
  }
): void {
  const { pos, radius, intensity, mode } = preview;
  ctx.save();

  // Mode color theme
  let strokeColor = 'rgba(56, 189, 248, 0.85)'; // sky for add
  let fillColor = 'rgba(56, 189, 248, 0.12)';
  let tag = '+ ADD';

  if (mode === 'subtract') {
    strokeColor = 'rgba(244, 63, 94, 0.85)'; // rose
    fillColor = 'rgba(244, 63, 94, 0.12)';
    tag = '- SUB';
  } else if (mode === 'smooth') {
    strokeColor = 'rgba(168, 85, 247, 0.85)'; // purple
    fillColor = 'rgba(168, 85, 247, 0.12)';
    tag = '~ SMOOTH';
  } else if (mode === 'set') {
    strokeColor = 'rgba(245, 158, 11, 0.85)'; // amber
    fillColor = 'rgba(245, 158, 11, 0.12)';
    tag = '= SET';
  }

  // Outer radius boundary ring
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.stroke();

  // Inner core radius (representing intensity falloff)
  const innerRadius = radius * Math.max(0.15, Math.min(0.9, intensity));
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, innerRadius, 0, Math.PI * 2);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.stroke();

  // Center crosshair
  ctx.beginPath();
  ctx.moveTo(pos.x - 5, pos.y);
  ctx.lineTo(pos.x + 5, pos.y);
  ctx.moveTo(pos.x, pos.y - 5);
  ctx.lineTo(pos.x, pos.y + 5);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Mode label badge above brush
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = strokeColor;
  ctx.fillText(tag, pos.x, pos.y - radius - 4);

  ctx.restore();
}

/**
 * High performance texture mapping of 2D triangles using affine matrix transforms.
 */
function drawDeformedMesh(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | HTMLCanvasElement,
  mesh: RigMesh
): void {
  const { vertices, triangles } = mesh;
  const imgWidth = image.width;
  const imgHeight = image.height;

  for (const [i0, i1, i2] of triangles) {
    const v0 = vertices[i0];
    const v1 = vertices[i1];
    const v2 = vertices[i2];
    if (!v0 || !v1 || !v2) continue;

    // UV coordinates in image pixels
    const u0 = v0.u * imgWidth;
    const v0_y = v0.v * imgHeight;
    const u1 = v1.u * imgWidth;
    const v1_y = v1.v * imgHeight;
    const u2 = v2.u * imgWidth;
    const v2_y = v2.v * imgHeight;

    // Destination world vertices
    const x0 = v0.x;
    const y0 = v0.y;
    const x1 = v1.x;
    const y1 = v1.y;
    const x2 = v2.x;
    const y2 = v2.y;

    // Triangle affine matrix mapping: (u, v) -> (x, y)
    const denom = (u0 * (v1_y - v2_y) - v0_y * (u1 - u2) + (u1 * v2_y - u2 * v1_y));
    if (Math.abs(denom) < 0.0001) continue;

    const m11 = (x0 * (v1_y - v2_y) - y0 * (u1 - u2) + (u1 * y2 - u2 * y1)) / denom;
    const m12 = (y0 * (v1_y - v2_y) + x0 * (u1 - u2) - (u1 * x2 - u2 * x1)) / denom; // standard affine
    // Exact affine solve:
    const a = (x0 * (v1_y - v2_y) + x1 * (v2_y - v0_y) + x2 * (v0_y - v1_y)) / denom;
    const b = (y0 * (v1_y - v2_y) + y1 * (v2_y - v0_y) + y2 * (v0_y - v1_y)) / denom;
    const c = (x0 * (u2 - u1) + x1 * (u0 - u2) + x2 * (u1 - u0)) / denom;
    const d = (y0 * (u2 - u1) + y1 * (u0 - u2) + y2 * (u1 - u0)) / denom;
    const e = (x0 * (u1 * v2_y - u2 * v1_y) + x1 * (u2 * v0_y - u0 * v2_y) + x2 * (u0 * v1_y - u1 * v0_y)) / denom;
    const f = (y0 * (u1 * v2_y - u2 * v1_y) + y1 * (u2 * v0_y - u0 * v2_y) + y2 * (u0 * v1_y - u1 * v0_y)) / denom;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.clip();

    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(image, 0, 0);
    ctx.restore();
  }
}

function drawMeshWireframe(ctx: CanvasRenderingContext2D, mesh: RigMesh, isRigMode?: boolean): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.35)'; // subtle cyan-blue
  ctx.lineWidth = 1;

  ctx.beginPath();
  for (const [i0, i1, i2] of mesh.triangles) {
    const v0 = mesh.vertices[i0];
    const v1 = mesh.vertices[i1];
    const v2 = mesh.vertices[i2];
    if (!v0 || !v1 || !v2) continue;

    const x0 = isRigMode ? v0.originalX : v0.x;
    const y0 = isRigMode ? v0.originalY : v0.y;
    const x1 = isRigMode ? v1.originalX : v1.x;
    const y1 = isRigMode ? v1.originalY : v1.y;
    const x2 = isRigMode ? v2.originalX : v2.x;
    const y2 = isRigMode ? v2.originalY : v2.y;

    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x0, y0);
  }
  ctx.stroke();

  // Draw small vertex dots
  ctx.fillStyle = 'rgba(96, 165, 250, 0.6)';
  for (const v of mesh.vertices) {
    const px = isRigMode ? v.originalX : v.x;
    const py = isRigMode ? v.originalY : v.y;
    ctx.fillRect(px - 1, py - 1, 2, 2);
  }

  ctx.restore();
}

function drawWeightHeatmap(
  ctx: CanvasRenderingContext2D,
  mesh: RigMesh,
  selectedBoneId: string,
  isRigMode?: boolean
): void {
  ctx.save();
  for (const v of mesh.vertices) {
    const wObj = v.weights.find((w) => w.boneId === selectedBoneId);
    const weight = wObj ? wObj.weight : 0;
    if (weight > 0.01) {
      const px = isRigMode ? v.originalX : v.x;
      const py = isRigMode ? v.originalY : v.y;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      // Heatmap gradient: Blue (low) -> Yellow -> Red (high)
      const r = Math.floor(255 * weight);
      const g = Math.floor(220 * (1 - Math.abs(weight - 0.5) * 2));
      const b = Math.floor(255 * (1 - weight));
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.4 + weight * 0.5})`;
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawSkeleton(ctx: CanvasRenderingContext2D, skeleton: Skeleton, options: RenderOptions): void {
  const { selectedBoneId, hoveredBoneId, hoveredJoint, pendingBonePreview, branchOriginHint, mode } = options;
  const isRigMode = mode === 'rig';

  // 1. Draw Bone Width Influence Bounding Envelopes (in Rig mode or when selected)
  if (isRigMode || options.showWeights) {
    for (const bone of skeleton.bones) {
      const isSelected = bone.id === selectedBoneId;
      const startWidth = Math.max(2, bone.startWidth ?? 24);
      const endWidth = Math.max(2, bone.endWidth ?? 16);

      const dx = bone.end.x - bone.start.x;
      const dy = bone.end.y - bone.start.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.001) continue;

      const boneAngle = Math.atan2(dy, dx);
      const nx = -dy / len;
      const ny = dx / len;

      const sw2 = startWidth * 0.5;
      const ew2 = endWidth * 0.5;

      const sl_x = bone.start.x + nx * sw2;
      const sl_y = bone.start.y + ny * sw2;
      const sr_x = bone.start.x - nx * sw2;
      const sr_y = bone.start.y - ny * sw2;

      const el_x = bone.end.x + nx * ew2;
      const el_y = bone.end.y + ny * ew2;
      const er_x = bone.end.x - nx * ew2;
      const er_y = bone.end.y - ny * ew2;

      ctx.save();

      // Perfectly symmetric bounding capsule / trapezoid envelope
      ctx.beginPath();
      ctx.moveTo(sl_x, sl_y);
      ctx.lineTo(el_x, el_y);
      // End cap arc around end node center from left through tip to right
      ctx.arc(bone.end.x, bone.end.y, ew2, boneAngle + Math.PI / 2, boneAngle - Math.PI / 2, true);
      ctx.lineTo(sr_x, sr_y);
      // Start cap arc around start node center from right through back to left
      ctx.arc(bone.start.x, bone.start.y, sw2, boneAngle - Math.PI / 2, boneAngle + Math.PI / 2, true);
      ctx.closePath();

      ctx.fillStyle = isSelected
        ? 'rgba(56, 189, 248, 0.14)'
        : 'rgba(148, 163, 184, 0.06)';
      ctx.fill();

      // Bounding box border
      ctx.strokeStyle = isSelected ? 'rgba(56, 189, 248, 0.75)' : 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = isSelected ? 1.5 : 1;
      ctx.setLineDash(isSelected ? [4, 3] : [2, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Start & End width diameter indicators for selected bone
      if (isSelected) {
        ctx.beginPath();
        ctx.moveTo(sl_x, sl_y);
        ctx.lineTo(sr_x, sr_y);
        ctx.moveTo(el_x, el_y);
        ctx.lineTo(er_x, er_y);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Width label tags
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`W1: ${Math.round(startWidth)}px`, sl_x - 4, sl_y);
        ctx.textAlign = 'left';
        ctx.fillText(`W2: ${Math.round(endWidth)}px`, el_x + 4, el_y);
      }

      ctx.restore();
    }
  }

  // 2. Draw Bones
  for (const bone of skeleton.bones) {
    const isSelected = bone.id === selectedBoneId;
    const isHovered = bone.id === hoveredBoneId;

    const start = bone.start;
    const end = bone.end;

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) continue;

    const nx = -dy / len;
    const ny = dx / len;

    // Diamond bone geometry
    const bulgeDist = Math.min(len * 0.28, 24);
    const halfWidth = Math.min(len * 0.16, 14);

    const bx = start.x + (dx / len) * bulgeDist;
    const by = start.y + (dy / len) * bulgeDist;

    const leftX = bx + nx * halfWidth;
    const leftY = by + ny * halfWidth;
    const rightX = bx - nx * halfWidth;
    const rightY = by - ny * halfWidth;

    // Draw stylized bone body
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(end.x, end.y);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();

    // Color styling
    const baseColor = isSelected ? '#38bdf8' : isHovered ? '#67e8f9' : (bone.color || '#e0e7ff');
    ctx.fillStyle = isSelected
      ? 'rgba(56, 189, 248, 0.45)'
      : isHovered
      ? 'rgba(103, 232, 249, 0.35)'
      : 'rgba(255, 255, 255, 0.22)';
    ctx.fill();

    ctx.strokeStyle = baseColor;
    ctx.lineWidth = isSelected ? 3 : isHovered ? 2.2 : 1.5;
    ctx.stroke();

    // Center bone spine highlight
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = isSelected ? 1.5 : 1;
    ctx.stroke();

    // Selected Bone Rotation Gizmo Arc (subtle guide around pivot)
    if (isSelected && len > 20) {
      ctx.beginPath();
      ctx.arc(start.x, start.y, 26, bone.worldAngle - 0.7, bone.worldAngle + 0.7);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Start Joint (Pivot) - Larger touch/click friendly handle
    const isStartHovered = hoveredJoint?.boneId === bone.id && hoveredJoint?.type === 'start';
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(start.x, start.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.fill();
    }

    ctx.beginPath();
    const startRadius = isStartHovered ? 10 : isSelected ? 9 : 7;
    ctx.arc(start.x, start.y, startRadius, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? '#0284c7' : isStartHovered ? '#38bdf8' : '#ffffff';
    ctx.fill();
    ctx.strokeStyle = isSelected ? '#ffffff' : '#0f172a';
    ctx.lineWidth = isSelected ? 2 : 1.5;
    ctx.stroke();

    // Inner pivot dot
    ctx.beginPath();
    ctx.arc(start.x, start.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? '#ffffff' : '#0f172a';
    ctx.fill();

    // End Joint (Tip) - Larger touch/click friendly handle
    const isEndHovered = hoveredJoint?.boneId === bone.id && hoveredJoint?.type === 'end';
    if (isSelected || isEndHovered) {
      ctx.beginPath();
      ctx.arc(end.x, end.y, 12, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? 'rgba(56, 189, 248, 0.3)' : 'rgba(103, 232, 249, 0.25)';
      ctx.fill();
    }

    ctx.beginPath();
    const endRadius = isEndHovered ? 9 : isSelected ? 8 : 6;
    ctx.arc(end.x, end.y, endRadius, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? '#38bdf8' : isEndHovered ? '#7dd3fc' : '#cbd5e1';
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Pinned Node Badge Indicator
    if (bone.isPinned) {
      // Golden pin anchor ring
      ctx.beginPath();
      ctx.arc(start.x, start.y, 13, 0, Math.PI * 2);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([3, 2]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Pin icon glyph 📌
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('📌', start.x, start.y - 10);
    }

    // Bone Name Label
    if (isSelected || isHovered || len > 35) {
      ctx.font = isSelected
        ? 'bold 11px ui-sans-serif, system-ui, sans-serif'
        : '10px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const labelX = bx + nx * (halfWidth + 12);
      const labelY = by + ny * (halfWidth + 12);

      const text = bone.name + (bone.isPinned ? ' 📌' : '');
      const textMetrics = ctx.measureText(text);
      ctx.fillStyle = isSelected ? 'rgba(15, 23, 42, 0.9)' : 'rgba(15, 23, 42, 0.75)';
      ctx.roundRect(labelX - textMetrics.width / 2 - 5, labelY - 8, textMetrics.width + 10, 16, 4);
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.fillStyle = isSelected ? '#38bdf8' : '#e2e8f0';
      ctx.fillText(text, labelX, labelY);
    }

    ctx.restore();
  }

  // 3. Draw Branch Origin Hint if set (e.g. 3rd click branch selection)
  if (branchOriginHint) {
    const { pos, name } = branchOriginHint;
    ctx.save();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(251, 191, 36, 0.35)';
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Pulse target crosshair
    ctx.beginPath();
    ctx.moveTo(pos.x - 22, pos.y);
    ctx.lineTo(pos.x + 22, pos.y);
    ctx.moveTo(pos.x, pos.y - 22);
    ctx.lineTo(pos.x, pos.y + 22);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 2]);
    ctx.stroke();
    ctx.setLineDash([]);

    const text = `Branching from ${name} (Click next node)`;
    ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const textWidth = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.roundRect(pos.x - textWidth / 2 - 6, pos.y - 32, textWidth + 12, 18, 5);
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(text, pos.x, pos.y - 18);

    ctx.restore();
  }

  // 4. Draw Pending Bone Preview with Width Bounding Box
  if (pendingBonePreview) {
    const { start, end, isRoot, parentName, startWidth = 24, endWidth = 16 } = pendingBonePreview;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);

    if (len > 3) {
      const angle = Math.atan2(dy, dx);
      const nx = -dy / len;
      const ny = dx / len;

      ctx.save();

      // Bounding Box Envelope Preview
      const sw2 = startWidth * 0.5;
      const ew2 = endWidth * 0.5;

      const sl_x = start.x + nx * sw2;
      const sl_y = start.y + ny * sw2;
      const sr_x = start.x - nx * sw2;
      const sr_y = start.y - ny * sw2;

      const el_x = end.x + nx * ew2;
      const el_y = end.y + ny * ew2;
      const er_x = end.x - nx * ew2;
      const er_y = end.y - ny * ew2;

      ctx.beginPath();
      ctx.moveTo(sl_x, sl_y);
      ctx.lineTo(el_x, el_y);
      // End cap arc around end node center from left through tip to right
      ctx.arc(end.x, end.y, ew2, angle + Math.PI / 2, angle - Math.PI / 2, true);
      ctx.lineTo(sr_x, sr_y);
      // Start cap arc around start node center from right through back to left
      ctx.arc(start.x, start.y, sw2, angle - Math.PI / 2, angle + Math.PI / 2, true);
      ctx.closePath();

      ctx.fillStyle = isRoot ? 'rgba(251, 191, 36, 0.12)' : 'rgba(56, 189, 248, 0.14)';
      ctx.fill();

      ctx.strokeStyle = isRoot ? 'rgba(251, 191, 36, 0.7)' : 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Bone body diamond preview
      const bulgeDist = Math.min(len * 0.28, 24);
      const halfWidth = Math.min(len * 0.16, 14);

      const bx = start.x + (dx / len) * bulgeDist;
      const by = start.y + (dy / len) * bulgeDist;

      const leftX = bx + nx * halfWidth;
      const leftY = by + ny * halfWidth;
      const rightX = bx - nx * halfWidth;
      const rightY = by - ny * halfWidth;

      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(leftX, leftY);
      ctx.lineTo(end.x, end.y);
      ctx.lineTo(rightX, rightY);
      ctx.closePath();

      ctx.fillStyle = isRoot ? 'rgba(251, 191, 36, 0.25)' : 'rgba(56, 189, 248, 0.25)';
      ctx.fill();

      ctx.strokeStyle = isRoot ? '#fbbf24' : '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Connecting guideline
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Start Joint marker
      ctx.beginPath();
      ctx.arc(start.x, start.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = isRoot ? '#fbbf24' : '#0284c7';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // End Joint marker (crosshair target)
      ctx.beginPath();
      ctx.arc(end.x, end.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = isRoot ? '#f59e0b' : '#38bdf8';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Info pill badge
      const labelText = isRoot
        ? `★ Root Bone (${Math.round(len)}px, W:${Math.round(startWidth)}→${Math.round(endWidth)})`
        : `+ Bone to ${parentName || 'Parent'} (${Math.round(len)}px, W:${Math.round(startWidth)}→${Math.round(endWidth)})`;
      ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2 - 16;
      const textMetrics = ctx.measureText(labelText);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.roundRect(midX - textMetrics.width / 2 - 6, midY - 8, textMetrics.width + 12, 18, 5);
      ctx.fill();
      ctx.strokeStyle = isRoot ? '#fbbf24' : '#38bdf8';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = isRoot ? '#fbbf24' : '#38bdf8';
      ctx.fillText(labelText, midX, midY);

      ctx.restore();
    }
  }
}

function drawIKTarget(ctx: CanvasRenderingContext2D, target: Point2D): void {
  ctx.save();
  ctx.strokeStyle = '#f43f5e'; // Vibrant Rose target
  ctx.lineWidth = 2;

  // Crosshair & Rings
  ctx.beginPath();
  ctx.arc(target.x, target.y, 10, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(target.x, target.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#f43f5e';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(target.x - 14, target.y);
  ctx.lineTo(target.x + 14, target.y);
  ctx.moveTo(target.x, target.y - 14);
  ctx.lineTo(target.x, target.y + 14);
  ctx.stroke();

  ctx.restore();
}

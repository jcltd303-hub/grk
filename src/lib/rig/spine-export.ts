import type { AnimationClip, RigMesh, Skeleton } from './types';

export const SPINE_VERSION = '4.2.43';

type ExportInput = {
  skeleton: Skeleton;
  mesh: RigMesh;
  clips: AnimationClip[];
  width: number;
  height: number;
};

const degrees = (radians: number) => -radians * 180 / Math.PI;
const finite = (value: number, label: string) => {
  if (!Number.isFinite(value)) throw new Error(`Invalid ${label} in rig.`);
  return value;
};

/**
 * Converts the image's top-left, Y-down coordinates to Spine's centered,
 * Y-up setup pose. Bone transforms are reconstructed from rest data so the
 * current animation pose never leaks into the exported bind pose.
 */
export function createSpineSkeleton({ skeleton, mesh, clips, width, height }: ExportInput) {
  if (!width || !height || !mesh.vertices.length || !mesh.triangles.length) {
    throw new Error('Spine export requires artwork and a nonempty weighted mesh.');
  }
  if (!skeleton.bones.length) throw new Error('Spine export requires bones.');
  if (mesh.vertices.length > 65535) throw new Error('Spine mesh exceeds 65535 vertices.');
  const byId = new Map(skeleton.bones.map(b => [b.id, b]));
  if (byId.size !== skeleton.bones.length) throw new Error('Duplicate bone IDs.');
  const ordered: typeof skeleton.bones = [];
  const pending = new Set<string>();
  const seen = new Set<string>();
  function visit(id: string) {
    if (seen.has(id)) return;
    if (pending.has(id)) throw new Error('Bone hierarchy has a cycle.');
    const bone = byId.get(id);
    if (!bone) throw new Error(`Missing parent bone: ${id}`);
    pending.add(id);
    if (bone.parentId) visit(bone.parentId);
    pending.delete(id);
    seen.add(id);
    ordered.push(bone);
  }
  skeleton.bones.forEach(b => visit(b.id));
  const nameById = new Map<string, string>();
  const used = new Set<string>();
  ordered.forEach((bone, index) => {
    let name = bone.name.trim() || `bone_${index}`;
    if (used.has(name)) name = `${name}_${index}`;
    used.add(name);
    nameById.set(bone.id, name);
  });
  const origin = skeleton.restRootPos || skeleton.rootPos;
  const transforms = new Map<string, { x: number; y: number; angle: number }>();
  const bones = ordered.map(bone => {
    const rest = skeleton.restBones?.[bone.id];
    const angle = finite(rest?.localAngle ?? bone.localAngle, 'bone angle');
    const length = finite(rest?.length ?? bone.length, 'bone length');
    const parent = bone.parentId ? transforms.get(bone.parentId) : undefined;
    const worldAngle = (parent?.angle ?? 0) - angle;
    const x = parent ? parent.x + Math.cos(parent.angle) * finite(
      skeleton.restBones?.[bone.parentId!]?.length ?? byId.get(bone.parentId!)!.length,
      'parent length',
    ) : origin.x - width / 2;
    const y = parent ? parent.y + Math.sin(parent.angle) * (
      skeleton.restBones?.[bone.parentId!]?.length ?? byId.get(bone.parentId!)!.length
    ) : height / 2 - origin.y;
    transforms.set(bone.id, { x, y, angle: worldAngle });
    return {
      name: nameById.get(bone.id)!,
      ...(parent ? { parent: nameById.get(bone.parentId!)!, x:
        (skeleton.restBones?.[bone.parentId!]?.length ?? byId.get(bone.parentId!)!.length) } : { x, y }),
      length,
      rotation: degrees(angle),
    };
  });
  const indexById = new Map(ordered.map((bone, index) => [bone.id, index]));
  // Spine expects the polygon's hull vertices first, in boundary order.
  const points = mesh.vertices.map((v, i) => ({ x: v.originalX, y: -v.originalY, i }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: typeof points[number], b: typeof points[number], c: typeof points[number]) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const lower: typeof points = [], upper: typeof points = [];
  for (const point of points) {
    while (lower.length > 1 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  for (const point of [...points].reverse()) {
    while (upper.length > 1 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  const hullIndices = [...lower.slice(0, -1), ...upper.slice(0, -1)].map(p => p.i);
  if (hullIndices.length < 3) throw new Error('Mesh has no valid polygon hull.');
  const hullSet = new Set(hullIndices);
  const permutation = [...hullIndices, ...mesh.vertices.map((_, i) => i).filter(i => !hullSet.has(i))];
  const remap = new Map(permutation.map((old, index) => [old, index]));
  const uvs: number[] = [];
  const vertices: number[] = [];
  permutation.forEach(oldIndex => {
    const vertex = mesh.vertices[oldIndex];
    uvs.push(finite(vertex.u, 'UV'), finite(vertex.v, 'UV'));
    if (vertex.weights.some(w => w.weight > 0 && !indexById.has(w.boneId))) {
      throw new Error('Mesh weights refer to a missing bone.');
    }
    const influences = vertex.weights.filter(w => w.weight > 0 && indexById.has(w.boneId));
    if (!influences.length) influences.push({ boneId: ordered[0].id, weight: 1 });
    const total = influences.reduce((sum, weight) => sum + weight.weight, 0);
    vertices.push(influences.length);
    influences.forEach(({ boneId, weight }) => {
      const t = transforms.get(boneId)!;
      const px = finite(vertex.originalX, 'vertex X') - width / 2 - t.x;
      const py = height / 2 - finite(vertex.originalY, 'vertex Y') - t.y;
      const cosine = Math.cos(t.angle), sine = Math.sin(t.angle);
      vertices.push(indexById.get(boneId)!, cosine * px - sine * py,
        sine * px + cosine * py, finite(weight / total, 'weight'));
    });
  });
  const triangles = mesh.triangles.flatMap(([a, b, c]) => {
    if ([a, b, c].some(i => !Number.isInteger(i) || i < 0 || i >= mesh.vertices.length)) {
      throw new Error('Mesh contains an invalid triangle index.');
    }
    // Flip winding because source coordinates have Y down.
    return [remap.get(a)!, remap.get(c)!, remap.get(b)!];
  });
  const animations: Record<string, object> = {};
  const animationNames = new Set<string>();
  clips.forEach((clip, index) => {
    let name = clip.name.trim() || `animation_${index}`;
    if (animationNames.has(name)) name = `${name}_${index}`;
    animationNames.add(name);
    const timelines: Record<string, { rotate?: { time: number; value: number }[] }> = {};
    ordered.forEach(bone => {
      const setup = skeleton.restBones?.[bone.id]?.localAngle ?? bone.localAngle;
      const keys = [...clip.keyframes]
        .sort((a, b) => a.time - b.time)
        .filter(key => Object.hasOwn(key.boneRotations, bone.id))
        .map(key => ({ time: finite(key.time, 'keyframe time'),
          value: degrees(key.boneRotations[bone.id] - setup) }));
      if (keys.length) timelines[nameById.get(bone.id)!] = { rotate: keys };
    });
    const rootOffsets = [...clip.keyframes].sort((a, b) => a.time - b.time)
      .filter(key => key.rootOffset)
      .map(key => ({ time: finite(key.time, 'keyframe time'),
        x: finite(key.rootOffset!.x, 'root offset X'), y: -finite(key.rootOffset!.y, 'root offset Y') }));
    if (rootOffsets.length) {
      const rootName = nameById.get(skeleton.rootId) ?? bones[0].name;
      animations[name] = { bones: { ...timelines, [rootName]: { ...timelines[rootName], translate: rootOffsets } } };
    } else {
      animations[name] = { bones: timelines };
    }
  });
  return {
    skeleton: { spine: SPINE_VERSION, x: -width / 2, y: -height / 2, width, height, images: './' },
    bones,
    slots: [{ name: 'artwork', bone: bones[0].name, attachment: 'artwork' }],
    skins: [{ name: 'default', attachments: { artwork: { artwork: {
      type: 'mesh', uvs, triangles, vertices, hull: hullIndices.length, width, height,
    } } } }],
    animations,
  };
}

export function createSpineAtlas(width: number, height: number): string {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('Invalid atlas dimensions.');
  }
  return `artwork.png
size: ${width},${height}
format: RGBA8888
filter: Linear,Linear
repeat: none
pma: false
artwork
bounds: 0,0,${width},${height}
rotate: false
`;
}

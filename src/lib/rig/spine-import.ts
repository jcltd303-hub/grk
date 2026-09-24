import type { AnimationClip, Bone, RigMesh, Skeleton } from './types';

type SpineKey = { time: number; value?: number; x?: number; y?: number };
type SpineBone = { name: string; parent?: string; x?: number; y?: number; length?: number; rotation?: number };

/** Import the single weighted artwork mesh emitted by this studio's Spine exporter. */
export function convertSpineRig(data: any): {
  format: string; name: string; image?: { dataUrl: string }; skeleton: Skeleton;
  mesh: RigMesh; animations: AnimationClip[];
} {
  if (!String(data?.skeleton?.spine ?? '').startsWith('4.2.') || !Array.isArray(data.bones) || !data.bones.length) {
    throw new Error('Expected a Spine 4.2 rig.json with bones.');
  }
  const width = data.skeleton.width, height = data.skeleton.height;
  if (!(width > 0 && height > 0)) throw new Error('Spine rig has invalid artwork dimensions.');
  const attachment = data.skins?.[0]?.attachments?.artwork?.artwork;
  if (attachment?.type !== 'mesh' || !Array.isArray(attachment.uvs) || !Array.isArray(attachment.vertices) || !Array.isArray(attachment.triangles)) {
    throw new Error('Expected the studio export with one weighted artwork mesh.');
  }
  const sourceBones = data.bones as SpineBone[];
  const byName = new Map(sourceBones.map(b => [b.name, b]));
  if (byName.size !== sourceBones.length || sourceBones.some(b => b.parent && !byName.has(b.parent))) {
    throw new Error('Spine bone hierarchy is invalid.');
  }
  const root = sourceBones.find(b => !b.parent)!;
  const rootPos = { x: (root.x ?? 0) + width / 2, y: height / 2 - (root.y ?? 0) };
  const bones: Bone[] = sourceBones.map(b => ({
    id: b.name, name: b.name, parentId: b.parent ?? null,
    localAngle: -(b.rotation ?? 0) * Math.PI / 180, length: b.length ?? 0,
    color: '#38bdf8', start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, worldAngle: 0,
  }));
  // The studio hierarchy places each child at its parent's tip.
  if (sourceBones.some(b => b.parent && (Math.abs((b.x ?? 0) - (byName.get(b.parent)?.length ?? 0)) > 0.01 || Math.abs(b.y ?? 0) > 0.01))) {
    throw new Error('This Spine rig uses child offsets the studio cannot represent.');
  }
  const skeleton: Skeleton = { bones, rootId: root.name, rootPos, restRootPos: { ...rootPos },
    restBones: Object.fromEntries(bones.map(b => [b.id, { localAngle: b.localAngle, length: b.length }])),
  };
  const values = attachment.vertices as number[];
  const vertices: RigMesh['vertices'] = [];
  let offset = 0;
  for (let i = 0; i < attachment.uvs.length; i += 2) {
    const count = values[offset++];
    if (!Number.isInteger(count) || count < 1 || offset + count * 4 > values.length) throw new Error('Invalid Spine mesh weights.');
    const weights: RigMesh['vertices'][number]['weights'] = [];
    for (let j = 0; j < count; j++) {
      const bone = bones[values[offset++]];
      offset += 2; // Spine stores local vertex X and Y, reconstructed from UV below.
      const weight = values[offset++];
      if (!bone || !Number.isFinite(weight)) throw new Error('Invalid Spine mesh bone reference.');
      weights.push({ boneId: bone.id, weight });
    }
    const u = attachment.uvs[i], v = attachment.uvs[i + 1];
    vertices.push({ x: u * width, y: v * height, originalX: u * width, originalY: v * height, u, v, weights });
  }
  if (offset !== values.length) throw new Error('Unexpected Spine mesh vertex data.');
  const triangles: RigMesh['triangles'] = [];
  for (let i = 0; i < attachment.triangles.length; i += 3) {
    const [a, c, b] = attachment.triangles.slice(i, i + 3);
    if (![a, b, c].every(index => Number.isInteger(index) && index >= 0 && index < vertices.length)) throw new Error('Invalid Spine mesh triangle.');
    triangles.push([a, b, c]);
  }
  const mesh: RigMesh = { width, height, density: 24, vertices, triangles };
  const animations: AnimationClip[] = Object.entries(data.animations ?? {}).map(([name, raw]) => {
    const tracks = (raw as { bones?: Record<string, { rotate?: SpineKey[]; translate?: SpineKey[] }> }).bones ?? {};
    const frames = new Map<number, AnimationClip['keyframes'][number]>();
    const frame = (time: number) => {
      if (!frames.has(time)) frames.set(time, { id: `key_${time}`, time, boneRotations: {} });
      return frames.get(time)!;
    };
    for (const [boneName, timelines] of Object.entries(tracks)) {
      const bone = bones.find(b => b.id === boneName);
      if (!bone) continue;
      for (const key of timelines.rotate ?? []) frame(key.time).boneRotations[bone.id] = bone.localAngle - (key.value ?? 0) * Math.PI / 180;
      if (boneName === root.name) for (const key of timelines.translate ?? []) frame(key.time).rootOffset = { x: key.x ?? 0, y: -(key.y ?? 0) };
    }
    const keyframes = [...frames.values()].sort((a, b) => a.time - b.time);
    return { id: `spine_${name}`, name, fps: 30, duration: Math.max(0.01, ...keyframes.map(k => k.time)), loop: true, keyframes };
  });
  return { format: 'spine-import', name: 'Spine Rig', skeleton, mesh, animations,
    ...(data.image?.dataUrl ? { image: { dataUrl: data.image.dataUrl } } : {}),
  };
}

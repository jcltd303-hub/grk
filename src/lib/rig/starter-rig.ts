import { RigExportJSON } from './types';
import { createDefaultSkeleton, getDefaultAnimationClips } from './presets';
import { updateWorldTransforms } from './skeleton';
import { DEFAULT_ARTWORK_URL } from './image-bank';

/**
 * Produces a comprehensive, self-contained reference Rig JSON structure (Version 2.0).
 * Can be loaded into the studio at any time to test bone articulation, skinning, and playback.
 */
export function getStarterRigJSON(): string {
  const width = 300;
  const height = 480;

  const skeleton = createDefaultSkeleton('human', width, height);
  updateWorldTransforms(skeleton);

  const clips = getDefaultAnimationClips('human');

  const rigData: RigExportJSON = {
    version: '2.0',
    format: '2d-skeletal-rig-studio',
    name: 'Starter 2D Rig',
    exportedAt: new Date().toISOString(),
    image: {
      dataUrl: DEFAULT_ARTWORK_URL,
      width,
      height,
    },
    skeleton: {
      rootId: skeleton.rootId,
      rootPos: { ...skeleton.rootPos },
      restRootPos: { ...skeleton.restRootPos },
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
    animations: clips.map((c) => ({
      id: c.id,
      name: c.name.replace('Heroic ', 'Demo '),
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

  return JSON.stringify(rigData, null, 2);
}

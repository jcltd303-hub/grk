import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { AnimationClip, RigMesh, Skeleton } from './types';
import { createSpineAtlas, createSpineSkeleton } from './spine-export';
import { zipFiles } from './spine-package';

const skeleton: Skeleton = {
  rootId: 'root', rootPos: { x: 50, y: 50 }, restRootPos: { x: 50, y: 50 },
  restBones: { root: { localAngle: 0, length: 20 },
    arm: { localAngle: Math.PI / 2, length: 10 } },
  bones: [
    { id: 'arm', name: 'arm', parentId: 'root', localAngle: 0, length: 10,
      color: '#fff', start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, worldAngle: 0 },
    { id: 'root', name: 'root', parentId: null, localAngle: 0, length: 20,
      color: '#fff', start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, worldAngle: 0 },
  ],
};
const mesh: RigMesh = {
  width: 100, height: 100, density: 1, triangles: [[0, 1, 2]],
  vertices: [
    { x: 50, y: 50, originalX: 50, originalY: 50, u: 0.5, v: 0.5,
      weights: [{ boneId: 'root', weight: 0.25 }, { boneId: 'arm', weight: 0.75 }] },
    { x: 70, y: 50, originalX: 70, originalY: 50, u: 0.7, v: 0.5,
      weights: [{ boneId: 'arm', weight: 1 }] },
    { x: 50, y: 70, originalX: 50, originalY: 70, u: 0.5, v: 0.7,
      weights: [{ boneId: 'root', weight: 1 }] },
  ],
};
const clips: AnimationClip[] = [{
  id: 'walk', name: 'wave', duration: 1, fps: 30, loop: true,
  keyframes: [{ id: 'one', time: 0.5, boneRotations: { arm: Math.PI } }],
}];

test('exports rest pose with parent-first bones, weighted mesh and relative animation', () => {
  const output = createSpineSkeleton({ skeleton, mesh, clips, width: 100, height: 100 });
  assert.deepEqual(output.bones.map(b => b.name), ['root', 'arm']);
  assert.equal(output.bones[1].rotation, -90);
  assert.equal(output.bones[1].x, 20);
  const attachment = output.skins[0].attachments.artwork.artwork;
  assert.equal(attachment.hull, 3);
  assert.equal(attachment.uvs.length, 6);
  assert.equal(attachment.vertices.length, 3 + 4 * 4);
  assert.deepEqual(output.animations.wave, { bones: { arm: { rotate: [{ time: 0.5, value: -90 }] } } });
  assert.match(createSpineAtlas(100, 100), /artwork.png[\s\S]*artwork\nbounds: 0,0,100,100/);
});

test('rejects invalid hierarchy and mesh indexes', () => {
  assert.throws(() => createSpineSkeleton({
    skeleton: { ...skeleton, bones: skeleton.bones.map(b => ({ ...b, parentId: b.id === 'root' ? 'arm' : 'root' })) },
    mesh, clips, width: 100, height: 100,
  }), /cycle/);
  assert.throws(() => createSpineSkeleton({ skeleton, mesh: { ...mesh, triangles: [[0, 1, 99]] },
    clips, width: 100, height: 100 }), /triangle/);
});

test('ZIP stores atlas and JSON with readable entries', async () => {
  const bytes = new Uint8Array(await zipFiles([
    { name: 'rig.atlas', data: new TextEncoder().encode('artwork.png') },
    { name: 'rig.json', data: new TextEncoder().encode('{}') },
  ]).arrayBuffer());
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50);
  assert.equal(new DataView(bytes.buffer).getUint32(bytes.length - 22, true), 0x06054b50);
  assert.equal(new TextDecoder().decode(bytes).includes('rig.atlas'), true);
});

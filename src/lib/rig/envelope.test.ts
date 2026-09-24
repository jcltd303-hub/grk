import test from 'node:test';
import assert from 'node:assert/strict';
import { fitEnvelopesToAlpha } from './envelope';
import { updateWorldTransforms } from './skeleton';
import type { Skeleton } from './types';

test('automatic envelope covers every visible pixel including a sparse protrusion', () => {
  const width = 100, height = 80;
  const alpha = new Uint8Array(width * height);
  for (let y = 34; y <= 46; y++) for (let x = 15; x <= 85; x++) alpha[y * width + x] = 255;
  alpha[2 * width + 80] = 255;
  const skeleton: Skeleton = {
    bones: [{ id: 'body', name: 'Body', parentId: null, localAngle: 0, length: 70,
      color: '#fff', start: { x: 15, y: 40 }, end: { x: 85, y: 40 },
      worldAngle: 0, startWidth: 12, endWidth: 12 }],
    rootId: 'body', rootPos: { x: 15, y: 40 }, restRootPos: { x: 15, y: 40 },
    restBones: { body: { localAngle: 0, length: 70 } },
  };
  updateWorldTransforms(skeleton);
  fitEnvelopesToAlpha(skeleton, alpha, width, height);
  const bone = skeleton.bones[0];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (alpha[y * width + x] < 20) continue;
    const t = Math.max(0, Math.min(1, (x - bone.start.x) / bone.length));
    const distance = Math.hypot(x - (bone.start.x + t * bone.length), y - bone.start.y);
    const radius = ((1 - t) * bone.startWidth! + t * bone.endWidth!) / 2;
    assert.ok(distance <= radius, `uncovered pixel ${x},${y}`);
  }
});

test('terminal bone at an image edge is inset and its rest length follows', () => {
  const width = 100, height = 80;
  const alpha = new Uint8Array(width * height);
  for (let y = 30; y <= 50; y++) for (let x = 10; x <= 90; x++) alpha[y * width + x] = 255;
  const skeleton: Skeleton = {
    bones: [{ id: 'tip', name: 'Tip', parentId: null, localAngle: 0, length: 80,
      color: '#fff', start: { x: 10, y: 40 }, end: { x: 90, y: 40 },
      worldAngle: 0, startWidth: 20, endWidth: 20 }],
    rootId: 'tip', rootPos: { x: 10, y: 40 }, restRootPos: { x: 10, y: 40 },
    restBones: { tip: { localAngle: 0, length: 80 } },
  };
  updateWorldTransforms(skeleton);
  fitEnvelopesToAlpha(skeleton, alpha, width, height, true);
  assert.ok(skeleton.bones[0].end.x < 90);
  assert.equal(skeleton.restBones.tip.length, skeleton.bones[0].length);
});

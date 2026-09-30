import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { applyPartWeights, constrainAngle, rotationHandle } from './part-deform';
import { generateMesh } from './mesh';
import type { Skeleton } from './types';

test('painted ownership produces normalized blended weights across a shared border', () => {
  const mesh = generateMesh(20, 20, 4, 4);
  const skeleton = { bones: [{ id: 'left' }, { id: 'right' }] } as Skeleton;
  const pixels = new Uint16Array(400);
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) pixels[y * 20 + x] = x < 10 ? 1 : 2;
  applyPartWeights(mesh, { width: 20, height: 20, boneIds: ['left', 'right'], pixels, revision: 1 }, skeleton);
  const middle = mesh.vertices.find(v => v.originalX === 10 && v.originalY === 10)!;
  assert.ok(middle.weights.some(w => w.boneId === 'left' && w.weight > 0));
  assert.ok(middle.weights.some(w => w.boneId === 'right' && w.weight > 0));
  assert.ok(Math.abs(middle.weights.reduce((sum, w) => sum + w.weight, 0) - 1) < 1e-8);
});

test('angle bounds work independently and rotation handle follows joint direction', () => {
  assert.equal(constrainAngle(-2, { minAngle: -1 }), -1);
  assert.equal(constrainAngle(2, { maxAngle: 1 }), 1);
  const a = rotationHandle({ x: 10, y: 20, worldAngle: 0 });
  const b = rotationHandle({ x: 10, y: 20, worldAngle: Math.PI / 2 });
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 20);
});

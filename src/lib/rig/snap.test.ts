import test from 'node:test';
import assert from 'node:assert/strict';
import { snapAngle, snapPoint } from './snap';
import type { Skeleton } from './types';

const skeleton: Skeleton = {
  bones: [
    { id: 'root', name: 'Root', parentId: null, localAngle: 0, length: 70,
      color: '#fff', start: { x: 10, y: 40 }, end: { x: 80, y: 40 }, worldAngle: 0 },
    { id: 'child', name: 'Child', parentId: 'root', localAngle: 0, length: 20,
      color: '#fff', start: { x: 80, y: 40 }, end: { x: 100, y: 40 }, worldAngle: 0 },
  ], rootId: 'root', rootPos: { x: 10, y: 40 }, restRootPos: { x: 10, y: 40 }, restBones: {},
};

test('magnet off leaves the pointer unchanged', () => {
  assert.deepEqual(snapPoint({ x: 78, y: 42 }, { enabled: false, zoom: 1, skeleton }),
    { point: { x: 78, y: 42 }, kind: null });
});

test('nearby joint wins over an axis guide, and dragging cannot snap to itself', () => {
  const candidate = { x: 78, y: 42 };
  assert.deepEqual(snapPoint(candidate, { enabled: true, zoom: 1, skeleton, anchor: { x: 10, y: 40 } }),
    { point: { x: 80, y: 40 }, kind: 'joint' });
  assert.notEqual(snapPoint(candidate, { enabled: true, zoom: 1, skeleton, excludeBoneId: 'root',
    anchor: { x: 10, y: 40 } }).kind, 'joint');
});

test('aligns horizontally and vertically to the active origin within a screen pixel tolerance', () => {
  assert.deepEqual(snapPoint({ x: 60, y: 44 }, { enabled: true, zoom: 1, anchor: { x: 20, y: 40 } }),
    { point: { x: 60, y: 40 }, kind: 'horizontal' });
  assert.deepEqual(snapPoint({ x: 24, y: 72 }, { enabled: true, zoom: 1, anchor: { x: 20, y: 40 } }),
    { point: { x: 20, y: 72 }, kind: 'vertical' });
  assert.equal(snapPoint({ x: 60, y: 44 }, { enabled: true, zoom: 4, anchor: { x: 20, y: 40 } }).kind, null);
});

test('balances a tip inset from the silhouette by the same amount as its start', () => {
  const width = 110, height = 80, alpha = new Uint8Array(width * height);
  for (let y = 30; y <= 50; y++) for (let x = 10; x <= 90; x++) alpha[y * width + x] = 255;
  const result = snapPoint({ x: 89, y: 41 }, { enabled: true, zoom: 1, anchor: { x: 12, y: 40 },
    alpha, width, height });
  assert.equal(result.kind, 'balanced edge');
  assert.ok(Math.abs(result.point.x - 88) < 1);
  assert.ok(Math.abs(result.point.y - 40) < 2);
});

test('pose rotation snaps near cardinal world angles without changing free rotation elsewhere', () => {
  assert.ok(Math.abs(snapAngle(Math.PI / 2 + 0.04) - Math.PI / 2) < 1e-9);
  assert.equal(snapAngle(0.4), 0.4);
});

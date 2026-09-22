import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMesh, inferBoneWidthsFromMeshGeometry, computeAutoWeights } from './mesh';
import { updateWorldTransforms } from './skeleton';
import type { Skeleton } from './types';

function makeSkeleton(): Skeleton {
  const skeleton: Skeleton = {
    bones: [{
      id: 'body',
      name: 'Body',
      parentId: null,
      localAngle: 0,
      length: 80,
      color: '#fff',
      start: { x: 20, y: 50 },
      end: { x: 100, y: 50 },
      worldAngle: 0,
      startWidth: 200,
      endWidth: 2,
    }],
    rootId: 'body',
    rootPos: { x: 20, y: 50 },
    restRootPos: { x: 20, y: 50 },
    restBones: { body: { localAngle: 0, length: 80 } },
  };
  updateWorldTransforms(skeleton);
  return skeleton;
}

test('infers bone widths from mesh geometry instead of existing weights or widths', () => {
  const alpha = new Uint8Array(120 * 100);
  for (let y = 30; y <= 70; y++) for (let x = 10; x <= 110; x++) alpha[y * 120 + x] = 255;
  const mesh = generateMesh(120, 100, 10, 10, alpha);
  const skeleton = makeSkeleton();

  inferBoneWidthsFromMeshGeometry(mesh, skeleton);

  const bone = skeleton.bones[0];
  assert.ok((bone.startWidth ?? 0) > 25 && (bone.startWidth ?? 0) < 60);
  assert.ok((bone.endWidth ?? 0) > 25 && (bone.endWidth ?? 0) < 60);
  assert.notEqual(bone.startWidth, 200);
  assert.notEqual(bone.endWidth, 2);
});

test('auto-fit width remains stable when pre-existing vertex weights are changed', () => {
  const alpha = new Uint8Array(120 * 100);
  for (let y = 30; y <= 70; y++) for (let x = 10; x <= 110; x++) alpha[y * 120 + x] = 255;
  const mesh = generateMesh(120, 100, 10, 10, alpha);
  const first = makeSkeleton();
  const second = makeSkeleton();

  mesh.vertices.forEach((v, index) => {
    v.weights = [{ boneId: index % 2 === 0 ? 'body' : 'other', weight: 1 }];
  });

  inferBoneWidthsFromMeshGeometry(mesh, first);
  mesh.vertices.forEach((v) => {
    v.weights = [{ boneId: 'body', weight: 0.01 }];
  });
  inferBoneWidthsFromMeshGeometry(mesh, second);

  assert.equal(first.bones[0].startWidth, second.bones[0].startWidth);
  assert.equal(first.bones[0].endWidth, second.bones[0].endWidth);
});


test('automatic weights overwrite manual weights deterministically from geometry', () => {
  const mesh = generateMesh(140, 100, 14, 10);
  const skeleton = makeSkeleton();
  skeleton.bones.push({
    id: 'body2',
    name: 'Body2',
    parentId: 'body',
    localAngle: 0,
    length: 30,
    color: '#fff',
    start: { x: 100, y: 50 },
    end: { x: 130, y: 50 },
    worldAngle: 0,
    startWidth: 30,
    endWidth: 24,
  });
  updateWorldTransforms(skeleton);

  for (const vertex of mesh.vertices) {
    vertex.weights = [{ boneId: 'manual', weight: 1 }];
  }

  computeAutoWeights(mesh, skeleton);

  assert.ok(mesh.vertices.every((v) =>
    v.weights.length > 0 &&
    v.weights.every((w) => w.boneId === 'body' || w.boneId === 'body2') &&
    Math.abs(v.weights.reduce((sum, w) => sum + w.weight, 0) - 1) < 1e-6
  ));
});

test('automatic weights blend across a connected joint', () => {
  const mesh = generateMesh(160, 120, 16, 12);
  const skeleton: Skeleton = {
    bones: [
      {
        id: 'a', name: 'A', parentId: null, localAngle: 0, length: 70,
        color: '#fff', start: { x: 30, y: 60 }, end: { x: 90, y: 60 },
        worldAngle: 0, startWidth: 34, endWidth: 34,
      },
      {
        id: 'b', name: 'B', parentId: 'a', localAngle: Math.PI / 2, length: 55,
        color: '#fff', start: { x: 90, y: 60 }, end: { x: 90, y: 115 },
        worldAngle: Math.PI / 2, startWidth: 34, endWidth: 26,
      },
    ],
    rootId: 'a',
    rootPos: { x: 30, y: 60 },
    restRootPos: { x: 30, y: 60 },
    restBones: {
      a: { localAngle: 0, length: 70 },
      b: { localAngle: Math.PI / 2, length: 55 },
    },
  };
  updateWorldTransforms(skeleton);

  computeAutoWeights(mesh, skeleton);

  const joint = mesh.vertices
    .filter((v) => Math.hypot(v.originalX - 90, v.originalY - 60) < 10)
    .filter((v) => v.weights.some((w) => w.boneId === 'a') && v.weights.some((w) => w.boneId === 'b'));

  assert.ok(joint.length > 0);
});

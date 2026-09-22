import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMesh, inferBoneWidthsFromMeshGeometry } from './mesh';
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

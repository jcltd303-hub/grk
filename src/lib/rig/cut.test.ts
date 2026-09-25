import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cutMesh } from './cut';
import { generateMesh, computeAutoWeights } from './mesh';
import { createSpineSkeleton } from './spine-export';
import type { Skeleton } from './types';

test('a cut duplicates seam vertices and keeps triangles on separate bone sides', () => {
  const original = generateMesh(100, 100, 2, 2);
  const cut = cutMesh(original, { x: 50, y: 0 }, { x: 50, y: 100 }, 'left', 'right');
  assert.ok(cut.triangles.length > 0);
  assert.ok(cut.vertices.length > original.vertices.length);
  for (const triangle of cut.triangles) {
    assert.equal(new Set(triangle.map(i => cut.vertices[i].cutBoneId)).size, 1);
  }
  const coincident = cut.vertices.filter(v => Math.abs(v.originalX - 50) < 1e-7 && v.originalY === 50);
  assert.deepEqual(new Set(coincident.map(v => v.cutBoneId)), new Set(['left', 'right']));
  assert.throws(() => cutMesh(cut, { x: 0, y: 50 }, { x: 100, y: 50 }, 'left', 'right'));
});

test('automatic skinning can be followed by cut ownership restoration', () => {
  const mesh = cutMesh(generateMesh(100, 100, 2, 2), { x: 50, y: 0 }, { x: 50, y: 100 }, 'a', 'b');
  const bone = (id: string, x: number) => ({ id, name: id, parentId: null, localAngle: 0, length: 10,
    color: 'white', start: { x, y: 20 }, end: { x, y: 30 }, worldAngle: 0 });
  const skeleton: Skeleton = { bones: [bone('a', 25), bone('b', 75)], rootId: 'a', rootPos: { x: 0, y: 0 },
    restRootPos: { x: 0, y: 0 }, restBones: {} };
  computeAutoWeights(mesh, skeleton);
  for (const vertex of mesh.vertices) vertex.weights = [{ boneId: vertex.cutBoneId!, weight: 1 }];
  assert.ok(mesh.vertices.every(v => v.weights[0].boneId === v.cutBoneId));
  const spine = createSpineSkeleton({ skeleton, mesh, clips: [], width: 100, height: 100 });
  const attachment = (spine.skins[0].attachments.artwork.artwork);
  assert.equal(attachment.triangles.length, mesh.triangles.length * 3);
  assert.equal(attachment.uvs.length, mesh.vertices.length * 2);
});

test('slanted seam intersects and splits triangles without degenerate geometry', () => {
  const mesh = cutMesh(generateMesh(100, 100, 3, 3), { x: 30, y: -10 }, { x: 70, y: 110 }, 'a', 'b');
  for (const [a, b, c] of mesh.triangles) {
    const [p, q, r] = [mesh.vertices[a], mesh.vertices[b], mesh.vertices[c]];
    const area = (q.originalX - p.originalX) * (r.originalY - p.originalY)
      - (q.originalY - p.originalY) * (r.originalX - p.originalX);
    assert.ok(Math.abs(area) > 1e-6);
    assert.equal(p.cutBoneId, q.cutBoneId);
    assert.equal(q.cutBoneId, r.cutBoneId);
  }
});

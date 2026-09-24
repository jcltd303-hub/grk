import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createSpineSkeleton } from './spine-export';
import { convertSpineRig } from './spine-import';
import type { Skeleton, RigMesh, AnimationClip } from './types';

test('imports exported bones, weighted mesh, and keyed animation without shifting the drawing', () => {
  const skeleton: Skeleton = {
    rootId: 'root', rootPos: { x: 50, y: 40 }, restRootPos: { x: 50, y: 40 }, restBones: {},
    bones: [
      { id: 'root', name: 'Root', parentId: null, localAngle: Math.PI / 2, length: 10, color: '#fff', start: { x: 50, y: 40 }, end: { x: 50, y: 50 }, worldAngle: Math.PI / 2 },
      { id: 'tail', name: 'Tail', parentId: 'root', localAngle: -Math.PI / 4, length: 20, color: '#fff', start: { x: 50, y: 50 }, end: { x: 64, y: 64 }, worldAngle: Math.PI / 4 },
    ],
  };
  const mesh: RigMesh = { width: 100, height: 80, density: 1,
    vertices: [
      { x: 20, y: 20, originalX: 20, originalY: 20, u: .2, v: .25, weights: [{ boneId: 'root', weight: 1 }] },
      { x: 70, y: 30, originalX: 70, originalY: 30, u: .7, v: .375, weights: [{ boneId: 'tail', weight: 1 }] },
      { x: 40, y: 70, originalX: 40, originalY: 70, u: .4, v: .875, weights: [{ boneId: 'root', weight: .4 }, { boneId: 'tail', weight: .6 }] },
    ], triangles: [[0, 1, 2]],
  };
  const clips: AnimationClip[] = [{ id: 'swim', name: 'Swim', duration: 1, fps: 30, loop: true,
    keyframes: [{ id: 'a', time: 0, boneRotations: { tail: -Math.PI / 4 } }, { id: 'b', time: 1, boneRotations: { tail: 0 } }],
  }];
  const exported = createSpineSkeleton({ skeleton, bindSkeleton: skeleton, mesh, clips, width: 100, height: 80 });
  const imported = convertSpineRig(exported);
  assert.deepEqual(imported.skeleton.rootPos, skeleton.rootPos);
  assert.ok(Math.abs(imported.skeleton.bones[0].localAngle - Math.PI / 2) < 1e-8);
  assert.ok(Math.abs(imported.skeleton.bones[1].localAngle + Math.PI / 4) < 1e-8);
  assert.deepEqual(imported.mesh.vertices.map(v => [v.originalX, v.originalY]).sort((a, b) => a[0] - b[0]), [[20, 20], [40, 70], [70, 30]]);
  assert.deepEqual(imported.mesh.vertices.find(v => v.originalX === 40)!.weights.map(w => w.weight), [.4, .6]);
  assert.deepEqual(imported.mesh.triangles.map(i => i.map(n => imported.mesh.vertices[n].originalX)), [[20, 70, 40]]);
  assert.equal(imported.animations[0].keyframes.length, 2);
  assert.ok(Math.abs(imported.animations[0].keyframes[1].boneRotations.Tail) < 1e-8);
});

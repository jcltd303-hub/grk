import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { applyPartWeights, constrainAngle, rotationHandle } from './part-deform';
import { generateMesh } from './mesh';
import type { Skeleton } from './types';

test('painted ownership assigns exactly one bone to each mesh vertex', () => {
  const mesh = generateMesh(20, 20, 4, 4);
  const skeleton = { bones: [{ id: 'left' }, { id: 'right' }] } as Skeleton;
  const pixels = new Uint16Array(400);
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) pixels[y * 20 + x] = x < 10 ? 1 : 2;
  applyPartWeights(mesh, { width: 20, height: 20, boneIds: ['left', 'right'], pixels, revision: 1 }, skeleton);
  const middle = mesh.vertices.find(v => v.originalX === 10 && v.originalY === 10)!;
  assert.deepEqual(middle.weights, [{ boneId: 'right', weight: 1 }]);
  assert.ok(mesh.vertices.every(v => v.weights.length === 1 && v.weights[0].weight === 1));
});

test('angle bounds work independently and rotation handle follows joint direction', () => {
  assert.equal(constrainAngle(-2, { minAngle: -1 }), -1);
  assert.equal(constrainAngle(2, { maxAngle: 1 }), 1);
  const a = rotationHandle({ x: 10, y: 20, worldAngle: 0 });
  const b = rotationHandle({ x: 10, y: 20, worldAngle: Math.PI / 2 });
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 20);
});

test('transparent mesh vertices get one nearest bone without a prior weight pass', () => {
  const mesh=generateMesh(30,20,3,2);
  const skeleton={bones:[
    {id:'left',start:{x:2,y:10},end:{x:10,y:10}},
    {id:'right',start:{x:20,y:10},end:{x:28,y:10}},
  ]} as Skeleton;
  const pixels=new Uint16Array(600);
  applyPartWeights(mesh,{width:30,height:20,boneIds:['left','right'],pixels,revision:0},skeleton);
  const left=mesh.vertices.find(v=>v.originalX===0 && v.originalY===10)!;
  const right=mesh.vertices.find(v=>v.originalX===30 && v.originalY===10)!;
  assert.deepEqual(left.weights,[{boneId:'left',weight:1}]);
  assert.deepEqual(right.weights,[{boneId:'right',weight:1}]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRigScene } from './render-gl';
import type { RigMesh } from './types';

test('mesh renderer samples only the source area of a triangle', () => {
  const draws:unknown[][]=[];
  const ctx={canvas:{width:100,height:100},save(){},restore(){},clearRect(){},translate(){},scale(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},clip(){},transform(){},drawImage(...args:unknown[]){draws.push(args);}} as unknown as CanvasRenderingContext2D;
  const mesh:RigMesh={width:100,height:100,density:10,triangles:[[0,1,2]],vertices:[
    {x:10,y:10,originalX:10,originalY:10,u:.1,v:.1,weights:[]},
    {x:20,y:10,originalX:20,originalY:10,u:.2,v:.1,weights:[]},
    {x:10,y:20,originalX:10,originalY:20,u:.1,v:.2,weights:[]},
  ]};
  renderRigScene(ctx,{width:100,height:100} as HTMLCanvasElement,mesh,null,
    {mode:'pose',showTexture:true,showMesh:false,showBones:false,showWeights:false,selectedBoneId:null,
      hoveredBoneId:null,hoveredJoint:null,activeIKEffectorId:null,ikTargetPos:null,zoom:1,pan:{x:0,y:0}});
  assert.equal(draws.length,1);
  assert.equal(draws[0].length,9);
  assert.ok(Number(draws[0][3])<25);
});

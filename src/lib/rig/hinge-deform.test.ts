import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneSkeleton, updateWorldTransforms, computeBoneDeltaTransforms, deformMesh } from './skeleton';
import type { Skeleton, RigMesh } from './types';

test('child artwork bends outside its joint while pixels at the pivot follow the parent', () => {
  const skeleton:Skeleton={bones:[
    {id:'root',name:'Root',parentId:null,localAngle:0,length:20,color:'#fff',start:{x:0,y:0},end:{x:20,y:0},worldAngle:0,endWidth:12},
    {id:'child',name:'Child',parentId:'root',localAngle:0,length:20,color:'#fff',start:{x:20,y:0},end:{x:40,y:0},worldAngle:0,startWidth:12},
  ],rootId:'root',rootPos:{x:0,y:0},restRootPos:{x:0,y:0},restBones:{}};
  updateWorldTransforms(skeleton);
  const rest=cloneSkeleton(skeleton);
  skeleton.bones[1].localAngle=Math.PI/2;updateWorldTransforms(skeleton);
  const mesh:RigMesh={width:50,height:20,density:10,triangles:[],vertices:[20,22,40].map(x=>({x,y:0,originalX:x,originalY:0,u:x/50,v:0,weights:[{boneId:'child',weight:1}]}))};
  deformMesh(mesh,computeBoneDeltaTransforms(skeleton,rest),skeleton,rest);
  assert.ok(mesh.vertices[0].x>19.9 && Math.abs(mesh.vertices[0].y)<0.1);
  assert.ok(mesh.vertices[1].x>20 && mesh.vertices[1].y>0 && mesh.vertices[1].y<2);
  assert.ok(Math.abs(mesh.vertices[2].x-20)<0.1 && Math.abs(mesh.vertices[2].y-20)<0.1);
});

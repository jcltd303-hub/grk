import test from 'node:test';
import assert from 'node:assert/strict';
import { studioStore } from '../../store/studio';
import { generateMesh } from './mesh';
import { cloneSkeleton } from './skeleton';
import type { Skeleton } from './types';

test('a painted part survives automatic refresh and undo redo',()=>{
  const state=studioStore.getState();
  const old={skeleton:state.skeleton,restSkeleton:state.restSkeleton,mesh:state.mesh,alphaMask:state.alphaMask,partOwnership:state.partOwnership,mode:state.mode,selectedBoneId:state.selectedBoneId};
  const skel:Skeleton={bones:[
    {id:'a',name:'A',parentId:null,localAngle:0,length:10,color:'#f00',start:{x:2,y:5},end:{x:12,y:5},worldAngle:0},
    {id:'b',name:'B',parentId:'a',localAngle:0,length:10,color:'#0f0',start:{x:12,y:5},end:{x:22,y:5},worldAngle:0},
  ],rootId:'a',rootPos:{x:2,y:5},restRootPos:{x:2,y:5},restBones:{}};
  Object.assign(state,{skeleton:skel,restSkeleton:cloneSkeleton(skel),mesh:generateMesh(26,12,13,6),alphaMask:new Uint8Array(26*12).fill(255),partOwnership:null,mode:'rig',selectedBoneId:'a'});
  try{
    assert.equal(studioStore.beginPartStroke({x:19,y:5}),true);
    studioStore.paintPart({x:19,y:5}); studioStore.endPartStroke();
    const at=5*26+19;
    assert.equal(studioStore.getState().partOwnership!.boneIds[studioStore.getState().partOwnership!.pixels[at]-1],'a');
    studioStore.moveBoneJoint('b','end',{x:24,y:5});
    assert.equal(studioStore.getState().partOwnership!.boneIds[studioStore.getState().partOwnership!.pixels[at]-1],'a');
    studioStore.undo();
    assert.equal(studioStore.getState().partOwnership,null);
    studioStore.redo();
    assert.equal(studioStore.getState().partOwnership!.boneIds[studioStore.getState().partOwnership!.pixels[at]-1],'a');
  }finally{Object.assign(state,old);}
});

test('automatic rig uses one owner per vertex and exposes fitted widths on active bones', () => {
  const state=studioStore.getState();
  const old={skeleton:state.skeleton,restSkeleton:state.restSkeleton,mesh:state.mesh,alphaMask:state.alphaMask,partOwnership:state.partOwnership,mode:state.mode};
  const skel:Skeleton={bones:[
    {id:'a',name:'A',parentId:null,localAngle:0,length:10,color:'#f00',start:{x:2,y:6},end:{x:12,y:6},worldAngle:0},
    {id:'b',name:'B',parentId:'a',localAngle:0,length:10,color:'#0f0',start:{x:12,y:6},end:{x:22,y:6},worldAngle:0},
  ],rootId:'a',rootPos:{x:2,y:6},restRootPos:{x:2,y:6},restBones:{}};
  Object.assign(state,{skeleton:skel,restSkeleton:cloneSkeleton(skel),mesh:generateMesh(26,12,13,6),alphaMask:new Uint8Array(26*12).fill(255),partOwnership:null,mode:'rig'});
  try {
    studioStore.recomputeWeights();
    assert.ok(state.mesh!.vertices.every(v => v.weights.length === 1 && v.weights[0].weight === 1));
    assert.ok(state.skeleton!.bones.every(b => b.widthProfile?.length === 64));
  } finally {Object.assign(state,old);}
});

test('Auto Weights rebuilds all vertices root first and can be undone', () => {
  const state=studioStore.getState();
  const old={skeleton:state.skeleton,restSkeleton:state.restSkeleton,mesh:state.mesh,alphaMask:state.alphaMask,partOwnership:state.partOwnership,mode:state.mode};
  const root:Skeleton['bones'][number]={id:'root',name:'Root',parentId:null,localAngle:0,length:10,color:'#fff',start:{x:2,y:6},end:{x:12,y:6},worldAngle:0};
  const child:Skeleton['bones'][number]={...root,id:'child',name:'Child',parentId:'root',start:{x:12,y:6},end:{x:22,y:6}};
  const skel:Skeleton={bones:[child,root],rootId:'root',rootPos:{x:2,y:6},restRootPos:{x:2,y:6},restBones:{}};
  const mesh=generateMesh(26,12,13,6);
  Object.assign(state,{skeleton:skel,restSkeleton:cloneSkeleton(skel),mesh,alphaMask:new Uint8Array(26*12).fill(255),partOwnership:null,mode:'rig'});
  try {
    for(const v of mesh.vertices) v.weights=[{boneId:'child',weight:1}];
    studioStore.recomputeWeights();
    const rebuilt=state.mesh!.vertices.find(v=>v.originalX===2 && v.originalY===6)!;
    assert.deepEqual(rebuilt.weights,[{boneId:'root',weight:1}]);
    assert.ok(state.mesh!.vertices.some(v=>v.weights[0].boneId==='child'));
    studioStore.undo();
    assert.deepEqual(studioStore.getState().mesh!.vertices.find(v=>v.originalX===2 && v.originalY===6)!.weights,[{boneId:'child',weight:1}]);
  } finally {Object.assign(state,old);}
});

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

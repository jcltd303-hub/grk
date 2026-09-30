import test from 'node:test';
import assert from 'node:assert/strict';
import { studioStore } from '../../store/studio';
import { generateMesh } from './mesh';
import { cloneSkeleton } from './skeleton';
import type { Skeleton } from './types';

test('joint drag updates the preview cheaply and fits silhouette once at release', () => {
  const state=studioStore.getState();
  const previous={skeleton:state.skeleton,restSkeleton:state.restSkeleton,mesh:state.mesh,alphaMask:state.alphaMask,partOwnership:state.partOwnership,mode:state.mode};
  const skeleton:Skeleton={bones:[{id:'root',name:'Root',parentId:null,localAngle:0,length:20,color:'#fff',start:{x:5,y:20},end:{x:25,y:20},worldAngle:0,startWidth:8,endWidth:8}],rootId:'root',rootPos:{x:5,y:20},restRootPos:{x:5,y:20},restBones:{}};
  const alpha=new Uint8Array(40*40);for(let x=5;x<=35;x++)for(let y=12;y<=28;y++)alpha[y*40+x]=255;
  Object.assign(state,{skeleton,restSkeleton:cloneSkeleton(skeleton),mesh:generateMesh(40,40,8,8,alpha),alphaMask:alpha,partOwnership:null,mode:'rig'});
  try {
    studioStore.moveBoneJoint('root','end',{x:35,y:20},true);
    assert.equal(studioStore.getState().skeleton!.bones[0].endWidth,8);
    studioStore.finishJointDrag();
    assert.ok(studioStore.getState().skeleton!.bones[0].endWidth!>=16);
  } finally {Object.assign(studioStore.getState(),previous);}
});

test('rotation handle postpones envelope refit until release', () => {
  const state=studioStore.getState();
  const previous={skeleton:state.skeleton,restSkeleton:state.restSkeleton,mesh:state.mesh,alphaMask:state.alphaMask,partOwnership:state.partOwnership,mode:state.mode};
  const skeleton:Skeleton={bones:[{id:'root',name:'Root',parentId:null,localAngle:0,length:20,color:'#fff',start:{x:5,y:20},end:{x:25,y:20},worldAngle:0,startWidth:8,endWidth:8}],rootId:'root',rootPos:{x:5,y:20},restRootPos:{x:5,y:20},restBones:{}};
  const alpha=new Uint8Array(40*40);for(let x=5;x<=35;x++)for(let y=12;y<=28;y++)alpha[y*40+x]=255;
  Object.assign(state,{skeleton,restSkeleton:cloneSkeleton(skeleton),mesh:generateMesh(40,40,8,8,alpha),alphaMask:alpha,partOwnership:null,mode:'rig'});
  try {
    studioStore.setBoneAngle('root',Math.PI/6,true);
    assert.equal(studioStore.getState().skeleton!.bones[0].startWidth,8);
    studioStore.finishJointDrag();
    assert.ok(studioStore.getState().skeleton!.bones[0].startWidth!>8);
  } finally {Object.assign(studioStore.getState(),previous);}
});

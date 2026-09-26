import test from 'node:test';
import assert from 'node:assert/strict';
import { studioStore } from '../../store/studio';
import { generateMesh } from './mesh';
import { cloneSkeleton, updateWorldTransforms } from './skeleton';
import type { Skeleton } from './types';

test('slider width survives fitting, moving, and undo redo', () => {
  const state=studioStore.getState();
  const old={skeleton:state.skeleton,restSkeleton:state.restSkeleton,mesh:state.mesh,alphaMask:state.alphaMask,mode:state.mode};
  const skeleton:Skeleton={bones:[{id:'root',name:'Root',parentId:null,localAngle:0,length:30,color:'#fff',start:{x:10,y:20},end:{x:40,y:20},worldAngle:0,startWidth:20,endWidth:20}],rootId:'root',rootPos:{x:10,y:20},restRootPos:{x:10,y:20},restBones:{root:{localAngle:0,length:30}}};
  updateWorldTransforms(skeleton);
  Object.assign(state,{skeleton,restSkeleton:cloneSkeleton(skeleton),mesh:generateMesh(50,40,5,4),alphaMask:new Uint8Array(50*40).fill(255),mode:'rig'});
  try {
    studioStore.saveHistory();
    studioStore.setBoneStartWidth('root',84);
    studioStore.setBoneEndWidth('root',64);
    assert.equal(studioStore.getState().skeleton!.bones[0].startWidth,84);
    assert.equal(studioStore.getState().skeleton!.bones[0].endWidth,64);
    studioStore.undo();
    assert.equal(studioStore.getState().skeleton!.bones[0].startWidth,84);
    assert.equal(studioStore.getState().skeleton!.bones[0].manualEndWidth,undefined);
    studioStore.undo();
    assert.equal(studioStore.getState().skeleton!.bones[0].startWidth,20);
    studioStore.redo(); studioStore.redo();
    assert.equal(studioStore.getState().skeleton!.bones[0].startWidth,84);
    assert.equal(studioStore.getState().skeleton!.bones[0].endWidth,64);
    studioStore.moveBoneJoint('root','end',{x:42,y:20});
    assert.equal(studioStore.getState().skeleton!.bones[0].startWidth,84);
    assert.equal(studioStore.getState().skeleton!.bones[0].endWidth,64);
  } finally { Object.assign(state,old); }
});

test('resetting a manual width returns to shape fitting and can be undone', () => {
  const state=studioStore.getState();
  const old={skeleton:state.skeleton,restSkeleton:state.restSkeleton,mesh:state.mesh,alphaMask:state.alphaMask,mode:state.mode};
  const skeleton:Skeleton={bones:[{id:'root',name:'Root',parentId:null,localAngle:0,length:30,color:'#fff',start:{x:10,y:20},end:{x:40,y:20},worldAngle:0}],rootId:'root',rootPos:{x:10,y:20},restRootPos:{x:10,y:20},restBones:{}};
  Object.assign(state,{skeleton,restSkeleton:cloneSkeleton(skeleton),mesh:generateMesh(50,40,5,4),alphaMask:new Uint8Array(50*40).fill(255),mode:'rig'});
  try {
    studioStore.setBoneWidths('root',90,70);
    studioStore.resetBoneWidths('root');
    assert.equal(studioStore.getState().skeleton!.bones[0].manualStartWidth,false);
    assert.notEqual(studioStore.getState().skeleton!.bones[0].startWidth,90);
    studioStore.undo();
    assert.equal(studioStore.getState().skeleton!.bones[0].startWidth,90);
    assert.equal(studioStore.getState().skeleton!.bones[0].manualStartWidth,true);
  } finally { Object.assign(state,old); }
});

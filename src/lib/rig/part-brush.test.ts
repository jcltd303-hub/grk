import test from 'node:test';
import assert from 'node:assert/strict';
import { createPartOwnership, paintPartStroke, encodeOwnership, decodeOwnership } from './part-brush';
import type { Skeleton } from './types';

const skeleton:Skeleton={bones:[
  {id:'a',name:'A',parentId:null,localAngle:0,length:9,color:'#f00',start:{x:2,y:5},end:{x:11,y:5},worldAngle:0},
  {id:'b',name:'B',parentId:'a',localAngle:0,length:8,color:'#0f0',start:{x:11,y:5},end:{x:19,y:5},worldAngle:0},
],rootId:'a',rootPos:{x:2,y:5},restRootPos:{x:2,y:5},restBones:{}};

test('parts own only visible pixels and painting transfers ownership',()=>{
  const w=22,h=11,alpha=new Uint8Array(w*h).fill(255);alpha[0]=0;
  const ownership=createPartOwnership(skeleton,alpha,w,h);
  assert.equal(ownership.pixels[0],0);
  const at=5*w+15;assert.equal(ownership.boneIds[ownership.pixels[at]-1],'b');
  paintPartStroke(ownership,alpha,null,{x:15,y:5},4,'a','paint',false);
  assert.equal(ownership.boneIds[ownership.pixels[at]-1],'a');
  assert.equal(ownership.pixels[0],0);
  paintPartStroke(ownership,alpha,null,{x:15,y:5},2,'a','erase',false);
  assert.equal(ownership.pixels[at],0);
});

test('smart brush follows a color boundary inside its radius',()=>{
  const w=22,h=11,alpha=new Uint8Array(w*h).fill(255),rgba=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=4*(y*w+x);rgba[i]=x<11?220:20;rgba[i+1]=30;rgba[i+2]=20;rgba[i+3]=255;
  }
  const ownership=createPartOwnership(skeleton,alpha,w,h);
  paintPartStroke(ownership,alpha,rgba,{x:9,y:5},8,'a','paint',true);
  assert.equal(ownership.boneIds[ownership.pixels[5*w+10]-1],'a');
  assert.equal(ownership.boneIds[ownership.pixels[5*w+14]-1],'b');
});

test('ownership round trips without losing hand painted pixels',()=>{
  const alpha=new Uint8Array(22*11).fill(255),ownership=createPartOwnership(skeleton,alpha,22,11);
  paintPartStroke(ownership,alpha,null,{x:15,y:5},3,'a','paint',false);
  const copy=decodeOwnership(encodeOwnership(ownership));
  assert.deepEqual(copy.boneIds,ownership.boneIds);
  assert.deepEqual(copy.pixels,ownership.pixels);
});

test('part ownership rejects corrupt serialized runs',()=>{
  assert.throws(()=>decodeOwnership({width:4,height:4,boneIds:['a'],runs:[1,15]}));
  assert.throws(()=>decodeOwnership({width:4,height:4,boneIds:['a'],runs:[2,16]}));
});

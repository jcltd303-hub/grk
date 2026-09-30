import test from 'node:test';
import assert from 'node:assert/strict';
import { fitEnvelopesToAlpha } from './envelope';
import { updateWorldTransforms } from './skeleton';
import type { Skeleton } from './types';

test('automatic envelope covers every visible pixel including a sparse protrusion', () => {
  const width = 100, height = 80;
  const alpha = new Uint8Array(width * height);
  for (let y = 34; y <= 46; y++) for (let x = 15; x <= 85; x++) alpha[y * width + x] = 255;
  alpha[2 * width + 80] = 255;
  const skeleton: Skeleton = {
    bones: [{ id: 'body', name: 'Body', parentId: null, localAngle: 0, length: 70,
      color: '#fff', start: { x: 15, y: 40 }, end: { x: 85, y: 40 },
      worldAngle: 0, startWidth: 12, endWidth: 12 }],
    rootId: 'body', rootPos: { x: 15, y: 40 }, restRootPos: { x: 15, y: 40 },
    restBones: { body: { localAngle: 0, length: 70 } },
  };
  updateWorldTransforms(skeleton);
  fitEnvelopesToAlpha(skeleton, alpha, width, height);
  const bone = skeleton.bones[0];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (alpha[y * width + x] < 20) continue;
    const t = Math.max(0, Math.min(1, (x - bone.start.x) / bone.length));
    const distance = Math.hypot(x - (bone.start.x + t * bone.length), y - bone.start.y);
    const radius = bone.widthProfile![Math.min(bone.widthProfile!.length-1,Math.floor(t*bone.widthProfile!.length))] / 2;
    assert.ok(distance <= radius, `uncovered pixel ${x},${y}`);
  }
});

test('terminal bone at an image edge is inset and its rest length follows', () => {
  const width = 100, height = 80;
  const alpha = new Uint8Array(width * height);
  for (let y = 30; y <= 50; y++) for (let x = 10; x <= 90; x++) alpha[y * width + x] = 255;
  const skeleton: Skeleton = {
    bones: [{ id: 'tip', name: 'Tip', parentId: null, localAngle: 0, length: 80,
      color: '#fff', start: { x: 10, y: 40 }, end: { x: 90, y: 40 },
      worldAngle: 0, startWidth: 20, endWidth: 20 }],
    rootId: 'tip', rootPos: { x: 10, y: 40 }, restRootPos: { x: 10, y: 40 },
    restBones: { tip: { localAngle: 0, length: 80 } },
  };
  updateWorldTransforms(skeleton);
  fitEnvelopesToAlpha(skeleton, alpha, width, height, true);
  assert.ok(skeleton.bones[0].end.x < 90);
  assert.equal(skeleton.restBones.tip.length, skeleton.bones[0].length);
});

test('a tapered silhouette fits a tapered bone rather than expanding both ends to its widest point', () => {
  const width = 120, height = 100;
  const alpha = new Uint8Array(width * height);
  for (let x = 10; x <= 110; x++) {
    const radius = 19 - 15 * (x - 10) / 100;
    for (let y = 0; y < height; y++) if (Math.abs(y - 50) <= radius) alpha[y * width + x] = 255;
  }
  const skeleton: Skeleton = {
    bones: [{ id: 'body', name: 'Body', parentId: null, localAngle: 0, length: 100, color: '#fff',
      start: { x: 10, y: 50 }, end: { x: 110, y: 50 }, worldAngle: 0,
      startWidth: 200, endWidth: 200 }],
    rootId: 'body', rootPos: { x: 10, y: 50 }, restRootPos: { x: 10, y: 50 }, restBones: {},
  };
  fitEnvelopesToAlpha(skeleton, alpha, width, height);
  const bone = skeleton.bones[0];
  assert.ok(bone.startWidth! > 35 && bone.startWidth! < 48);
  assert.ok(bone.endWidth! < 17, `end width ${bone.endWidth}`);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (alpha[y * width + x] < 20) continue;
    const t = Math.max(0, Math.min(1, (x - 10) / 100));
    const radius = (bone.startWidth! * (1 - t) + bone.endWidth! * t) / 2;
    assert.ok(Math.abs(y - 50) <= radius + 1e-6, `uncovered pixel ${x},${y}`);
  }
});

test('connected bones cover the silhouette without widening across the full character', () => {
  const width = 120, height = 80;
  const alpha = new Uint8Array(width * height);
  for (let y = 30; y <= 50; y++) for (let x = 10; x <= 110; x++) alpha[y * width + x] = 255;
  const bones: Skeleton['bones'] = [
    { id: 'root', name: 'Root', parentId: null, localAngle: 0, length: 50, color: '#fff',
      start: { x: 10, y: 40 }, end: { x: 60, y: 40 }, worldAngle: 0 },
    { id: 'child', name: 'Child', parentId: 'root', localAngle: 0, length: 50, color: '#fff',
      start: { x: 60, y: 40 }, end: { x: 110, y: 40 }, worldAngle: 0 },
  ];
  const skeleton: Skeleton = { bones, rootId: 'root', rootPos: { x: 10, y: 40 },
    restRootPos: { x: 10, y: 40 }, restBones: {} };
  fitEnvelopesToAlpha(skeleton, alpha, width, height);
  assert.ok(bones.every(b => b.startWidth! < 25 && b.endWidth! < 25));
  for (let y = 30; y <= 50; y++) for (let x = 10; x <= 110; x++) {
    assert.ok(bones.some(b => {
      const t = Math.max(0, Math.min(1, (x - b.start.x) / b.length));
      return Math.hypot(x - (b.start.x + b.length * t), y - b.start.y)
        <= b.widthProfile![Math.min(b.widthProfile!.length-1, Math.floor(t*b.widthProfile!.length))] / 2;
    }), `uncovered ${x},${y}`);
  }
});

test('a bone assigned no visible pixels does not retain an oversized provisional width', () => {
  const alpha = new Uint8Array(40 * 40);
  for (let x = 5; x <= 35; x++) alpha[20 * 40 + x] = 255;
  const bones: Skeleton['bones'] = ['first', 'duplicate'].map((id, i) => ({
    id, name: id, parentId: i ? 'first' : null, localAngle: 0, length: 30,
    color: '#fff', start: { x: 5, y: 20 }, end: { x: 35, y: 20 },
    worldAngle: 0, startWidth: 100, endWidth: 100,
  }));
  fitEnvelopesToAlpha({ bones, rootId: 'first', rootPos: { x: 5, y: 20 },
    restRootPos: { x: 5, y: 20 }, restBones: {} }, alpha, 40, 40);
  assert.equal(bones[1].startWidth, 2);
  assert.equal(bones[1].endWidth, 2);
});

test('recomputing envelopes after moving a bone covers the complete silhouette', () => {
  const width=80, height=70, alpha=new Uint8Array(width*height);
  for(let y=10;y<60;y++) for(let x=28;x<52;x++) alpha[y*width+x]=255;
  const bones: Skeleton['bones']=[
    {id:'root',name:'Root',parentId:null,localAngle:Math.PI/2,length:25,color:'#fff',start:{x:40,y:10},end:{x:40,y:35},worldAngle:Math.PI/2},
    {id:'child',name:'Child',parentId:'root',localAngle:0,length:25,color:'#fff',start:{x:40,y:35},end:{x:40,y:60},worldAngle:Math.PI/2},
  ];
  const skeleton:Skeleton={bones,rootId:'root',rootPos:{x:40,y:10},restRootPos:{x:40,y:10},restBones:{}};
  fitEnvelopesToAlpha(skeleton,alpha,width,height);
  skeleton.rootPos={x:36,y:10}; updateWorldTransforms(skeleton);
  fitEnvelopesToAlpha(skeleton,alpha,width,height);
  for(let y=10;y<60;y++) for(let x=28;x<52;x++) assert.ok(bones.some(b=>{
    const dx=b.end.x-b.start.x,dy=b.end.y-b.start.y;
    const t=Math.max(0,Math.min(1,((x-b.start.x)*dx+(y-b.start.y)*dy)/(dx*dx+dy*dy)));
    return Math.hypot(x-b.start.x-t*dx,y-b.start.y-t*dy)<=b.widthProfile![Math.min(b.widthProfile!.length-1,Math.floor(t*b.widthProfile!.length))]/2+0.01;
  }),`uncovered ${x},${y}`);
});

test('width fitting is root first regardless of stored bone order', () => {
  const alpha=new Uint8Array(50*50);
  for(let y=19;y<=31;y++) for(let x=5;x<=45;x++) alpha[y*50+x]=255;
  const make=():Skeleton=>({bones:[
    {id:'root',name:'Root',parentId:null,localAngle:0,length:25,color:'#fff',start:{x:5,y:25},end:{x:30,y:25},worldAngle:0},
    {id:'child',name:'Child',parentId:'root',localAngle:0,length:25,color:'#fff',start:{x:5,y:25},end:{x:30,y:25},worldAngle:0},
  ],rootId:'root',rootPos:{x:5,y:25},restRootPos:{x:5,y:25},restBones:{}});
  const a=make(), b=make(); b.bones.reverse();
  fitEnvelopesToAlpha(a,alpha,50,50); fitEnvelopesToAlpha(b,alpha,50,50);
  for(const bone of a.bones){const other=b.bones.find(v=>v.id===bone.id)!;
    assert.equal(bone.startWidth,other.startWidth);assert.equal(bone.endWidth,other.endWidth);
  }
});

test('local envelope stays narrow away from a protrusion while covering every pixel', () => {
  const width=100,height=80,alpha=new Uint8Array(width*height);
  for(let x=10;x<=90;x++) for(let y=35;y<=45;y++) alpha[y*width+x]=255;
  for(let y=20;y<35;y++) alpha[y*width+50]=255;
  const bone:Skeleton['bones'][number]={id:'root',name:'Root',parentId:null,localAngle:0,length:80,
    color:'#fff',start:{x:10,y:40},end:{x:90,y:40},worldAngle:0};
  const skeleton:Skeleton={bones:[bone],rootId:'root',rootPos:{x:10,y:40},restRootPos:{x:10,y:40},restBones:{}};
  fitEnvelopesToAlpha(skeleton,alpha,width,height);
  assert.ok(bone.widthProfile && bone.widthProfile.length >= 16);
  assert.ok(bone.widthProfile[2] < 15, `unnecessarily wide near start: ${bone.widthProfile[2]}`);
  assert.ok(Math.max(...bone.widthProfile) >= 40);
});

test('connected bone envelopes share a joint width without transferring pixel ownership', () => {
  const width=80,height=60,alpha=new Uint8Array(width*height);
  for(let x=5;x<70;x++) {
    const radius=x<40?12:5;
    for(let y=30-radius;y<=30+radius;y++) alpha[y*width+x]=255;
  }
  const root:Skeleton['bones'][number]={id:'root',name:'Root',parentId:null,localAngle:0,length:35,color:'#fff',start:{x:5,y:30},end:{x:40,y:30},worldAngle:0};
  const child:Skeleton['bones'][number]={id:'child',name:'Child',parentId:'root',localAngle:0,length:30,color:'#fff',start:{x:40,y:30},end:{x:70,y:30},worldAngle:0};
  const skel:Skeleton={bones:[root,child],rootId:'root',rootPos:{x:5,y:30},restRootPos:{x:5,y:30},restBones:{}};
  fitEnvelopesToAlpha(skel,alpha,width,height);
  assert.equal(root.endWidth,child.startWidth);
  assert.ok(root.endWidth! >= 20);
});

test('painted ownership guides fitted widths for that part', () => {
  const width=50,height=40,alpha=new Uint8Array(width*height);
  for(let y=8;y<=32;y++) for(let x=10;x<=40;x++) alpha[y*width+x]=255;
  const upper:Skeleton['bones'][number]={id:'upper',name:'Upper',parentId:null,localAngle:0,length:30,color:'#fff',start:{x:10,y:12},end:{x:40,y:12},worldAngle:0};
  const lower:Skeleton['bones'][number]={id:'lower',name:'Lower',parentId:'upper',localAngle:0,length:30,color:'#fff',start:{x:10,y:28},end:{x:40,y:28},worldAngle:0};
  const skel:Skeleton={bones:[upper,lower],rootId:'upper',rootPos:{x:10,y:12},restRootPos:{x:10,y:12},restBones:{}};
  const mask={width,height,boneIds:['upper','lower'],pixels:new Uint16Array(width*height),revision:1};
  for(let y=8;y<=32;y++) for(let x=10;x<=40;x++) mask.pixels[y*width+x]=1;
  fitEnvelopesToAlpha(skel,alpha,width,height,false,mask);
  assert.ok(upper.widthProfile![32] >= 40);
  assert.ok(lower.widthProfile![32] <= 2);
});

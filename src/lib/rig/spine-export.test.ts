import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { AnimationClip, RigMesh, Skeleton } from './types';
import { createSpineAtlas, createSpineSkeleton, createSpinePartSkeleton } from './spine-export';
import { zipFiles } from './spine-package';
import { generateMesh, computeAutoWeights } from './mesh';

const skeleton: Skeleton = {
  rootId: 'root', rootPos: { x: 50, y: 50 }, restRootPos: { x: 50, y: 50 },
  restBones: { root: { localAngle: 0, length: 20 },
    arm: { localAngle: Math.PI / 2, length: 10 } },
  bones: [
    { id: 'arm', name: 'arm', parentId: 'root', localAngle: 0, length: 10,
      color: '#fff', start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, worldAngle: 0 },
    { id: 'root', name: 'root', parentId: null, localAngle: 0, length: 20,
      color: '#fff', start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, worldAngle: 0 },
  ],
};
const mesh: RigMesh = {
  width: 100, height: 100, density: 1, triangles: [[0, 1, 2]],
  vertices: [
    { x: 50, y: 50, originalX: 50, originalY: 50, u: 0.5, v: 0.5,
      weights: [{ boneId: 'root', weight: 0.25 }, { boneId: 'arm', weight: 0.75 }] },
    { x: 70, y: 50, originalX: 70, originalY: 50, u: 0.7, v: 0.5,
      weights: [{ boneId: 'arm', weight: 1 }] },
    { x: 50, y: 70, originalX: 50, originalY: 70, u: 0.5, v: 0.7,
      weights: [{ boneId: 'root', weight: 1 }] },
  ],
};
const clips: AnimationClip[] = [{
  id: 'walk', name: 'wave', duration: 1, fps: 30, loop: true,
  keyframes: [{ id: 'one', time: 0.5, boneRotations: { arm: Math.PI } }],
}];

test('exports rest pose with parent-first bones, weighted mesh and relative animation', () => {
  const output = createSpineSkeleton({ skeleton, mesh, clips, width: 100, height: 100 });
  assert.deepEqual(output.bones.map(b => b.name), ['root', 'arm']);
  assert.equal(output.bones[1].rotation, -90);
  assert.equal(output.bones[1].x, 20);
  const attachment = output.skins[0].attachments.artwork.artwork;
  assert.equal(attachment.hull, 3);
  assert.equal(attachment.uvs.length, 6);
  assert.equal(attachment.vertices.length, 3 + 4 * 4);
  assert.deepEqual(output.animations.wave, { bones: { arm: { rotate: [{ time: 0.5, value: -90 }] } } });
  assert.match(createSpineAtlas(100, 100), /artwork.png[\s\S]*artwork\nbounds: 0,0,100,100/);
});

test('exports the edited bind skeleton rather than stale rest snapshots', () => {
  const edited: Skeleton = {
    ...skeleton, rootPos: { x: 60, y: 40 },
    bones: skeleton.bones.map(b => b.id === 'root' ? { ...b, localAngle: Math.PI / 4, length: 30 } : b),
  };
  const output = createSpineSkeleton({ skeleton, bindSkeleton: edited, mesh, clips: [], width: 100, height: 100 });
  assert.equal(output.bones[0].x, 10);
  assert.ok('y' in output.bones[0]);
  assert.equal(output.bones[0].y, 10);
  assert.equal(output.bones[0].rotation, -45);
  assert.equal(output.bones[0].length, 30);
  assert.equal(output.bones[1].x, 30);
});

test('weighted vertex uses inverse bone rotation and reconstructs its image position', () => {
  const turned: Skeleton = {
    ...skeleton, rootPos: { x: 50, y: 50 },
    bones: [{ ...skeleton.bones[1], localAngle: Math.PI / 2, length: 20 }],
  };
  const single: RigMesh = { ...mesh, vertices: mesh.vertices.map(v => ({ ...v, weights: [{ boneId: 'root', weight: 1 }] })) };
  const output = createSpineSkeleton({ skeleton: turned, bindSkeleton: turned, mesh: single, clips: [], width: 100, height: 100 });
  const attachment = output.skins[0].attachments.artwork.artwork;
  // Vertex (70,50) is 20 right of the root. Its Spine local offset is (0,20)
  // because the root rotates clockwise in Spine coordinates.
  const vertex = attachment.vertices.slice(5, 10);
  assert.ok(Math.abs(vertex[2]) < 1e-8);
  assert.ok(Math.abs(vertex[3] - 20) < 1e-8);
});

test('rejects invalid hierarchy and mesh indexes', () => {
  assert.throws(() => createSpineSkeleton({
    skeleton: { ...skeleton, bones: skeleton.bones.map(b => ({ ...b, parentId: b.id === 'root' ? 'arm' : 'root' })) },
    mesh, clips, width: 100, height: 100,
  }), /cycle/);
  assert.throws(() => createSpineSkeleton({ skeleton, mesh: { ...mesh, triangles: [[0, 1, 99]] },
    clips, width: 100, height: 100 }), /triangle/);
});

test('ZIP stores atlas and JSON with readable entries', async () => {
  const bytes = new Uint8Array(await zipFiles([
    { name: 'rig.atlas', data: new TextEncoder().encode('artwork.png') },
    { name: 'rig.json', data: new TextEncoder().encode('{}') },
  ]).arrayBuffer());
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50);
  assert.equal(new DataView(bytes.buffer).getUint32(bytes.length - 22, true), 0x06054b50);
  assert.equal(new TextDecoder().decode(bytes).includes('rig.atlas'), true);
});

test('painted parts export as separate attachments on their owning bones', () => {
  const skeleton:Skeleton={bones:[
    {id:'root',name:'Root',parentId:null,localAngle:0,length:10,color:'#fff',start:{x:5,y:10},end:{x:15,y:10},worldAngle:0},
    {id:'arm',name:'Arm',parentId:'root',localAngle:0,length:10,color:'#fff',start:{x:15,y:10},end:{x:25,y:10},worldAngle:0},
  ],rootId:'root',rootPos:{x:5,y:10},restRootPos:{x:5,y:10},restBones:{}};
  const mesh=generateMesh(30,20,3,2);
  computeAutoWeights(mesh,skeleton);
  const output=createSpinePartSkeleton({skeleton,mesh,clips:[],width:30,height:20},[
    {boneId:'root',name:'part_0',x:2,y:2,width:12,height:15},
    {boneId:'arm',name:'part_1',x:16,y:2,width:12,height:15},
  ]);
  assert.equal(output.slots.length,2);
  assert.equal(output.slots[0].bone,'Root');
  assert.equal(output.slots[1].bone,'Arm');
  assert.equal(output.skins[0].attachments.part_1.part_1.width,12);
});

test('Spine package bakes exclusive painted alpha into one PNG per bone', async()=>{
  const image={width:4,height:2,naturalWidth:4,naturalHeight:2} as HTMLImageElement;
  const previous=globalThis.document;
  globalThis.document={createElement:()=>{
    const canvas:{width:number;height:number;pixels?:Uint8ClampedArray;getContext:()=>unknown;toBlob:(callback:(blob:Blob)=>void)=>void}={
      width:0,height:0,
      getContext:()=>({drawImage:()=>{},getImageData:()=>({data:new Uint8ClampedArray(canvas.width*canvas.height*4).fill(255)}),putImageData:(data:{data:Uint8ClampedArray})=>{canvas.pixels=data.data;}}),
      toBlob:(callback)=>callback(new Blob([Uint8Array.from(canvas.pixels!) as BlobPart]))
    };return canvas;
  }} as unknown as Document;
  try{
    const skel:Skeleton={bones:[
      {id:'a',name:'A',parentId:null,localAngle:0,length:2,color:'#fff',start:{x:0,y:1},end:{x:2,y:1},worldAngle:0},
      {id:'b',name:'B',parentId:'a',localAngle:0,length:2,color:'#fff',start:{x:2,y:1},end:{x:4,y:1},worldAngle:0},
    ],rootId:'a',rootPos:{x:0,y:1},restRootPos:{x:0,y:1},restBones:{}};
    const mesh=generateMesh(4,2,2,1);computeAutoWeights(mesh,skel);
    const ownership={width:4,height:2,boneIds:['a','b'],pixels:new Uint16Array([1,2,1,2,1,2,1,2]),revision:0};
    const {unzipSync}=await import('fflate');
    const {createSpinePackage}=await import('./spine-package');
    const zip=unzipSync(new Uint8Array(await (await createSpinePackage({skeleton:skel,mesh,clips:[],image,partOwnership:ownership})).arrayBuffer()));
    assert.ok(zip['part_0.png']&&zip['part_1.png']);
    assert.equal(JSON.parse(new TextDecoder().decode(zip['rig.json'])).slots.length,2);
    assert.equal(zip['part_0.png'][3],255);
    assert.equal(zip['part_0.png'][7],0);
    assert.equal(zip['part_1.png'][3],255);
    assert.equal(zip['part_1.png'][7],0);
  }finally{globalThis.document=previous;}
});

import type { Point2D, Skeleton } from './types';

export interface PartOwnership {
  width: number;
  height: number;
  boneIds: string[];
  pixels: Uint16Array; // 0 means unclaimed; index + 1 owns a visible pixel.
  revision: number;
}
export interface SerializedPartOwnership {
  width: number;
  height: number;
  boneIds: string[];
  runs: number[]; // consecutive [owner, count] pairs
}

export function createPartOwnership(skeleton: Skeleton, alpha: Uint8Array, width: number, height: number): PartOwnership {
  if (alpha.length !== width * height || skeleton.bones.length > 65534) throw new Error('Invalid artwork or bone count.');
  const pixels = new Uint16Array(alpha.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = y * width + x;
    if (alpha[at] < 20) continue;
    let best = Infinity;
    for (let i = 0; i < skeleton.bones.length; i++) {
      const b = skeleton.bones[i], dx = b.end.x - b.start.x, dy = b.end.y - b.start.y;
      const t = Math.max(0, Math.min(1, ((x-b.start.x)*dx+(y-b.start.y)*dy)/Math.max(1e-8,dx*dx+dy*dy)));
      const d = Math.hypot(x-b.start.x-t*dx,y-b.start.y-t*dy);
      if (d < best) { best = d; pixels[at] = i + 1; }
    }
  }
  return { width, height, boneIds: skeleton.bones.map(b => b.id), pixels, revision: 0 };
}

export function paintPartStroke(
  ownership: PartOwnership, alpha: Uint8Array, rgba: Uint8ClampedArray | null,
  point: Point2D, radius: number, boneId: string, action: 'paint' | 'erase', smart: boolean
): boolean {
  const { width, height, pixels } = ownership;
  const owner = ownership.boneIds.indexOf(boneId) + 1;
  if (!owner || alpha.length !== pixels.length || (smart && rgba?.length !== pixels.length * 4)) return false;
  const cx = Math.round(point.x), cy = Math.round(point.y);
  const r = Math.max(1, Math.min(300, radius)), r2 = r*r;
  const inside = (x:number,y:number) => x>=0 && y>=0 && x<width && y<height && (x-cx)**2+(y-cy)**2<=r2;
  if (!inside(cx,cy) || alpha[cy*width+cx]<20) return false;
  const value = action === 'erase' ? 0 : owner;
  let changed = false;
  const apply=(at:number)=>{if(pixels[at]!==value){pixels[at]=value;changed=true;}};
  if (smart && rgba) {
    const seed=(cy*width+cx)*4;
    const left=Math.max(0,Math.floor(cx-r)),right=Math.min(width-1,Math.ceil(cx+r));
    const top=Math.max(0,Math.floor(cy-r)),bottom=Math.min(height-1,Math.ceil(cy+r));
    const localWidth=right-left+1;
    const visited = new Uint8Array(localWidth*(bottom-top+1)), queue = new Int32Array(visited.length);
    const local=(x:number,y:number)=>(y-top)*localWidth+x-left;
    let head=0,tail=0; queue[tail++]=cy*width+cx; visited[local(cx,cy)]=1;
    while(head<tail){
      const at=queue[head++],x=at%width,y=(at/width)|0;
      const offset=at*4;
      const delta=Math.hypot(rgba[offset]-rgba[seed],rgba[offset+1]-rgba[seed+1],rgba[offset+2]-rgba[seed+2]);
      if(delta>58 || alpha[at]<20) continue;
      apply(at);
      for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
        if(!inside(nx,ny))continue;
        const next=ny*width+nx;
        const index=local(nx,ny);
        if(!visited[index]){visited[index]=1;queue[tail++]=next;}
      }
    }
  } else {
    for(let y=Math.max(0,Math.floor(cy-r));y<=Math.min(height-1,Math.ceil(cy+r));y++)
      for(let x=Math.max(0,Math.floor(cx-r));x<=Math.min(width-1,Math.ceil(cx+r));x++)
        if(inside(x,y) && alpha[y*width+x]>=20)apply(y*width+x);
  }
  if(changed) ownership.revision++;
  return changed;
}

export function encodeOwnership(mask: PartOwnership): SerializedPartOwnership {
  const runs:number[]=[];
  for(let i=0;i<mask.pixels.length;){
    const value=mask.pixels[i];let count=1;
    while(i+count<mask.pixels.length && mask.pixels[i+count]===value)count++;
    runs.push(value,count);i+=count;
  }
  return {width:mask.width,height:mask.height,boneIds:[...mask.boneIds],runs};
}
export function decodeOwnership(data: SerializedPartOwnership): PartOwnership {
  if(!Number.isSafeInteger(data.width)||!Number.isSafeInteger(data.height)||data.width<1||data.height<1
    || data.width*data.height>40_000_000||!Array.isArray(data.boneIds)||data.boneIds.length>65534
    ||!Array.isArray(data.runs)||data.runs.length%2)throw new Error('Invalid part mask.');
  const pixels=new Uint16Array(data.width*data.height);let index=0;
  for(let i=0;i<data.runs.length;i+=2){
    const value=data.runs[i],count=data.runs[i+1];
    if(!Number.isInteger(value)||value<0||value>data.boneIds.length||!Number.isInteger(count)||count<=0||index+count>pixels.length)throw new Error('Invalid part mask runs.');
    pixels.fill(value,index,index+count);index+=count;
  }
  if(index!==pixels.length)throw new Error('Incomplete part mask.');
  return {width:data.width,height:data.height,boneIds:[...data.boneIds],pixels,revision:0};
}

export interface PartBounds { boneId:string; name:string; x:number; y:number; width:number; height:number }
export function getPartBounds(mask:PartOwnership): PartBounds[] {
  const bounds=mask.boneIds.map((boneId,k)=>({boneId,name:`part_${k}`,x:mask.width,y:mask.height,right:-1,bottom:-1}));
  for(let i=0;i<mask.pixels.length;i++){
    const b=bounds[mask.pixels[i]-1];if(!b)continue;
    const x=i%mask.width,y=(i/mask.width)|0;
    b.x=Math.min(b.x,x);b.y=Math.min(b.y,y);
    b.right=Math.max(b.right,x);b.bottom=Math.max(b.bottom,y);
  }
  return bounds.filter(b=>b.right>=b.x).map(b=>({boneId:b.boneId,name:b.name,x:b.x,y:b.y,width:b.right-b.x+1,height:b.bottom-b.y+1}));
}

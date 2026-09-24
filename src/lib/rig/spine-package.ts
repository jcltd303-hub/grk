import type { AnimationClip, RigMesh, Skeleton } from './types';
import { createSpineAtlas, createSpineSkeleton } from './spine-export';

const encoder = new TextEncoder();
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Small uncompressed ZIP writer for the three generated files. */
export function zipFiles(files: { name: string; data: Uint8Array }[]): Blob {
  const chunks: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  const u16 = (view: DataView, at: number, value: number) => view.setUint16(at, value, true);
  const u32 = (view: DataView, at: number, value: number) => view.setUint32(at, value, true);
  for (const { name, data } of files) {
    const filename = encoder.encode(name);
    const crc = crc32(data);
    const header = new Uint8Array(30 + filename.length);
    const local = new DataView(header.buffer);
    u32(local, 0, 0x04034b50); u16(local, 4, 20); u16(local, 6, 0x800);
    u32(local, 14, crc); u32(local, 18, data.length); u32(local, 22, data.length);
    u16(local, 26, filename.length); header.set(filename, 30);
    chunks.push(header, data);
    const entry = new Uint8Array(46 + filename.length);
    const central = new DataView(entry.buffer);
    u32(central, 0, 0x02014b50); u16(central, 4, 20); u16(central, 6, 20);
    u16(central, 8, 0x800); u32(central, 16, crc);
    u32(central, 20, data.length); u32(central, 24, data.length);
    u16(central, 28, filename.length); u32(central, 42, offset);
    entry.set(filename, 46);
    directory.push(entry);
    offset += header.length + data.length;
  }
  const directorySize = directory.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const trailer = new DataView(end.buffer);
  u32(trailer, 0, 0x06054b50); u16(trailer, 8, files.length); u16(trailer, 10, files.length);
  u32(trailer, 12, directorySize); u32(trailer, 16, offset);
  return new Blob([...chunks, ...directory, end] as BlobPart[], { type: 'application/zip' });
}

export async function createSpinePackage(input: {
  skeleton: Skeleton;
  mesh: RigMesh;
  clips: AnimationClip[];
  image: HTMLImageElement;
}): Promise<Blob> {
  const width = input.image.naturalWidth || input.image.width;
  const height = input.image.naturalHeight || input.image.height;
  const json = createSpineSkeleton({ ...input, width, height });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create the artwork canvas.');
  context.drawImage(input.image, 0, 0, width, height);
  const png = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode artwork PNG.')), 'image/png')
  );
  return zipFiles([
    { name: 'rig.json', data: encoder.encode(JSON.stringify(json, null, 2)) },
    { name: 'rig.atlas', data: encoder.encode(createSpineAtlas(width, height)) },
    { name: 'artwork.png', data: new Uint8Array(await png.arrayBuffer()) },
  ]);
}

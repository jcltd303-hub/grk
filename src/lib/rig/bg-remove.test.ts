import test from 'node:test';
import assert from 'node:assert/strict';
import { removeBackgroundPixels } from './bg-remove';

test('background removal preserves enclosed subject colors matching the border', () => {
  const w = 9, h = 9, rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { rgba[4*i] = 255; rgba[4*i+1] = 255; rgba[4*i+2] = 255; rgba[4*i+3] = 255; }
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) { const i = 4*(y*w+x); rgba[i] = rgba[i+1] = rgba[i+2] = 0; }
  rgba[4*(4*w+4)] = rgba[4*(4*w+4)+1] = rgba[4*(4*w+4)+2] = 255;
  const mask = removeBackgroundPixels(rgba,w,h,30,2);
  assert.equal(mask[4*w+4],255);
  assert.equal(mask[0],0);
});

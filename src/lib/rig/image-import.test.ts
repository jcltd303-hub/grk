import test from 'node:test';
import assert from 'node:assert/strict';
import { studioStore } from '../../store/studio';

test('new artwork previews inferred bones and can keep or scrap them', async () => {
  const width = 120, height = 120;
  const previousImage = globalThis.Image;
  const previousDocument = globalThis.document;
  class TestImage {
    width = width;
    height = height;
    naturalWidth = width;
    naturalHeight = height;
    crossOrigin = '';
    onload: (() => void) | null = null;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  }
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 15; y < 105; y++) for (let x = 30; x < 90; x++) pixels[(y * width + x) * 4 + 3] = 255;
  globalThis.Image = TestImage as unknown as typeof Image;
  globalThis.document = {
    createElement: () => ({
      width, height,
      getContext: () => ({ drawImage: () => {}, getImageData: () => ({ data: pixels }) }),
    }),
  } as unknown as Document;
  try {
    studioStore.loadCustomImage('data:image/png;base64,test');
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.ok((studioStore.getState().skeleton?.bones.length ?? 0) > 0);
    assert.equal(studioStore.getState().pendingSkeletonReview, true);
    assert.equal(studioStore.getState().showBones, true);

    studioStore.keepSuggestedSkeleton();
    assert.equal(studioStore.getState().pendingSkeletonReview, false);
    assert.ok((studioStore.getState().skeleton?.bones.length ?? 0) > 0);

    studioStore.loadCustomImage('data:image/png;base64,test2');
    await new Promise<void>((resolve) => setImmediate(resolve));
    studioStore.scrapSuggestedSkeleton();
    assert.equal(studioStore.getState().pendingSkeletonReview, false);
    assert.equal(studioStore.getState().skeleton?.bones.length, 0);
    assert.equal(studioStore.getState().tool, 'add_bone');
    assert.ok(studioStore.getState().mesh?.vertices.every((v) => v.weights.length === 0));
  } finally {
    globalThis.Image = previousImage;
    globalThis.document = previousDocument;
  }
});

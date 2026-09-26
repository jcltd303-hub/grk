/**
 * Removes background color from an HTMLImageElement and returns a canvas with transparent cutout.
 * @param img The source HTMLImageElement
 * @param threshold Color distance threshold (0 to 100)
 * @param cornerTolerance Distance tolerance for sampling background colors from image corners
 */
export function removeImageBackground(
  img: HTMLImageElement,
  threshold: number = 30,
  smoothing: number = 10
): { canvas: HTMLCanvasElement; alphaMask: Uint8Array } {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d')!;

  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const w = canvas.width;
  const h = canvas.height;

  const alphaMask = removeBackgroundPixels(data, w, h, threshold, smoothing);

  ctx.putImageData(imgData, 0, 0);

  return { canvas, alphaMask };
}

/** Remove only background connected to the image border, preserving enclosed details. */
export function removeBackgroundPixels(
  data: Uint8ClampedArray, w: number, h: number, threshold = 30, smoothing = 10
): Uint8Array {
  const count = w * h;
  const mask = new Uint8Array(count);
  if (!count || data.length !== count * 4) return mask;
  const corners = [0, w - 1, (h - 1) * w, count - 1];
  let r = 0, g = 0, b = 0, n = 0;
  for (const i of corners) if (data[i * 4 + 3] > 50) {
    r += data[i * 4]; g += data[i * 4 + 1]; b += data[i * 4 + 2]; n++;
  }
  if (!n) { for (let i = 0; i < count; i++) mask[i] = data[4*i+3]; return mask; }
  r /= n; g /= n; b /= n;
  const similar = (i: number) => Math.hypot(data[i*4]-r, data[i*4+1]-g, data[i*4+2]-b) <= threshold;
  const outside = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0, tail = 0;
  const add = (i: number) => {
    if (!outside[i] && similar(i)) { outside[i] = 1; queue[tail++] = i; }
  };
  for (let x = 0; x < w; x++) { add(x); add((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { add(y * w); add(y * w + w - 1); }
  while (head < tail) {
    const i = queue[head++], x = i % w, y = (i / w) | 0;
    if (x) add(i-1); if (x+1<w) add(i+1);
    if (y) add(i-w); if (y+1<h) add(i+w);
  }
  // Feather foreground pixels adjacent to the removed region, without
  // erasing interior colors that happen to resemble the backdrop.
  const feather = Math.max(0, Math.min(3, smoothing / 8));
  for (let i = 0; i < count; i++) {
    let a = outside[i] ? 0 : data[i*4+3];
    if (a && feather) {
      const x=i%w, y=(i/w)|0;
      const touches = (x>0 && outside[i-1]) || (x+1<w && outside[i+1])
        || (y>0 && outside[i-w]) || (y+1<h && outside[i+w]);
      if (touches) {
        const dist = Math.hypot(data[i*4]-r,data[i*4+1]-g,data[i*4+2]-b);
        a = Math.round(a * Math.max(0.25, Math.min(1, dist / Math.max(1, threshold + feather))));
      }
    }
    mask[i] = data[i*4+3] = a;
  }
  return mask;
}

/**
 * Extracts alpha mask directly from an existing transparent image.
 */
export function extractAlphaMask(canvasOrImg: HTMLCanvasElement | HTMLImageElement): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = canvasOrImg.width;
  canvas.height = canvasOrImg.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(canvasOrImg, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const mask = new Uint8Array(canvas.width * canvas.height);

  for (let i = 0; i < mask.length; i++) {
    mask[i] = data[i * 4 + 3];
  }
  return mask;
}

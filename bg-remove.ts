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

  // Sample corner pixels to detect background color
  const corners = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
    [Math.floor(w / 2), 0],
    [0, Math.floor(h / 2)],
    [w - 1, Math.floor(h / 2)],
  ];

  let bgR = 0, bgG = 0, bgB = 0, sampleCount = 0;
  for (const [cx, cy] of corners) {
    const idx = (cy * w + cx) * 4;
    // Only sample if pixel isn't already transparent
    if (data[idx + 3] > 50) {
      bgR += data[idx];
      bgG += data[idx + 1];
      bgB += data[idx + 2];
      sampleCount++;
    }
  }

  if (sampleCount > 0) {
    bgR = Math.round(bgR / sampleCount);
    bgG = Math.round(bgG / sampleCount);
    bgB = Math.round(bgB / sampleCount);
  } else {
    // Default to white
    bgR = 255; bgG = 255; bgB = 255;
  }

  const alphaMask = new Uint8Array(w * h);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // Color distance in RGB space
    const dr = r - bgR;
    const dg = g - bgG;
    const db = b - bgB;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    let newAlpha = a;
    if (dist < threshold) {
      newAlpha = 0;
    } else if (dist < threshold + smoothing) {
      const t = (dist - threshold) / smoothing;
      newAlpha = Math.floor(a * t);
    }

    data[i + 3] = newAlpha;
    alphaMask[i / 4] = newAlpha;
  }

  ctx.putImageData(imgData, 0, 0);

  return { canvas, alphaMask };
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

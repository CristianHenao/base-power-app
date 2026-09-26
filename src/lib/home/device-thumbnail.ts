/** Client-side crop of a scanned device outline from a camera frame. */

export type NormalizedBBox = [number, number, number, number];

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode capture."));
    image.src = dataUrl;
  });
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

/** Expand bbox slightly so the outline isn’t clipped. */
function padBBox(
  bbox: NormalizedBBox,
  pad = 0.04,
): NormalizedBBox {
  const [x, y, w, h] = bbox;
  const nx = clamp01(x - pad);
  const ny = clamp01(y - pad);
  const nr = clamp01(x + w + pad);
  const nb = clamp01(y + h + pad);
  return [nx, ny, Math.max(0.08, nr - nx), Math.max(0.08, nb - ny)];
}

/** Fallback center crop when Claude doesn’t return a bbox. */
function defaultBBox(): NormalizedBBox {
  return [0.18, 0.18, 0.64, 0.64];
}

/**
 * Crop the identified device region from a JPEG/PNG base64 frame.
 * Returns a PNG data URL suitable for `<img>` / storage.
 */
export async function cropDeviceOutlinePng(options: {
  imageBase64: string;
  mediaType: string;
  bbox: NormalizedBBox | null;
  /** Max edge length of the saved thumbnail */
  maxSize?: number;
}): Promise<string> {
  const { imageBase64, mediaType, bbox, maxSize = 512 } = options;
  const dataUrl = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:${mediaType};base64,${imageBase64}`;

  const image = await loadImage(dataUrl);
  const region = padBBox(bbox ?? defaultBBox());
  const sx = Math.round(region[0] * image.width);
  const sy = Math.round(region[1] * image.height);
  const sw = Math.max(1, Math.round(region[2] * image.width));
  const sh = Math.max(1, Math.round(region[3] * image.height));

  const scale = Math.min(1, maxSize / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/png");
}

export function dataUrlToBase64(dataUrl: string): {
  imageBase64: string;
  mediaType: string;
} {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return { imageBase64: dataUrl, mediaType: "image/png" };
  }
  return { imageBase64: match[2]!, mediaType: match[1]! };
}

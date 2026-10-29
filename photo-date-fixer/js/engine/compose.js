// Where a caption or sticker layer (an -overlay file) goes when it is drawn back onto its photo. Pure functions, so they run
// in Node tests as well as in the worker, which does the drawing (worker.js, drawOverlays).
// A layer usually has the photo's own size. A few are a slightly different shape (828 x 1548 over a 960 x 1700 photo): the
// layer is then scaled to cover the photo and centred, the way the app shows it, so the text keeps its proportions instead
// of being stretched.

export const JPEG_QUALITY = 0.92;

export function coverRect(photoW, photoH, layerW, layerH) {
  if (!(photoW > 0 && photoH > 0 && layerW > 0 && layerH > 0)) throw new RangeError('image without a size');
  if (layerW === photoW && layerH === photoH) return { x: 0, y: 0, w: photoW, h: photoH };
  const scale = Math.max(photoW / layerW, photoH / layerH);
  const w = layerW * scale;
  const h = layerH * scale;
  return { x: (photoW - w) / 2, y: (photoH - h) / 2, w, h };
}

// A photo can take its layers when it is a JPEG with at least one -overlay file paired to it. Videos keep their layer as a
// separate file: drawing it into a video means encoding every frame again.
export const canDrawLayers = (it) => it.media.type === 'Image' && /^\.jpe?g$/i.test(it.media.ext || '') && it.overlays.length > 0;

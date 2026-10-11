// gettingprime: a meal photo, shrunk on the phone before it goes to the AI estimate
// (POST /api/food/estimate): a 12 MP camera shot is several MB, and 1024 px is plenty to see a plate.

/** The size that fits `max` on the longest side, same shape; a smaller photo stays as it is. */
export function fitWithin(w, h, max) {
  const scale = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) }
}

// createImageBitmap applies the photo's EXIF rotation; an <img> is the fallback where it is missing.
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file) } catch { /* fall back below */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally { URL.revokeObjectURL(url) }
}

/** The photo as a JPEG data URL at most `max` px on its longest side. */
export async function shrinkImage(file, max = 1024, quality = 0.8) {
  const src = await decode(file)
  const { w, h } = fitWithin(src.width, src.height, max)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(src, 0, 0, w, h)
  src.close?.()
  return canvas.toDataURL('image/jpeg', quality)
}

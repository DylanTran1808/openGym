// gettingprime: reading a product barcode (EAN/UPC) from the camera, for the nutrition log. The
// gym check-in's scanner (scan-web.js) reads QR codes only — jsQR knows no 1D barcodes — so this is
// its sibling, handed to the same camera component (CameraScan `decode`).
//
// Two decoders, tried in order:
//   1. BarcodeDetector — the browser's own (Chrome on Android), when it reads EAN-13.
//   2. barcode-detector's ponyfill (zxing-wasm, MIT) — everywhere else, iOS Safari included,
//      which has no BarcodeDetector. Loaded with a dynamic import so it only ships when someone
//      scans, its .wasm bundled with the app (not fetched from a CDN) so it works offline once
//      the service worker has it.

export const FOOD_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']
const CODE = /^\d{8,14}$/

/** The first detected value that is a product barcode, as { value, fmt }, or null. */
export function pickBarcode(found) {
  const hit = (Array.isArray(found) ? found : []).find(x => CODE.test(String(x?.rawValue || '')))
  return hit ? { value: String(hit.rawValue), fmt: hit.format || 'barcode' } : null
}

/** Whether a native BarcodeDetector class can read retail barcodes. */
export async function nativeSupportsFood(BD) {
  try { return !!BD && (await BD.getSupportedFormats()).includes('ean_13') } catch { return false }
}

let _detector = null
async function detector() {
  if (_detector) return _detector
  const native = typeof globalThis.BarcodeDetector === 'function' ? globalThis.BarcodeDetector : null
  if (await nativeSupportsFood(native)) return (_detector = new native({ formats: FOOD_FORMATS }))
  const [{ BarcodeDetector, setZXingModuleOverrides }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ])
  setZXingModuleOverrides({ locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) })
  return (_detector = new BarcodeDetector({ formats: FOOD_FORMATS }))
}

/** Decode one frame of a <video> (or anything detect() takes): { value, fmt } or null. */
export async function decodeBarcode(source) {
  if (!(source?.videoWidth || source?.naturalWidth || source?.width)) return null
  return pickBarcode(await (await detector()).detect(source))
}

// gettingprime: an Open Food Facts product → the app's saved-food shape (frontend
// lib/nutrition.js foodFromInput takes it from there, and the user can edit every number before
// saving). Kept out of server.js so it can be unit-tested without booting the server.
//
// Per 100 g, or per 100 ml for a drink. A serving only as its gram/ml amount
// (`serving_quantity`): the label's own text often says "1 cup (240 ml)", and cups are a unit this
// app never shows. A value Open Food Facts carries that cannot be per 100 (negative, 500 g of carbs)
// is dropped to 0 rather than passed on.

export const FOOD_CODE = /^\d{8,14}$/;

const MAX = { kcal: 1000, p: 100, c: 100, f: 100, fib: 100 };
const KEYS = { p: 'proteins_100g', c: 'carbohydrates_100g', f: 'fat_100g', fib: 'fiber_100g' };
const r1 = v => Math.round(v * 10) / 10;
const per100 = (v, max) => {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};

/** The product as { name, base, barcode, per100, serving? }, or null when there is none. */
export function offToFood(json) {
  const p = json?.status === 1 || json?.status === '1' ? json.product : null;
  if (!p || typeof p !== 'object') return null;
  const n = p.nutriments || {};
  const kcal = per100(n['energy-kcal_100g'], MAX.kcal) ?? (per100(n.energy_100g, MAX.kcal * 4.184) ?? 0) / 4.184;
  const macros = { kcal: Math.round(kcal) };
  for (const [k, key] of Object.entries(KEYS)) macros[k] = r1(per100(n[key], MAX[k]) ?? 0);

  const qty = String(p.quantity || '');
  const ml = String(p.product_quantity_unit || '').toLowerCase() === 'ml' || /\d\s*(ml|cl|dl|l)\b/i.test(qty);
  const brand = String(p.brands || '').split(',')[0].trim();
  const title = String(p.product_name || p.generic_name || '').trim() || 'Unnamed product';
  const food = {
    name: brand && !title.toLowerCase().includes(brand.toLowerCase()) ? `${title} (${brand})` : title,
    base: ml ? 'ml' : 'g',
    barcode: String(json.code || ''),
    per100: macros,
  };
  const serving = Number(p.serving_quantity);
  if (Number.isFinite(serving) && serving > 0 && serving <= 5000) food.serving = { amt: r1(serving) };
  return food;
}

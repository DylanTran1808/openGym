#!/usr/bin/env node
// gettingprime: builds the dish lists searched under "Eating out" (frontend/src/lib/dishes.js).
//
//   node scripts/build-dishes.mjs --fndds <surveyDownload.json>
//   node scripts/build-dishes.mjs --nevo <NEVO2025 table (.csv or .txt)>
//
// --fndds: USDA FNDDS ("Survey Foods") JSON from https://fdc.nal.usda.gov/download-datasets
//   (FoodData_Central_survey_food_json_*.zip, unzipped). Public domain, so the result is
//   committed: frontend/src/lib/dishes-data.js.
//
// --nevo: NEVO online 2025/9.0 (RIVM, the Dutch food table), requested free from rivm.nl. Its terms
//   allow the values only unchanged, with the source shown, and not for a fee — and the dataset is
//   requested per user — so the result is NOT committed: frontend/public/dishes-nevo.json is
//   gitignored and the app simply has no NEVO dishes without it. Values are copied as written
//   (decimal comma read as a point); a blank is 0. Foods given per 100 ml are left out.
//
// A row is [name, kcal, protein, carbs, fat, fibre, typical serving in g | null], per 100 g; NEVO
// rows add [Dutch name, 'nevo'] — named in English, found by either name.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = flag => { const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : null }
const r1 = v => Math.round(v * 10) / 10

// FNDDS nutrient numbers: 208 energy (kcal), 203 protein, 205 carbohydrate, 204 fat, 291 fibre.
const FNDDS_NUTRIENTS = { 208: 1, 203: 2, 205: 3, 204: 4, 291: 5 }

export function fnddsRows(json) {
  return (json.SurveyFoods || []).map(food => {
    const row = [String(food.description).trim(), 0, 0, 0, 0, 0, null]
    for (const n of food.foodNutrients || []) {
      const i = FNDDS_NUTRIENTS[n.nutrient?.number]
      if (i) row[i] = i === 1 ? Math.round(n.amount || 0) : r1(n.amount || 0)
    }
    // "Quantity not specified" is FNDDS's typical serving: what an unspecified "a plate of" weighs.
    const serving = (food.foodPortions || []).find(p => p.portionDescription === 'Quantity not specified')
    row[6] = serving?.gramWeight > 0 ? r1(serving.gramWeight) : null
    return row
  }).sort((a, b) => a[0].localeCompare(b[0]))
}

/** The table's text: UTF-8, or Windows-1252 when the bytes are not valid UTF-8. */
export function decodeTable(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf) } catch { return new TextDecoder('windows-1252').decode(buf) }
}

function splitLine(line, sep) {
  const out = []
  let cur = '', quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') quoted = false; else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur)
  return out.map(x => x.trim())
}

// NEVO columns by their codes: ENERCC kcal, PROT protein, CHO carbohydrate, FAT fat, FIBT fibre.
const NEVO_COLUMNS = {
  dutch: h => /voedingsmiddelnaam|dutch food name/i.test(h),
  english: h => /engelse naam|^food name|\/food name/i.test(h),
  quantity: h => /hoeveelheid|quantity/i.test(h),
  kcal: h => /^ENERCC\b/.test(h), p: h => /^PROT\b/.test(h), c: h => /^CHO\b/.test(h), f: h => /^FAT\b/.test(h), fib: h => /^FIBT\b/.test(h),
}

export function nevoRows(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim())
  const sep = ['|', ';', '\t', ','].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0]
  const head = splitLine(lines[0], sep)
  const col = {}
  for (const [k, test] of Object.entries(NEVO_COLUMNS)) {
    col[k] = head.findIndex(test)
    if (col[k] < 0) throw new Error(`not a NEVO table: no column for ${k} (headers: ${head.join(', ')})`)
  }
  const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return v && Number.isFinite(n) ? n : 0 }
  return lines.slice(1).map(l => splitLine(l, sep))
    .filter(c => /100\s*g/i.test(c[col.quantity]) && (c[col.english] || c[col.dutch]))
    .map(c => [c[col.english] || c[col.dutch], num(c[col.kcal]), num(c[col.p]), num(c[col.c]), num(c[col.f]), num(c[col.fib]), null, c[col.dutch], 'nevo'])
    .sort((a, b) => a[0].localeCompare(b[0]))
}

const main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
const fndds = main && arg('--fndds'), nevo = main && arg('--nevo')
if (nevo) {
  const rows = nevoRows(decodeTable(fs.readFileSync(nevo)))
  const out = path.join(root, 'frontend/public/dishes-nevo.json')
  fs.writeFileSync(out, JSON.stringify(rows))
  console.log(`wrote ${rows.length} NEVO foods to ${path.relative(root, out)} (gitignored: never commit it)`)
}
if (fndds) {
  const json = JSON.parse(fs.readFileSync(fndds, 'utf8'))
  const rows = fnddsRows(json)
  const out = path.join(root, 'frontend/src/lib/dishes-data.js')
  fs.writeFileSync(out, '// generated by scripts/build-dishes.mjs from USDA FNDDS 2021-2023 (FoodData Central survey foods,\n'
    + '// 2024-10-31 release; public domain) — do not edit. [name, kcal, p, c, f, fib, serving g | null] per 100 g.\n'
    + 'export const DISHES = ' + JSON.stringify(rows) + '\n')
  console.log(`wrote ${rows.length} dishes to ${path.relative(root, out)}`)
}
if (main && !fndds && !nevo) console.error('usage: node scripts/build-dishes.mjs --fndds <surveyDownload.json> | --nevo <NEVO table>')

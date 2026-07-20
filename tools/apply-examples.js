#!/usr/bin/env node
/**
 * Write the example sentences in tools/examples.json into RAW_WORDS.
 *
 * Keyed by "jp|kana" rather than by id: ids can churn when the Google Doc is
 * re-parsed, but the word itself does not. The sentences go on the first row
 * that matches; the app shares them across every other occurrence at load
 * (shareExamples), and tools/sync-words.js carries them forward on each sync.
 *
 *   node tools/apply-examples.js          write
 *   node tools/apply-examples.js --check  report only, change nothing
 */
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', 'app', 'index.html');
const DATA = path.join(__dirname, 'examples.json');

const html = fs.readFileSync(APP, 'utf8');
const m = html.match(/(const RAW_WORDS = \[\r?\n)([\s\S]*?)(\r?\n\];)/);
if (!m) { console.error('RAW_WORDS block not found'); process.exit(1); }

const rows = JSON.parse('[' + m[2] + ']');
const examples = JSON.parse(fs.readFileSync(DATA, 'utf8'));

const firstRowFor = new Map();
for (const r of rows) {
  const k = r[1] + '|' + r[2];
  if (!firstRowFor.has(k)) firstRowFor.set(k, r);
}

// A stray Korean or Cyrillic letter that happens to look like a kanji reads as
// a typo to a learner and is invisible in review, so refuse the whole run.
// Khmer is here too: the danda ។ is easy to type in place of 。 while writing
// the translation alongside.
const STRAY = /[ᄀ-ᇿ가-힯Ѐ-ӿ฀-๿ក-៿]/;
const bad = [];
for (const [key, pairs] of Object.entries(examples)) {
  if (key.startsWith('_')) continue;
  for (const [jp] of pairs) if (STRAY.test(jp)) bad.push(`${key}: ${jp}`);
}
if (bad.length) {
  console.error('Japanese sentences contain non-Japanese letters:\n  ' + bad.join('\n  '));
  process.exit(1);
}

let written = 0, missing = [], already = 0;
for (const [key, pairs] of Object.entries(examples)) {
  if (key.startsWith('_')) continue;                 // notes, not data
  const row = firstRowFor.get(key);
  if (!row) { missing.push(key); continue; }
  const had = Array.isArray(row[5]) ? row[5].length : !!row[5];
  if (had) { already++; continue; }
  row[5] = pairs.map(p => p[0]);
  row[6] = pairs.map(p => p[1]);
  written++;
}

// how much of the dictionary is covered now
const withEx = new Set(), all = new Set();
for (const r of rows) {
  const k = r[1] + '|' + r[2];
  all.add(k);
  if (Array.isArray(r[5]) ? r[5].length : !!r[5]) withEx.add(k);
}

console.log(`words in file        ${all.size}`);
console.log(`with examples        ${withEx.size}  (${Math.round(withEx.size / all.size * 100)}%)`);
console.log(`written this run     ${written}`);
if (already) console.log(`already had examples ${already}`);
if (missing.length) console.log(`NOT FOUND in RAW_WORDS (${missing.length}): ${missing.join(', ')}`);

if (process.argv.includes('--check')) process.exit(0);
if (!written) { console.log('nothing to write'); process.exit(0); }

const body = rows.map(r => JSON.stringify(r)).join(',\n');
fs.writeFileSync(APP, html.slice(0, m.index) + m[1] + body + m[3] + html.slice(m.index + m[0].length), 'utf8');
console.log('written to app/index.html');

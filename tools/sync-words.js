#!/usr/bin/env node
/**
 * Rebuild the dictionary data from the published Google Docs listed in
 * tools/books.json, then write it into app/index.html and data/words.csv.
 *
 *   node tools/sync-words.js
 *
 * Existing ids, parts of speech and example sentences are kept for every word
 * that still appears in a doc, so hand-written content is never lost.
 * Refuses to write if a doc looks broken (see the guards near the end).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const IDX = path.join(ROOT, 'app', 'index.html');
const CSV = path.join(ROOT, 'data', 'words.csv');
const DEFAULT_BOOK = 'SSW-Truck';
const books = JSON.parse(fs.readFileSync(path.join(__dirname, 'books.json'), 'utf8'));

// ---------------------------------------------------------------- fetch ----
async function fetchDocText(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  let h = await res.text();
  h = h.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
  h = h.replace(/<\/(p|div|li|h[1-6]|br)>/gi, '\n').replace(/<br[^>]*>/gi, '\n').replace(/<[^>]+>/g, '');
  return h.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

// ---------------------------------------------------------------- parse ----
const ZEN = '０１２３４５６７８９';
const toNum = fw => parseInt(fw.split('').map(c => { const i = ZEN.indexOf(c); return i >= 0 ? String(i) : c; }).join(''), 10);

// Pages are marked "page 41" early in the books and as a bare number (１０１)
// from about page 101 onwards.
function pageOf(line) {
  let m = line.match(/^page\s*([0-9０-９]+)\s*$/i);
  if (!m) m = line.match(/^([0-9０-９]{1,3})\s*$/);
  return m ? toNum(m[1]) : null;
}

// Entries are delimited by the section headings, not by a bullet: later pages
// drop the ● entirely. Everything of the form "left：khmer" inside a section
// is an entry.
function parseDoc(text, book) {
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  let page = null, cat = null;
  const out = [];
  for (const ln of lines) {
    const p = pageOf(ln);
    if (p != null) { page = p; cat = null; continue; }
    if (ln.includes('ពាក្យគន្លឹះ')) { cat = 'vocab'; continue; }
    if (ln.includes('វេយ្យាករណ៍គន្លឹះ')) { cat = 'grammar'; continue; }
    if (cat == null || page == null) continue;

    const body = ln.replace(/^●\s*/, '');
    const ci = body.indexOf('：');
    if (ci < 1) continue;
    const left = body.slice(0, ci).trim();
    const km = body.slice(ci + 1).trim();
    if (!left || left.length > 60 || !km) continue;

    let jp = left, kana = '';
    if (cat === 'vocab') {
      // vocab: 漢字（かな）. Grammar keeps the whole pattern, since its
      // parentheses hold inline readings (〜に努（つと）める).
      const op = left.indexOf('（');
      if (op >= 0) {
        const cp = left.indexOf('）', op);
        jp = left.slice(0, op).trim();
        kana = cp >= 0 ? left.slice(op + 1, cp).trim() : '';
      }
    }
    if (!jp) continue;
    out.push({ book, page, cat, jp, kana, km });
  }
  return out;
}

// ------------------------------------------------------------- existing ----
const html = fs.readFileSync(IDX, 'utf8');
const arrStart = html.indexOf('[', html.indexOf('const RAW_WORDS = ['));
const arrEnd = html.indexOf('\n];', arrStart);
if (arrStart < 0 || arrEnd < 0) throw new Error('RAW_WORDS not found in app/index.html');
const existing = eval(html.slice(arrStart, arrEnd + 2));

// jp|kana|page|book -> queue of previous rows. A word can legitimately be
// listed twice on one page, so keep every row and hand them out in order;
// mapping them one-to-one is what makes repeated syncs produce no diff.
const prev = new Map();
for (const r of existing) {
  const k = [r[1], r[2], r[8] || 2, r[9] || DEFAULT_BOOK].join('|');
  if (!prev.has(k)) prev.set(k, []);
  prev.get(k).push(r);
}

// ---------------------------------------------------------------- merge ----
(async () => {
  const docEntries = [];
  const perBook = {};
  for (const b of books) {
    const text = await fetchDocText(b.url);
    const rows = parseDoc(text, b.book);
    perBook[b.book] = rows.length;
    console.log(`  ${b.book}: ${rows.length} entries`);
    docEntries.push(...rows);
  }

  const used = new Set(), seq = {};
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  function newId(book, page) {
    const prefix = book === DEFAULT_BOOK ? 'p' : slug(book) + '_';
    let id;
    do {
      const k = book + '|' + page;
      seq[k] = (seq[k] || 0) + 1;
      id = `${prefix}${page}_${String(seq[k]).padStart(2, '0')}`;
    } while (used.has(id));
    return id;
  }

  let kept = 0, added = 0;
  const rows = [];
  for (const d of docEntries) {
    const bucket = prev.get([d.jp, d.kana, d.page, d.book].join('|'));
    const old = bucket && bucket.length ? bucket.shift() : null;
    let id, pos, exJp, exKm;
    if (old && !used.has(old[0])) {
      id = old[0]; pos = old[3]; exJp = old[5] || ''; exKm = old[6] || ''; kept++;
    } else {
      id = newId(d.book, d.page);
      pos = d.cat === 'grammar' ? 'វេយ្យាករណ៍' : '';
      exJp = ''; exKm = ''; added++;
    }
    used.add(id);
    const row = [id, d.jp, d.kana, pos, d.km, exJp, exKm, d.cat, d.page];
    if (d.book !== DEFAULT_BOOK) row.push(d.book);
    rows.push(row);
  }

  // ------------------------------------------------------------ guards ----
  for (const b of books) {
    if (!perBook[b.book]) throw new Error(`${b.book} produced 0 entries — doc unreachable or its format changed. Nothing written.`);
  }
  if (rows.length < existing.length * 0.8) {
    throw new Error(`Refusing to write: ${rows.length} entries vs ${existing.length} before (>20% drop). Check the doc.`);
  }
  const withExamples = rows.filter(r => r[5] && r[5].length).length;
  const hadExamples = existing.filter(r => r[5] && r[5].length).length;
  if (withExamples < hadExamples) {
    throw new Error(`Refusing to write: example sentences would drop ${hadExamples} → ${withExamples}.`);
  }

  // ------------------------------------------------------------- write ----
  const block = 'const RAW_WORDS = [\n' + rows.map(r => JSON.stringify(r)).join(',\n') + '\n];';
  const oldBlock = html.slice(html.indexOf('const RAW_WORDS = ['), arrEnd + 3);
  const changed = block !== oldBlock;

  if (changed) {
    fs.writeFileSync(IDX, html.slice(0, html.indexOf('const RAW_WORDS = [')) + block + html.slice(arrEnd + 3), 'utf8');
    const esc = v => { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const join = v => Array.isArray(v) ? v.join(' | ') : (v || '');
    const csv = [['id', 'book', 'page', 'category', 'jp', 'kana', 'pos', 'km', 'example_jp', 'example_km'].join(',')];
    for (const r of rows) csv.push([r[0], r[9] || DEFAULT_BOOK, r[8] || 2, r[7], r[1], r[2], r[3], r[4], join(r[5]), join(r[6])].map(esc).join(','));
    fs.writeFileSync(CSV, '﻿' + csv.join('\n'), 'utf8');
  }

  const pages = new Set(rows.map(r => `${r[9] || DEFAULT_BOOK}|${r[8]}`));
  console.log(`\ntotal ${rows.length} entries · ${pages.size} pages · kept ${kept} · new ${added} · examples ${withExamples}`);
  console.log(changed ? 'CHANGED — files updated' : 'no change');

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\ncount=${rows.length}\n`);
  }
})().catch(err => { console.error('\nSync failed:', err.message); process.exit(1); });

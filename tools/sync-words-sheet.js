#!/usr/bin/env node
/*
 * Pull the words from a published Google Sheet and rewrite the RAW_WORDS block
 * in app/index.html + data/words.csv. This replaces the old Google-Docs sync:
 * the Sheet is now the master source, and it can carry an image per word.
 *
 *   WORDS_CSV_URL="…/pub?gid=0&single=true&output=csv" node tools/sync-words-sheet.js
 *   … --check   # report only, change nothing
 *
 * Columns are read BY HEADER NAME (order does not matter). Expected headers:
 *   id, book, page, category, jp, kana, pos, km, example_jp, example_km, image
 * Several examples in one cell are separated by " | " (matching example_jp and
 * example_km by position). `id` MUST stay stable — it ties a word to a
 * student's progress, favourites and stars; leave existing ids untouched.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// The published WORDS sheet (File ▸ Share ▸ Publish to web ▸ CSV). Override with
// WORDS_CSV_URL if the sheet is ever moved to a new document.
const DEFAULT_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSzYCoMOsqSUqacmNUiS--H7acExSOkxTk7iBPJ816fgXRl93Iwv0GG0iaAjbuZmVjSVtAJqVmighWa/pub?gid=1280678563&single=true&output=csv';
const URL = process.env.WORDS_CSV_URL || DEFAULT_URL;
const DEFAULT_BOOK = 'SSW-Truck';
const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'app', 'index.html');
const CSV = path.join(ROOT, 'data', 'words.csv');

function get(url, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 5) return reject(new Error('too many redirects'));
    (url.startsWith('http:') ? http : https).get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); return resolve(get(res.headers.location, depth + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let b = ''; res.setEncoding('utf8');
      res.on('data', c => b += c); res.on('end', () => resolve(b));
    }).on('error', reject);
  });
}

function parseCSV(s) {
  const rows = []; let i = 0, cur = [''], inq = false;
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);   // strip BOM
  while (i < s.length) {
    const c = s[i];
    if (inq) {
      if (c === '"') { if (s[i + 1] === '"') { cur[cur.length - 1] += '"'; i += 2; continue; } inq = false; i++; continue; }
      cur[cur.length - 1] += c; i++;
    } else {
      if (c === '"') { inq = true; i++; }
      else if (c === ',') { cur.push(''); i++; }
      else if (c === '\n') { rows.push(cur); cur = ['']; i++; }
      else if (c === '\r') { i++; }
      else { cur[cur.length - 1] += c; i++; }
    }
  }
  if (cur.length > 1 || cur[0] !== '') rows.push(cur);
  return rows;
}

const esc = v => { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const splitEx = v => String(v || '').split('|').map(x => x.trim()).filter(Boolean);
// A Google Drive "share" link is not an <img> source; rewrite it to the
// thumbnail endpoint, which hotlinks reliably. Anything else is left as-is.
function normalizeImg(url) {
  if (!url) return '';
  const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=|thumbnail\?(?:[^#]*&)?id=)([\w-]{20,})/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000` : url;
}

(async () => {
  if (!URL) throw new Error('Set WORDS_CSV_URL to the published sheet CSV.');
  const table = parseCSV(await get(URL));
  if (!table.length) throw new Error('Refusing: empty sheet.');
  const head = table[0].map(h => h.trim().toLowerCase());
  const col = name => head.indexOf(name);
  const need = ['id', 'jp', 'km'];
  for (const n of need) if (col(n) < 0) throw new Error(`Missing column "${n}" in the sheet.`);
  const ci = { id: col('id'), book: col('book'), page: col('page'), cat: col('category'),
    jp: col('jp'), kana: col('kana'), pos: col('pos'), km: col('km'),
    exj: col('example_jp'), exk: col('example_km'), img: col('image') };

  const rows = [];   // RAW_WORDS array-of-arrays
  const csv = [['id', 'book', 'page', 'category', 'jp', 'kana', 'pos', 'km', 'example_jp', 'example_km', 'image'].join(',')];
  const seenId = new Map();   // id -> jp, to catch a reused id (would conflate two words' progress/stars)
  const dups = [];
  const g = (r, k) => (ci[k] >= 0 ? (r[ci[k]] || '') : '').trim();
  for (const r of table.slice(1)) {
    const id = g(r, 'id'), jp = g(r, 'jp'), km = g(r, 'km');
    if (!id || !jp) continue;
    if (seenId.has(id)) dups.push(`${id} (${seenId.get(id)} / ${jp})`); else seenId.set(id, jp);
    const kana = g(r, 'kana'), pos = g(r, 'pos'), cat = g(r, 'cat') || 'vocab';
    const book = g(r, 'book') || DEFAULT_BOOK;
    const page = parseInt(g(r, 'page'), 10) || 2;
    const exj = splitEx(g(r, 'exj')), exk = splitEx(g(r, 'exk'));
    const img = normalizeImg(g(r, 'img'));
    // keep rows as small as the old ones: 9 cols by default, +book, +image
    const base = [id, jp, kana, pos, km, exj, exk, cat, page];
    if (img) base.push(book, img);
    else if (book !== DEFAULT_BOOK) base.push(book);
    rows.push(base);
    csv.push([id, book, page, cat, jp, kana, pos, km, exj.join(' | '), exk.join(' | '), img].map(esc).join(','));
  }
  console.log(`parsed ${rows.length} words · with image ${rows.filter(r => r.length === 11).length}`);
  if (!rows.length) throw new Error('Refusing: 0 words parsed.');
  if (dups.length) throw new Error(`Refusing: duplicate id(s) in the sheet — give each row a unique id:\n  ${dups.join('\n  ')}`);

  const html = fs.readFileSync(APP, 'utf8');
  const m = html.match(/(const RAW_WORDS = \[\r?\n)([\s\S]*?)(\r?\n\];)/);
  if (!m) throw new Error('RAW_WORDS block not found in app/index.html');
  const current = JSON.parse('[' + m[2] + ']');
  if (rows.length < current.length * 0.8) throw new Error(`Refusing: word count would drop ${current.length} → ${rows.length}.`);

  const body = rows.map(r => JSON.stringify(r)).join(',\n');
  const changed = body !== m[2];
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\ncount=${rows.length}\n`);
  if (process.argv.includes('--check')) { console.log(changed ? 'WOULD CHANGE' : 'no change'); return; }
  if (!changed) { console.log('no change — sheet matches the app'); return; }
  fs.writeFileSync(APP, html.slice(0, m.index) + m[1] + body + m[3] + html.slice(m.index + m[0].length), 'utf8');
  fs.writeFileSync(CSV, '﻿' + csv.join('\n'), 'utf8');
  console.log('wrote RAW_WORDS + data/words.csv');
})().catch(e => { console.error(e.message); process.exit(1); });

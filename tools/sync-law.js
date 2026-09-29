#!/usr/bin/env node
/*
 * Bake the four Japanese-traffic-law workbooks into the RAW_LAW block in
 * app/index.html.
 *
 *   node tools/sync-law.js           # fetch + write
 *   node tools/sync-law.js --check   # report counts only
 *
 * 標識/練習/仮免/本免 each come from their OWN bilingual workbook — the author
 * keeps Japanese and Khmer side by side per row instead of two separate
 * sheets, which used to make cross-checking a translation error a chore.
 * Each test's tabs (topic/set-numbered) are concatenated in order into one
 * flat list per language:
 *   A=ID  B=問題（日本語）  C=問題（クメール語）
 *   D=解説（日本語）        E=解説（クメール語）
 *   F=正しい(○/×/letter/plain text)   G=誤り   H=イラスト(image)
 * F/G are either ○/× (true-false), a lettered option (Ⓐ/Ⓑ/Ⓒ…) with the
 * rest in G, or — for 標識's "what does this sign mean?" questions — plain
 * answer text with no letter at all, G holding the wrong answers one per
 * line. Readings are KEPT (these are law tests, like the mock exam).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

// bilingual workbooks — one row holds both languages; each test's own tabs
// (topic-named for 標識/練習, pre-split numbered sets for 仮免/本免), concatenated
// in tab order to rebuild that test's full list
const BILINGUAL = {
  sign: { base: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTHoctqARb2IEtELlmixxry3kjLahwFpuPs-GFEELFRIqBpUcVDkfgC6o-L_sV1Wugd3kwTMXUDceMj/pub',
    tabs: ['2110633815', '1801495243', '1461729969'] },
  hon: { base: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR98cZ7zTTlR1v6Ljq1dgFTdwUmepWPNHv4iaHPqsnCc9u44KvIQMy8yzoYPsl0xjudbX5Mb8TXM2py/pub',
    tabs: ['1478524770', '2089886942', '1478705144', '1568819820', '257353815'] },
  kari: { base: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR98cZ7zTTlR1v6Ljq1dgFTdwUmepWPNHv4iaHPqsnCc9u44KvIQMy8yzoYPsl0xjudbX5Mb8TXM2py/pub',
    tabs: ['879488848', '1864785491', '137344612', '346036271', '342699340', '152075713', '478501841', '1193618611', '210136720', '197200791'] },
  prac: { base: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vThofEPgk2Lf2Te1O541_j34z7jSmF0ujXtwfw346SWZSIrH8ojIzqcUg_a2Phy2FcQRyt7LCrv9s4U/pub',
    tabs: ['2110633815', '0', '1397364153', '2030120179', '94896380', '754783368', '915545004', '1617441431',
      '1216486470', '88652787', '76164775', '1553103002', '1659349048', '1093870509', '597960986', '296363223',
      '1300311985', '337749613', '1665691495', '599455193', '87952145', '1546520847', '578093460', '868439107',
      '1904341202', '1162374493', '609551000', '287727861'] },
};

const csvUrl = (base, gid) => `${base}?gid=${gid}&single=true&output=csv`;
const APP = path.join(__dirname, '..', 'app', 'index.html');

function get(url, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 5) return reject(new Error('too many redirects'));
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve(get(res.headers.location, depth + 1)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let b = ''; res.setEncoding('utf8'); res.on('data', c => b += c); res.on('end', () => resolve(b));
    }).on('error', reject);
  });
}
function parseCSV(s) {
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  const rows = []; let i = 0, cur = [''], inq = false;
  while (i < s.length) {
    const c = s[i];
    if (inq) { if (c === '"') { if (s[i + 1] === '"') { cur[cur.length - 1] += '"'; i += 2; continue; } inq = false; i++; continue; } cur[cur.length - 1] += c; i++; }
    else { if (c === '"') { inq = true; i++; } else if (c === ',') { cur.push(''); i++; } else if (c === '\n') { rows.push(cur); cur = ['']; i++; } else if (c === '\r') { i++; } else { cur[cur.length - 1] += c; i++; } }
  }
  if (cur.length > 1 || cur[0] !== '') rows.push(cur);
  return rows;
}
const OPT_LETTER = /[Ⓐ-Ⓩ]|[Ａ-Ｚ]|[A-Za-z]/;
function letterIdx(ch) { if (ch >= 'Ⓐ' && ch <= 'Ⓩ') return ch.codePointAt(0) - 0x24B6; if (ch >= 'Ａ' && ch <= 'Ｚ') return ch.codePointAt(0) - 0xFF21; return ch.toUpperCase().charCodeAt(0) - 65; }
function opt(s) { s = (s || '').trim(); const m = s.match(new RegExp('^(' + OPT_LETTER.source + ')[\\s.、．)）:：]*([\\s\\S]*)$')); return m ? { idx: letterIdx(m[1]), text: m[2].trim() } : { idx: -1, text: s }; }
function splitInline(q) {
  const marks = [...q.matchAll(/[Ⓐ-Ⓩ]/g)]; if (marks.length < 2) return null;
  const stem = q.slice(0, marks[0].index).trim();
  const options = marks.map((mk, k) => { const end = k + 1 < marks.length ? marks[k + 1].index : q.length; return { idx: letterIdx(q[mk.index]), text: q.slice(mk.index + 1, end).trim() }; });
  return { stem, options };
}
function normalizeImg(url) { if (!url) return ''; const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=|thumbnail\?(?:[^#]*&)?id=)([\w-]{20,})/); return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000` : url; }
const LABELS = ['A', 'B', 'C', 'D', 'E'];
// deterministic shuffle (seeded from the question itself) for option sets
// that have no author-assigned letter order — keeps the answer position from
// always landing on the first option, without reordering on every re-sync of
// an unchanged sheet (which would otherwise spam the GitHub Action bot's diff)
function seededShuffle(arr, seed) {
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { h = (Math.imul(h, 1103515245) + 12345) >>> 0; const j = h % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// build one question from already-extracted column values (kept separate
// from the row-column layout so the same logic serves both the single-
// language sheets and the bilingual one, whose columns are numbered
// differently)
function buildQuestion(rawQ, c, d, img, explain) {
  rawQ = (rawQ || '').trim(); c = (c || '').trim(); d = (d || '').trim();
  img = normalizeImg((img || '').trim()); explain = (explain || '').trim();
  if (!rawQ && !c) return null;
  const item = { q: rawQ };
  const TRUE_MARK = '〇○◯⭕', FALSE_MARK = '×✖✗';
  if (TRUE_MARK.includes(c) || FALSE_MARK.includes(c)) { item.t = 'tf'; item.a = TRUE_MARK.includes(c); }
  else if (OPT_LETTER.test(c[0] || '')) {
    const co = opt(c); let all, correctIdx;
    if (co.text) {
      const others = [];
      for (const part of d.split(/\n+/).map(x => x.trim()).filter(Boolean)) { const o = opt(part); if (o.idx < 0 && others.length) others[others.length - 1].text += ' ' + o.text; else others.push(o); }
      all = [co, ...others].sort((a, b) => a.idx - b.idx); correctIdx = all.indexOf(co);
    } else {
      const inline = splitInline(rawQ);
      if (inline && inline.options.length >= 2) { item.q = inline.stem; all = inline.options.sort((a, b) => a.idx - b.idx); }
      else { const letters = [co, ...d.split(/\n+/).map(x => x.trim()).filter(Boolean).map(x => opt(x))]; all = letters.sort((a, b) => a.idx - b.idx).map(o => ({ idx: o.idx, text: LABELS[o.idx] || '?' })); }
      correctIdx = all.findIndex(o => o.idx === co.idx);
    }
    item.t = 'mc'; item.o = all.map(o => o.text); item.a = correctIdx;
  } else if (c) {
    // plain-text options, no letter prefixes at all (標識's "what does this
    // sign mean?" questions) — c is the correct answer, d holds the wrong
    // ones one per line
    const wrongs = d.split(/\n+/).map(x => x.trim()).filter(Boolean);
    const all = seededShuffle([c, ...wrongs], rawQ + img);
    item.t = 'mc'; item.o = all; item.a = all.indexOf(c);
  } else return null;
  if (img) item.img = img;
  if (explain) item.e = explain;
  return item;
}
// A=ID B=問題(JP) C=問題(KM) D=解説(JP) E=解説(KM) F=正しい G=誤り H=イラスト
// (bilingual sheet) — returns { ja: [...], km: [...] }, one question pair
// per row (t/a/o/img are language-neutral, only q/e differ)
function toQuestionsBilingual(rows) {
  const ja = [], km = [];
  for (const r of rows.slice(1)) {
    const jaQ = buildQuestion(r[1], r[5], r[6], r[7], r[3]);
    const kmQ = buildQuestion(r[2], r[5], r[6], r[7], r[4]);
    if (jaQ) ja.push(jaQ);
    if (kmQ) km.push(kmQ);
  }
  return { ja, km };
}

(async () => {
  const check = process.argv.includes('--check');
  const data = { km: {}, ja: {} };
  for (const [key, { base, tabs }] of Object.entries(BILINGUAL)) {
    data.km[key] = []; data.ja[key] = [];
    for (const gid of tabs) {
      const csv = await get(csvUrl(base, gid));
      const { ja, km } = toQuestionsBilingual(parseCSV(csv));
      data.ja[key].push(...ja); data.km[key].push(...km);
    }
    console.log(`km.${key}: ${data.km[key].length} questions`);
    console.log(`ja.${key}: ${data.ja[key].length} questions`);
  }
  const block = 'const RAW_LAW = ' + JSON.stringify(data) + ';\nconst RAW_LAW_END = 1;';
  const total = Object.values(data).reduce((s, lang) => s + Object.values(lang).reduce((a, arr) => a + arr.length, 0), 0);
  let html = fs.readFileSync(APP, 'utf8');
  const re = /const RAW_LAW = [\s\S]*?const RAW_LAW_END = 1;/;
  let changed;
  if (re.test(html)) {
    changed = html.match(re)[0] !== block;
    if (changed && !check) { fs.writeFileSync(APP, html.replace(re, block)); }
  } else {                       // first time — insert before QUIZ_DECKS
    changed = true;
    if (!check) fs.writeFileSync(APP, html.replace('const QUIZ_DECKS = {', block + '\nconst QUIZ_DECKS = {'));
  }
  // let the GitHub Action know whether to commit + redeploy
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\ncount=${total}\n`);
  console.log(changed ? (check ? `would update RAW_LAW (${total} questions)` : `baked RAW_LAW (${total} questions)`) : 'no change — sheets match what is baked');
})().catch(e => { console.error(e); process.exit(1); });

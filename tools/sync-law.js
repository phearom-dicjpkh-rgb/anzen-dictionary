#!/usr/bin/env node
/*
 * Bake the four Japanese-traffic-law workbooks into the RAW_LAW block in
 * app/index.html.
 *
 *   node tools/sync-law.js           # fetch + write
 *   node tools/sync-law.js --check   # report counts only
 *
 * 標識/練習 (sign/prac) still come from the original two single-language
 * workbooks (Khmer + Japanese), one tab per test:
 *   A=ID  B=問題  C=正しい(○/×/letter)  D=誤り  E=イラスト(image)  F=解説
 *
 * 仮免/本免 (kari/hon) now come from ONE bilingual workbook — the author
 * keeps Japanese and Khmer side by side per row instead of two separate
 * sheets, which used to make cross-checking a translation error a chore.
 * Each test is pre-split into same-size tabs (本免１〜５, 仮免1〜10); they're
 * concatenated in order into one flat list per language, exactly like the
 * old sheets, so lawSets() downstream is unaffected:
 *   A=ID  B=問題（日本語）  C=問題（クメール語）
 *   D=解説（日本語）        E=解説（クメール語）
 *   F=正しい(○/×/letter)   G=誤り              H=イラスト(image)
 * Readings are KEPT (these are law tests, like the mock exam).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const SHEETS = {
  km: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR1JdK3TSiNLCV-6lMUwpr9BR-Hqiel4UCLh4OaJYwqpg6ichaFIdgZ-lTFJiMbOc9LWVq5D3Z1AzGW/pub',
  ja: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSdffF7laIKJoFC8prR2FjzjhX0HC9wJbXN4CGms3RFkEhsbPtW_bK2ongDzeeaDS91Ra4VL7DJP_d2/pub',
};
const SOLO_TABS = { sign: '2054593913', prac: '675506127' };   // still single-language sheets

// bilingual 仮免/本免 workbook — one row holds both languages; tabs are
// pre-split sets, concatenated in tab order to rebuild the full list
const BILINGUAL_SHEET = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR98cZ7zTTlR1v6Ljq1dgFTdwUmepWPNHv4iaHPqsnCc9u44KvIQMy8yzoYPsl0xjudbX5Mb8TXM2py/pub';
const BILINGUAL_TABS = {
  hon:  ['1478524770', '2089886942', '1478705144', '1568819820', '257353815'],
  kari: ['879488848', '1864785491', '137344612', '346036271', '342699340', '152075713', '478501841', '1193618611', '210136720', '197200791'],
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
  } else return null;
  if (img) item.img = img;
  if (explain) item.e = explain;
  return item;
}
// A=ID B=問題 C=正しい D=誤り E=イラスト F=解説 (single-language sheets)
function toQuestions(rows) {
  const out = [];
  for (const r of rows.slice(1)) {
    const q = buildQuestion(r[1], r[2], r[3], r[4], r[5]);
    if (q) out.push(q);
  }
  return out;
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
  for (const lang of Object.keys(SHEETS)) {
    for (const key of Object.keys(SOLO_TABS)) {
      const csv = await get(csvUrl(SHEETS[lang], SOLO_TABS[key]));
      data[lang][key] = toQuestions(parseCSV(csv));
      console.log(`${lang}.${key}: ${data[lang][key].length} questions`);
    }
  }
  for (const key of Object.keys(BILINGUAL_TABS)) {
    data.km[key] = []; data.ja[key] = [];
    for (const gid of BILINGUAL_TABS[key]) {
      const csv = await get(csvUrl(BILINGUAL_SHEET, gid));
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

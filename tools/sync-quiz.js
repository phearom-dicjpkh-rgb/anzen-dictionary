#!/usr/bin/env node
/*
 * Pull the SSW exercise sheet (published Google Sheet) and rewrite the RAW_QUIZ
 * block in app/index.html — the same idea as tools/sync-words.js, for the
 * លំហាត់ questions.
 *
 *   node tools/sync-quiz.js          # fetch + write
 *   node tools/sync-quiz.js --check  # report only, change nothing
 *
 * Sheet column layout (per row):
 *   A = number   B = 問題 (question)   C = correct answer   D = wrong answers
 *   · true/false: C is 〇 or ×, D empty.
 *   · A/B/C     : C is the correct option (Ⓐ/Ⓑ/Ⓒ + text), D the other options
 *                 one per line, each prefixed with its circled letter.
 * An optional 5th column (E) is read as an image URL when present.
 *
 * Set the sheet with QUIZ_CSV_URL (…/pub?gid=0&single=true&output=csv). Multiple
 * tabs can be given comma-separated; their questions are concatenated in order.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const DEFAULT_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTgpLQfgY7O_dhxRC0MOxYzyeeM_BuHalpjng0AkJqjneCgImBFRVy6CjJCq2mlLCU3wNg0KxXNRSYg/pub?gid=0&single=true&output=csv';
const URLS = (process.env.QUIZ_CSV_URL || DEFAULT_URL).split(',').map(s => s.trim()).filter(Boolean);
const APP = path.join(__dirname, '..', 'app', 'index.html');

function get(url, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 5) return reject(new Error('too many redirects'));
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(res.headers.location, depth + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let b = ''; res.setEncoding('utf8');
      res.on('data', c => b += c); res.on('end', () => resolve(b));
    }).on('error', reject);
  });
}

function parseCSV(s) {
  const rows = []; let i = 0, cur = [''], inq = false;
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

const stripFuri = t => (t || '').replace(/\(([぀-ゟ゠-ヿー・]+)\)/g, '').trim();
function opt(s) {
  s = (s || '').trim();
  const m = s.match(/^([Ⓐ-Ⓩ])\s*([\s\S]*)$/);   // Ⓐ..Ⓩ
  return m ? { letter: m[1], text: stripFuri(m[2]) } : { letter: '', text: stripFuri(s) };
}
const CIRC = 'ⒶⒷⒸⒹ';   // ⒶⒷⒸⒹ

// A Google Drive "share" link (…/file/d/ID/view, …/open?id=ID, …/uc?id=ID) is
// not an <img> source. Rewrite it to the thumbnail endpoint, which hotlinks
// reliably. Anything else is left as-is.
function normalizeImg(url) {
  if (!url) return '';
  const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=|thumbnail\?(?:[^#]*&)?id=)([\w-]{20,})/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000`;
  return url;
}

function toQuestions(rows) {
  const out = [];
  for (const r of rows.slice(1)) {
    const q = stripFuri(r[1] || '');
    const c = (r[2] || '').trim();
    const d = (r[3] || '').trim();
    const img = normalizeImg((r[4] || '').trim());
    if (!q) continue;
    const item = {};
    if (c === '〇' || c === '×' || c === '✖') {          // 〇 / × / ✖
      item.t = 'tf'; item.q = q; item.a = (c === '〇');
    } else if (/^[Ⓐ-Ⓩ]/.test(c)) {
      const co = opt(c);
      const others = d.split(/\n+/).map(x => x.trim()).filter(Boolean).map(opt);
      const all = [co, ...others].sort((a, b) => CIRC.indexOf(a.letter) - CIRC.indexOf(b.letter));
      item.t = 'mc'; item.q = q; item.o = all.map(o => o.text);
      item.a = all.findIndex(o => o.text === co.text);
    } else continue;
    if (img) item.img = img;
    out.push(item);
  }
  return out;
}

(async () => {
  let quiz = [];
  for (const url of URLS) quiz = quiz.concat(toQuestions(parseCSV(await get(url))));
  const tf = quiz.filter(x => x.t === 'tf').length, mc = quiz.filter(x => x.t === 'mc').length;
  console.log(`fetched ${quiz.length} questions · tf ${tf} · mc ${mc} · exercises ${Math.ceil(quiz.length / 10)}`);
  if (!quiz.length) throw new Error('Refusing to write: sheet returned 0 questions.');

  const html = fs.readFileSync(APP, 'utf8');
  const m = html.match(/(const RAW_QUIZ = \[\r?\n)([\s\S]*?)(\r?\n\];)/);
  if (!m) throw new Error('RAW_QUIZ block not found in app/index.html');
  const current = JSON.parse('[' + m[2] + ']');
  if (quiz.length < current.length * 0.8) throw new Error(`Refusing: question count would drop ${current.length} → ${quiz.length}.`);

  const body = quiz.map(x => JSON.stringify(x)).join(',\n');
  if (process.argv.includes('--check')) {
    console.log(body === m[2] ? 'no change' : 'WOULD CHANGE');
    return;
  }
  fs.writeFileSync(APP, html.slice(0, m.index) + m[1] + body + m[3] + html.slice(m.index + m[0].length), 'utf8');
  console.log('wrote RAW_QUIZ to app/index.html');
})().catch(e => { console.error(e.message); process.exit(1); });

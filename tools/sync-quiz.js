#!/usr/bin/env node
/*
 * Pull the SSW exercise workbook (one published Google Sheet, several tabs) and
 * rewrite the baked question blocks in app/index.html. Same idea as
 * tools/sync-words-sheet.js, for the លំហាត់ / ប្រឡង content.
 *
 *   node tools/sync-quiz.js          # fetch + write
 *   node tools/sync-quiz.js --check  # report only, change nothing
 *
 * Three tabs, each its own gid, each baked into its own array:
 *   gid 0          -> RAW_QUIZ     លំហាត់ (10 per exercise)      furigana stripped
 *   gid 1823744360 -> RAW_IMGQUIZ  លំហាត់រូបភាព (5 per exercise) furigana stripped
 *   gid 320587093  -> RAW_EXAM     ប្រឡងសាកល្បង (50 per exam)    furigana KEPT
 *
 * Column layout is the same on every tab (per row):
 *   A = number   B = 問題 (question)   C = correct answer   D = wrong answers
 *   · true/false: C is 〇 or ×/✖, D empty.
 *   · A/B/C     : C is the correct option (Ⓐ/Ⓑ/Ⓒ + text), D the other options,
 *                 one per line, each prefixed with its circled letter.
 * Column E is an optional image URL (Drive share links are rewritten).
 * Column F is an optional explanation (ការពន្យល់) shown in the review after the
 * question is done; kept verbatim (not furigana-stripped).
 *
 * The exam keeps its 漢字(かな) readings on purpose (it forbids the dictionary),
 * so its questions and options are NOT furigana-stripped.
 *
 * Override the workbook with QUIZ_SHEET (the …/pub base, no gid/query).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const SHEET = (process.env.QUIZ_SHEET || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTgpLQfgY7O_dhxRC0MOxYzyeeM_BuHalpjng0AkJqjneCgImBFRVy6CjJCq2mlLCU3wNg0KxXNRSYg/pub').replace(/\?.*$/, '');
const SOURCES = [
  { gid: '0',          block: 'RAW_QUIZ',    size: 10, keepFuri: false },
  { gid: '1823744360', block: 'RAW_IMGQUIZ', size: 5,  keepFuri: false },
  { gid: '320587093',  block: 'RAW_EXAM',    size: 50, keepFuri: true },
];
const csvUrl = gid => `${SHEET}?gid=${gid}&single=true&output=csv`;
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
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
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

// strip 漢字(かな)-style furigana: half-width parens holding only kana
const stripFuri = t => (t || '').replace(/\(([぀-ゟ゠-ヿー・]+)\)/g, '').trim();
const OPT_LETTER = /[Ⓐ-Ⓩ]|[Ａ-Ｚ]|[A-Za-z]/;   // circled, full-width, or ascii
// 0-based index of an option letter (A=0…), whatever its style
function letterIdx(ch) {
  if (ch >= 'Ⓐ' && ch <= 'Ⓩ') return ch.codePointAt(0) - 0x24B6;
  if (ch >= 'Ａ' && ch <= 'Ｚ') return ch.codePointAt(0) - 0xFF21;
  return ch.toUpperCase().charCodeAt(0) - 65;
}
// parse "Ⓐ text" / "A　text" / "Ⓒ" into { idx, text }; idx<0 if no leading letter
function opt(s, keepFuri) {
  s = (s || '').trim();
  const clean = x => (keepFuri ? x.trim() : stripFuri(x));
  const m = s.match(new RegExp('^(' + OPT_LETTER.source + ')[\\s.、．)）:：]*([\\s\\S]*)$'));
  return m ? { idx: letterIdx(m[1]), text: clean(m[2].trim()) } : { idx: -1, text: clean(s) };
}
// some exam MCs carry their choices inline in the question, marked by Ⓐ/Ⓑ/Ⓒ;
// split the stem from those choices. Returns null when there are no inline marks.
function splitInline(q, keepFuri) {
  const marks = [...q.matchAll(/[Ⓐ-Ⓩ]/g)];
  if (marks.length < 2) return null;
  const clean = x => (keepFuri ? x.trim() : stripFuri(x));
  const stem = clean(q.slice(0, marks[0].index).trim());
  const options = marks.map((mk, k) => {
    const end = k + 1 < marks.length ? marks[k + 1].index : q.length;
    return { idx: letterIdx(q[mk.index]), text: clean(q.slice(mk.index + 1, end).trim()) };
  });
  return { stem, options };
}

// A Google Drive "share" link (…/file/d/ID/view, …/open?id=ID, …/uc?id=ID) is
// not an <img> source. Rewrite it to the thumbnail endpoint, which hotlinks
// reliably. Anything else is left as-is.
function normalizeImg(url) {
  if (!url) return '';
  const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=|thumbnail\?(?:[^#]*&)?id=)([\w-]{20,})/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000`;
  return url;
}

const LABELS = ['A', 'B', 'C', 'D', 'E'];
function toQuestions(rows, keepFuri) {
  const out = [];
  for (const r of rows.slice(1)) {
    const rawQ = keepFuri ? (r[1] || '').trim() : stripFuri(r[1] || '');
    const c = (r[2] || '').trim();
    const d = (r[3] || '').trim();
    const img = normalizeImg((r[4] || '').trim());
    const explain = (r[5] || '').trim();
    // skip only a truly blank row; a question may be an image with no text (the
    // picture is the question) as long as it still carries an answer in C
    if (!rawQ && !c) continue;
    const item = { q: rawQ };
    if (c === '〇' || c === '×' || c === '✖') {          // 〇 / × / ✖
      item.t = 'tf'; item.a = (c === '〇');
    } else if (OPT_LETTER.test(c[0] || '')) {
      const co = opt(c, keepFuri);
      let all, correctIdx;
      if (co.text) {
        // format 1 — the option text lives in C (correct) and D (the rest). A
        // line inside D with no leading letter is a wrapped continuation of the
        // option above it, so glue it back on instead of making a phantom option.
        const others = [];
        for (const part of d.split(/\n+/).map(x => x.trim()).filter(Boolean)) {
          const o = opt(part, keepFuri);
          if (o.idx < 0 && others.length) others[others.length - 1].text += ' ' + o.text;
          else others.push(o);
        }
        all = [co, ...others].sort((a, b) => a.idx - b.idx);
        correctIdx = all.indexOf(co);
      } else {
        // C is a bare letter — the choices are inline in the question, or the
        // question is an image and the letters point at parts of the picture
        const inline = splitInline(rawQ, keepFuri);
        if (inline && inline.options.length >= 2) {
          item.q = inline.stem;
          all = inline.options.sort((a, b) => a.idx - b.idx);
        } else {
          const letters = [co, ...d.split(/\n+/).map(x => x.trim()).filter(Boolean).map(x => opt(x, keepFuri))];
          all = letters.sort((a, b) => a.idx - b.idx).map(o => ({ idx: o.idx, text: LABELS[o.idx] || '?' }));
        }
        correctIdx = all.findIndex(o => o.idx === co.idx);
      }
      item.t = 'mc'; item.o = all.map(o => o.text); item.a = correctIdx;
    } else continue;
    if (img) item.img = img;
    if (explain) item.e = explain;
    out.push(item);
  }
  return out;
}

(async () => {
  let html = fs.readFileSync(APP, 'utf8');
  let anyChanged = false, total = 0;
  const check = process.argv.includes('--check');

  for (const src of SOURCES) {
    const questions = toQuestions(parseCSV(await get(csvUrl(src.gid))), src.keepFuri);
    const tf = questions.filter(x => x.t === 'tf').length, mc = questions.filter(x => x.t === 'mc').length;
    total += questions.length;
    console.log(`${src.block}: ${questions.length} questions · tf ${tf} · mc ${mc} · sets ${Math.ceil(questions.length / src.size)}`);
    if (!questions.length) throw new Error(`Refusing: ${src.block} tab (gid ${src.gid}) returned 0 questions.`);

    const re = new RegExp('(const ' + src.block + ' = \\[\\r?\\n?)([\\s\\S]*?)(\\r?\\n?\\];)');
    const m = html.match(re);
    if (!m) throw new Error(`${src.block} block not found in app/index.html`);
    const current = m[2].trim() ? JSON.parse('[' + m[2] + ']') : [];
    if (current.length && questions.length < current.length * 0.8) {
      throw new Error(`Refusing: ${src.block} count would drop ${current.length} → ${questions.length}.`);
    }
    const body = questions.map(x => JSON.stringify(x)).join(',\n');
    if (body !== m[2]) {
      anyChanged = true;
      if (!check) html = html.slice(0, m.index) + m[1] + body + m[3] + html.slice(m.index + m[0].length);
    }
  }

  // tell a GitHub Action whether anything moved, so it commits only when needed
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${anyChanged}\ncount=${total}\n`);
  }
  if (check) { console.log(anyChanged ? 'WOULD CHANGE' : 'no change'); return; }
  if (!anyChanged) { console.log('no change — every tab matches the app'); return; }
  fs.writeFileSync(APP, html, 'utf8');
  console.log('wrote RAW_QUIZ / RAW_IMGQUIZ / RAW_EXAM to app/index.html');
})().catch(e => { console.error(e.message); process.exit(1); });

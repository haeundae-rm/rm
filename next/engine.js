// 정비보고서(.xlsx) → 룸메이드 레포트 배정표(rm_rows_MMDD.csv) — 휴대폰·PC 브라우저에서 바로 만들기
// Claude 가 쓰던 프로그램(run_rm.py · extract.py · make_rm_rows.py · verify_day.py)을 한 글자까지 같게 옮김 (2026-11-05)
// 규칙을 바꿀 때는 파이썬 쪽과 같이 바꾸고, test/engine_test.js 로 지난 정비보고서 결과가 똑같은지 대조할 것

// ---------- xlsx(zip) 열기: 필요한 파일만 풀기 (브라우저 내장 DecompressionStream)
async function inflateRaw(u8) {
  const ds = new DecompressionStream('deflate-raw');
  const buf = await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}
function zipIndex(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let e = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('엑셀(xlsx) 파일이 아닙니다');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const dec = new TextDecoder(), map = new Map();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('엑셀 파일이 깨졌습니다');
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const fl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true), name = dec.decode(u8.subarray(p + 46, p + 46 + fl));
    map.set(name, { method, csize, off });
    p += 46 + fl + xl + cl;
  }
  return {
    has: nm => map.has(nm),
    async text(nm) {
      const f = map.get(nm);
      if (!f) throw new Error('엑셀 안에 ' + nm + ' 이(가) 없습니다');
      const lh = f.off, s = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true);
      const raw = u8.subarray(s, s + f.csize);
      const out = f.method === 0 ? raw : await inflateRaw(raw);
      return new TextDecoder().decode(out);
    }
  };
}

// ---------- XML 조각 읽기 (파이썬 ElementTree 와 같은 값이 나오게)
const ent = s => s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|amp|quot|apos);/g, (m, g) =>
  g[0] === '#' ? String.fromCodePoint(g[1] === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10)) : { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[g]);
const nl = s => s.replace(/\r\n?/g, '\n');                     // XML 줄바꿈 정리 (파서와 같게)
const attr = (a, k) => { const m = new RegExp('(?:^|\\s)' + k + '="([^"]*)"').exec(a); return m ? ent(m[1]) : null; };
const tTexts = x => { let s = '', m; const re = /<t(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/t>)/g; while ((m = re.exec(x))) s += m[1] ? ent(m[1]) : ''; return s; };
// 자식 요소 하나: 내용(text) — 비었으면 null
function child(x, tag) {
  const m = new RegExp('<' + tag + '(\\s[^>]*?)?(?:\\/>|>([\\s\\S]*?)<\\/' + tag + '>)').exec(x);
  if (!m) return undefined;
  return { attrs: m[1] || '', text: m[2] ? ent(m[2]) : null, inner: m[2] || '' };
}

// ---------- 파이썬 흉내 도우미
const W = '[\\p{L}\\p{N}_]';                                  // 파이썬 \w (유니코드)
const FW = { '０': 0, '１': 1, '２': 2, '３': 3, '４': 4, '５': 5, '６': 6, '７': 7, '８': 8, '９': 9 };
const pint = s => { let n = 0; for (const ch of String(s).trim()) { const d = ch >= '0' && ch <= '9' ? +ch : FW[ch]; if (d === undefined) return NaN; n = n * 10 + d; } return n; };
const pad2 = n => (n < 10 ? '0' : '') + n;
const pyStr = v => (v === null || v === undefined ? 'None' : String(v));
function pyFloat(v) {                                          // float(str) — 안 되면 NaN
  const s = String(v).trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) { const l = s.toLowerCase(); if (/^[+-]?(inf|infinity)$/.test(l)) return l[0] === '-' ? -Infinity : Infinity; return NaN; }
  return Number(s);
}
function pyRound(x) { const f = Math.floor(x), d = x - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1); }
function colName(i) { let s = ''; while (i) { const r = (i - 1) % 26; i = Math.floor((i - 1) / 26); s = String.fromCharCode(65 + r) + s; } return s; }

// ---------- 정비보고서 → 객실·카드·단체 (extract.py)
function extractDay(ssXml, stylesXml, sheetXml) {
  const ss = [];
  if (ssXml) { let m; const re = /<si(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/si>)/g; ssXml = nl(ssXml); while ((m = re.exec(ssXml))) ss.push(tTexts(m[1] || '')); }
  stylesXml = nl(stylesXml);
  const sec = (x, tag) => { const m = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>').exec(x); return m ? m[1] : ''; };
  const items = (x, tag) => { const out = []; let m; const re = new RegExp('<' + tag + '(\\s[^>]*?)?(?:\\/>|>([\\s\\S]*?)<\\/' + tag + '>)', 'g'); while ((m = re.exec(x))) out.push({ attrs: m[1] || '', inner: m[2] || '' }); return out; };
  const fills = items(sec(stylesXml, 'fills'), 'fill'), xfs = items(sec(stylesXml, 'cellXfs'), 'xf');
  function fill(s) {
    const xf = xfs[parseInt(s || 0, 10)];
    const fid = parseInt(attr(xf.attrs, 'fillId') || 0, 10);
    const p = child(fills[fid].inner, 'patternFill');
    if (!p) return null;
    const pt = attr(p.attrs, 'patternType');
    if (pt === null || pt === 'none') return null;
    const g = child(p.inner, 'fgColor');
    if (!g) return 'x';
    return attr(g.attrs, 'rgb') || ('theme' + pyStr(attr(g.attrs, 'theme')));
  }
  const cells = new Map();
  { sheetXml = nl(sheetXml); let m; const re = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    while ((m = re.exec(sheetXml))) {
      const a = m[1], inner = m[2] || '', ref = attr(a, 'r'), ty = attr(a, 't');
      const v = child(inner, 'v'), f = child(inner, 'f');
      let val = v ? v.text : null;
      if (ty === 's' && val !== null) val = ss[parseInt(val, 10)];
      else if (ty === 'inlineStr') val = tTexts(inner);
      cells.set(ref, [val, f ? f.text : null, attr(a, 's')]);
    } }
  const V = a => (cells.get(a) || [null])[0], S = a => (cells.get(a) || [null, null, null])[2];
  const str = v => (v === null || v === undefined ? '' : String(v));
  const rooms = [], seen = new Set();
  for (let row = 240; row < 1200; row++) {
    let room = V('B' + row); const f = (cells.get('D' + row) || [null, null])[1];
    if (!room || !f) continue;
    room = String(room).trim().split('.')[0];
    if (!/^\d{3,4}$/.test(room)) continue;
    const fl = Math.floor(parseInt(room, 10) / 100);
    if (!(fl >= 4 && fl <= 31) || seen.has(room)) continue;
    if (!/^\$?[A-Z]+\$?\d+/.test(f)) continue;
    seen.add(room);
    const mm = /^\$?([A-Z]+)\$?(\d+)/.exec(f), L = mm[1], nr = parseInt(mm[2], 10), sr = nr - 1;
    rooms.push({ room, floor: fl, map_row: row, st: V(L + sr), st_fill: fill(S(L + sr)), name: V(L + nr), m1: V(L + (nr + 1)), m2: V(L + (nr + 2)),
      done: V(L + (nr + 3)), grp_fill: fill(S(L + (sr - 1))), unit: V('E' + row) });
  }
  const cards = [];
  for (const nr of [2, 5, 8, 11]) for (let ci = 2; ci < 35; ci += 2) {
    const L = colName(ci), nm = V(L + nr);
    if (nm) { const mm = /^\s*(\d+)\]\s*(.+)/.exec(nm); cards.push({ label: nm, name: (mm ? mm[2] : nm).trim(), unit: V(L + (nr + 1)), actual: V(L + (nr + 2)) }); }
  }
  function expandRooms(text) {
    const out = [];
    for (const part of str(text).split(/[,\s/·]+/)) {
      const m = /^(\d{3,4})(?:[-~](\d{1,4}))?$/.exec(part.trim());
      if (!m) continue;
      const a = parseInt(m[1], 10);
      if (m[2]) { let b = parseInt(m[2], 10); b = b >= 100 ? b : Math.floor(a / 100) * 100 + b; if (b < a || b - a > 40) continue; for (let x = a; x <= b; x++) out.push(String(x)); }
      else out.push(String(a));
    }
    return out;
  }
  function hh(v) {
    if (v === null || v === undefined || v === '') return '';
    const f = pyFloat(v);
    if (!isNaN(f) && f > 0 && f < 1) { const mins = pyRound(f * 1440); return pad2(Math.floor(mins / 60)) + ':' + pad2(mins % 60); }
    return String(v).trim();
  }
  const groups = [], themes = [];
  let hdr = null;
  for (let row = 1; row < 80; row++) if (str(V('B' + row)).trim() === '단체명') { hdr = row; break; }
  if (hdr) {
    const hc = {};
    for (let ci = 2; ci < 40; ci++) { const t = str(V(colName(ci) + hdr)).trim(); if (t && !(t in hc)) hc[t] = ci; }
    const gt = hc['입실 시간'] ? colName(hc['입실 시간']) : null, gr = hc['호실'] ? colName(hc['호실']) : null;
    const tt = hc['타입'] ? colName(hc['타입']) : null, tr = hc['타입'] ? colName(hc['타입'] + 1) : null;
    for (let row = hdr + 1; row < hdr + 20; row++) {
      const nm = str(V('B' + row)).trim();
      if (nm === '합계' || nm === '전체 단체 진행률') break;
      if (nm && gr) groups.push({ name: nm, time: gt ? hh(V(gt + row)) : '', rooms: expandRooms(V(gr + row)) });
    }
    if (tr) for (let row = hdr + 1; row < hdr + 20; row++) {
      const r = str(V(tr + row)).trim().split('.')[0];
      if (/^\d{3,4}$/.test(r)) themes.push({ room: r, type: str(V(tt + row)).trim() });
    }
  }
  return { rooms, cards, groups, themes };
}

// ---------- 객실 → 꼬리표·전달사항 (make_rm_rows.py)
const SETUP = /과도|케틀|캐틀|칼|가위|인덕션/u;
const SETUP_WORDS = /과도|케틀|캐틀|칼|가위|인덕션\s*(?:on|off)?|(?<!린넨)회수|해제|복구/giu;
const ITEMS = [['과도', /과도/u], ['칼', /칼/u], ['가위', /가위/u], ['케틀', /케틀|캐틀/u]];
const TYPE_CODE = new RegExp('(?<!' + W + ')(?!VIP(?!' + W + '))[A-Z]{3}(?!' + W + ')', 'gu');
const CAUTION = /시설|악취|막힘|고장|분실|지갑|찾기|파손|누수|냄새/u;
const D = '\\p{Nd}';
const TIME_UNTIL = new RegExp('(?:~\\s*)?(' + D + '{1,2})\\s*시\\s*(반|' + D + '{1,2}\\s*분)?\\s*(?:까지)?', 'u');
const TIME_AFTER = new RegExp('(' + D + '{1,2})\\s*시\\s*(반)?\\s*이후', 'u');
const TIME_PRIO = new RegExp('(' + D + '{1,2})\\s*시\\s*(?:(반)|(' + D + '{1,2})\\s*분)?\\s*우선', 'u');
const TIME_RANGE = new RegExp('(' + D + '{1,2})\\s*시\\s*(반)?\\s*[~\\-]\\s*(' + D + '{1,2})\\s*시\\s*(반)?', 'u');
const ORDER = ['14시까지', '마감', '테마', '재실', '연박·재입', '룸체', 'VIP', '단체', '당직', '학단 회수', '학단 복구', '학단', '주의'];
const memoOf = r => [r.m1, r.m2].filter(x => x).map(String).join(' ');
const setupKind = m => (/(?<!린넨)회수|해제|off/iu.test(m) ? '학단 회수' : /복구|인덕션\s*on/iu.test(m) ? '학단 복구' : '학단');
const setupItems = m => ITEMS.filter(([, rx]) => rx.test(m)).map(([k]) => k).join('·');

function makeRows(d, day) {
  const GROUP = {}, GTIME = {}, MEMO = {};
  for (const r of d.rooms) MEMO[String(r.room)] = memoOf(r);
  for (const g of d.groups) for (const x of g.rooms) { GROUP[x] = g.name; GTIME[x] = g.time || ''; }
  const THEME = new Set(d.themes.map(t => t.room));
  const key0 = t => ORDER.indexOf(t.split(':')[0]);
  function tagsFor(r) {
    const memo = memoOf(r), room = String(r.room);
    let tags = [], due = '', after = '';
    if (String(r.st || '') === '2') tags.push('재실');
    if ((r.st_fill || '').toUpperCase().endsWith('FFFF00')) tags.push('연박·재입');
    if (room in GROUP) tags.push('단체:' + GROUP[room]);
    else if (!d.groups.length && ['', 'FFFFFFFF', 'THEME0'].indexOf((r.grp_fill || '').toUpperCase()) < 0) tags.push('단체');
    if (THEME.has(room)) tags.push('테마');
    if (/VIP|르씨엘/iu.test(memo)) tags.push('VIP');
    if (memo.includes('룸체인지') || memo.includes('룸체')) tags.push('룸체');
    if (memo.includes('당직')) tags.push('당직');
    let m = TIME_AFTER.exec(memo);
    if (m) after = pad2(pint(m[1])) + ':' + (m[2] ? '30' : '00');
    const rng = TIME_RANGE.exec(memo);
    if (rng) { after = pad2(pint(rng[1])) + ':' + (rng[2] ? '30' : '00'); due = pad2(pint(rng[3])) + ':' + (rng[4] ? '30' : '00'); }
    for (const x of [r.m1, r.m2]) {
      const s = String(x || '');
      if (rng || s.includes('이후') || !(s.includes('까지') || s.includes('~'))) continue;
      const mm = TIME_UNTIL.exec(s);
      if (mm) {
        const h = pint(mm[1]), g2 = mm[2] || '';
        const mi = g2 === '반' ? 30 : (pint(g2.replace(/\P{Nd}/gu, '') || '0') || 0);
        if (h >= 6 && h <= 23) due = pad2(h) + ':' + pad2(mi);
      }
    }
    if (!due && !rng) {
      const mp = TIME_PRIO.exec(memo);
      if (mp) { const h = pint(mp[1]), mi = mp[2] === '반' ? 30 : pint(mp[3] || '0'); if (h >= 6 && h <= 23) due = pad2(h) + ':' + pad2(mi); }
    }
    if (!due && (tags.includes('VIP') || THEME.has(room))) due = '14:00';
    if (due) tags.push(due === '14:00' ? '14시까지' : '마감');
    if (SETUP.test(memo)) tags.push(setupKind(memo));
    if (CAUTION.test(memo)) tags.push('주의');
    tags = [...new Set(tags)].sort((a, b) => key0(a) - key0(b));
    let shown = memo.replace(TYPE_CODE, '');
    if (tags.includes('학단 회수') || tags.includes('학단 복구')) shown = shown.replace(SETUP_WORDS, ' ');
    shown = shown.replace(/\s*,\s*(?=\s|$)/gu, ' ');
    shown = shown.replace(/\s{2,}/gu, ' ').replace(/^[ ,]+|[ ,]+$/g, '');
    return { tags, due, after, shown };
  }
  function noteFor(tags, due, after, room) {
    const n = [], grp = tags.some(t => t.startsWith('단체'));
    const hm = t => t.slice(0, 2).replace(/^0+/, '') + '시' + (t.endsWith(':00') ? '' : ' ' + t.slice(3) + '분');
    if (due && after) n.push(hm(after) + '~' + hm(due) + ' 사이 정비');
    else if (due) n.push(due.slice(0, 2).replace(/^0+/, '') + '시' + (due.endsWith(':00') ? '' : ' ' + due.slice(3) + '분') + '까지 우선 정비');
    if (after && !due) n.push(after.slice(0, 2).replace(/^0+/, '') + '시 이후 정비');
    if (tags.includes('재실')) n.push('고객 외출 시 정비');
    if (tags.includes('룸체')) n.push('룸 변경 후 정비 가능');
    if (tags.includes('당직')) n.push('퇴실 유무 문의 요망');
    if (tags.includes('테마') && !due) n.push('테마 객실 우선 정비');
    if (grp) n.push(GTIME[room] ? '입실 ' + GTIME[room] : '입실 시간 추후 공지');
    if (tags.includes('VIP') && !due) n.push('VIP 우선 정비');
    for (const [k, w] of [['학단 회수', '회수'], ['학단 복구', '복구']]) if (tags.includes(k)) {
      const mm = MEMO[room] || '', it = setupItems(mm);
      let s = '학단 비품 ' + w + (it ? ' (' + it + ')' : '');
      if (/인덕션\s*off/iu.test(mm)) s += ' · 인덕션 OFF';
      if (/인덕션\s*on/iu.test(mm)) s += ' · 인덕션 ON';
      n.push(s);
    }
    if (tags.includes('학단')) n.push('학단 비품 확인 (메모 참고)');
    return n.join(' · ');
  }
  const order = d.cards.map(c => c.name), per = new Map();
  for (const r of d.rooms) {
    if (!r.name) continue;
    const t = tagsFor(r);
    for (const nm of String(r.name).replace(/ /g, '').split(',')) if (nm) { if (!per.has(nm)) per.set(nm, []); per.get(nm).push([parseInt(r.room, 10), r.room, t]); }
  }
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const oi = n => (order.indexOf(n) >= 0 ? order.indexOf(n) : 999);
  const names = [...per.keys()].sort((a, b) => oi(a) - oi(b) || cmp(a, b));
  const rows = [];
  for (const nm of names) for (const [, room, t] of per.get(nm).sort((a, b) => a[0] - b[0]))
    rows.push([day, nm, room, t.tags.join('|'), noteFor(t.tags, t.due, t.after, String(room)), t.due, t.after, t.shown]);
  return { rows, names };
}
const csvField = s => (/[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
const toCsv = rows => [['날짜', '메이드', '객실', '꼬리표', '전달사항', '마감', '시작', '메모'], ...rows].map(r => r.map(x => csvField(String(x))).join(',') + '\r\n').join('');

// ---------- 교차 검증 (verify_day.py 의 ①~④)
const ROYAL = new Set(['3001', '3002', '3101', '3102']);
function verify(d, rows) {
  const checks = [], units = new Map(), per = new Map();
  const ok = (cond, good, bad) => checks.push({ ok: !!cond, msg: cond ? good : bad });
  for (const r of d.rooms) {
    if (!r.name) continue;
    const ns = String(r.name).replace(/ /g, '').split(',').filter(x => x);
    for (const nm of ns) { if (!per.has(nm)) per.set(nm, new Set()); per.get(nm).add(r.room); units.set(nm, (units.get(nm) || 0) + (pyFloat(r.unit || 0) || 0) / ns.length); }
  }
  ok(d.rooms.length === 417, '417실 모두 읽음', '객실 ' + d.rooms.length + '실만 읽힘 (417실이어야 함)');
  const bad = [];
  for (const c of d.cards) {
    const act = c.actual === null || c.actual === undefined ? NaN : pyFloat(c.actual);
    if (isNaN(act)) continue;
    const u = units.get(c.name) || 0;
    if (Math.abs(u - act) > 0.01 && (u || act)) bad.push(c.name + ' 카드 ' + act + ' / 객실 ' + Math.round(u * 100) / 100);
  }
  ok(!bad.length, '메이드 ' + per.size + '명 실 수 = 메이드 카드 실제 배정수', '카드와 다른 메이드: ' + bad.join(', '));
  const grp = new Set(rows.filter(r => r[3].includes('단체')).map(r => r[2]));
  if (d.groups.length) {
    const named = new Set(d.rooms.filter(r => r.name).map(r => r.room));
    const gt = new Set(d.groups.flatMap(g => g.rooms).filter(x => named.has(x))).size;
    ok(grp.size === gt, '단체 객실 ' + grp.size + '실 = 단체 현황 표', '단체 객실 레포트 ' + grp.size + ' / 표 ' + gt);
  }
  const tc = {};
  for (const r of rows) for (const t of r[3].split('|')) if (t) { const k = t.split(':')[0]; tc[k] = (tc[k] || 0) + 1; }
  return {
    ok: checks.every(c => c.ok), checks,
    maids: new Set(rows.map(r => r[1])).size, rooms: rows.length, units: rows.reduce((s, r) => s + (ROYAL.has(r[2]) ? 2 : 1), 0),
    tags: tc, groups: d.groups.map(g => ({ name: g.name, rooms: g.rooms.length, time: g.time })),
    due: rows.filter(r => r[5]).map(r => ({ due: r[5], room: r[2], maid: r[1] })).sort((a, b) => cmp3(a, b))
  };
}
const cmp3 = (a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.room < b.room ? -1 : a.room > b.room ? 1 : a.maid < b.maid ? -1 : a.maid > b.maid ? 1 : 0);

export const _test = { makeRows, toCsv };

// ---------- 한 번에: 파일 바이트 + 날짜(YYYY-MM-DD) → { csv, sheet, summary }
export async function buildFromXlsx(bytes, date) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('날짜 형식이 이상합니다: ' + date);
  const z = zipIndex(u8);
  const wb = await z.text('xl/workbook.xml'), rel = await z.text('xl/_rels/workbook.xml.rels');
  const rmap = {};
  for (const m of rel.matchAll(/<Relationship [^>]*>/g)) { const at = {}; for (const a of m[0].matchAll(/(\w+)="([^"]*)"/g)) at[a[1]] = a[2]; rmap[at.Id] = at.Target; }
  const sheets = [...wb.matchAll(/<sheet name="([^"]+)" sheetId="\d+"(?: state="\w+")? r:id="(rId\d+)"/g)].map(m => [m[1], /sheet(\d+)\.xml/.exec(rmap[m[2]])[1]]);
  const dd = String(parseInt(date.slice(8), 10));
  let pick = sheets.filter(x => x[0] === dd);
  if (!pick.length && sheets.length === 1) pick = [sheets[0]];
  if (!pick.length) throw new Error('정비보고서에서 ' + dd + '일 시트를 찾지 못했습니다 (시트: ' + sheets.map(s => s[0]).join(', ') + ')');
  const ss = z.has('xl/sharedStrings.xml') ? await z.text('xl/sharedStrings.xml') : '';
  const d = extractDay(ss, await z.text('xl/styles.xml'), await z.text('xl/worksheets/sheet' + pick[0][1] + '.xml'));
  const { rows } = makeRows(d, date);
  return { csv: toCsv(rows), rows, sheet: pick[0][0], summary: verify(d, rows), data: d };
}

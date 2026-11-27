// 📄 정비보고서 연결 (2026-11-21) — 오더테이커 PC 폴더의 정비보고서 엑셀(자동 저장)을 1분마다 읽어, 바뀐 방만 앱에 넣음
//   메이드 담당 바뀜(추가·빠짐) → days/{날}/changes (관리자 변경과 같은 줄 · sup/{날}/rm 에도 → 더티 자동 배정이 이어받음)
//   재실·시간 바뀜 → days/{날}/info/{객실} (by '보고서')
// 안전장치 (사용자 승인 11/21):
//   ① 엑셀 내용이 2분 동안 그대로일 때만 반영 (입력 중간에 저장된 반쪽 내용 거름)
//   ② 양식 검사(417실 · 카드=객실 수)가 틀리면 멈추고 알림
//   ③ 앱에서 손으로 고친 방(메이드·관리자 변경, 관리자가 바꾼 표시)은 건드리지 않고 '엑셀과 다름'으로만 보여 줌
//   ④ 이미 완료 체크된 방은 빼지 않음
//   ⑤ 한 번에 20건 넘게 바뀌면 자동 모드여도 확인을 받음 (다른 날 파일 · 아침 배정 전)
//   ⑥ 기록(uploads/rsync_{날}) · 되돌리기. 되돌린 건 · 넘긴 건은 엑셀에서 그 방이 또 바뀌기 전까지 다시 묻지 않음
//   ⑦ 연결 상태(meta/rsync)를 5분마다 남김 → 허브가 15분 넘게 소식 없으면 '끊김' 경고
//   첫 1주는 '확인 후 반영'(기본). 시험: '파일 넣어 보기'는 아무것도 바꾸지 않고 결과만 보여 줌
// 규칙 변경 없음 (changes by '관리자' · info · uploads · meta 는 관리자 쓰기 그대로)

// 📋 앱 정비보고서 날짜 (11/27 소장님: 11/28부터 앱이 원본): jbr/{날}.src === 'app' 이면 엑셀은 쉬고(읽지도 · 메이드 휴대폰에 넘기지도 않음)
//   앱 정비보고서를 읽어 엑셀 때와 똑같은 길(planSync → 관리자 변경 · 표시)로 메이드 휴대폰에. 안전장치 ③~⑥ 그대로. 폴더 연결 없어도 됨
//   앱은 한 칸씩 저장돼 반쪽 내용이 없으니 그대로인지 보는 시간은 30초
export const APP_STABLE_MS = 30000;
// 테마 객실 (매일 같은 방, 엑셀 상단 '테마 객실' 표와 같음 — hub/assignui.js THEME_ROOMS)
export const THEME_ROOMS = ['3001', '3002', '3101', '3102', '2909', '2910', '1807', '1808', '1809', '1810', '1811', '1707', '1708'];
// 앱 정비보고서 한 날 → engine makeRows 가 먹는 모양 (엑셀 buildFromXlsx 의 data 와 같은 칸)
export function appData(d) {
  const order = (d.rooms && d.rooms.length ? d.rooms : Object.keys(d.r || {})).map(String);
  return { rooms: order.filter(k => d.r && d.r[k]).map(k => { const x = d.r[k]; return { room: k, floor: Math.floor(Number(k) / 100), st: x[0] || '', st_fill: x[5] ? 'FFFFFF00' : '', name: x[1] || '', m1: x[2] || '', m2: x[3] || '', done: x[4] ? '1' : '', grp_fill: '' }; }),
    cards: (d.cards || []).map((c, i) => ({ label: (i + 1) + '] ' + c.n, name: c.n, unit: c.u, actual: '' })),
    groups: (d.groups || []).map(g => ({ name: g.name || '', time: g.time || '', rooms: String(g.rooms || '').split(',').filter(Boolean) })),
    themes: THEME_ROOMS.filter(k => d.r && d.r[k]).map(k => ({ room: k, type: '' })) };
}
export const STABLE_MS = 120000, POLL_MS = 60000, BIG = 20, HB_MS = 5 * 60000, OTHER_MS = 3 * 60000;

const uniq = a => a.filter((x, i) => a.indexOf(x) === i);
const hmK = t => { if (!t) return ''; const p = String(t).split(':'); return Number(p[0]) + '시' + (p[1] === '00' ? '' : ' ' + Number(p[1]) + '분'); };
export function timeText(after, due) { return after && due ? hmK(after) + '~' + hmK(due) : due ? hmK(due) + '까지' : after ? hmK(after) + ' 이후' : ''; }
export function showText(s) { const t = (s.tags.length ? s.tags.join('·') : '') + (s.after || s.due ? (s.tags.length ? ' · ' : '') + timeText(s.after, s.due) : ''); return t || '표시 없음'; }
const sigOf = s => s.tags.slice().sort().join(',') + '|' + (s.after || '') + '|' + (s.due || '');
export function opKey(o) { return o.k + '|' + (o.maid || '') + '|' + o.room + (o.k === '표시' ? '|' + sigOf(o.to) : ''); }

/**
 * 엑셀 배정표(rows) ↔ 지금 앱 상태 → 바꿀 것(ops) · 엑셀과 다름(diff) · 경고(warn)
 * rows: engine 행 [날짜, 메이드, 객실, 꼬리표('a|b'), 전달사항, 마감, 시작, 메모]
 * st: { maids:[{name, rooms:[{room,tags,due,after}]}], info:{객실:문서}, chg:[{id,data}], mine:{변경ID:1}, done:{객실:[메이드]}, pick:[표시], ign:{키:1} }
 */
export function planSync(rows, st) {
  const pick = st.pick, keyOf = t => String(t).split(':')[0];
  const pk = tags => uniq((tags || []).map(keyOf).filter(t => pick.indexOf(t) >= 0)).sort((a, b) => pick.indexOf(a) - pick.indexOf(b));
  const rep = {}, app = {}, eff = {}, known = {};
  rows.forEach(r => {
    const room = String(r[2]), x = rep[room] || (rep[room] = { maids: [], tags: pk(String(r[3] || '').split('|').filter(Boolean)), note: String(r[4] || ''), due: r[5] || '', after: r[6] || '' });
    if (x.maids.indexOf(r[1]) < 0) x.maids.push(r[1]);
  });
  st.maids.forEach(m => { known[m.name] = 1; m.rooms.forEach(x => { (app[x.room] = app[x.room] || []).push(m.name); if (!eff[x.room]) eff[x.room] = { tags: pk(x.tags), after: x.after || '', due: x.due || '' }; }); });
  const manual = {};
  (st.chg || []).forEach(c => { if (st.mine[c.id]) return; const d = c.data || {}; if (d.room) manual[d.room] = 1; if (d.toRoom) manual[d.toRoom] = 1; });
  const ops = [], diff = [], warn = [], held = [];
  const rooms = uniq(Object.keys(rep).concat(Object.keys(app))).sort((a, b) => Number(a) - Number(b));
  const unknown = {};
  const push = o => { if (st.ign[opKey(o)]) held.push(o); else ops.push(o); };
  rooms.forEach(room => {
    const R = rep[room] ? rep[room].maids : [], A = app[room] || [];
    let add = R.filter(n => A.indexOf(n) < 0), rem = A.filter(n => R.indexOf(n) < 0);
    add.filter(n => !known[n]).forEach(n => { unknown[n] = (unknown[n] || []).concat(room); });
    add = add.filter(n => known[n]);
    let blocked = false;
    if (add.length || rem.length) {
      if (manual[room]) { diff.push({ room, why: '앱에서 손으로 바꾼 방', rep: R, app: A }); blocked = true; }
      else {
        const dn = (st.done[room] || []).filter(n => rem.indexOf(n) >= 0);
        if (dn.length) { diff.push({ room, why: '이미 완료 체크된 방 (' + dn.join(', ') + ')', rep: R, app: A }); rem = rem.filter(n => dn.indexOf(n) < 0); }
        rem.forEach(n => push({ k: '제외', maid: n, room }));
        add.forEach(n => push({ k: '추가', maid: n, room }));
      }
    }
    // 재실 · 시간 (엑셀에 담당이 있는 방만)
    const x = rep[room];
    if (!x || blocked || !R.some(n => known[n])) return;
    const i = st.info[room];
    const cur = eff[room] && A.some(n => R.indexOf(n) >= 0) ? eff[room]
      : i ? { tags: pk(Array.isArray(i.tags) ? i.tags : []), after: i.after || '', due: i.due || '' } : { tags: [], after: '', due: '' };   // 새로 들어오는 방 = '추가' 카드 + 남아 있는 표시
    const to = { tags: x.tags, after: x.after, due: x.due };
    if (sigOf(cur) === sigOf(to)) return;
    if (i && i.by !== '보고서') { diff.push({ room, why: '관리자가 표시를 바꾼 방', rep: R, app: A, from: cur, to }); return; }
    push({ k: '표시', room, from: cur, to, note: x.note.slice(0, 60), prev: i || null, maids: R });
  });
  Object.keys(unknown).forEach(n => warn.push(n + ' 님은 오늘 앱 배정에 없어요 (' + unknown[n].join(', ') + '호) · 새 메이드면 정비보고서를 다시 올려 주세요'));
  return { ops, diff, warn, held, rooms: Object.keys(rep).length };
}

// 같은 방의 빠짐+추가는 '담당 바뀜' 한 줄로
export function opLines(ops) {
  const out = [], by = {};
  ops.forEach(o => { if (o.k !== '표시') (by[o.room] = by[o.room] || { add: [], rem: [] })[o.k === '추가' ? 'add' : 'rem'].push(o.maid); });
  const seen = {};
  ops.forEach(o => {
    if (o.k === '표시') { out.push({ room: o.room, t: '표시', s: showText(o.from) + ' → ' + showText(o.to) }); return; }
    if (seen[o.room]) return; seen[o.room] = 1;
    const b = by[o.room];
    if (b.add.length && b.rem.length) out.push({ room: o.room, t: '담당 바뀜', s: b.rem.join('·') + ' → ' + b.add.join('·') });
    else if (b.add.length) out.push({ room: o.room, t: '추가', s: b.add.join('·') + ' 님에게' });
    else out.push({ room: o.room, t: '빠짐', s: b.rem.join('·') + ' 님 정비 대상에서' });
  });
  return out;
}

// ---------- 폴더 손잡이 보관 (브라우저 IndexedDB — 이 PC에만)
function idb() { return new Promise((res, rej) => { const r = indexedDB.open('rm_rsync', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function kvGet(k) { try { const db = await idb(); return await new Promise(res => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch (e) { return null; } }
async function kvSet(k, v) { try { const db = await idb(); await new Promise(res => { const t = db.transaction('kv', 'readwrite'); if (v === null) t.objectStore('kv').delete(k); else t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = res; }); } catch (e) {} }

// 폴더 안에서 오늘 파일 (11/22: 하위 폴더도 봄 — '26년 정비보고서' 를 고르면 '11월 정비보고서' · '12월 정비보고서' 안까지, 달마다 다시 안 골라도 됨)
//   이름에 'M월 D일' 이 있는 엑셀 중 가장 최근 저장. 다른 날짜가 적힌 파일은 쓰지 않음 (어제 파일을 오늘로 읽지 않게). ~$ 잠금 파일 뺌
export async function pickFile(dir, day) {
  const M = Number(day.slice(5, 7)), D = Number(day.slice(8, 10));
  const re = new RegExp('(^|\\D)0?' + M + '\\s*월\\s*0?' + D + '\\s*일'), dated = /\d{1,2}\s*월\s*\d{1,2}\s*일/;
  let best = null, any = null;
  async function walk(d, depth) {
    for await (const [name, h] of d.entries()) {
      if (h.kind === 'directory') { if (depth < 2 && !/^[.~$]/.test(name)) await walk(h, depth + 1); continue; }
      if (h.kind !== 'file' || !/\.xlsx$/i.test(name) || /^~\$/.test(name)) continue;
      const today = re.test(name);
      if (!today && dated.test(name)) continue;
      const f = await h.getFile(), c = { name, f };
      if (today && (!best || f.lastModified > best.f.lastModified)) best = c;
      if (!today && (!any || f.lastModified > any.f.lastModified)) any = c;
    }
  }
  await walk(dir, 0);
  return best || any;
}

const hm = ms => { if (!ms) return ''; const d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };

// 📋 정비보고서 사본 한 장 (엔진 결과 → jbr/{날}). 방 = [상태, 정비자, 메모1, 메모2, 완료 1/0, 연박(노랑) 1/0]
export function snapOf(r, roster, day, file) {
  const str = v => (v === null || v === undefined ? '' : String(v).trim());
  const rr = {};
  for (const x of r.data.rooms) {
    const st = str(x.st).replace(/\.0$/, ''), nm = str(x.name) === '0' ? '' : str(x.name);
    rr[x.room] = [st.slice(0, 20), nm.slice(0, 60), str(x.m1).slice(0, 200), str(x.m2).slice(0, 200), str(x.done) && str(x.done) !== '0' ? 1 : 0, String(x.st_fill || '').toUpperCase().endsWith('FFFF00') ? 1 : 0];
  }
  return { date: day, src: 'excel', file: String(file || '').slice(0, 80), rooms: r.data.rooms.map(x => String(x.room)), r: rr, xl: r.data.xl || {},
    cards: r.data.cards.map(c => ({ n: str(c.name).slice(0, 20), u: str(c.unit).slice(0, 10), in: str(c.in) ? 1 : 0 })),
    groups: r.data.groups.map(g => ({ name: str(g.name).slice(0, 40), time: str(g.time).slice(0, 20), rooms: g.rooms.join(',') })),
    roster: (roster || []).slice(0, 80).map(x => String(x).slice(0, 20)) };
}

export function setupSync(ctx) {
  const { S, esc } = ctx;
  const tab = (() => { try { let t = sessionStorage.getItem('rm_rsync_tab'); if (!t) { t = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('rm_rsync_tab', t); } return t; } catch (e) { return Math.random().toString(36).slice(2, 10); } })();
  const can = typeof window.showDirectoryPicker === 'function';
  let day = '', subs = [], timer = 0, running = false;
  let dir = null, perm = 'none', hb = undefined, logDoc = undefined, take = false;
  let f0 = null, hash = '', since = 0, rows = null, sheetOk = true, msg = '', checkedAt = 0, stage = 'off';
  let pend = null, lastPlan = null, waitTill = 0, lastHb = { at: 0, sig: '' }, busy = false, test = null;
  let snapSig = '', snapErr = false;

  // 📋 정비보고서 사본 (11/26): 엑셀을 읽을 때마다 그날 전체(방 · 카드 · 단체 · 명단)를 jbr/{날} 에 → 허브 '정비보고서' 화면 · 결산
  //   12/1부터 앱이 원본이 되면(src 'app') 엑셀 사본으로 덮지 않음. 내용이 같으면 안 씀
  async function saveSnap(r, buf) {
    let roster = []; try { roster = await (await ctx.engine()).readRoster(buf); } catch (e) {}
    const snap = snapOf(r, roster, day, f0 ? f0.name : '');
    const sig = JSON.stringify(snap); if (sig === snapSig) return;
    const cur = await S.get('jbr/' + day).catch(() => null);
    if (cur && cur.src === 'app') { snapSig = sig; return; }
    await S.set('jbr/' + day, Object.assign(snap, { at: S.SERVER_TIME, by: ctx.who ? String(ctx.who() || '').slice(0, 20) : '' }));
    snapSig = sig; snapErr = false;
  }

  const draw = () => ctx.render();
  const logPath = () => 'uploads/rsync_' + day;
  const L = () => logDoc || { ids: [], log: [], ign: {} };
  function mineIds() { const o = {}; (L().ids || []).forEach(id => { o[id] = 1; }); return o; }
  function state() {
    const d = ctx.data(), done = {};
    ctx.recs().forEach(r => { (done[r.room] = done[r.room] || []).push(r.maid); });
    return { maids: (d && d.maids) || [], info: ctx.info(), chg: ctx.chg(), mine: mineIds(), done, pick: ctx.pick, ign: L().ign || {} };
  }
  const mode = () => (hb && hb.mode === 'auto' ? 'auto' : 'confirm');
  const other = () => !take && hb && hb.on && hb.tab && hb.tab !== tab && Date.now() - (hb.at || 0) < OTHER_MS;

  async function start(d) {
    stop(); day = d; running = true; logDoc = undefined; hb = undefined;
    subs.push(S.listenDoc('meta/rsync', x => { hb = x || null; draw(); }, () => { hb = null; }));
    subs.push(S.listenDoc(logPath(), x => { logDoc = x || null; draw(); }, () => { logDoc = null; }));
    if (can) {
      dir = await kvGet('dir');
      if (dir) { try { perm = (await dir.queryPermission({ mode: 'read' })) === 'granted' ? 'ok' : 'ask'; } catch (e) { perm = 'ask'; } }
    }
    stage = dir ? (perm === 'ok' ? 'wait' : 'perm') : 'off';
    draw();
    timer = setInterval(() => poll(), POLL_MS);
    setTimeout(() => poll(), 1500);
  }
  function stop() { subs.forEach(f => { try { f(); } catch (e) {} }); subs = []; if (timer) clearInterval(timer); timer = 0; running = false; }

  async function heartbeat(force) {
    if (!dir || other()) return;
    const p = pend ? opLines(pend.ops).length : 0, df = lastPlan ? lastPlan.diff.length : 0;
    const sig = [stage, msg, p, df, mode(), f0 && f0.mt].join('|');
    if (!force && sig === lastHb.sig && Date.now() - lastHb.at < HB_MS) return;
    lastHb = { at: Date.now(), sig };
    try {
      await S.set('meta/rsync', { on: true, day, tab, at: S.SERVER_TIME, state: stage, msg: String(msg || '').slice(0, 200), file: f0 ? String(f0.name).slice(0, 80) : '',
        fileAt: f0 ? f0.mt : 0, pend: p, diff: df, mode: mode(), last: (L().log || []).length ? L().log[L().log.length - 1].at : 0, who: ctx.who() });
    } catch (e) { console.warn('연결 상태 저장 실패', e); }
  }

  async function readRows(buf) {
    const eng = await ctx.engine();
    const r = await eng.buildFromXlsx(buf, day);
    return r;
  }

  let src = 'excel';
  async function poll() {
    if (!running || !ctx.isAdm() || busy) return;
    if (!dir) { stage = 'off'; return; }   // 연결은 「정비보고서 연결」을 켠 PC(오더테이커) 한 곳만 — 다른 관리자 화면이 같이 넘기면 두 번 들어감
    if (hb === undefined || logDoc === undefined) return;   // 상태 · 기록 첫 읽기 전
    // 📋 앱 날짜면 엑셀 대신 앱 정비보고서 (엑셀 파일 · 폴더 권한은 안 봄)
    let jd = null; try { jd = await S.get('jbr/' + day); } catch (e) {}
    if (jd && jd.src === 'app') { if (src !== 'app') { src = 'app'; hash = ''; rows = null; f0 = null; pend = null; } return pollApp(jd); }
    if (src !== 'excel') { src = 'excel'; hash = ''; rows = null; f0 = null; pend = null; }
    try { perm = (await dir.queryPermission({ mode: 'read' })) === 'granted' ? 'ok' : 'ask'; } catch (e) { perm = 'ask'; }
    if (perm !== 'ok') { stage = 'perm'; msg = '폴더를 다시 허락해 주세요'; draw(); heartbeat(); return; }
    if (other()) { stage = 'other'; draw(); return; }
    checkedAt = Date.now();
    try {
      const c = await pickFile(dir, day);
      if (!c) { stage = 'wait'; msg = '폴더에 오늘(' + Number(day.slice(5, 7)) + '월 ' + Number(day.slice(8, 10)) + '일) 정비보고서 엑셀이 아직 없어요'; draw(); heartbeat(); return; }
      const changed = !f0 || f0.name !== c.name || f0.mt !== c.f.lastModified || f0.size !== c.f.size;
      if (changed) {
        const buf = await c.f.arrayBuffer(), r = await readRows(buf);
        const h = JSON.stringify(r.rows.map(x => x.slice(1, 7)));
        const first = !f0;
        f0 = { name: c.name, mt: c.f.lastModified, size: c.f.size };
        sheetOk = r.summary.ok;
        if (sheetOk) saveSnap(r, buf).catch(e => { if (!snapErr) console.warn('정비보고서 사본 저장 실패 (규칙 v32 게시 전이면 정상)', e); snapErr = true; });
        if (!sheetOk) { stage = 'stop'; msg = '양식 검사에서 다른 점: ' + r.summary.checks.filter(x => !x.ok).map(x => x.msg).join(' / '); rows = null; hash = ''; draw(); heartbeat(); return; }
        if (h !== hash) { hash = h; rows = r.rows; since = first && c.f.lastModified < Date.now() - STABLE_MS ? c.f.lastModified : Date.now(); }
      }
      if (!rows) { draw(); return; }
      if (Date.now() - since < STABLE_MS) { stage = 'wait'; msg = '엑셀 저장 뒤 2분 그대로인지 보는 중'; draw(); heartbeat(); return; }
      const d = ctx.data();
      if (!d || d.noPlan || !d.maids.length) { stage = 'noplan'; msg = '오늘 배정이 앱에 아직 없어요 (아침 정비보고서 올리기 먼저)'; pend = null; draw(); heartbeat(); return; }
      if (Date.now() < waitTill) return;
      const p = planSync(rows, state());
      lastPlan = p;
      stage = 'ok'; msg = '';
      if (!p.ops.length) { pend = null; draw(); heartbeat(); return; }
      if (mode() === 'auto' && p.ops.length <= BIG) { await apply(p.ops, '자동'); return; }
      pend = { ops: p.ops, at: Date.now(), big: p.ops.length > BIG };
      draw(); heartbeat();
    } catch (e) {
      stage = 'stop'; msg = String(e && e.message || e).slice(0, 200); draw(); heartbeat();
      if (ctx.report) ctx.report('보고서 연결', msg);
    }
  }

  async function pollApp(jd) {
    if (other()) { stage = 'other'; draw(); return; }
    checkedAt = Date.now();
    try {
      const eng = await ctx.engine(), r = eng._test.makeRows(appData(jd), day);
      const h = JSON.stringify(r.rows.map(x => x.slice(1, 7))), at = Number(jd.at) || 0;
      const first = !f0;
      f0 = { name: '📋 정비보고서 앱', mt: at, size: 0 }; sheetOk = true;
      if (h !== hash) { hash = h; rows = r.rows; since = first && at && at < Date.now() - APP_STABLE_MS ? at : Date.now(); }
      if (Date.now() - since < APP_STABLE_MS) { stage = 'wait'; msg = '앱 정비보고서가 바뀐 뒤 30초 그대로인지 보는 중'; draw(); heartbeat(); return; }
      const d = ctx.data();
      if (!d || d.noPlan || !d.maids.length) { stage = 'noplan'; msg = '오늘 배정이 메이드 앱에 아직 없어요 (밤 자동 배정 확정이 먼저)'; pend = null; draw(); heartbeat(); return; }
      if (Date.now() < waitTill) return;
      const p = planSync(rows, state());
      lastPlan = p; stage = 'ok'; msg = '📋 앱 정비보고서 연결 중 (엑셀은 쉼)';
      if (!p.ops.length) { pend = null; draw(); heartbeat(); return; }
      if (mode() === 'auto' && p.ops.length <= BIG) { await apply(p.ops, '자동'); return; }
      pend = { ops: p.ops, at: Date.now(), big: p.ops.length > BIG };
      draw(); heartbeat();
    } catch (e) {
      stage = 'stop'; msg = String(e && e.message || e).slice(0, 200); draw(); heartbeat();
      if (ctx.report) ctx.report('보고서 연결(앱)', msg);
    }
  }

  async function saveLog(fn) {
    const cur = L(), next = { csv: '', kind: 'rsync', date: day, ids: (cur.ids || []).slice(), log: (cur.log || []).slice(), ign: Object.assign({}, cur.ign || {}) };
    fn(next);
    next.ids = next.ids.slice(-2000); next.log = next.log.slice(-100);
    logDoc = next;
    await S.set(logPath(), Object.assign({}, next, { at: S.SERVER_TIME }));
  }

  async function doOps(ops) {
    const done = [];
    for (const o of ops) {
      if (o.k === '표시') {
        await S.set('days/' + day + '/info/' + o.room, { tags: o.to.tags, after: o.to.after, due: o.to.due, note: o.note || '', by: '보고서', at: S.SERVER_TIME });
        done.push({ k: '표시', room: o.room, from: o.from, to: o.to, prev: o.prev ? { tags: o.prev.tags || [], after: o.prev.after || '', due: o.prev.due || '', note: o.prev.note || '', by: o.prev.by || '' } : null });
      } else {
        const r = ctx.change(o.k, o.maid, o.room);
        done.push({ k: o.k, maid: o.maid, room: o.room, id: r.id });
      }
    }
    return done;
  }

  async function apply(ops, how) {
    if (busy) return; busy = true; draw();
    try {
      // 누르는 사이 앱이 바뀌었을 수 있어 다시 계산 → 확인한 것 중 아직 필요한 것만
      const want = {}; ops.forEach(o => { want[opKey(o)] = 1; });
      const p = planSync(rows, state()), go = p.ops.filter(o => want[opKey(o)]);
      const done = await doOps(go);
      await saveLog(n => { done.forEach(x => { if (x.id) n.ids.push(x.id); }); if (done.length) n.log.push({ at: Date.now(), how, file: f0 ? f0.name : '', ops: done, undo: false }); });
      pend = null; waitTill = Date.now() + 5000;
      ctx.say && ctx.say('정비보고서 변경 ' + opLines(done).length + '건을 앱에 반영했어요.');
    } catch (e) { msg = '반영 중 오류: ' + String(e && e.message || e); stage = 'stop'; }
    busy = false; draw(); heartbeat(true);
  }

  async function skip() {
    if (!pend) return;
    const ops = pend.ops;
    await saveLog(n => { ops.forEach(o => { n.ign[opKey(o)] = 1; }); });
    pend = null; draw(); heartbeat(true);
  }

  async function undo(i) {
    const b = (L().log || [])[i]; if (!b || b.undo || busy) return;
    busy = true; draw();
    try {
      const back = [];
      for (const o of b.ops.slice().reverse()) {
        if (o.k === '표시') {
          if (o.prev) await S.set('days/' + day + '/info/' + o.room, Object.assign({}, o.prev, { at: S.SERVER_TIME }));
          else await S.del('days/' + day + '/info/' + o.room);
        } else back.push(ctx.change(o.k === '추가' ? '제외' : '추가', o.maid, o.room).id);
      }
      await saveLog(n => {
        back.forEach(id => n.ids.push(id));
        n.log[i] = Object.assign({}, n.log[i], { undo: true, undoAt: Date.now() });
        b.ops.forEach(o => { n.ign[opKey(o.k === '표시' ? { k: '표시', room: o.room, to: o.to } : o)] = 1; });
      });
      waitTill = Date.now() + 5000;
      ctx.say && ctx.say('되돌렸어요. 엑셀에서 그 방이 다시 바뀌기 전까지는 묻지 않아요.');
    } catch (e) { msg = '되돌리기 오류: ' + String(e && e.message || e); }
    busy = false; draw(); heartbeat(true);
  }

  async function pickDir() {
    try {
      const h = await window.showDirectoryPicker({ id: 'rm-report', mode: 'read' });
      dir = h; perm = 'ok'; await kvSet('dir', h);
      f0 = null; hash = ''; rows = null; take = true; stage = 'wait';
      draw(); heartbeat(true); poll();
    } catch (e) { if (e && e.name !== 'AbortError') { msg = '폴더를 열지 못했어요: ' + (e.message || e); draw(); } }
  }
  async function askPerm() {
    if (!dir) return pickDir();
    try { perm = (await dir.requestPermission({ mode: 'read' })) === 'granted' ? 'ok' : 'ask'; } catch (e) { perm = 'ask'; }
    if (perm === 'ok') { stage = 'wait'; draw(); poll(); } else draw();
  }
  async function off() {
    dir = null; perm = 'none'; f0 = null; rows = null; hash = ''; pend = null; stage = 'off'; await kvSet('dir', null);
    try { await S.set('meta/rsync', { on: false, day, tab, at: S.SERVER_TIME, state: 'off', msg: '', file: '', fileAt: 0, pend: 0, diff: 0, mode: mode(), last: 0, who: ctx.who() }); } catch (e) {}
    draw();
  }
  async function setMode(m) {
    try { await S.set('meta/rsync', Object.assign({}, hb || {}, { mode: m, at: S.SERVER_TIME, tab: dir ? tab : (hb && hb.tab) || '', on: !!(dir || (hb && hb.on)), day })); } catch (e) {}
  }

  // 🧪 시험: 파일 하나를 넣어 보면 지금 앱과 비교만 (아무것도 안 바꿈)
  function pickTest() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.xlsx'; inp.style.display = 'none';
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
      test = { file: f.name, busy: true }; draw();
      try {
        const r = await readRows(await f.arrayBuffer());
        test = { file: f.name, sum: r.summary, plan: r.summary.ok ? planSync(r.rows, state()) : null };
      } catch (e) { test = { file: f.name, err: String(e && e.message || e) }; }
      draw();
    });
    document.body.appendChild(inp); inp.click();
  }

  // ---------- 화면
  function listHtml(lines) { return '<div class="list">' + lines.map(x => '<div class="r"><span><b>' + esc(x.room) + '</b> · ' + esc(x.t) + '<br><small>' + esc(x.s) + '</small></span><span></span></div>').join('') + '</div>'; }
  function diffHtml(d) {
    return '<div class="list">' + d.map(x => '<div class="r"><span><b>' + esc(x.room) + '</b> · ' + esc(x.why) + '<br><small>엑셀: ' + esc(x.to ? showText(x.to) : (x.rep.join('·') || '없음')) + ' / 앱: ' + esc(x.from ? showText(x.from) : (x.app.join('·') || '없음')) + '</small></span><span></span></div>').join('') + '</div>';
  }
  function statusLine() {
    const age = f0 ? Math.round((Date.now() - f0.mt) / 60000) : 0;
    const S0 = {
      off: ['', '아직 연결 안 됨'], perm: ['bad', '🔓 폴더를 다시 허락해 주세요 (크롬을 다시 켜면 한 번 더 눌러야 해요)'],
      wait: ['wait', '⏳ ' + (msg || '읽는 중…')], noplan: ['wait', '⏳ ' + msg], other: ['wait', '다른 창(또는 다른 PC)에서 이미 연결 중이에요 · ' + esc(hb && hb.who || '')],
      stop: ['bad', '⛔ 멈춤 · ' + msg], ok: ['ok', '✅ 연결됨 · 엑셀과 앱이 ' + (pend ? '다른 곳 ' + opLines(pend.ops).length + '건 (아래에서 확인)' : '맞아요')]
    }[stage] || ['', ''];
    return '<div class="relay' + (S0[0] === 'bad' ? ' bad' : '') + '">' + esc(S0[1]) + '</div>' +
      (f0 ? '<p class="rec" style="margin:6px 0 0">📄 ' + esc(f0.name) + ' · 마지막 저장 ' + hm(f0.mt) + (age >= 1 ? ' (' + age + '분 전)' : '') + (checkedAt ? ' · 확인 ' + hm(checkedAt) : '') + '</p>' : '');
  }
  function html() {
    let h = '<div class="card rscard"><h3>📄 정비보고서 연결 <small style="font-weight:400;color:var(--muted)">엑셀 → 앱 자동 반영</small></h3>';
    if (!can) h += '<p class="rec">이 브라우저는 폴더 연결을 못 해요. <b>오더테이커 PC의 크롬(또는 엣지)</b>에서 이 화면을 열어 주세요. 아래 시험(파일 넣어 보기)은 여기서도 돼요.</p>';
    else if (!dir) h += '<p class="rec" style="margin:0 0 8px">정비보고서가 저장되는 <b>바탕화면 폴더</b>를 한 번 골라 주세요 (예: <b>26년 정비보고서</b> — 안의 달별 폴더까지 봐요). 그 뒤로는 1분마다 파일을 보고, 바뀐 방(추가·빠짐·재실·시간)만 메이드 화면과 정비보조 더티에 넣어요. 이 창은 켜 둬 주세요.</p>' +
      '<button class="go upbtn" data-rs="dir">📁 정비보고서 폴더 고르기</button>';
    else {
      h += statusLine();
      if (stage === 'perm') h += '<button class="go upbtn" data-rs="perm" style="margin-top:8px">🔓 다시 허락하기</button>';
      if (stage === 'other') h += '<button class="ghost" data-rs="take" style="margin-top:8px">이 창에서 연결하기</button>';
    }
    if (dir || (hb && hb.on)) {
      const m = mode();
      h += '<p class="sec" style="margin:12px 0 4px">반영 방법</p><div class="seg2"><button data-rs="mode:confirm" aria-pressed="' + (m === 'confirm') + '">확인 후 반영 (첫 1주)</button><button data-rs="mode:auto" aria-pressed="' + (m === 'auto') + '">자동 반영</button></div>' +
        '<p class="hint">' + (m === 'auto' ? '바뀐 방을 바로 넣어요. 한 번에 ' + BIG + '건이 넘으면 그때만 확인을 받아요.' : '바뀐 방을 아래에 보여 주고, <b>이대로 반영</b>을 눌러야 들어가요.') + '</p>';
    }
    if (dir) h += '<div class="acts" style="margin-top:6px"><button class="ghost" data-rs="dir">다른 폴더 고르기</button><button class="ghost" data-rs="off">연결 끄기</button></div>';
    h += '</div>';
    if (pend && pend.ops.length) {
      const lines = opLines(pend.ops);
      h += '<div class="card rspend"><h3>이렇게 바꿀게요 (' + lines.length + '건)</h3>' + (pend.big ? '<div class="warnbox">한 번에 ' + pend.ops.length + '건이 바뀌어요. 다른 날 파일이거나 아침 배정 전 파일인지 확인해 주세요.</div>' : '') +
        listHtml(lines) + '<div class="acts"><button data-rs="skip"' + (busy ? ' disabled' : '') + '>이번 건 넘기기</button><button class="go" data-rs="apply"' + (busy ? ' disabled' : '') + '>' + (busy ? '반영 중…' : '이대로 반영') + '</button></div>' +
        '<p class="hint">넘긴 방은 엑셀에서 그 방이 다시 바뀌기 전까지 묻지 않아요.</p></div>';
    }
    if (lastPlan && (lastPlan.diff.length || lastPlan.warn.length)) {
      h += '<div class="card"><h3>엑셀과 다름 (' + (lastPlan.diff.length + lastPlan.warn.length) + ')</h3><p class="rec" style="margin:0 0 6px">앱에서 손으로 고친 방은 엑셀이 덮어쓰지 않아요. 맞는 쪽으로 엑셀이나 앱을 고쳐 주세요.</p>' +
        (lastPlan.warn.length ? '<ul class="upchk">' + lastPlan.warn.map(w => '<li class="no">⚠ ' + esc(w) + '</li>').join('') + '</ul>' : '') + diffHtml(lastPlan.diff) + '</div>';
    }
    const log = (L().log || []).map((b, i) => ({ b, i })).reverse();
    if (log.length) {
      h += '<div class="card"><h3>오늘 보고서 반영 기록</h3><div class="list">' + log.slice(0, 30).map(({ b, i }) => {
        const ls = opLines(b.ops);
        return '<div class="r"><span><b>' + hm(b.at) + '</b> · ' + esc(b.how) + ' · ' + ls.length + '건' + (b.undo ? ' · <b>되돌림</b>' : '') + '<br><small>' + esc(ls.map(x => x.room + ' ' + x.t + (x.t === '표시' ? ' ' + x.s.split(' → ')[1] : ' ' + x.s)).join(' / ').slice(0, 400)) + '</small></span><span>' +
          (b.undo ? '' : '<button class="ghost" data-rs="undo:' + i + '"' + (busy ? ' disabled' : '') + '>되돌리기</button>') + '</span></div>';
      }).join('') + '</div></div>';
    }
    h += '<div class="card rstest"><h3>🧪 시험: 파일 넣어 보기</h3><p class="rec" style="margin:0 0 8px">정비보고서 파일을 하나 고르면 <b>지금 앱과 비교해서 무엇이 바뀔지만</b> 보여 줘요. 앱은 아무것도 바뀌지 않아요.</p><button class="go upbtn" data-rs="test">시험할 파일 고르기</button>';
    if (test) {
      h += '<p class="rec" style="margin:8px 0 4px">📄 ' + esc(test.file) + '</p>';
      if (test.busy) h += '<p class="rec">읽는 중…</p>';
      else if (test.err) h += '<p class="err">' + esc(test.err) + '</p>';
      else if (!test.plan) h += '<div class="warnbox"><b>양식 검사에서 다른 점이 있어요 → 연결이었다면 멈추고 알렸을 거예요.</b><br>' + esc(test.sum.checks.filter(x => !x.ok).map(x => x.msg).join(' / ')) + '</div>';
      else {
        const tl = opLines(test.plan.ops);
        h += '<p class="rec"><b>시험 결과 — 앱은 바꾸지 않았어요.</b> 바뀔 것 ' + tl.length + '건 · 엑셀과 다름 ' + test.plan.diff.length + '건' + (test.plan.held.length ? ' · 넘긴/되돌린 것 ' + test.plan.held.length + '건' : '') + '</p>' +
          (tl.length ? listHtml(tl) : '<p class="rec">바뀔 것이 없어요 (엑셀 = 앱).</p>') +
          (test.plan.ops.length > BIG ? '<div class="warnbox">' + test.plan.ops.length + '건이라 자동 모드여도 확인을 받았을 거예요.</div>' : '') +
          (test.plan.warn.length ? '<ul class="upchk">' + test.plan.warn.map(w => '<li class="no">⚠ ' + esc(w) + '</li>').join('') + '</ul>' : '') +
          (test.plan.diff.length ? '<p class="sec" style="margin:10px 0 4px">엑셀과 다름 (손대지 않을 방)</p>' + diffHtml(test.plan.diff) : '');
      }
      h += '<div class="acts" style="margin-top:8px"><button class="ghost" data-rs="testx">시험 결과 닫기</button></div>';
    }
    return h + '</div>';
  }
  // 관리자 화면 맨 위 빨간 띠용
  function alert() {
    if (!dir) return '';
    if (stage === 'perm') return '🔓 정비보고서 연결 · 폴더를 다시 허락해 주세요';
    if (stage === 'stop') return '⛔ 정비보고서 연결 멈춤 · ' + msg;
    if (pend && pend.ops.length) return '📄 정비보고서 변경 ' + opLines(pend.ops).length + '건 확인 대기';
    return '';
  }
  function click(t) {
    const b = t.closest && t.closest('[data-rs]'); if (!b) return false;
    const a = b.getAttribute('data-rs');
    if (a === 'dir') pickDir();
    else if (a === 'perm') askPerm();
    else if (a === 'take') { take = true; poll(); }
    else if (a === 'off') off();
    else if (a.indexOf('mode:') === 0) setMode(a.slice(5));
    else if (a === 'apply' && pend) apply(pend.ops, '확인 · ' + (ctx.who() || '관리자'));
    else if (a === 'skip') skip();
    else if (a.indexOf('undo:') === 0) undo(Number(a.slice(5)));
    else if (a === 'test') pickTest();
    else if (a === 'testx') { test = null; draw(); }
    return true;
  }
  return { start, stop, html, click, alert, poll, _t: { get stage() { return stage; }, get pend() { return pend; } } };
}

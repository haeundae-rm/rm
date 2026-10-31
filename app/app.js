// 정비 레포트 새 앱 (Firebase) — 화면·동작은 지금 앱(Apps Script Index.html + 효과음)과 같게, 저장만 Firestore
// 2026-10-31 Firebase 이전 4단계. 데이터 읽기·쓰기는 store.js 한 곳
import * as S from './store.js';

const APP_VER = '2026.10.31-1';
// 관리자 = 보안 규칙 isAdmin 과 같은 목록 (UID 는 공개돼도 되는 값)
const ADMINS = [
  { uid: 'iw2orXgIgPgTbLUQa0b41XJ9Dvd2', label: '소장', email: 'unieshaeundae+admin@gmail.com' },
  { uid: 'Fz4T5ZzIxShOdVkNpF9gzMmOLED2', label: '부소장', email: 'unieshaeundae+sub@gmail.com' }
];
const BOT_UID = 'wytSL9o4vvN4U2G3z6R64hafC9t2';
const OLD_APP = 'https://script.google.com/macros/s/AKfycbzZt79EW2oUCbcfayJ-TDzV8Bb3uxo67VzbFqC0ACy-Savl-LhrrDEvsdCR4vvKTvFF/exec';
const ITEMS = [
  { key: '이불장', detail: '내부 먼지 · 침구류 겉면 머리카락' },
  { key: '화장실', detail: '바닥 머리카락 · 변기 이물질 · 배수구 머리카락' },
  { key: '냉장고', detail: '전 투숙객 흔적 · 먹다 남은 생수 · 냉기 정상 유무' },
  { key: '쓰레기통', detail: '전 투숙객 흔적' }
];
// 실제 객실 417실 (정비보고서 매핑표 기준) — 없는 호수 오타 막기
const ALL_ROOMS = new Set(('401 402 403 404 405 406 407 408 409 ' + range2(5, 22, 17) + ' ' +
  [23, 24, 25, 26].map(f => [1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17].map(l => f * 100 + l).join(' ')).join(' ') + ' ' +
  [27, 28].map(f => [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12].map(l => f * 100 + l).join(' ')).join(' ') +
  ' 2901 2907 2908 2909 2910 2911 3001 3002 3007 3008 3009 3010 3011 3101 3102 3107 3108 3109 3110 3111').split(' '));
function range2(a, b, n) { const o = []; for (let f = a; f <= b; f++) for (let l = 1; l <= n; l++) o.push(f * 100 + l); return o.join(' '); }
const ROYAL = { '3001': 1, '3002': 1, '3101': 1, '3102': 1 };
const TAGC = { '14시까지': '--t-due', '마감': '--t-due', '테마': '--t-theme', '재실': '--t-stay', '연박·재입': '--t-ext', '룸체': '--t-pink', 'VIP': '--t-vip', '단체': '--t-grp', '당직': '--t-duty', '학단 복구': '--t-set', '주의': '--t-care', '추가': '--t-room', '로얄': '--t-royal' };
const DARKTXT = { '테마': 1, '당직': 1 }, LIGHT = { '학단 복구': 1 };
const VENT_FROM = '12:00', VENT_TO = '13:30';

// ---------- 상태
let user = null, isAdm = false, me = null, devState = 'wait';   // devState: wait / none / ok
let today = seoulDate(), dayDoc = undefined, dayCache = false, cacheSince = 0;
let myPlan = null, plans = {}, chgDocs = [], recDocs = [], ackDocs = [], notices = [], devices = [], relay = null;
let roomInfo = {}, infoAsked = {}, pastAcks = {};
let data = null, recs = {}, pend = {}, dlg = null, busy = false, viewMaid = null;
let subs = [], meSubs = [], newVer = '';
const W = room => (ROYAL[room] ? 2 : 1);

// ---------- 도구
const $ = s => document.querySelector(s);
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
function lsJson(k, d) { try { return JSON.parse(lsGet(k) || 'null') || d; } catch (e) { return d; } }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function seoulDate(t) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(t ? new Date(t) : new Date()); }
function addDays(d, n) { const x = new Date(d + 'T12:00:00+09:00'); x.setTime(x.getTime() + n * 864e5); return seoulDate(x); }
function hm(ms) { if (!ms) return ''; const d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
function nowHM() { return hm(Date.now()); }
function labelOf(d) { const x = new Date(d + 'T00:00:00+09:00'); return (x.getMonth() + 1) + '월 ' + x.getDate() + '일 (' + '일월화수목금토'[x.getDay()] + ')'; }
function maidOf(n) { return data ? data.maids.filter(m => m.name === n)[0] || null : null; }
function roomOf(m, r) { return m.rooms.filter(x => x.room === r)[0] || null; }
function RK(name, room) { return isAdm ? room + '|' + name : room; }
function recOf(name, room) { return recs[RK(name, room)]; }
function totalUnits(m) { return m.rooms.reduce((s, x) => s + W(x.room), 0); }
function doneCount(m) { return m.rooms.reduce((s, x) => s + (recOf(m.name, x.room) ? W(x.room) : 0), 0); }
function tagKey(t) { return String(t).split(':')[0]; }
function tagHtml(t, label) {
  const k = tagKey(t), nm = String(t).indexOf(':') > 0 ? String(t).slice(String(t).indexOf(':') + 1) : '';
  return '<span class="tag' + (LIGHT[k] ? ' light' : '') + (DARKTXT[k] ? ' dk' : '') + '" style="--c:var(' + (TAGC[k] || '--t-set') + ')">' + esc(label || (nm ? k + ' · ' + nm : k)) + '</span>';
}
function tagsHtml(x) { return (ROYAL[x.room] ? tagHtml('로얄', '로얄 · 2실') : '') + x.tags.filter(t => t !== '14시까지' && t !== '마감').map(t => tagHtml(t, '')).join(''); }
function sortRooms(m) { return m.rooms.slice().sort((a, b) => Number(a.room) - Number(b.room)); }
function errText(e) {
  const c = String(e && e.code || '');
  if (c === 'permission-denied') return '권한이 없어서 저장하지 못했어요.';
  if (c === 'unavailable' || c === 'auth/network-request-failed') return '인터넷 연결을 확인해 주세요.';
  if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/invalid-login-credentials') return '비밀번호가 맞지 않아요.';
  if (c === 'auth/too-many-requests') return '여러 번 틀려서 잠시 막혔어요. 몇 분 뒤 다시 해 주세요.';
  return String(e && e.message || e || '오류').replace(/^Firebase:\s*/, '');
}
function withTimeout(p, ms, msg) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]); }

// =====================================================================
// 로그인 · 구독
// =====================================================================
S.onUser(u => {
  user = u;
  if (!u) { S.signInAnon().catch(e => { $('#main').innerHTML = '<div class="notice"><strong>처음 연결하지 못했어요.</strong><br>인터넷을 켜고 앱을 다시 열어 주세요.<br><small>' + esc(errText(e)) + '</small></div>'; }); return; }
  start();
});
function stopAll() { subs.concat(meSubs).forEach(f => { try { f(); } catch (e) {} }); subs = []; meSubs = []; }
function start() {
  stopAll();
  isAdm = ADMINS.some(a => a.uid === user.uid);
  today = seoulDate(); me = null; devState = isAdm ? 'ok' : 'wait';
  dayDoc = undefined; myPlan = null; plans = {}; chgDocs = []; recDocs = []; ackDocs = []; devices = []; relay = null; pastAcks = {};
  data = null; viewMaid = null; dlg = null; drawDlg();
  const D = 'days/' + today;
  subs.push(S.listenDoc(D, (d, meta) => {
    dayDoc = d; dayCache = meta.fromCache; if (!meta.fromCache) cacheSince = 0; else if (!cacheSince) cacheSince = Date.now();
    update();
  }, e => console.warn('날짜 읽기 실패', e)));
  subs.push(S.listenQuery('notices', [], docs => { notices = docs.map(x => x.data); update(); }, e => console.warn('공지 읽기 실패', e)));
  if (isAdm) {
    subs.push(S.listenQuery(D + '/plans', [], docs => { plans = {}; docs.forEach(x => { plans[x.id] = x.data.rooms || []; }); update(); }));
    subs.push(S.listenQuery(D + '/changes', [], docs => { chgDocs = docs; update(); }));
    subs.push(S.listenQuery(D + '/recs', [], docs => { recDocs = docs; update(); }));
    subs.push(S.listenQuery(D + '/acks', [], docs => { ackDocs = docs; update(); }));
    subs.push(S.listenQuery('devices', [], docs => { devices = docs.map(x => Object.assign({ uid: x.id }, x.data)); update(); }));
    subs.push(S.listenDoc('meta/relay', d => { relay = d; update(); }));
    loadPastAcksAdmin();
  } else {
    subs.push(S.listenDoc('devices/' + user.uid, (d, meta) => {
      if (meta.pending) return;   // 서버가 등록을 받은 뒤에 본인 자료를 읽음 (먼저 읽으면 규칙에 막힘)
      const name = d && d.name || null;
      if (name !== me || devState === 'wait') { me = name; devState = name ? 'ok' : 'none'; listenMine(); }
      update();
      if (me) resendFailed();
    }, e => { console.warn('등록 확인 실패', e); devState = 'none'; update(); }));
  }
  update();
}
// 메이드 본인 것만 (규칙상 반드시 이름 조건을 붙여야 읽힘)
function listenMine() {
  meSubs.forEach(f => { try { f(); } catch (e) {} }); meSubs = [];
  myPlan = null; chgDocs = []; recDocs = []; ackDocs = []; roomInfo = {}; infoAsked = {};
  if (!me) return;
  const D = 'days/' + today, nm = me;
  const lost = e => { console.warn('읽기 거절 (등록 해제?)', e); };
  meSubs.push(S.listenDoc(D + '/plans/' + nm, d => { myPlan = d ? d.rooms || [] : null; update(); }, lost));
  meSubs.push(S.listenQuery(D + '/recs', [['maid', '==', nm]], docs => { recDocs = docs; update(); }, lost));
  meSubs.push(S.listenQuery(D + '/changes', [['parties', 'array-contains', nm]], docs => { chgDocs = docs; update(); }, lost));
  meSubs.push(S.listenQuery(D + '/acks', [['maid', '==', nm]], docs => { ackDocs = docs; update(); }, lost));
  scanPastAcks(nm);
}

// =====================================================================
// 계산: Firestore 문서 → 지금 앱(state_)과 같은 모양
// =====================================================================
function sortChg(list) {
  return list.slice().sort((a, b) => (a.data.clientAt || a.data.at || 0) - (b.data.clientAt || b.data.at || 0) || (a.data.at || 0) - (b.data.at || 0) || (a.id < b.id ? -1 : 1));
}
function steps(c) {   // 교환 문서 하나 = 예전 '넘김' 두 줄
  const d = c.data, base = { at: d.clientAt || d.at, by: d.by, id: c.id, uid: d.uid };
  if (d.kind !== '교환') return [Object.assign({}, base, { kind: d.kind, maid: d.maid, room: d.room })];
  return [Object.assign({}, base, { kind: '넘김', maid: d.maid, room: d.room, to: d.to }), Object.assign({}, base, { kind: '넘김', maid: d.to, room: d.toRoom, to: d.maid })];
}
function cloneRoom(x) { return { room: String(x.room), tags: (x.tags || []).slice(), note: x.note || '', due: x.due || '', after: x.after || '', memo: x.memo || '' }; }
function floorsOf(m) {
  const fl = []; m.rooms.forEach(x => { const f = Math.floor(Number(x.room) / 100); if (fl.indexOf(f) < 0) fl.push(f); });
  return fl.sort((a, b) => a - b).map(f => f + '층').join(' / ');
}
// 관리자: 모든 메이드 (state_ 그대로)
function buildAll() {
  const order = (dayDoc && dayDoc.maids || []).slice();
  Object.keys(plans).forEach(n => { if (order.indexOf(n) < 0) order.push(n); });
  const maids = [], byName = {};
  order.forEach(n => { if (!plans[n]) return; byName[n] = { name: n, rooms: plans[n].map(cloneRoom), removed: [] }; maids.push(byName[n]); });
  const changes = [];
  sortChg(chgDocs).forEach(cd => steps(cd).forEach(c => {
    const m = byName[c.maid], room = c.room;
    if (!m || !room) return;
    changes.push(c);
    const i = m.rooms.findIndex(x => x.room === room), j = m.removed.findIndex(x => x.room === room);
    if (c.kind === '넘김') {
      const to = byName[c.to];
      if (!to || i < 0) return;
      const x = m.rooms.splice(i, 1)[0];
      if (to.rooms.some(y => y.room === room)) return;
      if (!x.orig) x.orig = m.name;
      if (x.orig === to.name) { delete x.orig; delete x.from; } else x.from = m.name;
      to.rooms.push(x); return;
    }
    if (c.kind === '제외' && i >= 0) c.assigned = !m.rooms[i].added;
    if (c.kind === '추가') {
      if (j >= 0) { const x = m.removed.splice(j, 1)[0]; delete x.removedBy; m.rooms.push(x); }
      else if (i < 0) m.rooms.push({ room: room, tags: ['추가'], note: '', due: '', after: '', memo: '', added: true, by: c.by });
    } else if (c.kind === '제외' && i >= 0) { const x = m.rooms.splice(i, 1)[0]; x.removedBy = c.by; m.removed.push(x); }
  }));
  maids.forEach(m => { m.floors = floorsOf(m); });
  return { maids, changes };
}
// 메이드: 본인 배정 + 나와 관련된 변경만으로 내 목록 (다른 메이드 배정은 못 봄 → 교환으로 받은 객실 정보는 owners 문서에서)
function buildMine() {
  const m = { name: me, rooms: (myPlan || []).map(x => Object.assign(cloneRoom(x), { orig: me })), removed: [] };
  const origOf = {}, swaps = [];
  sortChg(chgDocs).forEach(cd => steps(cd).forEach(c => {
    if (c.kind === '넘김') {
      if (c.maid !== me && c.to !== me) return;
      swaps.push(c);
      const i = m.rooms.findIndex(x => x.room === c.room);
      if (c.maid === me) { if (i >= 0) { const x = m.rooms.splice(i, 1)[0]; origOf[c.room] = x.orig || me; } return; }
      if (i >= 0) return;
      const x = Object.assign(infoOf(c.room), { orig: origOf[c.room] || c.maid });
      if (x.orig === me) delete x.from; else x.from = c.maid;
      m.rooms.push(x); return;
    }
    if (c.maid !== me) return;
    const i = m.rooms.findIndex(x => x.room === c.room), j = m.removed.findIndex(x => x.room === c.room);
    if (c.kind === '추가') {
      if (j >= 0) { const x = m.removed.splice(j, 1)[0]; delete x.removedBy; m.rooms.push(x); }
      else if (i < 0) m.rooms.push({ room: c.room, tags: ['추가'], note: '', due: '', after: '', memo: '', added: true, by: c.by });
    } else if (c.kind === '제외' && i >= 0) { const x = m.rooms.splice(i, 1)[0]; x.removedBy = c.by; m.removed.push(x); }
  }));
  m.floors = floorsOf(m);
  // 메이드 화면: 본인이 추가했다가 뺀 객실은 숨김
  m.removed = m.removed.filter(x => !(x.added && x.removedBy === '본인'));
  return { m, swaps };
}
function infoOf(room) {
  const r = roomInfo[room];
  if (!r && !infoAsked[room]) {
    infoAsked[room] = 1;
    S.get('days/' + today + '/owners/' + room).then(o => { roomInfo[room] = (o && o.info) || { tags: [] }; update(); }).catch(() => { delete infoAsked[room]; });
  }
  return Object.assign({ room: room, tags: [], note: '', due: '', after: '', memo: '' }, r ? cloneRoom(Object.assign({ room: room }, r)) : {});
}
function activeNotices() { return notices.filter(n => (!n.from || n.from <= today) && (!n.to || n.to >= today)).sort((a, b) => (a.id < b.id ? -1 : 1)); }
function myNotices(name) { return (data && data.notices || []).filter(n => !(n.targets && n.targets.length) || n.targets.indexOf(name) >= 0); }
function ackAt(n, name) {
  const t = ackDocs.filter(a => a.data.notice === n.id && a.data.maid === name)[0];
  if (t) return t.data.at || 1;
  if (n.daily) return 0;
  if (isAdm) return pastAcks[n.id + '_' + name] || 0;
  const loc = lsJson('rm2_acks_' + name, {});
  return loc[n.id] || 0;
}
function acked(n, name) { return !!ackAt(n, name); }
// 지난 날 공지 확인 (매일 확인이 아닌 공지는 한 번만 확인하면 끝) — 하루 한 번 최근 14일 훑어서 휴대폰에 기억
function scanPastAcks(nm) {
  const k = 'rm2_ackscan_' + nm; if (lsGet(k) === today) return;
  const loc = lsJson('rm2_acks_' + nm, {}), jobs = [];
  for (let i = 1; i <= 13; i++) jobs.push(S.getQuery('days/' + addDays(today, -i) + '/acks', [['maid', '==', nm]]).then(ds => ds.forEach(d => { if (!loc[d.data.notice]) loc[d.data.notice] = d.data.at || 1; })).catch(() => {}));
  Promise.all(jobs).then(() => { if (me !== nm) return; lsSet('rm2_acks_' + nm, JSON.stringify(loc)); lsSet(k, today); update(); });
}
function loadPastAcksAdmin() {
  for (let i = 1; i <= 13; i++) S.getQuery('days/' + addDays(today, -i) + '/acks', []).then(ds => { ds.forEach(d => { const k = d.data.notice + '_' + d.data.maid; if (!pastAcks[k]) pastAcks[k] = d.data.at || 1; }); update(); }).catch(() => {});
}

let rT = 0;
function update() { if (rT) return; rT = requestAnimationFrame(() => { rT = 0; compute(); render(); maybePopup(); }); }
function compute() {
  pend = {}; recs = {};
  recDocs.forEach(x => {
    const d = x.data; if (d.status === '취소' || !d.room || !d.maid) return;
    const k = RK(d.maid, d.room);
    if (!isAdm && d.maid !== me) return;
    recs[k] = { room: d.room, maid: d.maid, status: d.status, at: d.clientAt || d.at, issues: d.issues || [], memo: d.memo || '', proxy: !!d.proxy };
    if (x.pending) pend[k] = 1;
  });
  recDocs.forEach(x => { if (x.pending && x.data.status === '취소') pend[RK(x.data.maid, x.data.room)] = 1; });
  const base = { date: today, label: dayDoc ? dayDoc.label || labelOf(today) : labelOf(today), items: ITEMS, noPlan: !dayDoc, notices: activeNotices() };
  if (isAdm) { const b = buildAll(); data = Object.assign(base, { maids: b.maids, changes: b.changes, devices: devices }); }
  else if (me) { const b = myPlan || chgDocs.length ? buildMine() : null; data = Object.assign(base, { maids: b ? [b.m] : [], swaps: b ? b.swaps : [] }); }
  else data = Object.assign(base, { maids: (dayDoc && dayDoc.maids || []).map(n => ({ name: n, rooms: [] })) });
}
function pendingCount() { return Object.keys(pend).length + chgDocs.filter(c => c.pending).length + ackDocs.filter(a => a.pending).length; }
function offline() { return !navigator.onLine || (dayCache && cacheSince && Date.now() - cacheSince > 6000); }

// =====================================================================
// 화면
// =====================================================================
const vibe = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };
function toast(msg) { const o = document.querySelector('.toast'); if (o) o.remove(); const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2700); }
function confetti() {
  const box = document.createElement('div'); box.className = 'confetti';
  const cols = ['#1E8E3E', '#D93025', '#E8710A', '#D6338A', '#F4C20D', '#3BA7E0', '#1B3A6B'];
  for (let i = 0; i < 36; i++) { const p = document.createElement('i'); p.style.left = Math.random() * 100 + '%'; p.style.background = cols[i % cols.length]; p.style.animationDelay = (Math.random() * .5) + 's'; p.style.animationDuration = (1.3 + Math.random() * .8) + 's'; box.appendChild(p); }
  document.body.appendChild(box); setTimeout(() => box.remove(), 2800);
  setTimeout(() => play('fin'), 300);
}
let note = '', noteUntil = 0;
function say(msg) { note = msg; noteUntil = Date.now() + 8000; drawSync(); }
function drawSync() {
  const el = $('#sync'); if (!el) return;
  if (Date.now() < noteUntil) { el.textContent = note; return; }
  const n = pendingCount();
  el.textContent = offline() ? '연결 끊김 · 누른 기록은 휴대폰에 보관 중' : n ? '저장 중… (' + n + '건)' : '실시간 연결됨 · ' + nowHM();
}
function bands() {
  let h = '';
  if (newVer) h += '<div class="band ver"><span>새 버전이 나왔어요.</span><button data-reload="1">새로 고침</button></div>';
  const fails = myFails();
  if (fails.length) h += '<div class="band fail"><b>⚠ 저장되지 않은 기록 ' + fails.length + '건</b>' + esc(fails.map(f => f.room + '호').join(', ')) + ' — ' +
    (me ? '다시 보내는 중이에요. 계속 남아 있으면 관리자에게 말씀해 주세요.' : '이 휴대폰 등록이 해제됐어요. 본인 이름을 다시 고르면 자동으로 다시 보내요.') +
    '<div class="acts" style="margin-top:8px"><button data-failx="1">이 안내 지우기</button></div></div>';
  if (offline()) h += '<div class="band off"><b>인터넷 연결이 끊겼어요</b>누른 기록은 휴대폰에 안전하게 보관돼요. 연결되면 자동으로 보내요.</div>';
  else { const n = pendingCount(); if (n && pendLong()) h += '<div class="band wait"><b>저장 대기 ' + n + '건</b>휴대폰에 안전하게 보관돼 있어요. 보내는 중이에요.</div>'; }
  return h;
}
let pendSince = 0;
function pendLong() { const n = pendingCount(); if (!n) { pendSince = 0; return false; } if (!pendSince) pendSince = Date.now(); return Date.now() - pendSince > 3000; }

function render() {
  drawSync();
  if (!user || (!isAdm && devState === 'wait') || dayDoc === undefined) { $('#main').innerHTML = '<div class="notice"><strong>오늘 배정을 불러오고 있어요.</strong></div>'; return; }
  $('#date').textContent = data.label;
  const y = window.scrollY;
  if (isAdm) {
    $('#bar').innerHTML = '<div class="mebar"><span class="mechip">관리자 · ' + esc((ADMINS.filter(a => a.uid === user.uid)[0] || {}).label || '') + '</span>' + noticeBtn(null) + sndBtn() + '</div>';
    if (viewMaid && maidOf(viewMaid)) renderMaid(maidOf(viewMaid), true); else { viewMaid = null; renderAdmin(); }
  } else if (!me) { $('#bar').innerHTML = ''; renderPicker(); }
  else if (data.noPlan) {
    $('#bar').innerHTML = '<div class="mebar"><span class="mechip">' + esc(me) + ' 님</span>' + noticeBtn(me) + sndBtn() + '</div>';
    $('#main').innerHTML = bands() + instHtml() + '<div class="notice"><strong>오늘 배정은 아직 준비 중이에요.</strong><br>' + esc(data.label) + ' 배정은 오전 8시 30분에 올라와요.<br>화면을 켜 두면 올라오는 대로 객실이 자동으로 나타나요.</div><button class="foot" data-admin-in="1">관리자 메뉴</button>';
  } else {
    const m = maidOf(me);
    $('#bar').innerHTML = '<div class="mebar"><span class="mechip">' + esc(me) + ' 님</span>' + noticeBtn(me) + sndBtn() + '</div>';
    if (m) renderMaid(m, false);
    else $('#main').innerHTML = bands() + '<div class="notice"><strong>오늘 ' + esc(me) + ' 님 배정 객실이 없어요.</strong><br>휴무이거나 배정이 아직 올라오지 않았어요.</div><button class="foot" data-admin-in="1">관리자 메뉴</button>';
  }
  window.scrollTo(0, y);
}
function noticeBtn(name) {
  const list = name ? myNotices(name) : (data.notices || []);
  if (!list.length) return '';
  const unread = name ? list.some(n => !acked(n, name)) : false;
  return '<button class="tbtn" data-nlist="1">공지 ' + list.length + (unread ? '<span class="dot"></span>' : '') + '</button>';
}
function renderPicker() {
  if (data.noPlan || !data.maids.length) { $('#main').innerHTML = bands() + instHtml() + '<div class="notice"><strong>오늘 배정은 아직 준비 중이에요.</strong><br>' + esc(data.label) + ' 배정이 올라오면 이름을 고를 수 있어요.</div><button class="adminin" data-admin-in="1">관리자로 보기</button>'; return; }
  $('#main').innerHTML = bands() + instHtml() + '<section class="pick"><h2>본인 이름을 골라 주세요</h2><p><b style="color:var(--ink)">꼭 본인 이름</b>을 눌러 주세요. 한 번 고르면 다음부터는 바로 본인 화면으로 열려요.</p>' +
    '<div class="names">' + data.maids.map(m => '<button data-pick="' + esc(m.name) + '">' + esc(m.name) + '</button>').join('') + '</div>' +
    '<button class="adminin" data-admin-in="1">관리자로 보기</button></section>';
}
function minsOf(t) { const p = String(t).split(':'); return Number(p[0]) * 60 + Number(p[1]); }
function hmK(t) { const p = String(t).split(':'); return Number(p[0]) + '시' + (p[1] === '00' ? '' : ' ' + Number(p[1]) + '분'); }
function addMin(t, n) { const p = t.split(':'), v = Number(p[0]) * 60 + Number(p[1]) + n; return ('0' + Math.floor(v / 60)).slice(-2) + ':' + ('0' + (v % 60)).slice(-2); }
function timeLine(x, done) {
  if (!x.due && !x.after) return '';
  const txt = x.due && x.after ? hmK(x.after) + '~' + hmK(x.due) + ' 사이 정비' : x.due ? hmK(x.due) + '까지 우선정비' : hmK(x.after) + ' 이후 정비';
  return '<span class="tl' + (done ? ' off' : '') + '">⏰ ' + txt + '</span>';
}
function leftChip(x) {
  if (!x.due) return '';
  const now = minsOf(nowHM()), d = minsOf(x.due) - now;
  if (x.after && minsOf(x.after) > now) return '';
  if (d < 0) return '<span class="left late">시간<br>지남</span>';
  if (d > 180) return '';
  return '<span class="left">' + (d >= 60 ? Math.floor(d / 60) + '시간' + (d % 60 ? '<br>' + d % 60 + '분' : '') : d + '분') + '<br><small>남음</small></span>';
}
function memoRest(x) { return String(x.memo || '').replace(/(무재실\s*)?\d{1,2}\s*시(\s*\d{1,2}\s*분|\s*반)?(\s*[~\-]\s*\d{1,2}\s*시(\s*반)?)?\s*(까지)?\s*(우선\s*정비)?/g, '').replace(/\s{2,}/g, ' ').trim(); }
function noteRest(x) { return String(x.note || '').split(' · ').filter(s => !/(까지 우선 정비|사이 정비|이후 정비)$/.test(s)).join(' · '); }
const justDone = {}, lastRem = {}, shown = {}, finArmed = {};
function roomCard(m, x) {
  const r = recOf(m.name, x.room), cls = r ? ' done' : '';
  const hot = !r && x.due && x.due <= addMin(nowHM(), 60) ? ' duehot' : '';
  const pri = !r && (x.due || x.after) ? ' pri' : '', nt = noteRest(x), mm = memoRest(x);
  const key = RK(m.name, x.room), pop = r && justDone[key] === 1;
  if (pop) justDone[key] = 2;
  const seal = r ? '<span class="seal"><i>CHECK</i><b>정비완료</b>' + (isAdm ? '<span>' + hm(r.at) + '</span>' : '<span class="ck">✔</span>') + '</span>' : '';
  return '<button class="room' + cls + pri + hot + (pop ? ' pop' : '') + '" data-room="' + esc(x.room) + '"><span class="no">' + esc(x.room) + '</span><span class="mid">' +
    timeLine(x, !!r) + (tagsHtml(x) ? '<span class="tags">' + tagsHtml(x) + '</span>' : '') +
    (nt ? '<span class="nt">' + esc(nt) + '</span>' : '') + (mm ? '<span class="mm">메모 · ' + esc(mm) + '</span>' : '') +
    (x.from ? '<span class="sw">↔ ' + esc(x.from) + ' 님과 교환한 객실</span>' : '') +
    (r && r.memo ? '<span class="memo-mk">✎ 내 메모 있음</span>' : '') +
    (pend[key] && (offline() || pendLong()) ? '<span class="pend">⏳ 휴대폰에 보관됨 · 보내는 중</span>' : '') +
    '</span><span class="st">' + (r ? '' : leftChip(x)) + '</span>' + seal + '</button>';
}
function ventKey() { return 'rm_vent_' + today; }
const ventHidden = {};
function ventHtml() { const t = nowHM(); if (t < VENT_FROM || t >= VENT_TO || lsGet(ventKey()) === '1' || ventHidden[ventKey()]) return ''; return '<div class="vent"><span class="vi">🪟</span><span class="vt"><b>12시 환기 알림제</b>점심 식사 맛있게 드시고, 드신 후 환기 부탁드립니다.</span><button data-vent="1">확인</button></div>'; }
function renderMaid(m, asAdmin) {
  const d = doneCount(m), t = totalUnits(m), rem = t - d;
  const myPend = m.rooms.some(x => pend[RK(m.name, x.room)]);
  const allDone = rem === 0 && t > 0 && !myPend;   // '끝'은 서버가 받은 뒤에
  const prev = lastRem[m.name], bump = prev !== undefined && rem < prev;
  lastRem[m.name] = rem;
  if (!asAdmin) cheer(m, d, t, rem, bump, myPend);
  const dueLeft = m.rooms.filter(x => x.due && !recOf(m.name, x.room)).sort((a, b) => (a.due < b.due ? -1 : 1));
  let html = asAdmin ? '' : bands() + instHtml() + ventHtml() + swapBanner(m);
  html += asAdmin ? '<div class="amode"><button class="ghost back" data-back="1">← 전체 현황</button><span>' + esc(m.name) + ' 님 화면 (객실을 누르면 대신 처리)</span></div>' : '';
  html += '<section class="sum' + (allDone ? ' alldone' : '') + '"><div class="who"><b>' + esc(m.name) + '</b> 님 · ' + esc(m.floors) + '</div>' +
    '<div class="left">' + (allDone ? '<span class="n">오늘 정비 끝! 🎉</span><span class="u">수고하셨어요</span>' : '<span class="u">남은 객실</span><span class="n' + (bump ? ' bump' : '') + '">' + rem + '</span><span class="u">실</span>') +
    '<span class="of">완료 ' + d + ' / ' + t + '</span></div><div class="meter"><i style="width:' + (t ? d / t * 100 : 0) + '%"></i></div>' +
    (rem === 0 && t > 0 && myPend ? '<div class="saving">⏳ 마지막 기록을 저장하는 중이에요…</div>' : '') +
    (dueLeft.length ? '<div class="alert">⏰ 시간 정해진 객실 ' + dueLeft.length + '실 남음 · ' + dueLeft.map(x => '<button class="jump" data-jump="' + esc(x.room) + '">' + esc(x.room) + ' (' + hmK(x.due) + ')</button>').join(' ') + '</div>' : '') +
    '</section>';
  html += '<p class="sec">오늘 객실</p>' + sortRooms(m).map(x => roomCard(m, x)).join('');
  html += '<button class="addbtn" data-addroom="1">+ 객실 추가</button>';
  if ((m.removed || []).length) html += '<p class="sec">정비 제외된 객실</p>' + m.removed.map(x => {
    const self = x.removedBy === '본인';
    return '<div class="room off' + (self ? ' mine' : '') + '"><span class="no">' + esc(x.room) + '</span><span class="mid"><span class="nt">' + (self ? '직접 제외한 객실이에요' : '관리자가 정비 대상에서 제외했어요') + '</span></span><span class="st">' +
      (self || asAdmin ? '<button class="restore" data-restore="' + esc(x.room) + '">다시 넣기</button>' : '제외') + '</span></div>';
  }).join('');
  html += '<p class="sec" style="font-weight:500">객실을 누르면 자가인스펙션 4개 항목을 확인하고 완료할 수 있어요.</p>';
  if (!asAdmin) html += '<p class="sec" style="font-weight:500">📅 내 근무 · 연차 신청은 시험 기간 동안 지금 쓰시는 앱에서 해 주세요.</p><button class="foot" data-admin-in="1">관리자 메뉴</button>';
  $('#main').innerHTML = html;
}
// 절반 응원은 바로, 마지막 폭죽은 서버 저장 확인 뒤
function cheer(m, d, t, rem, bump, myPend) {
  const k = today + '|' + m.name;
  if (bump && rem === 0) finArmed[k] = 1;
  if (rem !== 0) delete finArmed[k];
  if (finArmed[k] && !myPend) {
    delete finArmed[k];
    if (!shown['fin' + k] && lsGet('rm_fin_' + k) !== '1') { shown['fin' + k] = 1; lsSet('rm_fin_' + k, '1'); confetti(); toast('오늘 정비 끝! 수고하셨어요 🎉'); }
    return;
  }
  if (bump && rem > 0 && t >= 4 && d * 2 >= t && !shown['half' + k] && lsGet('rm_half_' + k) !== '1') { shown['half' + k] = 1; lsSet('rm_half_' + k, '1'); toast('절반 왔어요! 👍'); setTimeout(() => play('half'), 350); }
}
// 교환 알림: 내가 직접 한 교환은 빼고, '확인' 누른 교환은 다시 안 보임 (휴대폰에 기억)
function swapKey() { return 'rm2_swapseen_' + today + '_' + (me || ''); }
function swapNew() { const seen = lsJson(swapKey(), []); return (data.swaps || []).filter(c => c.uid !== user.uid && seen.indexOf(c.id) < 0); }
function swapBanner(m) {
  const lines = swapNew().map(c => (c.to === m.name ? '<b>' + esc(c.room) + '호</b>를 ' + esc(c.maid) + ' 님에게서 받았어요' : '<b>' + esc(c.room) + '호</b>는 ' + esc(c.to) + ' 님에게 넘겼어요'));
  if (!lines.length) return '';
  return '<div class="swapban">🔄 <b>객실이 교환됐어요</b><br>' + lines.join('<br>') + '<div class="acts"><button class="go" data-swapok="1">확인</button></div></div>';
}
function relayLine() {
  if (!relay || !relay.at) return '<span class="relay bad">중계 상태를 아직 못 받았어요</span>';
  const min = Math.max(0, Math.round((Date.now() - relay.at) / 60000)), bad = !relay.ok || min > 12;
  return '<span class="relay' + (bad ? ' bad' : '') + '">시트 중계 ' + (min ? min + '분 전' : '방금') + ' · ' + (relay.ok ? '정상' : '오류: ' + esc(String(relay.err || '').slice(0, 80))) + (min > 12 ? ' · 오래 멈춤' : '') + '</span>';
}
function renderAdmin() {
  let all = 0, done = 0; const issues = [], dueRows = [];
  data.maids.forEach(m => m.rooms.forEach(x => {
    all += W(x.room); const r = recOf(m.name, x.room); if (r) done += W(x.room);
    if (r && (r.memo || r.status === '이상')) issues.push({ m, x, r });
    if (x.due && !r) dueRows.push({ m, x });
  }));
  dueRows.sort((a, b) => (a.x.due < b.x.due ? -1 : a.x.due > b.x.due ? 1 : Number(a.x.room) - Number(b.x.room)));
  const now = nowHM(), nts = data.notices || [];
  let html = bands() + '<div class="amode"><b>관리자 모드</b><span class="trial">새 앱 시험</span><span>메이드를 누르면 그 화면을 볼 수 있어요.</span>' +
    '<a class="ghost" href="' + OLD_APP + '" target="_blank" rel="noopener">📢 공지 · 📋 연차 관리 (기존 앱)</a><button class="ghost" data-admin-off="1">관리자 모드 끄기</button></div>' +
    '<div>' + relayLine() + '</div>' +
    (data.noPlan ? '<div class="alert" style="margin-top:0">⚠ 오늘 배정이 아직 앱에 없어요. 더티 배분 폴더에 오늘 rm_rows 파일을 올리면 1~2분 안에 들어와요.</div>' : '') +
    '<div class="kpis"><div class="kpi"><b>' + done + '<small style="font-size:14px">/' + all + '</small></b><span>완료 객실</span></div><div class="kpi"><b>' + dueRows.length + '</b><span>시간 정해진 미완료</span></div><div class="kpi"><b>' + issues.length + '</b><span>메모 남긴 객실</span></div></div>';
  html += '<p class="sec" style="margin-top:0">메이드별 진행 (' + data.maids.length + '명)</p><div class="mgrid">' + data.maids.map(m => {
    const d = doneCount(m), t = totalUnits(m), ic = m.rooms.filter(x => { const r = recOf(m.name, x.room); return r && r.memo; }).length;
    return '<button class="mg' + (d === t ? ' full' : '') + '" data-view="' + esc(m.name) + '"><b>' + esc(m.name) + '</b><div class="bar"><i style="width:' + (t ? d / t * 100 : 0) + '%"></i></div><small>' + d + '/' + t + (ic ? ' · 메모 ' + ic : '') + '</small></button>';
  }).join('') + '</div>';
  html += '<div class="card"><h3>⏰ 시간 정해진 객실 (미완료)</h3><div class="list">' + (dueRows.length ? dueRows.map(o => {
    const late = o.x.due <= now;
    return '<div class="r' + (late || o.x.due <= addMin(now, 60) ? ' hot' : '') + '"><span><b>' + esc(o.x.room) + '</b> · ' + esc(o.m.name) + '</span><span>' + esc(o.x.due) + '까지' + (late ? ' · 지남' : '') + '</span></div>';
  }).join('') : '<div class="r"><span>모두 끝났어요.</span><span></span></div>') + '</div></div>';
  const gp = {}, gorder = [];
  data.maids.forEach(m => m.rooms.forEach(x => x.tags.forEach(t => {
    if (tagKey(t) !== '단체') return;
    const g = String(t).indexOf(':') > 0 ? String(t).slice(String(t).indexOf(':') + 1) : '단체';
    if (!gp[g]) { gp[g] = { all: {}, done: {} }; gorder.push(g); }
    gp[g].all[x.room] = 1; if (recOf(m.name, x.room)) gp[g].done[x.room] = 1;
  })));
  if (gorder.length) html += '<div class="card"><h3>단체 진행</h3><div class="list">' + gorder.map(g => {
    const a = Object.keys(gp[g].all).length, d = Object.keys(gp[g].done).length;
    return '<div class="r"><span>' + tagHtml('단체:' + g, g) + '</span><span>' + d + ' / ' + a + '실' + (d >= a ? ' ✓' : ' · 남음 ' + (a - d)) + '</span></div>';
  }).join('') + '</div></div>';
  html += '<div class="card"><h3>객실 메모</h3><p class="rec" style="margin:0 0 6px">하자·악취 등 접수는 카톡·전화로 받아요. 여기는 메이드가 남긴 참고 메모예요.</p><div class="list">' + (issues.length ? issues.map(o =>
    '<div class="r"><span><b>' + esc(o.x.room) + '</b> · ' + esc(o.m.name) + (o.r.issues.length ? ' · ' + esc(o.r.issues.join(', ')) : '') + (o.r.memo ? '<br><small>' + esc(o.r.memo) + '</small>' : '') + '</span><span>' + hm(o.r.at) + '</span></div>').join('') : '<div class="r"><span>아직 없어요.</span><span></span></div>') + '</div></div>';
  const chg = data.changes || [];
  if (chg.length) {
    const owner = {}; data.maids.forEach(m => m.rooms.forEach(x => { (owner[x.room] = owner[x.room] || []).push(m.name); }));
    html += '<div class="card"><h3>오늘 추가·제외·교환된 객실</h3><div class="list">' + chg.slice().reverse().map(c => {
      const dupN = c.kind === '추가' ? (owner[c.room] || []).filter(n => n !== c.maid) : [];
      const selfRm = c.kind === '제외' && c.assigned && c.by !== '관리자';
      const what = c.kind === '넘김' ? esc(c.maid) + ' → ' + esc(c.to) + ' (교환)' : esc(c.maid) + ' · ' + (selfRm ? '직접 제외' : esc(c.kind));
      return '<div class="r' + (dupN.length || selfRm ? ' hot' : '') + '"><span><b>' + esc(c.room) + '</b> · ' + what + (c.by === '관리자' ? ' (관리자)' : '') + (dupN.length ? '<br><small>겹침: ' + esc(dupN.join(', ')) + ' 님 배정</small>' : '') + (selfRm ? '<br><small>정비하는 사람이 없어요 · 필요하면 메이드 화면에서 다시 추가</small>' : '') + '</span><span>' + hm(c.at) + '</span></div>';
    }).join('') + '</div></div>';
  }
  if (nts.length) html += '<div class="card"><h3>공지 확인</h3><div class="list">' + nts.map(n => {
    const tg = data.maids.filter(m => !(n.targets && n.targets.length) || n.targets.indexOf(m.name) >= 0).map(m => m.name);
    const ok = tg.filter(nm => acked(n, nm)), no = tg.filter(nm => !acked(n, nm));
    return '<div class="r"><span><b>' + esc(n.title) + '</b>' + (no.length ? '<br><small>미확인: ' + esc(no.join(', ')) + '</small>' : '') + '</span><span>' + ok.length + ' / ' + tg.length + '명</span></div>';
  }).join('') + '</div><p class="rec" style="margin:6px 0 0">최근 14일 안의 확인 기준이에요.</p></div>';
  const devs = data.devices || [], regNames = devs.map(d => d.name);
  const unreg = data.maids.filter(m => regNames.indexOf(m.name) < 0).map(m => m.name);
  const byN = {}; devs.forEach(d => { (byN[d.name] = byN[d.name] || []).push(d); });
  html += '<div class="card"><h3>휴대폰 등록 관리 (새 앱)</h3><p class="rec" style="margin:0 0 6px">잘못 등록했으면 해제하세요. 해제하면 그 휴대폰은 이름 고르기 화면으로 돌아가요.</p><div class="list">' +
    (devs.length ? Object.keys(byN).sort().map(n => { const last = byN[n].reduce((a, d) => Math.max(a, d.at || 0), 0);
      return '<div class="r"><span><b>' + esc(n) + '</b> <small style="color:var(--muted)">' + (byN[n].length > 1 ? byN[n].length + '대 · ' : '') + esc(last ? seoulDate(last).slice(5).replace('-', '/') + ' ' + hm(last) : '') + '</small></span><span><button class="ghost" data-release="' + esc(n) + '">해제</button></span></div>'; }).join('')
      : '<div class="r"><span>아직 등록된 휴대폰이 없어요.</span><span></span></div>') + '</div>' +
    (unreg.length ? '<p class="rec" style="margin:8px 0 0">새 앱 미등록 ' + unreg.length + '명: ' + esc(unreg.join(', ')) + '</p>' : '') +
    (devs.length ? '<div class="acts" style="margin-top:8px"><button class="danger" data-release-all="1">등록 전체 해제 (' + devs.length + '대)</button></div>' : '') + '</div>';
  html += '<p class="rec" style="text-align:center">새 앱 ' + APP_VER + '</p>';
  $('#main').innerHTML = html;
}

// =====================================================================
// 저장 (누르는 즉시 휴대폰에 보관 → 서버로. 실패해도 휴대폰에 기억했다가 다시)
// =====================================================================
function failKey() { return 'rm2_failed'; }
function myFails() { return isAdm ? [] : lsJson(failKey(), []).filter(f => f.date === today && (!me || f.maid === me)); }
function onWriteFail(item, e) {
  console.warn('저장 거절', item, e);
  if (String(e && e.code) !== 'permission-denied') { say(errText(e)); return; }
  const list = lsJson(failKey(), []).filter(f => !(f.date === item.date && f.room === item.room && f.maid === item.maid));
  list.push(item); lsSet(failKey(), JSON.stringify(list)); update();
}
let resending = false;
function resendFailed() {
  if (resending || !me || isAdm) return;
  const list = lsJson(failKey(), []), mine = list.filter(f => f.date === today && f.maid === me);
  if (!mine.length) return;
  resending = true;
  setTimeout(() => {   // 내 목록이 다 들어온 다음에
    resending = false;
    const rest = lsJson(failKey(), []).filter(f => !(f.date === today && f.maid === me));
    lsSet(failKey(), JSON.stringify(rest));
    mine.forEach(f => { const m = maidOf(me); if (m && roomOf(m, f.room)) save(me, f.room, f.rec, false, true); });
    say(mine.length + '건을 다시 보냈어요.');
    update();
  }, 1500);
}
function save(maid, room, rec, viaAdmin, quiet) {
  const key = RK(maid, room), cur = recOf(maid, room);
  if (!rec.done && !cur) return;
  const issues = (rec.issues || []).filter(x => ITEMS.some(i => i.key === x) || x === '기타').slice(0, 5);
  const memo = String(rec.memo || '').slice(0, 300), status = rec.done ? (issues.length ? '이상' : '완료') : '취소';
  if (cur && rec.done && cur.status === status && cur.memo === memo && cur.issues.join(',') === issues.join(',')) return;
  if (rec.done && !cur && !quiet) { justDone[key] = 1; vibe(35); play('stamp'); }
  if (!rec.done) delete justDone[key];
  const item = { date: today, room, maid, rec: { done: rec.done, issues, memo } };
  S.set('days/' + today + '/recs/' + room + '_' + maid, {
    room, maid, status, issues: rec.done ? issues : [], memo: rec.done ? memo : '',
    at: S.SERVER_TIME, clientAt: new Date(), uid: user.uid, proxy: !!viaAdmin
  }).catch(e => onWriteFail(item, e));
}
function change(kind, maid, room, extra, viaAdmin) {
  const d = Object.assign({ kind, maid, room, by: viaAdmin ? '관리자' : '본인', at: S.SERVER_TIME, clientAt: new Date(), uid: user.uid, parties: [maid] }, extra || {});
  if (extra && extra.to) d.parties = [maid, extra.to];
  const r = S.add('days/' + today + '/changes', d);
  r.done.catch(e => { console.warn('변경 거절', e); say(room + '호 ' + kind + '이(가) 저장되지 않았어요. ' + errText(e)); });
  return r;
}
async function owners(room) { try { return await withTimeout(S.get('days/' + today + '/owners/' + room), 8000, '연결이 느려요. 잠시 후 다시 해 주세요.'); } catch (e) { if (/느려요/.test(e.message)) throw e; return null; } }
function validRoom(v) { const r = String(v || '').trim(); return ALL_ROOMS.has(r) ? r : ''; }
async function doAdd(maid, no, viaAdmin) {
  const r = validRoom(no), m = maidOf(maid);
  if (!r) throw new Error('객실 번호를 다시 확인해 주세요. (예: 1612)');
  if (!m) throw new Error(maid + ' 님은 오늘 배정 명단에 없어요.');
  if (m.rooms.some(x => x.room === r)) throw new Error(r + '호는 이미 목록에 있어요.');
  const rm = (m.removed || []).filter(x => x.room === r)[0];
  if (!viaAdmin && rm && rm.removedBy === '관리자') throw new Error(r + '호는 관리자가 정비 대상에서 제외한 객실이에요. 관리자에게 문의해 주세요.');
  let others = [];
  if (isAdm) others = data.maids.filter(x => x.name !== maid && x.rooms.some(y => y.room === r)).map(x => x.name);
  else { const o = await owners(r); others = (o && o.maids || []).filter(n => n !== maid); }
  change('추가', maid, r, null, viaAdmin);
  return { room: r, dup: others.length ? (viaAdmin ? others.join(', ') : '1') : '' };
}
async function swapCheck(maid, mine, otherNo) {
  const m = maidOf(maid), other = validRoom(otherNo);
  if (!m || !m.rooms.some(x => x.room === mine)) throw new Error(mine + '호는 지금 내 객실이 아니에요.');
  if (!other) throw new Error('객실 번호를 다시 확인해 주세요. (예: 1612)');
  if (other === mine) throw new Error('같은 객실이에요. 바꿀 상대 객실 번호를 입력해 주세요.');
  if (m.rooms.some(x => x.room === other)) throw new Error(other + '호는 이미 내 객실이에요.');
  if (recOf(maid, mine)) throw new Error(mine + '호는 이미 정비 완료라 교환할 수 없어요.');
  let ownersOther, doneBy = [], ownersMine;
  if (isAdm) {
    ownersOther = data.maids.filter(x => x.name !== maid && x.rooms.some(y => y.room === other)).map(x => x.name);
    doneBy = ownersOther.filter(n => recs[other + '|' + n]);
    ownersMine = data.maids.filter(x => x.rooms.some(y => y.room === mine)).map(x => x.name);
  } else {
    const [o1, o2] = await Promise.all([owners(other), owners(mine)]);
    ownersOther = (o1 && o1.maids || []).filter(n => n !== maid); doneBy = o1 && o1.done || []; ownersMine = o2 && o2.maids || [];
  }
  if (!ownersOther.length) throw new Error(other + '호는 오늘 다른 분께 배정된 객실이 아니에요. 그냥 가져오려면 "+ 객실 추가"를 써 주세요.');
  if (ownersOther.length > 1) throw new Error(other + '호는 두 분 이상이 같이 맡은 객실이라 교환할 수 없어요. 관리자에게 말씀해 주세요.');
  const owner = ownersOther[0];
  if (doneBy.indexOf(owner) >= 0) throw new Error(other + '호는 ' + owner + ' 님이 이미 정비 완료한 객실이에요.');
  if (ownersMine.indexOf(owner) >= 0) throw new Error(mine + '호는 ' + owner + ' 님에게도 배정되어 있어요. 관리자에게 말씀해 주세요.');
  return { mine, other, owner };
}

// =====================================================================
// 공지
// =====================================================================
const seenPopup = {};
function maybePopup() {
  if (dlg || isAdm || !data || !me) return;
  const n = myNotices(me).filter(x => x.popup && !acked(x, me) && !seenPopup[x.id])[0];
  if (n) openNotice(n, true);
}
function openNotice(n, must) { dlg = { kind: 'notice', n, must }; drawDlg(); }
function posterHtml(n) {
  if (n.img) return '<img class="poster" alt="' + esc(n.title) + '" src="' + esc(n.img) + '">';
  if (n.imgName) return '<p>사진이 커서 앱에 싣지 못했어요. 관리자에게 물어봐 주세요.</p>';
  return '';
}
function ack(n) {
  const at = Date.now(), loc = lsJson('rm2_acks_' + me, {});
  if (!n.daily) { loc[n.id] = at; lsSet('rm2_acks_' + me, JSON.stringify(loc)); }
  if (ackDocs.some(a => a.data.notice === n.id)) return;
  S.set('days/' + today + '/acks/' + n.id + '_' + me, { notice: n.id, maid: me, at: S.SERVER_TIME }).catch(e => console.warn('공지 확인 저장 실패', e));
}

// =====================================================================
// 앱 설치 안내 (홈 화면 아이콘으로 열지 않은 분에게만)
// =====================================================================
const OS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : /Android/i.test(navigator.userAgent) ? 'android' : '';
const KAKAO = /KAKAOTALK/i.test(navigator.userAgent);
function standalone() { try { return navigator.standalone === true || ['standalone', 'fullscreen', 'minimal-ui'].some(m => matchMedia('(display-mode: ' + m + ')').matches); } catch (e) { return false; } }
let instClosed = false;
function instHtml() {
  const t = Number(lsGet('rm_inst_hide') || 0);
  if (isAdm || !OS || standalone() || (t && Date.now() < t) || instClosed) return '';
  return '<div class="inst"><span style="flex:1"><b>앱으로 설치하면 더 편해요</b>' + (KAKAO ? '지금은 카톡 안에서 열려 있어요.' : '홈 화면 아이콘으로 열면 더 빠르고 편해요.') + '</span><button class="go" data-inst="1">방법 보기</button><button class="x" data-inst-x="1" aria-label="안내 닫기">×</button></div>';
}
function instPoster(os) { const img = os === 'ios' ? '앱설치_가이드_아이폰.jpg' : '앱설치_가이드_안드로이드.jpg'; return notices.filter(x => x.imgName === img && x.img)[0] || null; }
function instGuideHtml() {
  const ios = dlg.os === 'ios', steps = [];
  if (KAKAO) steps.push(ios ? '카톡 화면 오른쪽 아래 <b>공유(□↑)</b> 또는 <b>⋯</b> → <b class="em">Safari로 열기</b>' : '카톡 화면 오른쪽 아래 <b>⋮ (점 3개)</b> → <b class="em">다른 브라우저로 열기</b>');
  if (ios) {
    steps.push('사파리 아래쪽 <b>공유 버튼 (□↑)</b> 누르기<br><small>iOS 26: 주소창 옆 <b>⋯</b> → <b>공유</b> → 목록 맨 아래 <b>더 보기</b></small>');
    steps.push('목록을 아래로 내려 <b class="em">홈 화면에 추가</b> → 오른쪽 위 <b class="em">추가</b><br><small>목록에 없으면 맨 아래 <b>작업 편집</b>에서 \'홈 화면에 추가\'를 켜 주세요.</small>');
  } else {
    steps.push('인터넷 앱 메뉴(<b>≡</b> 또는 <b>⋮</b>)에서 <b class="em">앱 설치</b> 누르기<br><small>\'바로가기\' 말고 \'앱 설치\'예요. \'홈 화면에 추가\'만 보이면 누른 뒤 \'앱 설치\'를 고르세요.</small>');
    steps.push('경고창이 뜨면 <b class="em">무시하고 설치</b><br><small>회사에서 만든 앱이라 뜨는 안내예요. 안심하고 누르세요.</small>');
  }
  steps.push('홈 화면에 생긴 아이콘으로 열기<br><small>처음 한 번만 내 이름을 고르면 다음부터는 바로 열려요.</small>');
  const pn = instPoster(dlg.os);
  return '<h3>앱으로 설치하기</h3><div class="seg2" role="group" aria-label="휴대폰 종류"><button data-inst-os="android" aria-pressed="' + !ios + '">갤럭시·안드로이드</button><button data-inst-os="ios" aria-pressed="' + ios + '">아이폰</button></div>' +
    '<p>설치하면 홈 화면 아이콘 한 번으로 바로 열리고, 화면도 더 넓고 빨라요.</p><ol class="isteps">' + steps.map(t => '<li><span style="flex:1;min-width:0">' + t + '</span></li>').join('') + '</ol>' +
    (ios ? '<p style="font-size:13px">그래도 안 되면: 아이폰 <b>크롬</b> 앱에서 열고 공유 → 홈 화면에 추가, 또는 <b>단축어</b> 앱 → \'URL 열기\'로 홈 화면 아이콘을 만들 수 있어요.</p>' : '') +
    (pn ? '<button class="sub" data-inst-poster="1">그림으로 자세히 보기</button>' : '') + '<div class="acts"><button data-x="1">닫기</button></div>';
}

// =====================================================================
// 효과음: 도장 쿵 · 절반 띵 · 정비 끝 빠밤! (기본 켜짐, 🔊 버튼)
// =====================================================================
let actx = null;
function soundOn() { return lsGet('rm_sound') !== 'off'; }
function A() { try { if (!actx) { const C = window.AudioContext || window.webkitAudioContext; if (C) actx = new C(); } if (actx && actx.state === 'suspended') actx.resume(); } catch (e) { actx = null; } return actx; }
function tone(f, t0, dur, type, vol, to) {
  const c = A(); if (!c) return;
  try { const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + t0; o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02); } catch (e) {}
}
function thump(t0, vol) {
  const c = A(); if (!c) return;
  try { const len = Math.floor(c.sampleRate * 0.08), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = b; f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(c.currentTime + t0); } catch (e) {}
}
const SND = {
  stamp: () => { thump(0, 0.6); tone(150, 0, 0.18, 'sine', 0.35, 60); },
  half: () => { tone(1568, 0, 0.6, 'sine', 0.16); tone(3136, 0, 0.3, 'sine', 0.04); },
  fin: () => { [523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.14, 'square', 0.06)); tone(1047, 0.3, 0.6, 'square', 0.07); tone(784, 0.3, 0.6, 'triangle', 0.08); thump(0.3, 0.3); }
};
function play(k) { if (!soundOn()) return; try { SND[k](); } catch (e) {} }
function sndBtn() { const on = soundOn(); return '<button class="snd-btn" data-snd="1" aria-pressed="' + on + '" aria-label="' + (on ? '소리 끄기' : '소리 켜기') + '">' + (on ? '🔊' : '🔇') + '</button>'; }
document.addEventListener('touchstart', () => { if (soundOn()) A(); }, { passive: true, once: true });

// =====================================================================
// 창
// =====================================================================
function btns(cancel, ok, enabled, cls) { return '<div class="acts"><button data-x="1">' + cancel + '</button><button class="' + (cls || 'go') + '" data-do="ok"' + (busy || !enabled ? ' disabled' : '') + '>' + (busy ? '확인 중…' : ok) + '</button></div>'; }
function errP() { return dlg.err ? '<p class="err">' + esc(dlg.err) + '</p>' : ''; }
function drawDlg() {
  const el = $('#sheet');
  if (!dlg || !data) { el.innerHTML = ''; return; }
  const k = dlg.kind; let body = '', cls = 'panel';
  if (k === 'room') {
    const m = maidOf(dlg.maid), x = m && roomOf(m, dlg.room);
    if (!x) { dlg = null; el.innerHTML = ''; return; }
    const r = recOf(m.name, x.room);
    body = '<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><span class="rno">' + esc(x.room) + '</span>' + (dlg.proxy ? '<span class="rec">' + esc(m.name) + ' 님 객실 · 관리자 대신 처리</span>' : '') + '</div>' +
      ((x.tags.length || x.note || x.memo || x.after || ROYAL[x.room]) ? '<div class="info">' + (x.tags.length || x.after || ROYAL[x.room] ? '<div class="tags">' + tagsHtml(x) + '</div>' : '') + (x.note ? '<div class="nt">' + esc(x.note) + '</div>' : '') + (x.memo ? '<div class="mm">메모 · ' + esc(x.memo) + '</div>' : '') + '</div>' : '');
    const memoBox = '<textarea id="memo" maxlength="300" placeholder="객실 특이사항 메모 (선택) · 본인 메모나 관리자에게 전달할 내용">' + esc(dlg.memo || '') + '</textarea><p class="hint">객실 하자·악취 등 접수는 지금처럼 카톡·전화로 해 주세요.</p>';
    if (r && !dlg.edit) {
      body += '<h3>자가인스펙션 확인 · 정비 완료</h3><p class="rec">' + (isAdm ? '<b>' + hm(r.at) + '</b> · ' : '') + esc(r.maid) + (r.proxy ? ' (관리자 대신)' : '') + (r.issues.length ? ' · 이상: <b>' + esc(r.issues.join(', ')) + '</b>' : ' · 4개 항목 모두 확인') + (r.memo ? '<br>메모: ' + esc(r.memo) : '') + '</p>' +
        '<div class="acts"><button data-x="1">닫기</button><button data-act="redo">' + (r.memo ? '메모 수정' : '메모 남기기') + '</button><button class="danger" data-act="undo">완료 취소</button></div>';
    } else if (r) {
      body += '<h3>객실 메모</h3>' + memoBox + '<button class="big" data-act="memosave">메모 저장</button><div class="acts"><button data-act="back">← 돌아가기</button></div>';
    } else {
      body += '<h3>자가인스펙션</h3><div class="chk">' + ITEMS.map(i => '<div class="it"><b>' + esc(i.key) + '</b><span>' + esc(i.detail) + '</span></div>').join('') + '</div>' + memoBox +
        '<button class="big" data-act="allok">4개 항목 모두 확인 · 정비 완료</button>' +
        '<div class="acts"><button data-x="1">닫기</button><button class="sub" data-act="swap">객실 교환</button><button class="sub red" data-act="rm">객실 제거</button></div>';
    }
  } else if (k === 'notice') {
    const n = dlg.n; cls = 'panel npanel';
    body = (dlg.must ? '<span class="badge">오늘 꼭 확인할 공지</span>' : '') + '<h3>' + esc(n.title) + '</h3>' + (n.body ? '<div class="body">' + esc(n.body) + '</div>' : '') + posterHtml(n) +
      (isAdm ? '<div class="ackbar"><div class="acts"><button data-x="1">닫기</button></div></div>'
        : acked(n, me) ? '<div class="ackbar"><p class="rec">' + (ackAt(n, me) > 1 ? hm(ackAt(n, me)) + '에 ' : '') + '확인했어요.</p><div class="acts"><button data-x="1">닫기</button></div></div>'
        : '<div class="ackbar"><button class="big" data-act="ack" style="background:var(--navy)">확인했어요</button>' + (dlg.must ? '' : '<div class="acts"><button data-x="1">나중에</button></div>') + '</div>');
  } else if (k === 'instguide') body = instGuideHtml();
  else if (k === 'nlist') {
    const list = isAdm ? (data.notices || []) : myNotices(me);
    body = '<h3>공지</h3><div class="nlist" style="display:flex;flex-direction:column;gap:8px">' + list.map((n, i) => '<button class="n" data-open="' + i + '"><span><b>' + esc(n.title) + '</b><br><small>' + esc(n.from || '') + (n.to && n.to !== n.from ? ' ~ ' + esc(n.to) : '') + '</small></span>' +
      (isAdm ? '' : acked(n, me) ? '<span class="ok">확인함</span>' : '<span class="no">미확인</span>') + '</button>').join('') + '</div><div class="acts"><button data-x="1">닫기</button></div>';
  } else if (k === 'claim') {
    body = '<h3>' + esc(dlg.name) + ' 님이 맞나요?</h3><p>이 휴대폰에서는 다음부터 <b style="color:var(--ink)">' + esc(dlg.name) + '</b> 님 화면으로 바로 열려요. 잘못 고르면 관리자에게 말씀해 주세요.</p>' + errP() + btns('아니요', '네, 맞아요', true);
  } else if (k === 'login') {
    const sel = dlg.who || 0;
    body = '<h3>관리자 로그인</h3>' + (!isAdm && me ? '<p>관리자 모드를 끄면 이 휴대폰은 이름을 다시 골라야 해요. (메이드 휴대폰 등록 해제와 같아요)</p>' : '<p>처음 한 번만 로그인하면 이 기기에서는 계속 관리자로 열려요.</p>') +
      '<div class="seg2">' + ADMINS.map((a, i) => '<button data-who="' + i + '" aria-pressed="' + (sel === i) + '">' + esc(a.label) + '</button>').join('') + '</div>' +
      '<label class="field">비밀번호<input id="apw" type="password" autocomplete="current-password" value="' + esc(dlg.pw || '') + '"></label>' + errP() + btns('취소', '로그인', !!dlg.pw);
  } else if (k === 'releaseall') {
    body = '<h3>휴대폰 등록을 모두 해제할까요?</h3><p>새 앱에 등록된 휴대폰 ' + (data.devices || []).length + '대가 모두 해제돼요. 메이드분들은 다음에 열 때 본인 이름을 다시 골라요. 정비 기록은 그대로 남아요.</p>' + btns('취소', '전체 해제', true, 'danger');
  } else if (k === 'release') {
    body = '<h3>' + esc(dlg.name) + ' 님 휴대폰 등록을 해제할까요?</h3><p>그 휴대폰은 다음에 열 때 이름 고르기 화면이 나와요. 기록은 그대로 남아요.</p>' + btns('취소', '해제', true, 'danger');
  } else if (k === 'addroom') {
    const ok = /^\d{3,4}$/.test(dlg.no || '');
    body = '<h3>' + (dlg.proxy ? esc(dlg.maid) + ' 님 ' : '') + '추가할 객실 호수를 입력해 주세요</h3><input id="roomno" class="roomin" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" value="' + esc(dlg.no || '') + '">' + errP() + btns('취소', ok ? esc(dlg.no) + '호 추가' : '추가', ok);
  } else if (k === 'rmroom') {
    if (dlg.proxy) body = '<h3>해당 객실을 제거하시겠습니까?</h3><p>' + esc(dlg.room) + '호 · 정비 대상에 제외됩니다.</p>' + errP() + btns('취소', '제거', true, 'danger');
    else body = '<h3>' + esc(dlg.room) + '호를 제외할까요?</h3><div class="warnbox"><b>' + esc(dlg.room) + ' 객실을 제외하면 아무도 정비하지 않습니다.</b><br>프런트나 관리자 지시가 있었나요?</div><p>맞으면 아래에 <b>' + esc(dlg.room) + '</b>을(를) 직접 입력해 주세요.</p>' +
      '<input id="rmtyped" class="roomin" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" value="' + esc(dlg.typed || '') + '">' + errP() + btns('취소', '제외', String(dlg.typed || '') === dlg.room, 'danger');
  } else if (k === 'swap') {
    if (!dlg.pv) body = '<h3>' + (dlg.proxy ? esc(dlg.maid) + ' 님 ' : '내 ') + esc(dlg.room) + '호와 바꿀 객실</h3><p>상대 메이드분과 이야기한 뒤, 받아 올 객실 번호를 입력해 주세요.</p>' +
      '<input id="swapno" class="roomin" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" value="' + esc(dlg.no || '') + '">' + errP() + btns('취소', '다음', /^\d{3,4}$/.test(dlg.no || ''));
    else { const pv = dlg.pv, dw = W(pv.mine) !== W(pv.other);
      body = '<h3>' + esc(pv.owner) + ' 님과 객실을 바꿀까요?</h3><div class="swapline"><span>' + esc(pv.mine) + '<small>' + (dlg.proxy ? esc(dlg.maid) + ' 님' : '내 객실') + '</small></span><span>↔</span><span>' + esc(pv.other) + '<small>' + esc(pv.owner) + ' 님</small></span></div>' +
        (dw ? '<div class="warnbox"><b>실 수가 달라져요.</b> 로얄 객실(3001·3002·3101·3102)은 2실로 계산돼요.</div>' : '') +
        '<p class="hint">바꾸면 두 분 화면이 바로 바뀌고, ' + esc(pv.owner) + ' 님 화면에도 알림이 떠요. 시간·단체 표시는 객실을 따라가요.</p>' + errP() + btns('취소', '교환하기', true); }
  } else if (k === 'proxyask') body = '<h3>' + esc(dlg.maid) + ' 님 대신 처리할까요?</h3><p>' + esc(dlg.room) + '호 · 기록에 "관리자 대신"이 표시돼요.</p>' + btns('취소', '대신 처리', true);
  el.innerHTML = '<div class="scrim"' + (k === 'notice' && dlg.must ? '' : ' data-x="1"') + '><div class="' + cls + '">' + body + '</div></div>';
}
function closeDlg() { const wasN = dlg && dlg.kind === 'notice'; if (wasN) seenPopup[dlg.n.id] = 1; dlg = null; drawDlg(); if (wasN) maybePopup(); }
function failDlg(e) { busy = false; if (dlg) { dlg.err = e && e.message ? e.message.replace(/^Error:\s*/, '') : errText(e); drawDlg(); } }

// ---------- 입력
document.addEventListener('input', e => {
  if (!dlg) return;
  const id = e.target.id, digits = v => v.replace(/[^0-9]/g, '').slice(0, 4);
  if (id === 'memo') dlg.memo = e.target.value;
  if (id === 'apw') { dlg.pw = e.target.value; const g = document.querySelector('.panel [data-do]'); if (g && !busy) g.disabled = !dlg.pw; }
  if (id === 'roomno' || id === 'rmtyped' || id === 'swapno') {
    const v = digits(e.target.value); if (v !== e.target.value) e.target.value = v; dlg.err = '';
    const g = document.querySelector('.panel [data-do]');
    if (id === 'roomno') { dlg.no = v; if (g && !busy) { g.disabled = !/^\d{3,4}$/.test(v); g.textContent = /^\d{3,4}$/.test(v) ? v + '호 추가' : '추가'; } }
    if (id === 'rmtyped') { dlg.typed = v; if (g && !busy) g.disabled = v !== dlg.room; }
    if (id === 'swapno') { dlg.no = v; if (g && !busy) g.disabled = !/^\d{3,4}$/.test(v); }
  }
});
document.addEventListener('keydown', e => { if (dlg && e.key === 'Enter' && /^(login|addroom|rmroom|swap)$/.test(dlg.kind)) { e.preventDefault(); const g = document.querySelector('.panel [data-do]'); if (g && !g.disabled) g.click(); } });

// ---------- 누르기
let armed = false;
function arm() { if (!armed) { try { history.pushState({ rm: 1 }, ''); armed = true; } catch (e) {} } }
window.addEventListener('popstate', () => {   // 휴대폰 뒤로가기: 앱 안에서만 처리
  armed = false; arm();
  if (dlg) { if (dlg.kind === 'notice' && dlg.must) return; if (!busy) closeDlg(); return; }
  if (isAdm && viewMaid) { viewMaid = null; render(); window.scrollTo(0, 0); return; }
  toast('나가실 땐 휴대폰 홈 버튼(○)을 눌러 주세요');
});
document.addEventListener('click', e => {
  arm();
  const t = e.target, at = s => t.closest(s);
  if (at('[data-snd]')) { const on = !soundOn(); lsSet('rm_sound', on ? 'on' : 'off'); render(); toast(on ? '소리를 켰어요 🔊' : '소리를 껐어요 · 진동만 울려요'); if (on) play('stamp'); return; }
  if (at('[data-reload]')) { location.reload(); return; }
  if (at('[data-failx]')) { lsSet(failKey(), JSON.stringify(lsJson(failKey(), []).filter(f => f.date !== today))); update(); return; }
  if (at('#sheet')) { onSheet(t, at); return; }
  if (!data) return;
  const pk = at('[data-pick]'); if (pk) { dlg = { kind: 'claim', name: pk.getAttribute('data-pick') }; drawDlg(); return; }
  if (at('[data-admin-in]')) { dlg = { kind: 'login', who: 0, pw: '' }; drawDlg(); return; }
  if (at('[data-admin-off]')) { S.signOut(); return; }
  if (at('[data-release-all]')) { dlg = { kind: 'releaseall' }; drawDlg(); return; }
  const rl = at('[data-release]'); if (rl) { dlg = { kind: 'release', name: rl.getAttribute('data-release') }; drawDlg(); return; }
  const jp = at('[data-jump]'); if (jp) { const el = document.querySelector('[data-room="' + jp.getAttribute('data-jump') + '"]'); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } return; }
  if (at('[data-swapok]')) { const seen = lsJson(swapKey(), []); swapNew().forEach(c => { if (seen.indexOf(c.id) < 0) seen.push(c.id); }); lsSet(swapKey(), JSON.stringify(seen.slice(-200))); render(); return; }
  const rs = at('[data-restore]');
  if (rs && !busy) { const who = isAdm ? viewMaid : me; if (!who) return; change('추가', who, rs.getAttribute('data-restore'), null, isAdm); say(rs.getAttribute('data-restore') + '호를 다시 넣었어요.'); return; }
  if (at('[data-inst-x]')) { instClosed = true; lsSet('rm_inst_hide', String(Date.now() + 7 * 864e5)); render(); return; }
  if (at('[data-inst]')) { dlg = { kind: 'instguide', os: OS === 'ios' ? 'ios' : 'android' }; drawDlg(); return; }
  if (at('[data-vent]')) { ventHidden[ventKey()] = 1; lsSet(ventKey(), '1'); render(); return; }
  if (at('[data-addroom]')) { if (isAdm && viewMaid) dlg = { kind: 'addroom', maid: viewMaid, proxy: true, no: '' }; else if (!isAdm && me) dlg = { kind: 'addroom', maid: me, no: '' }; drawDlg(); const f = $('#roomno'); if (f) f.focus(); return; }
  if (at('[data-nlist]')) { dlg = { kind: 'nlist' }; drawDlg(); return; }
  if (at('[data-back]')) { viewMaid = null; render(); window.scrollTo(0, 0); return; }
  const vw = at('[data-view]'); if (vw) { viewMaid = vw.getAttribute('data-view'); render(); window.scrollTo(0, 0); return; }
  const rm = at('[data-room]');
  if (rm) {
    const room = rm.getAttribute('data-room');
    if (isAdm && viewMaid) { dlg = recOf(viewMaid, room) ? { kind: 'room', maid: viewMaid, room, proxy: true } : { kind: 'proxyask', maid: viewMaid, room }; drawDlg(); return; }
    if (!isAdm && me) { dlg = { kind: 'room', maid: me, room }; drawDlg(); }
  }
});
function onSheet(t, at) {
  if (busy) return;
  if (t.getAttribute('data-x') === '1') { closeDlg(); return; }
  const os = at('[data-inst-os]'); if (os && dlg && dlg.kind === 'instguide') { dlg.os = os.getAttribute('data-inst-os'); drawDlg(); return; }
  if (at('[data-inst-poster]')) { const pn = instPoster(dlg.os); if (pn) openNotice(pn, false); return; }
  const wh = at('[data-who]'); if (wh && dlg && dlg.kind === 'login') { const pw = $('#apw'); dlg.pw = pw ? pw.value : ''; dlg.who = Number(wh.getAttribute('data-who')); drawDlg(); return; }
  const op = at('[data-open]'); if (op) { const list = isAdm ? (data.notices || []) : myNotices(me); openNotice(list[Number(op.getAttribute('data-open'))], false); return; }
  const a = at('[data-act]'), act = a && a.getAttribute('data-act');
  if (dlg && dlg.kind === 'room' && act) {
    const who = dlg.maid, room = dlg.room, px = !!dlg.proxy, mm = $('#memo'); if (mm) dlg.memo = mm.value;
    const memo = String(dlg.memo || '').trim();
    if (act === 'allok') { dlg = null; drawDlg(); save(who, room, { done: true, issues: [], memo }, px); return; }
    if (act === 'back') { dlg.edit = false; drawDlg(); return; }
    if (act === 'redo') { dlg.edit = true; dlg.memo = recOf(who, room) && recOf(who, room).memo || ''; drawDlg(); const ta = $('#memo'); if (ta) ta.focus(); return; }
    if (act === 'memosave') { const keep = (recOf(who, room) && recOf(who, room).issues || []).slice(); dlg = null; drawDlg(); save(who, room, { done: true, issues: keep, memo }, px); return; }
    if (act === 'undo') { dlg = null; drawDlg(); save(who, room, { done: false, issues: [], memo: '' }, px); return; }
    if (act === 'rm') { dlg = { kind: 'rmroom', maid: who, room, proxy: px, typed: '' }; drawDlg(); const f = $('#rmtyped'); if (f) f.focus(); return; }
    if (act === 'swap') { dlg = { kind: 'swap', maid: who, room, proxy: px, no: '' }; drawDlg(); const f = $('#swapno'); if (f) f.focus(); return; }
  }
  if (dlg && dlg.kind === 'notice' && act === 'ack') { const n = dlg.n; ack(n); closeDlg(); render(); return; }
  const go = at('[data-do]'); if (!go || go.disabled || !dlg) return;
  const d0 = dlg;
  if (d0.kind === 'claim') {
    busy = true; drawDlg();
    withTimeout(S.set('devices/' + user.uid, { name: d0.name, date: today, at: S.SERVER_TIME }), 15000, '인터넷 연결을 확인하고 다시 눌러 주세요.')
      .then(() => { busy = false; dlg = null; drawDlg(); window.scrollTo(0, 0); })
      .catch(e => failDlg(String(e && e.code) === 'permission-denied' ? new Error('등록하지 못했어요. 오늘 배정 명단에 있는 이름인지 확인해 주세요.') : e));
    return;
  }
  if (d0.kind === 'login') {
    const pw = $('#apw') ? $('#apw').value : d0.pw; busy = true; drawDlg();
    S.signInEmail(ADMINS[d0.who || 0].email, pw).then(() => { busy = false; dlg = null; drawDlg(); window.scrollTo(0, 0); }).catch(e => { busy = false; d0.pw = ''; d0.err = errText(e); drawDlg(); });
    return;
  }
  if (d0.kind === 'releaseall') { const list = (data.devices || []).slice(); dlg = null; drawDlg(); Promise.all(list.map(x => S.del('devices/' + x.uid))).then(() => say('휴대폰 등록을 모두 해제했어요.')).catch(e => say(errText(e))); return; }
  if (d0.kind === 'release') { const list = (data.devices || []).filter(x => x.name === d0.name); dlg = null; drawDlg(); Promise.all(list.map(x => S.del('devices/' + x.uid))).then(() => say(d0.name + ' 님 휴대폰 등록을 해제했어요.')).catch(e => say(errText(e))); return; }
  if (d0.kind === 'addroom') {
    busy = true; drawDlg();
    doAdd(d0.maid, d0.no, !!d0.proxy).then(res => { busy = false; dlg = null; drawDlg(); say(res.room + '호를 추가했어요.' + (res.dup ? (d0.proxy ? ' (' + res.dup + ' 님 배정과 겹침)' : ' 다른 분 배정과 겹치는 객실이라 관리자가 확인해요.') : '')); }).catch(failDlg);
    return;
  }
  if (d0.kind === 'rmroom') {
    if (!d0.proxy && String(d0.typed || '') !== d0.room) { d0.err = '객실 번호가 맞지 않아요. ' + d0.room + '을(를) 그대로 입력해 주세요.'; drawDlg(); return; }
    if (recOf(d0.maid, d0.room)) { d0.err = '완료된 객실이에요. 먼저 완료 취소를 해 주세요.'; drawDlg(); return; }
    dlg = null; drawDlg(); change('제외', d0.maid, d0.room, null, !!d0.proxy); say(d0.room + '호를 정비 대상에서 제외했어요.');
    return;
  }
  if (d0.kind === 'swap') {
    busy = true; drawDlg();
    if (!d0.pv) { swapCheck(d0.maid, d0.room, d0.no).then(pv => { busy = false; if (dlg === d0) { d0.pv = pv; drawDlg(); } }).catch(failDlg); return; }
    swapCheck(d0.maid, d0.room, d0.pv.other).then(c => {
      busy = false;
      if (c.owner !== d0.pv.owner) { d0.err = c.other + '호 담당이 ' + c.owner + ' 님으로 바뀌었어요. 다시 확인해 주세요.'; d0.pv = null; drawDlg(); return; }
      dlg = null; drawDlg();
      change('교환', d0.maid, c.mine, { to: c.owner, toRoom: c.other }, !!d0.proxy);
      vibe(40); say(c.mine + '호 ↔ ' + c.other + '호 (' + c.owner + ' 님) 교환했어요.');
      setTimeout(() => { const el = document.querySelector('[data-room="' + c.other + '"]'); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); } }, 120);
    }).catch(failDlg);
    return;
  }
  if (d0.kind === 'proxyask') { dlg = { kind: 'room', maid: d0.maid, room: d0.room, proxy: true }; drawDlg(); }
}

// =====================================================================
// 시계: 날짜 바뀜 · 남은 시간 · 연결 상태 · 새 버전
// =====================================================================
setInterval(() => {
  if (user && seoulDate() !== today) { start(); return; }
  if (!dlg) render(); else drawSync();
}, 30000);
setInterval(() => { if (pendingCount() || dayCache) render(); }, 3000);
window.addEventListener('online', update); window.addEventListener('offline', update);
async function checkVer() {
  try { const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); const j = await r.json(); if (j && j.v && j.v !== APP_VER && j.v !== newVer) { newVer = j.v; update(); } } catch (e) {}
}
checkVer(); setInterval(() => { if (document.visibilityState === 'visible') checkVer(); }, 5 * 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { checkVer(); if (user && seoulDate() !== today) start(); } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
window.__rm = { ver: APP_VER, state: () => ({ me, isAdm, today, data, recs, pend, devState }) };   // 시험·점검용

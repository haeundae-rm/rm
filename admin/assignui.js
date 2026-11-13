// 🧩 자동 배정 (시험 · 대조) — 관리자 허브 (2026-11-13, 배정 자동화 앱 1단계)
// 정비보고서 초안 + 출근자·인계 유닛 → 엔진(assign.js, 백그라운드) → 배정안 보기 → 하우스키퍼 완성본과 대조
// 2단계 (11/13): 객실 옮기기(고치기) · 2901 바꾸기 → ✅ 확정 → 앱에 올리기 (초안일 때만: 이름 넣은 정비보고서로 engine makeRows → 허브 '정비보고서 올리기'와 같은 길 → 메이드 휴대폰·더티 배분)
// 정비보고서 xlsx(오더테이커용) 채우기는 다음 단계
// 저장: meta/assign { quota, lastHo, hist2901:[{date, names}], log:[{date, pct, ...}] } — 관리자만 씀 (규칙 meta: 읽기 로그인, 쓰기 관리자)
import { DEF_CFG, compare } from './assign.js?v=2026.11.13-7';

const VER = '2026.11.13-7';
const ROYAL = ['3001', '3002', '3101', '3102'];
let H = null;   // 허브에서 받은 것 { S, esc, ymd, addDays, md, admin, user }
let A = null;   // 화면 상태

const isTarget = x => (['1', '2', '3', '4'].includes(String(x.st == null ? '' : x.st).trim()) || /간단/.test(String(x.st == null ? '' : x.st))) && !/미정비/.test((x.m1 || '') + (x.m2 || ''));
const unitOf = x => (ROYAL.includes(String(x.room)) ? 2 : /간단/.test(String(x.st)) ? 0.5 : 1);
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

export async function openAssign(hub) {
  H = hub;
  const S = H.S;
  const h = Number(new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 13));
  A = { date: h >= 15 ? H.addDays(H.ymd(), 1) : H.ymd(), file: '', data: null, done: null, err: '', busy: '', cfgDoc: null, staff: [], rows: [], prev: '', res: null, prog: 0, cmp: null, showAll: false, open: {} };
  const box = document.createElement('div'); box.className = 'vp'; box.id = 'asp'; document.body.appendChild(box); document.body.classList.add('sb-lock');
  draw();
  const [cfgDoc, staff] = await Promise.all([S.get('meta/assign').catch(() => null), S.getQuery('staff', [['job', '==', '룸메이드']]).catch(() => [])]);
  if (!A) return;
  A.cfgDoc = cfgDoc || {};
  A.staff = staff.map(x => x.data).filter(x => (x.status || '재직') !== '퇴사').map(x => x.name);
  const hist = A.cfgDoc.hist2901 || [];
  const last = hist.filter(x => x.date < A.date).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  A.prev = last ? last.names.join(', ') : '';
  buildRows(); draw();
}
function close() { const b = document.getElementById('asp'); if (b) b.remove(); document.body.classList.remove('sb-lock'); if (A && A.worker) A.worker.terminate(); A = null; }
function quota() { return Object.assign({}, DEF_CFG.quota, (A.cfgDoc && A.cfgDoc.quota) || {}); }

// 출근자 줄: 담당표 이름 + 정량 + 명단(룸메이드 재직) + 지난 인계 — 지난 인계 유닛을 먼저, 없으면 정량, 없으면 9
function buildRows(fromCards) {
  const q = quota(), last = (A.cfgDoc && A.cfgDoc.lastHo) || {}, names = [];
  const add = n => { n = String(n || '').replace(/\s+/g, ''); if (n && n !== '관리자' && names.indexOf(n) < 0) names.push(n); };
  Object.values(DEF_CFG.aKey).forEach(add); Object.values(DEF_CFG.bKey).forEach(add); Object.keys(q).forEach(add); A.staff.forEach(add); Object.keys(last).forEach(add);
  if (fromCards) Object.keys(fromCards).forEach(add);
  A.rows = names.map(n => {
    if (fromCards) return { name: n, on: n in fromCards, unit: fromCards[n] != null ? fromCards[n] : (q[n] != null ? q[n] : 9) };
    const u = last[n] != null ? last[n] : q[n] != null ? q[n] : 9;
    return { name: n, on: n in last || !Object.keys(last).length, unit: u };
  });
}
function ho() { const o = {}; A.rows.forEach(r => { if (r.on && r.unit > 0) o[r.name] = Number(r.unit); }); return o; }

// ---------- 파일
function pick() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx'; inp.style.display = 'none';
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
    A.busy = '정비보고서를 읽는 중…'; A.err = ''; A.file = f.name; A.res = null; A.cmp = null; draw();
    try {
      if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 엑셀 읽기를 지원하지 않아요. PC 크롬이나 최신 휴대폰에서 해 주세요.');
      const E = await import(new URL('../app/engine.js?v=' + VER, import.meta.url).href);
      A.buf = await f.arrayBuffer();
      const r = await E.buildFromXlsx(A.buf, A.date);
      A.data = r.data; A.sheet = r.sheet;
      const named = A.data.rooms.filter(x => x.name && isTarget(x));
      A.done = named.length >= 20 ? A.data.rooms : null;   // 이름이 들어 있으면 하우스키퍼 완성본 → 대조용
      if (A.done) {   // 완성본의 출근 카드 유닛으로 인계를 채움 (같은 조건으로 비교)
        const cards = {}; (A.data.cards || []).forEach(c => { const u = parseFloat(String(c.unit == null ? '' : c.unit)); if (u > 0) cards[String(c.name).replace(/\s+/g, '')] = u; });
        if (Object.keys(cards).length) buildRows(cards);
      }
    } catch (e) { A.err = String(e && e.message || e); A.data = null; }
    A.busy = ''; draw();
  });
  document.body.appendChild(inp); inp.click();
}

// ---------- 돌리기 (백그라운드)
function run() {
  if (!A.data || A.worker) return;
  const H0 = ho(); if (!Object.keys(H0).length) { A.err = '출근자를 골라 주세요.'; draw(); return; }
  const rooms = A.data.rooms.map(x => ({ room: x.room, floor: x.floor, st: x.st, m1: x.m1, m2: x.m2 }));
  const hist = {}; const ym = A.date.slice(0, 7);
  ((A.cfgDoc && A.cfgDoc.hist2901) || []).filter(x => x.date.slice(0, 7) === ym && x.date < A.date).forEach(x => x.names.forEach(n => { hist[n] = (hist[n] || 0) + 1; }));
  const prev = A.prev.split(/[,·\s]+/).map(s => s.trim()).filter(Boolean);
  A.res = null; A.cmp = null; A.prog = 0; A.err = ''; A.running = true; draw();
  const w = new Worker(new URL('./assign_worker.js?v=' + VER, import.meta.url), { type: 'module' });
  A.worker = w;
  w.onmessage = e => {
    if (!A) return;
    if (e.data.p != null) { A.prog = e.data.p; const b = document.getElementById('asprog'); if (b) b.style.width = Math.round(A.prog * 100) + '%'; return; }
    w.terminate(); A.worker = null; A.running = false;
    if (e.data.err) { A.err = '배정 계산 오류: ' + e.data.err; draw(); return; }
    A.res = e.data.done; A.edits = []; A.mv = null; A.open = {};
    if (A.done) A.cmp = compare(A.done, A.res);
    saveLast(H0);
    draw();
  };
  w.onerror = e => { if (!A) return; A.worker = null; A.running = false; A.err = '배정 계산을 못 했어요: ' + (e.message || e); draw(); };
  w.postMessage({ rooms, ho: H0, cfg: { quota: quota() }, prev2901: prev, hist, opts: { seeds: [11, 23, 37, 51], iter: 150000 } });
}
function saveLast(H0) {
  lsSet('asg_ho', JSON.stringify(H0));
  const d = Object.assign({}, A.cfgDoc, { lastHo: H0, lastDate: A.date, at: H.S.SERVER_TIME, by: H.admin().label });
  if (A.cmp) {
    const log = (A.cfgDoc.log || []).filter(x => x.date !== A.date).concat([{ date: A.date, pct: A.cmp.pct, same: A.cmp.same, total: A.cmp.total, hkAvg: Math.round(A.cmp.hkAvg * 100) / 100, enAvg: Math.round(A.res.stats.avgFloors * 100) / 100, hkThree: A.cmp.hkThree.length, enThree: A.res.stats.three.length }]).slice(-60);
    d.log = log;
    const hkPlt = A.done.filter(x => String(x.room) === '2901' && x.name).map(x => String(x.name).replace(/ /g, '').split(',')).flat().filter(Boolean);
    if (hkPlt.length) d.hist2901 = ((A.cfgDoc.hist2901 || []).filter(x => x.date !== A.date)).concat([{ date: A.date, names: hkPlt }]).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-90);
  }
  A.cfgDoc = d;
  H.S.set('meta/assign', d).catch(() => {});
}

// ---------- 고치기 (객실 옮기기 · 2901 바꾸기) — 계산은 다시 안 돌리고 숫자만 다시 셈
function roomInfo() { const m = {}; A.data.rooms.forEach(x => { m[String(x.room)] = x; }); return m; }
function recount() {
  const R = A.res, info = roomInfo(), names = Object.keys(R.workers);
  names.forEach(n => { const w = R.workers[n];
    w.load = w.rooms.reduce((s, r) => s + (r === '2901' ? 1 : unitOf(info[r] || { room: r })), 0);
    w.floors = [...new Set(w.rooms.map(r => Math.floor(Number(r) / 100)))].sort((a, b) => b - a); });
  const fl = names.map(n => R.workers[n].floors.length).filter(k => k > 0);
  R.stats.avgFloors = fl.length ? fl.reduce((a, b) => a + b, 0) / fl.length : 0;
  R.stats.three = names.filter(n => R.workers[n].floors.length >= 3);
  R.stats.plt = names.filter(n => R.workers[n].rooms.includes('2901'));
  R.owner['2901'] = R.stats.plt.join(', ');
  R.stats.down = names.filter(n => R.workers[n].load < R.workers[n].ho - 1e-9);
  R.stats.up = names.filter(n => R.workers[n].load > R.workers[n].ho + 1e-9);
  R.stats.left = R.left.length;
  if (A.done) A.cmp = compare(A.done, R);
}
function moveRoom(room, from, to) {
  const R = A.res; if (!to || to === from) return;
  const a = R.workers[from], b = R.workers[to]; if (!a || !b) return;
  if (room === '2901' && b.rooms.includes('2901')) { A.err = to + ' 님은 이미 2901 을 맡았어요.'; return; }
  if (from === '(미배정)') { R.left = R.left.filter(r => r !== room); } else a.rooms.splice(a.rooms.indexOf(room), 1);
  b.rooms.push(room); if (room !== '2901') R.owner[room] = to;
  A.edits.push(room + ' ' + from + ' → ' + to); A.err = ''; recount();
}

// ---------- ✅ 확정 → 앱에 올리기 (초안일 때만)
async function confirmUpload() {
  const R = A.res;
  if (A.done) return;
  if (R.left.length && !confirm('미배정 객실이 ' + R.left.length + '실 있어요 (' + R.left.join(' ') + '). 그래도 올릴까요?')) return;
  if (!confirm(H.md(A.date) + ' 배정을 앱에 올릴까요?\n\n· 1~2분 안에 메이드 휴대폰에 들어가요\n· 정비 지원 더티 배분도 이 배정으로 불러와요\n· 같은 날 이미 올린 배정이 있으면 바뀌어요 (완료 기록은 그대로)')) return;
  try {
    const E = await import(new URL('../app/engine.js?v=' + VER, import.meta.url).href);
    const ownerOf = {}; Object.keys(R.workers).forEach(n => R.workers[n].rooms.forEach(r => { (ownerOf[r] = ownerOf[r] || []).push(n); }));
    const rooms = A.data.rooms.map(x => Object.assign({}, x, { name: ownerOf[String(x.room)] ? ownerOf[String(x.room)].join(', ') : '' }));
    const order = Object.keys(R.workers).filter(n => R.workers[n].rooms.length).sort((a, b) => (R.workers[b].floors[0] || 0) - (R.workers[a].floors[0] || 0));
    const cards = order.map((n, i) => ({ label: (i + 1) + '] ' + n, name: n, unit: R.workers[n].load, actual: '' }));
    const d2 = { rooms, cards, groups: A.data.groups || [], themes: A.data.themes || [] };
    const { rows } = E._test.makeRows(d2, A.date);
    const csv = E._test.toCsv(rows);
    const units = rows.reduce((s, r) => s + (ROYAL.includes(r[2]) ? 2 : 1), 0);
    const summary = { ok: !R.left.length, maids: new Set(rows.map(r => r[1])).size, rooms: rows.length, units, checks: [], tags: {}, groups: [], due: [] };
    H.upload({ date: A.date, file: '자동 배정 · ' + A.file, res: { csv, rows, sheet: A.sheet, summary, data: d2 } });
    const d = Object.assign({}, A.cfgDoc, { lastSent: { date: A.date, edits: A.edits.length, at: Date.now() } });
    H.S.set('meta/assign', d).catch(() => {});
    close();
  } catch (e) { A.err = '올리지 못했어요: ' + (e && e.message || e); draw(); }
}

// ---------- 그리기
function draw() {
  const box = document.getElementById('asp'); if (!box || !A) return;
  const esc = H.esc, y = box.scrollTop;
  let h = '<div class="vp-in"><div class="vp-head"><h2>🧩 자동 배정 <small style="font-size:13px;color:var(--muted);font-weight:600">시험 · 대조</small></h2><button class="vp-x" data-as="close" aria-label="닫기">✕</button></div>';
  // 1 날짜·파일
  const t0 = H.ymd(), t1 = H.addDays(t0, 1);
  h += '<div class="card"><h2>1 · 정비보고서</h2><div class="seg2">' + [[t0, '오늘'], [t1, '내일']].map(([d, l]) => '<button data-as="date" data-v="' + d + '" aria-pressed="' + (A.date === d) + '">' + l + ' ' + H.md(d) + '</button>').join('') + '</div>' +
    '<button class="big-btn' + (A.data ? ' sec' : '') + '" style="margin-top:10px" data-as="pick">' + (A.data ? '📄 ' + esc(A.file) + ' — 다른 파일' : '정비보고서 파일 고르기 (초안 또는 완성본)') + '</button>';
  if (A.busy) h += '<p class="note">' + esc(A.busy) + '</p>';
  if (A.err) h += '<p class="err" style="margin-top:10px">' + esc(A.err) + '</p>';
  if (A.data) {
    const T = A.data.rooms.filter(isTarget), skip = A.data.rooms.filter(x => /미정비/.test((x.m1 || '') + (x.m2 || ''))).length;
    const u = T.reduce((s, x) => s + (String(x.room) === '2901' ? 0 : unitOf(x)), 0), has2901 = T.some(x => String(x.room) === '2901');
    h += '<p class="note">' + esc(A.sheet) + '일 시트 · 정비 대상 <b>' + T.length + '실</b> = ' + u + '유닛' + (has2901 ? ' + 2901' : '') + (skip ? ' · 미정비(이월) ' + skip + '실 제외' : '') + '</p>';
    if (A.done) h += '<p class="okbox" style="margin-top:8px">이름이 들어 있는 <b>완성본</b>이에요 → 이름은 빼고 엔진이 새로 배정한 뒤 <b>하우스키퍼 배정과 대조</b>해요. 출근자·유닛은 완성본 카드대로 채웠어요.</p>';
  }
  h += '</div>';
  // 2 출근자
  if (A.data) {
    const on = A.rows.filter(r => r.on), sum = on.reduce((s, r) => s + Number(r.unit || 0), 0), q = quota();
    const list = A.showAll ? A.rows : A.rows.filter(r => r.on);
    h += '<div class="card"><h2>2 · 출근자 · 인계 유닛 <small>' + on.length + '명 · ' + sum + '유닛</small></h2>' +
      '<p class="note" style="margin:0 0 8px">관리자 인계표(RM 방배정표)대로 맞춰 주세요. 이름을 누르면 출근/휴무, 숫자는 인계 유닛이에요. 정량: 8 = 정규A 전환자, 7·4 = 신입.</p>' +
      '<div class="asg-rows">' + list.map(r => '<div class="asg-r' + (r.on ? '' : ' off') + '"><button data-as="tog" data-v="' + esc(r.name) + '">' + (r.on ? '✅ ' : '휴 ') + esc(r.name) + (q[r.name] != null ? '<small>정량 ' + q[r.name] + '</small>' : '') + '</button>' +
        (r.on ? '<span class="asg-u"><button data-as="u-" data-v="' + esc(r.name) + '">−</button><b>' + r.unit + '</b><button data-as="u+" data-v="' + esc(r.name) + '">+</button></span>' : '') + '</div>').join('') + '</div>' +
      '<div class="btn2"><button class="big-btn sec" data-as="all">' + (A.showAll ? '출근자만 보기' : '휴무자도 보기 (' + (A.rows.length - on.length) + ')') + '</button><button class="big-btn sec" data-as="paste">인계표 붙여넣기</button></div>' +
      (A.pasteOpen ? '<textarea class="vtxt" id="aspaste" rows="5" style="margin-top:10px" placeholder="이분남 9&#10;김화동 9&#10;…  (이름 유닛, 한 줄에 한 명 — 없는 분은 휴무)"></textarea><button class="big-btn" style="margin-top:8px" data-as="pasteok">이대로 출근자 바꾸기</button>' : '') +
      '<label class="asg-prev"><span>전날 2901</span><input id="asprev" value="' + esc(A.prev) + '" placeholder="예: 이분남, 강태금, 박순자"></label>' +
      '<p class="note" style="margin-top:0">전날 2901 한 분은 연속 배정을 피해요. 대조 기록을 저장하면 다음 날 자동으로 채워져요.</p>' +
      '<button class="big-btn" style="margin-top:6px" data-as="run"' + (A.running ? ' disabled' : '') + '>' + (A.running ? '배정 계산 중…' : '🧩 배정 돌리기') + '</button>' +
      (A.running ? '<div class="bar" style="margin-top:10px"><i id="asprog" style="width:' + Math.round(A.prog * 100) + '%"></i></div><p class="note">휴대폰에선 30초~1분 걸릴 수 있어요. 화면을 켜 두세요.</p>' : '') + '</div>';
  }
  // 3 결과
  if (A.res) h += resultHtml();
  box.innerHTML = h + '</div>';
  box.scrollTop = y;
}
function resultHtml() {
  const esc = H.esc, R = A.res, s = R.stats, C = A.cmp;
  let h = '<div class="card"><h2>3 · 배정안 <small>앱에는 아직 안 올라가요</small></h2>' +
    '<div class="kv"><div><b>' + s.left + '</b><span>미배정</span></div><div><b>' + s.avgFloors.toFixed(2) + '</b><span>평균 층 수</span></div><div><b>' + s.three.length + '</b><span>3개 층</span></div></div>' +
    '<p class="note">대상 ' + s.target + '실 = ' + s.units + '유닛 / 인계 ' + s.handover + '유닛 · 2901: <b>' + esc(s.plt.join(', ') || '없음') + '</b>' +
    (s.down.length ? '<br>유닛 다운: ' + esc(s.down.map(n => n + ' ' + R.workers[n].ho + '→' + R.workers[n].load).join(', ')) : '') +
    (s.up.length ? '<br>+1: ' + esc(s.up.map(n => n + ' ' + R.workers[n].ho + '→' + R.workers[n].load).join(', ')) : '') +
    (s.three.length ? '<br>3개 층: ' + esc(s.three.join(', ')) : '') + (R.left.length ? '<br><span style="color:var(--warn)">미배정: ' + R.left.map(r => '<button class="asg-chip bad" data-as="room" data-v="' + esc(r) + '" data-f="(미배정)">' + esc(r) + '</button>').join(' ') + '</span>' : '') + '</p>' +
    (A.edits && A.edits.length ? '<p class="note">✏️ 고친 것 ' + A.edits.length + '건: ' + esc(A.edits.slice(-5).join(' / ')) + (A.edits.length > 5 ? ' …' : '') + '</p>' : '') +
    (A.done ? '<p class="note">완성본으로 대조하는 중이라 앱에는 올리지 않아요. 초안을 넣으면 확정 버튼이 생겨요.</p>'
      : '<button class="big-btn" style="margin-top:10px" data-as="send">✅ 확정 → 앱에 올리기</button><p class="note">메이드별 줄을 눌러 객실을 다른 분에게 옮길 수 있어요. 올리면 허브의 정비보고서 올리기와 같은 길로 메이드 휴대폰·더티 배분에 들어가요.</p>') + '</div>';
  if (C) {
    h += '<div class="card"><h2>하우스키퍼와 대조 <small>' + esc(H.md(A.date)) + '</small></h2>' +
      '<div class="kv"><div><b>' + C.pct + '%</b><span>같은 사람 (' + C.same + '/' + C.total + ')</span></div><div><b>' + C.hkAvg.toFixed(2) + ' / ' + s.avgFloors.toFixed(2) + '</b><span>평균 층 HK / 엔진</span></div><div><b>' + C.hkThree.length + ' / ' + s.three.length + '</b><span>3개 층 HK / 엔진</span></div></div>' +
      '<p class="note">기록이 저장됐어요 (2901 하우스키퍼 실제 → 다음 날 \'전날 2901\'). 지난 대조: ' + esc(((A.cfgDoc.log || []).slice(-6).map(x => H.md(x.date) + ' ' + x.pct + '%')).join(' · ')) + '</p></div>';
  }
  const names = Object.keys(R.workers).sort((a, b) => (R.workers[b].floors[0] || 0) - (R.workers[a].floors[0] || 0));
  h += '<div class="card"><h2>메이드별 <small>누르면 객실·이유</small></h2><div class="asg-list">' + names.map(n => {
    const w = R.workers[n], row = C ? C.rows.find(x => x.name === n) : null, op = A.open[n];
    const fl = w.floors.map(f => f + 'F').join('·');
    return '<button class="asg-m' + (w.floors.length >= 3 ? ' hot' : '') + '" data-as="open" data-v="' + esc(n) + '"><span class="n"><b>' + esc(n) + '</b> <small>' + w.ho + (w.load !== w.ho ? '→' + w.load : '') + '유닛</small></span>' +
      '<span class="f">' + esc(fl) + (row ? '<small>HK ' + esc(row.hkFloors.map(f => f + 'F').join('·') || '-') + ' · 같은 방 ' + row.same + '/' + row.hk + '</small>' : '') + '</span></button>' +
      (op ? '<div class="asg-why"><div class="asg-chips">' + w.rooms.slice().sort().map(r => '<button class="asg-chip' + (A.mv && A.mv.room === r && A.mv.from === n ? ' on' : '') + '" data-as="room" data-v="' + esc(r) + '" data-f="' + esc(n) + '">' + esc(r) + '</button>').join('') + '</div>' +
        (A.mv && A.mv.from === n ? moveHtml() : '') + '<small>' + esc(w.why.join(' / ')) + '</small></div>' : '');
  }).join('') + '</div></div>';
  if (A.mv && A.mv.from === '(미배정)') h = h.replace('<div class="card"><h2>메이드별', '<div class="card">' + moveHtml() + '</div><div class="card"><h2>메이드별');
  return h;
}
function moveHtml() {
  const esc = H.esc, R = A.res, m = A.mv;
  const opts = Object.keys(R.workers).filter(n => n !== m.from).sort((a, b) => a.localeCompare(b, 'ko'));
  return '<div class="asg-mv"><b>' + esc(m.room) + '호</b>를 <select id="asto">' + opts.map(n => '<option value="' + esc(n) + '">' + esc(n) + ' (' + R.workers[n].load + '유닛 · ' + esc(R.workers[n].floors.map(f => f + 'F').join('·') || '-') + ')</option>').join('') + '</select>' +
    '<button class="big-btn" data-as="mvok">옮기기</button><button class="big-btn sec" data-as="mvx">취소</button></div>';
}

document.addEventListener('click', e => {
  if (!A) return;
  const t = e.target.closest && e.target.closest('#asp [data-as]'); if (!t) return;
  const a = t.getAttribute('data-as'), v = t.getAttribute('data-v');
  const pv = document.getElementById('asprev'); if (pv) A.prev = pv.value;
  if (a === 'close') { close(); return; }
  if (a === 'pick') { pick(); return; }
  if (a === 'date') { if (A.date === v) return; A.date = v; A.data = null; A.done = null; A.res = null; A.cmp = null; A.file = ''; draw(); return; }
  if (a === 'tog') { const r = A.rows.find(x => x.name === v); if (r) { r.on = !r.on; A.res = null; A.cmp = null; } draw(); return; }
  if (a === 'u-' || a === 'u+') { const r = A.rows.find(x => x.name === v); if (r) { r.unit = Math.max(1, Math.min(15, Number(r.unit) + (a === 'u+' ? 1 : -1))); A.res = null; A.cmp = null; } draw(); return; }
  if (a === 'all') { A.showAll = !A.showAll; draw(); return; }
  if (a === 'paste') { A.pasteOpen = !A.pasteOpen; draw(); return; }
  if (a === 'pasteok') {
    const txt = (document.getElementById('aspaste') || {}).value || '', got = {};
    txt.split(/\n/).forEach(l => { const m = /([가-힣A-Za-z]{2,10})\s*[:\t ,]?\s*(\d{1,2}(?:\.\d)?)/.exec(l.replace(/^\s*\d+[.)]?\s*/, '')); if (m) got[m[1]] = Number(m[2]); });
    if (!Object.keys(got).length) { A.err = '인계표에서 "이름 유닛"을 못 찾았어요.'; draw(); return; }
    buildRows(got); A.pasteOpen = false; A.res = null; A.cmp = null; A.err = ''; draw(); return;
  }
  if (a === 'run') { run(); return; }
  if (a === 'open') { A.open[v] = !A.open[v]; draw(); return; }
  if (a === 'room') { const f = t.getAttribute('data-f'); A.mv = A.mv && A.mv.room === v && A.mv.from === f ? null : { room: v, from: f }; draw(); return; }
  if (a === 'mvx') { A.mv = null; draw(); return; }
  if (a === 'mvok') { const to = (document.getElementById('asto') || {}).value; if (A.mv) moveRoom(A.mv.room, A.mv.from, to); A.mv = null; draw(); return; }
  if (a === 'send') { confirmUpload(); return; }
});

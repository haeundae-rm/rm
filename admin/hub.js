// 객실 통합 관리 — 관리자 허브 (2026-11-12, 1단계 '대문')
// 각 앱(정비 레포트 · 정비 지원 · 입퇴사 서류 · 재고)은 그대로 두고, 관리자 입구 하나 + 오늘 한눈에 + 바로가기 + 전 파트 직원 명단
// 같은 주소(haeundae-rm.github.io) 아래라 여기서 로그인하면 정비 레포트·정비 지원도 관리자로 열림 (Firebase 로그인 공유)
// 읽기: 열 때 · '새로 고침' · 화면으로 돌아올 때(2분 지난 경우)만 한 번씩 (실시간 구독 안 함 — Firestore 읽기 아끼기)
// 2단계 (2026-11-13): 📥 정비보고서 올리기 — 정비 레포트 관리자와 같은 계산(engine.js)·같은 저장(uploads/latest + uploads/rep_{날짜})
//   → 중계가 시트 '배정' 탭·메이드 휴대폰으로, 정비 지원 '더티 배분 만들기'는 파일 없이 불러옴. 정비 레포트 쪽 버튼도 그대로 둠(1~2주 같이 씀)
// 2단계 ② (2026-11-13): 🛏 더티 배분 만들기 — 정비 지원의 화면 파일(dist.js · distcalc.js)을 그대로 불러와 허브에서 엶 (같은 계산·같은 저장 sup/{날짜})
//   정비 지원 앱 쪽 버튼도 그대로 둠
// 2단계 ④ (2026-11-13): 🗺 객실 활동판 — 정비 지원 화면을 허브 안 전체 창(iframe /dirty/?hub=act)으로 열어 활동판을 바로 띄움.
//   같은 주소라 로그인 공유, 활동판을 닫으면 정비 지원이 알려 와서(postMessage) 창을 닫고 오늘 한눈에 다시 읽음. 열려 있는 동안만 정비 지원 구독
// 배정 자동화 1단계 (2026-11-13): 🧩 자동 배정 (시험·대조) — assignui.js · assign.js(엔진) · assign_worker.js. 보기·대조만, 앱에 안 올림
// 2단계 ③ (2026-11-13): 📣 고객만족도 VOC — 정비 레포트 voc.js 를 그대로 불러와 허브 전체 화면에서 씀 (같은 voc/{id} 문서). 열려 있는 동안만 voc 구독
import * as S from '../app/store.js';

const VER = '2026.11.13-10';
const ADMINS = [
  { uid: 'iw2orXgIgPgTbLUQa0b41XJ9Dvd2', label: '소장', email: 'unieshaeundae+admin@gmail.com' },
  { uid: 'Fz4T5ZzIxShOdVkNpF9gzMmOLED2', label: '부소장', email: 'unieshaeundae+sub@gmail.com' }
];
const ROYAL = { '3001': 1, '3002': 1, '3101': 1, '3102': 1 };   // 로얄 = 2실 (레포트 앱과 같음)
const JOBS = ['관리', '룸메이드', '정비보조', '하우스키퍼', '하우스맨', '오더테이커', '미화', '사우나', '기타'];
const LINKS = [
  { ic: '🧹', t: '정비 레포트', s: '메이드별 현황 · 룸메이드 명단 · 메이드 화면', href: '../' },
  { ic: '🛏', t: '정비 지원', s: '정비보조 명단 · 정비보조 화면', href: '../../dirty/' },
  { ic: '📝', t: '입퇴사 서류', s: '근로계약서 · 입사서류 · 사직서 (별도 비밀번호)', href: '../../unies-contract/' },
  { ic: '📦', t: '재고조사', s: '객실 · 사우나 재고 (부소장)', href: '../../inventory/' }
];

const $ = s => document.querySelector(s);
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const seoul = (t = Date.now()) => new Date(t + 9 * 3600e3);
const ymd = (t = Date.now()) => seoul(t).toISOString().slice(0, 10);
const hm = t => { if (!t) return ''; const d = seoul(Number(t)); return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); };
const md = d => (d ? Number(d.slice(5, 7)) + '/' + Number(d.slice(8)) : '');
const ago = t => { const m = Math.max(0, Math.round((Date.now() - Number(t)) / 60000)); return m < 1 ? '방금' : m < 60 ? m + '분 전' : Math.floor(m / 60) + '시간 ' + (m % 60) + '분 전'; };
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

let user = null, admin = null, view = { st: null, busy: false, err: '', at: 0 }, login = { who: 0, err: '', busy: false };

function head() {
  const t = seoul(), d = ymd();
  $('#calm').textContent = Number(d.slice(5, 7)) + '월 · ' + DAYS[t.getUTCDay()];
  $('#cald').textContent = Number(d.slice(8));
  $('#today').textContent = '한화리조트 해운대' + (admin ? ' · ' + admin.label : '');
  const v = admin && view.st, ring = $('#ring'), line = $('#hline');
  if (!v) { ring.hidden = true; line.innerHTML = ''; return; }
  const p = progress(v), L = statusItems(v), nb = L.filter(x => x.lv === 'bad').length, nw = L.filter(x => x.lv === 'wait').length;
  ring.hidden = false;
  const C = 150.8, off = p.total ? C * (1 - p.pct / 100) : C;
  ring.innerHTML = '<svg width="56" height="56" viewBox="0 0 58 58"><circle cx="29" cy="29" r="24" stroke="rgba(255,255,255,.14)" stroke-width="6" fill="none"/>' +
    (p.total ? '<circle cx="29" cy="29" r="24" stroke="#E8C77A" stroke-width="6" fill="none" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 29 29)"/>' : '') +
    '</svg><b>' + (p.total ? p.pct + '%' : '-') + '</b>';
  ring.title = '오늘 정비 진행';
  line.innerHTML = '<span><i class="dot' + (nb ? ' bad' : nw ? ' wait' : '') + '"></i>' + (nb ? '확인 필요 ' + nb + '건' : nw ? '주의 ' + nw + '건' : '모두 정상') + '</span>' +
    (p.maids ? '<span>메이드<b>' + p.maids + '</b></span>' : '') +
    (p.total ? '<span>남은 실<b>' + Math.max(0, p.total - p.doneU) + '</b></span>' : '') +
    (p.issue ? '<span>이상<b style="color:#F3B1B9">' + p.issue + '</b></span>' : '');
}

// ---------- 로그인 (소장 · 부소장 — 레포트 앱과 같은 계정)
function loginHtml() {
  return '<div class="card login"><h2>관리자 로그인</h2>' +
    '<div class="seg">' + ADMINS.map((a, i) => '<button data-who="' + i + '" aria-pressed="' + (login.who === i) + '">' + a.label + '</button>').join('') + '</div>' +
    '<input id="pw" type="password" autocomplete="current-password" placeholder="비밀번호">' +
    (login.err ? '<p class="err">' + esc(login.err) + '</p>' : '') +
    '<button class="big-btn" data-login="1"' + (login.busy ? ' disabled' : '') + '>' + (login.busy ? '확인 중…' : '들어가기') + '</button>' +
    '<p class="note">정비 레포트 관리자와 같은 비밀번호예요. 한 번 들어가면 정비 레포트 · 정비 지원도 관리자로 열려요.</p></div>';
}
async function doLogin() {
  const pw = ($('#pw') || {}).value || '';
  if (!pw) { login.err = '비밀번호를 적어 주세요.'; draw(); return; }
  login.busy = true; login.err = ''; draw();
  try { await S.signInEmail(ADMINS[login.who].email, pw); }
  catch (e) { login.err = /network|offline/i.test(String(e && (e.code || e.message))) ? '인터넷 연결을 확인해 주세요.' : '비밀번호가 맞지 않아요.'; }
  login.busy = false; draw();
}

// ---------- 오늘 한눈에 (한 번 읽기)
const safe = p => p.then(x => x, e => ({ __err: String(e && (e.code || e.message) || e) }));
async function load(force) {
  if (!admin || view.busy) return;
  if (!force && view.at && Date.now() - view.at < 120000) return;
  view.busy = true; draw();
  const d = ymd(), tm = ymd(Date.now() + 864e5);
  const [up, rl, srl, cmp, sup, day, recs, errs] = await Promise.all([
    safe(S.get('uploads/latest')), safe(S.get('meta/relay')), safe(S.get('sup_meta/relay')), safe(S.get('meta/compare')),
    safe(S.get('sup/' + d)), safe(S.get('days/' + d)),
    safe(S.getQuery('days/' + d + '/recs', [])), safe(S.getQuery('errors', [['day', '==', d]]))
  ]);
  // 오늘 배정 실 수: 그날 정비보고서 저장본(rep_) → 없으면 올림 문서(오늘 것) → 없으면 메이드별 배정(plans)
  let base = await safe(S.get('uploads/rep_' + d));
  if (bad(base) || !Array.isArray(base.rooms)) {
    base = null;
    if (!(up && !up.__err && up.date === d && Number(up.units || up.rooms))) {
      const pl = await safe(S.getQuery('days/' + d + '/plans', []));
      if (Array.isArray(pl) && pl.length) base = { rooms: [].concat(...pl.map(x => (x.data && x.data.rooms) || []).map(rs => rs.map(r => ({ room: r.room, name: 'x' })))) };
    }
  }
  // 더티·정비보조: 오늘 기록 줄(체크·근태) / 진행 중 활동: 개수만 세기(count — 체크 문서를 받지 않음)
  const [rows, acts] = await Promise.all([safe(S.getQuery('sup/' + d + '/rows', [])), safe(S.getQuery('acts', [['status', '==', '진행']]))]);
  let actList = acts;
  if (Array.isArray(acts) && acts.length) {
    const ex = await actExcl();
    const t0 = new Date(Date.parse(d + 'T00:00:00+09:00'));
    actList = await Promise.all(acts.filter(a => String(a.id).indexOf('CHECK-') !== 0).map(async a => {
      const x = a.data || {}, c = 'acts/' + a.id + '/marks';
      const [proc, td] = await Promise.all([safe(S.count(c, [['s', 'in', ['완료', '이상']]])), safe(S.count(c, [['s', 'in', ['완료', '이상']], ['at', '>=', t0]]))]);
      const target = ex ? ex.rooms.length - ex.parse(x.exclText || '').length : 0;
      return { id: a.id, name: x.name || a.id, color: x.color || '', due: x.due || '', doneName: x.doneName || '', proc: typeof proc === 'number' ? proc : null, today: typeof td === 'number' ? td : null, target };
    }));
  }
  view.st = { d, tm, up, rl, srl, cmp, sup, day, recs, errs, base, rows, acts: actList };
  view.busy = false; view.at = Date.now(); draw();
}
function bad(x) { return !x || x.__err; }
function statusItems(v) {
  const L = [], now = Date.now(), H = Number(seoul().toISOString().slice(11, 13));
  const add = (lv, title, sub) => L.push({ lv, title, sub });
  // 정비보고서 올림
  const u = v.up;
  if (u && u.__err) add('bad', '정비보고서 상태를 못 읽었어요', u.__err);
  else if (u && u.date === v.d) {
    if (u.state === 'done') add('ok', '오늘 배정표 반영 완료', hm(u.doneAt) + (u.who ? ' · ' + u.who : '') + (u.rooms ? ' · 객실 ' + u.rooms + '개' : ''));
    else if (u.state === 'wait') add(now - Number(u.at) > 4 * 60000 ? 'bad' : 'wait', now - Number(u.at) > 4 * 60000 ? '배정표 반영이 늦어요' : '배정표 시트에 넣는 중', hm(u.at) + ' 올림 · 중계 상태를 같이 보세요');
    else add('bad', '오늘 배정표 반영 실패', String(u.msg || '') + ' — 정비 레포트에서 다시 올려 주세요');
  } else if (u && u.date === v.tm) add('ok', '내일(' + md(v.tm) + ') 배정표까지 올림', hm(u.doneAt || u.at) + (u.who ? ' · ' + u.who : ''));
  else add(H >= 7 ? 'bad' : 'wait', '오늘 정비보고서가 아직 안 올라왔어요', '정비 레포트 → 배정 → 정비보고서 올리기');
  // 더티 배분
  const sp = v.sup;
  if (sp && sp.__err) add('wait', '더티 배분 상태를 못 읽었어요', sp.__err);
  else if (sp && Array.isArray(sp.plan) && sp.plan.length) {
    const ws = Array.from(new Set(sp.plan.map(x => x && x.w).filter(Boolean)));
    add('ok', '더티 배분 확정', '정비보조 ' + ws.length + '명' + (sp.src === 'app' ? ' · 앱에서 확정' : ''));
  } else add(H >= 9 ? 'bad' : 'wait', '오늘 더티 배분이 아직이에요', '정비 지원 → 📋 더티 배분 만들기');
  // 중계 두 개
  [['정비 레포트 시트 중계', v.rl], ['정비 지원 시트 중계', v.srl]].forEach(([nm, r]) => {
    if (bad(r) || !r.at) { add('bad', nm + ' 기록 없음', r && r.__err ? r.__err : '중계가 한 번도 안 돌았어요'); return; }
    const old = now - Number(r.at) > 12 * 60000;
    if (!r.ok) add('bad', nm + ' 오류', String(r.err || '').slice(0, 120));
    else if (old) add('bad', nm + ' 멈춤', '마지막 ' + ago(r.at) + ' — 시트에 기록이 안 옮겨지고 있어요');
    else add('ok', nm + ' 정상', ago(r.at));
  });
  // 대조
  const c = v.cmp;
  if (c && !c.__err && c.day === v.d) {
    if (c.ok) add('ok', '오늘 대조 차이 0건', (c.slot === '수동' ? hm(c.at) + ' 수동' : c.slot + '시') + ' · 앱 ' + c.app + ' = 시트 ' + c.sheet);
    else add('bad', '오늘 대조 차이 ' + c.n + '건', '정비 레포트 → 배정 탭에서 보기');
  }
  // 휴대폰 오류
  const e = v.errs;
  if (Array.isArray(e) && e.length) {
    const who = Array.from(new Set(e.map(x => x.data && x.data.name).filter(Boolean)));
    add('wait', '휴대폰 오류 오늘 ' + e.length + '건', (who.length ? who.slice(0, 4).join(', ') + (who.length > 4 ? ' 외' : '') + ' · ' : '') + '정비 레포트 → 설정에서 보기');
  } else if (Array.isArray(e)) add('ok', '휴대폰 오류 없음', '');
  return L;
}
function progress(v) {
  const r = Array.isArray(v.recs) ? v.recs : [], done = {}, issue = {};
  let last = 0;
  r.forEach(x => { const d = x.data || {}; if (d.status === '완료' || d.status === '이상') { done[d.room] = 1; if (d.status === '이상') issue[d.room] = 1; if (Number(d.at) > last) last = Number(d.at); } });
  const u = v.up && !v.up.__err && v.up.date === v.d ? v.up : null;
  let total = 0;
  if (v.base && Array.isArray(v.base.rooms)) { const seen = {}; v.base.rooms.forEach(x => { if (x && x.name && !seen[x.room]) { seen[x.room] = 1; total += ROYAL[x.room] ? 2 : 1; } }); }
  if (!total && u) total = Number(u.units || u.rooms || 0);
  const doneU = Object.keys(done).reduce((s, k) => s + (ROYAL[k] ? 2 : 1), 0);
  const maids = v.day && !v.day.__err && Array.isArray(v.day.maids) ? v.day.maids.length : (u ? u.maids : 0);
  return { total, doneU, pct: total ? Math.min(100, Math.round(doneU * 100 / total)) : 0, issue: Object.keys(issue).length, last, maids, err: v.recs && v.recs.__err };
}
// 활동판 제외 객실 글 → 객실 (정비 지원 act.js 와 같은 규칙을 그대로 씀)
let exP = null;
function actExcl() {
  if (window.actExcl) return Promise.resolve(window.actExcl);
  if (!exP) exP = new Promise(res => { const sc = document.createElement('script'); sc.src = new URL('../../dirty/act.js', import.meta.url).href; sc.onload = () => res(window.actExcl || null); sc.onerror = () => { exP = null; res(null); }; document.head.appendChild(sc); });
  return exP;
}
const COLORS = { '하늘색': '#3BA7E0', '민트': '#1FB59A', '연두': '#7CB518', '주황': '#F08C00', '보라': '#8E5CD9', '분홍': '#E0559A' };
function dirtyHtml(v) {
  const sp = v.sup && !v.sup.__err ? v.sup : null, plan = sp && Array.isArray(sp.plan) ? sp.plan : [];
  let h = '<div class="card"><h2>더티 · 정비보조</h2>';
  if (v.rows && v.rows.__err) return h + '<p class="err">정비 지원 기록을 못 읽었어요: ' + esc(v.rows.__err) + '</p></div>';
  const rows = (Array.isArray(v.rows) ? v.rows : []).map(x => x.data || {}).sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
  const att = {}, chk = {};
  rows.forEach(x => {
    const r = Array.isArray(x.row) ? x.row : [];
    if (x.tab === '근태' && r[2] && ['출근', '퇴근', '퇴근취소'].indexOf(r[3]) >= 0) att[r[2]] = r[3];
    if (x.tab === '체크' && r[2]) chk[String(r[2]).replace(/^'/, '')] = r[5];
  });
  const inNow = Object.keys(att).filter(n => att[n] !== '퇴근'), outN = Object.keys(att).filter(n => att[n] === '퇴근');
  const total = plan.reduce((s, x) => s + (Number(x && x.n) || 0), 0), done = Object.keys(chk).filter(k => chk[k] === '완료').length;
  const ws = Array.from(new Set(plan.map(x => x && x.w).filter(Boolean)));
  const pct = total ? Math.min(100, Math.round(done * 100 / total)) : 0;
  if (total) h += '<div class="prog"><div class="big">' + pct + '%<small>더티 ' + done + ' / ' + total + '실</small></div><div class="bar"><i style="width:' + pct + '%;background:linear-gradient(90deg,#9A4708,#D27A2C)"></i></div></div>';
  else h += '<p class="note" style="margin:0 0 10px">' + (plan.length ? '오늘은 더티 지원 객실이 없어요.' : '오늘 더티 배분이 아직이에요.') + (done ? ' 지금까지 더티 완료 ' + done + '실.' : '') + '</p>';
  h += '<div class="kv"><div><b>' + inNow.length + '</b><span>출근 중</span></div><div><b>' + ws.length + '</b><span>더티 담당</span></div><div><b>' + outN.length + '</b><span>퇴근</span></div></div>';
  if (inNow.length) h += '<p class="note">출근: ' + esc(inNow.join(', ')) + '</p>';
  return h + '<button class="big-btn' + (plan.length ? ' sec' : '') + '" style="margin-top:12px" data-hdist="1">📋 더티 배분 ' + (plan.length ? '다시 만들기' : '만들기') + '</button></div>';
}
function actsHtml(v) {
  let h = '<div class="card"><h2>진행 중 활동 <small>객실 활동판</small></h2>';
  if (v.acts && v.acts.__err) return h + '<p class="err">활동을 못 읽었어요: ' + esc(v.acts.__err) + '</p></div>';
  const L = Array.isArray(v.acts) ? v.acts : [];
  const btn = '<button class="big-btn sec" style="margin-top:12px" data-act="1">🗺 객실 활동판 열기 <small style="font-weight:600;color:var(--muted)">만들기 · 고치기 · 도면 · 출력</small></button>';
  if (!L.length) return h + '<p class="note" style="margin:0">지금 진행 중인 활동이 없어요.</p>' + btn + '</div>';
  h += L.map(a => {
    const pct = a.target && a.proc !== null ? Math.min(100, Math.round(a.proc * 1000 / a.target) / 10) : 0, col = COLORS[a.color] || '#1FB59A';
    return '<div style="padding:8px 0;border-top:1px solid var(--line)"><div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><b style="font-size:15px"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:' + col + ';margin-right:6px"></span>' + esc(a.name) + '</b>' +
      '<span style="font-weight:900;font-variant-numeric:tabular-nums">' + (a.proc === null ? '-' : pct + '%') + '</span></div>' +
      '<div class="bar" style="height:10px;margin:6px 0"><i style="width:' + pct + '%;background:' + col + '"></i></div>' +
      '<span class="note" style="margin:0">' + (a.proc === null ? '개수를 못 셌어요' : a.proc + ' / ' + a.target + '실' + (a.today ? ' · 오늘 +' + a.today : '')) + (a.due ? ' · 목표 ' + esc(md(a.due)) : '') + '</span></div>';
  }).join('');
  return h + btn + '</div>';
}
// ---------- 📥 정비보고서 올리기 (2단계, 2026-11-13)
let up = null, engine = null, upPoll = null;
const FAST = window.__hubFast ? 0.02 : 1;   // 시험에서만 기다림을 짧게
const addDays = (d, n) => ymd(Date.parse(d + 'T12:00:00+09:00') + n * 864e5);
const W = r => (ROYAL[r] ? 2 : 1);
const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
function upDefaultDate() { return seoul().toISOString().slice(11, 16) >= '15:00' ? addDays(ymd(), 1) : ymd(); }
function pickXlsx() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; inp.style.display = 'none';
  inp.addEventListener('change', () => {
    const f = inp.files && inp.files[0]; inp.remove();
    if (!f) return;
    up = { file: f.name, date: upDefaultDate(), res: null, err: '', busy: true, buf: null };
    draw(); scrollUp();
    f.arrayBuffer().then(buf => { if (up && up.file === f.name) { up.buf = buf; return upBuild(); } })
      .catch(e => { if (up) { up.busy = false; up.err = '파일을 읽지 못했어요: ' + (e && e.message || e); draw(); } });
  });
  document.body.appendChild(inp); inp.click();
}
async function upBuild() {
  const u0 = up; u0.busy = true; u0.res = null; u0.err = ''; draw();
  try {
    if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 엑셀 읽기를 지원하지 않아요. PC 크롬이나 최신 휴대폰에서 해 주세요.');
    if (!engine) engine = await import(new URL('../app/engine.js?v=' + VER, import.meta.url).href);
    const res = await engine.buildFromXlsx(u0.buf, u0.date);
    if (up === u0) u0.res = res;
  } catch (e) { if (up === u0) u0.err = String(e && e.message || e); }
  u0.busy = false; if (up === u0) draw();
}
function repDoc(u0, r) {
  const v = x => (x === null || x === undefined ? '' : x);
  return { date: u0.date, csv: '', kind: 'report', sheet: r.sheet, file: String(u0.file).slice(0, 80), at: S.SERVER_TIME, by: user.uid, who: admin.label,
    cards: (r.data.cards || []).map(c => ({ label: String(v(c.label)), name: String(v(c.name)), unit: v(c.unit), actual: v(c.actual) })),
    rooms: (r.data.rooms || []).map(x => { const o = { room: String(x.room), st: v(x.st) }; if (x.name) o.name = String(x.name); return o; }) };
}
function upSend(skipAsk) {
  const u0 = up, r = u0 && u0.res, s = r && r.summary;
  if (!s || u0.sending) return;
  if (!s.ok && !skipAsk && !confirm('검증에서 다른 점이 있어요. 그래도 올릴까요?')) return;
  u0.sending = true; u0.err = ''; draw();
  if (r.data) S.set('uploads/rep_' + u0.date, repDoc(u0, r)).catch(() => {});   // 정비 지원 더티 배분용 (실패해도 배정 올리기는 그대로)
  withTimeout(S.set('uploads/latest', { date: u0.date, csv: r.csv, state: 'wait', at: S.SERVER_TIME, by: user.uid, who: admin.label, file: String(u0.file).slice(0, 80),
    sheet: r.sheet, maids: s.maids, rooms: s.rooms, units: s.units, ok: s.ok }), 20000, '인터넷 연결을 확인하고 다시 눌러 주세요.')
    .then(() => { up = { sent: { date: u0.date, at: Date.now() } }; draw(); watchUp(); },
      e => { if (up === u0) { u0.sending = false; u0.err = '올리지 못했어요: ' + (e && (e.code || e.message) || e); draw(); } });
}
// 올린 뒤: 중계가 끝날 때까지 uploads/latest 문서 하나만 20초마다 다시 읽음 (최대 5분)
function watchUp() {
  clearTimeout(upPoll);
  const t0 = Date.now();
  const tick = async () => {
    if (!up || !up.sent) return;
    const u = await safe(S.get('uploads/latest'));
    if (u && !u.__err && view.st) view.st.up = u;
    if (u && !u.__err && u.date === up.sent.date && u.state && u.state !== 'wait') { up.sent.done = u.state; up.sent.msg = u.msg || ''; draw(); load(true); return; }
    draw();
    if (Date.now() - t0 < 5 * 60000 * FAST) upPoll = setTimeout(tick, 20000 * FAST); else { up.sent.slow = true; draw(); }
  };
  upPoll = setTimeout(tick, 15000 * FAST);
}
function scrollUp() { setTimeout(() => { const el = document.getElementById('upcard'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50); }
function upPerMaid(rows) {
  const c = {}, o = []; rows.forEach(r => { if (!(r[1] in c)) { c[r[1]] = 0; o.push(r[1]); } c[r[1]] += W(r[2]); });
  return o.map(n => esc(n) + ' ' + c[n]).join(' · ');
}
function upHtml() {
  let h = '<div class="card" id="upcard"><h2>📥 정비보고서 올리기 <small>메이드 배정 · 더티 배분 자료 한 번에</small></h2>';
  if (!up) {
    return h + '<button class="big-btn" data-up="pick">정비보고서 파일 고르기</button>' +
      '<p class="note">엑셀(.xlsx)을 고르면 이 기기에서 배정표를 만들어 확인 화면을 보여 줘요. 올리면 1~2분 안에 메이드 휴대폰에 들어가고, 정비 지원 더티 배분은 파일 없이 불러와요.</p></div>';
  }
  if (up.sent) {
    const x = up.sent, d = md(x.date);
    if (x.done === 'done') h += '<p class="okbox">✅ ' + esc(d) + ' 배정표 반영 완료' + (x.msg ? ' · ' + esc(x.msg) : '') + '</p>' +
      '<button class="big-btn" data-hdist="1">🛏 다음: 더티 배분 만들기</button>';
    else if (x.done) h += '<p class="err">❌ ' + esc(d) + ' 배정표 반영 실패 · ' + esc(x.msg) + ' — 파일을 확인하고 다시 올려 주세요.</p>';
    else h += '<p class="waitbox">⏳ ' + esc(d) + ' 배정표를 올렸어요. 시트에 넣는 중 (1~2분)…' + (x.slow ? '<br><b>5분 넘게 걸려요 — 위 중계 상태를 확인해 주세요.</b>' : '') + '</p>';
    return h + '<button class="big-btn sec" style="margin-top:10px" data-up="reset">' + (x.done === 'done' ? '다른 파일 올리기' : '닫기') + '</button></div>';
  }
  const r = up.res, s = r && r.summary, t0 = ymd(), t1 = addDays(t0, 1), v = view.st || {};
  h += '<p class="note" style="margin:0 0 8px">📄 ' + esc(up.file) + '</p><div class="seg2">' +
    [[t0, '오늘'], [t1, '내일']].map(([d, l]) => '<button data-upd="' + d + '" aria-pressed="' + (up.date === d) + '">' + l + ' ' + md(d) + '</button>').join('') + '</div>';
  if (up.busy) h += '<p class="note">엑셀을 읽는 중…</p>';
  if (up.err) h += '<p class="err" style="margin-top:10px">' + esc(up.err) + '</p>';
  if (s) {
    h += '<div class="upsum"><p><b>' + esc(r.sheet) + '일 시트</b> · 메이드 <b>' + s.maids + '명</b> · 객실 <b>' + s.rooms + '개</b> = ' + s.units + '실 (로얄 2실)</p>' +
      '<ul class="upchk">' + s.checks.map(c => '<li class="' + (c.ok ? 'ok' : 'no') + '">' + (c.ok ? '✅ ' : '❌ ') + esc(c.msg) + '</li>').join('') + '</ul>' +
      '<p class="note">' + Object.keys(s.tags).sort((a, b) => s.tags[b] - s.tags[a]).map(k => esc(k) + ' ' + s.tags[k]).join(' · ') + '</p>' +
      (s.groups.length ? '<p class="note">단체: ' + s.groups.map(g => esc(g.name) + '(' + g.rooms + '실' + (g.time ? ', 입실 ' + esc(g.time) : '') + ')').join(' / ') + '</p>' : '') +
      (s.due.length ? '<p class="note">시간 지정: ' + s.due.map(x => esc(x.room) + '(' + esc(x.maid) + ') ' + esc(x.due)).join(', ') + '</p>' : '') +
      '<details><summary>메이드별 객실 수</summary><p class="note">' + upPerMaid(r.rows) + '</p></details></div>';
    if (!s.ok) h += '<div class="warnbox"><b>검증에서 다른 점이 있어요.</b> 정비보고서를 확인하고 고친 뒤 다시 올리는 게 좋아요.</div>';
    const nrec = Array.isArray(v.recs) ? v.recs.filter(x => x.data && (x.data.status === '완료' || x.data.status === '이상')).length : 0;
    if (up.date === t0 && nrec) h += '<div class="warnbox">오늘 이미 완료 기록이 ' + nrec + '건 있어요. 배정이 바뀌어도 <b>완료 기록은 그대로</b> 남아요.</div>';
    const u = v.up && !v.up.__err ? v.up : null;
    if (u && u.date === up.date && u.state === 'done') h += '<p class="note">' + esc(md(up.date)) + ' 배정표는 ' + esc(hm(u.doneAt)) + '에 이미 올렸어요' + (u.who ? ' (' + esc(u.who) + ')' : '') + '. 올리면 새 파일로 바뀌어요.</p>';
  }
  h += '<div class="btn2"><button class="big-btn sec" data-up="reset">취소</button><button class="big-btn' + (s && !s.ok ? ' danger' : '') + '" data-up="send"' + (!s || up.sending ? ' disabled' : '') + '>' +
    (up.sending ? '올리는 중…' : s && !s.ok ? '그래도 올리기' : '앱에 올리기') + '</button></div>';
  return h + '</div>';
}
// ---------- 🛏 더티 배분 만들기 (2단계 ②) — 정비 지원 dist.js 가 쓰는 SupShim.dist · window.plan 을 허브에서 채워 줌
const distOther = {};
let distP = null, distWatch = null;
function loadScript(src) { return new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = src; sc.onload = res; sc.onerror = () => rej(new Error('화면 파일을 못 불러왔어요: ' + src.split('/').pop())); document.head.appendChild(sc); }); }
// 근태 줄 → { 이름: {in, out, task} } (정비 지원 server.js attReduce_ 와 같은 규칙: 아래 줄이 위 줄을 덮음)
function attOf(rows) {
  const out = {};
  rows.map(x => x.data || {}).filter(x => x.tab === '근태' && Array.isArray(x.row)).sort((a, b) => Number(a.at || 0) - Number(b.at || 0)).forEach(x => {
    const r = x.row, nm = String(r[2] || '').replace(/\s+/g, ' ').trim(), kind = String(r[3] || '').trim();
    if (!nm) return;
    const at = String(r[7] || '').replace(/^'/, '').trim() || hm(x.at);
    const a = out[nm] = out[nm] || { name: nm, in: '', out: '', task: '', memo: '' };
    if (kind === '출근') { a.in = at; if (r[4]) { a.task = String(r[4]); a.memo = String(r[5] || ''); } }
    else if (kind === '퇴근') a.out = at;
    else if (kind === '퇴근취소') a.out = '';
    else if (kind === '출근취소') { a.in = ''; a.out = ''; a.task = ''; a.memo = ''; }
    else if (kind === '업무' && r[4]) { a.task = String(r[4]); a.memo = String(r[5] || ''); }
  });
  return out;
}
async function openDist() {
  if (!admin) return;
  const btns = document.querySelectorAll('[data-hdist]'); btns.forEach(b => { b.disabled = true; b.textContent = '여는 중…'; });
  try {
    const d = ymd();
    const [names, roster, sup, rows] = await Promise.all([safe(S.get('sup_meta/names')), safe(S.get('sup_meta/roster')), safe(S.get('sup/' + d)),
      view.st && Array.isArray(view.st.rows) ? Promise.resolve(view.st.rows) : safe(S.getQuery('sup/' + d + '/rows', []))]);
    if (sup && !sup.__err) distOther[d] = sup;
    const known = () => {
      const r = roster && !roster.__err ? roster : {}, hide = {}, out = {};
      (Array.isArray(r.hide) ? r.hide : []).forEach(n => { hide[n] = 1; });
      ((names && !names.__err && names.names) || []).concat(Array.isArray(r.add) ? r.add : []).forEach(n => { n = String(n || '').trim(); if (n && !hide[n] && n !== '관리자') out[n] = 1; });
      return Object.keys(out).sort();
    };
    const pd = x => (x && Array.isArray(x.plan) && x.plan.length ? x : null);
    window.plan = { att: attOf(Array.isArray(rows) ? rows : []), workers: [], known: known(), noPlan: !pd(distOther[d]) };
    window.SupShim = window.SupShim || {};
    window.SupShim.ver = VER;
    window.SupShim.dist = {
      isAdmin: () => !!admin,
      today: () => ymd(),
      shift: (x, n) => addDays(x, n),
      planDoc: x => pd(distOther[x]),
      fetchPlan: x => S.get('sup/' + x).then(v => { distOther[x] = v; return v; }),
      fetchReport: x => S.get('uploads/rep_' + x),
      knownNames: known,
      getCfg: () => S.get('sup_meta/distcfg'),
      setCfg: c => S.set('sup_meta/distcfg', { rule: c.rule, at: S.SERVER_TIME, uid: user.uid }),
      savePlan: (x, plan, meta) => {
        if (!admin) return Promise.reject(new Error('관리자 로그인이 필요해요'));
        const sig = 'app:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        distOther[x] = { date: x, plan, sig, src: 'app', meta };
        return S.set('sup/' + x, { date: x, plan, sig, src: 'app', meta, by: admin.label, uid: user.uid, issued: S.SERVER_TIME, at: S.SERVER_TIME });
      }
    };
    if (typeof window.render !== 'function') window.render = function () {};
    if (!distP) distP = loadScript(new URL('../../dirty/distcalc.js?v=' + VER, import.meta.url).href).then(() => loadScript(new URL('../../dirty/dist.js?v=' + VER, import.meta.url).href));
    await distP;
    window.SupDist.open();
    clearInterval(distWatch);
    distWatch = setInterval(() => { if (!document.getElementById('dz')) { clearInterval(distWatch); load(true); } }, 700);   // 닫으면 오늘 한눈에 다시 읽기
  } catch (e) {
    distP = null;
    alert('더티 배분 화면을 못 열었어요: ' + (e && e.message || e) + '\n인터넷을 확인하고 다시 눌러 주세요.');
  }
  draw();
}
// ---------- 🗺 객실 활동판 (2단계 ④)
function openAct() {
  if (!admin || document.getElementById('actp')) return;
  const p = document.createElement('div'); p.className = 'vp'; p.id = 'actp'; p.style.overflow = 'hidden';
  p.innerHTML = '<div class="act-bar"><b>🗺 객실 활동판</b><span id="actmsg">여는 중…</span><button class="vp-x" data-actclose="1" aria-label="닫기">✕</button></div>' +
    '<iframe id="actf" title="객실 활동판" src="' + new URL('../../dirty/?hub=act', import.meta.url).href + '"></iframe>';
  document.body.appendChild(p); document.body.classList.add('sb-lock');
  const f = p.querySelector('iframe'); f.addEventListener('load', () => { const m = document.getElementById('actmsg'); if (m) m.textContent = ''; });
}
function closeAct() { const p = document.getElementById('actp'); if (!p) return; p.remove(); document.body.classList.remove('sb-lock'); load(true); }
window.addEventListener('message', e => {
  if (e.origin !== location.origin || !e.data || !e.data.hub) return;
  if (e.data.hub === 'close') closeAct();
  if (e.data.hub === 'noadmin') { const m = document.getElementById('actmsg'); if (m) m.textContent = '정비 지원 관리자 확인이 안 돼요 — 닫고 다시 열어 주세요'; }
});
// ---------- 📣 고객만족도 VOC (2단계 ③)
let VOC = null, vocOpen = false, vocToast = null;
function vocSay(msg) {
  let t = document.getElementById('vptoast');
  if (!t) { t = document.createElement('div'); t.id = 'vptoast'; t.className = 'vp-toast'; document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(vocToast); vocToast = setTimeout(() => { t.hidden = true; }, 3500);
}
function vocDraw() {
  const box = document.getElementById('vocin'); if (!box || !vocOpen || !VOC) return;
  const sc = document.getElementById('vp'), y = sc ? sc.scrollTop : 0;
  const ae = document.activeElement, keep = ae && ae.id === 'voctxt' ? { a: ae.selectionStart, b: ae.selectionEnd, st: ae.scrollTop } : null;   // 글 붙여넣는 중에 다시 그려져도 커서 유지
  box.innerHTML = VOC.html();
  if (sc) sc.scrollTop = y;
  if (keep) { const el = document.getElementById('voctxt'); if (el) { el.focus(); try { el.setSelectionRange(keep.a, keep.b); } catch (e) {} el.scrollTop = keep.st; } }
}
async function openVoc() {
  if (!admin) return;
  try {
    if (!VOC) {
      const m = await import(new URL('../app/voc.js?v=' + VER, import.meta.url).href);
      VOC = m.setupVoc({ S, esc, say: vocSay, today: () => ymd(), update: vocDraw, render: vocDraw, isAdm: () => !!admin && vocOpen, who: () => (admin ? admin.label : '') });
    }
  } catch (e) { alert('VOC 화면을 못 불러왔어요: ' + (e && e.message || e)); return; }
  vocOpen = true;
  const p = document.createElement('div'); p.className = 'vp'; p.id = 'vp';
  p.innerHTML = '<div class="vp-in"><div class="vp-head"><h2>📣 고객만족도 VOC</h2><button class="vp-x" data-vclose="1" aria-label="닫기">✕</button></div><div id="vocin"></div></div>';
  document.body.appendChild(p); document.body.classList.add('sb-lock');
  vocDraw();
}
function closeVoc() {
  vocOpen = false;
  try { VOC && VOC.stop(); } catch (e) {}   // 닫으면 voc 구독도 끊음 (읽기 아끼기)
  const p = document.getElementById('vp'); if (p) p.remove(); document.body.classList.remove('sb-lock');
}
async function openAssignUI() {
  try { const m = await import(new URL('./assignui.js?v=' + VER, import.meta.url).href); m.openAssign({ S, esc, ymd, addDays, md, admin: () => admin, user: () => user, upload: o => { up = { file: o.file, date: o.date, res: o.res, buf: null }; draw(); upSend(true); scrollUp(); } }); }
  catch (e) { alert('자동 배정 화면을 못 불러왔어요: ' + (e && e.message || e)); }
}
function assignCardHtml() {
  return '<div class="card"><h2>🧩 자동 배정 <small>시험 · 하우스키퍼와 대조</small></h2><p class="note" style="margin:0 0 12px">정비보고서 초안(또는 하우스키퍼 완성본)을 넣고 출근자·인계 유닛을 맞추면 엔진이 배정안을 만들어요. 완성본을 넣으면 하우스키퍼 배정과 바로 비교해요. 아직 메이드 휴대폰에는 안 올라가요.</p>' +
    '<button class="big-btn" data-asg="1">자동 배정 열기</button></div>';
}
function vocCardHtml() {
  return '<div class="card"><h2>📣 고객만족도 VOC</h2><p class="note" style="margin:0 0 12px">카톡으로 받은 고객만족도 공유 글을 붙여넣으면 건별로 나누고 마지막 정비자를 찾아 메이드별 칭찬·불만 누계를 내요. 정비 레포트 VOC 메뉴와 같은 자료예요.</p>' +
    '<button class="big-btn" data-voc="1">VOC 열기</button></div>';
}
function todayHtml() {
  const v = view.st;
  let h = '<div class="card"><h2>오늘 한눈에 <button class="ref" data-ref="1">' + (view.busy ? '읽는 중…' : '↻ 새로 고침') + '</button></h2>';
  if (!v) return h + '<p class="note" style="margin:0">읽는 중…</p></div>';
  const L = statusItems(v), nb = L.filter(x => x.lv === 'bad').length, nw = L.filter(x => x.lv === 'wait').length;
  h += '<div class="sum">' + (nb ? '<span class="pill bad">확인 필요 ' + nb + '</span>' : '') + (nw ? '<span class="pill wait">주의 ' + nw + '</span>' : '') +
    (!nb && !nw ? '<span class="pill ok">모두 정상</span>' : '') + '<span class="pill" style="background:var(--tile);color:var(--muted)">' + hm(view.at) + ' 기준</span></div>';
  h += '<ul class="st">' + L.sort((a, b) => ({ bad: 0, wait: 1, ok: 2 }[a.lv] - { bad: 0, wait: 1, ok: 2 }[b.lv])).map(x =>
    '<li class="' + x.lv + '"><span style="font-size:17px;color:inherit">' + (x.lv === 'bad' ? '❗' : x.lv === 'wait' ? '⏳' : '✅') + '</span><div><b>' + esc(x.title) + '</b>' + (x.sub ? '<span>' + esc(x.sub) + '</span>' : '') + '</div></li>').join('') + '</ul></div>';
  h += upHtml();
  const p = progress(v);
  h += '<div class="card"><h2>오늘 정비 진행 <small>' + (p.last ? '마지막 완료 ' + hm(p.last) : '') + '</small></h2>';
  if (p.err) h += '<p class="err">완료 기록을 못 읽었어요: ' + esc(p.err) + '</p>';
  if (!p.total) h += '<p class="note" style="margin:0">오늘 정비보고서가 올라오면 진행률이 나와요. 지금까지 완료 ' + p.doneU + '실.</p></div>';
  else h += '<div class="prog"><div class="big">' + p.pct + '%<small>' + p.doneU + ' / ' + p.total + '실</small></div><div class="bar"><i style="width:' + p.pct + '%"></i></div></div>' +
    '<div class="kv"><div><b>' + (p.total - p.doneU > 0 ? p.total - p.doneU : 0) + '</b><span>남은 실</span></div><div><b>' + (p.maids || '-') + '</b><span>근무 메이드</span></div><div><b>' + p.issue + '</b><span>이상 보고</span></div></div>' +
    '<p class="note">정비보고서 올린 배정 기준이에요 (근무 중 추가·제외는 빠짐). 메이드별로는 정비 레포트 → 오늘 현황에서 봐요.</p></div>';
  return h + dirtyHtml(v) + actsHtml(v);
}
function linksHtml() {
  return '<div class="card"><h2>바로가기 <small>같은 로그인으로 열려요</small></h2><div class="go-grid">' +
    LINKS.map(l => '<a class="go" href="' + l.href + '"><span class="ic">' + l.ic + '</span><b>' + esc(l.t) + '</b><span>' + esc(l.s) + '</span></a>').join('') + '</div></div>';
}
function staffHtml() {
  return '<div class="card"><h2>👥 전 파트 직원 명단</h2><p class="note" style="margin:0 0 12px">룸메이드 · 정비보조 · 미화 · 사우나 · 하우스맨 · 오더테이커를 한곳에서 봐요. 입사일 · 근속 · 재직/퇴사.<br>파트별 관리는 각 앱에서 해도 되고, 여기서 고쳐도 같은 명단이에요.</p>' +
    '<button class="big-btn" data-staff="1">명단 열기</button></div>';
}
function draw() {
  head();
  if (user === null) { $('#main').innerHTML = '<div class="card"><p class="note" style="margin:0">여는 중…</p></div>'; return; }
  if (!admin) { $('#main').innerHTML = loginHtml(); return; }
  $('#main').innerHTML = todayHtml() + assignCardHtml() + vocCardHtml() + linksHtml() + staffHtml() +
    '<div class="foot">객실 통합 관리 시스템 ' + VER + ' · <button data-logout="1">로그아웃</button></div>';
}

// ---------- 직원 명단 (정비 레포트 · 정비 지원과 같은 화면 파일 — 여기선 전 파트)
function openStaff() {
  const go = () => window.StaffBook.open({ jobs: JOBS, title: '👥 전 파트 직원 명단',
    api: { list: () => S.getQuery('staff', []).then(xs => xs.map(x => Object.assign({}, x.data, { id: x.id }))),
      save: (id, d) => { const o = {}; Object.keys(d).forEach(k => { if (k !== 'id' && d[k] !== undefined) o[k] = d[k]; }); o.at = S.SERVER_TIME; o.uid = user.uid; return S.set('staff/' + id, o); },
      del: id => S.del('staff/' + id),
      newId: () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) } });
  if (window.StaffBook) { go(); return; }
  const sc = document.createElement('script');
  sc.src = new URL('../app/staff.js?v=' + VER, import.meta.url).href;
  sc.onload = go; sc.onerror = () => alert('명단 화면을 못 불러왔어요. 인터넷을 확인하고 다시 눌러 주세요.');
  document.head.appendChild(sc);
}

// ---------- 누르기
document.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('[data-who],[data-login],[data-ref],[data-staff],[data-logout],[data-up],[data-upd],[data-hdist],[data-voc],[data-vclose],[data-act],[data-actclose],[data-asg]');
  if (!t || (t.closest && t.closest('#dz'))) return;
  if (t.hasAttribute('data-voc')) { openVoc(); return; }
  if (t.hasAttribute('data-act')) { openAct(); return; }
  if (t.hasAttribute('data-asg')) { openAssignUI(); return; }
  if (t.hasAttribute('data-actclose')) { closeAct(); return; }
  if (t.hasAttribute('data-vclose')) { closeVoc(); load(false); return; }
  if (t.hasAttribute('data-hdist')) { openDist(); return; }
  if (t.hasAttribute('data-up')) {
    const a = t.getAttribute('data-up');
    if (a === 'pick') pickXlsx();
    else if (a === 'send') upSend(false);
    else if (a === 'reset') { clearTimeout(upPoll); up = null; draw(); }
    return;
  }
  if (t.hasAttribute('data-upd')) { if (up && !up.sent && !up.sending) { up.date = t.getAttribute('data-upd'); if (up.buf) upBuild(); else draw(); } return; }
  if (t.hasAttribute('data-who')) { const pw = ($('#pw') || {}).value || ''; login.who = Number(t.getAttribute('data-who')); draw(); const el = $('#pw'); if (el) { el.value = pw; el.focus(); } return; }
  if (t.hasAttribute('data-login')) { doLogin(); return; }
  if (t.hasAttribute('data-ref')) { load(true); return; }
  if (t.hasAttribute('data-staff')) { openStaff(); return; }
  if (t.hasAttribute('data-logout')) {
    if (!confirm('로그아웃할까요?\n이 기기의 정비 레포트 · 정비 지원 관리자도 같이 로그아웃돼요.')) return;
    S.signOut(); return;
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target && e.target.id === 'pw') doLogin(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(false); });

S.onUser(u => {
  if (vocOpen && !(u && !u.anon)) closeVoc();
  user = u || false;
  admin = u && !u.anon ? ADMINS.filter(a => a.uid === u.uid)[0] || null : null;
  view = { st: null, busy: false, err: '', at: 0 };
  draw();
  if (admin) load(true);
});
setInterval(() => { if (admin && document.visibilityState === 'visible') { head(); } }, 60000);
draw();

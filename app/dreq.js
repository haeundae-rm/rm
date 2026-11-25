// 🔔 더티 요청 (2026-11-21) — 메이드가 정비보조에게 바로 "더티 빨리 와 주세요"를 보냄 (오더테이커·관리자 전화 대신)
// 남발 막기 (사용자 결정 11/21):
//   ① 더티 대상이고 받을 더티(지원 수량 − 정비보조가 한 방)가 남아 있어야 함
//   ② 10시 30분부터만 (11/25 소장님: 예전 '12시 지났는데 정비보조가 한 번도 안 옴 / 남은 방 ≤ 남은 더티'를 없애고 시간으로만)
//   ※ 저장하는 why 는 규칙(v24)에 맞춰 그대로: 'noon' = 시간 기준(10:30 이후), 'left' = 남은 방 기준
//   11/25: 누를 수 있으면 버튼이 켜지고(점등), 못 누르면 꺼진 버튼 + 언제부터인지 안내 — 휴대폰에 이미 있는 자료로 미리 셈(읽기 안 늘림), 누를 때 다시 확인
//   ③ 한 번 누르면 20분 뒤에야 다시 (규칙에서도 막음 · 11/21 사용자: 1시간 → 20분)
//   먼저 할 방은 메이드가 최대 2실 고름 (선택). 시간 정해진 방은 미리 골라 둠
// 저장: sup/{날짜}/req/{메이드 이름} 하나를 덮어씀 (n = 오늘 몇 번째, hist = 지난 요청 시각). 정비보조가 그 메이드 방을 체크하면 정비보조 앱에서 저절로 꺼짐
// 판단은 누를 때 한 번만 정비 지원 기록(sup/{날짜}, rows, rm)을 읽어서 함 — 메이드 휴대폰이 늘 구독하지 않게 (읽기 비용)
export const COOL = 20 * 60e3, OPEN = '10:30', MAXR = 2;

const num = v => { const n = typeof v === 'number' ? v : v instanceof Date ? v.getTime() : Date.parse(v); return isNaN(n) ? 0 : n; };
const clean = v => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 20);
const roomsOf = v => String(v || '').split(/[,\s/]+/).map(s => s.replace(/^'/, '').replace(/\.0$/, '').replace(/호$/, '')).filter(s => /^\d{3,4}$/.test(s));
const unq = v => (typeof v === 'string' && v.charAt(0) === "'" ? v.slice(1) : v === null || v === undefined ? '' : v);

/** 정비 지원 앱과 같은 셈 (hub/supcalc.js 와 같은 순서) → 메이드마다 {dirty, rooms, worker} + 체크한 객실 {객실: 시각} */
export function supMaids(sp, rows, rmDocs, SA, day) {
  const plan = sp && Array.isArray(sp.plan) ? sp.plan : [];
  const maids = {};
  plan.forEach(x => {
    if (!x || (x.d && day && String(x.d) !== day)) return;
    const name = String(x.m || '').trim(); if (!name || maids[name]) return;
    maids[name] = { name, dirty: Number(x.n) || 0, rooms: roomsOf(x.r), worker: clean(x.w), taken: false };
  });
  let all = (Array.isArray(rows) ? rows : []).map(d => {
    const x = d && d.data; if (!x || ['체크', '변경'].indexOf(x.tab) < 0 || !Array.isArray(x.row)) return null;
    return { id: d.id, tab: x.tab, row: x.row.map(unq), at: num(x.at) || num(x.clientAt), c: num(x.clientAt) };
  }).filter(Boolean);
  const issued = sp && sp.src === 'app' ? num(sp.issued) : 0;
  if (issued) all = all.filter(x => x.tab !== '변경' || x.at >= issued);
  const sort = () => all.sort((a, b) => (a.at - b.at) || (a.c - b.c) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  sort();
  if (SA && Array.isArray(rmDocs) && rmDocs.length) {
    const ck = {};
    all.forEach(x => { if (x.tab === '체크') { const r0 = String(x.row[2] || ''); if (x.row[5] === '완료') ck[r0] = 1; else if (x.row[5] === '취소') delete ck[r0]; } });
    SA.rmRows(rmDocs, day, ck).rows.forEach(x => all.push({ id: 'rm:' + x.id, tab: '변경', row: x.row.map(unq), at: x.at, c: x.at }));
    sort();
  }
  const checks = {};
  all.forEach(x => {
    const r = x.row;
    if (day && String(r[1]).trim() !== day) return;
    if (x.tab === '체크') { const room = String(r[2]).replace(/\.0$/, ''); if (r[5] === '완료') checks[room] = x.at || 1; else delete checks[room]; return; }
    const kind = String(r[2]).trim(), wn = clean(r[4]), m = maids[String(r[3]).trim()];
    if (!m) return;
    const add = roomsOf(r[5]), dirty = r[6] === '' ? null : (Number(r[6]) || 0);
    roomsOf(r[7]).filter(q => m.rooms.indexOf(q) >= 0).forEach(q => m.rooms.splice(m.rooms.indexOf(q), 1));
    add.forEach(q => { if (m.rooms.indexOf(q) < 0) m.rooms.push(q); });
    if (kind === '가져옴' && !m.worker) { m.worker = wn; m.taken = true; m.dirty = dirty || 0; }
    else if (kind === '수정') { if (m.worker && dirty !== null) m.dirty = dirty; }
    else if (kind === '되돌림' && m.taken && m.worker) { m.worker = ''; m.taken = false; m.dirty = 0; }
    else if (kind === '넘겨받음' && m.worker && wn && m.worker !== wn) m.worker = wn;
  });
  return { maids, checks };
}

/** 누를 수 있는지. names = 이 화면 메이드(2인 1조면 둘), left = 완료 안 한 남은 방 수, hm = 지금 'HH:MM' */
export function judge(info, names, left, hm) {
  const ms = names.map(n => info.maids[n]).filter(m => m && m.worker && m.dirty > 0);
  if (!ms.length) return { ok: false, why: 'none', msg: '오늘은 더티 지원 대상이 아니에요. 더티가 필요하면 관리자에게 말씀해 주세요.' };
  const n = ms.reduce((s, m) => s + m.dirty, 0);
  const dc = ms.reduce((s, m) => s + m.rooms.filter(r => info.checks[r]).length, 0);
  const d = ms.reduce((s, m) => s + Math.min(m.dirty, m.rooms.filter(r => info.checks[r]).length), 0);
  const R = Math.max(0, n - d), ws = ms.map(m => m.worker).filter((w, i, a) => a.indexOf(w) === i).slice(0, 2);
  const base = { n, d, dc, R, left, ws };
  if (R <= 0) return Object.assign(base, { ok: false, why: 'full', msg: '오늘 받을 더티 ' + n + '실을 다 받았어요.' });
  if (hm < OPEN) return Object.assign(base, { ok: false, why: 'wait', msg: '더티 요청은 10시 30분부터 할 수 있어요.' });
  return Object.assign(base, { ok: true, why: left <= R ? 'left' : 'noon' });   // 기록용 이름만 (규칙 값 그대로): left = 남은 방이 모두 더티 필요, noon = 그 밖
}

/** app.js 에 붙이기. g = 앱 상태 꺼내는 함수들 */
export function setupDreq(g) {
  const { S, esc, toast } = g;
  let reqDoc = null, supPlan = null, subs = [], busy = false, dlg = null, tick = 0;
  const box = document.createElement('div'); box.id = 'dreqsheet'; document.body.appendChild(box);
  const hm = ms => { const d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };
  const nowHM = () => hm(Date.now());
  const mins = ms => Math.max(0, Math.floor((Date.now() - ms) / 60000));

  function listen(day, me, mate) {
    stop(); reqDoc = null; supPlan = null;
    if (!me) return;
    subs.push(S.listenDoc('sup/' + day + '/req/' + me, d => { reqDoc = d; g.update(); }, () => {}));
    subs.push(S.listenDoc('sup/' + day, d => { supPlan = d; g.update(); }, () => {}));   // 더티 대상인지만 봄 (문서 1개)
    if (!tick) tick = setInterval(() => { if ((reqDoc || supPlan) && document.visibilityState === 'visible' && lightKey() !== lastKey) g.update(); }, 30000);   // 'N분째' 글자 · 버튼 켜짐/꺼짐 (바뀔 때만 다시 그림)
  }
  function stop() { subs.forEach(f => { try { f(); } catch (e) {} }); subs = []; }

  // 이 화면 메이드가 더티 지원을 받는지 (아침 배분에 담당 정비보조가 있거나, 이미 더티 끝난 방이 있음)
  function isTarget(m) {
    const names = m.team && m.team.length ? m.team : [m.name];
    const plan = supPlan && Array.isArray(supPlan.plan) ? supPlan.plan : [];
    if (plan.some(x => x && names.indexOf(String(x.m || '').trim()) >= 0 && clean(x.w) && Number(x.n) > 0)) return true;
    return m.rooms.some(x => g.isDirty(x.room));
  }
  const leftRooms = m => m.rooms.filter(x => !g.done(m, x));
  const dirtyNow = m => m.rooms.filter(x => g.isDirty(x.room)).length;   // 정비보조가 한 방 (중계, 완료한 방 포함)
  function state(m) {
    const r = reqDoc && reqDoc.at ? reqDoc : null, at = r ? num(r.at) : 0;
    if (!r || at < Date.parse(g.today() + 'T00:00:00+09:00')) return { st: 'none' };
    // 11/25: 먼저 할 방(긴급 요청한 방)을 골랐으면 그 방이 모두 더티 끝나야 '왔어요' · 못 골랐으면 예전처럼 더티 방이 하나 늘면
    const pick = (r.rooms || []).filter(q => m.rooms.some(x => x.room === q)), left = pick.filter(q => !g.isDirty(q)).length;
    const came = pick.length ? left === 0 : dirtyNow(m) > (Number(r.dc) || 0), next = at + COOL;
    return { st: came ? 'came' : 'wait', at, next, canAgain: Date.now() >= next, r, pick: pick.length, left };
  }

  // 11/25 버튼 켜짐/꺼짐 미리 셈 — 아침 배분(sup/{날}, 이미 구독) + 내 방 더티 완료 표시로. 정확한 판단은 누를 때 check() 가 다시 함
  let lastM = null, lastKey = '';
  function live(m, s) {
    if (s.st !== 'none' && !s.canAgain) return { on: false, msg: '다음 요청은 <b>' + hm(s.next) + '</b>부터 할 수 있어요.' };
    const names = m.team && m.team.length ? m.team : [m.name];
    const plan = supPlan && Array.isArray(supPlan.plan) ? supPlan.plan : [];
    const mine = plan.filter(x => x && names.indexOf(String(x.m || '').trim()) >= 0 && clean(x.w) && Number(x.n) > 0);
    const left = leftRooms(m).length;
    if (mine.length) {
      const n = mine.reduce((a, x) => a + Number(x.n), 0), R = Math.max(0, n - Math.min(n, dirtyNow(m)));
      if (R <= 0) return { on: false, msg: '오늘 받을 더티 ' + n + '실을 다 받았어요.' };
    }
    if (nowHM() < OPEN) return { on: false, msg: '더티 요청은 <b>10시 30분</b>부터 할 수 있어요.' };
    return { on: true, msg: '지금 요청할 수 있어요. 정비보조 휴대폰에 바로 떠요.' };
  }
  function lightKey() { if (!lastM) return ''; const s = state(lastM); return s.st + '|' + live(lastM, s).on + '|' + (s.at ? mins(s.at) : '') + '|' + (s.left || 0); }
  function band(m) {
    if (!m || !isTarget(m)) return '';
    const left = leftRooms(m).length;
    if (!left) return '';
    const s = state(m), lv = live(m, s);
    lastM = m; lastKey = s.st + '|' + lv.on + '|' + (s.at ? mins(s.at) : '') + '|' + (s.left || 0);
    if (s.st === 'wait') {
      const part = s.pick && s.left < s.pick;   // 긴급 요청한 방 중 일부만 끝남 (정비 지원 화면과 같은 말)
      return '<div class="dreq on"><div class="dq-t">' + (part ? '🔔 긴급 요청한 방이 <b>' + s.left + '개</b> 남았어요' : '🔔 더티 요청함 · <b>' + (mins(s.at) ? mins(s.at) + '분째' : '방금') + '</b> 기다리는 중') + '</div>' +
        '<p>' + hm(s.at) + '에 보냈어요' + (s.r.rooms && s.r.rooms.length ? ' · 먼저 할 방 <b>' + esc(s.r.rooms.join(', ')) + '</b>' : '') + '. 정비보조 휴대폰에 떠 있어요.</p>' +
        (s.canAgain && lv.on ? '<button class="dq-btn lit" data-dreq="1"' + (busy ? ' disabled' : '') + '>' + (busy ? '확인하는 중…' : '🔔 다시 알리기') + '</button>'
          : '<button class="dq-btn" disabled>🔔 다시 알리기</button><p class="dq-n">' + (s.canAgain ? lv.msg : '다시 알리기는 <b>' + hm(s.next) + '</b>부터 할 수 있어요.') + '</p>') + '</div>';
    }
    if (s.st === 'came' && !s.canAgain) return '<div class="dreq ok"><div class="dq-t">✓ 정비보조가 더티를 시작했어요</div><p class="dq-n">다음 요청은 <b>' + hm(s.next) + '</b>부터 할 수 있어요.</p></div>';
    if (!lv.on) return '<div class="dreq off"><button class="dq-btn" disabled>🛏 더티 요청하기</button><p class="dq-n">' + lv.msg + '</p></div>';
    return '<div class="dreq"><button class="dq-btn lit" data-dreq="1"' + (busy ? ' disabled' : '') + '>' + (busy ? '확인하는 중…' : '🛏 더티 요청하기') + '</button>' +
      '<p class="dq-n">' + lv.msg + '</p></div>';
  }

  async function check(m) {
    if (busy) return; busy = true; g.update();
    try {
      const day = g.today();
      const [sp, rows, rm, SA] = await Promise.all([S.get('sup/' + day), S.getQuery('sup/' + day + '/rows', []), S.getQuery('sup/' + day + '/rm', []).catch(() => []), loadSA()]);
      const names = m.team && m.team.length ? m.team : [m.name];
      const lr = leftRooms(m), info = supMaids(sp, rows, rm, SA, day), j = judge(info, names, lr.length, nowHM());
      const s = state(m);
      if (s.st !== 'none' && !s.canAgain) j.ok = false, j.why = 'cool', j.msg = '한 번 요청하면 20분 뒤에 다시 할 수 있어요. 다음은 ' + hm(s.next) + '부터예요.';
      const cand = lr.filter(x => !info.checks[x.room]).map(x => ({ room: x.room, due: x.due || '' }));
      const pre = cand.filter(x => x.due).sort((a, b) => (a.due < b.due ? -1 : 1)).slice(0, MAXR).map(x => x.room);
      dlg = { m, names, j, cand, pick: pre, err: '' };
    } catch (e) { dlg = { m, err: '정비 지원 기록을 읽지 못했어요. 인터넷을 확인하고 다시 눌러 주세요.', j: { ok: false } }; }
    busy = false; g.update(); draw();
  }
  let saP = null;
  function loadSA() {
    if (window.SupAuto) return Promise.resolve(window.SupAuto);
    if (!saP) saP = new Promise(res => { const sc = document.createElement('script'); sc.src = new URL('../../dirty/autosup.js?v=' + g.ver, import.meta.url).href; sc.onload = () => res(window.SupAuto || null); sc.onerror = () => { saP = null; res(null); }; document.head.appendChild(sc); });
    return saP;
  }

  function draw() {
    if (!dlg) { box.innerHTML = ''; return; }
    const j = dlg.j || {};
    let b;
    if (!j.ok) {
      b = '<h3>' + (j.why === 'cool' ? '조금만 기다려 주세요' : '지금은 더티 요청을 할 수 없어요') + '</h3>' +
        '<p>' + esc(dlg.err || j.msg || '') + '</p>' +
        (j.n ? '<div class="dq-nums"><span>받을 더티 <b>' + j.n + '</b>실</span><span>정비보조가 한 방 <b>' + j.d + '</b>실</span><span>남은 더티 <b>' + j.R + '</b>실</span><span>내 남은 방 <b>' + j.left + '</b>실</span></div>' : '') +

        '<div class="acts"><button class="go" data-dqx="1">확인</button></div>';
    } else {
      b = '<h3>정비보조에게 더티를 요청할까요?</h3>' +
        '<p>' + (j.why === 'noon' ? '남은 더티 ' + j.R + '실을 빨리 받고 싶을 때 보내요.' : '남은 방 ' + j.left + '실이 모두 더티가 필요해요.') + ' <b>' + esc(j.ws.join(', ')) + '</b> 님 휴대폰에 바로 떠요.</p>' +
        '<h4 class="ih">먼저 해 줬으면 하는 방 (최대 ' + MAXR + '실, 안 골라도 돼요)</h4>' +
        '<div class="dq-rooms">' + dlg.cand.map(x => '<button data-dqr="' + esc(x.room) + '" aria-pressed="' + (dlg.pick.indexOf(x.room) >= 0) + '">' + esc(x.room) + (x.due ? '<small>' + esc(x.due) + '까지</small>' : '') + '</button>').join('') + '</div>' +
        (dlg.err ? '<p class="err">' + esc(dlg.err) + '</p>' : '') +
        '<p class="hint">보내면 20분 뒤에 다시 보낼 수 있어요.</p>' +
        '<div class="acts"><button data-dqx="1">취소</button><button class="go" data-dqsend="1"' + (dlg.sending ? ' disabled' : '') + '>' + (dlg.sending ? '보내는 중…' : '🔔 요청 보내기') + '</button></div>';
    }
    box.innerHTML = '<div class="scrim" data-dqx="1"><div class="panel">' + b + '</div></div>';
  }

  async function send() {
    const d = dlg; if (!d || d.sending) return;
    d.sending = true; d.err = ''; draw();
    const me = g.me(), old = reqDoc && num(reqDoc.at) >= Date.parse(g.today() + 'T00:00:00+09:00') ? reqDoc : null;
    const hist = old ? (old.hist || []).concat([num(old.at)]).slice(-19) : [];
    const doc = { maid: me, names: d.names.slice(0, 2), ws: d.j.ws, rooms: d.pick.slice(0, MAXR), at: S.SERVER_TIME, n: old ? (Number(old.n) || 0) + 1 : 1, hist,
      why: d.j.why, left: d.j.left, R: d.j.R, dc: d.j.dc, uid: g.uid(), ver: g.ver };
    try {
      await g.withTimeout(S.set('sup/' + g.today() + '/req/' + me, doc), 10000, '저장이 늦어요');
      dlg = null; draw(); g.vibe(60); toast('🔔 ' + d.j.ws.join(', ') + ' 님에게 더티 요청을 보냈어요');
    } catch (e) { d.sending = false; d.err = '보내지 못했어요. 인터넷을 확인하고 다시 눌러 주세요.'; draw(); }
    g.update();
  }

  box.addEventListener('click', e => {
    const t = e.target, at = s => t.closest(s);
    if (!dlg) return;
    if (t.classList.contains('scrim') || at('button[data-dqx]')) { if (!dlg.sending) { dlg = null; draw(); } return; }   // 바깥 · 취소/확인
    const r = at('[data-dqr]');
    if (r) { const v = r.getAttribute('data-dqr'), l = dlg.pick, i = l.indexOf(v); if (i >= 0) l.splice(i, 1); else if (l.length < MAXR) l.push(v); else { dlg.err = '먼저 할 방은 ' + MAXR + '실까지 고를 수 있어요.'; draw(); setTimeout(() => { if (dlg) { dlg.err = ''; draw(); } }, 2000); return; } dlg.err = ''; draw(); return; }
    if (at('[data-dqsend]')) send();
  });

  return { listen, stop, band, check, open: () => !!dlg };
}

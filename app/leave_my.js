// leave_my.js — 메이드 '📅 내 근무 · 연차 신청'의 서버 역할을 Firestore 로 (2026-11-18, 옛 Apps Script MyWorkApi.gs → Leave.gs 대신)
// mywork.js 는 그대로 ctx.call(fn, args, as) 를 부름 → 여기서 옛 함수와 같은 모양으로 돌려줌
// 본인 확인: 비밀번호 대신 관리자가 승인한 휴대폰 (leave_dev/{uid}.pids = 볼 수 있는 사람: 본인 + 2인 1조 짝). 규칙이 막아 줌
// 근무 달력: 옛 '배정기록' 탭에서 옮긴 달(leave_work) + 그 뒤 날짜는 정비 기록(days/{날짜}/plans · recs)에서 셈. 지난 날짜는 휴대폰에 기억
import * as L from './leave.js';

export function makeLeaveApi(S, uidOf) {
  const R2 = n => L.r1(n);
  const lsG = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const lsS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let devDoc = null, devAt = 0, metaDoc = null, metaAt = 0;
  const cleanName = s => String(s == null ? '' : s).replace(/\s+/g, '').trim();

  async function dev(force) {
    if (!force && devDoc && Date.now() - devAt < 60e3) return devDoc;
    const d = await S.get('leave_dev/' + uidOf(), true).catch(() => null);
    devDoc = d; devAt = Date.now();
    if (!d || !(d.pids || []).length) throw new Error('이 휴대폰은 아직 소장님 승인 전이에요. 소장님께 "내 근무 휴대폰 승인해 주세요"라고 말씀해 주세요.');
    return d;
  }
  async function meta() {
    if (metaDoc && Date.now() - metaAt < 10 * 60e3) return metaDoc;
    metaDoc = (await S.get('meta/leave').catch(() => null)) || {}; metaAt = Date.now();
    return metaDoc;
  }
  // 이 이름(본인 또는 짝)의 연차 명단 사람
  let pc = { at: 0, list: [] };
  async function personFor(name) {
    const d = await dev();
    if (Date.now() - pc.at > 60e3 || pc.key !== d.pids.join(',')) {
      const got = await Promise.all(d.pids.map(pid => S.get('leave_people/' + pid).catch(() => null)));
      pc = { at: Date.now(), key: d.pids.join(','), list: got.map((p, i) => (p ? Object.assign({ pid: d.pids[i] }, p) : null)).filter(Boolean) };
    }
    const out = pc.list;
    const n = cleanName(name);
    return out.filter(p => p.name === n || (p.alias || []).indexOf(n) >= 0)[0] || (n === cleanName(d.name) ? out.filter(p => p.pid === d.pids[0])[0] : null) || null;
  }
  // 본인 것 받기 (key 마다). 2026-11-19: 'pid + 바뀐 시각' 두 조건 검색은 Firestore 색인이 있어야 해서
  // 두 번째 열 때부터 "The query requires an index" 오류가 났음 → pid 한 조건으로만 받음 (색인 필요 없음, 한 사람 문서 수가 적어 읽기 부담 작음).
  // 서버에 못 닿으면 보관해 둔 것을 보여줌.
  async function synced(col, pid) {
    const m = await meta(), key = 'rm_lv_' + col + '_' + pid, c = lsG(key);
    const old = c && c.imp === String(m.importedAt || '') ? c.docs : null;
    let got;
    try { got = await S.getQuery(col, [['pid', '==', pid]]); }
    catch (e) { if (old) return old; throw e; }
    const docs = {};
    got.forEach(x => { docs[x.id] = x.data; });
    lsS(key, { imp: String(m.importedAt || ''), docs });
    return docs;
  }
  async function myApps(pid) { const d = await synced('leave_apps', pid); return Object.keys(d).map(id => d[id]).filter(a => !a.deleted && a.start); }
  async function myRecs(pid) { const d = await synced('leave_recs', pid); return Object.keys(d).map(id => d[id]); }
  async function busy(pid, mine) {
    const b = await S.get('meta/leave_busy').catch(() => null), d = Object.assign({}, (b && b.d) || {});
    // 이 지도에는 내 신청도 들어 있음 → 내 날짜는 1명씩 뺌 (관리자가 마지막으로 열었을 때 기준)
    const bt = (b && b.at) || 0;
    mine.filter(a => (a.status === '대기' || a.status === '승인') && (a.at || 0) <= bt).forEach(a => { for (let x = a.start; x <= a.end; x = L.addDays(x, 1)) if (d[x]) d[x] = Math.max(0, d[x] - 1); });
    return d;
  }
  function pub(a) {
    return { id: a.id, at: a.at, name: a.name, status: a.status, kind: a.kind, reason: a.reason, start: a.start, end: a.end,
      days: a.days, asked: a.asked, phone: a.phone, signed: !!a.sign, memo: a.memo || '', decided: a.decided ? new Date(a.decided).toISOString() : '' };
  }
  async function me(name) {
    const p = await personFor(name);
    if (!p || !p.target) throw new Error('연차 정보가 아직 연결되지 않았어요. 소장님께 문의해 주세요.');
    if (p.quit && p.quit < L.today()) throw new Error('퇴사 처리되어 신청할 수 없어요.');
    return p;
  }

  // ---------- 근무 달력
  // 11/25: 배정 = 아침 정비보고서 배정 + 근무 중 변경(추가 · 제외 · 교환/넘김)을 반영한 최종 배정 (관리자 화면 '메이드별 현황'과 같은 기준)
  //   예전엔 근무 중 빠진 방(제외 · 넘김)을 안 빼서 배정이 더 많게 보였음 (노애영 님 11/25: 최종 10실인데 11) → 지난 날짜 기억도 새로(rm_mw_day2_)
  function applyChanges(name, rooms, docs) {
    const L0 = docs.map(x => x.data || {}).sort((a, b) => (Number(a.clientAt || a.at) || 0) - (Number(b.clientAt || b.at) || 0) || (Number(a.at) || 0) - (Number(b.at) || 0));
    const has = r => rooms.indexOf(r) >= 0, add = r => { if (r && !has(r)) rooms.push(r); }, del = r => { const i = rooms.indexOf(r); if (i >= 0) rooms.splice(i, 1); };
    L0.forEach(c => {
      const room = String(c.room || ''), maid = cleanName(c.maid);
      if (c.kind === '교환') {   // 교환 한 건 = 서로 넘김 두 번 (maid 의 room ↔ to 의 toRoom)
        const to = cleanName(c.to), toRoom = String(c.toRoom || '');
        if (maid === name && has(room)) { del(room); add(toRoom); }
        else if (to === name && has(toRoom)) { del(toRoom); add(room); }
        return;
      }
      if (maid !== name) return;
      if (c.kind === '추가') add(room); else if (c.kind === '제외') del(room);
    });
    return rooms;
  }
  async function dayWork(name, d, today) {
    const key = 'rm_mw_day2_' + name + '_' + d;
    if (d < today) { const c = lsG(key); if (c) return c.v; }
    const [plan, recs, chg] = await Promise.all([
      S.get('days/' + d + '/plans/' + name).catch(() => null),
      S.getQuery('days/' + d + '/recs', [['maid', '==', name]]).catch(() => []),
      S.getQuery('days/' + d + '/changes', [['parties', 'array-contains', name]]).catch(() => [])
    ]);
    let v = null;
    const rooms = applyChanges(name, ((plan && plan.rooms) || []).map(x => String(x.room || x)), chg || []);
    const done = {}; recs.forEach(x => { if (x.data.status === '완료' || x.data.status === '이상') done[x.data.room] = 1; });
    Object.keys(done).forEach(r => { if (rooms.indexOf(r) < 0) rooms.push(r); });   // 근무 중 받은 객실
    if (rooms.length) {
      v = { a: 0, d: 0 };
      rooms.forEach(r => { const u = { '3001': 1, '3002': 1, '3101': 1, '3102': 1 }[r] ? 2 : 1; v.a += u; if (done[r]) v.d += u; });
    }
    if (d < today) lsS(key, { v });
    return v;
  }
  async function calendar(name, pid, m, today) {
    const mt = await meta(), upto = mt.workUpto || '', days = {};
    const last = L.addDays(L.addMonths(m + '-01', 1).slice(0, 7) + '-01', -1);
    if (pid && upto && m <= upto.slice(0, 7)) {
      const k = 'rm_mw_work_' + pid + '_' + m; let w = lsG(k);
      if (!w || w.imp !== String(mt.importedAt || '')) { const x = await S.get('leave_work/' + pid + '_' + m).catch(() => null); w = { imp: String(mt.importedAt || ''), days: (x && x.days) || {} }; lsS(k, w); }
      Object.assign(days, w.days);
    }
    let from = m + '-01'; if (upto && upto >= from) from = L.addDays(upto, 1);
    const list = []; for (let d = from; d <= last && d <= today; d = L.addDays(d, 1)) list.push(d);
    const vals = await Promise.all(list.map(d => dayWork(name, d, today)));
    list.forEach((d, i) => { if (vals[i]) days[d] = vals[i]; });
    const sum = { days: 0, a: 0, d: 0 };
    Object.keys(days).forEach(k => { sum.days++; sum.a += days[k].a; sum.d += days[k].d; });
    return { days, sum };
  }

  async function myWork(name, ym) {
    const today = L.today(), thisYm = today.slice(0, 7);
    let m = L.ym(ym) || thisYm;
    const back = (Number(thisYm.slice(0, 4)) - Number(m.slice(0, 4))) * 12 + Number(thisYm.slice(5)) - Number(m.slice(5));
    if (back < 0 || back > 6) m = thisYm;
    await dev();
    const p = await personFor(name);
    const cal = await calendar(name, p ? p.pid : '', m, today);
    let leave = null;
    if (p && p.target) {
      const [rs, apps] = await Promise.all([myRecs(p.pid), myApps(p.pid)]);
      const b = L.balance(p, rs, today);
      leave = { gen: b.gen, used: b.used, paid: b.paid, remain: b.remain, next: b.next, pre: !!p.pre, year: today.slice(0, 4), months: b.yUsed, unpaid: b.yUnpaid, hire: p.hire };
      const sorted = apps.slice().sort((a, c) => (a.at || 0) - (c.at || 0));
      leave.apps = sorted.slice(-20).reverse().map(a => Object.assign(pub(a), { name: p.name }));
      leave.busy = await busy(p.pid, apps);
      leave.phone = p.phone || ''; leave.reasons = L.REASONS; leave.busyMin = L.BUSY; leave.canApply = !p.quit || p.quit >= today;
    }
    return { name, ym: m, thisYm, today, since: '', days: cal.days, sum: cal.sum, leave };
  }
  async function preview(name, x) {
    const p = await me(name), today = L.today(), apps = await myApps(p.pid), c = L.clean(x, apps, today);
    const b = L.balance(p, await myRecs(p.pid), today);
    const a = Object.assign({ id: '', at: Date.now(), name: p.name, status: '미리보기', sign: '', memo: '', decided: 0 }, c);
    return { css: L.CSS, html: L.formHtml(a, p), days: c.days, cal: c.cal, warn: L.warn(c, b.remain, await busy(p.pid, apps)) };
  }
  async function apply(name, x) {
    const p = await me(name), today = L.today(), apps = await myApps(p.pid), c = L.clean(x, apps, today), sign = L.sign(x && x.sign);
    const rnd = Array.from(crypto.getRandomValues(new Uint8Array(5))).map(v => '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'[v % 34]).join('');
    const id = 'L' + today.slice(2).replace(/-/g, '') + '-' + rnd;
    await S.set('leave_apps/' + id, { id, pid: p.pid, name: p.name, status: '대기', kind: c.kind, reason: c.reason, start: c.start, end: c.end, days: c.days, asked: c.days,
      phone: c.phone, sign, memo: '', decided: 0, by: '본인', at: S.SERVER_TIME, deleted: false, log: [{ s: '신청', t: Date.now(), by: '본인' }], upd: S.SERVER_TIME });
    pc.at = 0;
    if (c.phone !== (p.phone || '')) await S.merge('leave_people/' + p.pid, { phone: c.phone, upd: S.SERVER_TIME }).catch(e => console.warn('연락처 저장 실패', e));
    return myWork(name, '');
  }
  async function change(name, id, del) {
    const p = await me(name), apps = await myApps(p.pid), a = apps.filter(z => z.id === String(id))[0];
    if (!a) throw new Error('신청서를 찾지 못했어요. 화면을 새로고침해 주세요.');
    if (!del && a.status !== '대기') throw new Error(a.status === '승인' ? '이미 승인된 신청이에요. 취소하려면 소장님께 말씀해 주세요.' : '이미 ' + a.status + '된 신청이에요.');
    if (del && a.status === '승인') throw new Error('승인된 신청은 지울 수 없어요. 소장님께 말씀해 주세요.');
    const log = (a.log || []).slice(-28), n = { status: a.status, deleted: !!a.deleted };
    if (a.status === '대기') { n.status = '취소'; log.push({ s: '취소', t: Date.now(), by: '본인' }); }
    if (del) { n.deleted = true; log.push({ s: '삭제', t: Date.now(), by: '본인' }); }
    n.log = log; n.touched = true; n.upd = S.SERVER_TIME;
    await S.merge('leave_apps/' + a.id, n);   // 규칙상 상태·지움·이력만 바꿀 수 있음
    return myWork(name, '');
  }
  async function form(name, id) {
    const p = await me(name), a = (await myApps(p.pid)).filter(z => z.id === String(id))[0];
    if (!a) throw new Error('신청서를 찾지 못했어요.');
    return { css: L.CSS, html: L.formHtml(Object.assign({}, a, { name: p.name }), p) };
  }
  async function news(name) {
    try {
      const p = await personFor(name); if (!p || !p.target) return { last: 0 };
      let last = 0; (await myApps(p.pid)).forEach(a => { if ((a.status === '승인' || a.status === '반려') && a.decided) last = Math.max(last, Number(a.decided) || 0); });
      return { last };
    } catch (e) { return { last: 0 }; }
  }

  // mywork.js 가 부르는 이름 그대로 (첫 인자 tok 는 이제 안 씀)
  return async function call(fn, args, as, meName) {
    const name = cleanName(as || meName);
    if (!name) throw new Error('이 휴대폰은 아직 이름이 등록되지 않았어요. 정비 화면에서 본인 이름을 먼저 골라 주세요.');
    args = args || [];
    switch (fn) {
      case 'myWorkHello': {
        const d = await dev(true);
        if (as) { const p = await personFor(as).catch(() => null); if (!p && cleanName(d.name) !== name) throw new Error(as + ' 님은 이 휴대폰에서 볼 수 없어요. 소장님께 2인 1조 휴대폰 승인을 말씀해 주세요.'); }
        return { me: name, hasPin: false, days: 0, approved: true };
      }
      case 'myWork': return myWork(name, args[1]);
      case 'myLeavePreview': return preview(name, args[1]);
      case 'myLeaveApply': return apply(name, args[1]);
      case 'myLeaveCancel': return change(name, args[1], false);
      case 'myLeaveDelete': return change(name, args[1], true);
      case 'myLeaveForm': return form(name, args[1]);
      case 'myLeaveNews': return news(name);
    }
    throw new Error('알 수 없는 요청이에요.');
  };
}

// assign.js — 룸메이드 객실 자동 배정 엔진 (관리자 허브용, 2026-11-13)
// claude/assign/assign.mjs (11/6 확정 규칙 + 11/8 '미정비' 제외·덩어리 벌점) 를 브라우저에서 돌게 옮긴 것 — 같은 입력·같은 시드면 같은 결과
// v2 규칙 (11/8 사용자 확정, opts.v2 !== false 면 켜짐)
//   · 2901 × 로얄 = 우선순위(금지 아님): 로얄 0실 > 1실 > 2실, 전날 한 분·이번 달 횟수 많은 분 뒤로. 3명(당직·H/U 면 1명)은 항상 채움
//   · 신입(정량 8 미만)은 30·31층 중 로얄만 피함 (31층 일반 객실 가능)
// 입력: rooms = 정비보고서 초안 객실 [{room, floor, st, m1, m2, name}] (engine.js buildFromXlsx 의 data.rooms), ho = {이름: 인계 유닛}
//       cfg = { aKey:{층:이름}, bKey:{층:이름}, royalOk:[], pltBlue:[], quota:{이름:정량} }, prev2901 = [이름], hist = {이름: 이번 달 2901 횟수}
// 출력: { owner:{객실:이름}, workers:{이름:{cap, load, rooms, floors, why}}, left:[객실], cost, stats }

export const DEF_CFG = {
  aKey: { 31: '이분남', 30: '김화동', 29: '한지수', 28: '전영신', 27: '유상미', 26: '임나경', 25: '곽미혜', 24: '노애영', 23: '박소연', 22: '박순자', 21: '이혜진', 20: '허슬기', 19: '이은경', 18: '강태금', 17: '김명희', 16: '문국희', 15: '박선영', 14: '오선녀', 13: '김송심', 12: '양윤복', 11: '박창숙', 10: '이미애', 9: '최태자', 8: '이경희', 7: '김시형', 6: '김현지', 5: '김태성', 4: '이분남' },
  bKey: { 26: '이서연', 25: '장은미', 24: '임남주', 23: '정미감', 22: '이지우', 21: '자야', 20: '엔주', 19: '김화경', 18: '하랑', 17: '김윤경', 16: '박예린', 15: '이하늘', 14: '나나경', 13: '김나라', 12: '김나라', 11: '이호라', 10: '성락욱', 9: '성락욱', 8: '박효정', 7: '정미감', 6: '조유경', 5: '조유경' },
  royalOk: ['이분남', '김화동', '박순자', '강태금', '최태자'],
  pltBlue: ['양윤복', '오선녀', '곽미혜', '김송심', '전영신'],
  quota: { 김현지: 8, 이혜진: 8, 문국희: 8, 김윤경: 8, 허슬기: 8, 박창숙: 8, 박선영: 8, 김화경: 7, 장은미: 7, 김득미: 4 }
};

export function runAssign(rooms, ho, cfg0, prev2901, hist, opts) {
  opts = opts || {};
  const cfg = Object.assign({}, DEF_CFG, cfg0 || {});
  const HO = ho, HIST = hist || {}, PREV2901 = prev2901 || [], QUOTA = cfg.quota || {};
  const A_KEY = cfg.aKey, B_KEY = cfg.bKey;
  const ROYAL = ['3001', '3002', '3101', '3102'];
  const ROYAL_OK = cfg.royalOk, PLT_BLUE = cfg.pltBlue, PLT_OK = [...PLT_BLUE, ...ROYAL_OK];
  const V2 = opts.v2 !== false;
  const BASE_DEF = 9, LATE_MAX = 4, FLOOR_MAX = 3;
  const baseOf = n => (QUOTA[n] != null ? QUOTA[n] : Math.min(BASE_DEF, HO[n] != null ? HO[n] : BASE_DEF));
  const STAGE = Object.keys(QUOTA).filter(n => QUOTA[n] < 8);
  const FAK = ['1807', '1808', '1809', '1810', '1811'], FAK_OWNER_MAX = 3;
  const B_SUF = ['10', '11', '15', '16', '17'];
  const tick = opts.onProgress || (() => {});

  const isTarget = x => (['1', '2', '3', '4'].includes(String(x.st == null ? '' : x.st).trim()) || /간단/.test(String(x.st == null ? '' : x.st))) && !/미정비/.test((x.m1 || '') + (x.m2 || ''));
  const T = rooms.filter(isTarget).map(x => Object.assign({}, x, { room: String(x.room), floor: Number(x.floor) || Math.floor(Number(x.room) / 100), suf: String(x.room).slice(-2),
    late: /14시|VIP|르씨엘/i.test((x.m1 || '') + (x.m2 || '')), w: ROYAL.includes(String(x.room)) ? 2 : /간단/.test(String(x.st)) ? 0.5 : 1 }));
  const TX = Object.fromEntries(T.map(x => [x.room, x]));
  const zone = x => (x.floor >= 27 || x.floor === 4 ? 'A' : B_SUF.includes(x.suf) ? 'B' : 'A');
  const W = {}; Object.keys(HO).forEach(n => { W[n] = { cap: HO[n], load: 0, rooms: [], why: [] }; });
  const owner = {};
  const floors = n => new Set(W[n].rooms.map(r => Math.floor(r / 100)));
  const rem = n => W[n].cap - W[n].load;
  const lateN = n => W[n].rooms.filter(r => TX[r] && TX[r].late).length;
  const fakN = n => W[n].rooms.filter(r => FAK.includes(r)).length;
  const royalN = n => W[n].rooms.filter(r => ROYAL.includes(r)).length;
  function can(n, x) {
    if (!W[n] || rem(n) < x.w - 1e-9) return false;
    if (x.late && lateN(n) >= LATE_MAX) return false;
    if (FAK.includes(x.room) && fakN(n) >= (n === A_KEY[18] ? FAK_OWNER_MAX : 1)) return false;
    const f = floors(n); if (!f.has(x.floor) && f.size >= FLOOR_MAX) return false;
    return true;
  }
  function give(n, x, why) { owner[x.room] = n; W[n].rooms.push(x.room); W[n].load += x.w; W[n].why.push(x.room + ' ' + why); }
  const free = () => T.filter(x => !owner[x.room] && x.room !== '2901');

  // 1 로얄
  for (const r of ROYAL) { const x = TX[r]; if (!x) continue;
    const own = A_KEY[x.floor]; const c = [own, ...ROYAL_OK.filter(n => n !== own)].filter(n => W[n] && can(n, x));
    if (c.length) give(c[0], x, c[0] === own ? '로얄 · ' + x.floor + 'F 담당' : '로얄 · 가능자'); }
  // 2 A키 담당 층
  for (const f of Object.keys(A_KEY).map(Number).sort((a, b) => b - a)) {
    const a = W[A_KEY[f]] ? A_KEY[f] : null, b = W[B_KEY[f]] ? B_KEY[f] : null;
    const fr = free().filter(x => x.floor === f).sort((p, q) => p.room - q.room);
    if (a) for (const x of fr) if ((zone(x) === 'A' || !b) && !owner[x.room] && can(a, x)) give(a, x, f + 'F A키 담당');
  }
  // 2-1 B키 옮기기 (11/8 사용자 확정 → 11/13 '2번 조금 완화'로 바꿈, v2 · opts.bMove !== false)
  //   조건: ② 그날 B키 구역 배정 객실 3실 이하 + 그 층 A키가 출근해 자기 층에만 있음
  //   ① A키가 남은 유닛만큼 B구역 방을 받음 — 다 못 받으면 나머지는 같은 층·옆 층 분들이 채움(6·7단계)
  //   ③ B키는 빈 층(두 키 다 없는 층) 덩어리가 있으면 통째로, 없으면 남은 방을 덩어리로 받음 (층 수 같거나 줄어들 때만 빈 층 지정)
  //   opts.bMoveMode = 'strict' 면 11/8 처음 조건(A키가 다 받고 남는 유닛 1 이하일 때만)
  const OVR = {}, OVR_WHY = {}, bMoves = [], MOVED = new Set(), FROM_B = {};
  const BM_MAX = opts.bMoveMax != null ? opts.bMoveMax : 3, BM_STRICT = opts.bMoveMode === 'strict', BM_SHARE = opts.bShare != null ? opts.bShare : 0.5, BM_MIN_BLOCK = opts.bMoveMin != null ? opts.bMoveMin : 4;
  if (V2 && opts.bMove !== false) {
    const orphan = () => { const m = {}; free().forEach(x => { if (MOVED.has(x.room) || W[A_KEY[x.floor]] || W[B_KEY[x.floor]]) return; (m[x.floor] = m[x.floor] || []).push(x); }); return m; };
    const bNames = [...new Set(Object.values(B_KEY))].filter(n => W[n] && W[n].load === 0 && !(opts.noBMove || []).includes(n));
    const cands = bNames.map(b => { const fs = Object.keys(B_KEY).map(Number).filter(f => B_KEY[f] === b);
      const xs = free().filter(x => fs.includes(x.floor) && (zone(x) === 'B' || !W[A_KEY[x.floor]]));
      return { b, xs }; }).filter(c => c.xs.length > 0 && c.xs.length <= BM_MAX).sort((p, q) => p.xs.length - q.xs.length || (p.b < q.b ? -1 : 1));
    for (const { b, xs } of cands) {
      const byF = {}; xs.forEach(x => (byF[x.floor] = byF[x.floor] || []).push(x));
      const ok1 = Object.keys(byF).every(f => { const a = A_KEY[f]; if (!W[a] || a === b) return false; const fsA = floors(a);
        if (fsA.size !== 1 || !fsA.has(Number(f))) return false;
        if (!BM_STRICT) { const fit = byF[f].filter(x => x.w <= rem(a) + 1e-9).length; return Math.min(fit, Math.floor(rem(a) + 1e-9)) >= Math.max(1, Math.ceil(byF[f].length * BM_SHARE)); }
        const need = byF[f].reduce((s, x) => s + x.w, 0), r = rem(a);
        return need <= r + 1e-9 && r - need <= 1 + 1e-9 && byF[f].every(x => !(x.late && lateN(a) + byF[f].filter(y => y.late).length > LATE_MAX)); });
      if (!ok1) continue;
      const om = orphan(); let best = null;
      for (const f of Object.keys(om).map(Number)) { const xsF = om[f].filter(x => !ROYAL.includes(x.room) && !(STAGE.includes(b) && x.floor >= 30)); const size = xsF.reduce((s, x) => s + x.w, 0);
        if (size < BM_MIN_BLOCK) continue; if (!best || size > best.size || (size === best.size && f < best.f)) best = { f, xs: xsF, size }; }
      const before = new Set(xs.map(x => x.floor)).size + (xs.reduce((s, x) => s + x.w, 0) < W[b].cap ? 1 : 0);
      if (best && (best.size >= W[b].cap - 1e-9 ? 1 : 2) > before) best = null;
      if (!best && BM_STRICT) continue;
      const toA = [], shared = [];
      Object.keys(byF).forEach(f => { const a = A_KEY[f]; toA.push(a);
        byF[f].sort((p, q) => p.room - q.room).forEach(x => { OVR[x.room] = a; FROM_B[x.room] = b; OVR_WHY[x.room] = 'B키 옮기기 (담당 ' + b + ')';
          if (can(a, x)) give(a, x, f + 'F B구역 · B키 옮기기 (담당 ' + b + ')'); else { MOVED.add(x.room); shared.push(x.room); } }); });
      let took = 0;
      if (best) for (const x of best.xs.sort((p, q) => p.room - q.room)) if (can(b, x)) { give(b, x, best.f + 'F 통째 · B키 옮기기'); OVR[x.room] = b; OVR_WHY[x.room] = 'B키 옮기기 → ' + best.f + 'F'; took++; }
      bMoves.push({ b, from: Object.keys(byF).map(Number).sort((p, q) => q - p), rooms: xs.map(x => x.room), shared, to: best ? best.f : null, took, a: toA });
    }
  }
  // 3 B키 담당 층
  for (const f of Object.keys(B_KEY).map(Number).sort((a, b) => b - a)) {
    const b = W[B_KEY[f]] ? B_KEY[f] : null; if (!b) continue; const a = W[A_KEY[f]] ? A_KEY[f] : null;
    for (const x of free().filter(x => x.floor === f && !MOVED.has(x.room)).sort((p, q) => p.room - q.room)) if ((zone(x) === 'B' || !a) && can(b, x)) give(b, x, f + 'F B키 담당');
  }
  // 4 2901 (PLT)
  const p = TX['2901'];
  if (p) { const n3 = /당직|H\/U|h\/u/.test((p.m1 || '') + (p.m2 || '')) ? 1 : 3;
    let c;
    if (!V2) {
      c = PLT_OK.filter(n => W[n] && !W[n].rooms.some(r => ROYAL.includes(r)) && (floors(n).has(29) || floors(n).size < FLOOR_MAX)).sort((a, b) => (PREV2901.includes(a) ? 1 : 0) - (PREV2901.includes(b) ? 1 : 0) || (PLT_BLUE.includes(a) ? 0 : 1) - (PLT_BLUE.includes(b) ? 0 : 1) || (HIST[a] || 0) - (HIST[b] || 0) || floors(a).size - floors(b).size).slice(0, n3);
    } else {
      // v2: 금지 없이 벌점 순서 — 로얄 2실 > 전날 > 파란 명단 아님 > 이번 달 횟수 > 로얄 1실 > 층 수. 가능자 명단이 모자라면 정량 없는 9 이상 분까지
      const pen = n => (royalN(n) >= 4 ? 60 : royalN(n) >= 2 ? 30 : 0) + (PREV2901.includes(n) ? 40 : 0) + (PLT_BLUE.includes(n) ? 0 : 6) + (HIST[n] || 0) * 3 + (royalN(n) > 0 && royalN(n) < 2 ? 2 : 0) + floors(n).size * 0.5 + (!floors(n).has(29) && floors(n).size >= FLOOR_MAX ? 100 : 0);
      const pool = PLT_OK.filter(n => W[n]);
      c = pool.sort((a, b) => pen(a) - pen(b) || PLT_OK.indexOf(a) - PLT_OK.indexOf(b)).slice(0, n3);
      if (c.length < n3) {
        const more = Object.keys(W).filter(n => !c.includes(n) && !STAGE.includes(n) && QUOTA[n] == null && W[n].cap >= BASE_DEF).sort((a, b) => pen(a) - pen(b) || W[b].cap - W[a].cap);
        c = c.concat(more.slice(0, n3 - c.length));
      }
    }
    c.forEach(n => { if (rem(n) < 1) { const r = [...W[n].rooms].reverse().find(r => !ROYAL.includes(r) && !(TX[r] && TX[r].floor >= 30)); if (r) { const x = TX[r]; W[n].rooms.splice(W[n].rooms.indexOf(r), 1); W[n].load -= x.w; delete owner[r]; } }
      W[n].rooms.push('2901'); W[n].load += 1; W[n].why.push('2901 · PLT ' + n3 + '명' + (PREV2901.includes(n) ? ' (전날도 함)' : '') + (V2 && royalN(n) ? ' (로얄 ' + royalN(n) / 1 + '실도 맡음)' : '')); });
    owner['2901'] = c.join(', '); }
  // 5 유닛 다운 · +1
  const totalU = T.reduce((s, x) => s + (x.room === '2901' ? (owner['2901'] ? owner['2901'].split(', ').length : 0) : x.w), 0);
  let D = Object.values(W).reduce((s, w) => s + w.cap, 0) - totalU;
  const downs = [], DOWN_SMALL = opts.down !== 'big';
  while (D > 0) {
    const c = Object.keys(W).filter(n => W[n].cap > baseOf(n) && !downs.includes(n))
      .sort((a, b) => (QUOTA[a] != null ? 0 : 1) - (QUOTA[b] != null ? 0 : 1) || (DOWN_SMALL ? W[a].cap - W[b].cap : W[b].cap - W[a].cap));
    if (!c.length) {
      const c2 = Object.keys(W).filter(n => W[n].cap > 8 && !STAGE.includes(n) && !downs.includes(n)).sort((a, b) => rem(b) - rem(a) || W[b].cap - W[a].cap);
      if (!c2.length) break; c.push(c2[0]); }
    const n = c[0]; W[n].cap -= 1;
    if (rem(n) < -1e-9) { const r = [...W[n].rooms].reverse().find(r => r !== '2901' && !ROYAL.includes(r)); const x = TX[r];
      W[n].rooms.splice(W[n].rooms.indexOf(r), 1); W[n].load -= x.w; delete owner[r]; } downs.push(n); W[n].why.push('유닛 다운 ' + (W[n].cap + 1) + '→' + W[n].cap); D -= 1;
  }
  const ups = [];
  while (D < 0) {
    const pri = n => ROYAL_OK.includes(n) ? (W[n].rooms.some(r => ROYAL.includes(r)) ? 3 : 0) : PLT_BLUE.includes(n) ? 1 : 2;
    const c = Object.keys(W).filter(n => !ups.includes(n) && W[n].cap >= BASE_DEF && QUOTA[n] == null && !STAGE.includes(n))
      .sort((a, b) => pri(a) - pri(b) || ROYAL_OK.indexOf(a) - ROYAL_OK.indexOf(b) || W[b].cap - W[a].cap);
    if (!c.length) break;
    const n = c[0]; W[n].cap += 1; ups.push(n); D += 1;
  }
  // 6 남은 방 채우기 (층 덩어리)
  for (let guard = 0; guard < 800; guard++) {
    const ppl = Object.keys(W).filter(n => rem(n) >= 0.5 - 1e-9).sort((a, b) => rem(b) - rem(a));
    if (!ppl.length || !free().length) break;
    let best = null;
    for (const n of ppl) {
      const f0 = floors(n), byF = {};
      free().filter(x => can(n, x)).forEach(x => (byF[x.floor] = byF[x.floor] || []).push(x));
      for (const f of Object.keys(byF).map(Number)) {
        const size = byF[f].reduce((s, x) => s + x.w, 0), r = rem(n);
        const same = f0.has(f), dist = f0.size ? Math.min(...[...f0].map(g => Math.abs(g - f))) : 0;
        const score = (same ? -100 : 0) + Math.abs(Math.min(size, r) - r) * 3 + Math.max(0, size - r) * 0.3 + dist * 0.4 + (STAGE.includes(n) && !same && size < r ? 20 : 0) + f0.size * 4 + (!same && f0.size >= 2 ? 40 : 0);
        if (!best || score < best.score) best = { n, f, score, xs: byF[f] };
      }
      if (best && best.n === n) break;
    }
    if (!best) break;
    const f0 = floors(best.n);
    for (const x of best.xs.sort((p, q) => p.room - q.room)) if (can(best.n, x)) give(best.n, x, f0.has(best.f) ? '같은 층 보충' : best.f + 'F 보충');
  }
  // 7 다듬기 (비용 줄이기)
  const keyOf = x => { if (OVR[x.room]) return OVR[x.room]; const a = A_KEY[x.floor], b = B_KEY[x.floor]; const za = zone(x) === 'A';
    if (za && W[a]) return a; if (!za && W[b]) return b; return W[a] ? a : W[b] ? b : null; };
  const capO = Object.fromEntries(Object.keys(W).map(n => [n, HO[n]]));
  const capF = Object.fromEntries(Object.keys(W).map(n => [n, W[n].cap]));
  const stageBad = r => V2 ? ROYAL.includes(r) : (TX[r] && TX[r].floor >= 30);
  function costOf(n) {
    const w = W[n], fs = floors(n), k = fs.size; let c = 0;
    c += (k > 1 ? (k - 1) * 12 : 0) + (k >= 3 ? 150 : 0) + (k > FLOOR_MAX ? 1000 : 0) + (STAGE.includes(n) && k > 1 ? 30 * (k - 1) : 0);
    if (k > 1) { const a = [...fs].sort((p, q) => p - q); c += (a[a.length - 1] - a[0]) * 0.3; }
    const def = capF[n] - w.load, over = w.load - capF[n];
    if (over > 1e-9) c += 500 * over;
    if (def > 1e-9) c += 200 * def;
    if (STAGE.includes(n)) c += w.rooms.filter(stageBad).length * 30;
    for (const r of w.rooms) { const x = TX[r]; if (!x || r === '2901') continue; const ko = keyOf(x); if (ko && ko !== n) { const real = (zone(x) === 'A' ? A_KEY : B_KEY)[x.floor] === ko; c += !real ? 1 : zone(x) === 'A' ? 25 : 12; } }
    if (opts.chunk !== false) { const byF = {}; w.rooms.forEach(r => { const x = TX[r]; if (!x || r === '2901') return; if (keyOf(x) === n) return; byF[x.floor] = (byF[x.floor] || 0) + 1; });
      Object.values(byF).forEach(s => { c += s <= 2 ? 10 : s <= 4 ? 4 : 0; }); }
    c += w.rooms.filter(r => FROM_B[r] === n).length * 12;
    if (lateN(n) > LATE_MAX) c += 100; if (fakN(n) > (n === A_KEY[18] ? FAK_OWNER_MAX : 1)) c += 300;
    return c;
  }
  const PIN = new Set(T.filter(x => x.floor >= 30 && W[A_KEY[x.floor]] && owner[x.room] === A_KEY[x.floor]).map(x => x.room));
  const movable = r => r !== '2901' && TX[r] && !PIN.has(r);
  const okRoyal = (n, r) => !ROYAL.includes(r) || ROYAL_OK.includes(n);
  function mv(r, a, b) { const x = TX[r]; W[a].rooms.splice(W[a].rooms.indexOf(r), 1); W[a].load -= x.w; W[b].rooms.push(r); W[b].load += x.w; owner[r] = b; }
  let improved = true, iter = 0;
  const names = Object.keys(W);
  while (improved && iter++ < 200) {
    improved = false;
    for (const x of free()) { let best = null;
      for (const n of names) { if (!okRoyal(n, x.room)) continue; const before = costOf(n); W[n].rooms.push(x.room); W[n].load += x.w; const d = costOf(n) - before; W[n].rooms.pop(); W[n].load -= x.w; if (!best || d < best.d) best = { n, d }; }
      if (best) { give(best.n, x, '남은 방'); improved = true; } }
    for (const a of names) for (const r of [...W[a].rooms]) { if (!movable(r)) continue;
      for (const b of names) { if (b === a || !okRoyal(b, r) || !W[a].rooms.includes(r)) continue;
        const c0 = costOf(a) + costOf(b); mv(r, a, b); const c1 = costOf(a) + costOf(b);
        if (c1 < c0 - 1e-9) { improved = true; continue; } mv(r, b, a);
        for (const s2 of [...W[b].rooms]) { if (!movable(s2) || !okRoyal(a, s2)) continue;
          const d0 = costOf(a) + costOf(b); mv(r, a, b); mv(s2, b, a); const d1 = costOf(a) + costOf(b);
          if (d1 < d0 - 1e-9) { improved = true; break; } mv(s2, a, b); mv(r, b, a); }
        if (!W[a].rooms.includes(r)) break; } }
  }
  const blocks = n => { const m = {}; W[n].rooms.filter(movable).forEach(r => { const f = TX[r].floor; (m[f] = m[f] || []).push(r); }); return m; };
  for (let it = 0, imp = true; imp && it < 30; it++) { imp = false;
    for (const a of names) for (const b of names) { if (a >= b) continue;
      const BA = blocks(a), BB = blocks(b);
      for (const fa of [null, ...Object.keys(BA)]) for (const fb of [null, ...Object.keys(BB)]) { if (!fa && !fb) continue;
        const ra = fa ? BA[fa] : [], rb = fb ? BB[fb] : [];
        if (ra.some(r => !okRoyal(b, r)) || rb.some(r => !okRoyal(a, r))) continue;
        if (!ra.every(r => W[a].rooms.includes(r)) || !rb.every(r => W[b].rooms.includes(r))) continue;
        const c0 = costOf(a) + costOf(b); ra.forEach(r => mv(r, a, b)); rb.forEach(r => mv(r, b, a));
        if (costOf(a) + costOf(b) < c0 - 1e-9) { imp = true; break; }
        ra.forEach(r => mv(r, b, a)); rb.forEach(r => mv(r, a, b)); }
    } }
  // 8 무작위 탐색 (담금질) — 시드 고정이면 같은 결과. opts.seeds = [시드, …] 면 같은 출발점에서 여러 번 돌려 가장 낮은 비용 채택
  let bestCost = Infinity, bestAll = null;
  const seeds = Array.isArray(opts.seeds) && opts.seeds.length ? opts.seeds : [opts.seed != null ? opts.seed : 12345];
  const snap0 = () => Object.fromEntries(names.map(n => [n, [...W[n].rooms]]));
  const load0 = sn => { names.forEach(n => { W[n].rooms = [...sn[n]]; W[n].load = W[n].rooms.reduce((s, r) => s + (r === '2901' ? 1 : TX[r].w), 0); W[n].rooms.forEach(r => { if (r !== '2901') owner[r] = n; }); }); };
  const start = snap0();
  for (let si = 0; si < seeds.length; si++) { load0(start);
  { let seed = Number(seeds[si]); const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const total = () => names.reduce((s, n) => s + costOf(n), 0);
    const snap = () => Object.fromEntries(names.map(n => [n, [...W[n].rooms]]));
    const load = sn => { names.forEach(n => { W[n].rooms = [...sn[n]]; W[n].load = W[n].rooms.reduce((s, r) => s + (r === '2901' ? 1 : TX[r].w), 0); W[n].rooms.forEach(r => { if (r !== '2901') owner[r] = n; }); }); };
    let cur = total(), best = cur, bestS = snap(); const N = Number(opts.iter != null ? opts.iter : 600000);
    for (let i = 0; i < N; i++) { const temp = 15 * Math.pow(0.002, i / N);
      if ((i & 32767) === 0) tick((si + i / N) / seeds.length);
      const a = names[Math.floor(rnd() * names.length)], b = names[Math.floor(rnd() * names.length)]; if (a === b) continue;
      const ra = W[a].rooms.filter(movable); if (!ra.length) continue;
      const kind = rnd(); let undo;
      const c0 = costOf(a) + costOf(b);
      if (kind < 0.4) { const r = ra[Math.floor(rnd() * ra.length)]; if (!okRoyal(b, r)) continue; mv(r, a, b); undo = () => mv(r, b, a); }
      else if (kind < 0.8) { const rb = W[b].rooms.filter(movable); if (!rb.length) continue; const r = ra[Math.floor(rnd() * ra.length)], q = rb[Math.floor(rnd() * rb.length)];
        if (!okRoyal(b, r) || !okRoyal(a, q)) continue; mv(r, a, b); mv(q, b, a); undo = () => { mv(q, a, b); mv(r, b, a); }; }
      else { const f = TX[ra[Math.floor(rnd() * ra.length)]].floor; const blk = ra.filter(r => TX[r].floor === f); if (blk.some(r => !okRoyal(b, r))) continue;
        const rb = W[b].rooms.filter(movable), g = rb.length && rnd() < 0.7 ? TX[rb[Math.floor(rnd() * rb.length)]].floor : null; const blk2 = g == null ? [] : rb.filter(r => TX[r].floor === g);
        if (blk2.some(r => !okRoyal(a, r))) continue; blk.forEach(r => mv(r, a, b)); blk2.forEach(r => mv(r, b, a)); undo = () => { blk2.forEach(r => mv(r, a, b)); blk.forEach(r => mv(r, b, a)); }; }
      const d = costOf(a) + costOf(b) - c0;
      if (d <= 0 || rnd() < Math.exp(-d / temp)) { cur += d; if (cur < best - 1e-9) { best = cur; bestS = snap(); } } else undo();
    }
    if (best < bestCost - 1e-9) { bestCost = best; bestAll = bestS; } }
  }
  load0(bestAll); tick(1);
  for (const n of names) { const w = W[n]; const keep = w.why.filter(t => /^2901|로얄/.test(t));
    w.why = keep.concat(w.rooms.filter(r => r !== '2901' && !ROYAL.includes(r)).map(r => { const x = TX[r], ko = keyOf(x); return r + (ko === n ? (OVR_WHY[r] ? ' ' + OVR_WHY[r] : ' 담당') : ' 보충'); }));
    if (w.load < capO[n] - 1e-9) w.why.unshift('유닛 다운 ' + capO[n] + '→' + w.load);
    if (w.load > capO[n] + 1e-9) w.why.unshift('+1 (베테랑 우선) ' + capO[n] + '→' + w.load); w.cap = w.load; }
  const left = free().map(x => x.room);
  const workers = Object.fromEntries(Object.entries(W).map(([n, w]) => [n, { cap: w.cap, load: w.load, ho: capO[n], rooms: w.rooms, floors: [...floors(n)].sort((a, b) => b - a), why: w.why }]));
  const fl = names.map(n => workers[n].floors.length).filter(k => k > 0);
  const stats = { target: T.length, units: T.reduce((s, x) => s + (x.room === '2901' ? (owner['2901'] ? owner['2901'].split(', ').length : 0) : x.w), 0),
    handover: Object.values(HO).reduce((a, b) => a + b, 0), left: left.length, avgFloors: fl.length ? fl.reduce((a, b) => a + b, 0) / fl.length : 0,
    three: names.filter(n => workers[n].floors.length >= 3), plt: owner['2901'] ? owner['2901'].split(', ') : [],
    down: names.filter(n => workers[n].load < capO[n] - 1e-9), up: names.filter(n => workers[n].load > capO[n] + 1e-9),
    bMove: bMoves.map(m => Object.assign({}, m, { kept: m.rooms.filter(r => owner[r] && m.a.includes(owner[r])).length, keptTo: W[m.b].rooms.filter(r => TX[r] && TX[r].floor === m.to).length, bFloors: [...floors(m.b)].sort((p, q) => q - p) })) };
  return { owner, workers, left, cost: Math.round(bestCost), stats };
}

// 하우스키퍼 완성본(이름 들어간 객실)과 엔진 결과 비교 — 같은 사람 비율 · 평균 층 수 · 3개 층 · 사람별
export function compare(roomsDone, res) {
  const norm = v => String(v || '').replace(/ /g, '').split(',').filter(Boolean).sort().join(',');
  const act = {}; roomsDone.forEach(x => { if (x.name) act[String(x.room)] = norm(x.name); });
  const mine = {}; Object.entries(res.owner).forEach(([r, n]) => { mine[r] = norm(n); });
  const rs = Object.keys(act); let same = 0; const diff = [];
  rs.forEach(r => { if (act[r] === mine[r]) same++; else diff.push({ room: r, hk: act[r], en: mine[r] || '' }); });
  const per = {}; roomsDone.forEach(x => { if (!x.name) return; String(x.name).replace(/ /g, '').split(',').filter(Boolean).forEach(n => { const p = per[n] = per[n] || { rooms: [], floors: new Set() }; p.rooms.push(String(x.room)); p.floors.add(Math.floor(Number(x.room) / 100)); }); });
  const names = Object.keys(res.workers);
  const hkF = names.map(n => (per[n] ? per[n].floors.size : 0)).filter(k => k > 0);
  const rows = names.map(n => { const hk = per[n] ? per[n].rooms : [], en = res.workers[n].rooms; return { name: n, hkFloors: per[n] ? [...per[n].floors].sort((a, b) => b - a) : [], enFloors: res.workers[n].floors, same: hk.filter(r => en.includes(r)).length, hk: hk.length, en: en.length }; });
  return { total: rs.length, same, pct: rs.length ? Math.round(same * 100 / rs.length) : 0, diff,
    hkAvg: hkF.length ? hkF.reduce((a, b) => a + b, 0) / hkF.length : 0, hkThree: names.filter(n => per[n] && per[n].floors.size >= 3), rows };
}

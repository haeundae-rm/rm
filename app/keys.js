// keys.js — 🔑 플로어키 불출 서명 (2026-11-19). 계산만 하는 부품 (화면 · 저장 없음)
// 정비 레포트(메이드 화면)와 허브 키 대장(hub/keys/)이 같이 씀 → 두 곳의 셈이 늘 같음
//
// 저장 모양
//   meta/keys            { from: '2026-11-20', on: true }   시작 날짜 · 바로 끄기 스위치 (허브에서 소장 · 부소장이 고침)
//   days/{날짜}/keys/{id} { floor, maid, key: 'A'|'B'|'AB'|'없음', reason, by: '본인'|'관리자', who, at, clientAt, uid }
//                        쌓기만 함 (고치기 · 지우기 없음). 같은 사람 · 같은 층은 '마지막 줄'이 지금 값 → 바꾼 기록이 그대로 남음
//   days/{날짜}/keychk/{id} { floor, key: 'A'|'B', st: 'in'|'out'|'', by, at, uid }
//                        하우스키퍼 오후 대조 (실물 있음/없음). 이것도 쌓기만, 층 · 키마다 마지막 줄이 지금 값
//   days/{날짜}/keyret/{id} { floor, maid, on: true|false, at, clientAt, uid }   (v18) 메이드 '반납했어요' 표시 (선택). 쌓기만, 사람 · 층마다 마지막 줄
//                        → 대조 전엔 '메이드 반납 표시'로 보이고, 실제 반납 확인은 여전히 하우스키퍼 대조
export const FLOORS = Array.from({ length: 28 }, (_, i) => i + 4);   // 4층 ~ 31층 (종이 대장과 같음)
export const REASONS = ['짝이 열어 줌', '다른 분 키', '기타'];
export const KEY_LABEL = { A: 'A키', B: 'B키', AB: 'A·B키', '없음': '안 가져감' };

export const floorOf = room => Math.floor(Number(room) / 100);
export function floorsOfRooms(rooms) {
  const s = {}; (rooms || []).forEach(x => { const f = floorOf(x.room || x); if (f >= 2 && f <= 40) s[f] = 1; });
  return Object.keys(s).map(Number).sort((a, b) => a - b);
}
// 켜져 있나: 스위치가 켜져 있고(on 이 false 가 아님) 시작 날짜가 오늘이거나 지났을 때만
export function enabled(cfg, day) { return !!(cfg && cfg.on !== false && typeof cfg.from === 'string' && cfg.from && cfg.from <= day); }

const tOf = d => Number(d.clientAt || d.at || 0);
const has = (k, c) => k === c || k === 'AB';
// 줄들 → 사람 · 층마다 마지막 줄 { 'name|floor': {..., n: 그 사람 · 층 줄 수} }
export function latest(docs) {
  const out = {};
  (docs || []).map(x => Object.assign({ id: x.id, pending: !!x.pending }, x.data || x)).filter(d => d.maid && d.floor)
    .sort((a, b) => tOf(a) - tOf(b) || (a.id < b.id ? -1 : 1))
    .forEach(d => { const k = d.maid + '|' + d.floor, o = out[k]; out[k] = Object.assign({}, d, { n: (o ? o.n : 0) + 1, first: o ? o.first : d }); });
  return out;
}
// 층마다 누가 무엇을 (지금 값만)
export function byFloor(lat) {
  const F = {};
  Object.keys(lat).forEach(k => {
    const d = lat[k], f = Number(d.floor), x = F[f] || (F[f] = { A: [], B: [], none: [] });
    if (has(d.key, 'A')) x.A.push(d);
    if (has(d.key, 'B')) x.B.push(d);
    if (d.key === '없음') x.none.push(d);
  });
  return F;
}
// 이 층 · 이 키를 다른 분(나 · 짝 빼고)이 이미 가져갔다고 했나 → 이름 목록
export function takenBy(lat, floor, key, mine) {
  const F = byFloor(lat)[floor]; if (!F) return [];
  const list = key === 'AB' ? F.A.concat(F.B) : key === 'A' || key === 'B' ? F[key] : [];
  const seen = {};
  return list.filter(d => (mine || []).indexOf(d.maid) < 0).map(d => d.maid).filter(n => (seen[n] ? false : (seen[n] = 1)));
}
// 하우스키퍼 대조: 층 · 키마다 마지막 줄 { floor: { A: {st, by, at, n}, B: {...} } }
export function latestChk(docs) {
  const out = {};
  (docs || []).map(x => Object.assign({ id: x.id }, x.data || x)).filter(d => d.floor && (d.key === 'A' || d.key === 'B'))
    .sort((a, b) => tOf(a) - tOf(b) || (a.id < b.id ? -1 : 1))
    .forEach(d => { const x = out[d.floor] || (out[d.floor] = {}), o = x[d.key]; x[d.key] = Object.assign({}, d, { n: (o ? o.n : 0) + 1 }); });
  return out;
}
// 대장 한 칸 상태
//   'in'      반납 확인 (하우스키퍼가 실물 있음)
//   'late'    미반납 (가져갔다고 했는데 대조 때 없음)
//   'nosign'  서명 없이 없음 (아무도 가져갔다고 안 했는데 대조 때 없음)
//   'out'     가져감 · 대조 전
//   ''        아무도 안 가져감 · 대조 전 (또는 있음)
//   'ret'     가져감 · 대조 전이지만 가져간 분이 모두 '반납했어요'를 누름
export function cellState(takers, chk) {
  const st = chk && chk.st;
  if (st === 'in') return 'in';
  if (st === 'out') return takers.length ? 'late' : 'nosign';
  return takers.length ? (takers.every(d => d.ret) ? 'ret' : 'out') : '';
}
// 메이드 반납 표시: 사람 · 층마다 마지막 줄 { 'name|floor': doc } (on:false = 취소)
export function latestRet(docs) {
  const out = {};
  (docs || []).map(x => Object.assign({ id: x.id }, x.data || x)).filter(d => d.maid && d.floor)
    .sort((a, b) => tOf(a) - tOf(b) || (a.id < b.id ? -1 : 1)).forEach(d => { out[d.maid + '|' + d.floor] = d; });
  Object.keys(out).forEach(k => { if (out[k].on === false) delete out[k]; });
  return out;
}
// 대장 전체: 4~31층 줄 (+ 그 밖 층에 기록이 있으면 그 층도)
export function ledger(lat, chkDocs, retDocs) {
  const R = latestRet(retDocs);
  const lat2 = {}; Object.keys(lat).forEach(k => { lat2[k] = R[k] ? Object.assign({}, lat[k], { ret: R[k].clientAt || R[k].at || 1 }) : lat[k]; });
  const F = byFloor(lat2), C = latestChk(chkDocs);
  const fl = FLOORS.slice(); Object.keys(F).concat(Object.keys(C)).map(Number).forEach(f => { if (fl.indexOf(f) < 0) fl.push(f); });
  return fl.sort((a, b) => a - b).map(f => {
    const x = F[f] || { A: [], B: [], none: [] }, c = C[f] || {};
    return { floor: f, A: { takers: x.A, chk: c.A || null, st: cellState(x.A, c.A) }, B: { takers: x.B, chk: c.B || null, st: cellState(x.B, c.B) }, none: x.none };
  });
}
// 오늘 배정(plans) + 근무 중 변경(changes) → 메이드마다 층 목록. 허브용 (정비 레포트 관리자 화면 셈을 줄인 것)
export function maidFloors(plans, changes) {
  const R = {};
  Object.keys(plans || {}).forEach(n => { R[n] = (plans[n] || []).map(x => String(x.room)); });
  (changes || []).map(c => c.data || c).sort((a, b) => tOf(a) - tOf(b)).forEach(c => {
    const rm = (n, r) => { if (R[n]) R[n] = R[n].filter(x => x !== r); };
    const ad = (n, r) => { if (!R[n]) R[n] = []; if (R[n].indexOf(r) < 0) R[n].push(r); };
    if (c.kind === '추가') ad(c.maid, String(c.room));
    else if (c.kind === '제외') rm(c.maid, String(c.room));
    else if (c.kind === '교환' && c.to) { rm(c.maid, String(c.room)); rm(c.to, String(c.toRoom)); ad(c.maid, String(c.toRoom)); ad(c.to, String(c.room)); }
  });
  const out = {}; Object.keys(R).forEach(n => { const f = floorsOfRooms(R[n]); if (f.length) out[n] = f; });
  return out;
}
// 아직 키 답을 안 한 사람 · 층 (2인 1조는 짝이 답했으면 답한 것)
export function unanswered(mf, lat, mate) {
  const out = [];
  Object.keys(mf).sort().forEach(n => {
    const mt = (mate && mate[n]) || '';
    const miss = mf[n].filter(f => !lat[n + '|' + f] && !(mt && lat[mt + '|' + f]));
    if (miss.length) out.push({ name: n, floors: miss });
  });
  return out;
}
// 허브 첫 화면 · 키 대장 요약
export function summary(o) {
  const lat = latest(o.keys), L = ledger(lat, o.chk, o.ret);
  const un = o.mf ? unanswered(o.mf, lat, o.mate) : [];
  const cells = []; L.forEach(r => ['A', 'B'].forEach(k => cells.push(Object.assign({ floor: r.floor, key: k }, r[k]))));
  const late = cells.filter(c => c.st === 'late'), nosign = cells.filter(c => c.st === 'nosign');
  const checked = cells.filter(c => c.chk && c.chk.st).length;
  const changed = Object.keys(lat).map(k => lat[k]).filter(d => d.n > 1 || d.by === '관리자');
  return { lat, ledger: L, unanswered: un, late, nosign, checked, cells: cells.length, changed };
}

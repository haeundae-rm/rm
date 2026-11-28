// 📋 앱 정비보고서 → 메이드 휴대폰 연결 시험 (2026-11-27) — node test/rsync_app_test.mjs  (가명)
//   appData(jbr 한 날) → engine makeRows → planSync: 엑셀 때와 같은 결과 · 바뀐 방만 · 손으로 바꾼 방 · 완료 방 보호
import { appData, planSync, THEME_ROOMS, srvLiveOf } from '../app/rsync.js';
import { _test } from '../app/engine.js';
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); c ? pass++ : fail++; };
const DAY = '2026-11-28';
const r = {}; ['401', '402', '403', '404', '501', '502', '3001', '1707', '601'].forEach(k => { r[k] = ['1', '', '', '', 0, 0]; });
r['401'][1] = '가람'; r['402'][1] = '가람'; r['403'][1] = '나래'; r['404'][1] = '나래'; r['501'][1] = '나래'; r['3001'][1] = '가람'; r['1707'][1] = '나래';
r['502'] = ['', '', '', '', 0, 1];   // 연박
r['601'] = ['1', '', '미정비', '', 0, 0];
r['403'][2] = 'VIP'; r['404'][0] = '2';
const doc = { date: DAY, src: 'app', rooms: Object.keys(r), r, cards: [{ n: '가람', u: 4 }, { n: '나래', u: 4 }], groups: [{ name: '시험단', time: '15:00', rooms: '501' }] };
const rows0 = _test.makeRows(appData(doc), DAY).rows;
ok(rows0.length === 7 && rows0.every(x => x[0] === DAY), '배정 줄 7개 (연박 · 미정비 방 없음)');
const tg = room => (rows0.find(x => x[2] === room) || [])[3] || '';
ok(/VIP/.test(tg('403')) && /재실/.test(tg('404')) && /단체/.test(tg('501')) && /테마/.test(tg('1707')), '꼬리표: VIP · 재실 · 단체 · 테마(고정 ' + THEME_ROOMS.length + '실)');
// 메이드 앱 상태 = 아침 올린 배정 그대로
const maidsOf = rows => { const m = {}; rows.forEach(x => { (m[x[1]] = m[x[1]] || []).push({ room: x[2], tags: String(x[3]).split('|').filter(Boolean), due: x[5], after: x[6] }); }); return Object.keys(m).map(n => ({ name: n, rooms: m[n] })); };
const st = (extra = {}) => Object.assign({ maids: maidsOf(rows0), info: {}, chg: [], mine: {}, done: {}, pick: ['재실', '단체', '테마', '룸체', 'VIP', '연박·재입', '주의', '당직', '학단 복구'], ign: {} }, extra);
let p = planSync(rows0, st());
ok(p.ops.length === 0, '바뀐 것 없으면 넘길 것 없음 (' + p.ops.length + ')');
// 오더테이커가 앱에서 402 를 가람 → 나래로, 601 미정비 풀고 가람에게
const d2 = JSON.parse(JSON.stringify(doc)); d2.r['402'][1] = '나래'; d2.r['601'] = ['1', '가람', '', '', 0, 0];
p = planSync(_test.makeRows(appData(d2), DAY).rows, st());
const k = p.ops.map(o => o.k + ' ' + o.maid + ' ' + o.room).sort();
ok(k.join(' / ') === ['제외 가람 402', '추가 가람 601', '추가 나래 402'].sort().join(' / '), '바뀐 방만: ' + k.join(' / '));
// 완료된 방은 빼지 않음 · 메이드/관리자가 손으로 바꾼 방은 안 건드림
p = planSync(_test.makeRows(appData(d2), DAY).rows, st({ done: { '402': ['가람'] }, chg: [{ id: 'x1', data: { room: '601' } }] }));
const k2 = p.ops.map(o => o.k + ' ' + o.maid + ' ' + o.room).sort();
ok(!k2.includes('제외 가람 402') && !k2.some(x => x.endsWith('601')) && p.diff.length === 2, '완료 방(402) · 손으로 바꾼 방(601) 보호: ' + k2.join(' / ') + ' · 다른 점 ' + p.diff.map(x => x.room + ' ' + x.why).join(', '));
// 재실로 바뀜 → 표시만
const d3 = JSON.parse(JSON.stringify(doc)); d3.r['401'][0] = '2';
p = planSync(_test.makeRows(appData(d3), DAY).rows, st());
ok(p.ops.length === 1 && p.ops[0].k === '표시' && p.ops[0].room === '401' && p.ops[0].to.tags.includes('재실'), '재실 표시만 넘김');
// ☁ 서버 반영 (11/28): 서버가 live 로 5분 안에 소식 → PC 연결 창은 쉼
const T = Date.parse('2026-11-28T10:00:00+09:00');
ok(srvLiveOf({ runMode: 'live', state: 'ok', at: T - 60e3 }, T) && !srvLiveOf({ runMode: 'shadow', state: 'ok', at: T - 60e3 }, T) && !srvLiveOf({ runMode: 'live', state: 'ok', at: T - 6 * 60e3 }, T) && !srvLiveOf({ runMode: 'live', state: 'off', at: T }, T) && srvLiveOf({ runMode: 'live', state: 'hold', at: { toMillis: () => T } }, T) && !srvLiveOf(null, T),
  '서버 live · 5분 안 → PC 쉼 / 그림자 · 5분 넘음 · off → PC 가 반영');
console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);

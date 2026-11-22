// node test/workstat_test.mjs — 📊 특근 · 공휴일 근무 · OT (소장님 예시 그대로)
import assert from 'assert';
import { workStat, HOL } from '../app/workstat.js';
const mk = (ym, list) => { const d = {}; list.forEach(([k, a]) => d[ym + '-' + String(k).padStart(2, '0')] = { a, d: a }); return d; };
let ok = 0; const t = (n, f) => { f(); ok++; console.log('✓', n); };
// 2026-11: 30일, 토·일 9개
const full = n => Array.from({ length: n }, (_, i) => [i + 1, 9]);
t('11월 보유 휴무 9', () => assert.strictEqual(workStat({}, '2026-11', '2026-12-05').weekend, 9));
t('7일 쉼 → 특근 2 (지난달)', () => { const s = workStat(mk('2026-11', full(23)), '2026-11', '2026-12-05'); assert.strictEqual(s.rest, 7); assert.strictEqual(s.extra, 2); assert.strictEqual(s.fill, 0); });
t('11일 쉼 → 특근 0, 연차로 채울 날 2', () => { const s = workStat(mk('2026-11', full(19)), '2026-11', '2026-12-05'); assert.strictEqual(s.extra, 0); assert.strictEqual(s.fill, 2); });
t('OT: 11·10 → 3', () => assert.strictEqual(workStat(mk('2026-11', [[2, 11], [3, 10]]), '2026-11', '2026-12-05').ot, 3));
t('OT: 11·10·8 → 2', () => assert.strictEqual(workStat(mk('2026-11', [[2, 11], [3, 10], [4, 8]]), '2026-11', '2026-12-05').ot, 2));
t('OT: 8만 쭉 → 0 (마이너스는 0)', () => { const s = workStat(mk('2026-11', full(20).map(([k]) => [k, 8])), '2026-11', '2026-12-05'); assert.strictEqual(s.ot, 0); assert.strictEqual(s.otRaw, -20); });
t('OT: 7유닛 −2', () => assert.strictEqual(workStat(mk('2026-11', [[2, 12], [3, 7]]), '2026-11', '2026-12-05').ot, 1));
t('이번 달(22일까지): 쉰 날 · 남은 휴무, 특근은 아직 0', () => {
  const s = workStat(mk('2026-11', full(16)), '2026-11', '2026-11-22');   // 1~16 출근, 17~21 쉼, 22 오늘 배정 없음
  assert.strictEqual(s.rest, 5); assert.strictEqual(s.left, 4); assert.strictEqual(s.extra, 0);
});
t('공휴일 근무 (2026-10-05 대체 · 10-09 한글날)', () => { const s = workStat(mk('2026-10', [[5, 9], [9, 9], [6, 9]]), '2026-10', '2026-11-01'); assert.deepStrictEqual(s.hol.map(h => h.day), ['2026-10-05', '2026-10-09']); });
t('공휴일 목록 요일 점검 (대체공휴일은 월 · 화)', () => Object.keys(HOL).filter(k => HOL[k] === '대체공휴일').forEach(k => assert.ok([1, 2].includes(new Date(k + 'T00:00:00Z').getUTCDay()), k)));
console.log(ok + '개 통과');

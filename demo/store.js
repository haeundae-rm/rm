// 체험용 가짜 store (2026-11-19, 🔑 플로어키 체험) — rm/app/store.js 와 같은 함수 이름. 진짜 Firebase 에 연결하지 않음
// 누른 기록은 이 휴대폰 창(sessionStorage)에만 남고, 실제 정비 레포트 · 허브에는 아무것도 안 감. 이름은 모두 예시
export const SERVER_TIME = { __server: 1 };
export const kind = 'demo';
const seoul = (t = Date.now()) => new Date(t + 9 * 3600e3);
const DAY = seoul().toISOString().slice(0, 10), YDAY = seoul(Date.now() - 864e5).toISOString().slice(0, 10);
const at = (h, m) => Date.parse(DAY + 'T' + ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2) + ':00+09:00');
const room = r => ({ room: String(r), tags: [], note: '', due: '', after: '', memo: '' });
function seed() {
  const s = {};
  s['days/' + DAY] = { maids: ['체험 메이드', '예시 동료', '예시 메이드'] };
  s['days/' + DAY + '/plans/체험 메이드'] = { rooms: [1201, 1202, 1205, 1301, 1303].map(room) };
  s['days/' + DAY + '/plans/예시 동료'] = { rooms: [1203, 1204, 1206].map(room) };
  s['days/' + DAY + '/plans/예시 메이드'] = { rooms: [2501, 2502].map(room) };
  s['devices/demo'] = { name: '체험 메이드', date: DAY };
  s['meta/keys'] = { from: YDAY, on: true };
  // 어제 12층 A키를 가져가고 [키 반납 완료]를 안 누른 것으로 → 맨 위 '지난번 반납 확인' 안내 체험
  s['days/' + YDAY + '/keys/y1'] = { floor: 12, maid: '체험 메이드', key: 'A', reason: '', by: '본인', who: '', at: at(8, 30) - 864e5, clientAt: at(8, 30) - 864e5, uid: 'demo' };
  s['days/' + DAY + '/keys/d1'] = { floor: 12, maid: '예시 동료', key: 'A', reason: '', by: '본인', who: '', at: at(8, 31), clientAt: at(8, 31), uid: 'x' };
  s['days/' + DAY + '/keys/d2'] = { floor: 25, maid: '예시 메이드', key: 'AB', reason: '', by: '본인', who: '', at: at(8, 35), clientAt: at(8, 35), uid: 'y' };
  s['days/' + DAY + '/keychk/c1'] = { floor: 25, key: 'A', st: 'in', by: '하우스키퍼', at: at(12, 50), clientAt: at(12, 50) };
  return s;
}
const KEY = 'rm_demo_' + DAY;
let D; try { D = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { D = null; }
if (!D) D = seed();
const keep = () => { try { sessionStorage.setItem(KEY, JSON.stringify(D)); } catch (e) {} };
window.__demoReset = () => { try { sessionStorage.removeItem(KEY); Object.keys(localStorage).filter(k => k.indexOf('체험 메이드') >= 0).forEach(k => localStorage.removeItem(k)); } catch (e) {} location.reload(); };
const user = { uid: 'demo', anon: true, email: '' };
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const val = v => (v === SERVER_TIME ? Date.now() : v instanceof Date ? v.getTime() : Array.isArray(v) ? v.map(val) : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) : v);
const deep = (a, b) => { const o = isObj(a) ? Object.assign({}, a) : {}; Object.keys(b).forEach(k => { o[k] = isObj(b[k]) && isObj(o[k]) ? deep(o[k], b[k]) : b[k]; }); return o; };
const LS = [];
const fire = () => { keep(); setTimeout(() => LS.forEach(f => f()), 0); };
const match = (d, w) => w.every(([k, op, v]) => { const x = d[k]; return op === '==' ? x === v : op === '>=' ? x >= v : op === '>' ? x > v : op === 'in' ? v.includes(x) : op === 'array-contains' ? (x || []).includes(v) : true; });
const kids = c => Object.keys(D).filter(p => p.startsWith(c + '/') && p.split('/').length === c.split('/').length + 1);
const copy = x => JSON.parse(JSON.stringify(x));
export function onUser(cb) { setTimeout(() => cb(user), 0); return () => {}; }
export async function signInEmail() { throw Object.assign(new Error('체험 화면에서는 관리자 로그인이 안 돼요'), { code: 'demo' }); }
export async function signOut() {}
export async function signInAnon() {}
export async function idToken() { throw new Error('체험 화면에서는 안 돼요'); }
export async function get(p) { return D[p] ? copy(D[p]) : null; }
export async function getQuery(c, w) { return kids(c).filter(p => match(D[p], w || [])).map(p => ({ id: p.split('/').pop(), data: copy(D[p]) })); }
export async function count(c, w) { return kids(c).filter(p => match(D[p], w || [])).length; }
export async function set(p, d) { if (/^errors\//.test(p)) return; D[p] = val(d); fire(); }
export async function merge(p, d) { D[p] = deep(D[p], val(d)); fire(); }
export function add(c, d) { const id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); set(c + '/' + id, d); return { id, done: Promise.resolve() }; }
export async function del(p) { delete D[p]; fire(); }
export function listenDoc(p, cb) { const f = () => cb(D[p] ? copy(D[p]) : null, { fromCache: false, pending: false }); setTimeout(f, 0); LS.push(f); return () => { const i = LS.indexOf(f); if (i >= 0) LS.splice(i, 1); }; }
export function listenQuery(c, w, cb) { const f = () => getQuery(c, w).then(r => cb(r.map(x => Object.assign(x, { pending: false })), { fromCache: false, pending: 0 })); f(); LS.push(f); return () => { const i = LS.indexOf(f); if (i >= 0) LS.splice(i, 1); }; }

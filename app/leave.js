// leave.js — 룸메이드 연차 계산·신청서 양식 (Apps Script Leave.gs 에서 그대로 옮김, 2026-11-18)
// 화면·저장소와 무관한 순수 계산만 둠 → 정비 레포트 '내 근무'(메이드)와 허브 '연차 관리'(관리자)가 같이 씀
// 날짜는 문자열 'yyyy-MM-dd' 로만 다룸 (시간대 문제 없음)

export const KINDS = ['연차', '무급', '지급', '조정'];
export const RANK = '룸메이드';            // 신청서 '직급' 칸
export const COMPANY = '한화리조트 해운대'; // 신청서 '업체명' 칸
export const BUSY = 3;                     // 같은 날 이만큼 쉬면(대기+승인) '몰리는 날' 안내
export const BACK_DAYS = 31;               // 지난 날짜는 31일 전까지만 (병가 사후 신청)
export const AHEAD_DAYS = 180;             // 앞으로 6개월까지
export const MAX_DAYS = 31;                // 한 번에 최대 31일
export const REASONS = { '연차': ['개인사정', '가족 행사', '병원 진료', '경조사'], '무급': ['병가', '개인사정'] };

const p2 = n => ('0' + n).slice(-2);
export const r1 = n => Math.round(n * 10) / 10;

// 한국 시각 기준 오늘 'yyyy-MM-dd'
export function today(now) {
  const t = new Date((now || Date.now()) + 9 * 36e5);
  return t.getUTCFullYear() + '-' + p2(t.getUTCMonth() + 1) + '-' + p2(t.getUTCDate());
}
export function ymd(v) {
  if (v instanceof Date) return today(v.getTime());
  const m = String(v || '').trim().match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return m ? m[1] + '-' + p2(m[2]) + '-' + p2(m[3]) : '';
}
export function ym(v) {
  if (v instanceof Date) return today(v.getTime()).slice(0, 7);
  const m = String(v || '').trim().match(/^(\d{4})\D+(\d{1,2})/);
  return m ? m[1] + '-' + p2(m[2]) : '';
}
/** 입사일 + n개월 (같은 날짜가 없으면 그다음 달 1일) */
export function addMonths(d, n) {
  const p = d.split('-').map(Number);
  let y = p[0], mo = p[1] + n;
  y += Math.floor((mo - 1) / 12); mo = (mo - 1) % 12 + 1;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (p[2] > last) { mo += 1; if (mo > 12) { mo = 1; y += 1; } return y + '-' + p2(mo) + '-01'; }
  return y + '-' + p2(mo) + '-' + p2(p[2]);
}
export function yearDays(n) { return Math.min(25, 15 + Math.floor((n - 1) / 2)); }
/** 발생 연차: { monthly, annual, total, years, next: {date, n, kind} } */
export function gen(hire, asOf, minus) {
  if (!hire) return { monthly: 0, annual: 0, total: 0, years: 0, next: null };
  let monthly = 0;
  for (let k = 1; k <= 11; k++) if (addMonths(hire, k) <= asOf) monthly = k;
  let annual = 0, n = 1;
  while (addMonths(hire, 12 * n) <= asOf) { annual += yearDays(n); n++; }
  const years = n - 1;
  let next;
  if (years === 0 && monthly < 11) next = { date: addMonths(hire, monthly + 1), n: 1, kind: '월차' };
  else next = { date: addMonths(hire, 12 * n), n: yearDays(n), kind: n + '년 근속' };
  const mEff = Math.max(0, monthly - (Number(minus) || 0));
  return { monthly: mEff, annual, total: mEff + annual, years, next };
}
/** 한 사람의 연차기록 합계. recs = [{ym, days, kind}] */
export function sumRecs(recs, year) {
  const o = { used: 0, unpaid: 0, paid: 0, months: {}, yUsed: {}, yUnpaid: 0 };
  (recs || []).forEach(x => {
    if (KINDS.indexOf(x.kind) < 0 || !x.ym) return;
    const mo = o.months[x.ym] = o.months[x.ym] || { used: 0, unpaid: 0 };
    if (x.kind === '연차' || x.kind === '조정') { o.used += x.days; mo.used += x.days; if (year && x.ym.slice(0, 4) === year) o.yUsed[x.ym] = (o.yUsed[x.ym] || 0) + x.days; }
    else if (x.kind === '무급') { o.unpaid += x.days; mo.unpaid += x.days; if (year && x.ym.slice(0, 4) === year) o.yUnpaid += x.days; }
    else if (x.kind === '지급') o.paid += x.days;
  });
  return o;
}
/** 잔여 = 발생 − 사용(연차+조정) − 회사 지급 */
export function balance(person, recs, asOf) {
  const g = gen(person.hire, asOf, person.minus), s = sumRecs(recs, asOf.slice(0, 4));
  return { gen: r1(g.total), monthly: g.monthly, annual: g.annual, years: g.years, next: g.next,
    used: r1(s.used), unpaid: r1(s.unpaid), paid: r1(s.paid), remain: r1(g.total - s.used - s.paid),
    months: s.months, yUsed: s.yUsed, yUnpaid: r1(s.yUnpaid) };
}

// ---------- 신청서
export function addDays(d, n) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
export function diff(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); }
export function md(d) { return Number(d.slice(5, 7)) + '/' + Number(d.slice(8)); }
/** 신청 일수를 달별로 나눔. 일수 = 달력 일수면 달마다 그대로, 줄였으면 앞 날짜부터 채움 */
export function split(s, e, days) {
  const out = {}; let left = Number(days) || 0;
  for (let d = s; d <= e && left > 0; d = addDays(d, 1)) { const v = Math.min(1, left); out[d.slice(0, 7)] = (out[d.slice(0, 7)] || 0) + v; left = r1(left - v); }
  return out;
}
/** 다른 사람 쉬는 수 (날짜 → 명). 이름은 안 돌려줌. apps = 현재 상태 목록 */
export function busyMap(apps, except, day) {
  const from = addDays(day, -BACK_DAYS), to = addDays(day, AHEAD_DAYS), out = {};
  (apps || []).forEach(a => {
    if (a.name === except || (a.status !== '대기' && a.status !== '승인')) return;
    for (let d = a.start > from ? a.start : from; d <= a.end && d <= to; d = addDays(d, 1)) out[d] = (out[d] || 0) + 1;
  });
  return out;
}
/** 신청 내용 확인·정리 (미리보기와 제출이 같은 규칙). mine = 이 사람의 현재 신청 목록 */
export function clean(x, mine, day) {
  x = x || {};
  const kind = String(x.kind || '');
  if (kind !== '연차' && kind !== '무급') throw new Error('연차인지 무급인지 골라 주세요.');
  const s = ymd(x.start), e = ymd(x.end) || s;
  if (!s) throw new Error('쉬는 날짜를 골라 주세요.');
  if (e < s) throw new Error('끝나는 날짜가 시작 날짜보다 빨라요.');
  const cal = diff(s, e) + 1;
  if (cal > MAX_DAYS) throw new Error('한 번에 ' + MAX_DAYS + '일까지 신청할 수 있어요.');
  if (s < addDays(day, -BACK_DAYS)) throw new Error('한 달보다 지난 날짜는 소장님께 직접 말씀해 주세요.');
  if (s > addDays(day, AHEAD_DAYS)) throw new Error('6개월 뒤 날짜까지만 신청할 수 있어요.');
  const half = s === e && (x.half === 'am' || x.half === 'pm') ? x.half : '';
  const days = half ? 0.5 : Number(x.days === undefined || x.days === null || x.days === '' ? cal : x.days);
  if (isNaN(days) || days < 0.5 || days > cal || Math.round(days * 2) !== days * 2) throw new Error('일수를 확인해 주세요. (0.5 ~ ' + cal + '일)');
  let reason = String(x.reason || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 40);
  if (!reason) reason = REASONS[kind][0];
  if (half) reason += half === 'am' ? ' (오전 반차)' : ' (오후 반차)';
  const phone = String(x.phone || '').replace(/[^0-9-]/g, '').slice(0, 20);
  if (phone.replace(/\D/g, '').length < 9) throw new Error('연락처를 적어 주세요. (예: 010-1234-5678)');
  const dup = (mine || []).filter(a => (a.status === '대기' || a.status === '승인') && !(a.end < s || a.start > e))[0];
  if (dup) throw new Error('이미 신청한 날짜와 겹쳐요 (' + md(dup.start) + (dup.end !== dup.start ? '~' + md(dup.end) : '') + '). 먼저 그 신청을 취소해 주세요.');
  return { kind, start: s, end: e, days, reason, phone, half, cal };
}
/** 서명: 손가락으로 그린 선 (SVG path 'M x y L x y …', 300×120 칸) */
export function sign(v) {
  const s = String(v || '').replace(/[^ML0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  if (s.length < 8 || s[0] !== 'M' || (s.match(/L/g) || []).length < 3) throw new Error('서명 칸에 이름을 써 주세요.');
  if (s.length > 30000) throw new Error('서명이 너무 길어요. 다시 써 주세요.');
  return s;
}
/** 경고 (막지는 않음): 남은 연차 부족, 몰리는 날 */
export function warn(c, remain, busy) {
  const w = [];
  if (c.kind === '연차' && c.days > remain) w.push('남은 연차는 ' + remain + '개예요. 모자란 만큼은 무급이 될 수 있어요. 소장님이 확인해요.');
  let top = 0, at = '';
  for (let d = c.start; d <= c.end; d = addDays(d, 1)) if (((busy || {})[d] || 0) > top) { top = busy[d]; at = d; }
  if (top >= BUSY) w.push(md(at) + '에는 이미 ' + top + '명이 쉬어요. 소장님과 먼저 이야기해 주세요.');
  return w;
}

// ---------- 회사 양식 (UNIES 휴가신청서 그대로 — Leave.gs laFormHtml_ · LA_CSS 와 같은 모양)
export function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function dot(d) { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? m[1] + '. ' + Number(m[2]) + '. ' + Number(m[3]) + '.' : esc(d); }
function ko(d, withYear) { return (withYear ? Number(d.slice(0, 4)) + '년 ' : '') + Number(d.slice(5, 7)) + '월 ' + Number(d.slice(8)) + '일'; }
function signSvg(path) {
  return path ? '<svg viewBox="0 0 300 120" preserveAspectRatio="xMidYMid meet"><path d="' + esc(path) + '" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '';
}
const msDay = v => (typeof v === 'number' ? today(v) : v ? ymd(new Date(v)) : '');
/** a = 신청 {id, at(ms), name, status, kind, reason, start, end, days, asked, phone, sign, memo, decided(ms)}, p = 사람 {emp, hire, birth} */
export function formHtml(a, p) {
  p = p || {};
  const ill = a.kind === '무급' && /병가/.test(a.reason);
  const title = a.kind === '연차' ? '(연 차)' : ill ? '(무 급 병 가)' : '(무 급)';
  const y1 = a.start.slice(0, 4), sameY = a.end.slice(0, 4) === y1;
  const period = a.start === a.end ? ko(a.start, true) : ko(a.start, true) + ' ~ ' + ko(a.end, !sameY);
  const sub = msDay(a.at) || today();
  const dd = msDay(a.decided);
  let stamp = '';
  if (a.status === '승인') stamp = '<div class="lf-stamp"><b>승 인</b><span>현장소장</span><i>' + dot(dd).replace(/\.$/, '') + '</i></div>';
  else if (a.status === '반려') stamp = '<div class="lf-stamp no"><b>반 려</b><span>현장소장</span><i>' + dot(dd).replace(/\.$/, '') + '</i></div>';
  const mark = a.status === '미리보기' ? '<div class="lf-wm">미리보기</div>' : a.status === '대기' ? '<div class="lf-wm">승인 대기</div>' : a.status === '취소' ? '<div class="lf-wm">취소됨</div>' : '';
  return '<div class="lf-page">' + mark +
    '<h1 class="lf-title"><u>' + title + '</u>&nbsp; 휴 가 신 청 서</h1>' +
    '<table class="lf-box lf-r"><tr><th rowspan="2" class="lf-v">결<br><br>재</th><th>담 &nbsp;당</th><th>부 문 장</th><th>대표이사</th></tr><tr class="lf-s"><td></td><td></td><td></td></tr></table>' +
    '<table class="lf-box lf-l"><tr><th rowspan="2" class="lf-v">협<br><br>조</th><th>담 &nbsp;당</th><th>지 사 장</th><th>부 문 장</th></tr><tr class="lf-s"><td></td><td></td><td></td></tr></table>' +
    '<table class="lf-main"><colgroup><col style="width:14%"><col style="width:28%"><col style="width:13%"><col style="width:14%"><col style="width:31%"></colgroup>' +
    '<tr><th>업 &nbsp;체 &nbsp;명</th><td colspan="2">' + esc(COMPANY) + '</td><th>직 &nbsp; &nbsp; &nbsp;급</th><td>' + esc(RANK) + '</td></tr>' +
    '<tr><th>사 &nbsp; &nbsp; &nbsp;번</th><td colspan="2">' + esc(p.emp || '') + '</td><th>성 &nbsp; &nbsp; &nbsp;명</th><td class="lf-nm">' + esc(a.name) + '</td></tr>' +
    '<tr><th>입 사 일 자</th><td colspan="2">' + dot(p.hire || '') + '</td><th>생 년 월 일</th><td>' + dot(p.birth || '') + '</td></tr>' +
    '<tr><th>사 &nbsp; &nbsp; &nbsp;유</th><td colspan="4">' + esc(a.reason) + '</td></tr>' +
    '<tr class="lf-tall"><th>기 &nbsp; &nbsp; &nbsp;간</th><td>' + period + '</td><td>( ' + esc(a.days) + ' )일간</td><th>연 &nbsp;락 &nbsp;처</th><td>' + esc(a.phone) + '</td></tr>' +
    '</table>' +
    '<div class="lf-body"><p class="lf-msg">상기와 같은 사유로 휴가를 신청 하오니 승인하여 주시기 바랍니다.</p>' + stamp +
    '<div class="lf-sub"><div class="lf-date">' + ko(sub, true) + '</div>' +
    '<div class="lf-by">제출인 : <span class="lf-who">' + esc(a.name) + '</span><span class="lf-in">(인)<span class="lf-sign">' + signSvg(a.sign) + '</span></span></div></div></div>' +
    '<div class="lf-to">주식회사 유니에스 귀하</div>' +
    (a.id ? '<div class="lf-id">전자 신청 ' + esc(a.id) + (a.status === '승인' && a.asked !== a.days ? ' · 신청 ' + a.asked + '일 → 승인 ' + a.days + '일' : '') + (a.status === '반려' && a.memo ? ' · 반려 사유: ' + esc(a.memo) : '') + '</div>' : '') +
    '</div>';
}
export const CSS = [
  '.lf-page{position:relative;box-sizing:border-box;width:210mm;height:297mm;padding:16mm 15mm 12mm;background:#fff;color:#111;font-family:"Malgun Gothic","맑은 고딕","Noto Sans KR","Apple SD Gothic Neo",sans-serif;overflow:hidden}',
  '.lf-page *{box-sizing:border-box}',
  '.lf-title{margin:4mm 0 9mm;text-align:center;font-size:25pt;font-weight:800;letter-spacing:2px}',
  '.lf-title u{text-underline-offset:5px;text-decoration-thickness:2px}',
  '.lf-box{border-collapse:collapse;width:96mm;font-size:10pt;table-layout:fixed}',
  '.lf-box th,.lf-box td{border:1px solid #222;text-align:center;font-weight:600;padding:0}',
  '.lf-box th{height:8mm}',
  '.lf-box th.lf-v{width:10mm;line-height:1.1}',
  '.lf-box .lf-s td{height:17mm}',
  '.lf-r{margin-left:auto}',
  '.lf-l{margin-top:7mm;border-bottom:0}',
  '.lf-main{border-collapse:collapse;width:100%;font-size:10.5pt;table-layout:fixed}',
  '.lf-main th,.lf-main td{border:1px solid #222;height:9.5mm;text-align:center;padding:0 2mm}',
  '.lf-main th{font-weight:700;white-space:nowrap}',
  '.lf-main td{font-weight:500}',
  '.lf-main td.lf-nm{font-weight:800;font-size:12pt}',
  '.lf-main tr.lf-tall th,.lf-main tr.lf-tall td{height:14mm}',
  '.lf-body{position:relative;border:1px solid #222;border-top:0;height:112mm}',
  '.lf-msg{margin:0;padding:14mm 0 0;text-align:center;font-size:11.5pt;font-weight:600}',
  '.lf-sub{position:absolute;right:12mm;bottom:12mm;text-align:right;font-size:11pt;font-weight:600}',
  '.lf-date{margin-bottom:7mm;font-weight:700}',
  '.lf-by{display:flex;align-items:center;gap:3mm;justify-content:flex-end}',
  '.lf-who{min-width:26mm;text-align:center;font-size:13pt;font-weight:800}',
  '.lf-in{position:relative;display:inline-block;width:14mm;text-align:center}',
  '.lf-sign{position:absolute;left:50%;top:50%;width:30mm;height:14mm;transform:translate(-50%,-50%);pointer-events:none}',
  '.lf-sign svg{width:100%;height:100%;display:block}',
  '.lf-stamp{position:absolute;left:14mm;bottom:12mm;width:30mm;height:30mm;border:2.5px solid #C62828;border-radius:50%;color:#C62828;display:flex;flex-direction:column;align-items:center;justify-content:center;transform:rotate(-10deg);box-shadow:inset 0 0 0 2px #fff,inset 0 0 0 3.5px #C62828;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
  '.lf-stamp b{font-size:15pt;font-weight:900;letter-spacing:1px}',
  '.lf-stamp span{font-size:8.5pt;font-weight:700;margin-top:1mm}',
  '.lf-stamp i{font-style:normal;font-size:8pt;font-weight:700;margin-top:.5mm}',
  '.lf-stamp.no{border-color:#666;color:#666;box-shadow:inset 0 0 0 2px #fff,inset 0 0 0 3.5px #666}',
  '.lf-to{margin-top:6mm;text-align:right;font-size:17pt;font-weight:800;letter-spacing:1px}',
  '.lf-id{position:absolute;left:15mm;bottom:7mm;font-size:7.5pt;color:#888}',
  '.lf-wm{position:absolute;left:0;right:0;top:46%;text-align:center;font-size:58pt;font-weight:900;color:rgba(31,95,168,.10);transform:rotate(-18deg);pointer-events:none}'
].join('\n');

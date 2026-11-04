// 내 근무 · 연차 신청 (새 앱) — 화면은 지금 앱 MyWork.html 그대로, 서버는 기존 Apps Script(MyWorkApi.gs → Leave.gs)
// 본인 확인: Firebase 로그인 표(idToken) → Apps Script 가 등록 이름 확인. 내 근무 비밀번호 4자리는 지금처럼
export function setupMyWork(ctx) {
  const { esc, lsGet, lsSet, toast, vibe } = ctx;
  const $ = s => document.querySelector(s);
  let mw = null, mwBusy = false, news = 0, newsAsked = false;
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const me = () => ctx.me();
  const dlg = () => ctx.dlg();
  function tkKey() { return 'rm_mw_tok_' + (me() || ''); }
  function getTok() { const t = lsGet(tkKey()) || ''; const p = t.split('|'); return p.length === 3 && Number(p[1]) > Date.now() ? t : ''; }
  // 기존 앱의 mwRun 과 같은 모양 (fn, 인자, 성공, 실패) — 첫 인자(dev)는 서버가 로그인 표로 채움
  function mwRun(fn, args, ok, fail) {
    mwBusy = true;
    ctx.call(fn, args).then(x => { mwBusy = false; ok(x); }).catch(e => {
      mwBusy = false;
      const m = String(e && e.message || e).replace(/^(Exception|Error):\s*/, '');
      if (m.indexOf('MWLOCK:') >= 0 && mw) { lsSet(tkKey(), null); mw.stage = 'pin'; mw.step = 'enter'; mw.err = ''; mwDraw(); focusPin(); return; }
      (fail || function () { if (mw) { mw.err = m; mwDraw(); } })(m.replace(/^.*?MWLOCK:/, ''));
    });
  }
  // ---------- 버튼 (정비 화면이 다시 그려질 때마다 app.js 가 부름)
  function seenKey() { return 'rm_lv_seen_' + (me() || ''); }
  function askNews(force) {
    if (!me() || ctx.isAdm() || (newsAsked && !force)) return;
    newsAsked = true;
    ctx.call('myLeaveNews', []).then(r => { news = r && r.last || 0; inject(); }).catch(() => {});
  }
  function inject() {
    const bar = document.querySelector('#bar .mebar');
    if (!bar || !me() || ctx.isAdm()) return;
    let b = bar.querySelector('.mw-btn');
    if (!b) { bar.insertAdjacentHTML('beforeend', '<button class="mw-btn" data-mw="open">📅 내 근무</button>'); b = bar.querySelector('.mw-btn'); }
    const dot = news > Number(lsGet(seenKey()) || 0), has = !!b.querySelector('.dot');
    if (dot && !has) b.insertAdjacentHTML('beforeend', '<span class="dot" aria-label="연차 신청 결과가 나왔어요"></span>');
    if (!dot && has) b.querySelector('.dot').remove();
    askNews(false);
  }
  // ---------- 열기·닫기
  function open() {
    if (!me()) return;
    ctx.setDlg({ kind: 'mywork' }); mw = { stage: 'load', ym: '', err: '' }; mwDraw();
    mwRun('myWorkHello', [], h => {
      mw.hello = h;
      if (getTok()) load(''); else { mw.stage = 'pin'; mw.step = h.hasPin ? 'enter' : 'new1'; mwDraw(); focusPin(); }
    }, m => { mw.stage = 'msg'; mw.err = m; mwDraw(); });
  }
  function load(ym) {
    mw.stage = mw.data ? 'view' : 'load'; mw.loading = true; mwDraw();
    mwRun('myWork', [getTok(), ym], d => { mw.data = d; mw.ym = d.ym; mw.stage = 'view'; mw.loading = false; mw.err = ''; markSeen(); mwDraw(); },
      m => { mw.loading = false; mw.err = m; if (!mw.data) mw.stage = 'msg'; mwDraw(); });
  }
  function markSeen() {
    const L = mw && mw.data && mw.data.leave; let t = 0;
    ((L && L.apps) || []).forEach(a => { if ((a.status === '승인' || a.status === '반려') && a.decided) t = Math.max(t, Date.parse(a.decided) || 0); });
    if (t && t > Number(lsGet(seenKey()) || 0)) lsSet(seenKey(), String(t));
    if (t >= news) { news = 0; inject(); }
  }
  function toView() { mw.stage = 'view'; mw.err = ''; mw.f = null; mw.pv = null; mwDraw(); const el = document.querySelector('.mw'); if (el) el.scrollTop = 0; }
  function focusPin() { setTimeout(() => { const f = document.getElementById('mwpin'); if (f) f.focus(); }, 50); }
  // 뒤로가기·닫기: 신청서 쓰는 중이면 내 근무로만 돌아감 → true 를 돌려주면 app.js 는 창을 닫지 않음
  function back() { if (mw && /^(apply|sign|form|done)$/.test(mw.stage)) { if (!mwBusy) toView(); return true; } return false; }
  function closed() { mw = null; askNews(true); }
  // ---------- 그리기
  function mwDraw() {
    const el = $('#sheet');
    if (!dlg() || dlg().kind !== 'mywork' || !mw) { return; }
    const y0 = el.querySelector('.mw') && mw.keepY !== false ? el.querySelector('.mw').scrollTop : 0;
    const inForm = /^(apply|sign|form|done)$/.test(mw.stage);
    const top = '<div class="mw-top"><b>' + esc(me() || '') + ' 님 ' + (inForm ? (mw.stage === 'form' ? '신청서' : '휴가 신청') : '내 근무') + '</b>' +
      (inForm ? '<button data-mw="back">← 내 근무</button>' : '<button data-x="1">← 오늘 정비</button>') + '</div>';
    let body = '';
    if (mw.stage === 'load') body = '<div class="mw-load">불러오는 중…</div>';
    else if (mw.stage === 'msg') body = '<div class="mw-card"><p style="margin:0;font-size:16px">' + esc(mw.err) + '</p></div>';
    else if (mw.stage === 'pin') body = pinHtml();
    else if (mw.stage === 'apply') body = applyHtml();
    else if (mw.stage === 'sign') body = signHtml();
    else if (mw.stage === 'form') body = formHtml();
    else if (mw.stage === 'done') body = doneHtml();
    else body = viewHtml();
    el.innerHTML = '<div class="mw">' + top + '<div class="mw-body">' + body + '</div></div>';
    if (y0) el.querySelector('.mw').scrollTop = y0;
    mw.keepY = true;
    if (mw.stage === 'sign' || mw.stage === 'form') { fitPaper(); if (mw.stage === 'sign') padInit(); }
  }
  function pinHtml() {
    const s = mw.step, t = s === 'new1' ? '내 근무 비밀번호를 정해 주세요' : s === 'new2' ? '한 번 더 눌러 주세요' : '내 근무 비밀번호';
    const p = s === 'new1' ? '처음 한 번만 정해요. 숫자 4자리를 넣어 주세요.' : s === 'new2' ? '방금 정한 숫자 4자리를 다시 넣어 주세요.' : '숫자 4자리를 넣어 주세요.';
    const days = mw.hello && mw.hello.days;
    return '<div class="mw-card mw-pin"><h3>' + t + '</h3><p>' + p + '</p>' +
      '<input id="mwpin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off">' +
      '<div class="err">' + esc(mw.err || '') + '</div>' +
      '<button class="go" data-mw="pin" disabled>' + (mwBusy ? '확인 중…' : '확인') + '</button>' +
      '<p style="font-size:14px">' + (days ? '이 휴대폰에서는 ' + days + '일 동안 다시 묻지 않아요.<br>' : '') + '잊어버리면 소장님께 말씀해 주세요. 초기화해 드려요.</p></div>';
  }
  function viewHtml() {
    const d = mw.data, a = d.ym.split('-').map(Number), M = a[1]; let h = '';
    const prevOk = monthsBack(d.ym, d.thisYm) < 6, nextOk = d.ym < d.thisYm;
    h += '<div class="mw-card"><div class="mw-mon"><button data-mw="prev"' + (prevOk && !mw.loading ? '' : ' disabled') + ' aria-label="지난달">‹</button><b>' + a[0] + '년 ' + M + '월</b><button data-mw="next"' + (nextOk && !mw.loading ? '' : ' disabled') + ' aria-label="다음 달">›</button></div>' +
      '<div style="margin-top:12px"><div class="mw-big">' + M + '월 출근 ' + d.sum.days + '일</div><div class="mw-sub">완료 ' + fmt(d.sum.d) + '실 · 배정 ' + fmt(d.sum.a) + '실</div></div>' + calHtml(d, a[0], M) +
      (d.since && d.since.slice(0, 7) >= d.ym ? '<p class="mw-note">앱 기록은 ' + Number(d.since.slice(5, 7)) + '월 ' + Number(d.since.slice(8)) + '일부터 있어요. 그 전 근무는 보이지 않아요.</p>' : '') +
      '<p class="mw-note">완료 = 앱에서 정비 완료를 누른 객실 (로얄은 2실). 종이 레포트로 하신 날은 배정만 보여요. 정확한 근무 일수·유닛은 월 결산 기준이에요. 오늘 기록은 1~2분 늦게 들어와요.</p>' +
      (mw.err ? '<p class="mw-note" style="color:var(--warn-red);font-weight:700">' + esc(mw.err) + '</p>' : '') + '</div>';
    const L = d.leave;
    if (L) {
      h += '<div class="mw-card" id="mw-leave"><h3>내 연차</h3><div class="mw-rem"><span class="u">남은 연차</span><span class="n' + (L.remain <= 0 ? ' neg' : '') + '">' + fmt(L.remain) + '</span><span class="u">개</span></div>' +
        '<div class="mw-facts"><div><b>' + fmt(L.gen) + '</b><span>생긴 연차</span></div><div><b>' + fmt(L.used) + '</b><span>쓴 연차</span></div><div><b>' + (L.paid ? fmt(L.paid) : '0') + '</b><span>회사 지급</span></div></div>' +
        (L.next ? '<div class="mw-next">🌱 ' + kDate(L.next.date) + '에 연차 ' + L.next.n + '개가 새로 생겨요</div>' : '') +
        (L.pre ? '<div class="mw-pre">연차 선지급제 · 매달 1개는 급여로 정산돼요</div>' : '') +
        '<div class="mw-mons">' + yearMonths(L) + '</div>' +
        (L.unpaid ? '<p class="mw-note">올해 무급 휴무 ' + fmt(L.unpaid) + '일</p>' : '') +
        '<p class="mw-note">' + Number(d.today.slice(5, 7)) + '월 ' + Number(d.today.slice(8)) + '일 기준 · 이번 달 사용분은 월말에 반영돼요. 숫자가 이상하면 소장님께 말씀해 주세요.</p>' +
        (L.apps && L.canApply ? '<button class="mw-apply" data-mw="apply">✍ 연차 · 무급 휴가 신청하기</button>' : '') +
        appsHtml(L.apps || []) + '</div>';
    } else h += '<div class="mw-card"><h3>내 연차</h3><p class="mw-note" style="margin:0">연차 정보가 아직 연결되지 않았어요. 소장님께 문의해 주세요.</p></div>';
    h += '<button class="mw-lock" data-mw="lock">이 휴대폰에서 내 근무 잠그기</button>';
    return h;
  }
  const ST = { '대기': ['wait', '승인 기다리는 중'], '승인': ['ok', '승인 ✔'], '반려': ['no', '반려'], '취소': ['off', '취소함'] };
  function appsHtml(list) {
    if (!list.length) return '';
    return '<div class="mw-apps"><h4>내 신청</h4>' + list.slice(0, 8).map(a => {
      const s = ST[a.status] || ['off', a.status], cls = s[0] === 'ok' ? ' ok' : s[0] === 'no' ? ' no' : s[0] === 'off' ? ' off' : '';
      const xb = a.status === '승인' ? '' : mw.askDel === a.id ? '<button class="mw-x ask" data-mw="del" data-id="' + esc(a.id) + '">한 번 더 누르면 지워져요</button>' : '<button class="mw-x" data-mw="del" data-id="' + esc(a.id) + '" aria-label="이 신청 지우기">✕</button>';
      return '<div class="mw-app' + cls + '">' + xb + '<div class="l1"><span class="mw-kd' + (a.kind === '무급' ? ' u' : '') + '">' + esc(a.kind) + '</span><b>' + range(a.start, a.end) + '</b><span class="mw-st ' + s[0] + '">' + s[1] + '</span></div>' +
        '<div class="l2">' + fmt(a.days) + '일 · ' + esc(a.reason) + (a.status === '승인' && a.days !== a.asked ? ' · 신청 ' + fmt(a.asked) + '일 → ' + fmt(a.days) + '일로 승인' : '') + '</div>' +
        (a.status === '반려' && a.memo ? '<div class="l3">반려 사유: ' + esc(a.memo) + '</div>' : '') +
        '<div class="row"><button data-mw="see" data-id="' + esc(a.id) + '">신청서 보기</button>' + (a.status === '대기' ? (mw.askCancel === a.id ? '<button data-mw="cancel" data-id="' + esc(a.id) + '" style="border-color:var(--warn-red);background:var(--warn-red);color:#fff">한 번 더 누르면 취소돼요</button>' : '<button data-mw="cancel" data-id="' + esc(a.id) + '">신청 취소</button>') : '') + '</div></div>';
    }).join('') + '</div>';
  }
  function calHtml(d, y, M) {
    const first = new Date(y, M - 1, 1).getDay(), last = new Date(y, M, 0).getDate(); let h = '<div class="mw-cal">';
    WD.forEach((w, i) => { h += '<div class="h' + (i === 0 ? ' sun' : '') + '">' + w + '</div>'; });
    for (let i = 0; i < first; i++) h += '<div class="c none"></div>';
    for (let k = 1; k <= last; k++) {
      const ds = y + '-' + ('0' + M).slice(-2) + '-' + ('0' + k).slice(-2), o = d.days[ds], dw = (first + k - 1) % 7;
      const cls = 'c' + (dw === 0 ? ' sun' : '') + (o ? ' work' : '') + (ds === d.today ? ' today' : '') + (!o && d.since && ds < d.since ? ' before' : '');
      h += '<div class="' + cls + '"><span class="d">' + k + '</span>' + (o ? '<small>완료 ' + fmt(o.d) + '</small><small class="a">배정 ' + fmt(o.a) + '</small>' : '') + '</div>';
    }
    return h + '</div>';
  }
  function yearMonths(L) { let h = ''; const lastM = Number(mw.data.today.slice(5, 7)); for (let m = 1; m <= lastM; m++) { const v = L.months[L.year + '-' + ('0' + m).slice(-2)] || 0; h += '<span class="' + (v ? '' : 'z') + '">' + m + '월 ' + fmt(v) + '</span>'; } return h; }
  function fmt(v) { return String(Math.round(Number(v || 0) * 10) / 10); }
  function kDate(s) { const p = s.split('-').map(Number); return p[0] + '년 ' + p[1] + '월 ' + p[2] + '일'; }
  function wk(s) { const p = s.split('-').map(Number); return WD[new Date(p[0], p[1] - 1, p[2]).getDay()]; }
  function md(s) { const p = s.split('-').map(Number); return p[1] + '월 ' + p[2] + '일(' + wk(s) + ')'; }
  function range(s, e) { return s === e ? md(s) : md(s) + ' ~ ' + md(e); }
  function monthsBack(ym, now) { return (Number(now.slice(0, 4)) - Number(ym.slice(0, 4))) * 12 + Number(now.slice(5)) - Number(ym.slice(5)); }
  function shift(ym, n) { const a = ym.split('-').map(Number); a[1] += n; while (a[1] < 1) { a[1] += 12; a[0]--; } while (a[1] > 12) { a[1] -= 12; a[0]++; } return a[0] + '-' + ('0' + a[1]).slice(-2); }
  function addD(s, n) { const t = new Date(s + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
  function calDays(s, e) { return Math.round((Date.parse(e + 'T00:00:00Z') - Date.parse(s + 'T00:00:00Z')) / 864e5) + 1; }

  // ---------- 신청서 쓰기
  function startApply() {
    const L = mw.data.leave;
    mw.f = { kind: L.remain > 0 ? '연차' : '무급', multi: false, start: '', end: '', half: '', days: 1, touched: false, reason: '', custom: '', phone: L.phone || '' };
    mw.f.reason = L.reasons[mw.f.kind][0];
    mw.stage = 'apply'; mw.err = ''; mw.keepY = false; mwDraw();
  }
  function fCal() { const f = mw.f; return f.start && (!f.multi || f.end >= f.start) ? (f.multi ? calDays(f.start, f.end || f.start) : 1) : 0; }
  function fDays() { const f = mw.f; if (!f.multi) return f.half ? 0.5 : 1; const c = fCal(); return f.touched ? Math.min(f.days, c) : c; }
  function applyHtml() {
    const f = mw.f, L = mw.data.leave, t = mw.data.today, cal = fCal(), days = fDays(), reasons = L.reasons[f.kind] || [];
    const min = addD(t, -31), max = addD(t, 180); let h = '';
    h += '<div class="mw-card"><p class="mw-q">① 무엇으로 쉬나요?</p><div class="mw-seg">' +
      '<button data-mw="kind" data-v="연차" aria-pressed="' + (f.kind === '연차') + '">연차<small>남은 ' + fmt(L.remain) + '개</small></button>' +
      '<button data-mw="kind" data-v="무급" aria-pressed="' + (f.kind === '무급') + '">무급 휴가<small>병가 등</small></button></div>' +
      (f.kind === '연차' && L.remain <= 0 ? '<p class="mw-note" style="color:var(--warn-red);font-weight:700">남은 연차가 없어요. 무급으로 신청하거나 소장님께 먼저 말씀해 주세요.</p>' : '') + '</div>';
    h += '<div class="mw-card"><p class="mw-q">② 언제 쉬나요?</p><div class="mw-seg">' +
      '<button data-mw="multi" data-v="0" aria-pressed="' + !f.multi + '">하루</button><button data-mw="multi" data-v="1" aria-pressed="' + f.multi + '">여러 날</button></div>' +
      '<label class="mw-date">' + (f.multi ? '시작하는 날' : '쉬는 날') + '<input type="date" id="mwf-start" min="' + min + '" max="' + max + '" value="' + esc(f.start) + '"></label>' +
      (f.multi ? '<label class="mw-date">마지막 날<input type="date" id="mwf-end" min="' + esc(f.start || min) + '" max="' + max + '" value="' + esc(f.end) + '"></label>' : '');
    if (!f.multi) h += '<div class="mw-seg" style="margin-top:10px"><button data-mw="half" data-v="" aria-pressed="' + !f.half + '">하루 종일</button><button data-mw="half" data-v="am" aria-pressed="' + (f.half === 'am') + '">오전 반차</button><button data-mw="half" data-v="pm" aria-pressed="' + (f.half === 'pm') + '">오후 반차</button></div>';
    else if (cal > 1) h += '<p class="mw-note" style="font-size:15px;font-weight:700;color:var(--ink);margin-top:14px">며칠 쓰나요? <span style="font-weight:600;color:var(--muted)">원래 쉬는 날(휴무)은 빼고 세어 주세요</span></p>' +
      '<div class="mw-days"><button data-mw="dminus"' + (days <= 0.5 ? ' disabled' : '') + ' aria-label="하루 빼기">−</button><b>' + fmt(days) + '</b><span>일</span><button data-mw="dplus"' + (days >= cal ? ' disabled' : '') + ' aria-label="하루 더하기">+</button></div>' +
      '<p class="mw-note" style="text-align:center;margin-top:4px">' + range(f.start, f.end) + ' · 달력으로 ' + cal + '일</p>';
    else if (f.multi && f.start && f.end && f.end < f.start) h += '<p class="mw-err" style="margin-top:8px">마지막 날이 시작하는 날보다 빨라요.</p>';
    const bw = busyWarn();
    if (bw) h += '<div class="mw-warn" style="margin-top:12px">⚠ <b>' + bw + '</b><br>소장님과 먼저 이야기해 주세요.</div>';
    h += '</div>';
    h += '<div class="mw-card"><p class="mw-q">③ 사유<small>신청서에 그대로 적혀요</small></p><div class="mw-chips">' +
      reasons.map(r => '<button data-mw="reason" data-v="' + esc(r) + '" aria-pressed="' + (f.reason === r) + '">' + esc(r) + '</button>').join('') +
      '<button data-mw="reason" data-v="" aria-pressed="' + (f.reason === '') + '">직접 쓰기</button></div>' +
      (f.reason === '' ? '<input class="mw-in" id="mwf-reason" maxlength="30" placeholder="예) 아이 학교 행사" value="' + esc(f.custom) + '">' : '') + '</div>';
    h += '<div class="mw-card"><p class="mw-q">④ 연락처<small>한 번 적으면 다음부터 자동으로 채워져요</small></p>' +
      '<input class="mw-in" id="mwf-phone" type="tel" inputmode="tel" maxlength="13" placeholder="010-0000-0000" value="' + esc(f.phone) + '"></div>';
    if (f.kind === '연차' && days > L.remain && L.remain > 0) h += '<div class="mw-warn">남은 연차는 <b>' + fmt(L.remain) + '개</b>예요. 모자란 만큼은 무급이 될 수 있어요.</div>';
    if (mw.err) h += '<p class="mw-err">' + esc(mw.err) + '</p>';
    h += '<button class="mw-go" data-mw="next1"' + (mwBusy ? ' disabled' : '') + '>' + (mwBusy ? '확인 중…' : '다음 · 신청서 확인하기') + '</button>';
    h += '<button class="mw-back" data-mw="back">취소하고 돌아가기</button>';
    return h;
  }
  function busyWarn() {
    const f = mw.f, L = mw.data.leave, s = f.start, e = f.multi ? f.end : f.start; if (!s || !e || e < s) return '';
    let top = 0, at = ''; for (let d = s; d <= e; d = addD(d, 1)) { const n = (L.busy || {})[d] || 0; if (n > top) { top = n; at = d; } }
    return top >= (L.busyMin || 3) ? md(at) + '에는 이미 ' + top + '명이 쉬어요.' : '';
  }
  function syncForm() {
    const f = mw.f; if (!f) return;
    const g = id => { const e = document.getElementById(id); return e ? e.value : null; };
    const s = g('mwf-start'), e = g('mwf-end'), ph = g('mwf-phone'), rs = g('mwf-reason');
    if (s !== null) f.start = s; if (e !== null) f.end = e; if (ph !== null) f.phone = ph.replace(/[^0-9-]/g, ''); if (rs !== null) f.custom = rs;
  }
  function missing() {
    const f = mw.f; if (!f) return ['', ''];
    if (!f.start) return [f.multi ? '시작하는 날을 골라 주세요.' : '쉬는 날을 골라 주세요.', 'mwf-start'];
    if (f.multi && !f.end) return ['마지막 날을 골라 주세요.', 'mwf-end'];
    if (f.multi && f.end < f.start) return ['마지막 날이 시작하는 날보다 빨라요.', 'mwf-end'];
    if (f.reason === '' && !String(f.custom).trim()) return ['사유를 적어 주세요.', 'mwf-reason'];
    if (String(f.phone).replace(/\D/g, '').length < 9) return ['연락처를 적어 주세요. (예: 010-1234-5678)', 'mwf-phone'];
    return null;
  }
  function payload() {
    const f = mw.f;
    return { kind: f.kind, start: f.start, end: f.multi ? f.end : f.start, half: f.multi ? '' : f.half, days: fDays(), reason: f.reason === '' ? String(f.custom).trim() : f.reason, phone: f.phone };
  }
  // ---------- 신청서 확인 + 서명
  function signHtml() {
    const pv = mw.pv;
    return '<div class="mw-card"><h3>신청서를 확인해 주세요</h3><p class="mw-note" style="margin:0 0 10px">회사 휴가신청서 양식 그대로 들어가요.</p><div class="mw-paper" id="mw-paper">' + pv.html + '</div></div>' +
      (pv.warn && pv.warn.length ? '<div class="mw-warn">⚠ ' + pv.warn.map(esc).join('<br>⚠ ') + '</div>' : '') +
      '<div class="mw-card"><p class="mw-q">⑤ 서명<small>아래 칸에 손가락으로 이름을 써 주세요</small></p><div class="mw-pad"><canvas id="mw-canvas" width="600" height="240"></canvas>' + (mw.sign ? '' : '<div class="ph">여기에 서명</div>') + '</div>' +
      '<div class="mw-seg" style="margin-top:10px"><button data-mw="clear">지우고 다시 쓰기</button></div></div>' +
      (mw.err ? '<p class="mw-err">' + esc(mw.err) + '</p>' : '') +
      '<button class="mw-go" data-mw="submit"' + (mw.sign && !mwBusy ? '' : ' disabled') + '>' + (mwBusy ? '보내는 중…' : '✔ 신청서 제출하기') + '</button>' +
      '<button class="mw-back" data-mw="edit">← 고치기</button>';
  }
  function formHtml() {
    if (!mw.pv) return '<div class="mw-load">불러오는 중…</div>';
    return '<div class="mw-card"><div class="mw-paper" id="mw-paper">' + mw.pv.html + '</div></div><button class="mw-back" data-mw="back">← 내 근무로</button>';
  }
  function doneHtml() {
    return '<div class="mw-card mw-done"><div class="ic">📨</div><h3>신청했어요!</h3><p>소장님이 확인하면<br>내 근무 → 내 신청에 <b style="color:var(--done)">승인 ✔</b>이 떠요.</p>' +
      '<button class="mw-go" style="width:100%;position:static" data-mw="back">확인</button></div>';
  }
  function cssOnce(css) { if (css && !document.getElementById('lf-css')) { const s = document.createElement('style'); s.id = 'lf-css'; s.textContent = css; document.head.appendChild(s); } }
  function fitPaper() {
    const box = document.getElementById('mw-paper'), pg = box && box.querySelector('.lf-page'); if (!pg) return;
    const k = box.clientWidth / pg.offsetWidth; pg.style.transform = 'scale(' + k + ')'; box.style.height = (pg.offsetHeight * k) + 'px';
  }
  window.addEventListener('resize', () => { if (mw && (mw.stage === 'sign' || mw.stage === 'form')) fitPaper(); });
  function padInit() {
    const c = document.getElementById('mw-canvas'); if (!c) return;
    const g = c.getContext('2d'); let drawing = false, last = null;
    g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 6; g.strokeStyle = '#111';
    replay(g, mw.sign || '');
    const pt = e => { const r = c.getBoundingClientRect(); return [Math.max(0, Math.min(300, Math.round((e.clientX - r.left) / r.width * 300))), Math.max(0, Math.min(120, Math.round((e.clientY - r.top) / r.height * 120)))]; };
    c.onpointerdown = e => { e.preventDefault(); try { c.setPointerCapture(e.pointerId); } catch (x) {} drawing = true; last = pt(e); mw.sign = (mw.sign ? mw.sign + ' ' : '') + 'M ' + last[0] + ' ' + last[1]; const ph = c.parentNode.querySelector('.ph'); if (ph) ph.remove(); };
    c.onpointermove = e => { if (!drawing) return; e.preventDefault(); const p = pt(e); if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 2) return;
      g.beginPath(); g.moveTo(last[0] * 2, last[1] * 2); g.lineTo(p[0] * 2, p[1] * 2); g.stroke(); last = p; if (mw.sign.length < 29000) mw.sign += ' L ' + p[0] + ' ' + p[1]; };
    c.onpointerup = c.onpointercancel = () => { if (!drawing) return; drawing = false; showSign(); const b = document.querySelector('[data-mw="submit"]'); if (b && !mwBusy) b.disabled = !signOk(); };
  }
  function signOk() { return !!mw.sign && (mw.sign.match(/L/g) || []).length >= 3; }
  function replay(g, s) {
    const t = s.split(' '); let x = 0, y = 0;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === 'M') { x = Number(t[i + 1]); y = Number(t[i + 2]); i += 2; }
      else if (t[i] === 'L') { const nx = Number(t[i + 1]), ny = Number(t[i + 2]); g.beginPath(); g.moveTo(x * 2, y * 2); g.lineTo(nx * 2, ny * 2); g.stroke(); x = nx; y = ny; i += 2; }
    }
  }
  function showSign() {
    const sp = document.querySelector('#mw-paper .lf-sign'); if (!sp) return;
    sp.innerHTML = mw.sign ? '<svg viewBox="0 0 300 120" preserveAspectRatio="xMidYMid meet"><path d="' + esc(mw.sign) + '" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '';
  }
  // ---------- 비밀번호
  function pinGo() {
    const f = document.getElementById('mwpin'); if (!f || mwBusy) return;
    const v = f.value.replace(/\D/g, '');
    if (v.length !== 4) return;
    if (mw.step === 'new1') { mw.first = v; mw.step = 'new2'; mw.err = ''; mwDraw(); focusPin(); return; }
    if (mw.step === 'new2' && v !== mw.first) { mw.step = 'new1'; mw.first = ''; mw.err = '두 번 넣은 숫자가 달라요. 처음부터 다시 해 주세요.'; mwDraw(); focusPin(); return; }
    mw.err = ''; mwDraw();
    mwRun('myWorkPin', [v, mw.step === 'new2'], r => { lsSet(tkKey(), r.tok); vibe(30); load(''); },
      m => { if (mw.step === 'new2') { mw.step = 'new1'; mw.first = ''; } mw.err = m; mwDraw(); focusPin(); });
  }
  document.addEventListener('input', e => {
    if (!mw) return;
    const id = e.target.id;
    if (id === 'mwpin') {
      const v = e.target.value.replace(/\D/g, '').slice(0, 4); if (v !== e.target.value) e.target.value = v;
      const b = document.querySelector('[data-mw="pin"]'); if (b) b.disabled = v.length !== 4 || mwBusy;
      if (v.length === 4) pinGo();
      return;
    }
    if (!mw.f) return;
    if (id === 'mwf-phone') { const p = e.target.value.replace(/[^0-9-]/g, ''); if (p !== e.target.value) e.target.value = p; mw.f.phone = p; }
    if (/^mwf-/.test(id) && mw.err) { mw.err = ''; const er = document.querySelector('.mw-body > .mw-err'); if (er) er.remove(); }
    if (id === 'mwf-reason') mw.f.custom = e.target.value;
    if (id === 'mwf-start' && e.target.value) mw.f.start = e.target.value;
    if (id === 'mwf-end' && e.target.value) mw.f.end = e.target.value;
  });
  document.addEventListener('change', e => {
    if (!mw || !mw.f || mw.stage !== 'apply') return;
    const id = e.target.id, f = mw.f;
    if (id === 'mwf-start') { f.start = e.target.value; if (f.multi && f.end && f.end < f.start) f.end = ''; f.touched = false; mw.err = ''; mwDraw(); }
    if (id === 'mwf-end') { f.end = e.target.value; f.touched = false; mw.err = ''; mwDraw(); }
  });
  document.addEventListener('keydown', e => { if (e.target && e.target.id === 'mwpin' && e.key === 'Enter') pinGo(); });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-mw]'); if (!b || b.disabled) return;
    const k = b.getAttribute('data-mw'), v = b.getAttribute('data-v');
    if (k === 'open') { open(); return; }
    if (!mw || mwBusy) return;
    const f = mw.f;
    if (f && mw.stage === 'apply') syncForm();
    if (k === 'pin') pinGo();
    else if (k === 'prev' && mw.data) load(shift(mw.ym, -1));
    else if (k === 'next' && mw.data) load(shift(mw.ym, 1));
    else if (k === 'lock') { lsSet(tkKey(), null); ctx.closeDlg(); toast('내 근무를 잠갔어요. 다음엔 비밀번호를 넣어요'); }
    else if (k === 'back') toView();
    else if (k === 'apply' && mw.data && mw.data.leave) startApply();
    else if (k === 'kind' && f) { f.kind = v; f.reason = mw.data.leave.reasons[v][0]; f.custom = ''; mwDraw(); }
    else if (k === 'multi' && f) { f.multi = v === '1'; f.half = ''; f.touched = false; if (!f.multi) f.end = ''; mwDraw(); }
    else if (k === 'half' && f) { f.half = v; mwDraw(); }
    else if ((k === 'dminus' || k === 'dplus') && f) { f.days = Math.max(0.5, Math.min(fCal(), fDays() + (k === 'dplus' ? 0.5 : -0.5))); f.touched = true; mwDraw(); }
    else if (k === 'reason' && f) { const ri = document.getElementById('mwf-reason'); if (ri) f.custom = ri.value; f.reason = v; mwDraw(); if (v === '') { const r2 = document.getElementById('mwf-reason'); if (r2) r2.focus(); } }
    else if (k === 'next1' && f) {
      syncForm();
      const miss = missing();
      if (miss) { mw.err = miss[0]; mwDraw(); const fe = document.getElementById(miss[1]); if (fe) { fe.scrollIntoView({ block: 'center' }); if (miss[1] !== 'mwf-start' && miss[1] !== 'mwf-end') fe.focus(); } return; }
      mw.err = ''; mwDraw();
      mwRun('myLeavePreview', [getTok(), payload()], r => { cssOnce(r.css); mw.pv = r; mw.sign = ''; mw.stage = 'sign'; mw.keepY = false; mwDraw(); }, m => { mw.err = m; mwDraw(); });
    }
    else if (k === 'clear') { mw.sign = ''; mwDraw(); }
    else if (k === 'edit') { mw.stage = 'apply'; mw.err = ''; mw.keepY = false; mwDraw(); }
    else if (k === 'submit' && f) {
      if (!signOk()) { mw.err = '서명 칸에 이름을 써 주세요.'; mwDraw(); return; }
      const x = payload(); x.sign = mw.sign; mw.err = ''; mwDraw();
      mwRun('myLeaveApply', [getTok(), x], d => { mw.data = d; mw.f = null; mw.pv = null; mw.stage = 'done'; mw.keepY = false; vibe(40); mwDraw(); }, m => { mw.err = m; mwDraw(); });
    }
    else if (k === 'see') {
      mw.stage = 'form'; mw.pv = null; mw.keepY = false; mwDraw();
      mwRun('myLeaveForm', [getTok(), b.getAttribute('data-id')], r => { cssOnce(r.css); mw.pv = r; if (mw && mw.stage === 'form') mwDraw(); }, m => { mw.stage = 'view'; mw.err = m; mwDraw(); });
    }
    else if (k === 'del') {
      const did = b.getAttribute('data-id');
      if (mw.askDel !== did) { mw.askDel = did; mw.askCancel = ''; mwDraw(); return; }
      mw.askDel = '';
      mwRun('myLeaveDelete', [getTok(), did], d => { mw.data = d; mwDraw(); toast('신청을 지웠어요'); }, m => { mw.err = m; mwDraw(); });
    }
    else if (k === 'cancel') {
      const cid = b.getAttribute('data-id');
      if (mw.askCancel !== cid) { mw.askCancel = cid; mwDraw(); return; }
      mw.askCancel = '';
      mwRun('myLeaveCancel', [getTok(), cid], d => { mw.data = d; mwDraw(); toast('신청을 취소했어요'); }, m => { mw.err = m; mwDraw(); });
    }
  });
  return { inject, draw: mwDraw, back, closed, reset: () => { news = 0; newsAsked = false; } };
}

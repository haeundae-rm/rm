// 고객만족도 VOC (관리자 'VOC' 메뉴) — 2026-11-07
// 매일 카톡으로 오는 '고객만족도 특이건 공유' 글을 붙여넣기 → 건별로 나눔 → 책임 분류 제안(정비·시설·프런트) → 마지막 정비자 찾기 → 확정
// 저장: Firestore voc/{id} (관리자만). 실적·누계는 확정된 건만. 2026년 건은 '시범'(연습 기간) — 2027-01-01 부터 공식 누계
// 마지막 정비자 = 입실일 당일(없으면 그 전날부터 7일 안) 그 객실을 마지막으로 '완료' 누른 사람 (레포트 앱 기록 = 교환·추가 반영)
//   완료 기록이 없으면 그날 배정(plans) 기준으로 표시

const RESP = ['정비', '시설', '프런트', '기타'];
// 내용 → 유형(통계용) · 책임 제안. 순서 = 먼저 맞는 것
const TYPES = [
  ['머리카락', /머리카락|털/, '정비'], ['욕실', /욕실|화장실|세면대|변기|샤워|배수구|물때/, '정비'], ['냄새', /냄새|악취|담배|환기/, '정비'],
  ['먼지·얼룩', /먼지|얼룩|오염|때\b|끈적/, '정비'], ['침구', /침구|이불|시트|베개|침대/, '정비'], ['비품', /비품|어메니티|수건|타월|휴지|컵|슬리퍼|칫솔|생수|커피/, '정비'],
  ['청소 전반', /청소|청결|정비|지저분|더러/, '정비'],
  ['냉난방', /난방|냉방|에어컨|보일러|온수|춥|더워|온도/, '시설'], ['고장·시설', /고장|누수|소음|방음|전등|TV|티비|와이파이|wifi|문이|도어|열쇠|키\b|엘리베이터|주차/i, '시설'],
  ['응대', /응대|불친절|친절|카운터|프런트|프론트|체크인|체크아웃|직원|전화|안내/, '프런트']
];
export function typesOf(text) { const t = String(text || ''); return TYPES.filter(x => x[1].test(t)).map(x => x[0]); }
export function respOf(text, cat, kind) {
  const t = String(text || ''), r = [];
  TYPES.forEach(x => { if (x[1].test(t) && r.indexOf(x[2]) < 0) r.push(x[2]); });
  if (/직원|서비스|프런트|프론트/.test(cat || '') && r.indexOf('프런트') < 0 && r.indexOf('정비') < 0) r.unshift('프런트');
  if (!r.length) r.push(/객실|하우스|청소/.test(cat || '') || (kind === '칭찬' && /깨끗|청결|정돈|쾌적/.test(t)) ? '정비' : '기타');
  if (kind === '칭찬' && /깨끗|청결|정돈|쾌적|침구|정리/.test(t) && r.indexOf('정비') < 0) r.unshift('정비');
  return r;
}
// 'M/D' → YYYY-MM-DD (기준 날짜와 가까운 해)
function ymd(base, m, d) {
  const by = Number(base.slice(0, 4)), bm = Number(base.slice(5, 7));
  let y = by; if (m - bm > 6) y--; else if (bm - m > 6) y++;
  return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
}
// 카톡 글 → 건 목록
export function parseVoc(text, today) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map(l => l.trim());
  let date = today, kind = '개선', cat = '', cur = null;
  const items = [], head = lines.find(l => /\d{1,2}\s*\/\s*\d{1,2}/.test(l) && /고객|만족|특이|공유|VOC/i.test(l));
  if (head) { const m = /(\d{1,2})\s*\/\s*(\d{1,2})/.exec(head); date = ymd(today, Number(m[1]), Number(m[2])); }
  const push = () => { if (cur && cur.text.trim()) items.push(cur); cur = null; };
  lines.forEach(l => {
    if (!l || l === head) return;
    if (/^\[.*(개선|불만|불편).*\]$|^[\[【].*(개선|불만).*[\]】]/.test(l)) { push(); kind = '개선'; cat = ''; return; }
    if (/^\[.*칭찬.*\]$|^[\[【].*칭찬.*[\]】]/.test(l)) { push(); kind = '칭찬'; cat = ''; return; }
    const isItem = /^[-·•▪*]|^👏|^\d+[.)]\s/.test(l);
    if (!isItem && /^(✔️|✔|☑️|✅|▶|■|◆|●)/.test(l)) { push(); cat = l.replace(/^(✔️|✔|☑️|✅|▶|■|◆|●)\s*/, '').trim(); return; }
    if (isItem) { push(); cur = { kind, cat, text: l.replace(/^([-·•▪*]|👏|\d+[.)])\s*/, '') }; return; }
    if (cur) cur.text += ' ' + l; else cur = { kind, cat, text: l };
  });
  push();
  return items.map(it => {
    const t = it.text, rm = /(\d{3,4})\s*호/.exec(t);
    const dm = /(\d{1,2})\s*\/\s*(\d{1,2})\s*[~\-]\s*(?:(\d{1,2})\s*\/\s*)?(\d{1,2})/.exec(t);
    let ci = '', co = '';
    if (dm) { const m1 = Number(dm[1]), d1 = Number(dm[2]), m2 = dm[3] ? Number(dm[3]) : m1, d2 = Number(dm[4]); ci = ymd(date, m1, d1); co = ymd(date, d2 < d1 && !dm[3] ? m1 + 1 : m2, d2); }
    const body = t.replace(/\s*\(\s*\d{3,4}\s*호[^)]*\)\s*$/, '').trim();
    return { date, kind: it.kind, cat: it.cat, text: body, raw: t, room: rm ? rm[1] : '', ci, co, resp: respOf(body, it.cat, it.kind), types: typesOf(body) };
  });
}
function addDays(d, n) { const x = new Date(d + 'T12:00:00+09:00'); x.setTime(x.getTime() + n * 864e5); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(x); }
// 마지막 정비자: 입실일부터 7일 거슬러 '완료' 기록 → 없으면 입실일 배정
export async function findCleaner(S, room, ci) {
  if (!room || !ci) return null;
  for (let i = 0; i <= 7; i++) {
    const d = addDays(ci, -i);
    let docs = [];
    try { docs = await S.getQuery('days/' + d + '/recs', [['room', '==', room]]); } catch (e) { docs = []; }
    const ok = docs.map(x => x.data).filter(x => x.status === '완료' || x.status === '이상').sort((a, b) => (b.clientAt || b.at || 0) - (a.clientAt || a.at || 0));
    if (ok.length) return { maid: ok[0].maid, day: d, at: ok[0].clientAt || ok[0].at || 0, how: i === 0 ? '입실일 완료' : i + '일 전 완료', more: ok.length > 1 ? ok.slice(1).map(x => x.maid) : [] };
  }
  try {
    const ps = await S.getQuery('days/' + ci + '/plans', []);
    const hit = ps.filter(p => (p.data.rooms || []).some(x => String(x.room) === room)).map(p => p.id);
    if (hit.length) return { maid: hit[0], day: ci, at: 0, how: '배정 기준 (완료 기록 없음)', more: hit.slice(1) };
  } catch (e) {}
  return { maid: '', day: ci, at: 0, how: '기록 없음', more: [] };
}

export function setupVoc(ctx) {
  const { S, esc, say } = ctx;
  let docs = [], sub = null, draft = null, busy = false, view = { tab: 'list', ym: '', year: '', who: '' };
  const year0 = () => ctx.today().slice(0, 4);
  function start() {
    if (sub) return;
    sub = S.listenQuery('voc', [], d => { docs = d.map(x => Object.assign({ id: x.id }, x.data)); ctx.update(); }, e => { console.warn('VOC 읽기', e); docs = null; ctx.update(); });
  }
  function stop() { if (sub) { try { sub(); } catch (e) {} sub = null; } docs = []; }
  const trial = d => String(d || '') < '2027-01-01';
  const hm = ms => { if (!ms) return ''; const d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };
  const md = d => (d ? Number(d.slice(5, 7)) + '/' + Number(d.slice(8, 10)) : '');
  const chip = (on, label, attrs) => '<button class="vchip' + (on ? ' on' : '') + '" ' + attrs + '>' + esc(label) + '</button>';
  function itemCard(x, i, isDraft) {
    const c = x.cleaner, maidRow = x.resp.indexOf('정비') >= 0 && x.room
      ? '<div class="vwho">' + (c ? (c.maid ? '마지막 정비자 <b>' + esc(c.maid) + '</b> · ' + esc(md(c.day)) + (c.at ? ' ' + hm(c.at) : '') + ' · <small>' + esc(c.how) + (c.more && c.more.length ? ' · 같은 날 ' + esc(c.more.join(', ')) : '') + '</small>' : '<span class="vwarn">정비자를 찾지 못했어요 (' + esc(c.how) + ')</span>') : '찾는 중…') + '</div>' : '';
    const key = isDraft ? 'data-di="' + i + '"' : 'data-vid="' + esc(x.id) + '"';
    return '<div class="vitem ' + (x.kind === '칭찬' ? 'good' : 'bad') + '"><div class="vtop"><span class="vk">' + esc(x.kind) + '</span>' + (x.cat ? '<span class="vcat">' + esc(x.cat) + '</span>' : '') +
      (x.room ? '<b class="vroom">' + esc(x.room) + '호</b>' : '<span class="vcat">호수 없음</span>') + (x.ci ? '<span class="vcat">' + md(x.ci) + (x.co ? '~' + md(x.co) : '') + ' 투숙</span>' : '') +
      (isDraft ? '' : '<span class="vdate">' + md(x.date) + ' 공유' + (trial(x.date) ? ' · 시범' : '') + '</span>') + '</div>' +
      '<p class="vtext">' + esc(x.text) + '</p>' +
      '<div class="vresp">' + RESP.map(r => chip(x.resp.indexOf(r) >= 0, r, key + ' data-resp="' + r + '"')).join('') + (x.types && x.types.length ? '<span class="vtypes">' + esc(x.types.join(' · ')) + '</span>' : '') + '</div>' + maidRow +
      (isDraft ? '' : '<div class="vacts">' + (x.resp.indexOf('정비') >= 0 && x.room ? '<button ' + key + ' data-vmaid="1">정비자 고치기</button>' : '') + '<button ' + key + ' data-vdel="1" class="dangerl">' + (view.del === x.id ? '한 번 더 누르면 지워져요' : '지우기') + '</button></div>') + '</div>';
  }
  function inRange(x) { const y = view.year || year0(); if (view.tab === 'year') return x.date.slice(0, 4) === y; return x.date.slice(0, 7) === (view.ym || ctx.today().slice(0, 7)); }
  function stats(list) {
    const maid = {}, room = {}, type = {}; let good = 0, bad = 0, goodAll = 0;
    list.forEach(x => {
      if (x.kind === '칭찬') { goodAll++; } else bad++;
      if (x.kind === '칭찬' && x.room) good++;
      (x.types || []).forEach(t => { if (x.kind !== '칭찬') type[t] = (type[t] || 0) + 1; });
      if (x.room && x.kind !== '칭찬') (room[x.room] = room[x.room] || []).push(x);
      const who = x.resp.indexOf('정비') >= 0 && x.maid;
      if (who) { const m = maid[who] = maid[who] || { good: 0, bad: 0 }; if (x.kind === '칭찬') m.good++; else m.bad++; }
    });
    return { maid, room, type, good, bad, goodAll };
  }
  function html() {
    start();
    if (docs === null) return '<div class="card"><h3>고객만족도 VOC</h3><p class="rec vwarn">VOC 자료를 읽지 못했어요. Firebase 보안 규칙 v7 이 게시됐는지 확인해 주세요.</p></div>';
    let h = '<div class="card"><h3>VOC 넣기</h3><p class="rec" style="margin:0 0 8px">카톡으로 받은 고객만족도 공유 글을 그대로 붙여넣고 <b>나누기</b>를 누르세요. 확인 후 저장한 건만 실적에 들어가요.' + (trial(ctx.today()) ? ' <b>2026년은 시범 기간</b> — 2027년 1월부터 공식 누계예요.' : '') + '</p>' +
      '<textarea id="voctxt" rows="6" class="vtxt" placeholder="예) 11/4 고객만족도 특이건 공유드립니다&#10;[개선 건]&#10;✔️객실&#10;-욕실 청소 미흡 (1407호, 11/3~4)">' + esc(draft ? draft.txt : '') + '</textarea>' +
      '<div class="acts"><button class="go" data-vparse="1"' + (busy ? ' disabled' : '') + '>나누기</button></div>';
    if (draft && draft.items) {
      h += '<p class="sec" style="margin:12px 0 6px">' + md(draft.items[0] ? draft.items[0].date : '') + ' 공유 · ' + draft.items.length + '건 — 분류를 확인하고 저장하세요</p>' +
        (draft.items.length ? draft.items.map((x, i) => itemCard(x, i, true)).join('') : '<p class="rec vwarn">건을 찾지 못했어요. 글 모양을 확인해 주세요.</p>') +
        (draft.dup ? '<p class="rec vwarn">이 날짜에 이미 저장된 건이 ' + draft.dup + '건 있어요. 같은 글을 두 번 넣지 않았는지 확인해 주세요.</p>' : '') +
        '<div class="acts"><button data-vcancel="1">취소</button><button class="go" data-vsave="1"' + (busy || !draft.items.length || draft.items.some(x => x.room && x.resp.indexOf('정비') >= 0 && !x.cleaner) ? ' disabled' : '') + '>' + (busy ? '저장 중…' : draft.items.length + '건 저장') + '</button></div>';
    }
    h += '</div>';
    const all = docs || [], ym = view.ym || ctx.today().slice(0, 7), y = view.year || year0();
    const list = all.filter(inRange).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.room || '') < (b.room || '') ? -1 : 1));
    const st = stats(list);
    h += '<nav class="vtabs">' + [['list', '이번 달 목록'], ['year', '연간 누계']].map(t => '<button data-vtab="' + t[0] + '" aria-pressed="' + (view.tab === t[0]) + '">' + t[1] + '</button>').join('') +
      '<span class="vper">' + (view.tab === 'year' ? '<button data-vy="-1">‹</button><b>' + y + '년' + (y < '2027' ? ' (시범)' : '') + '</b><button data-vy="1">›</button>'
        : '<button data-vm="-1">‹</button><b>' + Number(ym.slice(0, 4)) + '년 ' + Number(ym.slice(5)) + '월</b><button data-vm="1">›</button>') + '</span>' +
      '<button class="vcsv" data-vcsv="1">엑셀 내려받기</button></nav>';
    h += '<div class="kpis"><div class="kpi"><b>' + st.bad + '</b><span>개선(불만)</span></div><div class="kpi vgood"><b>' + st.goodAll + '</b><span>칭찬</span></div><div class="kpi"><b>' + Object.keys(st.maid).length + '</b><span>관련 메이드</span></div></div>';
    if (view.tab === 'list') {
      h += list.length ? list.map(x => itemCard(x, 0, false)).join('') : '<div class="card"><p class="rec" style="margin:0">이 달에 저장된 VOC가 없어요.</p></div>';
    } else {
      const ms = Object.keys(st.maid).sort((a, b) => st.maid[b].bad - st.maid[a].bad || st.maid[b].good - st.maid[a].good || (a < b ? -1 : 1));
      h += '<div class="card"><h3>메이드별 (정비 책임 건)</h3><div class="list">' + (ms.length ? ms.map(n => '<div class="r"><span><b>' + esc(n) + '</b></span><span>칭찬 ' + st.maid[n].good + ' · 불만 <b' + (st.maid[n].bad ? ' style="color:var(--warn-red)"' : '') + '>' + st.maid[n].bad + '</b></span></div>').join('') : '<div class="r"><span>아직 없어요.</span><span></span></div>') + '</div><p class="rec" style="margin:6px 0 0">관리자만 보는 화면이에요. 메이드끼리 비교해 공개하지 않아요.</p></div>';
      const rr = Object.keys(st.room).filter(r => st.room[r].length >= 2).sort((a, b) => st.room[b].length - st.room[a].length);
      h += '<div class="card"><h3>같은 객실 반복 불만 (2건 이상)</h3><p class="rec" style="margin:0 0 6px">사람보다 시설·구조 문제일 수 있어요.</p><div class="list">' + (rr.length ? rr.map(r => '<div class="r"><span><b>' + esc(r) + '호</b><br><small>' + esc(st.room[r].map(x => md(x.date) + ' ' + (x.types || []).join('·')).join(' / ')) + '</small></span><span>' + st.room[r].length + '건</span></div>').join('') : '<div class="r"><span>없어요.</span><span></span></div>') + '</div></div>';
      const ts = Object.keys(st.type).sort((a, b) => st.type[b] - st.type[a]);
      h += '<div class="card"><h3>불만 유형</h3><div class="list">' + (ts.length ? ts.map(t => '<div class="r"><span>' + esc(t) + '</span><span>' + st.type[t] + '건</span></div>').join('') : '<div class="r"><span>없어요.</span><span></span></div>') + '</div></div>';
      const byM = {}; list.forEach(x => { const k = x.date.slice(5, 7); const o = byM[k] = byM[k] || { g: 0, b: 0 }; if (x.kind === '칭찬') o.g++; else o.b++; });
      h += '<div class="card"><h3>월별</h3><div class="list">' + Object.keys(byM).sort().map(k => '<div class="r"><span>' + Number(k) + '월</span><span>칭찬 ' + byM[k].g + ' · 불만 ' + byM[k].b + '</span></div>').join('') + (Object.keys(byM).length ? '' : '<div class="r"><span>없어요.</span><span></span></div>') + '</div></div>';
    }
    return h;
  }
  // ---------- 동작
  async function match(items) {
    await Promise.all(items.map(async x => { if (x.room && x.ci) { x.cleaner = await findCleaner(S, x.room, x.ci); } else x.cleaner = { maid: '', how: x.room ? '투숙 날짜 없음' : '호수 없음', day: '', at: 0, more: [] }; }));
  }
  function parse() {
    const t = (document.getElementById('voctxt') || {}).value || '';
    const items = parseVoc(t, ctx.today());
    const dup = items.length ? (docs || []).filter(x => x.date === items[0].date).length : 0;
    draft = { txt: t, items, dup }; ctx.render();
    match(items).then(() => ctx.render());
  }
  function save() {
    if (!draft || busy) return;
    busy = true; ctx.render();
    const jobs = draft.items.map(x => {
      const c = x.cleaner || {}, maid = x.resp.indexOf('정비') >= 0 ? c.maid || '' : '';
      return S.add('voc', { date: x.date, kind: x.kind, cat: x.cat, text: x.text, raw: x.raw, room: x.room, ci: x.ci, co: x.co, resp: x.resp, types: x.types,
        maid, maidDay: maid ? c.day || '' : '', maidAt: maid ? c.at || 0 : 0, maidHow: maid ? c.how || '' : '', trial: trial(x.date), by: ctx.who(), at: S.SERVER_TIME }).done;
    });
    Promise.all(jobs).then(() => { busy = false; const n = draft.items.length; draft = null; say('VOC ' + n + '건을 저장했어요.'); ctx.render(); })
      .catch(e => { busy = false; say('저장하지 못했어요: ' + (e && e.message || e)); ctx.render(); });
  }
  function shiftYm(ym, n) { let y = Number(ym.slice(0, 4)), m = Number(ym.slice(5)) + n; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return y + '-' + ('0' + m).slice(-2); }
  function csv() {
    const list = (docs || []).filter(inRange).sort((a, b) => (a.date < b.date ? -1 : 1));
    const q = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [['공유일', '구분', '분류(원문)', '객실', '입실', '퇴실', '책임', '유형', '마지막 정비자', '정비일', '근거', '내용', '시범']].concat(list.map(x =>
      [x.date, x.kind, x.cat, x.room, x.ci, x.co, (x.resp || []).join('·'), (x.types || []).join('·'), x.maid || '', x.maidDay || '', x.maidHow || '', x.text, x.trial ? '시범' : '']));
    const blob = new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'VOC_' + (view.tab === 'year' ? (view.year || year0()) : (view.ym || ctx.today().slice(0, 7))) + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function setRespDoc(id, r) {
    const x = (docs || []).filter(d => d.id === id)[0]; if (!x) return;
    const resp = x.resp.indexOf(r) >= 0 ? x.resp.filter(z => z !== r) : x.resp.concat([r]);
    if (!resp.length) return;
    const upd = Object.assign({}, x, { resp }); delete upd.id;
    const fin = async () => {
      if (resp.indexOf('정비') >= 0 && !x.maid && x.room && x.ci) { const c = await findCleaner(S, x.room, x.ci); Object.assign(upd, { maid: c.maid || '', maidDay: c.day || '', maidAt: c.at || 0, maidHow: c.how || '' }); }
      if (resp.indexOf('정비') < 0) Object.assign(upd, { maid: '', maidDay: '', maidAt: 0, maidHow: '' });
      return S.set('voc/' + id, upd);
    };
    fin().catch(e => say('저장하지 못했어요: ' + (e && e.message || e)));
  }
  document.addEventListener('click', e => {
    if (!ctx.isAdm()) return;
    const b = e.target.closest && e.target.closest('[data-vparse],[data-vsave],[data-vcancel],[data-vtab],[data-vm],[data-vy],[data-vcsv],[data-resp],[data-vdel],[data-vmaid]');
    if (!b) return;
    if (b.hasAttribute('data-vparse')) { parse(); return; }
    if (b.hasAttribute('data-vsave')) { save(); return; }
    if (b.hasAttribute('data-vcancel')) { draft = null; ctx.render(); return; }
    if (b.hasAttribute('data-vtab')) { view.tab = b.getAttribute('data-vtab'); ctx.render(); return; }
    if (b.hasAttribute('data-vm')) { view.ym = shiftYm(view.ym || ctx.today().slice(0, 7), Number(b.getAttribute('data-vm'))); ctx.render(); return; }
    if (b.hasAttribute('data-vy')) { view.year = String(Number(view.year || year0()) + Number(b.getAttribute('data-vy'))); ctx.render(); return; }
    if (b.hasAttribute('data-vcsv')) { csv(); return; }
    const di = b.getAttribute('data-di'), vid = b.getAttribute('data-vid');
    if (b.hasAttribute('data-resp')) {
      const r = b.getAttribute('data-resp');
      if (di !== null && draft) { const x = draft.items[Number(di)]; if (x.resp.indexOf(r) >= 0) { if (x.resp.length > 1) x.resp = x.resp.filter(z => z !== r); } else x.resp.push(r); ctx.render(); }
      else if (vid) setRespDoc(vid, r);
      return;
    }
    if (b.hasAttribute('data-vdel') && vid) {
      if (view.del !== vid) { view.del = vid; ctx.render(); return; }
      view.del = ''; S.del('voc/' + vid).then(() => say('지웠어요.')).catch(err => say('지우지 못했어요: ' + (err && err.message || err))); return;
    }
    if (b.hasAttribute('data-vmaid') && vid) {
      const x = (docs || []).filter(d => d.id === vid)[0]; if (!x) return;
      const n = window.prompt(x.room + '호 정비자 이름 (비우면 정비자 없음)', x.maid || '');
      if (n === null) return;
      const upd = Object.assign({}, x, { maid: n.trim(), maidHow: n.trim() ? '관리자 지정' : '', maidDay: x.maidDay || x.ci || '', maidAt: 0 }); delete upd.id;
      S.set('voc/' + vid, upd).catch(err => say('저장하지 못했어요: ' + (err && err.message || err)));
    }
  });
  document.addEventListener('input', e => { if (e.target && e.target.id === 'voctxt') { draft = draft || {}; draft.txt = e.target.value; } });
  return { html, stop };
}

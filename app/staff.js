/* 직원 명단 화면 (2026-11-12, 객실 통합 관리 1단계) — 정비 레포트(룸메이드) · 정비 지원(정비보조) 두 앱이 같은 파일을 씀
 * 데이터는 하나: Firestore staff/{id} — 이름·직종·등급·근무조·입사일·퇴사일·상태 + 출처(입퇴사 앱 / 직접)
 * 화면은 앱마다 자기 직종만: StaffBook.open({ job:'룸메이드', title, api:{list,save,del,newId}, extra, onChange })
 *   - 레포트 앱 = 룸메이드, 정비 지원 앱 = 정비보조. 미화·사우나·하우스맨·오더테이커는 데이터만 쌓이고 (나중에 통합 관리 앱에서 같이 봄)
 * 새 입사자는 입퇴사 앱(HrStaff.gs)이 1시간마다 보내 줌. 기존 직원·본사 입사일 자료는 '엑셀 붙여넣기'
 * 읽기는 화면을 열 때 한 번 (실시간 구독 안 함). 읽기·쓰기 모두 관리자만 (규칙 v11)
 * ※ 고칠 때는 두 저장소(haeundae-rm/rm app/staff.js · haeundae-rm/dirty staff.js)를 같이 */
(function () {
  'use strict';
  if (window.StaffBook) return;
  var STATES = ['재직', '입사 진행', '퇴사'];
  var F = null, C = null;   // 열려 있는 화면 상태 · 설정

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clean(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 20); }
  function key(n) { return String(n || '').replace(/\s+/g, ''); }
  function today() { return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10); }
  function pad(n) { return ('0' + n).slice(-2); }
  function ymd(y, m, d) {
    y = Number(y); m = Number(m); d = Number(d);
    if (!(y >= 1950 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    var t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCMonth() === m - 1 ? y + '-' + pad(m) + '-' + pad(d) : null;
  }
  // 날짜 글자 → 'YYYY-MM-DD' / '' (빈칸) / null (못 읽음)
  function normDate(v) {
    var s = String(v == null ? '' : v).trim(), m;
    if (!s || s === '-') return '';
    if ((m = /^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?\.?$/.exec(s))) return ymd(m[1], m[2], m[3]);
    if ((m = /^(\d{2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\.?$/.exec(s))) return ymd((Number(m[1]) > 50 ? 1900 : 2000) + Number(m[1]), m[2], m[3]);
    if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) return ymd(m[1], m[2], m[3]);
    if (/^\d{5}(\.\d+)?$/.test(s)) { var t = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 864e5); return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); }   // 엑셀 날짜 숫자
    return null;
  }
  function md(d) { return d ? d.slice(2).replace(/-/g, '.') : ''; }
  function tenure(p) {   // 근속: 입사일 ~ (퇴사일 또는 오늘)
    if (!p.hired) return '';
    var end = p.left && p.left < today() ? p.left : today();
    var a = p.hired.split('-').map(Number), b = end.split('-').map(Number);
    var mo = (b[0] - a[0]) * 12 + (b[1] - a[1]) - (b[2] < a[2] ? 1 : 0);
    if (mo < 0) return '입사 전';
    return (Math.floor(mo / 12) ? Math.floor(mo / 12) + '년 ' : '') + (mo % 12) + '개월';
  }
  function stateOf(p) { return p.status || '재직'; }
  function mine(p) { return (p.job || '') === C.job; }

  // ---------- 열기 · 닫기
  function open(cfg) {
    C = cfg; close(true);
    F = { list: null, all: null, err: '', loading: true, tab: '재직', q: '', edit: null, paste: null, saving: false, msg: '' };
    var box = document.createElement('div'); box.className = 'sb'; box.id = 'sb'; document.body.appendChild(box);
    document.body.classList.add('sb-lock');
    draw(); load();
  }
  function close(keepCfg) { var b = document.getElementById('sb'); if (b) b.remove(); document.body.classList.remove('sb-lock'); F = null; if (!keepCfg && C && C.onClose) C.onClose(); }
  function load() {
    F.loading = true; draw();
    C.api.list().then(function (xs) {
      if (!F) return;
      F.loading = false; F.err = '';
      F.all = xs; F.list = xs.filter(mine).sort(byName);
      draw();
    }, function (e) {
      if (!F) return;
      F.loading = false;
      F.err = /permission/i.test(String(e && (e.code || e.message))) ? '명단을 읽을 권한이 없어요 — Firebase 보안 규칙 v11(직원 명단)을 아직 게시하지 않았으면 게시해 주세요.' : '명단을 못 읽었어요: ' + (e && (e.code || e.message) || e);
      draw();
    });
  }
  function byName(a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'ko'); }
  function changed(info) { if (C.onChange) try { C.onChange(F.list.slice(), info || {}); } catch (e) {} }

  // ---------- 그리기
  function draw() {
    var box = document.getElementById('sb'); if (!box || !F) return;
    var y = box.scrollTop;
    var h = '<div class="sb-in"><div class="sb-head"><h2>' + esc(C.title) + '</h2><button class="sb-x" data-sb="close" aria-label="닫기">✕</button></div>';
    h += F.edit ? editHtml() : F.paste ? pasteHtml() : listHtml();
    box.innerHTML = h + '</div>';
    box.scrollTop = y;
  }
  function listHtml() {
    var h = F.msg ? '<p class="sb-ok">' + esc(F.msg) + '</p>' : '';
    if (F.err) return h + '<section class="sb-sec"><p class="sb-err">' + esc(F.err) + '</p><button class="sb-link" data-sb="reload">다시 읽기</button>' + (C.errExtra ? C.errExtra() : '') + '</section>';
    if (F.loading && !F.list) return h + '<section class="sb-sec"><p class="sb-tip">명단을 읽는 중…</p></section>';
    var all = F.list, cnt = { '전체': all.length };
    STATES.forEach(function (s) { cnt[s] = 0; });
    all.forEach(function (p) { cnt[stateOf(p)] = (cnt[stateOf(p)] || 0) + 1; });
    var q = key(F.q);
    var rows = all.filter(function (p) { return (F.tab === '전체' || stateOf(p) === F.tab) && (!q || key(p.name).indexOf(q) >= 0); });
    var noHire = all.filter(function (p) { return stateOf(p) !== '퇴사' && !p.hired; }).length;
    h += '<section class="sb-sec"><div class="sb-seg">' + ['재직', '입사 진행', '퇴사', '전체'].map(function (s) {
      return '<button data-sb="tab" data-v="' + s + '" aria-pressed="' + (F.tab === s) + '">' + s + '<b>' + (cnt[s] || 0) + '</b></button>';
    }).join('') + '</div>' +
      '<input class="sb-in1" data-sb="q" placeholder="이름 찾기" value="' + esc(F.q) + '" inputmode="search">' +
      (noHire ? '<p class="sb-warn">입사일이 빈 분이 ' + noHire + '명이에요. 본사 입사일 자료가 오면 「엑셀 붙여넣기」로 한 번에 넣을 수 있어요.</p>' : '') +
      '</section>';
    if (C.extra) { try { h += C.extra(F.list) || ''; } catch (e) {} }
    h += '<section class="sb-sec sb-list">' + (rows.length ? rows.map(function (p) {
      var st = stateOf(p), t = tenure(p);
      return '<button class="sb-row' + (st === '퇴사' ? ' out' : '') + '" data-sb="edit" data-v="' + esc(p.id) + '">' +
        '<span class="sb-n"><b>' + esc(p.name) + '</b>' + (p.src === 'hr' ? '<em title="입퇴사 서류 앱에서 옴">앱</em>' : '') + '</span>' +
        '<span class="sb-j">' + esc([p.grade, p.shift].filter(Boolean).join(' · ') || ' ') + '</span>' +
        '<span class="sb-d">' + (p.hired ? md(p.hired) + ' 입사' + (t ? '<br>' + t : '') : '<i>입사일 없음</i>') + (p.left ? '<br>' + md(p.left) + ' 퇴사' : '') + '</span></button>';
    }).join('') : '<p class="sb-tip">' + (all.length ? '조건에 맞는 분이 없어요.' : '아직 명단이 비어 있어요. 「엑셀 붙여넣기」로 한 번에 넣거나 「＋ 한 명 추가」를 눌러 주세요.') + '</p>') + '</section>';
    h += '<div class="sb-acts"><button class="sb-go" data-sb="add">＋ 한 명 추가</button><button class="sb-go sb-2" data-sb="paste">📋 엑셀 붙여넣기</button></div>' +
      '<p class="sb-tip" style="text-align:center">' + esc(C.job) + '로 새로 입사하는 분은 입퇴사 서류 앱에서 자동으로 들어와요 (1시간마다).<br>주민번호·주소·전화·서명은 여기 오지 않아요.</p>';
    return h;
  }
  function field(lbl, name, val, extra) { return '<label class="sb-f"><span>' + lbl + '</span><input data-sbf="' + name + '" value="' + esc(val || '') + '" ' + (extra || '') + '></label>'; }
  function editHtml() {
    var e = F.edit, p = e.doc;
    return '<section class="sb-sec"><h3>' + (e.isNew ? '＋ 한 명 추가' : esc(p.name) + ' 님') + (p.src === 'hr' ? ' <small>입퇴사 서류 앱에서 온 분</small>' : '') + '</h3>' +
      (p.src === 'hr' ? '<p class="sb-warn">입퇴사 앱 정보가 바뀌면(퇴사 접수 등) 그 내용으로 다시 맞춰져요. 계약 내용은 입퇴사 앱에서 고쳐 주세요.</p>' : '') +
      field('이름', 'name', p.name, 'maxlength="20"') +
      field('등급', 'grade', p.grade, 'maxlength="10" placeholder="' + esc(C.gradeHint || '예: S, A, 신규') + '"') +
      field('근무조', 'shift', p.shift, 'maxlength="10" placeholder="없으면 비워 두세요"') +
      field('입사일', 'hired', p.hired, 'type="date"') +
      field('퇴사일', 'left', p.left, 'type="date"') +
      '<label class="sb-f"><span>상태</span><select data-sbf="status">' + STATES.map(function (s) { return '<option' + (stateOf(p) === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></label>' +
      (e.err ? '<p class="sb-err">' + esc(e.err) + '</p>' : '') +
      '</section><div class="sb-acts"><button class="sb-go" data-sb="esave"' + (F.saving ? ' disabled' : '') + '>' + (F.saving ? '저장 중…' : '저장') + '</button>' +
      '<button class="sb-go sb-2" data-sb="back">취소</button></div>' +
      (e.isNew ? '' : '<p style="text-align:center"><button class="sb-link sb-del" data-sb="edel">명단에서 지우기</button></p><p class="sb-tip" style="text-align:center">그만두신 분은 지우지 말고 상태를 「퇴사」로 바꿔 두세요 (근속·결산 근거).</p>');
  }
  function pasteHtml() {
    var P = F.paste, h = '<section class="sb-sec"><h3>📋 엑셀 붙여넣기</h3>' +
      '<p class="sb-tip" style="margin:0 0 8px">엑셀에서 <b>제목 줄까지</b> 같이 복사해 붙여 넣으세요. 알아보는 제목: 이름(성명) · 직종 · 등급 · 근무조 · 입사일 · 퇴사일 · 상태<br>제목 줄이 없으면 「이름 · 입사일」 순서로 읽어요. 이미 있는 분은 <b>이름으로 찾아서</b> 적힌 칸만 바꿔요 (빈칸은 그대로).' +
      '<br>직종 칸이 있으면 ' + esc(C.job) + '인 줄만 넣어요.</p>' +
      '<textarea class="sb-ta" data-sb="ta" rows="7" placeholder="이름	입사일&#10;홍길순	2019-03-04">' + esc(P.text) + '</textarea>' +
      '<div class="sb-acts" style="margin-top:8px"><button class="sb-go" data-sb="pcheck">미리보기</button><button class="sb-go sb-2" data-sb="back">닫기</button></div></section>';
    var r = P.res;
    if (r) {
      h += '<section class="sb-sec"><h3>미리보기</h3>' +
        '<p class="sb-tot">새로 <b>' + r.add.length + '명</b> · 바뀜 <b>' + r.chg.length + '명</b> · 같음 ' + r.same + '명' + (r.skip ? ' · 다른 직종 ' + r.skip + '줄 건너뜀' : '') + (r.bad.length ? ' · <span class="sb-errc">확인 필요 ' + r.bad.length + '줄</span>' : '') + '</p>' +
        (r.cols ? '<p class="sb-tip" style="margin:0 0 8px">읽은 칸: ' + esc(r.cols) + '</p>' : '') +
        (r.bad.length ? '<div class="sb-pv bad">' + r.bad.map(function (b) { return '<div>' + esc(b) + '</div>'; }).join('') + '</div>' : '') +
        (r.add.length ? '<div class="sb-pv">' + r.add.map(function (x) { return '<div><b>＋ ' + esc(x.doc.name) + '</b> ' + esc([x.doc.grade, x.doc.shift, x.doc.hired && md(x.doc.hired) + ' 입사', x.doc.left && md(x.doc.left) + ' 퇴사'].filter(Boolean).join(' · ')) + '</div>'; }).join('') + '</div>' : '') +
        (r.chg.length ? '<div class="sb-pv">' + r.chg.map(function (x) { return '<div><b>✎ ' + esc(x.doc.name) + '</b> ' + esc(x.diff.join(' / ')) + '</div>'; }).join('') + '</div>' : '') +
        (r.add.length + r.chg.length ? '<button class="sb-go" style="width:100%" data-sb="psave"' + (F.saving ? ' disabled' : '') + '>' + (F.saving ? '저장 중… ' + (P.done || 0) + '/' + (r.add.length + r.chg.length) : (r.add.length + r.chg.length) + '명 저장') + '</button>' : '<p class="sb-tip">바꿀 내용이 없어요.</p>') +
        (P.err ? '<p class="sb-err">' + esc(P.err) + '</p>' : '') + '</section>';
    }
    return h;
  }

  // ---------- 엑셀 붙여넣기 읽기 (이 앱 직종만)
  var HEAD = { name: /^(이름|성명|근로자명|직원명)$/, job: /^(직종|직무|파트|구분|부서)$/, grade: /^(등급|직급)$/, shift: /^(근무조|조)$/,
    hired: /^(입사일|입사일자|입사)$/, left: /^(퇴사일|퇴사일자|퇴사)$/, status: /^(상태|재직상태|재직여부)$/ };
  var LABEL = { name: '이름', job: '직종', grade: '등급', shift: '근무조', hired: '입사일', left: '퇴사일', status: '상태' };
  function parsePaste(text, list, job) {
    var lines = String(text || '').replace(/\r/g, '').split('\n').filter(function (l) { return l.trim(); });
    var out = { add: [], chg: [], same: 0, skip: 0, bad: [], cols: '' };
    if (!lines.length) { out.bad.push('붙여 넣은 내용이 없어요.'); return out; }
    var split = function (l) { return (l.indexOf('\t') >= 0 ? l.split('\t') : l.indexOf(',') >= 0 ? l.split(',') : l.trim().split(/\s+/)).map(function (c) { return c.trim(); }); };
    var first = split(lines[0]).map(function (c) { return c.replace(/\s/g, ''); }), map = {}, hasHead = false;
    first.forEach(function (c, i) { Object.keys(HEAD).forEach(function (k) { if (map[k] === undefined && HEAD[k].test(c)) { map[k] = i; hasHead = true; } }); });
    if (hasHead && map.name === undefined) { out.bad.push("제목 줄에 '이름'(또는 '성명') 칸이 없어요."); return out; }
    if (!hasHead) map = { name: 0, hired: 1 };
    out.cols = Object.keys(map).sort(function (a, b) { return map[a] - map[b]; }).map(function (k) { return LABEL[k]; }).join(' · ') + (hasHead ? '' : ' (제목 줄 없음 — 순서대로)');
    var byName = {}; (list || []).forEach(function (p) { (byName[key(p.name)] = byName[key(p.name)] || []).push(p); });
    var seen = {};
    lines.slice(hasHead ? 1 : 0).forEach(function (l, i) {
      var c = split(l), no = (hasHead ? i + 2 : i + 1) + '번째 줄';
      var get = function (k) { return map[k] === undefined ? undefined : clean(c[map[k]], k === 'name' ? 20 : 12); };
      var nm = get('name');
      if (!nm) return;
      var jb = get('job');
      if (jb && jb !== job) { out.skip++; return; }
      if (seen[key(nm)]) { out.bad.push(no + ': ' + nm + ' 님이 붙여 넣은 내용에 두 번 있어요 — 한 줄만 남겨 주세요'); return; }
      seen[key(nm)] = 1;
      var v = {}, okRow = true;
      ['grade', 'shift', 'status'].forEach(function (k) { var x = get(k); if (x) v[k] = x; });
      ['hired', 'left'].forEach(function (k) { var x = get(k); if (x === undefined || x === '') return; var d = normDate(x); if (d === null) { out.bad.push(no + ': ' + nm + ' — ' + LABEL[k] + " '" + x + "' 를 날짜로 못 읽었어요 (예: 2019-03-04)"); okRow = false; } else if (d) v[k] = d; });
      if (v.status && STATES.indexOf(v.status) < 0) { if (/퇴/.test(v.status)) v.status = '퇴사'; else if (/재|근무/.test(v.status)) v.status = '재직'; else { out.bad.push(no + ': ' + nm + " — 상태 '" + v.status + "' 는 재직·입사 진행·퇴사 중 하나여야 해요"); okRow = false; } }
      if (!okRow) return;
      var cand = byName[key(nm)] || [];
      if (cand.length > 1) { out.bad.push(no + ': ' + nm + ' 님이 명단에 ' + cand.length + '명 있어요 — 한 명씩 눌러서 고쳐 주세요'); return; }
      if (!cand.length) {
        out.add.push({ doc: { name: nm, job: job, grade: v.grade || '', shift: v.shift || '', hired: v.hired || '', left: v.left || '',
          status: v.status || (v.left && v.left <= today() ? '퇴사' : '재직'), src: '관리자', hrId: '' } });
        return;
      }
      var p = cand[0], diff = [], nd = {};
      Object.keys(p).forEach(function (k) { if (k !== 'id' && k !== 'at' && k !== 'uid') nd[k] = p[k]; });
      ['grade', 'shift', 'hired', 'left', 'status'].forEach(function (k) {
        if (v[k] === undefined || String(v[k]) === String(p[k] || '')) return;
        diff.push(LABEL[k] + ' ' + (p[k] ? (k === 'hired' || k === 'left' ? md(p[k]) : p[k]) : '빈칸') + ' → ' + (k === 'hired' || k === 'left' ? md(v[k]) : v[k]));
        nd[k] = v[k];
      });
      if (v.left && !v.status && v.left <= today() && stateOf(p) !== '퇴사') { nd.status = '퇴사'; diff.push('상태 ' + stateOf(p) + ' → 퇴사'); }
      if (diff.length) out.chg.push({ id: p.id, doc: nd, diff: diff }); else out.same++;
    });
    return out;
  }

  // ---------- 저장
  function readForm() {
    var d = Object.assign({}, F.edit.doc);
    Array.prototype.forEach.call(document.querySelectorAll('#sb [data-sbf]'), function (el) { d[el.getAttribute('data-sbf')] = el.value; });
    d.name = clean(d.name, 20); d.grade = clean(d.grade, 10); d.shift = clean(d.shift, 10);
    return d;
  }
  function upsert(id, d) {
    var L = F.list, i = L.findIndex(function (p) { return p.id === id; }), v = Object.assign({}, d, { id: id });
    if (i >= 0) L[i] = v; else L.push(v);
    L.sort(byName);
  }
  function editSave() {
    var d = readForm(), e = F.edit;
    e.doc = d; e.err = '';
    if (!d.name) { e.err = '이름을 적어 주세요.'; draw(); return; }
    if (d.name === '관리자') { e.err = "'관리자'는 이름으로 쓸 수 없어요."; draw(); return; }
    var hd = normDate(d.hired), ld = normDate(d.left);
    if (hd === null || ld === null) { e.err = '날짜를 다시 확인해 주세요.'; draw(); return; }
    d.hired = hd; d.left = ld;
    if (d.hired && d.left && d.left < d.hired) { e.err = '퇴사일이 입사일보다 빨라요.'; draw(); return; }
    if (d.left && d.left <= today() && stateOf(d) !== '퇴사' && confirm('퇴사일이 지났어요. 상태를 「퇴사」로 바꿀까요?')) d.status = '퇴사';
    var dup = F.list.filter(function (p) { return p.id !== e.id && key(p.name) === key(d.name); });
    if (dup.length && !confirm(d.name + ' 님이 이미 명단에 있어요. 그래도 따로 저장할까요? (동명이인일 때만)')) return;
    d.job = d.job || C.job;
    if (!d.src) d.src = '관리자';
    if (d.hrId === undefined) d.hrId = '';
    var id = e.id || C.api.newId();
    F.saving = true; draw();
    C.api.save(id, d).then(function () {
      if (!F) return;
      F.saving = false; F.edit = null; F.msg = d.name + ' 님을 저장했어요.';
      upsert(id, d); changed(); draw();
    }, function (x) { if (!F) return; F.saving = false; e.err = '저장하지 못했어요: ' + (x && (x.code || x.message) || x); draw(); });
  }
  function editDel() {
    var e = F.edit, p = e.doc;
    if (!confirm(p.name + ' 님을 명단에서 완전히 지울까요?\n\n그만두신 분은 지우지 말고 상태를 「퇴사」로 두는 게 좋아요.' + (p.src === 'hr' ? '\n(입퇴사 앱에 있는 분은 앱 정보가 바뀌면 다시 들어올 수 있어요)' : ''))) return;
    F.saving = true; draw();
    C.api.del(e.id).then(function () {
      if (!F) return;
      F.saving = false; F.edit = null; F.msg = p.name + ' 님을 명단에서 지웠어요.';
      F.list = F.list.filter(function (x) { return x.id !== e.id; }); changed({ removed: p.name }); draw();
    }, function (x) { if (!F) return; F.saving = false; e.err = '지우지 못했어요: ' + (x && (x.code || x.message) || x); draw(); });
  }
  function pasteSave() {
    var P = F.paste, r = P.res; if (!r || F.saving) return;
    var jobs = r.add.map(function (x) { return { id: C.api.newId(), doc: x.doc }; }).concat(r.chg.map(function (x) { return { id: x.id, doc: x.doc }; }));
    F.saving = true; P.done = 0; P.err = ''; draw();
    var i = 0, fails = [];
    (function next() {
      if (!F) return;
      if (i >= jobs.length) {
        F.saving = false; changed();
        if (fails.length) { P.err = fails.length + '명 저장 실패: ' + fails.slice(0, 3).join(', ') + (fails.length > 3 ? ' …' : '') + ' — 인터넷과 관리자 로그인을 확인하고 다시 눌러 주세요'; P.res = parsePaste(P.text, F.list, C.job); draw(); return; }
        F.msg = jobs.length + '명을 저장했어요 (새로 ' + r.add.length + ' · 바뀜 ' + r.chg.length + ').'; F.paste = null; draw(); return;
      }
      var part = jobs.slice(i, i + 20); i += part.length;
      Promise.all(part.map(function (j) {
        return C.api.save(j.id, j.doc).then(function () { upsert(j.id, j.doc); P.done++; }, function () { fails.push(j.doc.name); });
      })).then(function () { draw(); next(); });
    })();
  }
  function newDoc(name) { return { name: name || '', job: C.job, grade: '', shift: '', hired: '', left: '', status: '재직', src: '관리자', hrId: '' }; }

  // ---------- 누르기 · 입력
  document.addEventListener('click', function (e) {
    if (!F) return;
    var t = e.target.closest && e.target.closest('#sb [data-sb]'); if (!t) return;
    var a = t.getAttribute('data-sb'), v = t.getAttribute('data-v');
    if (a === 'ta' || a === 'q') return;
    F.msg = '';
    if (a === 'close') { close(); return; }
    if (a === 'reload') { load(); return; }
    if (a === 'tab') { F.tab = v; draw(); return; }
    if (a === 'add') { F.edit = { id: null, isNew: true, doc: newDoc(), err: '' }; draw(); return; }
    if (a === 'prefill') { F.edit = { id: null, isNew: true, doc: newDoc(v), err: '' }; draw(); return; }
    if (a === 'edit') { var p = F.list.filter(function (x) { return x.id === v; })[0]; if (p) { F.edit = { id: p.id, isNew: false, doc: Object.assign({}, p), err: '' }; draw(); } return; }
    if (a === 'back') { F.edit = null; F.paste = null; draw(); return; }
    if (a === 'esave') { editSave(); return; }
    if (a === 'edel') { editDel(); return; }
    if (a === 'paste') { F.paste = { text: '', res: null, err: '' }; draw(); return; }
    if (a === 'pcheck') { F.paste.res = parsePaste(F.paste.text, F.list, C.job); F.paste.err = ''; draw(); return; }
    if (a === 'psave') { pasteSave(); return; }
  });
  document.addEventListener('input', function (e) {
    if (!F || !e.target.closest || !e.target.closest('#sb')) return;
    var a = e.target.getAttribute('data-sb');
    if (a === 'q') { F.q = e.target.value; var pos = e.target.selectionStart; draw(); var el = document.querySelector('#sb [data-sb="q"]'); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (x) {} } }
    if (a === 'ta') { F.paste.text = e.target.value; F.paste.res = null; }
  });

  // ---------- 모양 (두 앱의 색 이름이 달라서 대체값을 같이 둠)
  var css = document.createElement('style');
  css.textContent = [
    'body.sb-lock{overflow:hidden}',
    '.sb{--sbm:var(--brand,var(--navy,#1D3A6E));position:fixed;inset:0;z-index:60;background:var(--bg,#F4F6F9);color:var(--ink,#111827);overflow-y:auto;-webkit-overflow-scrolling:touch;font-family:inherit}',
    '.sb-in{max-width:720px;margin:0 auto;padding:calc(10px + env(safe-area-inset-top)) 16px 120px}',
    '.sb-head{display:flex;align-items:center;justify-content:space-between;padding:6px 0 10px}.sb-head h2{margin:0;font-size:20px}',
    '.sb-x{width:44px;height:44px;border:0;border-radius:12px;background:var(--tile,#EEF1F5);color:var(--ink,#111827);font-size:18px;cursor:pointer}',
    '.sb-sec{background:var(--surface,#fff);border-radius:18px;padding:14px 16px;margin:0 0 12px;box-shadow:var(--shadow,0 2px 10px rgba(0,0,0,.06))}',
    '.sb-sec h3{margin:0 0 10px;font-size:16px}.sb-sec h3 small{font-weight:500;color:var(--muted);font-size:12.5px}',
    '.sb-seg{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.sb-seg button{min-height:52px;border:1.5px solid var(--line);border-radius:12px;background:var(--surface,#fff);font:700 13px inherit;font-family:inherit;color:var(--ink);cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px}',
    '.sb-seg button b{font-size:17px}.sb-seg button[aria-pressed="true"]{background:var(--sbm);border-color:var(--sbm);color:#fff}',
    '.sb-in1{width:100%;box-sizing:border-box;min-height:44px;margin-top:10px;border:1.5px solid var(--line);border-radius:12px;padding:0 12px;font:16px inherit;font-family:inherit;background:var(--surface,#fff);color:var(--ink)}',
    '.sb-list{padding:6px 8px}',
    '.sb-row{display:grid;grid-template-columns:1fr auto;grid-template-areas:"n d" "j d";gap:2px 10px;width:100%;text-align:left;border:0;border-bottom:1px solid var(--line);background:none;padding:10px 8px;font:inherit;color:var(--ink);cursor:pointer}',
    '.sb-row:last-child{border-bottom:0}.sb-row.out{opacity:.55}',
    '.sb-n{grid-area:n;font-size:16px}.sb-n em{font-style:normal;font-size:11px;font-weight:700;color:#1F3B63;background:#E7EEF7;border-radius:6px;padding:1px 5px;margin-left:6px;vertical-align:2px}',
    '.sb-j{grid-area:j;font-size:13px;color:var(--muted)}.sb-d{grid-area:d;font-size:12.5px;color:var(--muted);text-align:right;align-self:center;line-height:1.4}.sb-d i{font-style:normal;color:var(--warn,#B23A48);font-weight:700}',
    '.sb-acts{display:flex;gap:8px;margin:0 0 10px}.sb-acts .sb-go{flex:1}',
    '.sb-go{min-height:52px;border:0;border-radius:14px;background:var(--sbm);color:#fff;font:800 16px inherit;font-family:inherit;cursor:pointer;padding:0 14px}.sb-go[disabled]{opacity:.5}',
    '.sb-2{background:var(--surface,#fff);color:var(--ink);border:1.5px solid var(--line)}',
    '.sb-link{border:0;background:none;color:var(--sbm);font:700 14px inherit;font-family:inherit;text-decoration:underline;cursor:pointer;padding:6px}.sb-del{color:var(--warn,#B23A48)}',
    '.sb-f{display:grid;grid-template-columns:72px 1fr;gap:8px;align-items:center;margin:0 0 8px;font-weight:700;font-size:14px}',
    '.sb-f input,.sb-f select{min-height:44px;border:1.5px solid var(--line);border-radius:10px;padding:0 10px;font:16px inherit;font-family:inherit;background:var(--surface,#fff);color:var(--ink);width:100%;box-sizing:border-box}',
    '.sb-ta{width:100%;box-sizing:border-box;border:1.5px solid var(--line);border-radius:12px;padding:10px;font:14px/1.5 ui-monospace,monospace;background:var(--surface,#fff);color:var(--ink)}',
    '.sb-pv{max-height:40vh;overflow:auto;border:1px solid var(--line);border-radius:12px;padding:6px 10px;margin:0 0 10px;font-size:13.5px;line-height:1.7}.sb-pv.bad{border-color:#E9B6BE;background:#FDF1F3;color:#8C2333}',
    '.sb-tip{margin:8px 0 0;color:var(--muted);font-size:13px;line-height:1.5}.sb-tot{margin:0 0 8px;font-size:14.5px}.sb-errc{color:var(--warn,#B23A48)}',
    '.sb-ok{margin:0 0 12px;padding:10px 12px;border-radius:12px;background:#E5F4EA;color:#1F5130;font-size:14px;font-weight:700}',
    '.sb-err{margin:8px 0 0;color:var(--warn,#B23A48);font-weight:700;font-size:14px}',
    '.sb-warn{margin:10px 0 0;color:#8A5A00;background:#FDF3DC;border-radius:10px;padding:8px 10px;font-size:13.5px}',
    '.sb-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.sb-chips button{min-height:40px;padding:0 12px;border:1.5px dashed var(--line);border-radius:99px;background:var(--surface,#fff);font:700 14px inherit;font-family:inherit;color:var(--ink);cursor:pointer}'
  ].join('\n');
  document.head.appendChild(css);
  window.StaffBook = { open: open, close: close, normDate: normDate, parsePaste: parsePaste, tenure: tenure, _F: function () { return F; } };
})();

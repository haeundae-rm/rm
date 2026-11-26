// autoreload.js — 쉬는 순간 자동 새로고침 (2026-11-26)
// 세 저장소(rm/app · dirty · hub)에 같은 파일이 들어 있음. 고칠 때는 세 곳 모두 똑같이 고칠 것.
//
// 하는 일: version.json 을 가끔 읽어 새 버전이 나왔으면, '지금 바꿔도 안전한 순간'에 조용히 새로 고침.
//   - 안전한 순간 = 인터넷 연결됨 + 입력 중 아님(글자 쓰는 칸 · 쓰다 만 글 없음) + 앱이 '괜찮다'(safe) + 아래 중 하나
//       ① 화면을 안 보고 있음(다른 앱 · 화면 꺼짐)
//       ② 화면을 다시 켠 뒤 아직 아무것도 안 만짐 (켜자마자 0.5초 안에 바뀜)
//       ③ 마지막으로 만진 지 idleMin 분 지남
//   - 같은 버전으로 두 번까지만 시도 (휴대폰에 옛 화면이 남아 계속 새로 고치는 일 방지)
//   - 주소 끝에 ?r=새버전 을 붙여 열어서 휴대폰에 남은 옛 화면(10분 캐시)을 건너뜀
// 쓰는 법: AutoReload.start({ key, cur, url, safe, onNew, idleMin })
//   cur  = 이 화면의 버전 글자 (없으면 '처음 열었을 때 version.json 값'과 비교 = 허브 하위 화면용)
//   safe = () => true/false  (창 열림 · 저장 대기 · 작업 중이면 false)
//   onNew = v => {}          (새 버전 띠 보여 주기 등. 자동으로 못 바꿀 때도 사람이 누를 수 있게)
(function () {
  'use strict';
  if (window.AutoReload) return;
  var MAX_TRY = 2;
  var O = null, base = '', newV = '', lastAct = 0, shownAt = 0, timer = 0, checking = false, stopped = false;

  function now() { return Date.now(); }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  function visible(el) { return !!(el && (el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length))); }
  var TEXTY = /^(text|search|tel|url|email|number|password|date|time|datetime-local|month|week)$/;
  // 입력 중인지: 글자 칸에 커서가 있거나, 보이는 칸에 쓰다 만 글(처음 값과 다름)이 있으면 입력 중
  function editing() {
    var a = document.activeElement;
    if (a && a !== document.body) {
      var tg = (a.tagName || '').toLowerCase();
      if (tg === 'textarea' || tg === 'select' || a.isContentEditable) return true;
      if (tg === 'input' && TEXTY.test((a.type || 'text').toLowerCase())) return true;
    }
    var L = document.querySelectorAll('textarea, input');
    for (var i = 0; i < L.length; i++) {
      var e = L[i], tg2 = e.tagName.toLowerCase();
      if (tg2 === 'input' && !TEXTY.test((e.type || 'text').toLowerCase())) continue;
      if (e.readOnly || e.disabled || !visible(e)) continue;
      if (String(e.value || '') !== String(e.defaultValue || '')) return true;
    }
    return false;
  }

  function why() {   // 지금 못 바꾸는 이유 (없으면 '')
    if (stopped) return 'stop';
    if (!newV) return 'none';
    if (navigator.onLine === false) return 'offline';
    var n = Number(ss('ar:' + O.key + ':' + newV) || 0);
    if (n >= MAX_TRY) return 'tried';
    if (editing()) return 'editing';
    try { if (O.safe && !O.safe()) return 'busy'; } catch (e) { return 'busy'; }
    var hidden = document.visibilityState === 'hidden';
    var idle = now() - lastAct >= O.idleMin * 60000;
    var fresh = lastAct < shownAt;   // 화면을 켠 뒤 아직 안 만짐
    if (!(hidden || idle || fresh)) return 'active';
    return '';
  }
  function go() {
    var w = why();
    if (w) return w;
    var k = 'ar:' + O.key + ':' + newV;
    ss(k, String(Number(ss(k) || 0) + 1));
    var u;
    try { u = new URL(location.href); u.searchParams.set('r', newV); u = u.href; } catch (e) { u = location.href; }
    stopped = true;
    try { (O.go || function (x) { location.replace(x); })(u); } catch (e) { location.reload(); }
    return 'go';
  }

  function found(v) {
    if (!v || v === newV) { go(); return; }
    newV = v;
    try { O.onNew && O.onNew(v); } catch (e) {}
    go();
  }
  function fromCache() {
    try { var n = performance.getEntriesByType('navigation')[0]; return !!(n && n.transferSize === 0 && n.decodedBodySize > 0); } catch (e) { return false; }
  }
  function check() {
    if (checking || stopped) return Promise.resolve();
    checking = true;
    var url = O.url + (O.url.indexOf('?') >= 0 ? '&' : '?') + 't=' + now();
    return (O.fetch || fetch)(url, { cache: 'no-store' }).then(function (r) { return r && r.ok !== false ? r.json() : null; }).then(function (j) {
      checking = false;
      var v = j && j.v ? String(j.v) : '';
      if (!v) return;
      if (O.cur) { if (v !== O.cur) found(v); return; }
      // 버전 글자가 없는 화면: 처음 읽은 값을 기준으로. 단, 이 화면을 지난번에 다른 버전 때 열었고 지금 화면이 휴대폰 사본이면 옛 화면일 수 있음
      if (!base) {
        base = v;
        var last = ls('ar:last:' + O.key);
        ls('ar:last:' + O.key, v);
        if (last && last !== v && fromCache()) found(v);
        return;
      }
      if (v !== base) found(v);
    }, function () { checking = false; });
  }

  function act() { lastAct = now(); }
  function tick() {
    if (stopped) return;
    if (newV) go();
    if (document.visibilityState !== 'hidden' && now() - (O._lastCheck || 0) >= O.everyMin * 60000) { O._lastCheck = now(); check(); }
  }

  window.AutoReload = {
    start: function (o) {
      if (O) return window.AutoReload;
      O = { key: 'app', cur: '', url: 'version.json', safe: null, onNew: null, idleMin: 2, everyMin: 5, tickSec: 30 };
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) O[k] = o[k];
      shownAt = now(); lastAct = 0;
      ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input'].forEach(function (t) { document.addEventListener(t, act, { capture: true, passive: true }); });
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') { if (newV) go(); else check(); return; }   // 화면 끌 때 한 번 더 확인 → 새 버전이면 안 보는 사이에 바꿈
        shownAt = now(); O._lastCheck = now();
        if (newV) go(); else check();
      });
      window.addEventListener('online', function () { if (newV) go(); });
      timer = setInterval(tick, O.tickSec * 1000);
      O._lastCheck = now();
      check();
      return window.AutoReload;
    },
    check: check,
    state: function () { return { newV: newV, base: base, why: O ? why() : 'off', idleSec: Math.round((now() - lastAct) / 1000) }; },
    stop: function () { stopped = true; clearInterval(timer); }
  };
})();

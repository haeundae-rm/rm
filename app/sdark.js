// 삼성 인터넷 다크 모드 안내 띠 (2026-11-06)
// 삼성 인터넷은 휴대폰이 다크 모드면 웹 화면 색을 브라우저가 강제로 뒤집음 — 사이트에서 막을 수 없어서 바꾸는 방법만 알려 줌
// 레포트(rm)·정비 지원(dirty) 같은 파일. 화면 머리(header) 바로 아래, #main 앞에 붙임 (#main 은 다시 그려져도 띠는 안 지워짐)
(function () {
  var KEY = 'sdark_hide_until';
  if (!/SamsungBrowser/i.test(navigator.userAgent) || !window.matchMedia) return;
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  function hidden() { try { return Date.now() < Number(localStorage.getItem(KEY) || 0); } catch (e) { return false; } }
  function remove() { var o = document.getElementById('sdark'); if (o) o.remove(); }
  function show() {
    if (!mq.matches || hidden()) { remove(); return; }
    if (document.getElementById('sdark')) return;
    var main = document.getElementById('main'); if (!main) return;
    var d = document.createElement('div');
    d.id = 'sdark'; d.setAttribute('role', 'note');
    d.style.cssText = 'max-width:760px;margin:12px auto 0;padding:0 16px;box-sizing:border-box';
    d.innerHTML = '<div style="display:flex;gap:10px;align-items:center;background:#FFF4D6;color:#4A3500;border-radius:16px;padding:12px 14px;font:500 14px/1.5 \'Noto Sans KR\',sans-serif">' +
      '<span style="flex:1"><b style="display:block;font-size:15px;font-weight:900">화면이 어둡게 보이나요?</b>삼성 인터넷이 다크 모드라 색이 바뀌어 보여요. 아래 메뉴 <b>(≡)</b>에서 <b>라이트 모드</b>를 누르면 원래 밝은 화면으로 보여요.</span>' +
      '<button type="button" style="border:0;background:#4A3500;color:#fff;border-radius:10px;padding:10px 14px;font:800 14px \'Noto Sans KR\',sans-serif;cursor:pointer;white-space:nowrap">확인</button></div>';
    d.querySelector('button').addEventListener('click', function () {
      try { localStorage.setItem(KEY, String(Date.now() + 7 * 864e5)); } catch (e) {}   // 7일 동안 안 보임 (계속 다크면 다시 알려 줌)
      remove();
    });
    main.parentNode.insertBefore(d, main);
  }
  if (mq.addEventListener) mq.addEventListener('change', show); else if (mq.addListener) mq.addListener(show);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
})();

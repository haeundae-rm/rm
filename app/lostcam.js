// 📷 습득물 앱 안 카메라 (2026-11-22, 소장님: "카메라 창 위에 안내 띠") — 인스펙션 연속 촬영(hub/insp/cam.js)을 한 장 찍기로 줄임
// · 위 띠 "습득물을 가운데 놓고 찍어 주세요 · AI가 판독해요" + 가이드 네모 + 큰 셔터 · 🖼 앨범 · ✕
// · 사진이 휴대폰 갤러리에 안 남음 (고객 카드 · 신분증 사진이 메이드 휴대폰에 쌓이지 않게)
// · 카메라를 못 열면(허용 안 함 · 오래된 기기) [기본 카메라로 찍기] 버튼 → 지금까지처럼 휴대폰 카메라 앱
// openLostCam({ onShot(blob), onAlbum(), onNative(), onClose(), more }) — 화면 하나만 띄움
let st = null;
export const camOk = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

async function start() {
  halt();
  const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } } });
  if (!st) { s.getTracks().forEach(t => t.stop()); return; }
  st.stream = s;
  const v = st.el.querySelector('video'); v.srcObject = s; await v.play().catch(() => {});
  const tr = s.getVideoTracks()[0];
  st.ic = window.ImageCapture ? new ImageCapture(tr) : null;
  try { const c = tr.getCapabilities && tr.getCapabilities(); if (c && c.focusMode && c.focusMode.includes('continuous')) await tr.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (e) {}
  st.el.classList.add('live');
}
function halt() { if (st && st.stream) { st.stream.getTracks().forEach(t => t.stop()); st.stream = null; } }
export function closeLostCam() {
  if (!st) return;
  halt(); st.el.remove(); document.removeEventListener('visibilitychange', st.vis); st = null;
}
async function grab() {
  if (st.ic) { try { const b = await st.ic.takePhoto(); if (b && b.size) return b; } catch (e) { st.ic = null; } }
  const v = st.el.querySelector('video'), w = v.videoWidth, h = v.videoHeight;
  if (!w || !h) throw new Error('no frame');
  const s = Math.min(1, 1920 / Math.max(w, h)), cv = document.createElement('canvas'); cv.width = Math.round(w * s); cv.height = Math.round(h * s);
  cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
  return new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9));
}
function failUi(msg) {
  if (!st) return;
  st.el.classList.remove('live'); st.el.classList.add('fail');
  st.el.querySelector('.lc-fail').innerHTML = '<b>' + msg + '</b><span>휴대폰 카메라 앱으로 찍어도 똑같이 접수돼요.</span><button data-lc="native">📷 기본 카메라로 찍기</button>';
}
export async function openLostCam(o) {
  closeLostCam();
  const el = document.createElement('div'); el.className = 'lcam';
  el.innerHTML = '<video playsinline muted autoplay></video>' +
    '<div class="lc-top"><b>📷 습득물을 가운데 놓고 찍어 주세요</b><span>' + (o.more ? '한 장 더 찍어요 · 다른 면이나 상표가 보이게' : '찍으면 AI가 품목을 판독해요') + '</span></div>' +
    '<div class="lc-box"><i></i><i></i><i></i><i></i></div><div class="lc-fail"></div><div class="lc-flash"></div>' +
    '<div class="lc-bar"><button class="lc-side" data-lc="album">🖼<span>앨범</span></button><button class="lc-shot" data-lc="shot" aria-label="찍기"></button><button class="lc-side" data-lc="x">✕<span>닫기</span></button></div>';
  document.body.appendChild(el);
  st = { el, busy: false, vis: () => { if (!st) return; if (document.visibilityState === 'hidden') halt(); else if (!st.el.classList.contains('fail')) start().catch(() => failUi('카메라를 다시 켜지 못했어요')); } };
  document.addEventListener('visibilitychange', st.vis);
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-lc]'); if (!b || !st) return;
    const a = b.getAttribute('data-lc');
    if (a === 'x') { closeLostCam(); o.onClose && o.onClose(); return; }
    if (a === 'album') { closeLostCam(); o.onAlbum(); return; }       // 누른 순간에 파일 고르기를 열어야 함
    if (a === 'native') { closeLostCam(); o.onNative(); return; }
    if (a !== 'shot' || st.busy || !st.stream) return;
    st.busy = true;
    const f = el.querySelector('.lc-flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
    if (navigator.vibrate) try { navigator.vibrate(20); } catch (x) {}
    try { const blob = await grab(); closeLostCam(); o.onShot(blob); }
    catch (x) { if (st) { st.busy = false; el.querySelector('.lc-top span').textContent = '사진을 못 찍었어요 — 다시 눌러 주세요'; } }
  });
  if (!camOk()) { failUi('이 휴대폰은 앱 안 카메라가 안 돼요'); return; }
  try { await start(); }
  catch (e) { failUi(e && e.name === 'NotAllowedError' ? '카메라 사용이 막혀 있어요' : '카메라를 열지 못했어요'); }
}

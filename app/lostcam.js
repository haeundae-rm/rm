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
// 11/25 소장님: "찍을 땐 가깝게 보이는데 결과는 멀리 찍은 것처럼 나옴"
//   화면은 카메라 영상을 꽉 채우려고 가장자리를 잘라 보여 줌(object-fit:cover) + takePhoto 는 센서 전체(더 넓게)를 찍음
//   → 찍은 사진을 '노란 네모 안(+조금 여유)'으로 잘라서, 화면에서 본 크기 그대로 나오게 함
const MARGIN = 0.06;   // 네모 바깥 여유 (네모 한 변의 6%)
function cropOf(srcW, srcH) {
  const v = st.el.querySelector('video'), box = st.el.querySelector('.lc-box');
  const vr = v.getBoundingClientRect(), br = box.getBoundingClientRect();
  if (!vr.width || !vr.height || !br.width || !br.height) return null;
  const s = Math.max(vr.width / srcW, vr.height / srcH);           // 화면 1px = 원본 1/s px (cover)
  const ox = (srcW * s - vr.width) / 2, oy = (srcH * s - vr.height) / 2;   // 화면 밖으로 잘린 만큼
  const mx = br.width * MARGIN, my = br.height * MARGIN;
  let x0 = (br.left - vr.left - mx + ox) / s, y0 = (br.top - vr.top - my + oy) / s;
  let x1 = (br.right - vr.left + mx + ox) / s, y1 = (br.bottom - vr.top + my + oy) / s;
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(srcW, x1); y1 = Math.min(srcH, y1);
  return x1 - x0 > 50 && y1 - y0 > 50 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
function cut(src, srcW, srcH, cr) {
  if (!cr) cr = { x: 0, y: 0, w: srcW, h: srcH };
  const s = Math.min(1, 1920 / Math.max(cr.w, cr.h)), cv = document.createElement('canvas'); cv.width = Math.round(cr.w * s); cv.height = Math.round(cr.h * s);
  cv.getContext('2d').drawImage(src, cr.x, cr.y, cr.w, cr.h, 0, 0, cv.width, cv.height);
  return new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9));
}
async function grab() {
  const v = st.el.querySelector('video'), w = v.videoWidth, h = v.videoHeight;
  // 고화질 사진(takePhoto)은 영상과 가로세로 비율이 같을 때만 씀 (비율이 다르면 센서 잘린 위치를 알 수 없어 네모와 어긋남)
  if (st.ic && w && h) {
    try {
      const b = await st.ic.takePhoto();
      if (b && b.size) {
        const bmp = await createImageBitmap(b);
        if (Math.abs(bmp.width / bmp.height - w / h) < 0.02) { const k = bmp.width / w, cr = cropOf(w, h); return cut(bmp, bmp.width, bmp.height, cr && { x: cr.x * k, y: cr.y * k, w: cr.w * k, h: cr.h * k }); }
      }
    } catch (e) { st.ic = null; }
  }
  if (!w || !h) throw new Error('no frame');
  return cut(v, w, h, cropOf(w, h));
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

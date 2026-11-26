// 🧳 습득물 접수 (2026-11-22, 소장님 설계) — 카톡에 사진 올리고 글 적는 것보다 편해야 쓴다
//   [🧳 습득물] → 카메라 → 내 객실 버튼 한 번 (🎤 말하기 · 번호 입력 · 복도는 예비) → AI가 품목 · 분류 → 접수 카드 이미지 → [카카오톡으로 공유]
//   저장: lost/{id} (대장 한 줄) + lost_img/{id} (사진, 대장에서 볼 때만 읽음). 허브 '🧳 습득물 관리대장'이 오더테이커 대장을 대신함 (규칙 v27)
//   카톡은 웹에서 특정 방으로 바로 못 보냄 → 휴대폰 공유 창 → 카카오톡 → 룸메이드 단톡방 (단톡방을 맨 위에 고정해 두면 한 번)
import { readLost, setCfg, CATS } from './lostai.js?v=2026.11.26-6';
import { openLostCam, closeLostCam, camOk } from './lostcam.js?v=2026.11.26-6';   // 📷 앱 안 카메라 (안내 띠)

const MAXP = 3;
const PLACE = { 귀중품: '귀중품 보관함', 음식: '습득물 냉장고', 파손주의: '파손주의 보관함' };
export const placeOf = cat => PLACE[cat] || '습득물 보관';
const DIG = { 공: 0, 영: 0, 빵: 0, 일: 1, 하나: 1, 이: 2, 둘: 2, 삼: 3, 셋: 3, 사: 4, 넷: 4, 오: 5, 육: 6, 륙: 6, 칠: 7, 팔: 8, 구: 9 };

/** 말한 글 → 객실 번호 ('천삼백오호' · '일삼공오' · '1305호' · '13층 5호') — 못 찾으면 '' */
export function roomFromSpeech(t) {
  t = String(t || '').replace(/\s+/g, '');
  let m = /(\d{3,4})/.exec(t); if (m) return m[1];
  m = /(\d{1,2})층(\d{1,2})호/.exec(t); if (m) return m[1] + ('0' + m[2]).slice(-2);
  const s = t.replace(/호.*$/, '');
  if (/[천백십]/.test(s)) {
    let n = 0, cur = 0, ok = false;
    for (const ch of s) {
      if (DIG[ch] !== undefined) { cur = DIG[ch]; ok = true; }
      else if (ch === '천') { n += (cur || 1) * 1000; cur = 0; ok = true; }
      else if (ch === '백') { n += (cur || 1) * 100; cur = 0; ok = true; }
      else if (ch === '십') { n += (cur || 1) * 10; cur = 0; ok = true; }
    }
    n += cur;
    return ok && n >= 100 && n <= 9999 ? String(n) : '';
  }
  let d = '';
  for (const ch of s) if (DIG[ch] !== undefined) d += DIG[ch];
  return /^\d{3,4}$/.test(d) ? d : '';
}

export function setupLost(ctx) {
  const { S, esc } = ctx;
  let L = null, input = null, cfgDone = false, rec = null;
  const $ = s => document.querySelector(s);
  const day = () => ctx.today();
  const md = d => Number(d.slice(5, 7)) + '월 ' + Number(d.slice(8)) + '일';
  const hm = t => { const d = new Date(t + 9 * 3600e3); return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); };

  // ---------- 사진 받기 (11/22 오후: 앱 안 카메라 + 안내 띠. 안 되면 휴대폰 기본 카메라 / 앨범)
  //   파일 고르기 · 기본 카메라는 누른 순간에 열어야 해서 input 을 미리 만들어 둠
  let inCam = null, inAlb = null;
  function mkInput(cap) {
    const x = document.createElement('input'); x.type = 'file'; x.accept = 'image/*'; if (cap) x.setAttribute('capture', 'environment');
    x.style.display = 'none'; document.body.appendChild(x);
    x.addEventListener('change', () => { const f = x.files && x.files[0]; x.value = ''; if (f) got(f); });
    return x;
  }
  const native = () => { if (!inCam) inCam = mkInput(true); inCam.click(); };
  const album = () => { if (!inAlb) inAlb = mkInput(false); inAlb.click(); };
  const LS = 'lf_cam';   // 앱 안 카메라가 막힌 휴대폰은 7일 동안 바로 기본 카메라 (터치 한 번 아끼기)
  function camBlocked() { try { return Number(localStorage.getItem(LS) || 0) > Date.now(); } catch (e) { return false; } }
  function pick() {
    if (!camOk() || camBlocked()) { native(); return; }
    openLostCam({
      more: !!(L && L.stage !== 'done' && L.photos.length),
      onShot: b => got(b), onAlbum: album,
      onNative: () => { try { localStorage.setItem(LS, String(Date.now() + 7 * 864e5)); } catch (e) {} native(); },
      onClose: () => {}
    });
  }
  async function shrink(blob, side, q) {
    const bmp = await createImageBitmap(blob);
    const s = Math.min(1, side / Math.max(bmp.width, bmp.height)), cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    return { url: cv.toDataURL('image/jpeg', q), w: cv.width, h: cv.height, bmp };
  }
  async function got(f) {
    if (!cfgDone) { cfgDone = true; S.get('meta/insp_ai').then(c => setCfg(c || {}), () => {}); }
    const first = !L || L.stage === 'done';
    if (first) { L = { stage: 'room', photos: [], room: '', ai: 'busy', item: '', cat: '', police: false, note: '', card: null, err: '', saving: false, saved: false, voice: '', num: '' }; ctx.setDlg({ kind: 'lost' }); }
    draw();
    let p;
    try { const a = await shrink(f, 720, 0.72); const big = await shrink(f, 1024, 0.8); p = { url: a.url, bmp: big.bmp, b64: big.url.slice(big.url.indexOf(',') + 1) }; }
    catch (e) { L.err = '사진을 열지 못했어요. 카메라로 다시 찍어 주세요.'; if (!L.photos.length) L.ai = null; draw(); return; }
    if (L.photos.length >= MAXP) return;
    L.photos.push(p); L.err = '';
    if (L.photos.length === 1) {
      const me = L; L.aiAt = Date.now();
      setTimeout(() => { if (L === me && L.ai === 'busy') { L.ai = null; if (!L.cat) L.cat = '기타'; L.aiSlow = true; render(); } }, 20000);   // 20초 넘으면 손으로 적게
      readLost(p.b64).then(r => {
        if (!L || L !== me || L.ai !== 'busy') return;
        L.ai = r || null;
        if (r) { if (!L.item) L.item = r.item; if (!L.cat) { L.cat = r.cat; L.police = r.police; } if (!L.room && r.room && L.stage === 'room' && myRooms().some(x => x.room === r.room)) L.aiRoom = r.room; }
        else if (!L.cat) L.cat = '기타';
        render();
      });
    }
    render();
  }

  // ---------- 오늘 내 객실 (방금 완료한 방이 맨 앞)
  function myRooms() {
    const R = ctx.myRooms() || [];
    return R.slice().sort((a, b) => (b.at || 0) - (a.at || 0) || (a.i || 0) - (b.i || 0));
  }
  function chooseRoom(r) { L.room = r; L.stage = 'card'; render(); }

  // ---------- 🎤 말하기
  function listen() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { L.stage = 'num'; draw(); return; }
    try { if (rec) rec.abort(); } catch (e) {}
    rec = new SR(); rec.lang = 'ko-KR'; rec.interimResults = false; rec.maxAlternatives = 3;
    L.voice = 'on'; draw();
    rec.onresult = e => {
      const alts = []; for (let i = 0; i < e.results[0].length; i++) alts.push(e.results[0][i].transcript);
      const r = alts.map(roomFromSpeech).filter(Boolean)[0] || '';
      L.voice = r ? '' : '"' + (alts[0] || '') + '" — 번호를 못 알아들었어요. 다시 말하거나 번호 입력을 눌러 주세요.';
      if (r) chooseRoom(r); else draw();
    };
    rec.onerror = e => { L.voice = e && e.error === 'not-allowed' ? '마이크가 막혀 있어요. 번호 입력을 써 주세요.' : '잘 안 들렸어요. 다시 눌러 주세요.'; draw(); };
    rec.onend = () => { if (L && L.voice === 'on') { L.voice = ''; draw(); } };
    try { rec.start(); } catch (e) { L.voice = '마이크를 켜지 못했어요. 번호 입력을 써 주세요.'; draw(); }
  }

  // ---------- 접수 카드 (공유용 이미지 1080 너비)
  function noOf() { return day().slice(5).replace('-', '') + '-' + (/^\d+$/.test(L.room) ? L.room : '공용'); }
  function wrap(c, text, maxW) {
    const out = []; let line = '';
    for (const ch of String(text)) { if (c.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch; }
    if (line) out.push(line); return out;
  }
  async function makeCard() {
    if (!L || !L.photos.length) return;
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
    const W = 1080, P = 56, F = '"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
    const ph = L.photos, gap = 12, pw = W - P * 2;
    const ratio = ph[0].bmp.height / ph[0].bmp.width, mainH = Math.round(Math.min(900, Math.max(520, pw * ratio)));
    const subH = ph.length > 1 ? Math.round((pw - gap * (ph.length - 2)) / (ph.length - 1) * 0.75) : 0;
    const cv = document.createElement('canvas'), c = cv.getContext('2d');
    c.font = '800 54px ' + F; const itemLines = wrap(c, L.item || '품목 확인 중', pw).slice(0, 3);
    const H = 150 + 28 + mainH + (subH ? gap + subH : 0) + 40 + 64 + itemLines.length * 70 + 30 + 110 + (L.police ? 96 : 0) + (L.note ? 70 : 0) + 110;
    cv.width = W; cv.height = H;
    c.fillStyle = '#F4F6F9'; c.fillRect(0, 0, W, H);
    // 머리띠
    c.fillStyle = '#10233F'; c.fillRect(0, 0, W, 150);
    c.fillStyle = '#C79A3B'; c.fillRect(0, 146, W, 6);
    c.fillStyle = '#fff'; c.font = '900 50px ' + F; c.textBaseline = 'middle'; c.fillText('🧳 습득물 접수', P, 62);
    c.font = '600 30px ' + F; c.fillStyle = 'rgba(255,255,255,.78)'; c.fillText(md(day()) + ' ' + hm(L.at || Date.now()) + ' · ' + (ctx.me() || ''), P, 112);
    c.textAlign = 'right'; c.fillStyle = '#fff'; c.font = '900 64px ' + F; c.fillText(/^\d+$/.test(L.room) ? L.room + '호' : '복도·공용', W - P, 78); c.textAlign = 'left';
    // 사진
    let y = 178;
    const cover = (bmp, x, yy, w, h) => { const s = Math.max(w / bmp.width, h / bmp.height), sw = w / s, sh = h / s; c.save(); rr(x, yy, w, h, 22); c.clip(); c.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, x, yy, w, h); c.restore(); };
    const rr = (x, yy, w, h, r) => { c.beginPath(); c.moveTo(x + r, yy); c.arcTo(x + w, yy, x + w, yy + h, r); c.arcTo(x + w, yy + h, x, yy + h, r); c.arcTo(x, yy + h, x, yy, r); c.arcTo(x, yy, x + w, yy, r); c.closePath(); };
    cover(ph[0].bmp, P, y, pw, mainH); y += mainH;
    if (subH) { const sw = (pw - gap * (ph.length - 2)) / (ph.length - 1); ph.slice(1).forEach((p, i) => cover(p.bmp, P + i * (sw + gap), y + gap, sw, subH)); y += gap + subH; }
    y += 40;
    // 품목 · 분류
    c.fillStyle = '#4B5563'; c.font = '700 30px ' + F; c.fillText('품목', P, y + 16); y += 64;
    c.fillStyle = '#111827'; c.font = '800 54px ' + F; itemLines.forEach(t => { c.fillText(t, P, y + 22); y += 70; });
    y += 30;
    const cat = L.cat || '기타', col = cat === '귀중품' ? '#B23A48' : cat === '음식' ? '#1E8E3E' : cat === '파손주의' ? '#8A5A00' : '#1D3A6E';
    c.font = '800 34px ' + F; const cw = c.measureText(cat).width + 48;
    c.fillStyle = col; rr(P, y, cw, 70, 35); c.fill(); c.fillStyle = '#fff'; c.fillText(cat, P + 24, y + 36);
    c.fillStyle = '#111827'; c.font = '700 34px ' + F; c.fillText('→ ' + placeOf(cat), P + cw + 22, y + 36);
    y += 110;
    if (L.police) { c.fillStyle = '#FDEDEF'; rr(P, y - 10, pw, 80, 18); c.fill(); c.fillStyle = '#B23A48'; c.font = '900 34px ' + F; c.fillText('🚨 찾아가지 않으면 경찰 인계 대상', P + 24, y + 30); y += 96; }
    if (L.note) { c.fillStyle = '#4B5563'; c.font = '600 32px ' + F; c.fillText('메모: ' + L.note.slice(0, 30), P, y + 20); y += 70; }
    // 아래
    c.fillStyle = '#10233F'; c.fillRect(0, H - 96, W, 96);
    c.fillStyle = '#fff'; c.font = '800 34px ' + F; c.fillText('접수번호 ' + noOf(), P, H - 48);
    c.textAlign = 'right'; c.font = '600 26px ' + F; c.fillStyle = 'rgba(255,255,255,.75)'; c.fillText('한화리조트 해운대 객실팀', W - P, H - 48); c.textAlign = 'left';
    const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.88));
    if (L.card && L.card.url) URL.revokeObjectURL(L.card.url);
    L.card = { blob, url: URL.createObjectURL(blob) };
  }
  let cardT = 0;
  function render() {
    if (!L) return;
    if (L.stage === 'card' || L.stage === 'done') { L.cardBusy = true; clearTimeout(cardT); cardT = setTimeout(() => makeCard().then(() => { if (L) L.cardBusy = false; draw(); }, () => { if (L) L.cardBusy = false; draw(); }), 60); }
    draw();
  }
  // 공유해도 되나: 판독이 끝났고(실패면 품목을 적었고) 카드가 그 내용으로 다시 만들어졌을 때만
  const ready = () => L && L.room && L.card && !L.cardBusy && L.ai !== 'busy' && !!String(L.item || '').trim();

  // ---------- 저장 (대장 한 줄 + 사진)
  function save() {
    if (L.saved || L.saving) return L.savedP;
    L.saving = true; L.at = L.at || Date.now();
    const d = day(), id = d + '_' + (/^\d+$/.test(L.room) ? L.room : 'x') + '_' + Date.now().toString(36).slice(-6);
    L.id = id; L.no = noOf();
    const ai = L.ai && typeof L.ai === 'object' ? { item: L.ai.item, cat: L.ai.cat, conf: L.ai.conf } : null;
    const doc = { v: 1, date: d, no: L.no, room: /^\d+$/.test(L.room) ? L.room : '공용', item: (L.item || '').trim().slice(0, 40) || '(사진 참고)', cat: L.cat || '기타', police: !!L.police,
      place: placeOf(L.cat), note: (L.note || '').trim().slice(0, 60), by: ctx.me(), src: 'app', ai, n: L.photos.length, chk: false, act: '', actDay: '', actBy: '', memo: '',
      clientAt: new Date(L.at), at: S.SERVER_TIME, uid: ctx.uid() };
    L.savedP = S.set('lost/' + id, doc)
      .then(() => S.set('lost_img/' + id, { p: L.photos.map(p => p.url), at: S.SERVER_TIME, uid: ctx.uid() }).catch(e => console.warn('습득물 사진 저장', e)))
      .then(() => { L.saved = true; L.saving = false; draw(); }, e => { L.saving = false; L.err = '대장에 저장하지 못했어요: ' + (e && (e.code || e.message) || e) + ' — 다시 눌러 주세요.'; draw(); throw e; });
    return L.savedP;
  }
  function shareText() { return '[습득물] ' + (/^\d+$/.test(L.room) ? L.room + '호' : '복도·공용') + ' ' + (L.item || '') + ' (' + (L.cat || '기타') + ' → ' + placeOf(L.cat) + ')' + (L.police ? ' 🚨경찰 인계 대상' : '') + ' · ' + ctx.me() + ' · ' + noOf(); }
  function share() {
    if (!ready() && L.stage !== 'done') return;
    if (!L.card || !L.card.blob) return;
    const file = new File([L.card.blob], '습득물_' + noOf() + '.jpg', { type: 'image/jpeg' });
    const text = shareText();
    // 공유 창은 누른 순간에 열어야 함 (기다리면 막힘) → 저장은 같이 시작
    save().catch(() => {});
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {}); } catch (e) {}
      navigator.share({ files: [file], text }).then(() => { L.shared = true; L.stage = 'done'; draw(); }, e => { if (e && e.name === 'AbortError') { L.err = ''; draw(); return; } L.err = '공유 창을 열지 못했어요. 아래 [사진 저장]으로 받아 카톡에 올려 주세요.'; draw(); });
    } else {
      // 11/25: 카톡 안 창(카카오톡에서 링크로 연 화면) 등 '사진 공유'를 못 하는 브라우저 → 사진으로 저장하고 보내는 방법을 안내
      try { if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {}); } catch (e) {}
      const a = document.createElement('a'); a.href = L.card.url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
      L.stage = 'done'; L.shared = false; L.dlTip = true; draw();
    }
  }
  function onlySave() { if (L.ai === 'busy' || !String(L.item || '').trim()) { L.err = L.ai === 'busy' ? 'AI 판독이 끝나면 접수할 수 있어요.' : '품목을 적어 주세요.'; draw(); return; } save().then(() => { L.stage = 'done'; draw(); }, () => {}); }

  // ---------- 그리기
  function draw() {
    const el = $('#sheet');
    if (!L || !ctx.dlg() || ctx.dlg().kind !== 'lost') return;
    let h = '<div class="lf"><div class="lf-top"><b>🧳 습득물 접수</b><button class="lf-x" data-lf="close" aria-label="닫기">✕</button></div><div class="lf-body">';
    const thumbs = '<div class="lf-ph">' + L.photos.map((p, i) => '<div><img src="' + p.url + '" alt="사진 ' + (i + 1) + '">' + (L.photos.length > 1 && L.stage !== 'done' ? '<button data-lf="rmph" data-i="' + i + '" aria-label="사진 빼기">✕</button>' : '') + '</div>').join('') +
      (L.photos.length < MAXP && L.stage !== 'done' ? '<button class="lf-add" data-lf="more">📷<span>한 장 더</span></button>' : '') + '</div>';
    const aiLine = L.ai === 'busy' ? '<p class="lf-ai">🤖 사진을 읽는 중…</p>' : L.ai ? '<p class="lf-ai ok">🤖 ' + esc(L.ai.item || '') + ' · ' + esc(L.ai.cat) + '</p>' : L.photos.length ? '<p class="lf-ai">🤖 사진을 못 읽었어요 — 품목만 적어 주세요</p>' : '';
    if (L.stage === 'room' || L.stage === 'num') {
      const R = myRooms();
      h += thumbs + aiLine + '<h3>어느 객실인가요?</h3>';
      if (L.stage === 'num') {
        h += '<div class="lf-num"><input id="lf-num" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="1305" value="' + esc(L.num) + '"><button class="lf-go" data-lf="numok">확인</button></div>' +
          '<button class="lf-sub" data-lf="back">← 내 객실에서 고르기</button>';
      } else {
        h += (R.length ? '<div class="lf-rooms">' + R.map((x, i) => '<button data-lf="room" data-r="' + esc(x.room) + '" class="' + (i === 0 && x.at ? 'last' : '') + (L.aiRoom === x.room ? ' ai' : '') + '">' + esc(x.room) + (i === 0 && x.at ? '<small>방금 한 방</small>' : x.at ? '<small>완료</small>' : '') + '</button>').join('') + '</div>'
          : '<p class="lf-note">오늘 배정 객실이 아직 없어요. 말하거나 번호를 눌러 주세요.</p>') +
          '<div class="lf-alt"><button data-lf="mic">🎤 말로 하기</button><button data-lf="num">⌨ 번호 입력</button><button data-lf="room" data-r="공용">복도·공용</button></div>' +
          (L.voice === 'on' ? '<p class="lf-voice on">🎤 듣고 있어요… "천삼백오호"처럼 말해 주세요</p>' : L.voice ? '<p class="lf-voice">' + esc(L.voice) + '</p>' : '');
      }
    } else if (L.stage === 'card') {
      const wait = L.ai === 'busy' ? '<div class="lf-wait"><i></i><div>🤖 AI가 품목을 판독하는 중이에요<small>잠시만요 · 끝나면 공유 버튼이 켜져요</small></div></div>'
        : !String(L.item || '').trim() ? '<div class="lf-wait" style="animation:none"><div>✍ 품목을 적어 주세요<small>' + (L.aiSlow ? 'AI 판독이 늦어요' : 'AI가 사진을 못 읽었어요') + ' · 아래 "품목"에 적으면 공유 버튼이 켜져요</small></div></div>' : '';
      const ok = ready();
      h += wait + '<div class="lf-card">' + (L.card ? '<img src="' + L.card.url + '" alt="접수 카드">' : '<p class="lf-note" style="padding:20px">카드를 만드는 중…</p>') + '</div>' +
        '<button class="lf-kakao' + (ok ? '' : ' wait') + '" data-lf="share"' + (ok ? '' : ' disabled') + '>' + (ok ? '💬 카카오톡으로 공유' : L.ai === 'busy' ? '⏳ 판독이 끝나면 공유할 수 있어요' : !String(L.item || '').trim() ? '품목을 적으면 공유할 수 있어요' : '⏳ 카드 만드는 중…') + '</button>' +
        '<p class="lf-note">카카오톡 → <b>룸메이드 단톡방</b>을 골라 주세요. 글도 복사돼 있어요.</p>' + (L.ai === 'busy' ? '' : aiLine) +
        '<label class="lf-f"><span>품목 (틀리면 고쳐 주세요)</span><input id="lf-item" maxlength="40" value="' + esc(L.item) + '" placeholder="예: 무선 이어폰 (흰색)"></label>' +
        '<div class="lf-cats">' + CATS.map(c => '<button data-lf="cat" data-c="' + c + '" aria-pressed="' + (L.cat === c) + '">' + c + '</button>').join('') + '</div>' +
        '<label class="lf-ck"><input type="checkbox" id="lf-police"' + (L.police ? ' checked' : '') + '> 🚨 경찰 인계 대상 (카드 · 신분증 · 현금 · 고가품)</label>' +
        '<label class="lf-f"><span>메모 (선택)</span><input id="lf-note" maxlength="60" value="' + esc(L.note) + '" placeholder="예: 침대 밑, 옷장 안"></label>' +
        (L.err ? '<p class="lf-err">' + esc(L.err) + '</p>' : '') +
        '<div class="lf-row"><button class="lf-sub" data-lf="save"' + (L.saving ? ' disabled' : '') + '>' + (L.saving ? '저장 중…' : '공유 없이 접수만') + '</button><button class="lf-sub" data-lf="reroom">객실 다시 고르기</button></div>';
    } else if (L.stage === 'done') {
      h += '<div class="lf-done"><b>' + (L.saved ? '✅ 대장에 접수됐어요' : L.saving ? '⏳ 대장에 저장하는 중…' : '⚠ 아직 저장 안 됨') + '</b><span>접수번호 <i>' + esc(L.no || noOf()) + '</i> · 물건 봉투에 이 번호를 적어 주세요</span></div>' +
        (L.card ? '<div class="lf-card sm"><img src="' + L.card.url + '" alt="접수 카드"></div>' : '') +
        (L.err ? '<p class="lf-err">' + esc(L.err) + '</p>' : '') +
        (L.dlTip ? '<p class="lf-tip">📥 ' + (/KAKAOTALK/i.test(navigator.userAgent) ? '카톡 안에서 연 화면은' : '이 휴대폰 화면은') + ' 바로 공유가 안 돼서 <b>사진으로 저장했어요</b>.<br>카톡 단톡방 → <b>＋</b> → <b>앨범</b>에서 방금 사진을 보내 주세요.</p>' : '') +
        (!L.saved && !L.saving ? '<button class="lf-go" data-lf="save">다시 저장</button>' : '') +
        '<div class="lf-row"><button class="lf-sub" data-lf="share">' + (L.shared ? '다시 공유' : '💬 카카오톡으로 공유') + '</button><button class="lf-sub" data-lf="dl">사진 저장</button></div>' +
        '<button class="lf-go" data-lf="next">🧳 하나 더 접수</button><button class="lf-sub" data-lf="close">닫기</button>';
    }
    if (L.err && L.stage !== 'card' && L.stage !== 'done') h += '<p class="lf-err">' + esc(L.err) + '</p>';
    el.innerHTML = h + '</div></div>';
  }
  function readForm() {
    const i = $('#lf-item'), n = $('#lf-note'), p = $('#lf-police');
    if (i) L.item = i.value; if (n) L.note = n.value; if (p) L.police = p.checked;
  }
  document.addEventListener('change', e => { if (L && e.target && e.target.closest && e.target.closest('.lf') && /^lf-(item|note|police)$/.test(e.target.id)) { readForm(); render(); } });
  document.addEventListener('input', e => { if (L && e.target && e.target.id === 'lf-num') L.num = e.target.value.replace(/\D/g, '').slice(0, 4); });
  document.addEventListener('keydown', e => { if (L && e.key === 'Enter' && e.target && e.target.id === 'lf-num') { e.preventDefault(); click('numok'); } });
  function click(a, t) {
    if (L && L.stage === 'card') readForm();
    if (a === 'close') { close(); return; }
    if (a === 'more') { pick(); return; }
    if (a === 'rmph') { L.photos.splice(Number(t.getAttribute('data-i')), 1); render(); return; }
    if (a === 'room') { chooseRoom(t.getAttribute('data-r')); return; }
    if (a === 'mic') { listen(); return; }
    if (a === 'num') { L.stage = 'num'; draw(); setTimeout(() => { const f = $('#lf-num'); if (f) f.focus(); }, 50); return; }
    if (a === 'back' || a === 'reroom') { L.stage = 'room'; draw(); return; }
    if (a === 'numok') { if (/^\d{3,4}$/.test(L.num)) chooseRoom(L.num); else { L.err = '객실 번호 3~4자리를 넣어 주세요.'; draw(); } return; }
    if (a === 'cat') { L.cat = t.getAttribute('data-c'); L.police = L.cat === '귀중품' ? true : (L.ai && L.ai.police && L.ai.cat !== '귀중품' ? L.police : false); render(); return; }
    if (a === 'share') { share(); return; }
    if (a === 'save') { L.err = ''; if (L.stage === 'done') { L.saving = false; L.saved = false; L.savedP = null; } onlySave(); return; }
    if (a === 'dl') { if (L.card) { const x = document.createElement('a'); x.href = L.card.url; x.download = '습득물_' + noOf() + '.jpg'; document.body.appendChild(x); x.click(); x.remove(); } return; }
    if (a === 'next') { L = null; pick(); return; }
  }
  function close() {
    if (L && L.stage === 'card' && !L.saved && !confirm('아직 접수 안 했어요. 닫을까요?')) return;
    try { if (rec) rec.abort(); } catch (e) {}
    closeLostCam(); L = null; ctx.closeDlg();
  }
  return {
    btn: () => '<button class="tbtn lf-btn" data-lostbtn="1">🧳 습득물</button>',
    pick, draw, click,
    back: () => { if (L && (L.stage === 'num' || L.stage === 'card')) { L.stage = 'room'; draw(); return true; } return false; },
    closed: () => { L = null; },
    _state: () => L
  };
}

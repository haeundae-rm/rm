// 🧳 습득물 사진 판독 (2026-11-22) — 인스펙션 AI(hub/insp/ai.js)와 같은 Firebase AI Logic · App Check · 모델 설정(meta/insp_ai)
// 사진 → { item: '무선 이어폰 (흰색)', cat: '귀중품', police: true, room: '', conf }
// 실패하면 null → 메이드 화면은 품목을 손으로 적게 (접수는 막지 않음). 시험: window.__fakeLostAI = async () => ({...})
const FB = 'https://www.gstatic.com/firebasejs/12.19.0/';
const MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash'];
const SITE_KEY = '6LfI2yAuAAAAAEj0vYWJZS1XP7bhatqp7XudI08E';   // 인스펙션과 같은 App Check 키 (도메인 haeundae-rm.github.io, 공개돼도 되는 값)
export const CATS = ['의류', '잡화', '귀중품', '파손주의', '음식', '기타'];

const PROMPT = `당신은 리조트 객실 하우스키핑의 습득물(고객이 두고 간 물건) 접수 보조입니다. 룸메이드가 객실에서 찍은 습득물 사진을 봅니다.
관리대장에 적을 품목 이름과 분류를 정하세요.

item: 한국어 짧은 명사구 (2~12자). 색·브랜드가 분명하면 괄호로. 여러 개면 쉼표로. 예: "무선 이어폰 (흰색)", "검정 패딩", "충전기, 케이블", "신용카드", "캔맥주 2개"
cat (하나만):
- 귀중품: 지갑·현금·신용카드·신분증·여권·휴대폰·태블릿·노트북·무선 이어폰·시계·귀금속·명품 가방·카메라 등 값비싸거나 개인정보가 있는 것
- 의류: 옷·모자·양말·속옷
- 잡화: 가방(명품 아님)·우산·신발·슬리퍼·화장품 파우치·액세서리
- 파손주의: 유리·병(술병·와인)·도자기·깨지기 쉬운 것
- 음식: 먹거나 마시는 것 (냉장 보관)
- 기타: 충전기·세면도구·장난감·그 밖
police: 카드·신분증·여권·현금·지갑, 또는 고가품이면 true (못 찾아가면 경찰 인계 대상)
room: 사진에 객실 번호판이 보이면 숫자 3~4자리, 아니면 ""
conf: 0~1 (잘 안 보이면 낮게)

JSON 하나만 답하세요: {"item":"무선 이어폰 (흰색)","cat":"귀중품","police":true,"room":"","conf":0.8}`;

let modelP = null, cfg = null, lastErr = '';
export const aiErr = () => lastErr;
export function setCfg(c) { cfg = c || {}; modelP = null; }

async function getModel(name) {
  const [A, AI, AC] = await Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-ai.js'), import(FB + 'firebase-app-check.js')]);
  const app = A.getApp();
  const key = (cfg && cfg.siteKey) || SITE_KEY;
  if (key && !window.__lostAppCheck) {
    const P = cfg && cfg.acType === 'v3' ? AC.ReCaptchaV3Provider : AC.ReCaptchaEnterpriseProvider;
    try { AC.initializeAppCheck(app, { provider: new P(key), isTokenAutoRefreshEnabled: true }); } catch (e) { console.warn('App Check', e); }
    window.__lostAppCheck = 1;
  }
  const ai = AI.getAI(app, { backend: cfg && cfg.backend === 'dev' ? new AI.GoogleAIBackend() : new AI.VertexAIBackend((cfg && cfg.location) || 'global') });
  return AI.getGenerativeModel(ai, { model: name, generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } });
}
async function call(b64) {
  const names = cfg && cfg.model ? [cfg.model] : MODELS;
  let err = null;
  for (const n of names) {
    try {
      if (!modelP || modelP.name !== n) modelP = { name: n, m: getModel(n) };
      const m = await modelP.m;
      const r = await m.generateContent([PROMPT, { inlineData: { data: b64, mimeType: 'image/jpeg' } }]);
      return r.response.text();
    } catch (e) { err = e; modelP = null; if (!/not found|404|unsupported|is not supported|requires the Firebase AI API/i.test(String(e && e.message))) break; }
  }
  throw err;
}
export function clean(o) {
  o = o && typeof o === 'object' ? o : {};
  const cat = CATS.indexOf(String(o.cat || '').trim()) >= 0 ? String(o.cat).trim() : '기타';
  const item = String(o.item || '').replace(/[.。]$/, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return { item, cat, police: !!o.police || cat === '귀중품', room: String(o.room || '').replace(/\D/g, '').slice(0, 4), conf: Math.max(0, Math.min(1, Number(o.conf) || 0)) };
}
/** b64 = 긴 쪽 1024 JPEG base64 (lost.js 가 만듦) */
export async function readLost(b64) {
  try {
    const txt = window.__fakeLostAI ? JSON.stringify(await window.__fakeLostAI(b64)) : await call(b64);
    const j = JSON.parse(String(txt).replace(/^```(json)?|```$/g, '').trim());
    lastErr = '';
    return clean(Array.isArray(j) ? j[0] : j);
  } catch (e) { lastErr = String(e && (e.message || e.code) || e).slice(0, 300); console.warn('습득물 AI', e); return null; }
}

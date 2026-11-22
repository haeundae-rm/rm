// node test/lost_test.mjs — 🧳 말한 글 → 객실 번호 · AI 결과 정리
import assert from 'assert';
import { roomFromSpeech, placeOf } from '../app/lost.js';
import { clean } from '../app/lostai.js';
let ok = 0; const t = (n, f) => { f(); ok++; console.log('✓', n); };
const cases = { '1305호': '1305', '천삼백오호': '1305', '천삼백오': '1305', '일삼공오': '1305', '일삼영오호': '1305', '이천팔백사호': '2804', '팔백십칠호': '817', '칠백구호': '709',
  '13층 5호': '1305', '십삼층 오호': '', '1305 호 입니다': '1305', '천백십일호': '1111', '삼천일호': '3001', '오늘 날씨': '', '': '' };
Object.keys(cases).forEach(k => t('"' + k + '" → ' + (cases[k] || '(없음)'), () => assert.strictEqual(roomFromSpeech(k), cases[k])));
t('보관 장소', () => { assert.strictEqual(placeOf('귀중품'), '귀중품 보관함'); assert.strictEqual(placeOf('음식'), '습득물 냉장고'); assert.strictEqual(placeOf('파손주의'), '파손주의 보관함'); assert.strictEqual(placeOf('의류'), '습득물 보관'); });
t('AI 정리: 모르는 분류 → 기타, 귀중품은 경찰 인계', () => { assert.deepStrictEqual(clean({ item: '지갑.', cat: '귀중품', police: false }), { item: '지갑', cat: '귀중품', police: true, room: '', conf: 0 }); assert.strictEqual(clean({ cat: '가전' }).cat, '기타'); });
console.log(ok + '개 통과');

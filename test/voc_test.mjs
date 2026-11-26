import { parseVoc } from '../app/voc.js';
const nu = `11/25 고객만족도 특이건 공유드립니다

[개선 건]
✔️침대와 벽 사이 먼지가 너무 쌓여있고 매트리스 상태가 너무 좋지 않아 옆에서 조금만 뒤척거려도 꿀렁대는 바람에 잠을 거의 못잤습니다(3010호, 11/24~25)

✔️샤워기 및 타올 등 침구류 청결상태 매우 안좋음(3009호, 11/23~25)

[칭찬 건]
✔️객실이 깨끗하고 좋았어요(1203호, 11/24~25)`;
const old = `11/20 고객만족도 특이건 공유
[개선 건]
✔️ 객실 청결
- 머리카락이 있었어요 (1203호, 11/18~19)
✔️ 시설
- 에어컨 소음 (1405호, 11/18~20)
[칭찬 건]
👏 직원이 친절해요`;
const a = parseVoc(nu, '2026-11-26'), b = parseVoc(old, '2026-11-26');
console.log('새 모양', a.length, a.map(x => [x.kind, x.room, x.ci, x.co, x.text.slice(0, 15), x.resp.join('/')].join(' ')));
console.log('옛 모양', b.length, b.map(x => [x.kind, x.cat, x.room, x.text.slice(0, 10)].join(' ')));
console.log(a.length === 3 && a[0].room === '3010' && a[0].ci === '2026-11-24' && a[1].room === '3009' && a[2].kind === '칭찬' && b.length === 3 && b[0].cat === '객실 청결' ? '✅ 통과' : '❌');

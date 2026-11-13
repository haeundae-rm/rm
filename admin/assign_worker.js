// 자동 배정 계산을 화면과 따로(백그라운드) 돌림 — 휴대폰에서도 화면이 멈추지 않게
import { runAssign } from './assign.js?v=2026.11.13-6';
self.onmessage = e => {
  const d = e.data || {};
  try {
    const res = runAssign(d.rooms, d.ho, d.cfg, d.prev2901, d.hist, Object.assign({}, d.opts, { onProgress: p => self.postMessage({ p }) }));
    self.postMessage({ done: res });
  } catch (err) { self.postMessage({ err: String(err && err.message || err) }); }
};

// 객실 통합 관리(관리자 허브) — 홈 화면 앱으로 설치되기 위한 최소 서비스 워커. 아무것도 저장하지 않고 그대로 통과
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () {});

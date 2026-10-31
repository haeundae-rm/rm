// 앱 설치용 최소 서비스 워커. 파일을 저장하지 않고 그대로 통과 (예전 화면이 남는 문제 방지)
// 기록 보관은 Firestore 가 휴대폰 저장소에서 따로 함
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function(){});

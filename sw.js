// 바탕화면 앱(설치형)으로 인식되기 위한 최소 서비스 워커. 데이터는 저장하지 않고 그대로 통과
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function(){});

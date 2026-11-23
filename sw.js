// 오프라인에서도 열리도록 앱 파일을 캐시합니다.
// 앱 파일을 수정한 뒤 배포할 때는 VERSION 숫자를 올려주세요.
const VERSION = 'v9';
const CACHE = 'cube-app-' + VERSION;
const FILES = ['./', 'index.html', 'style.css', 'plan.js', 'meal.js', 'app.js', 'trip.js', 'manifest.json', 'icons/icon-180.png', 'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
// 네트워크 우선(브라우저 임시 저장 무시), 인터넷이 없으면 저장본 사용 → 업데이트가 바로 반영됨
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

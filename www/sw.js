// Service de mise à jour d'Odysseum (appli installée depuis Chrome).
// Stratégie « réseau d'abord » : en ligne, on charge toujours la dernière version publiée
// et on la garde en réserve ; hors ligne, on rejoue la dernière version connue.
const CACHE = 'odysseum';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // code et pages (js, css, html, json) : on contourne aussi le cache du CDN de GitHub Pages (~10 min),
  // sinon le téléphone peut mélanger une feuille de style neuve et un script ancien juste après une mise à jour
  const url = new URL(req.url);
  const fresh = /\.(js|css|html|json|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/');
  if (fresh) url.searchParams.set('_', Date.now().toString(36));
  e.respondWith(
    fetch(fresh ? url.toString() : req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./')))
  );
});

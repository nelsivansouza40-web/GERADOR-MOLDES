/*
 * Service worker do Gerador de Moldes: guarda o aplicativo no aparelho para
 * abrir e gerar PDF sem internet. Ao publicar uma versão nova, aumente
 * CACHE_VERSION para os aparelhos baixarem os arquivos novos.
 */
const CACHE_VERSION = 'moldes-v2';
const ARQUIVOS = [
  './', './index.html', './manifest.webmanifest',
  './js/lib/jspdf.umd.min.js', './js/geometria.js', './js/malha3d.js', './js/figuras.js', './js/figuras2.js',
  './js/importar.js', './js/buscar.js', './js/previa3d.js', './js/paginacao.js', './js/app.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './imagens/capa.jpg', './imagens/faixa.jpg',
];
const FONTES = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('moldes-') && k !== CACHE_VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const proprio = url.origin === location.origin && url.pathname.startsWith(new URL('./', location.href).pathname);
  if (!proprio && !FONTES.includes(url.hostname)) return;
  e.respondWith(
    caches.open(CACHE_VERSION).then((cache) => cache.match(req, { ignoreSearch: proprio }).then((salvo) => {
      const daRede = fetch(req).then((resp) => {
        if (resp && (resp.ok || resp.type === 'opaque')) cache.put(req, resp.clone());
        return resp;
      });
      if (salvo) { daRede.catch(() => {}); return salvo; } // usa o salvo e atualiza em segundo plano
      return daRede.catch(() => (req.mode === 'navigate' ? cache.match('./index.html') : Response.error()));
    }))
  );
});

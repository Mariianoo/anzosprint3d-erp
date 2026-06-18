// ══════════════════════════════════════════════════════════════
//  ANZO'S Print 3D ERP — Service Worker
//  Estratégia de cache para funcionamento offline (leitura)
// ══════════════════════════════════════════════════════════════

// Troque a versão quando atualizar o app para forçar novo cache
const CACHE_VERSION = 'anzos-erp-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // bibliotecas externas (CDN) — cacheadas para abrir offline
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
];

// ── Instalação: pré-cacheia o app shell ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // addAll falha tudo se um item falhar; usamos add individual tolerante
      return Promise.allSettled(APP_SHELL.map((url) => cache.add(url).catch(() => null)));
    }).then(() => self.skipWaiting())
  );
});

// ── Ativação: limpa caches antigos de versões anteriores ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: decide como responder cada requisição ──
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Só lidamos com GET. POST/PUT/DELETE (gravações) passam direto pra rede.
  if (req.method !== 'GET') return;

  // Requisições ao Supabase (API REST e Auth):
  // network-first — tenta a rede (dados frescos); se offline, cai no cache.
  const isSupabase = url.hostname.endsWith('.supabase.co');
  if (isSupabase) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // guarda cópia no cache só de respostas GET da API de dados (rest/v1)
          if (res.ok && url.pathname.includes('/rest/v1/')) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req)) // offline: usa último dado cacheado
    );
    return;
  }

  // App shell e demais GETs: cache-first (abre offline), atualiza em background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached); // offline e não cacheado → cached (pode ser undefined)
      return cached || network;
    })
  );
});

// Permite que a página peça atualização imediata do SW
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

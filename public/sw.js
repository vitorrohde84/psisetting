// ==============================================================================
// PsiSetting — Service Worker (PWA)
// Versão: 1.0.0
// Estratégia: Network-First para páginas e API; Cache para ativos estáticos.
// ==============================================================================

const CACHE_NAME = "psisetting-cache-v1";

const PRECACHE_ASSETS = [
  "/icon.png",
  "/apple-icon.png",
  "/logo.png",
  "/favicon.ico",
  "/manifest.webmanifest",
];

// 1. Instalação: Cache dos ativos essenciais
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// 2. Ativação: Limpeza de caches antigos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// 3. Interceptação de requisições:
// - API e Navegações Clínicas: SEMPRE Network-First (dados médicos em tempo real e sigilo)
// - Arquivos estáticos (imagens, ícones): Cache com fallback de rede
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requisições não-GET e extensões de navegador
  if (request.method !== "GET" || !url.protocol.startsWith("http")) {
    return;
  }

  // APIs do Supabase, Mercado Pago e rotas /api: Passam direto pela rede
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("mercadopago")
  ) {
    return;
  }

  // Para documentos HTML e navegação de página: Network First com fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match(request).then((cached) => {
          return cached || new Response("Você está offline. Verifique sua conexão com a internet.", {
            headers: { "Content-Type": "text/html; charset=utf-8" },
            status: 503,
          });
        });
      })
    );
    return;
  }

  // Para imagens e ícones estáticos: Stale-While-Revalidate
  if (
    request.destination === "image" ||
    request.destination === "font" ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|ico|webp)$/)
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(request).then((cached) => {
          const networkFetch = fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => cached);

          return cached || networkFetch;
        });
      })
    );
  }
});

// Guarda o "esqueleto" do app (HTML/CSS/JS/ícones) no dispositivo, pra ele
// abrir mesmo com o app fechado e sem sinal. Os DADOS (checklist, atividades,
// ensinamentos, fotos) já ficam guardados à parte pelo próprio Firestore, no
// IndexedDB — nada que o Felipe digita se perde ao fechar o app; sincroniza
// sozinho quando a internet volta.

const CACHE_NAME = "tbn-v5";

// URLs com a MESMA versão que o index.html pede. Sem a query, o navegador
// pede "app.js?v=5" e nunca usa o cache de "app.js".
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=5",
  "./app.js?v=5",
  "./firebase-init.js?v=5",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  // fetch(url, { cache: "reload" }) força buscar do servidor, ignorando o
  // cache HTTP comum do navegador — senão o precache pode guardar uma
  // versão velha mesmo com o service worker novo.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(CORE_ASSETS.map((url) =>
        fetch(url, { cache: "reload" }).then((res) => cache.put(url, res)).catch(() => {})
      ))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Só apaga caches DESTE app (prefixo "tbn-"). Esse domínio
  // (pampfelp.github.io) hospeda outros apps do Felipe, cada um com seu
  // próprio cache — apagar tudo quebraria o offline deles.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("tbn-") && k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Rede primeiro, cache como reserva. NUNCA intercepta o canal de dados do
// Firestore (firestore.googleapis.com — conexão de streaming de longa
// duração), nem outros serviços do Google APIs. As fontes do Google e o SDK
// do Firebase (www.gstatic.com) SÃO cacheados, pra o app abrir bonito
// offline.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  const ehApiGoogle = url.hostname.endsWith("googleapis.com") && url.hostname !== "fonts.googleapis.com";
  const ehAppsScript = url.hostname.endsWith("script.google.com");
  if (ehApiGoogle || ehAppsScript) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && (url.protocol === "http:" || url.protocol === "https:")) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(event.request)) ||
               (event.request.mode === "navigate" ? await cache.match("./index.html") : undefined);
      })
  );
});

// sw.js (Service Worker para cache offline)

const CACHE_NAME = 'jscar-cache-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/db.js',
    '/manifest.json',
    // Ícones do PWA (assumindo que você os criou)
    '/images/icon-192x192.png',
    '/images/icon-512x512.png',
    // Bibliotecas CDN para que o download funcione offline (Opcional, mas recomendado)
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Instalando...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Cacheando arquivos essenciais.');
                return cache.addAll(urlsToCache);
            })
    );
});

// Ativação do Service Worker
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Ativando e limpando caches antigos.');
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Estratégia Cache-first (Primeiro cache, depois rede)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Se o recurso está no cache, retorna a versão cacheadas
                if (response) {
                    return response;
                }
                // Se não está no cache, faz a requisição normal na rede
                return fetch(event.request);
            })
    );
});
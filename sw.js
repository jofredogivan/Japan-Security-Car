/* sw.js - Service Worker Consolidado */

const CACHE_NAME = 'jsc-cache-v3.1'; // Versão do cache
const urlsToCache = [
    './', 
    './index.html',
    './app.js',
    './db.js',
    './style.css',
    './manifest.json', // Adicionado para garantir a instalação PWA
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

// Instalação: Salva os arquivos no navegador
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('SW: Arquivos armazenados no cache com sucesso.');
                return cache.addAll(urlsToCache);
            })
            .catch(err => console.error('SW: Erro ao cachear arquivos:', err))
    );
});

// Ativação: Remove caches de versões anteriores
self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('SW: Removendo cache antigo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim(); // Assume o controle da página na hora
});

// Fetch: Intercepta e serve os arquivos do cache (Offline First)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Se o arquivo está no cache, retorna ele. Senão, busca na internet.
                if (response) {
                    return response;
                }
                
                return fetch(event.request).catch(() => {
                    // Se a internet falhar e for uma navegação de página, mostra o index.html
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html'); 
                    }
                });
            })
    );
});


// sw.js (Service Worker Básico e Corrigido)

const CACHE_NAME = 'jsc-cache-v3'; // Versão atualizada do cache
const urlsToCache = [
    './', 
    './index.html',
    './app.js',
    './db.js',
    './style.css',
    // Adicione outros arquivos estáticos e CDNs se necessário
];

// Instalação: Abre o cache e adiciona todos os arquivos
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker instalado. Cache aberto.');
                return cache.addAll(urlsToCache);
            })
            .catch(err => {
                console.error('Falha ao adicionar URLs ao cache:', err);
            })
    );
});

// Ativação: Limpa caches antigos
self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('Deletando cache antigo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // Garante que o service worker assuma o controle da página imediatamente
    return self.clients.claim();
});

// Fetch: Intercepta requisições e serve do cache primeiro
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                
                return fetch(event.request).catch(() => {
                    // Fallback para navegação offline
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html'); 
                    }
                });
            })
    );
});


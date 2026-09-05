// sw.js - register in script.js with navigator.serviceWorker.register('/sw.js')
const CACHE = 'axelr-v1';
const OFFLINE_PAGE = '/offline.html';

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(cache => cache.addAll(['/', '/offline.html', '/style.css']))
    );
});
self.addEventListener('fetch', e => {
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request) || caches.match(OFFLINE_PAGE))
    );
});
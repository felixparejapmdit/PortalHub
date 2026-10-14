// PortalHub service worker: lets the portal open without an internet connection.
// - The page and its own scripts: network first (always fresh when online), cached copy when offline.
// - Fonts, icon fonts and CDN libraries: served from cache, refreshed in the background.
// - Firebase/Google APIs, the local gateway API and everything else: never cached.
const CACHE_VERSION = 'portalhub-v3';

const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    './favicon.png',
    './apple-touch-icon.png',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './js/portal-auth.js',
    './js/portal-app.js',
    './js/vendor/Sortable.min.js',
    './js/vendor/qrcode.js'
];

const CDN_HOSTS = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'];

const scopePath = new URL(self.registration.scope).pathname;

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            // One missing file shouldn't stop the rest from being cached
            .then(cache => Promise.all(APP_SHELL.map(url => cache.add(url).catch(() => null))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            // Only remove PortalHub's own old caches: on the local gateway every sibling project
            // shares this origin (and its Cache Storage), e.g. PSE's offline cache
            .then(keys => Promise.all(keys
                .filter(key => key.startsWith('portalhub-') && key !== CACHE_VERSION)
                .map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    if (url.origin === self.location.origin) {
        // Gateway API answers are live data; sibling projects served by serve.py aren't ours to cache
        if (url.pathname.startsWith('/api/') || !url.pathname.startsWith(scopePath)) return;
        if (request.mode === 'navigate' || url.pathname.endsWith('/') || /\.(html|js|json)$/.test(url.pathname)) {
            event.respondWith(networkFirst(request));
        } else {
            event.respondWith(staleWhileRevalidate(event, request));
        }
        return;
    }

    if (CDN_HOSTS.includes(url.hostname)) {
        // On gstatic only the Firebase SDK files are static assets
        if (url.hostname === 'www.gstatic.com' && !url.pathname.startsWith('/firebasejs/')) return;
        event.respondWith(staleWhileRevalidate(event, request));
    }
});

async function networkFirst(request) {
    const cache = await caches.open(CACHE_VERSION);
    try {
        const response = await fetch(request);
        if (response && response.ok) cache.put(request, response.clone());
        return response;
    } catch (error) {
        const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
        if (cached) return cached;
        if (request.mode === 'navigate') {
            const shell = await cache.match('./index.html');
            if (shell) return shell;
        }
        throw error;
    }
}

async function staleWhileRevalidate(event, request) {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(request);
    const network = fetch(request)
        .then(response => {
            // Cross-origin scripts and stylesheets arrive as opaque responses; those are fine to keep
            if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
            return response;
        })
        .catch(() => null);
    event.waitUntil(network);
    return cached || (await network) || Response.error();
}

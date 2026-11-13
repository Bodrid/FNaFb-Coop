// Serves the imported game from this device (IndexedDB) under ./game/, with the co-op mod's main.js
// fetched fresh from the site (so phones always run the newest mod), and keeps the launcher working offline.
'use strict';
importScripts('store.js');
var SHELL = 'fnafb-shell-v1';
var TYPES = { html: 'text/html', js: 'application/javascript', json: 'application/json', css: 'text/css', png: 'image/png', jpg: 'image/jpeg',
              jpeg: 'image/jpeg', gif: 'image/gif', ogg: 'audio/ogg', m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', webm: 'video/webm',
              mp4: 'video/mp4', ogv: 'video/ogg', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2', txt: 'text/plain', svg: 'image/svg+xml' };
function typeOf(path) { var m = /\.([a-z0-9]+)$/i.exec(path); return (m && TYPES[m[1].toLowerCase()]) || 'application/octet-stream'; }

self.addEventListener('install', function() { self.skipWaiting(); });
self.addEventListener('activate', function(e) { e.waitUntil(self.clients.claim()); });

// Network first, the last good copy when offline.
function fresh(request) {
    return fetch(request, { cache: 'no-store' }).then(function(res) {
        if (res.ok) { var copy = res.clone(); caches.open(SHELL).then(function(c) { c.put(request, copy); }); }
        return res;
    }).catch(function() {
        return caches.open(SHELL).then(function(c) { return c.match(request); }).then(function(r) { return r || new Response('Offline', { status: 503 }); });
    });
}

// A stored file, with byte ranges (Safari asks for ranges when it plays video).
function serveBlob(blob, path, request) {
    var type = typeOf(path), size = blob.size;
    var range = request.headers.get('range');
    var m = range && /bytes=(\d*)-(\d*)/.exec(range);
    if (m && (m[1] || m[2])) {
        var start = m[1] ? parseInt(m[1], 10) : Math.max(0, size - parseInt(m[2], 10));
        var end = m[1] && m[2] ? Math.min(size - 1, parseInt(m[2], 10)) : size - 1;
        if (start >= size || start > end) return new Response('', { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
        return new Response(blob.slice(start, end + 1), { status: 206, headers: { 'Content-Type': type, 'Content-Length': String(end - start + 1),
            'Content-Range': 'bytes ' + start + '-' + end + '/' + size, 'Accept-Ranges': 'bytes' } });
    }
    return new Response(blob, { status: 200, headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } });
}

function serveGame(rel, request) {
    if (rel.toLowerCase() === 'js/main.js') return fresh(new Request(new URL('main.js', self.registration.scope).href));
    return GameStore.get(rel).then(function(blob) {
        if (blob) return serveBlob(blob, rel, request);
        if (/\.m4a$/i.test(rel)) {                                   // the PC game only has .ogg audio
            var ogg = rel.replace(/\.m4a$/i, '.ogg');
            return GameStore.get(ogg).then(function(b) { return b ? serveBlob(b, ogg, request) : new Response('Not found', { status: 404 }); });
        }
        return new Response('Not found', { status: 404 });
    });
}

self.addEventListener('fetch', function(e) {
    var url = new URL(e.request.url);
    if (url.origin !== self.location.origin || e.request.method !== 'GET') return;
    var scope = new URL(self.registration.scope).pathname;
    if (url.pathname.indexOf(scope) !== 0) return;
    var rel = url.pathname.slice(scope.length);
    if (rel.indexOf('game/') === 0) {
        var path;
        try { path = decodeURIComponent(rel.slice(5)); } catch (err) { path = rel.slice(5); }
        e.respondWith(serveGame(path, e.request));
    } else {
        e.respondWith(fresh(e.request));
    }
});

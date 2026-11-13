// The imported game, kept on the device: IndexedDB "fnafb-web", store "files" (lower-case path -> Blob)
// and "meta" (what was imported). Used by the page and by the service worker.
(function(global) {
    'use strict';
    var DB = 'fnafb-web';
    var dbp = null;
    function open() {
        if (dbp) return dbp;
        dbp = new Promise(function(resolve, reject) {
            var r = indexedDB.open(DB, 1);
            r.onupgradeneeded = function() {
                var db = r.result;
                if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
                if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
            };
            r.onsuccess = function() { resolve(r.result); };
            r.onerror = function() { dbp = null; reject(r.error); };
        });
        return dbp;
    }
    function req(store, mode, fn) {
        return open().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(store, mode), out;
                var r = fn(tx.objectStore(store));
                if (r) r.onsuccess = function() { out = r.result; };
                tx.oncomplete = function() { resolve(out); };
                tx.onerror = tx.onabort = function() { reject(tx.error || new Error('storage error')); };
            });
        });
    }
    global.GameStore = {
        key: function(path) { return String(path).replace(/^\/+/, '').toLowerCase(); },
        get: function(path) { return req('files', 'readonly', function(s) { return s.get(GameStore.key(path)); }); },
        put: function(path, blob) { return req('files', 'readwrite', function(s) { return s.put(blob, GameStore.key(path)); }); },
        clear: function() { return req('files', 'readwrite', function(s) { return s.clear(); }).then(function() { return req('meta', 'readwrite', function(s) { return s.clear(); }); }); },
        meta: function() { return req('meta', 'readonly', function(s) { return s.get('game'); }); },
        setMeta: function(m) { return req('meta', 'readwrite', function(s) { return s.put(m, 'game'); }); }
    };
})(typeof self !== 'undefined' ? self : this);

// Opens a .rar (or .7z) chosen by the player with 7-Zip (7zz.wasm, from the 7z-wasm package: LGPL + unRAR
// restriction, see 7zz-License.txt). The archive is read straight from the file (WORKERFS), never copied into
// memory. 7-Zip unpacks much faster than the browser can store, so the files go to disk first: appended to
// "part" files in the site's private storage (OPFS, written synchronously as they come out), each part handed
// to the page once full, which stores its files and deletes it. Memory use stays at about one file.
//   { cmd: 'list', file }                    -> { t: 'list', entries: [{ name, size }], solid }
//   { cmd: 'extract', file, names, total }   -> { t: 'part', part, entries: [{ name, offset, size }] } as parts
//                                               fill up (OPFS/fnafb-unpack/part<N>), then { t: 'done' }
//                                               (no OPFS: { t: 'file', name, data } for each file instead)
//   anything wrong                           -> { t: 'error', message }
'use strict';
importScripts('7zz.umd.js');

function run(file, args, onFile, list) {
    var lines = [];
    return SevenZip({
        locateFile: function(p) { return p; },
        print: function(l) { lines.push(l); },
        printErr: function(l) { lines.push(l); }
    }).then(function(z) {
        var FS = z.FS;
        FS.mkdir('/in');
        FS.mount(z.WORKERFS, { files: [file] }, '/in');
        FS.mkdir('/out');
        if (list) FS.writeFile('/list.txt', list);
        if (onFile) {
            // A file 7-Zip finished writing: hand it over and empty it (the empty file stays, for 7-Zip's timestamps).
            var close = FS.close;
            FS.close = function(stream) {
                var path = stream.path, wrote = (stream.flags & 3) !== 0;
                var r = close.apply(this, arguments);
                if (wrote && path && path.indexOf('/out/') === 0 && FS.isFile(FS.stat(path).mode)) {
                    var data = FS.readFile(path);
                    FS.truncate(path, 0);
                    onFile(path.slice(5), data);
                }
                return r;
            };
        }
        var code = 0;
        try { code = z.callMain(args.map(function(a) { return a.replace('$IN', '/in/' + file.name); })); } catch (e) { code = e && e.status !== undefined ? e.status : 2; if (!(e && e.status !== undefined)) lines.push(String(e && e.message || e)); }
        return { code: code || 0, lines: lines, FS: FS };
    });
}

// n empty part files, each open for synchronous writing; null when this browser has no OPFS sync access.
function openParts(n) {
    if (!(self.navigator && navigator.storage && navigator.storage.getDirectory && self.FileSystemFileHandle && FileSystemFileHandle.prototype.createSyncAccessHandle)) return Promise.resolve(null);
    return navigator.storage.getDirectory().then(function(root) {
        return root.getDirectoryHandle('fnafb-unpack', { create: true });
    }).then(function(dir) {
        var out = [], i = 0;
        var next = function() {
            if (i >= n) return out;
            return dir.getFileHandle('part' + (i++), { create: true }).then(function(f) { return f.createSyncAccessHandle(); })
                .then(function(h) { h.truncate(0); out.push(h); return next(); });
        };
        return next();
    }).catch(function() { return null; });
}

// Why 7-Zip stopped, in words.
function problem(lines) {
    var all = lines.join('\n');
    if (/Wrong password|Cannot open encrypted/i.test(all)) return 'This archive is password protected.';     // not the listing's "Encrypted = -" lines
    if (/Can ?not open the file as (an )?archive|Is not archive|Unexpected end of archive/i.test(all)) return 'This file is not a .zip, .rar or .7z archive the game can be read from (or it is damaged or not fully downloaded).';
    if (/CRC Failed|Data Error|Headers Error/i.test(all)) return 'This archive is damaged (try downloading it again).';
    var errs = lines.filter(function(l) { return /ERROR/i.test(l); });
    return 'Could not open the archive' + (errs.length ? ': ' + errs.slice(0, 2).join(' ') : '.');
}

self.onmessage = function(e) {
    var m = e.data;
    if (m.cmd === 'list') {
        run(m.file, ['l', '-slt', '-pnone', '$IN']).then(function(r) {
            if (r.code > 1) throw new Error(problem(r.lines));
            var entries = [], cur = null, solid = false, inList = false;
            r.lines.forEach(function(l) {
                if (/^----------/.test(l)) { inList = true; return; }
                var kv = /^([A-Za-z ]+) = (.*)$/.exec(l);
                if (!kv) { if (cur && cur.name !== undefined && !cur.dir) entries.push(cur); cur = null; return; }
                if (!inList) { if (kv[1] === 'Solid' && kv[2] === '+') solid = true; return; }
                cur = cur || {};
                if (kv[1] === 'Path') cur.name = kv[2];
                else if (kv[1] === 'Size') cur.size = parseInt(kv[2], 10) || 0;
                else if (kv[1] === 'Folder' && kv[2] === '+') cur.dir = true;
                else if (kv[1] === 'Attributes' && /^D/.test(kv[2])) cur.dir = true;
                else if (kv[1] === 'Encrypted' && kv[2] === '+') cur.encrypted = true;
            });
            if (cur && cur.name !== undefined && !cur.dir) entries.push(cur);
            if (!entries.length) throw new Error(problem(r.lines));
            if (entries.some(function(x) { return x.encrypted; })) throw new Error('This archive is password protected.');
            self.postMessage({ t: 'list', solid: solid, entries: entries.map(function(x) { return { name: x.name, size: x.size || 0 }; }) });
        }).catch(function(err) { self.postMessage({ t: 'error', message: String(err && err.message || err) }); });
    } else if (m.cmd === 'extract') {
        var parts = null, cur = 0, at = 0, entries = [];
        var chunk = Math.max(64e6, Math.ceil((m.total || 0) / 24));
        var full = function() {
            parts[cur].flush();
            parts[cur].close();
            self.postMessage({ t: 'part', part: cur, entries: entries });
            cur++; at = 0; entries = [];
        };
        openParts(Math.ceil((m.total || 0) / chunk) + 2).then(function(p) {
            parts = p;
            return run(m.file, ['x', '-y', '-pnone', '-spd', '-scsUTF-8', '-o/out', '$IN', '@/list.txt'], function(name, data) {
                if (!parts) { self.postMessage({ t: 'file', name: name, data: data }, [data.buffer]); return; }
                if (at > 0 && at + data.length > chunk && cur < parts.length - 1) full();
                parts[cur].write(data, { at: at });
                entries.push({ name: name, offset: at, size: data.length });
                at += data.length;
            }, m.names.join('\n') + '\n');
        }).then(function(r) {
            if (parts) {
                if (entries.length) full();
                parts.slice(cur).forEach(function(h) { try { h.close(); } catch (e) { /* ignore */ } });
            }
            if (r.code > 1) throw new Error(problem(r.lines));
            self.postMessage({ t: 'done', warnings: r.code === 1 ? r.lines.filter(function(l) { return /WARNING|ERROR/i.test(l); }).slice(0, 5) : [] });
        }).catch(function(err) { self.postMessage({ t: 'error', message: /quota|space/i.test(String(err)) ? 'Not enough free space on this device to unpack the game.' : String(err && err.message || err) }); });
    }
};

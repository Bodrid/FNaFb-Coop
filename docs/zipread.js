// Reads a .zip chosen by the player one file at a time (Blob slices), so a game of a few GB never has to
// fit in memory. Handles stored and deflated entries (DecompressionStream) and Zip64.
(function(global) {
    'use strict';
    function u16(v, o) { return v.getUint16(o, true); }
    function u32(v, o) { return v.getUint32(o, true); }
    function u64(v, o) { return u32(v, o) + u32(v, o + 4) * 4294967296; }
    async function read(blob, start, len) { return new DataView(await blob.slice(start, start + len).arrayBuffer()); }
    var CP437 = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»';
    function name(bytes, utf8) {
        if (utf8) return new TextDecoder('utf-8').decode(bytes);
        try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { /* not UTF-8 */ }
        var s = '';
        for (var i = 0; i < bytes.length; i++) { var b = bytes[i]; s += b < 128 ? String.fromCharCode(b) : (CP437.charAt(b - 128) || '?'); }
        return s;
    }

    // The list of entries: [{ name, size, csize, method, offset }]
    async function entries(blob) {
        var tail = Math.min(blob.size, 65557 + 20);
        var v = await read(blob, blob.size - tail, tail);
        var eocd = -1;
        for (var i = tail - 22; i >= 0; i--) { if (u32(v, i) === 0x06054b50) { eocd = i; break; } }
        if (eocd < 0) throw new Error('This file is not a .zip (or it is damaged).');
        var count = u16(v, eocd + 10), cdSize = u32(v, eocd + 12), cdOff = u32(v, eocd + 16);
        if (eocd >= 20 && u32(v, eocd - 20) === 0x07064b50) {          // Zip64
            var z64 = u64(v, eocd - 20 + 8);
            var zv = await read(blob, z64, 56);
            if (u32(zv, 0) === 0x06064b50) { count = u64(zv, 32); cdSize = u64(zv, 40); cdOff = u64(zv, 48); }
        }
        var cd = await read(blob, cdOff, cdSize), out = [], p = 0;
        for (var n = 0; n < count && p + 46 <= cdSize; n++) {
            if (u32(cd, p) !== 0x02014b50) break;
            var flags = u16(cd, p + 8), method = u16(cd, p + 10);
            var csize = u32(cd, p + 20), size = u32(cd, p + 24);
            var nl = u16(cd, p + 28), xl = u16(cd, p + 30), cl = u16(cd, p + 32);
            var off = u32(cd, p + 42);
            var nm = name(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nl), (flags & 0x800) !== 0);
            var x = p + 46 + nl, xe = x + xl;
            while (x + 4 <= xe) {                                        // Zip64 sizes / offset
                var id = u16(cd, x), sz = u16(cd, x + 2), q = x + 4;
                if (id === 1) {
                    if (size === 0xffffffff) { size = u64(cd, q); q += 8; }
                    if (csize === 0xffffffff) { csize = u64(cd, q); q += 8; }
                    if (off === 0xffffffff) { off = u64(cd, q); q += 8; }
                }
                x += 4 + sz;
            }
            if (!/\/$/.test(nm)) out.push({ name: nm.replace(/\\/g, '/'), size: size, csize: csize, method: method, offset: off, encrypted: (flags & 1) !== 0 });
            p += 46 + nl + xl + cl;
        }
        return out;
    }

    // One entry's contents as a Blob.
    async function extract(blob, e, type) {
        var lh = await read(blob, e.offset, 30);
        if (u32(lh, 0) !== 0x04034b50) throw new Error('Damaged zip entry: ' + e.name);
        var start = e.offset + 30 + u16(lh, 26) + u16(lh, 28);
        var raw = blob.slice(start, start + e.csize);
        if (e.encrypted) throw new Error('The zip is password protected.');
        if (e.method === 0) return new Blob([raw], { type: type || '' });
        if (e.method !== 8) throw new Error('Unsupported compression in ' + e.name + ' (method ' + e.method + '). Zip it with your phone or PC\'s normal "Compress".');
        if (typeof DecompressionStream !== 'function') throw new Error('This browser is too old to unzip (iOS 16.4 or newer is needed).');
        var stream = raw.stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Response(stream, { headers: { 'Content-Type': type || 'application/octet-stream' } }).blob();
    }

    global.ZipRead = { entries: entries, extract: extract };
})(typeof self !== 'undefined' ? self : this);

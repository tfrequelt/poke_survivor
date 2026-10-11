"""Pack Explorers of Sky move effects into strips.

usage: python tools/packeos.py

Explorers of Sky's move effects are ripped one PNG per frame (assets/pmd/explores_of_sky_moves/
move_VFX/<effect>/<anim>/<frame>.png). A sequence in assets/manifest.json names its frames with
`dir` + `files`; loaded that way, one effect is a dozen or forty requests, and the local server
serves them one at a time. This stitches each such sequence's frames side by side into one strip,
assets/pmd/eos_strips/<name>.png, and gives the manifest entry the strip's `src` and `cells`, which
the loader prefers. `dir` and `files` are kept, so running this again rebuilds every strip from the
original frames. Pure Python, standard library only: the frames are all 8-bit RGBA.
"""
import json, os, struct, zlib, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, 'assets', 'manifest.json')
OUT = os.path.join('assets', 'pmd', 'eos_strips')


def read_png(path):
    d = open(path, 'rb').read()
    pos, idat = 8, b''
    while pos < len(d):
        n, = struct.unpack('>I', d[pos:pos + 4]); t = d[pos + 4:pos + 8]; b = d[pos + 8:pos + 8 + n]
        if t == b'IHDR':
            w, h, bd, ct = struct.unpack('>IIBB', b[:10])
            if bd != 8 or ct != 6: raise ValueError(f'{path}: not 8-bit RGBA')
        elif t == b'IDAT': idat += b
        pos += 12 + n
    raw = zlib.decompress(idat)
    st, rows, prev, i = w * 4, [], bytearray(w * 4), 0
    for _ in range(h):
        f = raw[i]; line = bytearray(raw[i + 1:i + 1 + st]); i += 1 + st
        for x in range(st):
            a = line[x - 4] if x >= 4 else 0
            b = prev[x]
            c = prev[x - 4] if x >= 4 else 0
            if f == 1: line[x] = (line[x] + a) & 255
            elif f == 2: line[x] = (line[x] + b) & 255
            elif f == 3: line[x] = (line[x] + ((a + b) >> 1)) & 255
            elif f == 4:
                p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(line); prev = line
    return w, h, rows


def write_png(path, w, h, rows):
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    raw = b''.join(b'\x00' + bytes(r) for r in rows)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
                           + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def main():
    m = json.load(open(MANIFEST, encoding='utf-8'), object_pairs_hook=collections.OrderedDict)
    os.makedirs(os.path.join(ROOT, OUT), exist_ok=True)
    n = 0
    for name, e in m['sequences'].items():
        if 'explores_of_sky_moves' not in e.get('dir', '') or 'files' not in e: continue
        frames = [read_png(os.path.join(ROOT, e['dir'], f + '.png')) for f in e['files']]
        w, h = frames[0][0], frames[0][1]
        if any(f[0] != w or f[1] != h for f in frames): raise ValueError(f'{name}: frames differ in size')
        rows = [bytearray() for _ in range(h)]
        for fw, fh, fr in frames:
            for y in range(h): rows[y] += fr[y]
        src = f'{OUT}/{name}.png'.replace(os.sep, '/')
        write_png(os.path.join(ROOT, src), w * len(frames), h, rows)
        e['src'] = src
        e['cell'] = [w, h]
        e['cells'] = [[i * w, 0, w, h, 0, 0] for i in range(len(frames))]
        n += 1
    open(MANIFEST, 'w', encoding='utf-8', newline='').write(json.dumps(m, indent=2, ensure_ascii=False) + '\n')
    print(f'packed {n} sequences into {OUT}')


if __name__ == '__main__':
    main()

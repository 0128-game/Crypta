// zip.js
// ファイルを、そのまま入れる（圧縮しない）zip を、ブラウザの中で、作る。外部の道具は、使わない。
//   makeZip([{ name: 'crypta/index.html', data: Uint8Array }, ...])  →  Blob

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  if (!crc32.table) {
    crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crc32.table[n] = c >>> 0;
    }
  }
  for (let i = 0; i < buf.length; i += 1) crc = crc32.table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function makeZip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const u16 = (n) => new Uint8Array([n & 255, (n >> 8) & 255]);
  const u32 = (n) => new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]);
  const cat = (...a) => {
    const len = a.reduce((s, x) => s + x.length, 0);
    const out = new Uint8Array(len);
    let p = 0;
    a.forEach((x) => { out.set(x, p); p += x.length; });
    return out;
  };
  files.forEach(({ name, data }) => {
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const local = cat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes);
    chunks.push(local, data);
    central.push(cat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes));
    offset += local.length + data.length;
  });
  const cdStart = offset;
  const cd = cat(...central);
  const end = cat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(cdStart), u16(0));
  return new Blob([...chunks, cd, end], { type: 'application/zip' });
}

export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

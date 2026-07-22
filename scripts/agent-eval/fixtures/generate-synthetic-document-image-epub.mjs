import { deflateSync } from 'node:zlib';
import * as fs from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const output = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../shared-fixtures/document-image-workspace/synthetic-document.epub',
);

const entries = [
  ['mimetype', Buffer.from('application/epub+zip')],
  [
    'META-INF/container.xml',
    Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`),
  ],
  [
    'OEBPS/content.opf',
    Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Synthetic Document Image</dc:title>
    <dc:creator>OpenNeko Evaluation</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="book-id">urn:uuid:synthetic-document-image</dc:identifier>
  </metadata>
  <manifest>
    <item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="page" href="page.xhtml" media-type="application/xhtml+xml"/>
    <item id="image-1" href="images/page-1.png" media-type="image/png"/>
    <item id="image-2" href="images/page-2.png" media-type="image/png"/>
  </manifest>
  <spine toc="toc">
    <itemref idref="page"/>
  </spine>
</package>
`),
  ],
  [
    'OEBPS/toc.ncx',
    Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:synthetic-document-image"/></head>
  <docTitle><text>Synthetic Document Image</text></docTitle>
  <navMap>
    <navPoint id="page" playOrder="1">
      <navLabel><text>Page</text></navLabel>
      <content src="page.xhtml"/>
    </navPoint>
  </navMap>
</ncx>
`),
  ],
  [
    'OEBPS/page.xhtml',
    Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Page</title></head>
  <body><div><img src="images/page-1.png" alt="synthetic page 1"/><img src="images/page-2.png" alt="synthetic page 2"/></div></body>
</html>
`),
  ],
  ['OEBPS/images/page-1.png', createSyntheticPng('N7Q4', false)],
  ['OEBPS/images/page-2.png', createSyntheticPng('Q47N', true)],
];

await fs.mkdir(dirname(output), { recursive: true });
await fs.writeFile(output, createStoredZip(entries));

function createSyntheticPng(code, alternatePalette) {
  const width = 192;
  const height = 128;
  const stride = 1 + width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    pixels[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 4;
      const diagonal = Math.abs(y - (height - 1 - (x * height) / width)) < 7;
      const color = alternatePalette
        ? diagonal
          ? [30, 220, 240]
          : x < width / 3
            ? [245, 120, 20]
            : [80, 60, 210]
        : diagonal
          ? [250, 220, 20]
          : x < width / 3
            ? [20, 180, 80]
            : [220, 40, 150];
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }
  }
  fillRect(pixels, stride, 6, 34, 180, 58, [12, 12, 12, 255]);
  drawPixelCode(pixels, stride, code, 11, 45, 5);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    signature,
    createPngChunk('IHDR', header),
    createPngChunk('IDAT', deflateSync(pixels, { level: 9 })),
    createPngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function fillRect(pixels, stride, x, y, width, height, color) {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      setPixel(pixels, stride, column, row, color);
    }
  }
}

function drawPixelCode(pixels, stride, text, startX, startY, scale) {
  const glyphs = {
    N: ['1000001', '1100001', '1010001', '1001001', '1000101', '1000011', '1000001'],
    7: ['1111111', '0000001', '0000010', '0000100', '0001000', '0010000', '0010000'],
    Q: ['0011100', '0100010', '1000001', '1000001', '1001001', '0100100', '0011011'],
    4: ['0001100', '0010100', '0100100', '1000100', '1111111', '0000100', '0000100'],
  };
  for (const [index, character] of [...text].entries()) {
    const glyph = glyphs[character];
    if (!glyph) throw new Error(`Missing synthetic image glyph: ${character}`);
    const glyphX = startX + index * 9 * scale;
    for (const [row, pattern] of glyph.entries()) {
      for (const [column, bit] of [...pattern].entries()) {
        if (bit === '1') {
          fillRect(
            pixels,
            stride,
            glyphX + column * scale,
            startY + row * scale,
            scale,
            scale,
            [255, 255, 255, 255],
          );
        }
      }
    }
  }
}

function setPixel(pixels, stride, x, y, color) {
  const offset = y * stride + 1 + x * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3];
}

function createPngChunk(type, data) {
  const name = Buffer.from(type);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return chunk;
}

function createStoredZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, data] of files) {
    const fileName = Buffer.from(name);
    const checksum = crc32(data);
    const local = Buffer.alloc(30 + fileName.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(33, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    local.writeUInt16LE(0, 28);
    fileName.copy(local, 30);
    localParts.push(local, data);

    const central = Buffer.alloc(46 + fileName.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    fileName.copy(central, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

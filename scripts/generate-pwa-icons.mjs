import fs from "fs";
import path from "path";
import zlib from "zlib";

const outDir = path.resolve("assets/app");

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    CRC_TABLE[index] = value >>> 0;
}

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const typeBuffer = Buffer.from(type, "ascii");
    const size = Buffer.alloc(4);
    size.writeUInt32BE(data.length, 0);

    const crc = Buffer.alloc(4);
    const crcValue = crc32(Buffer.concat([typeBuffer, data]));
    crc.writeUInt32BE(crcValue, 0);

    return Buffer.concat([size, typeBuffer, data, crc]);
}

function encodePng(width, height, rgba) {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y += 1) {
        raw[(stride + 1) * y] = 0;
        rgba.copy(raw, (stride + 1) * y + 1, y * stride, (y + 1) * stride);
    }

    const idat = zlib.deflateSync(raw, { level: 9 });
    return Buffer.concat([
        signature,
        chunk("IHDR", ihdr),
        chunk("IDAT", idat),
        chunk("IEND", Buffer.alloc(0))
    ]);
}

function blendPixel(buffer, size, x, y, color, alpha = 1) {
    if (x < 0 || y < 0 || x >= size || y >= size) {
        return;
    }
    const index = (y * size + x) * 4;
    const srcA = (color.a / 255) * alpha;
    const dstA = buffer[index + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA <= 0) {
        return;
    }
    buffer[index] = Math.round(((color.r * srcA) + (buffer[index] * dstA * (1 - srcA))) / outA);
    buffer[index + 1] = Math.round(((color.g * srcA) + (buffer[index + 1] * dstA * (1 - srcA))) / outA);
    buffer[index + 2] = Math.round(((color.b * srcA) + (buffer[index + 2] * dstA * (1 - srcA))) / outA);
    buffer[index + 3] = Math.round(outA * 255);
}

function fillBackground(buffer, size, maskable) {
    const pad = maskable ? 0 : Math.round(size * 0.08);
    const radius = maskable ? 0 : Math.round(size * 0.18);

    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            let inside = true;
            if (!maskable) {
                const left = x < pad + radius;
                const right = x > size - pad - radius - 1;
                const top = y < pad + radius;
                const bottom = y > size - pad - radius - 1;

                if (left && top) {
                    const dx = x - (pad + radius);
                    const dy = y - (pad + radius);
                    inside = dx * dx + dy * dy <= radius * radius;
                } else if (right && top) {
                    const dx = x - (size - pad - radius - 1);
                    const dy = y - (pad + radius);
                    inside = dx * dx + dy * dy <= radius * radius;
                } else if (left && bottom) {
                    const dx = x - (pad + radius);
                    const dy = y - (size - pad - radius - 1);
                    inside = dx * dx + dy * dy <= radius * radius;
                } else if (right && bottom) {
                    const dx = x - (size - pad - radius - 1);
                    const dy = y - (size - pad - radius - 1);
                    inside = dx * dx + dy * dy <= radius * radius;
                }
            }

            if (!inside) {
                continue;
            }

            const t = ((x / size) * 0.55) + ((y / size) * 0.45);
            const r = Math.round(61 * (1 - t) + 20 * t);
            const g = Math.round(33 * (1 - t) + 13 * t);
            const b = Math.round(20 * (1 - t) + 8 * t);
            blendPixel(buffer, size, x, y, { r, g, b, a: 255 });
        }
    }
}

function fillCircle(buffer, size, cx, cy, radius, color) {
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(size - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(size - 1, Math.ceil(cy + radius));

    for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
            const distance = Math.hypot(x - cx, y - cy);
            if (distance <= radius) {
                const alpha = 1 - (distance / radius) * 0.15;
                blendPixel(buffer, size, x, y, color, alpha);
            }
        }
    }
}

function distanceToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) {
        return Math.hypot(px - ax, py - ay);
    }
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
    const lx = ax + t * dx;
    const ly = ay + t * dy;
    return Math.hypot(px - lx, py - ly);
}

function drawSegment(buffer, size, ax, ay, bx, by, thickness, color) {
    const minX = Math.max(0, Math.floor(Math.min(ax, bx) - thickness));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(ax, bx) + thickness));
    const minY = Math.max(0, Math.floor(Math.min(ay, by) - thickness));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(ay, by) + thickness));

    for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
            const distance = distanceToSegment(x, y, ax, ay, bx, by);
            if (distance <= thickness) {
                const alpha = 1 - (distance / thickness) * 0.4;
                blendPixel(buffer, size, x, y, color, alpha);
            }
        }
    }
}

const glyphs = {
    S: [
        "11111",
        "10000",
        "11110",
        "00001",
        "11111"
    ],
    H: [
        "10001",
        "10001",
        "11111",
        "10001",
        "10001"
    ]
};

function drawGlyph(buffer, size, glyph, startX, startY, scale, color) {
    glyph.forEach((row, y) => {
        [...row].forEach((cell, x) => {
            if (cell !== "1") {
                return;
            }
            for (let iy = 0; iy < scale; iy += 1) {
                for (let ix = 0; ix < scale; ix += 1) {
                    blendPixel(buffer, size, startX + (x * scale) + ix, startY + (y * scale) + iy, color, 0.98);
                }
            }
        });
    });
}

function buildIcon(size, maskable = false) {
    const buffer = Buffer.alloc(size * size * 4);
    fillBackground(buffer, size, maskable);
    fillCircle(buffer, size, size * 0.74, size * 0.24, size * 0.11, { r: 78, g: 207, b: 158, a: 90 });
    fillCircle(buffer, size, size * 0.2, size * 0.8, size * 0.16, { r: 239, g: 143, b: 34, a: 40 });
    drawSegment(buffer, size, size * 0.23, size * 0.48, size * 0.8, size * 0.48, size * 0.03, { r: 255, g: 196, b: 109, a: 230 });
    drawSegment(buffer, size, size * 0.26, size * 0.63, size * 0.76, size * 0.34, size * 0.028, { r: 78, g: 207, b: 158, a: 220 });

    const scale = Math.round(size * 0.05);
    const glyphY = Math.round(size * 0.34);
    drawGlyph(buffer, size, glyphs.S, Math.round(size * 0.27), glyphY, scale, { r: 255, g: 244, b: 230, a: 255 });
    drawGlyph(buffer, size, glyphs.H, Math.round(size * 0.53), glyphY, scale, { r: 255, g: 244, b: 230, a: 255 });
    drawSegment(buffer, size, size * 0.34, size * 0.73, size * 0.67, size * 0.73, size * 0.02, { r: 255, g: 244, b: 230, a: 225 });

    return buffer;
}

function writeIcon(fileName, size, maskable = false) {
    const png = encodePng(size, size, buildIcon(size, maskable));
    fs.writeFileSync(path.join(outDir, fileName), png);
}

fs.mkdirSync(outDir, { recursive: true });
writeIcon("icon-192.png", 192);
writeIcon("icon-512.png", 512);
writeIcon("icon-maskable-512.png", 512, true);
writeIcon("apple-touch-icon-180.png", 180);

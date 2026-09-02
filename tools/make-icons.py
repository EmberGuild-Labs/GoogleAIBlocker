#!/usr/bin/env python3
"""Generates the extension icons.

The mark is a four-pointed "sparkle" (the shape Google uses for its AI
features) on a dark circle, struck through with a red bar. No external
dependencies: the PNGs are written straight out with zlib.

    python3 tools/make-icons.py
"""
import math
import os
import struct
import zlib

SIZES = (16, 32, 48, 128)
SS = 4  # supersampling factor per axis

BG = (32, 33, 36, 255)        # circle background
SPARKLE = (232, 234, 237, 255)  # off-white
SLASH = (217, 48, 37, 255)     # red


def blend(dst, src):
    """Alpha-composite src over dst (both RGBA 0-255 tuples)."""
    sa = src[3] / 255.0
    if sa <= 0:
        return dst
    da = dst[3] / 255.0
    out_a = sa + da * (1 - sa)
    if out_a <= 0:
        return (0, 0, 0, 0)
    out = [
        int(round((src[i] * sa + dst[i] * da * (1 - sa)) / out_a)) for i in range(3)
    ]
    return (out[0], out[1], out[2], int(round(out_a * 255)))


def sample(x, y):
    """Colour at a point in the unit square, origin at the centre."""
    px, py = x - 0.5, y - 0.5
    colour = (0, 0, 0, 0)

    # Background disc.
    if math.hypot(px, py) <= 0.48:
        colour = blend(colour, BG)
    else:
        return colour

    # Four-pointed star: an astroid, |x|^(2/3) + |y|^(2/3) <= r^(2/3).
    r = 0.30
    if (abs(px) ** (2 / 3) + abs(py) ** (2 / 3)) <= r ** (2 / 3):
        colour = blend(colour, SPARKLE)

    # Diagonal slash from lower-left to upper-right.
    d = abs(px + py) / math.sqrt(2)
    if d <= 0.055 and math.hypot(px, py) <= 0.42:
        colour = blend(colour, SLASH)

    return colour


def render(size):
    rows = []
    step = 1.0 / (size * SS)
    for py in range(size):
        row = bytearray()
        for px in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in range(SS):
                for sx in range(SS):
                    x = (px * SS + sx + 0.5) * step
                    y = (py * SS + sy + 0.5) * step
                    r, g, b, a = sample(x, y)
                    af = a / 255.0
                    acc[0] += r * af
                    acc[1] += g * af
                    acc[2] += b * af
                    acc[3] += af
            n = SS * SS
            a = acc[3] / n
            if a <= 0:
                row += bytes((0, 0, 0, 0))
            else:
                row += bytes(
                    (
                        min(255, int(round(acc[0] / acc[3]))),
                        min(255, int(round(acc[1] / acc[3]))),
                        min(255, int(round(acc[2] / acc[3]))),
                        min(255, int(round(a * 255))),
                    )
                )
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as handle:
        handle.write(png)


def main():
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
    os.makedirs(out_dir, exist_ok=True)
    for size in SIZES:
        path = os.path.join(out_dir, f"icon{size}.png")
        write_png(path, size, render(size))
        print(f"wrote {os.path.relpath(path)}")


if __name__ == "__main__":
    main()

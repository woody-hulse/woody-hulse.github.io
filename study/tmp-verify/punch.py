#!/usr/bin/env python3
"""Chroma-key magenta (or corner color) to alpha, crop, resize."""
import os
import sys
from collections import deque
from PIL import Image

ASSETS = "/Users/woodyhulse/.cursor/projects/Users-woodyhulse-Documents-website-woody-hulse-github-io/assets"
ROOT = "/Users/woodyhulse/Documents/website/woody-hulse.github.io/study/resources"

JOBS = [
    ("chickens", [
        "chicken-leghorn.png",
        "chicken-plymouth-rock.png",
        "chicken-silkie.png",
        "chicken-wyandotte.png",
        "chicken-rooster-red.png",
        "chicken-orpington.png",
    ]),
    ("sheep", [
        "sheep-suffolk.png",
        "sheep-merino.png",
        "sheep-dorset.png",
        "sheep-blackface.png",
        "sheep-lamb.png",
        "sheep-jacob.png",
    ]),
    ("ducks", [
        "duck-pekin.png",
        "duck-mallard-hen.png",
        "duck-rouen.png",
        "duck-muscovy.png",
        "duck-cayuga.png",
        "duck-indian-runner.png",
    ]),
    ("retrievers", [
        "lab-yellow.png",
        "lab-black.png",
        "lab-chocolate.png",
        "bull-terrier-white.png",
        "staffordshire-bull-terrier.png",
        "retriever-golden-sit.png",
    ]),
    ("fish", [
        "fish-betta.png",
        "fish-angelfish.png",
        "fish-clownfish.png",
        "fish-bass.png",
        "fish-discus.png",
        "fish-salmon.png",
    ]),
]


def dist2(a, b):
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2


def punch(im, thresh=78, feather=28):
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    corners = [px[0, 0][:3], px[w - 1, 0][:3], px[0, h - 1][:3], px[w - 1, h - 1][:3]]
    chroma = tuple(sum(c[i] for c in corners) // 4 for i in range(3))
    t2 = thresh * thresh
    f2 = (thresh + feather) ** 2

    visited = bytearray(w * h)
    q = deque()

    def maybe(x, y):
        i = y * w + x
        if visited[i]:
            return
        r, g, b, a = px[x, y]
        d = dist2((r, g, b), chroma)
        if d <= f2:
            visited[i] = 1
            q.append((x, y))

    for x in range(w):
        maybe(x, 0)
        maybe(x, h - 1)
    for y in range(h):
        maybe(0, y)
        maybe(w - 1, y)

    while q:
        x, y = q.popleft()
        r, g, b, a = px[x, y]
        d = dist2((r, g, b), chroma)
        if d <= t2:
            alpha = 0
        else:
            t = (d ** 0.5 - thresh) / feather
            alpha = max(0, min(255, int(255 * t)))
        px[x, y] = (r, g, b, min(a, alpha))
        if d <= f2:
            if x > 0:
                maybe(x - 1, y)
            if x + 1 < w:
                maybe(x + 1, y)
            if y > 0:
                maybe(x, y - 1)
            if y + 1 < h:
                maybe(x, y + 1)
    tight = (thresh * 0.72) ** 2
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if dist2((r, g, b), chroma) <= tight:
                px[x, y] = (r, g, b, 0)
    return im


def crop_alpha(im, pad=4):
    bbox = im.getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(im.width, r + pad)
    b = min(im.height, b + pad)
    return im.crop((l, t, r, b))


def resize_max(im, max_dim=560):
    w, h = im.size
    m = max(w, h)
    if m <= max_dim:
        return im
    scale = max_dim / m
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    return im.resize((nw, nh), Image.Resampling.LANCZOS)


def stats(im):
    a = im.getchannel("A")
    hist = a.histogram()
    total = im.width * im.height
    return {
        "size": im.size,
        "transparent": hist[0],
        "opaque": hist[255],
        "partial": sum(hist[1:255]),
        "frac_clear": round(hist[0] / total, 3),
    }


def main():
    for species, files in JOBS:
        dest_dir = os.path.join(ROOT, species)
        os.makedirs(dest_dir, exist_ok=True)
        for name in files:
            src = os.path.join(ASSETS, name)
            if not os.path.isfile(src):
                print("MISSING", name)
                continue
            im = Image.open(src)
            out = resize_max(crop_alpha(punch(im)))
            dest = os.path.join(dest_dir, name)
            out.save(dest, "PNG", optimize=True)
            print(name, stats(out), "->", dest)


if __name__ == "__main__":
    main()

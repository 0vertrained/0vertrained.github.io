"""Locks each generated land strip to the real skyline and writes the textures the page uses.

Usage: python3 -I lock.py <frames-dir> <skyline-plaza.json> <out-dir>

The generated strips cover azimuth 40°–80° and altitude −4.5°–5.5°. In each column the sky/land edge is found
near where the traced skyline says it should be, and the column's land is stretched or squeezed so the edge
lands exactly on the traced skyline. The textures keep the same frame at 80 px per degree: 3200 × 800.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

frames_dir, skyline_path, out_dir = sys.argv[1:4]
os.makedirs(out_dir, exist_ok=True)

AZ0, FOV, TOP, HEIGHT_DEG = 40.0, 40.0, 5.5, 10.0
OUT_W, OUT_H = 3200, 800
PX = OUT_W / FOV

sky = json.load(open(skyline_path))
alts = np.array(sky["altitude_deg"], dtype=np.float64)


def crest(az):
    t = (az - sky["az_from"]) / sky["az_step"]
    i = np.clip(np.floor(t).astype(int), 0, len(alts) - 2)
    f = t - i
    return alts[i] * (1 - f) + alts[i + 1] * f


def find_edge(img, expected_rows, band=160, thresh=42.0):
    """Row of the sky/land edge per column, searched within `band` rows of the expected row."""
    h, w = img.shape[:2]
    edges = np.zeros(w, dtype=np.float64)
    for x in range(w):
        y0 = int(round(expected_rows[x]))
        top = max(0, y0 - band)
        ref_lo, ref_hi = max(0, y0 - band), max(1, y0 - band // 2)
        ref = np.median(img[ref_lo:ref_hi, x], axis=0)
        col = img[top:min(h, y0 + band), x]
        d = np.abs(col - ref).sum(axis=1)
        hit = np.where((d[:-2] > thresh) & (d[1:-1] > thresh) & (d[2:] > thresh))[0]
        edges[x] = top + hit[0] if len(hit) else y0
    # Smooth away single-column noise while keeping the ridge's shape.
    k = 9
    pad = np.pad(edges, k // 2, mode="edge")
    edges = np.array([np.median(pad[i:i + k]) for i in range(w)])
    return edges


report = {}
names = sorted(f for f in os.listdir(frames_dir) if f[:2].isdigit() and f.endswith(".png"))
# Every frame was relit from the afternoon master, so the master's edge is the prior for the others: a frame's
# own edge is used where it agrees with the master's within 0.15 degrees, which keeps the dark frames, whose
# edge is hard to see, from being stretched by noise.
master_edge = None
master_name = "09-afternoon.png"
for name in [master_name] + [n for n in names if n != master_name]:
    src = np.asarray(Image.open(os.path.join(frames_dir, name)).convert("RGB")).astype(np.float32)
    h, w = src.shape[:2]
    px_x, px_y = w / FOV, h / HEIGHT_DEG
    az = AZ0 + (np.arange(w) + 0.5) / px_x
    real = crest(az)
    expected = (TOP - real) * px_y
    edge = find_edge(src, expected)
    if master_edge is None:
        master_edge = edge
    else:
        edge = np.where(np.abs(edge - master_edge) < 0.15 * px_y, edge, master_edge)
        k = 15
        pad = np.pad(edge, k // 2, mode="edge")
        edge = np.array([np.median(pad[i:i + k]) for i in range(w)])
    drift = (expected - edge) / px_y  # positive: the generated ridge sits higher than the real one
    report[name] = {"drift_deg_mean": round(float(np.abs(drift).mean()), 3), "drift_deg_max": round(float(np.abs(drift).max()), 3)}

    # Build the output: for each output column, the source column; for each output row below the real
    # skyline, the source row after remapping [edge, h) onto [real_row, out_h).
    out = np.zeros((OUT_H, OUT_W, 3), dtype=np.float32)
    ox = np.arange(OUT_W)
    sx = np.clip(((ox + 0.5) / PX) * px_x - 0.5, 0, w - 1)
    sx0 = np.floor(sx).astype(int)
    sx1 = np.minimum(sx0 + 1, w - 1)
    fx = sx - sx0
    out_az = AZ0 + (ox + 0.5) / PX
    real_row = (TOP - crest(out_az)) * (OUT_H / HEIGHT_DEG)
    # Per output column, the edge row in the source (interpolated between the two source columns).
    e = edge[sx0] * (1 - fx) + edge[sx1] * fx
    oy = np.arange(OUT_H, dtype=np.float64)[:, None]
    # Above the real skyline: sample the source with no vertical remap (the sky, which the page replaces).
    # Below it: stretch the source land from its own edge to the bottom.
    plain = oy / OUT_H * h
    land = e[None, :] + (oy - real_row[None, :]) / np.maximum(OUT_H - real_row[None, :], 1) * (h - e[None, :])
    sy = np.where(oy >= real_row[None, :], land, plain)
    sy = np.clip(sy, 0, h - 1)
    sy0 = np.floor(sy).astype(int)
    sy1 = np.minimum(sy0 + 1, h - 1)
    fy = (sy - sy0).astype(np.float32)
    fxb = fx.astype(np.float32)[None, :, None]
    fyb = fy[:, :, None]
    c00 = src[sy0, sx0[None, :]]
    c01 = src[sy0, sx1[None, :]]
    c10 = src[sy1, sx0[None, :]]
    c11 = src[sy1, sx1[None, :]]
    out = (c00 * (1 - fxb) + c01 * fxb) * (1 - fyb) + (c10 * (1 - fxb) + c11 * fxb) * fyb
    img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    stem = name[:-4]
    img.save(os.path.join(out_dir, f"{stem}.png"))
    img.save(os.path.join(out_dir, f"{stem}.webp"), "WEBP", quality=82, method=6)
    img.resize((1600, 400), Image.LANCZOS).save(os.path.join(out_dir, f"{stem}-1600.webp"), "WEBP", quality=80, method=6)
    sizes = (os.path.getsize(os.path.join(out_dir, f"{stem}.webp")) // 1024, os.path.getsize(os.path.join(out_dir, f"{stem}-1600.webp")) // 1024)
    print(f"{name:28s} drift mean {report[name]['drift_deg_mean']:.3f} max {report[name]['drift_deg_max']:.3f} deg  -> webp {sizes[0]} KB, 1600: {sizes[1]} KB")

json.dump(report, open(os.path.join(out_dir, "lock-report.json"), "w"), indent=1)

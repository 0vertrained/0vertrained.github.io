"""Locks each generated land strip to the real skyline and writes the textures the page uses.

Usage: python3 -I lock.py <frames-dir> <skyline-plaza.json> <out-dir>

The generated strips cover azimuth 40°–80° and altitude −4.5°–5.5°. In each column the sky/land edge is found
near where the traced skyline says it should be, and the column's land is stretched or squeezed so the edge
lands exactly on the traced skyline. Above the skyline the texture carries the ridge's own colour on upward
instead of the generated sky, so nothing pale can be filtered down over the ridge when the page draws it
smaller. The textures keep the strips' frame: a PNG at 80 px per degree (3200 × 800) for checking, and the two
sizes the page serves as WebP (2560 × 640 and 1600 × 400).
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
# What the page serves: width, height, WebP quality and what the file's name ends with.
SERVED = ((2560, 640, 80, ""), (1600, 400, 78, "-1600"))

sky = json.load(open(skyline_path))
alts = np.array(sky["altitude_deg"], dtype=np.float64)


def crest(az):
    t = (az - sky["az_from"]) / sky["az_step"]
    i = np.clip(np.floor(t).astype(int), 0, len(alts) - 2)
    f = t - i
    return alts[i] * (1 - f) + alts[i + 1] * f


def across(values, reach):
    """The mean of each value and its `reach` neighbours on either side along a row."""
    width = 2 * reach + 1
    sums = np.cumsum(np.pad(values, ((0, 0), (reach + 1, reach)), mode="edge"), axis=1)
    return (sums[:, width:] - sums[:, :-width]) / width


def find_edge(img, expected_rows, px_y):
    """Row of the sky/land edge in each column of `img`, whose rows run `px_y` to the degree.

    The measure is how sharply the picture changes across a row: the mean of the few rows above it against the
    mean of the few below, summed over the three channels and averaged over a few columns, so that a star or a
    speck does not count. Open sky, from a degree above the traced skyline to a third of a degree above it,
    says how calm that measure is where nothing happens. The edge is the first row, searching downward, that
    clears two and a half times that, followed down to the top of its rise. Taking the first sharp change
    and not the strongest finds a hazy far range standing in front of the sky where a darker, nearer ridge
    lies below it, and the top of a snowfield where the snow ends more sharply against rock than it begins
    against sky.
    """
    h, w = img.shape[:2]
    k = max(2, int(round(0.058 * px_y)))
    sums = np.cumsum(np.vstack([np.zeros((1, w, 3)), img.astype(np.float64)]), axis=0)
    ys = np.arange(k, h - k)
    change = np.zeros((h, w), dtype=np.float32)
    change[k:h - k] = np.abs((sums[ys] - sums[ys - k]) / k - (sums[ys + k] - sums[ys]) / k).sum(axis=2)
    change = across(change, 3)

    cols = np.arange(w)
    expected = np.round(expected_rows).astype(int)
    high, near = int(1.0 * px_y), int(0.35 * px_y)
    open_sky = change[np.clip(expected[:, None] + np.arange(-high, -near)[None, :], k, h - k - 1), cols[:, None]]
    bar = max(3.0, 2.5 * float(np.percentile(open_sky, 99.5)))

    rows = np.clip(expected[:, None] + np.arange(-near, int(0.8 * px_y))[None, :], k, h - k - 1)
    values = change[rows, cols[:, None]]
    over = values > bar
    found = over.any(axis=1)
    first = over.argmax(axis=1)
    edge = np.full(w, np.nan)
    for x in np.where(found)[0]:
        j = first[x]
        while j + 1 < values.shape[1] and values[x, j + 1] >= values[x, j]:
            j += 1
        edge[x] = rows[x, j]

    # A column where nothing was found, or whose edge stands apart from its neighbours', takes theirs: the
    # same distance from the traced skyline as the columns either side.
    offset = edge - expected_rows
    span = 31
    padded = np.pad(offset, span // 2, mode="edge")
    with np.errstate(all="ignore"):
        usual = np.array([np.nanmedian(padded[i:i + span]) for i in range(w)])
    stray = ~np.isfinite(offset) | ~(np.abs(offset - usual) <= 0.08 * px_y)
    if (~stray).sum() < 2:
        raise SystemExit("no sky/land edge found near the traced skyline: is this a strip of the right frame?")
    offset = np.where(stray, np.interp(cols, cols[~stray], offset[~stray]), offset)

    # Trees roughen the edge. Take the lowest of each few columns and step a little under it, so that no sky
    # shows between the treetops or in the soft pixels of the edge itself.
    edge = expected_rows + offset
    padded = np.pad(edge, 2, mode="edge")
    edge = np.max([padded[i:i + w] for i in range(5)], axis=0) + 0.02 * px_y
    return edge, {"found": float(found.mean()), "stray": float(stray.mean())}


report = {}
for name in sorted(f for f in os.listdir(frames_dir) if f[:2].isdigit() and f.endswith(".png")):
    full = np.asarray(Image.open(os.path.join(frames_dir, name)).convert("RGB")).astype(np.float32)
    # Work at half the generated size, each pixel the mean of four: the textures are smaller still, and a
    # picture averaged down first does not shimmer when it is sampled.
    fh, fw = full.shape[0] // 2 * 2, full.shape[1] // 2 * 2
    src = full[:fh, :fw].reshape(fh // 2, 2, fw // 2, 2, 3).mean(axis=(1, 3))
    del full
    h, w = src.shape[:2]
    px_x, px_y = w / FOV, h / HEIGHT_DEG
    az = AZ0 + (np.arange(w) + 0.5) / px_x
    expected = (TOP - crest(az)) * px_y
    edge, how = find_edge(src, expected, px_y)
    drift = (expected - edge) / px_y  # positive: the generated ridge sits higher than the real one
    report[name] = {
        "drift_deg_mean": round(float(np.abs(drift).mean()), 3),
        "drift_deg_max": round(float(np.abs(drift).max()), 3),
        "edge_found": round(how["found"], 4),
        "edge_taken_from_neighbours": round(how["stray"], 4),
    }

    # Build the output: for each output column, the source column; for each output row below the real
    # skyline, the source row after remapping [edge, h) onto [real_row, out_h).
    ox = np.arange(OUT_W)
    sx = np.clip(((ox + 0.5) / PX) * px_x - 0.5, 0, w - 1)
    sx0 = np.floor(sx).astype(int)
    sx1 = np.minimum(sx0 + 1, w - 1)
    fx = sx - sx0
    out_az = AZ0 + (ox + 0.5) / PX
    real_row = (TOP - crest(out_az)) * (OUT_H / HEIGHT_DEG)
    # Per output column, the edge row in the source (interpolated between the two source columns).
    e = edge[sx0] * (1 - fx) + edge[sx1] * fx
    oy = np.arange(OUT_H, dtype=np.float64)[:, None] + 0.5
    # Below the real skyline: the source land, stretched from its own edge to the bottom. Above it: the
    # source's first row of land again and again, which is the ridge's colour carried upward.
    below = np.maximum(oy - real_row[None, :], 0)
    sy = e[None, :] + below / np.maximum(OUT_H - real_row[None, :], 1) * (h - e[None, :])
    sy = np.clip(sy - 0.5, 0, h - 1)
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
    img = Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8))
    stem = name[:-4]
    img.save(os.path.join(out_dir, f"{stem}.png"))
    sizes = []
    for width, height, quality, ending in SERVED:
        path = os.path.join(out_dir, f"{stem}{ending}.webp")
        img.resize((width, height), Image.LANCZOS).save(path, "WEBP", quality=quality, method=6)
        sizes.append(f"{width}: {os.path.getsize(path) // 1024} KB")
    print(f"{name:28s} drift mean {report[name]['drift_deg_mean']:.3f} max {report[name]['drift_deg_max']:.3f} deg  -> webp {', '.join(sizes)}")

json.dump(report, open(os.path.join(out_dir, "lock-report.json"), "w"), indent=1)

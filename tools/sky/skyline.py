"""Traces the skyline seen from the Santa Fe Plaza out of USGS 3DEP 1/3 arc-second elevation data.

Usage: python3 -I skyline.py <USGS_13_n36w106.tif> <out.json>

For each azimuth, a ray is marched outward from the viewpoint; the land's altitude angle at each step is its
height above the observer, less the drop of the earth's curve (with standard refraction), over its distance.
The skyline is the greatest of these along the ray; the distance where it occurs is kept too.
"""
import json
import math
import sys

import numpy as np
import tifffile

tif_path, out_path = sys.argv[1], sys.argv[2]

# The viewpoint: a rooftop on the Plaza, about 8 m above the ground.
LAT, LON, EYE_ABOVE_GROUND = 35.687, -105.9378, 8.0
EARTH_R, REFRACTION = 6371000.0, 0.13
AZ_FROM, AZ_TO, AZ_STEP = 15.0, 165.0, 0.01
STEP_M, MAX_M = 10.0, 90000.0

with tifffile.TiffFile(tif_path) as tif:
    page = tif.pages[0]
    tags = {t.name: t.value for t in page.tags.values()}
    scale = tags["ModelPixelScaleTag"]  # (sx, sy, sz) in degrees
    tie = tags["ModelTiepointTag"]  # (i, j, k, x, y, z): pixel (i, j) maps to (lon x, lat y)
    nodata = tags.get("GDAL_NODATA")
    dem = page.asarray().astype(np.float32)
sx, sy = float(scale[0]), float(scale[1])
lon0, lat0 = float(tie[3]) - float(tie[0]) * sx, float(tie[4]) + float(tie[1]) * sy
rows, cols = dem.shape
if nodata is not None:
    dem[dem == float(nodata)] = np.nan
print(f"DEM {cols}x{rows}, pixel {sx*3600:.2f} arcsec, origin lon {lon0:.4f} lat {lat0:.4f}, range {np.nanmin(dem):.0f}..{np.nanmax(dem):.0f} m")


def sample(lon, lat):
    """Bilinear elevation at lon/lat arrays, NaN outside the tile."""
    fx = (lon - lon0) / sx
    fy = (lat0 - lat) / sy
    ok = (fx >= 0) & (fx < cols - 1) & (fy >= 0) & (fy < rows - 1)
    fx = np.where(ok, fx, 0)
    fy = np.where(ok, fy, 0)
    x0 = fx.astype(np.int64)
    y0 = fy.astype(np.int64)
    tx = fx - x0
    ty = fy - y0
    z = (dem[y0, x0] * (1 - tx) * (1 - ty) + dem[y0, x0 + 1] * tx * (1 - ty)
         + dem[y0 + 1, x0] * (1 - tx) * ty + dem[y0 + 1, x0 + 1] * tx * ty)
    return np.where(ok, z, np.nan)


ground = float(sample(np.array([LON]), np.array([LAT]))[0])
eye = ground + EYE_ABOVE_GROUND
print(f"ground at the Plaza {ground:.1f} m, eye {eye:.1f} m")

m_per_deg_lat = 111132.954 - 559.822 * math.cos(2 * math.radians(LAT)) + 1.175 * math.cos(4 * math.radians(LAT))
m_per_deg_lon = 111412.84 * math.cos(math.radians(LAT)) - 93.5 * math.cos(3 * math.radians(LAT))

distances = np.arange(STEP_M, MAX_M + STEP_M, STEP_M)
drop = distances ** 2 / (2 * EARTH_R) * (1 - REFRACTION)
azimuths = np.arange(AZ_FROM, AZ_TO + AZ_STEP / 2, AZ_STEP)
altitude = np.zeros(len(azimuths), dtype=np.float32)
at_distance = np.zeros(len(azimuths), dtype=np.float32)
# The same profile for the land within 9 km (the foothills) and within 3 km (the town and the hills behind it).
near9 = np.zeros(len(azimuths), dtype=np.float32)
near3 = np.zeros(len(azimuths), dtype=np.float32)
i9 = int(9000 / STEP_M)
i3 = int(3000 / STEP_M)
for i, az in enumerate(azimuths):
    a = math.radians(az)
    lat = LAT + distances * math.cos(a) / m_per_deg_lat
    lon = LON + distances * math.sin(a) / m_per_deg_lon
    z = sample(lon, lat)
    angle = np.degrees(np.arctan2(z - eye - drop, distances))
    angle = np.where(np.isnan(angle), -90, angle)
    k = int(np.argmax(angle))
    altitude[i] = angle[k]
    at_distance[i] = distances[k]
    near9[i] = angle[:i9].max()
    near3[i] = angle[:i3].max()

# Check against the summits' published positions and heights.
summits = {
    "Santa Fe Baldy": (35.8306, -105.7578, 3847), "Lake Peak": (35.7964, -105.7708, 3782),
    "Tesuque Peak": (35.7808, -105.7897, 3671), "Penitente Peak": (35.7911, -105.7525, 3734),
    "Thompson Peak": (35.6992, -105.7836, 3217), "Glorieta Baldy": (35.6358, -105.7947, 3109),
    "Picacho Peak": (35.6828, -105.8847, 2614), "Atalaya Mountain": (35.6744, -105.8706, 2780),
}
for name, (slat, slon, selev) in summits.items():
    dn = (slat - LAT) * m_per_deg_lat
    de = (slon - LON) * m_per_deg_lon
    d = math.hypot(dn, de)
    az = math.degrees(math.atan2(de, dn)) % 360
    dem_z = float(sample(np.array([slon]), np.array([slat]))[0])
    alt = math.degrees(math.atan2(selev - eye - d * d / (2 * EARTH_R) * (1 - REFRACTION), d))
    j = int(round((az - AZ_FROM) / AZ_STEP))
    seen = altitude[j] if 0 <= j < len(altitude) else float("nan")
    print(f"{name:18s} az {az:6.2f}  published {selev} m, DEM {dem_z:6.0f} m, {d/1000:5.1f} km, summit altitude {alt:5.2f} deg, skyline there {seen:5.2f} deg")

json.dump({
    "viewpoint": {"lat": LAT, "lon": LON, "eye_m": round(eye, 1), "ground_m": round(ground, 1)},
    "source": "USGS 3DEP 1/3 arc-second, tile n36w106",
    "az_from": AZ_FROM, "az_step": AZ_STEP,
    "altitude_deg": [round(float(v), 3) for v in altitude],
    "distance_m": [int(v) for v in at_distance],
    "within_9km_deg": [round(float(v), 3) for v in near9],
    "within_3km_deg": [round(float(v), 3) for v in near3],
}, open(out_path, "w"))
print("wrote", out_path, len(altitude), "samples; skyline max", float(altitude.max()), "deg at az", float(azimuths[int(altitude.argmax())]))

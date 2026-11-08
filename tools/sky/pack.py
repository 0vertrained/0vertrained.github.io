"""Packs the traced skyline and the summits into the module the page loads, assets/js/skyline-data.js.

Usage: python3 -I pack.py <skyline.json> <summits.json> <out.js>

The page needs azimuths 30° to 100° (the view spans about 40° to 80°, with room for wider screens), at the
trace's hundredth of a degree, as 16-bit values: altitude = value / 5000 - 2. Three profiles are packed: all
the land, the land within 9 km and the land within 3 km. Summits are kept when they stand on the skyline.
"""
import base64
import json
import struct
import sys

skyline_path, summits_path, out_path = sys.argv[1:4]
sky = json.load(open(skyline_path))
summits = json.load(open(summits_path))

AZ_FROM, AZ_TO = 30.0, 100.0
step = sky["az_step"]
i0 = int(round((AZ_FROM - sky["az_from"]) / step))
i1 = int(round((AZ_TO - sky["az_from"]) / step)) + 1


def pack(values):
    clipped = [min(65535, max(0, int(round((v + 2) * 5000)))) for v in values[i0:i1]]
    return base64.b64encode(struct.pack(f"<{len(clipped)}H", *clipped)).decode("ascii")


def crest_at(az):
    t = (az - sky["az_from"]) / step
    i = min(max(int(t), 0), len(sky["altitude_deg"]) - 2)
    f = t - i
    return sky["altitude_deg"][i] * (1 - f) + sky["altitude_deg"][i + 1] * f


kept = []
for name, s in summits.items():
    # A summit well below the skyline at its azimuth is behind a nearer ridge and left out; one within half a
    # degree is kept for the page to judge, which names a summit only when the trace reaches it. A second
    # name on the same shoulder (Deception Peak beside Tesuque Peak) is left out too.
    if s["altitude"] < crest_at(s["azimuth"]) - 0.5:
        continue
    if any(abs(k["azimuth"] - s["azimuth"]) < 0.3 for _, k in kept):
        continue
    kept.append((name, s))
kept.sort(key=lambda item: item[1]["azimuth"])
rows = []
for name, s in kept:
    rows.append(f'  {{ name: "{name}", lat: {s["lat"]}, lon: {s["lon"]}, elevation: {s["elevation"]}, azimuth: {s["azimuth"]}, altitude: {s["altitude"]}, distance: {int(round(s["distance_km"] * 1000))} }},')

out = f'''// The skyline seen from a rooftop on the Santa Fe Plaza, traced from USGS 3DEP 1/3 arc-second elevation data
// (tile n36w106): for each hundredth of a degree of azimuth from {AZ_FROM:.0f}° to {AZ_TO:.0f}°, the altitude in degrees of the
// highest land along that line of sight, with the earth's curve and standard refraction allowed for. Three
// profiles: all the land, the land within 9 km (the foothills) and the land within 3 km (the hills behind the
// town). Each is a base64 string of little-endian 16-bit values, altitude = value / 5000 - 2.
export const SKYLINE = {{
  viewpoint: {{ lat: {sky["viewpoint"]["lat"]}, lon: {sky["viewpoint"]["lon"]}, eye: {sky["viewpoint"]["eye_m"]} }},
  azFrom: {AZ_FROM},
  azStep: {step},
  crest: "{pack(sky["altitude_deg"])}",
  hills: "{pack(sky["within_9km_deg"])}",
  near: "{pack(sky["within_3km_deg"])}",
}};

// Summits on the skyline, snapped to the elevation data. Azimuth and altitude as seen from the viewpoint.
export const SUMMIT_TABLE = [
{chr(10).join(rows)}
];
'''
open(out_path, "w").write(out)
print("wrote", out_path, len(out) // 1024, "KB,", len(rows), "summits")

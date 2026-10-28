"""Build the Earth textures used by the hero scene from NASA public-domain imagery.

Run once (outputs are committed):  python3 scripts/build-textures.py <download-dir>

Sources (NASA Visible Earth, public domain):
  Blue Marble Next Generation, December 2004 - world.200412.3x5400x2700.jpg
  Black Marble 2016 city lights           - BlackMarble_2016_01deg.jpg (kept at 3600x1800)
  Blue Marble clouds                      - cloud_combined_2048.jpg
"""
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

SOURCES = {
    "day": "https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74218/world.200412.3x5400x2700.jpg",
    "night": "https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg",
    "clouds": "https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg",
}
OCEAN_RGB = np.array([2, 5, 20])
SIZE = (4096, 2048)
AUX_SIZE = (2048, 1024)
OUT = Path(__file__).resolve().parent.parent / "public" / "textures"


def fetch(key: str, cache: Path) -> Image.Image:
    path = cache / Path(SOURCES[key]).name
    if not path.exists():
        urllib.request.urlretrieve(SOURCES[key], path)
    return Image.open(path)


def main() -> None:
    cache = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".texture-cache")
    cache.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    Image.MAX_IMAGE_PIXELS = None

    day = fetch("day", cache).convert("RGB")
    day_px = np.asarray(day).astype(np.int16)
    water = (np.abs(day_px - OCEAN_RGB).sum(axis=2) < 18).astype(np.uint8) * 255
    water_img = Image.fromarray(water).filter(ImageFilter.GaussianBlur(1.2)).resize(AUX_SIZE, Image.LANCZOS)

    day.resize(SIZE, Image.LANCZOS).save(OUT / "earth-day.jpg", quality=84, optimize=True, progressive=True)

    # City lights at the source's native 0.1 degree resolution.
    fetch("night", cache).convert("L").save(OUT / "earth-lights.jpg", quality=84, optimize=True)

    clouds = fetch("clouds", cache).convert("L").resize(AUX_SIZE, Image.LANCZOS)
    # R = clouds, G = water mask, B = unused. 4:4:4 keeps the channels from bleeding.
    blank = Image.new("L", AUX_SIZE, 0)
    aux = Image.merge("RGB", (clouds, water_img, blank))
    aux.save(OUT / "earth-aux.jpg", quality=80, optimize=True, subsampling=0)
    for f in sorted(OUT.glob("earth-*.jpg")):
        print(f"{f.name}: {f.stat().st_size / 1024:.0f} KiB")


if __name__ == "__main__":
    main()

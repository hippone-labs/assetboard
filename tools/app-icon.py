#!/usr/bin/env python3
# Makes the Mac app icon's two forms from desktop/icon-1024.png (the full-bleed drawing rendered from desktop/icon.svg), with Pillow:
# - desktop/AppIcon.icon/Assets/icon.png: the same drawing as the one layer of the Icon Composer icon, which actool compiles into
#   Assets.car for macOS 26 and later (the system masks it and adds the edge and shadow itself);
# - desktop/icon-macos-1024.png: the AppIcon.icns form for older systems and the disk image's volume icon, on Apple's macOS grid:
#   the drawing scaled to 824×824 in the middle of the 1024 canvas, rounded corners and the drop shadow drawn in, the rest transparent.
# Usage: python3 tools/app-icon.py (after re-rendering desktop/icon-1024.png from desktop/icon.svg)
import pathlib
import shutil

from PIL import Image, ImageDraw, ImageFilter

desktop = pathlib.Path(__file__).resolve().parent.parent / "desktop"
CANVAS = 1024
TILE = 824  # the icon body on the macOS grid; 100 px of transparent margin on every side
RADIUS = 185.4  # the grid's corner radius at 1024
SHADOW_DY, SHADOW_BLUR, SHADOW_OPACITY = 10, 10, 0.3
SUPERSAMPLE = 4

source = desktop / "icon-1024.png"
shutil.copyfile(source, desktop / "AppIcon.icon" / "Assets" / "icon.png")

art = Image.open(source).convert("RGBA").resize((TILE, TILE), Image.LANCZOS)
big = Image.new("L", (TILE * SUPERSAMPLE, TILE * SUPERSAMPLE), 0)
ImageDraw.Draw(big).rounded_rectangle((0, 0, big.width - 1, big.height - 1), radius=RADIUS * SUPERSAMPLE, fill=255)
mask = big.resize((TILE, TILE), Image.LANCZOS)
art.putalpha(mask)

offset = (CANVAS - TILE) // 2
shadow_alpha = Image.new("L", (CANVAS, CANVAS), 0)
shadow_alpha.paste(mask.point(lambda a: round(a * SHADOW_OPACITY)), (offset, offset + SHADOW_DY))
shadow_alpha = shadow_alpha.filter(ImageFilter.GaussianBlur(SHADOW_BLUR / 2))
icon = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
icon.putalpha(shadow_alpha)
icon.alpha_composite(art, (offset, offset))
icon.save(desktop / "icon-macos-1024.png", optimize=True)

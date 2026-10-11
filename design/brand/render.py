# Renders Noctur's desktop icons and the moon textures the app uses, from the brand files here:
#   icon-1024.png                the square app icon (eclipse on the night background)
#   moon-earthshine-1024.png     the moon surface in bright earthshine (tone 3A4C7C), as in the icon
# Writes:
#   build/icon.icns, build/icon.png          macOS app icon (Apple grid) and Linux app icon
#   build/icon.ico, build/installerIcon.ico  Windows app and installer icon
#   resources/icon.png                       window icon
#   resources/icon_on_mac.png, icon_off_mac.png   macOS menu bar template (the moon in orbit filling the image;
#                                            no sparkle and 40% when off), shown at 18 pt by tray.ts
#   resources/icon.ico, icon_off.ico         Windows tray: blue moon with the sun, grey moon without it
#   resources/tray.png, tray_off.png         Linux tray, the same drawing
#   src/renderer/src/assets/moon/*.png       moon textures for Home and the sidebar mark
# Run with numpy and Pillow: python design/brand/render.py  (needs macOS iconutil for the .icns)
import io, os, struct, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SS = 8  # supersampling for drawn shapes


def out(*parts):
    p = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def hexc(h):
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255


# ---------- moon textures ----------
EARTH = Image.open(os.path.join(HERE, 'moon-earthshine-1024.png')).convert('RGBA')


# The brightest tone of the earthshine texture.
EARTHSHINE = '3A4C7C'


def tone(shadow, light, gamma):
    """The earthshine texture remapped onto a brighter ramp (the light-mode moons)."""
    im = np.asarray(EARTH, np.float32) / 255
    dark, mid = hexc('03040A'), hexc(EARTHSHINE)  # the earthshine ramp the texture was made with
    a = np.clip(((im[..., :3] - dark) / (mid - dark)).mean(axis=2), 0, 1) ** gamma
    lo, hi = hexc(shadow), hexc(light)
    rgb = lo + a[..., None] * (hi - lo)
    return Image.fromarray((np.dstack([rgb, im[..., 3:]]) * 255).astype(np.uint8), 'RGBA')


MOON_DAY = tone('A9B9DC', 'F7F9FF', 0.8)   # light mode, Home
# Light sidebar mark, Windows and Linux tray.
# Darker than the first 6F86C2 to E4ECFF, so it reaches about 3:1 on white (owner, 2026-10-11).
MOON_BLUE = tone('5068AE', 'D2DDF8', 0.9)

for name, im, size in [('earthshine', EARTH, 512), ('day', MOON_DAY, 512), ('blue', MOON_BLUE, 256)]:
    im.resize((size, size), Image.LANCZOS).save(out('src', 'renderer', 'src', 'assets', 'moon', f'{name}.png'), optimize=True)


# ---------- drawing helpers (100-unit canvas, supersampled) ----------
def grid(n):
    c = (np.arange(n) + 0.5) / n * 100
    return np.meshgrid(c, c)


def disc(n, cx, cy, r):
    x, y = grid(n)
    return ((x - cx) ** 2 + (y - cy) ** 2 <= r * r).astype(np.float32)


def ring(n, cx, cy, r, w):
    x, y = grid(n)
    d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    return (np.abs(d - r) <= w / 2).astype(np.float32)


def radial(n, cx, cy, r, stops):
    """Radial gradient as RGBA; stops are (offset, hex, alpha)."""
    x, y = grid(n)
    t = np.clip(np.sqrt((x - cx) ** 2 + (y - cy) ** 2) / r, 0, 1)
    offs = np.array([s[0] for s in stops])
    rgb = np.stack([np.interp(t, offs, [hexc(s[1])[k] for s in stops]) for k in range(3)], -1)
    a = np.interp(t, offs, [s[2] for s in stops])
    return np.dstack([rgb, a])


def over(dst, src):
    """Composites straight-alpha RGBA src over dst (both float arrays)."""
    sa, da = src[..., 3:], dst[..., 3:]
    oa = sa + da * (1 - sa)
    rgb = np.where(oa > 0, (src[..., :3] * sa + dst[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-6), 0)
    return np.dstack([rgb, oa])


def to_image(arr, size):
    im = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), 'RGBA')
    return im.resize((size, size), Image.LANCZOS)


# ---------- macOS menu bar: the moon in orbit, as a black template ----------
# Owner, 2026-10-11: the ring with a dot
# was "too simplistic"; this takes Astra Clash's layout (an arc that stops where a sparkle sits) with
# Noctur's moon in the middle. The arc starts just past the sparkle and runs 250 degrees round,
# thinning to 70% so its end stays at least a pixel wide at 18 pt. Disconnected: no sparkle, 40%.
MB_CX, MB_CY, MB_R, MB_W = 50, 50, 37, 7      # orbit centre, radius and stroke (100-unit canvas)
MB_MOON = 23
MB_SPARK_AT, MB_SPARK_R, MB_GAP = 45, 15, 6.5  # sparkle angle (degrees, 0 = right), half-size, clear gap
MB_SPAN, MB_END = 250, 0.70


def mb_point(a, r=MB_R):
    return MB_CX + r * np.cos(np.radians(a)), MB_CY - r * np.sin(np.radians(a))


def sparkle(n, cx, cy, r, p=0.45):
    """Four-point star with concave sides: |dx|^p + |dy|^p <= r^p."""
    x, y = grid(n)
    return ((np.abs(x - cx) ** p + np.abs(y - cy) ** p) <= r ** p).astype(np.float32)


def trail(n, a0, span, w0, w1):
    """Arc on the orbit from a0, counterclockwise by span, width w0 to w1, round caps."""
    x, y = grid(n)
    d = np.sqrt((x - MB_CX) ** 2 + (y - MB_CY) ** 2)
    ang = (np.degrees(np.arctan2(MB_CY - y, x - MB_CX)) + 360) % 360
    t = ((ang - a0) % 360) / span
    w = w0 + (w1 - w0) * np.clip(t, 0, 1)
    m = ((np.abs(d - MB_R) <= w / 2) & (t <= 1)).astype(np.float32)
    for a, ww in ((a0, w0), (a0 + span, w1)):
        m = np.maximum(m, disc(n, *mb_point(a), ww / 2))
    return m


def menu_bar_masks(n):
    # The arc's first cap sits so its edge is MB_GAP from the sparkle's tip.
    start = MB_SPARK_AT + np.degrees(2 * np.arcsin((MB_SPARK_R + MB_GAP + MB_W / 2) / (2 * MB_R)))
    body = np.maximum(disc(n, MB_CX, MB_CY, MB_MOON), trail(n, start, MB_SPAN, MB_W, MB_W * MB_END))
    on = np.maximum(body, sparkle(n, *mb_point(MB_SPARK_AT), MB_SPARK_R))
    return on, body


def template(mask, box, pad, alpha=1.0):
    """The mask cropped to `box` (the connected icon's edges, so the icon does not move between
    states), centred on a square with `pad` around it, as black with alpha."""
    y0, y1, x0, x1 = box
    crop = mask[y0:y1, x0:x1]
    h, w = crop.shape
    side = int(round(max(h, w) * (1 + 2 * pad)))
    sq = np.zeros((side, side, 4), np.float32)
    sq[(side - h) // 2:(side - h) // 2 + h, (side - w) // 2:(side - w) // 2 + w, 3] = crop * alpha
    return sq


mb_on, mb_off = menu_bar_masks(64 * SS)
ys, xs = np.nonzero(mb_on > 0.01)
mb_box = (ys.min(), ys.max() + 1, xs.min(), xs.max() + 1)
to_image(template(mb_on, mb_box, 1 / 64), 64).save(out('resources', 'icon_on_mac.png'))
to_image(template(mb_off, mb_box, 1 / 64, 0.4), 64).save(out('resources', 'icon_off_mac.png'))


# ---------- Windows and Linux tray: the blue moon, the sun at the top right when connected ----------
def tray(size, on):
    n = size * SS
    tex = MOON_BLUE.resize((round(n * 0.84), round(n * 0.84)), Image.LANCZOS)
    if not on:  # grey, 70%, no sun
        grey = tex.convert('LA').convert('RGBA')
        a = np.asarray(grey, np.float32) / 255
        a[..., 3] *= 0.7
        tex = Image.fromarray((a * 255).astype(np.uint8), 'RGBA')
    canvas = Image.new('RGBA', (n, n))
    canvas.alpha_composite(tex, (round(n * 0.06), round(n * 0.10)))
    arr = np.asarray(canvas, np.float32) / 255
    arr[..., 3] *= disc(n, 48, 52, 42)  # keep the moon round
    if on:
        arr = over(arr, radial(n, 78, 22, 22, [(0, 'FFF6E8', 1), (0.35, 'FFE2B8', 0.7), (1, 'FFC08E', 0)]))
        core = np.dstack([np.ones((n, n, 3), np.float32), disc(n, 78, 22, 7)])
        arr = over(arr, core)
    return to_image(arr, size)


def write_ico(images, path):
    """ICO with one PNG entry per size (read by Windows Vista and later)."""
    blobs = []
    for im in images:
        b = io.BytesIO(); im.save(b, 'PNG'); blobs.append(b.getvalue())
    head = struct.pack('<HHH', 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries = b''
    for im, data in zip(images, blobs):
        w = im.width
        entries += struct.pack('<BBBBHHII', 0 if w >= 256 else w, 0 if w >= 256 else w, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    with open(path, 'wb') as f:
        f.write(head + entries + b''.join(blobs))


TRAY_SIZES = [16, 20, 24, 32, 40, 48, 64]
write_ico([tray(s, True) for s in TRAY_SIZES], out('resources', 'icon.ico'))
write_ico([tray(s, False) for s in TRAY_SIZES], out('resources', 'icon_off.ico'))
tray(64, True).save(out('resources', 'tray.png'))
tray(64, False).save(out('resources', 'tray_off.png'))


# ---------- app icons ----------
SRC = Image.open(os.path.join(HERE, 'icon-1024.png')).convert('RGBA')


def rounded_mask(size, w, m, rx):
    n = size * 4
    x, y = np.meshgrid(np.arange(n) + 0.5, np.arange(n) + 0.5)
    M, W, R = m * 4, w * 4, rx * 4
    cx = np.clip(x, M + R, M + W - R); cy = np.clip(y, M + R, M + W - R)
    inside = ((x - cx) ** 2 + (y - cy) ** 2 <= R * R) & (x >= M) & (x <= M + W) & (y >= M) & (y <= M + W)
    return Image.fromarray((inside * 255).astype(np.uint8), 'L').resize((size, size), Image.LANCZOS)


def app_icon(m, rx, shadow):
    """The square icon inside a rounded shape of 1024 - 2m with corner radius rx, on transparent."""
    w = 1024 - 2 * m
    face = Image.new('RGBA', (1024, 1024))
    face.paste(SRC.resize((w, w), Image.LANCZOS), (m, m))
    mask = rounded_mask(1024, w, m, rx)
    face.putalpha(mask)
    # A faint light edge, as macOS icons have.
    edge = np.asarray(rounded_mask(1024, w, m, rx), np.float32) - np.asarray(rounded_mask(1024, w - 2, m + 1, rx - 1), np.float32)
    e = np.zeros((1024, 1024, 4), np.uint8); e[..., :3] = 255; e[..., 3] = np.clip(edge * 0.12, 0, 255).astype(np.uint8)
    face.alpha_composite(Image.fromarray(e, 'RGBA'))
    if not shadow:
        return face
    sh = Image.new('RGBA', (1024, 1024))
    s = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0)); s.putalpha(mask.point(lambda v: int(v * 0.32)))
    sh.alpha_composite(s, (0, 12))
    sh = sh.filter(ImageFilter.GaussianBlur(14))
    sh.alpha_composite(face)
    return sh


mac = app_icon(100, 185, True)   # Apple's grid: 824 px shape at a 100 px margin
win = app_icon(32, 200, False)   # Windows and Linux: nearly full size

with tempfile.TemporaryDirectory() as tmp:
    iconset = os.path.join(tmp, 'icon.iconset')
    os.makedirs(iconset)
    for s in [16, 32, 128, 256, 512]:
        mac.resize((s, s), Image.LANCZOS).save(os.path.join(iconset, f'icon_{s}x{s}.png'))
        mac.resize((s * 2, s * 2), Image.LANCZOS).save(os.path.join(iconset, f'icon_{s}x{s}@2x.png'))
    subprocess.run(['iconutil', '-c', 'icns', iconset, '-o', out('build', 'icon.icns')], check=True)

win.resize((512, 512), Image.LANCZOS).save(out('build', 'icon.png'))
win.resize((512, 512), Image.LANCZOS).save(out('resources', 'icon.png'))
APP_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]
write_ico([win.resize((s, s), Image.LANCZOS) for s in APP_SIZES], out('build', 'icon.ico'))
write_ico([win.resize((s, s), Image.LANCZOS) for s in APP_SIZES], out('build', 'installerIcon.ico'))
print('icons written')

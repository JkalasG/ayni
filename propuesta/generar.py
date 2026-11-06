"""
Ayni brand kit: logos and banners as self-contained SVG.

The wordmark is "ayni" set in Unbounded ExtraBold (the app's display face) and converted to outlines,
so the files look the same everywhere, with or without internet. The emblem is a rombo of solid
bands: warm threads on the left, cool threads on the right, meeting at a gold center, the pot.
The banners keep the textile landscape of the app (aguayo bands, stepped mountains, a striped sun).

    python propuesta/generar.py propuesta      (run from the repository root; needs fontTools)
"""
import os, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

OUT = sys.argv[1] if len(sys.argv) > 1 else "propuesta"
FONTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app", "node_modules", "@expo-google-fonts")
os.makedirs(os.path.join(OUT, "logos"), exist_ok=True)
os.makedirs(os.path.join(OUT, "banners"), exist_ok=True)

NIGHT = "#0B0E27"; SURFACE = "#151A3D"; CREAM = "#F7F3EA"; INK = "#1A1A3A"; DAWN = "#FFF6EC"
FU = "#FF4A97"; NA = "#FF8A1F"; AM = "#FFD23F"; VE = "#2FD49A"; TU = "#29C6E0"; GOLD = "#FFC93C"
FU_D = "#D4106B"; NA_D = "#D46400"; AM_D = "#B07F00"; VE_D = "#0E9A64"; TU_D = "#0A8BA8"

DARK = dict(bg=NIGHT, ink=CREAM, muted="#C9C3D9", warm=(FU, AM), cool=(TU, VE), center=GOLD, threads=(FU, NA, AM, VE, TU))
LIGHT = dict(bg=DAWN, ink=INK, muted="#4A4766", warm=(FU_D, AM_D), cool=(TU_D, VE_D), center="#E0A000", threads=(FU_D, NA_D, AM_D, VE_D, TU_D))

# ---------------------------------------------------------------- text as outlines
class Face:
    def __init__(self, family, weight):
        self.font = TTFont(os.path.join(FONTS_DIR, family.lower(), weight, f"{family}_{weight}.ttf"))
        self.glyphs = self.font.getGlyphSet()
        self.cmap = self.font.getBestCmap()
        self.upm = self.font["head"].unitsPerEm
        os2 = self.font["OS/2"]
        self.x_height = os2.sxHeight / self.upm
        self.cap = os2.sCapHeight / self.upm

    def width(self, text, size, tracking=0.0):
        w = sum(self.glyphs[self.cmap[ord(ch)]].width for ch in text) / self.upm * size
        return w + tracking * size * (len(text) - 1)

    def path(self, text, x, baseline, size, tracking=0.0):
        """SVG path data for text whose left edge is x and baseline is baseline."""
        s = size / self.upm
        pen = SVGPathPen(self.glyphs)
        cursor = x
        for ch in text:
            g = self.cmap[ord(ch)]
            self.glyphs[g].draw(TransformPen(pen, (s, 0, 0, -s, cursor, baseline)))
            cursor += self.glyphs[g].width * s + tracking * size
        return pen.getCommands()

UNB_XB = Face("Unbounded", "800ExtraBold")   # wordmark, as in the app sidebar
UNB_BLK = Face("Unbounded", "900Black")      # banner headlines
FIG = Face("Figtree", "400Regular")
FIG_B = Face("Figtree", "700Bold")
TRACK = -0.05  # the sidebar sets "ayni" with letterSpacing -2 at 40 px

def text(face, s, x, baseline, size, fill, anchor="start", tracking=0.0):
    w = face.width(s, size, tracking)
    if anchor == "middle": x -= w / 2
    elif anchor == "end": x -= w
    return f'<path d="{face.path(s, x, baseline, size, tracking)}" fill="{fill}"/>'

# ---------------------------------------------------------------- emblem
def emblem(cx, cy, r, theme, transparent_gap=None):
    """Rombo of solid bands, split down the middle: give (warm) and receive (cool), around the pot."""
    band = r * 0.22; gap = r * 0.1; seam = r * 0.07
    out = []
    radius = r
    for i in range(2):
        inner = radius - band
        for side, color in ((-1, theme["warm"][i]), (1, theme["cool"][i])):
            sx = cx + side * seam / 2
            pts = [(sx, cy - radius + seam / 2), (sx + side * (radius - seam / 2), cy), (sx, cy + radius - seam / 2),
                   (sx, cy + inner), (sx + side * inner, cy), (sx, cy - inner)]
            # keep the seam straight: clip the tips to the seam line
            d = "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in pts) + " Z"
            out.append(f'<path d="{d}" fill="{color}"/>')
        radius = inner - gap
    c = radius
    out.append(f'<path d="M{cx:.2f} {cy - c:.2f} L{cx + c:.2f} {cy:.2f} L{cx:.2f} {cy + c:.2f} L{cx - c:.2f} {cy:.2f} Z" fill="{theme["center"]}"/>')
    return "\n".join(out)

def lockup(x, y, height, theme, ink=None):
    """Emblem + wordmark side by side. (x, y) is the top-left corner; returns (svg, width)."""
    ink = ink or theme["ink"]
    size = height / 0.86              # font size so the emblem matches the text block
    r = height / 2
    xh = UNB_XB.x_height * size
    base = y + height / 2 + xh / 2    # x-height centered on the emblem
    tx = x + 2 * r + height * 0.32
    w = UNB_XB.width("ayni", size, TRACK)
    return emblem(x + r, y + r, r, theme) + "\n" + text(UNB_XB, "ayni", tx, base, size, ink, tracking=TRACK), tx + w - x

def svg(w, h, body, bg=None, title="Ayni"):
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="{title}">
<title>{title}</title>
{rect}
{body}
</svg>
'''

def write(name, content):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(content)
    print("wrote", name)

# ================================================================= LOGOS
def horizontal(theme, bg, fname, title, ink=None):
    H = 120; pad = 48
    body, w = lockup(pad, pad, H, theme, ink)
    write(fname, svg(int(w + 2 * pad), H + 2 * pad, body, bg, title))

horizontal(DARK, NIGHT, "logos/ayni-logo-horizontal-noche.svg", "Ayni, logo horizontal sobre noche andina")
horizontal(LIGHT, DAWN, "logos/ayni-logo-horizontal-amanecer.svg", "Ayni, logo horizontal sobre amanecer andino")
horizontal(DARK, None, "logos/ayni-logo-horizontal-transparente-claro.svg", "Ayni, logo para fondos oscuros")
horizontal(LIGHT, None, "logos/ayni-logo-horizontal-transparente-oscuro.svg", "Ayni, logo para fondos claros")

def wordmark_only(theme, bg, fname, title):
    size = 160; pad = 48
    w = UNB_XB.width("ayni", size, TRACK)
    asc = UNB_XB.cap * size
    desc = 0.25 * size
    body = text(UNB_XB, "ayni", pad, pad + asc, size, theme["ink"], tracking=TRACK)
    write(fname, svg(int(w + 2 * pad), int(asc + desc + 2 * pad), body, bg, title))

wordmark_only(DARK, NIGHT, "logos/ayni-logotipo-noche.svg", "Ayni, solo el logotipo")
wordmark_only(LIGHT, DAWN, "logos/ayni-logotipo-amanecer.svg", "Ayni, solo el logotipo, versión clara")

def stacked(theme, fname, title):
    W = 640; r = 120
    body = emblem(W / 2, 60 + r, r, theme)
    size = 150
    base = 60 + 2 * r + 70 + UNB_XB.x_height * size
    body += "\n" + text(UNB_XB, "ayni", W / 2, base, size, theme["ink"], "middle", TRACK)
    ty = base + 90
    body += "\n" + text(FIG_B, "Hoy por ti, mañana por mí.", W / 2, ty, 30, theme["muted"], "middle")
    write(fname, svg(W, int(ty + 60), body, theme["bg"], title))

stacked(DARK, "logos/ayni-logo-vertical-noche.svg", "Ayni, logo vertical con lema")
stacked(LIGHT, "logos/ayni-logo-vertical-amanecer.svg", "Ayni, logo vertical con lema, versión clara")

def app_icon(theme, fname, title):
    rect = f'<rect width="1024" height="1024" rx="224" fill="{theme["bg"]}"/>'
    write(fname, svg(1024, 1024, rect + "\n" + emblem(512, 512, 330, theme), None, title))

app_icon(DARK, "logos/ayni-icono-app.svg", "Ayni, ícono de la app")
app_icon(LIGHT, "logos/ayni-icono-app-claro.svg", "Ayni, ícono de la app, versión clara")

def mono(color, fname, title):
    t = dict(warm=(color, color), cool=(color, color), center=color, ink=color)
    H = 120; pad = 48
    body, w = lockup(pad, pad, H, t)
    write(fname, svg(int(w + 2 * pad), H + 2 * pad, body, None, title))

mono(INK, "logos/ayni-logo-monocromo-tinta.svg", "Ayni, logo a una tinta oscura")
mono(CREAM, "logos/ayni-logo-monocromo-crema.svg", "Ayni, logo a una tinta clara")

# ================================================================= BANNERS (textile landscape)
def stitch(x, y, s, gap=0.12):
    g = s * gap
    return f"M{x*s+g:.2f} {y*s+g:.2f}h{s-2*g:.2f}v{s-2*g:.2f}h{-(s-2*g):.2f}z"

def paths(cells, s, ox=0, oy=0):
    return "\n".join(f'<path transform="translate({ox:.2f} {oy:.2f})" d="{"".join(stitch(x, y, s) for x, y in pts)}" fill="{color}"/>' for color, pts in cells.items())

def band(width_cells, motif, colors, rows=7):
    cells = {}
    for x in range(width_cells):
        for y in range(rows):
            col = None
            if motif == "rombos":
                p = 8; m = x % p; c = 3
                d = abs(m - c) + abs(y - c)
                if d == c: col = colors[(x // p) % len(colors)]
                elif d == 0: col = colors[(x // p + 1) % len(colors)]
            elif motif == "franjas":
                col = colors[y % len(colors)] if y in (0, 1, 5, 6) else (colors[-1] if x % 4 == 0 and y == 3 else None)
            if col: cells.setdefault(col, []).append((x, y))
    return cells

def mountains(width_cells, base_y, peaks):
    pts = []
    for x in range(width_cells):
        h = max(ph - abs(x - cx) // 2 for cx, ph in peaks)
        pts += [(x, base_y - y) for y in range(max(h, 0))]
    return pts

def banner(W, H, fname, title, headline, sub, chips, layout="left", theme=DARK):
    light = theme is LIGHT
    ink, muted, th = theme["ink"], theme["muted"], theme["threads"]
    center = layout != "left"
    s = max(6, round(W / 200))
    cols = W // s + 1
    body = []
    # striped sun
    sun_r = min(H * (0.13 if center else 0.2), W * 0.1)
    sun_x = W - sun_r - W * 0.05 if center else W * 0.8
    sun_y = H * (0.26 if center else 0.40)
    if center:  # the logo spans the top, so the sun sets behind the mountains instead
        sun_r = H * 0.09; sun_x = W * 0.82; sun_y = H * 0.8
    body.append(f'<defs><clipPath id="sun"><circle cx="{sun_x}" cy="{sun_y}" r="{sun_r}"/></clipPath></defs>')
    sun_cols = [AM_D, NA_D, FU_D] if light else [AM, GOLD, NA]
    body.append('<g clip-path="url(#sun)">' + "".join(f'<rect x="{sun_x-sun_r}" y="{sun_y-sun_r+i*sun_r*2/9}" width="{sun_r*2}" height="{sun_r*2/9*0.62}" fill="{sun_cols[i%3]}"/>' for i in range(9)) + "</g>")
    # stepped mountains with snow
    base = H // s - 9
    k = (H / s) * ((0.14 if W / H > 1.2 else 0.1) if center else 0.3)
    peaks = [(int(cols * 0.12), int(k * 0.55)), (int(cols * 0.34), int(k * 0.75)), (int(cols * 0.6), int(k)), (int(cols * 0.86), int(k * 0.68))]
    back = mountains(cols, base, peaks)
    body.append(paths({"#E8DCCB" if light else "#1E2452": back}, s))
    body.append(paths({"#D9C6AE" if light else "#151A3D": mountains(cols, base, [(int(cols * 0.22), int(k * 0.4)), (int(cols * 0.5), int(k * 0.48)), (int(cols * 0.75), int(k * 0.55))])}, s))
    body.append(paths({"#FFFFFF" if light else CREAM: [(x, y) for x, y in back if y < base - k * 0.78]}, s))
    # aguayo bands
    body.append(f'<rect y="{(base+1)*s}" width="{W}" height="{H-(base+1)*s}" fill="{"#FBE9D7" if light else SURFACE}"/>')
    body.append(paths(band(cols, "franjas", [th[0], th[2], th[4]]), s, 0, (base + 1) * s))
    body.append(paths(band(int(cols / 0.7) + 1, "rombos", [th[4], th[0], th[2]]), s * 0.7, 0, s * 0.7))
    # logo
    if center:
        lh = H * (0.15 if W / H > 1.2 else 0.11)
        _, lw = lockup(0, 0, lh, theme)
        y0 = H * (0.16 if W / H < 1.2 else 0.2)
        body.append(lockup((W - lw) / 2, y0, lh, theme)[0])
        ty = y0 + lh + H * 0.17
        anchor, tx = "middle", W / 2
    else:
        lh = H * 0.13
        x0 = W * 0.07; y0 = H * 0.17
        body.append(lockup(x0, y0, lh, theme)[0])
        ty = y0 + lh + H * 0.16
        anchor, tx = "start", x0
    fs = H * 0.062 if W / H > 1.2 else H * 0.07
    for i, line in enumerate(headline):
        body.append(text(UNB_BLK, line, tx, ty + i * fs * 1.2, fs, ink, anchor))
    sy = ty + (len(headline) - 1) * fs * 1.2 + fs * 0.95
    sfs = fs * 0.5
    for i, line in enumerate(sub):
        body.append(text(FIG, line, tx, sy + i * sfs * 1.4, sfs, muted, anchor))
    # chips
    cfs = fs * 0.4
    cy = sy + len(sub) * sfs * 1.4 + cfs * 0.6
    widths = [FIG_B.width(t, cfs) + cfs * 1.8 for t in chips]
    cx = tx - (sum(widths) + cfs * 0.6 * (len(chips) - 1)) / 2 if center else tx
    for t, wdt, col in zip(chips, widths, (th[0], th[4], th[2], th[3])):
        body.append(f'<rect x="{cx:.1f}" y="{cy:.1f}" width="{wdt:.1f}" height="{cfs*2.1:.1f}" fill="{theme["bg"]}" stroke="{col}" stroke-width="2"/>')
        body.append(text(FIG_B, t, cx + wdt / 2, cy + cfs * 1.42, cfs, ink, "middle"))
        cx += wdt + cfs * 0.6
    write(fname, svg(W, H, "\n".join(body), theme["bg"], title))

CHIPS = ["Pagos con PayPal", "Garantía que protege al grupo", "IA que explica"]
banner(1280, 640, "banners/ayni-github-social-1280x640.svg", "Ayni, banner para GitHub",
       ["El pasanaku de siempre,", "con PayPal y sin miedo."], ["Ahorro rotativo entre personas de confianza, en Bolivia y en la diáspora."], CHIPS)
banner(1280, 640, "banners/ayni-github-social-claro-1280x640.svg", "Ayni, banner para GitHub, versión clara",
       ["El pasanaku de siempre,", "con PayPal y sin miedo."], ["Ahorro rotativo entre personas de confianza, en Bolivia y en la diáspora."], CHIPS, theme=LIGHT)
banner(1500, 500, "banners/ayni-portada-x-1500x500.svg", "Ayni, portada para X y LinkedIn",
       ["Hoy por ti, mañana por mí."], ["Pasanakus con PayPal: cada aporte es un hilo del tejido."], CHIPS)
banner(1200, 800, "banners/ayni-devpost-1200x800.svg", "Ayni, portada para Devpost",
       ["Pasanakus con PayPal e IA"], ["Ahorro rotativo seguro, de Bolivia al mundo."], CHIPS[:2], layout="center")
banner(1080, 1080, "banners/ayni-redes-1080x1080.svg", "Ayni, publicación cuadrada para redes",
       ["Tu pasanaku,", "tejido con confianza."], ["Pagos con PayPal, garantía y un asistente con IA."], ["PayPal", "Garantía", "IA"], layout="center")
banner(1920, 1080, "banners/ayni-video-1920x1080.svg", "Ayni, portada del video",
       ["Ayni en 3 minutos"], ["Un pasanaku completo con PayPal: pagar, cubrir con garantía, recibir el pozo."], CHIPS, layout="center")

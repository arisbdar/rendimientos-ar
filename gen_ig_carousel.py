#!/usr/bin/env python3
"""Generate Instagram carousel images for plazo fijo rates — with logos."""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import json, os, urllib.request, io, ssl

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "ig_carousel")
LOGO_CACHE = os.path.join(os.path.dirname(__file__), "logo_cache")
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(LOGO_CACHE, exist_ok=True)

W, H = 1080, 1350
MARGIN = 60

# Colors
BG = (17, 17, 19)
CARD_BG = (28, 28, 32)
CARD_HIGHLIGHT = (35, 35, 42)
TEXT = (240, 240, 242)
TEXT_SEC = (160, 160, 168)
ACCENT = (59, 130, 246)
GREEN = (52, 211, 153)
BORDER = (42, 42, 48)

GRADIENT_COLORS = [
    (52, 211, 153),   # green - top
    (45, 190, 160),
    (40, 170, 170),
    (50, 150, 190),
    (59, 130, 246),   # blue - bottom
]

def lerp(a, b, t):
    return int(a + (b - a) * t)

def gradient_color(rank, total):
    t = rank / max(total - 1, 1)
    idx = t * (len(GRADIENT_COLORS) - 1)
    i = int(idx)
    f = idx - i
    if i >= len(GRADIENT_COLORS) - 1:
        return GRADIENT_COLORS[-1]
    c1, c2 = GRADIENT_COLORS[i], GRADIENT_COLORS[i + 1]
    return (lerp(c1[0], c2[0], f), lerp(c1[1], c2[1], f), lerp(c1[2], c2[2], f))

BANK_LOGOS = {
    "Banco CMF": "https://api.argentinadatos.com/static/logos/banco-cmf.jpg",
    "Crédito Regional": "https://api.argentinadatos.com/static/logos/credito-regional.jpg",
    "Banco Voii": "https://api.argentinadatos.com/static/logos/banco-voii.jpg",
    "Banco BICA": "https://api.argentinadatos.com/static/logos/banco-bica.svg",
    "Reba Compañía Financiera": "http://www.bcra.gob.ar/archivos/Imagenes/logosbancos/45072.png",
    "Banco del Sol": "https://api.argentinadatos.com/static/logos/banco-del-sol.svg",
    "Banco Mariva": "http://www.bcra.gob.ar/archivos/Imagenes/logosbancos/00254.png",
    "Banco Hipotecario": "https://api.argentinadatos.com/static/logos/banco-hipotecario.png",
    "Banco de la Prov. de Córdoba": "https://api.argentinadatos.com/static/logos/bancor.svg",
    "Bibank": "http://www.bcra.gob.ar/archivos/Imagenes/logosbancos/00147.png",
    "Banco Dino": "http://www.bcra.gob.ar/archivos/Imagenes/logosbancos/00448.png",
    "Banco Julio": "https://api.argentinadatos.com/static/logos/banco-julio.jpeg",
    "Banco Macro": "https://api.argentinadatos.com/static/logos/banco-macro.png",
    "Banco del Chubut": "http://www.bcra.gob.ar/archivos/Imagenes/logosbancos/00083.png",
    "Banco de la Prov. de Buenos Aires": "https://api.argentinadatos.com/static/logos/banco-provincia.png",
    "Banco Masventas": "http://www.bcra.gob.ar/archivos/Imagenes/logosbancos/00341.png",
    "ICBC Argentina": "https://api.argentinadatos.com/static/logos/banco-icbc.png",
    "Banco Nación": "https://api.argentinadatos.com/static/logos/banco-nacion.png",
    "Banco Comafi": "https://api.argentinadatos.com/static/logos/banco-comafi.png",
    "Banco de Corrientes": "https://api.argentinadatos.com/static/logos/banco-corrientes.svg",
    "Banco Santander": "https://api.argentinadatos.com/static/logos/banco-santander.png",
    "Banco Galicia": "https://api.argentinadatos.com/static/logos/banco-galicia.png",
    "BBVA Argentina": "https://api.argentinadatos.com/static/logos/bbva.png",
    "Banco Credicoop": "https://api.argentinadatos.com/static/logos/banco-credicoop.png",
    "Banco Ciudad": "https://api.argentinadatos.com/static/logos/banco-ciudad.png",
    "Banco de Comercio": "http://www.bcra.gob.ar/archivos/Imagenes/logosbancos/00432.png",
    "Banco de Formosa": "http://www.bcra.gob.ar/archivos/Imagenes/logosbancos/00315.png",
    "Banco Prov. Tierra del Fuego": "http://www.bcra.gob.ar/archivos/Imagenes/logosbancos/00268.png",
    "Banco Meridian": "https://www.bcra.gob.ar/archivos/Imagenes/logosbancos/00281.png",
    "Ualá": "https://api.argentinadatos.com/static/logos/uala.png",
}

# Logo bg colors for fallback
LOGO_BG = {
    "Banco CMF": "#1a3a5c", "Crédito Regional": "#0d47a1", "Banco Voii": "#6a1b9a",
    "Banco BICA": "#00695c", "Reba Compañía Financiera": "#e65100", "Banco del Sol": "#f9a825",
    "Banco Mariva": "#1565c0", "Banco Hipotecario": "#004d40", "Banco de la Prov. de Córdoba": "#1b5e20",
    "Bibank": "#0277bd", "Banco Dino": "#c62828", "Banco Julio": "#37474f",
    "Banco Macro": "#1a237e", "Banco del Chubut": "#004d40", "Banco de la Prov. de Buenos Aires": "#1565c0",
    "Banco Masventas": "#558b2f", "ICBC Argentina": "#b71c1c", "Banco Nación": "#0d47a1",
    "Banco Comafi": "#1a237e", "Banco de Corrientes": "#b71c1c", "Banco Santander": "#d32f2f",
    "Banco Galicia": "#e65100", "BBVA Argentina": "#004481", "Banco Credicoop": "#1b5e20",
    "Banco Ciudad": "#0d47a1", "Banco de Comercio": "#283593", "Banco de Formosa": "#2e7d32",
    "Banco Prov. Tierra del Fuego": "#00838f", "Banco Meridian": "#263238", "Ualá": "#6c63ff",
}

def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def get_font(size, bold=False):
    paths = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
    ]
    for fp in paths:
        try:
            return ImageFont.truetype(fp, size, index=1 if bold and fp.endswith('.ttc') else 0)
        except:
            continue
    return ImageFont.load_default()

def download_logo(name, url, size=48):
    """Download and cache logo, return as PIL Image."""
    safe_name = name.replace(" ", "_").replace("/", "_").replace(".", "_")
    cache_path = os.path.join(LOGO_CACHE, f"{safe_name}.png")

    if os.path.exists(cache_path):
        try:
            img = Image.open(cache_path).convert("RGBA")
            img = img.resize((size, size), Image.LANCZOS)
            return img
        except:
            pass

    if url.endswith('.svg'):
        return None  # Can't handle SVGs easily

    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            data = resp.read()
        img = Image.open(io.BytesIO(data)).convert("RGBA")
        img.save(cache_path)
        img = img.resize((size, size), Image.LANCZOS)
        return img
    except Exception as e:
        print(f"  Logo fail for {name}: {e}")
        return None

def make_circle_logo(img, size):
    """Crop image into a circle."""
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse([0, 0, size, size], fill=255)
    output = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img = img.resize((size, size), Image.LANCZOS)
    output.paste(img, (0, 0), mask)
    return output

def make_fallback_logo(name, bg_color, size=48):
    """Create a colored circle with initials."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([0, 0, size, size], fill=hex_to_rgb(bg_color))
    initials = name.replace("Banco ", "").replace("Compañía Financiera", "CF")[:2].upper()
    font = get_font(size // 3, bold=True)
    d.text((size // 2, size // 2), initials, anchor="mm", font=font, fill=(255, 255, 255))
    return img

def draw_rounded_rect(draw, xy, radius, fill, outline=None):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline)

def draw_slide_dots(draw, current, total):
    dot_r = 5
    gap = 20
    start_x = (W - total * gap) // 2
    y = H - 35
    for i in range(total):
        x = start_x + i * gap + dot_r
        color = ACCENT if i == current - 1 else BORDER
        draw.ellipse([x - dot_r, y - dot_r, x + dot_r, y + dot_r], fill=color)

# Load data
with open(os.path.join(os.path.dirname(__file__), "public", "config.json")) as f:
    config = json.load(f)

bancos = config["plazos_fijos"]["bancos"]
bancos.sort(key=lambda b: max(b.get("tna_clientes") or 0, b.get("tna_no_clientes") or 0), reverse=True)
fecha = config["plazos_fijos"]["actualizado"]
total_banks = len(bancos)

# Pre-download all logos
print("Downloading logos...")
logo_cache = {}
LOGO_SIZE = 48
for banco in bancos:
    name = banco["nombre"]
    url = BANK_LOGOS.get(name)
    if url:
        logo = download_logo(name, url, LOGO_SIZE)
        if logo:
            logo_cache[name] = make_circle_logo(logo, LOGO_SIZE)
        else:
            bg = LOGO_BG.get(name, "#333333")
            logo_cache[name] = make_fallback_logo(name, bg, LOGO_SIZE)
    else:
        bg = LOGO_BG.get(name, "#333333")
        logo_cache[name] = make_fallback_logo(name, bg, LOGO_SIZE)

COVER_LOGO_SIZE = 64
cover_logos = {}
for banco in bancos[:3]:
    name = banco["nombre"]
    url = BANK_LOGOS.get(name)
    if url:
        logo = download_logo(name, url, COVER_LOGO_SIZE)
        if logo:
            cover_logos[name] = make_circle_logo(logo, COVER_LOGO_SIZE)
        else:
            bg = LOGO_BG.get(name, "#333333")
            cover_logos[name] = make_fallback_logo(name, bg, COVER_LOGO_SIZE)
    else:
        bg = LOGO_BG.get(name, "#333333")
        cover_logos[name] = make_fallback_logo(name, bg, COVER_LOGO_SIZE)

print("Generating slides...")

# Layout: 12 banks per slide to not overflow
BANKS_PER_SLIDE = 12
total_data_slides = (len(bancos) + BANKS_PER_SLIDE - 1) // BANKS_PER_SLIDE
total_slides = 1 + total_data_slides

# ─── COVER SLIDE ───
img = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(img)

# Subtle gradient accent line at top
for x in range(W):
    t = x / W
    c = gradient_color(int(t * total_banks), total_banks)
    draw.line([(x, 0), (x, 4)], fill=c)

# Title area
y = 200
draw.text((W // 2, y), "RANKING", anchor="mm", font=get_font(28), fill=TEXT_SEC)
y += 55
draw.text((W // 2, y), "Plazo Fijo", anchor="mm", font=get_font(68, bold=True), fill=TEXT)
y += 70
draw.text((W // 2, y), "TNA para $100.000 a 30 dias", anchor="mm", font=get_font(26), fill=TEXT_SEC)
y += 45

# Date pill
pill_text = f"Actualizado {fecha}"
pill_font = get_font(22, bold=True)
bbox = pill_font.getbbox(pill_text)
pw = bbox[2] - bbox[0] + 40
ph = bbox[3] - bbox[1] + 20
px = (W - pw) // 2
draw_rounded_rect(draw, [px, y, px + pw, y + ph], 20, (30, 50, 80))
draw.text((W // 2, y + ph // 2), pill_text, anchor="mm", font=pill_font, fill=ACCENT)

# Top 3 podium
y += ph + 80
podium_labels = ["1ro", "2do", "3ro"]
podium_colors = [(255, 215, 0), (192, 192, 192), (205, 127, 50)]

for i, banco in enumerate(bancos[:3]):
    rate = max(banco.get("tna_clientes") or 0, banco.get("tna_no_clientes") or 0)
    name = banco["nombre"]
    row_y = y + i * 110

    # Card
    card_h = 90
    draw_rounded_rect(draw, [MARGIN + 10, row_y, W - MARGIN - 10, row_y + card_h], 16, CARD_BG)

    # Medal/rank circle
    cx, cy = MARGIN + 45, row_y + card_h // 2
    draw.ellipse([cx - 16, cy - 16, cx + 16, cy + 16], fill=podium_colors[i])
    draw.text((cx, cy), str(i + 1), anchor="mm", font=get_font(22, bold=True), fill=(30, 30, 30))

    # Logo
    logo = cover_logos.get(name)
    if logo:
        lx, ly = MARGIN + 80, row_y + (card_h - COVER_LOGO_SIZE) // 2
        img.paste(logo, (lx, ly), logo)

    # Name
    draw.text((MARGIN + 160, cy - 5), name, anchor="lm", font=get_font(30, bold=True), fill=TEXT)

    # Rate
    rate_color = gradient_color(i, total_banks)
    draw.text((W - MARGIN - 35, cy - 10), f"{rate}%", anchor="rm", font=get_font(42, bold=True), fill=rate_color)
    draw.text((W - MARGIN - 35, cy + 20), "TNA", anchor="rm", font=get_font(18), fill=TEXT_SEC)

# Swipe hint
y_hint = H - 180
draw.text((W // 2, y_hint), "Desliza para ver el ranking completo  →", anchor="mm", font=get_font(22), fill=TEXT_SEC)

# Footer
y_footer = H - 100
draw.line([(MARGIN, y_footer - 15), (W - MARGIN, y_footer - 15)], fill=BORDER, width=1)
draw.text((MARGIN, y_footer), "Fuente: BCRA", font=get_font(20), fill=TEXT_SEC)
draw.text((W - MARGIN, y_footer), "rendimientos.co", anchor="ra", font=get_font(24, bold=True), fill=ACCENT)

draw_slide_dots(draw, 1, total_slides)
img.save(os.path.join(OUTPUT_DIR, "slide_1_cover.png"), quality=95)
print("Slide 1 (cover)")

# ─── DATA SLIDES ───
for s in range(total_data_slides):
    start = s * BANKS_PER_SLIDE
    end = min(start + BANKS_PER_SLIDE, len(bancos))
    banks_slice = bancos[start:end]
    slide_num = s + 2

    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Gradient line top
    for x in range(W):
        t = x / W
        c = gradient_color(int(t * total_banks), total_banks)
        draw.line([(x, 0), (x, 4)], fill=c)

    # Header
    y = MARGIN
    draw.text((MARGIN, y), "Ranking Plazo Fijo", font=get_font(36, bold=True), fill=TEXT)
    draw.text((W - MARGIN, y + 8), fecha, anchor="ra", font=get_font(20), fill=TEXT_SEC)
    y += 55
    draw.line([(MARGIN, y), (W - MARGIN, y)], fill=BORDER, width=1)
    y += 25

    # Bank rows
    row_h = 90
    for i, banco in enumerate(banks_slice):
        rank = start + i
        rate = max(banco.get("tna_clientes") or 0, banco.get("tna_no_clientes") or 0)
        name = banco["nombre"]
        color = gradient_color(rank, total_banks)
        row_y = y

        # Card bg
        draw_rounded_rect(draw, [MARGIN, row_y, W - MARGIN, row_y + row_h - 8], 14, CARD_BG)

        # Rank circle
        cx, cy = MARGIN + 30, row_y + (row_h - 8) // 2
        draw.ellipse([cx - 17, cy - 17, cx + 17, cy + 17], fill=color)
        rank_text = str(rank + 1)
        draw.text((cx, cy), rank_text, anchor="mm", font=get_font(20 if len(rank_text) < 3 else 16, bold=True), fill=BG)

        # Logo
        logo = logo_cache.get(name)
        if logo:
            lx = MARGIN + 60
            ly = row_y + (row_h - 8 - LOGO_SIZE) // 2
            img.paste(logo, (lx, ly), logo)

        # Name
        name_x = MARGIN + 120
        draw.text((name_x, cy), name, anchor="lm", font=get_font(26, bold=True), fill=TEXT)

        # Rate
        rate_str = f"{rate}%" if rate == int(rate) else f"{rate}%"
        draw.text((W - MARGIN - 25, cy - 8), rate_str, anchor="rm", font=get_font(36, bold=True), fill=color)
        draw.text((W - MARGIN - 25, cy + 18), "TNA", anchor="rm", font=get_font(16), fill=TEXT_SEC)

        y += row_h

    # Footer
    y_footer = H - 80
    draw.line([(MARGIN, y_footer - 15), (W - MARGIN, y_footer - 15)], fill=BORDER, width=1)
    draw.text((MARGIN, y_footer), "Fuente: BCRA", font=get_font(20), fill=TEXT_SEC)
    draw.text((W - MARGIN, y_footer), "rendimientos.co", anchor="ra", font=get_font(24, bold=True), fill=ACCENT)

    draw_slide_dots(draw, slide_num, total_slides)
    img.save(os.path.join(OUTPUT_DIR, f"slide_{slide_num}_ranking.png"), quality=95)
    print(f"Slide {slide_num} (#{start+1}-{end})")

print(f"\nDone! {total_slides} slides in {OUTPUT_DIR}/")

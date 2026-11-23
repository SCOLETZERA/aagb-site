#!/usr/bin/env python3
"""
"Nesse mundo, todos têm um superpoder" — vídeo vertical (1080x1920) no estilo
dos vídeos virais de jogos de blocos, com lição de vida.

Tudo é gerado por código: personagens em blocos, cenários, legendas,
narração (Piper TTS, voz pt-BR offline), trilha e efeitos sonoros sintetizados.

Uso:
    python3 make_video.py --voice /caminho/pt-br-edresson-low.onnx --out out/
"""
import argparse, math, os, random, subprocess, sys, wave, json, shutil
from functools import lru_cache
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1080, 1920
FPS = 30
SR = 44100
GROUND = 1330
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# ----------------------------------------------------------------------------
# ROTEIRO
# ----------------------------------------------------------------------------
SCENES = [
    dict(id="hook", mood="mystery", pad=0.6,
         text="Nesse mundo, todos têm um superpoder."),
    dict(id="crystal", mood="mystery", pad=0.4,
         text="Quando você faz dez anos, toca no Cristal do Destino, e ele revela o seu poder."),
    dict(id="myturn", mood="mystery", pad=0.9,
         text="Mas quando chegou a minha vez... o cristal não brilhou."),
    dict(id="laugh", mood="sad", pad=0.9,
         text="Todo mundo riu. Me chamaram de: o sem poder."),
    dict(id="alone", mood="sad", pad=0.6,
         text="Durante anos, eu fiquei sozinho."),
    dict(id="decide", mood="hope", pad=0.5,
         text="Até que eu decidi: se eu não nasci com um poder... eu ia construir um."),
    dict(id="montage", mood="hope", pad=0.4,
         text="Estudei primeiros socorros. Aprendi a consertar máquinas. E ajudei quem precisava, todos os dias."),
    dict(id="showoff", mood="hope", pad=0.3,
         text="Enquanto os outros usavam seus poderes só pra se exibir."),
    dict(id="storm", mood="storm", pad=0.8,
         text="Um dia, uma tempestade estranha apagou todos os poderes da cidade."),
    dict(id="panic", mood="storm", pad=0.3,
         text="A ponte desabou. Tinha gente machucada. E ninguém sabia o que fazer sem poderes."),
    dict(id="me", mood="storm", pad=0.9,
         text="Ninguém... menos eu."),
    dict(id="fix", mood="triumph", pad=0.5,
         text="Fiz os curativos, consertei o gerador, e trouxe a luz de volta."),
    dict(id="clap", mood="triumph", pad=0.6,
         text="As mesmas pessoas que riram de mim, agora me aplaudiam."),
    dict(id="understand", mood="emotional", pad=0.7,
         text="E foi aí que eu entendi. Meu superpoder nunca foi algo que eu ganhei. Foi algo que eu construí."),
    dict(id="lesson", mood="emotional", pad=1.6,
         text="Talento é o que você recebe. Caráter é o que você constrói. Não espere ganhar um poder. Torne-se um."),
    dict(id="cta", mood="outro", pad=1.4,
         text="E você? Qual seria o seu superpoder? Comenta aí!"),
]

# Palavras que ganham destaque amarelo nas legendas
HIGHLIGHT = {"superpoder", "superpoder.", "superpoder?", "poder", "poder.", "poderes", "poderes.",
             "sem", "brilhou.", "construir", "um.", "sozinho.", "eu.", "construí.", "caráter",
             "talento", "luz", "aplaudiam.", "ninguém...", "riu.", "constrói.", "torne-se"}

# ----------------------------------------------------------------------------
# UTILIDADES
# ----------------------------------------------------------------------------
def ease_out(x):
    x = max(0.0, min(1.0, x)); return 1 - (1 - x) ** 3

def ease_io(x):
    x = max(0.0, min(1.0, x)); return x * x * (3 - 2 * x)

def lerp(a, b, t): return a + (b - a) * t

def lerpc(c1, c2, t): return tuple(int(lerp(a, b, t)) for a, b in zip(c1, c2))

def shade(c, f): return tuple(max(0, min(255, int(v * f))) for v in c)

@lru_cache(maxsize=64)
def font(size): return ImageFont.truetype(FONT_BOLD, int(size))

def hull(pts):
    pts = sorted(set(pts))
    if len(pts) <= 2: return pts
    def cross(o, a, b): return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]

OUTLINE = (25, 22, 35)

def block(d, poly, color, depth):
    """Desenha um polígono 'extrudado' (bloco 3D falso)."""
    back = [(x + depth, y - depth) for x, y in poly]
    h = hull([(round(x, 1), round(y, 1)) for x, y in poly + back])
    d.polygon(h, fill=shade(color, 0.62), outline=OUTLINE, width=4)
    d.polygon(poly, fill=color, outline=OUTLINE, width=4)

def rect_poly(x0, y0, x1, y1): return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]

def limb_poly(px, py, w, h, ang):
    a = math.radians(ang); c, s = math.cos(a), math.sin(a)
    pts = [(-w/2, 0), (w/2, 0), (w/2, h), (-w/2, h)]
    return [(px + x*c - y*s, py + x*s + y*c) for x, y in pts]

@lru_cache(maxsize=64)
def glow_sprite(radius, color, strength=1.0):
    r = int(radius)
    yy, xx = np.mgrid[-r:r+1, -r:r+1]
    dist = np.sqrt(xx**2 + yy**2) / r
    a = np.clip(1 - dist, 0, 1) ** 2 * 255 * strength
    img = np.zeros((2*r+1, 2*r+1, 4), np.uint8)
    img[..., 0], img[..., 1], img[..., 2] = color
    img[..., 3] = np.clip(a, 0, 255).astype(np.uint8)
    return Image.fromarray(img, "RGBA")

def glow(img, x, y, radius, color, strength=1.0):
    radius = max(4, int(radius / 4) * 4)
    g = glow_sprite(radius, tuple(color), round(strength, 2))
    img.paste(g, (int(x - radius), int(y - radius)), g)

# ----------------------------------------------------------------------------
# PERSONAGEM EM BLOCOS
# ----------------------------------------------------------------------------
HERO  = dict(skin=(246, 206, 152), shirt=(236, 122, 38), pants=(58, 60, 78), hair=(72, 46, 30), hair_style="short")
KAI   = dict(skin=(232, 180, 140), shirt=(205, 38, 42), pants=(38, 38, 44), hair=(255, 120, 30), hair_style="spiky")
SKY   = dict(skin=(200, 150, 110), shirt=(40, 92, 222), pants=(30, 40, 92), hair=(30, 30, 30), hair_style="short", cape=(220, 40, 60))
ZIP   = dict(skin=(250, 215, 175), shirt=(250, 208, 40), pants=(92, 92, 100), hair=(250, 235, 140), hair_style="short")
NEVE  = dict(skin=(250, 220, 200), shirt=(120, 215, 240), pants=(230, 240, 252), hair=(240, 248, 255), hair_style="long")
ELDER = dict(skin=(235, 195, 160), shirt=(140, 110, 170), pants=(80, 70, 90), hair=(220, 220, 225), hair_style="short")

def crowd_palette(i):
    r = random.Random(i * 97 + 13)
    skins = [(246, 206, 152), (200, 150, 110), (150, 100, 70), (250, 220, 200), (110, 72, 50)]
    shirts = [(60, 170, 90), (170, 70, 200), (230, 90, 150), (40, 160, 200), (120, 120, 130), (200, 160, 60), (90, 110, 230)]
    hairs = [(40, 30, 25), (90, 60, 30), (20, 20, 20), (200, 160, 80), (130, 50, 30)]
    return dict(skin=r.choice(skins), shirt=r.choice(shirts), pants=r.choice([(50, 50, 60), (40, 60, 110), (90, 70, 50)]),
                hair=r.choice(hairs), hair_style=r.choice(["short", "short", "long", "spiky"]))

def draw_face(d, cx, cy, u, face, look=0):
    e = u * 0.13
    ex = u * 0.27
    ey = cy - u * 0.08
    lx = look * u * 0.06
    if face == "closed":
        for sx in (-1, 1):
            d.arc([cx + sx*ex - e + lx, ey - e, cx + sx*ex + e + lx, ey + e], 200, 340, fill=OUTLINE, width=5)
    else:
        eh = e * (1.5 if face in ("shock",) else 1.25)
        for sx in (-1, 1):
            d.ellipse([cx + sx*ex - e*0.75 + lx, ey - eh, cx + sx*ex + e*0.75 + lx, ey + eh], fill=OUTLINE)
            d.ellipse([cx + sx*ex - e*0.3 + lx, ey - eh*0.7, cx + sx*ex + e*0.05 + lx, ey - eh*0.25], fill=(255, 255, 255))
    my = cy + u * 0.25
    mw = u * 0.28
    if face in ("smile", "closed"):
        d.arc([cx - mw, my - mw*0.9, cx + mw, my + mw*0.6], 20, 160, fill=OUTLINE, width=6)
    elif face == "laugh":
        d.chord([cx - mw*1.1, my - mw*0.6, cx + mw*1.1, my + mw*0.9], 0, 180, fill=(120, 20, 30), outline=OUTLINE, width=4)
    elif face == "sad":
        d.arc([cx - mw*0.8, my - mw*0.1, cx + mw*0.8, my + mw*0.9], 200, 340, fill=OUTLINE, width=6)
        d.line([(cx - ex - e, ey - e*2.2), (cx - ex + e, ey - e*1.6)], fill=OUTLINE, width=5)
        d.line([(cx + ex + e, ey - e*2.2), (cx + ex - e, ey - e*1.6)], fill=OUTLINE, width=5)
    elif face == "cry":
        d.arc([cx - mw*0.8, my - mw*0.1, cx + mw*0.8, my + mw*0.9], 200, 340, fill=OUTLINE, width=6)
        d.ellipse([cx + ex - e*0.4, ey + e*1.4, cx + ex + e*0.4, ey + e*2.6], fill=(90, 170, 255))
    elif face == "shock":
        d.ellipse([cx - mw*0.45, my - mw*0.35, cx + mw*0.45, my + mw*0.75], fill=(120, 20, 30), outline=OUTLINE, width=4)
    elif face == "determined":
        d.line([(cx - mw*0.9, my + mw*0.2), (cx + mw*0.9, my + mw*0.05)], fill=OUTLINE, width=6)
        d.line([(cx - ex - e*1.3, ey - e*2.1), (cx - ex + e*1.2, ey - e*1.4)], fill=OUTLINE, width=6)
        d.line([(cx + ex + e*1.3, ey - e*2.1), (cx + ex - e*1.2, ey - e*1.4)], fill=OUTLINE, width=6)
    elif face == "smirk":
        d.arc([cx - mw*0.6, my - mw*0.9, cx + mw*1.2, my + mw*0.4], 20, 120, fill=OUTLINE, width=6)
    elif face == "worried":
        d.line([(cx - mw*0.7, my + mw*0.3), (cx - mw*0.2, my + mw*0.1), (cx + mw*0.2, my + mw*0.3), (cx + mw*0.7, my + mw*0.1)], fill=OUTLINE, width=5)
        d.line([(cx - ex - e, ey - e*1.6), (cx - ex + e, ey - e*2.2)], fill=OUTLINE, width=5)
        d.line([(cx + ex + e, ey - e*1.6), (cx + ex - e, ey - e*2.2)], fill=OUTLINE, width=5)

def avatar(img, x, feet, u, pal, face="smile", walk=None, arm_l=0, arm_r=0, bob=0.0,
           leg_l=None, leg_r=None, look=0, cape_t=None, aura=None, sit=False):
    d = ImageDraw.Draw(img)
    dep = u * 0.28
    feet = feet - bob
    if aura:
        glow(img, x, feet - u*2.6, u*4.2, aura, 0.85)
    # pernas
    sw = math.sin(walk) * 28 if walk is not None else 0
    ll = leg_l if leg_l is not None else sw
    lr = leg_r if leg_r is not None else -sw
    hip = feet - 2*u
    lw = u * 0.96
    if sit:
        ll = lr = -80
    # capa atrás
    if cape_t is not None and "cape" in pal:
        fl = math.sin(cape_t * 9) * u * 0.35
        top = hip - 2*u + u*0.15
        d.polygon([(x - u, top), (x + u, top), (x + u*1.35 + fl, hip + u*1.6), (x - u*1.35 - fl*0.5, hip + u*1.7)],
                  fill=pal["cape"], outline=OUTLINE)
    block(d, limb_poly(x + lw/2 + 2, hip, lw, 2*u, lr), shade(pal["pants"], 0.9), dep)
    block(d, limb_poly(x - lw/2 - 2, hip, lw, 2*u, ll), pal["pants"], dep)
    # tronco
    top = hip - 2*u
    block(d, rect_poly(x - u, top, x + u, hip), pal["shirt"], dep)
    d.line([(x - u*0.55, top + u*0.08), (x, top + u*0.45), (x + u*0.55, top + u*0.08)], fill=shade(pal["shirt"], 0.7), width=5)
    # braços
    aw = u * 0.95
    sl = arm_l if walk is None else arm_l - sw
    sr = arm_r if walk is None else arm_r + sw
    block(d, limb_poly(x + u + aw/2, top + u*0.25, aw, 1.95*u, -sr), pal["skin"], dep)
    block(d, limb_poly(x - u - aw/2, top + u*0.25, aw, 1.95*u, sl), pal["skin"], dep)
    # manga
    for sx, ang in ((1, -sr), (-1, sl)):
        d.polygon(limb_poly(x + sx*(u + aw/2), top + u*0.25, aw, 0.75*u, ang), fill=pal["shirt"], outline=OUTLINE, width=4)
    # cabeça
    hw, hh = u * 0.72, u * 1.25
    hy1 = top - u*0.06
    hy0 = hy1 - hh
    hp = rect_poly(x - hw, hy0, x + hw, hy1)
    back = [(px + dep, py - dep) for px, py in hp]
    d.polygon(hull(hp + back), fill=shade(pal["skin"], 0.62), outline=OUTLINE, width=4)
    d.rounded_rectangle([x - hw, hy0, x + hw, hy1], radius=u*0.22, fill=pal["skin"], outline=OUTLINE, width=4)
    # cabelo
    hc = pal["hair"]
    st = pal.get("hair_style", "short")
    if st == "short":
        d.polygon([(x - hw - 4, hy0 + hh*0.32), (x - hw - 4, hy0 - 6), (x + hw + dep + 4, hy0 - dep - 6),
                   (x + hw + dep + 4, hy0 - dep + hh*0.3), (x + hw + 4, hy0 + hh*0.22), (x - hw*0.2, hy0 + hh*0.2)],
                  fill=hc, outline=OUTLINE, width=4)
    elif st == "spiky":
        pts = [(x - hw - 6, hy0 + hh*0.3)]
        n = 5
        for i in range(n + 1):
            px = x - hw - 6 + (2*hw + 12 + dep) * i / n
            pts.append((px, hy0 - (u*0.45 if i % 2 else 0) - dep * i / n))
        pts += [(x + hw + dep + 6, hy0 - dep + hh*0.3), (x + hw + 4, hy0 + hh*0.25)]
        d.polygon(pts, fill=hc, outline=OUTLINE, width=4)
    elif st == "long":
        d.polygon([(x - hw - 10, hy1 + u*0.5), (x - hw - 10, hy0 - 8), (x + hw + dep + 10, hy0 - dep - 8),
                   (x + hw + dep + 10, hy1 + u*0.4), (x + hw + 2, hy1 + u*0.5), (x + hw + 2, hy0 + hh*0.25),
                   (x - hw - 2, hy0 + hh*0.25), (x - hw - 2, hy1 + u*0.5)], fill=hc, outline=OUTLINE, width=4)
    draw_face(d, x, (hy0 + hy1) / 2 + u*0.08, u, face, look)
    return (x, hy0, hy1)

def avatar_sprite(u, pal, **kw):
    """Renderiza um personagem numa imagem RGBA à parte (para girar)."""
    size = int(u * 9)
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    avatar(im, size/2, size*0.85, u, pal, **kw)
    return im

# ----------------------------------------------------------------------------
# CENÁRIOS
# ----------------------------------------------------------------------------
def gradient(c_top, c_bot, h=H):
    t = np.linspace(0, 1, h)[:, None]
    a = np.array(c_top)[None, :] * (1 - t) + np.array(c_bot)[None, :] * t
    return np.repeat(a[:, None, :], W, axis=1).astype(np.uint8)

def buildings(d, rnd, tint, lit, base_y, layer):
    x = -40
    while x < W + 40:
        bw = rnd.randint(130, 220)
        bh = rnd.randint(260, 620) if layer == 0 else rnd.randint(180, 420)
        base = rnd.choice([(150, 160, 185), (175, 150, 140), (140, 170, 160), (185, 175, 150), (160, 150, 180)])
        col = lerpc(base, tint, 0.45 if layer == 0 else 0.25)
        if layer == 0: col = shade(col, 0.8)
        dep = 22
        block(d, rect_poly(x, base_y - bh, x + bw, base_y), col, dep)
        for wy in range(int(base_y - bh + 30), int(base_y - 40), 62):
            for wx in range(int(x + 22), int(x + bw - 40), 52):
                on = lit and rnd.random() < 0.75
                wc = (255, 222, 120) if on else shade(col, 0.55)
                d.rectangle([wx, wy, wx + 28, wy + 36], fill=wc, outline=shade(col, 0.4), width=2)
        x += bw + rnd.randint(4, 30)

def ground(d, color, y=GROUND):
    d.rectangle([0, y, W, H], fill=color)
    d.rectangle([0, y, W, y + 16], fill=shade(color, 1.15))
    hi = shade(color, 1.12); lo = shade(color, 0.85)
    for gy in range(y + 50, H, 70):
        off = 35 if (gy // 70) % 2 else 0
        for gx in range(-35 + off, W + 35, 70):
            d.ellipse([gx - 17, gy - 10, gx + 17, gy + 10], fill=lo)
            d.ellipse([gx - 17, gy - 15, gx + 17, gy + 5], fill=hi)

@lru_cache(maxsize=16)
def background(kind):
    rnd = random.Random(7)
    if kind == "day":
        arr = gradient((92, 170, 255), (190, 228, 255)); tint = (170, 200, 255); lit = False; gcol = (88, 178, 76); sun = (255, 236, 120)
    elif kind == "dusk":
        arr = gradient((70, 70, 110), (150, 140, 170)); tint = (90, 90, 130); lit = True; gcol = (64, 104, 70); sun = None
    elif kind == "sunrise":
        arr = gradient((255, 140, 90), (255, 220, 150)); tint = (255, 170, 120); lit = False; gcol = (98, 168, 80); sun = (255, 245, 190)
    elif kind == "storm":
        arr = gradient((28, 26, 44), (70, 64, 92)); tint = (40, 40, 60); lit = False; gcol = (42, 70, 50); sun = None
    elif kind == "night_lit":
        arr = gradient((20, 24, 60), (60, 60, 120)); tint = (60, 60, 110); lit = True; gcol = (50, 90, 60); sun = None
    elif kind == "sunset":
        arr = gradient((120, 70, 160), (255, 170, 90)); tint = (220, 130, 120); lit = True; gcol = (80, 130, 70); sun = (255, 210, 120)
    else:
        raise ValueError(kind)
    img = Image.fromarray(arr)
    d = ImageDraw.Draw(img)
    if sun:
        sy = 420 if kind != "sunrise" else 900
        if kind == "sunset": sy = 1050
        glow(img, 820, sy, 300, sun, 0.9)
        d.ellipse([820 - 95, sy - 95, 820 + 95, sy + 95], fill=sun)
    if kind in ("day", "sunrise"):
        for cx, cy in ((180, 300), (560, 200), (900, 620)):
            for k in range(3):
                d.rectangle([cx + k*60 - 60, cy - (30 if k == 1 else 0), cx + k*60 + 40, cy + 50], fill=(255, 255, 255))
    if kind == "storm":
        for cx, cy in ((150, 260), (520, 180), (880, 300), (330, 420), (760, 480)):
            for k in range(4):
                d.ellipse([cx + k*70 - 140, cy - 50 - (k % 2)*30, cx + k*70, cy + 60], fill=(55, 50, 72))
    buildings(d, rnd, tint, lit, GROUND - 120, 0)
    buildings(d, rnd, tint, lit, GROUND, 1)
    ground(d, gcol)
    return img

# ----------------------------------------------------------------------------
# ELEMENTOS
# ----------------------------------------------------------------------------
def crystal(img, x, y, t, state):
    """state: 'idle' | 'gray' | ('glow', cor)"""
    d = ImageDraw.Draw(img)
    block(d, rect_poly(x - 110, y, x + 110, y + 60), (130, 130, 145), 20)
    block(d, rect_poly(x - 70, y - 40, x + 70, y), (150, 150, 165), 16)
    fy = y - 210 + math.sin(t * 2.5) * 12
    if isinstance(state, tuple):
        col = state[1]
        glow(img, x, fy, 330 + 40 * math.sin(t * 9), col, 1.0)
        d = ImageDraw.Draw(img)
        for k in range(12):
            a = k / 12 * math.tau + t * 1.8
            r1, r2 = 130, 230 + 30 * math.sin(t * 7 + k)
            d.line([(x + math.cos(a)*r1, fy + math.sin(a)*r1), (x + math.cos(a)*r2, fy + math.sin(a)*r2)], fill=col, width=8)
        c = lerpc(col, (255, 255, 255), 0.4)
    elif state == "gray":
        c = (120, 120, 128)
    else:
        glow(img, x, fy, 170, (150, 120, 255), 0.6)
        d = ImageDraw.Draw(img)
        c = (170, 150, 255)
    pts = [(x, fy - 140), (x + 75, fy - 30), (x + 45, fy + 120), (x - 45, fy + 120), (x - 75, fy - 30)]
    d.polygon(pts, fill=c, outline=OUTLINE, width=5)
    d.polygon([(x, fy - 140), (x + 75, fy - 30), (x, fy - 10)], fill=lerpc(c, (255, 255, 255), 0.35))
    d.polygon([(x, fy - 10), (x + 45, fy + 120), (x - 45, fy + 120)], fill=shade(c, 0.8))
    d.line([(x - 75, fy - 30), (x, fy - 10), (x + 75, fy - 30)], fill=OUTLINE, width=3)
    return fy

def fire_particles(img, x, y, t, n=14, spread=40, seed=1, scale=1.0):
    d = ImageDraw.Draw(img)
    glow(img, x, y, 110 * scale, (255, 120, 20), 0.8)
    d = ImageDraw.Draw(img)
    for i in range(n):
        r = random.Random(seed * 1000 + i)
        ph = (t * (1.4 + r.random()) + r.random()) % 1.0
        px = x + (r.random() - 0.5) * spread * scale + math.sin(t * 6 + i) * 8
        py = y - ph * 160 * scale
        s = (1 - ph) * 30 * scale + 4
        col = lerpc((255, 240, 120), (230, 50, 20), ph)
        d.rectangle([px - s/2, py - s/2, px + s/2, py + s/2], fill=col)

def sparkles(img, x, y, t, col=(180, 240, 255), n=10, rad=120, seed=3):
    d = ImageDraw.Draw(img)
    for i in range(n):
        r = random.Random(seed * 100 + i)
        a = r.random() * math.tau + t * (0.5 + r.random())
        rr = rad * (0.4 + 0.6 * r.random())
        px, py = x + math.cos(a) * rr, y + math.sin(a) * rr * 0.8
        s = 10 + 12 * abs(math.sin(t * 5 + i))
        d.polygon([(px, py - s), (px + s*0.3, py), (px, py + s), (px - s*0.3, py)], fill=col)
        d.polygon([(px - s, py), (px, py - s*0.3), (px + s, py), (px, py + s*0.3)], fill=col)

def speed_lines(img, x, y, t, dirx=1):
    d = ImageDraw.Draw(img)
    for i in range(7):
        r = random.Random(i * 31)
        ly = y - 260 + i * 42
        ln = 120 + r.random() * 160
        off = (t * 900 + r.random() * 300) % 200
        x0 = x - dirx * (80 + off)
        d.line([(x0, ly), (x0 - dirx * ln, ly)], fill=(255, 240, 160), width=7)

def rain(img, t, n=90, col=(170, 190, 230)):
    d = ImageDraw.Draw(img)
    for i in range(n):
        r = random.Random(i * 7 + 1)
        x = (r.random() * (W + 300) - t * 260) % (W + 300) - 150
        y = (r.random() * H + t * 1900 * (0.8 + r.random() * 0.4)) % H
        d.line([(x, y), (x - 14, y + 46)], fill=col, width=4)

def bubble(img, x, y, text, size=52, tail="down", col=(255, 255, 255), tcol=OUTLINE, scale=1.0):
    d = ImageDraw.Draw(img)
    f = font(size * scale)
    lines = text.split("\n")
    tw = max(d.textlength(l, font=f) for l in lines)
    th = len(lines) * size * scale * 1.15
    pad = 28 * scale
    x0, y0 = x - tw/2 - pad, y - th - pad*2
    x1, y1 = x + tw/2 + pad, y
    x0 = max(20, x0); x1 = min(W - 20, x1)
    if tail == "down":
        d.polygon([(x - 20, y1 - 4), (x + 22, y1 - 4), (x - 6, y1 + 40 * scale)], fill=col, outline=OUTLINE, width=5)
    d.rounded_rectangle([x0, y0, x1, y1], radius=30 * scale, fill=col, outline=OUTLINE, width=6)
    if tail == "down":
        d.polygon([(x - 17, y1 - 7), (x + 19, y1 - 7), (x - 5, y1 + 30 * scale)], fill=col)
    cy = y0 + pad
    for l in lines:
        lw = d.textlength(l, font=f)
        d.text(((x0 + x1)/2 - lw/2, cy), l, font=f, fill=tcol)
        cy += size * scale * 1.15

def pop_text(img, x, y, text, t, size=90, fill=(255, 255, 255), stroke=(20, 20, 30), rot=0):
    if t < 0: return
    s = size * (1 + 0.5 * (1 - ease_out(t / 0.18)))
    d = ImageDraw.Draw(img)
    f = font(s)
    tw = d.textlength(text, font=f)
    d.text((x - tw/2, y - s/2), text, font=f, fill=fill, stroke_width=max(4, int(s/10)), stroke_fill=stroke)

def generator(img, x, y, t, on):
    d = ImageDraw.Draw(img)
    block(d, rect_poly(x - 150, y - 230, x + 150, y), (110, 120, 130), 26)
    d.rectangle([x - 120, y - 200, x + 120, y - 120], fill=(60, 64, 70), outline=OUTLINE, width=4)
    # engrenagem
    gx, gy, gr = x - 60, y - 60, 42
    ang = t * (4 if on else 0.3)
    pts = []
    for k in range(16):
        a = ang + k / 16 * math.tau
        rr = gr if k % 2 else gr * 0.7
        pts.append((gx + math.cos(a) * rr, gy + math.sin(a) * rr))
    d.polygon(pts, fill=(200, 170, 60), outline=OUTLINE, width=3)
    d.ellipse([gx - 12, gy - 12, gx + 12, gy + 12], fill=OUTLINE)
    # raio
    lc = (255, 230, 60) if on else (90, 90, 90)
    if on: glow(img, x + 60, y - 160, 90, (255, 230, 80), 0.7); d = ImageDraw.Draw(img)
    d.polygon([(x + 70, y - 195), (x + 35, y - 150), (x + 62, y - 150), (x + 45, y - 110), (x + 90, y - 165), (x + 63, y - 165)], fill=lc, outline=OUTLINE)
    d.ellipse([x + 40, y - 70, x + 90, y - 20], fill=(60, 220, 90) if on else (200, 40, 40), outline=OUTLINE, width=3)

def confetti(img, t, n=80):
    d = ImageDraw.Draw(img)
    cols = [(255, 80, 80), (255, 210, 60), (80, 200, 255), (120, 230, 120), (220, 120, 255)]
    for i in range(n):
        r = random.Random(i * 13 + 5)
        x = r.random() * W + math.sin(t * 2 + i) * 40
        y = (r.random() * -H + t * (420 + r.random() * 300)) % (H + 100) - 50
        s = 12 + r.random() * 10
        a = t * 5 + i
        dx, dy = math.cos(a) * s, math.sin(a) * s * 0.5
        d.polygon([(x - dx, y - dy - 6), (x + dx, y + dy - 6), (x + dx, y + dy + 6), (x - dx, y - dy + 6)], fill=cols[i % 5])

def darken(img, amount, col=(0, 0, 0)):
    if amount <= 0: return img
    ov = Image.new("RGB", img.size, col)
    return Image.blend(img, ov, min(1, amount))

def vignette_mask():
    yy, xx = np.mgrid[0:H, 0:W]
    dist = np.sqrt(((xx - W/2) / (W/2))**2 + ((yy - H/2) / (H/2))**2) / 1.2
    return np.clip(dist, 0, 1) ** 2.2

VIG = None
def vignette(img, k=0.55):
    global VIG
    if VIG is None: VIG = vignette_mask()[..., None]
    a = np.asarray(img).astype(np.float32)
    a *= (1 - VIG * k)
    return Image.fromarray(a.astype(np.uint8))

# ----------------------------------------------------------------------------
# CENAS  (cada uma recebe t local e duração; devolve imagem + câmera)
# ----------------------------------------------------------------------------
def sc_hook(t, D):
    img = background("day").copy()
    # voador
    fy = 620 + math.sin(t * 2.2) * 40
    avatar(img, 260, fy + 300, 48, SKY, face="smile", arm_l=170, arm_r=150, cape_t=t, aura=(120, 170, 255))
    # fogo
    avatar(img, 780, GROUND + 10, 56, KAI, face="smirk", arm_l=-70, arm_r=-100)
    fire_particles(img, 780 + 56*2.6, GROUND - 56*3.4, t, seed=2)
    fire_particles(img, 780 - 56*2.4, GROUND - 56*3.2, t, seed=5)
    # gelo
    avatar(img, 430, GROUND + 40, 50, NEVE, face="smile", arm_r=-60, aura=(170, 235, 255))
    sparkles(img, 430, GROUND - 160, t)
    # velocista atravessando
    sx = (t / D) * (W + 600) - 300
    speed_lines(img, sx, GROUND + 60, t)
    avatar(img, sx, GROUND + 90, 46, ZIP, face="laugh", walk=t * 28, arm_l=-20, arm_r=-20)
    z = 1.0 + 0.04 * t
    return img, z, (W/2, H/2), 0

def sc_crystal(t, D):
    img = background("day").copy()
    fy = None
    glowing = t > D * 0.42
    st = ("glow", (255, 100, 30)) if glowing else "idle"
    fy = crystal(img, W/2, GROUND - 120, t, st)
    # multidão atrás/lados
    for i in range(6):
        cx = 110 + i * 175
        if abs(cx - W/2) < 170: continue
        cheer = glowing and (i % 2 == 0)
        jump = abs(math.sin(t * 8 + i)) * 30 if glowing else 0
        avatar(img, cx, GROUND + 250, 40, crowd_palette(i), face="laugh" if glowing else "smile",
               arm_l=160 if cheer else 10, arm_r=160 if glowing else -10, bob=jump)
    # criança (Kai) toca o cristal
    kx = lerp(W/2 - 380, W/2 - 200, ease_io(t / (D * 0.4)))
    walking = t < D * 0.4
    avatar(img, kx, GROUND + 120, 52, KAI, face="laugh" if glowing else "smile",
           walk=t * 12 if walking else None, arm_r=-110 if not walking else 0, arm_l=160 if glowing else 0)
    if glowing:
        fire_particles(img, kx - 52*2.2, GROUND - 52*3.5 + 120, t, seed=9)
        pop_text(img, W/2, 420, "PODER: FOGO!", t - D * 0.42, size=96, fill=(255, 150, 40))
    z = 1.0 + 0.05 * ease_io(t / D)
    return img, z, (W/2, H/2 + 80), 0

def sc_myturn(t, D):
    img = background("day").copy()
    touch = D * 0.45
    if t > touch:
        flick = (t - touch) < 0.5 and int(t * 20) % 2 == 0
        st = "idle" if flick else "gray"
    else:
        st = "idle"
    crystal(img, W/2, GROUND - 120, t, st)
    hx = lerp(W/2 - 420, W/2 - 200, ease_io(t / touch))
    walking = t < touch
    face = "smile" if t < touch else ("shock" if t < touch + 1.2 else "sad")
    avatar(img, hx, GROUND + 120, 52, HERO, face=face, walk=t * 12 if walking else None,
           arm_r=-110 if not walking else 0)
    if t > touch + 0.4:
        pop_text(img, hx + 40, GROUND - 52*5.8 + 120, "???", t - touch - 0.4, size=150, fill=(240, 240, 255))
    # câmera: zoom dramático no herói
    k = ease_io((t - touch) / 1.0) if t > touch else 0
    z = 1.0 + 0.7 * k
    cx = lerp(W/2, hx + 40, k); cy = lerp(H/2, GROUND - 52*4.5 + 120, k)
    shake = 8 if touch < t < touch + 0.3 else 0
    return img, z, (cx, cy), shake

def sc_laugh(t, D):
    img = background("day").copy()
    img = darken(img, 0.15)
    hx = W/2
    for i, (cx, pal) in enumerate([(150, KAI), (330, crowd_palette(1)), (760, crowd_palette(2)), (940, SKY)]):
        b = abs(math.sin(t * 10 + i)) * 26
        avatar(img, cx, GROUND + 160 + (i % 2) * 60, 46, pal, face="laugh", bob=b,
               arm_l=-40 + 20*math.sin(t*12+i), arm_r=150 if i % 2 else -150)
    avatar(img, hx, GROUND + 40, 58, HERO, face="cry" if t > D*0.5 else "sad")
    for i, (x, y, s) in enumerate([(220, 600, 0.2), (840, 520, 0.5), (300, 430, 0.9), (780, 760, 1.2), (560, 380, 1.6)]):
        pop_text(img, x, y + math.sin(t*8+i)*10, "HAHAHA", t - s, size=80, fill=(255, 230, 90))
    if t > D * 0.42:
        tt = t - D * 0.42
        d = ImageDraw.Draw(img)
        s = 1 + 0.4 * (1 - ease_out(tt / 0.2))
        f = font(70 * s)
        txt = "O SEM PODER"
        tw = d.textlength(txt, font=f)
        y = 880
        d.rounded_rectangle([hx - tw/2 - 30, y - 20, hx + tw/2 + 30, y + 70*s + 20], radius=18, fill=(200, 30, 40), outline=OUTLINE, width=6)
        d.text((hx - tw/2, y - 4), txt, font=f, fill=(255, 255, 255))
        d.line([(hx, y + 70*s + 20), (hx, GROUND - 58*5.3 + 40)], fill=OUTLINE, width=6)
    z = 1.05 + 0.04 * t
    return img, z, (W/2, H/2 + 60), (6 if t < 0.25 else 0)

def sc_alone(t, D):
    img = background("dusk").copy()
    d = ImageDraw.Draw(img)
    # banco
    bx, by = W/2, GROUND + 40
    block(d, rect_poly(bx - 210, by - 120, bx + 210, by - 90), (130, 85, 50), 18)
    block(d, rect_poly(bx - 190, by - 90, bx - 160, by), (100, 65, 40), 10)
    block(d, rect_poly(bx + 160, by - 90, bx + 190, by), (100, 65, 40), 10)
    avatar(img, bx, by + 10 - 50, 50, HERO, face="sad", sit=True, arm_l=10, arm_r=-10, bob=math.sin(t*1.5)*3)
    block(ImageDraw.Draw(img), rect_poly(bx - 210, by - 120, bx + 210, by - 98), (150, 100, 60), 0)
    # colegas indo embora ao fundo
    for i, pal in enumerate([KAI, SKY, NEVE]):
        x = 860 + i * 110 + t * 60
        avatar(img, x, GROUND - 10, 30, pal, face="laugh", walk=t * 10 + i)
    rain(img, t)
    img = vignette(img, 0.6)
    z = 1.12 - 0.04 * t / D
    return img, z, (W/2, H/2 + 120), 0

def sc_decide(t, D):
    k = ease_io(t / (D * 0.6))
    a = np.asarray(background("dusk")).astype(np.float32)
    b = np.asarray(background("sunrise")).astype(np.float32)
    img = Image.fromarray((a * (1 - k) + b * k).astype(np.uint8))
    stand = t > D * 0.3
    face = "sad" if t < D * 0.3 else "determined"
    if stand:
        glow(img, W/2, GROUND - 160, 260 * k + 10, (255, 220, 140), 0.6 * k)
    avatar(img, W/2, GROUND + 60, 60, HERO, face=face, arm_l=(150 if t > D*0.7 else 15), arm_r=-15,
           bob=0 if stand else -30)
    if t > D * 0.7:
        pop_text(img, W/2, 470, "EU VOU CONSTRUIR", t - D*0.7, size=82, fill=(255, 220, 90))
    z = 1.25 - 0.2 * ease_io(t / D)
    return img, z, (W/2, H/2 + 140), 0

def sc_montage(t, D):
    seg = D / 3
    i = min(2, int(t / seg)); tt = t - i * seg
    kinds = ["sunrise", "day", "day"]
    img = background(kinds[i]).copy()
    img = darken(img, 0.25)
    d = ImageDraw.Draw(img)
    hx = W/2 - 150
    if i == 0:
        # livros
        for k in range(5):
            block(d, rect_poly(W/2 + 80, GROUND - 40 - k*40, W/2 + 300 - k*8, GROUND - k*40), [(200, 60, 60), (60, 120, 200), (60, 170, 90), (220, 180, 60), (150, 80, 200)][k], 12)
        avatar(img, hx, GROUND + 60, 54, HERO, face="determined", arm_l=-60, arm_r=-80, look=1)
        d = ImageDraw.Draw(img)
        bx, by = hx + 130, GROUND - 230
        flip = (tt * 2) % 1
        d.polygon([(bx - 80, by), (bx, by + 20), (bx, by + 120), (bx - 80, by + 100)], fill=(250, 250, 240), outline=OUTLINE)
        d.polygon([(bx, by + 20), (bx + 80, by), (bx + 80, by + 100), (bx, by + 120)], fill=(250, 250, 240), outline=OUTLINE)
        px = bx + 80 - 160 * flip
        d.polygon([(bx, by + 20), (px, by - 10 * math.sin(flip*math.pi)), (px, by + 100 - 10 * math.sin(flip*math.pi)), (bx, by + 120)], fill=(235, 235, 225), outline=OUTLINE)
        # cruz de primeiros socorros
        cx, cy = W/2 + 190, 560
        d.rounded_rectangle([cx - 110, cy - 110, cx + 110, cy + 110], radius=24, fill=(255, 255, 255), outline=OUTLINE, width=6)
        d.rectangle([cx - 25, cy - 75, cx + 25, cy + 75], fill=(220, 40, 50))
        d.rectangle([cx - 75, cy - 25, cx + 75, cy + 25], fill=(220, 40, 50))
        label = "DIA 1"
    elif i == 1:
        generator(img, W/2 + 200, GROUND + 20, tt, tt > seg * 0.6)
        swing = math.sin(tt * 14) * 30
        avatar(img, hx, GROUND + 60, 54, HERO, face="determined", arm_r=-95 + swing, arm_l=10, look=1)
        d = ImageDraw.Draw(img)
        # chave inglesa
        a = math.radians(-95 + swing)
        sxp, syp = hx + 54 + 54*0.47, GROUND + 60 - 4*54 + 54*0.25
        ex = sxp - math.sin(-a) * 105; ey = syp + math.cos(-a) * 105
        d.line([(ex, ey), (ex + 70, ey - 40)], fill=(170, 175, 185), width=18)
        d.ellipse([ex + 55, ey - 60, ex + 95, ey - 20], fill=(170, 175, 185), outline=OUTLINE, width=3)
        if tt > seg * 0.6: sparkles(img, W/2 + 200, GROUND - 120, tt, col=(255, 240, 120))
        label = "DIA 365"
    else:
        # ajudando a idosa com caixas
        ex = W/2 + 220
        avatar(img, ex, GROUND + 60, 48, ELDER, face="smile")
        avatar(img, hx + tt * 30, GROUND + 60, 54, HERO, face="smile", arm_l=-120, arm_r=-120, walk=tt * 10)
        d = ImageDraw.Draw(img)
        bx = hx + tt * 30 + 150
        block(d, rect_poly(bx - 70, GROUND - 250, bx + 70, GROUND - 130), (190, 140, 80), 18)
        d.line([(bx - 70, GROUND - 210), (bx + 70, GROUND - 210)], fill=(150, 105, 60), width=6)
        if tt > seg * 0.5:
            bubble(img, ex, GROUND - 330, "Obrigada,\nmeu filho!", size=44)
        label = "DIA 1000"
    # contador de dias
    d = ImageDraw.Draw(img)
    pop_text(img, W/2, 430, label, tt, size=110, fill=(255, 255, 255))
    flash = max(0, 1 - tt / 0.15) * 0.6
    if flash > 0: img = Image.blend(img, Image.new("RGB", img.size, (255, 255, 255)), flash)
    return img, 1.03 + 0.03 * tt, (W/2, H/2 + 60), 0

def sc_showoff(t, D):
    img = background("day").copy()
    fy = 560 + math.sin(t * 3) * 50
    avatar(img, 300 + math.sin(t*2)*60, fy + 300, 46, SKY, face="smirk", arm_l=170, arm_r=-20, cape_t=t, aura=(120, 170, 255))
    avatar(img, 820, GROUND + 30, 54, KAI, face="laugh", arm_r=-100, arm_l=-60)
    fire_particles(img, 820 - 54*2.3, GROUND - 54*3.3, t, seed=4, scale=1.4)
    pop_text(img, 830, 820, "OLHA EU!", t - 0.3, size=72, fill=(255, 150, 40))
    # herói passa ajudando um garoto caído
    hx = lerp(-100, 480, ease_io(t / (D * 0.6)))
    kid = crowd_palette(7)
    if t < D * 0.6:
        sp = avatar_sprite(36, kid, face="cry")
        sp = sp.rotate(80, expand=True, resample=Image.BICUBIC)
        img.paste(sp, (500 - sp.width//2, int(GROUND + 210 - sp.height*0.62)), sp)
    else:
        avatar(img, 580, GROUND + 220, 36, kid, face="smile")
    avatar(img, hx, GROUND + 220, 46, HERO, face="smile", walk=t*12 if t < D*0.6 else None, arm_r=-80 if t >= D*0.6 else 0)
    return img, 1.02, (W/2, H/2), 0

def sc_storm(t, D):
    img = background("storm").copy()
    strike = [0.6, D * 0.5, D * 0.8]
    flash = 0
    for s in strike:
        if 0 < t - s < 0.25: flash = max(flash, 1 - (t - s) / 0.25)
    powered = t < D * 0.5
    fall = max(0, t - D * 0.5)
    fy = (560 + math.sin(t * 3) * 30) if powered else min(GROUND - 300, 560 + 900 * fall * fall)
    avatar(img, 280, fy + 300, 46, SKY, face="smirk" if powered else "shock", arm_l=170, arm_r=170 if not powered else -20,
           cape_t=t, aura=(120, 170, 255) if powered else None)
    avatar(img, 800, GROUND + 30, 54, KAI, face="smile" if powered else "shock", arm_r=-100, arm_l=-60)
    if powered:
        fire_particles(img, 800 - 54*2.3, GROUND - 54*3.3, t, seed=4, scale=1.2)
    else:
        d = ImageDraw.Draw(img)
        for k in range(4):  # fumacinha
            r = (t * 1.5 + k * 0.25) % 1
            d.ellipse([800 - 54*2.3 - 20 - r*30, GROUND - 54*3.3 - r*120 - 20, 800 - 54*2.3 + 20 + r*30, GROUND - 54*3.3 - r*120 + 20], fill=(110, 110, 120))
    if t > D * 0.5:
        pop_text(img, W/2, 420, "SEM PODERES!", t - D*0.5, size=92, fill=(255, 80, 80))
    rain(img, t, n=120, col=(140, 150, 190))
    d = ImageDraw.Draw(img)
    for s in strike:
        if 0 < t - s < 0.2:
            r = random.Random(int(s * 100))
            x = r.randint(200, 900); y = 0; pts = [(x, y)]
            while y < GROUND - 300:
                x += r.randint(-60, 60); y += r.randint(60, 120); pts.append((x, y))
            d.line(pts, fill=(255, 255, 255), width=10)
    if flash > 0: img = Image.blend(img, Image.new("RGB", img.size, (235, 235, 255)), flash * 0.7)
    img = vignette(img, 0.5)
    shake = 14 * flash
    return img, 1.04, (W/2, H/2), shake

def sc_panic(t, D):
    img = background("storm").copy()
    d = ImageDraw.Draw(img)
    # ponte quebrada
    by = GROUND - 40
    block(d, rect_poly(-20, by, 420, by + 60), (120, 90, 70), 20)
    block(d, rect_poly(660, by, W + 20, by + 60), (120, 90, 70), 20)
    for k, (x0, ang) in enumerate([(430, 25), (560, -35)]):
        yy = by + 40 + ((t * 0.8 + k * 0.3) % 1) * 260
        d.polygon(limb_poly(x0 + 30, yy, 90, 50, ang), fill=(110, 80, 60), outline=OUTLINE)
    # machucado no chão
    sp = avatar_sprite(40, crowd_palette(3), face="cry")
    sp = sp.rotate(85, expand=True, resample=Image.BICUBIC)
    img.paste(sp, (int(W/2 - sp.width/2 + 20), int(GROUND + 280 - sp.height*0.6)), sp)
    # pessoas em pânico
    for i, (x, pal) in enumerate([(160, SKY), (330, NEVE), (780, KAI), (950, ZIP)]):
        jit = math.sin(t * 30 + i) * 6
        avatar(img, x + jit, GROUND + 200 + (i % 2) * 50, 42, pal, face="shock",
               arm_l=150 + 20 * math.sin(t*14+i), arm_r=150 + 20 * math.cos(t*14+i))
    for i, (x, y, s) in enumerate([(160, 820, 0.2), (950, 760, 0.5), (780, 900, 0.9)]):
        pop_text(img, x, y, "!!!", t - s, size=90, fill=(255, 90, 90))
    if t > D * 0.65:
        bubble(img, 400, GROUND - 40, "O que a gente faz?!", size=40)
    rain(img, t, n=100, col=(140, 150, 190))
    img = vignette(img, 0.55)
    return img, 1.06 + 0.03 * t, (W/2, H/2 + 100), 3

def sc_me(t, D):
    img = background("storm").copy()
    img = darken(img, 0.5)
    k = ease_out(t / 0.6)
    glow(img, W/2, GROUND - 180, 420, (255, 230, 170), 0.9 * k)
    d = ImageDraw.Draw(img)
    avatar(img, W/2, GROUND + 60, 64, HERO, face="determined" if t > 0.8 else "worried", arm_l=10, arm_r=-10)
    for i, x in enumerate([120, 960]):
        avatar(img, x, GROUND + 260, 40, [KAI, NEVE][i], face="shock")
    z = 1.0 + 0.5 * ease_io(t / D)
    return img, z, (W/2, GROUND - 64*3.2 + 60), 0

def sc_fix(t, D):
    seg = D / 3
    i = min(2, int(t / seg)); tt = t - i * seg
    lit = i == 2 and tt > seg * 0.35
    img = background("night_lit" if lit else "storm").copy()
    if not lit: img = darken(img, 0.3)
    d = ImageDraw.Draw(img)
    if i == 0:
        sp = avatar_sprite(44, crowd_palette(3), face="smile" if tt > seg*0.6 else "worried")
        sp = sp.rotate(85, expand=True, resample=Image.BICUBIC)
        img.paste(sp, (int(W/2 + 40 - sp.width/2), int(GROUND + 180 - sp.height*0.6)), sp)
        avatar(img, W/2 - 230, GROUND + 140, 52, HERO, face="determined", arm_r=-70 + math.sin(tt*10)*15, arm_l=-60)
        d = ImageDraw.Draw(img)
        if tt > seg * 0.4:
            cx, cy = W/2 + 180, 600
            d.rounded_rectangle([cx - 70, cy - 70, cx + 70, cy + 70], radius=16, fill=(255, 255, 255), outline=OUTLINE, width=5)
            d.rectangle([cx - 16, cy - 46, cx + 16, cy + 46], fill=(220, 40, 50))
            d.rectangle([cx - 46, cy - 16, cx + 46, cy + 16], fill=(220, 40, 50))
            pop_text(img, W/2, 420, "CURATIVO FEITO", tt - seg*0.4, size=74, fill=(120, 255, 140))
    elif i == 1:
        on = tt > seg * 0.6
        generator(img, W/2 + 180, GROUND + 60, tt, on)
        swing = math.sin(tt * 16) * 30 if not on else 0
        avatar(img, W/2 - 200, GROUND + 100, 54, HERO, face="determined" if not on else "laugh",
               arm_r=-95 + swing, arm_l=(160 if on else 10))
        if on:
            sparkles(img, W/2 + 180, GROUND - 120, tt, col=(255, 240, 120))
            pop_text(img, W/2, 420, "GERADOR ON!", tt - seg*0.6, size=90, fill=(255, 230, 70))
    else:
        avatar(img, W/2, GROUND + 80, 58, HERO, face="smile" if lit else "determined", arm_l=160 if lit else 20, arm_r=160 if lit else -20)
        if lit:
            sparkles(img, W/2, GROUND - 200, tt, col=(255, 235, 150), n=14, rad=260)
            pop_text(img, W/2, 420, "A LUZ VOLTOU!", tt - seg*0.35, size=96, fill=(255, 235, 120))
    flash = max(0, 1 - tt / 0.15) * 0.5
    if lit and tt - seg * 0.35 < 0.3: flash = max(flash, 1 - (tt - seg*0.35) / 0.3)
    if flash > 0: img = Image.blend(img, Image.new("RGB", img.size, (255, 255, 240)), flash * 0.8)
    return img, 1.04, (W/2, H/2 + 60), 0

def sc_clap(t, D):
    img = background("night_lit").copy()
    confetti(img, t)
    glow(img, W/2, GROUND - 160, 300, (255, 220, 140), 0.6)
    avatar(img, W/2, GROUND + 30, 58, HERO, face="smile", arm_l=20, arm_r=-20)
    pals = [SKY, NEVE, ZIP, crowd_palette(1), crowd_palette(2), crowd_palette(4)]
    pos = [(140, 220), (330, 320), (760, 320), (950, 220), (240, 470), (860, 470)]
    for k, ((x, y), pal) in enumerate(zip(pos, pals)):
        c = math.sin(t * 16 + k) * 25
        avatar(img, x, GROUND + y, 40, pal, face="laugh", arm_l=-110 + c, arm_r=-110 + c)
    # Kai, o que mais riu, pede desculpa
    kx = 760
    avatar(img, kx + 120, GROUND + 140, 46, KAI, face="worried" if t < D*0.6 else "smile", arm_r=-30)
    if t > D * 0.45:
        bubble(img, kx + 80, GROUND - 230, "Foi mal...\nE obrigado!", size=44)
    if t > 0.2:
        pop_text(img, W/2, 450, "HERÓI!", t - 0.2, size=120, fill=(255, 220, 60))
    return img, 1.03 + 0.02 * t, (W/2, H/2 + 60), 0

def sc_understand(t, D):
    img = background("sunset").copy()
    k = ease_io(t / D)
    glow(img, W/2, GROUND - 170, 200 + 160 * k, (255, 225, 140), 0.4 + 0.5 * k)
    sparkles(img, W/2, GROUND - 180, t, col=(255, 235, 160), n=int(4 + 10 * k), rad=220)
    avatar(img, W/2, GROUND + 60, 62, HERO, face="closed" if t < D * 0.5 else "smile", arm_l=10, arm_r=-10)
    img = vignette(img, 0.45)
    z = 1.0 + 0.25 * k
    return img, z, (W/2, GROUND - 62*3 + 60), 0

LESSON_LINES = [("TALENTO", "é o que você recebe."), ("CARÁTER", "é o que você constrói."),
                ("Não espere", "ganhar um poder."), ("TORNE-SE UM.", "")]

def sc_lesson(t, D, cue=None):
    arr = gradient((18, 16, 40), (60, 30, 80))
    img = Image.fromarray(arr)
    glow(img, W/2, H/2, 600, (140, 90, 255), 0.35)
    sparkles(img, W/2, H/2, t, col=(200, 180, 255), n=16, rad=480)
    d = ImageDraw.Draw(img)
    f_h = font(58)
    title = "LIÇÃO DE VIDA"
    d.text((W/2 - d.textlength(title, font=f_h)/2, 360), title, font=f_h, fill=(255, 210, 90))
    d.line([(W/2 - 220, 440), (W/2 + 220, 440)], fill=(255, 210, 90), width=5)
    starts = cue or [0.2, D * 0.25, D * 0.5, D * 0.72]
    y = 520
    for i, (a, b) in enumerate(LESSON_LINES):
        tt = t - starts[i]
        if tt < 0: break
        al = ease_out(tt / 0.4)
        big = i == 3
        yy = y + (1 - al) * 40
        if big:
            glow(img, W/2, yy + 70, 420, (255, 200, 80), 0.55 * al); d = ImageDraw.Draw(img)
        fa = font(130 if big else (110 if i < 2 else 76))
        col_a = (255, 210, 90) if i != 2 else (255, 255, 255)
        tw = d.textlength(a, font=fa)
        d.text((W/2 - tw/2, yy), a, font=fa, fill=lerpc((18, 16, 40), col_a, al), stroke_width=5, stroke_fill=(10, 8, 20))
        if b:
            fb = font(70 if i < 2 else 76)
            tw = d.textlength(b, font=fb)
            d.text((W/2 - tw/2, yy + (125 if i < 2 else 92)), b, font=fb, fill=lerpc((18, 16, 40), (255, 255, 255), al), stroke_width=4, stroke_fill=(10, 8, 20))
        y += 300
    return img, 1.0, (W/2, H/2), 0

def sc_cta(t, D):
    img = background("day").copy()
    wave = math.sin(t * 10) * 35
    avatar(img, W/2 - 220, GROUND + 60, 60, HERO, face="smile", arm_r=150 + wave, arm_l=10)
    bubble(img, W/2 + 120, GROUND - 420, "Qual seria o\nSEU superpoder?", size=52)
    if t > D * 0.55:
        pop_text(img, W/2, 440, "COMENTA AÍ!", t - D * 0.55, size=110, fill=(255, 220, 60))
        d = ImageDraw.Draw(img)
        ax, ay = W/2, 560 + math.sin(t * 8) * 20
        d.polygon([(ax - 50, ay), (ax + 50, ay), (ax + 50, ay + 60), (ax + 90, ay + 60), (ax, ay + 140), (ax - 90, ay + 60), (ax - 50, ay + 60)],
                  fill=(255, 255, 255), outline=OUTLINE, width=6)
    return img, 1.02, (W/2, H/2 + 40), 0

SCENE_FUN = {s.__name__[3:]: s for s in [sc_hook, sc_crystal, sc_myturn, sc_laugh, sc_alone, sc_decide, sc_montage,
                                          sc_showoff, sc_storm, sc_panic, sc_me, sc_fix, sc_clap, sc_understand,
                                          sc_lesson, sc_cta]}

# ----------------------------------------------------------------------------
# LEGENDAS E SOBREPOSIÇÕES
# ----------------------------------------------------------------------------
def draw_caption(img, words, t_local):
    if not words: return
    d = ImageDraw.Draw(img)
    s = 84 * (1 + 0.18 * (1 - ease_out(t_local / 0.12)))
    f = font(s)
    space = d.textlength(" ", font=f)
    widths = [d.textlength(w.upper(), font=f) for w in words]
    total = sum(widths) + space * (len(words) - 1)
    if total > W - 80:
        f = font(s * (W - 80) / total); space = d.textlength(" ", font=f)
        widths = [d.textlength(w.upper(), font=f) for w in words]; total = sum(widths) + space * (len(words) - 1)
    x = W/2 - total/2
    y = 1560
    for w, wd in zip(words, widths):
        hl = w.lower().strip(",") in HIGHLIGHT
        d.text((x, y), w.upper(), font=f, fill=(255, 226, 60) if hl else (255, 255, 255), stroke_width=9, stroke_fill=(10, 10, 15))
        x += wd + space

def draw_header(img, t, total):
    d = ImageDraw.Draw(img)
    f = font(50)
    lines = ["NESSE MUNDO, TODOS", "TÊM UM SUPERPODER"]
    y = 120
    for l in lines:
        tw = d.textlength(l, font=f)
        d.rounded_rectangle([W/2 - tw/2 - 22, y - 8, W/2 + tw/2 + 22, y + 62], radius=12, fill=(255, 255, 255))
        d.text((W/2 - tw/2, y), l, font=f, fill=(15, 15, 20))
        y += 74
    # barra de progresso
    d.rectangle([0, H - 14, W, H], fill=(40, 40, 50))
    d.rectangle([0, H - 14, W * t / total, H], fill=(255, 60, 80))

# ----------------------------------------------------------------------------
# ÁUDIO
# ----------------------------------------------------------------------------
def read_wav(path):
    with wave.open(path) as w:
        sr = w.getframerate(); n = w.getnframes(); ch = w.getnchannels()
        a = np.frombuffer(w.readframes(n), np.int16).astype(np.float32) / 32768
    if ch > 1: a = a.reshape(-1, ch).mean(1)
    if sr != SR:
        x_old = np.arange(len(a)) / sr
        x_new = np.arange(int(len(a) * SR / sr)) / SR
        a = np.interp(x_new, x_old, a).astype(np.float32)
    return a

def write_wav(path, a):
    a = np.clip(a, -1, 1)
    st = (np.stack([a, a], 1) if a.ndim == 1 else a)
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((st * 32767).astype(np.int16).tobytes())

def tts(model, text, path, length_scale=0.92):
    subprocess.run([sys.executable, "-m", "piper", "-m", model, "-f", path, "--length-scale", str(length_scale),
                    "--sentence-silence", "0.25"], input=text.encode(), check=True, stderr=subprocess.DEVNULL)
    a = read_wav(path)
    # leve "presença": realce de médios + compressão suave
    a = a / (np.abs(a).max() + 1e-6) * 0.92
    a = np.tanh(a * 1.4) / np.tanh(1.4)
    return a

def midi(n): return 440 * 2 ** ((n - 69) / 12)

def lfilter1(x, a):
    """y[n] = (1-a) x[n] + a y[n-1] — via convolução com núcleo exponencial truncado."""
    x = np.asarray(x, np.float32)
    n = int(min(len(x), max(16, -7 / math.log(a)))) if a > 0 else 1
    k = ((1 - a) * a ** np.arange(n)).astype(np.float32)
    if n <= 64:
        return np.convolve(x, k)[:len(x)].astype(np.float32)
    L = len(x) + n - 1
    N = 1 << (L - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(k, N), N)[:len(x)].astype(np.float32)

def env_adsr(n, a=0.01, r=0.3):
    e = np.ones(n, np.float32)
    na = max(1, int(a * SR)); nr = max(1, min(n, int(r * SR)))
    e[:na] = np.linspace(0, 1, na)
    e[-nr:] *= np.linspace(1, 0, nr)
    return e

def pad_chord(notes, dur, vol=0.08, bright=0.5):
    n = int(dur * SR); t = np.arange(n) / SR
    out = np.zeros(n, np.float32)
    for m in notes:
        for det in (-0.12, 0.0, 0.11):
            f = midi(m + det)
            ph = (t * f) % 1
            saw = 2 * ph - 1
            out += (0.6 * np.sin(2 * np.pi * f * t) + bright * 0.4 * saw).astype(np.float32)
    out /= (len(notes) * 3)
    out = lfilter1(out, 0.86)
    return out * env_adsr(n, 0.35, 0.5) * vol

def pluck(m, dur=0.6, vol=0.12, decay=5.0):
    n = int(dur * SR); t = np.arange(n) / SR
    f = midi(m)
    s = np.sin(2*np.pi*f*t) + 0.35*np.sin(4*np.pi*f*t) + 0.12*np.sin(6*np.pi*f*t)
    return (s * np.exp(-t * decay) * env_adsr(n, 0.003, 0.05) * vol).astype(np.float32)

def kick(vol=0.5):
    n = int(0.35 * SR); t = np.arange(n) / SR
    f = 50 + 90 * np.exp(-t * 30)
    ph = np.cumsum(2 * np.pi * f / SR)
    return (np.sin(ph) * np.exp(-t * 9) * vol).astype(np.float32)

def clap(vol=0.18, seed=0):
    n = int(0.2 * SR); t = np.arange(n) / SR
    r = np.random.default_rng(seed).standard_normal(n).astype(np.float32)
    r = r - lfilter1(r, 0.7)
    return r * np.exp(-t * 22) * vol

def add(buf, x, at):
    i = int(at * SR)
    if i >= len(buf) or i + len(x) <= 0: return
    if i < 0: x = x[-i:]; i = 0
    j = min(len(buf), i + len(x))
    buf[i:j] += x[:j - i]

CHORDS = {
    "mystery":   ([57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]),     # Am F C G
    "sad":       ([57, 60, 64], [50, 53, 57], [52, 55, 59], [57, 60, 64]),     # Am Dm Em Am
    "hope":      ([48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60]),     # C G Am F
    "storm":     ([45, 52], [46, 53], [45, 52], [44, 51]),
    "triumph":   ([53, 57, 60], [55, 59, 62], [48, 52, 55, 60], [57, 60, 64]), # F G C Am
    "emotional": ([53, 57, 60], [55, 59, 62], [52, 55, 59], [57, 60, 64]),     # F G Em Am
    "outro":     ([48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60]),
}

def music_for(mood, dur, seed):
    bpm = {"sad": 72, "storm": 90, "triumph": 110, "hope": 100}.get(mood, 92)
    beat = 60 / bpm; bar = beat * 4
    n = int(dur * SR) + SR
    buf = np.zeros(n, np.float32)
    ch = CHORDS[mood]
    nb = int(math.ceil(dur / bar)) + 1
    rnd = random.Random(seed)
    for b in range(nb):
        c = ch[b % 4]; t0 = b * bar
        add(buf, pad_chord([m - 12 for m in c] + c, bar + 0.6, vol={"sad": 0.09, "storm": 0.11}.get(mood, 0.075),
                           bright=0.8 if mood == "storm" else 0.45), t0)
        add(buf, pluck(c[0] - 24, bar, 0.16, 1.5), t0)
        if mood in ("mystery", "hope", "triumph", "outro", "emotional"):
            arp = c + [c[1] + 12]
            step = beat / 2 if mood != "emotional" else beat
            k = 0; tt = t0
            while tt < t0 + bar - 1e-6:
                add(buf, pluck(arp[k % len(arp)] + 12, 0.7, 0.06 if mood != "triumph" else 0.075, 4.5), tt)
                tt += step; k += 1
        if mood == "sad":
            for k in range(2):
                add(buf, pluck(c[(k * 2) % len(c)] + 12, 1.6, 0.07, 2.0), t0 + k * beat * 2)
        if mood in ("hope", "triumph"):
            for k in range(4):
                add(buf, kick(0.35 if mood == "hope" else 0.5), t0 + k * beat)
                if mood == "triumph" and k % 2 == 1: add(buf, clap(0.2, b * 4 + k), t0 + k * beat)
        if mood == "storm":
            for k in range(8):
                add(buf, pluck(c[0] - 12, 0.25, 0.08, 9), t0 + k * beat / 2)
            add(buf, kick(0.4), t0); add(buf, kick(0.4), t0 + beat * 2.5)
    if mood == "storm":
        r = np.random.default_rng(seed).standard_normal(n).astype(np.float32)
        rumble = lfilter1(r, 0.995) * 0.6
        buf += rumble
    return buf[:int(dur * SR)]

def sfx_whoosh(d=0.5, vol=0.25, seed=1):
    n = int(d * SR); t = np.arange(n) / SR
    r = np.random.default_rng(seed).standard_normal(n).astype(np.float32)
    env = np.sin(np.pi * t / d) ** 2
    lo = lfilter1(r, 0.8)
    return (r - lo) * 0.3 * env * vol + lo * env * vol

def sfx_ding(vol=0.25, base=84):
    out = pluck(base, 1.2, vol, 3.0)
    add2 = pluck(base + 7, 1.2, vol * 0.7, 3.0)
    o = np.zeros(len(out) + int(0.08 * SR), np.float32)
    o[:len(out)] += out; o[int(0.08 * SR):] += add2
    return o

def sfx_sparkle(vol=0.12):
    o = np.zeros(int(1.0 * SR), np.float32)
    for i, m in enumerate([88, 91, 95, 100, 103]):
        p = pluck(m, 0.5, vol, 7)
        s = int(i * 0.06 * SR); o[s:s + len(p)] += p[:len(o) - s]
    return o

def sfx_boom(vol=0.7, seed=4):
    n = int(2.2 * SR); t = np.arange(n) / SR
    r = np.random.default_rng(seed).standard_normal(n).astype(np.float32)
    crack = (r - lfilter1(r, 0.5)) * np.exp(-t * 18) * 0.6
    rumble = lfilter1(r, 0.985) * np.exp(-t * 1.6) * 14
    k = kick(1.0); rumble[:len(k)] += k
    return (crack + rumble) * vol

def sfx_fail(vol=0.22):
    o = np.zeros(int(1.6 * SR), np.float32)
    for i, m in enumerate([67, 66, 65, 64]):
        p = pluck(m, 0.6 if i < 3 else 1.0, vol, 3)
        s = int(i * 0.3 * SR); o[s:s + len(p)] += p[:len(o) - s]
    return o

def sfx_applause(d=4.0, vol=0.5, seed=2):
    n = int(d * SR)
    rng = np.random.default_rng(seed)
    o = np.zeros(n, np.float32)
    c = clap(1.0, 1)[:int(0.05 * SR)]
    for _ in range(int(d * 90)):
        i = rng.integers(0, n - len(c))
        o[i:i + len(c)] += c * rng.uniform(0.2, 0.6)
    return o * env_adsr(n, 0.3, 1.2) * vol

def pitch(a, rate):
    x_old = np.arange(len(a)); x_new = np.arange(0, len(a) - 1, rate)
    return np.interp(x_new, x_old, a).astype(np.float32)

def sfx_laugh(model, tmp):
    p = os.path.join(tmp, "laugh.wav")
    base = tts(model, "Rá rá rá rá rá!", p, 0.8)
    o = np.zeros(int(len(base) * 1.6) + SR, np.float32)
    for k, (rate, off, v) in enumerate([(1.0, 0.0, 0.5), (1.3, 0.25, 0.35), (0.85, 0.5, 0.35), (1.15, 0.8, 0.3)]):
        s = pitch(base, rate) * v
        i = int(off * SR); o[i:i + len(s)] += s[:len(o) - i]
    return o

# ----------------------------------------------------------------------------
# PIPELINE
# ----------------------------------------------------------------------------
def voiced_bounds(a, thr=0.02):
    env = np.convolve(np.abs(a), np.ones(441) / 441, "same")
    idx = np.where(env > thr)[0]
    if len(idx) == 0: return 0, len(a) / SR
    return idx[0] / SR, idx[-1] / SR

def chunk_words(text):
    words = text.split()
    chunks, cur = [], []
    for w in words:
        cur.append(w)
        if len(cur) >= 3 or len(" ".join(cur)) > 15 or w[-1] in ".,?!:":
            chunks.append(cur); cur = []
    if cur: chunks.append(cur)
    return chunks

def build_timeline(model, tmp):
    t = 0.0
    tl = []
    for i, sc in enumerate(SCENES):
        p = os.path.join(tmp, f"vo_{i:02d}.wav")
        a = tts(model, sc["text"], p)
        v0, v1 = voiced_bounds(a)
        lead = 0.12
        dur = lead + len(a) / SR + sc["pad"]
        # legendas: tempo proporcional ao tamanho (pontuação pesa mais)
        chunks = chunk_words(sc["text"])
        weights = []
        for c in chunks:
            s = " ".join(c)
            wgt = len(s) + 2 + (6 if s[-1] in ".?!" else 3 if s[-1] in ",:" else 0) + s.count("...") * 6
            weights.append(wgt)
        tot = sum(weights)
        span = v1 - v0
        cues = []; acc = 0
        for c, wgt in zip(chunks, weights):
            cues.append((t + lead + v0 + span * acc / tot, c)); acc += wgt
        tl.append(dict(sc, start=t, dur=dur, vo=a, vo_at=t + lead, cues=cues, voiced=(lead + v0, lead + v1)))
        t += dur
    return tl, t

def lesson_cues(sc):
    # alinha cada frase da lição com a narração (4 frases)
    starts = [c[0] - sc["start"] for c in sc["cues"]]
    txts = [" ".join(c[1]) for c in sc["cues"]]
    marks = []
    keys = ["Talento", "Caráter", "Não", "Torne-se"]
    for k in keys:
        for s, tx in zip(starts, txts):
            if tx.startswith(k): marks.append(max(0.0, s - 0.1)); break
    return marks if len(marks) == 4 else None

def render_frame(args):
    fi, tl, total = args
    t = fi / FPS
    sc = next((s for s in tl if s["start"] <= t < s["start"] + s["dur"]), tl[-1])
    lt = t - sc["start"]
    fn = SCENE_FUN[sc["id"]]
    if sc["id"] == "lesson":
        img, z, (cx, cy), shake = fn(lt, sc["dur"], cue=sc.get("lcue"))
    else:
        img, z, (cx, cy), shake = fn(lt, sc["dur"])
    # punch-in no começo de cada cena
    z *= 1 + 0.07 * (1 - ease_out(lt / 0.3))
    if shake:
        r = random.Random(fi)
        cx += r.uniform(-shake, shake) * 2; cy += r.uniform(-shake, shake) * 2
    if abs(z - 1) > 1e-3 or shake:
        cw, chh = W / z, H / z
        x0 = min(max(0, cx - cw/2), W - cw); y0 = min(max(0, cy - chh/2), H - chh)
        img = img.resize((W, H), Image.BILINEAR, box=(x0, y0, x0 + cw, y0 + chh))
    # fade de entrada/saída do vídeo
    if t < 0.3: img = darken(img, 1 - t / 0.3)
    if t > total - 0.6: img = darken(img, (t - (total - 0.6)) / 0.6)
    draw_header(img, t, total)
    if sc["id"] != "lesson":
        cur = None
        for (ct, words) in sc["cues"]:
            if ct <= t: cur = (ct, words)
        if cur and t < sc["vo_at"] + sc["voiced"][1] + 0.5:
            draw_caption(img, cur[1], t - cur[0])
    return img.tobytes()

def render_segment(args):
    seg_id, f0, f1, tl, total, out = args
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                          "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium",
                          "-crf", "20", "-pix_fmt", "yuv420p", out], stdin=subprocess.PIPE)
    for fi in range(f0, f1):
        p.stdin.write(render_frame((fi, tl, total)))
    p.stdin.close(); p.wait()
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", required=True)
    ap.add_argument("--out", default="out")
    ap.add_argument("--workers", type=int, default=os.cpu_count() or 4)
    ap.add_argument("--preview", type=float, nargs="*", help="só exporta PNGs nesses segundos")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    tmp = os.path.join(a.out, "_tmp"); os.makedirs(tmp, exist_ok=True)

    print("» narração...")
    tl, total = build_timeline(a.voice, tmp)
    for sc in tl:
        if sc["id"] == "lesson": sc["lcue"] = lesson_cues(sc)
    print(f"  duração total: {total:.1f}s")

    if a.preview is not None:
        for s in a.preview:
            Image.frombytes("RGB", (W, H), render_frame((int(s * FPS), tl, total))).save(os.path.join(a.out, f"preview_{s:05.1f}.png"))
        return

    print("» trilha e efeitos...")
    n = int(total * SR) + SR
    music = np.zeros(n, np.float32); vo = np.zeros(n, np.float32); fx = np.zeros(n, np.float32)
    # música por blocos de humor contíguos, com crossfade
    groups = []
    for sc in tl:
        if groups and groups[-1][0] == sc["mood"]: groups[-1][2] = sc["start"] + sc["dur"]
        else: groups.append([sc["mood"], sc["start"], sc["start"] + sc["dur"]])
    for gi, (mood, s, e) in enumerate(groups):
        xf = 0.6
        m = music_for(mood, e - s + xf, gi)
        env = np.ones(len(m), np.float32)
        k = int(xf * SR)
        if gi > 0: env[:k] = np.linspace(0, 1, k)
        env[-k:] = np.linspace(1, 0, k)
        add(music, m * env, max(0, s - xf / 2))
    for sc in tl:
        add(vo, sc["vo"], sc["vo_at"])
    S = {s["id"]: s for s in tl}
    def at(sid, frac=0.0, off=0.0): return S[sid]["start"] + S[sid]["dur"] * frac + off
    for s in tl: add(fx, sfx_whoosh(0.45, 0.18, int(s["start"] * 10)), max(0, s["start"] - 0.2))
    add(fx, sfx_sparkle(0.12), at("hook", 0, 0.3))
    add(fx, sfx_ding(0.22, 76), at("crystal", 0.42))
    add(fx, sfx_sparkle(0.12), at("crystal", 0.45))
    add(fx, sfx_fail(0.25), at("myturn", 0.45, 0.1))
    add(fx, sfx_laugh(a.voice, tmp) * 0.55, at("laugh", 0, 0.05))
    for k in range(3): add(fx, sfx_ding(0.16, 79 + k * 2), at("montage", k / 3))
    add(fx, sfx_boom(0.6), at("storm", 0, 0.55))
    add(fx, sfx_boom(0.8, 7), at("storm", 0.5))
    add(fx, sfx_boom(0.5, 9), at("storm", 0.8))
    add(fx, sfx_boom(0.4, 11), at("panic", 0))
    add(fx, sfx_ding(0.2, 72), at("fix", 1/3 * 0.4))
    add(fx, sfx_sparkle(0.14), at("fix", 1/3 + 1/3 * 0.6))
    add(fx, sfx_ding(0.25, 84), at("fix", 2/3 + 1/3 * 0.35))
    add(fx, sfx_applause(S["clap"]["dur"] + 1.0, 0.35), at("clap", 0))
    add(fx, sfx_sparkle(0.1), at("understand", 0.5))
    if S["lesson"].get("lcue"):
        for c in S["lesson"]["lcue"]: add(fx, sfx_ding(0.12, 81), S["lesson"]["start"] + c)
    add(fx, sfx_ding(0.18, 88), at("cta", 0.55))
    # ducking da música sob a voz
    env = np.convolve(np.abs(vo), np.ones(4410) / 4410, "same")
    env = np.clip(env / (env.max() + 1e-6) * 4, 0, 1)
    env = lfilter1(env, 0.9995)
    mix = music * (1 - 0.45 * env) * 1.1 + vo * 1.0 + fx * 0.9
    fade = int(0.8 * SR); end = int(total * SR)
    mix = mix[:end]; mix[-fade:] *= np.linspace(1, 0, fade)
    mix = mix / (np.abs(mix).max() + 1e-6) * 0.95
    wav_path = os.path.join(tmp, "mix.wav"); write_wav(wav_path, mix)

    print("» renderizando quadros...")
    nf = int(total * FPS)
    k = a.workers
    bounds = [(i * nf // k, (i + 1) * nf // k) for i in range(k)]
    jobs = [(i, b0, b1, tl, total, os.path.join(tmp, f"seg_{i}.mp4")) for i, (b0, b1) in enumerate(bounds)]
    with Pool(k) as p:
        segs = p.map(render_segment, jobs)
    lst = os.path.join(tmp, "segs.txt")
    with open(lst, "w") as f:
        for s in segs: f.write(f"file '{os.path.abspath(s)}'\n")
    final = os.path.join(a.out, "nesse_mundo_todos_tem_um_superpoder.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-i", wav_path,
                    "-c:v", "copy", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "44100", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", final], check=True)
    # roteiro / legendas .srt
    with open(os.path.join(a.out, "legendas.srt"), "w") as f:
        for i, sc in enumerate(tl):
            s0 = sc["vo_at"] + sc["voiced"][0] - 0.12; s1 = sc["vo_at"] + sc["voiced"][1] - 0.12 + 0.3
            fmt = lambda x: f"{int(x//3600):02d}:{int(x%3600//60):02d}:{int(x%60):02d},{int(x*1000%1000):03d}"
            f.write(f"{i+1}\n{fmt(s0)} --> {fmt(s1)}\n{sc['text']}\n\n")
    print("✔", final)

if __name__ == "__main__":
    main()

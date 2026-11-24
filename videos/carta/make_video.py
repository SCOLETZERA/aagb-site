#!/usr/bin/env python3
"""
"Nesse mundo, aos 15 anos, você recebe uma carta com o nome de quem vai te trair."
Nova história em 3D com o mesmo elenco do vídeo do número (João, Bia, Lucas, Isabella,
Ivna, Rayane, Jesus, Mateus, Adrielly e Levi) e plot twist.

Reaproveita o motor 3D, os personagens, a voz e a mixagem de ../numero.

Uso:
    python3 make_video.py --voice-dir vits-piper-pt_BR-faber-medium --out out/
"""
import argparse, math, os, random, subprocess, sys
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
NUM = os.path.join(HERE, "..", "numero")
import importlib.util
_spec = importlib.util.spec_from_file_location("nm", os.path.join(NUM, "make_video.py"))
nm = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(nm)
sp = nm.sp
from engine3d import box, T, Ry, Rx, EMISSIVE, SMILE, SAD, SHOCK, LAUGH, NEUTRAL, HAPPY, CRY, SMIRK  # noqa

W, H, FPS, SR = nm.W, nm.H, nm.FPS, nm.SR
THEO, LUCAS, BIA = nm.THEO, nm.LUCAS, nm.BIA
character, walk_pose, head_pos, npal = nm.character, nm.walk_pose, nm.head_pos, nm.npal
ease, eout, lerp, lerpv = nm.ease, nm.eout, nm.lerp, nm.lerpv
D2R = math.radians
DAY, SUNSET, GLOOM = nm.LIGHT_DAY, nm.LIGHT_SUNSET, nm.LIGHT_GLOOM
font = sp.font
SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"

# ----------------------------------------------------------------------------
# ROTEIRO
# ----------------------------------------------------------------------------
SCENES = [
    dict(id="hook", mood="mystery", pad=0.5,
         text="Nesse mundo, quando você faz quinze anos, recebe uma carta com o nome de quem vai te trair."),
    dict(id="isabella", mood="mystery", pad=0.5,
         text="A carta da Isabella dizia: Mateus. Um mês depois, ele espalhou o segredo dela pra escola inteira."),
    dict(id="always", mood="mystery", pad=0.4,
         text="A da Rayane dizia: Ivna. A do Jesus: Adrielly. A carta nunca errava."),
    dict(id="blank", mood="sad", pad=0.9,
         text="No meu aniversário, eu abri a minha carta. E ela estava... em branco."),
    dict(id="anyone", mood="sad", pad=0.5,
         text="Ninguém nunca tinha recebido uma carta em branco. E eu pensei: se não tem nome, pode ser qualquer um."),
    dict(id="suspect", mood="storm", pad=0.5,
         text="Comecei a desconfiar de todo mundo. Do Lucas. Da Bia. Até do Levi."),
    dict(id="quit", mood="storm", pad=0.5,
         text="Parei de contar meus segredos. E saí do grupo de dança, com medo de alguém me sabotar."),
    dict(id="alone", mood="sad", pad=0.7,
         text="Um por um, eu afastei todos os meus amigos. E fiquei sozinho."),
    dict(id="glow", mood="storm", pad=0.4,
         text="Um ano depois, a minha carta finalmente mostrou um nome."),
    dict(id="twist", mood="storm", pad=2.4,
         text="O nome era... João. O meu.", cap="O nome era... JOÃO. O meu."),
    dict(id="meaning", mood="emotional", pad=0.6,
         text="Ninguém tinha me traído. Fui eu que me traí. Larguei meus sonhos e meus amigos, por medo de uma traição que nunca aconteceu."),
    dict(id="sorry", mood="triumph", pad=0.6,
         text="No dia seguinte, eu pedi desculpas. E eles... ainda estavam ali."),
    dict(id="lesson", mood="emotional", pad=1.6,
         text="O medo de ser traído pode fazer você trair a si mesmo. Confie. Arrisque. Viva."),
    dict(id="levi", mood="triumph", pad=5.0,
         text="E o Levi? Ele nunca abriu a carta dele. Disse que só abre no dia seis do sete. E você? Abriria a sua?",
         cap="E o Levi? Ele nunca abriu a carta dele. Disse que só abre no dia 6 do 7. E você? Abriria a sua?"),
]

HL = {"carta", "trair.", "mateus.", "ivna.", "adrielly.", "branco.", "qualquer", "lucas.", "bia.", "levi.", "levi?",
      "sozinho.", "nome.", "joão.", "meu.", "traí.", "nunca", "medo", "ali.", "6", "7.", "sua?", "segredo", "sabotar.",
      "desconfiar", "isabella", "errava."}

# ----------------------------------------------------------------------------
# 2D: carta, nomes, cabeçalho
# ----------------------------------------------------------------------------
def name_tag(img, VP, pos, name, col=(255, 255, 255), scale=1.0, sus=0.0, t=0.0):
    pr = nm.project(VP, pos)
    if not pr: return
    x, y, w = pr
    s = max(22, min(70, 900 / w)) * scale
    d = ImageDraw.Draw(img)
    f = font(s)
    tw = d.textlength(name.upper(), font=f)
    d.text((x - tw/2, y - s/2), name.upper(), font=f, fill=col, stroke_width=max(3, int(s / 9)), stroke_fill=(15, 15, 20))
    if sus > 0:
        q = font(s * 2.2 * (0.8 + 0.2 * sus))
        qw = d.textlength("?", font=q)
        d.text((x - qw/2, y - s * 2.9 + math.sin(t * 6) * 6), "?", font=q, fill=(240, 60, 60),
               stroke_width=6, stroke_fill=(20, 10, 10))

def letter(img, cx, cy, w, name, k=1.0, rot=-4, glow_col=None, name_alpha=1.0, title="Quem vai te trair:"):
    """Carta de papel em 2D. k = escala de entrada (0..1)."""
    if k <= 0: return
    w = int(w * (0.6 + 0.4 * eout(k)))
    h = int(w * 0.72)
    card = Image.new("RGBA", (w + 40, h + 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(card)
    d.rounded_rectangle([24, 28, w + 24, h + 28], radius=18, fill=(0, 0, 0, 90))
    d.rounded_rectangle([14, 14, w + 14, h + 14], radius=18, fill=(250, 244, 226, 255), outline=(150, 120, 80, 255), width=5)
    for i in range(5):
        yy = 14 + h * (0.42 + i * 0.12)
        d.line([(14 + w * 0.08, yy), (14 + w * 0.92, yy)], fill=(200, 190, 170, 255), width=2)
    ft = ImageFont.truetype(SERIF, int(w * 0.075))
    tw = d.textlength(title, font=ft)
    d.text((14 + w/2 - tw/2, 14 + h * 0.12), title, font=ft, fill=(80, 60, 50, 255))
    if name:
        fn = ImageFont.truetype(SERIF, int(w * 0.17))
        nw = d.textlength(name, font=fn)
        d.text((14 + w/2 - nw/2, 14 + h * 0.42), name, font=fn, fill=(190, 25, 35, int(255 * name_alpha)))
    d.ellipse([14 + w/2 - w*0.06, 14 + h - w*0.13, 14 + w/2 + w*0.06, 14 + h - w*0.01], fill=(190, 30, 40, 255))
    card = card.rotate(rot, resample=Image.BICUBIC, expand=True)
    if glow_col: sp.glow(img, cx, cy, w * 0.9, glow_col, 0.9)
    img.paste(card, (int(cx - card.width / 2), int(cy - card.height / 2)), card)

def header(img, t, total):
    d = ImageDraw.Draw(img)
    f = font(44)
    y = 116
    for l in ["NESSE MUNDO, AOS 15 ANOS, VOCÊ", "DESCOBRE QUEM VAI TE TRAIR"]:
        tw = d.textlength(l, font=f)
        d.rounded_rectangle([W/2 - tw/2 - 20, y - 8, W/2 + tw/2 + 20, y + 56], radius=12, fill=(255, 255, 255))
        d.text((W/2 - tw/2, y), l, font=f, fill=(15, 15, 20))
        y += 68
    d.rectangle([0, H - 14, W, H], fill=(40, 40, 50))
    d.rectangle([0, H - 14, W * t / total, H], fill=(255, 60, 80))

def envelope(m):
    return [box(m, (1.4, 0.9, 0.06), (250, 246, 232)), box(m @ T(0, 0, 0.05), (0.3, 0.3, 0.04), (200, 30, 40), EMISSIVE)]

# ----------------------------------------------------------------------------
# CENAS
# ----------------------------------------------------------------------------
WALK = [("Jesus", -20, 6, 1), ("Ivna", 18, 2, -1), ("Mateus", -16, -2, 1), ("Adrielly", 22, 10, -1),
        ("Levi", -24, 12, 1), ("Rayane", 14, -9, -1), ("Isabella", -10, 15, 1)]

def sc_hook(t, D):
    bx = nm.world(); tags = []
    for i, (n, x0, z, dr) in enumerate(WALK):
        x = x0 + dr * t * 3.0
        pos = (x, 0, z)
        got = t > 1.2 + i * 0.35
        bx += character(pos, D2R(90 * dr), npal(n), SHOCK if got else SMILE, walk_pose(t + i), item="letter" if got else None)
        tags.append((head_pos(pos), n))
        # envelope caindo em direção à pessoa
        tt = t - (i * 0.35)
        if 0 < tt < 1.2:
            y = 26 - 20 * tt / 1.2
            bx += envelope(T(x + math.sin(tt * 5) * 1.5, y, z) @ Ry(tt * 4) @ Rx(0.6 + math.sin(tt * 6) * 0.4))
    r = random.Random(4)
    for k in range(18):  # chuva de cartas ao fundo
        tt = (t * 0.5 + r.random()) % 1
        x, z = r.uniform(-30, 30), r.uniform(-20, 0)
        bx += envelope(T(x, 30 - tt * 30, z) @ Ry(t * 2 + k) @ Rx(0.8 + k))
    k = ease(t / D)
    cam = (lerpv((4, 16, 32), (4, 10, 20), k), (2, 4, 4), 52)
    def post(img, VP):
        for p, n in tags: name_tag(img, VP, p, n, scale=0.9)
    return dict(boxes=bx, cam=cam, light=DAY, post=post)

def sc_isabella(t, D):
    bx = nm.world()
    isa = (3, 0, 2)
    bx += character(isa, D2R(-20), npal("Isabella"), SHOCK if t < D * 0.45 else CRY, dict(armR=(80, 0)), item="letter")
    spread = t > D * 0.45
    mat = (-4, 0, -2)
    bx += character(mat, D2R(60 if not spread else 140), npal("Mateus"), SMIRK if spread else NEUTRAL,
                    dict(armR=(60 + (math.sin(t * 10) * 20 if spread else 0), 30)))
    for i, n in enumerate(["Rayane", "Jesus", "Adrielly"]):
        p = (-7 + i * 2.5, 0, -6 + (i % 2))
        bx += character(p, D2R(30), npal(n), LAUGH if spread else NEUTRAL, dict(armL=(0, 20)))
    k = ease(t / D)
    cam = (lerpv((8, 6.5, 14), (2, 7, 16), k), lerpv((3, 4.5, 2), (-1, 3.5, -1), k), 50)
    def post(img, VP):
        name_tag(img, VP, head_pos(isa), "Isabella")
        name_tag(img, VP, head_pos(mat), "Mateus", col=(255, 120, 120) if spread else (255, 255, 255))
        for i, n in enumerate(["Rayane", "Jesus", "Adrielly"]):
            name_tag(img, VP, head_pos((-7 + i * 2.5, 0, -6 + (i % 2))), n, scale=0.8)
        if t < D * 0.5:
            letter(img, W/2, 1150, 560, "MATEUS", eout((t - 0.4) / 0.4), rot=-5)
        else:
            nm.pop_text(img, W/2, 520, "SEGREDO ESPALHADO", t - D * 0.5, size=78, fill=(255, 90, 90))
    return dict(boxes=bx, cam=cam, light=DAY, post=post)

def sc_always(t, D):
    bx = nm.world()
    people = [("Rayane", (-6, 0, 2)), ("Jesus", (6, 0, 2))]
    for n, p in people:
        bx += character(p, 0, npal(n), SHOCK, dict(armR=(80, 0)), item="letter")
    bx += character((-6, 0, -6), D2R(150), npal("Ivna"), SMIRK)
    bx += character((6, 0, -6), D2R(210), npal("Adrielly"), SMIRK)
    half = t < D * 0.45
    tgt = (-6, 4, -1) if half else (6, 4, -1)
    cam = ((tgt[0] + (1 if half else -1) * 3, 7, 15), tgt, 50)
    def post(img, VP):
        for n, p in people: name_tag(img, VP, head_pos(p), n)
        name_tag(img, VP, head_pos((-6, 0, -6)), "Ivna", col=(255, 120, 120))
        name_tag(img, VP, head_pos((6, 0, -6)), "Adrielly", col=(255, 120, 120))
        if half: letter(img, W/2, 1150, 520, "IVNA", eout(t / 0.3), rot=4)
        else: letter(img, W/2, 1150, 520, "ADRIELLY", eout((t - D * 0.45) / 0.3), rot=-4)
        if t > D * 0.75: nm.pop_text(img, W/2, 470, "NUNCA ERRA", t - D * 0.75, size=96, fill=(255, 215, 60))
    return dict(boxes=bx, cam=cam, light=DAY, post=post)

JOAO = (0, 0, 2)

def sc_blank(t, D):
    bx = nm.world()
    opened = t > D * 0.35
    bx += character(JOAO, 0, THEO, SHOCK if t > D * 0.65 else (HAPPY if not opened else NEUTRAL), dict(armR=(80, 0)), item="letter")
    for i, n in enumerate(["Bia", "Lucas", "Levi"]):
        pal = {"Bia": BIA, "Lucas": LUCAS}.get(n) or npal(n)
        p = (-5 + i * 5, 0, -4)
        bx += character(p, 0, pal, HAPPY, dict(armL=(0, 150 + math.sin(t * 8 + i) * 20)))
    k = ease(t / D)
    cam = (lerpv((0, 7, 16), (0, 6.2, 9), k), (0, 5, 0), 50)
    def post(img, VP):
        name_tag(img, VP, head_pos(JOAO), "João")
        for i, n in enumerate(["Bia", "Lucas", "Levi"]):
            name_tag(img, VP, head_pos((-5 + i * 5, 0, -4)), n, scale=0.8)
        if opened:
            letter(img, W/2, 1150, 600, "", eout((t - D * 0.35) / 0.4), rot=-3)
        if t > D * 0.7:
            nm.pop_text(img, W/2, 470, "EM BRANCO???", t - D * 0.7, size=86, fill=(255, 255, 255))
    return dict(boxes=bx, cam=cam, light=DAY, post=post)

FRIENDS = [("Bia", BIA), ("Lucas", LUCAS), ("Levi", None), ("Isabella", None), ("Mateus", None), ("Ivna", None)]

def pal_of(n, p): return p or npal(n)

def ring_pos(i, n=6, r=7.0, c=(0, 0, 2)):
    a = i / n * math.tau + 0.5
    return (c[0] + math.sin(a) * r, 0, c[2] + math.cos(a) * r)

def sc_anyone(t, D):
    bx = nm.world()
    bx += character(JOAO, t * 0.6, THEO, SHOCK, dict(armR=(80, 0)), item="letter")
    for i, (n, p) in enumerate(FRIENDS):
        pos = ring_pos(i)
        yaw = math.atan2(JOAO[0] - pos[0], JOAO[2] - pos[2])
        bx += character(pos, yaw, pal_of(n, p), SMILE)
    a = t * 0.5
    cam = ((math.sin(a) * 17, 12, 2 + math.cos(a) * 17), (0, 3.0, 2), 50)
    def post(img, VP):
        name_tag(img, VP, head_pos(JOAO), "João")
        sus = ease((t - D * 0.55) / 0.6)
        for i, (n, p) in enumerate(FRIENDS):
            name_tag(img, VP, head_pos(ring_pos(i)), n, scale=0.85, sus=sus, t=t + i)
    return dict(boxes=bx, cam=cam, light=GLOOM, post=post)

def sc_suspect(t, D):
    bx = nm.world()
    seg = D / 3
    i = min(2, int(t / seg)); tt = t - i * seg
    who = [("Lucas", LUCAS), ("Bia", BIA), ("Levi", None)][i]
    them = (0, 0, -2)
    bx += character(them, 0, pal_of(*who), SMILE, dict(armL=(0, 140 + math.sin(t * 6) * 10)))
    bx += character((0, 0, 6), D2R(180), THEO, NEUTRAL)
    side = [-1, 1, -1][i]
    cam = ((side * 3.5, 6.4, 12.5), (0, 4.6, -1), 46)
    def post(img, VP):
        name_tag(img, VP, head_pos(them), who[0], col=(255, 120, 120), scale=1.2, sus=eout(tt / 0.4), t=t)
        nm.pop_text(img, W/2, 1260, ["SERÁ ELE?", "SERÁ ELA?", "ATÉ O LEVI?"][i], tt - 0.2, size=96, fill=(255, 90, 90))
        fl = max(0, 1 - tt / 0.12)
        if fl > 0: img.paste(Image.blend(img, Image.new("RGB", img.size, (255, 255, 255)), fl * 0.7))
    return dict(boxes=bx, cam=cam, light=GLOOM, post=post)

def sc_quit(t, D):
    bx = nm.world()
    dancers = [("Levi", None), ("Bia", BIA), ("Lucas", LUCAS), ("Rayane", None)]
    for i, (n, p) in enumerate(dancers):
        pos = (-6 + i * 3.6, 0, -4)
        b, _ = nm.dancer(t, i, n, pal_of(n, p), pos, "toprock")
        bx += b
    walk = t > D * 0.35
    jz = 0 if not walk else (t - D * 0.35) * 3.2
    bx += character((3, 0, 1 + jz), D2R(0 if walk else 180), THEO, SAD if walk else NEUTRAL,
                    walk_pose(t) if walk else dict(armL=(0, 10)))
    cam = ((2, 7, 19), (1, 3.5, -1), 52)
    def post(img, VP):
        for i, (n, p) in enumerate(dancers): name_tag(img, VP, head_pos((-6 + i * 3.6, 0, -4)), n, scale=0.85)
        name_tag(img, VP, head_pos((3, 0, 1 + jz)), "João")
        if t > D * 0.4: nm.pop_text(img, W/2, 470, "SAIU DO GRUPO", t - D * 0.4, size=90, fill=(255, 90, 90))
    return dict(boxes=bx, cam=cam, light=GLOOM, post=post)

BENCH = (-4, 0, 10)

def sc_alone(t, D):
    bx = nm.world()
    bx += character(BENCH, 0, THEO, SAD, nm.SIT, item="letter")
    for i, (n, p) in enumerate(FRIENDS):
        a = i / len(FRIENDS) * math.pi - math.pi / 2
        d = 6 + t * 2.6
        pos = (BENCH[0] + math.sin(a) * d, 0, BENCH[2] - 2 - abs(math.cos(a)) * d)
        bx += character(pos, a + math.pi, pal_of(n, p), SAD, walk_pose(t + i))
    k = ease(t / D)
    cam = (lerpv((-4, 5, 20), (-4, 14, 30), k), (-4, 3, 8), 50)
    def post(img, VP):
        name_tag(img, VP, head_pos(BENCH, bob=-0.35), "João")
        sp.rain(img, t, n=70, col=(170, 180, 210))
    return dict(boxes=bx, cam=cam, light=GLOOM, post=post)

def sc_glow(t, D):
    bx = nm.world(1.0)
    bx += character(BENCH, 0, THEO, SHOCK if t > D * 0.5 else SAD, dict(nm.SIT, armR=(80, 0)), item="letter")
    k = ease(t / D)
    cam = (lerpv((-4, 5.5, 22), (-4, 4.6, 16), k), (-4, 3.4, 10), 46)
    def post(img, VP):
        pr = nm.project(VP, (-4.9, 2.4, 11.4))
        if pr:
            pulse = 0.5 + 0.5 * math.sin(t * 6)
            sp.glow(img, pr[0], pr[1], 120 + 160 * k + 40 * pulse, (255, 230, 150), 0.6 + 0.4 * k)
        if t > D * 0.4:
            letter(img, W/2, 1150, 620, "", eout((t - D * 0.4) / 0.5), rot=-3, glow_col=(255, 220, 140))
    return dict(boxes=bx, cam=cam, light=SUNSET, post=post)

def sc_twist(t, D):
    bx = nm.world(1.0)
    bx += character(BENCH, 0, THEO, SHOCK, dict(nm.SIT, armR=(80, 0)), item="letter")
    reveal = ease((t - 0.7) / 1.0)
    z = 1.0 + 0.6 * ease(t / D)
    cam = ((-4, 6.4, 10 + 13 / z), (-4, 3.0, 10), 46)
    def post(img, VP):
        letter(img, W/2, 1120, 700 + 80 * ease(t / D), "JOÃO", 1, rot=-3, glow_col=(255, 120, 100) if reveal > 0.9 else (255, 220, 140),
               name_alpha=reveal)
        if t > 1.8:
            nm.pop_text(img, W/2, 470, "ELE MESMO", t - 1.8, size=120, fill=(255, 80, 80))
        sh = 10 if 1.5 < t < 1.9 else 0
        if sh:
            arr = np.asarray(img); img.paste(Image.fromarray(np.roll(arr, random.randint(-sh, sh), axis=1)))
    return dict(boxes=bx, cam=cam, light=SUNSET, post=post)

def sc_meaning(t, D):
    bx = nm.world(1.0)
    bx += character(BENCH, 0, THEO, CRY, dict(nm.SIT, armR=(40, 0), armL=(40, 0)), item="letter")
    # "lembranças" dos amigos, translúcidas no fundo (desenhadas depois como fantasmas 2D)
    k = ease(t / D)
    cam = (lerpv((-4, 4.4, 16), (-4, 7, 22), k), (-4, 3.4, 10), 48)
    def post(img, VP):
        names = ["Bia", "Lucas", "Levi", "Isabella", "Mateus", "Ivna"]
        for i, n in enumerate(names):
            a = i / len(names) * math.tau + t * 0.3
            x = W/2 + math.cos(a) * 360; y = 720 + math.sin(a) * 160
            al = 0.4 + 0.3 * math.sin(t * 2 + i)
            d = ImageDraw.Draw(img); f = font(44)
            tw = d.textlength(n.upper(), font=f)
            c = tuple(int(255 * al + 200 * (1 - al)) for _ in range(3))
            d.text((x - tw/2, y), n.upper(), font=f, fill=c, stroke_width=4, stroke_fill=(40, 30, 60))
        if t > D * 0.45: nm.pop_text(img, W/2, 470, "EU ME TRAÍ", t - D * 0.45, size=110, fill=(255, 215, 60))
    return dict(boxes=bx, cam=cam, light=SUNSET, post=post)

def sc_sorry(t, D):
    bx = nm.world()
    group = [("Bia", BIA), ("Lucas", LUCAS), ("Levi", None), ("Isabella", None), ("Rayane", None), ("Jesus", None),
             ("Mateus", None), ("Ivna", None), ("Adrielly", None)]
    walk_end = D * 0.4
    jz = lerp(10, 3.5, ease(t / walk_end))
    bx += character((0, 0, jz), D2R(180), THEO, SAD if t < walk_end else (HAPPY if t > D * 0.6 else NEUTRAL),
                    walk_pose(t) if t < walk_end else dict(armL=(0, 20), armR=(0, 20)))
    turn = ease((t - walk_end) / 0.8)
    pos_l = []
    for i, (n, p) in enumerate(group):
        x = -8 + i * 2.0; z = -2 - (i % 2) * 2
        pos_l.append((x, 0, z))
        yaw = lerp(math.pi, math.atan2(0 - x, jz - z), turn)
        open_arms = t > D * 0.6
        bx += character((x, 0, z), yaw, pal_of(n, p), HAPPY if open_arms else NEUTRAL,
                        dict(armL=(0, 100 if open_arms else 5), armR=(0, 100 if open_arms else 5)))
    cam = ((3, 7, jz + 14), (0, 3.4, -1), 54)
    def post(img, VP):
        name_tag(img, VP, head_pos((0, 0, jz)), "João")
        for (n, p), pp in zip(group, pos_l): name_tag(img, VP, head_pos(pp), n, scale=0.6)
        if t > D * 0.62:
            nm.pop_text(img, W/2, 470, "AINDA ESTAVAM ALI", t - D * 0.62, size=90, fill=(120, 255, 140))
            pr = nm.project(VP, head_pos((0, 0, jz)))
            if pr: sp.sparkles(img, pr[0], pr[1] + 200, t, col=(255, 240, 150), n=12, rad=300)
    return dict(boxes=bx, cam=cam, light=DAY, post=post)

LESSON = ["O medo de ser traído", "pode fazer você", "trair a si mesmo.", "Confie. Arrisque. Viva."]

def sc_lesson(t, D, cues=None):
    bx = nm.world(1.0)
    nm.trio_boxes(t + 5, bx)
    cam = ((-6, 9, 36), (-4, 3.2, 10), 50)
    def post(img, VP):
        from PIL import ImageFilter
        im2 = img.filter(ImageFilter.GaussianBlur(14))
        img.paste(Image.blend(im2, Image.new("RGB", img.size, (20, 10, 30)), 0.55))
        d = ImageDraw.Draw(img)
        st = [0.2, 0.2, 0.2, D * 0.55]
        y = 640
        for i, line in enumerate(LESSON):
            tt = t - st[i]
            if tt < 0: break
            big = i == 3
            s = (92 if big else 84) * (1 + 0.25 * (1 - eout(tt / 0.25)))
            f = font(s); tw = d.textlength(line, font=f)
            if big:
                sp.glow(img, W/2, y + 120, 440, (255, 200, 80), 0.5); d = ImageDraw.Draw(img)
            col = (255, 215, 60) if i in (2, 3) else (255, 255, 255)
            d.text((W/2 - tw/2, y + (80 if big else 0)), line, font=f, fill=col, stroke_width=8, stroke_fill=(10, 10, 15))
            y += 120
    return dict(boxes=bx, cam=cam, light=SUNSET, post=post)

def sc_levi(t, D):
    bx = nm.world()
    ring = []
    dancers = [(n, p) for n, p, _ in nm.DANCERS]
    for i, (n, p) in enumerate(dancers):
        a = i / len(dancers) * math.tau + math.pi / len(dancers)
        ring.append((6 + math.sin(a) * 11, 0, -6 + math.cos(a) * 9))
    dancing = t > D * 0.45
    tags = []
    for i, ((n, p), pos) in enumerate(zip(dancers, ring)):
        if dancing:
            b, lp = nm.dancer(t, i, n, p, pos, nm.DANCE_MOVES[i])
        else:
            yaw = math.atan2(6 - pos[0], -6 - pos[2])
            b = character(pos, yaw, pal_of(n, p), SMILE); lp = head_pos(pos)
        bx += b; tags.append((lp, n))
    for k in range(8):
        a = k / 8 * math.tau
        bx += nm.world_mod.pride_flag((6 + math.sin(a) * 16, 0, -8 + math.cos(a) * 12), a + math.pi / 2, k)
    levi = (6, 0, -6)
    six7 = t > D * 0.45
    k = math.sin(t * 11)
    pose = dict(armL=(80 + (k * 28 if six7 else 0), 18), armR=(80 - (k * 28 if six7 else 0), 18), bob=abs(k) * 0.15 if six7 else 0)
    bx += character(levi, 0, npal("Levi"), SMIRK if six7 else NEUTRAL, pose, flag=False, item=None if six7 else "letter")
    a = t * 0.35
    cam = ((6 + math.sin(a) * 5, 27, 22), (6, 1.0, -7), 52)
    def post(img, VP):
        for p_, n in tags: name_tag(img, VP, p_, n, scale=0.8)
        name_tag(img, VP, head_pos(levi, bob=pose["bob"]), "Levi", col=(255, 215, 60), scale=1.4)
        if six7:
            ph = int((t - D * 0.45) * 11 / math.pi) % 2
            nm.pop_text(img, W * 0.25, 1230 if ph == 0 else 1290, "6", 1, size=170, fill=(255, 215, 60) if ph == 0 else (255, 255, 255))
            nm.pop_text(img, W * 0.75, 1290 if ph == 0 else 1230, "7", 1, size=170, fill=(255, 255, 255) if ph == 0 else (255, 215, 60))
        if t > D * 0.75:
            nm.pop_text(img, W/2, 470, "VOCÊ ABRIRIA?", t - D * 0.75, size=100, fill=(255, 215, 60))
    return dict(boxes=bx, cam=cam, light=DAY, post=post)

SCENE_FUN = {f.__name__[3:]: f for f in [sc_hook, sc_isabella, sc_always, sc_blank, sc_anyone, sc_suspect, sc_quit,
                                          sc_alone, sc_glow, sc_twist, sc_meaning, sc_sorry, sc_lesson, sc_levi]}

# ----------------------------------------------------------------------------
# ÁUDIO
# ----------------------------------------------------------------------------
def sfx_paper(vol=0.18, seed=0):
    n = int(0.35 * SR); t = np.arange(n) / SR
    r = np.random.default_rng(seed).standard_normal(n).astype(np.float32)
    r = r - sp.lfilter1(r, 0.3)
    return r * np.exp(-t * 12) * vol

def render_segment(args):
    return nm.render_segment(args)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice-dir", required=True)
    ap.add_argument("--speed", type=float, default=1.05)
    ap.add_argument("--out", default="out"); ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--preview", type=float, nargs="*")
    a = ap.parse_args()
    # injeta este roteiro no pipeline do vídeo do número
    nm.SCENES = SCENES; nm.SCENE_FUN = SCENE_FUN; nm.header = header
    sp.HIGHLIGHT = HL
    os.makedirs(a.out, exist_ok=True); tmp = os.path.join(a.out, "_tmp"); os.makedirs(tmp, exist_ok=True)
    print("» narração...")
    kok = nm.PiperVoice(a.voice_dir)
    tl, total = nm.build(kok, os.path.basename(a.voice_dir.rstrip("/")), a.speed, tmp)
    print(f"  duração: {total:.1f}s")
    for s in tl: print(f"  {s['start']:6.1f} {s['dur']:5.1f}  {s['id']}")
    if a.preview is not None:
        for s in a.preview:
            Image.frombytes("RGB", (W, H), nm.frame(int(s * FPS), tl, total)).save(os.path.join(a.out, f"preview_{s:05.1f}.png"))
        return
    print("» áudio...")
    n = int(total * SR) + SR
    music = np.zeros(n, np.float32); vo = np.zeros(n, np.float32); fx = np.zeros(n, np.float32)
    groups = []
    for s in tl:
        if groups and groups[-1][0] == s["mood"]: groups[-1][2] = s["start"] + s["dur"]
        else: groups.append([s["mood"], s["start"], s["start"] + s["dur"]])
    for gi, (mood, s0, e0) in enumerate(groups):
        xf = 0.6
        m = sp.music_for(mood, e0 - s0 + xf, gi)
        env = np.ones(len(m), np.float32); k = int(xf * SR)
        if gi > 0: env[:k] = np.linspace(0, 1, k)
        env[-k:] = np.linspace(1, 0, k)
        sp.add(music, m * env, max(0, s0 - xf / 2))
    for s in tl: sp.add(vo, s["vo"], s["vo_at"])
    S = {s["id"]: s for s in tl}
    def at(sid, f=0.0, off=0.0): return S[sid]["start"] + S[sid]["dur"] * f + off
    for s in tl: sp.add(fx, sp.sfx_whoosh(0.45, 0.16, int(s["start"] * 10)), max(0, s["start"] - 0.2))
    for i in range(7): sp.add(fx, sfx_paper(0.16, i), at("hook", 0, 1.2 + i * 0.35))
    sp.add(fx, sfx_paper(0.2, 20), at("isabella", 0, 0.4)); sp.add(fx, sp.sfx_fail(0.18), at("isabella", 0.5))
    sp.add(fx, sfx_paper(0.2, 21), at("always", 0)); sp.add(fx, sfx_paper(0.2, 22), at("always", 0.45))
    sp.add(fx, sp.sfx_ding(0.16, 79), at("always", 0.75))
    sp.add(fx, sfx_paper(0.22, 23), at("blank", 0.35)); sp.add(fx, sp.sfx_fail(0.22), at("blank", 0.7))
    for i in range(3): sp.add(fx, sp.sfx_boom(0.25, 30 + i), at("suspect", i / 3))
    sp.add(fx, sp.sfx_sparkle(0.12), at("glow", 0.4))
    sp.add(fx, sp.sfx_boom(0.8, 7), at("twist", 0, 1.5))
    sp.add(fx, sp.sfx_ding(0.22, 84), at("sorry", 0.62)); sp.add(fx, sp.sfx_sparkle(0.12), at("sorry", 0.62))
    sp.add(fx, sp.sfx_applause(3.0, 0.25), at("sorry", 0.65))
    sp.add(fx, sp.sfx_ding(0.12, 81), at("lesson", 0, 0.2)); sp.add(fx, sp.sfx_ding(0.16, 86), at("lesson", 0.55))
    sp.add(fx, sp.sfx_ding(0.2, 88), at("levi", 0.45))
    env = np.convolve(np.abs(vo), np.ones(4410) / 4410, "same")
    env = np.clip(env / (env.max() + 1e-6) * 4, 0, 1); env = sp.lfilter1(env, 0.9995)
    mix = music * (1 - 0.45 * env) * 1.1 + vo + fx * 0.9
    end = int(total * SR); mix = mix[:end]
    fade = int(0.8 * SR); mix[-fade:] *= np.linspace(1, 0, fade)
    mix = mix / (np.abs(mix).max() + 1e-6) * 0.95
    wav = os.path.join(tmp, "mix.wav"); sp.write_wav(wav, mix)
    print("» renderizando 3D...")
    nf = int(total * FPS); k = a.workers
    jobs = [(i, i * nf // k, (i + 1) * nf // k, tl, total, os.path.join(tmp, f"seg_{i}.mp4")) for i in range(k)]
    with Pool(k) as p: segs = p.map(render_segment, jobs)
    lst = os.path.join(tmp, "segs.txt")
    with open(lst, "w") as f:
        for s in segs: f.write(f"file '{os.path.abspath(s)}'\n")
    final = os.path.join(a.out, "a_carta_da_traicao.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-i", wav, "-c:v", "copy",
                    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "44100", "-c:a", "aac", "-b:a", "192k", "-shortest",
                    "-movflags", "+faststart", final], check=True)
    with open(os.path.join(a.out, "legendas.srt"), "w") as f:
        fmt = lambda x: f"{int(x//3600):02d}:{int(x%3600//60):02d}:{int(x%60):02d},{int(x*1000%1000):03d}"
        for i, s in enumerate(tl):
            f.write(f"{i+1}\n{fmt(s['vo_at'])} --> {fmt(s['start'] + s['vend'] + 0.3)}\n{s.get('cap', s['text'])}\n\n")
    print("✔", final)

if __name__ == "__main__":
    main()

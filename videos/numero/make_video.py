#!/usr/bin/env python3
"""
"Nesse mundo, todo mundo tem um número em cima da cabeça" — vídeo viral vertical em 3D
(personagens em blocos) com lição de vida. Renderização 3D própria (engine3d.py, OpenGL),
narração Piper/faber (pt-BR, via sherpa-onnx), trilha e efeitos sintetizados.

Uso:
    python3 make_video.py --voice-dir vits-piper-pt_BR-faber-medium --out out/
"""
import argparse, hashlib, math, os, random, subprocess, sys
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(1, os.path.join(HERE, "..", "superpoder"))
import importlib.util
_spec = importlib.util.spec_from_file_location("sp", os.path.join(HERE, "..", "superpoder", "make_video.py"))
sp = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(sp)

from engine3d import Renderer, T, Ry, SMILE, SAD, SHOCK, LAUGH, NEUTRAL, HAPPY, CRY, SMIRK, box, EMISSIVE  # noqa
from world import (character, walk_pose, head_pos, school, crowd_pal, stair_height, THEO, LUCAS, BIA,
                   LIGHT_DAY, LIGHT_SUNSET, LIGHT_GLOOM)

W, H, FPS, SR = 1080, 1920, 30, sp.SR
font = sp.font
D2R = math.radians

# ----------------------------------------------------------------------------
# ROTEIRO
# ----------------------------------------------------------------------------
SCENES = [
    dict(id="hook", mood="mystery", pad=0.5,
         text="Nesse mundo, todo mundo tem um número em cima da cabeça. Ele mostra quantas pessoas gostam de você de verdade."),
    dict(id="lucas", mood="hope", pad=0.4,
         text="O Lucas, o garoto mais popular da escola, tinha novecentos e noventa e nove.",
         cap="O Lucas, o garoto mais popular da escola, tinha 999."),
    dict(id="me", mood="sad", pad=1.5, text="E eu, o João? Eu tinha... um.", cap="E eu, o João? Eu tinha... 1."),
    dict(id="copy", mood="hope", pad=0.4,
         text="Eu queria ser igual a ele. Copiei as roupas, o jeito de andar, até as piadas."),
    dict(id="money", mood="hope", pad=0.5,
         text="Gastei todo o meu dinheiro com coisas caras, só pra impressionar. Mas o número não mudava."),
    dict(id="bia", mood="sad", pad=0.6,
         text="E tinha uma pessoa que eu nem notava: a Bia, que passava o intervalo sozinha."),
    dict(id="fall", mood="storm", pad=0.6,
         text="Um dia, o Lucas tropeçou na escada, na frente de todo mundo."),
    dict(id="film", mood="storm", pad=0.8,
         text="E ninguém ajudou. A Isabella, o Mateus, a Rayane... todo mundo filmou. Todo mundo riu. E o número dele começou a cair."),
    dict(id="help", mood="emotional", pad=1.2,
         text="Eu fui o único que parei. Estendi a mão, e ajudei ele a levantar."),
    dict(id="numbers", mood="triumph", pad=0.6,
         text="Naquele momento, o meu número subiu pra dois. E o dele, pela primeira vez, mostrava um número de verdade: um.",
         cap="Naquele momento, o meu número subiu pra 2. E o dele, pela primeira vez, mostrava um número de verdade: 1."),
    dict(id="reveal", mood="emotional", pad=0.6,
         text="Foi aí que eu entendi quem era o meu primeiro um. A Bia. Ela sempre esteve lá. Eu é que nunca olhei.",
         cap="Foi aí que eu entendi quem era o meu primeiro 1. A Bia. Ela sempre esteve lá. Eu é que nunca olhei."),
    dict(id="sunset", mood="emotional", pad=0.6,
         text="Hoje, eu, a Bia e o Lucas passamos o intervalo juntos. Meu número é pequeno. Mas cada pessoa nele é de verdade."),
    dict(id="lesson", mood="emotional", pad=1.6,
         text="Não importa quantas pessoas te seguem. Importa quantas ficam quando você cai. Seja o um de alguém.",
         cap="Não importa quantas pessoas te seguem. Importa quantas ficam quando você cai. Seja o 1 de alguém."),
    dict(id="cta", mood="outro", pad=1.6,
         text="Marca aqui aquele amigo que é o seu um.", cap="Marca aqui aquele amigo que é o seu 1."),
]

sp.HIGHLIGHT = {"número", "999.", "1.", "2.", "um.", "lucas,", "lucas", "bia,", "bia.", "ninguém", "filmou.", "riu.",
                "cair.", "único", "dinheiro", "verdade.", "verdade:", "sozinha.", "escada,", "mão,", "lá.", "1", "olhei.",
                "popular", "impressionar.", "joão?", "isabella,", "mateus,", "rayane...", "bia"}

# ----------------------------------------------------------------------------
# OVERLAYS 2D
# ----------------------------------------------------------------------------
def project(VP, p):
    c = VP @ np.array([p[0], p[1], p[2], 1.0], np.float32)
    if c[3] <= 0.05: return None
    n = c[:3] / c[3]
    return ((n[0] + 1) / 2 * W, (1 - n[1]) / 2 * H, c[3])

BADGE = {"gold": ((255, 205, 60), (90, 60, 0)), "gray": ((210, 210, 215), (40, 40, 48)),
         "red": ((235, 60, 60), (255, 255, 255)), "green": ((80, 220, 110), (10, 60, 20)),
         "white": ((255, 255, 255), (30, 30, 36))}

def badge(img, VP, pos, txt, style="white", scale=1.0, pop=1.0, shake=0.0, t=0.0, name=None):
    pr = project(VP, pos)
    if not pr: return
    x, y, w = pr
    s = max(26, min(170, 1500 / w)) * scale * (1 + 0.35 * (1 - min(1, pop)))
    if shake: x += math.sin(t * 60) * shake
    d = ImageDraw.Draw(img)
    f = font(s)
    tw = d.textlength(txt, font=f)
    bg, fg = BADGE[style]
    pad = s * 0.28
    box_ = [x - tw/2 - pad, y - s * 0.62 - pad * 0.5, x + tw/2 + pad, y + s * 0.62 + pad * 0.3]
    if style == "gold":
        sp.glow(img, x, y, s * 1.6, (255, 210, 80), 0.6); d = ImageDraw.Draw(img)
    d.rounded_rectangle(box_, radius=s * 0.3, fill=bg, outline=(20, 20, 26), width=max(3, int(s / 14)))
    d.text((x - tw/2, y - s * 0.58), txt, font=f, fill=fg)
    if name:
        fn_ = font(max(22, s * 0.42))
        nw = d.textlength(name.upper(), font=fn_)
        d.text((x - nw/2, box_[1] - s * 0.5), name.upper(), font=fn_, fill=(255, 255, 255),
               stroke_width=max(3, int(s / 16)), stroke_fill=(15, 15, 20))

def pop_text(img, x, y, txt, t, size=100, fill=(255, 255, 255)):
    sp.pop_text(img, x, y, txt, t, size=size, fill=fill)

def header(img, t, total):
    d = ImageDraw.Draw(img)
    f = font(46)
    y = 116
    for l in ["NESSE MUNDO, TODO MUNDO TEM UM", "NÚMERO EM CIMA DA CABEÇA"]:
        tw = d.textlength(l, font=f)
        d.rounded_rectangle([W/2 - tw/2 - 20, y - 8, W/2 + tw/2 + 20, y + 58], radius=12, fill=(255, 255, 255))
        d.text((W/2 - tw/2, y), l, font=f, fill=(15, 15, 20))
        y += 70
    d.rectangle([0, H - 14, W, H], fill=(40, 40, 50))
    d.rectangle([0, H - 14, W * t / total, H], fill=(255, 60, 80))

# ----------------------------------------------------------------------------
# CENAS  ->  dict(boxes, cam=(eye,target,fov), light, post=fn(img, VP))
# ----------------------------------------------------------------------------
def ease(x): x = max(0.0, min(1.0, x)); return x * x * (3 - 2 * x)
def eout(x): x = max(0.0, min(1.0, x)); return 1 - (1 - x) ** 3
def lerp(a, b, t): return a + (b - a) * t
def lerpv(a, b, t): return tuple(lerp(x, y, t) for x, y in zip(a, b))

NAMES = ["Isabella", "Ivna", "Rayane", "Jesus", "Mateus", "Adrielly", "Levi"]
GIRLS = {"Isabella", "Ivna", "Rayane", "Adrielly"}
_NP = {}
def npal(name):
    if name not in _NP:
        pal = dict(crowd_pal(NAMES.index(name) * 7 + 3))
        if name in GIRLS: pal["style"] = "long"
        elif pal["style"] == "long": pal["style"] = "short"
        if name == "Jesus": pal.update(hair=(40, 28, 22), style="short")
        _NP[name] = pal
    return _NP[name]

WALK_NAMES = ["Jesus", "Ivna", "Mateus", "Adrielly", "Levi", "Rayane", "Isabella"]
RING_NAMES = ["Isabella", "Mateus", "Rayane", "Jesus", "Ivna", "Levi", "Adrielly", None]
FILM_NAMES = ["Isabella", "Mateus", "Rayane", "Ivna", "Adrielly", "Levi"]
FALL_NAMES = ["Jesus", "Levi", "Ivna", "Mateus", "Adrielly"]

WORLD = {}
def world(sunset=0.0):
    k = round(sunset, 2)
    if k not in WORLD: WORLD[k] = school(k)
    return list(WORLD[k])

WALKERS = [(-20, 6, 1, "12"), (18, 2, -1, "48"), (-16, -2, 1, "7"), (22, 10, -1, "23"), (-24, 12, 1, "3"), (14, -9, -1, "31"), (-10, 15, 1, "64")]

def sc_hook(t, D):
    bx = world()
    labels = []
    for i, (x0, z, dr, n) in enumerate(WALKERS):
        x = x0 + dr * t * 3.2
        pos = (x, 0, z); yaw = D2R(90 * dr)
        bx += character(pos, yaw, npal(WALK_NAMES[i]), SMILE if i % 2 else HAPPY, walk_pose(t + i))
        labels.append((head_pos(pos), n, WALK_NAMES[i]))
    k = ease(t / D)
    cam = (lerpv((4, 18, 38), (6, 12, 26), k), (2, 3, 2), 52)
    def post(img, VP):
        for p, n, nm in labels: badge(img, VP, p, n, "white", pop=(t * 3), name=nm)
    return dict(boxes=bx, cam=cam, light=LIGHT_DAY, post=post)

CROWD_RING = [(-4, -1), (4, -1), (-4, 1.8), (4, 1.8), (-6, -4), (6, -4), (-2.2, -3.5), (2.2, -3.5)]

def lucas_crowd(t, bx, labels, cheer=True, phones=()):
    for i, (dx, dz) in enumerate(CROWD_RING):
        pos = (dx, 0, -4 + dz)
        yaw = math.atan2(0 - pos[0], -4 - pos[2])
        j = abs(math.sin(t * 7 + i)) * 0.4 if cheer else 0
        ph = i in phones
        pose = dict(armL=(0, 160 if cheer else 5), armR=((80, 0) if ph else (0, 150 if cheer else 5)), bob=j)
        nm = RING_NAMES[i]
        bx += character(pos, yaw, npal(nm) if nm else crowd_pal(i + 10), LAUGH if cheer else SHOCK, pose, item="phone" if ph else None)
        labels.append((head_pos(pos, bob=j), str(5 + (i * 13) % 40), nm))

def sc_lucas(t, D):
    bx = world(); labels = []
    bx += character((0, 0, -4), 0, LUCAS, SMIRK, dict(armL=(0, 150 + math.sin(t * 5) * 15), armR=(30, 10)))
    lucas_crowd(t, bx, labels, True, phones=(2, 5))
    k = ease(t / D)
    cam = (lerpv((0, 8, 20), (0, 6.5, 9), k), (0, 5.0, -4), 50)
    def post(img, VP):
        for p, n, nm in labels: badge(img, VP, p, n, "white", scale=0.8, name=nm)
        badge(img, VP, head_pos((0, 0, -4)), "999", "gold", scale=1.5, pop=t * 3, name="Lucas")
        if t > 0.6: pop_text(img, W/2, 420, "O MAIS POPULAR", t - 0.6, size=86, fill=(255, 215, 60))
    return dict(boxes=bx, cam=cam, light=LIGHT_DAY, post=post)

HERO_SPOT = (12, 0, 9)

def sc_me(t, D):
    bx = world(); labels = []
    bx += character((0, 0, -4), 0, LUCAS, SMIRK, dict(armL=(0, 150)))
    lucas_crowd(t, bx, labels, True)
    bx += character(HERO_SPOT, D2R(-60), THEO, SAD if t > D * 0.4 else NEUTRAL, dict(armL=(5, 3), armR=(5, 3)))
    a = D2R(-40) + t * 0.25
    k = ease((t - D * 0.35) / (D * 0.6))
    r = lerp(11, 5.5, k)
    eye = (HERO_SPOT[0] + math.sin(a) * r, lerp(6, 6.2, k), HERO_SPOT[2] + math.cos(a) * r)
    cam = (eye, (HERO_SPOT[0], lerp(3.5, 5.6, k), HERO_SPOT[2]), 50)
    def post(img, VP):
        badge(img, VP, head_pos(HERO_SPOT), "1", "gray", scale=1.3, pop=(t - D * 0.4) * 3 if t > D * 0.4 else 1, name="João")
        badge(img, VP, head_pos((0, 0, -4)), "999", "gold", scale=1.0, name="Lucas")
    return dict(boxes=bx, cam=cam, light=LIGHT_DAY, post=post)

THEO_COPY = dict(THEO, shirt=(245, 245, 245), pants=(30, 30, 34), cap=(220, 40, 50), glasses=True, chain=True)

def sc_copy(t, D):
    bx = world()
    sw = t > D * 0.28
    pal = THEO_COPY if sw else THEO
    pos = (0, 0, 2)
    if sw:
        pose = dict(armL=(0, 150 + math.sin(t * 5) * 15), armR=(30, 10))
        if t > D * 0.6: pose = walk_pose(t, 9, 35); pose["armL"] = (0, 150)
        x = 0 if t < D * 0.6 else (t - D * 0.6) * 2.4
        pos = (x, 0, 2)
        bx += character(pos, D2R(25 if t > D * 0.6 else 0), pal, SMIRK, pose)
    else:
        bx += character(pos, 0, pal, NEUTRAL)
    for i, (x0, z, dr, n) in enumerate(WALKERS[:4]):
        p2 = (x0 + dr * t * 3, 0, z - 8); bx += character(p2, D2R(90 * dr), npal(WALK_NAMES[i]), SMILE, walk_pose(t + i))
    cam = ((2, 5.5, 13), (pos[0] * 0.6, 4, 2), 48)
    def post(img, VP):
        badge(img, VP, head_pos(pos), "1", "gray", scale=1.2, shake=6 if sw else 0, t=t, name="João")
        fl = max(0, 1 - abs(t - D * 0.28) / 0.15)
        if fl > 0:
            ov = Image.new("RGB", img.size, (255, 255, 255)); img.paste(Image.blend(img, ov, fl * 0.85))
        if t > D * 0.4: pop_text(img, W * 0.78, 760, "???", t - D * 0.4, size=150)
    return dict(boxes=bx, cam=cam, light=LIGHT_DAY, post=post)

def sc_money(t, D):
    bx = world()
    pos = (0, 0, 2)
    bx += character(pos, 0, THEO_COPY, SMIRK if t < D * 0.6 else SAD, dict(armR=(110, 20), armL=(0, 120 if t < D * 0.6 else 5)))
    # moedas
    r = random.Random(3)
    for i in range(36):
        t0 = i * 0.11
        tt = t - t0
        if tt < 0 or tt > 2.2 or t > D * 0.65: continue
        vx = r.uniform(-4, 4); vz = r.uniform(-1, 5); vy = r.uniform(7, 11)
        p = (pos[0] - 1.5 + vx * tt, 5 + vy * tt - 9.8 * tt * tt, pos[2] + 1 + vz * tt)
        if p[1] < 0.1: p = (p[0], 0.1, p[2])
        m = T(*p) @ Ry(tt * 8) @ T(0, 0, 0)
        bx.append(box(m @ sp_rx(tt * 6), (0.7, 0.7, 0.14), (255, 205, 60), EMISSIVE))
    for i, (x0, z, dr, n) in enumerate(WALKERS):
        p2 = (x0 + dr * t * 3, 0, z - 3); bx += character(p2, D2R(90 * dr), npal(WALK_NAMES[i]), NEUTRAL, walk_pose(t + i))
    k = ease(t / D)
    cam = (lerpv((-6, 6, 13), (4, 6.5, 12), k), (0, 4.5, 2), 50)
    def post(img, VP):
        badge(img, VP, head_pos(pos), "1", "gray", scale=1.2, name="João")
        if t > D * 0.65: pop_text(img, W/2, 460, "NADA MUDOU", t - D * 0.65, size=96, fill=(255, 90, 90))
    return dict(boxes=bx, cam=cam, light=LIGHT_DAY, post=post)

def sp_rx(a):
    from engine3d import Rx
    return Rx(a)

BIA_SEAT = (-5.5, 0, 10)
SIT = dict(legL=90, legR=90, bob=-0.35, armL=(40, 0), armR=(40, 0))

def sc_bia(t, D):
    bx = world()
    bx += character(BIA_SEAT, 0, BIA, SAD if t < D * 0.7 else NEUTRAL, SIT, item="book")
    hero = (-2, 0, 6)
    bx += character(hero, D2R(10), THEO, NEUTRAL, walk_pose(t) if t < 1.5 else None)
    for i in range(3):
        p2 = (-6 + i * 3, 0, -6); yaw = D2R(180)
        bx += character(p2, yaw, npal(["Rayane", "Mateus", "Jesus"][i]), LAUGH, dict(armL=(0, 30), armR=(60, 10)))
    k = ease(t / D)
    k = ease(t / (D * 0.65))
    eye = lerpv((6, 7, 18), (-3.5, 5.4, 23.5), k)
    tgt = lerpv((-2, 4, 6), (-5.5, 3.2, 10), k)
    cam = (eye, tgt, 48)
    def post(img, VP):
        badge(img, VP, head_pos(hero), "1", "gray", name="João")
        badge(img, VP, head_pos(BIA_SEAT, bob=-0.35), "1", "gray", pop=(t - D * 0.45) * 3 if t > D * 0.45 else 1, name="Bia")
        if t > D * 0.55: pop_text(img, W/2, 1330, "BIA", t - D * 0.55, size=110, fill=(255, 215, 60))
    return dict(boxes=bx, cam=cam, light=LIGHT_DAY, post=post)

LYING = (-15, 0.0, -4.6)

def lucas_fall_state(t, D):
    """posição, yaw, fall, pose, expr de Lucas na cena da queda."""
    t_trip = D * 0.42
    if t < t_trip:
        z = lerp(-13, -8.6, t / t_trip)
        y = stair_height(z)
        return (-15, y, z), 0.0, 0.0, walk_pose(t, 8, 28), SMIRK
    k = eout((t - t_trip) / 0.8)
    z = lerp(-8.6, LYING[2], k)
    y = lerp(stair_height(-8.6), 0.0, ease((t - t_trip) / 0.6))
    fall = lerp(0, -90, k)
    pose = dict(armL=(lerp(0, 170, k), 20), armR=(lerp(0, 170, k), 20), legL=lerp(0, -20, k), legR=lerp(0, 10, k))
    return (-15, y + 0.5 * k, z), 0.0, fall, pose, SHOCK if k < 1 else CRY

def sc_fall(t, D):
    bx = world()
    pos, yaw, fall, pose, ex = lucas_fall_state(t, D)
    bx += character(pos, yaw, LUCAS, ex, pose, fall=fall)
    for i, (dx, dz) in enumerate([(-4, 3), (2, 4), (5, 1), (-6, 0), (0, 7)]):
        p2 = (-9 + dx * 0.5, 0, -4 + dz * 0.5)
        yaw2 = math.atan2(-15 - p2[0], -6 - p2[2])
        bx += character(p2, yaw2, npal(FALL_NAMES[i]), SHOCK if t > D * 0.45 else SMILE, dict(armL=(0, 10), armR=(0, 10)))
    k = ease(t / D)
    cam = (lerpv((-24, 8, 9), (-23, 6, 8), k), lerpv((-15, 5, -9), (-13.5, 2.2, -1.5), k), 50)
    shake = 0.25 if D * 0.42 + 0.5 < t < D * 0.42 + 0.8 else 0
    cam = ((cam[0][0] + random.uniform(-shake, shake), cam[0][1] + random.uniform(-shake, shake), cam[0][2]), cam[1], cam[2])
    def post(img, VP):
        badge(img, VP, head_pos(pos, yaw, fall=fall) if fall > -30 else (pos[0], 1.6, pos[2] + 6.2), "999", "gold", scale=0.9, name="Lucas")
        if t > D * 0.42 + 0.5: pop_text(img, W/2, 470, "!!!", t - D * 0.42 - 0.5, size=150, fill=(255, 80, 80))
    return dict(boxes=bx, cam=cam, light=LIGHT_DAY, post=post)

LUCAS_LIE = (-15, 0.5, -4.6)
LUCAS_HEAD_LYING = (-15, 1.4, -4.6 + 6.0)
FILMERS = [(-19.5, 1.5), (-10.5, 1.0), (-20, 5.5), (-10, 5.5), (-17.5, 8.5), (-12.5, 8.8)]

def lucas_count(t, D):
    k = ease((t - D * 0.55) / (D * 0.4))
    v = int(round(999 * (1 - k) ** 2.2))
    return v

def sc_film(t, D):
    bx = world(0.0)
    bx += character(LUCAS_LIE, 0, LUCAS, CRY, dict(armL=(170, 20), armR=(170, 20), legL=-20, legR=10), fall=-90)
    leave = max(0.0, t - D * 0.82)
    for i, (x, z) in enumerate(FILMERS):
        pos = (x, 0, z)
        yaw = math.atan2(-15 - x, -2 - z)
        if leave > 0:
            yaw += math.pi; pos = (x + math.sin(yaw) * leave * 3, 0, z + math.cos(yaw) * leave * 3)
            pose = walk_pose(t + i)
        else:
            pose = dict(armR=(85, 0), armL=(20, 10), bob=abs(math.sin(t * 9 + i)) * 0.2)
        bx += character(pos, yaw, npal(FILM_NAMES[i]), LAUGH, pose, item=None if leave > 0 else "phone")
    a = D2R(25) + t * 0.12
    cam = ((-15 + math.sin(a) * 17, 17 - t * 0.2, 0.5 + math.cos(a) * 17), (-15, 1.5, 0.5), 50)
    def post(img, VP):
        v = lucas_count(t, D)
        st = "gold" if v > 600 else ("white" if v > 0 else "red")
        badge(img, VP, LUCAS_HEAD_LYING, str(v), st, scale=1.4, shake=4 if 0 < v < 999 else 0, t=t, name="Lucas")
        if leave <= 0:
            for i, (x, z) in enumerate(FILMERS):
                pr = project(VP, (x, 6.4, z))
                if pr:
                    fn_ = font(max(24, min(46, 900 / pr[2]))); dd = ImageDraw.Draw(img)
                    nm = FILM_NAMES[i].upper(); nw = dd.textlength(nm, font=fn_)
                    dd.text((pr[0] - nw/2, pr[1]), nm, font=fn_, fill=(255, 255, 255), stroke_width=4, stroke_fill=(15, 15, 20))
        d = ImageDraw.Draw(img)
        if leave <= 0:
            r = random.Random(int(t * 6))
            for i, (x, z) in enumerate(FILMERS):
                if r.random() < 0.35:
                    pr = project(VP, (x, 4.2, z))
                    if pr: sp.glow(img, pr[0], pr[1], 120, (255, 255, 255), 0.9)
        for i, (x, y, s) in enumerate([(250, 560, 0.4), (830, 650, 0.9), (330, 800, 1.5)]):
            if t > s and leave <= 0: pop_text(img, x, y + math.sin(t * 8 + i) * 8, "HAHAHA", t - s, size=70, fill=(255, 230, 90))
    return dict(boxes=bx, cam=cam, light=LIGHT_GLOOM, post=post)

def sc_help(t, D):
    bx = world()
    walk_end = D * 0.35
    hz = lerp(9, 4.2, ease(t / walk_end))
    hero = (-15, 0, hz)
    reach = t > walk_end
    bx += character(hero, D2R(180), THEO, NEUTRAL if not reach else SMILE,
                    walk_pose(t) if not reach else dict(armR=(lerp(0, 75, ease((t - walk_end) / 0.6)), 0)))
    rise = ease((t - D * 0.62) / (D * 0.3))
    lz = lerp(LUCAS_LIE[2], 1.6, rise)
    bx += character((-15, lerp(0.5, 0, rise), lz), 0, LUCAS, CRY if rise < 0.5 else SMILE,
                    dict(armL=(lerp(170, 0, rise), 20), armR=(lerp(170, 70, rise), lerp(20, 0, rise))), fall=lerp(-90, 0, rise))
    for i, (x, z) in enumerate(FILMERS[:3]):
        pos = (x - 8, 0, z - 10)
        bx += character(pos, D2R(200), npal(FILM_NAMES[i]), NEUTRAL, walk_pose(t + i))
    cam = (lerpv((0, 7, 6), (-1, 6, 5), ease(t / D)), (-15, 3.4, 2.6), 50)
    def post(img, VP):
        badge(img, VP, head_pos(hero), "1", "gray", name="João")
        lp = head_pos((-15, 0, lz)) if rise > 0.6 else LUCAS_HEAD_LYING
        badge(img, VP, lp, "0", "red", scale=1.1, name="Lucas")
    return dict(boxes=bx, cam=cam, light=LIGHT_DAY, post=post)

def sc_numbers(t, D):
    bx = world()
    hero = (-15, 0, 4.2); luc = (-15, 0, 1.6)
    bx += character(hero, D2R(180), THEO, HAPPY if t > D * 0.15 else SMILE, dict(armR=(75 if t < 1.0 else 0, 0)))
    bx += character(luc, 0, LUCAS, SMILE if t < D * 0.6 else HAPPY, dict(armR=(70 if t < 1.0 else 0, 0)))
    a = D2R(70) + t * 0.18
    cam = ((-15 + math.sin(a) * 13, 6.0, 2.9 + math.cos(a) * 13), (-15, 4.6, 2.9), 48)
    def post(img, VP):
        up1 = t > D * 0.18; up2 = t > D * 0.62
        badge(img, VP, head_pos(hero), "2" if up1 else "1", "green" if up1 else "gray", scale=1.3,
              pop=(t - D * 0.18) * 3 if up1 else 1)
        badge(img, VP, head_pos(luc), "1" if up2 else "0", "green" if up2 else "red", scale=1.3,
              pop=(t - D * 0.62) * 3 if up2 else 1)
        for (on, tt0, p) in ((up1, D * 0.18, hero), (up2, D * 0.62, luc)):
            if on and t - tt0 < 1.2:
                pr = project(VP, head_pos(p))
                if pr:
                    sp.sparkles(img, pr[0], pr[1], t, col=(255, 240, 140), n=12, rad=150)
                    pop_text(img, pr[0], pr[1] - 160, "+1", t - tt0, size=90, fill=(120, 255, 140))
    return dict(boxes=bx, cam=cam, light=LIGHT_DAY, post=post)

def sc_reveal(t, D):
    bx = world()
    hero = (-15, 0, 4.2); luc = (-15, 0, 1.6)
    look = ease((t - 0.8) / 0.8)
    bx += character(hero, D2R(lerp(180, 58, look)), THEO, SHOCK if t < D * 0.5 else HAPPY)
    bx += character(luc, 0, LUCAS, SMILE)
    bx += character(BIA_SEAT, D2R(-40), BIA, HAPPY, SIT, item="book")
    k = ease(t / (D * 0.5))
    eye = lerpv((-6, 6, 12), (-30, 9, 18), k)
    tgt = lerpv((-15, 4.5, 3), (-10, 3, 6), k)
    cam = (eye, tgt, lerp(50, 60, k))
    def post(img, VP):
        a = project(VP, head_pos(BIA_SEAT, bob=-0.35)); b = project(VP, head_pos(hero))
        badge(img, VP, head_pos(luc), "1", "green", name="Lucas")
        if a and b and t > D * 0.3:
            kk = eout((t - D * 0.3) / 1.2)
            d = ImageDraw.Draw(img)
            n = 30
            for i in range(int(n * kk)):
                u0, u1 = i / n, (i + 0.5) / n
                def P(u): return (lerp(a[0], b[0], u), lerp(a[1], b[1], u) - math.sin(u * math.pi) * 180)
                d.line([P(u0), P(u1)], fill=(255, 120, 160), width=10)
            if kk >= 1: sp.glow(img, b[0], b[1], 160, (255, 140, 180), 0.8)
        badge(img, VP, head_pos(hero), "2", "green", scale=1.1, name="João")
        badge(img, VP, head_pos(BIA_SEAT, bob=-0.35), "1", "gray", scale=1.1, name="Bia")
        if t > D * 0.55: pop_text(img, W/2, 470, "ERA ELA.", t - D * 0.55, size=110, fill=(255, 150, 190))
    return dict(boxes=bx, cam=cam, light=LIGHT_DAY, post=post)

TRIO = [(-6.2, BIA, "2"), (-4.0, THEO, "2"), (-1.8, LUCAS, "2")]
TRIO_NAMES = ["Bia", "João", "Lucas"]

def trio_boxes(t, bx, wave=False):
    for i, (x, pal, n) in enumerate(TRIO):
        pose = dict(SIT)
        if wave and i == 1: pose["armR"] = (0, 150 + math.sin(t * 8) * 20)
        bx += character((x, 0, 10), 0, pal, HAPPY if (t + i) % 4 > 0.3 else SMILE, pose,
                        head_yaw=math.sin(t * 0.8 + i) * 15)

def sc_sunset(t, D):
    bx = world(1.0)
    trio_boxes(t, bx)
    k = ease(t / D)
    cam = (lerpv((-4, 5.0, 24), (-8, 8, 33), k), (-4, 3.6, 10), 50)
    def post(img, VP):
        for (x, pal, n), nm in zip(TRIO, TRIO_NAMES): badge(img, VP, head_pos((x, 0, 10), bob=-0.35), n, "green", scale=0.95, name=nm)
    return dict(boxes=bx, cam=cam, light=LIGHT_SUNSET, post=post)

LESSON = ["Não importa quantas", "pessoas te seguem.", "Importa quantas ficam", "quando você cai.", "Seja o 1 de alguém."]

def sc_lesson(t, D, cues=None):
    bx = world(1.0)
    trio_boxes(t + 5, bx)
    cam = ((-6, 9, 36), (-4, 3.2, 10), 50)
    def post(img, VP):
        im2 = img.filter(ImageFilter.GaussianBlur(14))
        im2 = Image.blend(im2, Image.new("RGB", img.size, (20, 10, 30)), 0.55)
        img.paste(im2)
        d = ImageDraw.Draw(img)
        st = cues or [0.2, 0.2, D * 0.33, D * 0.33, D * 0.66]
        y = 640
        for i, line in enumerate(LESSON):
            tt = t - st[i]
            if tt < 0: break
            big = i == 4
            s = (110 if big else 82) * (1 + 0.25 * (1 - eout(tt / 0.25)))
            f = font(s)
            tw = d.textlength(line, font=f)
            if big:
                sp.glow(img, W/2, y + 110, 420, (255, 200, 80), 0.5); d = ImageDraw.Draw(img)
            col = (255, 215, 60) if (i in (1, 3) or big) else (255, 255, 255)
            d.text((W/2 - tw/2, y + (60 if big else 0)), line, font=f, fill=col, stroke_width=8, stroke_fill=(10, 10, 15))
            y += 110 if i in (0, 2) else 170
    return dict(boxes=bx, cam=cam, light=LIGHT_SUNSET, post=post)

def sc_cta(t, D):
    bx = world(1.0)
    for i, (x, pal, n) in enumerate(TRIO):
        bx += character((x * 1.5 + 2, 0, 14), 0, pal, HAPPY, dict(armR=(0, 150 + math.sin(t * 9 + i) * 25)))
    cam = ((-4, 5.6, 31), (-4, 4.0, 14), 50)
    def post(img, VP):
        for (x, pal, n), nm in zip(TRIO, TRIO_NAMES): badge(img, VP, head_pos((x * 1.5 + 2, 0, 14)), n, "green", name=nm)
        if t > 0.4:
            pop_text(img, W/2, 470, "MARCA O SEU 1", t - 0.4, size=110, fill=(255, 215, 60))
            d = ImageDraw.Draw(img)
            ax, ay = W/2, 1350 + math.sin(t * 8) * 20
            d.polygon([(ax - 50, ay), (ax + 50, ay), (ax + 50, ay + 60), (ax + 90, ay + 60), (ax, ay + 140), (ax - 90, ay + 60), (ax - 50, ay + 60)],
                      fill=(255, 255, 255), outline=(20, 20, 26), width=6)
    return dict(boxes=bx, cam=cam, light=LIGHT_SUNSET, post=post)

SCENE_FUN = {f.__name__[3:]: f for f in [sc_hook, sc_lucas, sc_me, sc_copy, sc_money, sc_bia, sc_fall, sc_film, sc_help,
                                          sc_numbers, sc_reveal, sc_sunset, sc_lesson, sc_cta]}

# ----------------------------------------------------------------------------
# NARRAÇÃO / LINHA DO TEMPO
# ----------------------------------------------------------------------------
class PiperVoice:
    """Voz neural Piper pt-BR (faber), usando o pacote piper-tts."""
    def __init__(self, voice_dir):
        import glob, tempfile
        self.model = glob.glob(os.path.join(voice_dir, "*.onnx"))[0]
        self.tmp = tempfile.mkdtemp()
    def create(self, text, voice=None, speed=1.0, lang=None):
        out = os.path.join(self.tmp, "o.wav")
        subprocess.run([sys.executable, "-m", "piper", "-m", self.model, "-f", out, "--length-scale", str(1 / speed),
                        "--noise-scale", "0.6", "--noise-w-scale", "0.75", "--sentence-silence", "0.22"],
                       input=text.encode(), check=True, stderr=subprocess.DEVNULL)
        import wave
        with wave.open(out) as w:
            sr = w.getframerate(); a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
        return a, sr

def tts(kok, text, voice, speed):
    s, sr = kok.create(text, voice=voice, speed=speed, lang="pt-br")
    s = np.asarray(s, np.float32)
    x_old = np.arange(len(s)) / sr; x_new = np.arange(int(len(s) * SR / sr)) / SR
    a = np.interp(x_new, x_old, s).astype(np.float32)
    return a / (np.abs(a).max() + 1e-6) * 0.92

def build(kok, voice, speed, cache):
    t = 0.0; tl = []
    for sc in SCENES:
        key = hashlib.md5(f"{voice}|{speed}|{sc['text']}".encode()).hexdigest()[:12]
        cp = os.path.join(cache, f"vo_{key}.npy")
        if os.path.exists(cp): a = np.load(cp)
        else:
            a = tts(kok, sc["text"], voice, speed); np.save(cp, a)
        v0, v1 = sp.voiced_bounds(a, 0.015)
        lead = 0.15
        dur = lead + len(a) / SR + sc["pad"]
        cap = sc.get("cap", sc["text"])
        chunks = sp.chunk_words(cap)
        wts = [len(" ".join(c)) + 2 + (6 if c[-1][-1] in ".?!" else 3 if c[-1][-1] in ",:" else 0) for c in chunks]
        tot = sum(wts); acc = 0; cues = []
        for c, w in zip(chunks, wts):
            cues.append((lead + v0 + (v1 - v0) * acc / tot, c)); acc += w
        tl.append(dict(sc, start=t, dur=dur, vo=a, vo_at=t + lead, cues=cues, vend=lead + v1))
        t += dur
    for s in tl:
        if s["id"] == "lesson":
            st = [c[0] for c in s["cues"]]
            txt = [" ".join(c[1]) for c in s["cues"]]
            def find(word):
                for a, b in zip(st, txt):
                    if b.lower().startswith(word): return a
                return None
            m = [find("não"), find("não"), find("importa quantas f") or find("importa"), None, find("seja")]
            if all(x is not None for x in (m[0], m[2], m[4])):
                m[1] = m[0]; m[3] = m[2]
                s["lcues"] = m
    return tl, t

_R = {}
def frame(fi, tl, total):
    if "r" not in _R: _R["r"] = Renderer(W, H)
    t = fi / FPS
    sc = next((s for s in tl if s["start"] <= t < s["start"] + s["dur"]), tl[-1])
    lt = t - sc["start"]
    fn = SCENE_FUN[sc["id"]]
    S = fn(lt, sc["dur"], sc.get("lcues")) if sc["id"] == "lesson" else fn(lt, sc["dur"])
    arr, VP = _R["r"].render(S["boxes"], S["cam"], S["light"], t)
    img = Image.fromarray(arr)
    S["post"](img, VP)
    # punch-in no começo de cada cena
    z = 1 + 0.06 * (1 - eout(lt / 0.3))
    if z > 1.001:
        cw, chh = W / z, H / z
        img = img.resize((W, H), Image.BILINEAR, box=((W - cw) / 2, (H - chh) / 2, (W + cw) / 2, (H + chh) / 2))
    if t < 0.3: img = sp.darken(img, 1 - t / 0.3)
    if t > total - 0.6: img = sp.darken(img, (t - (total - 0.6)) / 0.6)
    header(img, t, total)
    if sc["id"] != "lesson":
        cur = None
        for ct, words in sc["cues"]:
            if ct <= lt: cur = (ct, words)
        if cur and lt < sc["vend"] + 0.5:
            sp.draw_caption(img, cur[1], lt - cur[0])
    return img.tobytes()

def render_segment(args):
    i, f0, f1, tl, total, out = args
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                          "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", out],
                         stdin=subprocess.PIPE)
    for fi in range(f0, f1): p.stdin.write(frame(fi, tl, total))
    p.stdin.close(); p.wait()
    return out

# ----------------------------------------------------------------------------
# ÁUDIO
# ----------------------------------------------------------------------------
def sfx_shutter(vol=0.2, seed=0):
    n = int(0.12 * SR); t = np.arange(n) / SR
    r = np.random.default_rng(seed).standard_normal(n).astype(np.float32)
    r = r - sp.lfilter1(r, 0.4)
    env = np.exp(-t * 90) + 0.6 * np.exp(-np.maximum(0, t - 0.05) * 90) * (t > 0.05)
    return r * env * vol

def sfx_tick(vol=0.12, m=96):
    return sp.pluck(m, 0.08, vol, 40)

def make_laugh(kok, cache):
    cp = os.path.join(cache, "laugh_piper.npy")
    if os.path.exists(cp): return np.load(cp)
    base = tts(kok, "Rá rá rá rá rá!", None, 1.1)
    base2 = sp.pitch(tts(kok, "Ha ha ha ha!", None, 1.2), 1.35)
    o = np.zeros(int(max(len(base), len(base2)) * 1.6) + SR, np.float32)
    for src, rate, off, v in [(base, 1.0, 0.0, 0.45), (base2, 1.0, 0.2, 0.4), (base, 1.25, 0.45, 0.3), (base2, 0.88, 0.7, 0.3)]:
        s = sp.pitch(src, rate) * v; i = int(off * SR); o[i:i + len(s)] += s[:len(o) - i]
    np.save(cp, o); return o

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice-dir", required=True, help="pasta da voz Piper (ex.: vits-piper-pt_BR-faber-medium)")
    ap.add_argument("--speed", type=float, default=1.05)
    ap.add_argument("--out", default="out"); ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--preview", type=float, nargs="*")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True); tmp = os.path.join(a.out, "_tmp"); os.makedirs(tmp, exist_ok=True)
    print("» narração...")
    kok = PiperVoice(a.voice_dir)
    tl, total = build(kok, os.path.basename(a.voice_dir.rstrip("/")), a.speed, tmp)
    print(f"  duração: {total:.1f}s")
    for s in tl: print(f"  {s['start']:6.1f} {s['dur']:5.1f}  {s['id']}")
    if a.preview is not None:
        for s in a.preview:
            b = frame(int(s * FPS), tl, total)
            Image.frombytes("RGB", (W, H), b).save(os.path.join(a.out, f"preview_{s:05.1f}.png"))
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
    sp.add(fx, sp.sfx_sparkle(0.12), at("lucas", 0, 0.3))
    sp.add(fx, sp.sfx_fail(0.22), at("me", 0.4))
    sp.add(fx, sp.sfx_ding(0.2, 84), at("copy", 0.28))
    for i in range(14): sp.add(fx, sp.sfx_ding(0.06, 88 + (i % 3) * 3), at("money", 0, i * 0.14))
    sp.add(fx, sp.sfx_fail(0.2), at("money", 0.65))
    sp.add(fx, sp.sfx_ding(0.14, 79), at("bia", 0.45))
    sp.add(fx, sp.sfx_boom(0.5), at("fall", 0.42, 0.5))
    laugh = make_laugh(kok, tmp)
    sp.add(fx, laugh * 0.5, at("film", 0, 0.3)); sp.add(fx, laugh * 0.35, at("film", 0, 1.8))
    r = random.Random(1)
    for i in range(16): sp.add(fx, sfx_shutter(0.22, i), at("film", 0, 0.2 + r.random() * S["film"]["dur"] * 0.75))
    for i in range(30):
        tt = at("film", 0.55) + i * S["film"]["dur"] * 0.4 / 30
        sp.add(fx, sfx_tick(0.08, 90 - i % 12), tt)
    sp.add(fx, sp.sfx_ding(0.22, 84), at("numbers", 0.18)); sp.add(fx, sp.sfx_sparkle(0.12), at("numbers", 0.18))
    sp.add(fx, sp.sfx_ding(0.22, 88), at("numbers", 0.62)); sp.add(fx, sp.sfx_sparkle(0.12), at("numbers", 0.62))
    sp.add(fx, sp.sfx_sparkle(0.12), at("reveal", 0.3))
    if S["lesson"].get("lcues"):
        for c in sorted(set(S["lesson"]["lcues"])): sp.add(fx, sp.sfx_ding(0.12, 81), S["lesson"]["start"] + c)
    sp.add(fx, sp.sfx_ding(0.18, 88), at("cta", 0, 0.4))
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
    final = os.path.join(a.out, "o_numero_em_cima_da_cabeca.mp4")
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

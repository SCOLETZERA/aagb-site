"""Personagens em blocos (3D) e o cenário da escola."""
import math, random
import numpy as np
from engine3d import (T, Ry, Rx, Rz, box, PLAIN, HEAD, STUDS, WINDOWS, EMISSIVE, WOOD, LEAVES, SCREEN,
                      SMILE, SAD, SHOCK, LAUGH, NEUTRAL, HAPPY, CRY, SMIRK)

D = math.radians

# ------------------------------------------------------------------ paletas
THEO = dict(skin=(246, 204, 160), shirt=(38, 150, 168), pants=(44, 56, 96), hair=(92, 58, 34), style="short")
LUCAS = dict(skin=(214, 160, 120), shirt=(245, 245, 245), pants=(30, 30, 34), hair=(30, 22, 20), style="short",
             cap=(220, 40, 50), glasses=True, chain=True)
BIA = dict(skin=(160, 108, 78), shirt=(252, 200, 60), pants=(120, 70, 150), hair=(36, 24, 20), style="long")

def crowd_pal(i):
    r = random.Random(i * 31 + 7)
    return dict(skin=r.choice([(246, 204, 160), (214, 160, 120), (160, 108, 78), (120, 80, 56), (250, 220, 196)]),
                shirt=r.choice([(220, 80, 80), (90, 120, 220), (120, 200, 120), (200, 120, 220), (250, 160, 60), (70, 70, 80), (240, 240, 240)]),
                pants=r.choice([(40, 40, 50), (50, 70, 120), (90, 70, 50), (60, 60, 60)]),
                hair=r.choice([(30, 22, 20), (92, 58, 34), (200, 160, 80), (140, 60, 30)]),
                style=r.choice(["short", "short", "long", "spiky"]))

# ------------------------------------------------------------------ personagem
def character(pos, yaw=0.0, pal=THEO, expr=SMILE, pose=None, scale=1.0, fall=0.0, item=None, head_yaw=0.0):
    """
    pos: (x,y,z) dos pés. yaw: direção (0 = olhando para +z).
    pose: dict com armL/armR = (frente_graus, lado_graus), legL/legR = graus, lean, bob.
    fall: inclinação do corpo inteiro (graus, + = para trás).
    item: 'phone' | 'book' | None (na mão direita).
    """
    p = dict(armL=(0, 0), armR=(0, 0), legL=0, legR=0, lean=0, bob=0)
    if pose: p.update(pose)
    root = T(*pos) @ Ry(yaw) @ T(0, p["bob"], 0) @ Rx(D(-fall)) @ S1(scale)
    out = []
    sk, sh, pa, ha = pal["skin"], pal["shirt"], pal["pants"], pal["hair"]
    # pernas
    for side, key in ((1, "legL"), (-1, "legR")):
        m = root @ T(side * 0.5, 2.0, 0) @ Rx(D(-p[key]))
        out.append(box(m @ T(0, -1.0, 0), (0.98, 2.0, 0.98), pa))
        out.append(box(m @ T(0, -1.85, 0.06), (1.0, 0.3, 1.1), (40, 40, 44)))  # tênis
    body = root @ T(0, 2.0, 0) @ Rx(D(p["lean"]))
    out.append(box(body @ T(0, 1.0, 0), (2.0, 2.0, 1.0), sh))
    if pal.get("chain"):
        out.append(box(body @ T(0, 1.55, 0.52), (0.9, 0.12, 0.06), (250, 200, 60), EMISSIVE))
        out.append(box(body @ T(0, 1.3, 0.53), (0.25, 0.3, 0.06), (250, 200, 60), EMISSIVE))
    # braços
    for side, key in ((1, "armL"), (-1, "armR")):
        fwd, out_a = p[key]
        m = body @ T(side * 1.5, 1.6, 0) @ Rz(D(side * out_a)) @ Rx(D(-fwd))
        out.append(box(m @ T(0, -0.6, 0), (0.98, 2.0, 0.98), sk))
        out.append(box(m @ T(0, -0.05, 0), (1.04, 0.85, 1.04), sh))  # manga
        if item and side == -1:
            if item == "phone":
                out.append(box(m @ T(0, -1.7, 0.6), (0.6, 1.0, 0.12), (25, 25, 30), SCREEN))
            elif item == "book":
                out.append(box(m @ T(0.2, -1.6, 0.6), (1.2, 0.9, 0.25), (200, 60, 60)))
    # cabeça
    hm = body @ T(0, 2.05, 0) @ Ry(D(head_yaw))
    out.append(box(hm @ T(0, 0.62, 0), (1.25, 1.22, 1.2), sk, HEAD, float(expr)))
    st = pal.get("style", "short")
    if pal.get("cap"):
        out.append(box(hm @ T(0, 1.32, 0), (1.34, 0.32, 1.3), pal["cap"]))
        out.append(box(hm @ T(0, 1.2, -0.85), (1.1, 0.12, 0.6), pal["cap"]))  # aba para trás
    elif st == "short":
        out.append(box(hm @ T(0, 1.3, -0.02), (1.33, 0.32, 1.3), ha))
        out.append(box(hm @ T(0, 0.95, -0.55), (1.33, 0.75, 0.2), ha))
        out.append(box(hm @ T(0.3, 1.12, 0.55), (0.6, 0.18, 0.2), ha))
    elif st == "long":
        out.append(box(hm @ T(0, 1.3, -0.02), (1.36, 0.34, 1.32), ha))
        out.append(box(hm @ T(0, 0.45, -0.58), (1.36, 1.9, 0.22), ha))
        for sx in (1, -1):
            out.append(box(hm @ T(sx * 0.66, 0.55, -0.1), (0.14, 1.6, 1.0), ha))
    elif st == "spiky":
        out.append(box(hm @ T(0, 1.3, 0), (1.33, 0.3, 1.3), ha))
        for k in range(3):
            out.append(box(hm @ T(-0.4 + k * 0.4, 1.52, 0) @ Rz(D(15 - k * 15)), (0.3, 0.4, 1.0), ha))
    if pal.get("glasses"):
        out.append(box(hm @ T(0, 0.72, 0.62), (1.15, 0.26, 0.06), (15, 15, 18)))
    if pal.get("glasses_round"):
        for sx in (1, -1):
            out.append(box(hm @ T(sx * 0.21, 0.72, 0.61), (0.36, 0.3, 0.04), (30, 30, 30)))
    return out

def stair_height(z):
    """altura do chão na escadaria (x≈-15) em função de z."""
    if z > -5.4: return 0.0
    if z < -11.8: return 4.0
    k = int((-5.4 - z) / 1.2)
    return min(4.0, (k + 1) * 0.8)

def S1(s):
    return np.diag([s, s, s, 1]).astype(np.float32)

def walk_pose(t, speed=8.0, amp=30):
    s = math.sin(t * speed) * amp
    return dict(legL=s, legR=-s, armL=(-s * 0.8, 4), armR=(s * 0.8, 4), bob=abs(math.cos(t * speed)) * 0.12)

def head_pos(pos, yaw=0.0, scale=1.0, fall=0.0, bob=0.0):
    """Ponto acima da cabeça (para o número flutuante)."""
    m = T(*pos) @ Ry(yaw) @ T(0, bob, 0) @ Rx(D(-fall)) @ S1(scale) @ T(0, 6.1, 0)
    return m[:3, 3]

# ------------------------------------------------------------------ cenário
def school(sunset=0.0):
    out = []
    out.append(box(T(0, -0.5, 0), (140, 1, 140), (98, 178, 82), STUDS))
    # pátio de concreto
    out.append(box(T(0, 0.02, -6), (34, 0.06, 22), (196, 196, 200), STUDS))
    # prédio da escola
    out.append(box(T(0, 7, -26), (46, 14, 10), (236, 210, 170), WINDOWS, sunset))
    out.append(box(T(0, 14.6, -26), (48, 1.2, 11), (190, 70, 60)))
    out.append(box(T(0, 3, -20.9), (6, 6, 0.4), (120, 80, 50), WOOD))
    out.append(box(T(0, 17.5, -26), (8, 5, 6), (236, 210, 170), WINDOWS, sunset))
    out.append(box(T(0, 20.3, -26), (9, 0.8, 7), (190, 70, 60)))
    # escadaria (lado esquerdo)
    for k in range(5):
        out.append(box(T(-15, (k + 1) * 0.4, -6 - k * 1.2), (8, (k + 1) * 0.8, 1.2), (170, 170, 178)))
    out.append(box(T(-15, 2.0, -13.6), (8, 4.0, 3.6), (170, 170, 178)))
    # banco
    bx_, bz_ = -4, 10
    out.append(box(T(bx_, 1.4, bz_), (7, 0.35, 2), (150, 95, 55), WOOD))
    out.append(box(T(bx_, 2.6, bz_ - 0.95), (7, 1.6, 0.3), (150, 95, 55), WOOD))
    for sx in (-3, 3):
        out.append(box(T(bx_ + sx, 0.6, bz_), (0.4, 1.2, 1.8), (70, 70, 76)))
    # árvores
    for (x, z, s) in [(22, -10, 1.0), (-28, -2, 1.2), (26, 8, 0.9), (18, -18, 1.1), (-32, -16, 1.0)]:
        out.append(box(T(x, 2.5 * s, z), (1.4 * s, 5 * s, 1.4 * s), (120, 80, 50), WOOD))
        out.append(box(T(x, 6.5 * s, z), (6 * s, 4 * s, 6 * s), (70, 150, 70), LEAVES))
        out.append(box(T(x, 9.0 * s, z), (3.8 * s, 2 * s, 3.8 * s), (84, 166, 80), LEAVES))
    # cerca
    for k in range(-30, 31, 4):
        out.append(box(T(k, 1.2, 22), (0.4, 2.4, 0.4), (240, 240, 240)))
    out.append(box(T(0, 1.8, 22), (62, 0.3, 0.2), (240, 240, 240)))
    return out

LIGHT_DAY = dict(sun_dir=(-0.45, -0.8, -0.35), sun_col=(255, 244, 225), sky_top=(80, 150, 245), sky_bot=(190, 226, 255),
                 amb=(70, 72, 84), fog=0.006)
LIGHT_SUNSET = dict(sun_dir=(0.6, -0.32, -0.6), sun_col=(255, 180, 110), sky_top=(110, 80, 170), sky_bot=(255, 170, 120),
                    amb=(70, 55, 80), fog=0.008)
LIGHT_GLOOM = dict(sun_dir=(-0.3, -0.85, -0.4), sun_col=(170, 175, 195), sky_top=(90, 100, 130), sky_bot=(150, 155, 175),
                   amb=(60, 62, 75), fog=0.01)

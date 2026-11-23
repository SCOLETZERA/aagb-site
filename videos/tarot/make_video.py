#!/usr/bin/env python3
"""
A História do Tarô — das cartas Visconti-Sforza até hoje.
Vídeo vertical (1080x1920) em animação ilustrada 2D, narração suave (Kokoro TTS, voz pt-BR
feminina), trilha renascentista e efeitos sintetizados. Tudo gerado por código.

Uso:
    python3 make_video.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin --out out/
"""
import argparse, math, os, random, subprocess, sys
from functools import lru_cache
from multiprocessing import Pool

import numpy as np
import skia

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "superpoder"))
from make_video import (SR, add, lfilter1, pad_chord, pluck, write_wav, sfx_whoosh, sfx_sparkle,  # noqa: E402
                        sfx_ding, env_adsr, midi)

W, H = 1080, 1920
FPS = 30
XF = 0.6  # crossfade entre cenas (s)

# ----------------------------------------------------------------------------
# ROTEIRO   (say = o que a voz lê, com grafia fonética; cap = legenda na tela)
# ----------------------------------------------------------------------------
SCENES = [
    dict(id="intro", pad=0.6,
         cap="Hoje, o tarô é famoso por \"ler o futuro\". Mas ele nasceu como outra coisa: um jogo de cartas de luxo da nobreza italiana.",
         say="Hoje, o tarô é famoso por ler o futuro. Mas ele nasceu como outra coisa: um jogo de cartas de luxo, da nobreza italiana."),
    dict(id="arrival", pad=0.4,
         cap="Por volta de 1370, as cartas de baralho chegaram à Europa, vindas do mundo islâmico, dos mamelucos do Egito.",
         say="Por volta de mil trezentos e setenta, as cartas de baralho chegaram à Europa, vindas do mundo islâmico, dos mamelucos do Egito."),
    dict(id="suits", pad=0.4,
         cap="Elas tinham quatro naipes: taças, moedas, espadas e tacos de polo, que na Itália viraram bastões.",
         say="Elas tinham quatro naipes: taças, moedas, espadas, e tacos de polo, que na Itália viraram bastões."),
    dict(id="milan", pad=0.4,
         cap="No século XV, em Milão, governava o duque Filippo Maria Visconti. As cortes italianas eram apaixonadas por jogos e por arte.",
         say="No século quinze, em Milão, governava o duque Filippo Maria Viscônti. As cortes italianas eram apaixonadas por jogos, e por arte."),
    dict(id="trionfi", pad=0.4,
         cap="Por volta de 1440, alguém teve uma ideia: somar ao baralho uma série de cartas ilustradas que venciam todas as outras. Os trunfos. Em italiano: trionfi.",
         say="Por volta de mil quatrocentos e quarenta, alguém teve uma ideia: somar ao baralho uma série de cartas ilustradas, que venciam todas as outras. Os trunfos. Em italiano: triônfi."),
    dict(id="wedding", pad=0.4,
         cap="Em 1441, Bianca Maria Visconti, filha do duque, casou-se com Francesco Sforza. As duas famílias se uniram.",
         say="Em mil quatrocentos e quarenta e um, Bianca Maria Viscônti, filha do duque, casou-se com Francesco Isfórtsa. As duas famílias se uniram."),
    dict(id="painting", pad=0.4,
         cap="E foi para elas que nasceram os baralhos Visconti-Sforza: pintados à mão, com folhas de ouro de verdade. A obra é atribuída ao pintor Bonifacio Bembo.",
         say="E foi para elas que nasceram os baralhos Viscônti-Isfórtsa: pintados à mão, com folhas de ouro de verdade. A obra é atribuída ao pintor Bonifácio Bembo."),
    dict(id="survivors", pad=0.5,
         cap="Do baralho mais famoso, 74 das 78 cartas sobreviveram. Elas estão divididas entre Nova York, Bérgamo e uma coleção particular. Duas nunca foram encontradas: o Diabo e a Torre.",
         say="Do baralho mais famoso, setenta e quatro das setenta e oito cartas sobreviveram. Elas estão divididas entre Nova Iórque, Bérgamo, e uma coleção particular. Duas nunca foram encontradas: o Diabo, e a Torre."),
    dict(id="game", pad=0.4,
         cap="E por mais de 300 anos, o tarô foi só isso: um jogo, o tarocchi. Um jogo de vazas, em que os trunfos derrotam as outras cartas.",
         say="E por mais de trezentos anos, o tarô foi só isso: um jogo. O tarócqui. Um jogo de vazas, em que os trunfos derrotam as outras cartas."),
    dict(id="marseille", pad=0.4,
         cap="O jogo se espalhou pela França e pela Suíça. Impresso em xilogravura, ganhou o visual que hoje chamamos de Tarô de Marselha.",
         say="O jogo se espalhou pela França e pela Suíça. Impresso em xilogravura, ganhou o visual que hoje chamamos de Tarô de Marselha."),
    dict(id="gebelin", pad=0.5,
         cap="Em 1781, o francês Antoine Court de Gébelin afirmou que o tarô era um livro secreto do Egito antigo. Não havia prova nenhuma. Mas a ideia pegou.",
         say="Em mil setecentos e oitenta e um, o francês Antoine Court de Gebelán afirmou que o tarô era um livro secreto do Egito antigo. Não havia prova nenhuma. Mas a ideia pegou."),
    dict(id="etteilla", pad=0.4,
         cap="Logo depois, o cartomante Etteilla criou o primeiro tarô feito para adivinhação. Foi aí que o jogo virou oráculo.",
         say="Logo depois, o cartomante Etêila criou o primeiro tarô feito para adivinhação. Foi aí que o jogo virou oráculo."),
    dict(id="levi", pad=0.4,
         cap="No século XIX, Éliphas Lévi ligou os 22 arcanos maiores às 22 letras do alfabeto hebraico. E a Ordem da Aurora Dourada transformou o tarô num sistema de símbolos.",
         say="No século dezenove, Elifás Levi ligou os vinte e dois arcanos maiores às vinte e duas letras do alfabeto hebraico. E a Ordem da Aurora Dourada transformou o tarô num sistema de símbolos."),
    dict(id="rws", pad=0.5,
         cap="Em 1909, a artista Pamela Colman Smith ilustrou um novo baralho com Arthur Waite. Pela primeira vez, todas as 78 cartas ganharam cenas. É o tarô mais usado do mundo. E, por décadas, quase ninguém lembrava o nome dela.",
         say="Em mil novecentos e nove, a artista Pâmela Cólman Ismíth ilustrou um novo baralho, com Árthur Uêite. Pela primeira vez, todas as setenta e oito cartas ganharam cenas. É o tarô mais usado do mundo. E, por décadas, quase ninguém lembrava o nome dela."),
    dict(id="today", pad=0.4,
         cap="Hoje, o tarô é arte, é ferramenta de reflexão, é cultura pop. E na França e na Itália, ainda é jogado como jogo de cartas.",
         say="Hoje, o tarô é arte, é ferramenta de reflexão, é cultura pop. E na França e na Itália, ainda é jogado como jogo de cartas."),
    dict(id="outro", pad=2.2,
         cap="Então, da próxima vez que você vir uma carta de tarô, lembre: tudo começou com um jogo pintado a ouro, em Milão, há quase 600 anos.",
         say="Então, da próxima vez que você vir uma carta de tarô, lembre: tudo começou com um jogo pintado a ouro, em Milão, há quase seiscentos anos."),
]

GOLD_WORDS = {"tarô", "jogo", "trunfos.", "trionfi.", "visconti-sforza:", "ouro", "visconti.", "visconti,", "sforza.",
              "diabo", "torre.", "tarocchi.", "marselha.", "egito", "oráculo.", "hebraico.", "1909,", "pamela",
              "colman", "smith", "1370,", "1440,", "1441,", "1781,", "bembo.", "600", "milão,", "luxo"}

# ----------------------------------------------------------------------------
# PALETA E PRIMITIVAS
# ----------------------------------------------------------------------------
def C(r, g, b, a=255): return skia.Color(int(r), int(g), int(b), int(max(0, min(255, a))))

NAVY = (22, 24, 52); PLUM = (58, 34, 78); GOLD = (232, 190, 92); GOLD_D = (176, 128, 48)
CREAM = (246, 234, 206); INK = (44, 30, 36); RED = (178, 52, 52); BLUE = (52, 86, 160); GREEN = (70, 130, 90)

def ease(x): x = max(0.0, min(1.0, x)); return x * x * (3 - 2 * x)
def eout(x): x = max(0.0, min(1.0, x)); return 1 - (1 - x) ** 3
def lerp(a, b, t): return a + (b - a) * t
def mix(c1, c2, t): return tuple(lerp(a, b, t) for a, b in zip(c1, c2))

def P(col, a=255, stroke=0, blur=0, cap_round=True):
    p = skia.Paint(AntiAlias=True, Color=C(*col[:3], a))
    if stroke:
        p.setStyle(skia.Paint.kStroke_Style); p.setStrokeWidth(stroke)
        if cap_round:
            p.setStrokeCap(skia.Paint.kRound_Cap); p.setStrokeJoin(skia.Paint.kRound_Join)
    if blur: p.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, blur))
    return p

@lru_cache(maxsize=32)
def tf(family, bold=True, italic=False):
    st = skia.FontStyle.BoldItalic() if bold and italic else skia.FontStyle.Bold() if bold else \
        skia.FontStyle.Italic() if italic else skia.FontStyle.Normal()
    return skia.Typeface(family, st)

def F(size, family="EB Garamond", bold=True, italic=False):
    f = skia.Font(tf(family, bold, italic), size); f.setEdging(skia.Font.Edging.kAntiAlias); return f

def text_c(c, s, x, y, font, col, a=255, shadow=True):
    w = font.measureText(s)
    if shadow:
        c.drawString(s, x - w/2 + 3, y + 4, font, P((0, 0, 0), a * 0.55, blur=5))
    c.drawString(s, x - w/2, y, font, P(col, a))
    return w

def glow(c, x, y, r, col, a=150):
    sh = skia.GradientShader.MakeRadial(skia.Point(x, y), r, [C(*col, a), C(*col, a * 0.35), C(*col, 0)], [0, 0.4, 1])
    p = skia.Paint(AntiAlias=True); p.setShader(sh)
    c.drawCircle(x, y, r, p)

def path(pts, close=True, smooth=False):
    p = skia.Path(); p.moveTo(*pts[0])
    if smooth and len(pts) > 2:
        for i in range(1, len(pts) - 1):
            mx, my = (pts[i][0] + pts[i+1][0]) / 2, (pts[i][1] + pts[i+1][1]) / 2
            p.quadTo(pts[i][0], pts[i][1], mx, my)
        p.lineTo(*pts[-1])
    else:
        for q in pts[1:]: p.lineTo(*q)
    if close: p.close()
    return p

def star_path(cx, cy, r1, r2, n=8, rot=0):
    pts = []
    for i in range(n * 2):
        a = rot + i * math.pi / n - math.pi / 2
        r = r1 if i % 2 == 0 else r2
        pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    return path(pts)

# ----------------------------------------------------------------------------
# FUNDOS
# ----------------------------------------------------------------------------
def bg_night(c, t, top=NAVY, bot=PLUM, stars=True):
    sh = skia.GradientShader.MakeLinear([skia.Point(0, 0), skia.Point(0, H)], [C(*top), C(*bot)])
    p = skia.Paint(); p.setShader(sh); c.drawRect(skia.Rect.MakeWH(W, H), p)
    if stars:
        r = random.Random(42)
        for i in range(70):
            x, y = r.random() * W, r.random() * H * 0.9
            tw = 0.5 + 0.5 * math.sin(t * (0.8 + r.random() * 2) + i)
            c.drawCircle(x, y, 1.5 + r.random() * 2.2, P((255, 245, 220), 60 + 170 * tw))

def bg_parchment(c, t, tint=(0, 0, 0)):
    sh = skia.GradientShader.MakeRadial(skia.Point(W/2, H/2), H * 0.75,
                                         [C(*mix(CREAM, tint, 0.1)), C(*mix((214, 190, 150), tint, 0.1)), C(150, 112, 78)], [0, 0.6, 1])
    p = skia.Paint(); p.setShader(sh); c.drawRect(skia.Rect.MakeWH(W, H), p)
    r = random.Random(3)
    for i in range(40):
        x, y = r.random() * W, r.random() * H
        c.drawCircle(x, y, 20 + r.random() * 80, P((120, 80, 40), 10, blur=30))

def vignette(c, a=170):
    sh = skia.GradientShader.MakeRadial(skia.Point(W/2, H/2), H * 0.72, [C(0, 0, 0, 0), C(0, 0, 0, 0), C(0, 0, 0, a)], [0, 0.55, 1])
    p = skia.Paint(); p.setShader(sh); c.drawRect(skia.Rect.MakeWH(W, H), p)

def dust(c, t, n=40, col=GOLD):
    r = random.Random(9)
    for i in range(n):
        x = (r.random() * W + math.sin(t * 0.4 + i) * 40) % W
        y = (r.random() * H - t * (15 + r.random() * 25)) % H
        a = 60 + 120 * (0.5 + 0.5 * math.sin(t * 1.5 + i * 2))
        c.drawCircle(x, y, 1.5 + r.random() * 3, P(col, a))

def candle(c, x, y, t, s=1.0):
    fl = math.sin(t * 13) * 0.08 + math.sin(t * 7.3) * 0.06
    glow(c, x, y - 70 * s, 260 * s * (1 + fl), (255, 190, 110), 110)
    c.drawRoundRect(skia.Rect.MakeXYWH(x - 26*s, y - 40*s, 52*s, 150*s), 10*s, 10*s, P((240, 228, 205)))
    c.drawRoundRect(skia.Rect.MakeXYWH(x - 26*s, y - 40*s, 18*s, 150*s), 8*s, 8*s, P((255, 250, 235), 160))
    c.drawLine(x, y - 40*s, x, y - 55*s, P(INK, 255, 4*s))
    fp = skia.Path(); fy = y - 55 * s; sway = math.sin(t * 5) * 6 * s
    fp.moveTo(x, fy); fp.cubicTo(x - 22*s, fy - 20*s, x - 8*s + sway, fy - 60*s, x + sway, fy - 85*s*(1+fl))
    fp.cubicTo(x + 8*s + sway, fy - 60*s, x + 22*s, fy - 20*s, x, fy)
    c.drawPath(fp, P((255, 170, 60)))
    c.save(); c.translate(x, fy - 25*s); c.scale(0.5, 0.6); c.translate(-x, -(fy - 25*s)); c.drawPath(fp, P((255, 240, 170))); c.restore()

# ----------------------------------------------------------------------------
# CARTAS
# ----------------------------------------------------------------------------
def motif(c, m, w, h, style, t):
    """Desenha o símbolo da carta centrado em (0,0)."""
    ink = INK if style != "visconti" else (70, 40, 30)
    lw = 5 if style == "marseille" else 3.5
    s = w / 300
    if m == "sun":
        for i in range(16):
            a = i * math.tau / 16 + t * 0.2
            c.drawLine(math.cos(a) * 60*s, math.sin(a) * 60*s, math.cos(a) * 105*s, math.sin(a) * 105*s, P((230, 140, 40), 255, 7*s))
        c.drawCircle(0, 0, 58*s, P((250, 200, 70))); c.drawCircle(0, 0, 58*s, P(ink, 255, lw*s))
        c.drawCircle(-18*s, -8*s, 5*s, P(ink)); c.drawCircle(18*s, -8*s, 5*s, P(ink))
        c.drawArc(skia.Rect.MakeXYWH(-22*s, -2*s, 44*s, 30*s), 20, 140, False, P(ink, 255, 4*s))
    elif m == "moon":
        c.drawCircle(0, 0, 80*s, P((230, 225, 245)))
        c.drawCircle(32*s, -18*s, 70*s, P((60, 70, 130) if style != "marseille" else (120, 160, 210)))
        c.drawCircle(0, 0, 80*s, P(ink, 255, lw*s))
        for i in range(6):
            a = i * 1.1
            c.drawCircle(math.cos(a) * 120*s, math.sin(a) * 120*s, 6*s, P((250, 220, 140)))
    elif m == "star":
        c.drawPath(star_path(0, -20*s, 90*s, 34*s, 8, t * 0.3), P((250, 210, 90)))
        c.drawPath(star_path(0, -20*s, 90*s, 34*s, 8, t * 0.3), P(ink, 255, lw*s))
        for i, (x, y) in enumerate([(-90, 80), (90, 80), (-70, -120), (75, -115), (0, 110)]):
            c.drawPath(star_path(x*s, y*s, 22*s, 8*s, 4), P((255, 240, 200)))
    elif m == "wheel":
        c.save(); c.rotate(t * 25)
        c.drawCircle(0, 0, 95*s, P(ink, 255, 9*s)); c.drawCircle(0, 0, 22*s, P((200, 150, 70)))
        for i in range(8):
            a = i * math.tau / 8
            c.drawLine(0, 0, math.cos(a) * 95*s, math.sin(a) * 95*s, P(ink, 255, 6*s))
        c.restore()
    elif m == "tower":
        c.drawRect(skia.Rect.MakeXYWH(-50*s, -60*s, 100*s, 200*s), P((170, 150, 130)))
        for i in range(4):
            c.drawRect(skia.Rect.MakeXYWH(-50*s + i * 28*s, -80*s, 18*s, 22*s), P((170, 150, 130)))
        c.drawRect(skia.Rect.MakeXYWH(-50*s, -60*s, 100*s, 200*s), P(ink, 255, lw*s))
        c.drawRoundRect(skia.Rect.MakeXYWH(-14*s, 70*s, 28*s, 70*s), 14*s, 14*s, P(ink))
        c.drawPath(path([(70*s, -160*s), (20*s, -80*s), (45*s, -80*s), (0, -20*s), (70*s, -110*s), (42*s, -110*s)]), P((255, 210, 60)))
    elif m == "devil":
        c.drawPath(path([(-70*s, -40*s), (-50*s, -120*s), (-30*s, -50*s)]), P((150, 40, 40)))
        c.drawPath(path([(70*s, -40*s), (50*s, -120*s), (30*s, -50*s)]), P((150, 40, 40)))
        c.drawCircle(0, 0, 70*s, P((190, 60, 50))); c.drawCircle(0, 0, 70*s, P(ink, 255, lw*s))
        c.drawCircle(-24*s, -10*s, 9*s, P((255, 220, 90))); c.drawCircle(24*s, -10*s, 9*s, P((255, 220, 90)))
        c.drawArc(skia.Rect.MakeXYWH(-30*s, 5*s, 60*s, 36*s), 10, 160, False, P(ink, 255, 5*s))
    elif m == "fool":
        c.drawCircle(0, -70*s, 34*s, P((240, 200, 160))); c.drawCircle(0, -70*s, 34*s, P(ink, 255, lw*s))
        c.drawPath(path([(-40*s, -95*s), (0, -150*s), (40*s, -95*s)]), P(RED))
        c.drawCircle(0, -152*s, 9*s, P(GOLD))
        c.drawPath(path([(-55*s, -30*s), (55*s, -30*s), (75*s, 120*s), (-75*s, 120*s)]), P((90, 140, 200)))
        c.drawPath(path([(-55*s, -30*s), (55*s, -30*s), (75*s, 120*s), (-75*s, 120*s)]), P(ink, 255, lw*s))
        c.drawLine(70*s, -40*s, 110*s, 130*s, P((140, 90, 50), 255, 8*s))
    elif m in ("cups", "coins", "swords", "batons"):
        suit_icon(c, m, 0, 0, 90*s, style)
    elif m == "king":
        c.drawCircle(0, -60*s, 38*s, P((240, 205, 165))); c.drawCircle(0, -60*s, 38*s, P(ink, 255, lw*s))
        c.drawPath(path([(-38*s, -88*s), (-38*s, -130*s), (-18*s, -105*s), (0, -138*s), (18*s, -105*s), (38*s, -130*s), (38*s, -88*s)]), P(GOLD))
        c.drawPath(path([(-70*s, -15*s), (70*s, -15*s), (90*s, 140*s), (-90*s, 140*s)]), P(RED))
        c.drawPath(path([(-70*s, -15*s), (70*s, -15*s), (90*s, 140*s), (-90*s, 140*s)]), P(ink, 255, lw*s))
    elif m == "lovers":
        for sx, col in ((-1, BLUE), (1, RED)):
            c.drawCircle(sx * 45*s, -40*s, 28*s, P((240, 205, 165)))
            c.drawPath(path([(sx*45*s - 35*s, 0), (sx*45*s + 35*s, 0), (sx*45*s + 48*s, 130*s), (sx*45*s - 48*s, 130*s)]), P(col))
        heart(c, 0, -120*s, 30*s, (230, 80, 100))
    elif m == "god":
        c.drawCircle(0, -50*s, 38*s, P((240, 210, 180))); c.drawCircle(0, -50*s, 38*s, P(ink, 255, lw*s))
        c.drawCircle(0, -50*s, 58*s, P(GOLD, 255, 5*s))
        c.drawPath(path([(-60*s, -5*s), (60*s, -5*s), (80*s, 140*s), (-80*s, 140*s)]), P((235, 235, 240)))
        c.drawLine(80*s, -90*s, 80*s, 140*s, P((170, 130, 60), 255, 7*s))
    elif m == "unknown":
        f = F(150 * s); text_c(c, "?", 0, 50*s, f, GOLD, 255, shadow=False)

def suit_icon(c, suit, x, y, r, style="visconti"):
    ink = INK
    if suit == "cups":
        p = skia.Path(); p.moveTo(x - r*0.6, y - r*0.6); p.quadTo(x - r*0.6, y + r*0.15, x, y + r*0.2)
        p.quadTo(x + r*0.6, y + r*0.15, x + r*0.6, y - r*0.6); p.close()
        c.drawPath(p, P(GOLD)); c.drawPath(p, P(ink, 255, r*0.06))
        c.drawRect(skia.Rect.MakeXYWH(x - r*0.08, y + r*0.2, r*0.16, r*0.4), P(GOLD_D))
        c.drawOval(skia.Rect.MakeXYWH(x - r*0.35, y + r*0.55, r*0.7, r*0.18), P(GOLD_D))
    elif suit == "coins":
        c.drawCircle(x, y, r*0.6, P(GOLD)); c.drawCircle(x, y, r*0.6, P(ink, 255, r*0.06))
        c.drawPath(star_path(x, y, r*0.38, r*0.16, 6), P(GOLD_D))
    elif suit == "swords":
        c.drawLine(x, y + r*0.75, x, y - r*0.85, P((200, 205, 215), 255, r*0.16))
        c.drawLine(x, y + r*0.75, x, y - r*0.85, P(ink, 255, r*0.04))
        c.drawLine(x - r*0.4, y + r*0.4, x + r*0.4, y + r*0.4, P(GOLD_D, 255, r*0.12))
        c.drawCircle(x, y + r*0.82, r*0.1, P(GOLD))
    elif suit == "batons":
        c.save(); c.rotate(-25); c.translate(x * 0, 0)
        c.restore()
        c.drawLine(x - r*0.35, y + r*0.75, x + r*0.35, y - r*0.75, P((140, 92, 50), 255, r*0.2))
        for k in (-0.3, 0.1, 0.45):
            c.drawCircle(x + r*0.35*k*2 * 0.47 * 2 / 0.94 * 0.5, y - r*0.75*k, r*0.06, P((90, 140, 70)))
    elif suit == "polo":
        c.drawLine(x - r*0.2, y + r*0.8, x + r*0.2, y - r*0.6, P((150, 100, 60), 255, r*0.1))
        p = skia.Path(); p.moveTo(x + r*0.2, y - r*0.6); p.quadTo(x + r*0.3, y - r*0.95, x - r*0.1, y - r*0.85)
        c.drawPath(p, P((150, 100, 60), 255, r*0.1))

def heart(c, x, y, r, col, a=255):
    p = skia.Path(); p.moveTo(x, y + r * 0.9)
    p.cubicTo(x - r * 1.6, y - r * 0.1, x - r * 0.7, y - r * 1.2, x, y - r * 0.4)
    p.cubicTo(x + r * 0.7, y - r * 1.2, x + r * 1.6, y - r * 0.1, x, y + r * 0.9)
    c.drawPath(p, P(col, a))

def card(c, cx, cy, w, style="visconti", m="sun", rot=0.0, flip=1.0, t=0.0, label=None, alpha=255, glowcol=None, reveal=1.0):
    """flip: 1 = frente; -1 = verso; valores entre giram (escala x = cos)."""
    h = w * 1.72
    c.save(); c.translate(cx, cy); c.rotate(rot)
    if glowcol: glow(c, 0, 0, w * 1.25, glowcol, 120)
    sx = max(0.02, abs(flip))
    c.scale(sx, 1)
    rr = skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(-w/2, -h/2, w, h), w * 0.06, w * 0.06)
    c.drawRRect(skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(-w/2 + 8, -h/2 + 14, w, h), w * 0.06, w * 0.06), P((0, 0, 0), alpha * 0.45, blur=14))
    if flip < 0:
        c.drawRRect(rr, P((96, 36, 52), alpha))
        inner = skia.Rect.MakeXYWH(-w/2 + w*0.07, -h/2 + w*0.07, w*0.86, h - w*0.14)
        c.drawRect(inner, P(GOLD, alpha, w * 0.015))
        for i in range(-3, 4):
            for j in range(-6, 7):
                if (i + j) % 2 == 0: c.drawPath(star_path(i * w*0.12, j * w*0.12, w*0.035, w*0.014, 4), P(GOLD, alpha * 0.8))
        c.restore(); return
    if style == "visconti":
        sh = skia.GradientShader.MakeLinear([skia.Point(-w/2, -h/2), skia.Point(w/2, h/2)],
                                            [C(250, 214, 120, alpha), C(205, 150, 60, alpha), C(250, 220, 140, alpha), C(190, 140, 55, alpha)])
        p = skia.Paint(AntiAlias=True); p.setShader(sh); c.drawRRect(rr, p)
        # pontilhado "punzonato" do ouro
        r = random.Random(int(w))
        for i in range(-5, 6):
            for j in range(-9, 10):
                c.drawCircle(i * w*0.085 + (j % 2) * w*0.04, j * w*0.085, w*0.008, P((150, 100, 40), alpha * 0.5))
        sweep = (t * 0.35) % 1.6 - 0.3
        sh2 = skia.GradientShader.MakeLinear([skia.Point(-w/2 + sweep * w * 2 - w, -h/2), skia.Point(-w/2 + sweep * w * 2, h/2)],
                                             [C(255, 255, 255, 0), C(255, 255, 240, alpha * 0.55), C(255, 255, 255, 0)])
        p2 = skia.Paint(AntiAlias=True); p2.setShader(sh2); c.drawRRect(rr, p2)
        c.drawRRect(rr, P((120, 80, 30), alpha, w * 0.018))
    elif style == "marseille":
        c.drawRRect(rr, P((248, 240, 222), alpha))
        c.drawRect(skia.Rect.MakeXYWH(-w/2 + w*0.06, -h/2 + w*0.06, w*0.88, h - w*0.12), P(INK, alpha, w * 0.022))
        c.drawRect(skia.Rect.MakeXYWH(-w/2 + w*0.06, h/2 - w*0.28, w*0.88, w*0.22), P(INK, alpha, w * 0.022))
        c.drawRRect(rr, P(INK, alpha, w * 0.015))
    elif style == "rws":
        sh = skia.GradientShader.MakeLinear([skia.Point(0, -h/2), skia.Point(0, h/2)], [C(250, 215, 90, alpha), C(250, 235, 170, alpha)])
        p = skia.Paint(AntiAlias=True); p.setShader(sh); c.drawRRect(rr, p)
        c.drawRect(skia.Rect.MakeXYWH(-w/2 + w*0.05, -h/2 + w*0.05, w*0.9, h - w*0.1), P(INK, alpha, w * 0.012))
        c.drawRect(skia.Rect.MakeXYWH(-w/2 + w*0.05, h/2 - w*0.45, w*0.9, w*0.4), P((90, 150, 90), alpha))
        c.drawRRect(rr, P((255, 255, 255), alpha, w * 0.03))
    elif style == "mamluk":
        c.drawRRect(rr, P((230, 210, 170), alpha))
        for k in range(3):
            c.drawRect(skia.Rect.MakeXYWH(-w/2 + w*(0.06 + k*0.04), -h/2 + w*(0.06 + k*0.04), w*(0.88 - k*0.08), h - w*(0.12 + k*0.08)),
                       P([BLUE, RED, GOLD_D][k], alpha, w * 0.012))
    # motivo
    if reveal > 0:
        c.save(); c.translate(0, -w * 0.08 if style in ("marseille", "rws") else 0)
        c.clipRect(skia.Rect.MakeXYWH(-w/2, -h/2, w, h * reveal + 1))
        motif(c, m, w, h, style, t)
        c.restore()
    if label and style in ("marseille", "rws"):
        f = F(w * 0.1, "EB Garamond")
        tw = f.measureText(label)
        c.drawString(label, -tw/2, h/2 - w*0.12, f, P(INK, alpha))
    c.restore()

# ----------------------------------------------------------------------------
# PERSONAGENS (estilo livro ilustrado)
# ----------------------------------------------------------------------------
def person(c, x, y, s, robe, skin=(240, 204, 168), hair=(80, 50, 30), hat=None, beard=False, t=0.0, arm=0.0,
           arm2=0.0, look=0.0, mouth="smile", gown=False):
    """(x,y) = base dos pés. s = escala (1 ≈ 520 px de altura)."""
    breathe = math.sin(t * 2.2) * 4 * s
    c.save(); c.translate(x, y)
    c.drawOval(skia.Rect.MakeXYWH(-150*s, -18*s, 300*s, 36*s), P((0, 0, 0), 60, blur=10))
    # corpo / manto
    wb = 175 if gown else 140
    body = skia.Path()
    body.moveTo(-70*s, -330*s + breathe); body.cubicTo(-110*s, -250*s, -wb*s, -80*s, -wb*s, 0)
    body.lineTo(wb*s, 0); body.cubicTo(wb*s, -80*s, 110*s, -250*s, 70*s, -330*s + breathe); body.close()
    c.drawPath(body, P(robe))
    c.drawPath(body, P(mix(robe, (0, 0, 0), 0.35), 255, 5*s))
    c.drawLine(0, -320*s + breathe, 0, -10*s, P(mix(robe, (255, 255, 255), 0.25), 200, 6*s))
    c.drawRoundRect(skia.Rect.MakeXYWH(-70*s, -340*s + breathe, 140*s, 34*s), 16*s, 16*s, P(GOLD))
    # braços
    for side, ang in ((-1, arm2), (1, arm)):
        c.save(); c.translate(side * 72*s, -318*s + breathe); c.rotate(-side * 15 - ang * side)
        c.drawRoundRect(skia.Rect.MakeXYWH(-24*s, 0, 48*s, 170*s), 24*s, 24*s, P(mix(robe, (0, 0, 0), 0.12)))
        c.drawCircle(0, 175*s, 24*s, P(skin))
        c.restore()
    # cabeça
    hy = -420*s + breathe
    c.drawRect(skia.Rect.MakeXYWH(-20*s, hy + 50*s, 40*s, 40*s), P(mix(skin, (0, 0, 0), 0.1)))
    if hat == "veil" or gown:
        c.drawPath(path([(-80*s, hy - 30*s), (80*s, hy - 30*s), (110*s, hy + 140*s), (-110*s, hy + 140*s)]), P(hair))
    c.drawOval(skia.Rect.MakeXYWH(-72*s, hy - 82*s, 144*s, 160*s), P(skin))
    # cabelo
    if hat != "wig":
        hp = skia.Path(); hp.moveTo(-74*s, hy + 10*s); hp.cubicTo(-80*s, hy - 90*s, 80*s, hy - 100*s, 74*s, hy + 10*s)
        hp.cubicTo(60*s, hy - 30*s, -20*s, hy - 50*s, -74*s, hy + 10*s); c.drawPath(hp, P(hair))
    # rosto
    blink = 1.0 if (t % 3.7) > 0.12 else 0.15
    ex = look * 8 * s
    for sx in (-1, 1):
        c.drawOval(skia.Rect.MakeXYWH(sx * 28*s - 8*s + ex, hy - 4*s - 11*s*blink, 16*s, 22*s*blink), P(INK))
        c.drawCircle(sx * 44*s, hy + 30*s, 12*s, P((235, 120, 120), 90))
    if mouth == "smile":
        c.drawArc(skia.Rect.MakeXYWH(-22*s, hy + 18*s, 44*s, 28*s), 20, 140, False, P(INK, 255, 5*s))
    elif mouth == "o":
        c.drawOval(skia.Rect.MakeXYWH(-10*s, hy + 30*s, 20*s, 24*s), P(INK))
    elif mouth == "talk":
        o = 6 + 8 * abs(math.sin(t * 9))
        c.drawOval(skia.Rect.MakeXYWH(-14*s, hy + 32*s, 28*s, o*s), P(INK))
    if beard:
        bp = skia.Path(); bp.moveTo(-66*s, hy + 10*s); bp.cubicTo(-60*s, hy + 120*s, 60*s, hy + 120*s, 66*s, hy + 10*s)
        bp.cubicTo(40*s, hy + 60*s, -40*s, hy + 60*s, -66*s, hy + 10*s); c.drawPath(bp, P(hair))
        c.drawArc(skia.Rect.MakeXYWH(-22*s, hy + 30*s, 44*s, 20*s), 20, 140, False, P(INK, 255, 5*s))
    # chapéus
    if hat == "duke":
        c.drawOval(skia.Rect.MakeXYWH(-95*s, hy - 95*s, 190*s, 60*s), P(RED))
        c.drawPath(path([(-70*s, hy - 75*s), (-55*s, hy - 175*s), (55*s, hy - 175*s), (70*s, hy - 75*s)]), P((150, 30, 40)))
        c.drawRect(skia.Rect.MakeXYWH(-70*s, hy - 100*s, 140*s, 18*s), P(GOLD))
    elif hat == "crown":
        c.drawPath(path([(-60*s, hy - 60*s), (-60*s, hy - 120*s), (-30*s, hy - 90*s), (0, hy - 135*s), (30*s, hy - 90*s),
                         (60*s, hy - 120*s), (60*s, hy - 60*s)]), P(GOLD))
        c.drawCircle(0, hy - 85*s, 9*s, P(RED))
    elif hat == "beret":
        c.drawOval(skia.Rect.MakeXYWH(-90*s, hy - 115*s, 170*s, 70*s), P((60, 40, 70)))
    elif hat == "wig":
        for k in range(-1, 2, 2):
            for j in range(3):
                c.drawCircle(k * 74*s, hy - 10*s + j * 34*s, 22*s, P((235, 235, 240)))
        c.drawOval(skia.Rect.MakeXYWH(-76*s, hy - 95*s, 152*s, 70*s), P((240, 240, 245)))
        c.drawRoundRect(skia.Rect.MakeXYWH(-14*s, hy + 70*s, 28*s, 70*s), 14*s, 14*s, P((50, 40, 40)))
    elif hat == "hood":
        hp = skia.Path(); hp.moveTo(-100*s, hy + 90*s); hp.cubicTo(-120*s, hy - 160*s, 120*s, hy - 160*s, 100*s, hy + 90*s)
        hp.lineTo(80*s, hy + 70*s); hp.cubicTo(80*s, hy - 110*s, -80*s, hy - 110*s, -80*s, hy + 70*s); hp.close()
        c.drawPath(hp, P(mix(robe, (0, 0, 0), 0.2)))
    elif hat == "bun":
        c.drawCircle(0, hy - 85*s, 36*s, P(hair))
    c.restore()

# ----------------------------------------------------------------------------
# ELEMENTOS DE CENÁRIO
# ----------------------------------------------------------------------------
def castle(c, x, y, s, t, col=(196, 120, 96)):
    dark = mix(col, (0, 0, 0), 0.25)
    def tower(tx, tw, th):
        c.drawRect(skia.Rect.MakeXYWH(tx - tw/2, y - th, tw, th), P(col))
        for i in range(int(tw // (28*s))):
            if i % 2 == 0: c.drawRect(skia.Rect.MakeXYWH(tx - tw/2 + i * 28*s, y - th - 26*s, 28*s, 26*s), P(col))
        for k in range(int(th // (110*s))):
            c.drawRoundRect(skia.Rect.MakeXYWH(tx - 12*s, y - th + 50*s + k * 110*s, 24*s, 50*s), 12*s, 12*s, P((60, 40, 50)))
        c.drawRect(skia.Rect.MakeXYWH(tx + tw/2 - 12*s, y - th, 12*s, th), P(dark))
    tower(x - 260*s, 150*s, 520*s); tower(x + 260*s, 150*s, 520*s)
    tower(x, 420*s, 340*s)
    tower(x, 170*s, 700*s)
    c.drawPath(path([(x - 40*s, y), (x - 40*s, y - 110*s), (x, y - 150*s), (x + 40*s, y - 110*s), (x + 40*s, y)]), P((70, 45, 50)))
    fx, fy = x, y - 760*s
    c.drawLine(fx, fy, fx, fy - 120*s, P(INK, 255, 6*s))
    wv = math.sin(t * 4) * 10 * s
    c.drawPath(path([(fx, fy - 120*s), (fx + 110*s, fy - 100*s + wv), (fx, fy - 70*s)]), P(BLUE))

def scroll_label(c, x, y, s, a=255, size=58):
    f = F(size, "EB Garamond")
    w = f.measureText(s) + 80
    rr = skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(x - w/2, y - size, w, size * 1.45), 14, 14)
    c.drawRRect(skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(x - w/2 + 4, y - size + 8, w, size * 1.45), 14, 14), P((0, 0, 0), a * 0.4, blur=8))
    c.drawRRect(rr, P(CREAM, a)); c.drawRRect(rr, P(GOLD_D, a, 4))
    c.drawString(s, x - (w - 80)/2, y + size * 0.22, f, P(INK, a))

def year_badge(c, x, y, s, t0, t):
    if t < t0: return
    k = eout((t - t0) / 0.6)
    c.save(); c.translate(x, y); c.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k)
    glow(c, 0, 0, 220, GOLD, 70 * k)
    f = F(120, "EB Garamond")
    text_c(c, s, 0, 40, f, GOLD, 255 * k)
    c.restore()

# ----------------------------------------------------------------------------
# CENAS
# ----------------------------------------------------------------------------
def sc_intro(c, t, D):
    bg_night(c, t)
    dust(c, t)
    candle(c, 170, 1300, t, 1.1); candle(c, 910, 1330, t + 1, 0.9)
    # carta Visconti gira e revela o Sol
    fl = math.cos(math.pi * (1 - ease((t - 0.8) / 1.4))) * -1 if t > 0.8 else -1
    card(c, W/2, 860 + math.sin(t * 1.3) * 14, 380, "visconti", "sun", rot=math.sin(t * 0.7) * 3, flip=fl, t=t,
         glowcol=GOLD if fl > 0 else None)
    if t > D * 0.5:
        k = eout((t - D * 0.5) / 0.8)
        for i, (m, st) in enumerate([("moon", "marseille"), ("star", "rws")]):
            sx = (-1 if i == 0 else 1)
            card(c, W/2 + sx * lerp(0, 330, k), 920, 240, st, m, rot=sx * 14 * k, t=t, alpha=255 * k,
                 label="LA LUNE" if i == 0 else "THE STAR")
        card(c, W/2, 860 + math.sin(t * 1.3) * 14, 380, "visconti", "sun", rot=math.sin(t * 0.7) * 3, flip=1, t=t, glowcol=GOLD)
    vignette(c)

def sc_arrival(c, t, D):
    bg_parchment(c, t)
    # mar estilizado
    c.drawRoundRect(skia.Rect.MakeXYWH(60, 520, 960, 760), 60, 60, P((120, 160, 175), 140))
    for i in range(8):
        y = 600 + i * 85
        p = skia.Path(); p.moveTo(90, y)
        for k in range(10): p.quadTo(90 + k * 95 + 47, y - 14 + math.sin(t * 2 + i) * 4, 90 + (k + 1) * 95, y)
        c.drawPath(p, P((255, 255, 255), 70, 3))
    # terras
    c.drawPath(path([(60, 1100), (300, 1060), (520, 1120), (700, 1080), (1020, 1120), (1020, 1300), (60, 1300)], smooth=True), P((210, 180, 120)))
    c.drawPath(path([(420, 520), (520, 640), (600, 760), (700, 860), (660, 900), (560, 800), (470, 700), (400, 600), (380, 520)], smooth=True), P((200, 170, 110)))
    c.drawPath(path([(60, 520), (380, 520), (360, 600), (200, 640), (60, 620)], smooth=True), P((200, 170, 110)))
    ita = (470, 650); egy = (860, 1180)
    c.drawCircle(*ita, 16, P(RED)); c.drawCircle(*egy, 16, P(RED))
    scroll_label(c, ita[0] - 120, ita[1] - 60, "Itália", 255, 46)
    scroll_label(c, egy[0] - 60, egy[1] + 100, "Egito (mamelucos)", 255, 40)
    k = ease((t - 0.5) / (D * 0.6))
    pts = []
    for i in range(41):
        u = i / 40
        x = lerp(egy[0], ita[0], u) + math.sin(u * math.pi) * 180
        y = lerp(egy[1], ita[1], u) - math.sin(u * math.pi) * 40
        pts.append((x, y))
    n = int(k * 40)
    for i in range(0, n, 2):
        c.drawLine(*pts[i], *pts[i + 1], P(RED, 255, 7))
    if n > 0:
        bx, by = pts[min(n, 40)]
        # barquinho
        c.save(); c.translate(bx, by + math.sin(t * 4) * 5)
        c.drawPath(path([(-50, 0), (50, 0), (32, 28), (-32, 28)]), P((120, 70, 40)))
        c.drawLine(0, 0, 0, -80, P(INK, 255, 5))
        c.drawPath(path([(4, -78), (48, -22), (4, -16)]), P(CREAM))
        c.restore()
    year_badge(c, W/2, 400, "c. 1370", 0.3, t)
    vignette(c, 120)

def sc_suits(c, t, D):
    bg_night(c, t, (40, 28, 40), (80, 50, 50))
    dust(c, t)
    names = [("cups", "Taças"), ("coins", "Moedas"), ("swords", "Espadas"), ("polo", "Tacos de polo")]
    for i, (s, nm) in enumerate(names):
        t0 = 0.3 + i * D * 0.16
        if t < t0: continue
        k = eout((t - t0) / 0.6)
        x = 290 + (i % 2) * 500; y = 600 + (i // 2) * 540
        card(c, x, y + (1 - k) * 80, 250, "mamluk", "coins", t=t, alpha=255 * k, reveal=0)
        c.save(); c.translate(x, y + (1 - k) * 80)
        sym = s
        if s == "polo" and t > D * 0.72:
            m = ease((t - D * 0.72) / 0.7)
            c.save(); c.scale(1 - m, 1); suit_icon(c, "polo", 0, -20, 125); c.restore()
            c.save(); c.scale(m, 1); suit_icon(c, "batons", 0, -20, 125); c.restore()
            nm = "Bastões" if m > 0.5 else nm
        else:
            suit_icon(c, sym, 0, -20, 125)
        c.restore()
        text_c(c, nm, x, y + 290, F(54), CREAM, 255 * k)
    vignette(c)

def sc_milan(c, t, D):
    sh = skia.GradientShader.MakeLinear([skia.Point(0, 0), skia.Point(0, H)], [C(250, 190, 130), C(240, 140, 110), C(120, 70, 100)], [0, 0.55, 1])
    p = skia.Paint(); p.setShader(sh); c.drawRect(skia.Rect.MakeWH(W, H), p)
    glow(c, 800, 560, 300, (255, 230, 160), 160)
    c.drawCircle(800, 560, 90, P((255, 236, 190)))
    for i, (x, y) in enumerate([(200, 380), (600, 300)]):
        xx = (x + t * 20) % (W + 300) - 150
        for k in range(3): c.drawOval(skia.Rect.MakeXYWH(xx + k * 60 - 80, y - (20 if k == 1 else 0), 130, 60), P((255, 240, 230), 200))
    castle(c, W/2, 1250, 1.0, t)
    c.drawRect(skia.Rect.MakeXYWH(0, 1240, W, H - 1240), P((96, 120, 80)))
    scroll_label(c, W/2, 1190, "Milão", 255, 50)
    k = eout((t - D * 0.3) / 0.8)
    if k > 0:
        person(c, lerp(-200, 300, k), 1540, 0.62, (150, 40, 50), hair=(60, 40, 30), hat="duke", beard=True, t=t, arm=40 * k)
        scroll_label(c, lerp(-200, 300, k) + 330, 1400, "Filippo Maria Visconti", 255 * k, 40)
    vignette(c, 140)

def sc_trionfi(c, t, D):
    bg_night(c, t)
    dust(c, t)
    # baralho comum em leque
    n = 7
    for i in range(n):
        a = (i - (n - 1) / 2) * 9
        card(c, W/2 + (i - 3) * 60, 1330, 180, "mamluk", "cups", rot=a, t=t, reveal=0)
        c.save(); c.translate(W/2 + (i - 3) * 60, 1330); c.rotate(a)
        suit_icon(c, ["cups", "coins", "swords", "batons"][i % 4], 0, 0, 80); c.restore()
    # cartas de trunfo surgem acima e brilham
    ms = [("fool", 0.15), ("wheel", 0.3), ("lovers", 0.45), ("moon", 0.6), ("sun", 0.72)]
    for i, (m, f0) in enumerate(ms):
        tt = t - D * f0 * 0.6
        if tt < 0: continue
        k = eout(tt / 0.7)
        x = 160 + i * 190
        y = 860 - math.sin(i / 4 * math.pi) * 90 + (1 - k) * 200
        card(c, x, y, 170, "visconti", m, rot=(i - 2) * 6, t=t, alpha=255 * k, glowcol=GOLD if k > 0.9 else None)
    if t > D * 0.62:
        k = eout((t - D * 0.62) / 0.6)
        text_c(c, "TRIONFI", W/2, 400, F(150), GOLD, 255 * k)
        text_c(c, "= trunfos · c. 1440", W/2, 480, F(56, italic=True), CREAM, 255 * k)
    vignette(c)

def sc_wedding(c, t, D):
    bg_night(c, t, (60, 30, 60), (130, 70, 90))
    dust(c, t, 60, (255, 200, 220))
    k = eout(t / 1.2)
    person(c, lerp(80, 330, k), 1470, 0.72, (230, 230, 240), skin=(245, 214, 186), hair=(150, 90, 50), hat="crown", gown=True, t=t, arm=30, look=1)
    person(c, lerp(1000, 750, k), 1470, 0.72, (40, 70, 140), skin=(225, 185, 150), hair=(50, 35, 25), hat="duke", t=t + 1, arm2=30, look=-1)
    if t > 1.0:
        hk = eout((t - 1.0) / 0.6)
        bob = math.sin(t * 3) * 10
        glow(c, W/2, 700 + bob, 230 * hk, (255, 120, 150), 120)
        heart(c, W/2, 700 + bob, 110 * hk, (230, 70, 100))
    scroll_label(c, 300, 940, "Bianca Maria Visconti", 255 * k, 32)
    scroll_label(c, 790, 1010, "Francesco Sforza", 255 * k, 32)
    year_badge(c, W/2, 430, "1441", 0.4, t)
    vignette(c)

def sc_painting(c, t, D):
    bg_parchment(c, t)
    candle(c, 980, 1250, t, 0.7)
    # cavalete
    c.drawLine(560, 1450, 680, 540, P((120, 80, 50), 255, 22))
    c.drawLine(800, 1450, 680, 540, P((120, 80, 50), 255, 22))
    c.drawLine(680, 1150, 680, 1450, P((100, 66, 40), 255, 18))
    rev = ease(t / (D * 0.75))
    card(c, 680, 880, 330, "visconti", "lovers", t=t, reveal=rev, glowcol=GOLD if rev > 0.98 else None)
    # pintor
    bx = 680 - 20 + math.sin(t * 5) * 70
    by = 640 + rev * 560
    person(c, 250, 1500, 0.72, (70, 90, 60), hair=(90, 60, 40), hat="beret", t=t, arm=70 + math.sin(t * 5) * 8, look=1)
    c.drawLine(370, 1050, bx, by, P((140, 100, 60), 255, 10))
    c.drawCircle(bx, by, 12, P(GOLD))
    for i in range(6):
        r = random.Random(int(t * 10) + i)
        c.drawCircle(bx + r.uniform(-30, 30), by + r.uniform(-30, 30), r.uniform(2, 6), P((255, 230, 140), 200))
    scroll_label(c, 330, 1570, "Bonifacio Bembo (atribuído)", 255, 34)
    if t > D * 0.35:
        k = eout((t - D * 0.35) / 0.6)
        text_c(c, "Visconti-Sforza", W/2, 360, F(104), (120, 70, 30), 255 * k, shadow=False)
        text_c(c, "pintado à mão · folha de ouro · c. 1450", W/2, 440, F(40, italic=True), INK, 255 * k, shadow=False)
    vignette(c, 110)

def sc_survivors(c, t, D):
    bg_night(c, t)
    cols, rows = 13, 6
    cw = 66; gap = 10
    x0 = W/2 - (cols * (cw + gap) - gap) / 2 + cw/2
    y0 = 420
    missing = {15: "devil", 16: "tower", 44: None, 63: None}
    show = int(min(78, ease(t / (D * 0.3)) * 78))
    for i in range(78):
        cx = x0 + (i % cols) * (cw + gap); cy = y0 + (i // cols) * (cw * 1.72 + gap)
        if i in missing:
            pulse = 0.5 + 0.5 * math.sin(t * 4)
            c.drawRoundRect(skia.Rect.MakeXYWH(cx - cw/2, cy - cw*0.86, cw, cw * 1.72), 8, 8, P(GOLD, 120 + 100 * pulse, 3))
            f = F(48); text_c(c, "?", cx, cy + 16, f, GOLD, 200)
            continue
        if i < show:
            card(c, cx, cy, cw, "visconti", "sun", t=t, reveal=0)
    if t > D * 0.32:
        k = eout((t - D * 0.32) / 0.6)
        text_c(c, "74 de 78", W/2, 300, F(110), GOLD, 255 * k)
    # cidades
    if D * 0.45 < t < D * 0.72:
        for i, nm in enumerate(["Nova York", "Bérgamo", "coleção particular"]):
            k = eout((t - D * 0.45 - i * 0.5) / 0.5)
            scroll_label(c, W/2, 1290 + i * 95, nm, 255 * k, 40)
    if t > D * 0.72:
        k = eout((t - D * 0.72) / 0.6)
        c.drawRect(skia.Rect.MakeWH(W, H), P((0, 0, 0), 150 * k))
        for i, (m, nm) in enumerate([("devil", "O Diabo"), ("tower", "A Torre")]):
            x = W/2 + (i * 2 - 1) * 230
            card(c, x, 940, 300, "visconti", m, t=t, alpha=255 * k, glowcol=(180, 60, 60))
            c.drawRoundRect(skia.Rect.MakeXYWH(x - 150, 940 - 258, 300, 516), 18, 18, P((20, 10, 20), 150 * k))
            text_c(c, "?", x, 990, F(220), GOLD, 255 * k)
            text_c(c, nm, x, 1300, F(64), CREAM, 255 * k)
        text_c(c, "nunca encontradas", W/2, 520, F(60, italic=True), CREAM, 255 * k)

def sc_game(c, t, D):
    bg_night(c, t, (30, 30, 30), (70, 40, 30), stars=False)
    candle(c, 120, 700, t, 0.8)
    glow(c, W/2, 1000, 700, (255, 180, 100), 50)
    c.drawOval(skia.Rect.MakeXYWH(40, 640, W - 80, 760), P((90, 50, 30)))
    c.drawOval(skia.Rect.MakeXYWH(70, 665, W - 140, 710), P((40, 100, 70)))
    c.drawOval(skia.Rect.MakeXYWH(70, 665, W - 140, 710), P((30, 70, 50), 255, 8))
    seats = [(W/2, 1460), (110, 1020), (W/2, 560), (W - 110, 1020)]
    plays = [("coins", 0.10), ("cups", 0.28), ("swords", 0.46), ("sun", 0.64)]
    for i, (m, f0) in enumerate(plays):
        tt = t - D * f0 * 0.7
        if tt < 0: continue
        k = eout(tt / 0.6)
        sx, sy = seats[i]
        tx, ty = W/2 + (i - 1.5) * 150, 1010 + (i % 2) * 30
        x, y = lerp(sx, tx, k), lerp(sy, ty, k)
        trump = m == "sun"
        if trump:
            card(c, x, y, 150, "visconti", "sun", rot=(i - 1.5) * 8, t=t, glowcol=GOLD)
        else:
            card(c, x, y, 150, "mamluk", "cups", rot=(i - 1.5) * 8, t=t, reveal=0)
            c.save(); c.translate(x, y); c.rotate((i - 1.5) * 8); suit_icon(c, m, 0, 0, 60); c.restore()
    if t > D * 0.6:
        k = eout((t - D * 0.6) / 0.5)
        text_c(c, "TRUNFO VENCE!", W/2, 1500, F(84), GOLD, 255 * k)
    text_c(c, "Tarocchi", W/2, 420, F(130), GOLD)
    text_c(c, "um jogo de vazas · séc. XV–XVIII", W/2, 490, F(48, italic=True), CREAM)

def sc_marseille(c, t, D):
    bg_parchment(c, t, (40, 20, 0))
    # carimbo de xilogravura
    cy = 1000
    press = ease((t - 0.5) / 0.4) - ease((t - 1.1) / 0.5)
    stamped = t > 0.9
    blk_y = lerp(-150, cy - 240, press)
    for i, (m, lab) in enumerate([("star", "XVII  L'ÉTOILE"), ("moon", "XVIII  LA LUNE"), ("sun", "XIX  LE SOLEIL")]):
        x = W/2 + (i - 1) * 320
        if i == 1:
            if stamped:
                card(c, x, cy, 280, "marseille", m, t=0, label=lab.split("  ")[1])
        else:
            if t > 1.4 + i * 0.3:
                k = eout((t - 1.4 - i * 0.3) / 0.5)
                card(c, x, cy + (1 - k) * 60, 280, "marseille", m, t=0, alpha=255 * k, label=lab.split("  ")[1])
    c.drawRect(skia.Rect.MakeXYWH(W/2 - 170, blk_y - 260, 340, 260), P((140, 95, 55)))
    c.drawRect(skia.Rect.MakeXYWH(W/2 - 170, blk_y - 260, 340, 260), P((80, 50, 30), 255, 6))
    c.drawRect(skia.Rect.MakeXYWH(W/2 - 30, blk_y - 420, 60, 160), P((100, 66, 40)))
    text_c(c, "Tarô de Marselha", W/2, 1420, F(96), (120, 40, 30), 255, shadow=False)
    text_c(c, "xilogravura · França e Suíça", W/2, 1490, F(44, italic=True), INK, 255, shadow=False)
    vignette(c, 120)

def sc_gebelin(c, t, D):
    sh = skia.GradientShader.MakeLinear([skia.Point(0, 0), skia.Point(0, H)], [C(240, 190, 120), C(200, 120, 80)])
    p = skia.Paint(); p.setShader(sh); c.drawRect(skia.Rect.MakeWH(W, H), p)
    glow(c, 760, 600, 280, (255, 240, 190), 150)
    c.drawCircle(760, 600, 80, P((255, 240, 200)))
    c.drawPath(path([(420, 1300), (760, 820), (1100, 1300)]), P((222, 180, 110)))
    c.drawPath(path([(760, 820), (1100, 1300), (900, 1300)]), P((190, 145, 85)))
    c.drawRect(skia.Rect.MakeXYWH(0, 1290, W, H - 1290), P((210, 170, 110)))
    person(c, 270, 1500, 0.7, (60, 90, 120), hair=(240, 240, 245), hat="wig", t=t, arm=110 + math.sin(t * 2) * 8, mouth="talk", look=1)
    card(c, 620, 1100, 200, "marseille", "star", rot=-8 + math.sin(t) * 3, t=0, label="L'ÉTOILE")
    bubble_t = t > 0.6
    if bubble_t:
        k = eout((t - 0.6) / 0.5)
        rr = skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(130, 380, 560, 190), 40, 40)
        c.drawRRect(rr, P((255, 255, 255), 240 * k))
        c.drawPath(path([(260, 560), (320, 560), (250, 650)]), P((255, 255, 255), 240 * k))
        text_c(c, "“É o Livro de Thoth,", 410, 460, F(46, italic=True), INK, 255 * k, shadow=False)
        text_c(c, "do Egito antigo!”", 410, 525, F(46, italic=True), INK, 255 * k, shadow=False)
    if t > D * 0.6:
        k = eout((t - D * 0.6) / 0.35)
        c.save(); c.translate(W/2 + 120, 980); c.rotate(-14); s = 1.6 - 0.6 * k; c.scale(s, s)
        rr = skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(-230, -80, 460, 160), 18, 18)
        c.drawRRect(rr, P(RED, 230 * k, 12))
        text_c(c, "MITO", 0, 45, F(130, "Inter"), RED, 230 * k, shadow=False)
        c.restore()
    scroll_label(c, 330, 1570, "Antoine Court de Gébelin", 255, 36)
    year_badge(c, W/2, 300, "1781", 0.2, t)
    vignette(c, 120)

def sc_etteilla(c, t, D):
    bg_night(c, t, (20, 16, 40), (60, 20, 70))
    dust(c, t, 60, (200, 170, 255))
    glow(c, W/2, 1150, 500, (160, 110, 255), 90)
    person(c, W/2, 1500, 0.75, (70, 40, 100), hair=(40, 30, 30), hat="hood", t=t, arm=40, arm2=40)
    c.drawRect(skia.Rect.MakeXYWH(80, 1420, W - 160, 60), P((80, 50, 40)))
    k = ease((t - 0.4) / 1.4)
    n = 5
    for i in range(n):
        a = (i - 2) * 22 * k
        x = W/2 + (i - 2) * 175 * k
        y = 1290 - math.cos(math.radians(a)) * 40 * k
        fl = -1 if t < 1.6 + i * 0.25 else min(1, (t - 1.6 - i * 0.25) * 3) * 2 - 1
        card(c, x, y, 160, "marseille", ["moon", "star", "wheel", "sun", "lovers"][i], rot=a * 0.6, flip=fl, t=0)
    text_c(c, "Etteilla", W/2, 400, F(120), (220, 200, 255))
    text_c(c, "o jogo vira oráculo · 1789", W/2, 480, F(48, italic=True), CREAM)
    vignette(c)

HEB = "אבגדהוזחטיכלמנסעפצקרשת"

def sc_levi(c, t, D):
    bg_night(c, t, (10, 12, 30), (40, 30, 70))
    glow(c, W/2, 960, 520, (120, 140, 255), 80)
    f = skia.Font(skia.Typeface("DejaVu Sans", skia.FontStyle.Bold()), 64)
    n = 22
    shown = int(min(n, ease(t / (D * 0.45)) * n + 1))
    for i in range(shown):
        a = i / n * math.tau + t * 0.15 - math.pi / 2
        x = W/2 + math.cos(a) * 400; y = 960 + math.sin(a) * 400
        ch = HEB[i]
        w = f.measureText(ch)
        c.drawString(ch, x - w/2, y + 22, f, P((210, 220, 255), 230))
    card(c, W/2, 960, 300, "rws", "wheel", t=t, label="ARCANO")
    if t > D * 0.5:
        k = eout((t - D * 0.5) / 0.6)
        text_c(c, "22 arcanos = 22 letras", W/2, 1480, F(70), GOLD, 255 * k)
        text_c(c, "Éliphas Lévi · Aurora Dourada (1888)", W/2, 1550, F(42, italic=True), CREAM, 255 * k)
    text_c(c, "Século XIX", W/2, 330, F(96), (210, 220, 255))
    vignette(c)

def sc_rws(c, t, D):
    bg_parchment(c, t, (0, 20, 40))
    candle(c, 990, 1250, t, 0.6)
    ms = [("fool", "THE FOOL"), ("sun", "THE SUN"), ("star", "THE STAR"), ("cups", "THREE OF CUPS"), ("lovers", "THE LOVERS")]
    for i, (m, lab) in enumerate(ms):
        t0 = 0.4 + i * 0.5
        if t < t0: continue
        k = eout((t - t0) / 0.6)
        a = (i - 2) * 11
        x = W/2 + 100 + (i - 2) * 150; y = 860 + abs(i - 2) * 30
        card(c, x, y + (1 - k) * 100, 230, "rws", m, rot=a, t=t, alpha=255 * k, label=lab)
    person(c, 220, 1500, 0.72, (120, 60, 90), skin=(232, 190, 160), hair=(40, 28, 25), hat="bun", gown=True, t=t, arm=60, look=1)
    text_c(c, "1909", W/2, 330, F(120), (120, 60, 30), 255, shadow=False)
    text_c(c, "Rider-Waite-Smith", W/2, 410, F(56, italic=True), INK, 255, shadow=False)
    if t > D * 0.72:
        k = eout((t - D * 0.72) / 0.8)
        glow(c, 230, 1080, 330, (255, 220, 140), 160 * k)
        person(c, 220, 1500, 0.72, (120, 60, 90), skin=(232, 190, 160), hair=(40, 28, 25), hat="bun", gown=True, t=t, arm=60, look=1)
    scroll_label(c, 560, 1560, "Pamela Colman Smith", 255, 46)
    vignette(c, 110)

def sc_today(c, t, D):
    bg_night(c, t, (40, 30, 70), (110, 60, 100))
    dust(c, t, 50)
    words = [("arte", (300, 520)), ("reflexão", (780, 620)), ("cultura pop", (300, 1420)), ("jogo de cartas", (760, 1520))]
    styles = [("visconti", "sun"), ("marseille", "moon"), ("rws", "star"), ("visconti", "wheel"), ("marseille", "fool"), ("rws", "lovers")]
    for i, (st, m) in enumerate(styles):
        a = i / len(styles) * math.tau + t * 0.35
        x = W/2 + math.cos(a) * 280; y = 1000 + math.sin(a) * 170
        card(c, x, y, 170, st, m, rot=math.sin(a) * 10, t=t, label="")
    for i, (wd, (x, y)) in enumerate(words):
        t0 = 0.3 + i * D * 0.14
        if t < t0: continue
        k = eout((t - t0) / 0.5)
        text_c(c, wd, x, y + math.sin(t * 2 + i) * 8, F(74), GOLD if i % 2 == 0 else CREAM, 255 * k)
    vignette(c)

def sc_outro(c, t, D):
    bg_night(c, t)
    dust(c, t, 60)
    candle(c, 180, 1380, t, 1.0); candle(c, 900, 1400, t + 2, 0.85)
    z = 1 + 0.05 * t / D
    card(c, W/2, 900, 420 * z, "visconti", "star", t=t, glowcol=GOLD, rot=math.sin(t * 0.6) * 2)
    if t > D * 0.55:
        k = eout((t - D * 0.55) / 0.8)
        text_c(c, "Milão, c. 1450", W/2, 1440, F(72), GOLD, 255 * k)
        text_c(c, "quase 600 anos de história", W/2, 1520, F(46, italic=True), CREAM, 255 * k)
    vignette(c)

SCENE_FUN = {f.__name__[3:]: f for f in [sc_intro, sc_arrival, sc_suits, sc_milan, sc_trionfi, sc_wedding, sc_painting,
                                          sc_survivors, sc_game, sc_marseille, sc_gebelin, sc_etteilla, sc_levi, sc_rws,
                                          sc_today, sc_outro]}

# ----------------------------------------------------------------------------
# LEGENDAS / OVERLAY
# ----------------------------------------------------------------------------
def wrap(text, font, maxw):
    lines, cur = [], ""
    for w in text.split():
        cand = (cur + " " + w).strip()
        if font.measureText(cand) > maxw and cur:
            lines.append(cur); cur = w
        else:
            cur = cand
    if cur: lines.append(cur)
    return lines

def draw_caption(c, text, lt, a_out=1.0):
    f = F(50, "Lato")
    lines = wrap(text, f, W - 140)
    k = eout(lt / 0.35) * a_out
    lh = 64
    y0 = 1765 - lh * (len(lines) - 1) / 2 - (1 - k) * 18
    sh = skia.GradientShader.MakeLinear([skia.Point(0, 1600), skia.Point(0, H)], [C(0, 0, 0, 0), C(0, 0, 0, 190 * k)])
    p = skia.Paint(); p.setShader(sh); c.drawRect(skia.Rect.MakeXYWH(0, 1600, W, H - 1600), p)
    for i, ln in enumerate(lines):
        words = ln.split()
        widths = [f.measureText(w) for w in words]; sp = f.measureText(" ")
        x = W/2 - (sum(widths) + sp * (len(words) - 1)) / 2
        y = y0 + i * lh
        for w, wd in zip(words, widths):
            col = GOLD if w.lower().strip("\"“”") in GOLD_WORDS else (255, 250, 240)
            c.drawString(w, x + 2, y + 3, f, P((0, 0, 0), 200 * k, blur=3))
            c.drawString(w, x, y, f, P(col, 255 * k))
            x += wd + sp

def draw_header(c, t, total):
    f = F(40, "EB Garamond")
    s = "A HISTÓRIA DO TARÔ"
    w = f.measureText(s)
    c.drawLine(W/2 - w/2 - 80, 128, W/2 - w/2 - 24, 128, P(GOLD, 200, 3))
    c.drawLine(W/2 + w/2 + 24, 128, W/2 + w/2 + 80, 128, P(GOLD, 200, 3))
    c.drawString(s, W/2 - w/2 + 2, 143, f, P((0, 0, 0), 150, blur=3))
    c.drawString(s, W/2 - w/2, 140, f, P(GOLD))
    c.drawRect(skia.Rect.MakeXYWH(0, H - 8, W * t / total, 8), P(GOLD, 220))

# ----------------------------------------------------------------------------
# ÁUDIO
# ----------------------------------------------------------------------------
def tts(kok, text, voice, speed):
    s, sr = kok.create(text, voice=voice, speed=speed, lang="pt-br")
    s = np.asarray(s, np.float32)
    x_old = np.arange(len(s)) / sr; x_new = np.arange(int(len(s) * SR / sr)) / SR
    a = np.interp(x_new, x_old, s).astype(np.float32)
    return a / (np.abs(a).max() + 1e-6) * 0.9

def reverb(x, secs=2.2, wet=0.25, seed=0):
    n = int(secs * SR)
    r = np.random.default_rng(seed).standard_normal(n).astype(np.float32)
    ir = r * np.exp(-np.arange(n) / SR * 3.2)
    ir = lfilter1(ir, 0.6); ir /= np.sqrt((ir ** 2).sum())
    L = len(x) + n - 1; N = 1 << (L - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(ir, N), N)[:len(x)].astype(np.float32)
    return x * (1 - wet) + y * wet * 0.6

def lute(m, dur=1.4, vol=0.1):
    n = int(dur * SR); t = np.arange(n) / SR
    f = midi(m)
    s = sum((0.9 / k) * np.sin(2 * np.pi * f * k * t) * np.exp(-t * (2.5 + k * 1.6)) for k in range(1, 6))
    return (s * env_adsr(n, 0.004, 0.1) * vol).astype(np.float32)

# Ré dórico, ar renascentista
PROG = {
    "renaissance": [[50, 57, 62, 65], [48, 55, 60, 64], [46, 53, 58, 62], [45, 52, 57, 61]],   # Dm C Bb A
    "mystic":      [[50, 57, 62, 65], [46, 53, 58, 65], [43, 50, 55, 58], [45, 52, 57, 64]],   # Dm Bb Gm A
    "warm":        [[46, 53, 58, 62], [48, 55, 60, 64], [41, 48, 53, 57], [50, 57, 62, 65]],   # Bb C F Dm
}
MOOD = {"intro": "renaissance", "arrival": "renaissance", "suits": "renaissance", "milan": "renaissance",
        "trionfi": "renaissance", "wedding": "warm", "painting": "warm", "survivors": "warm", "game": "renaissance",
        "marseille": "renaissance", "gebelin": "mystic", "etteilla": "mystic", "levi": "mystic", "rws": "warm",
        "today": "warm", "outro": "renaissance"}

def music(total, timeline):
    n = int(total * SR) + SR * 2
    buf = np.zeros(n, np.float32)
    bpm = 66; beat = 60 / bpm; bar = beat * 4
    t = 0.0; b = 0
    patt = [0, 2, 1, 3, 2, 1, 3, 2]
    while t < total + bar:
        sc = next((s for s in timeline if s["start"] <= t < s["start"] + s["dur"]), timeline[-1])
        ch = PROG[MOOD[sc["id"]]][b % 4]
        add(buf, pad_chord([m - 12 for m in ch[:2]] + ch, bar + 1.0, vol=0.05, bright=0.15), t)
        add(buf, lute(ch[0] - 12, bar, 0.12), t)
        for k in range(8):
            note = ch[patt[k] % 4] + 12
            add(buf, lute(note, 1.6, 0.05 + (0.015 if k % 4 == 0 else 0)), t + k * beat / 2)
        if b % 2 == 1:
            add(buf, lute(ch[3] + 24, 2.0, 0.03), t + beat * 3)
        t += bar; b += 1
    return reverb(buf[:int(total * SR)], 2.8, 0.4)

def sfx_chime(vol=0.12):
    o = np.zeros(int(2.5 * SR), np.float32)
    for i, m in enumerate([86, 93, 98]):
        p = lute(m, 2.0, vol); s = int(i * 0.09 * SR); o[s:s + len(p)] += p[:len(o) - s]
    return o

def sfx_paper(vol=0.12, seed=0):
    n = int(0.35 * SR); t = np.arange(n) / SR
    r = np.random.default_rng(seed).standard_normal(n).astype(np.float32)
    r = r - lfilter1(r, 0.3)
    return r * np.exp(-t * 14) * vol

def sfx_thud(vol=0.4):
    n = int(0.5 * SR); t = np.arange(n) / SR
    f = 70 + 60 * np.exp(-t * 25)
    return (np.sin(np.cumsum(2 * np.pi * f / SR)) * np.exp(-t * 10) * vol).astype(np.float32)

# ----------------------------------------------------------------------------
# PIPELINE
# ----------------------------------------------------------------------------
def voiced(a, thr=0.015):
    env = np.convolve(np.abs(a), np.ones(441) / 441, "same")
    idx = np.where(env > thr)[0]
    return (idx[0] / SR, idx[-1] / SR) if len(idx) else (0, len(a) / SR)

def split_caps(text):
    out, cur = [], []
    for w in text.split():
        cur.append(w)
        s = " ".join(cur)
        if (w[-1] in ".:?!" and len(s) > 20) or len(s) > 70:
            out.append(s); cur = []
    if cur: out.append(" ".join(cur))
    return out

def build(kok, voice, speed, cache_dir):
    import hashlib
    t = 0.0; tl = []
    for sc in SCENES:
        key = hashlib.md5(f"{voice}|{speed}|{sc['say']}".encode()).hexdigest()[:12]
        cp = os.path.join(cache_dir, f"vo_{key}.npy")
        if os.path.exists(cp): a = np.load(cp)
        else:
            a = tts(kok, sc["say"], voice, speed); np.save(cp, a)
        v0, v1 = voiced(a)
        lead = 0.35
        dur = lead + len(a) / SR + sc["pad"]
        caps = split_caps(sc["cap"])
        wts = [len(x) + 8 for x in caps]; tot = sum(wts)
        cues, acc = [], 0
        for cp, wt in zip(caps, wts):
            cues.append((lead + v0 + (v1 - v0) * acc / tot, cp)); acc += wt
        tl.append(dict(sc, start=t, dur=dur, vo=a, vo_at=t + lead, cues=cues, vend=lead + v1))
        t += dur
    return tl, t

def render_scene(sc, lt, surface):
    c = surface.getCanvas()
    c.clear(skia.Color(0, 0, 0))
    c.save()
    # leve Ken Burns
    z = 1 + 0.035 * (lt / max(1, sc["dur"]))
    c.translate(W/2, H/2); c.scale(z, z); c.translate(-W/2, -H/2)
    SCENE_FUN[sc["id"]](c, lt, sc["dur"])
    c.restore()
    return surface.makeImageSnapshot().toarray()

_SURF = {}
def frame(fi, tl, total):
    t = fi / FPS
    if "a" not in _SURF:
        _SURF["a"] = skia.Surface(W, H); _SURF["b"] = skia.Surface(W, H)
    idx = next((i for i, s in enumerate(tl) if s["start"] <= t < s["start"] + s["dur"]), len(tl) - 1)
    sc = tl[idx]; lt = t - sc["start"]
    img = render_scene(sc, lt, _SURF["a"]).astype(np.float32)
    # crossfade com a cena seguinte
    if idx + 1 < len(tl) and lt > sc["dur"] - XF:
        nx = tl[idx + 1]
        k = ease((lt - (sc["dur"] - XF)) / XF)
        img2 = render_scene(nx, 0.0, _SURF["b"]).astype(np.float32)
        img = img * (1 - k) + img2 * k
    out = img.astype(np.uint8)
    # overlays (legenda e cabeçalho) num canvas por cima
    s = _SURF["b"]; c = s.getCanvas()
    c.clear(skia.Color(0, 0, 0, 0))
    draw_header(c, t, total)
    cur = None
    for (ct, cp) in sc["cues"]:
        if ct <= lt: cur = (ct, cp)
    if cur and lt < sc["vend"] + 0.4:
        fade = 1 - ease((lt - sc["vend"] - 0.1) / 0.3)
        draw_caption(c, cur[1], lt - cur[0], fade)
    ov = s.makeImageSnapshot().toarray().astype(np.float32)
    al = ov[..., 3:4] / 255
    out = (out.astype(np.float32) * (1 - al) + ov * al)
    if t < 0.8: out *= ease(t / 0.8)
    if t > total - 1.2: out *= 1 - ease((t - total + 1.2) / 1.2)
    out[..., 3] = 255
    return out.astype(np.uint8).tobytes()

def render_segment(args):
    i, f0, f1, tl, total, path_out = args
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgra", "-s", f"{W}x{H}",
                          "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "19",
                          "-pix_fmt", "yuv420p", path_out], stdin=subprocess.PIPE)
    for fi in range(f0, f1): p.stdin.write(frame(fi, tl, total))
    p.stdin.close(); p.wait()
    return path_out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True); ap.add_argument("--voices", required=True)
    ap.add_argument("--voice", default="pf_dora"); ap.add_argument("--speed", type=float, default=0.9)
    ap.add_argument("--out", default="out"); ap.add_argument("--workers", type=int, default=os.cpu_count() or 4)
    ap.add_argument("--preview", type=float, nargs="*")
    a = ap.parse_args()
    from kokoro_onnx import Kokoro
    os.makedirs(a.out, exist_ok=True); tmp = os.path.join(a.out, "_tmp"); os.makedirs(tmp, exist_ok=True)
    print("» narração...")
    kok = Kokoro(a.model, a.voices)
    tl, total = build(kok, a.voice, a.speed, tmp)
    print(f"  duração: {total:.1f}s")
    for s in tl: print(f"  {s['start']:6.1f}  {s['id']}")
    if a.preview is not None:
        from PIL import Image
        for s in a.preview:
            b = frame(int(s * FPS), tl, total)
            arr = np.frombuffer(b, np.uint8).reshape(H, W, 4)[..., [2, 1, 0]]
            Image.fromarray(arr).save(os.path.join(a.out, f"preview_{s:05.1f}.png"))
        return
    print("» áudio...")
    n = int(total * SR) + SR
    vo = np.zeros(n, np.float32); fx = np.zeros(n, np.float32)
    for s in tl: add(vo, s["vo"], s["vo_at"])
    vo = reverb(vo, 1.2, 0.08, 5)
    mus = np.zeros(n, np.float32); m = music(total, tl); mus[:len(m)] = m
    S = {s["id"]: s for s in tl}
    def at(sid, f=0.0, off=0.0): return S[sid]["start"] + S[sid]["dur"] * f + off
    for s in tl[1:]: add(fx, sfx_whoosh(0.7, 0.07, int(s["start"])), s["start"] - 0.45)
    add(fx, sfx_paper(0.15), at("intro", 0, 0.9)); add(fx, sfx_chime(0.1), at("intro", 0, 1.6))
    for i in range(4): add(fx, sfx_paper(0.12, i), at("suits", 0, 0.3 + i * S["suits"]["dur"] * 0.16))
    add(fx, sfx_chime(0.1), at("trionfi", 0.62))
    add(fx, sfx_chime(0.09), at("wedding", 0, 1.0))
    add(fx, sfx_sparkle(0.07), at("painting", 0.75))
    add(fx, sfx_thud(0.35), at("survivors", 0.72))
    for i in range(4): add(fx, sfx_paper(0.13, 10 + i), at("game", 0.07 + i * 0.126))
    add(fx, sfx_chime(0.1), at("game", 0.6))
    add(fx, sfx_thud(0.45), at("marseille", 0, 0.9))
    add(fx, sfx_thud(0.5), at("gebelin", 0.6))
    for i in range(5): add(fx, sfx_paper(0.1, 20 + i), at("etteilla", 0, 1.6 + i * 0.25))
    add(fx, sfx_chime(0.1), at("rws", 0.72))
    add(fx, sfx_chime(0.12), at("outro", 0.55))
    env = np.convolve(np.abs(vo), np.ones(6615) / 6615, "same")
    env = np.clip(env / (env.max() + 1e-6) * 4, 0, 1); env = lfilter1(env, 0.9997)
    mixd = mus * (1 - 0.4 * env) * 0.9 + vo + fx
    end = int(total * SR); mixd = mixd[:end]
    fade = int(1.2 * SR); mixd[-fade:] *= np.linspace(1, 0, fade)
    mixd = mixd / (np.abs(mixd).max() + 1e-6) * 0.95
    wav = os.path.join(tmp, "mix.wav"); write_wav(wav, mixd)
    print("» vídeo...")
    nf = int(total * FPS); k = a.workers
    jobs = [(i, i * nf // k, (i + 1) * nf // k, tl, total, os.path.join(tmp, f"seg_{i}.mp4")) for i in range(k)]
    with Pool(k) as p: segs = p.map(render_segment, jobs)
    lst = os.path.join(tmp, "segs.txt")
    with open(lst, "w") as f:
        for s in segs: f.write(f"file '{os.path.abspath(s)}'\n")
    final = os.path.join(a.out, "a_historia_do_taro.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-i", wav, "-c:v", "copy",
                    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "44100", "-c:a", "aac", "-b:a", "192k", "-shortest",
                    "-movflags", "+faststart", final], check=True)
    with open(os.path.join(a.out, "legendas.srt"), "w") as f:
        fmt = lambda x: f"{int(x//3600):02d}:{int(x%3600//60):02d}:{int(x%60):02d},{int(x*1000%1000):03d}"
        n = 1
        for s in tl:
            for j, (ct, cp) in enumerate(s["cues"]):
                e = s["cues"][j + 1][0] if j + 1 < len(s["cues"]) else s["vend"] + 0.3
                f.write(f"{n}\n{fmt(s['start'] + ct)} --> {fmt(s['start'] + e)}\n{cp}\n\n"); n += 1
    print("✔", final)

if __name__ == "__main__":
    main()

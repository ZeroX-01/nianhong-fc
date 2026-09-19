#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""gen_cart.py —— B2 卡带（12 张 40×28 小图 + 修卡近景系列）

规格：docs/ART_MANIFEST.md「B 组 / B2」；调色板：docs/PALETTE.md

质量红线：
  * cart_big_shell.png 只允许灰阶（代码会 setTint 成 12 种壳色），
    中部 (28,26) 起 112×62 必须是完全透明的贴纸窗；由断言把关。
  * cart_fingers.png 三帧脏净差别必须一眼可辨。
  * 半透明只允许棋盘 dither（breath_puff）。
可重复运行：python3 tools/gen_cart.py
"""
from __future__ import annotations

import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pixlib import Canvas, PAL, save, sheet, report  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'img', 'cart')

# 壳体配色族：base -> (lit 上缘高光, dark 下缘/右侧, darkest 描边)
SHELL_SHADE = {
    'GREY7': ('GREY8', 'GREY5', 'GREY3'),
    'GREY5': ('GREY6', 'GREY3', 'GREY2'),
    'GRN3': ('GRN4', 'GRN2', 'GRN1'),
    'GRN4': ('GRN5', 'GRN3', 'GRN2'),
    'RED3': ('RED4', 'RED2', 'RED1'),
    'RED4': ('RED5', 'RED3', 'RED2'),
    'BLU3': ('BLU4', 'BLU2', 'BLU1'),
    'BLU5': ('WHITE', 'BLU4', 'BLU3'),
    'YEL3': ('YEL4', 'YEL2', 'YEL1'),
    'PUR3': ('PUR4', 'PUR2', 'PUR1'),
    'WOOD6': ('WOOD7', 'WOOD4', 'WOOD3'),
    'WOOD3': ('WOOD4', 'WOOD2', 'WOOD1'),
}

# 12 张卡带：壳体色 / 主题 / 磨损度
CARTS = [
    ('GREY7', 'contra', 'mid'),
    ('GRN3', 'tank', 'heavy'),
    ('RED3', 'mario', 'light'),
    ('BLU3', 'fight', 'mid'),
    ('YEL3', 'multi', 'heavy'),
    ('GREY5', 'fort', 'heavy'),
    ('PUR3', 'tetris', 'light'),
    ('GRN4', 'soccer', 'mid'),
    ('WOOD6', 'island', 'mid'),
    ('BLU5', 'snow', 'light'),
    ('WOOD3', 'ninja', 'heavy'),
    ('RED4', 'monkey', 'mid'),
]


# ---------------------------------------------------------------- 通用绘制
def pseudo_hanzi(c: Canvas, x: int, y: int, w: int, h: int, col,
                 rng: random.Random) -> None:
    """抽象「汉字」笔画块（不写真实文字，只给出字纹感）。"""
    c.vline(x + w // 2, y, y + h - 1, col)
    for _ in range(rng.randint(1, 2)):
        yy = y + rng.randint(1, max(1, h - 2))
        c.hline(x, x + w - 1, yy, col)
    if rng.random() < 0.6:
        c.vline(x, y + 1, y + h - 1, col)
    if rng.random() < 0.6:
        c.vline(x + w - 1, y + 1, y + h - 1, col)
    if rng.random() < 0.5:
        c.hline(x, x + w - 1, y, col)
    c.hline(x, x + w - 1, y + h - 1, col)


def text_row(c: Canvas, x: int, y: int, n: int, gw: int, gh: int, col,
             rng: random.Random, gap: int = 2) -> None:
    for i in range(n):
        pseudo_hanzi(c, x + i * (gw + gap), y, gw, gh, col, rng)


class Art:
    """贴纸画框：用 0..1 相对坐标画同一主题，兼顾 24×13 小图与 108×44 近景。"""

    def __init__(self, c: Canvas, x: int, y: int, w: int, h: int, rng):
        self.c, self.x, self.y, self.w, self.h, self.rng = c, x, y, w, h, rng

    @property
    def big(self) -> bool:
        return self.w > 60

    def U(self, u: float) -> int:
        return self.x + int(u * (self.w - 1) + 0.5)

    def V(self, v: float) -> int:
        return self.y + int(v * (self.h - 1) + 0.5)

    def box(self, u0, v0, u1, v1, col) -> None:
        x0, x1 = self.U(u0), self.U(u1)
        y0, y1 = self.V(v0), self.V(v1)
        self.c.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1, col)

    def band(self, v0, v1, col) -> None:
        self.box(0, v0, 1, v1, col)

    def dith(self, u0, v0, u1, v1, c1, c2=None, mode='checker', phase=0) -> None:
        x0, x1 = self.U(u0), self.U(u1)
        y0, y1 = self.V(v0), self.V(v1)
        self.c.dither(x0, y0, x1 - x0 + 1, y1 - y0 + 1, c1, c2, mode=mode,
                      phase=phase)

    def dot(self, u, v, col) -> None:
        self.c.set(self.U(u), self.V(v), col)

    def bm(self, art: str, legend: dict, u: float, v: float, scale: int = 1,
           anchor='c', outline=None) -> None:
        rows = [r for r in art.strip('\n').split('\n')]
        bw, bh = max(len(r) for r in rows), len(rows)
        px, py = self.U(u), self.V(v)
        if anchor == 'c':
            px -= bw * scale // 2
            py -= bh * scale // 2
        elif anchor == 'b':
            px -= bw * scale // 2
            py -= bh * scale
        tmp = Canvas(self.c.w, self.c.h)
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                col = legend.get(ch)
                if col is None:
                    continue
                tmp.rect(px + i * scale, py + j * scale, scale, scale, col)
        if outline:
            tmp.outline(outline, diag=False)
        self.c.blit(tmp)


# ---------------------------------------------------------------- 主题贴纸
SOLDIER = """
.XX..
XXXXX
.XX..
.XXX.
.X.X.
"""
SOLDIER_BIG = """
...HHH....
..HXXXH...
..HXXXH...
...XXX....
.XXXXXX...
XXXXXXXG..
X..XXX.GGG
...XXX....
...XX.X...
..XX..XX..
.XX...XX..
.X.....XX.
XX......X.
"""


def th_contra(a: Art) -> None:
    a.band(0, 1, 'GRN2')
    a.dith(0, 0, 1, 0.35, 'GRN1', 'GRN2', mode='checker')       # 丛林树冠
    a.dith(0, 0.3, 1, 0.55, 'GRN3', None, mode='quarter')
    a.band(0.72, 1, 'GRN1')
    a.dith(0, 0.68, 1, 0.78, 'GRN2', None, mode='checker')
    if a.big:
        a.bm(SOLDIER_BIG, {'X': 'INK', 'H': 'RED3', 'G': 'GREY4'},
             0.26, 0.98, 3, anchor='b', outline='GRN1')
        a.bm(SOLDIER_BIG, {'X': 'INK', 'H': 'BLU2', 'G': 'GREY4'},
             0.62, 0.86, 2, anchor='b', outline='GRN1')
        a.bm('.X.\nXXX\n.X.', {'X': 'YEL4'}, 0.47, 0.52, 3)    # 枪口火光
        a.bm('.X.\nXXX\n.X.', {'X': 'YEL3'}, 0.78, 0.48, 2)
        for u in (0.06, 0.5, 0.94):                             # 藤蔓
            a.c.vline(a.U(u), a.V(0), a.V(0.3), 'GRN1')
    else:
        a.bm(SOLDIER, {'X': 'INK'}, 0.3, 0.62, 1, anchor='b')
        a.bm(SOLDIER, {'X': 'INK'}, 0.68, 0.62, 1, anchor='b')
        a.dot(0.44, 0.45, 'YEL4')
        a.dot(0.82, 0.45, 'YEL4')


TANK = """
TT.......TT
TT.HHHHH.TT
TT.HHHHH.TT
TT.HHOHH.TT
TT.HHHHH.TT
TT.HHHHH.TT
TT.......TT
"""
TANK_BIG = """
.......BB.......
.......BB.......
.......BB.......
TTT.HHHBBHHH.TTT
ttt.HHHBBHHH.ttt
TTT.HHRRRRHH.TTT
ttt.HRRRRRRH.ttt
TTT.HRROORRH.TTT
ttt.HRROORRH.ttt
TTT.HRRRRRRH.TTT
ttt.HHRRRRHH.ttt
TTT.HHHHHHHH.TTT
ttt.HHHHHHHH.ttt
.TT.HHHHHHHH.TT.
"""


def th_tank(a: Art) -> None:
    a.band(0, 1, 'RED3')                                        # 砖墙
    bw, bh = (14, 8) if a.big else (5, 4)
    for j, y in enumerate(range(a.y, a.y + a.h, bh)):
        c = a.c
        c.hline(a.x, a.x + a.w - 1, y, 'RED2')                  # 砖缝（横）
        off = 0 if j % 2 == 0 else bw // 2
        for x in range(a.x + off, a.x + a.w, bw):
            c.vline(x, y, min(y + bh - 1, a.y + a.h - 1), 'RED2')
        a.c.dither(a.x, y + 1, a.w, max(1, bh - 2), 'RED4', None,
                   mode='faint', phase=j)
    if a.big:
        a.bm(TANK_BIG, {'T': 'GREY6', 't': 'GREY4', 'H': 'GREY7',
                        'R': 'GREY8', 'O': 'GREY4', 'B': 'GREY6', '.': None},
             0.3, 0.52, 2, outline='INK')
        a.bm(TANK_BIG, {'T': 'GRN2', 't': 'GRN1', 'H': 'GRN3',
                        'R': 'GRN4', 'O': 'GRN1', 'B': 'GRN2', '.': None},
             0.76, 0.62, 1, outline='INK')
        a.bm('.X.\nXYX\n.X.', {'X': 'YEL4', 'Y': 'WHITE'}, 0.3, 0.04, 4)
    else:
        a.bm(TANK, {'T': 'GREY5', 'H': 'GREY8', 'O': 'GREY4', '.': None},
             0.42, 0.6, 1, outline='INK')
        a.c.vline(a.U(0.4), a.V(0.1), a.V(0.5), 'GREY7')
        a.bm(TANK, {'T': 'GRN2', 'H': 'GRN4', 'O': 'GRN1', '.': None},
             0.84, 0.74, 1, outline='INK')


MARIO = """
..XXX...
.XXXXX..
.OSSK...
OOSSSK..
OSSKKKS.
..SKKK..
.YBBBY..
YYBBBYY.
YY.BB.YY
...SS...
.BB..BB.
"""


def th_mario(a: Art) -> None:
    a.band(0, 1, 'BLU4')
    a.dith(0, 0, 1, 0.18, 'BLU5', None, mode='quarter')
    a.band(0.82, 1, 'WOOD5')                                    # 地面
    a.dith(0, 0.78, 1, 0.86, 'WOOD6', None, mode='checker')
    if a.big:
        a.bm('..XXXX..\n.XXXXXX.\nXXXXXXXX', {'X': 'WHITE'}, 0.2, 0.16, 3)
        a.bm('..XXXX..\n.XXXXXX.\nXXXXXXXX', {'X': 'WHITE'}, 0.78, 0.1, 2)
        a.bm(MARIO, {'X': 'RED4', 'O': 'SKN3', 'S': 'SKN2', 'K': 'INK',
                     'Y': 'BLU3', 'B': 'RED3'}, 0.42, 0.78, 3, anchor='b')
        # 砖块
        for k in range(3):
            bx = a.U(0.66) + k * 12
            a.c.rect(bx, a.V(0.34), 11, 11, 'WOOD4')
            a.c.frame(bx, a.V(0.34), 11, 11, 'WOOD2')
            a.c.hline(bx + 1, bx + 9, a.V(0.34) + 1, 'WOOD6')
            a.c.hline(bx, bx + 10, a.V(0.34) + 5, 'WOOD2')
        a.c.rect(a.U(0.66) + 12, a.V(0.34), 11, 11, 'YEL3')
        a.c.frame(a.U(0.66) + 12, a.V(0.34), 11, 11, 'YEL1')
        a.c.rect(a.U(0.66) + 15, a.V(0.34) + 3, 5, 5, 'YEL1')
    else:
        a.bm('.XX.\nXXXX', {'X': 'WHITE'}, 0.2, 0.2, 1)
        a.bm('.XX.\nXXXX', {'X': 'WHITE'}, 0.78, 0.15, 1)
        a.bm(MARIO, {'X': 'RED4', 'O': 'SKN3', 'S': 'SKN3', 'K': 'INK',
                     'Y': 'BLU3', 'B': 'RED3'}, 0.36, 0.82, 1, anchor='b')
        for k in range(2):
            bx = a.U(0.7) + k * 5
            a.c.rect(bx, a.V(0.4), 4, 4, 'WOOD4')
            a.c.frame(bx, a.V(0.4), 4, 4, 'WOOD2')


FIGHTER = """
..KKK..
.KOOOK.
.KOOOK.
..KKK..
.WWWWW.
WWWWWWW
.W.W.W.
KK.W.KK
...W...
..K.K..
.KK.KK.
"""


def th_fight(a: Art) -> None:
    a.band(0, 1, 'BLU2')
    a.dith(0, 0, 1, 0.4, 'BLU3', None, mode='checker')
    a.band(0.86, 1, 'BLU1')
    if a.big:
        a.bm(FIGHTER, {'K': 'INK', 'O': 'SKN3', 'W': 'GREY8'}, 0.22, 0.88, 4,
             anchor='b')
        a.bm(FIGHTER, {'K': 'INK', 'O': 'SKN2', 'W': 'RED3'}, 0.78, 0.88, 4,
             anchor='b')
        # 中央对拳火焰
        a.bm('..X..\n.XYX.\nXYWYX\n.XYX.\n..X..',
             {'X': 'RED4', 'Y': 'YEL3', 'W': 'WHITE'}, 0.5, 0.42, 5)
        a.dith(0.36, 0.2, 0.64, 0.36, 'YEL4', None, mode='quarter')
        a.c.hline(a.U(0.3), a.U(0.42), a.V(0.5), 'SKN3')
        a.c.hline(a.U(0.58), a.U(0.7), a.V(0.5), 'SKN2')
    else:
        a.bm(FIGHTER, {'K': 'INK', 'O': 'SKN3', 'W': 'GREY8'}, 0.2, 0.95, 1,
             anchor='b')
        a.bm(FIGHTER, {'K': 'INK', 'O': 'SKN3', 'W': 'RED3'}, 0.8, 0.95, 1,
             anchor='b')
        a.bm('.X.\nXYX\n.X.', {'X': 'RED4', 'Y': 'YEL4'}, 0.5, 0.45, 1)


def th_multi(a: Art) -> None:
    a.band(0, 1, 'YEL3')
    a.dith(0, 0, 1, 1, 'YEL4', None, mode='quarter')
    cols = ('RED4', 'BLU3', 'GRN3', 'PUR3', 'GREY7', 'RED3', 'BLU4', 'GRN4')
    step = 8 if a.big else 4
    k = 0
    for yy in range(a.y + 1, a.y + a.h - (24 if a.big else 6), step):
        for xx in range(a.x + 1, a.x + a.w - 2, step):
            a.c.rect(xx, yy, step - 2, step - 2, cols[k % len(cols)])
            a.c.frame(xx, yy, step - 2, step - 2, 'YEL1')
            k += 1
    if a.big:                                                   # 巨大 1000000
        rng = a.rng
        _ = rng
        bx, by = a.U(0.06), a.V(0.55)
        a.c.rect(bx, by, 96, 22, 'RED3')
        a.c.frame(bx - 1, by - 1, 98, 24, 'INK')
        dx = bx + 4
        a.c.rect(dx + 3, by + 3, 3, 16, 'YEL4')                 # 1
        a.c.rect(dx + 1, by + 5, 2, 2, 'YEL4')
        a.c.rect(dx, by + 17, 9, 2, 'YEL4')
        dx += 12
        for _i in range(6):                                     # 000000
            a.c.frame(dx, by + 3, 11, 16, 'YEL4')
            a.c.frame(dx + 1, by + 4, 9, 14, 'YEL3')
            dx += 13
    else:
        a.c.rect(a.x, a.V(0.62), a.w, 5, 'RED3')
        for i in range(0, a.w - 2, 3):
            a.c.rect(a.x + 1 + i, a.V(0.68), 2, 3, 'YEL4')


JEEP = """
...XXXXX...
..XXXXXXX..
.XXXXXXXXX.
XXXXXXXXXXX
.OO.....OO.
"""


def th_fort(a: Art) -> None:
    a.band(0, 1, 'GRN2')
    a.dith(0, 0, 1, 0.3, 'GRN1', None, mode='checker')
    a.band(0.78, 1, 'GRN1')
    # 红色要塞城墙
    wy0, wy1 = 0.22, 0.72
    a.box(0.05, wy0, 0.95, wy1, 'RED3')
    a.dith(0.05, wy0, 0.95, wy1, 'RED2', None, mode='sparse')
    a.c.hline(a.U(0.05), a.U(0.95), a.V(wy0), 'RED4')
    a.c.vline(a.U(0.95), a.V(wy0), a.V(wy1), 'RED1')
    n = 6 if a.big else 4
    for i in range(n):                                          # 城垛
        u = 0.08 + i * (0.84 / n)
        a.box(u, wy0 - 0.12, u + 0.42 / n, wy0, 'RED2')
    for i in range(n - 1):                                      # 箭窗
        u = 0.14 + i * (0.84 / n)
        a.box(u, 0.36, u + 0.06, 0.5, 'GREY2')
    if a.big:
        a.bm(JEEP, {'X': 'GREY6', 'O': 'INK'}, 0.24, 0.98, 3, anchor='b',
             outline='INK')
        a.c.disc(a.U(0.16), a.V(0.9), 3, 'GREY2')                # 车轮
        a.c.disc(a.U(0.32), a.V(0.9), 3, 'GREY2')
        a.c.set(a.U(0.16), a.V(0.89), 'GREY6')
        a.c.set(a.U(0.32), a.V(0.89), 'GREY6')
        a.bm(JEEP, {'X': 'GREY5', 'O': 'INK'}, 0.74, 0.92, 2, anchor='b',
             outline='INK')
        a.c.disc(a.U(0.69), a.V(0.88), 2, 'GREY2')
        a.c.disc(a.U(0.79), a.V(0.88), 2, 'GREY2')
    else:
        a.bm(JEEP, {'X': 'GREY6', 'O': 'INK'}, 0.35, 1.0, 1, anchor='b')


def th_tetris(a: Art) -> None:
    a.band(0, 1, 'PUR2')
    a.dith(0, 0, 1, 1, 'PUR1', None, mode='checker')
    a.dith(0, 0, 1, 0.4, 'PUR3', None, mode='sparse')
    u = 8 if a.big else 3
    shapes = (
        ((0, 0), (0, 1), (0, 2), (1, 2)),                       # L
        ((0, 0), (1, 0), (2, 0), (1, 1)),                       # T
        ((0, 0), (0, 1), (0, 2), (0, 3)),                       # I
        ((0, 0), (1, 0), (0, 1), (1, 1)),                       # O
    )
    cols = ('RED4', 'BLU4', 'YEL3', 'GRN4')
    pos = ((0.06, 0.1), (0.42, 0.06), (0.76, 0.12), (0.5, 0.55)) if a.big \
        else ((0.05, 0.1), (0.4, 0.1), (0.75, 0.1), (0.45, 0.55))
    for (sh, col, (pu, pv)) in zip(shapes, cols, pos):
        bx, by = a.U(pu), a.V(pv)
        for (cxx, cyy) in sh:
            x, y = bx + cxx * u, by + cyy * u
            a.c.rect(x, y, u, u, col)
            a.c.frame(x, y, u, u, 'INK')
            a.c.set(x + 1, y + 1, 'WHITE')
    if a.big:
        a.dith(0.06, 0.82, 0.94, 0.95, 'PUR3', None, mode='checker')


def th_soccer(a: Art) -> None:
    a.band(0, 1, 'GRN3')
    stripe = 8 if a.big else 4
    for i in range(0, a.w, stripe * 2):
        a.c.rect(a.x + i, a.y, stripe, a.h, 'GRN4')
    a.dith(0, 0, 1, 0.12, 'GRN2', None, mode='checker')
    if a.big:
        gx, gy, gw, gh = a.U(0.3), a.V(0.06), 46, 20             # 球门
        a.c.frame(gx, gy, gw, gh, 'WHITE')
        for i in range(gx + 4, gx + gw, 5):
            a.c.vline(i, gy + 1, gy + gh - 2, 'GREY8')
        for j in range(gy + 4, gy + gh, 5):
            a.c.hline(gx + 1, gx + gw - 2, j, 'GREY8')
        a.bm('..XXX..\n.XXXXX.\nXXKXKXX\nXKXXXKX\nXXKXKXX\n.XXXXX.\n..XXX..',
             {'X': 'WHITE', 'K': 'INK'}, 0.78, 0.62, 4)
        a.bm(FIGHTER, {'K': 'INK', 'O': 'SKN3', 'W': 'RED4'}, 0.2, 0.95, 3,
             anchor='b')
        a.bm(FIGHTER, {'K': 'INK', 'O': 'SKN2', 'W': 'BLU4'}, 0.52, 0.95, 3,
             anchor='b')
    else:
        a.c.frame(a.U(0.08), a.V(0.1), 9, 6, 'WHITE')
        a.bm('.X.\nXXX\n.X.', {'X': 'WHITE'}, 0.62, 0.45, 1)
        a.bm(FIGHTER, {'K': 'INK', 'O': 'SKN3', 'W': 'RED4'}, 0.36, 1.0, 1,
             anchor='b')
        a.bm(FIGHTER, {'K': 'INK', 'O': 'SKN3', 'W': 'BLU4'}, 0.85, 1.0, 1,
             anchor='b')


PALM = """
..GGG.G...
.G.GGGGG..
G..GWG..G.
....WG....
....WW....
....WW....
"""
SKATER = """
..KK..
.KOOK.
.KOOK.
KWWWWK
.WWWW.
.K..K.
KK..KK
"""


def th_island(a: Art) -> None:
    a.band(0, 0.62, 'BLU5')
    a.band(0.62, 1, 'WOOD6')
    a.dith(0, 0.58, 1, 0.68, 'WOOD7', None, mode='checker')
    a.dith(0, 0, 1, 0.2, 'WHITE', None, mode='sparse')
    if a.big:
        a.disc_sun = None
        a.c.disc(a.U(0.86), a.V(0.14), 7, 'YEL4')
        a.bm(PALM, {'G': 'GRN3', 'W': 'WOOD4'}, 0.2, 0.5, 5, anchor='b')
        a.bm(PALM, {'G': 'GRN4', 'W': 'WOOD3'}, 0.62, 0.44, 3, anchor='b')
        a.bm(SKATER, {'K': 'INK', 'O': 'SKN3', 'W': 'GRN4'}, 0.46, 0.92, 4,
             anchor='b')
        a.c.rect(a.U(0.36), a.V(0.9), 24, 3, 'WOOD3')            # 滑板
        a.c.hline(a.U(0.36), a.U(0.36) + 23, a.V(0.9), 'WOOD5')
    else:
        a.c.disc(a.U(0.88), a.V(0.16), 2, 'YEL4')
        a.bm(PALM, {'G': 'GRN3', 'W': 'WOOD4'}, 0.2, 0.62, 1, anchor='b')
        a.bm(SKATER, {'K': 'INK', 'O': 'SKN3', 'W': 'GRN4'}, 0.6, 0.95, 1,
             anchor='b')
        a.c.hline(a.U(0.45), a.U(0.75), a.V(0.96), 'WOOD3')


SNOWMAN = """
..XXX..
.XKXKX.
.XXOXX.
..XXX..
.XXXXX.
XXXXXXX
XXXXXXX
.XXXXX.
"""


def th_snow(a: Art) -> None:
    a.band(0, 1, 'BLU5')
    a.dith(0, 0, 1, 0.28, 'BLU4', None, mode='checker')
    base_v = 0.74
    peaks = ((0.14, 0.06, 0.4), (0.52, 0.2, 0.32), (0.88, 0.3, 0.26)) if a.big \
        else ((0.16, 0.1, 0.44), (0.6, 0.26, 0.34))
    for (pu, pv, half) in peaks:                                # 三角雪山
        top_y, base_y = a.V(pv), a.V(base_v)
        hw = int(half * a.w / 2)
        span = max(1, base_y - top_y)
        for j in range(span + 1):
            wd = int(hw * j / span)
            a.c.hline(a.U(pu) - wd, a.U(pu) + wd, top_y + j, 'GREY8')
            a.c.set(a.U(pu) - wd, top_y + j, 'GREY7')           # 背光侧
            a.c.set(a.U(pu) - wd + 1, top_y + j, 'GREY7')
            a.c.set(a.U(pu) + wd, top_y + j, 'WHITE')
        for j in range(min(span, span // 3) + 1):               # 雪顶
            wd = int(hw * j / span)
            a.c.hline(a.U(pu) - wd, a.U(pu) + wd, top_y + j, 'WHITE')
    a.band(base_v, 1, 'WHITE')
    a.dith(0, base_v - 0.06, 1, base_v + 0.02, 'GREY8', None, mode='checker')
    if a.big:
        a.bm(SNOWMAN, {'X': 'WHITE', 'K': 'INK', 'O': 'RED4'}, 0.32, 1.0, 4,
             anchor='b', outline='GREY6')
        a.bm(SNOWMAN, {'X': 'WHITE', 'K': 'INK', 'O': 'YEL3'}, 0.68, 0.98, 3,
             anchor='b', outline='GREY6')
        a.dith(0, 0.05, 1, 0.66, 'WHITE', None, mode='sparse')  # 飘雪
    else:
        a.bm(SNOWMAN, {'X': 'WHITE', 'K': 'INK', 'O': 'RED4'}, 0.28, 1.0, 1,
             anchor='b', outline='GREY6')
        a.bm(SNOWMAN, {'X': 'WHITE', 'K': 'INK', 'O': 'RED4'}, 0.7, 1.0, 1,
             anchor='b', outline='GREY6')


NINJA = """
...XXX...
..XXXXX..
..X...X..
.XXXXXXX.
XX.XXX.XX
X..XXX..X
...XXX...
..XX.XX..
.XX...XX.
XX.....XX
"""


def th_ninja(a: Art) -> None:
    a.band(0, 1, 'BLU1')
    a.dith(0, 0, 1, 0.5, 'PUR1', None, mode='checker')
    a.dith(0, 0, 1, 0.8, 'BLU2', None, mode='sparse')
    if a.big:
        a.c.disc(a.U(0.76), a.V(0.24), 12, 'YEL4')
        a.c.disc(a.U(0.71), a.V(0.2), 9, 'BLU1')                 # 弯月
        a.bm(NINJA, {'X': 'INK'}, 0.34, 0.95, 4, anchor='b', outline='BLU3')
        a.c.rect(a.U(0.3), a.V(0.44), 8, 3, 'RED3')             # 忍者头巾带
        a.c.line(a.U(0.2), a.V(0.5), a.U(0.46), a.V(0.34), 'GREY7')   # 刀
        a.band(0.88, 1, 'INK')
        for i in range(0, a.w, 7):                               # 屋瓦剪影
            a.c.rect(a.x + i, a.V(0.86), 5, 4, 'INK')
    else:
        a.c.disc(a.U(0.8), a.V(0.25), 3, 'YEL4')
        a.c.disc(a.U(0.75), a.V(0.22), 2, 'BLU1')
        a.bm(NINJA, {'X': 'INK'}, 0.35, 1.0, 1, anchor='b', outline='BLU3')


MONKEY = """
..YYY..
.YKKKY.
YKOOOKY
YKOKOKY
.KOOOK.
..KKK..
"""


def th_monkey(a: Art) -> None:
    a.band(0, 1, 'RED4')
    a.dith(0, 0, 1, 0.42, 'RED5', None, mode='checker')
    a.dith(0, 0.5, 1, 1, 'RED3', None, mode='quarter')
    clouds = ((0.16, 0.18), (0.84, 0.26)) if a.big else ((0.16, 0.2), (0.85, 0.3))
    for (pu, pv) in clouds:                                     # 祥云
        r = 6 if a.big else 2
        a.c.disc(a.U(pu) - r, a.V(pv), r - 1, 'YEL4')
        a.c.disc(a.U(pu) + r, a.V(pv), r - 1, 'YEL4')
        a.c.disc(a.U(pu), a.V(pv) - (2 if a.big else 1), r, 'YEL4')
        a.c.disc(a.U(pu), a.V(pv) + 1, r - 1, 'YEL3')
    if a.big:
        for d in (0, 1, 2):                                     # 金箍棒（3px 粗）
            a.c.line(a.U(0.08), a.V(0.86) + d, a.U(0.94), a.V(0.34) + d,
                     ('YEL4', 'YEL3', 'YEL2')[d])
        a.c.rect(a.U(0.06), a.V(0.82), 5, 8, 'GREY7')           # 棒端金属箍
        a.c.rect(a.U(0.92), a.V(0.3), 5, 8, 'GREY7')
        a.bm(MONKEY, {'Y': 'YEL3', 'K': 'INK', 'O': 'SKN2'}, 0.44, 0.6, 6,
             outline='INK')
        a.c.rect(a.U(0.3), a.V(0.42), 30, 3, 'YEL4')            # 头箍
        a.c.hline(a.U(0.3), a.U(0.3) + 29, a.V(0.42), 'YEL3')
    else:
        a.c.line(a.U(0.08), a.V(0.88), a.U(0.92), a.V(0.32), 'YEL4')
        a.c.line(a.U(0.08), a.V(0.94), a.U(0.92), a.V(0.38), 'YEL2')
        a.bm(MONKEY, {'Y': 'YEL3', 'K': 'INK', 'O': 'SKN2'}, 0.45, 0.62, 1,
             outline='INK')


THEMES = {
    'contra': th_contra, 'tank': th_tank, 'mario': th_mario, 'fight': th_fight,
    'multi': th_multi, 'fort': th_fort, 'tetris': th_tetris,
    'soccer': th_soccer, 'island': th_island, 'snow': th_snow,
    'ninja': th_ninja, 'monkey': th_monkey,
}


# ------------------------------------------------------------ 小图 40×28
def cart_mini(shell: str, theme: str, wear: str, seed: int) -> Canvas:
    rng = random.Random(1000 + seed)
    lit, dark, edge = SHELL_SHADE[shell]
    c = Canvas(40, 28)
    # 壳体：上部满宽 + 下沿略窄（红白机卡带造型）
    c.rect(1, 1, 38, 25, shell)
    c.rect(3, 26, 34, 1, shell)                                  # 下沿略窄
    for (x, y) in ((1, 1), (38, 1), (1, 25), (38, 25)):          # 圆角
        c.clear(x, y)
    c.hline(1, 38, 1, lit)                                       # 上缘高光
    c.vline(1, 2, 24, lit)
    c.vline(38, 2, 25, dark)
    c.vline(37, 3, 25, dark)
    c.hline(2, 37, 25, dark)
    c.hline(3, 36, 26, edge)
    # 顶部提手凹槽（2px 凹陷）
    c.rect(10, 2, 20, 2, dark)
    c.hline(10, 29, 2, edge)
    c.hline(11, 30, 4, lit)
    # 贴纸 26×15：1px 白边 + 略微贴歪（下半整体右移 1px）
    s = Canvas(26, 15)
    s.rect(0, 0, 26, 15, 'WHITE')
    art = Art(s, 1, 1, 24, 13, rng)
    THEMES[theme](art)
    s.frame(0, 0, 26, 15, 'WHITE')
    sx, sy = 7, 6
    for y in range(15):
        dx = 0 if y < 8 else 1
        for x in range(26):
            v = s.get(x, y)
            if v is not None:
                c.set(sx + x + dx, sy + y, v)
    c.hline(sx, sx + 25, sy - 1, dark)                           # 贴纸凹陷投影
    c.vline(sx - 1, sy, sy + 7, dark)
    c.hline(sx + 1, sx + 26, sy + 15, lit)                       # 下缘受光
    # 螺丝孔
    for scx in (10, 29):
        c.set(scx, 23, 'INK')
        c.set(scx + 1, 23, edge)
        c.set(scx, 22, edge)
    # 磨损
    if wear == 'mid':
        c.set(33, sy + 13, None)                                 # 贴纸右下缺角
        c.set(32, sy + 14, None)
        c.set(33, sy + 14, None)
        c.hline(4, 7, 22, dark)
        c.set(35, 8, lit)
        c.set(6, 5, lit)
    elif wear == 'heavy':
        for _ in range(7):
            x0 = rng.randint(2, 33)
            y0 = rng.choice([3, 4, 5, 22, 23, 24, 25])
            c.hline(x0, x0 + rng.randint(1, 4), y0, 'GREY5')
        c.dither(2, 21, 36, 4, 'GREY6', None, mode='sparse')
        for x in range(sx + 1, sx + 25, 3):                      # 贴纸起翘
            c.set(x, sy, 'GREY8')
        c.hline(sx, sx + 25, sy + 1, 'GREY6')
    else:
        c.set(4, 6, lit)
        c.set(35, 20, dark)
    c.outline(edge)
    return c


# --------------------------------------------------- 近景贴纸 112×62
def cart_label(theme: str, wear: str, seed: int) -> Canvas:
    rng = random.Random(2000 + seed)
    c = Canvas(112, 62)
    c.rect(0, 0, 112, 62, 'WHITE')                               # 贴纸纸基
    c.frame(1, 1, 110, 60, 'GREY7')                              # 印刷内边
    art = Art(c, 2, 2, 108, 44, rng)
    THEMES[theme](art)
    c.frame(1, 1, 110, 60, 'GREY7')
    c.frame(0, 0, 112, 62, 'WHITE')                              # 1px 白边
    # 标题条（抽象字纹，不写真实文字）
    c.rect(2, 46, 108, 14, 'WOOD7')
    c.hline(2, 109, 46, 'WHITE')
    c.hline(2, 109, 59, 'WOOD6')
    c.rect(3, 47, 106, 12, 'WOOD7')
    text_row(c, 5, 48, 5, 8, 10, 'INK', rng)
    text_row(c, 58, 49, 6, 5, 8, 'RED2', rng)
    c.rect(96, 48, 12, 10, 'RED3')                               # 小角标
    c.frame(96, 48, 12, 10, 'RED1')
    pseudo_hanzi(c, 98, 50, 8, 6, 'YEL4', rng)
    # 边缘卷起：右上角翻卷（露出纸背）
    for j in range(14):
        for i in range(14 - j):
            c.set(111 - i, 1 + j, 'GREY8' if (i + j) % 5 else 'GREY7')
    for j in range(14):
        c.set(111 - (13 - j), 1 + j, 'GREY6')                    # 折线
        c.set(111 - (13 - j) - 1, 1 + j, 'GREY5')
    c.hline(97, 110, 15, 'GREY5')                                # 卷边阴影
    c.dither(94, 12, 16, 5, 'GREY6', None, mode='checker')
    # 左下角轻微卷边
    for j in range(6):
        for i in range(6 - j):
            c.set(1 + i, 60 - j, 'GREY8')
    c.line(1, 55, 6, 60, 'GREY6')
    # 老化泛黄（极淡 1/16 bayer，不遮挡图案）
    if wear != 'light':
        c.dither(2, 2, 108, 44, 'WOOD6', None, mode='faint', phase=seed)
    if wear == 'heavy':
        c.dither(2, 2, 108, 58, 'YEL2', None, mode='faint', phase=seed + 3)
        c.dither(2, 40, 108, 6, 'WOOD5', None, mode='sparse', phase=seed)
    # 撕口 + 污渍（05 / 06 / 11）
    if seed in (5, 6, 11):
        if seed == 5:                                            # 卷边撕掉一角
            for j in range(18):
                w = 18 - j
                for i in range(w):
                    c.clear(111 - i, 44 + j) if 44 + j < 62 else None
            for j in range(18):
                if 44 + j < 62:
                    c.set(111 - (18 - j), 44 + j, 'GREY5')
        elif seed == 6:                                          # 左侧咬掉一块
            for j in range(20):
                w = max(0, 10 - abs(j - 10))
                for i in range(w):
                    c.clear(i, 20 + j)
                c.set(w, 20 + j, 'GREY5')
        else:                                                    # 中部撕痕
            for j in range(24):
                x0 = 70 + (j % 3)
                for i in range(6 + (j % 4)):
                    c.clear(x0 + i, 4 + j)
                c.set(x0 - 1, 4 + j, 'GREY5')
                c.set(x0 + 6 + (j % 4), 4 + j, 'GREY6')
        for _ in range(3):                                       # 手汗污渍
            ox, oy = rng.randint(6, 80), rng.randint(6, 40)
            c.dither(ox, oy, rng.randint(10, 18), rng.randint(6, 12),
                     'WOOD3', None, mode='quarter', phase=1)
            c.dither(ox + 2, oy + 2, 6, 4, 'WOOD2', None, mode='sparse')
    if seed == 12:                                               # 被水泡过：晕开
        for (ox, oy, w, h) in ((3, 3, 22, 16), (78, 26, 30, 20),
                               (34, 34, 26, 12)):
            c.dither(ox, oy, w, h, 'WOOD5', None, mode='quarter', phase=1)
            c.dither(ox + 2, oy + 2, w - 4, h - 4, 'WOOD6', None,
                     mode='checker')
            c.frame(ox, oy, w, h, 'WOOD4')                       # 水渍边界环
            c.dither(ox + 1, oy + 1, w - 2, 1, 'WOOD3', None, mode='checker')
        c.dither(2, 40, 108, 6, 'WOOD4', None, mode='sparse')
    # 右下角马克笔手写涂鸦（1px INK 抽象笔画）
    gx, gy = 74, 47
    c.line(gx, gy + 9, gx + 5, gy + 1, 'INK')
    c.line(gx + 5, gy + 1, gx + 8, gy + 9, 'INK')
    c.hline(gx + 2, gx + 7, gy + 6, 'INK')
    c.line(gx + 11, gy + 1, gx + 11, gy + 9, 'INK')
    c.line(gx + 11, gy + 1, gx + 16, gy + 4, 'INK')
    c.line(gx + 16, gy + 4, gx + 11, gy + 6, 'INK')
    c.line(gx + 12, gy + 6, gx + 17, gy + 10, 'INK')
    return c


# ----------------------------------------------- 近景壳体 168×116（纯灰阶）
WIN_X, WIN_Y, WIN_W, WIN_H = 28, 26, 112, 62      # 贴纸窗精确 rect


def screw(c: Canvas, cx: int, cy: int) -> None:
    """十字螺丝（灰阶）。"""
    c.disc(cx, cy, 5, 'GREY6')
    c.ring(cx, cy, 5, 'GREY4')
    c.disc(cx, cy, 3, 'GREY7')
    c.hline(cx - 3, cx + 3, cy, 'GREY3')
    c.vline(cx, cy - 3, cy + 3, 'GREY3')
    c.set(cx - 1, cy - 1, 'GREY2')
    c.set(cx - 4, cy - 3, 'GREY8')
    c.set(cx - 3, cy - 4, 'GREY8')
    c.set(cx + 3, cy + 3, 'GREY4')


def cart_big_shell() -> Canvas:
    """3/4 微俯视卡带白模：顶面浅梯形 + 正面直边 + 窄下沿。纯灰阶（供 setTint）。"""
    c = Canvas(168, 116)
    TOPH = 5
    FX0, FX1, FY0, FY1 = 4, 163, 6, 104         # 正面
    LX0, LX1, LY0, LY1 = 16, 151, 105, 111      # 下沿（略窄的连接器唇部）
    # --- 顶面：只有 5 行、两侧各收 4px（微俯视）---
    for i in range(TOPH):
        y = 1 + i
        d = int(round(i * 4 / (TOPH - 1)))
        x0, x1 = 8 - d, 159 + d
        c.hline(x0, x1, y, 'WHITE')
        c.hline(x1 - 10, x1, y, 'GREY8')         # 顶面右端渐暗
    c.clear(8, 1)
    c.clear(159, 1)
    # 顶部提手凹槽（长条凹陷：上壁暗、下壁亮）
    c.rect(52, 1, 64, 4, 'GREY6')
    c.hline(53, 114, 1, 'GREY4')
    c.hline(52, 115, 2, 'GREY5')
    c.hline(53, 115, 4, 'GREY8')
    c.vline(52, 2, 4, 'GREY5')
    c.vline(115, 2, 4, 'GREY7')
    c.dither(54, 3, 60, 1, 'GREY7', None, mode='sparse')
    # --- 正面：竖向 3 段明暗台阶（越往下越暗），与顶面之间留 1px 合模缝 ---
    c.rect(FX0, FY0, FX1 - FX0 + 1, FY1 - FY0 + 1, 'GREY8')
    c.rect(FX0, FY0 + 56, FX1 - FX0 + 1, FY1 - FY0 - 55, 'GREY7')
    c.hline(FX0, FX1, FY0 + 56, 'GREY8')          # 台阶转折处一道亮边
    c.rect(FX0, FY1 - 7, FX1 - FX0 + 1, 8, 'GREY6')
    c.hline(FX0, FX1, FY1 - 7, 'GREY7')
    c.hline(FX0, FX1, FY0, 'GREY5')              # 顶面/正面合模缝
    c.hline(FX0 + 1, FX1 - 1, FY0 + 1, 'GREY8')
    c.vline(FX0, FY0, FY1 - 1, 'WHITE')          # 左棱受光
    c.vline(FX0 + 1, FY0 + 1, FY1 - 1, 'GREY8')
    c.vline(FX1, FY0, FY1 - 1, 'GREY6')          # 右棱背光
    c.vline(FX1 - 1, FY0 + 1, FY1 - 1, 'GREY6')
    c.vline(FX1 - 2, FY0 + 1, FY1 - 1, 'GREY7')
    c.vline(FX1 - 3, FY0 + 1, FY1 - 1, 'GREY7')   # 右侧壁转折
    c.vline(FX1 - 4, FY0 + 2, FY1 - 2, 'GREY7')
    c.hline(FX0 + 1, FX1 - 1, FY1, 'GREY4')      # 底棱
    # 合模线（只在下半部横向走一道，别把整块围成画框）
    c.hline(FX0 + 3, FX1 - 3, FY1 - 15, 'GREY6')
    c.hline(FX0 + 3, FX1 - 3, FY1 - 14, 'GREY8')
    # 底部中央「插入方向」凸起小三角
    for j in range(4):
        c.hline(84 - 3 + j, 84 + 3 - j, FY1 - 8 + j, 'GREY7')
    c.hline(80, 88, FY1 - 9, 'GREY5')
    c.hline(82, 86, FY1 - 5, 'GREY8')
    for (x, sx) in ((FX0, 1), (FX1, -1)):        # 四角圆角 2px
        c.clear(x, FY1)
        c.clear(x, FY0)
        c.set(x + sx, FY0, 'WHITE')
        c.set(x, FY0 + 1, 'GREY8' if sx > 0 else 'GREY6')
        c.set(x + sx, FY1, 'GREY5')
    # 侧壁防滑竖棱（红白机卡带两侧的握持棱，各一条）
    for (x, hl) in ((11, 'WHITE'), (155, 'GREY6')):
        c.vline(x, FY0 + 5, FY1 - 6, 'GREY7')
        c.vline(x + 1, FY0 + 5, FY1 - 6, hl)
    # --- 窄下沿（连接器唇部）：短而窄，带强投影，读作"插进卡槽的那截" ---
    c.hline(FX0 + 2, FX1 - 2, LY0 - 1, 'GREY5')
    c.rect(LX0, LY0, LX1 - LX0 + 1, LY1 - LY0 + 1, 'GREY6')
    c.hline(LX0, LX1, LY0, 'GREY4')              # 台阶阴影
    c.hline(LX0 + 1, LX1, LY0 + 1, 'GREY7')
    c.vline(LX0, LY0 + 1, LY1, 'GREY7')
    c.vline(LX1, LY0 + 1, LY1, 'GREY4')
    c.hline(LX0 + 1, LX1 - 1, LY1, 'GREY4')
    c.rect(LX0 + 1, LY0 + 4, LX1 - LX0 - 1, 3, 'GREY5')
    for x in range(LX0 + 6, LX1 - 4, 12):
        c.vline(x, LY0 + 2, LY1 - 1, 'GREY5')
    for (x, sx) in ((LX0, 1), (LX1, -1)):
        c.clear(x, LY1)
        c.set(x + sx, LY1, 'GREY4')
    # --- 贴纸窗四周 2px 凹陷框（左上壁在阴影、右下壁受光）---
    c.rect(WIN_X - 2, WIN_Y - 2, WIN_W + 4, WIN_H + 4, 'GREY6')
    c.hline(WIN_X - 2, WIN_X + WIN_W + 1, WIN_Y - 2, 'GREY4')
    c.hline(WIN_X - 1, WIN_X + WIN_W, WIN_Y - 1, 'GREY5')
    c.vline(WIN_X - 2, WIN_Y - 2, WIN_Y + WIN_H + 1, 'GREY4')
    c.vline(WIN_X - 1, WIN_Y - 1, WIN_Y + WIN_H, 'GREY5')
    c.hline(WIN_X - 2, WIN_X + WIN_W + 1, WIN_Y + WIN_H + 1, 'WHITE')
    c.hline(WIN_X - 1, WIN_X + WIN_W, WIN_Y + WIN_H, 'GREY8')
    c.vline(WIN_X + WIN_W + 1, WIN_Y - 1, WIN_Y + WIN_H + 1, 'GREY8')
    c.vline(WIN_X + WIN_W, WIN_Y, WIN_Y + WIN_H, 'GREY7')
    # --- 两颗十字螺丝（在贴纸窗下方的壳体上）---
    screw(c, 46, 96)
    screw(c, 122, 96)
    # --- 磨白：边缘 1px WHITE 断续 ---
    for y in range(FY0 + 4, FY1 - 2, 5):
        c.set(FX0, y, 'WHITE')
    for x in range(LX0 + 5, LX1 - 4, 19):
        c.set(x, LY1, 'GREY7')
    for i in range(0, TOPH, 2):
        c.set(8 - int(round(i * 4 / (TOPH - 1))), 1 + i, 'WHITE')
    c.dither(FX0 + 1, FY0 + 4, 2, 16, 'WHITE', None, mode='sparse')
    c.dither(FX0 + 1, FY1 - 22, 2, 14, 'WHITE', None, mode='sparse', phase=1)
    c.dither(WIN_X - 4, FY1 - 4, 18, 3, 'WHITE', None, mode='sparse')
    # --- 右下角缺角（塑料崩掉一块，露出断口）---
    for j in range(13):
        w = int(2 + j * 0.9) + (1 if j % 3 == 0 else 0)
        for i in range(w):
            c.clear(FX1 - i, FY1 - j)
        c.set(FX1 - w, FY1 - j, 'GREY5')
        c.set(FX1 - w + 1, FY1 - j, 'GREY6')
    c.line(148, 88, 158, 98, 'WHITE')            # 应力白痕
    c.set(147, 90, 'GREY6')
    c.set(152, 86, 'WHITE')
    # --- 老塑料肌理 + 旧划伤 ---
    c.dither(FX0 + 3, FY0 + 3, 12, 10, 'GREY7', None, mode='faint', phase=2)
    c.dither(WIN_X, FY1 - 9, 96, 5, 'GREY6', None, mode='faint', phase=1)
    c.line(18, 12, 22, 22, 'GREY7')
    c.line(19, 12, 23, 22, 'GREY6')
    c.line(92, 92, 118, 99, 'GREY7')
    c.outline('GREY3')
    c.clear_rect(WIN_X, WIN_Y, WIN_W, WIN_H)     # 描边后再清一次，窗内 0 像素
    return c


# ---------------------------------------------- 金手指 168×26 × 3 帧
def cart_fingers_frame(stage: int) -> Canvas:
    rng = random.Random(4000 + stage)
    c = Canvas(168, 26)
    # 壳体下缘（塑料）
    c.rect(0, 0, 168, 5, 'GREY7')
    c.hline(0, 167, 0, 'GREY8')
    c.hline(0, 167, 4, 'GREY4')
    c.dither(0, 3, 168, 1, 'GREY5', None, mode='checker')
    # 电路板
    c.rect(0, 5, 168, 19, 'GRN1')
    c.hline(0, 167, 5, 'GRN2')
    c.dither(0, 6, 168, 18, 'GRN2', None, mode='sparse')
    c.hline(0, 167, 24, 'INK')
    c.hline(0, 167, 25, 'INK')
    # 24 根触点（pitch 7）
    for i in range(24):
        x = i * 7 + 1
        c.rect(x, 6, 5, 17, 'YEL3')
        c.vline(x, 6, 22, 'YEL4')
        c.vline(x + 4, 6, 22, 'YEL2')
        c.hline(x, x + 4, 6, 'YEL4')
        c.hline(x, x + 4, 22, 'YEL1')
        if stage == 0:
            c.set(x + 1, 8, 'WHITE')
            if i % 3 == 0:
                c.set(x + 2, 9, 'WHITE')
                c.set(x + 1, 10, 'YEL4')
        elif stage == 1:                                          # 中度氧化 ~40%
            c.rect(x, 6, 5, 17, 'YEL2')
            c.vline(x, 6, 22, 'YEL3')
            c.noise(x, 6, 5, 17, 'YEL1', 0.30, rng)
            c.noise(x, 6, 5, 17, 'GREY4', 0.16, rng)
            c.dither(x, 15 + (i % 3), 5, 4, 'YEL1', None, mode='checker',
                     phase=i)
            if i % 4 == 0:
                c.rect(x + 1, 17, 3, 4, 'GREY4')
            if i % 5 == 2:
                c.set(x + 2, 8, 'YEL4')
        else:                                                     # 严重发黑 ~80%
            c.rect(x, 6, 5, 17, 'YEL1')
            c.vline(x, 6, 22, 'YEL2')                             # 触点还认得出
            c.dither(x, 6, 5, 17, 'GREY2', None, mode='three', phase=i)
            c.noise(x, 8, 5, 15, 'GRN1', 0.30, rng)
            c.noise(x, 6, 5, 17, 'GREY1', 0.18, rng)
            c.rect(x, 14 + (i % 2), 5, 7, 'GREY2')                # 下半段发黑最重
            c.noise(x, 14, 5, 8, 'GRN1', 0.45, rng)
            c.vline(x, 6, 22, 'YEL2')                             # 触点左缘仍可辨
            c.vline(x + 4, 6, 22, 'GREY1')                         # 触点右缘投影
            c.hline(x, x + 4, 6, 'YEL2')
            if i % 3 == 1:
                c.set(x + 1, 7, 'YEL3')                           # 残存金色反光
                c.set(x + 2, 8, 'YEL2')
    if stage == 1:
        c.dither(40, 7, 34, 6, 'YEL1', None, mode='quarter')
        c.dither(110, 14, 40, 8, 'GREY4', None, mode='sparse')
    if stage == 2:
        # 指纹印：4 道同心弧 + 弧间脊线（GREY4/GREY5）
        for k, r in enumerate((5, 8, 11, 14, 17)):
            for t in range(-24, 25):
                fx = 62 + int(r * t / 24.0 * 2.2)
                dd = 1.0 - (t / 24.0) ** 2
                if dd < 0:
                    continue
                fy = 20 - int(r * dd ** 0.5 * 0.95)
                if 6 <= fy <= 22 and 0 <= fx < 168:
                    c.set(fx, fy, 'GREY5' if k % 2 else 'GREY4')
                    if t % 7 == 0:
                        c.set(fx, fy + 1, 'GREY4')
        c.dither(24, 6, 120, 17, 'GREY2', None, mode='quarter', phase=1)
        c.dither(0, 5, 168, 3, 'GRN1', None, mode='checker')
        c.dither(96, 9, 34, 13, 'GREY3', None, mode='sparse')
    return c


# --------------------------------------------- 划痕层 168×116 × 4 帧
def cart_scratch_frame(stage: int) -> Canvas:
    """只用 GREY8 / GREY2 的 1px 线，其余透明。"""
    c = Canvas(168, 116)
    lines = [
        (18, 96, 78, 22),
        (96, 14, 148, 88),
        (30, 40, 132, 74),
    ]
    n = (0, 1, 3, 3)[stage]
    for (x0, y0, x1, y1) in lines[:n]:
        c.line(x0, y0, x1, y1, 'GREY2')
        c.line(x0 + 1, y0, x1 + 1, y1, 'GREY8')
    if stage >= 2:
        c.line(70, 100, 96, 108, 'GREY2')
        c.line(70, 101, 96, 109, 'GREY8')
    if stage == 3:
        rng = random.Random(77)
        # 金手指区（下沿）磨出缺损
        for x in range(18, 150, 5):
            h = rng.randint(3, 9)
            c.rect(x, 112 - h, 3, h + 2, 'GREY2')
            c.hline(x, x + 2, 112 - h, 'GREY8')
            c.set(x + 3, 112 - h + 1, 'GREY8')
        c.hline(16, 152, 104, 'GREY2')
        c.dither(16, 105, 136, 3, 'GREY2', None, mode='checker')
        c.dither(16, 106, 136, 3, 'GREY8', None, mode='sparse')
        for _ in range(14):                                       # 崩边碎点
            x, y = rng.randint(14, 154), rng.randint(96, 112)
            c.set(x, y, 'GREY2')
            c.set(x + 1, y - 1, 'GREY8')
        c.line(140, 30, 150, 92, 'GREY2')
        c.line(141, 30, 151, 92, 'GREY8')
    return c


# ------------------------------------------------- 呼气白雾 40×40 × 6 帧
def breath_puff_frame(i: int) -> Canvas:
    """从左下角小团扩散变大变淡；半透只用棋盘/Bayer dither（禁止中间 alpha）。"""
    from pixlib import BAYER4
    c = Canvas(40, 40)
    rng = random.Random(9000 + i)
    prog = i / 5.0
    cx = 7 + prog * 17
    cy = 34 - prog * 21
    r = 3.5 + prog * 11
    core = Canvas(40, 40)
    core.disc(cx, cy, r, 'WHITE')
    for k in range(3 + i * 2):                                  # 蓬松边缘小团
        ang = rng.random() * 6.2832
        d = r * (0.5 + rng.random() * 0.6)
        core.disc(cx + d * (0.5 + rng.random() * 0.9) * (1 if ang < 3.14 else -1),
                  cy - d * rng.random() * 1.1,
                  r * (0.35 + rng.random() * 0.45), 'WHITE')
    # 内 / 外密度（越后面越淡）
    inner_lvl = (16, 16, 12, 8, 4, 2)[i]
    edge_lvl = (12, 8, 6, 4, 2, 1)[i]
    pts = list(core.d.keys())
    core_set = set(pts)
    for (x, y) in pts:
        deep = all((x + dx, y + dy) in core_set for (dx, dy) in
                   ((2, 0), (-2, 0), (0, 2), (0, -2), (1, 1), (-1, -1)))
        lvl = inner_lvl if deep else edge_lvl
        if BAYER4[y % 4][x % 4] < lvl:
            c.set(x, y, 'WHITE' if (deep and i < 4) else 'GREY8')
    return c


# ---------------------------------------------------- dust 6×6 / spark 8×8
def dust_frame(i: int) -> Canvas:
    c = Canvas(6, 6)
    r = (2.4, 1.8, 1.2, 0.6)[i]
    c.disc(2.5, 2.5, r, 'GREY6')
    if i < 3:
        c.dither(0, 0, 6, 6, 'WOOD6', None, mode='checker',
                 only_on={PAL['GREY6']})
    c.set(2, 2, 'WOOD6')
    if i == 3:
        c.d = {k: v for k, v in c.d.items() if k in ((2, 2), (3, 2), (2, 3))}
        c.set(2, 2, 'GREY6')
        c.set(3, 3, 'WOOD6')
    return c


def spark_frame(i: int) -> Canvas:
    c = Canvas(8, 8)
    r = (1, 3, 2, 1)[i]
    cx = cy = 3.5
    for k in range(-r, r + 1):
        c.set(cx + k, cy, 'YEL4')
        c.set(cx, cy + k, 'YEL4')
    if i in (1, 2):
        for k in range(-(r - 1), r):
            c.set(cx + k, cy + k, 'YEL3')
            c.set(cx + k, cy - k, 'YEL3')
    c.set(3, 3, 'WHITE')
    c.set(4, 3, 'WHITE')
    if i == 1:
        c.set(3, 4, 'WHITE')
        c.set(4, 4, 'WHITE')
    if i == 3:
        c.d = {k: v for k, v in c.d.items() if abs(k[0] - 3) + abs(k[1] - 3) <= 1}
    return c


# ---------------------------------------------------------------- main
def main() -> None:
    print('gen_cart.py ->', OUT)
    for idx, (shell, theme, wear) in enumerate(CARTS, start=1):
        save(sheet([cart_mini(shell, theme, wear, idx)], 40, 28),
             os.path.join(OUT, f'cart_{idx:02d}.png'), 40, 28, 1)
    save(sheet([cart_big_shell()], 168, 116),
         os.path.join(OUT, 'cart_big_shell.png'), 168, 116, 1, grey=True)
    for idx, (shell, theme, wear) in enumerate(CARTS, start=1):
        save(sheet([cart_label(theme, wear, idx)], 112, 62),
             os.path.join(OUT, f'cart_label_{idx:02d}.png'), 112, 62, 1)
    save(sheet([cart_fingers_frame(i) for i in range(3)], 168, 26),
         os.path.join(OUT, 'cart_fingers.png'), 168, 26, 3)
    save(sheet([cart_scratch_frame(i) for i in range(4)], 168, 116),
         os.path.join(OUT, 'cart_scratch.png'), 168, 116, 4)
    save(sheet([breath_puff_frame(i) for i in range(6)], 40, 40),
         os.path.join(OUT, 'breath_puff.png'), 40, 40, 6)
    save(sheet([dust_frame(i) for i in range(4)], 6, 6),
         os.path.join(OUT, 'dust.png'), 6, 6, 4)
    save(sheet([spark_frame(i) for i in range(4)], 8, 8),
         os.path.join(OUT, 'spark.png'), 8, 8, 4)
    # 红线校验：贴纸窗必须完全透明，且尺寸/偏移精确
    from PIL import Image
    shell_img = Image.open(os.path.join(OUT, 'cart_big_shell.png')).convert('RGBA')
    px = shell_img.load()
    for y in range(WIN_Y, WIN_Y + WIN_H):
        for x in range(WIN_X, WIN_X + WIN_W):
            assert px[x, y][3] == 0, f'贴纸窗内有不透明像素 @({x},{y})'
    ring = 0
    for x in range(WIN_X - 1, WIN_X + WIN_W + 1):
        ring += px[x, WIN_Y - 1][3] > 0
        ring += px[x, WIN_Y + WIN_H][3] > 0
    assert ring == 2 * (WIN_W + 2), '贴纸窗边缘必须被壳体完全包住'
    print(f'  窗口校验通过：offset({WIN_X},{WIN_Y}) size {WIN_W}x{WIN_H} 全透明')
    report()


if __name__ == '__main__':
    main()

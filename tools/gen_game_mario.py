#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""D3 —— mario/ 平台跳跃《超级马里蘑》美术生产（可重复运行）
输出：assets/img/games/mario/
hero_big 由 hero 同名姿势「加长躯干 + 加长腿」生成，保证 7 帧姿势/朝向完全对应。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gamelib as G
from gamelib import Canvas, WrapCanvas, from_rows, save_frames

OUT = 'assets/img/games/mario'

# K=INK(描边/头发/胡子/鞋)  R=RED4(帽+衣)  B=BLU3(背带裤)  S=SKN3(皮肤)
MAP = {'K': 'INK', 'R': 'RED4', 'B': 'BLU3', 'S': 'SKN3'}

# 头部 11 行（y0-y10）：红帽 + 帽檐朝右 + 1px 眼睛 + 黑胡子 + 鬓角
HEAD_R = [
    "................",
    ".....KKKKK......",
    "....KRRRRRKK....",
    "...KRRRRRRRRK...",
    "..KRRRRRRRRRRK..",
    "..KKKSSSSKSSSK..",
    "..KKSSSSSKSSSK..",
    "..KSSSSSSSSSSK..",
    "..KSKKKKKSSSK...",
    "...KSSSSSSSK....",
    "....KKSSSKK.....",
]
HEAD_L = [r[::-1] for r in HEAD_R]        # 刹车帧：回头看，帽檐朝左
HEAD_UP = [                               # 死亡帧：仰头、× 眼
    "................",
    ".....KKKKK......",
    "....KRRRRRKK....",
    "...KRRRRRRRRK...",
    "..KRRRRRRRRRRK..",
    "..KKKSSSSSSSK...",
    "..KKSKSSSKSSK...",
    "..KSSKSSSKSSK...",
    "..KSSSSSSSSSK...",
    "...KSKKKKKSK....",
    "....KKSSSKK.....",
]

# 躯干+腿 13 行（y11-y23），脚底落在最后一行
B_STAND = [
    "...KRRRRRRRK....",
    "..KRRRRRRRRRK...",
    ".KSKRRBBBRRKSK..",
    ".KSKRBBBBBRKSK..",
    ".KSKKBBBBBBKSK..",
    ".KKKBBBBBBBKKK..",
    "...KBBBKBBBK....",
    "...KBBKKKBBK....",
    "...KBBK.KBBK....",
    "...KBBK.KBBK....",
    "..KKKKK.KKKKK...",
    ".KKKKKK.KKKKKK..",
    ".KKKKK...KKKKK..",
]
B_RUN_A = [
    "...KRRRRRRRKK...",
    "..KRRRRRRRRRSK..",
    "..KRRBBBRRKSSK..",
    ".KSKRBBBBBRKKK..",
    ".KSKKBBBBBBK....",
    ".KKKBBBBBBBK....",
    "...KBBBKBBBBK...",
    "..KBBBK.KBBBBK..",
    "..KBBK...KBBBK..",
    ".KBBK.....KBBK..",
    ".KKKK.....KKBKK.",
    "KKKKK.....KKKKK.",
    "KKKK.......KKKK.",
]
B_RUN_B = [
    "...KRRRRRRRK....",
    "..KRRRRRRRRRK...",
    ".KSKRRBBBRRKSK..",
    ".KSKRBBBBBRKSK..",
    ".KSKKBBBBBBKSK..",
    ".KKKBBBBBBBKKK..",
    "...KBBBBBBBK....",
    "...KBBBKKBBK....",
    "...KBBK.KBBBK...",
    "...KBBK..KBBK...",
    "...KBBK..KKBKK..",
    "..KKKKK..KKKKK..",
    "..KKKKK.........",
]
B_RUN_C = [
    "..KKRRRRRRRK....",
    ".KSSRRRRRRRRK...",
    ".KSSKRRBBBRRK...",
    "..KKKRBBBBBRK...",
    "...KKBBBBBBKSK..",
    "...KBBBBBBBKKK..",
    "...KBBBBKBBK....",
    "...KBBBKKKBBK...",
    "..KBBBK..KBBK...",
    "..KBBK...KBBK...",
    ".KKBKK...KKBKK..",
    ".KKKKK...KKKKK..",
    "..KKK.....KKKK..",
]
B_JUMP = [
    ".KSSKRRRRRKSSK..",
    ".KSSKRRRRRKSSK..",
    "..KKKRBBBRKKK...",
    "...KRBBBBBRK....",
    "...KBBBBBBBK....",
    "..KBBBKKKBBBK...",
    "..KBBK...KBBK...",
    ".KBBK.....KBBK..",
    ".KBBK.....KBBK..",
    "KKKKK.....KKKKK.",
    "KKKK.......KKKK.",
    "................",
    "................",
]
B_SKID = [
    "...KRRRRRRRK....",
    "..KRRRRRRRRRK...",
    ".KSKRRBBBRRKSK..",
    ".KSKRBBBBBRKSK..",
    ".KKKBBBBBBBKKK..",
    "...KBBBBBBBK....",
    "...KBBKKKBBK....",
    "..KBBK...KBBK...",
    "..KBBK...KBBK...",
    ".KBBK.....KBBK..",
    "KKKKK.....KKKKK.",
    "KKKKKK...KKKKKK.",
    ".KKKK.....KKKK..",
]
B_DIE = [
    ".KSK.RRRRR.KSK..",
    ".KSKKRRRRRKKSK..",
    "..KKRRRBBBRKK...",
    "...KRBBBBBRK....",
    "...KBBBBBBBK....",
    "...KBBBKBBBK....",
    "...KBBKKKBBK....",
    "...KBBK.KBBK....",
    "...KBBK.KBBK....",
    "...KBBK.KBBK....",
    "..KKKKK.KKKKK...",
    ".KKKKKK.KKKKKK..",
    ".KKKKK...KKKKK..",
]

STAND = HEAD_R + B_STAND
RUN_A = HEAD_R + B_RUN_A
RUN_B = HEAD_R + B_RUN_B
RUN_C = HEAD_R + B_RUN_C
JUMP = HEAD_R + B_JUMP
SKID = HEAD_L + B_SKID
DIE = HEAD_UP + B_DIE

SMALL = [STAND, RUN_A, RUN_B, RUN_C, JUMP, SKID, DIE]
# 每帧 (躯干复制行, 腿部复制行)：把 16×24 加长为 16×32 的 hero_big（姿势完全一致）
TORSO_ROW = "...KBBBBBBBK...."      # 加长用的纯背带裤躯干行
GROW = [(17, 19), (17, 20), (17, 20), (17, 20), (16, 19), (17, 19), (16, 19)]


def grow(rows, ins_at, i_leg, n_t=5, n_l=3):
    """躯干处插入 n_t 行纯背带裤行、腿部复制 n_l 行 -> 24 变 32。
    躯干加长多于腿部加长，避免大马里蘑看起来像“踩高跷”。"""
    out = list(rows[:ins_at]) + [TORSO_ROW] * n_t + list(rows[ins_at:])
    j = i_leg + n_t
    out = out[:j] + [out[j]] * n_l + out[j:]
    assert len(out) == len(rows) + n_t + n_l, len(out)
    return out


def hero_sheets():
    small = [from_rows(r, MAP, 16, 24) for r in SMALL]
    for i, f in enumerate(small):
        if i != 4:                              # 仅跳跃帧允许离地
            G.assert_bottom_aligned(f, 'hero.png', f'帧{i + 1}')
    save_frames(small, f'{OUT}/hero.png', 16, 24)

    big = [from_rows(grow(SMALL[i], *GROW[i]), MAP, 16, 32) for i in range(7)]
    for i, f in enumerate(big):
        if i != 4:
            G.assert_bottom_aligned(f, 'hero_big.png', f'帧{i + 1}')
    save_frames(big, f'{OUT}/hero_big.png', 16, 32)


# ---------------------------------------------------------------- 蘑菇怪 16×16 ×3
MUSH = {'K': 'INK', 'M': 'WOOD5', 'D': 'WOOD3', 'W': 'WHITE'}
MU_A = [
    "................",
    "................",
    "....KKKKKK......",
    "..KKMMMMMMKK....",
    ".KMMMMMMMMMMK...",
    ".KMMKWWMMWWKMK..",
    "KMMMKWKMMKWKMMK.",
    "KMMMKWWMMWWKMMK.",
    "KMMMMMMMMMMMMMK.",
    "KMMMMMKKMMMMMMK.",
    ".KMMMMMMMMMMMK..",
    ".KDDMMMMMMMDDK..",
    "..KDDDDDDDDDK...",
    "..KKDDKKKKDDKK..",
    ".KKKKK....KKKKK.",
    ".KKKK......KKKK.",
]
MU_B = [
    "................",
    "................",
    "....KKKKKK......",
    "..KKMMMMMMKK....",
    ".KMMMMMMMMMMK...",
    ".KMMKWWMMWWKMK..",
    "KMMMKWKMMKWKMMK.",
    "KMMMKWWMMWWKMMK.",
    "KMMMMMMMMMMMMMK.",
    "KMMMMMKKMMMMMMK.",
    ".KMMMMMMMMMMMK..",
    ".KDDMMMMMMMDDK..",
    "..KDDDDDDDDDK...",
    "...KKDDDDDDKK...",
    "..KKKKKKKKKKKK..",
    "..KKKK....KKKK..",
]
MU_FLAT = [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "....KKKKKKKK....",
    "..KKMMMMMMMMKK..",
    ".KMMKWWMMWWKMMK.",
    ".KMMMMMMMMMMMMK.",
    "KDDDDDDDDDDDDDDK",
    "KKKKKKKKKKKKKKKK",
]


def mush_sheet():
    fr = [from_rows(r, MUSH, 16, 16) for r in (MU_A, MU_B, MU_FLAT)]
    for i, f in enumerate(fr):
        G.assert_bottom_aligned(f, 'enemy_mush.png', f'帧{i + 1}')
    save_frames(fr, f'{OUT}/enemy_mush.png', 16, 16)


# ---------------------------------------------------------------- 龟 16×18 ×4
SHELL = {'K': 'INK', 'G': 'GRN4', 'D': 'GRN2', 'S': 'SKN3'}
SH_A = [
    "................",
    "......KKKK......",
    ".....KGGGGK.....",
    "....KGSKGSGK....",
    "....KGSSGSSK....",
    "....KGGGGGGK....",
    "...KKGGGGGGKK...",
    "..KGGKKKKKKGGK..",
    ".KGGKDDDDDDKGGK.",
    ".KGKDDGGGGDDKGK.",
    ".KKKDGGDDGGDKKK.",
    "..KDDGDDDDGDDK..",
    "..KDDGGGGGGDDK..",
    "..KDDDDDDDDDDK..",
    "...KKDDDDDDKK...",
    "....KSSKKSSK....",
    "...KSSSKKSSSK...",
    "...KKKK..KKKK...",
]
SH_B = [
    "................",
    "......KKKK......",
    ".....KGGGGK.....",
    "....KGSKGSGK....",
    "....KGSSGSSK....",
    "....KGGGGGGK....",
    "...KKGGGGGGKK...",
    "..KGGKKKKKKGGK..",
    ".KGGKDDDDDDKGGK.",
    ".KGKDDGGGGDDKGK.",
    ".KKKDGGDDGGDKKK.",
    "..KDDGDDDDGDDK..",
    "..KDDGGGGGGDDK..",
    "..KDDDDDDDDDDK..",
    "...KKDDDDDDKK...",
    "...KSSKKKKSSK...",
    "..KSSSK..KSSSK..",
    "..KKKK....KKKK..",
]
SH_HIDE = [
    "................",
    "................",
    "................",
    "................",
    "......KKKK......",
    "....KKDDDDKK....",
    "..KKDDGGGGDDKK..",
    ".KKDDGGDDGGDDKK.",
    ".KDDGGDDDDGGDDK.",
    ".KDGGDDGGDDGGDK.",
    ".KDGDDGGGGDDGDK.",
    ".KDDDGGGGGGDDDK.",
    ".KDDDDDDDDDDDDK.",
    "..KDDDDDDDDDDK..",
    "..KKDDDDDDDDKK..",
    "...KKDDDDDDKK...",
    "....KKKKKKKK....",
    "....KKKKKKKK....",
]
SH_SLIDE = [
    "................",
    "................",
    "................",
    "................",
    "......KKKK......",
    "....KKGGGGKK....",
    "..KKGGDDDDGGKK..",
    ".KKGGDDGGDDGGKK.",
    ".KGGDDGGGGDDGGK.",
    ".KGDDGGDDGGDDGK.",
    ".KGDGGDDDDGGDGK.",
    ".KGGGDDDDDDGGGK.",
    ".KGGGGGGGGGGGGK.",
    "..KGGGGGGGGGGK..",
    "..KKGGGGGGGGKK..",
    "...KKGGGGGGKK...",
    "....KKKKKKKK....",
    "....KKKKKKKK....",
]


def shell_sheet():
    fr = [from_rows(r, SHELL, 16, 18) for r in (SH_A, SH_B, SH_HIDE, SH_SLIDE)]
    for i, f in enumerate(fr):
        G.assert_bottom_aligned(f, 'enemy_shell.png', f'帧{i + 1}')
    save_frames(fr, f'{OUT}/enemy_shell.png', 16, 18)


# ---------------------------------------------------------------- tiles 16×16 ×10
def t_ground():
    """地面砖：左/上 1px 深描边 + 内侧亮边，右/下 内侧压暗 ——
    平铺后砖缝为均匀单线（SMB 原作的方块地面感），无双线、无错位。"""
    cv = WrapCanvas(16, 16)
    cv.rect(0, 0, 16, 16, 'WOOD5')
    cv.hline(1, 15, 1, 'WOOD7')
    cv.vline(1, 1, 15, 'WOOD7')
    cv.hline(1, 15, 15, 'WOOD4')
    cv.vline(15, 1, 15, 'WOOD4')
    cv.hline(0, 15, 0, 'WOOD2')
    cv.vline(0, 0, 15, 'WOOD2')
    for y in range(3, 14):
        for x in range(3, 14):
            if (x * 3 + y * 5) % 11 == 0:
                cv.set(x, y, 'WOOD6')
            elif (x + y * 2) % 9 == 0:
                cv.set(x, y, 'WOOD4')
    cv.hline(4, 12, 5, 'WOOD4')
    cv.hline(3, 11, 11, 'WOOD4')
    return cv


def t_dirt():
    cv = WrapCanvas(16, 16)
    for y in range(16):
        for x in range(16):
            c = 'WOOD3'
            if (x + y) % 4 == 0:
                c = 'WOOD2'
            elif (x * 3 + y * 2) % 8 == 1:
                c = 'WOOD2'
            elif (x + 2 * y) % 8 == 3:
                c = 'WOOD4'
            cv.set(x, y, c)
    return cv


def _block(base, light, dark):
    cv = Canvas(16, 16)
    cv.rect(0, 0, 16, 16, base)
    cv.frame(0, 0, 16, 16, dark)
    cv.hline(1, 14, 1, light)
    cv.vline(1, 1, 14, light)
    cv.hline(1, 14, 14, dark)
    cv.vline(14, 1, 14, dark)
    return cv


QMARK = [
    "..XXXX..",
    ".X....X.",
    "X..XX..X",
    "...XX.X.",
    "..XX....",
    "..XX....",
    "........",
    "..XX....",
]


def t_question():
    cv = _block('YEL3', 'YEL4', 'YEL1')
    for dx, dy in ((3, 3), (12, 3), (3, 12), (12, 12)):
        cv.set(dx, dy, 'YEL1')
    for y, row in enumerate(QMARK):
        for x, ch in enumerate(row):
            if ch == 'X':
                cv.set(4 + x, 4 + y, 'YEL1')
    return cv


def t_used():
    cv = _block('WOOD4', 'WOOD5', 'WOOD2')
    for dx, dy in ((3, 3), (12, 3), (3, 12), (12, 12)):
        cv.set(dx, dy, 'WOOD2')
    cv.rect(4, 5, 8, 6, 'WOOD3')
    cv.hline(4, 11, 5, 'WOOD5')
    return cv


def t_brick():
    cv = WrapCanvas(16, 16)
    cv.rect(0, 0, 16, 16, 'WOOD5')
    for y in range(16):
        if y % 4 == 0:
            cv.hline(0, 15, y, 'WOOD2')
        elif y % 4 == 1:
            cv.hline(0, 15, y, 'WOOD6')
        vx = (3, 11) if (y // 4) % 2 == 0 else (7, 15)
        if y % 4 != 0:
            for x in vx:
                cv.set(x, y, 'WOOD2')
    return cv


def t_hard():
    cv = _block('GREY6', 'GREY8', 'GREY3')
    cv.rect(3, 3, 10, 10, 'GREY5')
    cv.hline(3, 12, 3, 'GREY7')
    cv.vline(3, 3, 12, 'GREY7')
    cv.hline(3, 12, 12, 'GREY3')
    cv.vline(12, 3, 12, 'GREY3')
    cv.dither(4, 4, 8, 8, 'GREY6', None, mode='quarter')
    return cv


def _pipe_col(cv, x0, x1, top):
    """管身竖条：左亮右暗，GRN4/GRN3/GRN1。"""
    for x in range(x0, x1 + 1):
        c = 'GRN3'
        if x == x0 or x == x1:
            c = 'GRN1'
        elif x == x0 + 1:
            c = 'GRN4'
        elif x == x0 + 2:
            c = 'GRN4'
        elif x >= x1 - 1:
            c = 'GRN2'
        cv.vline(x, top, 15, c)


def t_pipe_top_l():
    cv = Canvas(16, 16)
    _pipe_col(cv, 0, 15, 0)
    cv.hline(0, 15, 0, 'GRN1')
    cv.hline(0, 15, 1, 'GRN4')
    cv.hline(0, 15, 5, 'GRN1')
    cv.vline(0, 0, 5, 'GRN1')
    # 6 行以下为管身（左半：x0-1 透明）
    for y in range(6, 16):
        cv.clear(0, y)
        cv.clear(1, y)
    _pipe_col(cv, 2, 15, 6)
    return cv


def t_pipe_body_l():
    cv = Canvas(16, 16)
    _pipe_col(cv, 2, 15, 0)
    return cv


def mirror(cv):
    return cv.flip_x()


def tiles_sheet():
    ptl = t_pipe_top_l()
    pbl = t_pipe_body_l()
    fr = [t_ground(), t_dirt(), t_question(), t_used(), t_brick(), t_hard(),
          ptl, mirror(ptl), pbl, mirror(pbl)]
    save_frames(fr, f'{OUT}/tiles.png', 16, 16, maxcolors=None, wrap_x=False)
    # 单独校验「可平铺」的两块：地面砖 & 土层 & 普通砖
    for idx in (0, 1, 4):
        im = G.binarize(fr[idx].to_image())
        G.assert_wrap_x(im, f'tiles.png 帧{idx + 1}', vs='max')
        G.assert_wrap_y(im, f'tiles.png 帧{idx + 1}', vs='max')


# ---------------------------------------------------------------- item / coin
def i_mushroom():
    cv = Canvas(16, 16)
    for y in range(2, 9):
        r = 7
        dx = int((r * r - (y - 9) ** 2) ** 0.5) if abs(y - 9) <= r else 0
        cv.hline(8 - dx, 7 + dx, y, 'RED4')
    cv.rect(4, 9, 8, 3, 'RED4')
    for cx, cy, rr in ((5, 5, 2), (11, 6, 2), (8, 3, 1)):
        for y in range(cy - rr, cy + rr + 1):
            d = int((rr * rr - (y - cy) ** 2) ** 0.5)
            cv.hline(cx - d, cx + d, y, 'WHITE')
    cv.rect(5, 11, 6, 4, 'SKN3')
    cv.rect(5, 11, 6, 1, 'WHITE')
    cv.outline('INK')
    return cv


def i_flower():
    cv = Canvas(16, 16)
    cv.rect(6, 8, 4, 7, 'GRN4')
    cv.rect(2, 10, 4, 2, 'GRN4')
    cv.rect(10, 12, 4, 2, 'GRN4')
    for y in range(2, 8):
        cv.hline(4, 11, y, 'RED4')
    cv.hline(5, 10, 1, 'RED4')
    cv.rect(6, 3, 4, 3, 'WHITE')
    cv.set(6, 4, 'RED4')
    cv.set(9, 4, 'RED4')
    cv.outline('INK')
    return cv


def coin_frame(k):
    """k=0..3 金币旋转：宽 -> 窄 -> 宽。"""
    halfw = (5, 3, 1, 3)[k]
    cv = Canvas(16, 16)
    for y in range(2, 14):
        t = abs(y - 7.5) / 6.0
        w = max(1, int(round(halfw * (1 - t * t * 0.55))))
        cv.hline(8 - w, 7 + w, y, 'YEL3')
    if halfw >= 3:
        for y in range(4, 12):
            cv.hline(8 - halfw + 2, 7 + halfw - 2, y, 'YEL4')
        cv.vline(8 - halfw + 1, 5, 10, 'YEL2')
        cv.rect(7, 5, 2, 6, 'YEL2')
    else:
        cv.vline(8, 3, 12, 'YEL4')
    cv.outline('YEL1')
    return cv


def item_sheet():
    coin = coin_frame(0)
    star = Canvas(16, 16)
    rows = {2: (8, 8), 3: (7, 9), 4: (7, 9), 5: (2, 13), 6: (3, 12), 7: (4, 11),
            8: (4, 11), 9: (3, 5), 10: (2, 4), 11: (1, 3)}
    for y, (a, b) in rows.items():
        star.hline(a, b, y, 'YEL3')
    star.hline(10, 12, 9, 'YEL3')
    star.hline(11, 13, 10, 'YEL3')
    star.hline(12, 14, 11, 'YEL3')
    star.hline(6, 9, 5, 'YEL4')
    star.hline(5, 10, 6, 'YEL4')
    star.set(6, 7, 'INK')
    star.set(9, 7, 'INK')
    star.outline('YEL1')
    save_frames([i_mushroom(), i_flower(), coin, star], f'{OUT}/item.png', 16, 16)
    save_frames([coin_frame(k) for k in range(4)], f'{OUT}/coin_spin.png', 16, 16)


# ---------------------------------------------------------------- 装饰
def cloud():
    cv = Canvas(32, 24)
    for cx, cy, r in ((9, 13, 6), (17, 10, 8), (25, 14, 5)):
        for y in range(cy - r, cy + r + 1):
            dx = int((r * r - (y - cy) ** 2) ** 0.5)
            cv.hline(cx - dx, cx + dx, y, 'WHITE')
    cv.rect(4, 13, 24, 6, 'WHITE')
    cv.outline('BLU5')
    cv.dither(3, 16, 26, 4, 'BLU5', None, mode='sparse', only_on=[G.PAL['WHITE']])
    return cv


def bush():
    cv = Canvas(40, 20)
    for cx, cy, r in ((9, 14, 7), (20, 10, 9), (31, 13, 7)):
        for y in range(cy - r, cy + r + 1):
            dx = int((r * r - (y - cy) ** 2) ** 0.5)
            cv.hline(cx - dx, cx + dx, y, 'GRN4')
    cv.rect(3, 13, 34, 6, 'GRN4')
    cv.dither(2, 8, 36, 8, 'GRN3', None, mode='sparse', only_on=[G.PAL['GRN4']])
    cv.dither(2, 15, 36, 4, 'GRN3', None, mode='checker', only_on=[G.PAL['GRN4']])
    cv.outline('GRN1')
    return cv


def castle():
    cv = Canvas(80, 80)
    B, D, L = 'RED3', 'RED1', 'GREY7'

    def wall(x, y, w, h):
        cv.rect(x, y, w, h, B)
        for yy in range(y, y + h):
            if (yy - y) % 4 == 3:
                cv.hline(x, x + w - 1, yy, D)
            for xx in range(x, x + w):
                if (yy - y) % 4 != 3 and (xx + ((yy - y) // 4) * 4) % 8 == 0:
                    cv.set(xx, yy, D)

    def battlement(x, y, w):
        for i in range(0, w, 8):
            cv.rect(x + i, y, 5, 5, B)
            cv.frame(x + i, y, 5, 5, D)

    wall(8, 30, 64, 50)
    battlement(8, 25, 64)
    cv.hline(8, 71, 30, D)
    # 两侧塔
    for tx in (4, 60):
        wall(tx, 14, 16, 66)
        battlement(tx, 9, 16)
        cv.hline(tx, tx + 15, 14, D)
        cv.rect(tx + 6, 22, 4, 6, 'INK')
    # 中央高塔
    wall(30, 4, 20, 30)
    battlement(30, 0, 20)
    cv.rect(36, 12, 8, 10, 'INK')
    cv.frame(36, 12, 8, 10, D)
    # 城门
    for i, y in enumerate(range(46, 80)):
        w = 20 if y > 52 else 20 - (52 - y) * 2
        cv.rect(40 - w // 2, y, w, 1, 'INK')
    cv.rect(30, 52, 20, 28, 'INK')
    for y in range(46, 53):
        w = 20 - (52 - y) * 3
        if w > 0:
            cv.rect(40 - w // 2, y, w, 1, 'INK')
    # 旗杆
    cv.vline(40, 0, 6, L)
    cv.set(39, 0, L)
    return cv


def flag_frames():
    out = []
    for k in range(2):
        cv = Canvas(14, 14)
        cv.vline(1, 0, 13, 'GREY7')
        cv.set(2, 0, 'GREY7')
        for i in range(9):
            w = 9 - i
            off = 0 if k == 0 else (1 if i % 4 < 2 else 0)
            cv.hline(2, 2 + w + off, 2 + i, 'RED4')
        cv.set(5, 5, 'WHITE')
        cv.set(6, 5, 'WHITE')
        cv.set(5, 6, 'WHITE')
        cv.outline('INK')
        return_cv = cv
        out.append(return_cv)
    return out


# ---------------------------------------------------------------- bg_sky 360×270
W, HH = 360, 270


def bg_sky():
    cv = WrapCanvas(W, HH)
    cv.rect(0, 0, W, HH, 'BLU4')
    cv.dither(0, 0, W, 40, 'BLU5', None, mode='sparse')
    # 远景草坡（周期 180 / 120 / 90 -> 360 内整周期，左右无缝）
    for x in range(W):
        top = 232 + G.wave(x, 180, 12) + G.wave(x, 120, 6, 0.7) + G.wave(x, 90, 3, 2.0)
        cv.vline(x, top, HH - 1, 'GRN4')
        cv.set(x, top, 'GRN5')
        if x % 2 == 0:
            cv.set(x, top + 1, 'GRN5')
        for y in range(top + 4, HH):
            if (x + y) % 6 == 0:
                cv.set(x, y, 'GRN3')
    assert len(cv.d) == W * HH
    return cv


# ---------------------------------------------------------------- main
def main():
    print('== D3 mario ==')
    hero_sheets()
    mush_sheet()
    shell_sheet()
    tiles_sheet()
    item_sheet()
    G.save_single(cloud(), f'{OUT}/cloud.png', 32, 24)
    G.save_single(bush(), f'{OUT}/bush.png', 40, 20)
    G.save_single(castle(), f'{OUT}/castle.png', 80, 80)
    save_frames(flag_frames(), f'{OUT}/flag.png', 14, 14)
    sky = bg_sky()
    img = G.binarize(sky.to_image())
    seam, avg = G.assert_wrap_x(img, 'bg_sky.png')
    print(f'  bg_sky 横向接缝差={seam:.2f} 内部均差={avg:.2f}')
    G.save_single(sky, f'{OUT}/bg_sky.png', 360, 270)


if __name__ == '__main__':
    main()

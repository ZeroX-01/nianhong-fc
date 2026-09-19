#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""D2 —— tank/ 俯视坦克战《铁甲坦克 1990》美术生产（可重复运行）
输出：assets/img/games/tank/
坦克帧序严格为：上A 上B 右A 右B 下A 下B 左A 左B（代码按此索引）。
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gamelib as G
from gamelib import Canvas, WrapCanvas, from_rows, save_frames

OUT = 'assets/img/games/tank'

# ---------------------------------------------------------------- 坦克 16×16
# K=描边/暗部  D=履带暗  L=履带亮/高光  M=车身主色
TANK_STD = [
    "................",
    "......KMMK......",
    "......KMMK......",
    "KKKKKKKMMKKKKKKK",
    "KDDKMMMKKMMMKDDK",
    "KLLKMMMKKMMMKLLK",
    "KDDKMMKKKKMMKDDK",
    "KLLKMMKLLKMMKLLK",
    "KDDKMMKLLKMMKDDK",
    "KLLKMMKKKKMMKLLK",
    "KDDKMMMMMMMMKDDK",
    "KLLKMMMMMMMMKLLK",
    "KDDKMMMMMMMMKDDK",
    "KLLKMMMMMMMMKLLK",
    "KDDKMMMMMMMMKDDK",
    "KKKKKKKKKKKKKKKK",
]

TANK_FAST = [
    "......KMMK......",
    "......KMMK......",
    "......KMMK......",
    "KKKKKKKMMKKKKKKK",
    "KDDKMMMKKMMMKDDK",
    "KLLKMMMKKMMMKLLK",
    "KDDKMMKKKKMMKDDK",
    "KLLKMMKLLKMMKLLK",
    "KDDKMMKLLKMMKDDK",
    "KLLKMMKKKKMMKLLK",
    "KDDKMMMMMMMMKDDK",
    "KLLKMMMMMMMMKLLK",
    "KDDKMMMMMMMMKDDK",
    "KLLKMMMMMMMMKLLK",
    "KDDKMMMMMMMMKDDK",
    "KKKKKKKKKKKKKKKK",
]

TANK_HEAVY = [
    "................",
    "......KMMK......",
    "......KMMK......",
    "KKKKKKKMMKKKKKKK",
    "KDDKMLLKKLLMKDDK",
    "KLLKMLLKKLLMKLLK",
    "KDDKMMKKKKMMKDDK",
    "KLLKMMKLLKMMKLLK",
    "KDDKMMKLLKMMKDDK",
    "KLLKMMKKKKMMKLLK",
    "KDDKMDMMMMDMKDDK",
    "KLLKMMMMMMMMKLLK",
    "KDDKMDMMMMDMKDDK",
    "KLLKMMMMMMMMKLLK",
    "KDDKMLMMMMLMKDDK",
    "KKKKKKKKKKKKKKKK",
]


def rot_cw(cv):
    """顺时针 90°：(x,y) -> (h-1-y, x)。16×16 精确无损。"""
    out = Canvas(cv.h, cv.w)
    for (x, y), v in cv.d.items():
        out.d[(cv.h - 1 - y, x)] = v
    return out


def tread_swap(rows):
    """履带 B 帧：把履带列的 D/L 相位对调。"""
    out = []
    for r in rows:
        s = list(r)
        for i in (1, 2, 13, 14):
            if s[i] == 'D':
                s[i] = 'L'
            elif s[i] == 'L':
                s[i] = 'D'
        out.append(''.join(s))
    return out


def tank_sheet(rows, name, main, dark, light, outline='INK'):
    cmap = {'K': outline, 'D': dark, 'L': light, 'M': main}
    up_a = from_rows(rows, cmap, 16, 16)
    up_b = from_rows(tread_swap(rows), cmap, 16, 16)
    frames = []
    for i in range(4):                       # 上 -> 右 -> 下 -> 左
        a, b = up_a, up_b
        for _ in range(i):
            a, b = rot_cw(a), rot_cw(b)
        frames += [a, b]
    assert len(frames) == 8
    save_frames(frames, f'{OUT}/{name}', 16, 16)


# ---------------------------------------------------------------- bullet 6×6 ×4
BULLET_UP = [
    "..KK..",
    ".KWWK.",
    ".KWWK.",
    ".KWWK.",
    ".KGGK.",
    "..KK..",
]


def bullet_sheet():
    up = from_rows(BULLET_UP, {'K': 'INK', 'W': 'WHITE', 'G': 'GREY6'}, 6, 6)
    fr = [up]
    cur = up
    for _ in range(3):
        cur = rot_cw(cur)
        fr.append(cur)
    save_frames(fr, f'{OUT}/bullet.png', 6, 6)


# ---------------------------------------------------------------- tiles 16×16 ×6
def t_brick():
    cv = WrapCanvas(16, 16)
    for y in range(16):
        row = y // 4
        for x in range(16):
            c = 'RED3'
            if y % 4 == 0:
                c = 'RED4'
            elif y % 4 == 3:
                c = 'RED1'
            cv.set(x, y, c)
        vx = (7, 15) if row % 2 == 0 else (3, 11)
        for x in vx:
            cv.vline(x, y, y, 'RED1')
    return cv


def t_steel():
    cv = WrapCanvas(16, 16)
    for by in (0, 8):
        for bx in (0, 8):
            cv.rect(bx, by, 8, 8, 'GREY6')
            cv.hline(bx, bx + 7, by, 'GREY8')
            cv.vline(bx, by, by + 7, 'GREY8')
            cv.hline(bx, bx + 7, by + 7, 'GREY3')
            cv.vline(bx + 7, by, by + 7, 'GREY3')
            cv.hline(bx + 2, bx + 5, by + 3, 'GREY4')
            cv.hline(bx + 2, bx + 5, by + 4, 'GREY8')
            cv.vline(bx + 3, by + 2, by + 5, 'GREY4')
            cv.vline(bx + 4, by + 2, by + 5, 'GREY8')
    return cv


def t_bush():
    """半透感用棋盘 dither（(x+y)%2 透明）实现，绝不使用中间 alpha。"""
    cv = WrapCanvas(16, 16)
    cv.rect(0, 0, 16, 16, 'GRN3')
    for cx, cy, r in ((4, 4, 4), (12, 4, 4), (4, 12, 4), (12, 12, 4), (8, 8, 4)):
        for y in range(cy - r, cy + r + 1):
            dx = int((r * r - (y - cy) ** 2) ** 0.5) if abs(y - cy) <= r else 0
            cv.hline(cx - dx, cx + dx, y, 'GRN4')
    for cx, cy in ((4, 4), (12, 4), (4, 12), (12, 12), (8, 8)):
        cv.set(cx - 1, cy - 1, 'GRN2')
        cv.set(cx, cy - 2, 'GRN2')
        cv.set(cx + 1, cy + 1, 'GRN2')
    # 棋盘挖空
    for y in range(16):
        for x in range(16):
            if (x + y) % 2:
                cv.clear(x, y)
    return cv


def t_water():
    cv = WrapCanvas(16, 16)
    for y in range(16):
        for x in range(16):
            cv.set(x, y, 'BLU2' if (x + y) % 2 else 'BLU3')
    for cy in (3, 11):
        for x in range(16):
            yy = cy + (1 if x % 8 in (2, 3, 4) else 0)
            cv.set(x, yy, 'BLU5')
            cv.set(x, yy - 1, 'BLU5' if x % 4 == 1 else None)
            cv.set(x, yy + 1, 'BLU1')
    return cv


def t_ice():
    """冰面：横向长短划痕 + 少量高光点（不用生硬的斜格纹）。"""
    cv = WrapCanvas(16, 16)
    cv.rect(0, 0, 16, 16, 'BLU5')
    cv.dither(0, 0, 16, 16, 'GREY8', None, mode='sparse')
    for y, x0, ln in ((2, 1, 7), (5, 9, 6), (7, 3, 5), (10, 8, 7), (13, 2, 6)):
        cv.hline(x0, x0 + ln - 1, y, 'WHITE')
        cv.hline(x0 + 1, x0 + ln - 2, y + 1, 'BLU4')
    for x, y in ((6, 3), (13, 8), (4, 11), (11, 14)):
        cv.set(x, y, 'WHITE')
    cv.hline(0, 15, 0, 'BLU4')
    return cv


def t_empty():
    cv = WrapCanvas(16, 16)
    cv.rect(0, 0, 16, 16, 'INK')
    return cv


def tiles_sheet():
    fr = [t_brick(), t_steel(), t_bush(), t_water(), t_ice(), t_empty()]
    save_frames(fr, f'{OUT}/tiles.png', 16, 16, maxcolors=None, wrap_x=True,
                wrap_y=[0, 1, 2, 3, 4, 5])


# ---------------------------------------------------------------- base 32×32
BASE_OK = [
    "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
    "KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK",
    "KGGGGGGGGGGGGGGYYGGGGGGGGGGGGGGK",
    "KGGGGGGGGGGGGGGYYGGGGGGGGGGGGGGK",
    "KGGGGGGGGGGGGGYYYYGGGGGGGGGGGGGK",
    "KGGGGGGGGGGGGGYKKYGGGGGGGGGGGGGK",
    "KGGGGGGGGGGGGGYYYYGGGGGGGGGGGGGK",
    "KGGGGGGGGGGGGGGYYGGGGGGGGGGGGGGK",
    "KGGGYYGGGGGGGGYYYYGGGGGGGGYYGGGK",
    "KGGYYYYGGGGGGYYYYYYGGGGGGYYYYGGK",
    "KGGYYYYYYGGGYYYYYYYYGGGYYYYYYGGK",
    "KGGGYYYYYYYYYYYYYYYYYYYYYYYYYGGK",
    "KGGGGYYYYYYYYYYYYYYYYYYYYYYYYGGK",
    "KGGGGGYYYYYYYYYYYYYYYYYYYYYYGGGK",
    "KGGGGGGYYYYYYYYYYYYYYYYYYYYGGGGK",
    "KGGGGGGGGYYYYYYYYYYYYYYYYGGGGGGK",
    "KGGGGGGGGGGYYYYYYYYYYYYGGGGGGGGK",
    "KGGGGGGGGGGGGYYYYYYYYGGGGGGGGGGK",
    "KGGGGGGGGGGGGYYYYYYYYGGGGGGGGGGK",
    "KGGGGGGGGGGGGGYYYYYYGGGGGGGGGGGK",
    "KGGGGGGGGGGGGGYYYYYYGGGGGGGGGGGK",
    "KGGGGGGGGGGGGYYYYYYYYGGGGGGGGGGK",
    "KGGGGGGGGGGGYYYGGGYYYGGGGGGGGGGK",
    "KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK",
    "KSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSK",
    "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
    "KSSSSSSSKSSSSSSSKSSSSSSSKSSSSSSK",
    "KSSSSSSSKSSSSSSSKSSSSSSSKSSSSSSK",
    "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
    "KSSSKSSSSSSSKSSSSSSSKSSSSSSSKSSK",
    "KSSSKSSSSSSSKSSSSSSSKSSSSSSSKSSK",
    "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
]

def base_dead():
    """帧2 被摧毁：焦黑 GREY2 + RED4 火苗（INK/GREY2/RED4/YEL3 共 4 色）"""
    cv = Canvas(32, 32)
    cv.rect(0, 0, 32, 32, 'GREY2')
    cv.frame(0, 0, 32, 32, 'INK')
    # 焦痕与裂缝
    for x in range(1, 31):
        y = 22 + (x % 5 // 3)
        cv.hline(1, 30, 24, 'INK')
        cv.set(x, y, 'INK')
    for x0 in (5, 13, 21, 27):
        cv.line(x0, 24, x0 - 3, 30, 'INK')
    cv.dither(1, 1, 30, 22, 'INK', None, mode='sparse')
    # 倒塌的基座残块
    for bx, by, bw, bh in ((2, 25, 7, 4), (11, 26, 6, 3), (19, 25, 5, 4),
                           (25, 27, 5, 2)):
        cv.rect(bx, by, bw, bh, 'GREY2')
        cv.frame(bx, by, bw, bh, 'INK')
    # 三簇火苗
    for cx, base_y, hgt in ((9, 24, 15), (17, 25, 19), (24, 24, 12)):
        for i in range(hgt):
            y = base_y - i
            t = i / float(hgt)
            wd = max(1, int((1 - t) * 7 + 1))
            off = int(2 * math.sin(i * 0.7)) if i > hgt // 2 else 0
            cv.hline(cx - wd // 2 + off, cx - wd // 2 + wd - 1 + off, y, 'RED4')
            if wd >= 4:
                cv.hline(cx - wd // 4 + off, cx + wd // 4 - 1 + off, y, 'YEL3')
    cv.dither(1, 6, 30, 20, 'RED4', None, mode='sparse', only_on=[G.PAL['YEL3']])
    # 保留基座残骸（让玩家看出"目标物被毁"而不是"障碍消失"）
    cv.rect(1, 28, 30, 3, 'GREY2')
    cv.hline(1, 30, 28, 'INK')
    for x in range(2, 31, 4):
        cv.vline(x, 29, 30, 'INK')
    return cv


def base_sheet():
    ok = from_rows(BASE_OK, {'K': 'INK', 'G': 'GREY7', 'Y': 'YEL3', 'S': 'GREY5'},
                   32, 32)
    dead = base_dead()
    save_frames([ok, dead], f'{OUT}/base.png', 32, 32)


# ---------------------------------------------------------------- explosion 32×32
def flame(cv, cx, cy, R, col, lobes=5, amp=0.28, phase=0.0):
    """极坐标带尖角的火焰团（NES 爆炸的锯齿感），逐像素判定无抗锯齿。"""
    rng = int(R * (1 + amp)) + 2
    for y in range(int(cy) - rng, int(cy) + rng + 1):
        for x in range(int(cx) - rng, int(cx) + rng + 1):
            dx, dy = x - cx, y - cy
            r = math.hypot(dx, dy)
            th = math.atan2(dy, dx)
            if r <= R * (1 + amp * math.cos(lobes * th + phase)):
                cv.set(x, y, col)


def explosion_frames():
    f1 = Canvas(32, 32)
    flame(f1, 15.5, 15.5, 5, 'YEL3', 4, 0.35, 0.8)
    flame(f1, 15.5, 15.5, 3, 'YEL4', 4, 0.4, 0.8)
    f1.rect(15, 15, 2, 2, 'WHITE')
    for dx, dy in ((0, -9), (9, 0), (0, 9), (-9, 0), (7, -7), (-7, 7)):
        f1.rect(15 + dx, 15 + dy, 2, 2, 'YEL3')

    f2 = Canvas(32, 32)
    flame(f2, 15.5, 15.5, 11, 'YEL3', 6, 0.3, 0.4)
    flame(f2, 15.5, 15.5, 7, 'YEL4', 5, 0.3, 1.6)
    flame(f2, 15.5, 15.0, 3, 'WHITE', 4, 0.3)
    f2.dither(0, 0, 32, 32, 'YEL4', None, mode='sparse', only_on=[G.PAL['YEL3']])

    f3 = Canvas(32, 32)
    flame(f3, 15.5, 15.5, 15, 'RED4', 7, 0.22, 0.2)
    flame(f3, 15.5, 15.5, 10, 'YEL3', 6, 0.26, 1.0)
    flame(f3, 14.5, 15.5, 5, 'YEL4', 5, 0.3, 2.0)
    f3.dither(0, 0, 32, 32, 'YEL3', None, mode='sparse', only_on=[G.PAL['RED4']])

    f4 = Canvas(32, 32)
    flame(f4, 15.5, 14.5, 14, 'GREY5', 8, 0.24, 0.9)
    f4.dither(0, 0, 32, 32, 'RED4', None, mode='quarter', only_on=[G.PAL['GREY5']])
    flame(f4, 14.0, 14.0, 6, 'RED4', 5, 0.3, 1.2)
    flame(f4, 14.0, 14.0, 3, 'YEL3', 4, 0.3)

    f5 = Canvas(32, 32)
    for cx, cy, r in ((9, 10, 8), (22, 15, 8), (14, 25, 7), (25, 5, 4)):
        flame(f5, cx, cy, r, 'GREY5', 5, 0.25, cx * 0.7)
    f5.dither(0, 0, 32, 32, None, None, mode='checker', only_on=[G.PAL['GREY5']])
    for cx, cy, r in ((9, 10, 4), (22, 15, 4)):
        flame(f5, cx, cy, r, 'GREY7', 4, 0.3)
    f5.dither(0, 0, 32, 32, 'GREY7', None, mode='checker', only_on=[G.PAL['GREY7']])
    return [f1, f2, f3, f4, f5]


# ---------------------------------------------------------------- item 16×16 ×6
def item_base():
    cv = Canvas(16, 16)
    cv.rect(0, 0, 16, 16, 'INK')
    cv.frame(0, 0, 16, 16, 'YEL4')
    cv.frame(1, 1, 14, 14, 'INK')
    return cv


def i_star():
    """INK 底 + YEL4 边框 + YEL3/WHITE 星（共 4 色）"""
    cv = item_base()
    rows = {3: (8, 8), 4: (7, 9), 5: (7, 9), 6: (3, 12), 7: (4, 11),
            8: (5, 10), 9: (5, 10), 10: (4, 6), 11: (3, 5)}
    for y, (a, b) in rows.items():
        cv.hline(a, b, y, 'YEL3')
    cv.hline(9, 11, 10, 'YEL3')
    cv.hline(10, 12, 11, 'YEL3')
    cv.hline(7, 8, 4, 'WHITE')
    cv.hline(6, 9, 7, 'WHITE')
    cv.hline(6, 9, 8, 'YEL4')
    return cv


def i_helmet():
    """钢盔：实心圆顶 + 宽帽檐 + 下颚带（GREY7/GREY4 两色）"""
    cv = item_base()
    for i, wd in enumerate((6, 8, 10, 10, 10, 10)):       # 圆顶 y4..y9
        cv.rect(8 - wd // 2, 4 + i, wd, 1, 'GREY7')
    cv.rect(3, 10, 10, 1, 'GREY7')
    cv.rect(2, 11, 12, 2, 'GREY4')                        # 帽檐
    cv.hline(5, 9, 4, 'GREY4')                            # 顶部高光的反面（压暗）
    cv.hline(3, 12, 10, 'GREY4')
    cv.vline(4, 8, 10, 'GREY4')                           # 侧面暗部
    cv.vline(11, 8, 10, 'GREY4')
    return cv


def i_grenade():
    cv = item_base()
    for y in range(6, 13):
        r = 4
        dx = int((r * r - (y - 9) ** 2) ** 0.5) if abs(y - 9) <= r else 0
        cv.hline(8 - dx, 8 + dx - 1, y, 'GRN4')
    cv.rect(7, 3, 2, 4, 'GRN2')
    cv.rect(9, 3, 3, 1, 'GRN2')
    cv.rect(11, 4, 1, 2, 'GRN2')
    cv.dither(5, 8, 7, 4, 'GRN2', None, mode='quarter', only_on=[G.PAL['GRN4']])
    cv.hline(6, 9, 6, 'YEL4')
    return cv


def i_shovel():
    cv = item_base()
    cv.rect(7, 3, 2, 6, 'WOOD5')
    cv.rect(6, 3, 4, 1, 'WOOD5')
    for i, wd in enumerate((9, 9, 7, 5, 3)):
        cv.rect(8 - wd // 2, 9 + i, wd, 1, 'GREY7')
    cv.hline(4, 11, 9, 'YEL4')
    return cv


def i_tank():
    """加命：一辆黄色小坦克（履带 GREY7 + 车体 YEL3 + 炮管朝上）"""
    cv = item_base()
    for y in range(5, 13):                                 # 左右履带
        col = 'GREY7' if y % 2 else 'INK'
        cv.rect(3, y, 2, 1, col)
        cv.rect(11, y, 2, 1, col)
    cv.rect(5, 6, 6, 6, 'YEL3')                            # 车体
    cv.rect(6, 8, 4, 2, 'YEL4')                            # 炮塔
    cv.rect(7, 2, 2, 5, 'YEL3')                            # 炮管
    cv.hline(7, 8, 2, 'YEL4')
    cv.hline(5, 10, 12, 'YEL4')                            # 车底压暗
    return cv


def i_timer():
    cv = item_base()
    for y in range(4, 13):
        r = 5
        dx = int((r * r - (y - 8) ** 2) ** 0.5) if abs(y - 8) <= r else 0
        cv.hline(8 - dx, 8 + dx - 1, y, 'GREY8')
    cv.hline(6, 9, 3, 'GREY6')
    cv.vline(7, 5, 8, 'INK')
    cv.hline(7, 10, 8, 'INK')
    cv.dither(4, 9, 9, 4, 'GREY6', None, mode='quarter', only_on=[G.PAL['GREY8']])
    cv.hline(6, 9, 12, 'YEL4')
    return cv


def item_sheet():
    fr = [i_star(), i_helmet(), i_grenade(), i_shovel(), i_tank(), i_timer()]
    save_frames(fr, f'{OUT}/item.png', 16, 16, maxcolors=4)


# ---------------------------------------------------------------- spawn 16×16 ×4
def spawn_frames():
    out = []
    for k, r in enumerate((2, 4, 6, 7)):
        cv = Canvas(16, 16)
        c1 = 'WHITE' if k % 2 == 0 else 'BLU5'
        c2 = 'BLU5' if k % 2 == 0 else 'WHITE'
        cv.hline(8 - r, 7 + r, 7, c1)
        cv.hline(8 - r, 7 + r, 8, c1)
        cv.vline(7, 8 - r, 7 + r, c1)
        cv.vline(8, 8 - r, 7 + r, c1)
        for i in range(r - 1):
            cv.set(7 - i, 7 - i, c2)
            cv.set(8 + i, 7 - i, c2)
            cv.set(7 - i, 8 + i, c2)
            cv.set(8 + i, 8 + i, c2)
        cv.rect(6, 6, 4, 4, c1)
        cv.rect(7, 7, 2, 2, 'WHITE')
        if k == 3:
            for i in range(4):
                cv.set(2 + i * 4, 2, 'BLU5')
                cv.set(2 + i * 4, 13, 'BLU5')
        return_cv = cv
        out.append(return_cv)
    return out


# ---------------------------------------------------------------- main
def main():
    print('== D2 tank ==')
    tank_sheet(TANK_STD, 'tank_player.png', 'YEL3', 'YEL1', 'YEL4')
    tank_sheet(TANK_STD, 'tank_enemy_a.png', 'GREY7', 'GREY4', 'WHITE')
    tank_sheet(TANK_FAST, 'tank_enemy_b.png', 'GRN4', 'GRN2', 'GRN5')
    tank_sheet(TANK_HEAVY, 'tank_enemy_c.png', 'WOOD5', 'WOOD3', 'WOOD7')
    bullet_sheet()
    tiles_sheet()
    base_sheet()
    save_frames(explosion_frames(), f'{OUT}/explosion.png', 32, 32)
    item_sheet()
    save_frames(spawn_frames(), f'{OUT}/spawn.png', 16, 16, maxcolors=3)


if __name__ == '__main__':
    main()

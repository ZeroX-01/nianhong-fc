#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""D1 —— contra/ 横版跑打《魂斗萝》美术生产（可重复运行）
输出：assets/img/games/contra/
每个精灵严格 <= 4 色（含描边），全部整像素、无抗锯齿。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gamelib as G
from gamelib import Canvas, WrapCanvas, from_rows, recolor, save_frames

OUT = 'assets/img/games/contra'

# ---------------------------------------------------------------- hero 20×26
# K=INK 描边/头发/枪  S=SKN3 皮肤  B=BLU3 裤子  R=RED4 头带
HERO = {'K': 'INK', 'S': 'SKN3', 'B': 'BLU3', 'R': 'RED4'}

H_STAND = [
    "....................",
    ".....KKKKK..........",
    "....KRRRRRK.........",
    "....KRRRRRK.........",
    "....KSSSSSK.........",
    "....KSKSSSK.........",
    "....KSSSSSK.........",
    ".....KSSSK..........",
    "....KKSSKK..........",
    "...KSSSSSSK.........",
    "..KSSSSSSSSK........",
    "..KSSSSSSSSSK.......",
    "..KSSSSSSSSSSK......",
    "..KSSSSSSSSSSKKKKKKK",
    "..KSSSSSSSKKKKK.....",
    "..KSSSSSSSK.........",
    "..KBBBBBBBK.........",
    "..KBBBBBBBK.........",
    "..KBBBKBBBK.........",
    "..KBBK.KBBK.........",
    "..KBBK.KBBK.........",
    "..KBBK.KBBK.........",
    "..KBBK.KBBK.........",
    "..KBBK.KBBK.........",
    ".KKBBK.KBBKK........",
    ".KKKKK.KKKKK........",
]

H_RUN_A = [
    "....................",
    "......KKKKK.........",
    ".....KRRRRRK........",
    ".....KRRRRRK........",
    ".....KSSSSSK........",
    ".....KSKSSSK........",
    ".....KSSSSSK........",
    "......KSSSK.........",
    ".....KKSSKK.........",
    "....KSSSSSSK........",
    "...KSSSSSSSSK.......",
    "..KSSSSSSSSSSK......",
    "..KSSSSSSSSSSSK.....",
    "..KSSSSSSSSSSSKKKKKK",
    "..KSSSSSSSSKKKKK....",
    "..KSSSSSSSK.........",
    "..KBBBBBBBK.........",
    "..KBBBKBBBK.........",
    ".KBBK..KBBBK........",
    ".KBBK...KBBBK.......",
    "KBBK.....KBBBK......",
    "KBBK......KBBBK.....",
    "KBBK.......KBBK.....",
    "KBBK.......KBBK.....",
    "KKBK.......KKBBKK...",
    "KKKK.......KKKKKK...",
]

H_RUN_B = [
    "....................",
    ".....KKKKK..........",
    "....KRRRRRK.........",
    "....KRRRRRK.........",
    "....KSSSSSK.........",
    "....KSKSSSK.........",
    "....KSSSSSK.........",
    ".....KSSSK..........",
    "....KKSSKK..........",
    "...KSSSSSSK.........",
    "..KSSSSSSSSK........",
    "..KSSSSSSSSSK.......",
    "..KSSSSSSSSSSK......",
    "..KSSSSSSSSSSKKKKKKK",
    "..KSSSSSSSKKKKK.....",
    "..KSSSSSSSK.........",
    "..KBBBBBBBK.........",
    "..KBBBBBBBK.........",
    "..KBBBKBBBK.........",
    "..KBBK.KBBBK........",
    "..KBBK..KBBBK.......",
    "..KBBK..KKBBK.......",
    "..KBBK...KKBBKK.....",
    "..KBBK...KKKKKK.....",
    ".KKBBKK.............",
    ".KKKKKK.............",
]

H_JUMP = [   # 跳跃抱腿：整体上移，底部 5 行留空（说明见报告）
    "......KKKKK.........",
    ".....KRRRRRK........",
    ".....KRRRRRK........",
    ".....KSSSSSK........",
    ".....KSKSSSK........",
    ".....KSSSSSK........",
    "....KKSSSKK.........",
    "...KSSSSSSK.........",
    "..KSSSSSSSSKKKKKK...",
    "..KSSSSSSSSKKKKKK...",
    "..KSSSSSSSSSK.......",
    "..KSSSSSSSSK........",
    ".KBBBBBBBBBK........",
    ".KBBBBBBBBBBK.......",
    ".KBBKKKKKBBBK.......",
    ".KBBK...KBBBK.......",
    ".KBBK...KBBK........",
    ".KKBBKKKBBKK........",
    "..KKKKKKKKK.........",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
]

H_PRONE = [  # 卧倒：贴地，头朝右、枪朝右
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "..........KKKK......",
    ".........KRRRRK.....",
    "........KKSSSSK.....",
    "..KKKKKKKSSSSSKKKKKK",
    ".KBBBBBBSSSSSKKKKK..",
    ".KBBBBBBBSSSSK......",
    "KKBBBBBBBBKKK.......",
    "KBBBBBBBBBK.........",
    "KKKKKKKKKKK.........",
]

H_UPSHOOT = [
    ".............KK.....",
    ".............KK.....",
    ".............KK.....",
    ".............KK.....",
    "....KKKKK....KK.....",
    "...KRRRRRK...KK.....",
    "...KRRRRRK...KK.....",
    "...KSSSSSK...KK.....",
    "...KSSSSSK..KKKK....",
    "....KSSSK..KSSKK....",
    "...KKSSKK.KSSK......",
    "..KSSSSSSKSSK.......",
    "..KSSSSSSSSK........",
    "..KSSSSSSSSK........",
    "..KSSSSSSSK.........",
    "..KBBBBBBBK.........",
    "..KBBBBBBBK.........",
    "..KBBBKBBBK.........",
    "..KBBK.KBBK.........",
    "..KBBK.KBBK.........",
    "..KBBK.KBBK.........",
    "..KBBK.KBBK.........",
    "..KBBK.KBBK.........",
    "..KBBK.KBBK.........",
    ".KKBBK.KBBKK........",
    ".KKKKK.KKKKK........",
]

H_DEAD = [
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "...........KKKK.....",
    "..........KRRRRK....",
    "....KKKK..KSSSSK....",
    "...KSSSSK.KSKSSK....",
    ".KKKSSSSKKKSSSSK....",
    "KSSKSSSSSSSSSSSK....",
    "KSSSSSSSSSSSSSKK....",
    "KBBBBBBBBSSSSSK.....",
    "KKBBBBBBBKSSSKK.....",
    ".KKKKKKKKKKKKK......",
]


def hero_sheet():
    frames = [from_rows(r, HERO, 20, 26) for r in
              (H_STAND, H_RUN_A, H_RUN_B, H_JUMP, H_PRONE, H_UPSHOOT)]
    hit = recolor(frames[0], {'SKN3': 'WHITE', 'BLU3': 'WHITE', 'RED4': 'WHITE'})
    dead = from_rows(H_DEAD, HERO, 20, 26)
    out = [frames[0], frames[1], frames[2], frames[3], frames[4], frames[5], hit, dead]
    for i, f in enumerate(out):
        if i == 3:      # 跳跃帧允许离地
            continue
        G.assert_bottom_aligned(f, 'hero.png', f'帧{i + 1}')
    save_frames(out, f'{OUT}/hero.png', 20, 26)


# ---------------------------------------------------------------- enemy_soldier 18×24
SOL = {'K': 'INK', 'R': 'RED3', 'S': 'SKN2', 'G': 'GREY6'}

S_WALK_A = [
    "..................",
    "......KKKKK.......",
    ".....KGGGGGK......",
    ".....KGGGGGK......",
    ".....KSSSSSK......",
    ".....KSKSSSK......",
    ".....KSSSSSK......",
    "......KSSSK.......",
    ".....KKRRKK.......",
    "....KRRRRRRK......",
    "...KRRRRRRRRK.....",
    "...KRRRRRRRRKKKKK.",
    "...KRRRRRRRKKK....",
    "...KRRRRRRRK......",
    "...KRRRRRRRK......",
    "...KRRRKRRRK......",
    "...KRRK.KRRK......",
    "..KRRK...KRRK.....",
    "..KRRK...KRRK.....",
    ".KRRK.....KRRK....",
    ".KRRK.....KRRK....",
    ".KRRK.....KRRK....",
    "KKRKK....KKRRKK...",
    "KKKKK....KKKKKK...",
]

S_WALK_B = [
    "..................",
    "......KKKKK.......",
    ".....KGGGGGK......",
    ".....KGGGGGK......",
    ".....KSSSSSK......",
    ".....KSKSSSK......",
    ".....KSSSSSK......",
    "......KSSSK.......",
    ".....KKRRKK.......",
    "....KRRRRRRK......",
    "...KRRRRRRRRK.....",
    "...KRRRRRRRRKKKKK.",
    "...KRRRRRRRKKK....",
    "...KRRRRRRRK......",
    "...KRRRRRRRK......",
    "...KRRRRRRRK......",
    "...KRRRKRRRK......",
    "...KRRK.KRRK......",
    "...KRRK.KRRK......",
    "...KRRK.KRRK......",
    "...KRRK.KRRK......",
    "...KRRK.KRRK......",
    "..KKRKK.KKRKK.....",
    "..KKKKK.KKKKK.....",
]

S_SHOOT = [
    "..................",
    "......KKKKK.......",
    ".....KGGGGGK......",
    ".....KGGGGGK......",
    ".....KSSSSSK......",
    ".....KSSKSSK......",
    ".....KSSSSSK......",
    "......KSSSK.......",
    ".....KKRRKK.......",
    "....KRRRRRRK......",
    "...KRRRRRRRRK.....",
    "...KRRRRRRRSSKKKKK",
    "...KRRRRRRRKKKKK..",
    "...KRRRRRRRK......",
    "...KRRRRRRRK......",
    "...KRRRKRRRK......",
    "...KRRK.KRRK......",
    "..KRRK..KRRK......",
    "..KRRK..KRRK......",
    ".KRRK...KRRK......",
    ".KRRK...KRRK......",
    ".KRRK...KRRKK.....",
    "KKRKK...KKRRKK....",
    "KKKKK...KKKKKK....",
]

S_DEAD = [
    "..................",
    "..................",
    "..................",
    "..................",
    "..................",
    "..................",
    "..................",
    "..................",
    "..................",
    "..................",
    "..................",
    "..................",
    "..................",
    "..................",
    "..................",
    ".........KKKKK....",
    "........KGGGGGK...",
    "...KKK..KGSSSGK...",
    "..KSSSK.KSKSSKK...",
    ".KKSSSKKKSSSSK....",
    "KRRKSSSSSSSSSK....",
    "KRRRRRRRRSSSKK....",
    "KKRRRRRRRKKKK.....",
    ".KKKKKKKKK........",
]


def soldier_sheet():
    fr = [from_rows(r, SOL, 18, 24) for r in (S_WALK_A, S_WALK_B, S_SHOOT, S_DEAD)]
    for i, f in enumerate(fr):
        G.assert_bottom_aligned(f, 'enemy_soldier.png', f'帧{i + 1}')
    save_frames(fr, f'{OUT}/enemy_soldier.png', 18, 24)


# ---------------------------------------------------------------- enemy_turret 24×24
def turret(flash):
    """flash: 0/1/2 开火强度。GREY3/GREY6/GREY8/YEL4 共 4 色。"""
    cv = Canvas(24, 24)
    # 底座（贴地）
    cv.rect(2, 16, 20, 8, 'GREY6')
    cv.frame(2, 16, 20, 8, 'GREY3')
    for x in range(4, 21, 4):
        cv.set(x, 18, 'GREY8')
        cv.set(x, 22, 'GREY3')
    cv.hline(3, 20, 17, 'GREY8')
    # 半球炮塔
    for y in range(7, 17):
        dy = 16 - y
        half = int((100 - dy * dy) ** 0.5)
        cv.hline(12 - half, 12 + half - 1, y, 'GREY6')
    for y in range(7, 17):
        dy = 16 - y
        half = int((100 - dy * dy) ** 0.5)
        cv.set(12 - half, y, 'GREY3')
        cv.set(12 + half - 1, y, 'GREY3')
    cv.hline(9, 14, 5, 'GREY3')
    cv.hline(9, 13, 6, 'GREY8')
    cv.set(8, 7, 'GREY8')
    cv.set(8, 8, 'GREY8')
    # 观察窗 / 蓄能灯
    cv.rect(10, 9, 5, 3, 'GREY3')
    cv.rect(11, 10, 3, 1, 'YEL4' if flash else 'GREY6')
    # 炮管（朝左）
    cv.rect(0, 11, 9, 4, 'GREY6')
    cv.hline(0, 8, 11, 'GREY3')
    cv.hline(0, 8, 14, 'GREY3')
    cv.hline(1, 7, 12, 'GREY8')
    cv.rect(6, 10, 3, 6, 'GREY6')
    cv.frame(6, 10, 3, 6, 'GREY3')
    # 火焰
    if flash == 1:
        cv.rect(0, 12, 2, 2, 'YEL4')
    elif flash == 2:
        for i, wdt in enumerate((6, 4, 2)):
            cv.rect(0, 13 - i, wdt, 1, 'YEL4')
            cv.rect(0, 12 + i, wdt, 1, 'YEL4')
        cv.rect(0, 11, 3, 4, 'YEL4')
    return cv


def turret_sheet():
    fr = [turret(0), turret(1), turret(2)]
    for i, f in enumerate(fr):
        G.assert_bottom_aligned(f, 'enemy_turret.png', f'帧{i + 1}')
    save_frames(fr, f'{OUT}/enemy_turret.png', 24, 24)


# ---------------------------------------------------------------- boss_wall 96×88
def boss(core):
    """core: 核心颜色名。GREY2/GREY5/GREY7 + core = 4 色。"""
    cv = Canvas(96, 88)
    cv.rect(0, 0, 96, 88, 'GREY5')
    # 装甲板格：3 列 × 2 行大板 + 接缝
    for gy in (0, 44):
        for gx in (0, 32, 64):
            cv.rect(gx + 1, gy + 1, 30, 42, 'GREY5')
            cv.hline(gx + 1, gx + 30, gy + 1, 'GREY7')
            cv.vline(gx + 1, gy + 1, gy + 42, 'GREY7')
            cv.hline(gx + 1, gx + 30, gy + 42, 'GREY2')
            cv.vline(gx + 30, gy + 2, gy + 42, 'GREY2')
            for ry in (gy + 5, gy + 38):
                for rx in (gx + 5, gx + 26):
                    cv.set(rx, ry, 'GREY7')
                    cv.set(rx + 1, ry, 'GREY2')
                    cv.set(rx, ry + 1, 'GREY2')
                    cv.set(rx + 1, ry + 1, 'GREY2')
    for x in (0, 32, 64, 95):
        cv.vline(x, 0, 87, 'GREY2')
    for y in (0, 43, 44, 87):
        cv.hline(0, 95, y, 'GREY2')
    # 通风格栅
    for gx in (6, 70):
        for y in range(14, 32, 3):
            cv.hline(gx, gx + 18, y, 'GREY2')
            cv.hline(gx, gx + 18, y + 1, 'GREY7')
    # 中央机械核心
    cv.disc(48, 44, 20, 'GREY2')
    cv.ring(48, 44, 20, 'GREY7')
    cv.ring(48, 44, 17, 'GREY5')
    cv.disc(48, 44, 14, core)
    cv.ring(48, 44, 14, 'GREY2')
    cv.dither(34, 30, 28, 28, 'GREY2', None, mode='quarter',
              only_on=[G.PAL[core]])
    cv.disc(48, 44, 5, 'GREY7')
    cv.disc(48, 44, 3, core)
    # 核心固定螺栓
    for ax, ay in ((48, 22), (48, 66), (26, 44), (70, 44)):
        cv.rect(ax - 1, ay - 1, 3, 3, 'GREY7')
        cv.set(ax, ay, 'GREY2')
    # 下方两个炮口
    for px in (14, 74):
        cv.rect(px, 58, 10, 14, 'GREY2')
        cv.frame(px, 58, 10, 14, 'GREY7')
        cv.rect(px + 3, 62, 4, 8, core)
    return cv


def boss_sheet():
    fr = [boss('RED2'), boss('RED4'), boss('RED5')]
    save_frames(fr, f'{OUT}/boss_wall.png', 96, 88)


# ---------------------------------------------------------------- 子弹
def bullet_sheet():
    a = Canvas(6, 6)
    a.rows(3, 1, [4, 6, 6, 4], 'YEL4')
    a.rect(2, 2, 2, 2, 'WHITE')
    a.rows(3, 1, [4, 6, 6, 4], None)  # 重画描边
    a.rows(3, 1, [4, 6, 6, 4], 'YEL4')
    a.rect(2, 2, 2, 2, 'WHITE')
    a.set(1, 1, 'YEL1'); a.set(4, 1, 'YEL1')
    a.set(1, 4, 'YEL1'); a.set(4, 4, 'YEL1')
    b = Canvas(6, 6)
    b.rows(3, 2, [6, 6], 'YEL4')
    b.rows(3, 1, [4, 4, 4, 4], 'YEL4')
    b.rect(2, 2, 2, 2, 'YEL4')
    b.set(2, 2, 'WHITE'); b.set(3, 3, 'WHITE')
    save_frames([a, b], f'{OUT}/bullet.png', 6, 6)

    c = Canvas(6, 6)
    c.rows(3, 1, [4, 6, 6, 4], 'RED5')
    c.rect(2, 2, 2, 2, 'WHITE')
    c.set(1, 1, 'RED2'); c.set(4, 1, 'RED2')
    c.set(1, 4, 'RED2'); c.set(4, 4, 'RED2')
    d = Canvas(6, 6)
    d.rows(3, 1, [2, 4, 4, 2], 'RED5')
    d.rect(2, 2, 2, 2, 'RED2')
    d.set(2, 2, 'WHITE')
    save_frames([c, d], f'{OUT}/bullet_enemy.png', 6, 6)


# ---------------------------------------------------------------- powerup 14×14
FONT57 = {
    'M': ["X...X", "XX.XX", "X.X.X", "X...X", "X...X", "X...X", "X...X"],
    'S': [".XXXX", "X....", "X....", ".XXX.", "....X", "....X", "XXXX."],
    'L': ["X....", "X....", "X....", "X....", "X....", "X....", "XXXXX"],
    'R': ["XXXX.", "X...X", "X...X", "XXXX.", "X..X.", "X...X", "X...X"],
}


def powerup(letter, body, dark):
    cv = Canvas(14, 14)
    # 胶囊：圆角矩形
    widths = [8, 12, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 12, 8]
    cv.rows(7, 0, widths, body)
    # 描边
    for y in range(14):
        row = [x for x in range(14) if cv.get(x, y)]
        if row:
            cv.set(row[0], y, dark)
            cv.set(row[-1], y, dark)
    for x in range(14):
        colp = [y for y in range(14) if cv.get(x, y)]
        if colp:
            cv.set(x, colp[0], dark)
            cv.set(x, colp[-1], dark)
    cv.hline(4, 9, 2, dark)
    cv.hline(4, 9, 11, dark)
    for y, row in enumerate(FONT57[letter]):
        for x, ch in enumerate(row):
            if ch == 'X':
                cv.set(4 + x, 4 + y, 'WHITE')
    return cv


def powerup_sheet():
    fr = [powerup('M', 'RED3', 'RED1'), powerup('S', 'GRN3', 'GRN1'),
          powerup('L', 'BLU3', 'BLU1'), powerup('R', 'PUR3', 'PUR1')]
    save_frames(fr, f'{OUT}/powerup.png', 14, 14)


# ---------------------------------------------------------------- tiles 16×16 ×8
def dirt(cv, y0, y1):
    """泥土：图案周期 4，保证上下左右可无缝拼接。"""
    for y in range(y0, y1 + 1):
        for x in range(16):
            c = 'WOOD3'
            if (x + y) % 4 == 0:
                c = 'WOOD2'
            elif (x * 3 + y * 2) % 8 == 1:
                c = 'WOOD2'
            elif (x + 2 * y) % 8 == 3:
                c = 'WOOD4'
            cv.set(x, y, c)


def t_ground_top():
    cv = WrapCanvas(16, 16)
    dirt(cv, 3, 15)
    cv.hline(0, 15, 0, 'GRN4')
    for x in range(16):
        cv.set(x, 1, 'GRN4' if x % 4 != 2 else 'GRN2')
        cv.set(x, 2, 'GRN2' if x % 2 == 0 else 'GRN4')
        if x % 8 in (1, 5):
            cv.set(x, 3, 'GRN2')
    return cv


def t_ground_mid():
    cv = WrapCanvas(16, 16)
    dirt(cv, 0, 15)
    for x in range(16):
        if (x + 5) % 8 < 3:
            cv.set(x, 6, 'WOOD2')
        if (x + 1) % 8 < 4:
            cv.set(x, 12, 'WOOD2')
    return cv


def t_bridge_wood():
    cv = WrapCanvas(16, 16)
    cv.rect(0, 0, 16, 16, 'WOOD4')
    cv.hline(0, 15, 0, 'WOOD5')
    cv.hline(0, 15, 1, 'WOOD5')
    for x in range(16):
        if x % 4 == 1:
            cv.set(x, 1, 'WOOD4')
    for x in (7, 15):
        cv.vline(x, 0, 15, 'WOOD2')
    cv.hline(0, 15, 15, 'WOOD2')
    for y in range(3, 15):
        for x in range(16):
            if (x * 5 + y) % 9 == 0:
                cv.set(x, y, 'WOOD3')
    cv.hline(0, 15, 5, 'WOOD3')
    cv.hline(0, 15, 10, 'WOOD3')
    return cv


def t_bridge_iron():
    """铁桥：厚桥面 + 2px 立柱 + 带暗侧的 X 斜撑（整体厚度与地面块统一）。"""
    cv = WrapCanvas(16, 16)
    cv.rect(0, 0, 16, 16, 'GREY4')
    cv.hline(0, 15, 0, 'GREY7')
    cv.hline(0, 15, 1, 'GREY6')
    cv.hline(0, 15, 2, 'GREY3')
    cv.hline(0, 15, 13, 'GREY3')
    cv.hline(0, 15, 14, 'GREY6')
    cv.hline(0, 15, 15, 'GREY3')
    for x in (0, 1, 8, 9):                        # 立柱（16px 周期首尾相接）
        cv.vline(x, 3, 12, 'GREY6')
    cv.vline(2, 3, 12, 'GREY3')
    cv.vline(10, 3, 12, 'GREY3')
    # X 形斜撑：亮面 2px + 下缘暗面 1px，避免细锯齿
    for i in range(11):
        for dx in (0, 1):
            cv.set(i + dx, 3 + i, 'GREY6')
            cv.set(15 - i - dx, 3 + i, 'GREY6')
        cv.set(i - 1, 3 + i, 'GREY3')
        cv.set(15 - i + 1, 3 + i, 'GREY3')
    return cv


def t_platform():
    cv = WrapCanvas(16, 16)
    cv.rect(0, 0, 16, 16, 'GREY4')
    cv.hline(0, 15, 0, 'GREY7')
    cv.hline(0, 15, 1, 'GREY6')
    cv.hline(0, 15, 2, 'GREY3')
    for y in range(3, 14):
        for x in range(16):
            if (x + y) % 4 == 0:
                cv.set(x, y, 'GREY3')
    for x in range(2, 16, 4):
        cv.set(x, 5, 'GREY6')
        cv.set(x, 10, 'GREY6')
    cv.hline(0, 15, 14, 'GREY3')
    cv.hline(0, 15, 15, 'GREY2')
    return cv


def t_water(phase):
    """水面：阶梯状白色高光线 + 底色抖动，2 帧相位错开表现流动。"""
    cv = WrapCanvas(16, 16)
    for y in range(16):
        for x in range(16):
            cv.set(x, y, 'BLU2' if (x + y) % 2 else 'BLU1')
    for cy in (2, 10):
        for x in range(16):
            step = ((x + phase) // 4) % 2            # 阶梯起伏
            yy = cy + step
            cv.set(x, yy, 'BLU4')
            cv.set(x, yy + 1, 'BLU3')
            if (x + phase) % 4 < 2:                  # 细长白色高光
                cv.set(x, yy - 1, 'WHITE')
    for x in range(16):
        if (x + phase) % 8 == 6:
            cv.set(x, 6, 'BLU3')
            cv.set(x, 14, 'BLU3')
    return cv


def t_spike():
    cv = WrapCanvas(16, 16)
    cv.rect(0, 12, 16, 4, 'GREY4')
    cv.hline(0, 15, 12, 'GREY6')
    cv.hline(0, 15, 15, 'GREY2')
    for k in range(4):
        bx = k * 4
        for i in range(6):
            half = max(0, (6 - i) // 2)
            cv.hline(bx + 1 - half + 1, bx + 2 + half - 1, 6 + i, 'GREY7')
        cv.vline(bx + 1, 8, 12, 'GREY3')
        cv.set(bx + 2, 6, 'GREY7')
        cv.vline(bx + 2, 6, 12, 'GREY8')
    return cv


def tiles_sheet():
    fr = [t_ground_top(), t_ground_mid(), t_bridge_wood(), t_bridge_iron(),
          t_platform(), t_water(0), t_water(4), t_spike()]
    save_frames(fr, f'{OUT}/tiles.png', 16, 16, maxcolors=None, wrap_x=True,
                wrap_y=[1, 5, 6])


# ---------------------------------------------------------------- bg_jungle 360×270
W, HH = 360, 270


def bg_jungle():
    cv = WrapCanvas(W, HH)
    # 夜空（整幅先铺满，保证没有一个透明像素）
    cv.rect(0, 0, W, HH, 'BLU1')
    cv.dither(0, 60, W, 46, 'BLU2', None, mode='quarter')
    cv.rect(0, 106, W, 44, 'BLU2')
    cv.dither(0, 106, W, 22, 'BLU1', None, mode='quarter')
    cv.dither(0, 138, W, 12, 'BLU3', None, mode='quarter')
    for x in range(0, W, 24):
        cv.set(x + 5, 12 + (x // 24 % 3) * 7, 'GREY7')
        cv.set(x + 17, 30 - (x // 24 % 4) * 5, 'GREY6')
    # 第 1 层：远山 GRN1（周期 180/90，360 内整周期）
    for x in range(W):
        top = 116 + G.wave(x, 180, 17) + G.wave(x, 90, 7, 1.1)
        cv.vline(x, top, HH - 1, 'GRN1')
        if x % 6 < 3:
            cv.set(x, top, 'GRN2')
    # 第 2 层：树林 GRN2（周期 40 的树冠 + 树干，逐棵有变化）
    cv.rect(0, 166, W, 58, 'GRN2')
    for k, bx in enumerate(range(0, W, 40)):
        cx = bx + 20
        v = k % 3
        for i, r in enumerate((17 + v, 21 - v, 14 + v)):
            cy = 150 + i * 11 + (v - 1) * 3
            for y in range(cy - r, cy + r + 1):
                dx = int((r * r - (y - cy) ** 2) ** 0.5) if abs(y - cy) <= r else 0
                cv.hline(cx - dx, cx + dx, y, 'GRN2')
        for y in range(172, 208):
            dx = 3 + (y - 172) // 12
            cv.hline(cx - dx, cx + dx, y, 'GRN1')
    cv.dither(0, 160, W, 10, 'GRN2', None, mode='checker')
    # 第 3 层：近处藤蔓 GRN3（周期 45，从树冠顶部垂下，不悬在夜空里）
    for bx in range(0, W, 45):
        x0 = bx + 9
        y_top = 128 + (bx // 45 % 3) * 6
        length = 52 + (bx // 45 % 3) * 22
        for y in range(y_top, y_top + length):
            xx = x0 + G.wave(y, 34, 5)
            cv.vline(xx, y, y, 'GRN3')
            cv.set(xx + 1, y, 'GRN2')
            if (y - y_top) % 14 == 7:           # 叶片
                cv.rect(xx - 5, y - 1, 5, 3, 'GRN3')
                cv.set(xx - 5, y, 'GRN2')
            if (y - y_top) % 14 == 0 and y > y_top:
                cv.rect(xx + 2, y - 1, 5, 3, 'GRN3')
                cv.set(xx + 6, y, 'GRN2')
    # 近景灌木带（GRN3，不规则丛，周期 30）
    for k, bx in enumerate(range(0, W, 30)):
        v = k % 4
        clumps = ((0, 216 - v, 11 + v % 2 * 2), (9, 219, 8), (-8, 220 + v % 2, 7),
                  (4, 224, 9))
        for ox, cy, r in clumps:
            for y in range(cy - r, cy + 1):
                dx = int((r * r - (y - cy) ** 2) ** 0.5)
                cv.hline(bx + 15 + ox - dx, bx + 15 + ox + dx, y, 'GRN3')
        cv.dither(bx + 4, 214 - v, 22, 6, 'GRN2', None, mode='sparse',
                  only_on=[G.PAL['GRN3']])
    cv.rect(0, 224, W, HH - 224, 'GRN1')
    cv.dither(0, 224, W, 6, 'GRN2', None, mode='checker')
    # 断言：整幅背景不得有透明像素
    assert len(cv.d) == W * HH, f'bg_jungle 有 {W * HH - len(cv.d)} 个透明像素'
    return cv


# ---------------------------------------------------------------- explosion 24×24
def blob(cv, cx, cy, r, col, squash=1.0):
    for y in range(int(cy - r * squash) - 1, int(cy + r * squash) + 2):
        for x in range(int(cx - r) - 1, int(cx + r) + 2):
            if ((x - cx) / r) ** 2 + ((y - cy) / (r * squash)) ** 2 <= 1.0:
                cv.set(x, y, col)


def explosion_frames():
    f1 = Canvas(24, 24)
    blob(f1, 12, 12, 5, 'YEL4')
    blob(f1, 12, 12, 2.5, 'WHITE')
    for dx, dy in ((0, -8), (8, 0), (0, 8), (-8, 0)):
        f1.rect(12 + dx - 1, 12 + dy - 1, 2, 2, 'YEL4')

    f2 = Canvas(24, 24)
    for cx, cy, r in ((12, 12, 10), (5, 8, 5), (19, 15, 5), (10, 19, 4), (17, 5, 4)):
        blob(f2, cx, cy, r, 'RED4')
    blob(f2, 12, 12, 7, 'YEL4')
    blob(f2, 12, 11, 3, 'WHITE')

    f3 = Canvas(24, 24)
    for cx, cy, r in ((12, 12, 10), (6, 7, 4.5), (18, 8, 4.5), (7, 18, 4.5), (17, 17, 4.5)):
        blob(f3, cx, cy, r, 'RED4')
    blob(f3, 12, 13, 6, 'YEL4')
    f3.dither(2, 2, 20, 20, 'YEL4', None, mode='quarter', only_on=[G.PAL['RED4']])

    f4 = Canvas(24, 24)
    for cx, cy, r in ((11, 10, 9), (4, 16, 5), (19, 6, 5), (18, 18, 5)):
        blob(f4, cx, cy, r, 'GREY5')
    f4.dither(0, 0, 24, 24, 'RED4', None, mode='quarter',
              only_on=[G.PAL['GREY5']])
    blob(f4, 11, 10, 4, 'RED4')

    f5 = Canvas(24, 24)
    for cx, cy, r in ((7, 7, 6), (17, 12, 6), (10, 19, 5), (20, 3, 3)):
        blob(f5, cx, cy, r, 'GREY5')
    f5.dither(0, 0, 24, 24, None, None, mode='checker', only_on=[G.PAL['GREY5']])
    for cx, cy, r in ((7, 7, 3), (17, 12, 3)):
        blob(f5, cx, cy, r, 'GREY7')
    f5.dither(0, 0, 24, 24, 'GREY7', None, mode='checker',
              only_on=[G.PAL['GREY7']])
    return [f1, f2, f3, f4, f5]


# ---------------------------------------------------------------- main
def main():
    print('== D1 contra ==')
    hero_sheet()
    soldier_sheet()
    turret_sheet()
    boss_sheet()
    bullet_sheet()
    powerup_sheet()
    tiles_sheet()
    bg = bg_jungle()
    img = G.binarize(bg.to_image())
    seam, avg = G.assert_wrap_x(img, 'bg_jungle.png')
    print(f'  bg_jungle 横向接缝差={seam:.2f} 内部均差={avg:.2f}')
    G.save_single(bg, f'{OUT}/bg_jungle.png', 360, 270)
    save_frames(explosion_frames(), f'{OUT}/explosion.png', 24, 24)


if __name__ == '__main__':
    main()

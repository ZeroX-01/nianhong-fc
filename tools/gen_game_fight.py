#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""D4 —— fight/ 双人格斗《拳霸 98 加强变态版》美术生产（可重复运行）
输出：assets/img/games/fight/
p1 面朝右，p2 为同一套姿势的镜像（面朝左），帧序完全一致。
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gamelib as G
from gamelib import Canvas, WrapCanvas, save_frames

OUT = 'assets/img/games/fight'
FW, FH = 40, 54

P1 = {'cloth': 'GREY8', 'accent': 'RED4', 'skin': 'SKN3', 'ink': 'INK'}
P2 = {'cloth': 'BLU3', 'accent': 'YEL3', 'skin': 'SKN3', 'ink': 'INK'}


# ---------------------------------------------------------------- 画肢体
def limb(cv, p0, p1, w, col):
    """方头笔刷粗线（无插值、无抗锯齿）。"""
    x0, y0 = p0
    x1, y1 = p1
    n = max(abs(x1 - x0), abs(y1 - y0))
    for i in range(int(n) + 1):
        t = i / float(max(1, n))
        x = int(round(x0 + (x1 - x0) * t))
        y = int(round(y0 + (y1 - y0) * t))
        cv.rect(x - w // 2, y - w // 2, w, w, col)


def taper(cv, p0, p1, w0, w1, col):
    """上宽下窄的躯干块。"""
    x0, y0 = p0
    x1, y1 = p1
    n = max(1, abs(y1 - y0))
    for i in range(n + 1):
        t = i / float(n)
        x = x0 + (x1 - x0) * t
        y = int(round(y0 + (y1 - y0) * t))
        w = int(round(w0 + (w1 - w0) * t))
        cv.rect(int(round(x - w / 2.0)), y, w, 1, col)


def head(cv, c, r, pal, face_dx, kind):
    cx, cy = c
    for y in range(cy - r, cy + r + 1):
        dx = int((r * r - (y - cy) ** 2) ** 0.5)
        cv.hline(cx - dx, cx + dx, y, pal['skin'])
    # 头发（上半部）
    for y in range(cy - r, cy - r + (r - 1)):
        dx = int((r * r - (y - cy) ** 2) ** 0.5)
        cv.hline(cx - dx, cx + dx, y, pal['ink'] if kind == 'p1' else pal['accent'])
    cv.hline(cx - r, cx - r + 2, cy - 1,
             pal['ink'] if kind == 'p1' else pal['accent'])
    if kind == 'p1':
        cv.set(cx + face_dx, cy, pal['ink'])
        cv.set(cx + face_dx, cy + 1, pal['ink'])
        cv.hline(cx + face_dx - 1, cx + face_dx + 1, cy + 3, pal['ink'])
    else:                                     # 墨镜（横条 + 镜腿）
        a = cx + face_dx - 3 if face_dx > 0 else cx + face_dx - 1
        cv.hline(a, a + 4, cy, pal['ink'])
        cv.hline(a, a + 4, cy + 1, pal['ink'])
        cv.hline(cx - 1, cx + 1, cy + 3, pal['ink'])


def fist(cv, hd, col):
    """5px 方圆拳头（不超过角色比例）。"""
    x, y = hd
    cv.rect(x - 1, y - 2, 3, 5, col)
    cv.rect(x - 2, y - 1, 5, 3, col)


def _leg(pal, spec):
    cv = Canvas(FW, FH)
    hip, knee, foot, shoe = spec
    limb(cv, hip, knee, 8, pal['cloth'])
    limb(cv, knee, foot, 7, pal['cloth'])
    cv.rect(shoe[0], shoe[1], shoe[2], shoe[3], pal['ink'])
    cv.outline(pal['ink'])
    return cv


def _arm(pal, spec):
    cv = Canvas(FW, FH)
    sh, el, hd = spec
    limb(cv, sh, el, 7, pal['cloth'])       # 袖子
    limb(cv, el, hd, 5, pal['skin'])        # 小臂
    fist(cv, hd, pal['skin'])
    cv.outline(pal['ink'])
    return cv


def _torso(pal, pose):
    cv = Canvas(FW, FH)
    (sx, sy), (hx, hy) = pose['torso']
    taper(cv, (sx, sy), (hx, hy), pose.get('w_sh', 15), pose.get('w_hip', 12),
          pal['cloth'])
    bx, by, bw, bh = pose['belt']
    cv.rect(bx, by, bw, bh, pal['accent'])
    cv.outline(pal['ink'])
    return cv


def _head(pal, pose, kind):
    cv = Canvas(FW, FH)
    head(cv, pose['head'], pose.get('hr', 6), pal, pose.get('face', 3), kind)
    cv.outline(pal['ink'])
    return cv


def fighter(pose, pal, kind):
    """分层叠加：后腿→后臂→躯干→前腿→前臂→头。
    每层单独描边后再叠，使相邻同色部件之间自然出现 1px 墨线分界。"""
    if pose.get('custom') == 'ko':
        return ko_frame(pal, kind)
    cv = Canvas(FW, FH)
    legs, arms = pose['legs'], pose['arms']
    for layer in (_leg(pal, legs[0]), _arm(pal, arms[0]), _torso(pal, pose),
                  _leg(pal, legs[1]), _arm(pal, arms[1]), _head(pal, pose, kind)):
        cv.blit(layer)
    return cv


def ko_frame(pal, kind):
    """倒地帧：横躺在地，头在左、脚在右，读图一眼可辨。"""
    cv = Canvas(FW, FH)
    # 屈起的后腿（膝盖朝上）
    back = Canvas(FW, FH)
    limb(back, (25, 47), (29, 43), 6, pal['cloth'])
    limb(back, (29, 43), (32, 45), 5, pal['cloth'])
    back.rect(31, 45, 5, 3, pal['ink'])
    back.outline(pal['ink'])
    cv.blit(back)
    # 无力上举的手臂（袖子长、小臂短）
    arm = Canvas(FW, FH)
    limb(arm, (16, 47), (17, 42), 6, pal['cloth'])
    limb(arm, (17, 42), (19, 39), 4, pal['skin'])
    fist(arm, (19, 38), pal['skin'])
    arm.outline(pal['ink'])
    cv.blit(arm)
    # 躯干（横向：肩在左、髋在右）
    body = Canvas(FW, FH)
    for x in range(12, 27):
        t = (x - 12) / 14.0
        h = int(round(10 - 3 * t))
        body.rect(x, 52 - h, 1, h, pal['cloth'])
    body.outline(pal['ink'])
    cv.blit(body)
    # 贴地的前腿
    front = Canvas(FW, FH)
    limb(front, (26, 51), (31, 52), 5, pal['cloth'])
    front.rect(31, 50, 5, 3, pal['ink'])
    front.outline(pal['ink'])
    cv.blit(front)
    # 腰带（最后画，避免被腿覆盖）
    belt = Canvas(FW, FH)
    belt.rect(22, 46, 3, 7, pal['accent'])
    belt.outline(pal['ink'])
    cv.blit(belt)
    # 头（侧躺，头顶朝左，闭眼）
    hd = Canvas(FW, FH)
    cx, cy, r = 8, 47, 5
    for y in range(cy - r, cy + r + 1):
        dx = int((r * r - (y - cy) ** 2) ** 0.5)
        hd.hline(cx - dx, cx + dx, y, pal['skin'])
    hair = pal['ink'] if kind == 'p1' else pal['accent']
    for y in range(cy - r + 1, cy + r):
        dx = int((r * r - (y - cy) ** 2) ** 0.5)
        hd.hline(cx - dx, cx - dx + 1, y, hair)     # 头发只占左侧 2px
    hd.hline(cx - 1, cx + 2, cy - r, hair)
    hd.hline(cx + 1, cx + 3, cy - 1, pal['ink'])    # 闭眼
    hd.hline(cx + 1, cx + 2, cy + 2, pal['ink'])    # 嘴
    hd.outline(pal['ink'])
    cv.blit(hd)
    return cv


# ---------------------------------------------------------------- 10 个姿势（面朝右）
def poses():
    P = []
    # 1 站立待机
    P.append(dict(head=(19, 10), torso=((19, 17), (19, 33)), belt=(12, 31, 15, 4),
                  arms=[((14, 21), (12, 27), (16, 26)), ((24, 21), (28, 26), (30, 21))],
                  legs=[((15, 34), (13, 43), (12, 51), (7, 51, 8, 3)),
                        ((23, 34), (26, 43), (27, 51), (24, 51, 9, 3))]))
    # 2 前进（前腿跨出）
    P.append(dict(head=(20, 10), torso=((20, 17), (19, 33)), belt=(12, 31, 16, 4),
                  arms=[((15, 21), (12, 28), (17, 27)), ((25, 20), (29, 25), (31, 20))],
                  legs=[((15, 34), (12, 43), (10, 51), (5, 51, 8, 3)),
                        ((24, 34), (29, 43), (31, 51), (28, 51, 9, 3))]))
    # 3 后退（重心后移）
    P.append(dict(head=(17, 10), torso=((17, 17), (18, 33)), belt=(11, 31, 15, 4),
                  arms=[((13, 21), (9, 26), (13, 24)), ((22, 21), (26, 27), (29, 24))],
                  legs=[((14, 34), (10, 43), (8, 51), (4, 51, 8, 3)),
                        ((22, 34), (25, 43), (26, 51), (23, 51, 9, 3))]))
    # 4 蹲防（低姿，双臂交叉在前）
    P.append(dict(head=(19, 24), hr=6, torso=((19, 30), (19, 41)), w_sh=16, w_hip=15,
                  belt=(11, 39, 17, 4),
                  arms=[((24, 32), (28, 33), (29, 30)), ((22, 34), (27, 36), (28, 34))],
                  legs=[((15, 42), (11, 47), (11, 51), (6, 51, 9, 3)),
                        ((24, 42), (28, 47), (28, 51), (24, 51, 10, 3))]))
    # 5 直拳（前臂完全伸出）
    P.append(dict(head=(18, 10), torso=((18, 17), (18, 33)), belt=(11, 31, 15, 4),
                  arms=[((13, 22), (11, 27), (15, 25)), ((23, 20), (30, 20), (37, 20))],
                  legs=[((14, 34), (11, 43), (9, 51), (4, 51, 9, 3)),
                        ((22, 34), (26, 43), (28, 51), (25, 51, 9, 3))]))
    # 6 上勾拳（拳头抬到头顶前方）
    P.append(dict(head=(18, 12), torso=((18, 19), (18, 34)), belt=(11, 32, 15, 4),
                  arms=[((13, 23), (11, 29), (15, 27)), ((23, 22), (28, 17), (29, 8))],
                  legs=[((14, 35), (11, 43), (10, 51), (5, 51, 9, 3)),
                        ((22, 35), (26, 43), (27, 51), (24, 51, 9, 3))]))
    # 7 前踢（腿水平踢出）
    P.append(dict(head=(15, 11), torso=((15, 18), (16, 32)), belt=(9, 30, 15, 4),
                  arms=[((11, 22), (7, 27), (7, 22)), ((20, 22), (24, 27), (26, 24))],
                  legs=[((14, 33), (13, 43), (12, 51), (7, 51, 9, 3)),
                        ((20, 33), (28, 34), (35, 34), (34, 31, 5, 6))]))
    # 8 跳跃（离地，收腿；整体上移，底部留空）
    P.append(dict(head=(19, 8), torso=((19, 15), (19, 29)), belt=(12, 27, 15, 4),
                  arms=[((14, 19), (10, 14), (8, 9)), ((24, 19), (28, 15), (30, 10))],
                  legs=[((15, 30), (13, 37), (18, 40), (16, 38, 8, 4)),
                        ((23, 30), (26, 36), (30, 39), (27, 37, 9, 4))]))
    # 9 被击中（上身后仰，双臂向后甩，重心失衡）
    P.append(dict(head=(13, 13), torso=((15, 20), (20, 34)), belt=(13, 32, 15, 4),
                  arms=[((12, 24), (7, 19), (5, 14)), ((18, 24), (16, 29), (14, 31))],
                  legs=[((16, 35), (13, 44), (11, 51), (6, 51, 9, 3)),
                        ((23, 35), (28, 44), (30, 51), (27, 51, 9, 3))]))
    # 10 倒地（横躺在地面，专用绘制）
    P.append(dict(custom='ko', head=(9, 46), torso=((14, 44), (27, 48)),
                  belt=(25, 45, 3, 8), arms=[], legs=[]))
    return P


def mirror(cv):
    return cv.flip_x()


def fighter_sheets():
    ps = poses()
    p1 = [fighter(p, P1, 'p1') for p in ps]
    p2 = [mirror(fighter(p, P2, 'p2')) for p in ps]
    for i, (a, b) in enumerate(zip(p1, p2)):
        if i == 7:                        # 跳跃帧允许离地
            continue
        G.assert_bottom_aligned(a, 'p1.png', f'帧{i + 1}')
        G.assert_bottom_aligned(b, 'p2.png', f'帧{i + 1}')
    save_frames(p1, f'{OUT}/p1.png', FW, FH)
    save_frames(p2, f'{OUT}/p2.png', FW, FH)


# ---------------------------------------------------------------- hit_spark 24×24
def star(cv, cx, cy, r_out, r_in, col, spikes=8, phase=0.0):
    for y in range(0, 24):
        for x in range(0, 24):
            dx, dy = x - cx, y - cy
            d = math.hypot(dx, dy)
            th = math.atan2(dy, dx)
            rr = r_in + (r_out - r_in) * (0.5 + 0.5 * math.cos(spikes * th + phase))
            if d <= rr:
                cv.set(x, y, col)


def spark_frames():
    f1 = Canvas(24, 24)
    star(f1, 11.5, 11.5, 7, 2, 'WHITE', 6)
    f2 = Canvas(24, 24)
    star(f2, 11.5, 11.5, 11, 3.5, 'YEL4', 8, 0.4)
    star(f2, 11.5, 11.5, 6, 2, 'WHITE', 8, 0.4)
    f3 = Canvas(24, 24)
    star(f3, 11.5, 11.5, 12, 5, 'RED4', 10, 0.8)
    star(f3, 11.5, 11.5, 7, 3, 'YEL4', 10, 0.8)
    f3.dither(0, 0, 24, 24, 'YEL4', None, mode='quarter', only_on=[G.PAL['RED4']])
    # 第 4 帧：消散——只剩向外飞散的碎片，中心掏空
    f4 = Canvas(24, 24)
    star(f4, 11.5, 11.5, 12, 8, 'RED4', 10, 1.2)
    for y in range(24):                       # 棋盘挖空（真透明，不用中间 alpha）
        for x in range(24):
            if (x + y) % 2 == 0:
                f4.clear(x, y)
    f4.rect(8, 8, 8, 8, None)
    for y in range(6, 18):                    # 中心整块掏空
        for x in range(6, 18):
            if (x - 11.5) ** 2 + (y - 11.5) ** 2 < 20:
                f4.clear(x, y)
    for i in range(8):                        # 8 个飞散碎片
        a = i * math.pi / 4 + 0.2
        px, py = 11 + int(9 * math.cos(a)), 11 + int(9 * math.sin(a))
        f4.set(px, py, 'GREY5')
        f4.set(px + 1, py, 'RED4')
    return [f1, f2, f3, f4]


# ---------------------------------------------------------------- bg_stage 360×270
W, HH = 360, 270


def bg_stage():
    cv = WrapCanvas(W, HH)
    cv.rect(0, 0, W, HH, 'BLU2')
    cv.dither(0, 0, W, 40, 'BLU1', None, mode='quarter')
    # 屋檐（顶部瓦片，周期 12）
    cv.rect(0, 0, W, 26, 'GREY3')
    for x in range(W):
        if x % 12 < 2:
            cv.vline(x, 0, 25, 'GREY2')
        elif x % 12 in (2, 3):
            cv.vline(x, 0, 25, 'GREY5')
    for x in range(0, W, 12):
        cv.rect(x + 2, 24, 8, 4, 'GREY5')
        cv.rect(x + 2, 27, 8, 1, 'GREY2')
    cv.hline(0, W - 1, 26, 'GREY2')
    cv.rect(0, 28, W, 5, 'RED3')
    cv.dither(0, 28, W, 5, 'RED2', None, mode='hstripe')
    cv.hline(0, W - 1, 33, 'RED1')
    # 木质店面墙（周期 45 的窗格 + 立柱）
    cv.rect(0, 34, W, 96, 'WOOD3')
    for x in range(0, W, 45):
        cv.rect(x, 34, 5, 96, 'WOOD4')
        cv.vline(x + 4, 34, 129, 'WOOD2')
        cv.rect(x + 9, 44, 28, 42, 'WOOD2')
        cv.frame(x + 9, 44, 28, 42, 'WOOD4')
        for i in range(1, 4):
            cv.vline(x + 9 + i * 7, 45, 84, 'WOOD4')
        for i in range(1, 3):
            cv.hline(x + 10, x + 35, 44 + i * 14, 'WOOD4')
    cv.dither(0, 34, W, 96, 'WOOD2', None, mode='sparse', only_on=[G.PAL['WOOD3']])
    for y in (60, 90, 118):                  # 木墙横向板缝
        cv.hline(0, W - 1, y, 'WOOD2')
        cv.hline(0, W - 1, y + 1, 'WOOD4')
    # 红灯笼（周期 90）
    for x in range(0, W, 90):
        cxx = x + 45
        cv.vline(cxx, 34, 41, 'INK')
        for i, wd in enumerate((9, 13, 15, 15, 13, 9)):
            cv.rect(cxx - wd // 2, 42 + i, wd, 1, 'RED4')
        cv.vline(cxx - 4, 42, 47, 'RED2')
        cv.vline(cxx + 4, 42, 47, 'RED2')
        cv.rect(cxx - 3, 41, 7, 1, 'YEL3')
        cv.rect(cxx - 3, 48, 7, 1, 'YEL3')
        cv.vline(cxx, 49, 53, 'YEL3')
        cv.vline(cxx - 2, 49, 51, 'YEL3')
        cv.vline(cxx + 2, 49, 51, 'YEL3')
    # 围观人群剪影（3 种模板 × 高低错落 × 左右抖动，破坏克隆感）
    cv.rect(0, 130, W, 62, 'GREY2')          # 人群后的暗底
    cv.dither(0, 130, W, 12, 'GREY3', None, mode='checker')
    # (头半径, 肩宽, 头顶 y 偏移, x 抖动)
    TPL = ((5, 13, 0, 0), (4, 10, 4, 3), (6, 15, -3, -2), (4, 12, 2, 4),
           (5, 11, -1, -3), (6, 13, 3, 1))
    for k, x in enumerate(range(0, W, 20)):          # 后排 18 人（18%6=0，无缝）
        r, bw, dy, jx = TPL[k % 6]
        cxx, cy = x + 10 + jx, 150 + dy
        cv.disc(cxx, cy, r, 'GREY3')
        cv.rect(cxx - bw // 2, cy + r - 1, bw, 190 - cy - r + 1, 'GREY3')
    TPL2 = ((6, 15, 0, 0), (5, 12, 4, 3), (6, 16, -2, -3), (5, 13, 2, 2),
            (6, 14, -3, 4))
    for k, x in enumerate(range(0, W, 24)):          # 前排 15 人（15%5=0，无缝）
        r, bw, dy, jx = TPL2[k % 5]
        cxx, cy = x + 12 + jx, 166 + dy
        cv.disc(cxx, cy, r, 'GREY4')
        cv.rect(cxx - bw // 2, cy + r - 1, bw, 191 - cy - r + 1, 'GREY4')
    cv.hline(0, W - 1, 188, 'GREY6')         # 观众席护栏
    cv.hline(0, W - 1, 189, 'GREY3')
    # 石板地（护栏 + 地砖）
    cv.rect(0, 192, W, 38, 'GREY5')
    cv.hline(0, W - 1, 192, 'GREY7')
    for x in range(0, W, 30):
        cv.vline(x, 193, 229, 'GREY3')
    for y in range(200, 230, 10):
        cv.hline(0, W - 1, y, 'GREY3')
        cv.hline(0, W - 1, y + 1, 'GREY6')
    cv.dither(0, 193, W, 37, 'GREY6', None, mode='sparse', only_on=[G.PAL['GREY5']])
    # 底部 40px 擂台地面
    cv.rect(0, HH - 40, W, 40, 'WOOD4')
    cv.hline(0, W - 1, HH - 40, 'WOOD6')
    cv.hline(0, W - 1, HH - 39, 'WOOD5')
    for x in range(0, W, 24):
        cv.vline(x, HH - 38, HH - 1, 'WOOD2')
        cv.vline(x + 1, HH - 38, HH - 1, 'WOOD5')
    for y in range(HH - 34, HH, 8):
        cv.hline(0, W - 1, y, 'WOOD3')
    cv.dither(0, HH - 38, W, 38, 'WOOD3', None, mode='sparse',
              only_on=[G.PAL['WOOD4']])
    assert len(cv.d) == W * HH
    return cv


# ---------------------------------------------------------------- HUD
def hud_bar():
    cv = Canvas(140, 14)
    cv.rect(0, 0, 140, 14, 'INK')
    cv.frame(1, 1, 138, 12, 'GREY7')
    cv.frame(2, 2, 136, 10, 'GREY7')
    cv.rect(3, 3, 134, 8, 'INK')
    cv.frame(0, 0, 140, 14, 'INK')
    # 内部 3..10 行保持纯 INK 留空，由代码填色
    return cv


def portrait(kind):
    cv = Canvas(28, 28)
    cv.rect(0, 0, 28, 28, 'INK')
    cv.frame(0, 0, 28, 28, 'GREY7')
    cv.frame(1, 1, 26, 26, 'INK')
    hair = 'INK' if kind == 1 else 'YEL3'
    # 脸
    for y in range(6, 22):
        r = 9
        dx = int((r * r - (y - 13) ** 2) ** 0.5) if abs(y - 13) <= r else 0
        cv.hline(14 - dx, 13 + dx, y, 'SKN3')
    for y in range(4, 12):
        r = 10
        dx = int((r * r - (y - 13) ** 2) ** 0.5) if abs(y - 13) <= r else 0
        cv.hline(14 - dx, 13 + dx, y, hair)
    if kind == 1:
        cv.rect(8, 13, 3, 2, 'INK')
        cv.rect(17, 13, 3, 2, 'INK')
        cv.hline(11, 16, 19, 'INK')
        cv.hline(7, 10, 11, 'INK')
        cv.hline(17, 20, 11, 'INK')
    else:
        cv.rect(6, 12, 16, 3, 'INK')
        cv.hline(11, 16, 19, 'INK')
        cv.set(13, 20, 'INK')
    cv.rect(2, 24, 24, 2, 'GREY8' if kind == 1 else 'BLU3')
    return cv


# ---------------------------------------------------------------- main
def main():
    print('== D4 fight ==')
    fighter_sheets()
    save_frames(spark_frames(), f'{OUT}/hit_spark.png', 24, 24)
    st = bg_stage()
    G.save_single(st, f'{OUT}/bg_stage.png', 360, 270)
    G.save_single(hud_bar(), f'{OUT}/hud_bar.png', 140, 14)
    save_frames([portrait(1), portrait(2)], f'{OUT}/hud_portrait.png', 28, 28,
                maxcolors=5)


if __name__ == '__main__':
    main()

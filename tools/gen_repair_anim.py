#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""gen_repair_anim.py —— 修卡台两个标志性动作的像素动画帧

产出（都是 140×116 的定格取景，无镜头移动、无字幕）：
  cart/repair_blow.png  16 帧  对着金手指哈两口气
  cart/repair_rub.png   13 帧  在桌角划两下

节奏（四拍，毫秒表与 src/anim/repairAnim.js 里的 BEATS 必须一致）：
  哈气  准备 460 → 蓄力 580（按住时由玩家决定长短）→ 发力① 520
        → 停顿 420 → 发力② 540 → 收尾 560          合计 ≈3.08s
  划桌  准备 560 → 第一下 480 → 抬起回位 620
        → 第二下 490 → 收尾 760                     合计 ≈2.91s

纪律（用户分镜的硬要求，逐条落到画面里）：
  * 气流只用 1px 短横线，最长 9px，永远待在嘴和金手指之间的空档里，
    不压脸、不压贴纸，绝不画成一团烟。
  * 划桌不出火花：只有 WOOD5/WOOD6/GREY6 的灰尘往下掉。
  * 卡带尺寸形状每帧一致（同一个 cart_shell 函数，只改 dx/dy/tilt）。
  * 手指画在卡带壳体之上、桌沿之上，先画卡带再画手，不会穿模。
  * 摩擦时卡带底部的开口必须压在桌沿高光线上（贴实），抬起时才留缝。
调色板沿用 pixlib 的 44 色（奶油黄 WOOD7/YEL4、灰绿 GRN1-3、棕 WOOD1-6）。

可重复运行：python3 tools/gen_repair_anim.py
"""
from __future__ import annotations

import os
import random
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pixlib import Canvas, save, sheet, report  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'img', 'cart')
# v2 换皮版共用同一份 assets，生成完同步一份过去
V2 = os.path.join(os.path.dirname(ROOT), 'nianhong-fc-v2', 'assets', 'img', 'cart')

FW, FH = 140, 116


# ---------------------------------------------------------------- 公共零件
def wall(c: Canvas, bottom: int) -> None:
    """灰绿墙 + 右上角的午后阳光 + 半墙高的护墙板。"""
    c.rect(0, 0, FW, bottom, 'GRN2')
    c.dither(0, 0, FW, bottom, 'GRN1', None, mode='faint')
    # 2004 年下午三点的太阳：从右上角斜进来，只用 dither 提亮，不做渐变
    c.dither(FW - 56, 0, 56, min(34, bottom), 'WOOD7', None, mode='sparse')
    c.dither(FW - 40, 0, 40, min(20, bottom), 'WOOD7', None, mode='quarter')
    c.dither(0, 0, 7, bottom, 'WOOD7', None, mode='quarter')      # 左侧窗光竖条
    dado = bottom - 26
    if dado > 6:
        c.rect(0, dado + 1, FW, bottom - dado - 1, 'GRN1')
        c.hline(0, FW - 1, dado, 'GRN3')                           # 护墙板压条
        c.dither(0, dado + 2, FW, 6, 'GRN2', None, mode='sparse')


def desk(c: Canvas, far: int, rng: random.Random) -> None:
    """木桌：远边 → 桌面 → 圆钝近边（划卡带就在这道边上）→ 桌沿正面。"""
    top_h = 12
    edge_y = far + top_h                       # 圆钝边起始
    c.rect(0, far, FW, top_h, 'WOOD4')
    c.hline(0, FW - 1, far, 'WOOD5')
    c.dither(0, far + 1, FW, top_h - 1, 'WOOD5', None, mode='sparse')
    for y in (far + 4, far + 8):               # 木纹
        x0 = rng.randint(0, 20)
        c.hline(x0, x0 + rng.randint(40, 90), y, 'WOOD3')
    c.rect(0, edge_y, FW, 6, 'WOOD5')          # 圆钝边（受光面）
    c.hline(0, FW - 1, edge_y, 'WOOD6')
    c.hline(0, FW - 1, edge_y + 5, 'WOOD3')
    c.rect(0, edge_y + 6, FW, FH - edge_y - 6, 'WOOD2')   # 桌沿正面（背光）
    c.dither(0, edge_y + 6, FW, 4, 'WOOD3', None, mode='sparse')
    c.dither(0, FH - 6, FW, 6, 'WOOD1', None, mode='checker')
    return edge_y


def chipped_paint(c: Canvas, edge_y: int, rng: random.Random) -> None:
    """掉漆的旧桌沿：几块露出白木的斑，和两个磕出来的坑。"""
    for (x, w) in ((12, 7), (52, 5), (96, 9), (124, 6)):
        c.dither(x, edge_y + 1, w, 4, 'WOOD6', None, mode='checker')
        c.set(x + w, edge_y + 2, 'WOOD3')
    for x in (34, 78, 112):
        c.rect(x, edge_y + 2, 3, 2, 'WOOD3')
        c.set(x, edge_y + 1, 'WOOD2')
    c.dither(0, edge_y + 1, FW, 1, 'WOOD7', None, mode='sparse', phase=rng.randint(0, 3))


def crt(c: Canvas, x: int, y: int, w: int, h: int) -> None:
    """老式 CRT 电视：只求一眼认出，别抢主角。"""
    c.rect(x, y, w, h, 'GREY4')
    c.hline(x, x + w - 1, y, 'GREY6')
    c.vline(x, y, y + h - 1, 'GREY5')
    c.dither(x + 1, y + 1, w - 2, h - 2, 'GREY5', None, mode='faint')
    sx, sy, sw, sh = x + 5, y + 6, w - 12, h - 20
    if sw > 6 and sh > 6:
        c.rect(sx, sy, sw, sh, 'GREY3')
        c.dither(sx, sy, sw, sh, 'GREY2', None, mode='hstripe')             # 扫描线
        c.frame(sx - 1, sy - 1, sw + 2, sh + 2, 'GREY2')
        c.dither(sx + 1, sy + 1, sw - 2, 4, 'WOOD7', None, mode='quarter')  # 玻璃反光
        c.dither(sx + 1, sy + 5, 6, sh - 8, 'GREY6', None, mode='sparse')
        c.hline(sx + 1, sx + sw - 2, sy + sh - 2, 'GREY4')
    for (kx, ky) in ((x + w - 5, y + h - 12), (x + w - 5, y + h - 7)):      # 旋钮
        c.disc(kx, ky, 1.6, 'GREY6')
        c.set(kx, ky, 'GREY3')


def console_box(c: Canvas, x: int, y: int) -> None:
    """小旋风主机：灰白壳、顶面卡槽、一颗红电源灯。"""
    c.rect(x, y, 34, 12, 'GREY7')
    c.hline(x, x + 33, y, 'GREY8')
    c.hline(x, x + 33, y + 11, 'GREY4')
    c.vline(x + 33, y, y + 11, 'GREY5')
    c.rect(x + 6, y + 2, 20, 2, 'GREY3')       # 卡槽
    c.hline(x + 6, x + 25, y + 1, 'GREY5')
    c.set(x + 30, y + 4, 'RED4')               # 电源灯
    c.set(x + 30, y + 5, 'RED2')
    c.dither(x + 2, y + 6, 30, 3, 'GREY6', None, mode='sparse')


def gamepad(c: Canvas, x: int, y: int) -> None:
    """摊在桌上的手柄 + 一根拖着的电线。"""
    c.rect(x, y, 26, 9, 'GREY7')
    c.hline(x, x + 25, y, 'GREY8')
    c.hline(x, x + 25, y + 8, 'GREY4')
    c.rect(x + 3, y + 2, 5, 5, 'GREY3')        # 十字键
    c.set(x + 5, y + 4, 'GREY5')
    c.set(x + 18, y + 4, 'RED3')               # A / B
    c.set(x + 21, y + 4, 'RED3')
    c.hline(x + 12, x + 15, y + 6, 'GREY5')    # select / start
    c.dither(x + 1, y + 1, 24, 1, 'GREY8', None, mode='checker')


def cable(c: Canvas, pts, col='GREY3') -> None:
    for i in range(len(pts) - 1):
        c.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], col)


# ---------------------------------------------------------------- 卡带
def cart_shell(w: int, h: int, tilt: int = 0, *, contacts: str = 'top',
               fingers_open: bool = False) -> Canvas:
    """磨损的黄色卡带。contacts='top' 金手指朝上（凑到嘴边哈气），
    'bottom' 开口朝下（压在桌沿上划），'front' 正面朝着人（转正检查）。
    tilt 是整体的剪切量（右端抬高多少像素），保证尺寸形状不变只是倾斜。"""
    c = Canvas(w + 4, h + abs(tilt) + 4)
    base = abs(tilt) + 2

    def dy(u: int) -> int:
        if tilt == 0:
            return 0
        return -int(u * tilt / max(1, w - 1))

    for u in range(w):
        oy = base + dy(u)
        c.vline(2 + u, oy, oy + h - 1, 'YEL3')
        c.set(2 + u, oy, 'YEL4')                       # 上棱受光
        c.set(2 + u, oy + h - 1, 'YEL1')               # 下棱背光
        if u < 2 or u > w - 3:
            c.vline(2 + u, oy + 1, oy + h - 2, 'YEL2')
    # 侧棱
    for u in (0, w - 1):
        oy = base + dy(u)
        c.vline(2 + u, oy, oy + h - 1, 'YEL4' if u == 0 else 'YEL2')
    # 贴纸（发黄的旧纸 + 两行抽象字纹）
    lx, lw = 6, w - 12
    ly, lh = 7, h - 15
    for u in range(lw):
        oy = base + dy(lx + u)
        c.vline(2 + lx + u, oy + ly, oy + ly + lh - 1, 'WOOD7')
    for u in range(lw):
        oy = base + dy(lx + u)
        c.set(2 + lx + u, oy + ly, 'GREY8')
        c.set(2 + lx + u, oy + ly + lh - 1, 'WOOD6')
    for row, col in ((2, 'GRN2'), (4, 'RED2'), (6, 'GREY5')):
        if row + 1 >= lh:
            continue
        u = 1
        while u < lw - 2:
            gw = 2 if (u % 5) else 3
            oy = base + dy(lx + u)
            c.hline(2 + lx + u, 2 + lx + min(u + gw - 1, lw - 2), oy + ly + row, col)
            u += gw + 2
    # 顶部提手凹槽
    for u in range(int(w * 0.28), int(w * 0.72)):
        oy = base + dy(u)
        c.set(2 + u, oy + 2, 'YEL2')
    # 磨白的边角
    for u in range(1, w, 7):
        oy = base + dy(u)
        c.set(2 + u, oy + h - 2, 'YEL4')
    if contacts == 'top':
        _contacts(c, 2, base, w, h, dy, up=True)
    elif contacts == 'bottom':
        _contacts(c, 2, base, w, h, dy, up=False)
    else:
        _front_slot(c, 2, base, w, h, dy)
    if fingers_open:
        pass
    c.outline('YEL1', diag=False)
    return c


def _contacts(c: Canvas, ox: int, base: int, w: int, h: int, dy, up: bool) -> None:
    """金手指：暗槽 + 一排 2px 触点。up=True 朝上（哈气），False 朝下（贴桌沿）。"""
    for u in range(2, w - 2):
        oy = base + dy(u)
        y0 = oy - 3 if up else oy + h
        c.vline(ox + u, y0, y0 + 2, 'GREY2')
    i = 0
    for u in range(3, w - 3, 3):
        oy = base + dy(u)
        y0 = oy - 3 if up else oy + h
        c.vline(ox + u, y0, y0 + 2, 'YEL4' if i % 2 == 0 else 'YEL3')
        c.set(ox + u + 1, y0 + 1, 'YEL2')
        i += 1


def _front_slot(c: Canvas, ox: int, base: int, w: int, h: int, dy) -> None:
    """转正检查：从正面看到底部的开口（一条暗缝 + 里面一排反光）。"""
    for u in range(4, w - 4):
        oy = base + dy(u)
        c.vline(ox + u, oy + h - 4, oy + h - 3, 'GREY2')
    for u in range(5, w - 5, 3):
        oy = base + dy(u)
        c.set(ox + u, oy + h - 4, 'YEL3')


# ---------------------------------------------------------------- 手
def hand_blob(c: Canvas, x: int, y: int, w: int, h: int, flip: bool = False) -> None:
    """握住卡带的手：手背一块 + 三根搭在壳体正面的手指。"""
    c.rect(x, y, w, h, 'SKN3')
    c.hline(x, x + w - 1, y, 'SKN4')
    c.hline(x, x + w - 1, y + h - 1, 'SKN2')
    c.vline(x + w - 1 if not flip else x, y, y + h - 1, 'SKN2')
    for i in range(1, 3):                                  # 指关节
        fy = y + 2 + i * 3
        if fy < y + h - 1:
            c.hline(x + 1, x + w - 2, fy, 'SKN2')


def fingers_over(c: Canvas, x: int, y: int, length: int, n: int = 3,
                 step: int = 4, dir_: int = -1) -> None:
    """搭在卡带正面的手指（永远画在壳体之后，所以不会穿过卡带）。"""
    for i in range(n):
        fy = y + i * step
        x0 = x if dir_ < 0 else x
        x1 = x + dir_ * length
        a, b = min(x0, x1), max(x0, x1)
        c.hline(a, b, fy, 'SKN3')
        c.hline(a, b, fy + 1, 'SKN3')
        c.hline(a, b, fy + 2, 'SKN2')
        c.set(a if dir_ < 0 else b, fy, 'SKN4')            # 指尖受光
        c.set(a if dir_ < 0 else b, fy + 1, 'SKN3')


def forearm(c: Canvas, x0: int, y0: int, x1: int, y1: int, thick: int = 13) -> None:
    """从画框边缘伸进来的小臂（手不许悬空）。"""
    steps = max(abs(x1 - x0), abs(y1 - y0))
    for i in range(steps + 1):
        t = i / max(1, steps)
        x = int(round(x0 + (x1 - x0) * t))
        y = int(round(y0 + (y1 - y0) * t))
        c.vline(x, y, y + thick - 1, 'SKN3')
        c.set(x, y, 'SKN4')
        c.set(x, y + thick - 1, 'SKN2')
        c.set(x, y + thick - 2, 'SKN2')


# ---------------------------------------------------------------- 男孩（近景）
HEAD_W, HEAD_H = 26, 28
HEAD_ROWS = (12, 18, 22, 24, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26,
             26, 26, 26, 26, 26, 25, 24, 23, 22, 20, 18, 15, 11, 7)


def head(c: Canvas, cx: int, ytop: int, *, puff: int = 0, mouth: str = 'closed',
         eyes: str = 'open', look: int = 0) -> None:
    """侧前方 3/4 的小男孩头部。puff 是鼓腮档位（0/1/2），look 是视线下压像素。"""
    face = Canvas(HEAD_W + 8, HEAD_H + 6)
    fcx = (HEAD_W + 8) // 2
    for i, wd in enumerate(HEAD_ROWS):
        x0 = fcx - wd // 2
        face.hline(x0, x0 + wd - 1, 2 + i, 'SKN3')
    # 鼓腮：朝着卡带那一侧（右）先胖，第二档两边都胖
    bulge = (0, 2, 4)[puff]
    if bulge:
        for i in range(13, 24):
            wd = HEAD_ROWS[i]
            x1 = fcx - wd // 2 + wd - 1
            grow = bulge if 15 <= i <= 21 else max(1, bulge - 2)
            face.hline(x1 + 1, x1 + grow, 2 + i, 'SKN3')
            face.set(x1 + grow, 2 + i, 'SKN2')
    if puff >= 2:
        for i in range(15, 22):
            wd = HEAD_ROWS[i]
            x0 = fcx - wd // 2
            face.hline(x0 - 2, x0 - 1, 2 + i, 'SKN3')
        face.dither(fcx + 7, 2 + 15, 6, 7, 'SKN2', None, mode='sparse')   # 腮上受挤的暗面
        face.vline(fcx + 6, 2 + 16, 2 + 21, 'SKN2')                       # 鼓起来的折痕
    # 光源左上：右侧压暗、左上提亮（鼓起来的那几行已经自带暗边，别再压一道缝）
    for i, wd in enumerate(HEAD_ROWS):
        x0 = fcx - wd // 2
        x1 = x0 + wd - 1
        if not (bulge and 13 <= i <= 23):
            face.vline(x1, 2 + i, 2 + i, 'SKN2')
            if i > 10:
                face.vline(x1 - 1, 2 + i, 2 + i, 'SKN2')
        if 4 <= i <= 12:
            face.set(x0 + 1, 2 + i, 'SKN4')
    # 头发：板寸
    for i in range(9):
        wd = HEAD_ROWS[i] + (2 if i >= 4 else 0)
        x0 = fcx - wd // 2
        face.hline(x0, x0 + wd - 1, 2 + i, 'GREY1')
    face.hline(fcx - 8, fcx - 4, 3, 'GREY3')                # 头顶高光
    face.dither(fcx - 11, 11, HEAD_W + 2, 1, 'GREY1', None, mode='checker')
    face.set(fcx - 12, 11, 'GREY1')                         # 鬓角
    face.set(fcx + 11, 11, 'GREY1')
    # 耳朵（背对我们的那一侧）
    face.rect(fcx - 14, 2 + 14, 3, 6, 'SKN3')
    face.vline(fcx - 14, 2 + 15, 2 + 18, 'SKN2')
    face.set(fcx - 12, 2 + 16, 'SKN1')
    # 眉毛 / 眼睛（3/4 侧脸：两只眼都往朝向那侧挪）
    ey = 2 + 14 + look
    if eyes == 'squint':
        face.hline(fcx + 1, fcx + 3, ey, 'INK')
        face.hline(fcx + 7, fcx + 9, ey, 'INK')
    elif eyes == 'closed':
        face.hline(fcx + 1, fcx + 3, ey, 'SKN1')
        face.hline(fcx + 7, fcx + 9, ey, 'SKN1')
    else:
        face.rect(fcx + 1, ey - 1, 2, 3, 'INK')
        face.rect(fcx + 7, ey - 1, 2, 3, 'INK')
        face.set(fcx + 1, ey - 1, 'GREY8')
        face.set(fcx + 7, ey - 1, 'GREY8')
    bl = 2 + 11 + (1 if eyes == 'squint' else 0)
    face.hline(fcx, fcx + 4, bl, 'GREY1')
    face.hline(fcx + 6, fcx + 10, bl, 'GREY1')
    # 鼻子
    face.set(fcx + 11, 2 + 19, 'SKN2')
    face.set(fcx + 11, 2 + 20, 'SKN1')
    face.set(fcx + 10, 2 + 20, 'SKN2')
    # 嘴
    mx, my = fcx + 8, 2 + 23
    if mouth == 'closed':
        face.hline(mx, mx + 3, my, 'SKN1')
    elif mouth == 'purse':                                  # 憋着气，嘴收成一点
        face.rect(mx + 1, my - 1, 2, 2, 'SKN1')
        face.set(mx, my, 'SKN2')
        face.set(mx + 3, my, 'SKN2')
    elif mouth == 'blow':                                   # 吹出去：小圆口
        face.rect(mx, my - 1, 3, 3, 'INK')
        face.set(mx + 1, my, 'WOOD2')
        face.set(mx - 1, my, 'SKN2')
        face.set(mx + 3, my, 'SKN2')
    elif mouth == 'relax':
        face.hline(mx - 1, mx + 2, my, 'SKN1')
        face.set(mx + 3, my - 1, 'SKN1')
    face.outline(None, diag=False)
    c.blit(face, cx - fcx, ytop - 2)


def torso(c: Canvas, cx: int, ytop: int, bottom: int, lean: int = 0) -> None:
    """白背心 + 肩膀。腰以下被桌子挡住，所以只画到 bottom。"""
    t = Canvas(FW, FH)
    t.rect(cx - 3 + lean, ytop - 4, 7, 6, 'SKN2')                   # 脖子
    t.hline(cx - 3 + lean, cx + 3 + lean, ytop - 4, 'SKN1')
    w = 44
    x0 = cx - w // 2 + lean
    t.rect(x0, ytop, w, bottom - ytop, 'GREY8')                     # 背心
    t.hline(x0, x0 + w - 1, ytop, 'WHITE')
    t.vline(x0, ytop, bottom - 1, 'WHITE')
    t.rect(x0 + w - 4, ytop, 4, bottom - ytop, 'GREY7')             # 右侧暗面
    t.dither(x0 + 3, ytop + 12, 8, 7, 'GREY7', None, mode='sparse')  # 布褶
    t.dither(x0 + w - 12, ytop + 18, 9, 6, 'GREY7', None, mode='faint')
    # 领口 + 两条肩带之间露出的皮肤
    t.rect(cx - 7 + lean, ytop, 15, 4, 'SKN3')
    t.hline(cx - 7 + lean, cx + 7 + lean, ytop + 3, 'SKN2')
    t.rect(x0 + 2, ytop, 5, 3, 'SKN3')
    t.rect(x0 + w - 7, ytop, 5, 3, 'SKN2')
    t.outline(None, diag=False)
    c.blit(t)


def limb(c: Canvas, pts, thick: int = 5, col: str = 'SKN3',
         dark: str = 'SKN2') -> None:
    """胳膊：折线加粗，转折处补圆，末端不封口（手会盖上去）。"""
    t = Canvas(FW, FH)
    for i in range(len(pts) - 1):
        x0, y0 = pts[i]
        x1, y1 = pts[i + 1]
        steps = max(abs(x1 - x0), abs(y1 - y0), 1)
        for k in range(steps + 1):
            u = k / steps
            x = int(round(x0 + (x1 - x0) * u))
            y = int(round(y0 + (y1 - y0) * u))
            t.disc(x, y, thick / 2.0, col)
    for (x, y) in list(t.d.keys()):
        if (x, y + 1) not in t.d:
            t.set(x, y, dark)
    t.outline('SKN1', diag=False)
    c.blit(t)


# ---------------------------------------------------------------- 气流 / 灰尘
def puff_streaks(c: Canvas, mx: int, my: int, tx: int, ty: int, stage: int) -> None:
    """哈气的气流：只用 1px 短横线，最长 9px，绝不画成烟团。
    stage 0 刚出口 / 1 抵达触点 / 2 掠过触点后变淡 / 3 只剩零星残迹。"""
    sets = {
        0: (((1, 0, 5, 'WHITE'), (2, 3, 4, 'WHITE'), (3, 6, 3, 'GREY8')),),
        1: (((1, -1, 8, 'WHITE'), (2, 2, 9, 'WHITE'), (4, 5, 7, 'WHITE'),
             (6, 8, 5, 'GREY8')),),
        2: (((3, -2, 9, 'GREY8'), (4, 1, 9, 'WHITE'), (6, 4, 9, 'WHITE'),
             (8, 7, 6, 'GREY8')),),
        3: (((6, -2, 5, 'GREY8'), (8, 2, 4, 'WHITE'), (10, 5, 3, 'GREY8')),),
    }
    dx = 1 if tx >= mx else -1
    for group in sets[stage]:
        for (off, drop, ln, col) in group:
            x0 = mx + dx * (2 + off)
            y0 = my + drop
            c.hline(x0, x0 + dx * (ln - 1), y0, col)
            if ln >= 6:
                c.set(x0 + dx * (ln - 1), y0 + 1, col)     # 尾端往下带一格
    if stage in (1, 2):                                     # 掠过触点后的两小段
        c.hline(tx + 3, tx + 6, ty - 2, 'GREY8')
        c.set(tx + 8, ty - 3, 'GREY8')


def dust_dots(c: Canvas, spots) -> None:
    """被吹开 / 划落的灰：1–2px 的点，颜色只在木色与灰色里挑。"""
    for (x, y, big, col) in spots:
        c.set(x, y, col)
        if big:
            c.set(x + 1, y, col)
            c.set(x, y + 1, 'GREY6' if col != 'GREY6' else 'WOOD5')


# ---------------------------------------------------------------- 取景常量
BLOW_DESK = 88                 # 哈气：桌子远边（人在桌后，卡带举到嘴边）
RUB_DESK = 84                  # 划桌：镜头压低，桌沿高光线就是摩擦线
BLOW_CW, BLOW_CH = 36, 24      # 哈气时卡带尺寸（每帧不变）
RUB_CW, RUB_CH = 46, 30        # 划桌时卡带尺寸（每帧不变）
HEAD_CX, HEAD_TOP = 44, 10
MOUTH_DX, MOUTH_DY = 8, 23     # 嘴相对 (head cx, head ytop) 的偏移
CART_AX, CART_AY = 66, 41      # 哈气：卡带左上角基准位（金手指落在 38..40）
RUB_AX, RUB_AY = 30, 64        # 划桌：卡带贴实桌沿时的左上角基准位
RUB_EDGE = RUB_DESK + 12       # = 96，圆钝边的高光线，也是摩擦线


def place_cart(c: Canvas, shell: Canvas, ax: int, ay: int, tilt: int) -> None:
    """按"壳体左列左上角 = (ax, ay)"落位，倾斜不改变尺寸。"""
    c.blit(shell, ax - 2, ay - abs(tilt) - 2)


def stage_blow(c: Canvas, rng: random.Random) -> None:
    """哈气场景的固定背景：墙、桌、电视、主机、手柄、拖在桌上的线。"""
    wall(c, BLOW_DESK)
    edge = desk(c, BLOW_DESK, rng)
    chipped_paint(c, edge, rng)
    crt(c, 96, 16, 44, 76)
    console_box(c, 100, 82)
    gamepad(c, 10, 92)
    cable(c, ((35, 96), (58, 99), (82, 95), (101, 90)))


def stage_rub(c: Canvas, rng: random.Random) -> None:
    """划桌场景的固定背景：镜头贴着桌沿，主机电视退到右上角。"""
    wall(c, RUB_DESK)
    edge = desk(c, RUB_DESK, rng)
    chipped_paint(c, edge, rng)
    crt(c, 104, 40, 36, 48)
    console_box(c, 100, 80)
    cable(c, ((0, 88), (26, 91), (56, 89), (84, 87), (100, 86)))


# ---------------------------------------------------------------- 哈气：手与胳膊
def blow_arms(c: Canvas, ax: int, ay: int) -> None:
    limb(c, ((28, 54), (36, 72), (50, 68), (ax - 3, ay + 14)), 7)
    limb(c, ((60, 54), (74, 70), (ax + BLOW_CW - 1, ay + 12)), 7)


def blow_hands(c: Canvas, ax: int, ay: int) -> None:
    """两只手只抓卡带下半截：贴纸和金手指必须留给观众看。"""
    h = Canvas(FW, FH)
    hand_blob(h, ax - 7, ay + 7, 8, 14)                        # 左手托着左端
    fingers_over(h, ax + 1, ay + 11, 6, n=2, step=5, dir_=1)
    hand_blob(h, ax + BLOW_CW - 3, ay + 5, 9, 15, flip=True)   # 右手捏着右端
    fingers_over(h, ax + BLOW_CW - 4, ay + 9, 7, n=2, step=5, dir_=-1)
    h.outline('SKN1', diag=False)
    c.blit(h)


# ---------------------------------------------------------------- 划桌：手与胳膊
def rub_hand(c: Canvas, ax: int, ay: int, tilt: int) -> None:
    """从右上方抓住卡带的手：手掌压在右端上沿，三指扣在正面，
    左半张贴纸和正在摩擦的那个角必须露出来。"""
    h = Canvas(FW, FH)
    px, py = ax + 26, ay - 12
    h.rect(px, py, 20, 21, 'SKN3')                             # 手背
    h.hline(px, px + 19, py, 'SKN4')
    h.vline(px, py + 1, py + 19, 'SKN4')
    h.rect(px + 16, py, 4, 21, 'SKN2')                         # 右侧暗面
    h.hline(px, px + 19, py + 20, 'SKN2')
    for i in range(3):                                         # 掌骨
        h.hline(px + 3, px + 14, py + 5 + i * 5, 'SKN2')
    for i in range(3):                                         # 扣在卡带正面的三根手指
        fy = ay + 2 + i * 6
        h.rect(ax + 15, fy, 14, 4, 'SKN3')
        h.hline(ax + 15, ax + 28, fy, 'SKN4')
        h.hline(ax + 15, ax + 28, fy + 3, 'SKN2')
        h.set(ax + 15, fy + 1, 'SKN4')
        h.set(ax + 16, fy + 2, 'SKN2')
    limb(h, ((ax + 33, ay + 15), (ax + 25, ay + 21)), 6)       # 拇指
    limb(h, ((ax + 42, ay - 6), (ax + 58, ay - 17), (FW - 1, ay - 31)), 15)
    h.outline('SKN1', diag=False)
    c.blit(h)


# ---------------------------------------------------------------- 灰尘发生器
def scatter(rng: random.Random, x: int, y: int, w: int, h: int, n: int,
            cols=('WOOD5', 'WOOD6', 'GREY6')):
    out = []
    for _ in range(n):
        out.append((x + rng.randrange(max(1, w)), y + rng.randrange(max(1, h)),
                    rng.random() < 0.35, cols[rng.randrange(len(cols))]))
    return out


# ---------------------------------------------------------------- 帧表：哈气 16 帧
# lean 上身前倾 / hdy 头部起伏 / cdx,cdy 卡带偏移 / tilt 倾斜 / air 气流档位
BLOW = (
    # 准备 460ms：把卡带从桌面举起来，凑到嘴边
    dict(ms=160, lean=0, hdy=1, cdx=8, cdy=9, tilt=3, puff=0, mouth='closed',
         eyes='open', look=1, air=None, dust=0),
    dict(ms=150, lean=0, hdy=0, cdx=4, cdy=4, tilt=2, puff=0, mouth='closed',
         eyes='open', look=1, air=None, dust=0),
    dict(ms=150, lean=1, hdy=0, cdx=1, cdy=1, tilt=1, puff=0, mouth='closed',
         eyes='open', look=1, air=None, dust=0),
    # 蓄力 580ms：吸气、鼓腮（玩家按住的时间落在这一段）
    dict(ms=200, lean=1, hdy=0, cdx=0, cdy=0, tilt=1, puff=1, mouth='purse',
         eyes='open', look=1, air=None, dust=0),
    dict(ms=190, lean=1, hdy=-1, cdx=0, cdy=0, tilt=1, puff=2, mouth='purse',
         eyes='open', look=1, air=None, dust=0),
    dict(ms=190, lean=2, hdy=-1, cdx=0, cdy=0, tilt=1, puff=2, mouth='purse',
         eyes='squint', look=1, air=None, dust=0),
    # 发力① 520ms：第一口气出去
    dict(ms=180, lean=2, hdy=0, cdx=0, cdy=0, tilt=1, puff=1, mouth='blow',
         eyes='squint', look=1, air=0, dust=3),
    dict(ms=170, lean=2, hdy=0, cdx=0, cdy=-1, tilt=1, puff=0, mouth='blow',
         eyes='squint', look=1, air=1, dust=9),
    dict(ms=170, lean=1, hdy=1, cdx=0, cdy=0, tilt=1, puff=0, mouth='blow',
         eyes='squint', look=1, air=2, dust=11),
    # 停顿 420ms：闭嘴，眼睛盯着金手指看有没有干净
    dict(ms=210, lean=1, hdy=1, cdx=0, cdy=0, tilt=2, puff=0, mouth='closed',
         eyes='open', look=2, air=3, dust=7),
    dict(ms=210, lean=1, hdy=0, cdx=-1, cdy=0, tilt=3, puff=0, mouth='closed',
         eyes='open', look=2, air=None, dust=4),
    # 发力② 540ms：再吸一口，第二口气
    dict(ms=180, lean=2, hdy=-1, cdx=0, cdy=0, tilt=2, puff=2, mouth='purse',
         eyes='open', look=1, air=None, dust=2),
    dict(ms=180, lean=2, hdy=0, cdx=0, cdy=-1, tilt=2, puff=1, mouth='blow',
         eyes='squint', look=1, air=1, dust=8),
    dict(ms=180, lean=1, hdy=0, cdx=0, cdy=0, tilt=2, puff=0, mouth='blow',
         eyes='squint', look=1, air=2, dust=10),
    # 收尾 560ms：撤开卡带、松一口气
    dict(ms=280, lean=0, hdy=0, cdx=3, cdy=4, tilt=1, puff=0, mouth='relax',
         eyes='open', look=1, air=3, dust=5),
    dict(ms=280, lean=0, hdy=1, cdx=9, cdy=9, tilt=0, puff=0, mouth='relax',
         eyes='open', look=0, air=None, dust=2),
)

# 帧表：划桌 13 帧
# cdx 沿桌沿的水平位移 / cdy 抬起量（负=离开桌沿）/ mark 已划出的痕迹左端 x
RUB = (
    # 准备 560ms：卡带从桌面上方落下来，找准桌沿
    dict(ms=190, cdx=7, cdy=-9, tilt=6, face='bottom', mark=None, deep=False, dust=0, press=False),
    dict(ms=185, cdx=5, cdy=-4, tilt=5, face='bottom', mark=None, deep=False, dust=0, press=False),
    dict(ms=185, cdx=3, cdy=0, tilt=4, face='bottom', mark=None, deep=False, dust=2, press=True),
    # 第一下 480ms：贴着圆钝边往左推
    dict(ms=160, cdx=-2, cdy=0, tilt=4, face='bottom', mark=28, deep=False, dust=6, press=True),
    dict(ms=160, cdx=-9, cdy=0, tilt=4, face='bottom', mark=21, deep=False, dust=10, press=True),
    dict(ms=160, cdx=-16, cdy=0, tilt=4, face='bottom', mark=14, deep=False, dust=14, press=True),
    # 抬起回位 620ms：离开桌沿、灰往下掉、回到起点
    dict(ms=210, cdx=-14, cdy=-6, tilt=6, face='bottom', mark=14, deep=False, dust=12, press=False),
    dict(ms=205, cdx=-5, cdy=-8, tilt=6, face='bottom', mark=14, deep=False, dust=8, press=False),
    dict(ms=205, cdx=3, cdy=-2, tilt=4, face='bottom', mark=14, deep=False, dust=5, press=True),
    # 第二下 490ms：重新落位，再推一下（痕迹加深）
    dict(ms=245, cdx=-7, cdy=0, tilt=4, face='bottom', mark=14, deep=True, dust=12, press=True),
    dict(ms=245, cdx=-16, cdy=0, tilt=4, face='bottom', mark=12, deep=True, dust=16, press=True),
    # 收尾 760ms：抬起、转正，看一眼开口
    dict(ms=380, cdx=-9, cdy=-11, tilt=2, face='bottom', mark=12, deep=True, dust=9, press=False),
    dict(ms=380, cdx=-4, cdy=-17, tilt=0, face='front', mark=12, deep=True, dust=4, press=False),
)


# ---------------------------------------------------------------- 帧渲染
def frame_blow(i: int, p: dict) -> Canvas:
    c = Canvas(FW, FH)
    rng = random.Random(7000 + i)
    stage_blow(c, rng)
    lean = p['lean']
    ax, ay = CART_AX + p['cdx'], CART_AY + p['cdy']
    torso(c, HEAD_CX, 40, BLOW_DESK, lean=lean)
    head(c, HEAD_CX + lean, HEAD_TOP + p['hdy'], puff=p['puff'], mouth=p['mouth'],
         eyes=p['eyes'], look=p['look'])
    blow_arms(c, ax, ay)
    place_cart(c, cart_shell(BLOW_CW, BLOW_CH, p['tilt'], contacts='top'),
               ax, ay, p['tilt'])
    blow_hands(c, ax, ay)
    mx = HEAD_CX + lean + MOUTH_DX
    my = HEAD_TOP + p['hdy'] + MOUTH_DY
    if p['dust']:
        # 灰从金手指上被吹起来，先往右上飘，停顿之后往下落
        if p['air'] in (0, 1, 2):
            spots = scatter(rng, ax + 4, ay - 12, BLOW_CW - 4, 9, p['dust'])
        else:
            spots = scatter(rng, ax + 8, ay - 8, BLOW_CW + 4, 22, p['dust'])
        dust_dots(c, spots)
    if p['air'] is not None:
        puff_streaks(c, mx + 2, my, ax + 1, ay - 3, p['air'])
    return c


def frame_rub(i: int, p: dict) -> Canvas:
    c = Canvas(FW, FH)
    rng = random.Random(9000 + i)
    stage_rub(c, rng)
    ax, ay = RUB_AX + p['cdx'], RUB_AY + p['cdy']
    tilt = p['tilt']
    # 已经划出来的痕：从起划点往左，压在圆钝边的高光线上
    if p['mark'] is not None:
        x0, x1 = p['mark'], RUB_AX + 10
        c.dither(x0, RUB_EDGE, x1 - x0, 1, 'WOOD3', None, mode='checker')
        c.dither(x0 + 1, RUB_EDGE + 1, max(1, x1 - x0 - 3), 1,
                 'WOOD3' if p['deep'] else 'WOOD4', None, mode='sparse')
        if p['deep']:
            c.dither(x0 + 2, RUB_EDGE + 2, max(1, x1 - x0 - 5), 1, 'WOOD2',
                     None, mode='sparse', phase=1)
    place_cart(c, cart_shell(RUB_CW, RUB_CH, tilt, contacts=p['face']), ax, ay, tilt)
    if p['press']:
        # 贴实：开口压在高光线上，接触点两侧压出一道暗影
        c.hline(ax - 1, ax + 10, RUB_EDGE + 1, 'WOOD2')
        c.set(ax - 2, RUB_EDGE, 'WOOD3')
        c.set(ax + 11, RUB_EDGE, 'WOOD3')
    rub_hand(c, ax, ay, tilt)
    if p['dust']:
        n = p['dust']
        low = scatter(rng, ax - 5, RUB_EDGE + 2, 24, 14, (n + 1) // 2,
                      ('WOOD6', 'WOOD7', 'GREY7'))
        far = scatter(rng, ax - 14, RUB_EDGE + 10, 42, 20, n // 2,
                      ('WOOD6', 'GREY7', 'WOOD5'))
        dust_dots(c, low + far)
    return c


# ---------------------------------------------------------------- 落盘
def contact_sheet(frames, path: str) -> None:
    """自查用的拼图（只落在 tools/artref，不进游戏）。"""
    cols = 4
    rows = (len(frames) + cols - 1) // cols
    big = Canvas(FW * cols, FH * rows)
    for i, f in enumerate(frames):
        big.blit(f, (i % cols) * FW, (i // cols) * FH)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    big.to_image().save(path)


def main() -> None:
    print('-- 修卡动画帧 --')
    blow = [frame_blow(i, p) for i, p in enumerate(BLOW)]
    rub = [frame_rub(i, p) for i, p in enumerate(RUB)]
    save(sheet(blow, FW, FH), os.path.join(OUT, 'repair_blow.png'),
         FW, FH, len(blow))
    save(sheet(rub, FW, FH), os.path.join(OUT, 'repair_rub.png'),
         FW, FH, len(rub))
    ref = os.path.join(ROOT, 'tools', 'artref')
    contact_sheet(blow, os.path.join(ref, 'sheet_blow.png'))
    contact_sheet(rub, os.path.join(ref, 'sheet_rub.png'))
    print(f'  哈气 {len(blow)} 帧 合计 {sum(p["ms"] for p in BLOW)}ms / '
          f'划桌 {len(rub)} 帧 合计 {sum(p["ms"] for p in RUB)}ms')
    if os.path.isdir(os.path.dirname(V2)):
        os.makedirs(V2, exist_ok=True)
        for n in ('repair_blow.png', 'repair_rub.png'):
            shutil.copy2(os.path.join(OUT, n), os.path.join(V2, n))
        print(f'  已同步到 {os.path.relpath(V2, os.path.dirname(ROOT))}')
    report()


if __name__ == '__main__':
    main()

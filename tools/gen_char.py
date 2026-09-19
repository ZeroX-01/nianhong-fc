#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""gen_char.py —— B1 角色（kid / mom / friend / vendor_lao / vendor_zhang）+ B3 钱

规格：docs/ART_MANIFEST.md「B 组」；调色板与画法：docs/PALETTE.md
  * 头身比约 1:2.6（大头 Q 版），1px 深色描边（同色系最暗色）
  * 光源统一左上：受光面高光 1px，右/下压暗 1px
  * 走路帧有真实重心起伏（躯干整体 ±1px 升沉 + 手臂反向摆动）
可重复运行：python3 tools/gen_char.py
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pixlib import Canvas, save, sheet, report  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'img', 'char')

# ---------------------------------------------------------------- 通用骨架
SKIN = ('SKN3', 'SKN4', 'SKN2', 'SKN1')   # 基础 / 高光 / 阴影 / 描边


def head_widths(w: int, h: int) -> list[int]:
    """大头 Q 版颅型：顶部 3 行收，下颌 5 行收，中间满宽。"""
    top = [w - 6, w - 3, w - 1]
    bot = [w - 1, w - 2, w - 3, w - 5, w - 7]
    mid = [w] * (h - len(top) - len(bot))
    assert len(mid) >= 1, (w, h)
    return top + mid + bot


def row_span(cx: float, wd: int) -> tuple[int, int]:
    x0 = int(cx - wd / 2.0 + 0.5)
    return x0, x0 + wd - 1


def draw_head(c: Canvas, cx: float, ytop: int, w: int, h: int, *,
              skin=SKIN, hair='GREY1', hair_hl='GREY3', style='buzz',
              hair_h: int | None = None, ears=True, ear_dy=0) -> dict:
    """通用大头：返回 {'face_top','face_bot','cx','widths'} 供五官定位。"""
    widths = head_widths(w, h)
    c.rows(cx, ytop, widths, skin[0])
    # 立体：右缘阴影 + 下颌压暗 + 左上高光
    for i, wd in enumerate(widths):
        x0, x1 = row_span(cx, wd)
        y = ytop + i
        c.set(x1, y, skin[2])
        if i >= len(widths) - 3:
            c.hline(x0 + 1, x1, y, skin[2])
    for i in range(2, min(6, h)):
        x0, _ = row_span(cx, widths[i])
        c.hline(x0, x0 + 1, ytop + i, skin[1])
    if ears:
        ey = ytop + int(h * 0.55) + ear_dy
        for side in (-1, 1):
            wd = widths[min(len(widths) - 1, int(h * 0.55) + ear_dy)]
            x0, x1 = row_span(cx, wd)
            ex = x0 - 1 if side < 0 else x1 + 1
            c.set(ex, ey, skin[0] if side < 0 else skin[2])
            c.set(ex, ey + 1, skin[2])

    hh = hair_h if hair_h is not None else max(4, int(h * 0.38))
    if style == 'buzz':                       # 寸头：薄薄一层，发际线毛糙
        for i in range(hh):
            x0, x1 = row_span(cx, widths[i])
            c.hline(x0, x1, ytop + i, hair)
        c.dither(int(cx - w / 2) + 1, ytop + hh, w - 2, 1, hair, None,
                 mode='checker')              # 发际线毛糙
        x0, x1 = row_span(cx, widths[hh - 1])
        c.set(x0, ytop + hh - 1, skin[0])      # 太阳穴内凹（不然像头盔）
        c.set(x1, ytop + hh - 1, skin[2])
        x0, x1 = row_span(cx, widths[hh])
        c.set(x0, ytop + hh, hair)             # 鬓角
        c.set(x1, ytop + hh, hair)
        x0, _ = row_span(cx, widths[1])
        c.hline(x0 + 1, x0 + 3, ytop + 1, hair_hl)
    elif style == 'bob':                      # 齐耳短发
        for i in range(hh):
            x0, x1 = row_span(cx, widths[i])
            c.hline(x0, x1, ytop + i, hair)
        for i in range(hh, hh + 5):           # 两侧垂到耳下
            if ytop + i >= ytop + h:
                break
            x0, x1 = row_span(cx, widths[min(i, len(widths) - 1)])
            c.hline(x0 - 1, x0 + 1, ytop + i, hair)
            c.hline(x1 - 1, x1 + 1, ytop + i, hair)
        x0, _ = row_span(cx, widths[1])
        c.hline(x0 + 1, x0 + 3, ytop + 1, hair_hl)
    elif style == 'shaved':                   # 剃头（发小）
        for i in range(hh):
            x0, x1 = row_span(cx, widths[i])
            c.hline(x0, x1, ytop + i, hair)
        c.dither(int(cx - w / 2), ytop + hh - 1, w, 2, hair, None,
                 mode='quarter')
    elif style == 'thin':                     # 中年地中海（老李）
        for i in range(hh):
            x0, x1 = row_span(cx, widths[i])
            c.hline(x0, x1, ytop + i, hair)
        for i in range(hh):                   # 中间大片露头皮，只剩两侧
            x0, x1 = row_span(cx, widths[i])
            inset = 1 + i
            if x1 - inset >= x0 + inset:
                c.hline(x0 + inset, x1 - inset, ytop + i, skin[0])
                c.hline(x0 + inset, x0 + inset + 1, ytop + i, skin[1])
        c.dither(int(cx - 3), ytop, 6, 2, hair, None, mode='sparse')
        for i in range(hh, hh + 3):           # 两侧鬓发往下延
            x0, x1 = row_span(cx, widths[min(i, len(widths) - 1)])
            c.hline(x0, x0 + 1, ytop + i, hair)
            c.hline(x1 - 1, x1, ytop + i, hair)
    elif style == 'neat':                     # 三七分（眼镜张）
        for i in range(hh):
            x0, x1 = row_span(cx, widths[i])
            c.hline(x0, x1, ytop + i, hair)
        x0, x1 = row_span(cx, widths[hh])
        c.hline(x0, x0 + int(w * 0.35), ytop + hh, hair)   # 刘海斜下
        c.set(x1, ytop + hh, hair)
        c.hline(x0 + 1, x0 + 2, ytop + 1, hair_hl)
    elif style == 'back':                     # 背面：后脑勺（发丝 + 发旋 + 耳朵 + 后颈）
        for i in range(h - 2):
            x0, x1 = row_span(cx, widths[i])
            c.hline(x0, x1, ytop + i, hair)
        # 顶部受光高光弧（左上光源）
        x0, x1 = row_span(cx, widths[1])
        c.hline(x0 + 1, x0 + int(w * 0.45), ytop + 1, hair_hl)
        x0, x1 = row_span(cx, widths[2])
        c.hline(x0 + 1, x0 + 2, ytop + 2, hair_hl)
        # 发旋（右上一小圈）+ 竖向发丝
        cxi = int(cx)
        c.set(cxi + 2, ytop + 2, hair_hl)
        c.set(cxi + 3, ytop + 3, hair_hl)
        for dx, y0, ln in ((-4, 3, 4), (-2, 5, 3), (3, 4, 3), (5, 6, 3)):
            c.vline(cxi + dx, ytop + y0, ytop + y0 + ln, hair_hl if dx < 0 else 'INK')
        # 两侧耳朵
        for sx in (-1, 1):
            ex = int(cx + sx * (w / 2 - 1)) + (0 if sx < 0 else 0)
            ey = ytop + int(h * 0.5)
            c.rect(ex, ey, 2, 3, skin[0])
            c.set(ex + (0 if sx < 0 else 1), ey + 1, skin[2])
        # 后颈（发际线下露一段脖子）
        nx0, nx1 = row_span(cx, max(3, widths[-1] - 4))
        c.hline(nx0, nx1, ytop + h - 3, hair)
        c.rect(nx0 + 1, ytop + h - 2, nx1 - nx0 - 1, 2, skin[2])
    return {'cx': cx, 'ytop': ytop, 'w': w, 'h': h, 'widths': widths}


def draw_eyes(c: Canvas, cx: float, y: int, *, gap=4, ew=2, dark='INK',
              mood='open', shine=True, skin=SKIN) -> None:
    lx = int(cx - gap / 2 - ew)
    rx = int(cx + gap / 2)
    for x0 in (lx, rx):
        if mood == 'open':
            c.rect(x0, y, ew, 2, dark)
            if shine:
                c.set(x0, y, 'WHITE')
        elif mood == 'closed':
            c.hline(x0 - 1, x0 + ew, y + 1, dark)
        elif mood == 'squint':                # 生气/得意：眼缝
            c.rect(x0, y, ew, 1, dark)
            c.set(x0 + ew - 1, y + 1, dark)
        elif mood == 'wide':                  # 惊慌：大眼白 + 小瞳孔
            c.rect(x0 - 1, y - 1, ew + 2, 4, 'WHITE')
            c.rect(x0, y, ew, 2, dark)
        elif mood == 'dot':
            c.rect(x0, y, 1, 2, dark)
            c.set(x0 + 1, y, dark)


def draw_brows(c: Canvas, cx: float, y: int, *, gap=4, ew=3, mood='neutral',
               col='GREY2') -> None:
    lx = int(cx - gap / 2 - ew)
    rx = int(cx + gap / 2)
    if mood == 'neutral':
        c.hline(lx, lx + ew - 1, y, col)
        c.hline(rx, rx + ew - 1, y, col)
    elif mood == 'angry':                     # 内侧下压（怒）
        for i in range(ew):
            c.set(lx + i, y - 1 + min(i, 2), col)
            c.set(rx + ew - 1 - i, y - 1 + min(i, 2), col)
    elif mood == 'up':                        # 吃惊上扬
        c.hline(lx, lx + ew - 1, y - 1, col)
        c.hline(rx, rx + ew - 1, y - 1, col)
    elif mood == 'sad':
        for i in range(ew):
            c.set(lx + i, y + 1 - min(i, 1), col)
            c.set(rx + ew - 1 - i, y + 1 - min(i, 1), col)


def draw_mouth(c: Canvas, cx: float, y: int, kind='line', col='RED1') -> None:
    if kind == 'line':
        c.hline(cx - 1, cx + 1, y, col)
    elif kind == 'smile':
        c.set(cx - 2, y, col)
        c.hline(cx - 1, cx + 1, y + 1, col)
        c.set(cx + 2, y, col)
    elif kind == 'grin':                      # 憨笑：大张嘴 + 牙
        c.rect(cx - 3, y, 7, 3, col)
        c.hline(cx - 2, cx + 2, y, 'WHITE')
    elif kind == 'open':                      # 吆喝：竖椭圆
        c.rect(cx - 2, y, 5, 4, col)
        c.rect(cx - 1, y + 1, 3, 2, 'RED2')
    elif kind == 'shout':                     # 吼：方口 + 牙
        c.rect(cx - 3, y, 7, 4, col)
        c.hline(cx - 2, cx + 2, y, 'WHITE')
        c.hline(cx - 2, cx + 2, y + 3, 'RED2')
    elif kind == 'frown':
        c.hline(cx - 1, cx + 1, y + 1, col)
        c.set(cx - 2, y, col)
        c.set(cx + 2, y, col)
    elif kind == 'wave':                      # 怂/尴尬
        c.set(cx - 2, y + 1, col)
        c.set(cx - 1, y, col)
        c.set(cx, y + 1, col)
        c.set(cx + 1, y, col)
        c.set(cx + 2, y + 1, col)
    elif kind == 'small':
        c.rect(cx - 1, y, 2, 1, col)


def panel(c: Canvas, x: int, y: int, w: int, h: int, base, lit=None,
          dark=None) -> None:
    """塑料/布料通用：主体 + 上缘 1px 亮 + 右下 1px 暗（光源左上）。"""
    c.rect(x, y, w, h, base)
    if lit:
        c.hline(x, x + w - 2, y, lit)
    if dark:
        c.vline(x + w - 1, y + 1, y + h - 1, dark)
        c.hline(x + 1, x + w - 1, y + h - 1, dark)


def stroke(c: Canvas, pts, col, thick=2, dark=None) -> None:
    """粗线段肢体：沿折线用 thick×thick 方笔刷填充（无插值）。"""
    tmp = Canvas(c.w, c.h)
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        seg = Canvas(c.w, c.h)
        seg.line(x0, y0, x1, y1, col)
        for (px, py) in list(seg.d.keys()):
            tmp.rect(px, py, thick, thick, col)
    if dark:
        for (px, py) in list(tmp.d.keys()):
            if (px + 1, py) not in tmp.d or (px, py + 1) not in tmp.d:
                tmp.d[(px, py)] = tmp.d[(px, py)]
    c.blit(tmp)


def sweat(c: Canvas, x: int, y: int) -> None:
    """头顶三条汗线（惊慌）。"""
    for i, (dx, dy) in enumerate(((0, 0), (4, -1), (8, 1))):
        c.vline(x + dx, y + dy, y + dy + 2, 'BLU5')
        c.set(x + dx, y + dy + 3, 'BLU4')


def anger_mark(c: Canvas, x: int, y: int) -> None:
    """怒气符号「井」。"""
    c.vline(x + 1, y, y + 5, 'RED4')
    c.vline(x + 4, y, y + 5, 'RED4')
    c.hline(x, x + 5, y + 1, 'RED4')
    c.hline(x, x + 5, y + 4, 'RED4')


# ---------------------------------------------------------------- kid 24×44
KID_W, KID_H, KID_N = 24, 44, 6
KCX = 12


def kid_head(c: Canvas, ytop: int, expr: str, look: int = 0) -> None:
    draw_head(c, KCX + look, ytop, 14, 16, hair='GREY1', hair_hl='GREY3',
              style='buzz', hair_h=5)
    cx = KCX + look
    ey = ytop + 9
    if expr == 'idle':
        draw_brows(c, cx, ey - 1, mood='neutral')
        draw_eyes(c, cx, ey + 1, mood='open')
        draw_mouth(c, cx, ytop + 13, kind='smile')
    elif expr == 'walk':
        draw_brows(c, cx, ey - 1, mood='neutral')
        draw_eyes(c, cx, ey + 1, mood='open')
        draw_mouth(c, cx, ytop + 13, kind='small')
    elif expr == 'focus':                     # 打游戏：抬眼、咬牙
        draw_brows(c, cx, ey - 1, mood='angry', col='GREY1')
        draw_eyes(c, cx, ey + 1, mood='squint')
        draw_mouth(c, cx, ytop + 13, kind='line')
    elif expr == 'panic':
        draw_brows(c, cx, ey - 2, mood='up')
        draw_eyes(c, cx, ey + 1, mood='wide')
        draw_mouth(c, cx, ytop + 12, kind='shout', col='RED1')
    elif expr == 'study':
        draw_brows(c, cx, ey - 1, mood='sad')
        draw_eyes(c, cx, ey + 1, mood='closed')
        draw_mouth(c, cx, ytop + 13, kind='wave')
    # 鼻子
    c.set(cx, ytop + 11, 'SKN2')


def kid_torso(c: Canvas, dy: int) -> None:
    """白背心 + 蓝短裤（不含腿）。"""
    c.rect(10, 18 + dy, 4, 1, 'SKN2')                       # 脖子
    panel(c, 7, 19 + dy, 10, 12, 'WHITE', None, 'GREY7')    # 背心
    c.hline(9, 14, 19 + dy, 'SKN2')                         # 领口
    c.set(8, 19 + dy, 'GREY8')
    c.set(15, 19 + dy, 'GREY7')
    c.vline(16, 20 + dy, 29 + dy, 'GREY8')                  # 右侧暗面
    c.hline(7, 16, 30 + dy, 'GREY7')                        # 下摆
    c.dither(8, 26 + dy, 3, 3, 'GREY8', None, mode='quarter')  # 布褶
    panel(c, 7, 31 + dy, 10, 6, 'BLU3', 'BLU4', 'BLU2')     # 短裤
    c.vline(11, 34 + dy, 36 + dy, 'BLU1')                   # 裤裆缝
    c.vline(12, 34 + dy, 36 + dy, 'BLU2')


def kid_arm(c: Canvas, side: int, pts, hand=True) -> None:
    stroke(c, pts, 'SKN3', 2)
    for (x, y) in pts:
        pass
    if hand:
        hx, hy = pts[-1]
        c.rect(hx, hy + 1, 2, 2, 'SKN2')


def kid_leg(c: Canvas, x: int, y0: int, y1: int, shoe_x: int, dy_shoe=0) -> None:
    c.rect(x, y0, 3, y1 - y0 + 1, 'SKN3')
    c.vline(x + 2, y0, y1, 'SKN2')
    # 塑料凉鞋
    c.rect(shoe_x, y1 + 1 + dy_shoe, 5, 2, 'WOOD5')
    c.hline(shoe_x, shoe_x + 4, y1 + 1 + dy_shoe, 'WOOD6')
    c.set(shoe_x + 4, y1 + 2 + dy_shoe, 'WOOD3')


def kid_frame(i: int) -> Canvas:
    c = Canvas(KID_W, KID_H)
    if i == 0:      # 站立
        kid_head(c, 2, 'idle')
        kid_torso(c, 0)
        kid_arm(c, -1, [(5, 20), (5, 27)])
        kid_arm(c, 1, [(17, 20), (17, 27)])
        kid_leg(c, 8, 37, 41, 7)
        kid_leg(c, 13, 37, 41, 12)
    elif i == 1:    # 走路 A（着地帧：重心低 1px，两腿大幅分开）
        dy = 1
        kid_head(c, 2 + dy, 'walk')
        kid_torso(c, dy)
        kid_arm(c, -1, [(5, 21 + dy), (3, 27 + dy)])        # 后摆
        kid_arm(c, 1, [(17, 21 + dy), (19, 26 + dy)])       # 前摆
        c.rect(6, 38, 3, 4, 'SKN3')                          # 前伸腿
        c.set(9, 39, 'SKN3')
        c.vline(8, 38, 41, 'SKN2')
        c.rect(3, 42, 6, 2, 'WOOD5')                         # 前脚（跟先着地）
        c.hline(3, 8, 42, 'WOOD6')
        c.rect(14, 38, 3, 4, 'SKN3')                         # 后蹬腿
        c.set(13, 39, 'SKN3')
        c.vline(16, 38, 41, 'SKN2')
        c.rect(14, 42, 6, 2, 'WOOD5')                        # 后脚（脚尖点地）
        c.hline(14, 19, 42, 'WOOD6')
        c.set(19, 43, 'WOOD3')
    elif i == 2:    # 走路 B（过渡帧：重心抬高，一腿抬起过顶点）
        dy = 0
        kid_head(c, 1, 'walk')                               # 头再抬 1px
        kid_torso(c, dy)
        kid_arm(c, -1, [(5, 20), (6, 26)])
        kid_arm(c, 1, [(17, 20), (16, 27)])
        c.rect(10, 37, 3, 5, 'SKN3')                         # 支撑腿绷直
        c.vline(12, 37, 41, 'SKN2')
        c.rect(9, 42, 5, 2, 'WOOD5')
        c.hline(9, 13, 42, 'WOOD6')
        c.rect(13, 37, 3, 2, 'SKN3')                         # 摆动腿屈膝抬起
        c.rect(14, 39, 3, 2, 'SKN3')
        c.vline(16, 39, 40, 'SKN2')
        c.rect(14, 41, 5, 2, 'WOOD5')
        c.hline(14, 18, 41, 'WOOD6')
    elif i == 3:    # 盘腿坐地，双手举手柄，低头
        kid_head(c, 7, 'focus')
        c.rect(10, 23, 4, 1, 'SKN2')
        panel(c, 7, 24, 10, 11, 'WHITE', None, 'GREY7')
        c.hline(9, 14, 24, 'SKN2')
        c.vline(16, 25, 34, 'GREY8')
        c.dither(8, 30, 3, 3, 'GREY8', None, mode='quarter')
        # 盘腿：短裤 + 两条向外张开又交叠的小腿
        panel(c, 6, 35, 12, 4, 'BLU3', 'BLU4', 'BLU2')
        c.rect(4, 38, 6, 3, 'BLU3')                          # 左大腿外张
        c.rect(14, 38, 6, 3, 'BLU3')                         # 右大腿外张
        c.hline(4, 9, 38, 'BLU4')
        c.hline(14, 19, 38, 'BLU4')
        c.hline(4, 19, 40, 'BLU2')
        c.rect(3, 41, 8, 3, 'SKN3')                          # 左小腿横过来
        c.rect(13, 41, 8, 3, 'SKN3')
        c.hline(3, 10, 43, 'SKN2')
        c.hline(13, 20, 43, 'SKN2')
        c.rect(10, 40, 4, 3, 'SKN2')                         # 两脚在身前交叠
        c.rect(11, 41, 3, 2, 'SKN3')
        c.rect(2, 41, 2, 3, 'WOOD5')                         # 脱下的凉鞋一角
        c.rect(20, 41, 2, 3, 'WOOD5')
        # 手臂前伸捧手柄
        stroke(c, [(5, 26), (7, 31)], 'SKN3', 2)
        stroke(c, [(17, 26), (15, 31)], 'SKN3', 2)
        c.rect(7, 31, 10, 5, 'GREY7')                        # 手柄
        c.hline(7, 16, 31, 'GREY8')
        c.rect(7, 34, 10, 2, 'RED3')
        c.set(9, 33, 'INK')
        c.vline(9, 32, 34, 'INK')
        c.hline(8, 10, 33, 'INK')
        c.rect(13, 32, 2, 2, 'RED4')
        c.rect(6, 30, 2, 2, 'SKN2')                          # 手
        c.rect(16, 30, 2, 2, 'SKN2')
    elif i == 4:    # 惊慌回头，举手，三条汗线
        kid_head(c, 4, 'panic', look=1)
        kid_torso(c, 2)
        stroke(c, [(6, 22), (4, 16)], 'SKN3', 2)             # 左手举起
        c.rect(3, 14, 3, 2, 'SKN2')
        stroke(c, [(17, 22), (19, 17)], 'SKN3', 2)           # 右手举起
        c.rect(19, 15, 3, 2, 'SKN2')
        kid_leg(c, 8, 39, 41, 6)
        kid_leg(c, 13, 39, 41, 13)
        sweat(c, 3, 1)
    elif i == 5:    # 趴桌写作业（伏案：驼背 + 头压低 + 手在桌面）
        kid_head(c, 12, 'study', look=1)
        c.rect(11, 28, 4, 1, 'SKN2')
        # 拱起的背（上窄下宽，向右前倾）
        for r, (x0, wd) in enumerate(((6, 11), (5, 12), (5, 12), (5, 12),
                                      (5, 11), (5, 11), (6, 10))):
            c.hline(x0, x0 + wd - 1, 29 + r, 'WHITE')
        c.vline(16, 29, 34, 'GREY7')
        c.hline(6, 15, 29, 'GREY8')
        c.hline(11, 15, 28, 'SKN2')                          # 后领口
        c.dither(6, 32, 4, 3, 'GREY8', None, mode='quarter')
        panel(c, 5, 36, 12, 5, 'BLU3', 'BLU4', 'BLU2')       # 坐着的短裤
        c.rect(4, 41, 4, 3, 'SKN3')                          # 垂下的小腿
        c.rect(11, 41, 4, 3, 'SKN3')
        c.vline(7, 41, 43, 'SKN2')
        c.vline(14, 41, 43, 'SKN2')
        c.rect(3, 43, 5, 1, 'WOOD5')
        c.rect(10, 43, 5, 1, 'WOOD5')
        stroke(c, [(7, 31), (17, 33)], 'SKN3', 2)            # 趴在桌面的手臂
        c.rect(17, 33, 3, 2, 'SKN2')
        c.line(20, 29, 18, 33, 'YEL3')                       # 铅笔
        c.set(20, 28, 'WOOD3')
        c.set(18, 34, 'GREY2')
    c.outline()
    return c


# ---------------------------------------------------------------- mom 28×54
MOM_W, MOM_H, MOM_N = 28, 54, 6
MCX = 14


def mom_head(c: Canvas, ytop: int, expr: str, back=False, look=0) -> None:
    cx = MCX + look
    if back:
        draw_head(c, cx, ytop, 16, 19, hair='GREY1', hair_hl='GREY3',
                  style='back', ears=False)
        c.hline(cx - 2, cx + 1, ytop + 17, 'SKN2')          # 后颈
        return
    draw_head(c, cx, ytop, 16, 19, hair='GREY1', hair_hl='GREY3',
              style='bob', hair_h=6, ear_dy=1)
    ey = ytop + 10
    if expr == 'idle':
        draw_brows(c, cx, ey - 2, mood='neutral', col='GREY2')
        draw_eyes(c, cx, ey, mood='open')
        draw_mouth(c, cx, ytop + 15, kind='smile', col='RED2')
    elif expr == 'walk':
        draw_brows(c, cx, ey - 2, mood='neutral', col='GREY2')
        draw_eyes(c, cx, ey, mood='open')
        draw_mouth(c, cx, ytop + 15, kind='line', col='RED2')
    elif expr == 'angry':
        draw_brows(c, cx, ey - 1, mood='angry', ew=4, col='INK')
        draw_eyes(c, cx, ey + 1, mood='squint', shine=False)
        draw_mouth(c, cx, ytop + 14, kind='shout', col='RED1')
        c.dither(cx - 7, ytop + 12, 3, 2, 'RED4', None, mode='quarter')  # 涨红
        c.dither(cx + 4, ytop + 12, 3, 2, 'RED4', None, mode='quarter')
    elif expr == 'point':
        draw_brows(c, cx, ey - 2, mood='angry', ew=4, col='GREY1')
        draw_eyes(c, cx, ey + 1, mood='open', shine=False)
        draw_mouth(c, cx, ytop + 14, kind='open', col='RED1')
    c.set(cx, ytop + 12, 'SKN2')


def mom_body(c: Canvas, dy: int, back=False) -> None:
    """的确良浅蓝衬衫 + 花围裙 + 深灰裤子。"""
    c.rect(12, 21 + dy, 4, 1, 'SKN2')
    panel(c, 8, 22 + dy, 12, 15, 'BLU5', None, 'BLU4')       # 衬衫
    c.vline(19, 23 + dy, 36 + dy, 'BLU4')
    if not back:
        c.hline(11, 16, 22 + dy, 'BLU4')                     # 领子
        c.set(10, 22 + dy, 'GREY8')
        c.set(17, 22 + dy, 'BLU4')
        # 围裙（花布）：胸挡 + 挂颈带 + 下摆外扩
        c.vline(11, 23 + dy, 26 + dy, 'PUR3')                # 挂颈带
        c.vline(16, 23 + dy, 26 + dy, 'PUR3')
        c.set(11, 22 + dy, 'PUR2')
        c.set(16, 22 + dy, 'PUR2')
        c.rect(11, 26 + dy, 6, 4, 'PUR3')                    # 胸挡
        c.rect(9, 30 + dy, 10, 11, 'PUR3')                   # 下摆（外扩）
        c.hline(9, 18, 30 + dy, 'PUR4')
        c.hline(11, 16, 26 + dy, 'PUR4')
        c.dither(9, 27 + dy, 10, 13, 'PUR4', None, mode='sparse')
        c.dither(10, 31 + dy, 8, 8, 'YEL3', None, mode='quarter', phase=1)
        c.vline(18, 31 + dy, 40 + dy, 'PUR2')
        c.hline(9, 18, 40 + dy, 'PUR2')
        c.rect(13, 34 + dy, 4, 3, 'PUR2')                    # 口袋
        c.hline(13, 16, 34 + dy, 'PUR4')
        c.set(8, 33 + dy, 'PUR2')                            # 腰带系到身后
        c.set(19, 33 + dy, 'PUR2')
    else:
        # 背面：只看到挂颈带 + 腰带 + 蝴蝶结，衬衫背面留白（不要一大块粉）
        c.vline(11, 22 + dy, 32 + dy, 'PUR3')                # 交叉挂颈带
        c.vline(16, 22 + dy, 32 + dy, 'PUR3')
        c.line(11, 24 + dy, 16, 30 + dy, 'PUR2')
        c.line(16, 24 + dy, 11, 30 + dy, 'PUR2')
        c.hline(8, 19, 32 + dy, 'PUR3')                      # 腰带
        c.hline(8, 19, 33 + dy, 'PUR2')
        c.rect(12, 31 + dy, 2, 4, 'PUR3')                    # 蝴蝶结（两耳 + 结心）
        c.rect(15, 31 + dy, 2, 4, 'PUR3')
        c.set(12, 32 + dy, 'PUR4')
        c.set(16, 32 + dy, 'PUR4')
        c.rect(14, 32 + dy, 1, 2, 'PUR4')
        c.vline(13, 35 + dy, 38 + dy, 'PUR3')                # 垂下的带尾
        c.vline(16, 35 + dy, 37 + dy, 'PUR3')
        c.dither(8, 34 + dy, 12, 4, 'BLU4', None, mode='faint')
        c.set(13, 30 + dy, 'PUR2')
        c.set(14, 31 + dy, 'PUR2')
    panel(c, 9, 41 + dy, 10, 6, 'GREY4', 'GREY5', 'GREY3')   # 裤子
    c.vline(13, 43 + dy, 46 + dy, 'GREY3')
    c.vline(14, 43 + dy, 46 + dy, 'GREY2')


def mom_shoe(c: Canvas, x: int, y: int) -> None:
    c.rect(x, y, 5, 2, 'GREY2')
    c.hline(x, x + 4, y, 'GREY3')


def mom_frame(i: int) -> Canvas:
    c = Canvas(MOM_W, MOM_H)
    if i == 0:
        mom_head(c, 2, 'idle')
        mom_body(c, 0)
        stroke(c, [(7, 24), (7, 33)], 'BLU5', 2)
        stroke(c, [(19, 24), (19, 33)], 'BLU5', 2)
        c.rect(7, 34, 2, 2, 'SKN2')
        c.rect(19, 34, 2, 2, 'SKN2')
        c.rect(10, 47, 3, 4, 'GREY6')                        # 小腿（肉色袜）
        c.rect(15, 47, 3, 4, 'GREY6')
        mom_shoe(c, 9, 51)
        mom_shoe(c, 14, 51)
    elif i == 1:                                             # 走路 A（低）
        dy = 1
        mom_head(c, 2 + dy, 'walk')
        mom_body(c, dy)
        stroke(c, [(7, 25 + dy), (6, 33 + dy)], 'BLU5', 2)
        stroke(c, [(19, 25 + dy), (20, 32 + dy)], 'BLU5', 2)
        c.rect(6, 34 + dy, 2, 2, 'SKN2')
        c.rect(20, 33 + dy, 2, 2, 'SKN2')
        c.rect(9, 48, 3, 4, 'GREY6')
        c.rect(16, 48, 3, 3, 'GREY6')
        mom_shoe(c, 7, 52)
        mom_shoe(c, 16, 51)
    elif i == 2:                                             # 走路 B（高）
        dy = 0
        mom_head(c, 2, 'walk')
        mom_body(c, dy)
        stroke(c, [(7, 24), (8, 32)], 'BLU5', 2)
        stroke(c, [(19, 24), (18, 33)], 'BLU5', 2)
        c.rect(8, 33, 2, 2, 'SKN2')
        c.rect(18, 34, 2, 2, 'SKN2')
        c.rect(12, 47, 3, 5, 'GREY6')
        c.rect(15, 47, 3, 3, 'GREY6')
        mom_shoe(c, 11, 52)
        mom_shoe(c, 15, 50)
    elif i == 3:                                             # 叉腰生气
        mom_head(c, 3, 'angry')
        mom_body(c, 1)
        anger_mark(c, 20, 0)
        c.hline(8, 19, 23, 'BLU4')                           # 端起来的肩线
        # 手臂外撑成三角（肘尖朝外，手背在腰上）
        stroke(c, [(7, 25), (3, 30)], 'BLU5', 2)
        stroke(c, [(3, 30), (8, 35)], 'BLU5', 2)
        stroke(c, [(20, 25), (24, 30)], 'BLU5', 2)
        stroke(c, [(24, 30), (19, 35)], 'BLU5', 2)
        c.rect(8, 35, 3, 3, 'SKN2')
        c.rect(18, 35, 3, 3, 'SKN2')
        c.set(9, 36, 'SKN3')
        c.set(19, 36, 'SKN3')
        c.rect(10, 48, 3, 4, 'GREY6')
        c.rect(15, 48, 3, 4, 'GREY6')
        mom_shoe(c, 8, 52)
        mom_shoe(c, 15, 52)
    elif i == 4:                                             # 手拿锅铲指前方
        mom_head(c, 2, 'point')
        mom_body(c, 0)
        stroke(c, [(7, 25), (6, 33)], 'BLU5', 2)
        c.rect(6, 34, 2, 2, 'SKN2')
        stroke(c, [(19, 25), (23, 24)], 'BLU5', 2)           # 抬起的右臂
        c.rect(23, 23, 2, 3, 'SKN2')
        c.vline(25, 18, 24, 'WOOD4')                         # 锅铲柄
        c.set(24, 19, 'WOOD5')
        c.rect(24, 14, 3, 4, 'GREY6')                        # 铲头
        c.hline(24, 26, 14, 'GREY7')
        c.set(26, 17, 'GREY4')
        c.rect(10, 47, 3, 4, 'GREY6')
        c.rect(15, 47, 3, 4, 'GREY6')
        mom_shoe(c, 9, 51)
        mom_shoe(c, 14, 51)
    elif i == 5:                                             # 转身背对
        mom_head(c, 2, 'idle', back=True)
        mom_body(c, 0, back=True)
        stroke(c, [(7, 24), (8, 32)], 'BLU5', 2)
        stroke(c, [(19, 24), (18, 32)], 'BLU5', 2)
        c.rect(8, 33, 2, 2, 'SKN2')
        c.rect(18, 33, 2, 2, 'SKN2')
        c.rect(10, 47, 3, 4, 'GREY6')
        c.rect(15, 47, 3, 4, 'GREY6')
        mom_shoe(c, 9, 51)
        mom_shoe(c, 14, 51)
    c.outline()
    return c


# ---------------------------------------------------------------- friend 28×48
FR_W, FR_H, FR_N = 28, 48, 4
FCX = 14


def friend_head(c: Canvas, ytop: int, expr: str) -> None:
    draw_head(c, FCX, ytop, 17, 17, hair='GREY2', hair_hl='GREY4',
              style='shaved', hair_h=5, ear_dy=0)
    cx = FCX
    c.hline(cx - 5, cx - 1, ytop + 2, 'GREY8')               # 剃头疤痕白印
    c.set(cx, ytop + 3, 'GREY8')
    ey = ytop + 9
    if expr == 'grin':
        draw_brows(c, cx, ey - 2, mood='up', col='GREY2')
        draw_eyes(c, cx, ey, mood='squint', shine=False)
        draw_mouth(c, cx, ytop + 13, kind='grin', col='RED1')
    elif expr == 'walk':
        draw_brows(c, cx, ey - 2, mood='neutral', col='GREY2')
        draw_eyes(c, cx, ey, mood='open')
        draw_mouth(c, cx, ytop + 13, kind='smile', col='RED2')
    elif expr == 'smug':
        draw_brows(c, cx, ey - 1, mood='angry', col='GREY2')
        draw_eyes(c, cx, ey, mood='squint', shine=False)
        draw_mouth(c, cx, ytop + 13, kind='grin', col='RED1')
    c.set(cx, ytop + 11, 'SKN2')
    c.dither(cx - 6, ytop + 11, 3, 2, 'SKN2', None, mode='quarter')   # 胖脸腮红
    c.dither(cx + 4, ytop + 11, 3, 2, 'SKN2', None, mode='quarter')


def friend_body(c: Canvas, dy: int) -> None:
    """海魂衫：白底 + BLU3 横条纹，圆滚滚。"""
    c.rect(12, 19 + dy, 4, 1, 'SKN2')
    for row, wd in enumerate((11, 13, 15, 16, 16, 17, 17, 16, 15, 13)):
        x0 = 14 - wd // 2
        c.hline(x0, x0 + wd - 1, 20 + dy + row, 'GREY8')
    for row in range(0, 10, 2):                              # 横条纹
        y = 21 + dy + row
        wd = (13, 16, 17, 16, 13)[row // 2]
        x0 = 14 - wd // 2
        c.hline(x0, x0 + wd - 1, y, 'BLU3')
    c.hline(12, 16, 20 + dy, 'SKN2')                         # 领口
    c.vline(21, 23 + dy, 28 + dy, 'GREY7')
    panel(c, 7, 30 + dy, 14, 6, 'GREY5', 'GREY6', 'GREY4')   # 短裤
    c.vline(13, 33 + dy, 35 + dy, 'GREY3')


def friend_frame(i: int) -> Canvas:
    c = Canvas(FR_W, FR_H)
    if i == 0:
        friend_head(c, 1, 'grin')
        friend_body(c, 0)
        stroke(c, [(6, 22), (6, 29)], 'SKN3', 2)
        stroke(c, [(20, 22), (20, 29)], 'SKN3', 2)
        c.rect(6, 30, 2, 2, 'SKN2')
        c.rect(20, 30, 2, 2, 'SKN2')
        c.rect(9, 36, 4, 5, 'SKN3')
        c.rect(15, 36, 4, 5, 'SKN3')
        c.vline(12, 36, 40, 'SKN2')
        c.vline(18, 36, 40, 'SKN2')
        c.rect(8, 41, 6, 3, 'BLU3')                          # 塑料凉鞋
        c.rect(14, 41, 6, 3, 'BLU3')
        c.hline(8, 13, 41, 'BLU4')
        c.hline(14, 19, 41, 'BLU4')
    elif i == 1:                                             # 走路 A（低）
        dy = 1
        friend_head(c, 1 + dy, 'walk')
        friend_body(c, dy)
        stroke(c, [(6, 23 + dy), (5, 29 + dy)], 'SKN3', 2)
        stroke(c, [(20, 23 + dy), (21, 28 + dy)], 'SKN3', 2)
        c.rect(5, 30 + dy, 2, 2, 'SKN2')
        c.rect(21, 29 + dy, 2, 2, 'SKN2')
        c.rect(8, 37, 4, 5, 'SKN3')
        c.rect(16, 37, 4, 4, 'SKN3')
        c.rect(6, 42, 6, 3, 'BLU3')
        c.rect(16, 41, 6, 3, 'BLU3')
        c.hline(6, 11, 42, 'BLU4')
        c.hline(16, 21, 41, 'BLU4')
    elif i == 2:                                             # 走路 B（高）
        friend_head(c, 1, 'walk')
        friend_body(c, 0)
        stroke(c, [(6, 22), (7, 28)], 'SKN3', 2)
        stroke(c, [(20, 22), (19, 29)], 'SKN3', 2)
        c.rect(7, 29, 2, 2, 'SKN2')
        c.rect(19, 30, 2, 2, 'SKN2')
        c.rect(11, 36, 4, 5, 'SKN3')
        c.rect(15, 36, 4, 4, 'SKN3')
        c.rect(10, 41, 6, 3, 'BLU3')
        c.rect(16, 40, 6, 3, 'BLU3')
        c.hline(10, 15, 41, 'BLU4')
        c.hline(16, 21, 40, 'BLU4')
    elif i == 3:                                             # 抢手柄（得意脸）
        friend_head(c, 2, 'smug')
        friend_body(c, 1)
        stroke(c, [(6, 24), (5, 30)], 'SKN3', 2)
        c.rect(5, 31, 2, 2, 'SKN2')
        stroke(c, [(19, 24), (24, 22)], 'SKN3', 2)           # 伸手去抢
        c.rect(24, 20, 3, 3, 'SKN2')
        c.set(26, 21, 'SKN3')
        c.set(23, 20, 'SKN3')
        c.rect(9, 37, 4, 4, 'SKN3')
        c.rect(15, 37, 4, 4, 'SKN3')
        c.rect(8, 41, 6, 3, 'BLU3')
        c.rect(14, 41, 6, 3, 'BLU3')
        c.hline(8, 13, 41, 'BLU4')
        c.hline(14, 19, 41, 'BLU4')
    c.outline()
    return c


# ------------------------------------------------------- vendor_lao 30×52
VL_W, VL_H, VL_N = 30, 52, 3
LCX = 15


def lao_head(c: Canvas, ytop: int, expr: str) -> None:
    draw_head(c, LCX, ytop, 15, 18, hair='GREY2', hair_hl='GREY4',
              style='thin', hair_h=5,
              skin=('SKN2', 'SKN3', 'SKN1', 'SKN1'))
    cx = LCX
    ey = ytop + 10
    if expr == 'shout':
        draw_brows(c, cx, ey - 2, mood='up', col='GREY1')
        draw_eyes(c, cx, ey, mood='open', shine=False)
        draw_mouth(c, cx, ytop + 14, kind='open', col='RED1')
        c.hline(cx + 2, cx + 6, ytop + 16, 'WOOD6')          # 牙签
        c.set(cx + 7, ytop + 15, 'WOOD6')
        c.set(cx + 8, ytop + 15, 'WOOD5')
    elif expr == 'hand':
        draw_brows(c, cx, ey - 2, mood='neutral', col='GREY1')
        draw_eyes(c, cx, ey, mood='squint', shine=False)
        draw_mouth(c, cx, ytop + 14, kind='smile', col='RED1')
        c.hline(cx + 2, cx + 6, ytop + 15, 'WOOD6')
        c.set(cx + 7, ytop + 14, 'WOOD6')
        c.set(cx + 8, ytop + 14, 'WOOD5')
    elif expr == 'no':
        draw_brows(c, cx, ey - 2, mood='sad', col='GREY1')
        draw_eyes(c, cx, ey, mood='closed', shine=False)
        draw_mouth(c, cx, ytop + 14, kind='frown', col='RED1')
        c.hline(cx + 2, cx + 6, ytop + 16, 'WOOD6')
        c.set(cx + 7, ytop + 16, 'WOOD5')
    # 尖嘴猴腮：颊部凹陷 + 下巴尖
    c.dither(cx - 6, ytop + 12, 3, 3, 'SKN1', None, mode='quarter')
    c.dither(cx + 4, ytop + 12, 3, 3, 'SKN1', None, mode='quarter')
    c.set(cx, ytop + 12, 'SKN1')


def lao_body(c: Canvas, dy: int) -> None:
    """夹克敞开 + 里面灰衬衫 + 腰包。"""
    c.rect(13, 20 + dy, 4, 1, 'SKN1')
    panel(c, 9, 21 + dy, 12, 16, 'WOOD4', 'WOOD5', 'WOOD2')  # 夹克
    c.rect(12, 21 + dy, 6, 12, 'GREY7')                      # 里面的衬衫
    c.vline(17, 22 + dy, 32 + dy, 'GREY6')
    c.hline(13, 16, 21 + dy, 'SKN1')
    c.vline(11, 22 + dy, 36 + dy, 'WOOD5')                   # 敞开的门襟
    c.vline(18, 22 + dy, 36 + dy, 'WOOD2')
    c.vline(12, 23 + dy, 33 + dy, 'WOOD2')
    c.set(12, 26 + dy, 'YEL3')                               # 拉链头
    c.rect(9, 33 + dy, 12, 4, 'WOOD5')                       # 腰包
    c.hline(9, 20, 33 + dy, 'WOOD6')
    c.rect(12, 34 + dy, 5, 2, 'RED3')
    c.set(16, 34 + dy, 'RED4')
    c.hline(9, 20, 36 + dy, 'WOOD2')
    panel(c, 10, 37 + dy, 10, 9, 'BLU2', 'BLU3', 'BLU1')     # 牛仔裤
    c.vline(14, 40 + dy, 45 + dy, 'BLU1')
    c.dither(11, 39 + dy, 3, 4, 'BLU3', None, mode='quarter')


def lao_frame(i: int) -> Canvas:
    c = Canvas(VL_W, VL_H)
    if i == 0:                                               # 站立吆喝
        lao_head(c, 1, 'shout')
        lao_body(c, 0)
        stroke(c, [(8, 23), (7, 32)], 'WOOD4', 2)
        stroke(c, [(21, 23), (22, 31)], 'WOOD4', 2)
        c.rect(7, 33, 2, 2, 'SKN2')
        c.rect(22, 32, 2, 2, 'SKN2')
        c.rect(11, 46, 3, 3, 'BLU2')
        c.rect(16, 46, 3, 3, 'BLU2')
        c.rect(9, 49, 6, 2, 'GREY2')
        c.rect(15, 49, 6, 2, 'GREY2')
        c.hline(9, 14, 49, 'GREY3')
        c.hline(15, 20, 49, 'GREY3')
    elif i == 1:                                             # 递卡带
        lao_head(c, 1, 'hand')
        lao_body(c, 0)
        stroke(c, [(8, 23), (8, 32)], 'WOOD4', 2)
        c.rect(8, 33, 2, 2, 'SKN2')
        stroke(c, [(20, 24), (25, 26)], 'WOOD4', 2)          # 伸手
        c.rect(25, 26, 3, 3, 'SKN2')
        c.rect(26, 22, 4, 6, 'GREY7')                        # 手上的卡带
        c.hline(26, 29, 22, 'GREY8')
        c.rect(27, 24, 3, 3, 'RED3')
        c.set(29, 27, 'GREY5')
        c.rect(11, 46, 3, 3, 'BLU2')
        c.rect(16, 46, 3, 3, 'BLU2')
        c.rect(9, 49, 6, 2, 'GREY2')
        c.rect(15, 49, 6, 2, 'GREY2')
        c.hline(9, 14, 49, 'GREY3')
        c.hline(15, 20, 49, 'GREY3')
    else:                                                    # 摇头不卖
        lao_head(c, 2, 'no')
        lao_body(c, 1)
        stroke(c, [(8, 24), (10, 31)], 'WOOD4', 2)
        stroke(c, [(21, 24), (19, 31)], 'WOOD4', 2)
        c.rect(10, 32, 2, 2, 'SKN2')
        c.rect(19, 32, 2, 2, 'SKN2')
        c.rect(11, 47, 3, 3, 'BLU2')
        c.rect(16, 47, 3, 3, 'BLU2')
        c.rect(9, 50, 6, 2, 'GREY2')
        c.rect(15, 50, 6, 2, 'GREY2')
        c.hline(9, 14, 50, 'GREY3')
        c.hline(15, 20, 50, 'GREY3')
        for dx in (-1, 1):                                   # 摇头动势线（短横）
            bx = LCX + dx * 9
            c.hline(bx - dx, bx + dx * 2, 7, 'GREY6')
            c.hline(bx, bx + dx * 2, 10, 'GREY6')
    c.outline()
    return c


# ----------------------------------------------------- vendor_zhang 28×52
VZ_W, VZ_H, VZ_N = 28, 52, 3
ZCX = 14


def zhang_head(c: Canvas, ytop: int, expr: str, glass_dx=0) -> None:
    draw_head(c, ZCX, ytop, 14, 18, hair='GREY1', hair_hl='GREY3',
              style='neat', hair_h=5, skin=('SKN3', 'SKN4', 'SKN2', 'SKN1'))
    cx = ZCX
    ey = ytop + 10
    # 厚圆眼镜：镜框 GREY2，镜片 GREY7，两道 WHITE 反光
    for side in (-1, 1):
        gx = cx + (-6 if side < 0 else 1) + glass_dx
        c.rect(gx, ey - 1, 5, 5, 'GREY7')
        c.frame(gx, ey - 1, 5, 5, 'GREY2')
        c.set(gx + 1, ey, 'WHITE')
        c.set(gx + 2, ey, 'WHITE')
        c.set(gx + 1, ey + 2, 'WHITE')
        if expr != 'push':
            c.rect(gx + 2, ey + 1, 2, 2, 'GREY3')            # 眼睛在镜片后
    c.hline(cx - 1, cx, ey + 1, 'GREY2')                      # 鼻梁
    c.set(cx - 7 + glass_dx, ey, 'GREY2')
    c.set(cx + 6 + glass_dx, ey, 'GREY2')
    if expr == 'idle':
        draw_mouth(c, cx, ytop + 15, kind='line', col='RED2')
    elif expr == 'push':
        draw_mouth(c, cx, ytop + 15, kind='small', col='RED2')
    elif expr == 'shrug':
        draw_mouth(c, cx, ytop + 15, kind='small', col='RED2')
        c.set(cx - 2, ytop + 14, 'SKN2')                      # 苦笑纹
        c.set(cx + 2, ytop + 14, 'SKN2')
    c.set(cx, ytop + 13, 'SKN2')


def zhang_body(c: Canvas, dy: int) -> None:
    """白衬衫（扎进裤子）+ 胸前两支笔 + 深色西裤。"""
    c.rect(12, 20 + dy, 4, 1, 'SKN2')
    panel(c, 9, 21 + dy, 10, 17, 'GREY8', 'WHITE', 'GREY7')
    c.hline(12, 15, 21 + dy, 'SKN2')
    c.set(11, 21 + dy, 'WHITE')
    c.set(16, 21 + dy, 'GREY7')
    c.vline(13, 23 + dy, 36 + dy, 'GREY7')                   # 门襟
    for i in range(24, 36, 4):                               # 扣子
        c.set(13, i + dy, 'GREY5')
    c.rect(15, 25 + dy, 3, 4, 'GREY7')                       # 口袋
    c.vline(16, 23 + dy, 25 + dy, 'BLU3')                    # 两支笔
    c.vline(17, 23 + dy, 25 + dy, 'RED3')
    c.hline(9, 18, 37 + dy, 'GREY5')                         # 皮带
    c.set(13, 37 + dy, 'YEL3')
    panel(c, 9, 38 + dy, 10, 8, 'GREY3', 'GREY4', 'GREY2')
    c.vline(13, 41 + dy, 45 + dy, 'GREY2')


def zhang_frame(i: int) -> Canvas:
    c = Canvas(VZ_W, VZ_H)
    if i == 0:
        zhang_head(c, 1, 'idle')
        zhang_body(c, 0)
        stroke(c, [(7, 23), (7, 33)], 'GREY8', 2)
        stroke(c, [(19, 23), (19, 33)], 'GREY8', 2)
        c.rect(7, 34, 2, 2, 'SKN2')
        c.rect(19, 34, 2, 2, 'SKN2')
        c.rect(10, 46, 3, 3, 'GREY3')
        c.rect(15, 46, 3, 3, 'GREY3')
        c.rect(8, 49, 6, 2, 'GREY2')
        c.rect(14, 49, 6, 2, 'GREY2')
        c.hline(8, 13, 49, 'GREY3')
        c.hline(14, 19, 49, 'GREY3')
    elif i == 1:                                             # 推眼镜
        zhang_head(c, 1, 'push', glass_dx=0)
        zhang_body(c, 0)
        stroke(c, [(7, 23), (7, 33)], 'GREY8', 2)
        c.rect(7, 34, 2, 2, 'SKN2')
        stroke(c, [(19, 24), (18, 18)], 'GREY8', 2)          # 手抬到脸侧
        c.rect(17, 15, 3, 3, 'SKN2')
        c.set(16, 16, 'SKN3')
        c.rect(10, 46, 3, 3, 'GREY3')
        c.rect(15, 46, 3, 3, 'GREY3')
        c.rect(8, 49, 6, 2, 'GREY2')
        c.rect(14, 49, 6, 2, 'GREY2')
        c.hline(8, 13, 49, 'GREY3')
        c.hline(14, 19, 49, 'GREY3')
    else:                                                    # 摊手
        zhang_head(c, 2, 'shrug')
        zhang_body(c, 1)
        stroke(c, [(8, 25), (3, 29)], 'GREY8', 2)
        stroke(c, [(19, 25), (24, 29)], 'GREY8', 2)
        for hx in (1, 23):                                   # 手心朝上
            c.rect(hx, 29, 4, 2, 'SKN3')
            c.hline(hx, hx + 3, 30, 'SKN2')
            c.set(hx if hx == 1 else hx + 3, 28, 'SKN3')
        c.rect(10, 47, 3, 3, 'GREY3')
        c.rect(15, 47, 3, 3, 'GREY3')
        c.rect(8, 50, 6, 2, 'GREY2')
        c.rect(14, 50, 6, 2, 'GREY2')
        c.hline(8, 13, 50, 'GREY3')
        c.hline(14, 19, 50, 'GREY3')
    c.outline()
    return c


# ---------------------------------------------------------------- B3 钱
def money_note() -> Canvas:
    """90 年代一元纸币（26×15）：GRN3 底 + 中央人像色块 + 四角数字纹。"""
    c = Canvas(26, 15)
    panel(c, 0, 0, 26, 15, 'GRN3', 'GRN4', 'GRN2')
    c.frame(1, 1, 24, 13, 'GRN2')
    c.dither(2, 2, 22, 11, 'GRN4', None, mode='sparse')      # 底纹
    # 中央人像（抽象）
    c.rect(9, 3, 8, 10, 'GRN2')
    c.rect(11, 4, 4, 4, 'SKN2')                              # 脸
    c.hline(11, 14, 4, 'GREY2')                              # 头发
    c.set(11, 6, 'GREY2')
    c.set(14, 6, 'GREY2')
    c.rect(10, 8, 6, 4, 'GRN1')                              # 肩
    c.hline(10, 15, 8, 'GRN3')
    # 四角数字纹 + 中间面额
    for (x, y) in ((2, 2), (21, 2), (2, 11), (21, 11)):
        c.rect(x, y, 3, 2, 'YEL3')
        c.set(x + 1, y, 'GRN1')
    c.vline(5, 5, 9, 'GREY8')                                # 抽象「壹」
    c.hline(4, 6, 5, 'GREY8')
    c.hline(4, 6, 9, 'GREY8')
    c.vline(20, 5, 9, 'GREY8')
    c.hline(19, 21, 7, 'GREY8')
    c.dither(2, 13, 22, 1, 'GRN2', None, mode='checker')     # 旧化磨边
    c.set(25, 0, None)
    return c


def coin_frames() -> list[Canvas]:
    """硬币旋转 4 帧（12×12）：正面圆 → 椭圆 → 细线 → 椭圆。"""
    out = []
    for i in range(4):
        c = Canvas(12, 12)
        if i == 0:
            c.disc(5.5, 5.5, 5, 'YEL3')
            c.ring(5.5, 5.5, 5, 'YEL2')
            for y in range(1, 11):                            # 左上受光
                for x in range(1, 11):
                    if c.get(x, y) == (224, 180, 34) and x + y < 9:
                        c.set(x, y, 'YEL4')
            c.rect(4, 4, 4, 4, 'YEL2')                        # 中央方孔
            c.rect(5, 5, 2, 2, 'WOOD6')
            c.set(2, 3, 'WHITE')
        elif i in (1, 3):
            w = 7 if i == 1 else 5
            x0 = 6 - (w + 1) // 2
            for y in range(1, 11):
                dy = abs(y - 5.5) / 5.0
                ww = max(1, int(round(w * (1 - dy * dy * 0.55))))
                xx = x0 + (w - ww) // 2
                c.hline(xx, xx + ww - 1, y, 'YEL3')
            c.vline(x0, 3, 8, 'YEL4')
            c.vline(x0 + w - 1, 3, 8, 'YEL2')
            c.rect(x0 + w // 2 - 1, 5, 2, 2, 'YEL2')
        else:
            c.vline(5, 1, 10, 'YEL4')
            c.vline(6, 1, 10, 'YEL2')
            c.set(5, 0, 'YEL3')
            c.set(6, 11, 'YEL3')
        c.outline()
        out.append(c)
    return out


# ---------------------------------------------------------------- main
def main() -> None:
    print('gen_char.py ->', OUT)
    save(sheet([kid_frame(i) for i in range(KID_N)], KID_W, KID_H),
         os.path.join(OUT, 'kid.png'), KID_W, KID_H, KID_N)
    save(sheet([mom_frame(i) for i in range(MOM_N)], MOM_W, MOM_H),
         os.path.join(OUT, 'mom.png'), MOM_W, MOM_H, MOM_N)
    save(sheet([friend_frame(i) for i in range(FR_N)], FR_W, FR_H),
         os.path.join(OUT, 'friend.png'), FR_W, FR_H, FR_N)
    save(sheet([lao_frame(i) for i in range(VL_N)], VL_W, VL_H),
         os.path.join(OUT, 'vendor_lao.png'), VL_W, VL_H, VL_N)
    save(sheet([zhang_frame(i) for i in range(VZ_N)], VZ_W, VZ_H),
         os.path.join(OUT, 'vendor_zhang.png'), VZ_W, VZ_H, VZ_N)
    save(sheet([money_note()], 26, 15),
         os.path.join(OUT, 'money_note.png'), 26, 15, 1)
    save(sheet(coin_frames(), 12, 12),
         os.path.join(OUT, 'coin.png'), 12, 12, 4)
    report()


if __name__ == '__main__':
    main()

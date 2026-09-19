#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""gen_pay_anim.py —— 收钱特写：三个付款方 + 收钱的那只手

产出（都是 200×140 的定格取景，无镜头移动、无字幕；字幕由场景贴在框下）：
  pay/pay_mom.png     5 帧  妈（厨房门口）
  pay/pay_laohan.png  5 帧  收废品的老汉（院门外，三轮车边上）   ← 新角色
  pay/pay_shop.png    5 帧  小卖部老板（柜台后面）               ← 新角色
  pay/pay_hand.png    3 帧  你自己伸出去的那只手（80×56）

节拍（毫秒表与 src/anim/payAnim.js 的 MS 必须一致）：
  greet 站着说话 700 → reach 低头掏兜 520 → out 摸出钱 460
  → give 递过来 620 → let 松手 560                    合计 ≈2.86s

帧语义（三个人共用，所以时间表只有一份）：
  0 站定，头正，嘴张着说话        1 低头，手伸进兜里/摸到柜台底下
  2 手出来了，钱捏在手里          3 手臂前伸，钱递到画面右下
  4 松手，钱已经不在他手里

纪律：
  * 三个人的取景一致：人在左边（cx≈70），右下角 100..180 / 78..134 那一块
    永远空着 —— 那是场景把「收钱的手」贴上去的位置，谁都不许压进去。
  * 钱只用两种画法：硬币 3×3 的 YEL3 点，毛票 9×6 的 WOOD7 小方块，
    绝不画出面额数字（12px 的屏上画不出，画了就是脏点）。
  * 光源统一左上：受光面 1px 高光，右/下压暗 1px；描边走同色系最暗色。
  * 背景各不相同，这一屏的全部意义就在「谁给的钱」上：
    妈是绿墙裙的厨房门口，老汉是土墙外的三轮车，老板是货架前的木柜台。
  * 每一帧的人体尺寸形状完全一致（同一个 bust 函数，只改手臂和头部偏移），
    不许出现「换帧时人胖了一圈」。

可重复运行：python3 tools/gen_pay_anim.py
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pixlib import Canvas, save, sheet, report  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'img', 'pay')

FW, FH = 200, 140
HW, HH = 80, 56

# 右下角这块留给「收钱的手」，任何付款方都不许画进去（和 payAnim.js 的 HAND 对齐）
KEEP = (100, 78, 80, 56)

# 手臂末端（钱的位置）在各帧的落点。give 那一帧刚好停在手掌上方。
HANDOFF = {
    0: None,
    1: None,
    2: (94, 60),
    3: (124, 84),   # 正压在小孩掌心上方
    4: None,
}


# ---------------------------------------------------------------- 小零件
def coin(c: Canvas, x: int, y: int) -> None:
    """一枚硬币：7×7 的圆块，左上高光、右下压暗、外圈一道深边。"""
    c.disc(x + 3, y + 3, 3.4, 'YEL3')
    c.ring(x + 3, y + 3, 3.4, 'YEL2')
    c.set(x + 2, y + 1, 'YEL4')
    c.set(x + 1, y + 2, 'YEL4')
    c.set(x + 2, y + 2, 'YEL4')
    c.set(x + 4, y + 5, 'YEL1')
    c.set(x + 5, y + 4, 'YEL1')


def note(c: Canvas, x: int, y: int, n: int = 2) -> None:
    """一小叠毛票：14×9，错开 2px 叠 n 张，中间一道折痕。
    不画面额数字 —— 这个尺寸上任何字都只是两个脏点。"""
    for i in range(n - 1, -1, -1):
        c.rect(x + i * 2, y - i * 2, 14, 9, 'WOOD7')
        c.frame(x + i * 2, y - i * 2, 14, 9, 'WOOD4')
        c.hline(x + i * 2 + 2, x + i * 2 + 11, y - i * 2 + 4, 'WOOD6')
        c.hline(x + i * 2 + 2, x + i * 2 + 11, y - i * 2 + 7, 'WOOD5')


def dirt_floor(c: Canvas, y0: int, base: str, dark: str, lite: str) -> None:
    """地面：一条压暗的横带 + 稀疏颗粒，别画成纯色块。"""
    c.rect(0, y0, FW, FH - y0, base)
    c.hline(0, FW - 1, y0, lite)
    c.dither(0, y0 + 2, FW, FH - y0 - 2, dark, mode='sparse')
    c.dither(0, FH - 6, FW, 6, dark, mode='quarter')


# ---------------------------------------------------------------- 通用半身
def head(c: Canvas, cx: int, top: int, skin: str, sh: str, ink: str,
         tilt: int = 0, mouth: str = 'closed', eyes: str = 'open') -> None:
    """大头 Q 版颅型（36 宽 × 40 高），tilt 为整体左右偏移。
    顶 3 行收、下颌 6 行收，中间满宽 —— 和 gen_char.py 的 head_widths 一个路子。"""
    W = 36
    x0 = cx - W // 2 + tilt
    widths = [W - 8, W - 4, W - 1] + [W] * 25 + [W - 1, W - 2, W - 4, W - 7, W - 11, W - 16, W - 22]
    for i, w in enumerate(widths):
        xx = x0 + (W - w) // 2
        c.hline(xx, xx + w - 1, top + i, skin)
    # 左上受光、右下压暗
    for yy in range(top + 3, top + 30):
        c.set(x0 + W - 2, yy, sh)
        if yy > top + 20:
            c.set(x0 + W - 3, yy, sh)
    # 耳朵
    c.rect(x0 - 1, top + 15, 3, 7, skin)
    c.rect(x0 + W - 2, top + 15, 3, 7, sh)
    # 眼睛
    ey = top + 17
    if eyes == 'open':
        for ex in (x0 + 9, x0 + 23):
            c.rect(ex, ey, 4, 4, ink)
            c.set(ex + 1, ey + 1, 'WHITE')
            c.set(ex + 2, ey + 2, 'WHITE')
    else:                                        # 半闭：一条横线 + 下眼睑
        c.hline(x0 + 8, x0 + 12, ey + 2, ink)
        c.hline(x0 + 22, x0 + 26, ey + 2, ink)
        c.set(x0 + 8, ey + 1, ink)
        c.set(x0 + 26, ey + 1, ink)
    # 鼻子
    c.vline(x0 + 17, top + 22, top + 25, sh)
    c.set(x0 + 18, top + 25, sh)
    # 嘴
    my = top + 29
    if mouth == 'open':
        c.rect(x0 + 13, my, 8, 5, 'RED1')
        c.hline(x0 + 13, x0 + 20, my, ink)
        c.hline(x0 + 14, x0 + 19, my + 1, 'RED2')
    elif mouth == 'smile':
        c.hline(x0 + 13, x0 + 21, my + 1, ink)
        c.set(x0 + 12, my, ink)
        c.set(x0 + 22, my, ink)
    else:
        c.hline(x0 + 14, x0 + 20, my + 1, ink)


def neck(c: Canvas, cx: int, y0: int, h: int, skin: str, sh: str) -> None:
    """脖子。宽度必须明显窄于下颌，否则看着像下巴下面垫了一张卡片。"""
    c.rect(cx - 5, y0, 11, h, skin)
    c.vline(cx + 4, y0, y0 + h - 1, sh)
    c.vline(cx + 5, y0, y0 + h - 1, sh)
    c.hline(cx - 5, cx + 5, y0, sh)          # 下颌投在脖子上的影
    c.hline(cx - 4, cx + 4, y0 + 1, sh)


def torso(c: Canvas, cx: int, top: int, cloth: str, lite: str, dark: str,
          w_top: int = 46, w_bot: int = 60) -> None:
    """肩到画面底的躯干。斜肩 6 行，之后缓慢加宽 —— 别做成一个从上到下
    一样宽的桶，那是这一屏第一稿最难看的地方。"""
    n = FH - top
    for i in range(n):
        if i < 6:
            ww = w_top - (6 - i) * 4
        else:
            ww = w_top + int(round((w_bot - w_top) * (i - 6) / max(1, n - 7)))
        x0 = cx - ww // 2
        c.hline(x0, x0 + ww - 1, top + i, cloth)
        # 两侧边缘：左受光、右压暗
        c.set(x0, top + i, lite if i > 5 else cloth)
        c.set(x0 + ww - 1, top + i, dark)
        c.set(x0 + ww - 2, top + i, dark)


def arm(c: Canvas, sx: int, sy: int, ex: int, ey: int, sleeve: str,
        skin: str, sh: str, lite: str = 'SKN4', bare: float = 0.45,
        thick: int = 9) -> None:
    """一条胳膊：肩 → 肘 → 手。肘在中点外侧一点，所以胳膊是弯的不是棍。
    bare 是「从哪一段开始露小臂」（夏天都是短袖），0 表示整条都是袖子。
    返回值无；手画成一个 9×9 的块，掌心朝下。"""
    mx = (sx + ex) // 2 + (6 if ex > sx else -6)
    my = (sy + ey) // 2 + 5

    def seg(x0, y0, x1, y1, col, t, top_lite, bot_dark):
        """把一段画粗。偏移轴必须垂直于走向 —— 近竖直的段按 y 偏移
        等于原地叠了 t 次，胳膊就成了一根 1px 的线（第一稿的样子）。"""
        vert = abs(y1 - y0) >= abs(x1 - x0)
        for k in range(-(t // 2), t // 2 + 1):
            if vert:
                c.line(x0 + k, y0, x1 + k, y1, col)
            else:
                c.line(x0, y0 + k, x1, y1 + k, col)
        if vert:
            c.line(x0 - t // 2, y0, x1 - t // 2, y1, top_lite)
            c.line(x0 + t // 2, y0, x1 + t // 2, y1, bot_dark)
        else:
            c.line(x0, y0 - t // 2, x1, y1 - t // 2, top_lite)
            c.line(x0, y0 + t // 2, x1, y1 + t // 2, bot_dark)

    # 上臂（袖子）
    seg(sx, sy, mx, my, sleeve, thick, sleeve, sh)
    # 袖口
    c.line(mx - 1, my - thick // 2, mx - 1, my + thick // 2, sh)
    # 小臂（夏天都是光胳膊）
    seg(mx, my, ex, ey, skin, thick - 3, lite, sh)
    # 手：一个 11×11 的圆角块 + 一根拇指，别画成方手套
    c.rect(ex - 5, ey - 4, 11, 9, skin)
    c.rect(ex - 4, ey - 5, 9, 11, skin)
    c.hline(ex - 4, ex + 4, ey - 5, lite)
    c.hline(ex - 4, ex + 4, ey + 5, sh)
    c.vline(ex + 5, ey - 3, ey + 3, sh)
    c.vline(ex - 5, ey - 3, ey + 3, lite)
    c.rect(ex - 8, ey - 2, 4, 5, skin)               # 拇指
    c.set(ex - 8, ey - 2, lite)
    c.set(ex - 5, ey + 2, sh)
    # 指缝：两道就够，多了在 12px 的屏上是脏点
    c.vline(ex - 1, ey + 1, ey + 4, sh)
    c.vline(ex + 2, ey + 1, ey + 4, sh)


# ================================================================ 妈
def bg_mom(c: Canvas) -> None:
    # 上半白灰墙，下半绿墙裙 —— 2004 年北方农村屋里的标配
    c.rect(0, 0, FW, 92, 'GREY7')
    c.dither(0, 0, FW, 92, 'GREY6', mode='faint')
    c.rect(0, 92, FW, FH - 92, 'GRN2')
    c.hline(0, FW - 1, 92, 'GRN3')
    c.hline(0, FW - 1, 93, 'GRN1')
    c.dither(0, 95, FW, FH - 95, 'GRN1', mode='sparse')
    # 右边门框：厨房门口
    c.rect(150, 0, 8, FH, 'WOOD3')
    c.vline(150, 0, FH - 1, 'WOOD5')
    c.vline(157, 0, FH - 1, 'WOOD1')
    c.rect(158, 0, FW - 158, FH, 'GREY2')          # 门里是暗的
    c.dither(158, 0, FW - 158, FH, 'GREY1', mode='quarter')
    # 灶台一角（左下）与挂着的毛巾
    c.rect(0, 100, 26, FH - 100, 'GREY5')
    c.hline(0, 25, 100, 'GREY6')
    c.dither(0, 102, 26, FH - 102, 'GREY4', mode='sparse')
    c.rect(132, 20, 12, 30, 'RED3')                # 毛巾
    c.hline(132, 143, 20, 'RED4')
    c.dither(132, 24, 12, 26, 'RED2', mode='hstripe')
    c.rect(131, 18, 14, 3, 'WOOD4')                # 挂钩那根木条


def mom_frame(i: int) -> Canvas:
    c = Canvas(FW, FH)
    bg_mom(c)
    cx = 64
    tilt = {0: 0, 1: -2, 2: -1, 3: 1, 4: 0}[i]
    down = {0: 0, 1: 4, 2: 2, 3: 1, 4: 0}[i]        # 低头的幅度

    # 躯干：碎花短袖衬衫，外面系着围裙
    torso(c, cx, 54, 'BLU3', 'BLU4', 'BLU2', w_top=46, w_bot=62)
    c.dither(cx - 18, 60, 36, 18, 'BLU4', mode='faint')      # 碎花只留胸口一小片
    c.vline(cx, 56, FH - 1, 'BLU2')                          # 门襟
    # 围裙：只到腰以下，比衣服明显窄一圈，别做成一条红裙子
    for yy in range(86, FH):
        ww = 36 + (yy - 86) // 6
        c.hline(cx - ww // 2, cx + ww // 2, yy, 'RED2')
        c.set(cx - ww // 2, yy, 'RED3')
        c.set(cx + ww // 2, yy, 'RED1')
        c.set(cx + ww // 2 - 1, yy, 'RED1')
    c.dither(cx - 14, 92, 28, 26, 'RED3', mode='sparse')
    # 腰上那道系带（两头往后收），和一个缝在前面的口袋
    c.hline(cx - 20, cx + 20, 86, 'RED4')
    c.hline(cx - 20, cx + 20, 85, 'RED1')
    c.hline(cx - 26, cx - 20, 87, 'RED2')
    c.hline(cx + 20, cx + 26, 87, 'RED2')
    c.frame(cx - 12, 104, 24, 15, 'RED1')
    c.hline(cx - 11, cx + 10, 105, 'RED4')

    neck(c, cx, 47 + down, 9, 'SKN3', 'SKN2')
    head(c, cx, 8 + down, 'SKN3', 'SKN2', 'WOOD1',
         tilt=tilt,
         mouth='open' if i == 0 else ('smile' if i == 4 else 'closed'),
         eyes='half' if i == 1 else 'open')
    # 齐耳短发：头顶一片 + 两侧垂到耳下，露出额头一条
    hx = cx - 20 + tilt
    c.rect(hx + 2, 4 + down, 36, 13, 'GREY2')
    c.dither(hx + 4, 5 + down, 14, 6, 'GREY3', mode='sparse')
    c.hline(hx + 3, hx + 37, 3 + down, 'GREY1')
    c.rect(hx, 12 + down, 6, 26, 'GREY2')
    c.rect(hx + 34, 12 + down, 6, 26, 'GREY2')
    c.vline(hx, 14 + down, 36 + down, 'GREY3')
    c.vline(hx + 39, 14 + down, 36 + down, 'GREY1')

    # 左臂（画面左侧）：一直垂在身侧
    arm(c, cx - 22, 62, cx - 34, 104, 'BLU3', 'SKN3', 'SKN2')
    # 右臂：按帧走位
    if i == 0:
        arm(c, cx + 22, 62, cx + 30, 108, 'BLU3', 'SKN3', 'SKN2')
    elif i == 1:
        arm(c, cx + 22, 62, cx + 21, 110, 'BLU3', 'SKN3', 'SKN2')   # 手插进围裙兜里
        c.rect(cx + 11, 104, 22, 16, 'RED2')                         # 兜口盖住手
        c.frame(cx + 11, 104, 22, 16, 'RED1')
        c.hline(cx + 12, cx + 31, 105, 'RED4')
    elif i == 2:
        arm(c, cx + 22, 60, 94, 60, 'BLU3', 'SKN3', 'SKN2')
        coin(c, 90, 54); coin(c, 96, 56)
    elif i == 3:
        arm(c, cx + 22, 58, 124, 84, 'BLU3', 'SKN3', 'SKN2')
        coin(c, 122, 76); coin(c, 129, 79)
    else:
        arm(c, cx + 22, 60, cx + 31, 96, 'BLU3', 'SKN3', 'SKN2')
    c.outline()
    return c


# ================================================================ 收废品的老汉
def bg_laohan(c: Canvas) -> None:
    # 顶上一条天，底下土墙 + 土地
    c.rect(0, 0, FW, 26, 'BLU4')
    c.dither(0, 0, FW, 26, 'BLU5', mode='faint')
    c.rect(0, 26, FW, 76, 'WOOD4')                 # 土坯墙
    c.hline(0, FW - 1, 26, 'WOOD6')
    c.dither(0, 30, FW, 70, 'WOOD3', mode='sparse')
    c.dither(0, 76, FW, 26, 'WOOD3', mode='quarter')
    dirt_floor(c, 102, 'WOOD3', 'WOOD2', 'WOOD5')
    # 左边一棵白杨树干
    c.rect(4, 0, 13, 108, 'GREY6')
    c.vline(4, 0, 107, 'GREY7')
    c.vline(16, 0, 107, 'GREY4')
    for yy in range(6, 104, 11):
        c.hline(6, 14, yy, 'GREY4')
        c.set(7, yy + 1, 'GREY3')
    # 右边三轮车：车板 + 车轮一角 + 麻袋
    c.rect(150, 62, FW - 150, 10, 'GREY4')         # 车板
    c.hline(150, FW - 1, 62, 'GREY6')
    c.hline(150, FW - 1, 71, 'GREY2')
    c.rect(152, 72, 6, 34, 'GREY3')                # 立柱
    c.ring(178, 104, 16, 'GREY2')                  # 车轮
    c.ring(178, 104, 15, 'GREY3')
    c.disc(178, 104, 4, 'GREY4')
    c.rect(160, 34, 34, 28, 'WOOD5')               # 麻袋
    c.dither(160, 34, 34, 28, 'WOOD4', mode='quarter')
    c.hline(160, 193, 34, 'WOOD6')
    c.rect(168, 30, 16, 5, 'WOOD3')                # 袋口扎的绳
    # 靠在车边那杆秤：秤杆 + 秤砣 + 挂钩，细一根线看着像划痕
    c.line(124, 104, 152, 92, 'WOOD2')
    c.line(124, 105, 152, 93, 'WOOD3')
    c.rect(150, 88, 6, 6, 'GREY3')                 # 秤砣
    c.set(152, 87, 'GREY5')
    c.line(130, 102, 130, 110, 'GREY4')            # 挂钩
    c.set(129, 110, 'GREY4')


def laohan_frame(i: int) -> Canvas:
    c = Canvas(FW, FH)
    bg_laohan(c)
    cx = 66
    tilt = {0: 0, 1: -3, 2: -1, 3: 2, 4: 1}[i]
    down = {0: 2, 1: 7, 2: 4, 3: 2, 4: 1}[i]       # 老汉本来就有点驼

    # 躯干：褪色的军绿褂子敞着，里头是白背心
    torso(c, cx, 58, 'GRN2', 'GRN3', 'GRN1', w_top=48, w_bot=62)
    for yy in range(58, FH):                       # 敞开的门襟：只露出中间一条白背心
        w = 9 + (yy - 58) // 11
        c.hline(cx - w, cx + w, yy, 'GREY7')
    c.dither(cx - 10, 64, 20, 44, 'GREY6', mode='faint')
    for yy in range(58, FH):
        w = 9 + (yy - 58) // 11
        c.set(cx - w, yy, 'GRN1')
        c.set(cx - w - 1, yy, 'GRN1')
        c.set(cx + w, yy, 'GRN1')
        c.set(cx + w + 1, yy, 'GRN1')
    c.hline(cx - 9, cx + 9, 58, 'GREY4')           # 背心领口

    neck(c, cx, 51 + down, 9, 'SKN2', 'WOOD3')
    head(c, cx, 12 + down, 'SKN2', 'WOOD3', 'WOOD1',
         tilt=tilt,
         mouth='open' if i == 0 else ('smile' if i == 4 else 'closed'),
         eyes='half' if i in (1, 2) else 'open')
    # 花白头发：只剩顶上一层和两边鬓角
    hx = cx - 20 + tilt
    c.rect(hx + 3, 8 + down, 34, 10, 'GREY6')
    c.dither(hx + 4, 9 + down, 32, 9, 'GREY7', mode='sparse')
    c.hline(hx + 3, hx + 36, 7 + down, 'GREY4')
    c.rect(hx + 1, 16 + down, 4, 12, 'GREY6')
    c.rect(hx + 35, 16 + down, 4, 12, 'GREY5')
    # 抬头纹和法令纹：这张脸上最要紧的两处
    c.hline(hx + 11, hx + 27, 20 + down, 'WOOD3')
    c.line(hx + 12, 35 + down, hx + 10, 39 + down, 'WOOD3')
    c.line(hx + 27, 35 + down, hx + 29, 39 + down, 'WOOD3')

    # 左手一直搭在膝盖那边
    arm(c, cx - 24, 66, cx - 38, 106, 'GRN2', 'SKN2', 'WOOD3', lite='SKN3')
    # 右臂：钱在腰上那个卷成一团的塑料袋里
    if i in (0, 1):
        ex = cx + 30 if i == 0 else cx + 26
        ey = 104 if i == 0 else 114
        arm(c, cx + 24, 66, ex, ey, 'GRN2', 'SKN2', 'WOOD3', lite='SKN3')
        c.rect(cx + 20, 108, 26, 20, 'GREY6')                # 塑料袋
        c.dither(cx + 21, 109, 24, 18, 'GREY7', mode='sparse')
        c.hline(cx + 20, cx + 45, 108, 'GREY7')
        c.rect(cx + 28, 104, 10, 5, 'GREY4')                 # 袋口
    elif i == 2:
        arm(c, cx + 24, 64, 94, 60, 'GRN2', 'SKN2', 'WOOD3', lite='SKN3')
        note(c, 88, 54, 3)
    elif i == 3:
        arm(c, cx + 24, 60, 124, 84, 'GRN2', 'SKN2', 'WOOD3', lite='SKN3')
        note(c, 119, 74, 3)
    else:
        arm(c, cx + 24, 64, cx + 29, 98, 'GRN2', 'SKN2', 'WOOD3', lite='SKN3')
    c.outline()
    return c


# ================================================================ 小卖部老板
def bg_shop(c: Canvas) -> None:
    # 后墙 + 货架三层：烟盒、汽水、玻璃罐
    c.rect(0, 0, FW, 96, 'WOOD3')
    c.dither(0, 0, FW, 96, 'WOOD2', mode='faint')
    for sy in (16, 46, 76):
        c.rect(0, sy, FW, 4, 'WOOD5')
        c.hline(0, FW - 1, sy, 'WOOD6')
        c.hline(0, FW - 1, sy + 3, 'WOOD1')
    # 第一层：烟盒一排
    for k in range(9):
        x = 4 + k * 21
        col = ['RED3', 'GRN3', 'BLU3', 'YEL2'][k % 4]
        c.rect(x, 4, 13, 12, col)
        c.hline(x, x + 12, 4, 'GREY7')
        c.set(x + 12, 15, 'INK')
    # 第二层：汽水瓶（只画瓶身和瓶颈，别画标签字）
    for k in range(10):
        x = 6 + k * 19
        c.rect(x, 30, 8, 16, 'GRN3')
        c.rect(x + 2, 24, 4, 7, 'GRN2')
        c.set(x + 2, 26, 'GRN5')
        c.vline(x, 30, 45, 'GRN4')
    # 第三层：玻璃罐（水果糖）
    for k in range(4):
        x = 10 + k * 46
        c.rect(x + 1, 57, 26, 18, 'GREY6')          # 罐身（上下收 1px 当圆角）
        c.rect(x, 59, 28, 14, 'GREY6')
        c.dither(x + 3, 60, 22, 13, 'YEL3', mode='three')   # 里头的水果糖
        c.vline(x + 2, 60, 72, 'GREY7')                     # 玻璃上那道反光
        c.rect(x + 7, 52, 14, 5, 'GREY4')                   # 铁盖
        c.hline(x + 7, x + 20, 52, 'GREY6')
        c.rect(x + 11, 49, 6, 3, 'GREY3')                   # 盖上的提手
    # 柜台：木面压在最前面
    c.rect(0, 96, FW, FH - 96, 'WOOD4')
    c.hline(0, FW - 1, 96, 'WOOD6')
    c.hline(0, FW - 1, 97, 'WOOD7')
    c.hline(0, FW - 1, 99, 'WOOD2')
    c.dither(0, 100, FW, FH - 100, 'WOOD3', mode='hstripe')
    for gx in range(0, FW, 34):                     # 木纹
        c.vline(gx, 100, FH - 1, 'WOOD3')
    # 柜台上那台老式计价秤的一角
    c.rect(4, 82, 22, 14, 'GREY5')
    c.rect(7, 84, 16, 8, 'GREY7')
    c.line(9, 90, 21, 86, 'RED3')


def shop_frame(i: int) -> Canvas:
    c = Canvas(FW, FH)
    bg_shop(c)
    cx = 68
    tilt = {0: 0, 1: -2, 2: 0, 3: 2, 4: 1}[i]
    down = {0: 0, 1: 5, 2: 2, 3: 0, 4: 0}[i]

    # 躯干：白背心（夏天守柜台的标准样子）
    torso(c, cx, 52, 'GREY6', 'GREY7', 'GREY4', w_top=48, w_bot=64)
    c.dither(cx - 22, 58, 44, 46, 'GREY7', mode='faint')
    c.vline(cx - 15, 60, FH - 1, 'GREY5')           # 侧缝
    c.vline(cx + 15, 60, FH - 1, 'GREY5')
    # 背心的领口和两条肩带：不画就是一件没有形状的白衣服
    c.rect(cx - 24, 52, 9, 4, 'GREY4')
    c.rect(cx + 16, 52, 9, 4, 'GREY4')
    for k in range(11):                            # 背心领口露出的那一小块前胸
        c.hline(cx - 9 + k // 2, cx + 8 - k // 2, 52 + k, 'SKN3')
    c.hline(cx - 9, cx + 8, 52, 'SKN2')
    c.dither(cx - 6, 54, 12, 7, 'SKN2', mode='faint')

    neck(c, cx, 45 + down, 9, 'SKN3', 'SKN2')
    head(c, cx, 6 + down, 'SKN3', 'SKN2', 'WOOD1',
         tilt=tilt,
         mouth='open' if i in (0, 3) else ('smile' if i == 4 else 'closed'),
         eyes='half' if i == 1 else 'open')
    # 板寸 + 两道眉
    hx = cx - 20 + tilt
    c.rect(hx + 2, 2 + down, 36, 12, 'GREY2')
    c.dither(hx + 4, 3 + down, 14, 6, 'GREY3', mode='sparse')
    c.dither(hx + 2, 13 + down, 36, 3, 'GREY2', mode='checker')
    c.hline(hx + 3, hx + 37, 1 + down, 'GREY1')
    c.hline(hx + 9, hx + 15, 20 + down, 'GREY2')
    c.hline(hx + 25, hx + 31, 20 + down, 'GREY2')

    # 左手撑在柜台上
    arm(c, cx - 24, 60, cx - 42, 100, 'GREY6', 'SKN3', 'SKN2')
    # 右臂：钱在柜台底下那个铁盒里
    if i == 0:
        arm(c, cx + 24, 60, cx + 26, 102, 'GREY6', 'SKN3', 'SKN2')
    elif i == 1:
        arm(c, cx + 24, 62, cx + 28, 116, 'GREY6', 'SKN3', 'SKN2')
        c.rect(cx + 14, 110, 30, 18, 'WOOD4')      # 手伸到柜台面以下了
        c.hline(cx + 14, cx + 43, 110, 'WOOD6')
        c.dither(cx + 15, 112, 28, 15, 'WOOD3', mode='hstripe')
    elif i == 2:
        arm(c, cx + 24, 60, 94, 60, 'GREY6', 'SKN3', 'SKN2')
        note(c, 88, 54, 2); coin(c, 100, 58)
    elif i == 3:
        arm(c, cx + 24, 58, 124, 84, 'GREY6', 'SKN3', 'SKN2')
        note(c, 118, 74, 2); coin(c, 132, 78)
    else:
        arm(c, cx + 24, 60, cx + 27, 96, 'GREY6', 'SKN3', 'SKN2')
        # 松手那一帧顺手往柜台上放了一根冰棍（摆在收钱区上方，别被手挡住）
        c.rect(cx + 38, 44, 7, 20, 'GREY7')
        c.hline(cx + 38, cx + 44, 44, 'WHITE')
        c.vline(cx + 44, 45, 63, 'GREY5')
        c.rect(cx + 40, 63, 4, 12, 'WOOD6')
    c.outline()
    return c


# ================================================================ 收钱的那只手
def hand_frame(i: int) -> Canvas:
    """你自己的手，从画面右下伸进来，掌心朝上等着接钱。
    0 摊开等着 / 1 钱落在掌心（手指微微合起）/ 2 攥紧收回。

    curl 是手指蜷起的程度：0 是张开，1 是攥成拳。整只手只有手指和拇指
    随 curl 动，掌和小臂三帧完全一样 —— 换帧时手不许变形。"""
    c = Canvas(HW, HH)
    curl = [0.0, 0.34, 1.0][i]

    # 小臂：从右下角斜着进来
    for t in range(-7, 8):
        c.line(HW - 1, 50 + t, 50, 34 + t, 'SKN3')
    c.line(HW - 1, 43, 50, 27, 'SKN4')             # 上缘受光
    c.line(HW - 1, 57, 50, 41, 'SKN2')             # 下缘压暗
    c.line(52, 26, 52, 42, 'SKN2')                 # 腕纹

    # 手掌（圆角矩形 27×23）
    px, py, pw, ph = 20, 17, 27, 23
    c.rect(px, py + 2, pw, ph - 4, 'SKN3')
    c.rect(px + 2, py, pw - 4, ph, 'SKN3')
    for dx, dy in ((1, 1), (pw - 2, 1), (1, ph - 2), (pw - 2, ph - 2)):
        c.set(px + dx, py + dy, 'SKN3')
    # 掌心那个窝：压暗一档。钱就落在这儿，所以它必须看得出是凹的
    c.dither(px + 5, py + 10, 15, 7, 'SKN2', mode='faint')   # 掌纹，点密了就成华夫饼
    c.hline(px + 2, px + pw - 3, py + ph - 1, 'SKN2')
    c.vline(px + pw - 1, py + 3, py + ph - 3, 'SKN2')

    # 四根手指：从掌的上沿往左上伸；curl 越大越往右缩回掌心
    for k in range(4):
        rx = px + 3 + k * 6
        ry = py + 2
        ln = int(round([14, 16, 15, 12][k] * (1 - 0.70 * curl)))
        tipx = rx + (-5 + k * 2) + int(round(10 * curl))
        tipy = ry - ln
        for t in (-2, -1, 0, 1, 2):
            c.line(rx + t, ry, tipx + t, tipy, 'SKN3')
        c.line(rx - 2, ry, tipx - 2, tipy, 'SKN4')
        c.line(rx + 2, ry, tipx + 2, tipy, 'SKN2')
        c.hline(tipx - 2, tipx + 2, tipy, 'SKN4' if curl < 0.6 else 'SKN2')
        if curl > 0.6:                              # 攥起来：指节那一节压暗
            c.hline(tipx - 2, tipx + 2, tipy + 2, 'SKN2')

    # 拇指：从掌的右下往右上翘，攥紧时压回来
    tx0, ty0 = px + pw - 4, py + ph - 7
    tx1 = px + pw + 7 - int(round(7 * curl))
    ty1 = py + ph - 16 + int(round(8 * curl))
    for t in (-3, -2, -1, 0, 1, 2, 3):
        c.line(tx0, ty0 + t, tx1, ty1 + t, 'SKN3')
    c.line(tx0, ty0 - 3, tx1, ty1 - 3, 'SKN4')
    c.line(tx0, ty0 + 3, tx1, ty1 + 3, 'SKN2')

    # 掌纹：只有摊开那一帧看得见
    if i == 0:
        c.line(px + 4, py + 14, px + 17, py + 11, 'SKN2')
        c.line(px + 5, py + 18, px + 20, py + 17, 'SKN2')
    c.outline()
    return c


# ================================================================ 自查
def check_keep(frames: list[Canvas], name: str) -> None:
    """留给手的那一块里不能有人或钱 —— 只允许背景色。
    这里不判颜色（背景本来就会覆盖到），只确认人体没伸进去太深：
    把 KEEP 区域内「肤色」的像素数卡在一个上限内。"""
    kx, ky, kw, kh = KEEP
    from pixlib import PAL
    skin = {PAL['SKN1'], PAL['SKN2'], PAL['SKN3'], PAL['SKN4']}
    for i, f in enumerate(frames):
        n = 0
        for yy in range(ky, ky + kh):
            for xx in range(kx, kx + kw):
                if f.get(xx, yy) in skin:
                    n += 1
        # give 那一帧手臂本来就要伸进去一点，别的帧几乎不许
        cap = 520 if i == 3 else 110
        assert n <= cap, f'{name} 第 {i} 帧伸进收钱区的肤色像素 {n} > {cap}'


def main() -> None:
    print('gen_pay_anim.py ->', OUT)

    mom = [mom_frame(i) for i in range(5)]
    lao = [laohan_frame(i) for i in range(5)]
    shop = [shop_frame(i) for i in range(5)]
    check_keep(mom, 'pay_mom')
    check_keep(lao, 'pay_laohan')
    check_keep(shop, 'pay_shop')

    save(sheet(mom, FW, FH), os.path.join(OUT, 'pay_mom.png'), FW, FH, 5)
    save(sheet(lao, FW, FH), os.path.join(OUT, 'pay_laohan.png'), FW, FH, 5)
    save(sheet(shop, FW, FH), os.path.join(OUT, 'pay_shop.png'), FW, FH, 5)
    save(sheet([hand_frame(i) for i in range(3)], HW, HH),
         os.path.join(OUT, 'pay_hand.png'), HW, HH, 3)
    report()


if __name__ == '__main__':
    main()

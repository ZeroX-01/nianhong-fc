#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""preview_char.py —— B 组自查用 contact sheet（两张）

  tools/preview_char.png : 所有角色的所有帧横向排列（每角色一行 + 行序标注），
                           深灰底，NEAREST 放大 4 倍
  tools/preview_cart.png : 上半 12 张卡带小图（两行）；
                           下半「修卡近景合成效果」——cart_big_shell 分别染成
                           灰白/军绿/红三种壳色 + 叠对应 cart_label_xx，
                           下方拼 cart_fingers 三帧，另加一次 cart_scratch 第 3 帧叠加，
                           放大 3 倍
可重复运行：python3 tools/preview_char.py
"""
from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixlib import PAL  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHAR = os.path.join(ROOT, 'assets', 'img', 'char')
CART = os.path.join(ROOT, 'assets', 'img', 'cart')
TOOLS = os.path.join(ROOT, 'tools')

BG = (44, 44, 54)
GRID = (62, 62, 76)

CHAR_ROWS = [
    ('kid.png', 24, 44, 6),
    ('mom.png', 28, 54, 6),
    ('friend.png', 28, 48, 4),
    ('vendor_lao.png', 30, 52, 3),
    ('vendor_zhang.png', 28, 52, 3),
    ('money_note.png', 26, 15, 1),
    ('coin.png', 12, 12, 4),
]


def zoom(img: Image.Image, k: int) -> Image.Image:
    return img.resize((img.width * k, img.height * k), Image.NEAREST)


def tint(img: Image.Image, rgb) -> Image.Image:
    """模拟 Phaser setTint（正片叠底），验证灰阶白模染色后是否干净。"""
    out = img.convert('RGBA').copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a:
                px[x, y] = (r * rgb[0] // 255, g * rgb[1] // 255,
                            b * rgb[2] // 255, a)
    return out


# ---------------------------------------------------------------- 角色表
def build_char_sheet(k: int = 4) -> Image.Image:
    pad, label_w, gap = 8, 96, 6
    rows = []
    for (fn, fw, fh, n) in CHAR_ROWS:
        img = Image.open(os.path.join(CHAR, fn)).convert('RGBA')
        assert img.size == (fw * n, fh), (fn, img.size)
        rows.append((fn, fw, fh, n, img))
    w = label_w + max(n * (fw + gap) for (_, fw, _, n, _) in rows) * k + pad * 2
    h = pad * 2 + sum(r[2] * k + 22 for r in rows)
    sheet = Image.new('RGB', (w, h), BG)
    d = ImageDraw.Draw(sheet)
    y = pad
    for ri, (fn, fw, fh, n, img) in enumerate(rows, start=1):
        d.text((pad, y + 4), f'{ri}. {fn}', fill=(230, 230, 240))
        d.text((pad, y + 18), f'{fw}x{fh} x{n}', fill=(150, 150, 170))
        x = label_w
        for i in range(n):
            frame = img.crop((i * fw, 0, (i + 1) * fw, fh))
            box = (x, y, x + fw * k, y + fh * k)
            d.rectangle((box[0] - 1, box[1] - 1, box[2], box[3]), outline=GRID)
            sheet.paste(zoom(frame, k), (x, y), zoom(frame, k))
            d.text((x + 2, y + fh * k + 3), f'#{i + 1}', fill=(190, 190, 205))
            x += (fw + gap) * k
        y += fh * k + 22
    return sheet


# ---------------------------------------------------------------- 卡带表
def build_cart_sheet(k: int = 3) -> Image.Image:
    minis = [Image.open(os.path.join(CART, f'cart_{i:02d}.png')).convert('RGBA')
             for i in range(1, 13)]
    shell = Image.open(os.path.join(CART, 'cart_big_shell.png')).convert('RGBA')
    fingers = Image.open(os.path.join(CART, 'cart_fingers.png')).convert('RGBA')
    scratch = Image.open(os.path.join(CART, 'cart_scratch.png')).convert('RGBA')
    labels = {i: Image.open(os.path.join(CART, f'cart_label_{i:02d}.png')).convert('RGBA')
              for i in range(1, 13)}
    puff = Image.open(os.path.join(CART, 'breath_puff.png')).convert('RGBA')

    pad, gap = 10, 8
    mini_w = 6 * (40 + gap) * k
    comp_w = 3 * (168 + gap) * k
    w = max(mini_w, comp_w) + pad * 2 + 20
    h = pad + 24 + 2 * (28 * k + 24) + 24 + 116 * k + 26 + \
        24 + 26 * k + 24 + 116 * k + 40 * k + 60 + \
        24 + 3 * (62 * 2 + 20) + 24 + 116 * 3 + 40
    sheet = Image.new('RGB', (w, h), BG)
    d = ImageDraw.Draw(sheet)
    y = pad
    d.text((pad, y), 'A. 12 张卡带小图 cart_01..12 (40x28, x3)', fill=(235, 235, 245))
    y += 18
    for r in range(2):
        x = pad
        for cc in range(6):
            i = r * 6 + cc
            im = zoom(minis[i], k)
            d.rectangle((x - 1, y - 1, x + im.width, y + im.height), outline=GRID)
            sheet.paste(im, (x, y), im)
            d.text((x + 2, y + im.height + 3), f'cart_{i + 1:02d}',
                   fill=(190, 190, 205))
            x += (40 + gap) * k
        y += 28 * k + 22

    y += 12
    d.text((pad, y), 'B. 修卡近景合成：shell(setTint) + label  [灰白 / 军绿 / 红]',
           fill=(235, 235, 245))
    y += 18
    combos = ((1, PAL['GREY7'], '01 灰白'), (2, PAL['GRN3'], '02 军绿'),
              (3, PAL['RED3'], '03 红'))
    x = pad
    for (idx, rgb, name) in combos:
        comp = tint(shell, rgb)
        comp.alpha_composite(labels[idx], (28, 26))
        im = zoom(comp, k)
        d.rectangle((x - 1, y - 1, x + im.width, y + im.height), outline=GRID)
        sheet.paste(im, (x, y), im)
        d.text((x + 2, y + im.height + 4), f'shell+label_{name}',
               fill=(200, 200, 215))
        x += (168 + gap) * k
    y += 116 * k + 24

    d.text((pad, y), 'C. cart_fingers.png 3 帧：干净 / 中度氧化 / 严重氧化发黑',
           fill=(235, 235, 245))
    y += 18
    x = pad
    for i in range(3):
        fr = fingers.crop((i * 168, 0, (i + 1) * 168, 26))
        im = zoom(fr, k)
        d.rectangle((x - 1, y - 1, x + im.width, y + im.height), outline=GRID)
        sheet.paste(im, (x, y), im)
        d.text((x + 2, y + im.height + 3), f'#{i + 1}', fill=(190, 190, 205))
        x += (168 + gap) * k
    y += 26 * k + 24

    d.text((pad, y), 'D. 近景 + cart_scratch 第3帧 + label_05(撕口) / label_11 '
                     '+ breath_puff 6 帧', fill=(235, 235, 245))
    y += 18
    x = pad
    for (idx, rgb, name) in ((5, PAL['YEL3'], 'label_05+scratch#3'),
                             (11, PAL['WOOD3'], 'label_11+scratch#3')):
        comp = tint(shell, rgb)
        comp.alpha_composite(labels[idx], (28, 26))
        comp.alpha_composite(scratch.crop((2 * 168, 0, 3 * 168, 116)))
        im = zoom(comp, k)
        d.rectangle((x - 1, y - 1, x + im.width, y + im.height), outline=GRID)
        sheet.paste(im, (x, y), im)
        d.text((x + 2, y + im.height + 4), name, fill=(200, 200, 215))
        x += (168 + gap) * k
    # 呼气白雾（贴在同一行右侧，深底更好看 dither）
    px2 = x
    for i in range(3):
        fr = puff.crop((i * 40, 0, (i + 1) * 40, 40))
        im = zoom(fr, k)
        sheet.paste(im, (px2, y), im)
        px2 += (40 + 2) * k
    px2 = x
    for i in range(3, 6):
        fr = puff.crop((i * 40, 0, (i + 1) * 40, 40))
        im = zoom(fr, k)
        sheet.paste(im, (px2, y + 42 * k), im)
        px2 += (40 + 2) * k
    d.text((x + 2, y + 84 * k + 4), 'breath_puff 1-6', fill=(200, 200, 215))
    y += 116 * k + 24

    # E. 12 张近景贴纸全检（x2）+ 未染色的灰阶白模（x3）
    d.text((pad, y), 'E. cart_label_01..12 全检 (112x62, x2)', fill=(235, 235, 245))
    y += 18
    for r in range(3):
        x = pad
        for cc in range(4):
            i = r * 4 + cc + 1
            im = zoom(labels[i], 2)
            d.rectangle((x - 1, y - 1, x + im.width, y + im.height), outline=GRID)
            sheet.paste(im, (x, y), im)
            d.text((x + 2, y + im.height + 3), f'label_{i:02d}',
                   fill=(190, 190, 205))
            x += 112 * 2 + 16
        y += 62 * 2 + 20
    y += 8
    d.text((pad, y), 'F. cart_big_shell.png 未染色灰阶白模 (168x116, x3) + '
                     'cart_scratch 4 帧', fill=(235, 235, 245))
    y += 18
    im = zoom(shell, k)
    d.rectangle((pad - 1, y - 1, pad + im.width, y + im.height), outline=GRID)
    sheet.paste(im, (pad, y), im)
    x = pad + 168 * k + 16
    for i in range(4):
        fr = scratch.crop((i * 168, 0, (i + 1) * 168, 116))
        base = Image.new('RGBA', (168, 116), (70, 70, 84, 255))
        base.alpha_composite(fr)
        im2 = zoom(base, 1)
        d.rectangle((x - 1, y - 1, x + im2.width, y + im2.height), outline=GRID)
        sheet.paste(im2, (x, y), im2)
        d.text((x + 2, y + 118, ), f'scratch#{i + 1}', fill=(190, 190, 205))
        x += 176
    return sheet


def main() -> None:
    a = build_char_sheet(4)
    a.save(os.path.join(TOOLS, 'preview_char.png'))
    print('  ok tools/preview_char.png', a.size)
    b = build_cart_sheet(3)
    b.save(os.path.join(TOOLS, 'preview_cart.png'))
    print('  ok tools/preview_cart.png', b.size)


if __name__ == '__main__':
    main()

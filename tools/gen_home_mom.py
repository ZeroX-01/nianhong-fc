# -*- coding: utf-8 -*-
"""《回家吃饭》老年妈妈 sprite —— assets/home/mom_old.png

以正片的 mom.png（6 帧 × 28×54）为底，只把头发从黑色改成灰白，
保留轮廓、围裙和动作帧。可重复运行： python3 tools/gen_home_mom.py
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "img", "char", "mom.png")
OUT = os.path.join(ROOT, "assets", "home", "mom_old.png")

GREY8 = (220, 220, 226)
GREY7 = (184, 184, 194)
GREY6 = (146, 146, 159)


def main():
    im = Image.open(SRC).convert("RGBA")
    px = im.load()
    W, H = im.size
    FW = 28
    for f in range(W // FW):
        ox = f * FW
        for y in range(0, 15):
            for x in range(4, 24):
                r, g, b, a = px[ox + x, y]
                if a == 0:
                    continue
                if r + g + b > 110:
                    continue
                # 顶部 1px 和两侧留黑，保住轮廓
                if y <= 1 or x <= 4 or x >= 23:
                    continue
                c = GREY7
                if y <= 4:
                    c = GREY8
                elif (x + y) % 7 == 0:
                    c = GREY6
                px[ox + x, y] = (c[0], c[1], c[2], a)
        # 鬓角：两侧各补两格灰
        for x in (5, 6, 21, 22):
            for y in range(10, 15):
                r, g, b, a = px[ox + x, y]
                if a and r + g + b < 110:
                    px[ox + x, y] = (GREY7[0], GREY7[1], GREY7[2], a)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    im.save(OUT)
    print("saved", OUT, im.size)


if __name__ == "__main__":
    main()

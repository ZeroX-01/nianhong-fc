# -*- coding: utf-8 -*-
"""C 组资源终检：python3 tools/verify_c.py
1) 尺寸/帧数对齐 ART_MANIFEST
2) 非 CRT 资源：alpha 只能是 0/255，颜色必须在 44 色板内
3) CRT 资源：颜色必须在板内（允许任意 alpha），并打印 alpha 取值
4) 9-slice：中央拉伸区必须无纹样（逐行/逐列常量）
"""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pxlib import PAL_SET  # noqa

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "assets", "img")
PAL = set(PAL_SET)

SPEC = {
    "market/bg_market.png": (480, 270), "market/stall.png": (156, 74),
    "market/umbrella.png": (100, 54), "market/bicycle.png": (56, 38),
    "market/crate.png": (42, 32), "market/bg_friend.png": (480, 270),
    "ui/panel.png": (48, 48), "ui/panel_dark.png": (48, 48),
    "ui/btn.png": (156, 20), "ui/arrow.png": (28, 14), "ui/heart.png": (24, 12),
    "ui/icon_coin.png": (12, 12), "ui/icon_cart.png": (12, 12),
    "ui/icon_clock.png": (12, 12), "ui/icon_alert.png": (12, 12),
    "ui/touch_dpad.png": (104, 104), "ui/touch_btn.png": (104, 52),
    "ui/focus_ring.png": (48, 24), "ui/title_logo.png": (320, 96),
    "ui/title_sub.png": (220, 20),
    "crt/scanline.png": (4, 4), "crt/aperture.png": (3, 3),
    "crt/vignette.png": (360, 270), "crt/glass.png": (360, 270),
    "crt/snow.png": (1440, 270), "crt/glitch.png": (1080, 270),
    "crt/flash.png": (360, 270),
}
NINE = {  # 文件: (left, right, top, bottom, 帧数)
    "ui/panel.png": (12, 12, 12, 12, 1),
    "ui/panel_dark.png": (12, 12, 12, 12, 1),
    "ui/btn.png": (6, 6, 4, 5, 3),
    "ui/focus_ring.png": (8, 8, 8, 8, 2),
}

err = []
for rel, (w, h) in sorted(SPEC.items()):
    p = os.path.join(IMG, rel)
    if not os.path.exists(p):
        err.append("缺失 %s" % rel)
        continue
    im = Image.open(p).convert("RGBA")
    if im.size != (w, h):
        err.append("%s 尺寸 %s != %s" % (rel, im.size, (w, h)))
    px = im.load()
    alphas, bad = set(), set()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b, a = px[x, y]
            alphas.add(a)
            if a and (r, g, b) not in PAL:
                bad.add((r, g, b))
    if bad:
        err.append("%s 板外色 %s" % (rel, sorted(bad)[:4]))
    if rel.startswith("crt/"):
        print("  [crt] %-22s alpha=%s" % (rel, sorted(alphas)))
    else:
        if not alphas <= {0, 255}:
            err.append("%s 存在半透明 alpha %s" % (rel, sorted(alphas - {0, 255})[:6]))
        print("  [ok ] %-22s %sx%s" % (rel, w, h))

print("9-slice 中央/边条纯净度：")
for rel, (l, r, t, b, n) in NINE.items():
    im = Image.open(os.path.join(IMG, rel)).convert("RGBA")
    fw = im.size[0] // n
    for f in range(n):
        fr = im.crop((f * fw, 0, (f + 1) * fw, im.size[1]))
        px = fr.load()
        cw, ch = fw - l - r, fr.size[1] - t - b
        assert cw > 0 and ch > 0, rel
        base = px[l, t]
        flat = all(px[l + x, t + y] == base for y in range(ch) for x in range(cw))
        # 上下边条：沿 x 常量；左右边条：沿 y 常量
        hx = all(px[l + x, y] == px[l, y] for y in list(range(t)) + list(range(fr.size[1] - b, fr.size[1]))
                 for x in range(cw))
        vy = all(px[x, t + y] == px[x, t] for x in list(range(l)) + list(range(fw - r, fw))
                 for y in range(ch))
        print("  %s 帧%d 中央纯色=%s 上下边条可横拉=%s 左右边条可竖拉=%s" % (rel, f, flat, hx, vy))
        if not (flat and hx and vy):
            err.append("%s 帧%d 9-slice 拉伸区不干净" % (rel, f))

print("-" * 52)
if err:
    print("发现 %d 个问题：" % len(err))
    for e in err:
        print("  x", e)
    sys.exit(1)
print("C 组全部资源通过终检（尺寸/调色板/alpha/9-slice）")

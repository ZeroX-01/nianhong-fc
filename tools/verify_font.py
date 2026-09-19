#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""校验 pix12/pix16 位图字体：像素纯度、XML 结构、xadvance、字符覆盖，
并用 PNG+XML 自己重新排版测试文本，输出 tools/font_preview.png（3 倍放大、深底白字）。"""
import os
import xml.etree.ElementTree as ET
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(ROOT, "assets", "font")

TEST_LINES = [
    "那年的红白机",
    "把卡带拿出来哈两口气，再在电视桌上划两下。",
    "零花钱：￥12.5  卡带收藏：7/12  星期三 17:30",
    "ABCDEFGHIJKLM abcdefghijklm 0123456789 !?,.",
    "《魂斗萝》《铁甲坦克1990》《超级马里蘑》",
    "妈妈快回来了！快把游戏机藏起来！",
    "★零下藏赢躲翻雪  ①②③ ←→↑↓ №1 ℃",
]


def load(name):
    root = ET.parse(os.path.join(FONT_DIR, name + ".xml")).getroot()
    info = root.find("info").attrib
    common = root.find("common").attrib
    page = root.find("pages/page").attrib
    chars = {}
    for c in root.find("chars"):
        a = {k: (int(v) if k != "letter" else v) for k, v in c.attrib.items()}
        chars[a["id"]] = a
    img = Image.open(os.path.join(FONT_DIR, page["file"])).convert("RGBA")
    return info, common, chars, img


def check(name):
    info, common, chars, img = load(name)
    size = int(info["size"])
    errs = []
    # 1. 像素纯度
    colors = img.getcolors(maxcolors=1 << 24)
    # alpha 只允许 0 或 255；alpha=255 处必须是纯白 #FFFFFF
    bad = [c for cnt, c in colors
           if c[3] not in (0, 255) or (c[3] == 255 and c[:3] != (255, 255, 255))]
    if bad:
        errs.append("PNG 含灰度/非纯白像素: %s" % bad[:5])
    # 2. xadvance
    for cp, a in chars.items():
        want = size // 2 if cp < 0x80 else size
        if a["xadvance"] != want:
            errs.append("U+%04X xadvance=%d 应为 %d" % (cp, a["xadvance"], want))
    # 3. 空格
    if 32 not in chars:
        errs.append("缺少空格 id=32")
    # 4. 覆盖
    need = "".join(TEST_LINES) + "，。、；：？！“”《》￥…—"
    miss = sorted({ch for ch in need if ord(ch) not in chars})
    if miss:
        errs.append("缺字: %s" % "".join(miss))
    # 5. 图集边界
    W, H = img.size
    for cp, a in chars.items():
        if a["x"] + a["width"] > W or a["y"] + a["height"] > H:
            errs.append("U+%04X 越界" % cp)
    print("[%s] %dx%d, chars=%d, lineHeight=%s base=%s -> %s"
          % (name, W, H, len(chars), common["lineHeight"], common["base"],
             "OK" if not errs else "FAIL"))
    for e in errs[:10]:
        print("   !", e)
    return chars, img, common, len(errs) == 0


def draw(lines, chars, img, common, target, x0, y0, color=(255, 255, 255, 255)):
    lh = int(common["lineHeight"])
    y = y0
    maxx = 0
    tinted = Image.new("RGBA", img.size, color)
    tinted.putalpha(img.getchannel("A"))
    for line in lines:
        x = x0
        for ch in line:
            a = chars.get(ord(ch))
            if a is None:
                x += int(common["lineHeight"]) - 2
                continue
            if a["width"] > 0:
                g = tinted.crop((a["x"], a["y"], a["x"] + a["width"], a["y"] + a["height"]))
                target.alpha_composite(g, (x + a["xoffset"], y + a["yoffset"]))
            x += a["xadvance"]
        maxx = max(maxx, x)
        y += lh
    return maxx, y


def main():
    ok = True
    data = {}
    for name in ("pix12", "pix16"):
        chars, img, common, good = check(name)
        data[name] = (chars, img, common)
        ok = ok and good

    W, H = 420, 200
    canvas = Image.new("RGBA", (W, H), (24, 20, 37, 255))
    c16, i16, m16 = data["pix16"]
    _, y = draw(TEST_LINES[:1], c16, i16, m16, canvas, 8, 6)
    c12, i12, m12 = data["pix12"]
    draw(TEST_LINES[1:], c12, i12, m12, canvas, 8, y + 4)
    # 16px 全量再排一遍，验证标题字号
    draw(["16px：那年的红白机 ￥12.5 ABC《魂斗萝》"], c16, i16, m16, canvas, 8, 120)
    draw(["12px：妈妈快回来了！藏零霸躲翻雪 ★①② abc 0123"], c12, i12, m12, canvas, 8, 146)
    out = canvas.resize((W * 3, H * 3), Image.NEAREST)
    p = os.path.join(ROOT, "tools", "font_preview.png")
    out.save(p)
    print("preview ->", p, out.size)
    print("RESULT:", "PASS" if ok else "FAIL")


if __name__ == "__main__":
    main()

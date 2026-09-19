#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成《那年的红白机》中文点阵位图字体（BMFont XML + RGBA PNG）。

字模来源：
  - CJK / 全角标点 / 符号：/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc
      face index 2 = "WenQuanYi Zen Hei Sharp"（内嵌 12px / 16px 真点阵 strike，
      渲染结果天然只有 0/255 两级，无灰度）
  - ASCII 半角：
      12px -> DejaVuSansMono @10（advance 6px，FT 单色渲染，最清晰）
      16px -> WQY Zen Hei Mono @16（advance 8px，FT 单色渲染）

输出：assets/font/pix12.png/.xml，assets/font/pix16.png/.xml
可重复运行：python3 tools/gen_font.py
"""
import os
import re
import sys
from PIL import Image, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets", "font")
WQY = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
DVM = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"

PAD = 1  # 图集内字形间距（防 GPU 采样溢出）


# ---------------------------------------------------------------- 字符集
def find_face(path, keyword):
    """遍历 ttc 的 face index，返回名称含 keyword 的 index。"""
    i = 0
    while True:
        try:
            f = ImageFont.truetype(path, 12, index=i)
        except OSError:
            break
        name = " ".join(f.getname())
        if keyword.lower() in name.lower():
            return i, name
        i += 1
        if i > 32:
            break
    raise RuntimeError("找不到 face: %s" % keyword)


PUNCT = (
    "，。、；：？！“”‘’（）《》【】…—～·〈〉「」『』〔〕￥％＋－×÷＝＜＞：；　"
    "０１２３４５６７８９　￡＆＠＃／＼｜＿＊＾｛｝［］"
    "、。〃々〆〇〈〉《》「」『』【】〒〓〔〕"
)
EXTRA = "←→↑↓★☆♪♥♡●○■□▲▼◆◇※№℃①②③④⑤⑥⑦⑧⑨⑩⑪⑫Ⅰⅱ√×°′″¥°"


def gb2312_level1():
    """GB2312 一级汉字：区 16-55（0xB0-0xD7），位 1-94。共 3755 字。"""
    out = []
    for hi in range(0xB0, 0xD8):
        for lo in range(0xA1, 0xFF):
            try:
                ch = bytes([hi, lo]).decode("gb2312")
            except UnicodeDecodeError:
                continue
            out.append(ch)
    return out


STR_RE = re.compile(r"'([^'\n]*)'|\"([^\"\n]*)\"")


def scan_source_chars():
    """把 src/ 里所有字符串字面量中的非 ASCII 字符收进来。

    起因：字库原来只有 GB2312 一级（3755 字），写文案时一不小心用了二级字
    （攥、掰、摞、诶、咔哒、洇、浏、捋、愣）或制表方块（▓▒），上屏就是一个空洞，
    而且跑测试也看不出来 —— 位图字体缺字是静默失败。现在字库跟着源码长：
    源码里写了的字，一定能上屏。
    """
    src = os.path.join(ROOT, "src")
    out = []
    for root, _dirs, files in os.walk(src):
        for fn in sorted(files):
            if not fn.endswith(".js"):
                continue
            with open(os.path.join(root, fn), encoding="utf-8") as f:
                txt = f.read()
            for m in STR_RE.finditer(txt):
                s = m.group(1) or m.group(2) or ""
                for ch in s:
                    if ord(ch) > 0x7F:
                        out.append(ch)
    return out


def build_charset():
    seen = {}
    order = []

    def add(ch):
        if ch not in seen:
            seen[ch] = True
            order.append(ch)

    for c in range(0x20, 0x7F):
        add(chr(c))
    for ch in PUNCT:
        add(ch)
    for ch in EXTRA:
        add(ch)
    hz = gb2312_level1()
    for ch in hz:
        add(ch)
    n_before = len(order)
    for ch in scan_source_chars():
        add(ch)
    return order, len(hz), len(order) - n_before


# ---------------------------------------------------------------- 渲染
def render_mono(font, ch):
    """FT 单色渲染 + 二值化，返回 (Image L 模式 0/255, xoff, yoff_from_ascent_top)。"""
    try:
        mask, off = font.getmask2(ch, mode="1")
    except Exception:
        return None
    w, h = mask.size
    if w == 0 or h == 0:
        return None, off
    img = Image.frombytes("L", mask.size, bytes(mask))
    # 强制二值化：>=128 -> 255，其余 0（消除任何灰度边缘）
    img = img.point(lambda v: 255 if v >= 128 else 0)
    bbox = img.getbbox()
    if bbox is None:
        return None, off
    img = img.crop(bbox)
    return img, (off[0] + bbox[0], off[1] + bbox[1])


def is_ascii(ch):
    return ord(ch) < 0x80


def gen(size, atlas_w, atlas_h, name):
    idx_sharp, sharp_name = find_face(WQY, "Sharp")
    cjk_font = ImageFont.truetype(WQY, size, index=idx_sharp,
                                  layout_engine=ImageFont.Layout.BASIC)
    if size == 12:
        ascii_font = ImageFont.truetype(DVM, 10, layout_engine=ImageFont.Layout.BASIC)
        ascii_src = "DejaVuSansMono@10"
    else:
        idx_mono, _ = find_face(WQY, "Mono")
        ascii_font = ImageFont.truetype(WQY, size, index=idx_mono,
                                        layout_engine=ImageFont.Layout.BASIC)
        ascii_src = "WQY Zen Hei Mono@%d" % size

    adv_cjk = size
    adv_ascii = size // 2
    line_height = size + 2
    base = size - 1

    cjk_asc = cjk_font.getmetrics()[0]
    ascii_asc = ascii_font.getmetrics()[0]

    chars, n_hz, n_src = build_charset()
    atlas = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))
    records = []
    x = y = PAD
    row_h = 0
    missing = []

    for ch in chars:
        cp = ord(ch)
        ascii_mode = is_ascii(ch)
        font = ascii_font if ascii_mode else cjk_font
        asc = ascii_asc if ascii_mode else cjk_asc
        adv = adv_ascii if ascii_mode else adv_cjk

        if ch == " " or ch == "\u3000":
            records.append(dict(id=cp, x=0, y=0, width=0, height=0,
                                xoffset=0, yoffset=0,
                                xadvance=adv_ascii if ch == " " else adv_cjk))
            continue

        res = render_mono(font, ch)
        if res is None or res[0] is None:
            missing.append(ch)
            records.append(dict(id=cp, x=0, y=0, width=0, height=0,
                                xoffset=0, yoffset=0, xadvance=adv))
            continue
        glyph, off = res
        gw, gh = glyph.size
        # 基线对齐：off[1] 为字形顶到 ascender 顶的距离
        top_above_baseline = asc - off[1]
        yoffset = base - top_above_baseline
        xoffset = off[0]

        if x + gw + PAD > atlas_w:
            x = PAD
            y += row_h + PAD
            row_h = 0
        if y + gh + PAD > atlas_h:
            raise RuntimeError("图集空间不足：%s %dx%d" % (name, atlas_w, atlas_h))
        atlas.paste(Image.merge("RGBA", (glyph.point(lambda v: 255),
                                         glyph.point(lambda v: 255),
                                         glyph.point(lambda v: 255),
                                         glyph)), (x, y))
        records.append(dict(id=cp, x=x, y=y, width=gw, height=gh,
                            xoffset=xoffset, yoffset=yoffset, xadvance=adv))
        x += gw + PAD
        row_h = max(row_h, gh)

    os.makedirs(OUT_DIR, exist_ok=True)
    png_path = os.path.join(OUT_DIR, name + ".png")
    atlas.save(png_path)

    lines = ['<?xml version="1.0" encoding="utf-8"?>', "<font>",
             '  <info face="%s" size="%d" bold="0" italic="0" charset="" unicode="1"'
             ' stretchH="100" smooth="0" aa="1" padding="0,0,0,0" spacing="1,1" outline="0"/>'
             % (name, size),
             '  <common lineHeight="%d" base="%d" scaleW="%d" scaleH="%d" pages="1"'
             ' packed="0" alphaChnl="0" redChnl="0" greenChnl="0" blueChnl="0"/>'
             % (line_height, base, atlas_w, atlas_h),
             "  <pages>", '    <page id="0" file="%s.png"/>' % name, "  </pages>",
             '  <chars count="%d">' % len(records)]
    for r in records:
        lines.append('    <char id="%d" x="%d" y="%d" width="%d" height="%d"'
                     ' xoffset="%d" yoffset="%d" xadvance="%d" page="0" chnl="15"/>'
                     % (r["id"], r["x"], r["y"], r["width"], r["height"],
                        r["xoffset"], r["yoffset"], r["xadvance"]))
    lines += ["  </chars>", "</font>", ""]
    xml_path = os.path.join(OUT_DIR, name + ".xml")
    with open(xml_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print("[%s] face=%s (index=%d) / ASCII=%s" % (name, sharp_name, idx_sharp, ascii_src))
    print("  图集 %dx%d，字符总数 %d（GB2312 一级汉字 %d + 源码补进来的 %d）" %
          (atlas_w, atlas_h, len(records), n_hz, n_src))
    print("  lineHeight=%d base=%d xadvance: 汉字=%d ASCII=%d" %
          (line_height, base, adv_cjk, adv_ascii))
    print("  缺字 %d 个: %s" % (len(missing), "".join(missing)))
    return len(records)


if __name__ == "__main__":
    gen(12, 1024, 1024, "pix12")
    gen(16, 2048, 1024, "pix16")
    print("done")

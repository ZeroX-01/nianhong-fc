#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""字库体检：源码里写了的字，屏幕上一定得显示出来。

位图字体缺字是**静默失败** —— 画面上只是少一个字，控制台不报错，自动化测试
也抓不到。所以上线前必须跑这一条：把 src/ 里所有字符串字面量中的非 ASCII
字符，和 assets/font/pix12.xml、pix16.xml 里真正有字形的字符集对一遍。

用法：
    python3 tools/check_font.py          # 退出码 0 = 通过，1 = 有缺字
缺字怎么办：直接跑 python3 tools/gen_font.py，字库会跟着源码重新长一遍。
"""
import os
import re
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(ROOT, "assets", "font")
SRC_DIR = os.path.join(ROOT, "src")
STR_RE = re.compile(r"'([^'\n]*)'|\"([^\"\n]*)\"")


def font_chars(name):
    """某一号字库里真正有字形的码点（宽度为 0 的空格类也算有，它们是有意为之）。"""
    root = ET.parse(os.path.join(FONT_DIR, name)).getroot()
    return set(int(c.get("id")) for c in root.iter("char"))


def main():
    have = font_chars("pix12.xml") & font_chars("pix16.xml")
    miss = {}
    for cur, _dirs, files in os.walk(SRC_DIR):
        for fn in sorted(files):
            if not fn.endswith(".js"):
                continue
            path = os.path.join(cur, fn)
            with open(path, encoding="utf-8") as f:
                txt = f.read()
            for m in STR_RE.finditer(txt):
                s = m.group(1) or m.group(2) or ""
                for ch in s:
                    if ord(ch) > 0x7F and ord(ch) not in have:
                        miss.setdefault(ch, set()).add(os.path.relpath(path, ROOT))
    if not miss:
        print("字库体检通过：源码里的中文、标点和符号都能上屏。")
        return 0
    print("字库缺字 %d 个（屏幕上会是一个空洞）：" % len(miss))
    for ch in sorted(miss):
        print("  %s  U+%04X  %s" % (ch, ord(ch), "、".join(sorted(miss[ch]))))
    print("修法：python3 tools/gen_font.py")
    return 1


if __name__ == "__main__":
    sys.exit(main())

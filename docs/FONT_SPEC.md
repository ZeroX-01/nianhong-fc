# 中文像素位图字体规范（FONT SPEC）

## 目标
为 Phaser 3.60 的 `BitmapText` 生产**中文点阵位图字体**，保证游戏内中文是真正的像素点阵（1:1 像素、无抗锯齿），不依赖任何网络字体。

## 字模来源（关键）
系统已安装 **文泉驿点阵正黑（WenQuanYi Zen Hei Sharp）**：
```
/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc
```
该 ttc 内含 `WenQuanYi Zen Hei Sharp / 文泉驿点阵正黑` 这一 face（**内嵌真正的点阵位图 strike**，通常在 12px / 13px / 15px / 16px）。
用 PIL 打开时需要指定 face index，请**遍历 index 0..N 用 `font.getname()` 找到名称里带 `Sharp` 的那一个**。若该 face 在目标字号下渲染出来仍有灰度（说明用的是矢量轮廓而非点阵 strike），则必须：
1. 先尝试 `ImageFont.truetype(path, size, index=i, layout_engine=ImageFont.Layout.BASIC)`；
2. 用 `font.getmask(ch, mode="1")` 强制单色渲染；
3. 仍不理想则渲染后做 alpha 二值化（`>=128 → 255`，否则 `0`），并确认笔画没有断裂、没有粘连。

备选字模（如果 WQY 效果不佳可对比选优）：`/usr/share/fonts/truetype/unifont/*.ttf`（若存在，Unifont 本身就是 16px 点阵）。请两者都试，选**笔画最清晰、12px 下汉字仍可辨识**的方案，并在报告里说明选了哪个。

## 输出（BMFont XML 格式，Phaser 原生支持）
输出目录 `assets/font/`，两套字号：

| 名称 | 字号 | 文件 |
|---|---|---|
| 正文 | 12px | `assets/font/pix12.png` + `assets/font/pix12.xml` |
| 标题 | 16px | `assets/font/pix16.png` + `assets/font/pix16.xml` |

要求：
- PNG：RGBA，**字形为纯白 `#FFFFFF`（alpha 仅 0 或 255）**，背景完全透明。这样游戏代码可以用 `setTint()` 任意染色。
- 图集尺寸取 2 的幂（如 1024×1024 或 2048×1024），字形之间留 1px 间距防止采样溢出。
- XML 必须是标准 BMFont XML：
  ```xml
  <font>
    <info face="pix12" size="12"/>
    <common lineHeight="14" base="11" scaleW="1024" scaleH="1024" pages="1"/>
    <pages><page id="0" file="pix12.png"/></pages>
    <chars count="N">
      <char id="20320" x="0" y="0" width="12" height="12" xoffset="0" yoffset="1" xadvance="12" page="0" chnl="15"/>
      ...
    </chars>
  </font>
  ```
  - `id` 为 Unicode 码点（十进制）。
  - **半角字符（ASCII）的 `xadvance` 应为汉字的一半**（12px 字号下汉字 12、ASCII 6；16px 下汉字 16、ASCII 8），保证中英混排整齐。
  - `lineHeight` = 字号 + 2。
  - 空格字符（id=32）必须包含，width/height 可为 0 但 xadvance 要给。
  - 不需要 kernings 节点。

## 字符集
必须包含（缺字会导致游戏里显示空白，必须齐全）：
1. 全部可打印 ASCII（0x20–0x7E）。
2. 中文常用标点与全角符号：`，。、；：？！“”‘’（）《》【】…—～·〈〉「」￥%＋－×÷=＜＞：；　`（含全角空格 U+3000）。
3. **GB2312 一级汉字全部 3755 字**（这样任何游戏文案都不会缺字）。若图集过大可放宽到 2 页，但优先用 1 页 2048×1024 装下。
4. 额外符号：`←→↑↓★☆♪♥♡●○■□▲▼◆※№℃①②③④⑤⑥⑦⑧⑨⑩`。

## 交付与自查（必做）
1. 生成脚本：`tools/gen_font.py`，可重复运行。
2. 写一个校验脚本 `tools/verify_font.py`，用生成的 PNG+XML **自己重新排版**一段测试文本，输出 `tools/font_preview.png`（放大 3 倍，深色背景 + 白字），测试文本必须包含：
   ```
   那年的红白机
   把卡带拿出来哈两口气，再在电视桌上划两下。
   零花钱：￥12.5  卡带收藏：7/12  星期三 17:30
   ABCDEFGHIJKLM abcdefghijklm 0123456789 !?,.
   《魂斗萝》《铁甲坦克1990》《超级马里蘑》
   妈妈快回来了！快把游戏机藏起来！
   ```
3. 用 `read` 工具以 `view_type=image` 查看 `tools/font_preview.png`，确认：汉字笔画清晰可辨、无灰度模糊、无字形错位/串行、行距合理、中英混排不重叠。**不合格必须调整重生成，直到合格。**
4. 最终报告中说明：选用的字模 face、图集尺寸、字符总数、`lineHeight`/`base` 取值，以及预览图的自查结论。

#!/usr/bin/env python3
"""生成社交分享预览图 public/og-image.png（1200×630）。

为什么需要这个脚本：og:image 是社交平台抓取的目标，平台不执行 JS，
所以品牌名、功能词、一句话说明必须**画死在图里**。手改图的后果是
没人知道它怎么来的、文案改了图忘了换 —— 所以把它做成可重跑的命令。

用法（任意装了 Pillow 的 Python 3）：
    python3 tools/gen-og.py
依赖：Pillow（`pip install Pillow`）。字体用 macOS 自带的
Hiragino Sans GB（W6 用于标题、W3 用于小字），非 macOS 需换成
等宽度的中文字体，路径在下面的 FONT_* 常量里。

排版要点（改动前先读）：
- 内容**居中**并控制在中心 630×630 内。微信/微博会把分享卡片裁成正方形，
  左对齐的标题会被裁掉开头 —— 居中后无论 1.91:1 还是 1:1 都不丢主标题。
- 字号按「缩成手机上的一张小卡片仍可读」来定，不要往图里塞更多字。
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
OUT = Path(__file__).resolve().parent.parent / 'public' / 'og-image.png'

# macOS 自带字体。Hiragino Sans GB.ttc 的 index 2 是 W6（粗），0 是 W3（细）。
FONT_BOLD = '/System/Library/Fonts/Hiragino Sans GB.ttc'
FONT_BOLD_IDX = 2
FONT_REGULAR_IDX = 0

BRAND = '地道口语助手'
SUB = '英语口语翻译 · 近义词辨析'
LINE1 = '输入中文，立刻得到'
LINE2 = '母语者真正会说的那句英语'
FOOT = '中文口语 → 地道英语 · 近义词辨析 · 真人发音 · 入门短文'

# ── 背景：对角渐变（左上深蓝 → 右下亮蓝），比纯色更有纵深感 ──
c1 = np.array([20.0, 66.0, 158.0])    # #14429E
c2 = np.array([56.0, 141.0, 240.0])   # #388DF0
ys, xs = np.mgrid[0:H, 0:W]
t = (xs / (W - 1) * 0.42 + ys / (H - 1) * 0.58)[..., None]
img = Image.fromarray((c1 * (1 - t) + c2 * t).astype(np.uint8), 'RGB').convert('RGBA')

# ── 装饰：右侧同心圆 + 左上柔光斑，避免画面太平 ──
deco = Image.new('RGBA', (W, H), (0, 0, 0, 0))
dd = ImageDraw.Draw(deco)
for r, a in ((240, 14), (180, 18), (120, 22)):
    dd.ellipse([W - 210 - r, H // 2 - r, W - 210 + r, H // 2 + r], fill=(255, 255, 255, a))
dd.ellipse([-160, -200, 300, 240], fill=(255, 255, 255, 16))
img = Image.alpha_composite(img, deco)

draw = ImageDraw.Draw(img)
f_label = ImageFont.truetype(FONT_BOLD, 27, index=FONT_BOLD_IDX)
f_title = ImageFont.truetype(FONT_BOLD, 92, index=FONT_BOLD_IDX)
f_body = ImageFont.truetype(FONT_BOLD, 34, index=FONT_BOLD_IDX)
f_foot = ImageFont.truetype(FONT_BOLD, 23, index=FONT_REGULAR_IDX)

CX = W / 2


def tracked_center(d, y, text, font, fill, tracking=0):
    """Pillow 没有字距参数，中文标题逐字绘制加字距更好看；同时按总宽居中。"""
    total = sum(d.textlength(ch, font=font) for ch in text) + tracking * (len(text) - 1)
    x = (W - total) / 2
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill)
        x += d.textlength(ch, font=font) + tracking


tracked_center(draw, 132, SUB, f_label, (255, 255, 255, 190), tracking=1)     # 顶部标签
tracked_center(draw, 186, BRAND, f_title, (255, 255, 255, 255), tracking=6)   # 主标题

# 主标题下的短装饰线（呼应 logo 的渐变方块）
draw.rounded_rectangle([CX - 44, 322, CX + 44, 330], radius=4, fill=(255, 255, 255, 235))

draw.text((CX, 368), LINE1, font=f_body, fill=(255, 255, 255, 236), anchor='ma')
draw.text((CX, 418), LINE2, font=f_body, fill=(255, 255, 255, 236), anchor='ma')
draw.text((CX, 532), FOOT, font=f_foot, fill=(255, 255, 255, 168), anchor='ma')

OUT.parent.mkdir(parents=True, exist_ok=True)
img.convert('RGB').save(OUT, 'PNG', optimize=True)
print(f'已生成 {OUT}')
print('尺寸', Image.open(OUT).size, '体积', OUT.stat().st_size, '字节')

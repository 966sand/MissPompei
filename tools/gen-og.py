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

BRAND = '地道英语口语助手'
SUB = '英语口语翻译 · 近义词辨析'
LINE1 = '输入中文，立刻得到'
LINE2 = '母语者真正会说的那句英语'
FOOT = '中文口语 → 地道英语 · 近义词辨析 · 真人发音 · 入门短文'

# 主标题必须完整落在中心 630×630 内（见文件头的方裁说明）。
# 2026-09-18 品牌名从 6 字加到 8 字后，92px 的字号会宽出方裁范围（8×98≈778 > 630），
# 所以改成**按宽度反解字号**：以后改名不必再手调这个数字。
SAFE_W = 620          # 630 内留 5px 余量
TITLE_SIZE_MAX = 92
TITLE_TRACK_RATIO = 6 / 92   # 原设计的字距/字号比（92px 配 6px 字距）

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
    return total


def fit_title(d, text, max_w=SAFE_W):
    """按宽度反解主标题字号：返回 (font, tracking, 实测宽度)。装不下就报错，不静默裁字。"""
    for size in range(TITLE_SIZE_MAX, 47, -2):
        f = ImageFont.truetype(FONT_BOLD, size, index=FONT_BOLD_IDX)
        tr = max(1, round(size * TITLE_TRACK_RATIO))
        total = sum(d.textlength(ch, font=f) for ch in text) + tr * (len(text) - 1)
        if total <= max_w:
            return f, tr, total
    raise SystemExit(f'品牌名「{text}」太长，装不进中心 {SAFE_W}px 宽')


f_title, title_track, title_w = fit_title(draw, BRAND)
# 字号变了仍要让标题的光学中心停在原位（原设计 92px、顶边 186）
title_y = 186 + (TITLE_SIZE_MAX - f_title.size) / 2

tracked_center(draw, 132, SUB, f_label, (255, 255, 255, 190), tracking=1)          # 顶部标签
tracked_center(draw, title_y, BRAND, f_title, (255, 255, 255, 255), tracking=title_track)  # 主标题

# 主标题下的短装饰线（呼应 logo 的渐变方块）
draw.rounded_rectangle([CX - 44, 322, CX + 44, 330], radius=4, fill=(255, 255, 255, 235))

draw.text((CX, 368), LINE1, font=f_body, fill=(255, 255, 255, 236), anchor='ma')
draw.text((CX, 418), LINE2, font=f_body, fill=(255, 255, 255, 236), anchor='ma')
draw.text((CX, 532), FOOT, font=f_foot, fill=(255, 255, 255, 168), anchor='ma')

OUT.parent.mkdir(parents=True, exist_ok=True)
img.convert('RGB').save(OUT, 'PNG', optimize=True)
print(f'已生成 {OUT}')
print('尺寸', Image.open(OUT).size, '体积', OUT.stat().st_size, '字节')

# 自检：主标题左右边界必须落在中心 630 宽带内，否则方裁会切掉品牌名的头尾
L, R = CX - title_w / 2, CX + title_w / 2
assert L >= CX - 315 and R <= CX + 315, f'主标题越界：x∈[{L:.0f},{R:.0f}]'
print(f'主标题「{BRAND}」字号 {f_title.size}px 字距 {title_track}px 宽 {title_w:.0f}px '
      f'→ x∈[{L:.0f},{R:.0f}]，方裁安全带 x∈[{CX - 315:.0f},{CX + 315:.0f}] ✓')

#!/usr/bin/env python3
"""生成 GitHub 社交预览图（social preview，1280x640）。

GitHub 的社交预览**只能从网页设置里上传**（Settings -> Social preview），
没有公开 API。所以这个脚本负责把图生成好，人肉上传一次即可。

    python tools/social-preview.py            # -> docs/images/social-preview.png

配色直接取自 src/renderer/style.css 的 :root 变量，保证和界面/头图是同一套纸色。
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1280, 640
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   'docs', 'images', 'social-preview.png')
SHOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'docs', 'images', '03-tile.png')

# --- 与 src/renderer/style.css 的 :root 一一对应 ---
PAPER = (0xF6, 0xF3, 0xE9)
PAPER_3 = (0xF1, 0xEC, 0xE0)
PAPER_4 = (0xE7, 0xE1, 0xD2)
CANVAS = (0xEA, 0xE4, 0xD6)
INK = (0x2C, 0x2A, 0x24)
INK_2 = (0x6B, 0x66, 0x59)
INK_3 = (0x9A, 0x94, 0x84)
ACCENT = (0x6B, 0x7A, 0x52)
ACCENT_INK = (0x4E, 0x5A, 0x3B)
LINE = (62, 56, 40)

FONTS = {
    'zh': 'C:/Windows/Fonts/msyh.ttc',
    'zh-bold': 'C:/Windows/Fonts/msyhbd.ttc',
    'en': 'C:/Windows/Fonts/segoeuib.ttf',
    'en-light': 'C:/Windows/Fonts/segoeui.ttf',
}


def font(kind, size):
    path = FONTS[kind]
    if not os.path.exists(path):
        # 非 Windows 环境下的兜底：找一个能用的
        for alt in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
                    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
            if os.path.exists(alt):
                return ImageFont.truetype(alt, size)
        return ImageFont.load_default()
    return ImageFont.truetype(path, size)


def tracked_text(draw, xy, text, fnt, fill, tracking=0.0):
    """PIL 没有字距，手动逐字画。返回结束时的 x。"""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += draw.textlength(ch, font=fnt) + tracking
    return x - tracking if text else x


def halftone(img, spacing=16, radius=1.35, color=PAPER_4):
    """半调网点底纹 —— 与界面里用的同一招，只是更淡。"""
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for y in range(spacing // 2, img.size[1], spacing):
        for x in range(spacing // 2, img.size[0], spacing):
            d.ellipse([x - radius, y - radius, x + radius, y + radius], fill=color + (255,))
    return Image.alpha_composite(img.convert('RGBA'), layer)


def soft_shadow(base, box, radius=16, blur=26, alpha=110, offset=10):
    """给卡片加一层柔和的落影（不做发光）。"""
    sh = Image.new('RGBA', base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(sh)
    x0, y0, x1, y1 = box
    d.rounded_rectangle([x0, y0 + offset, x1, y1 + offset], radius=radius,
                        fill=LINE + (alpha,))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    return Image.alpha_composite(base, sh)


def grid_mark(draw, x, y, cell=17, gap=4, radius=3, hot=2):
    """田字格里点亮一格 —— 应用图标的同一个母题。"""
    for i in range(4):
        cx = x + (i % 2) * (cell + gap)
        cy = y + (i // 2) * (cell + gap)
        if i == hot:
            draw.rounded_rectangle([cx, cy, cx + cell, cy + cell], radius=radius, fill=ACCENT)
        else:
            draw.rounded_rectangle([cx, cy, cx + cell, cy + cell], radius=radius,
                                   outline=LINE + (70,), width=1)


def main():
    base = Image.new('RGBA', (W, H), PAPER + (255,))
    base = halftone(base)
    d = ImageDraw.Draw(base)

    # 右侧画布块：让截图「坐在」一块更深一档的纸上，与界面里 stage 的处理一致
    stage = (664, 104, 1240, 536)
    d.rounded_rectangle(stage, radius=18, fill=CANVAS + (255,))

    # ---- 左侧文字 ----
    L = 80
    TEXT_MAX = 556  # 文字栏右边界，留出与 stage 的安全距离
    grid_mark(d, L, 96)

    f_overline = font('en', 21)
    tracked_text(d, (L + 52, 100), 'DEEPSEEK HARNESS  ·  dsh web', f_overline, ACCENT_INK,
                 tracking=2.6)

    # 标题按可用宽度自适应，避免撞到右侧卡片
    title = 'dsh-multi-instance'
    title_size = 62
    while title_size > 34:
        f_title = font('en', title_size)
        if d.textlength(title, font=f_title) <= TEXT_MAX - L:
            break
        title_size -= 2
    d.text((L - 3, 150 + (62 - title_size)), title, font=f_title, fill=INK)

    f_sub = font('zh', 30)
    d.text((L, 242), '多开 DSH，每格一个窗格', font=f_sub, fill=INK_2)

    f_sub2 = font('zh', 25)
    d.text((L, 288), '本机 · WSL2 · 服务器，都能接', font=f_sub2, fill=INK_3)

    # ---- 关键词胶囊 ----
    chips = ['多实例', '多窗口', '分屏平铺', '独立会话', 'WSL2']
    f_chip = font('zh', 21)
    cx, cy, ch = L, 356, 44
    for text in chips:
        w = d.textlength(text, font=f_chip) + 30
        if cx + w > TEXT_MAX:
            break
        d.rounded_rectangle([cx, cy, cx + w, cy + ch], radius=ch // 2,
                            fill=(255, 255, 255, 150), outline=LINE + (55,), width=1)
        d.text((cx + 15, cy + 10), text, font=f_chip, fill=ACCENT_INK)
        cx += w + 10

    # ---- 页脚 ----
    f_foot = font('en-light', 22)
    tracked_text(d, (L, 502), 'github.com/BOWLUNA/dsh-multi-instance', f_foot, INK_2, tracking=0.3)
    f_foot2 = font('zh', 19)
    d.text((L, 540), 'MIT · Windows 桌面客户端', font=f_foot2, fill=INK_3)

    # ---- 右侧截图卡 ----
    if os.path.exists(SHOT):
        shot = Image.open(SHOT).convert('RGB')
        tw = stage[2] - stage[0] - 48
        th = round(tw * shot.size[1] / shot.size[0])
        max_h = stage[3] - stage[1] - 48
        if th > max_h:
            th = max_h
            tw = round(th * shot.size[0] / shot.size[1])
        shot = shot.resize((tw, th), Image.LANCZOS)
        sx = stage[0] + (stage[2] - stage[0] - tw) // 2
        sy = stage[1] + (stage[3] - stage[1] - th) // 2

        card = (sx - 6, sy - 6, sx + tw + 6, sy + th + 6)
        base = soft_shadow(base, card, radius=14, blur=24, alpha=95, offset=12)
        d = ImageDraw.Draw(base)
        d.rounded_rectangle(card, radius=14, fill=(255, 255, 255, 255),
                            outline=LINE + (60,), width=1)

        mask = Image.new('L', (tw, th), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, tw - 1, th - 1], radius=9, fill=255)
        base.paste(shot, (sx, sy), mask)
    else:
        sys.stderr.write(f'警告：找不到截图 {SHOT}，只出文字版\n')

    # 左上角一道细的橄榄色标尺线（和界面的 zone 边同色）
    d = ImageDraw.Draw(base)
    d.rectangle([0, 0, 5, H], fill=ACCENT + (255,))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    base.convert('RGB').save(OUT, 'PNG', optimize=True)
    size = os.path.getsize(OUT)
    print(f'{OUT}  {W}x{H}  {size / 1024:.0f} KB')


if __name__ == '__main__':
    main()

"""
Ad Compositor — Pharma/Clinical Trial Ad Creative
═══════════════════════════════════════════════════

Design system:
  • Top panel   : dark brand color + subtle top-to-bottom gradient
  • Accent bar  : thin colored stripe at very top of panel
  • Typography  : 3-tier hierarchy with drop shadows + letter-spacing on emphasis
  • Transition  : soft gradient fade from panel color into the photo
  • Photo       : center-cropped, fills bottom half

Typography tiers:
  ① Bold italic serif    → intro/continuation phrases (small)
  ② Huge bold serif      → ALL CAPS condition/hook   (auto-fills width, letter-spaced)
  ③ Thin divider line    → with subtle opacity
  ④ Bold sans-serif      → subtext (clean, readable)
"""

import io
import os
import re
from typing import List, Tuple

from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ── Font paths ────────────────────────────────────────────────────────────────

_SERIF_BOLD = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
    "C:/Windows/Fonts/georgiab.ttf",
    "C:/Windows/Fonts/timesbd.ttf",
]
_SERIF_BOLD_ITALIC = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-BoldItalic.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSerif-BoldItalic.ttf",
    "C:/Windows/Fonts/georgiaz.ttf",
    "C:/Windows/Fonts/timesbi.ttf",
]
_SANS_BOLD = [
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/calibrib.ttf",
]


# ── Low-level helpers ─────────────────────────────────────────────────────────

def _load_font(candidates: list, size: int) -> ImageFont.FreeTypeFont:
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def _hex_to_rgba(hex_color: str, alpha: int = 255) -> Tuple[int, int, int, int]:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), alpha)


def _hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    return _hex_to_rgba(hex_color)[:3]


def _tw(draw, text: str, font) -> float:
    return draw.textlength(text, font=font)


def _tbbox(draw, text: str, font) -> Tuple[int, int, int, int]:
    return draw.textbbox((0, 0), text, font=font)


def _th(draw, text: str, font) -> int:
    bb = _tbbox(draw, text, font)
    return bb[3] - bb[1]


def _top_offset(draw, text: str, font) -> int:
    return _tbbox(draw, text, font)[1]


# ── Design helpers ────────────────────────────────────────────────────────────

def _draw_gradient_rect(img: Image.Image, x0: int, y0: int, x1: int, y1: int,
                        color_top: tuple, color_bot: tuple) -> None:
    """Draw a vertical gradient rectangle directly onto img (RGBA)."""
    w   = x1 - x0
    h   = y1 - y0
    if h <= 0 or w <= 0:
        return
    band = Image.new("RGBA", (w, h))
    for row in range(h):
        t = row / max(h - 1, 1)
        r = int(color_top[0] + (color_bot[0] - color_top[0]) * t)
        g = int(color_top[1] + (color_bot[1] - color_top[1]) * t)
        b = int(color_top[2] + (color_bot[2] - color_top[2]) * t)
        a = int(color_top[3] + (color_bot[3] - color_top[3]) * t)
        ImageDraw.Draw(band).line([(0, row), (w, row)], fill=(r, g, b, a))
    img.alpha_composite(band, dest=(x0, y0))


def _draw_shadow_text(draw, x, y, text, font, color, shadow_offset=3, shadow_alpha=100):
    """Draw text with a soft drop shadow underneath."""
    sx, sy = x + shadow_offset, y + shadow_offset
    draw.text((sx, sy), text, font=font, fill=(0, 0, 0, shadow_alpha))
    draw.text((x,  y),  text, font=font, fill=color)


def _draw_letter_spaced(draw, cx, y, text, font, color, spacing=6,
                        shadow_offset=3, shadow_alpha=100):
    """
    Draw text centered at cx with extra letter-spacing between characters.
    Renders shadow first, then colored text on top.
    Returns the rendered text width.
    """
    chars = list(text)
    # Measure total width with spacing
    total_w = sum(_tw(draw, c, font) for c in chars) + spacing * max(0, len(chars) - 1)
    x = cx - total_w / 2

    for i, ch in enumerate(chars):
        cw = _tw(draw, ch, font)
        to = _top_offset(draw, ch, font)
        # Shadow
        draw.text((x + shadow_offset, y - to + shadow_offset), ch, font=font,
                  fill=(0, 0, 0, shadow_alpha))
        # Text
        draw.text((x, y - to), ch, font=font, fill=color)
        x += cw + spacing

    return total_w


def _draw_text_centered(draw, cx, y, text, font, color,
                        shadow_offset=2, shadow_alpha=90):
    """Draw centered text with drop shadow. Returns line height."""
    w  = _tw(draw, text, font)
    h  = _th(draw, text, font)
    to = _top_offset(draw, text, font)
    tx = cx - w / 2
    # Shadow
    draw.text((tx + shadow_offset, y - to + shadow_offset), text, font=font,
              fill=(0, 0, 0, shadow_alpha))
    # Text
    draw.text((tx, y - to), text, font=font, fill=color)
    return h


# ── Text helpers ──────────────────────────────────────────────────────────────

def _wrap(draw, text: str, font, max_w: float) -> List[str]:
    words = text.split()
    if not words:
        return [""]
    lines, cur, cw = [], [], 0.0
    for word in words:
        w  = _tw(draw, word, font)
        sp = _tw(draw, " ", font)
        gap = sp if cur else 0.0
        if cur and cw + gap + w > max_w:
            lines.append(" ".join(cur))
            cur, cw = [word], w
        else:
            cur.append(word)
            cw += gap + w
    if cur:
        lines.append(" ".join(cur))
    return lines


def _parse_runs(text: str) -> List[Tuple[str, bool]]:
    """Split into [(segment, is_emphasis)] — consecutive ALL-CAPS words grouped."""
    words = text.split()
    runs, cur, cur_emp = [], [], None
    for word in words:
        letters = re.sub(r"[^a-zA-Z]", "", word)
        emp = len(letters) >= 2 and letters.isupper()
        if cur_emp is None:
            cur_emp, cur = emp, [word]
        elif emp == cur_emp:
            cur.append(word)
        else:
            runs.append((" ".join(cur), cur_emp))
            cur, cur_emp = [word], emp
    if cur:
        runs.append((" ".join(cur), cur_emp))
    return runs


def _fit_font(draw, text: str, max_w: float,
              max_size: int = 160, min_size: int = 52) -> ImageFont.FreeTypeFont:
    for size in range(max_size, min_size - 1, -4):
        f = _load_font(_SERIF_BOLD, size)
        if _tw(draw, text, f) <= max_w:
            return f
    return _load_font(_SERIF_BOLD, min_size)


# ── Main compositor ───────────────────────────────────────────────────────────

def composite_ad(
    photo_bytes: bytes,
    layout: dict,
    canvas_w: int = 1080,
    canvas_h: int = 1920,
) -> bytes:

    # ── Layout params ─────────────────────────────────────────────────────────
    bg_hex        = layout.get("top_bg_color",   "#0a1f5c")
    top_pct       = max(0.40, min(0.55, layout.get("top_height_pct", 46) / 100))
    headline_text = layout.get("headline_text",  "")
    subtext       = layout.get("subtext",        "")
    text_color    = _hex_to_rgba(layout.get("text_color",    "#FFFFFF"))
    divider_color = _hex_to_rgba(layout.get("divider_color", "#FFFFFF"), 200)
    subtext_color = _hex_to_rgba(layout.get("subtext_color", "#E8E8E8"))

    bg_rgb  = _hex_to_rgb(bg_hex)
    top_h   = int(canvas_h * top_pct)
    bot_h   = canvas_h - top_h
    pad     = 76
    cx      = canvas_w // 2
    max_w   = canvas_w - pad * 2

    # ── RGBA canvas ───────────────────────────────────────────────────────────
    canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 255))

    # ── Top panel: base color ─────────────────────────────────────────────────
    panel = Image.new("RGBA", (canvas_w, top_h), (*bg_rgb, 255))
    canvas.alpha_composite(panel, (0, 0))

    # Subtle gradient overlay: panel darkens slightly at top, neutral at bottom
    r, g, b = bg_rgb
    dark  = (max(0, r - 18), max(0, g - 18), max(0, b - 18), 120)
    light = (r, g, b, 0)
    _draw_gradient_rect(canvas, 0, 0, canvas_w, top_h, dark, light)

    # ── Accent bar at very top (4px, slightly lighter than bg) ───────────────
    accent_color = (
        min(255, r + 60),
        min(255, g + 60),
        min(255, b + 80),
        255,
    )
    accent = Image.new("RGBA", (canvas_w, 6), accent_color)
    canvas.alpha_composite(accent, (0, 0))

    # ── Photo (bottom half) ───────────────────────────────────────────────────
    photo = Image.open(io.BytesIO(photo_bytes)).convert("RGBA")
    pw, ph = photo.size
    ratio  = canvas_w / bot_h
    if pw / ph > ratio:
        nw    = int(ph * ratio)
        photo = photo.crop(((pw - nw) // 2, 0, (pw - nw) // 2 + nw, ph))
    else:
        nh    = int(pw / ratio)
        photo = photo.crop((0, (ph - nh) // 2, pw, (ph - nh) // 2 + nh))
    photo = photo.resize((canvas_w, bot_h), Image.LANCZOS)
    canvas.alpha_composite(photo, (0, top_h))

    # ── Gradient fade: panel → photo (softens the hard edge) ─────────────────
    fade_h = 80
    fade_top = (*bg_rgb, 255)
    fade_bot = (*bg_rgb, 0)
    _draw_gradient_rect(canvas, 0, top_h - fade_h, canvas_w, top_h + 20, fade_top, fade_bot)

    # ── Draw on RGBA canvas ───────────────────────────────────────────────────
    draw = ImageDraw.Draw(canvas)

    # ── Typography: measure first ─────────────────────────────────────────────
    ITALIC_SZ    = 54
    SUB_SZ       = 52
    ITEM_GAP     = 12
    LINE_GAP     = 8
    DIV_MARGIN_T = 34
    DIV_MARGIN_B = 30
    DIV_THICK    = 3
    SUB_LINE_GAP = 10
    EMP_SPACING  = 8   # letter-spacing px for emphasis run

    font_italic = _load_font(_SERIF_BOLD_ITALIC, ITALIC_SZ)
    font_sub    = _load_font(_SANS_BOLD,         SUB_SZ)

    # Build segments
    runs     = _parse_runs(headline_text)
    segments = []
    for seg_text, is_emp in runs:
        if is_emp:
            font  = _fit_font(draw, seg_text, max_w - EMP_SPACING * len(seg_text))
            lh    = _th(draw, seg_text, font)
            segments.append({"text": seg_text, "font": font, "is_emp": True,
                              "lines": [seg_text], "line_h": lh, "seg_h": lh})
        else:
            wrapped = _wrap(draw, seg_text.strip(), font_italic, max_w)
            lh      = _th(draw, wrapped[0], font_italic)
            seg_h   = lh * len(wrapped) + LINE_GAP * max(0, len(wrapped) - 1)
            segments.append({"text": seg_text, "font": font_italic, "is_emp": False,
                              "lines": wrapped, "line_h": lh, "seg_h": seg_h})

    sub_lines  = _wrap(draw, subtext, font_sub, max_w)
    sub_line_h = _th(draw, sub_lines[0], font_sub)
    sub_blk_h  = sub_line_h * len(sub_lines) + SUB_LINE_GAP * max(0, len(sub_lines) - 1)

    hl_blk_h = (sum(s["seg_h"] for s in segments)
                + ITEM_GAP * max(0, len(segments) - 1))
    total_h  = hl_blk_h + DIV_MARGIN_T + DIV_THICK + DIV_MARGIN_B + sub_blk_h

    # Scale down if overflow
    avail_h = top_h - pad * 2
    if total_h > avail_h and avail_h > 0:
        scale       = avail_h / total_h
        ITALIC_SZ   = max(28, int(ITALIC_SZ * scale))
        SUB_SZ      = max(28, int(SUB_SZ    * scale))
        ITEM_GAP    = max(4,  int(ITEM_GAP  * scale))
        DIV_MARGIN_T = max(14, int(DIV_MARGIN_T * scale))
        DIV_MARGIN_B = max(12, int(DIV_MARGIN_B * scale))

        font_italic = _load_font(_SERIF_BOLD_ITALIC, ITALIC_SZ)
        font_sub    = _load_font(_SANS_BOLD,         SUB_SZ)

        segments = []
        for seg_text, is_emp in runs:
            if is_emp:
                emp_max = max(40, int(160 * scale))
                font    = _fit_font(draw, seg_text, max_w, max_size=emp_max, min_size=40)
                lh      = _th(draw, seg_text, font)
                segments.append({"text": seg_text, "font": font, "is_emp": True,
                                  "lines": [seg_text], "line_h": lh, "seg_h": lh})
            else:
                wrapped = _wrap(draw, seg_text.strip(), font_italic, max_w)
                lh      = _th(draw, wrapped[0], font_italic)
                seg_h   = lh * len(wrapped) + LINE_GAP * max(0, len(wrapped) - 1)
                segments.append({"text": seg_text, "font": font_italic, "is_emp": False,
                                  "lines": wrapped, "line_h": lh, "seg_h": seg_h})

        sub_lines  = _wrap(draw, subtext, font_sub, max_w)
        sub_line_h = _th(draw, sub_lines[0], font_sub)
        sub_blk_h  = sub_line_h * len(sub_lines) + SUB_LINE_GAP * max(0, len(sub_lines) - 1)
        hl_blk_h   = (sum(s["seg_h"] for s in segments)
                      + ITEM_GAP * max(0, len(segments) - 1))
        total_h    = hl_blk_h + DIV_MARGIN_T + DIV_THICK + DIV_MARGIN_B + sub_blk_h

    # ── Vertical center ───────────────────────────────────────────────────────
    y = max(pad + 6, (top_h - total_h) // 2)   # +6 for accent bar clearance

    # ── Render headline segments ──────────────────────────────────────────────
    for i, seg in enumerate(segments):
        for j, line in enumerate(seg["lines"]):
            if seg["is_emp"]:
                _draw_letter_spaced(draw, cx, y, line, seg["font"],
                                    text_color, spacing=EMP_SPACING,
                                    shadow_offset=4, shadow_alpha=120)
                y += seg["line_h"]
            else:
                _draw_text_centered(draw, cx, y, line, seg["font"],
                                    text_color, shadow_offset=2, shadow_alpha=90)
                y += seg["line_h"]
            if j < len(seg["lines"]) - 1:
                y += LINE_GAP
        if i < len(segments) - 1:
            y += ITEM_GAP

    # ── Divider ───────────────────────────────────────────────────────────────
    y += DIV_MARGIN_T
    # Slightly inset divider with rounded-ish feel via two-layer draw
    draw.line([(pad, y), (canvas_w - pad, y)],
              fill=(0, 0, 0, 60), width=DIV_THICK + 2)          # soft shadow line
    draw.line([(pad, y), (canvas_w - pad, y)],
              fill=divider_color,  width=DIV_THICK)
    y += DIV_THICK + DIV_MARGIN_B

    # ── Subtext ───────────────────────────────────────────────────────────────
    for j, line in enumerate(sub_lines):
        _draw_text_centered(draw, cx, y, line, font_sub,
                            subtext_color, shadow_offset=2, shadow_alpha=80)
        y += sub_line_h
        if j < len(sub_lines) - 1:
            y += SUB_LINE_GAP

    # ── Convert to RGB and save ───────────────────────────────────────────────
    out_img = canvas.convert("RGB")
    out     = io.BytesIO()
    out_img.save(out, format="PNG", optimize=True)
    return out.getvalue()

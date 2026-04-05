"""
Ad Compositor — overlays structured text/design onto a photo background.

Split-layout pharma ad style:
  TOP : solid color panel with headline (serif bold) + emphasis underlines + divider + subtext
  BOTTOM : AI-generated photo (GPT-image-1 output, no text)

Usage:
    from app.services.ai.compositor import composite_ad
    png_bytes = composite_ad(photo_bytes, layout, canvas_w=1080, canvas_h=1920)
"""

import io
import os
import re
from typing import Tuple, List
from PIL import Image, ImageDraw, ImageFont

# ── Font candidates (tried in order, first match wins) ────────────────────────

_SERIF_BOLD = [
    # Linux / Docker (installed via apt fonts-dejavu-core, fonts-liberation)
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSerifBold.ttf",
    # macOS
    "/Library/Fonts/Georgia Bold.ttf",
    "/System/Library/Fonts/Times.ttc",
    # Windows
    "C:/Windows/Fonts/georgiab.ttf",
    "C:/Windows/Fonts/timesbd.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]

_SANS_REGULAR = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    "/Library/Fonts/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/calibri.ttf",
]

_SANS_BOLD = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/calibrib.ttf",
]


def _load_font(candidates: list, size: int) -> ImageFont.FreeTypeFont:
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default(size=size)


def _hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def _is_emphasis(word: str) -> bool:
    """True for ALL-CAPS tokens with ≥2 letters — rendered larger with underline."""
    clean = re.sub(r"[^a-zA-Z]", "", word)
    return len(clean) >= 2 and clean.isupper()


def _text_height(draw: ImageDraw.ImageDraw, text: str, font) -> int:
    bb = draw.textbbox((0, 0), text, font=font)
    return bb[3] - bb[1]


def _text_width(draw: ImageDraw.ImageDraw, text: str, font) -> float:
    return draw.textlength(text, font=font)


def _build_lines(
    draw: ImageDraw.ImageDraw,
    words: List[str],
    font_std,
    font_emp,
    max_w: float,
) -> List[List[Tuple[str, object]]]:
    """Greedy word-wrap returning list of lines, each line is [(word, font), ...]."""
    lines, current_line, current_w = [], [], 0.0
    for word in words:
        font = font_emp if _is_emphasis(word) else font_std
        w = _text_width(draw, word, font)
        space = _text_width(draw, " ", font)
        gap = space if current_line else 0
        if current_line and current_w + gap + w > max_w:
            lines.append(current_line)
            current_line = [(word, font)]
            current_w = w
        else:
            current_line.append((word, font))
            current_w += gap + w
    if current_line:
        lines.append(current_line)
    return lines


def _draw_headline(
    draw: ImageDraw.ImageDraw,
    text: str,
    canvas_w: int,
    top_h: int,
    padding: int,
    text_color: Tuple[int, int, int],
    subtext: str,
    subtext_color: Tuple[int, int, int],
    divider_color: Tuple[int, int, int],
) -> None:
    """
    Renders the full top section:
    - Headline with emphasis words larger + underlined
    - Thin divider
    - Subtext

    The whole text block is vertically centered in top_h.
    """
    max_w = canvas_w - padding * 2

    # Font sizes for 1080px canvas — large enough to dominate the top panel
    font_std = _load_font(_SERIF_BOLD,   92)
    font_emp = _load_font(_SERIF_BOLD,  118)
    font_sub = _load_font(_SANS_BOLD,    52)

    line_gap     = 22   # px between headline lines
    div_gap_top  = 36   # px from headline bottom to divider
    div_gap_bot  = 30   # px from divider to subtext
    sub_line_gap = 14   # px between subtext lines
    underline_offset = 8   # px below text baseline for underline
    underline_thickness = 4

    # ── Build headline lines ──────────────────────────────────────────────────
    hl_lines = _build_lines(draw, text.split(), font_std, font_emp, max_w)

    # ── Measure headline block ────────────────────────────────────────────────
    hl_line_heights = []
    for line in hl_lines:
        h = max(_text_height(draw, w, f) for w, f in line)
        hl_line_heights.append(h)
    hl_total_h = sum(hl_line_heights) + line_gap * max(0, len(hl_lines) - 1)

    # ── Build + measure subtext lines ─────────────────────────────────────────
    sub_words   = subtext.split()
    sub_lines   = []
    current, cw = [], 0.0
    for word in sub_words:
        w = _text_width(draw, word, font_sub)
        sp = _text_width(draw, " ", font_sub)
        gap = sp if current else 0
        if current and cw + gap + w > max_w:
            sub_lines.append(" ".join(current))
            current, cw = [word], w
        else:
            current.append(word)
            cw += gap + w
    if current:
        sub_lines.append(" ".join(current))

    sub_line_h  = _text_height(draw, sub_lines[0] if sub_lines else "A", font_sub)
    sub_total_h = sub_line_h * len(sub_lines) + sub_line_gap * max(0, len(sub_lines) - 1)

    # ── Total block height → center in top_h ─────────────────────────────────
    divider_h   = 3
    total_block = hl_total_h + div_gap_top + divider_h + div_gap_bot + sub_total_h
    start_y     = max(padding, (top_h - total_block) // 2)

    # ── Draw headline lines ───────────────────────────────────────────────────
    y = start_y
    for i, line in enumerate(hl_lines):
        # Measure full line width for horizontal centering
        total_lw = sum(
            _text_width(draw, w, f) + (_text_width(draw, " ", f) if j < len(line) - 1 else 0)
            for j, (w, f) in enumerate(line)
        )
        x = (canvas_w - total_lw) / 2

        line_h = hl_line_heights[i]

        for j, (word, font) in enumerate(line):
            w  = _text_width(draw, word, font)
            sp = _text_width(draw, " ", font) if j < len(line) - 1 else 0

            # Baseline offset: align bottom of each word to the tallest in line
            word_h  = _text_height(draw, word, font)
            y_offset = line_h - word_h

            draw.text((x, y + y_offset), word, font=font, fill=text_color)

            # Underline emphasis words
            if _is_emphasis(word):
                ul_y = y + line_h + underline_offset
                draw.line(
                    [(x, ul_y), (x + w, ul_y)],
                    fill=text_color,
                    width=underline_thickness,
                )

            x += w + sp

        y += line_h + line_gap

    # Remove last line_gap, add div_gap_top
    y = y - line_gap + div_gap_top

    # ── Divider ───────────────────────────────────────────────────────────────
    draw.line(
        [(padding, y), (canvas_w - padding, y)],
        fill=divider_color,
        width=divider_h,
    )
    y += divider_h + div_gap_bot

    # ── Subtext ───────────────────────────────────────────────────────────────
    for line in sub_lines:
        lw = _text_width(draw, line, font_sub)
        draw.text(((canvas_w - lw) // 2, y), line, font=font_sub, fill=subtext_color)
        y += sub_line_h + sub_line_gap


def composite_ad(
    photo_bytes: bytes,
    layout: dict,
    canvas_w: int = 1080,
    canvas_h: int = 1920,
) -> bytes:
    """
    Composites the final ad creative.

    Args:
        photo_bytes : Raw PNG/JPEG from GPT-image-1 (scene photo, no text)
        layout      : Design spec dict from Claude
        canvas_w/h  : Output dimensions (default 1080×1920 story format)

    Returns:
        Final ad as PNG bytes.
    """
    bg_color      = _hex_to_rgb(layout.get("top_bg_color",   "#0a1f5c"))
    top_pct       = layout.get("top_height_pct", 45) / 100
    headline_text = layout.get("headline_text",  "")
    subtext       = layout.get("subtext",        "")
    text_color    = _hex_to_rgb(layout.get("text_color",      "#FFFFFF"))
    divider_color = _hex_to_rgb(layout.get("divider_color",   "#FFFFFF"))
    subtext_color = _hex_to_rgb(layout.get("subtext_color",   "#CCCCCC"))

    top_h    = int(canvas_h * top_pct)
    bottom_h = canvas_h - top_h
    padding  = 80

    # ── Canvas ────────────────────────────────────────────────────────────────
    canvas = Image.new("RGB", (canvas_w, canvas_h), bg_color)
    draw   = ImageDraw.Draw(canvas)

    # ── Bottom: photo (center-crop to fill) ───────────────────────────────────
    photo = Image.open(io.BytesIO(photo_bytes)).convert("RGB")
    ph_w, ph_h   = photo.size
    target_ratio = canvas_w / bottom_h
    photo_ratio  = ph_w / ph_h

    if photo_ratio > target_ratio:
        new_w = int(ph_h * target_ratio)
        left  = (ph_w - new_w) // 2
        photo = photo.crop((left, 0, left + new_w, ph_h))
    else:
        new_h = int(ph_w / target_ratio)
        top_c = (ph_h - new_h) // 2
        photo = photo.crop((0, top_c, ph_w, top_c + new_h))

    photo = photo.resize((canvas_w, bottom_h), Image.LANCZOS)
    canvas.paste(photo, (0, top_h))

    # ── Top: headline + divider + subtext (all vertically centered) ───────────
    _draw_headline(
        draw=draw,
        text=headline_text,
        canvas_w=canvas_w,
        top_h=top_h,
        padding=padding,
        text_color=text_color,
        subtext=subtext,
        subtext_color=subtext_color,
        divider_color=divider_color,
    )

    # ── Save ──────────────────────────────────────────────────────────────────
    output = io.BytesIO()
    canvas.save(output, format="PNG", optimize=True)
    return output.getvalue()

#!/usr/bin/env python3
"""Render docs/RAPPORT.md to docs/RAPPORT.pdf (needs: pip install reportlab markdown)."""
import re
from pathlib import Path

import markdown
from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle, Preformatted)
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "RAPPORT.md"
OUT = ROOT / "docs" / "RAPPORT.pdf"

FONT = "Helvetica"
body = ParagraphStyle("body", fontName=FONT, fontSize=9.6, leading=12.4, spaceAfter=5, alignment=TA_JUSTIFY)
cell = ParagraphStyle("cell", parent=body, fontSize=8.6, leading=10.6, spaceAfter=0, alignment=0)
h1 = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=15, leading=18, spaceAfter=5)
h2 = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=11.5, leading=14, spaceBefore=9, spaceAfter=3,
                    textColor=colors.HexColor("#1f3a5f"))
code = ParagraphStyle("code", fontName="Courier", fontSize=8.2, leading=10.2, leftIndent=6, spaceAfter=4,
                      backColor=colors.HexColor("#f3f4f6"))


def inline(el):
    """Serialize an HTML element's inline content to reportlab mini-markup."""
    out = el.text or ""
    for child in el:
        tag = child.tag
        if tag in ("strong", "b"):
            out += f"<b>{inline(child)}</b>"
        elif tag in ("em", "i"):
            out += f"<i>{inline(child)}</i>"
        elif tag == "code":
            out += f'<font face="Courier" size="8.2">{inline(child)}</font>'
        elif tag == "a":
            out += inline(child)
        else:
            out += inline(child)
        out += child.tail or ""
    return out


def esc_text(el):
    # escape &,<,> in text nodes only; markup tags are added by inline()
    for node in el.iter():
        for attr in ("text", "tail"):
            v = getattr(node, attr)
            if v:
                setattr(node, attr, v.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
    return el


html = markdown.markdown(SRC.read_text(), extensions=["tables", "fenced_code"])
tree = ET.fromstring(f"<root>{html}</root>")

story = []
for el in tree:
    if el.tag == "h1":
        story.append(Paragraph(inline(esc_text(el)), h1))
    elif el.tag == "h2":
        story.append(Paragraph(inline(esc_text(el)), h2))
    elif el.tag == "p":
        story.append(Paragraph(inline(esc_text(el)), body))
    elif el.tag == "pre":
        story.append(Preformatted(el[0].text.rstrip(), code))
    elif el.tag == "ol":
        for i, li in enumerate(el, 1):
            p = ParagraphStyle("li", parent=body, leftIndent=12, firstLineIndent=-9, spaceAfter=2)
            story.append(Paragraph(f"{i}.&nbsp;&nbsp;{inline(esc_text(li))}", p))
        story.append(Spacer(1, 3))
    elif el.tag == "table":
        rows = []
        for tr in el.iter("tr"):
            rows.append([Paragraph(inline(esc_text(td)), cell) for td in tr])
        ncol = len(rows[0])
        width = 180 * mm
        widths = [width * 0.28, width * 0.47, width * 0.25] if ncol == 3 else [width / ncol] * ncol
        t = Table(rows, colWidths=widths, repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8edf3")),
            ("LINEBELOW", (0, 0), (-1, 0), 0.6, colors.HexColor("#1f3a5f")),
            ("LINEBELOW", (0, 1), (-1, -1), 0.25, colors.HexColor("#c8ced6")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(t)
        story.append(Spacer(1, 5))

doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
                        topMargin=13 * mm, bottomMargin=13 * mm,
                        title="Portail locataire — rapport FD_CHALLENGE", author="FD Challenge")
doc.build(story)
print(f"wrote {OUT}")

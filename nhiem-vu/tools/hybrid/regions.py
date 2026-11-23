"""Frozen page raster and OpenCV line regions shared by all engines."""
import re
from datetime import date
import unicodedata

import cv2
import numpy as np
import pymupdf

HEADER = {"number", "date"}
NUMBER = re.compile(r"(?:\bS[ốoôó]\s*[:.]?\s*)?(\d{1,5}(?:\s*/\s*(?:\d{2,4}\s*/\s*)?|\s*-\s*)[A-ZĐ][A-ZĐ0-9đ/–-]{0,35})", re.I)
DATE = re.compile(r"\bng[àaá]y\s*(\d{1,2})\s*th[áaà]ng\s*(\d{1,2})\s*n[ăaâã]m\s*(\d{4})\b", re.I)


def nfc(text):
    return unicodedata.normalize("NFC", " ".join(text.split()))


def field_value(field, text):
    text = nfc(text)
    if field == "number":
        match = NUMBER.search(text)
        return match[1].replace(" ", "").replace("–", "-") if match else None
    if field == "date":
        match = DATE.search(text)
        if match:
            day, month, year = map(int, match.groups())
            try:
                return date(year, month, day).isoformat()
            except ValueError:
                return None
        return None
    return text or None


def lines_in(rgb):
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
    black_count = (binary != 0).sum(axis=1)
    active = black_count >= max(3, int(rgb.shape[1] * .014))
    active = cv2.morphologyEx(active.astype(np.uint8), cv2.MORPH_CLOSE,
                              np.ones((5, 1), dtype=np.uint8)).ravel()
    edges = np.flatnonzero(np.diff(np.r_[0, active, 0]))
    return [(max(0, int(y0)-5), min(rgb.shape[0], int(y1)+5))
            for y0, y1 in zip(edges[::2], edges[1::2]) if 6 <= y1-y0 <= 105]


def prepared_regions(document, manual=None):
    """Manual ROIs are normalized [left, top, right, bottom] and may be multi-page."""
    if document.needs_pass or not 1 <= len(document) <= 300:
        raise ValueError("Unsupported PDF")
    if manual is None:
        manual = [{"field": field, "page": 1, "rect": rect, "split": True}
                  for field, rect in (
                      ("number", [.05, .045, .57, .26]),
                      ("date", [.43, .045, .97, .26]),
                      ("subject", [.10, .20, .90, .35]),
                  )]
    if len(manual) > 120:
        raise ValueError("Too many regions")
    current_page = None
    for item in manual:
        field, page_number = item["field"], item["page"]
        if field not in HEADER | {"subject", "body"} or not 1 <= page_number <= len(document):
            raise ValueError("Invalid ROI field or page")
        left, top, right, bottom = item["rect"]
        if not (0 <= left < right <= 1 and 0 <= top < bottom <= 1):
            raise ValueError("Invalid ROI coordinates")
        if page_number != current_page:
            page = document[page_number - 1]
            if min(page.rect.width, page.rect.height) < 40 or max(page.rect.width, page.rect.height) > 1600:
                raise ValueError("Unsupported page size")
            pix = page.get_pixmap(dpi=180, colorspace=pymupdf.csRGB, alpha=False, annots=False)
            image = np.frombuffer(pix.samples,dtype=np.uint8).reshape(pix.height,pix.width,3)
            current_page = page_number
        h,w = image.shape[:2]
        x0,x1,y0,y1 = int(w*left),int(w*right),int(h*top),int(h*bottom)
        crop = image[y0:y1,x0:x1]
        if not crop.size:
            raise ValueError("Empty ROI")
        ranges = lines_in(crop) if item.get("split") else [(0,len(crop))]
        for low,high in ranges:
            yield field, page_number, [x0/w,(y0+low)/h,x1/w,(y0+high)/h], np.ascontiguousarray(crop[low:high])


def analyze(document, engines, manual=None):
    result = []
    for field, page, rect, rgb in prepared_regions(document, manual):
        # Optional ONNX engines are evidence for targeted fields only.
        texts = {name: recognizer(rgb) for name, recognizer in engines.items()
                 if name == "native" or field in HEADER}
        result.append({"field":field, "page":page, "rect":rect, "engineText":texts})
    return result


def reconcile(regions, engines):
    """Return auditable candidates. Header conflicts and single-engine hits await review."""
    fields = {}
    for field in sorted(HEADER):
        candidates = {}
        for region in regions:
            if region["field"] != field:
                continue
            for name in engines:
                value = field_value(field, region["engineText"].get(name, ""))
                if value:
                    candidates.setdefault(value, []).append({
                        "engine":name,"page":region["page"],"rect":region["rect"]})
        agreed = [value for value, hits in candidates.items()
                  if len({hit["engine"] for hit in hits}) >= 2]
        fields[field] = {"status":"conflict" if len(candidates)>1 else
                         "agreement" if agreed else "review" if candidates else "missing",
                         "value":agreed[0] if len(candidates)==1 and agreed else None,
                         "candidates":candidates}
    return fields

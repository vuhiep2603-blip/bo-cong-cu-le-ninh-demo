"""Experimental geometric first-page line detection and field-specific OCR."""
import re
from datetime import date

import cv2
import numpy as np
import pymupdf

from regions import nfc

NUMBER_LABEL = re.compile(r"^\s*s\s*[ốoóô]\s*[:.]?\s*", re.I)
NUMBER_VALUE = re.compile(r"^([0-9][0-9\s]{0,7})\s*([/\-–])\s*((?:[0-9]{2,4}\s*/\s*)?[A-Za-zĐđ](?:[A-Za-zĐđ0-9/–-]|\s+(?=[A-Za-zĐđ/–-])){1,42})$")
ISSUE_DATE = re.compile(r"\bng[àaá]y\s*([0-9]{1,2})\s*th[áaà]ng\s*([0-9]{1,2})\s*n[ăaâã]m\s*([0-9]{4})\s*[.,]?\s*$", re.I)
TITLE = re.compile(r"^(QUYẾT ĐỊNH|NGHỊ ĐỊNH|NGHỊ QUYẾT|CHỈ THỊ|THÔNG TƯ|THÔNG BÁO|KẾT LUẬN|HƯỚNG DẪN|KẾ HOẠCH|QUY ĐỊNH|BÁO CÁO|CÔNG ĐIỆN)(?:\s*$|\s*[.:])", re.I)
SUBJECT = re.compile(r"^(?:v/v|về việc)\b", re.I)
MARKERS = {"recipients":r"^nơi nhận\s*:", "signature":r"^(?:KT|TM|TL|TUQ)\s*\.", "annex":r"^phụ lục(?:\s|$)"}


def parse_number(text):
    text = nfc(text)
    label = NUMBER_LABEL.match(text)
    code = text[label.end():] if label else text
    match = NUMBER_VALUE.fullmatch(code)
    if not match:
        return None
    digits, delimiter, suffix = match.groups()
    parts = suffix.split()
    # Multi-character words after a completed signature are typical adjacent prose.
    if len(parts)>1 and any(len(part)>1 for part in parts[1:]) and not any(
            "/" in part or "-" in part for part in parts[1:]):
        return None
    digits = digits.replace(" ","")
    if len(digits)>5:
        return None
    suffix = suffix.replace(" ","").replace("–","-")
    delimiter = delimiter.replace("–","-")
    segments = suffix.split("/")
    if any(not re.fullmatch(r"(?:[0-9]{2,4}|[A-Za-zĐđ][A-Za-zĐđ0-9]*(?:-[A-Za-zĐđ0-9]+)*)", segment)
           for segment in segments) or len(segments)>2:
        return None
    return {"value":digits+delimiter+suffix,"serial":digits,"separator":delimiter,
            "qualifier":suffix,"segments":segments,"label":bool(label)}


def parse_date(text):
    text = nfc(text)
    match = ISSUE_DATE.search(text)
    if not match:
        return None
    day, month, year = map(int,match.groups())
    if not 1900<=year<=2199:
        return None
    try:
        return date(year,month,day).isoformat()
    except ValueError:
        return None


def _ranges(mask):
    edges = np.flatnonzero(np.diff(np.r_[0, mask.astype(np.int8), 0]))
    return zip(edges[::2],edges[1::2])


def raster_lines(image, limit=.34):
    h,w = image.shape[:2]
    top = image[:int(h*limit)]
    gray = cv2.cvtColor(top,cv2.COLOR_RGB2GRAY)
    # Geometry can ignore red ink, but the original pixels always go to OCR.
    rgb = top.astype(np.int16)
    red = (rgb[:,:,0]-rgb[:,:,1]>35) & (rgb[:,:,0]-rgb[:,:,2]>30)
    binary = cv2.threshold(gray,0,255,cv2.THRESH_BINARY_INV|cv2.THRESH_OTSU)[1]
    binary[red] = 0
    size = max(2,round(h*.0017))
    rows = (binary!=0).sum(axis=1)>=max(4,int(w*.006))
    rows = cv2.morphologyEx(rows.astype(np.uint8),cv2.MORPH_CLOSE,np.ones((2*size+1,1),np.uint8)).ravel()
    for y0,y1 in _ranges(rows):
        if not .003*h<=y1-y0<=.035*h:
            continue
        columns = (binary[y0:y1]!=0).sum(axis=0)>0
        gap = max(3,round(w*.029))
        glued = cv2.morphologyEx(columns.astype(np.uint8)[None],cv2.MORPH_CLOSE,np.ones((1,2*gap+1),np.uint8)).ravel()
        for x0,x1 in _ranges(glued):
            if x1-x0<.049*w:
                continue
            x0,y_top,x1,y_bottom=max(0,x0-size*2),max(0,y0-size),min(w,x1+size*2),min(h,y1+size)
            yield [x0/w,y_top/h,x1/w,y_bottom/h], image[y_top:y_bottom,x0:x1].copy()


def visible_text(page, rect):
    bounds = pymupdf.Rect(rect[0]*page.rect.width,rect[1]*page.rect.height,
                          rect[2]*page.rect.width,rect[3]*page.rect.height)
    # Glyph streams for overlaid digits can be stored in reverse insertion order.
    words = page.get_text("words",clip=bounds)
    return " ".join(word[4] for word in sorted(words,key=lambda word:word[0]))


def _finish(candidates):
    values = {}
    for item in candidates:
        values.setdefault(item["value"], []).append(item)
    if not values:
        return {"status":"missing","value":None,"candidates":values}
    scores = {value:max(item["rank"] for item in items) for value,items in values.items()}
    highest = max(scores.values())
    winners = [value for value,score in scores.items() if score==highest]
    if len(winners)>1:
        return {"status":"conflict","value":None,"candidates":values}
    return {"status":"review","value":winners[0],"candidates":values}


def inspect(document, native, vietocr=None):
    if document.needs_pass or not 1<=len(document)<=300:
        raise ValueError("Unsupported PDF")
    page = document[0]
    if min(page.rect.width,page.rect.height)<40 or max(page.rect.width,page.rect.height)>1600:
        raise ValueError("Unsupported page size")
    pix = page.get_pixmap(dpi=216,colorspace=pymupdf.csRGB,alpha=False,annots=True)
    image = np.frombuffer(pix.samples,dtype=np.uint8).reshape(pix.height,pix.width,3)
    lines = []
    for rect,rgb in list(raster_lines(image))[:32]:
        typed = visible_text(page,rect) if not page.rotation else ""
        raw = native(rgb)
        evidence = {"native":raw}
        if typed:
            evidence["pdf"] = typed
        lines.append((rect,rgb,evidence))
    title_top = min((rect[1] for rect,_,evidence in lines
                     if any(TITLE.match(nfc(text)) for text in evidence.values())),default=.235)
    title_top = min(.30,max(.14,title_top))
    numbers, dates, regions = [], [], []
    for rect,rgb,evidence in lines:
        left,top,right,bottom = rect
        if any(TITLE.match(nfc(text)) for text in evidence.values()):
            regions.append({"field":"title","page":1,"rect":rect,"engineText":evidence})
        explicit_subject = any(SUBJECT.match(nfc(text)) for text in evidence.values())
        if explicit_subject or (right-left>.22 and title_top+.012<top<title_top+.10):
            regions.append({"field":"subject","page":1,"rect":rect,"engineText":evidence})
        if top>title_top+.012:
            continue
        if top<.045:
            continue
        likely_number = left<.48 and (right<.71 or any(NUMBER_LABEL.match(text) for text in evidence.values()))
        likely_date = right>.50 and (left>.25 or any(parse_date(text) for text in evidence.values()))
        if likely_number:
            # Resolve spatial number/suffix components separately; preserve the first pass.
            for source in ("native","pdf"):
                text = evidence.get(source,"")
                data = parse_number(text)
                if data:
                    rank = (4 if source=="pdf" else 3) if data["label"] else 1
                    numbers.append({**data,"rank":rank,"source":source,"page":1,"rect":rect})
            if hasattr(native,"recognize") and not parse_number(evidence.get("pdf","")) and NUMBER_LABEL.match(evidence["native"]):
                enlarged = cv2.resize(rgb,None,fx=1.6,fy=1.6,interpolation=cv2.INTER_CUBIC)
                contrast = cv2.cvtColor(enlarged,cv2.COLOR_RGB2GRAY)
                contrast = cv2.createCLAHE(clipLimit=2.0,tileGridSize=(8,8)).apply(contrast)
                evidence["native-contrast"] = native.recognize(cv2.cvtColor(contrast,cv2.COLOR_GRAY2RGB),
                    whitelist="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzĐđốôó:/-– ")
                data = parse_number(evidence["native-contrast"])
                if data:
                    rank = 3 if data["label"] else 1
                    numbers.append({**data,"rank":rank,"source":"native-contrast","page":1,"rect":rect})
            regions.append({"field":"number","page":1,"rect":rect,"engineText":evidence})
        if likely_date:
            if vietocr and (top>.075 and (left>.33 or any(re.search(r"ng[àaá]y",text,re.I) for text in evidence.values()))):
                evidence["vietocr"] = vietocr(rgb)
            for name,text in evidence.items():
                value = parse_date(text)
                if value:
                    # A complete PDF line and the date recognizer are primary evidence.
                    rank = 2 if name in ("pdf","vietocr") else 1
                    dates.append({"value":value,"rank":rank,"source":name,"page":1,"rect":rect})
            regions.append({"field":"date","page":1,"rect":rect,"engineText":evidence})
    for index in sorted({0,len(document)-1}):
        page = document[index]
        if page.rotation:
            continue
        for item in page.get_text("blocks",flags=0,sort=True):
            for field,pattern in MARKERS.items():
                if re.match(pattern,item[4].strip(),re.I):
                    rect = [item[0]/page.rect.width,item[1]/page.rect.height,
                            item[2]/page.rect.width,item[3]/page.rect.height]
                    regions.append({"field":field,"page":index+1,"rect":rect,"engineText":{"pdf":item[4].strip()}})
    return {"fields":{"number":_finish(numbers),"date":_finish(dates)},"regions":regions}

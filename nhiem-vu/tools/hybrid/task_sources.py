"""Research-only task candidates from explicit sections in structured PDF text."""
import re
from difflib import SequenceMatcher

import pymupdf

from regions import nfc

CLAUSE = re.compile(r"^(?:(?:Điều|Khoản|Mục)\s+\d+[.:]?|\d{1,2}(?:\.\d{1,2}){0,2}[.)]|[a-zđ]\))\s+", re.I)
ACTION = re.compile(r"\b(?:chủ trì|phối hợp|chịu trách nhiệm|tổ chức thực hiện|rà soát|tham mưu|ủy quyền|(?<!chuyển )giao)\b", re.I)
LABEL = re.compile(r"^\s*(?:cơ quan\s+)?(chủ trì|phối hợp|thời hạn|sản phẩm)\s*:\s*(.+)", re.I)
ASSIGNEE = re.compile(r"^(?:Ủy quyền\s+(.+?)\s+trình\b|(.+?)\s+chịu trách nhiệm\b)", re.I)
KEYS = {"chủ trì":"lead", "phối hợp":"partners", "thời hạn":"deadline", "sản phẩm":"deliverable"}


TABLE_HEADERS = {"nhiệm vụ":"excerpt", "nội dung nhiệm vụ":"excerpt",
                 "cơ quan chủ trì":"lead", "đơn vị chủ trì":"lead", "chủ trì":"lead",
                 "phối hợp":"partners", "cơ quan phối hợp":"partners", "đơn vị phối hợp":"partners",
                 "thời hạn":"deadline", "sản phẩm":"deliverable"}


def annex_rows(page, page_number):
    for table in page.find_tables().tables:
        columns = {i:TABLE_HEADERS.get(nfc(name or "").casefold()) for i,name in enumerate(table.header.names)}
        if "excerpt" not in columns.values():
            continue
        for row, cells in zip(table.rows, table.extract()):
            if row.bbox == table.header.bbox:
                continue
            values, evidence = {}, []
            for i, text in enumerate(cells):
                key, rect = columns.get(i), row.cells[i]
                if not text or not key or not rect or nfc(text).casefold() in TABLE_HEADERS:
                    continue
                values[key] = text
                evidence.append({"page":page_number,"rectPt":list(rect),"text":text})
            if values.get("excerpt"):
                yield {**values,"sources":evidence}, pymupdf.Rect(table.bbox)


def proposals(pdf):
    output = []
    entries = []
    stopped = False
    annex = False
    opinion_list = False

    def flush():
        if entries and ACTION.search(" ".join(item["text"] for item in entries)):
            fields = {}
            for item in entries:
                match = LABEL.match(item["text"])
                if match:
                    fields.setdefault(KEYS[match[1].casefold()],match[2])
            assignee = ASSIGNEE.match(entries[0]["text"])
            if assignee:
                fields.setdefault("lead", assignee[1] or assignee[2])
            output.append({"excerpt":"\n".join(item["text"] for item in entries),
                           "sources":entries.copy(), **fields})
        entries.clear()

    for index, page in enumerate(pdf, 1):
        page_text = page.get_text()
        table_regions = []
        if annex or re.search(r"^\s*Phụ lục\b",page_text,re.I|re.M):
            annex = True
            for proposal, rect in annex_rows(page,index):
                output.append(proposal)
                table_regions.append(rect)
        for block in page.get_text("blocks", flags=0, sort=True):
            if block[6] != 0 or block[1] < page.rect.height * .04 or block[3] > page.rect.height * .96:
                continue
            rect = list(block[:4])
            block_rect = pymupdf.Rect(rect)
            if block_rect.get_area() and any((region & block_rect).get_area() >= .8*block_rect.get_area()
                                             for region in table_regions):
                continue
            if opinion_list:
                flush()
            for raw in block[4].splitlines():
                text = raw.strip()
                if re.match(r"^(Nơi nhận|TM\.|KT\.)",text,re.I):
                    flush()
                    stopped = True
                if re.match(r"^Phụ lục\b",text,re.I):
                    flush()
                    stopped = False
                if stopped:
                    continue
                if re.search(r"có ý kiến như sau\s*:\s*$",text,re.I):
                    flush()
                    opinion_list = True
                    continue
                if opinion_list and re.match(r"^Văn phòng .+ thông báo để",text,re.I):
                    flush()
                    opinion_list = False
                    continue
                if CLAUSE.match(text) or (opinion_list and ASSIGNEE.match(text)):
                    flush()
                elif not entries and not opinion_list:
                    continue
                entries.append({"page":index,"rectPt":rect,"text":text})
    flush()
    return output


def score(expected, predicted):
    pairs = []
    for i, reference in enumerate(expected):
        for j, prediction in enumerate(predicted):
            pages = {item["page"] for item in prediction["sources"]}
            if reference.get("pages") and not pages.intersection(reference["pages"]):
                continue
            similarity = SequenceMatcher(None,nfc(reference["excerpt"]).casefold(),
                                          nfc(prediction["excerpt"]).casefold(),autojunk=False).ratio()
            if similarity >= .85:
                pairs.append((similarity,i,j))
    matches = {}
    matched_predictions = set()
    for _, i, j in sorted(pairs, reverse=True):
        if i not in matches and j not in matched_predictions:
            matches[i] = j
            matched_predictions.add(j)
    tp = len(matches)
    precision = tp / len(predicted) if predicted else None
    recall = tp / len(expected) if expected else None
    fields = {}
    for key in KEYS.values():
        applicable = [i for i, item in enumerate(expected) if key in item]
        if applicable:
            fields[key] = {"exact":sum(i in matches and nfc(expected[i][key]) ==
                                       nfc(predicted[matches[i]].get(key,"")) for i in applicable),
                           "count":len(applicable)}
    return {"tp":tp,"fp":len(predicted)-tp,"fn":len(expected)-tp,
            "precision":precision,"recall":recall,"f1":2*tp/(len(expected)+len(predicted))
            if expected or predicted else None,"fields":fields}

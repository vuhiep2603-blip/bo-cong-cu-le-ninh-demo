"""Independent task lab with clause and table provenance. Never assigns staff."""
import re

import pymupdf

from regions import nfc
from task_sources import proposals as stage3

SCOPE = "agency_directive"
STOP = re.compile(r"^(?:nơi nhận\s*:|[kt]/?t?\.\s+|người ký\s*:|thời gian ký\s*:|email\s*:)",re.I)
CLAUSE = re.compile(r"^(\d{1,2}(?:\.\d{1,2}){0,3}\.|[a-zđ]\)|\(\d{1,2}\))\s+(.+)",re.I)
ACTION = re.compile(r"\b(?:giao|chỉ đạo|triển khai|thực hiện|báo cáo|đề nghị|yêu cầu|rà soát|chủ trì|phối hợp|khẩn trương|hoàn thành|chịu trách nhiệm)\b",re.I)
DEADLINE = re.compile(r"\b(?:trước ngày|chậm nhất(?: vào)? ngày|trong tháng)\s+(?:\d{1,2}(?:\s+tháng\s+|[/.-])\d{1,2}(?:\s+năm\s+|[/.-])\d{4}|\d{1,2}(?:\s+năm\s+|/)\d{4})\b",re.I)
ASSIGNEE = re.compile(r"^(?P<actor>(?:Bộ trưởng|Bộ|Chủ tịch|Ủy ban|Ban|Văn phòng|Sở)\s+.+?)\s+(?:chỉ đạo|khẩn trương|chủ trì|chịu trách nhiệm|tiếp tục|tổ chức)\b",re.I)
ACTOR_HEADING = re.compile(r"^(?:Chủ tịch|Bộ trưởng|Bộ|Ủy ban|Ban|Văn phòng|Sở)\s+[^.;]{4,110}$",re.I)
NOTICE = re.compile(r"^văn phòng .+?\s+(?:xin\s+)?thông báo để",re.I)
ANNEX = re.compile(r"^\s*phụ lục\s+[ivx0-9]+\s*$",re.I|re.M)


def annotate(excerpt,sources,section=None,lead=None):
    text = nfc(excerpt)
    result = {"excerpt":excerpt,"sources":sources,"section":section,"scope":SCOPE,
              "requiresHumanAssignment":True}
    if lead:
        result["lead"] = lead
    result["officeReview"] = ("explicit-office-lead" if lead and
                              re.search(r"\bvăn phòng đảng [uủ][yỷ]\b",nfc(lead),re.I)
                              else "manual-review")
    deadline = DEADLINE.search(text)
    if deadline:
        result["deadline"] = deadline[0]
    return result


def text_tasks(pdf):
    output = []
    current = []
    hierarchy = []
    closed = False
    section = None
    lead_source = None
    parent_heading = None

    def flush():
        if current and ACTION.search(" ".join(item["text"] for item in current)):
            result = annotate("\n".join(item["text"] for item in current),
                              current.copy(),section,lead_source["text"] if lead_source else None)
            if lead_source:
                result["leadSource"] = lead_source
            output.append(result)
        current.clear()

    for index,page in enumerate(pdf,1):
        for block in page.get_text("dict",flags=pymupdf.TEXTFLAGS_TEXT,sort=True)["blocks"]:
            for line in block.get("lines",[]):
                text = "".join(span["text"] for span in line["spans"]).strip()
                if not text or text.isdecimal():
                    continue
                if ANNEX.fullmatch(text) or re.match(r"^Nơi nhận\s*:",text,re.I):
                    closed = True
                    flush()
                if closed or STOP.match(text) or line["bbox"][1]>page.rect.height*.95:
                    continue
                item = {"page":index,"rectPt":list(line["bbox"]),"text":text}
                marker = CLAUSE.match(text)
                if marker:
                    flush()
                    key = marker[1]
                    content = marker[2]
                    explicit = ASSIGNEE.match(content)
                    if key[0].isdigit():
                        hierarchy = [key]
                        parent_heading = ({**item,"text":content}
                                          if not explicit and not ACTION.search(content) and ACTOR_HEADING.fullmatch(content)
                                          else None)
                    lead_source = {**item,"text":explicit["actor"]} if explicit else parent_heading
                    section = "/".join(hierarchy if key[0].isdigit() else [*hierarchy,key])
                    current.append(item)
                elif current:
                    current.append(item)
    flush()
    return output


def annex_tasks(pdf):
    result = []
    schema = None
    previous = None
    for index,page in enumerate(pdf,1):
        heading = ANNEX.search(page.get_text())
        if heading:
            schema,previous = None,None
        for table in page.find_tables().tables if schema or heading else ():
            header = [nfc(value or "").casefold() for value in table.header.names]
            if len(header)<3:
                continue
            # Recognize a numbered table only when its columns have explicit labels.
            if header[0] in {"stt","số tt"} and (
                    header[1] in {"nhiệm vụ","nội dung nhiệm vụ"} or header[1].startswith("kết luận của lãnh đạo")):
                schema = (len(header),header[2] in {"cơ quan chủ trì","đơn vị chủ trì","bộ, cơ quan thực hiện"})
            if not schema or len(header)!=schema[0]:
                continue
            for row,cells in zip(table.rows,table.extract()):
                serial,content = (value.strip() if value else "" for value in cells[:2])
                rect = row.cells[1]
                if not content or not rect or content.casefold()==header[1] and serial.casefold()=="stt":
                    continue
                source = {"page":index,"rectPt":list(rect),"text":content}
                if serial.isdecimal():
                    lead = cells[2] if schema[1] else None
                    previous = annotate(content,[source],serial,lead)
                    result.append(previous)
                elif not serial and previous and previous["sources"][-1]["page"]==index-1 and row.bbox==table.rows[0].bbox:
                    # Only extend a numbered row with the first unnumbered row of the next page.
                    previous["excerpt"]+="\n"+content
                    previous["sources"].append(source)
                    computed = DEADLINE.search(nfc(previous["excerpt"]))
                    if computed:
                        previous["deadline"] = computed[0]
    return result



def opinion_tasks(pdf):
    active = False
    result = []
    lines = []
    lead = None

    def flush():
        if lines and lead:
            item = annotate("\n".join(row["text"] for row in lines),lines.copy(),lead=lead)
            item["leadSource"] = {**lines[0],"text":lead}
            result.append(item)
        lines.clear()

    for index,page in enumerate(pdf,1):
        for block in page.get_text("dict",flags=pymupdf.TEXTFLAGS_TEXT,sort=True)["blocks"]:
            for line in block.get("lines",[]):
                text = "".join(span["text"] for span in line["spans"]).strip()
                if re.search(r"ý kiến như sau\s*:\s*$",text,re.I):
                    active = True
                    continue
                if not active or not text or text.isdecimal():
                    continue
                if NOTICE.match(text) or STOP.match(text):
                    active = False
                    flush()
                    continue
                actor=ASSIGNEE.match(text)
                if actor:
                    flush()
                    lead=actor["actor"]
                elif not lines:
                    continue
                lines.append({"page":index,"rectPt":list(line["bbox"]),"text":text})
    flush()
    return result


def candidates(pdf):
    rows = opinion_tasks(pdf) or text_tasks(pdf)
    if not rows:
        rows = [{**row,"scope":SCOPE,"requiresHumanAssignment":True,"officeReview":"manual-review"} for row in stage3(pdf)]
    rows.extend(annex_tasks(pdf))
    return rows

"""Compare fixed line ROIs and geometric OCR on a frozen, private corpus."""
import argparse
from hashlib import file_digest
import json
from pathlib import Path
import time

import pymupdf

from benchmark import outside_repo
from engines import Native,Viet
from layout import inspect
from regions import field_value, prepared_regions


def overlap(detected, expected):
    left,top,right,bottom=expected
    a,b,c,d=detected
    intersection = max(0,min(c,right)-max(a,left))*max(0,min(d,bottom)-max(b,top))
    area = (right-left)*(bottom-top)
    union = area+(c-a)*(d-b)-intersection
    return intersection/area,intersection/union if union else 0


def category(value, status, expected):
    if status=="conflict":
        return "conflict"
    if not value:
        return "missing"
    return "exact" if value==expected else "wrong"


def baseline(pdf, native, vietocr):
    regions = []
    fields = {}
    for field,_,rect,image in prepared_regions(pdf):
        if field not in ("number","date"):
            continue
        engine = native if field=="number" else vietocr
        value = field_value(field,engine(image))
        fields.setdefault(field,set())
        if value:
            fields[field].add(value)
        regions.append({"field":field,"rect":rect})
    return {"fields":{field:{"value":next(iter(values)) if len(values)==1 else None,
                             "status":"conflict" if len(values)>1 else "review"}
                      for field,values in fields.items()},"regions":regions}


def evaluate(result, truth):
    fields = {}
    for field in ("number","date"):
        entry = result["fields"].get(field,{})
        fields[field] = {"classification":category(entry.get("value"),entry.get("status"),truth[field])}
        expected = truth.get("rects",{}).get(field)
        if expected:
            overlaps = [overlap(r["rect"],expected) for r in result["regions"]
                        if r["field"]==field]
            fields[field]["detected"] = any(coverage>=.70 and iou>=.35 for coverage,iou in overlaps)
            fields[field]["bestIoU"] = max((iou for _,iou in overlaps),default=0.)
    return fields


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input",required=True)
    parser.add_argument("--truth",required=True)
    parser.add_argument("--output",required=True)
    parser.add_argument("--tessdata",required=True)
    parser.add_argument("--tesseract",default="tesseract")
    parser.add_argument("--vietocr",required=True)
    args=parser.parse_args()
    root,truth_path,output=map(outside_repo,(args.input,args.truth,args.output))
    if output==truth_path or output.suffix.lower()!=".json":
        parser.error("Choose a separate JSON output path")
    native=Native(args.tessdata,args.tesseract)
    vietocr=Viet(args.vietocr)
    results=[]
    truth=json.loads(truth_path.read_text(encoding="utf-8-sig"))
    for index,(name,row) in enumerate(truth.items(),1):
        path=(root/name).resolve()
        if path.parent!=root or path.suffix.lower()!=".pdf":
            parser.error(f"Invalid source path at index {index}")
        try:
            if "sha256" in row:
                with path.open("rb") as stream:
                    if file_digest(stream,"sha256").hexdigest()!=row["sha256"]:
                        raise ValueError("Unexpected PDF digest")
            with pymupdf.open(path) as pdf:
                scores={}
                for variant,reader in (("fixed",baseline),("adaptive",inspect)):
                    start=time.perf_counter()
                    scores[variant]={"fields":evaluate(reader(pdf,native,vietocr),row),
                                     "seconds":time.perf_counter()-start}
            results.append({"id":index,**scores})
        except (RuntimeError,OSError,ValueError) as error:
            results.append({"id":index,"error":type(error).__name__})
    output.write_text(json.dumps({"documents":results},indent=2)+"\n",encoding="utf-8")


if __name__=="__main__":
    main()

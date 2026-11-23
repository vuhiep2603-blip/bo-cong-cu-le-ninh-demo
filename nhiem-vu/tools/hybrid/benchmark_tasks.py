"""Score source-verified task annotations without exporting passages or names."""
import argparse
from difflib import SequenceMatcher
from hashlib import file_digest
import json

import pymupdf

from benchmark import outside_repo
from task_layout import candidates
from regions import nfc
from task_sources import match_tasks,proposals,score


def evaluate(expected,predicted,first,last):
    scoped = [row for row in predicted if first<=row["sources"][0]["page"]<=last]
    result = score(expected,scoped)
    metrics = []
    matches = match_tasks(expected,scoped)
    for i,row in enumerate(expected):
        metric = {"id":i+1,"sourcePagesComplete":False,"matchingCharacterCoverage":0.}
        if i in matches:
            predicted = scoped[matches[i]]
            source = nfc(row["excerpt"]).casefold()
            text = nfc(predicted["excerpt"]).casefold()
            sequence = SequenceMatcher(None,source,text,autojunk=False)
            metric["matchingCharacterCoverage"] = sum(block.size for block in sequence.get_matching_blocks()) / max(1,len(source))
            metric["sourcePagesComplete"] = set(row.get("pages",[])) <= {part["page"] for part in predicted["sources"]}
        metrics.append(metric)
    result["completeSourcePages"] = sum(one["sourcePagesComplete"] for one in metrics)
    result["sourceCoverageTotal"] = len(expected)
    result["taskCompleteness"] = metrics
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for option in ("input","truth","output"):
        parser.add_argument("--"+option,required=True)
    args=parser.parse_args()
    root,truth_path,output=map(outside_repo,(args.input,args.truth,args.output))
    if output==truth_path or output.suffix.lower()!=".json":
        parser.error("Choose a separate JSON output path")
    truth=json.loads(truth_path.read_text(encoding="utf-8-sig"))
    data=[]
    for index,(filename,row) in enumerate(truth.items(),1):
        path=(root/filename).resolve()
        if path.parent!=root or path.suffix.lower()!=".pdf":
            parser.error(f"Invalid PDF at index {index}")
        if "sha256" in row:
            with path.open("rb") as stream:
                if file_digest(stream,"sha256").hexdigest()!=row["sha256"]:
                    parser.error(f"Invalid checksum at index {index}")
        with pymupdf.open(path) as pdf:
            a,b=row["pages"]
            data.append({"id":index,"cohort":row["cohort"],"truthCount":len(row["tasks"]),
                         "baseline":evaluate(row["tasks"],proposals(pdf),a,b),
                         "prototype":evaluate(row["tasks"],candidates(pdf),a,b)})
    output.write_text(json.dumps({"documents":data},indent=2)+"\n",encoding="utf-8")


if __name__=="__main__":
    main()

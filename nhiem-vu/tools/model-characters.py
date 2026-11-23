"""Extract the exact PP-OCRv5 recognition alphabet from the local ONNX file."""
import argparse
import json
from pathlib import Path

import onnxruntime as ort

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("model", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
session = ort.InferenceSession(str(args.model), providers=["CPUExecutionProvider"])
alphabet = session.get_modelmeta().custom_metadata_map.get("character")
if not alphabet:
    raise SystemExit("Missing character metadata. Use a compatible RapidOCR Latin PP-OCRv5 model.")
args.output.write_text(json.dumps(alphabet.splitlines(), ensure_ascii=False), encoding="utf-8")

"""Development-only experiment on hand-marked serial digit fields."""
import argparse
import json

import cv2
import numpy as np
import pymupdf

from benchmark import outside_repo
from engines import Native


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    for option in ("input","truth","output","tessdata"):
        cli.add_argument("--"+option,required=True)
    cli.add_argument("--tesseract",default="tesseract")
    args = cli.parse_args()
    folder,manifest,output = map(outside_repo,(args.input,args.truth,args.output))
    if output==manifest or output.suffix.lower()!=".json":
        cli.error("Choose a separate JSON output path")
    engine = Native(args.tessdata,args.tesseract)
    rows = []
    for i,(filename,record) in enumerate(json.loads(manifest.read_text(encoding="utf-8-sig")).items(),1):
        path = (folder/filename).resolve()
        if path.parent!=folder or path.suffix.lower()!=".pdf":
            cli.error(f"Invalid PDF at index {i}")
        with pymupdf.open(path) as pdf:
            page = pdf[0]
            left,top,right,bottom = record["rect"]
            bounds = pymupdf.Rect(left*page.rect.width,top*page.rect.height,
                                  right*page.rect.width,bottom*page.rect.height)
            pix = page.get_pixmap(clip=bounds,dpi=320,colorspace=pymupdf.csRGB,annots=True)
        image = np.frombuffer(pix.samples,dtype=np.uint8).reshape(pix.height,pix.width,3)
        image = cv2.copyMakeBorder(image,10,10,10,10,cv2.BORDER_CONSTANT,value=(255,255,255))
        gray = cv2.cvtColor(image,cv2.COLOR_RGB2GRAY)
        binary = cv2.threshold(gray,0,255,cv2.THRESH_BINARY|cv2.THRESH_OTSU)[1]
        readings = {"original":engine(image),
                    "digits":engine.recognize(image,whitelist="0123456789"),
                    "binarizedDigits":engine.recognize(cv2.cvtColor(binary,cv2.COLOR_GRAY2RGB),
                                                       whitelist="0123456789")}
        rows.append({"id":i,"exact":{key:value==record["serial"] for key,value in readings.items()}})
    output.write_text(json.dumps({"documents":rows},indent=2)+"\n",encoding="utf-8")


if __name__=="__main__":
    main()

"""Offline verification of the portable prototype's provisioned resources."""
from hashlib import file_digest
from pathlib import Path
import platform
import subprocess

FILES = {
    "models/best-int/vie.traineddata":"112f6fd1d04ab4cb0208cad9cada8de214ae33a1e4db3750ffcda69262aef0a8",
    "models/vietocr/vietocr.json":"518345b7672fd36e534fb8ffcf6f6599c687793541259170834789fe2f7dd6e6",
    "models/vietocr/vietocr_decoder.onnx":"73b92cd370563952b345703ecdce84d8374a9f0a7018afee062170efe04f21f5",
    "models/vietocr/vietocr_encoder.onnx":"7375c11ad23d52547a344ec5f53adf89db8302f035ceb3f1e67cff2c04069ae7",
}


def main():
    root = Path(__file__).resolve().parent
    if platform.system()!="Windows" or platform.machine().upper() not in {"AMD64","X86_64"}:
        raise SystemExit("Use the manual guide on other systems. This launcher targets Windows x64.")
    for name in ("pymupdf","cv2","numpy","onnxruntime","psutil"):
        try:
            __import__(name)
        except (ImportError,OSError):
            raise SystemExit(f"Runtime package missing or unavailable: {name}") from None
    for path,expected in FILES.items():
        try:
            with (root/path).open("rb") as stream:
                valid = file_digest(stream,"sha256").hexdigest()==expected
        except OSError:
            valid = False
        if not valid:
            raise SystemExit(f"Missing or incompatible OCR asset: {path}")
    try:
        subprocess.run([str(root/"runtime/tesseract/tesseract.exe"),"--version"],
                       stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10,check=True)
    except (OSError,subprocess.SubprocessError):
        raise SystemExit("Provision and verify the local Tesseract binary.") from None
    print("Offline preflight passed.")


if __name__ == "__main__":
    main()

"""CPU OCR adapters. Files and model URLs are provisioned separately."""
import json
import os
from pathlib import Path
import subprocess

import cv2
import numpy as np


class Native:
    def __init__(self, directory, executable="tesseract"):
        self.directory = Path(directory).resolve()
        if not (self.directory / "vie.traineddata").is_file():
            raise ValueError("Missing local vie.traineddata")
        self.executable = executable

    def __call__(self, rgb):
        return self.recognize(rgb)

    def recognize(self,rgb,*,whitelist=None):
        ok, png = cv2.imencode(".png", cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
        if not ok:
            raise ValueError("PNG encoding failed")
        command = [self.executable, "stdin", "stdout", "--tessdata-dir", str(self.directory),
                   "-l", "vie", "--oem", "1", "--psm", "7"]
        if whitelist:
            command.extend(["-c",f"tessedit_char_whitelist={whitelist}"])
        result = subprocess.run(
            command,
            input=png.tobytes(), capture_output=True, check=True, timeout=20,
            env={**os.environ, "OMP_THREAD_LIMIT": "1"},
        )
        return result.stdout.decode("utf-8").strip()


def session(path):
    import onnxruntime as ort
    ort.set_default_logger_severity(3)
    ort.disable_telemetry_events()
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    return ort.InferenceSession(str(path), sess_options=options, providers=["CPUExecutionProvider"])


class Viet:
    def __init__(self, directory):
        directory = Path(directory)
        self.config = json.loads((directory / "vietocr.json").read_text(encoding="utf-8"))
        self.encoder = session(directory / "vietocr_encoder.onnx")
        self.decoder = session(directory / "vietocr_decoder.onnx")

    def __call__(self, rgb):
        cfg = self.config
        height = cfg["image_height"]
        width = min(cfg["image_max_width"], max(cfg["image_min_width"],
                    10 * round(height * rgb.shape[1] / rgb.shape[0] / 10)))
        image = cv2.resize(rgb, (width, height)).transpose(2, 0, 1)[None].astype(np.float32) / 255
        hidden, memory = self.encoder.run(None, {"image":image})
        token = cfg["sos"]
        text = []
        for _ in range(cfg["max_seq_length"]):
            logits, hidden = self.decoder.run(None, {"tgt":np.array([token], dtype=np.int64),
                                                   "hidden":hidden, "encoder_outputs":memory})
            token = int(logits[0].argmax())
            if token == cfg["eos"]:
                break
            index = token - cfg["offset"]
            if 0 <= index < len(cfg["vocab"]):
                text.append(cfg["vocab"][index])
        return "".join(text)


class PaddleLatin:
    def __init__(self, path):
        self.model = session(path)
        self.alphabet = [""] + self.model.get_modelmeta().custom_metadata_map["character"].splitlines() + [" "]

    def __call__(self, rgb):
        height = 48
        width = min(1920, max(1, int(np.ceil(height * rgb.shape[1] / rgb.shape[0]))))
        image = cv2.resize(rgb, (width, height))[:, :, ::-1].transpose(2, 0, 1)
        tensor = np.zeros((1, 3, height, max(320, width)), dtype=np.float32)
        tensor[0, :, :, :width] = image.astype(np.float32) / 127.5 - 1
        output = self.model.run(None, {self.model.get_inputs()[0].name:tensor})[0][0]
        if output.shape[-1] != len(self.alphabet):
            raise ValueError("Incompatible ONNX alphabet")
        indices = output.argmax(axis=1)
        return "".join(self.alphabet[index] for i, index in enumerate(indices)
                       if index and (not i or index != indices[i - 1]))


def engine_options(parser):
    parser.add_argument("--tessdata", required=True)
    parser.add_argument("--tesseract", default="tesseract")
    parser.add_argument("--vietocr")
    parser.add_argument("--paddle")


def load_engines(args):
    engines = {"native": Native(args.tessdata, args.tesseract)}
    if args.vietocr:
        engines["vietocr"] = Viet(args.vietocr)
    if args.paddle:
        engines["paddle"] = PaddleLatin(args.paddle)
    return engines

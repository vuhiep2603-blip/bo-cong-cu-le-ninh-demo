"""One disposable PDF worker with wall-clock and sampled RSS limits."""
import json
from pathlib import Path
import subprocess
import sys
from threading import Event, Thread

import psutil

DEADLINE = 90
RSS_LIMIT = 1024 * 1024 * 1024


def process_pdf(payload, options):
    worker = Path(__file__).resolve()
    command = [sys.executable,str(worker),*options]
    with subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL) as child:
        root = psutil.Process(child.pid)
        stop = Event()
        limit_exceeded = Event()

        def terminate():
            try:
                descendants = root.children(recursive=True)
                root.kill()
            except psutil.Error:
                return
            for process in descendants:
                try:
                    process.kill()
                except psutil.Error:
                    pass

        def monitor():
            while not stop.wait(.1):
                try:
                    processes = [root,*root.children(recursive=True)]
                    if sum(process.memory_info().rss for process in processes if process.is_running()) > RSS_LIMIT:
                        limit_exceeded.set()
                        terminate()
                        return
                except psutil.NoSuchProcess:
                    continue

        watcher = Thread(target=monitor)
        watcher.start()
        try:
            output, _ = child.communicate(payload, timeout=DEADLINE)
        except subprocess.TimeoutExpired:
            terminate()
            child.communicate()
            raise ValueError("OCR time limit exceeded") from None
        finally:
            stop.set()
            watcher.join()
        if limit_exceeded.is_set() or child.returncode or len(output)>2*1024*1024:
            raise ValueError("OCR worker failed or exceeded its resource limit")
    return json.loads(output)


if __name__ == "__main__":
    import argparse

    import pymupdf

    from engines import engine_options, load_engines
    from layout import inspect
    from regions import analyze, reconcile

    parser = argparse.ArgumentParser(description=__doc__)
    engine_options(parser)
    options = parser.parse_args()
    engines = load_engines(options)
    pymupdf.TOOLS.mupdf_display_errors(False)
    pymupdf.TOOLS.mupdf_display_warnings(False)
    payload = sys.stdin.buffer.read(20*1024*1024+1)
    if len(payload)>20*1024*1024 or not payload.startswith(b"%PDF-"):
        raise ValueError("Unsupported PDF")
    with pymupdf.open(stream=payload,filetype="pdf") as pdf:
        result = inspect(pdf,engines["native"],engines.get("vietocr"))
        if "paddle" in engines:
            regions = analyze(pdf,engines)
            result["legacyComparison"] = {"fields":reconcile(regions,engines),"regions":regions}
    sys.stdout.buffer.write(json.dumps(result,ensure_ascii=False).encode("utf-8"))

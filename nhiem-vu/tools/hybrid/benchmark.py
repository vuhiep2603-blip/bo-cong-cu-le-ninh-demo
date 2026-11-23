"""Run one engine on shared raster regions. Reports contain metrics, never OCR text."""
import argparse
import base64
from hashlib import file_digest
from contextlib import ExitStack, contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
import time
import unicodedata

import cv2
import psutil
import pymupdf

from engines import engine_options, load_engines
from regions import field_value, nfc, prepared_regions
from task_sources import proposals, score


def edit_distance(left, right):
    previous = list(range(len(right)+1))
    for i, a in enumerate(left, 1):
        current = [i]
        for j, b in enumerate(right, 1):
            current.append(min(previous[j]+1, current[-1]+1, previous[j-1]+(a!=b)))
        previous = current
    return previous[-1]


def text_scores(reference, prediction):
    reference, prediction = nfc(reference), nfc(prediction)
    strip = lambda text: "".join(c for c in unicodedata.normalize("NFD", text)
                                  if not unicodedata.combining(c)).replace("đ","d").replace("Đ","D")
    return {"cer": edit_distance(reference,prediction)/max(1,len(reference)),
            "wer": edit_distance(reference.split(),prediction.split())/max(1,len(reference.split())),
            "cerWithoutDiacritics":edit_distance(strip(reference),strip(prediction))/max(1,len(strip(reference)))}


@contextmanager
def resource_monitor():
    root = psutil.Process()
    stop = threading.Event()
    result = {"peakSampledTreeRssBytes":0, "sampledCpuSeconds":0., "intervalMs":50}
    cpu = {}

    def sample():
        processes = [root, *root.children(recursive=True)]
        rss = 0
        for process in processes:
            try:
                rss += process.memory_info().rss
                counters = process.cpu_times()
                cpu[(process.pid,process.create_time())] = counters.user + counters.system
            except psutil.Error:
                pass
        result["peakSampledTreeRssBytes"] = max(rss, result["peakSampledTreeRssBytes"])

    def poll():
        while not stop.wait(.05):
            sample()

    sample()
    initial = sum(cpu.values())
    thread = threading.Thread(target=poll)
    thread.start()
    try:
        yield result
    finally:
        stop.set()
        thread.join()
        sample()
        result["sampledCpuSeconds"] = max(0., sum(cpu.values())-initial)


@contextmanager
def browser_engine(project, channel, executable):
    from playwright.sync_api import sync_playwright
    project = Path(project)
    assets = {
        "/": (None, "text/html"),
        "/tess.js": (project/"node_modules/tesseract.js/dist/tesseract.min.js", "text/javascript"),
        "/worker.js": (project/"node_modules/tesseract.js/dist/worker.min.js", "text/javascript"),
        "/core.js": (project/"node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "text/javascript"),
        "/lang/vie.traineddata.gz": (project/"dist/ocr/lang/vie.traineddata.gz", "application/gzip"),
    }
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            if self.path not in assets:
                return self.send_error(404)
            path, mime = assets[self.path]
            content = path.read_bytes() if path else b'<!doctype html><script src="/tess.js"></script>'
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)

    with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
        origin = f"http://127.0.0.1:{server.server_port}"
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(channel=channel, executable_path=executable,
                                                       args=["--disable-background-networking"])
                context = browser.new_context(service_workers="block")
                context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(origin+"/") else route.abort())
                page = context.new_page()
                page.goto(origin)
                page.evaluate("""async () => {
                  const {createWorker}=window.Tesseract;
                  window.worker=await createWorker('vie',1,{
                    workerPath:location.origin+'/worker.js',corePath:location.origin+'/core.js',
                    langPath:location.origin+'/lang',workerBlobURL:false,cacheMethod:'none'});
                  await worker.setParameters({tessedit_pageseg_mode:'7'});
                }""")

                def recognize(rgb):
                    good, encoded = cv2.imencode(".png",cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR))
                    if not good:
                        raise ValueError("PNG encoding failed")
                    payload = "data:image/png;base64,"+base64.b64encode(encoded.tobytes()).decode()
                    return page.evaluate("async data=>(await worker.recognize(data)).data.text.trim()",payload)
                try:
                    yield recognize
                finally:
                    browser.close()
        finally:
            server.shutdown()
            thread.join()


def benchmark_file(path, truth, recognize):
    start = time.perf_counter()
    candidates = {"number":set(),"date":set()}
    transcriptions = []
    count = 0
    tasks = None
    with pymupdf.open(path) as document:
        rois = truth.get("regions")
        transcript_rois = rois and not any(r.get("split") for r in rois)
        for i, (field, _, _, rgb) in enumerate(prepared_regions(document, rois)):
            recognized = recognize(rgb)
            count += 1
            if field in candidates:
                value = field_value(field,recognized)
                if value:
                    candidates[field].add(value)
            if transcript_rois and "transcript" in rois[i]:
                transcriptions.append(text_scores(rois[i]["transcript"], recognized))
        if "tasks" in truth:
            tasks = score(truth["tasks"], proposals(document))
    metrics = {}
    for field, values in candidates.items():
        if field not in truth:
            continue
        metrics[field] = {"exact": values == {truth[field]},
                          "candidateHit": truth[field] in values,
                          "status": "missing" if not values else "unique" if len(values)==1 else "conflict"}
    return {"seconds":time.perf_counter()-start,"roiCount":count,"fields":metrics,"lineScores":transcriptions,"taskScoresTextLayer":tasks}


def outside_repo(path):
    path = Path(path).resolve()
    if path.is_relative_to(Path(__file__).resolve().parents[3]):
        raise ValueError("Use paths outside the repository")
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    engine_options(parser)
    parser.add_argument("--engine", choices=["native","vietocr","paddle","browser"], required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--truth", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--split", choices=["development","holdout","private"], required=True)
    parser.add_argument("--browser-channel", choices=["chrome","msedge"])
    parser.add_argument("--browser-executable")
    args = parser.parse_args()
    source, truth_path, output = map(outside_repo,(args.input,args.truth,args.output))
    if output.suffix.lower() != ".json" or output == truth_path:
        parser.error("Use a separate .json report path")
    corpus = json.loads(truth_path.read_text(encoding="utf-8-sig"))
    results = []
    with resource_monitor() as resources, ExitStack() as stack:
        start = time.perf_counter()
        if args.engine == "browser":
            recognize = stack.enter_context(browser_engine(Path(__file__).resolve().parents[2],
                                                            args.browser_channel,args.browser_executable))
        else:
            if args.engine != "vietocr":
                args.vietocr = None
            if args.engine != "paddle":
                args.paddle = None
            recognize = load_engines(args)[args.engine]
        setup = time.perf_counter()-start
        for index, (name, truth) in enumerate(corpus.items(),1):
            if truth["split"] != args.split:
                continue
            path = (source/name).resolve()
            if path.parent != source or path.suffix.lower() != ".pdf":
                raise ValueError(f"Invalid corpus path at index {index}")
            try:
                if "sha256" in truth:
                    with path.open("rb") as file:
                        if file_digest(file,"sha256").hexdigest() != truth["sha256"]:
                            raise ValueError("Checksum mismatch")
                results.append({"id":index,**benchmark_file(path,truth,recognize)})
            except Exception as error:
                results.append({"id":index,"error":type(error).__name__})
    report = {"engine":args.engine,"split":args.split,"initializationSeconds":setup,
              "resources":resources,"documents":results}
    output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")


if __name__ == "__main__":
    main()

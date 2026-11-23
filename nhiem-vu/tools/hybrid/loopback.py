"""Experimental local browser companion. No production endpoints or CORS."""
import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
import secrets
import webbrowser
from subprocess import SubprocessError

import pymupdf

from engines import engine_options
from isolated import process_pdf
from regions import analyze, reconcile

HOST = "127.0.0.1"
MAX_BYTES = 20 * 1024 * 1024
ROOT = Path(__file__).resolve().parent
CSP = "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        self.request.settimeout(10)
        super().setup()

    def log_message(self, *args):
        pass

    def reply(self, code, body=b"", content_type="text/plain; charset=utf-8"):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        self.wfile.write(body)

    def trusted_host(self):
        return self.headers.get_all("Host") == [self.server.authority]

    def do_GET(self):
        if not self.trusted_host() or self.headers.get("Sec-Fetch-Site") not in (None, "none", "same-origin"):
            return self.reply(403)
        assets = {"/":("companion.html", "text/html; charset=utf-8"),
                  "/companion.js":("companion.js", "text/javascript; charset=utf-8")}
        if self.path not in assets:
            return self.reply(404)
        name, content_type = assets[self.path]
        self.reply(200, (ROOT / name).read_bytes(), content_type)

    def do_POST(self):
        if (not self.trusted_host() or self.headers.get_all("Origin") != [self.server.origin]
                or self.headers.get("Sec-Fetch-Site") not in (None, "same-origin")):
            return self.reply(403)
        if self.path != "/recognize":
            return self.reply(404)
        expected = f"Bearer {self.server.token}"
        if not secrets.compare_digest(self.headers.get("Authorization", "").encode("utf-8"), expected.encode("ascii")):
            return self.reply(401)
        lengths = self.headers.get_all("Content-Length") or []
        if (self.headers.get("Transfer-Encoding") or len(lengths) != 1
                or not lengths[0].isascii() or not lengths[0].isdigit() or len(lengths[0]) > 10):
            return self.reply(400)
        size = int(lengths[0])
        if not 5 <= size <= MAX_BYTES:
            return self.reply(413)
        if self.headers.get_all("Content-Type") != ["application/pdf"]:
            return self.reply(415)
        try:
            data = self.rfile.read(size)
            if len(data) != size or not data.startswith(b"%PDF-"):
                return self.reply(400)
            payload = self.server.recognize(data)
            self.reply(200, json.dumps(payload, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")
        except (ConnectionError, TimeoutError):
            self.close_connection = True
        except (ValueError, RuntimeError, OSError, SubprocessError):
            self.reply(422, b"Cannot process document")


class Server(HTTPServer):
    def __init__(self, engines=None, *, recognize=None):
        pymupdf.TOOLS.mupdf_display_errors(False)
        pymupdf.TOOLS.mupdf_display_warnings(False)
        super().__init__((HOST, 0), Handler)
        self.authority = f"{HOST}:{self.server_port}"
        self.origin = f"http://{self.authority}"
        self.token = secrets.token_urlsafe(32)
        if recognize is None:
            def recognize(data):
                with pymupdf.open(stream=data, filetype="pdf") as pdf:
                    regions = analyze(pdf, engines)
                    return {"fields":reconcile(regions, engines), "regions":regions}
        self.recognize = recognize

    def handle_error(self, request, client_address):
        pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    engine_options(parser)
    parser.add_argument("--open",action="store_true")
    args = parser.parse_args()
    options = []
    for key in ("tessdata","tesseract","vietocr","paddle"):
        value = getattr(args,key)
        if value:
            options.extend(["--"+key,value])
    with Server(recognize=lambda data:process_pdf(data,options)) as server:
        url = f"{server.origin}/#{server.token}"
        print(f"Open locally (session URL): {url}",flush=True)
        if args.open:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass

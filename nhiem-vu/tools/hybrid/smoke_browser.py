"""Exercise the real companion in Chrome/Edge using a local public test PDF."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

from engines import engine_options


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    engine_options(parser)
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--expected-number")
    parser.add_argument("--channel", choices=["chrome","msedge"])
    parser.add_argument("--executable")
    args = parser.parse_args()
    command = [sys.executable,str(Path(__file__).with_name("loopback.py"))]
    for option in ("tessdata","tesseract","vietocr","paddle"):
        value = getattr(args,option)
        if value:
            command.extend(["--"+option,value])
    with subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) as server:
        try:
            banner = server.stdout.readline().split()
            if not banner:
                raise RuntimeError("Companion did not start")
            url = banner[-1]
            parts = urlsplit(url)
            origin = f"{parts.scheme}://{parts.netloc}"
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(channel=args.channel,executable_path=args.executable)
                context = browser.new_context(service_workers="block")
                context.route("**/*",lambda route: route.continue_() if route.request.url.startswith(origin+"/") else route.abort())
                page = context.new_page()
                requests = []
                page.on("request",lambda request:requests.append(request.url))
                page.goto(url)
                expect(page.locator("button")).to_be_enabled()
                page.set_input_files("input[type=file]",args.pdf)
                page.click("button")
                expect(page.locator("#status")).to_contain_text("Đã đọc vùng đầu trang.",timeout=120_000)
                if args.expected_number:
                    result = json.loads(page.locator("#result").inner_text())
                    assert args.expected_number in result["fields"]["number"]["candidates"]
                assert "#" not in page.url
                assert requests and all(request.startswith(origin+"/") for request in requests)
                assert page.evaluate("localStorage.length + sessionStorage.length") == 0
                browser.close()
        finally:
            server.terminate()
            stdout, stderr = server.communicate(timeout=5)
            startup_diagnostics = ("Failed to persist telemetry device ID",)
            other_diagnostics = [line for line in stderr.splitlines()
                                 if not any(item in line for item in startup_diagnostics)]
            assert not stdout and not other_diagnostics, "Unexpected companion log output"
    print("Companion browser smoke passed")


if __name__ == "__main__":
    main()

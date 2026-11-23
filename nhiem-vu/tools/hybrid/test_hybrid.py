import http.client
import json
import threading
import unittest

import pymupdf

from benchmark import text_scores
from loopback import MAX_BYTES, Server
from layout import parse_date, parse_number, raster_lines
from task_layout import candidates
import cv2
import numpy as np
from regions import field_value, reconcile
from task_sources import proposals, score


class HybridTest(unittest.TestCase):
    def test_field_evidence(self):
        self.assertEqual(field_value("number","Số: 12 / 2025 / NĐ-CP"),"12/2025/NĐ-CP")
        self.assertIsNone(field_value("date","ngày 29 tháng 2 năm 2025"))
        self.assertEqual(field_value("date","ngày 29 tháng 2 năm 2024"),"2024-02-29")
        region = {"page":1,"rect":[0,0,.5,.5],"engineText":{"one":"Số: 12/AB","two":"Số: 12/AB"},"field":"number"}
        self.assertEqual(reconcile([region],["one","two"])["number"]["value"],"12/AB")
        self.assertEqual(reconcile([region],["one"])["number"]["status"],"review")
        region["engineText"]["two"] = "Số: 13/AB"
        self.assertEqual(reconcile([region],["one","two"])["number"]["status"],"conflict")

    def test_scores(self):
        self.assertEqual(text_scores("Lệ Ninh", "Le Ninh")["cerWithoutDiacritics"],0)
        with pymupdf.open() as pdf:
            page = pdf.new_page()
            page.insert_text((80,120),"1. giao co quan tong hop.")
            page.insert_text((80,140),"Bo sung trich dan.")
            items = proposals(pdf)
        self.assertEqual(items[0]["sources"][0]["page"],1)
        result = score([{"excerpt":"1. giao co quan tong hop. Bo sung trich dan.","pages":[1]}],items)
        self.assertEqual(result["f1"],1)

    def test_geometric_columns_and_strict_number(self):
        image = np.full((1000, 800, 3),255,dtype=np.uint8)
        cv2.rectangle(image,(95,120),(265,135),(0,0,0),-1)
        cv2.rectangle(image,(440,120),(725,135),(0,0,0),-1)
        lines = list(raster_lines(image))
        self.assertEqual(len(lines),2)
        self.assertLess(lines[0][0][2],lines[1][0][0])
        self.assertEqual(parse_number("S ố : 84 - KH/BTCTW")["serial"],"84")
        self.assertIsNone(parse_number("Số: 658-QĐ/TW thêm chữ"))
        self.assertIsNone(parse_date("Hà Nội, ngày 43 tháng 11 năm 2026"))

    def test_widget_appearance_is_separate_from_page_body(self):
        with pymupdf.open() as pdf:
            page = pdf.new_page()
            widget = pymupdf.Widget()
            widget.field_name = "overlay"
            widget.field_type = pymupdf.PDF_WIDGET_TYPE_TEXT
            widget.field_value = "114"
            widget.rect = pymupdf.Rect(76,100,104,117)
            page.add_widget(widget)
            off = page.get_pixmap(annots=False)
            on = page.get_pixmap(annots=True)
            self.assertNotEqual(off.samples,on.samples)

    def test_task_continuation_records_both_pages(self):
        with pymupdf.open() as pdf:
            page = pdf.new_page()
            page.insert_text((70,100),"1. Bao cao va giao co quan.")
            pdf.new_page().insert_text((70,100),"Hoan thien theo de an.")
            tasks = candidates(pdf)
            self.assertEqual({s["page"] for s in tasks[0]["sources"]},{1,2})
            self.assertTrue(tasks[0]["requiresHumanAssignment"])

    def test_loopback_guards_and_success(self):
        with pymupdf.open() as pdf:
            page = pdf.new_page()
            page.insert_text((80,120),"So: 12/AB")
            payload = pdf.tobytes()
        with Server({"native": lambda _: "So: 12/AB"}) as server:
            self.assertEqual(server.server_address[0],"127.0.0.1")
            runner = threading.Thread(target=server.serve_forever)
            runner.start()
            self.addCleanup(runner.join)
            try:
                headers = {"Origin":server.origin,"Authorization":f"Bearer {server.token}",
                           "Content-Type":"application/pdf"}

                def call(changes=None, method="POST", body=payload):
                    with_connection = http.client.HTTPConnection("127.0.0.1",server.server_port,timeout=3)
                    try:
                        with_connection.request(method,"/recognize",body,{**headers,**(changes or {})})
                        response = with_connection.getresponse()
                        return response.status, dict(response.getheaders()), response.read()
                    finally:
                        with_connection.close()

                self.assertEqual(call({"Origin":"https://example.com"})[0],403)
                self.assertEqual(call({"Host":"example.com"})[0],403)
                self.assertEqual(call({"Sec-Fetch-Site":"cross-site"})[0],403)
                self.assertEqual(call({"Authorization":"Bearer wrong"})[0],401)
                self.assertEqual(call({"Content-Length":str(MAX_BYTES+1)})[0],413)
                self.assertEqual(call({"Content-Type":"text/plain"})[0],415)
                self.assertEqual(call(body=b"wrong body")[0],400)
                code, response_headers, result = call()
                self.assertEqual(code,200)
                self.assertEqual(response_headers["Cache-Control"],"no-store")
                self.assertNotIn("Access-Control-Allow-Origin",response_headers)
                self.assertEqual(json.loads(result)["fields"]["number"]["status"],"review")
            finally:
                server.shutdown()


if __name__ == "__main__":
    unittest.main()

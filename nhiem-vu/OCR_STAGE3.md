# OCR giai đoạn 3 — prototype cục bộ

Bản thử nằm trong `tools/hybrid/`, xuất phát từ `a8b8dd2` của PR #5. Trang web đang dùng Tesseract.js như giai đoạn 2. Prototype có trang thử độc lập, không có mã tích hợp production và không cần Firebase.

## Kiến trúc và phạm vi

1. Trình duyệt mở URL phiên do tiến trình cục bộ tạo. Người thử tự chọn lại PDF trên trang thử. PDF đi qua HTTP đến đúng `127.0.0.1`, cổng hệ điều hành cấp ngẫu nhiên. Cookie và CORS không được dùng. Hồ sơ website chính có thể tiếp tục đọc bằng OCR trình duyệt dù chương trình cục bộ đang tắt.
2. PyMuPDF kết xuất ảnh RGB 180 DPI. OpenCV phân hàng theo mật độ pixel hoặc dùng các ROI đã khoanh. Engine nhận **cùng ảnh đầu vào**. Một ROI có trường, trang và tọa độ chuẩn hóa. Vùng tự tìm lấy theo phần đầu trang; đọc lệch cột, lịch sử viện dẫn hoặc vùng đóng dấu vẫn có thể tạo ứng viên sai.
3. Chạy Tesseract native một luồng, tùy chọn VietOCR VGG Seq2Seq và recognizer Latin PP-OCRv5 qua ONNX Runtime CPU. Phiên ONNX được dùng lại và companion chỉ gọi ONNX ở vùng số/ngày. Chương trình giữ nguyên các ứng viên riêng, báo xung đột và chỉ đưa giá trị đối chiếu khi các engine đồng thuận trên một ứng viên duy nhất. Đồng thuận vẫn phải được người đọc xác minh. Giá trị thiếu không được suy ra từ tên, ngày ký số hoặc nhãn benchmark.
4. Lab tác vụ đọc riêng lớp chữ PDF, phân nhóm điều/khoản/điểm và danh sách giao việc có câu dẫn. Bảng phụ lục thử phát hiện bằng `find_tables`, chỉ nhận hàng có cột nhiệm vụ và tiêu đề cột đã xác định; ô gộp thiếu tọa độ để trống. Đề xuất giữ đoạn trích, trang, tọa độ, và các trường có căn cứ rõ. Lab không tạo dữ liệu nhiệm vụ, không dùng mô hình tạo sinh. Scan mất lớp chữ, ô gộp qua trang và cấu trúc nhiều cột chưa có nghiệm thu.
5. Nếu có bằng chứng và phê duyệt ở giai đoạn sau, website có thể cung cấp liên kết mở companion và nhập kết quả tường minh sau khi ADMIN xác minh. Giữ nguyên fallback OCR trình duyệt. Nếu cần tích hợp trực tiếp, ưu tiên ứng dụng desktop có cầu nối cục bộ bị giới hạn hoặc đăng ký pairing tường minh và rà soát riêng Local Network Access trên Chrome/Edge. Tránh mở CORS cho cả hostname GitHub Pages dùng chung giữa các dự án.

## Khảo sát, giấy phép và quyết định

| Công nghệ | Đã áp dụng hoặc đánh giá | Giấy phép và điều kiện |
| --- | --- | --- |
| [Tesseract native](https://github.com/tesseract-ocr/tesseract), [tessdata_best](https://github.com/tesseract-ocr/tessdata_best), [vie best-int](https://github.com/naptha/tessdata) | Đọc vùng một dòng; đo cả best và best-int để tách ảnh hưởng trọng số khỏi runtime | Apache-2.0; giữ NOTICE và giấy phép theo bản phân phối |
| [VietOCR](https://github.com/pbcquoc/vietocr), [bản export ONNX ocr-v1](https://github.com/duchoa1297/vietocr-onnx/releases/tag/ocr-v1) | Dùng encoder/decoder CPU cho dòng tiếng Việt và vùng ngày | Các kho công bố Apache-2.0. Trước khi đóng gói, xác minh điều khoản checkpoint và nguồn huấn luyện, ghi manifest có SHA-256 |
| [RapidOCR](https://github.com/RapidAI/RapidOCR), [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) | Recognizer Latin PP-OCRv5 chạy ONNX CPU. Benchmark dùng OpenCV định vùng chung, không chạy detector riêng | Apache-2.0 ở mã nguồn. Kiểm tra giấy phép tệp ONNX cụ thể trước khi phân phối |
| [OpenCV](https://github.com/opencv/opencv), [ONNX Runtime](https://github.com/microsoft/onnxruntime) | Phân dòng, crop và inference CPU, không tải model trong lúc nhận dạng | OpenCV Apache-2.0, ONNX Runtime MIT; kèm notices phụ thuộc |
| [PyMuPDF](https://github.com/pymupdf/PyMuPDF) | Raster PDF, tham chiếu nguồn và bảng có lớp chữ | AGPL-3.0 hoặc thương mại. Lab dùng để thử; cần chọn cách phân phối phù hợp hoặc đánh giá [PDFium](https://pdfium.googlesource.com/pdfium/) trước khi phát hành bộ cài |
| [OCRmyPDF](https://github.com/ocrmypdf/OCRmyPDF) | Ứng viên deskew/tạo bản tra cứu dẫn xuất. Để ngoài prototype vì cần chuỗi phụ thuộc riêng và có thể làm mất hiệu lực chữ ký của bản PDF đầu ra | MPL-2.0, cần rà riêng Ghostscript/qpdf và bản phân phối Windows |
| [TrOCR handwritten](https://huggingface.co/microsoft/trocr-base-handwritten), [VietOCR](https://github.com/pbcquoc/vietocr) | Phương án thử trên số/ngày viết tay có vùng gán nhãn. TrOCR model card báo tinh chỉnh trên IAM tiếng Anh; kho VietOCR chủ yếu dùng dữ liệu tiếng Việt in. Chưa có số đo đủ để chọn checkpoint viết tay | Kiểm tra model card và license theo checkpoint. Giữ tập viết tay, mực đè và scan mờ riêng; không dùng dữ liệu hành chính nội bộ để huấn luyện thử |

## Chạy thử trên Windows 10/11 (x64)

Đây là hướng dẫn môi trường thử nghiệm cá nhân được phê duyệt, không phải bộ cài. Mức khởi điểm đề xuất là CPU x64 4 luồng, RAM 8 GiB và 2 GiB trống cho Python, gói và model. Cấu hình tối thiểu thực tế còn phải đo trên Windows. Dùng Python 3.12 x64, Tesseract 5 và Chrome/Edge bản ổn định. Kiểm tra sẵn wheel trên Windows trước khi cài vào venv. Phụ thuộc ghi trong `requirements.txt` là bộ đã đo trên Linux. Đã xác nhận PyPI có wheel Windows x64/CPython 3.12 cho sáu gói trực tiếp; chưa cài và chạy trên Windows.

Chuẩn bị model bên ngoài Git khi có Internet, kiểm tra SHA-256 trước khi xử lý tài liệu. Có thể ngắt kết nối Internet sau khi tải. Native CPU cần file `vie.traineddata` từ [tessdata_best](https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/main/vie.traineddata), SHA-256 `b6b49293d95d0b6dbd8780174627e82c75be957b6f4ed9862155540d6b00bb45`; hoặc giải nén `dist/ocr/lang/vie.traineddata.gz` bằng Python gzip để có trọng số best-int khớp frontend, SHA-256 `112f6fd1d04ab4cb0208cad9cada8de214ae33a1e4db3750ffcda69262aef0a8`. Hai VietOCR ONNX và tệp cấu hình lấy tại [release ocr-v1 và checksum](https://github.com/duchoa1297/vietocr-onnx/releases/tag/ocr-v1). Model Latin lấy ở [RapidOCR v3.10.0](https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.10.0/onnx/PP-OCRv5/rec/latin_PP-OCRv5_rec_mobile.onnx), SHA-256 `b20bd37c168a570f583afbc8cd7925603890efbcdc000a59e22c269d160b5f5a`. Native best khoảng 12,44 MB; best-int 1,60 MB thô và 1,42 MB nén; VietOCR 89,46 MB; PP-OCRv5 Latin 7,90 MB, tính riêng trọng số.

Từ `nhiem-vu/`, chạy PowerShell với PDF, model và báo cáo ở ngoài repo.

```powershell
py -3.12 -m venv D:\vpdu-qa\venv
$Python = 'D:\vpdu-qa\venv\Scripts\python.exe'
& $Python -m pip install -r tools/hybrid/requirements.txt
$Native = 'C:\Program Files\Tesseract-OCR\tesseract.exe'
$Best = 'D:\vpdu-qa\best'
$Viet = 'D:\vpdu-qa\vietocr'
$Latin = 'D:\vpdu-qa\latin_PP-OCRv5_rec_mobile.onnx'
& $Python -m unittest discover -s tools/hybrid -v
& $Python tools/hybrid/loopback.py --tesseract $Native --tessdata $Best --vietocr $Viet --paddle $Latin
```

Mở URL phiên được in trong terminal, chọn PDF công khai để thử trước, kiểm tra kết quả và dừng tiến trình bằng Ctrl+C. Giữ URL phiên riêng, không chia sẻ và không ghi vào báo cáo. Chạy smoke test tự động cho từng `chrome` và `msedge`.

```powershell
& $Python tools/hybrid/smoke_browser.py --channel chrome --pdf D:\vpdu-qa\public\public-04.pdf --expected-number '415/2026/NĐ-CP' --tessdata $Best --tesseract $Native
```

## Chạy benchmark trên tập công khai và bảy tệp riêng

- Manifest `tools/hybrid/public-corpus.json` ghi nguồn PDF công khai và SHA-256, gồm 22 văn bản Nhà nước và 8 văn bản Đảng. Chia *development* 9 và *holdout* 21 trước khi chạy engine. Nhãn số/ngày từ metadata công bố; cần kiểm thủ công ảnh ở mọi trường hợp lệch trước khi dùng làm bộ nghiệm thu. Tập có scan và PDF có lớp chữ, nhiều bản cùng kiểu quyết định; chữ viết tay thuần và mực đè chưa có phân tầng được gán nhãn. `public-line-truth.json` có 15 dòng tham chiếu từ năm PDF riêng, gồm PDF chèn chữ số; `public-task-truth.json` là mẫu phát triển nhiệm vụ.
- Tải các PDF công khai trong manifest vào thư mục ngoài Git. Benchmark tự kiểm tra SHA-256 khi manifest có trường này. Sao chép manifest ra ngoài Git. Tệp riêng dùng cùng định dạng và `"split": "private"`. Trường `regions` tùy chọn nhận phần tử `{"field":"date","page":1,"rect":[0.48,0.11,0.87,0.15],"transcript":"Hà Nội, ngày 19 tháng 11 năm 2026"}`. Tọa độ là `[trái,trên,phải,dưới]` theo tỷ lệ trang. Dùng `number`, `date` (ISO), `subject` hoặc `body` làm tên vùng. Chấm CER/WER trên chính vùng đã chép lời. `tasks` gồm các đoạn `excerpt` và `pages` đã xác minh, có thể kèm `lead`, `partners`, `deadline`, `deliverable`.
- Chạy lần lượt từng engine trong tiến trình mới để đo riêng RAM/CPU. Dùng `--split development` trước khi xem holdout; chạy `--split holdout` mà giữ nguyên vùng và tham số. Tách thư mục báo cáo riêng khỏi Git. Công cụ báo số thứ tự theo thứ tự mục trong manifest, không lưu văn bản OCR, tên tệp hay đường dẫn. Không dùng CI, portal, lưu trữ đám mây hoặc OCR API cho bảy tài liệu thật.

```powershell
npm ci
npm run build
& $Python tools/hybrid/benchmark.py --input D:\vpdu-qa\public --truth D:\vpdu-qa\corpus.json --output D:\vpdu-qa\edge-holdout.json --engine browser --browser-channel msedge --split holdout --tessdata $Best
& $Python tools/hybrid/benchmark.py --input D:\vpdu-qa\private --truth D:\vpdu-qa\private-truth.json --output D:\vpdu-qa\private-viet.json --engine vietocr --split private --tessdata $Best --vietocr $Viet
```

Lặp lại bằng Chrome, `--engine native --tesseract $Native`, hoặc `--engine paddle --paddle $Latin`. Phép đo browser dùng worker và mô hình sản phẩm trên chính ảnh crop, với PSM 7 như native, nên kiểm soát được đầu vào. Quy trình web đầy đủ vẫn cần kiểm riêng qua benchmark giai đoạn 2. Thước đo số/ngày đòi ứng viên duy nhất khớp nhãn. CER, WER và CER bỏ dấu dùng edit distance NFC; khoảng chênh CER giúp nhận biết lỗi dấu, không đồng nhất với một phép đo dấu riêng. Nhiệm vụ ghép một-đối-một, tương đồng ký tự ít nhất 0,85 và trùng ít nhất một trang nếu có nhãn. CPU và peak RSS cộng cây tiến trình mỗi 50 ms, có thể tính lặp trang nhớ dùng chung hoặc bỏ lỡ process quá ngắn. Báo cáo QA đầy đủ cần ghi CPU, RAM và phiên bản Windows/Chrome/Edge.

## Bảo mật, đóng gói và rollback

- Tiến trình chỉ bind `127.0.0.1`, kiểm tra chính xác Host, Origin, token phiên ngẫu nhiên và loại dữ liệu. Giới hạn PDF 20 MiB và kích thước raster, xử lý một yêu cầu mỗi lần. Token nằm trong URL fragment, được xóa khỏi thanh địa chỉ và chỉ giữ trong bộ nhớ JavaScript. Từ chối truy cập chéo origin; response có CSP và `no-store`.
- PDF, raster và OCR nằm trong bộ nhớ. Tesseract đọc PNG qua stdin, trả stdout. Chương trình không tạo bản sao PDF trên đĩa và tắt access/error log. Tiến trình Python, trang trình duyệt và bộ nhớ OS có thể giữ dữ liệu tới khi thoát; không bảo đảm xóa an toàn swap/crash dump. Phiên bản thử chạy tài khoản thường, chỉ dùng PDF tin cậy. Trước khi cho phép tài liệu không tin cậy, cô lập bộ giải mã PDF/OCR trong worker có deadline và quota RAM, chặn egress ở cấp hệ điều hành và rà thư viện/native binaries.
- Khi có phê duyệt và kết quả trên Windows, đánh giá gói MSIX ký số hoặc ZIP portable có chữ ký từ tổ chức, chứa runtime, SBOM, manifest SHA-256 và license từng artifact; tách model khỏi mã. Chỉ cập nhật thủ công giữa các phiên theo manifest đã ký, lưu một phiên bản trước để rollback. Không chạy nền khi đăng nhập Windows. Bản lỗi thì dừng tiến trình và quay lại bản đã kiểm chứng hoặc dùng OCR trình duyệt. Hiện chưa có installer, cập nhật tự động hoặc đăng ký dịch vụ.

## Kết quả đo

Đo trên Linux x86-64, Chromium 156, Tesseract native 5.5, CPU AMD EPYC và ONNX Runtime 1.32. Giai đoạn này so cùng vùng RGB đã kết xuất, không đo tốc độ giao diện web đầu-cuối. Thời gian gồm kết xuất trang đầu, phân vùng và nhận dạng, chưa gồm khởi tạo. RAM/CPU mang tính tham khảo trên máy dùng chung. Hai tập dùng cùng một bộ trích ứng viên và đối chiếu theo ISO; không chọn tham số sau khi xem số đo holdout.

| Engine | Số đúng dev / holdout | Ngày đúng dev / holdout | Giây/PDF holdout (trung vị) | RSS đỉnh holdout (MiB) | CPU holdout (giây, 21 PDF) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Tesseract.js best-int (Chromium) | 6/9 · 8/21 | 3/9 · 5/21 | 5.89 | 1144 | 130.6 |
| Tesseract native best-int | 7/9 · 8/21 | 2/9 · 4/21 | 2.22 | 405 | 35.3 |
| Tesseract native tessdata_best | 7/9 · 7/21 | 2/9 · 5/21 | 2.72 | 429 | 46.7 |
| VietOCR ONNX | 1/9 · 7/21 | 9/9 · 15/21 | 3.84 | 519 | 84.6 |
| PP-OCRv5 Latin ONNX | 0/9 · 0/21 | 0/9 · 0/21 | 1.36 | 482 | 31.1 |


### Dòng khoanh thủ công

Dùng 12 dòng holdout từ bốn PDF và ba dòng development từ một PDF thứ năm. Bảng dùng giá trị trung bình theo dòng trên holdout của số, ngày và một dòng trích yếu mỗi văn bản. Bộ này có mẫu chữ số chèn rời; chưa đại diện văn bản viết tay, phụ lục hoặc toàn nội dung.

| Engine | CER | WER | CER bỏ dấu |
| --- | ---: | ---: | ---: |
| Tesseract.js best-int (Chromium) | 5.29% | 16.15% | 5.17% |
| Tesseract native tessdata_best | 5.61% | 20.31% | 5.49% |
| VietOCR ONNX | 11.70% | 54.37% | 10.48% |
| PP-OCRv5 Latin ONNX | 13.63% | 59.60% | 7.02% |


### Kết luận kỹ thuật

VietOCR đọc ngày đúng **15/21**, so với **5/21** của worker trình duyệt. Số/ký hiệu vẫn khó. Native best-int đúng **8/21** và browser đúng **8/21**. Khi ghép theo lựa chọn từ tập phát triển (native best-int cho số, VietOCR cho ngày), đúng cả hai trường ở **8/21**, so với **4/21** của worker trình duyệt chạy cùng ROI. Đây là phép ghép kết quả đã đo; companion thực tế vẫn giữ ứng viên để người đọc đối chiếu. Chưa có số đo cho một end-to-end hybrid đã tích hợp website. PP-OCRv5 Latin bỏ ký tự và dấu trong nhiều dòng, nên loại khỏi phương án ưu tiên.

Lab tác vụ trên một công văn phát triển 11857/VPCP-KGVX đọc đủ 2 nhiệm vụ có đối chiếu trang 1, 0 đề xuất thừa, 0 bỏ sót, đúng hai trường chủ trì. Precision/recall/F1 đều 1,00 trên đúng hai nhãn đó; chưa có tập nhiệm vụ holdout hoặc nhãn đủ cho phối hợp, hạn và sản phẩm. Bảng có ô gộp hoặc scan, chữ số viết tay và vùng bị dấu che vẫn cần nhãn và lượt kiểm thử riêng. Chưa dùng các số trên để nghiệm thu.

Qua 3 kiểm thử Python (trích ứng viên, kiểm soát loopback, nguồn nhiệm vụ), smoke test companion bằng Chromium Linux với cả ba engine và một PDF thật, 30 Vitest, 3 kiểm thử Playwright đọc tài liệu và build website. Bản thử không thay đổi nguồn frontend, cơ chế OCR hiện tại, Rules hoặc dữ liệu Firebase. Chưa chạy Chrome và Edge trên Windows 10/11 và chưa có bảy PDF nội bộ trong môi trường này.

**Đề xuất tiếp theo:** Giữ OCR trình duyệt cho văn bản chính. Thử VietOCR CPU như ý kiến thứ hai cho vùng ngày trong môi trường Windows đã được phê duyệt. Chỉ xem xét tích hợp sau khi người đánh giá đối chiếu ảnh gốc, đo bảy PDF thật, xác minh lỗi nhận diện số và đánh giá an toàn/giấy phép bản phân phối.

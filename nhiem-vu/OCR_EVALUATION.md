# Đọc, OCR và phân tích văn bản hành chính

Nguồn so sánh là nhánh `feature/vpdu-pdf-3samples-fix` tại `3ccd9ec`. Nhánh này bổ sung quy trình xử lý cục bộ cho `/nhiem-vu/`, giữ Spark và không đòi hỏi dịch vụ ngoài. Mức đạt của benchmark bên dưới là kết quả thử, chưa phải xác nhận nghiệm thu.

## Khảo sát công nghệ

| Giải pháp | Kết quả khảo sát và hướng sử dụng |
| --- | --- |
| Tesseract.js 7, WASM, mô hình `vie` best-int | Có thể phục vụ toàn bộ worker và mô hình cùng origin. Nhận dạng dấu tốt hơn ứng viên PP-OCRv5 Latin trên ba vùng trích yếu thực tế bên dưới. Chữ viết tay, dấu chồng và cột không đường kẻ còn hạn chế. [Tesseract.js](https://github.com/naptha/tesseract.js) · [Mô hình](https://github.com/naptha/tessdata) |
| PaddleOCR PP-OCRv5/v6 và SDK trình duyệt | Có dựng mô hình trên ONNX Runtime Web. Cần tự quản lý detector, recognizer, từ điển, hậu xử lý và kiểm thử tương thích Chrome/Edge. Thử PP-OCRv5 Latin qua RapidOCR CPU; chưa đo PP-OCRv6 hay SDK web trên bộ này. [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) · [SDK trình duyệt](https://www.paddleocr.ai/main/en/version3.x/inference_deployment/cross_platform/browser.html) |
| VietOCR và VietOCR ONNX | Có bộ nhận dạng tiếng Việt thiên về ảnh dòng chữ. Cần detector riêng, tiền xử lý/giải mã chuỗi tương thích và xác minh giấy phép từng checkpoint trước khi đưa lên web. [VietOCR](https://github.com/pbcquoc/vietocr) · [ONNX](https://github.com/duchoa1297/vietocr-onnx) |
| RapidOCR | Thử hai mô hình mobile PP-OCRv5 trên ONNX Runtime CPU. Có hộp chữ hữu ích, nhưng cấu hình thử không giữ dấu tốt. Bản Python không thể đưa nguyên vào Pages. [RapidOCR](https://github.com/RapidAI/RapidOCR) |
| ONNX Runtime Web | Runtime WASM/WebGPU, cần detector, mô hình biểu diễn chữ và mã hậu xử lý. Dùng để thử mô hình thứ hai nếu đo được cải thiện. [Tài liệu ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/) |
| EasyOCR | Có tiếng Việt và hộp chữ. Phân phối chủ yếu dưới dạng Python/PyTorch; không phù hợp bản Pages tĩnh. [EasyOCR](https://github.com/JaidedAI/EasyOCR) |
| OCRmyPDF | Tạo lớp OCR, hỗ trợ xoay và deskew ngoại tuyến. Phù hợp ứng dụng cục bộ hoặc quy trình Windows/WSL; phụ thuộc Tesseract và công cụ PDF, không thay được trình phân tích nhiệm vụ. [OCRmyPDF](https://github.com/ocrmypdf/OCRmyPDF) |
| Docling, MinerU, Surya | Có mô hình đọc bố cục/bảng. Cần đánh giá runtime Python, trọng lượng mô hình, chất lượng tiếng Việt và điều khoản của mã/mô hình; chưa đo trên bộ này. [Docling](https://github.com/docling-project/docling) · [MinerU](https://github.com/opendatalab/MinerU) · [Surya](https://github.com/datalab-to/surya) |
| Các dự án OCR Web | Có ví dụ Worker/WASM, PDF nhiều trang và hộp chữ; một số demo mặc định dùng CDN. Dùng làm tham khảo tích hợp và kiểm tra nguồn tải tài nguyên. [ocr-web](https://github.com/bent2685/ocr-web) |

Điểm tạm thời 0–5 cho các cấu hình đã thử, theo thứ tự tiếng Việt / số và ngày / bố cục / trình duyệt / tài nguyên / chi phí và tích hợp. Điểm bố cục bao gồm phần trích xuất phía ứng dụng. Đây là điểm ra quyết định kỹ thuật, không phải điểm chính xác của engine.

| Cấu hình | 25% | 20% | 20% | 15% | 10% | 10% | Tổng /5 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Tesseract.js/WASM + PDF.js và bộ phân tích | 4 | 3 | 2 | 5 | 3 | 5 | 3,55 |
| RapidOCR PP-OCRv5 Latin + ONNX Runtime CPU | 2 | 3 | 3 | 2 | 2 | 4 | 2,60 |
| Tesseract native `vie`, thử trên Linux | 4 | 3 | 2 | 0 | 4 | 4 | 2,80 |

Chọn Tesseract.js làm engine trình duyệt hiện tại vì triển khai tĩnh, không phí API, nhận dấu tốt hơn ứng viên đang đo. RapidOCR có lợi thế ở chữ số ngày trên mẫu thử nhưng kém dấu, kích thước mô hình lớn và chưa chạy trong trình duyệt ở cấu hình này. Không ghép hai engine theo đa số khi chưa có dữ liệu hiệu chuẩn. Có thể thử giải pháp Windows chạy Tesseract/OCRmyPDF hoặc RapidOCR cục bộ để xử lý scan khó, tiết kiệm thời gian trình duyệt và giữ tệp trong máy. Phương án đó cần cài đặt, kiểm tra phiên bản/phụ thuộc và xác minh lại độ chính xác trên Windows. Chưa thay đổi kiến trúc triển khai.

## Kiến trúc và nguyên nhân được xử lý

1. PDF.js lấy tọa độ glyph và dựng từng hàng, giữ các vùng theo khoảng cách. Dùng thông tin phép vẽ ảnh và độ phân bố của lớp chữ để nhận diện trang scan hoặc hỗn hợp, kể cả PDF chỉ có lớp chữ ký số. Worker PDF, bộ giải mã JBIG2/OpenJPEG, CMap, font chuẩn và ICC được phục vụ cùng origin. Thiếu JBIG2 khiến bản cũ không kết xuất được ảnh của Thông báo 484.
2. Một Tesseract Worker xử lý tuần tự các trang cần OCR. Đầu trang có lượt tăng tương phản; số/ngày còn thiếu hoặc xung đột được thử lại theo vùng, với chế độ một dòng khi có thể xác định đường cơ sở. Giữ riêng nguồn PDF/OCR và mức tin cậy do engine trả về. Số hoặc ngày xung đột được để trống và hiện ứng viên; không điền theo tên tệp, ngày ký số hay văn bản viện dẫn.
3. DOCX được đọc từ OOXML, giữ bảng, vị trí cột, đoạn trong ô, ô gộp dọc và phần đầu/chân trang. PDF/OCR có cấu trúc hàng/cột từ tọa độ, nhận các cột theo tiêu đề và nối dòng của cùng hàng qua trang khi tiêu đề lặp. Nội dung điều, khoản, mục và đề xuất được giữ theo khối, có trích đoạn, trang và lọc mức liên quan. Cơ quan chủ trì trong văn bản khác cán bộ được chọn để giao trong ứng dụng.
4. Giao diện xem PDF gốc, chuyển trang, đánh dấu dòng khi chọn trường/nhiệm vụ và OCR lại trang/đầu trang/vùng trái/phải. Lượt OCR lại bổ sung ứng viên, giữ giá trị người dùng đã chỉnh. Trạng thái phân biệt đủ trường cơ bản, một phần, xung đột và chưa nhận diện. ADMIN duyệt, sửa, gộp, tách, bỏ hoặc bổ sung trước khi giao.
5. Tệp, ảnh, trích dẫn và dữ liệu so sánh chỉ nằm trong tab. Firestore vẫn theo schema hiện hành. Nếu chọn lưu nguồn, số và trích yếu phải tuân giới hạn cũ. Trích yếu nhận diện hiển thị đầy đủ; khi >300 ký tự có thể rút gọn có chủ đích hoặc bỏ chọn lưu nguồn. Ngày, số trang, tọa độ và các phương án không được lưu tự động. Lưu chúng sau này cần migration và phê duyệt Rules riêng.

## Benchmark trên tài liệu công khai

Ba nguồn chính thức từ Cổng văn bản Chính phủ. Bản gốc tải về thư mục tạm, không nằm trong Git/artifact. Đối chiếu số, ngày và vùng trích yếu lần lượt bằng ảnh trang 1. So sánh native Tesseract 5.5.0 với `vie` best-int và RapidOCR 3.10.0 / ONNX Runtime CPU, PP-OCRv5 detector mobile + Latin recognizer. Cùng ảnh 180 DPI. CER/WER dùng **riêng vùng trích yếu được khoanh tay**, chuẩn hóa NFC, chữ hoa/thường và khoảng trắng; sai dấu vẫn tính lỗi. Thời gian một lần chạy, không đồng nhất với thời gian Web UI.

| Mẫu | Tesseract native CER / WER | RapidOCR CER / WER | Native (giây) | RapidOCR (giây) |
| --- | ---: | ---: | ---: | ---: |
| 2292/QĐ-TTg | 0,8% / 3,3% | 23,6% / 73,3% | 1,75 | 11,25 gồm tải/khởi tạo mô hình |
| 484/TB-VPCP | 5,5% / 13,8% | 22,0% / 75,9% | 1,68 | 4,01 |
| 205/QĐ-BCĐCTMTQG | 0,5% / 2,3% | 14,2% / 48,8% | 1,46 | 2,39 |

Đọc đúng tuyệt đối số/ký hiệu khi đối chiếu chuỗi trong ROI lần lượt là **2/3 và 1/3**. Chữ số ngày ở dòng địa danh lần lượt **1/3 và 3/3**, chưa tính việc parser có hiểu các từ nối OCR sai dấu hay không. RSS cực đại quan sát được khoảng 65–67 MiB cho Tesseract native và 584–704 MiB cho tiến trình RapidOCR; không đo RSS của browser. Hai mô hình RapidOCR khoảng 12,2 MB. WASM OCR địa phương dùng mô hình nén khoảng 1,42 MB, worker khoảng 0,11 MB và core khoảng 3,90 MB, tải theo nhu cầu.

| Tài liệu | Bản `3ccd9ec` | Bản nâng cấp, Chromium |
| --- | --- | --- |
| 2292/QĐ-TTg, đủ 1 trang | Sai số, thiếu ngày, trích yếu lẫn tên cơ quan; một đề xuất từ Nơi nhận. | Không tự điền số do có xung đột; thiếu ngày viết tay. Trích yếu khớp vùng đối chiếu, đọc được hai điều/khoản tác nghiệp. Khoảng 27 giây. |
| 484/TB-VPCP, đủ 2 trang | Không đọc được ảnh JBIG2, thiếu số/ngày/trích yếu, không có đề xuất. | Số và ngày khớp. Có hai mục giao việc, mục đầu nối qua trang 2; chữ đầu trích yếu bị con dấu che và OCR còn lỗi dấu. Khoảng 42 giây. |
| 205/QĐ-BCĐCTMTQG, riêng trang 1 | Thiếu số, ngày và trích yếu. | Đọc được phần lớn trích yếu; ứng viên sai một chữ ký hiệu, thiếu ngày viết tay. Chỉ chấm trang đầu, chưa chấm bảng của phụ lục. Khoảng 28 giây. |

CER/WER của trích yếu trong pipeline Chromium trước → sau lần lượt là 22,0%/20,0% → 0%/0% (2292), 100%/100% → 5,5%/10,3% (484), và 100%/100% → 4,1%/4,7% (trang đầu 205). Trường trống được tính là mất toàn bộ nội dung.

Hai văn bản ngắn trên cung cấp bốn đối chiếu nhiệm vụ theo điều/mục (hai của 2292, hai của 484). Chúng chưa đủ để báo cáo precision, recall, F1 hoặc độ chính xác các vai trò/thời hạn/sản phẩm trên tập nghiệm thu. Chưa có tập độc lập đã gán nhãn. Một số nội dung có thể bị tách hoặc dính khi bảng scan có ô gộp không quan sát được, cột không đều, phụ lục đổi mẫu hoặc văn bản dùng nhiệm vụ gián tiếp. Cần đối chiếu trước khi giao.

Nguồn: [2292/QĐ-TTg](https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/11/2292_qdttg_20112026-signed.signed.pdf) · [484/TB-VPCP](https://datafiles.chinhphu.vn/cpp/files/vbpq/2024/10/484-tb.signed.pdf) · [205/QĐ-BCĐCTMTQG](https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/11/205_qdbcdctmtqg_19112026-signed.signed.pdf)

## Kiểm thử tích hợp

- 25/25 Vitest, 2/2 Playwright đọc tài liệu với DOCX gộp ô và PDF chỉ ảnh, 6/6 Playwright ứng dụng với Emulator và 9/9 nhóm Firestore Rules. Luồng ứng dụng có chọn PDF công khai 484 ở form, hiện kết quả, xem ảnh và OCR lại vùng số. Ca thử không ghi tài liệu vào Firestore.
- Kiểm tra build dưới đường dẫn con kiểu Pages. Chromium tải model và worker từ cùng origin; build Auth QA không mang OCR. Kiểm tra 5/5 nhóm hồi quy Giấy mời/Lịch và các tệp xuất DOCX/PDF đạt. `npm audit --omit=dev` trả về 0 lỗ hổng tại thời điểm kiểm tra.
- Website thử giữ nguyên vì chưa đạt ngưỡng nghiệm thu thực tế. Không thay Firestore Rules, ghi Firebase thật hoặc merge PR #4.

## Chạy thử, bảo trì và giới hạn

- `npm ci`, `npm run build`, `npm test`, `npm run test:documents` trong `nhiem-vu/`. Bộ trình duyệt có OCR thật trên PDF raster giả lập, DOCX gộp ô và kiểm tra các request cùng origin. Đặt `VPDU_PUBLIC_PDF` trỏ tới PDF công khai lưu cục bộ khi chạy acceptance Playwright với Auth/Firestore Emulator. Không mở trace/screenshot trên CI cho văn bản nội bộ.
- Worker, lõi WASM và mô hình ghim trong lockfile; plugin Vite phát hành tệp PDF/OCR cùng build. Khi nâng model, dùng nguồn có giấy phép rõ, kiểm tra license và lockfile, chạy cùng bộ development/holdout, chạy smoke trên bản tĩnh và xác nhận mọi tài nguyên cùng origin. Không đưa model từ CDN vào runtime. Bộ authenticator-only không mang theo assets OCR.
- Giới hạn tệp 15 MB, PDF 150 trang, tối đa OCR tự động 20 trang, DOCX XML chọn lọc tối đa 32 MB sau giải nén. Trang cần OCR ngoài giới hạn có cảnh báo và có thể OCR lại theo trang. Chưa có deskew/auto-orientation chuyên dụng, OCR chữ viết tay, xác thực chữ ký số, tái tạo ô gộp vô hình hay phân trang vật lý DOCX. Mức OCR là chỉ số engine, chưa được hiệu chuẩn theo từng trường.
- Bản cũ để khôi phục là `3ccd9ec` cùng artifact và cấu hình QA tương ứng. Chỉ thay SHA và triển khai kho QA sau khi ngưỡng thực tế được đáp ứng và có quyền phát hành. Không đổi Rules hoặc ghi dữ liệu thật để khôi phục.

**Chưa nghiệm thu:** Chưa có tệp gốc của 20/TB-CQTTBCĐ, 363-CV/TU, 777/TTg-TCCV, 31/CT-TTg, 24-CT/TU, 2893/TB-UBND và văn bản Ban Nội chính mã tệp 1321-2026. Các số hiệu trong ca mô phỏng không thay cho tệp. Cần nhận bộ được phép dùng, xác minh trường và từng nhiệm vụ, chia development/holdout, chạy end-to-end Chrome và Edge trên Windows và đo bộ nhớ. Các kết quả đã quan sát chưa đạt mục tiêu số/ngày 100% và chưa đủ căn cứ cho precision/recall nhiệm vụ ≥95%.

Xem [giai đoạn 2 và công cụ benchmark tại máy cá nhân](OCR_STAGE2.md) để đối chiếu kết quả trên các vùng số/ngày.

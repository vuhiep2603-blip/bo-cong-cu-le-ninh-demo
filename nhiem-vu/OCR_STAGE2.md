# OCR giai đoạn 2

Nguồn so sánh là commit `8ca53ef` của PR #5. Bản này giữ Tesseract.js 7/vie best-int cho văn bản tiếng Việt. Cơ chế đối chiếu nhận ứng viên có engine, nguồn, vùng và trang. Nó kiểm tra định dạng số, lịch, vị trí đầu trang và tính nhất quán. Một kết quả OCR đơn lẻ mặc định chỉ là ứng viên. Riêng số có nhãn nằm ở đầu trang, confidence đủ cao và đi cùng ngày đã được đối chiếu độc lập có thể điền gợi ý để ADMIN duyệt. Nếu hai nguồn xung đột, trường số hoặc ngày để trống. Không suy ra thông tin từ tên tệp, mốc ký số hoặc tài liệu viện dẫn.

## Tiền xử lý và nhiệm vụ

- Giữ lượt đọc ảnh gốc. Chỉ thử tương phản, vùng số phóng đại, khử chấm cô lập, làm nhạt vùng mực đỏ và nhị phân thích ứng trên ứng viên cần đối chiếu. Chỉnh nghiêng nhỏ bằng phân bố điểm tối trong vùng. Xoay 180/90/270 theo điều kiện chất lượng và dấu hiệu cấu trúc. PDF gốc giữ nguyên và vùng trên trang gốc vẫn tra được. Mực đỏ chứa chữ hoặc đánh dấu có thể bị mất trong biến thể, vì vậy chỉ dùng để so sánh nguồn.
- Hàng nhiệm vụ giữ chỉ số dòng nguồn thay vì tìm ngược theo câu đầu trùng lặp. Nối qua trang, bỏ một số câu dẫn hành chính, bổ sung nhận diện cụm phối hợp và giữ phân tách bảng. Mẫu bảng nhiều trang phức tạp, viết tay hoặc mất nét cần người dùng kiểm tra.
- Prototype PP-OCRv5 Latin trên ONNX Runtime Web/WASM chỉ nằm trong công cụ benchmark. Nó nhận một ảnh dòng đã cắt và giải mã CTC bằng alphabet từ chính model. Không dùng detector cho toàn trang và không đưa vào bundle production nếu chưa đủ bằng chứng. VietOCR ONNX đã thử tại CPU với sáu vùng bên dưới; chưa thử inference của encoder/decoder đó trong trình duyệt.

## Benchmark tại máy cá nhân

1. Đặt PDF và ground truth đã xác minh trong thư mục riêng **ngoài Git**, ví dụ `D:\vpdu-ocr-private`. Tệp JSON được lập theo tên tệp, dùng fields `number`, `documentDate` (YYYY-MM-DD), `subject`, và `tasks` (danh sách có `detail`, có thể kèm `lead`, `partners`, `deadline`, `deliverable`). Không có ground truth thì báo cáo vẫn có thời gian, bộ nhớ quan sát và số đề xuất, cùng trạng thái chưa chấm.
2. Để so trước/sau, xuất mã nguồn `8ca53ef` ra thư mục ngoài kho, giữ thư mục `assets` và `nhiem-vu` rồi chạy `npm ci` ở mô-đun cũ lẫn hiện tại. Để thử engine thứ hai, chuẩn bị model Latin PP-OCRv5 recognizer ONNX đã xác minh nguồn và giấy phép. Trích alphabet bằng `python tools/model-characters.py <model.onnx> <characters.json>` trong môi trường cục bộ có ONNX Runtime Python. Không lưu bản ghi nội bộ cùng model.
3. Chạy từ `nhiem-vu/` trên Windows với Chrome và Edge đã cài, dùng đường dẫn riêng cho hai báo cáo.

```powershell
npm run bench:ocr -- --dir "D:\vpdu-ocr-private\pdf" --truth "D:\vpdu-ocr-private\truth.json" --before "D:\vpdu-ocr-old\nhiem-vu" --channel chrome --out "D:\vpdu-ocr-private\chrome.json"
npm run bench:ocr -- --dir "D:\vpdu-ocr-private\pdf" --truth "D:\vpdu-ocr-private\truth.json" --before "D:\vpdu-ocr-old\nhiem-vu" --channel msedge --out "D:\vpdu-ocr-private\edge.json"
```

Thêm `--model <model.onnx> --characters <characters.json>` để thử ONNX. Có thể khai báo `regions` trong ground truth để so trên vùng đã đối chiếu. Mỗi vùng có `key` là `number` hoặc `documentDate`, `page` mặc định 1, `rect` theo tỷ lệ `[x,y,width,height]` của trang nhìn từ trên trái, và `value` là đáp án. Ví dụ `{"key":"documentDate","page":1,"rect":[0.5,0.15,0.4,0.04],"value":"2026-11-23"}`. Khi không có vùng chuẩn, công cụ thử định vị theo dòng nhãn và báo bỏ qua nếu không tìm được. Thêm `--regions-only` để đo riêng vùng đã gán nhãn. `--timeout-ms` điều chỉnh giới hạn cho mỗi PDF, mặc định 240 giây.

Công cụ khởi động Vite trên loopback, tạo trình duyệt mới, chặn request ngoài origin và vô hiệu service worker. Tệp đi từ thư mục riêng vào chính trình duyệt thử. Không có đăng nhập, tải tệp lên server hay ghi Firebase. Báo cáo JSON chỉ lưu số thứ tự tệp theo bảng chữ cái, thống kê và kết quả đối chiếu; không lưu đường dẫn, tên hoặc nội dung PDF. Không chạy trên CI công khai cho dữ liệu nội bộ.

CER/WER dùng trích yếu với chuẩn NFC, bỏ khác biệt chữ hoa/thường và khoảng trắng. Ghép nhiệm vụ một-đối-một theo Jaccard từ ≥0,8, rồi đo precision, recall, F1 và độ đúng fields trên cặp khớp. Cần kiểm tra lại cặp khớp bằng người đọc khi chấm hồ sơ chính thức. Bộ nhớ trong JSON là JS heap của renderer tại hai điểm trước/sau (Chrome DevTools Protocol), không gồm WASM worker, RSS hoặc peak RAM. Đo thêm Task Manager hay performance trace trong hồ sơ riêng trên Windows nếu cần số liệu peak.

## Kết quả đo trên PDF công khai

Dùng các nguồn [2292/QĐ-TTg](https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/11/2292_qdttg_20112026-signed.signed.pdf), [484/TB-VPCP](https://datafiles.chinhphu.vn/cpp/files/vbpq/2024/10/484-tb.signed.pdf) và [205/QĐ-BCĐCTMTQG, chỉ trang đầu](https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/11/205_qdbcdctmtqg_19112026-signed.signed.pdf). Không đính kèm PDF hay ground truth vào Git.

| Engine trên sáu ROI đã khoanh | Số đúng | Ngày đúng | Thời gian nhận dạng một ROI |
| --- | ---: | ---: | --- |
| Tesseract.js vie, Chromium/WASM | 1/3 | 1/3 | 0,22–0,60 giây |
| PP-OCRv5 Latin, ONNX Runtime Web/WASM | 1/3 | 1/3 | 0,07–0,12 giây trong pilot chính |
| VietOCR ONNX ocr-v1, Linux CPU | 1/3 | 3/3 | 0,027–0,066 giây |

Phép đo ROI loại trừ tải model, giải mã PDF và khởi tạo phiên. PP-OCRv5 web mất chữ số năm ở một ca và đọc thiếu ngày ở ca khác; tổng chính xác **2/6**, ngang Tesseract. Model pilot có SHA-256 `b20bd37c168a570f583afbc8cd7925603890efbcdc000a59e22c269d160b5f5a`. [Model](https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.10.0/onnx/PP-OCRv5/rec/latin_PP-OCRv5_rec_mobile.onnx)

VietOCR đọc đúng ba ngày nhưng sai một phần ký hiệu ở hai văn bản. Hai model encoder/decoder khoảng **89,5 MB**; tải phiên Linux khoảng **0,60 giây** và RSS cao nhất của tiến trình thử khoảng **247 MiB**. Đây là đối chiếu CPU, dùng raster 180 DPI với tọa độ ROI tương đương chứ không phải đo Web/WASM trên ảnh pixel giống nhau. [VietOCR ONNX và release](https://github.com/duchoa1297/vietocr-onnx/releases/tag/ocr-v1)

**Quyết định:** Chưa đưa engine thứ hai vào sản phẩm. PP-OCRv5 Web chưa có lợi về độ chính xác trên sáu vùng. VietOCR có tín hiệu tốt cho ngày nhưng chưa chứng minh được an toàn, dung lượng và độ chính xác trên Chrome/Edge Windows cùng tập độc lập. Có thể thử VietOCR chỉ trên vùng ngày, trong quy trình Windows ngoại tuyến nếu được phê duyệt riêng. Không dùng kết quả CPU để cam kết cho Pages.

Pipeline trình duyệt giai đoạn 2 vẫn chỉ đúng tuyệt đối số và ngày của **1/3** mẫu công khai. Thông báo 484 giữ được số/ngày sau khi thêm điều kiện số có nhãn, vị trí đầu trang và ngày đã đối chiếu; phần trích yếu OCR còn lỗi ở vùng dấu. 2292 có trích yếu khớp, nhưng số/ngày vẫn sai hoặc thiếu. Mẫu trang đầu 205 còn lỗi số/ngày. Trên mẫu con 2292 có hai điều khoản đối chiếu, trước và sau đều TP=2, FP=0, FN=0 theo phương pháp ghép của tool. Hai mục không đủ để kết luận precision/recall trên tập nghiệm thu và không đủ để chấm chính xác chủ trì/phối hợp/hạn/sản phẩm.

| Mẫu | Số và ngày đúng trước → sau | CER trích yếu | WER trích yếu | Giây trước → sau | JS heap sau OCR trước → sau |
|---|---|---:|---:|---:|---:|
| 205/QĐ-BCĐCTMTQG (trang đầu) | 0/2 → 0/2 | 4.06% | 4.65% | 24.86 → 27.55 | 6.50 → 5.99 MiB |
| 2292/QĐ-TTg | 0/2 → 0/2 | 0.00% | 0.00% | 27.18 → 26.39 | 6.20 → 7.20 MiB |
| 484/TB-VPCP | 2/2 → 2/2 | 5.51% | 10.34% | 41.53 → 40.62 | 5.19 → 5.57 MiB |

CER và WER trích yếu giữ nguyên giữa hai bản trên ba mẫu. Số liệu 205 và 484 dùng lượt kiểm tra tập trung. JS heap là số đọc sau xử lý trên luồng giao diện Chromium, chưa bao gồm bộ nhớ đỉnh và WASM/worker.

Đã kiểm tra 30 Vitest, 3 Playwright đọc tài liệu, 6 Playwright ứng dụng (gồm PDF công khai 484) và 9 nhóm Firestore Rules với Emulator. Hồi quy Giấy mời/Lịch gồm 5 nhóm Chromium và kiểm tra DOCX/PDF. Chromium chạy trên Linux. Chưa chạy Chrome và Edge trên Windows. Bảy PDF gốc đã nêu ở giai đoạn trước vẫn chưa có, và chưa có holdout gán nhãn. Các số đo công khai chưa đạt ngưỡng nghiệm thu.

## Build và phát hành sau khi được chấp thuận

- Chạy `npm ci`, `npm test`, `npm run test:documents`, Playwright với Emulator và `npm run build` từ commit đã kiểm thử. Kiểm tra gói đặt dưới đường dẫn con `/nhiem-vu/`, gồm PDF.js worker/bộ giải mã, Tesseract worker/core và `ocr/lang/vie.traineddata.gz`. Model ONNX, lab, PDF và đáp án ở ngoài artifact.
- Sau khi đạt nghiệm thu và được phê duyệt, ghim đúng SHA trong workflow của kho QA. Kiểm tra lại SHA và artifact đang chạy. Khi rà soát lượt này, workflow kho QA đang ghim `3ccd9ec`; chưa thay đổi cấu hình. Nếu lỗi, khôi phục SHA/artifact đã xác nhận của kho QA. Không đổi Rules, ghi dữ liệu thật, nâng Spark, thay website chính hoặc merge PR trong quy trình thử.
- Nếu Chrome/Edge không đạt chất lượng cần thiết, lựa chọn dự phòng là một chương trình Windows chạy cục bộ với Tesseract/OCRmyPDF và RapidOCR/ONNX. Giữ tệp trong máy, có thể đo song song, đổi model và dùng tác vụ deskew tốt hơn. Cần ký duyệt bộ cài, giấy phép, phiên bản, quản lý thư mục tạm và thẩm định riêng. Chưa thay đổi kiến trúc hoặc cài chương trình lên máy nghiệp vụ.

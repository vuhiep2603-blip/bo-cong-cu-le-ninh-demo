# Giai đoạn 4 — bố cục, số hiệu và nhiệm vụ

Prototype tách khỏi ứng dụng, xuất phát từ `ef04153` của PR #5. Website vẫn dùng Tesseract.js hiện hành. Không yêu cầu thay Rules, ghi Firebase, thay gói Spark hoặc xuất bản bản thử.

## Nguyên nhân và thiết kế

[Đối chiếu từng PDF trong holdout giai đoạn 3](OCR_STAGE4_AUDIT.md) ghi đủ 21 tệp, kết quả từng engine và nguyên nhân quan sát được. Hai lỗi có thể tái hiện riêng:

- Hai PDF cũ có số và ngày được chèn qua appearance của widget chữ ký. Khi kết xuất với `annots=False`, ảnh đầu vào thiếu chữ số dù trình đọc PDF hiển thị. Prototype kết xuất kèm appearance và bỏ qua hàng metadata ở sát đầu trang. Không lấy ngày từ giá trị hoặc metadata chữ ký.
- Mã như `658-QĐÐ/TW` trước đây bị chấp nhận thành tiền tố `658-QĐ`. Bộ phân tích mới kiểm tra toàn dòng, tách phần số, ký tự phân cách và các đoạn ký hiệu. Giữ nguồn và tọa độ cho từng giá trị, không thay ký tự bằng tên tệp, mã hồ sơ hoặc dữ liệu đối chiếu.

OpenCV tìm các dải mực theo trục dọc, chia những khoảng trống rộng thành cột, rồi đặt hộp quanh chữ cụ thể. Các mốc tên loại, nhãn số và cụm ngày hạn chế lẫn câu viện dẫn. Khi PDF có lớp chữ, sắp từ theo hoành độ trong hộp để giảm sai thứ tự đọc. Tesseract native nhận dạng các dòng trước. Với vùng số có nhãn, prototype có thể phóng to, tăng tương phản và giới hạn tập ký tự. VietOCR chỉ chạy trên vùng có khả năng chứa ngày. PP-OCRv5 còn có thể chạy theo chế độ đối chiếu giai đoạn 3; kết quả đó tách khỏi xếp hạng mới. Website vẫn giữ Tesseract.js cho văn bản tiếng Việt.

Prototype trả vị trí địa danh và ngày theo dòng, số/ký hiệu, tên loại, trích yếu ứng viên, cùng mốc chữ ký, nơi nhận và phụ lục ở trang đầu/cuối từ lớp chữ. Số và ngày đã có benchmark vùng. Các mốc phụ chưa có tập gán nhãn, chữ ký trên scan không lớp chữ và phụ lục ở giữa tài liệu còn thiếu phát hiện. Vùng đỏ chỉ được loại khi tìm hình học; OCR vẫn nhận ảnh gốc. Không có bằng chứng trên holdout cũ để tính riêng lỗi do dấu đỏ che đúng số/ngày.

## Phép đo độc lập cho vùng và trường

Chín PDF development từ giai đoạn 3 dùng để chỉnh thuật toán, cộng một PDF ngoài hai holdout (`public-15`) để tái hiện appearance. Holdout giai đoạn 3 chỉ dùng phân tích lỗi. Tập **21 PDF mới** gồm 16 văn bản Nhà nước và 5 văn bản Đảng, không trùng SHA hoặc số hiệu với tập 30 mẫu trước. Manifest `public-layout-holdout.json` ghi nguồn, SHA-256 và 42 hộp gán tay trên ảnh hiển thị tại trang đầu. Một số tài liệu vẫn cùng họ mẫu với tập phát triển. Đây là đối chứng cho bộ Hybrid cục bộ, không phải đo pipeline website đầu-cuối.

Một vùng tính phát hiện được khi phủ ít nhất 70% hộp tham chiếu và IoU ≥ 0,35. Mỗi trường so IoU lớn nhất giữa hộp thật và các ứng viên, kể cả vùng có OCR sai. Số/ngày được so riêng theo giá trị và trạng thái. Một ứng viên đúng không được tính nếu bị xung đột cùng mức ưu tiên.

| Thước đo | Crop cố định giai đoạn 3 | Prototype giai đoạn 4 |
| --- | ---: | ---: |
| Phát hiện vùng số theo ngưỡng | 19/21 | 18/21 |
| IoU trung bình tốt nhất vùng số | 0,397 | 0,765 |
| Phát hiện vùng ngày theo ngưỡng | 21/21 | 21/21 |
| IoU trung bình tốt nhất vùng ngày | 0,585 | 0,815 |
| Số đúng / sai / trống / xung đột | 10 / 7 / 3 / 1 | **19 / 1 / 1 / 0** |
| Ngày đúng / sai / trống / xung đột | 11 / 2 / 8 / 0 | **20 / 0 / 0 / 1** |
| Đúng đồng thời số và ngày | 9/21 | **18/21** |
| Giây/PDF trung vị (Linux CPU, đã khởi tạo model) | 2,22 | 2,38 |

Đây là phép so hai nhóm thay đổi đồng thời (raster và thuật toán), chưa tách đóng góp của từng kỹ thuật bằng ablation. Số hiệu 2236/QĐ-TTg vẫn bỏ trống; 2476/QĐ-NHNN có gợi ý sai; 114/2026/VBHN-TT-BNNMT có ngày xung đột. Cả ba ca đều có hộp đạt ngưỡng, nên cần tập trung OCR chữ số và đối chiếu ứng viên thay vì chỉ chỉnh hộp. Chỉ tiêu 100% trên bộ nghiệp vụ chưa đạt. Giao diện đánh dấu giá trị là gợi ý, cần người kiểm tra.

Thí nghiệm riêng trên sáu vùng số gán tay của development, 320 DPI, đọc đúng 1/6 bằng OCR thường, 2/6 với giới hạn chữ số và 1/6 với nhị phân hóa cộng giới hạn chữ số. Đây chưa phải bằng chứng để tự động dùng cách này hoặc dùng checkpoint chữ viết tay. Thử nghiệm nằm trong `serial_lab.py`.

## Phân tích nhiệm vụ

Lab `task_layout.py` nhóm dòng theo điều khoản, giữ dòng nối sang trang tiếp theo, tách mục, và trích thời hạn ghi trực tiếp. Khi tên đơn vị có trong dòng giao việc hoặc tiêu đề cha, giữ cả vị trí dòng đó làm bằng chứng. Bảng có cột được nhận dạng có thể nối dòng chưa mang số thứ tự sang trang kế tiếp. Dữ liệu gốc và tọa độ giữ lại cho người đọc, kể cả khi ô gộp để trống. Prototype phân biệt chỉ đạo cấp cơ quan với trường đơn vị chủ trì có ghi Văn phòng Đảng ủy. Mọi đề xuất vẫn cần người có thẩm quyền xác minh và phân công cán bộ.

Đã ghi **12 nhiệm vụ đối chiếu** từ bốn PDF công khai. Sáu nhiệm vụ là phát triển và sáu nhiệm vụ khác dành cho pilot kiểm tra ở phạm vi trang nêu trong manifest. Mỗi nhãn lấy từ điều khoản đọc trực tiếp; benchmark ghi độ đầy đủ nguồn/trang và tỷ lệ ký tự khớp cho từng nhiệm vụ. Điểm tính vi mô trên TP, FP và FN.

| Tập pilot | Baseline precision / recall / F1 | Prototype precision / recall / F1 |
| --- | ---: | ---: |
| Phát triển, 6 nhiệm vụ | 100% / 50% / 66,7% | 100% / 100% / 100% |
| Kiểm tra, 6 nhiệm vụ | 75% / 50% / 60% | **42,9% / 50% / 46,2%** |

Tập kiểm tra khớp đầy đủ 3/6 nhiệm vụ và 3/6 về trang nguồn; ba nhiệm vụ trong phụ mục báo cáo của văn bản Đảng bị bỏ sót, bốn đề xuất dư. Cần giữ tiêu đề cha với danh sách viện dẫn và thông tin ngay sau danh sách, tránh coi yêu cầu nộp hồ sơ nhiều trang là các nhiệm vụ rời. Phần phối hợp, sản phẩm, ô gộp và phụ lục chưa có đủ nhãn đối chiếu. Chưa hoàn thành bộ độc lập 100 nhiệm vụ, chưa đưa lab vào ứng dụng.

### Khảo sát công cụ

- [LayoutParser](https://github.com/Layout-Parser/layout-parser), Apache-2.0, có bộ đọc hộp và mô hình bố cục tổng quát. Nhãn PubLayNet không nhất thiết có trường hành chính Việt Nam. [PaddleOCR PP-StructureV3](https://github.com/PaddlePaddle/PaddleOCR), Apache-2.0 ở mã nguồn, có nhận cấu trúc bảng và thứ tự đọc. [Docling](https://github.com/docling-project/docling), MIT ở mã nguồn, hỗ trợ cấu trúc bảng. Cần đối chiếu license checkpoint và CPU/độ đúng trên phụ lục gán nhãn trước khi thêm bất kỳ mô hình nào.
- Vì pilot quy tắc cho văn bản Đảng còn thấp, có thể dùng [Underthesea](https://github.com/undertheseanlp/underthesea) (Apache-2.0) cho tách đoạn và [PhoBERT](https://github.com/VinAIResearch/PhoBERT) (MIT ở kho) làm encoder phân loại câu hoặc trích span dựa trên tập 100+ nhãn. Cần rà quyền phân phối trọng số và benchmark riêng. Chưa chạy mô hình NLP; không điền thông tin ngoài nguồn.

## Thử companion trên Windows

Gói bàn giao gồm mã nguồn, `Prepare-OCR.ps1`, `Start-OCR.cmd`, preflight và hướng dẫn. Chạy một lần nhấn sau khi đã chuẩn bị tài nguyên cục bộ. Gói không nhúng Python, Tesseract, wheel hoặc trọng số. Windows 10/11, Chrome và Edge chưa chạy trong môi trường này. Phiên bản phụ thuộc và giấy phép xem [giai đoạn 3](OCR_STAGE3.md); PyMuPDF dùng AGPL-3.0 hoặc giấy phép thương mại. Cần rà điều khoản checkpoint và thêm SBOM/chữ ký trước khi phân phối đầy đủ.

1. Giải nén ở máy thử được phê duyệt. Chuẩn bị CPython 3.12 x64 và wheelhouse tin cậy theo `requirements.txt`, gồm cả phụ thuộc gián tiếp. Từ Windows x64 có mạng, có thể dùng `py -3.12 -m pip download --only-binary=:all: --dest wheelhouse -r requirements.txt`, rồi chuyển ngoại tuyến. Thêm bộ Tesseract đã thẩm định vào `runtime\tesseract\`; `tesseract.exe` phải ở ngay trong thư mục này.
2. Đặt `vie.traineddata` best-int đã giải nén vào `models\best-int\` và ba tệp VietOCR release ocr-v1 vào `models\vietocr\`. Chạy `Prepare-OCR.ps1` bằng PowerShell theo chính sách máy thử. Script tạo venv cục bộ và chỉ cài từ wheelhouse. Cần chạy lại chuẩn bị nếu di chuyển thư mục venv sang ổ hoặc máy khác.
3. Nhấn `Start-OCR.cmd`. Preflight kiểm tra kiến trúc, phụ thuộc, executable và SHA-256 của bốn tệp OCR. Trình duyệt mặc định mở bằng URL phiên. Với Chrome và Edge, dùng từng kênh trong `smoke_browser.py --channel chrome` hoặc `--channel msedge`, truyền các tham số `--pdf --tessdata --tesseract --vietocr` theo bản thử. Xác nhận bảng hiển thị nguồn khác nhau và nội dung xung đột/để trống. Dừng bằng Ctrl+C.

Companion bind `127.0.0.1`, kiểm tra Host/Origin và token phiên 256 bit, giới hạn PDF 20 MiB và chạy một yêu cầu tại một thời điểm. PDF đi qua stdin sang worker dùng một lần. Dừng worker sau 90 giây hoặc khi tổng RSS lấy mẫu vượt 1 GiB; stderr worker không lưu, không ghi PDF/ảnh ra đĩa. Đây là kiểm soát deadline và bộ nhớ theo mẫu, chưa phải sandbox hệ điều hành. Cần kiểm chứng watchdog Windows, thêm Job Object hoặc sandbox với giới hạn tài nguyên và chặn egress ở cấp hệ điều hành trước phân phối tệp không tin cậy. Gỡ thử bằng dừng tiến trình và xóa thư mục thử nghiệm. Website vẫn có OCR hiện hành.

## Xuất báo cáo tại máy thử

Đặt PDF và manifest ngoài Git. Lệnh chỉ ghi chỉ số và định danh theo thứ tự manifest, không ghi nội dung OCR hoặc đường dẫn tệp. Xác nhận số, ngày và khoanh hộp từ PDF hiển thị trước khi đo; với bảy PDF nội bộ sử dụng file đối chiếu riêng và không tải lên CI.

```powershell
$python = '.\runtime\Scripts\python.exe'
& $python benchmark_layout.py --input D:\ocr-qa\pdf --truth D:\ocr-qa\headers.json --output D:\ocr-qa\headers-result.json --tessdata '.\models\best-int' --tesseract '.\runtime\tesseract\tesseract.exe' --vietocr '.\models\vietocr'
& $python benchmark_tasks.py --input D:\ocr-qa\pdf --truth D:\ocr-qa\tasks.json --output D:\ocr-qa\tasks-result.json
```

Trên Linux đã qua 6 kiểm thử Python, upload PDF thật vào Chromium và OCR trong worker cục bộ, 30 Vitest và build. Hồi quy Giấy mời và Lịch công tác qua 5 kiểm tra Chromium và kiểm tra đầu ra DOCX/PDF. Giới hạn còn lại gồm phạm vi nhãn nhiệm vụ, độ tin cậy số viết tay, bản thử Windows và bảy PDF công việc chưa có trong môi trường. Chưa triển khai hay cài trên máy nghiệp vụ.

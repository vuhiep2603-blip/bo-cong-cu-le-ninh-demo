# Đánh giá OCR tiếng Việt – VPĐU Lệ Ninh (19/11/2026)

Nguyên tắc: chạy tại trình duyệt, mô hình tự lưu cùng GitHub Pages, không gửi văn bản ra API bên ngoài, miễn phí, giữ nguyên Firebase Rules và dữ liệu thật.

## Giải pháp nguồn mở đã nghiên cứu
- Tesseract.js + ngôn ngữ vie: hiện hoạt động trong browser; vẫn có lỗi dấu, con số, bảng scan.
- PaddleOCR.js: https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/inference_deployment/cross_platform/browser.en.md. Có bộ nhận diện vùng chữ và ONNX Runtime Web, cần tự lưu model và thử chất lượng tiếng Việt.
- ocr-web: https://github.com/bent2685/ocr-web. Web Worker, boxes và đọc PDF nhiều trang, nhưng ví dụ mặc định dùng CDN model; phải tự host để bảo mật.
- VietOCR ONNX: https://github.com/duchoa1297/vietocr-onnx. Cần đánh giá khả năng vận hành model trong browser.

Chưa có bằng chứng PaddleOCR luôn tốt hơn Tesseract đối với dấu tiếng Việt. Tham khảo phép đo: https://github.com/nrl-ai/nom-vn/blob/main/docs/sota_vn_2026q2.md.

## Những thay đổi ở nhánh thử
1. Ghép chữ PDF theo vị trí và chiều rộng, không chèn dấu cách sau mỗi mảnh chữ.
2. Nếu trích yếu PDF bị tách từng ký tự, ưu tiên bản OCR rõ ràng hơn; cảnh báo mọi xung đột, không đoán số văn bản.
3. OCR các trang PDF scan (tối đa 20 trang mỗi lần) bằng một Worker và báo tiến độ.
4. Nhận diện nhiệm vụ theo khối mục đánh số, nối các đoạn tiếp theo và đọc tiếp hàng phụ lục sau phần chữ ký.
5. Chỉ tạo đề xuất để người dùng duyệt; không tự phân công cán bộ.

## Tiêu chí A/B để được tích hợp engine thứ hai
- Đối chiếu cùng 4 PDF thật đã xóa dữ liệu nhạy cảm: số hiệu, ngày ban hành (khác ngày ký số), trích yếu nguyên vẹn.
- Số nhiệm vụ theo mục + phụ lục; đúng chủ trì, phối hợp, thời hạn, sản phẩm, trích dẫn trang nguồn.
- So sánh độ chính xác dấu tiếng Việt, nhầm chữ số, tốc độ tải model, bộ nhớ trình duyệt, Chrome/Edge trên Windows.
- OCR không được gọi nguồn ngoài khi chạy, không được ghi Firebase cho tới khi ADMIN xác nhận.

Trạng thái: đã nghiên cứu và sửa pipeline hiện có. PaddleOCR/ocr-web CHƯA được tích hợp, chỉ tiến hành khi so sánh trên tài liệu thật chứng minh chất lượng tốt hơn.
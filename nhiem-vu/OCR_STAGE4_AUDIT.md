# Đối chiếu 21 PDF giữ riêng giai đoạn 3

Đối chiếu ảnh trang đầu với lớp chữ và chạy lại cùng crop raster giai đoạn 3. Cột dùng thứ tự **Chromium Tesseract.js / native best-int / native tessdata_best / VietOCR / PP-OCRv5 Latin**. Đ = đúng, S = sai, T = bỏ trống, X = xung đột. Native tessdata_best lấy từ kết quả giai đoạn 3 đã lưu. Các trường đọc đúng vẫn tính theo chế độ từng engine có một ứng viên duy nhất.

| PDF công khai | Số | Ngày | Dấu hiệu đối chiếu |
| --- | --- | --- | --- |
| 71/2026/TT-BCT | S / S / S / S / S | T / T / T / T / T | Thiếu số 71 và ngày 19 ở raster cũ. Hai con số nhìn thấy khi bật appearance của widget chữ ký. Không dùng thời điểm ký. |
| 2279/QĐ-TTg | Đ / Đ / Đ / S / T | T / T / T / Đ / T | Native/WASM chép tháng in thành 1Ï dù ngày nằm trong crop; VietOCR và lớp chữ có ngày đầy đủ. |
| 18586/BTC-ĐTPT | X / X / X / S / T | T / T / T / S / T | Số và hai thành phần ngày viết tay chèn vào bản scan. OCR cũ lấy thêm ứng viên từ dòng trích yếu; tháng 11 bị đọc thành 1. |
| 11857/VPCP-KGVX | Đ / Đ / Đ / Đ / S | T / T / T / Đ / T | Ngày in rõ; hai Tesseract không tạo ngày hợp lệ, lớp chữ và VietOCR có ngày. Số ở dòng công văn tách khỏi tiêu đề. |
| 189/QĐ-BCĐ | S / S / S / Đ / T | T / T / T / Đ / T | Số 189 viết chen bị Tesseract đọc 789. VietOCR có cả số và ngày; lớp chữ PDF cũ chủ yếu là thông tin phát hành. |
| 115/2026/VBHN-TT-BNNMT | S / S / S / S / T | T / T / T / T / T | Thiếu số 115, ngày 17, tháng 11 ở raster cũ. Ba thành phần hiện khi bật appearance. |
| 2233/QĐ-TTg | Đ / Đ / Đ / Đ / T | T / T / T / Đ / T | Số và ngày dạng chèn tay; native và browser đọc đúng số, VietOCR đọc đúng ngày. Hai Tesseract không có ngày hợp lệ. |
| 2232/QĐ-TTg | S / S / S / Đ / T | T / T / T / Đ / T | Số viết tay 2232 bị hai Tesseract đọc 2242. VietOCR giữ được giá trị khác; đây là xung đột giữa engine. |
| 2229/QĐ-TTg | T / T / T / S / T | T / T / T / T / T | Số chèn sát nhãn, nét viết đè dày; native không có mã hoàn chỉnh, VietOCR đọc sai. Ngày chèn tay cũng thiếu ứng viên. |
| 2228/QĐ-TTg | S / S / S / Đ / T | T / T / T / Đ / T | Số viết tay. Native và browser trả chuỗi chỉ có một phần mã; VietOCR có mã đầy đủ, nên ưu tiên vị trí/căn cứ để người đọc đối chiếu. |
| 168/2026/TT-BTC | S / S / S / Đ / S | T / T / T / S / T | Số và ngày chèn bằng nét xanh. Tesseract đọc hụt đầu số; VietOCR đọc tháng 11 thành 1. Lớp chữ không đủ để phục hồi. |
| 2224/QĐ-TTg | T / T / T / T / S | T / T / T / S / T | Số viết chen sát ký hiệu, lớp chữ scan vỡ ký tự. VietOCR đọc thiếu một chữ số ở tháng; số chưa có ứng viên đúng. |
| 2223/QĐ-TTg | T / T / T / T / T | T / T / T / Đ / T | Số chèn liền ký hiệu bị đọc thành chữ và mất dấu phân cách; browser đọc ngày 13 thành 43. VietOCR giữ được ngày. |
| 2222/QĐ-TTg | T / T / T / Đ / T | T / T / T / Đ / T | Số chèn tay đọc được với VietOCR nhưng bị mất trong đầu ra Tesseract; định tuyến native cho số bỏ qua ứng viên đúng. |
| 2221/QĐ-TTg | T / T / T / T / T | T / T / T / Đ / T | Số viết tay bị chuyển thành chữ/ký tự nhiễu. Browser đọc 43 cho ngày 13; kiểm tra lịch loại bỏ hợp lệ ứng viên này. |
| 2220/QĐ-TTg | Đ / Đ / Đ / S / S | T / T / T / Đ / T | Số in đọc được, lớp chữ chứa phiên âm sai dấu. VietOCR đúng ngày; Tesseract không có ngày đủ cấu trúc. |
| 16-CT/TW | Đ / Đ / Đ / T / T | Đ / T / Đ / Đ / T | Ngày in đọc được bởi browser/VietOCR, nhưng native bỏ trống. Đầu trang không có lớp chữ sử dụng được. |
| 658-QĐ/TW | S / S / S / T / T | Đ / Đ / Đ / Đ / T | Ký hiệu thừa nét OCR QĐÐ; bộ regex cũ nhận tiền tố 658-QĐ, bỏ /TW. Vùng gốc chứa đủ dòng, lỗi ký tự và chấp nhận chuỗi bị cắt. |
| 112-KL/TW | Đ / Đ / Đ / T / T | Đ / Đ / Đ / Đ / T | Hai trường đúng theo định tuyến thử; lớp chữ PDF cũ chỉ có phần thời điểm ký không phải ngày ban hành. |
| 657-QĐ/TW | Đ / Đ / S / T / S | Đ / Đ / Đ / Đ / T | Hai trường đúng theo định tuyến thử. RapidOCR Latin rơi chữ số và dấu Đ. |
| 499-QĐ/TW | Đ / Đ / Đ / T / T | Đ / Đ / Đ / Đ / T | Hai trường đúng theo định tuyến thử. VietOCR không tạo mã số hợp lệ, không cần thay thế native trên số mẫu này. |

Không đủ bằng chứng để gán ca nào trong 21 PDF cho dấu đỏ che đúng trường số/ngày. Các lỗi thấy rõ thuộc lớp hiển thị, chữ số viết tay, OCR ký tự, chấp nhận tiền tố và giới hạn định tuyến. Các ảnh gốc giữ ở thư mục thử cục bộ. Tập này chỉ phục vụ phân tích và không được dùng làm benchmark độc lập của giai đoạn 4.

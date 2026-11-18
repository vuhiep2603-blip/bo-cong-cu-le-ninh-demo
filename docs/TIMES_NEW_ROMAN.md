# Times New Roman cho PDF Lịch công tác tuần

Bản sửa chỉ áp dụng **Lịch công tác → Xuất PDF**. Giấy mời, Word, nội dung lịch, mẫu văn bản, HD05 và dữ liệu lịch không thay đổi. Website không cung cấp, tải tự động hoặc đưa Times New Roman lên GitHub.

## Cách chọn font

1. Mở Lịch công tác tuần, mở mục **Font Times New Roman cho PDF Lịch** trong Thiết lập xuất văn bản.
2. Chọn cùng lúc đủ bốn tệp Times New Roman được phép sử dụng và nhúng PDF từ máy của bạn. Trên Windows thường là `times.ttf`, `timesbd.ttf`, `timesi.ttf`, `timesbi.ttf`. Đây chỉ là gợi ý tên; ứng dụng đọc tên bên trong tệp, không tin tên tệp.
3. Chờ thông báo **Đủ 4 kiểu Times New Roman hợp lệ**. Không chọn Liberation Serif rồi đổi tên thành times.ttf.
4. Để **Ghi nhớ bộ font trong trình duyệt này** nếu muốn dùng lại sau khi mở trang. Font được giữ trong kho IndexedDB riêng, không nằm trong dữ liệu lịch hoặc tệp sao lưu JSON, không gửi tới máy chủ.
5. Bấm Xuất PDF như trước. Chèn dấu treo vẫn là lựa chọn riêng, mặc định tắt và chỉ trang đầu.

Có thể chọn trực tiếp các tệp font bạn được cấp phép từ thư mục font hệ điều hành; cách hiển thị/copy các tệp phụ thuộc Windows/macOS và chính sách cơ quan. Không dùng trang tải font không rõ quyền sử dụng. Kiểm tra metadata không thay thế việc có giấy phép hợp pháp.

## Thay hoặc xóa

- **Thay bộ font:** chọn bộ bốn tệp mới. Chỉ thay sau khi tất cả đều hợp lệ; bộ đang dùng được giữ nếu chọn sai/thiếu/trùng kiểu.
- **Xóa bộ font đã lưu:** xác nhận để xóa cả bộ nhớ font của phiên và bản lưu riêng. Không xóa lịch, không đổi mẫu Word và không xóa PDF đã tải.
- Bỏ chọn Ghi nhớ: dùng bộ mới trong phiên, xóa bản lưu cũ nếu cập nhật kho thành công. Sau khi tải lại trang, phải chọn font lại.
- Nếu trình duyệt chặn hoặc hết dung lượng IndexedDB, có thể dùng bộ hợp lệ trong phiên hiện tại; ứng dụng báo rõ việc không lưu được. Không âm thầm dùng font khác.
- Dữ liệu trình duyệt bị xóa hoặc đổi domain/đường dẫn thì bộ font đã lưu cũng có thể không còn. Cần chọn lại; lịch vẫn dùng cơ chế sao lưu riêng hiện có.

## Kiểm tra font được thực hiện

- SFNT TTF/OTF đơn, bảng tên/bảng ký tự hợp lệ; từ chối TTC/WOFF, tệp hỏng/đổi đuôi.
- Family/typographic family phải là Times New Roman; kiểm tra tên PostScript tương ứng Regular/Bold/Italic/Bold Italic và cờ đậm/nghiêng OS/2, head.
- Cần đúng bốn kiểu, không trùng. Có đủ ký tự tiếng Việt và ký tự trong lịch. Các chuỗi chỉ trong PDF được chuẩn hóa Unicode NFC để giữ dấu tiếng Việt tương đương, không sửa dữ liệu nguồn đã lưu.
- Kiểm tra cờ nhúng: từ chối Restricted License Embedding, bitmap-only và no-subsetting vì bộ xuất hiện dùng subset. Những giấy phép/cờ khác vẫn do người dùng chịu trách nhiệm xác nhận.
- Không thể chứng minh nguồn gốc/pháp lý hoặc xác thực mật mã một font chỉ bằng metadata. Các bộ font có tên PostScript khác chuẩn được báo lỗi, không tự suy đoán hoặc thay thế.

## Phạm vi được giữ

A4, lề trái/phải/trên/dưới 46/43/46/48pt; cỡ chữ, hệ số dòng, khối tiêu đề, bảng 7 ngày, độ rộng cột, ghi chú, quy tắc chia bảng và vị trí dấu đều giữ từ bản hiện tại. Số dòng/trang thực tế phụ thuộc metric của phiên bản Times New Roman mà người dùng chọn; không có thao tác ép số trang, cắt nội dung hoặc đổi dữ liệu để giống font cũ.

Các tệp Liberation Serif vẫn được giữ cho Giấy mời vì yêu cầu không thay chức năng đó. PDF Lịch không gọi nhánh tải/đăng ký Liberation Serif và không sử dụng Times-Roman/Roboto làm dự phòng.

## Dựng và kiểm thử cho lập trình viên

`npm ci` rồi `npm run build` tạo lại assets/app.js. Không sửa trực tiếp mã minify.

`npm test` chạy kiểm tra dữ liệu sai và trình duyệt. Muốn chạy cả kiểm thử font thật, đặt `FONT_QA_DIR` trỏ tới thư mục ngoài repository chứa bộ Times New Roman hợp pháp. Bộ kiểm thử hiện đọc `Times.TTF`, `Timesbd.TTF`, `Timesi.TTF`, `Timesbi.TTF`; không chép các font vào repo. Không có font thật thì các lượt tương ứng được ghi rõ là bỏ qua, không được báo là đã đạt.

Có thể đọc lại bằng `python tests/verify_times_pdf.py` (QA cần PyMuPDF, python-docx và công cụ pdffonts). Tệp PDF/bundle QA chỉ nằm trong test-output được Git bỏ qua; không đưa các font hoặc bộ cài vào kho hay ZIP mã nguồn.

# Times New Roman cho PDF Lịch công tác

Khi người dùng bấm xuất PDF Lịch, ứng dụng tự tải bốn kiểu Times New Roman từ máy chủ phục vụ trang Lịch. Các tệp được kiểm tra tên họ font, kiểu chữ, quyền nhúng và độ phủ ký tự trong lịch. PDF khổ A4 nhúng tập con của font thật. Nếu thiếu tệp, tệp sai kiểu hoặc font không có ký tự cần thiết, ứng dụng báo lỗi để quản trị viên xử lý.

## Cấu hình máy chủ

Chỉ cung cấp các tệp sau khi đã xác minh giấy phép cho phép máy chủ gửi tệp font cho đúng đối tượng người dùng của website **và** cho phép nhúng tập con trong PDF. Giấy phép dùng font trên máy tính hoặc cờ kỹ thuật cho phép nhúng trong tài liệu không cấp quyền phân phối font qua HTTP. [Microsoft Font FAQ](https://learn.microsoft.com/en-us/typography/fonts/font-faq)

Cấu hình máy chủ phục vụ bốn tệp TTF dưới đường dẫn tương đối với trang Lịch:

- `assets/fonts/times-new-roman/TimesNewRoman-Regular.ttf`
- `assets/fonts/times-new-roman/TimesNewRoman-Bold.ttf`
- `assets/fonts/times-new-roman/TimesNewRoman-Italic.ttf`
- `assets/fonts/times-new-roman/TimesNewRoman-BoldItalic.ttf`

Đặt tệp qua cấu hình máy chủ hoặc quy trình cung cấp tài nguyên riêng đã được cấp phép. URL phải cùng origin với trang và trả trực tiếp nội dung font. Nếu giấy phép chỉ cho phép phân phối nội bộ, dùng máy chủ nội bộ có kiểm soát truy cập cho cả website và font. Với GitHub Pages công khai, chỉ bật PDF Lịch khi có quyền phân phối công khai các tệp font gốc theo cách này. Hiện kho mã không cung cấp bốn tệp đó.

## Kiểm thử

Chạy `npm ci`, `npm run build` và `npm test`. Đặt `FONT_QA_DIR` trỏ tới thư mục bên ngoài kho chứa bộ Times New Roman được phép dùng QA. Máy chủ Chromium dùng bốn tệp `Times.TTF`, `Timesbd.TTF`, `Timesi.TTF` và `Timesbi.TTF` trong thư mục đó để mô phỏng đường dẫn phục vụ font. Chạy tiếp `python3 tests/verify_times_pdf.py` với PyMuPDF, python-docx và pdffonts để kiểm tra PDF và DOCX vừa tạo.

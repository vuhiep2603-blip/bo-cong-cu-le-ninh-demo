# Đối chiếu mẫu Word và thử chuyển đổi PDF Lịch công tác

Dùng mẫu được cung cấp `Lich_cong_tac_tuan_20261116_20261122 (1).docx` làm chuẩn. Mẫu gốc và tệp thử không được đưa vào kho. Bản thử dùng cấu trúc và định dạng của mẫu với bảy hoạt động và ghi chú giả lập.

## Đối chiếu thể thức

- DOCX dùng khổ A4, lề trái 2,1 cm, phải 1,7 cm, trên 1,65 cm, dưới 1,7 cm, chữ Times New Roman 13 pt, giãn dòng 300/240 (1,25) và bảng hai cột cho bảy ngày như mẫu. Đã đổi lưới phần đầu sang 3887/5865 twip và đệm trái/phải 10 twip theo mẫu.
- Bản xem trước, DOCX và PDF đều hiển thị dòng “ĐẢNG UỶ XÃ LỆ NINH” ở nét thường, “VĂN PHÒNG” và hai dòng tiêu đề ở nét đậm. Dấu sao giữ định dạng riêng có sẵn của mỗi đầu ra.
- Bố cục PDF trực tiếp và bản xem trước dùng dàn trang hiện có. Các đầu ra không được kỳ vọng trùng từng điểm ảnh với một trình kết xuất Word.

## Thử nghiệm chuyển đổi

Mẫu DOCX có khai báo tên Times New Roman trong Open XML nhưng không chứa tài nguyên font. Đã dùng LibreOffice headless và một trang thử tĩnh dùng docx-preview 0.3.7 với chức năng in PDF của Chromium. Máy chủ thử chỉ phục vụ tệp tĩnh, tương tự mô hình GitHub Pages. Cùng một DOCX được thử trong hai cấu hình font. Cả bốn PDF đọc lại đủ bảy hoạt động giả lập bằng pdftotext.

| Cách chuyển | Khi có đủ Times New Roman trên máy | Khi thiếu Times New Roman |
| --- | --- | --- |
| LibreOffice headless | A4 1 trang, nhúng bốn kiểu Times New Roman | A4 1 trang, nhúng Liberation Serif |
| docx-preview và in Chromium với CSS mặc định | A4 2 trang, nhúng bốn kiểu Times New Roman | A4 2 trang, nhúng Liberation Serif |

Đã xác nhận site GitHub Pages hiện tại trả HTTP 200 cho trang Lịch. Pages là dịch vụ lưu trữ tĩnh, có thể phục vụ DOCX và JavaScript xem trước nhưng không chạy LibreOffice theo yêu cầu từ người dùng. Bản thử Chromium có thể đọc DOCX và in trên máy người dùng, song font phụ thuộc máy và số trang khác bản kết xuất LibreOffice. Không triển khai bản thử lên website. [Tài liệu GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)

Giữ xuất DOCX và đường xuất PDF trực tiếp. PDF trực tiếp tự lấy đúng bốn tệp font cùng origin theo [hướng dẫn cung cấp font](TIMES_NEW_ROMAN.md) và báo lỗi khi thiếu, không yêu cầu người dùng chọn tệp. Trên Pages, cần xác minh quyền phục vụ công khai và nhúng PDF trước khi cấu hình các tệp font. Một phương án cho hệ thống nội bộ là chuyển DOCX bằng LibreOffice trên máy có bộ font hợp pháp. Nếu áp dụng phương án này, cần kiểm tra định dạng, font nhúng và nội dung sau khi chuyển, đồng thời xác minh quyền nhúng. Bản thử chỉ dùng font trong môi trường QA riêng.

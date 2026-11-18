# Báo cáo sửa font PDF Lịch — 17/11/2026

Repository đích: vuhiep2603-blip/bo-cong-cu-le-ninh-demo. Mốc main khảo sát: 4c641b75445fd86d9be72471c1e4e800c97d8710. Nhánh riêng: fix-times-new-roman-schedule-pdf. Chưa hợp nhất main hoặc triển khai website.

## Thay đổi

- lich-cong-tac.html: nhóm điều khiển font thu gọn, chọn 4 tệp, tùy chọn nhớ/thay/xóa; gọi mount riêng và cập nhật mã cache cho app.js. Không sửa các hàm xử lý lịch.
- src/tnr-validate.js: đọc tên/cmap/OS2/head, phân loại 4 kiểu và kiểm tra tiếng Việt/quyền nhúng.
- src/tnr-fonts.js: quản lý bộ font riêng trong IndexedDB theo đường dẫn website; thay nguyên bộ sau khi kiểm tra; hỗ trợ phiên-only khi không lưu được.
- src/tnr-pdf.js: tài nguyên font riêng cho từng PDF, nhúng thật qua pdfMake; không sửa đăng ký font của Giấy mời.
- src/tnr-ui.js: điều khiển chọn/thay/xóa và thông báo.
- src/exports.js: chỉ đường xuất Lịch PDF chuyển sang renderer mới; các hàm Giấy mời/Word giữ nguyên từ nguồn build bản main.
- assets/app.js: build lại. Thêm nguồn/build/lockfile để có thể tái dựng vì kho trước đó chỉ có bundle.
- tests và tài liệu: kiểm thử, hướng dẫn; .gitignore ngăn font/bộ cài mới bị đưa vào Git.

Không có tệp font Times New Roman hoặc bộ cài font trong thay đổi. Các nguồn core/storage/stamp được khôi phục nguyên byte từ commit đã tạo bundle hiện tại; không thay logic. Trước khi sửa đã xác nhận bundle/HTML của main khớp nguồn commit 3ff4dd2 trong lịch sử làm việc.

## Font thật dùng riêng cho QA

Môi trường ban đầu không có Times New Roman. Đã lấy nguyên bộ Microsoft Core Fonts v2.82 từ mirror gói corefonts https://github.com/pushcx/corefonts ở commit 8f8627b0004b5f1b952c09cf6390e4ae46475e59, đọc EULA kèm theo và trích nguyên các font từ times32.exe để dùng nội bộ QA. EULA cho phép sử dụng và subset khi nhúng tài liệu. Không sửa/đổi font thành một họ khác, không cài vào máy người dùng, không đưa bộ cài/font/PDF kiểm thử vào Git. Tất cả nằm ngoài repository hoặc trong test-output bị bỏ qua.

UI không tự tải font từ mirror này hoặc bất kỳ dịch vụ nào. Người dùng chọn bộ được cấp phép của mình; ứng dụng không xác nhận quyền pháp lý chỉ từ tên font.

## Kết quả

- 5 kiểm thử validator đạt khi có FONT_QA_DIR: đổi tên Liberation vẫn bị từ chối, tệp hỏng, đủ 4 Times thật, trùng kiểu/thiếu glyph, cờ cấm nhúng/no-subsetting/bitmap-only và cờ kiểu chữ mâu thuẫn.
- 11 lượt trình duyệt Chromium Linux đạt với bộ Times thật: thiếu font báo rõ; chọn sai/thiếu bị chặn; nhớ qua reload; thay/xóa; thay sai giữ bộ cũ; phiên-only; chặn riêng kho font vẫn dùng bộ mới trong phiên và lưu lịch bình thường; Word/preview/save/reload/backup/restore; Giấy mời không thay; mobile 320/390 và desktop 1440 không tràn ngang.
- Dữ liệu tuần 16/11/2026–22/11/2026, tiếng Việt có dấu và chuỗi Unicode NFD; PDF đọc lại đúng nội dung NFC tương đương.
- PDF Lịch ngắn 1 trang, PDF có dấu 1 trang và bản dài 7 trang đều đọc được, không mất hoạt động 1–24 hoặc ghi chú cuối.
- Kiểm tra pdffonts và PyMuPDF: cả bốn Times New Roman được nhúng, subset và Unicode; không Liberation Serif, Times-Roman hoặc font thay thế trong PDF Lịch.
- Đọc lại 6 PDF Times: A4, khối chữ trong lề, không cắt chữ ra ngoài trang; bản có dấu chỉ trang đầu, vị trí 91/32pt và kích thước 113×113pt như trước.
- Word giữ bảng đủ 7 ngày và không dấu. Backup JSON không chứa bộ font. Các HTML Giấy mời/index/hướng dẫn cũ, logo, dấu và ba mẫu DOCX giữ nguyên byte so với main. src/core.js, src/storage.js và src/stamp.js giữ nguyên byte so với nguồn build đã nghiệm thu.
- Theo dõi mạng: không POST/upload font hoặc yêu cầu font ngoài origin. Khi xuất Lịch không tải Liberation Serif. Giấy mời vẫn xuất bằng Liberation Serif theo nhánh cũ, đúng giới hạn phạm vi.

## Bằng chứng pdffonts của PDF Lịch

name                                  type          encoding    emb sub uni
TimesNewRomanPS-BoldMT                 CID TrueType  Identity-H  yes yes yes
TimesNewRomanPS-ItalicMT               CID TrueType  Identity-H  yes yes yes
TimesNewRomanPSMT                      CID TrueType  Identity-H  yes yes yes
TimesNewRomanPS-BoldItalicMT           CID TrueType  Identity-H  yes yes yes

Trong tệp thực, tên có tiền tố subset như BZZZZZ+. Báo cáo pdffonts đầy đủ, JSON và ảnh QA ở test-output, không commit. Trang chẩn đoán dùng cả bốn kiểu chỉ phục vụ QA, không đổi mẫu Lịch.

## Giới hạn

- Chưa kiểm tra Microsoft Word/Windows, Safari/iOS hoặc thiết bị điện thoại thật. Mobile là viewport mô phỏng Chromium.
- Kiểm thử dương tính bằng Times New Roman v2.82; phiên bản khác có thể khác metric hoặc cờ nhúng. Ứng dụng kiểm tra lại bộ người dùng chọn, không cam kết mọi font mang tên tương tự đều được nhận.
- Giữ quy tắc dàn trang, không cam kết số dòng/trang trùng từng điểm ảnh với Liberation Serif hoặc giữa hai phiên bản Times. Trong các trường hợp đã thử, nội dung không tràn/cắt/mất.
- IndexedDB theo đường dẫn không phải ranh giới bảo mật giữa website cùng origin; đây là lưu font trên máy, không phải hệ thống DRM. Xóa dữ liệu trình duyệt có thể cần chọn font lại. Không đổi cơ sở dữ liệu lịch.
- Quyền ghi repository/PR phụ thuộc kết nối GitHub; chỉ báo đã tạo PR khi có URL PR thực tế. Không tự merge hoặc deploy.

## Trạng thái tạo PR thực tế

Đã commit vào nhánh local fix-times-new-roman-schedule-pdf. `git push` tới vuhiep2603-blip/bo-cong-cu-le-ninh-demo bị từ chối quyền ghi HTTP 403. `gh pr create` vào đúng repository trả Forbidden từ GitHub API. Chưa có URL PR thật; không tạo PR sang repository khác để thay thế.

Cần cấp quyền ghi mã và tạo Pull Request cho kết nối GitHub của phiên làm việc trên đúng repository đích. Không thay main, không triển khai Pages. Có thể dùng patch bàn giao để chủ repository tự tạo nhánh/PR như hướng dẫn dưới đây.

# Áp dụng patch và tạo PR — chưa triển khai

Kho đích: vuhiep2603-blip/bo-cong-cu-le-ninh-demo. Patch được tạo từ main 4c641b75445fd86d9be72471c1e4e800c97d8710, gồm nguồn, build, kiểm thử, tài liệu và bundle đã dựng. Không có Times New Roman hoặc bộ cài font trong patch hoặc ZIP.

Kết nối Codex hiện bị GitHub từ chối quyền ghi repo đích (403); GitHub API cũng từ chối tạo PR. Chưa tạo được PR. Có thể cấp lại quyền repo cho kết nối rồi yêu cầu tiếp tục đẩy nhánh/tạo PR; không gửi token vào chat.

Hoặc chủ repo tự áp dụng bằng Git trên máy:

```sh
git clone https://github.com/vuhiep2603-blip/bo-cong-cu-le-ninh-demo.git
cd bo-cong-cu-le-ninh-demo
git switch -c fix-times-new-roman-schedule-pdf
git apply --check ../TimesNewRoman_SchedulePDF.patch
git apply ../TimesNewRoman_SchedulePDF.patch
npm ci
npm run build
git add .gitattributes .gitignore build.mjs package.json package-lock.json src tests docs lich-cong-tac.html assets/app.js
git commit -m "Use local embedded Times New Roman for schedule PDFs"
git push -u origin fix-times-new-roman-schedule-pdf
```

Nếu main đã thay đổi so với mốc ghi ở trên và git apply --check báo lỗi, dừng và đối chiếu/rebase, không dùng tùy chọn ép ghi đè. Nếu đã có checkout, bỏ bước clone và dùng đúng thư mục của kho đích.

Vào GitHub → Pull requests → New pull request, chọn base main và compare fix-times-new-roman-schedule-pdf, tạo PR (có thể Draft). Đọc docs/TNR_TEST_REPORT.md và docs/TIMES_NEW_ROMAN.md trước khi duyệt. Không merge hoặc cập nhật Pages trước khi nghiệm thu.

ZIP runtime LeNinh_TimesNewRoman_PDFLich.zip chỉ chứa lich-cong-tac.html và assets/app.js, giữ cấu trúc để đối chiếu/thử trên bản sao website. Không tải lên main để thay cho quy trình PR khi chưa duyệt. Giấy mời và các tài nguyên cũ được giữ nguyên; Liberation Serif hiện có vẫn phục vụ Giấy mời, không phải font dự phòng cho PDF Lịch.

Để kiểm thử font thật trên máy phát triển, đặt FONT_QA_DIR tới thư mục ngoài repo chứa bốn Times New Roman hợp pháp. Chạy npm test rồi python tests/verify_times_pdf.py (QA cần công cụ pdffonts/PyMuPDF/python-docx). Không chép font vào source hoặc test-output đem commit. Không có font thật thì bài tương ứng báo skip, không coi là đã xác minh font nhúng.

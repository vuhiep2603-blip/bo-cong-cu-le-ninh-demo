# Lộ trình & Cấu trúc mở rộng: Tích hợp Hệ thống Tổng hợp Báo cáo (Công cụ thứ 4)

Bộ công cụ Văn phòng Đảng ủy xã Lệ Ninh (`https://vpdu-leninh.github.io/`) được thiết kế theo kiến trúc **1 nguồn mã duy nhất (Single Source of Truth)** để có thể bổ sung **Hệ thống Tổng hợp Báo cáo** bất cứ lúc nào mà không làm ảnh hưởng 3 công cụ đã nghiệm thu (**Tạo Giấy mời**, **Lịch công tác tuần**, **Quản lý, theo dõi nhiệm vụ**).

## 1. Kiến trúc chuẩn cho công cụ thứ 4
1. **Trang công cụ (`tong-hop-bao-cao.html`):**
   - Tái sử dụng trực tiếp mẫu giao diện `theo-doi-nhiem-vu.html` + `assets/task-manager.css` (nếu nhúng Web App Google Apps Script `/exec`) hoặc kiến trúc tĩnh chạy trình duyệt tương tự `giay-moi.html` / `lich-cong-tac.html`.
   - Dùng 100% đường dẫn tương đối (`./index.html`, `./assets/...`) để chạy đồng thời trên cả `https://vpdu-leninh.github.io/` và `https://vuhiep2603-blip.github.io/bo-cong-cu-le-ninh-demo/`.
2. **Nâng cấp trang chủ (`index.html`):**
   - Bổ sung thẻ `<a class="card" href="./tong-hop-bao-cao.html">` thứ 4 vào `.cards`.
   - Điều chỉnh `.cards` trên màn hình Desktop (`>= 1021px`) thành lưới cân đối `repeat(2, minmax(0, 1fr))` (2×2) hoặc `repeat(4, minmax(0, 1fr))`; Tablet `2×2`; iPhone `1 cột`.
3. **Cập nhật thanh điều hướng ngang (`.suiteNav`):**
   - Bổ sung liên kết `<a href="./tong-hop-bao-cao.html">📊 Tổng hợp báo cáo</a>` tại `giay-moi.html` và `lich-cong-tac.html`.
4. **Cập nhật danh sách xuất bản tự động (`scripts/prepare-org-pages.mjs`):**
   - Thêm `'tong-hop-bao-cao.html'` vào mảng `ALLOWED_ROOT_FILES`.
   - Ngay sau khi Merge PR vào `main`, GitHub Actions (`sync-org-pages.yml`) tự động chạy Secret Guard và đẩy lên `https://vpdu-leninh.github.io/` với chi phí **0 đồng**.

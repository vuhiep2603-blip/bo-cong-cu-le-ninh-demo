# Nghiệm thu Google Sign-In trên GitHub Pages

## Phạm vi

Dùng Firebase Web App của project Spark `vpduln-quanlynhiemvu` với auth domain `vpduln-quanlynhiemvu.firebaseapp.com`. Giữ Firestore `(default)` ở chế độ từ chối toàn bộ. Sau xác thực, webapp chỉ thử đọc hồ sơ `users/{uid}`. Khi hồ sơ không tồn tại hoặc Rules từ chối đọc, màn hình hiển thị “Tài khoản chưa được cấp quyền” và vẫn cho đăng xuất. Luồng này không tạo hồ sơ hay mở màn hình nghiệp vụ.

Đăng nhập Google lần đầu có thể tạo bản ghi ở **Firebase Authentication → Users**. Đây là dữ liệu Firebase, tách biệt với hồ sơ Firestore. Nếu nghiệm thu phải giữ nguyên danh sách Authentication, dùng tài khoản Google thử nghiệm đã có trong Authentication của chính project. Nếu chưa có tài khoản phù hợp, phải xin chấp thuận riêng trước khi dùng một tài khoản mới.

## Chuẩn bị gói tĩnh

1. Checkout commit của PR đã được duyệt để thử. Trong `nhiem-vu/`, nạp bốn biến từ Web config đã đăng ký. Dùng `.env.local` đã bị Git bỏ qua hoặc biến cấu hình của job build. Không đưa mật khẩu, service account, dữ liệu cán bộ hoặc thông tin phiên đăng nhập vào GitHub.
2. Chạy `npm ci`, `npm run build`, rồi từ gốc kho chạy `node nhiem-vu/package-pages.mjs <thư_mục_mới_ngoài_checkout>`. Gói đầu ra chỉ gồm các trang tĩnh hiện có, tài nguyên và bundle Vite tại `nhiem-vu/`. `.env.local`, mã kiểm thử và trang đăng nhập giả lập không nằm trong gói. Các giá trị Web config công khai đi vào bundle khi build.
3. Mở gói qua HTTP cục bộ dưới đường dẫn con và kiểm tra trang chủ, nút Google của `/nhiem-vu/` và đường dẫn trở lại Bộ công cụ. So sánh byte của `giay-moi.html`, `lich-cong-tac.html` và `assets/` với bản đang dùng trên `main`. Chạy kiểm thử hồi quy của Bộ công cụ trước khi xuất bản.

## Phương án xuất bản đã tách khỏi website đang dùng

Sau khi được chấp thuận, dùng một repository **thử công khai** riêng thuộc cùng chủ sở hữu `vuhiep2603-blip`, chẳng hạn `bo-cong-cu-le-ninh-auth-qa`. Xuất bản gói tĩnh đã kiểm tra qua Pages của kho thử. URL dự kiến là `https://vuhiep2603-blip.github.io/bo-cong-cu-le-ninh-auth-qa/nhiem-vu/`. Firebase Authorized Domains kiểm tra tên máy chủ, nên đường dẫn khác vẫn dùng domain đã có `vuhiep2603-blip.github.io`. Giữ nguyên nguồn Pages từ `main` của kho chính. Phương án này dùng GitHub Pages công khai và Spark, không cần backend riêng.

URL kho thử chỉ là đề xuất. Chưa tạo kho, đổi cấu hình Pages hoặc xuất bản. GitHub Pages dùng chung origin giữa các repository cùng tài khoản. Khi mở các trang Giấy mời hoặc Lịch từ kho thử, dùng hồ sơ trình duyệt sạch để tránh đọc hoặc sửa dữ liệu cục bộ của website đang dùng.

## Checklist người quản trị

1. Mở URL HTTPS của kho thử trong trình duyệt sạch. Xác nhận có nút **Đăng nhập bằng Google**, logo và đường quay lại Bộ công cụ.
2. Bấm nút Google, chọn tài khoản thử đã được chấp thuận tại hộp thoại Google. Nếu popup bị chặn, cho phép popup cho domain Pages. Nếu báo domain chưa được phép, kiểm tra hostname hiện tại và Authorized Domains mà không thay đổi cấu hình trong lượt nghiệm thu.
3. Sau khi quay về webapp, xác nhận có nút **Đăng xuất**, thông báo **Tài khoản chưa được cấp quyền** và không có màn hình nghiệp vụ. Với Rules khóa toàn bộ, client không thể phân biệt hồ sơ thiếu với hồ sơ đã có nhưng bị chặn. Nếu cần xác minh hồ sơ thử chưa tồn tại, chỉ kiểm tra trong Firebase Console với quyền xem sẵn có.
4. Bấm **Đăng xuất**. Xác nhận nút Google xuất hiện trở lại, nút Đăng xuất biến mất và tải lại trang không khôi phục phiên webapp. Đăng xuất webapp không đăng xuất tài khoản khỏi dịch vụ Google.
5. Ghi lại commit, URL, trình duyệt và kết quả của từng bước. Bỏ thông tin cá nhân khỏi ảnh hoặc nhật ký nghiệm thu.

## Kết quả Codex Cloud

- Firebase Auth Project Config và OAuth handler phản hồi HTTP 200 trong kiểm tra chỉ đọc; domain Pages có trong danh sách được phép. GET Firestore không xác thực trả HTTP 403 `PERMISSION_DENIED`.
- Trình duyệt đã thử gói build tĩnh dưới đường dẫn con kiểu Pages. GitHub Pages của kho chính đang lấy từ `main` và đường dẫn công khai `/nhiem-vu/` chưa có, trả HTTP 404.
- Playwright với Auth/Firestore Emulator kiểm tra tài khoản chưa cấp quyền, khóa tài khoản và đăng xuất. Ca Rules khóa toàn bộ xác nhận tài khoản đã xác thực vẫn bị từ chối, không sinh hồ sơ và không khôi phục phiên sau tải lại.
- Đăng nhập Google thật và đăng xuất trên GitHub Pages **chưa kiểm chứng**. Việc xác nhận endpoint, domain và bản build không thay thế lượt xác thực có tương tác của người nghiệm thu.

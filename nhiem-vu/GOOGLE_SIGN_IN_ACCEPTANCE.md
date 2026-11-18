# Nghiệm thu Google Sign-In trên GitHub Pages

## Phạm vi

Dùng Firebase Web App của project Spark `vpduln-quanlynhiemvu` với auth domain `vpduln-quanlynhiemvu.firebaseapp.com`. Giữ Firestore `(default)` ở chế độ từ chối toàn bộ. Sau xác thực, webapp chỉ thử đọc hồ sơ `users/{uid}`. Khi hồ sơ không tồn tại hoặc Rules từ chối đọc, màn hình hiển thị “Tài khoản chưa được cấp quyền” và vẫn cho đăng xuất. Luồng này không tạo hồ sơ hay mở màn hình nghiệp vụ.

Đăng nhập Google lần đầu có thể tạo bản ghi ở **Firebase Authentication → Users**. Đây là dữ liệu Firebase, tách biệt với hồ sơ Firestore. Nếu nghiệm thu phải giữ nguyên danh sách Authentication, dùng tài khoản Google thử nghiệm đã có trong Authentication của chính project. Nếu chưa có tài khoản phù hợp, phải xin chấp thuận riêng trước khi dùng một tài khoản mới.

## Chuẩn bị gói tĩnh

1. Checkout commit của PR đã được duyệt để thử. Trong `nhiem-vu/`, nạp bốn biến từ Web config đã đăng ký. Dùng `.env.local` đã bị Git bỏ qua hoặc biến cấu hình của job build. Không đưa mật khẩu, service account, dữ liệu cán bộ hoặc thông tin phiên đăng nhập vào GitHub.
2. Chạy `npm ci` rồi `npm run build:auth-qa` trong `nhiem-vu/`. Từ gốc kho, chạy `node nhiem-vu/package-pages.mjs <thư_mục_mới_ngoài_checkout> --auth-qa`. Build QA chỉ nhận cấu hình Web App của project đã nêu và từ chối Emulator.
3. Gói gồm `.nojekyll` và `nhiem-vu/` chứa HTML, CSS, logo và JavaScript giao diện/Firebase Web SDK. Gói này không có màn hình nghiệp vụ kể cả khi một hồ sơ có quyền, cũng không có tệp nguồn, dữ liệu, tài khoản mô phỏng, trang demo, trình đọc tài liệu, Giấy mời hoặc Lịch công tác. Web config công khai đi vào bundle tại thời điểm build.
4. Phục vụ gói thử qua HTTP cục bộ dưới đường dẫn con và xác nhận nút Google hoạt động ở mức khởi tạo SDK. Hai công cụ cũ vẫn được phục vụ từ kho chính và được kiểm thử hồi quy riêng.

## Phương án xuất bản

1. Sau khi được chấp thuận riêng, tạo repository công khai `vuhiep2603-blip/bo-cong-cu-le-ninh-auth-qa`. Đưa **nội dung đã build** của gói QA vào nhánh `main` của kho thử, giữ `.nojekyll` tại gốc và `nhiem-vu/index.html` tại đúng vị trí. Ghi lại SHA của nguồn build để nghiệm thu.
2. Tại **Settings → Pages** của **kho thử**, chọn **Deploy from a branch**, nhánh `main`, thư mục `/(root)`. Kiểm tra build Pages và HTTPS của **kho thử**. Dự kiến URL là `https://vuhiep2603-blip.github.io/bo-cong-cu-le-ninh-auth-qa/nhiem-vu/`.
3. Giữ nguyên Pages của kho chính, không thay domain và không cập nhật Rules. Firebase Authorized Domains kiểm tra hostname `vuhiep2603-blip.github.io`, đã được phép. Phương án dùng GitHub Pages công khai và Spark.

Hai website **cùng hostname và cùng origin**, dù nằm ở repository và đường dẫn khác nhau. Trước khi mở URL thử, tạo **hồ sơ trình duyệt riêng**, dùng hồ sơ đó suốt lượt nghiệm thu và không mở công cụ chính trong hồ sơ thử. Điều này tránh dùng chung phiên Firebase Auth, cookie và bộ nhớ website với hồ sơ vận hành. URL thử hiện là dự kiến, chưa tạo repository hay xuất bản.

## Checklist người quản trị

1. Mở URL HTTPS của kho thử trong trình duyệt sạch. Xác nhận có nút **Đăng nhập bằng Google** và tiêu đề nghiệm thu.
2. Bấm nút Google, chọn tài khoản thử đã được chấp thuận tại hộp thoại Google. Nếu popup bị chặn, cho phép popup cho domain Pages. Nếu báo domain chưa được phép, kiểm tra hostname hiện tại và Authorized Domains mà không thay đổi cấu hình trong lượt nghiệm thu.
3. Sau khi quay về webapp, xác nhận có nút **Đăng xuất**, thông báo **Tài khoản chưa được cấp quyền** và không có màn hình nghiệp vụ. Với Rules khóa toàn bộ, client không thể phân biệt hồ sơ thiếu với hồ sơ đã có nhưng bị chặn. Nếu cần xác minh hồ sơ thử chưa tồn tại, chỉ kiểm tra trong Firebase Console với quyền xem sẵn có.
4. Bấm **Đăng xuất**. Xác nhận nút Google xuất hiện trở lại, nút Đăng xuất biến mất và tải lại trang không khôi phục phiên webapp. Đăng xuất webapp không đăng xuất tài khoản khỏi dịch vụ Google.
5. Ghi lại commit, URL, trình duyệt và kết quả của từng bước. Bỏ thông tin cá nhân khỏi ảnh hoặc nhật ký nghiệm thu.

## Kết quả Codex Cloud

- Firebase Auth Project Config và OAuth handler phản hồi HTTP 200 trong kiểm tra chỉ đọc; domain Pages có trong danh sách được phép. GET Firestore không xác thực trả HTTP 403 `PERMISSION_DENIED`.
- Trình duyệt đã thử gói build tĩnh dưới đường dẫn con kiểu Pages. GitHub Pages của kho chính đang lấy từ `main` và đường dẫn công khai `/nhiem-vu/` chưa có, trả HTTP 404.
- Playwright với Auth/Firestore Emulator kiểm tra tài khoản chưa cấp quyền, khóa tài khoản và đăng xuất. Ca Rules khóa toàn bộ trên cả hai giao diện xác nhận tài khoản đã xác thực vẫn bị từ chối, không sinh hồ sơ và không khôi phục phiên sau tải lại. Ca bổ sung xác nhận kể cả ADMIN đang hoạt động cũng không truy cập màn hình nghiệp vụ từ gói QA.
- Đăng nhập Google thật và đăng xuất trên GitHub Pages **chưa kiểm chứng**. Việc xác nhận endpoint, domain và bản build không thay thế lượt xác thực có tương tác của người nghiệm thu.

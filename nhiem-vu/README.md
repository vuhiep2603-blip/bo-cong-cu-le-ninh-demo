# Quản lý nhiệm vụ tham mưu

Mô-đun tiếng Việt tại `/nhiem-vu/`, dùng React, TypeScript, Vite, Firebase Authentication (Google) và Cloud Firestore Standard. Mô-đun dùng logo hiện có và có đường vào tại trang chủ Bộ công cụ.

## Chạy thử

Cần Node.js 22.12+ và Java 21 cho Firestore Emulator. Chạy các lệnh sau trong `nhiem-vu/`.

```sh
npm ci
npm run build
npm test
npm run test:rules
```

Để kiểm thử toàn bộ luồng trình duyệt, mở Emulator cho project giả lập trong terminal riêng, rồi chạy Playwright:

```sh
npx firebase emulators:start --only auth,firestore --project demo-vpdu
# Terminal khác
npx playwright install chromium
npm run test:browser
```

Playwright dùng danh tính Google giả lập với Auth Emulator và kiểm tra Firestore Rules. Đặt `CHROMIUM_PATH` để dùng Chromium cài sẵn hoặc `VPDU_PREVIEW_DIR` để xuất ảnh. Bộ Playwright xóa dữ liệu Firestore của project **giả lập** trước khi chạy.

### Xem thử với năm cán bộ và nhiệm vụ giả lập

Sau khi chạy Auth và Firestore Emulator theo lệnh trên, mở terminal khác trong `nhiem-vu/`:

```sh
npm run demo:seed
npm run dev:demo
```

Mở `http://127.0.0.1:4180/tests/demo.html` và chọn VP01 để xem tổng quan, giao nhiệm vụ và nghiệm thu. Chọn VP03 để xem danh sách cá nhân và cập nhật công việc. VP02 có một nhiệm vụ được ủy quyền, VP04 là người phối hợp, VP05 bị khóa. Có thêm một danh tính chưa được cấp quyền để kiểm tra màn hình từ chối. Dữ liệu mẫu chỉ ghi vào Emulator trên loopback. Chạy lại lệnh nạp sẽ giữ dữ liệu của phiên Emulator đã được nạp mẫu. Trang chọn tài khoản thử nghiệm nằm ngoài bản build.

## Kết nối Firebase Spark với project hiện có

1. Dùng project **`vpduln-quanlynhiemvu`** đã có trên gói **Spark** và Firestore **`(default)`**. Trong **Project settings → General → Your apps**, chọn ứng dụng Web hiện có hoặc đăng ký một ứng dụng Web nếu chưa có, rồi lấy Web config. Email, điện thoại và Firebase UID của cán bộ chỉ nhập trong Firebase, tuyệt đối không đưa vào Git hoặc biến build. Cấu hình Web Firebase là thông tin định danh công khai của ứng dụng. Quyền dữ liệu phụ thuộc vào Rules, không phụ thuộc vào việc giấu Web API key.
2. Project đã bật Google và đã có domain `vuhiep2603-blip.github.io` trong **Authorized domains** theo thông tin bàn giao. Giữ cấu hình đó. Dùng Emulator để thử trên máy mà không thêm domain vào project thật.
3. Project hiện chặn toàn bộ đọc/ghi Firestore. Giữ nguyên trong giai đoạn nghiệm thu. Khi đã được phê duyệt, người quản trị project mới xem xét cập nhật Rules cho database mặc định bằng lệnh:
   ```sh
   npx firebase login
   npx firebase deploy --only firestore:rules --project vpduln-quanlynhiemvu
   ```
4. Đăng nhập Google lần đầu để Firebase Authentication tạo bản ghi. Tài khoản chưa được cấp quyền sẽ thấy thông báo từ chối. Người quản trị project kiểm chứng danh tính và lấy UID/email trong **Authentication → Users**, rồi tạo tài liệu **`users/{UID}`** trong Firebase Console với các trường:
   - `code`: string, `VP01`.
   - `name`: string, họ tên Chánh Văn phòng.
   - `email`: string, khớp chính xác email Google đã xác minh.
   - `role`: string, `ADMIN`.
   - `active`: boolean, `true`.
   - `phone`: string, để trống nếu không cần.

   Chỉ người có quyền quản trị Firebase Console mới bootstrap hoặc chỉnh tài khoản ADMIN. Quyền quản trị project cần giới hạn và có xác thực đa yếu tố theo chính sách tổ chức.
5. Cấp bốn tài khoản còn lại trong màn hình **Quản trị cán bộ** sau khi xác minh UID/email. `VP02` là DEPUTY. `VP03`, `VP04` và `VP05` là SPECIALIST. Số điện thoại thuộc danh mục cán bộ. Đăng nhập dùng Google.
6. Để chuẩn bị kết nối thật, sao chép `.env.example` thành `.env.local`. Project ID và auth domain mặc định đã điền. Lấy `apiKey` và `appId` từ Web config trong Firebase Console và đối chiếu `authDomain`. Google Sign-In có thể xác thực danh tính, nhưng ứng dụng sẽ từ chối mở dữ liệu khi Rules còn chặn toàn bộ. Chế độ demo chỉ kết nối project `demo-vpdu` trong máy phát triển. Không ghi mật khẩu, service account hoặc token quản trị vào biến `VITE_*`, vì Vite công khai chúng trong bundle.

## Chuẩn bị GitHub Pages

Build Vite với bốn biến `VITE_FIREBASE_*` trong `.env.example`. Nội dung `nhiem-vu/dist/` cần được đặt tại `nhiem-vu/` trong artifact website, cùng với `index.html`, `lich-cong-tac.html`, `giay-moi.html`, `HUONG_DAN.html`, `.nojekyll` và `assets/` gốc. Có thể chạy `node nhiem-vu/package-pages.mjs <thư_mục_output_mới>` từ checkout sau khi build để tạo đúng artifact. Chạy một máy chủ HTTP trong thư mục đầu ra và kiểm tra đường dẫn `/nhiem-vu/` trước khi xuất bản.

Khi đã được phê duyệt, cấu hình Pages dùng GitHub Actions với quyền `pages: write` và `id-token: write` chỉ ở job xuất bản. Bước build dùng `npm ci`, `npm run build` trong `nhiem-vu/` và script đóng gói trên. Dùng `actions/upload-pages-artifact` và `actions/deploy-pages` cho artifact đã kiểm tra. Lưu Web config dưới dạng Repository Variables, không đưa credential quản trị vào workflow. Cách triển khai từ thư mục gốc của nhánh sẽ không tự build Vite.

## Kiến trúc và quyền dữ liệu

| Nơi lưu | Nội dung và quyền |
| --- | --- |
| `users/{uid}` | Hồ sơ đối chiếu UID, email đã xác minh và trạng thái kích hoạt. Một người xem hồ sơ của mình. ADMIN xem danh mục, cấp và khóa cán bộ ngoài ADMIN. |
| `tasks/{id}` | Nội dung đã duyệt, người chủ trì ở đầu danh sách người tham gia, hạn, yêu cầu sản phẩm, giai đoạn, tiến độ, trạng thái và con trỏ nhật ký. ADMIN xem toàn bộ. Người tham gia xem việc được giao. DEPUTY xem thêm việc có tên trong trường ủy quyền. |
| `tasks/{id}/updates`, `results`, `reviews` | Lịch sử tiếp nhận, tiến độ, chỉnh hạn/ủy quyền, nộp và nghiệm thu. Nhật ký chỉ được thêm cùng giao dịch chuyển trạng thái; không sửa/xóa qua client. |
| `sourceDocuments/{id}` | Số, ký hiệu và trích yếu đã duyệt nếu chọn lưu. Cùng ID với nhiệm vụ và chỉ ADMIN được xem. |
| `systemSettings/{YYYY}` | Bộ đếm phân mã `NV-VP-YYYY-NNNN` theo năm giờ Việt Nam. |

Firestore Rules mặc định từ chối. Giao việc tạo bản ghi và tăng bộ đếm trong một giao dịch. Khi hai phiên cạnh tranh, Firestore thử lại; client chỉ thử thêm khi lần đọc mới xác nhận bộ đếm đã đổi. Tiến độ, kết quả và nhận xét gắn với thao tác nguyên tử. Client kiểm tra con trỏ nhật ký trước khi cập nhật để tránh ghi đè thay đổi vừa xảy ra. Chuyên viên chỉ ghi tiến độ/kết quả cho việc mình tham gia. ADMIN có thể thay hạn và ủy quyền theo nhiệm vụ; ủy quyền nghiệm thu tự hết hiệu lực ở phía Rules, và ADMIN có thể thu hồi quyền đọc theo ủy quyền bằng cách bỏ người được ủy quyền. Báo cáo lọc theo thời hạn và tính quá hạn theo giờ Việt Nam; nhiệm vụ phối hợp được tính cho từng người tham gia.

Mammoth và PDF.js trích văn bản cục bộ. `TaskAnalyzer` là interface cho bộ phân tích; phiên bản này dùng quy tắc, hiển thị trích đoạn và cho phép sửa, gộp, tách, bỏ trước khi giao. Tài liệu nguồn, trích đoạn chưa duyệt và danh sách đề xuất ở bộ nhớ tab. Kết quả nộp là mô tả hoặc đường dẫn văn bản; MVP kiểm tra có bản ghi kết quả trước nghiệm thu. Quyền truy cập, tính tồn tại và nội dung của tệp bên ngoài cần người nghiệm thu kiểm tra. MVP không hỗ trợ OCR, tải tệp kết quả lên, sao lưu Firestore tự động hay thông báo SMS.

## Chi phí và giới hạn

Theo hạn mức Firestore miễn phí của một database đủ điều kiện, Spark có 1 GiB lưu trữ, 50.000 lượt đọc/ngày, 20.000 lượt ghi/ngày, 20.000 lượt xóa/ngày và 10 GiB truyền ra/tháng. Đọc phát sinh khi mở hoặc làm mới listener và khi Rules cần đọc tài liệu phụ. Tổng quan và báo cáo tải các nhiệm vụ mà tài khoản được phép xem, phù hợp quy mô năm cán bộ; nếu lượng dữ liệu tăng, cần phân trang và giới hạn khoảng truy vấn. Xem Dashboard Usage trước khi đưa dữ liệu thật vào. Khi hết hạn mức, xử lý bằng giảm truy vấn hoặc chờ hạn mức phục hồi. Project giữ Spark, không kích hoạt Cloud Functions, Storage, SMS, OCR hay AI bên ngoài. [Hạn mức Firestore](https://firebase.google.com/docs/firestore/quotas) · [Các gói Firebase](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)

Kiểm thử thật bằng tài khoản Google đã cấp quyền trên một project thử nghiệm vẫn cần thực hiện trước khi xuất bản. Chỉ dùng dữ liệu giả lập trong bản xem trước và kiểm thử.

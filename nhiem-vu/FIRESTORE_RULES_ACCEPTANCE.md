# Rà soát và nghiệm thu Firestore Rules

Phạm vi là `firestore.rules`, luồng giao dịch của mô-đun `/nhiem-vu/` và project Spark `vpduln-quanlynhiemvu` với database `(default)`. Tất cả ca nghiệp vụ dùng dữ liệu giả lập trên Emulator. Hồ sơ VP01 trên project thật được ghi nhận theo thông tin bàn giao, chưa được truy cập hoặc xác minh bằng Codex.

## Phân quyền và bảo vệ dữ liệu

| Phạm vi | Quyền được kiểm soát |
| --- | --- |
| Xác thực | Phiên Google có email đã xác minh, UID và email trùng hồ sơ đang hoạt động. Tài khoản bị khóa có thể đọc đúng hồ sơ của mình để nhận thông báo. Tài khoản chưa cấp quyền không tự tạo hồ sơ. |
| Danh mục | ADMIN phải có cả vai trò ADMIN và mã VP01. ADMIN có thể cấp hồ sơ ngoài ADMIN, sửa tên/điện thoại/trạng thái của hồ sơ đó. Client không sửa vai trò, mã, email hay tạo hồ sơ ADMIN. |
| Nhiệm vụ | Mã năm/số thứ tự được cấp cùng giao dịch tạo nhiệm vụ. ADMIN được giao việc, chỉnh hạn và ủy quyền. Người được giao chỉ tiếp nhận, cập nhật và nộp kết quả với trường và trạng thái cho phép. |
| Nghiệm thu | ADMIN hoặc DEPUTY có mã VP02 và ủy quyền còn hiệu lực. DEPUTY không được nghiệm thu kết quả do chính mình nộp. Rules kiểm tra kết quả hiện hành thuộc đúng nhiệm vụ, người nộp thuộc danh sách được giao và nội dung hợp lệ. |
| Nhật ký | Ghi nhiệm vụ và nhật ký cùng giao dịch. Mỗi nhật ký mới gắn với đích chuyển trạng thái và `previousEvent` của phiên bản trước. Nhật ký nghiệm thu lưu `resultId` của kết quả đang nộp. Client không sửa hoặc xóa nhật ký. |

Nhật ký cũ không có hai trường liên kết vẫn đọc được. Khi áp dụng Rules mới, frontend cũ sẽ bị từ chối ghi nhật ký. Nếu có client cũ đã chạy, thông báo thời gian chuyển và cập nhật frontend đúng phiên bản trước khi cho phép ghi.

## Checklist nghiệm thu ADMIN trên bản đầy đủ

Dùng hồ sơ trình duyệt riêng và chạy Auth/Firestore Emulator trên loopback theo [README](README.md). Dùng `npm run demo:seed`, `npm run dev:demo` và chọn VP01 trong `/tests/demo.html`. Gói Pages dành cho OAuth chỉ kiểm tra đăng nhập/đăng xuất. Dùng bản đầy đủ trên Emulator cho các mục bên dưới. Không mở tài liệu công việc thật hoặc sử dụng website chính trong hồ sơ thử.

- [ ] VP01 thấy Tổng quan, Giao nhiệm vụ, Kiểm tra nghiệm thu, Báo cáo và Quản trị cán bộ.
- [ ] Giao nhiệm vụ giả lập có chủ trì, phối hợp, thời hạn và sản phẩm. Hai phiên giao đồng thời nhận hai mã khác nhau.
- [ ] VP03 tiếp nhận, cập nhật và nộp kết quả. Cập nhật cũ từ phiên khác không ghi đè phiên bản mới. VP03 không đổi hạn, chủ trì hay trạng thái hoàn thành.
- [ ] VP01 trả lại, VP03 nộp lại, VP01 nghiệm thu. Kiểm tra lịch sử hiển thị cả hai kết quả và hai lượt xem xét. Trong Emulator, đối chiếu `resultId` của từng lượt với kết quả tương ứng.
- [ ] VP02 duyệt trong phạm vi ủy quyền còn hiệu lực. Thử ủy quyền hết hạn hoặc thu hồi và thử nghiệm thu kết quả do VP02 nộp. Các thao tác đó bị từ chối.
- [ ] Thử VP05 bị khóa, tài khoản ngoài danh mục và truy cập danh mục bằng SPECIALIST. Không có màn hình nghiệp vụ cho tài khoản chưa được cấp quyền hoặc bị khóa.
- [ ] Đăng xuất và tải lại. Xác nhận không khôi phục phiên. Lưu kết quả kiểm thử, phiên bản commit và ảnh đã bỏ thông tin cá nhân.

## Triển khai Rules sau khi được phê duyệt

1. Chốt SHA của PR và lưu một bản Rules đang hoạt động từ Console vào nơi quản trị riêng. Ghi nhận bản đang khóa toàn bộ và chuẩn bị tệp khôi phục có thể xuất bản lại. Kiểm tra project ID, Spark và đúng database `(default)`.
2. Kiểm tra bản Rules đã nghiệm thu bằng Emulator. Kiểm tra bằng quyền xem trong Console rằng hồ sơ VP01 có sáu trường, mã VP01, vai trò ADMIN, `active=true` và email đúng với tài khoản Google có UID tương ứng. Chưa tạo hồ sơ khác trong lượt này.
3. Sau khi có phê duyệt riêng, người quản trị so sánh tệp `nhiem-vu/firestore.rules` tại SHA đã chốt với Rules hiện hành và xuất bản đúng mục **Firestore Database → Rules** của database mặc định. Nếu dùng CLI, từ `nhiem-vu/` chạy đúng lệnh `npx firebase deploy --only firestore:rules --project vpduln-quanlynhiemvu`. Lệnh không nằm trong quy trình build, không dùng deployment token trong Git, không kích hoạt Blaze.
4. Dùng tài khoản thử đã được phép và một bản đầy đủ được duyệt riêng để xác minh quyền đọc ADMIN. Chỉ đọc hồ sơ và quan sát UI nếu chưa có phê duyệt ghi. Kiểm tra tài khoản ngoài danh mục vẫn bị chặn. Chạy quy trình ghi ở Emulator cho đến khi có phê duyệt riêng. Website chính giữ nguyên.
5. Nếu phát hiện truy cập sai hoặc giao diện lỗi, xuất bản lại bản Rules khóa toàn bộ đã chuẩn bị. Xác nhận đọc trái quyền bị từ chối. Ghi nhận người thực hiện, thời điểm và SHAs. Quy trình này chưa được chạy trên project thật.

## Rủi ro còn lại

- Firebase Console, IAM và Admin SDK có thể bỏ qua Rules. Bảo vệ tài khoản có quyền project, kiểm tra đúng UID/email của VP01 và giới hạn người có quyền xuất bản.
- Hết hạn ủy quyền chặn nghiệm thu ở máy chủ. DEPUTY vẫn có thể đọc nhiệm vụ còn lưu UID ủy quyền cho đến khi ADMIN thu hồi, hoặc tiếp tục đọc nếu là người được giao. Dữ liệu đã từng hiển thị hoặc đã sao chép không thể thu hồi bằng Rules.
- ADMIN giữ quyền nghiệm thu, kể cả khi là người nộp. Nếu cần phân tách người lập và người duyệt cho ADMIN, phải chốt quy trình thay thế trước khi siết thêm.
- Mã cán bộ trùng được kiểm tra ở giao diện quản trị. Firebase Rules không áp ràng buộc duy nhất trên toàn bộ collection; ADMIN có quyền thêm hồ sơ ngoài ADMIN. Mã nhiệm vụ có cơ chế chống trùng riêng tại máy chủ.
- Rules kiểm tra bản ghi kết quả và liên kết, không kiểm chứng nội dung hoặc quyền mở tệp ở đường dẫn bên ngoài. Hạn nhập theo định dạng ngày, mã năm do frontend chọn theo giờ Việt Nam và mỗi năm tối đa 9.999 mã. Lưu ý quota Spark nếu số bản ghi và lượt đọc tăng.
- Emulator không xác nhận IAM, OAuth Google, quyền của hồ sơ thật hoặc việc phát hành Rules trên Firebase thật. Không thử bằng văn bản công việc thật.

## Kiểm thử

Chạy `npm run test:rules` hoặc Vitest với `FIRESTORE_EMULATOR_HOST` trỏ emulator cục bộ, rồi `npm run test:browser` theo README. Bộ test xóa dữ liệu giả lập của project `demo-vpdu` trước khi nạp fixture. Không dùng với địa chỉ Firestore thật.

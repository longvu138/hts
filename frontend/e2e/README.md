# Kiểm thử giao diện

Chạy frontend tại cổng 3109 rồi chạy `pnpm test:e2e`. Spec dashboard kiểm tra 390, 768, 1024 và 1440px, theme sáng/tối và quyền xem. Navigation kiểm tra đường dẫn không tồn tại, chặn route theo quyền và menu quản trị. Notifications dùng mock API, không ghi database.

Các spec auth, departments, staff-members và roles-permissions cần `E2E_USERS_JSON` cho tài khoản thử; thiếu credential sẽ skip có lý do. Global setup không reset hoặc seed database.

Report/video trong test-results và playwright-report chỉ nằm local.

Khi đã khai báo credential, lỗi đăng nhập/API/mạng là lỗi test, không được skip. `auth-helper.spec.js` kiểm tra quy tắc này. `management.spec.js` dùng mock để kiểm tra layout 390/768/1024/1440px, các form đã tách và retry khi tải lỗi.

- `work.spec.js`: giao việc/lịch/tình hình bằng mock API, không cần tài khoản E2E. Chạy `pnpm test:e2e e2e/work.spec.js`; có kiểm tra responsive, dark mode, quyền và form nhiều khung giờ. Không sửa dữ liệu thật.

- `app-shell.spec.js`: khung ứng dụng bằng mock API (đổi người dùng không lộ cache React Query, tiêu đề tab, vùng chạm, sheet "Tài khoản của tôi", quy tắc mật khẩu, cảnh báo AntD). Không cần credential, không ghi database.

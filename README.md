# HTS

Project gồm 2 source độc lập, mỗi source tự quản lý dependency bằng pnpm và có `pnpm-lock.yaml` riêng (không dùng workspace):

- `backend`: Node.js Express + MySQL + Knex migration.
- `frontend`: React Vite + Ant Design + Tailwind.

## Chạy local

```bash
pnpm install          # cài concurrently ở thư mục gốc
pnpm dev              # chạy song song backend và frontend
```

Hoặc chạy từng phần:

```bash
cd backend && pnpm install && pnpm dev
cd frontend && pnpm install && pnpm dev
```

Frontend chạy tại http://localhost:3109, backend tại http://localhost:3108, `pnpm preview` của frontend dùng cổng 4174. Cookie local `hts_session` tách khỏi NTDLS khi hai project cùng chạy trên localhost. Cấu hình API, CORS và Playwright đã đồng bộ theo các cổng này.

PowerShell nếu chặn `pnpm.ps1` thì dùng `pnpm.cmd install` và `pnpm.cmd dev`.

## Phạm vi hiện tại

Đăng nhập và phiên làm việc, cây đơn vị, cán bộ, vai trò/phân quyền theo phạm vi, thông báo/Web Push, giao việc nhiều cấp và giao diện desktop/mobile. Đăng nhập thành công vào thẳng màn Công việc.

## Cài database

Tạo database MySQL/MariaDB rỗng có charset `utf8mb4`, cấu hình kết nối trong `backend/.env`, rồi chạy:

```bash
cd backend
pnpm migrate
```

Migration nền `202610240001_initial_schema.js` tạo 11 bảng (10 bảng nghiệp vụ và `administration_state`), seed vai trò superadmin cùng năm quyền cơ bản; `202610240002_work_assignments.js` tạo phân hệ giao việc. Không có SQL dump, tài khoản hay mật khẩu mẫu. Tạo tài khoản quản trị đầu tiên bằng `POST /api/auth/bootstrap-admin` kèm header `X-Bootstrap-Token` khớp `BOOTSTRAP_TOKEN` trong `.env` (xem `backend/README.md`, `backend/curl/auth.curl`).

## Kiểm tra

- Backend: `cd backend && pnpm test`; migration và luồng database: `pnpm test:database` trên MySQL thử nghiệm riêng (xem `backend/README.md`).
- Frontend: `cd frontend && pnpm lint && pnpm build && pnpm test:e2e`.
- E2E dùng tài khoản thật cần `E2E_USERS_JSON`; thiếu credential thì test skip có lý do. Nếu đã cấu hình credential mà đăng nhập hoặc kết nối thất bại, test phải fail. Spec tổng quan/navigation/thông báo/quản trị dùng mock API, không sửa database.

## Định tuyến source

| Phần | Frontend | Backend |
| --- | --- | --- |
| Đăng nhập/phiên | `pages/auth`, `api/authApi.js` | `modules/auth` |
| Đơn vị | `pages/departments`, `hooks/useDepartments.js` | `modules/departments` |
| Cán bộ/tài khoản | `pages/staff`, `hooks/useStaffMembers.js`, `hooks/useStaffMembersPage.jsx`, `components/staff` | `modules/staff` |
| Vai trò/quyền | `pages/system`, `hooks/useRoles.js`, `hooks/useRolesPage.jsx`, `components/system` | `modules/roles` |
| Công việc/lịch/tình hình | `pages/work`, `components/work`, `hooks/useWork.js` | `modules/work` |
| Thông báo | `components/layout/NotificationBell.jsx` | `modules/notifications` |

Đường dẫn ở bảng tính từ `frontend/src` và `backend/src`. Backend tách route/controller/service/policy theo module; hạ tầng chung ở `config`, `constants`, `middlewares`, `services`, `utils`. Auth chia controller theo login/session/accounts/password. Frontend gọi HTTP qua `api`, quản lý server state qua React Query trong `hooks`; page chỉ điều phối component và hook.

## Quy tắc nghiệp vụ

- Đơn vị có cấu trúc cây và không được tạo vòng cha/con.
- Quyền lấy từ ma trận vai trò và phạm vi `system`/`department`/`department_tree`/`specific_departments`; quyền xem và quản lý là riêng biệt.
- Thông báo chỉ dành cho người nhận.
- Bootstrap chỉ thành công đúng một lần trên database trắng và không tự mở lại khi tài khoản admin bị tắt.
- Thay đổi làm mất quản trị viên hoạt động cuối cùng (vô hiệu tài khoản, gỡ vai trò, sửa quyền hoặc tắt permission action) bị từ chối với 409. Quy tắc dùng chung ở `backend/src/services/admin-safety.service.js`.
- API thay quyền yêu cầu `actions` là mảng chuỗi; thiếu/sai kiểu trả 422, chỉ `actions: []` mới là yêu cầu xóa hết quyền của vai trò thường.

## Công việc theo lịch

Phân hệ `modules/work` (backend), `pages/work`, `components/work`, `hooks/useWork.js`, `api/workApi.js` (frontend) dùng một màn **Công việc** tại `/work`, đổi nội dung bằng bộ lọc **Xem công việc**: việc của tôi, việc tôi đã giao hoặc tình hình trong đơn vị (cần quyền). Chạy `pnpm --dir backend migrate` trên database trắng trước khi dùng bản này.

Trong **Vai trò & Quyền**, cấp các quyền nhóm **Công việc**, rồi gán vai trò với phạm vi phù hợp:

- `work.assign` — **Giao việc**: dùng chung cho giao mới và chuyển tiếp, theo phạm vi đơn vị/cây đơn vị/các đơn vị/toàn hệ thống. Không phụ thuộc chức danh hoặc cấp bậc.
- `work.self_create` — **Tự tạo việc**: tạo lịch cho bản thân, hiệu lực ngay.
- `work.schedule_view` — **Xem tình hình**: xem lịch người khác trong phạm vi được cấp. Quyền giao không tự cấp quyền xem toàn bộ lịch.

Mọi tài khoản được xem và hoàn thành phần mình nhận; người giao theo dõi được nhánh do mình giao, kể cả các lượt chuyển bên dưới. Mỗi lần giao mới nhập tên, ngày/thời gian, địa điểm dạng chữ và một hoặc nhiều người; chọn buổi sáng, chiều, cả ngày hoặc giờ tùy chọn. Lưu trực tiếp, khác giờ/địa điểm thì tạo việc khác; lịch sử nhiều khung giờ cũ vẫn được giữ. Hệ thống chặn trùng người và giờ, không chặn trùng nơi làm việc. Thông tin tình hình là **theo lịch phân công**, không phải GPS hoặc xác nhận có mặt.

Chỉ người có **Giao việc** mới có mục **Việc tôi đã giao**; quyền Xem tình hình không tự mở mục này. Danh sách người nhận và API tạo/sửa/chuyển đều giới hạn theo phạm vi giao việc. Người không có `system.manage` không giao cho quản trị hệ thống hoặc người có phạm vi giao việc rộng hơn mình (toàn hệ thống/cây/các đơn vị). Vai trò cùng phạm vi vẫn được giao cho nhau; chức danh và thứ tự ưu tiên hiển thị không quyết định cấp quyền.

Chuyển tiếp được đổi toàn bộ giờ/nơi làm việc và bắt buộc có lý do. Chọn thêm bản thân để giữ phần cùng làm; phần đã chuyển được giải phóng lịch. Phần hoàn thành vẫn giữ khung giờ đã phân công. Sửa/hủy chỉ áp dụng phần chưa hoàn thành do mình giao trực tiếp; đã chuyển thì hủy nhánh chưa xong và giao lại nếu cần đổi lịch. Lịch sử hoàn thành được giữ. Không có lịch lặp, tệp đính kèm hoặc duyệt nghiệm thu trong bản này.

Không có dữ liệu hay tài khoản mẫu. Sau khi tạo admin, bạn tự tạo phòng ban, vai trò và tài khoản người dùng từ giao diện quản trị.

## Triển khai VPS

- **Cập nhật thường ngày:** LOCAL sửa trực tiếp hai dòng `image` (tên Docker Hub và tag) trong `compose.build.yaml`, rồi build/push đa kiến trúc bằng `docker compose -f compose.build.yaml build --builder hts-multi --push`; VPS đổi `HTS_IMAGE_TAG` trong `.env`, chạy `docker compose pull` rồi `docker compose up -d --wait`. Migration chưa áp dụng sẽ tự chạy trước backend.
- Build/push dùng `compose.build.yaml`; khởi tạo cấu hình/secret một lần bằng `scripts/setup-deploy.js` trong backend image. Tạo admin bằng `POST /api/auth/bootstrap-admin` với header `X-Bootstrap-Token` lấy từ `.env`; chỉ khởi tạo được một lần.
- Dữ liệu mặc định ở `./data/` cạnh compose.yaml; backup bằng `docker compose run --rm backup`. Cách chạy local giống server, mặc định cổng 3180 do setup tạo.
- Hướng dẫn: [docs/DEPLOY_VPS_DOCKER.md](docs/DEPLOY_VPS_DOCKER.md), bước 1–9 cho cài lần đầu, phần “Cập nhật phiên bản” cho những lần sau; có phần chạy thử trên local và bảng xử lý lỗi đăng nhập Docker, thiếu .env, sai kiến trúc, quyền data/.
- Kiểm tra: `pnpm test:deploy`; Docker integration riêng ở `tests/deploy-smoke.py`.

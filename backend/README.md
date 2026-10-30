# Backend

Backend Node.js Express dùng MySQL (Knex + mysql2) và Winston structured logger.

## Cài đặt

```bash
pnpm install
cp .env.example .env
```

1. Tạo database rỗng:

   ```sql
   CREATE DATABASE hts CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. Cấu hình `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=hts` trong `.env`. Tài khoản database cần quyền tạo bảng/index/foreign key và đọc/ghi dữ liệu trong database này.
3. Đổi `JWT_SECRET` và `CSRF_SECRET` thành hai chuỗi bí mật ngẫu nhiên, tối thiểu 32 ký tự và khác nhau (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Với `NODE_ENV=production`, backend **từ chối khởi động** nếu một trong hai khóa thiếu, ngắn hơn 32 ký tự, là giá trị mẫu hoặc trùng nhau. Ở môi trường phát triển chỉ ghi cảnh báo; nếu thiếu `CSRF_SECRET`, backend dẫn xuất một khóa CSRF riêng từ `JWT_SECRET` (không dùng trực tiếp `JWT_SECRET`) để `.env` local vẫn chạy.
4. Chạy `pnpm migrate`. Không import SQL trước hoặc sau bước này.
5. Khởi động backend (`pnpm dev`, mặc định tại http://localhost:3108) rồi tạo tài khoản quản trị đầu tiên bằng một trong hai cách (mật khẩu tối thiểu 10 ký tự, tối đa 72 byte, không chứa tên tài khoản; không có mật khẩu mặc định):
   - Dòng lệnh (khuyến nghị): `echo '{"username":"admin","password":"<MAT_KHAU_MANH>"}' | node scripts/bootstrap-admin.js`.
   - API: đặt `BOOTSTRAP_TOKEN` (tối thiểu 32 ký tự ngẫu nhiên) trong `.env`, gọi `POST /api/auth/bootstrap-admin` kèm header `X-Bootstrap-Token` (ví dụ ở `curl/auth.curl`), rồi xóa biến này. Thiếu `BOOTSTRAP_TOKEN` thì API trả 403 `BOOTSTRAP_DISABLED`; sai token trả 403 `BOOTSTRAP_TOKEN_INVALID`.

## Migration

Có hai migration, chạy theo thứ tự trên database trắng: `202610240001_initial_schema.js` (schema nền) và `202610240002_work_assignments.js` (giao việc). Chưa có bản triển khai nào nên không có migration nâng cấp/tương thích; khi đổi migration trong giai đoạn này, tạo lại database phát triển.

Schema nền:

- Bảng nghiệp vụ: `departments`, `staff_members`, `roles`, `permission_actions`, `role_permissions`, `staff_role_assignments`, `staff_role_assignment_departments`, `auth_sessions`, `notifications`, `push_subscriptions`.
- Bảng nội bộ `administration_state`: trạng thái bootstrap và khóa chung cho thao tác có thể làm mất quyền quản trị. Knex tự quản lý hai bảng lịch sử/khóa migration.
- Seed chỉ gồm vai trò `superadmin`, năm quyền (`department.view`, `department.manage`, `staff.view`, `staff.manage`, `system.manage`) và liên kết `system.manage`; không tạo cán bộ, đơn vị hay tài khoản mẫu.

Chạy `pnpm migrate` lần nữa không tạo trùng dữ liệu. `pnpm migrate:rollback` lùi batch migration gần nhất và có thể xóa bảng/dữ liệu trong batch đó; chỉ dùng khi chủ động muốn hủy thay đổi trên môi trường thử nghiệm.

## Cấu hình database

Mọi kết nối chạy UTC: mysql2 dùng `timezone: 'Z'` và `afterCreate` đặt `SET time_zone = '+00:00'` (`src/config/mysql-connection.js`). `TIMESTAMP`, `DATETIME` và `NOW()` vì vậy không phụ thuộc múi giờ của máy chủ hoặc MySQL; API trả thời gian ISO-8601 UTC (`src/utils/datetime.js`), UI hiển thị theo giờ Việt Nam.

Pool được giới hạn cho shared hosting: `DB_POOL_MIN` trong khoảng 0–1, `DB_POOL_MAX` trong khoảng 1–4 (mặc định 3). Các timeout tính bằng mili giây:

```env
DB_POOL_MIN=0
DB_POOL_MAX=3
DB_POOL_IDLE_TIMEOUT_MS=30000
DB_POOL_ACQUIRE_TIMEOUT_MS=30000
DB_POOL_CREATE_TIMEOUT_MS=30000
DB_POOL_REAP_INTERVAL_MS=1000
DB_CONNECT_TIMEOUT_MS=10000
DB_KEEPALIVE_INITIAL_DELAY_MS=0
```

Danh mục tham chiếu không phân trang (`GET /roles`, `GET /roles/actions`, `GET /departments`, `GET /departments/tree`) trả tối đa 500 bản ghi để bảo vệ bộ nhớ; các danh sách nghiệp vụ còn lại phân trang theo `src/utils/pagination.js` (page sai về 1, limit kẹp 1..100).

Health check public: `GET /api/health` và `GET /api/health/db`. Nếu database tạm thời mất kết nối, backend trả `503` kèm `requestId` để truy log.

Source không phụ thuộc PM2. Trên shared hosting/cPanel, dùng `src/server.js` làm startup file và cơ chế Start App/restart của hosting; trên VPS có thể dùng PM2 hoặc systemd.

## Kiểm thử

```bash
pnpm test
# Integration test trên MySQL thử nghiệm riêng mở qua Unix socket:
E2E_MYSQL_SOCKET=/duong/dan/mysql-thu-nghiem.sock pnpm test:database
```

Integration test kết nối root qua socket được chỉ định, tự tạo database `E2E_schema_*`, kiểm tra migrate/rollback/migrate lại, bootstrap, đăng nhập, phân quyền, đơn vị/cán bộ và thông báo, rồi xóa database thử. Chỉ trỏ biến này tới MySQL thử nghiệm riêng, không dùng database HTS thật. Thiếu socket thì integration test skip có lý do.

## Logging và debug

Log ghi vào `backend/logs/` theo dạng JSON cho file và text ngắn gọn cho console, rotate theo ngày:

```text
logs/access-YYYY-MM-DD.log
logs/audit-YYYY-MM-DD.log
logs/warn-YYYY-MM-DD.log
logs/error-YYYY-MM-DD.log
logs/exceptions-YYYY-MM-DD.log
```

Mặc định mỗi file tối đa `20m` và giữ `30d`; đổi bằng `LOG_LEVEL`, `LOG_MAX_SIZE`, `LOG_RETENTION`.

Mỗi request được gán `requestId` và trả header `X-Request-Id`; khi người dùng báo lỗi, dùng id này để truy log:

```bash
rg '"requestId":"<request-id>"' logs
rg '"event":"request_error"' logs
rg '"event":"permission_denied"' logs
rg '"event":"auth_login_failed"' logs
rg '"statusCode":500' logs
```

- Access log: event `http_request` gồm method, path, statusCode, responseTimeMs, ip, userAgent và userId nếu đã đăng nhập.
- Audit log: thao tác nghiệp vụ nhạy cảm như `auth_login_failed`, `staff_member_created`, `staff_member_updated`, `role_permissions_updated`.
- Error log: event `request_error` gồm requestId, method, path, statusCode, userId, params, query, body đã che thông tin nhạy cảm, message và stack.

Logger tự động che các field có tên chứa `password`, `token`, `secret`, `authorization`, `cookie`, `credential`, `private`, `vapid` và các field Web Push `endpoint`, `keys`, `auth`, `p256dh`. Header `X-Request-Id` chỉ được dùng lại khi khớp `[A-Za-z0-9-]{1,64}`, ngược lại backend tự sinh. Log và audit chỉ ghi mã phiên công khai (`public_id`), không ghi JWT `jti`. Lỗi 500 không trả `code` nội bộ của MySQL cho client.

## Phân quyền

- Permission context được cache trong từng request qua middleware và cache ngắn hạn trong process (`PERMISSION_CONTEXT_TTL_MS`, mặc định 5000).
- `getUserPermissionContext()` tải role assignments và danh sách đơn vị đang hoạt động một lần rồi dùng lại khi tính `managedDepartmentIds`.
- Nếu cây đơn vị lớn và truy vấn descendant trở thành điểm nóng, cân nhắc chuyển sang closure table hoặc materialized path.

## Bảo vệ quản trị

- Quản lý nhân sự theo đơn vị (`staff.manage` không có `system.manage`) không được đổi mật khẩu/username/trạng thái, reset mật khẩu, xem hoặc thu hồi phiên của tài khoản có `system.manage`, có phân công phạm vi `system`, vai trò `is_system`, hoặc có phạm vi vai trò vượt ngoài các đơn vị người thao tác quản lý.
- Khi gán/sửa/tắt vai trò, người không có `system.manage`: không tự gán cho chính mình; chỉ gán phạm vi `department_tree` khi chính mình có phạm vi cây (hoặc hệ thống) bao trùm; phải đang có mọi quyền của vai trò được gán; phân công hiện tại cũng phải nằm trong quyền của mình.
- Đổi đơn vị cha cần `department.manage` trên cả đơn vị đang sửa và đơn vị cha mới; đưa lên gốc cần phạm vi hệ thống. Đổi cha khóa toàn bộ bảng `departments` (FOR UPDATE) trong transaction để hai thao tác đồng thời không tạo vòng.
- Đăng nhập có hai rate limit: theo IP + username (`LOGIN_RATE_LIMIT_*`) và theo IP (`LOGIN_IP_RATE_LIMIT_*`, mặc định 50 lần sai/15 phút). Tài khoản không tồn tại vẫn so bcrypt với hash giả để thời gian phản hồi đồng đều. bcrypt cost 12.
- Web Push chỉ nhận endpoint HTTPS của FCM, Mozilla, Windows hoặc Apple, tối đa 2048 ký tự, 10 thiết bị/tài khoản; endpoint thuộc tài khoản khác bị từ chối 409.

- Bootstrap chỉ thành công một lần; tài khoản và vai trò được tạo trong cùng transaction. Các yêu cầu đồng thời được tuần tự hóa bằng khóa singleton trong `administration_state`.
- Thay đổi tài khoản/vai trò/quyền không được làm mất admin hoạt động cuối cùng; bị từ chối với 409 và rollback toàn bộ thay đổi.
- Validation `actions` thiếu hoặc sai kiểu trả 422 trước khi ghi dữ liệu.

## Endpoint

Tất cả endpoint nằm dưới `/api`. Trừ `login`, `bootstrap-admin` và `health`, mọi endpoint yêu cầu cookie phiên; request ghi dữ liệu phải gửi `X-CSRF-Token`. Ví dụ đầy đủ trong `curl/`.

| Endpoint | Quyền |
| --- | --- |
| `POST /auth/login` | Public |
| `POST /auth/bootstrap-admin` | Public nhưng cần header `X-Bootstrap-Token` khớp `BOOTSTRAP_TOKEN`; thiếu biến thì tắt |
| `GET /auth/me`, `POST /auth/logout`, `POST /auth/change-password` | Đã đăng nhập |
| `POST /auth/admin/reset-password/:userId` | `staff.manage` trên đơn vị của tài khoản |
| `GET /auth/admin/users/:userId/sessions`, `DELETE …/sessions/:sessionId`, `POST …/sessions/revoke-all` | `staff.manage` trên đơn vị của tài khoản và không thấp quyền hơn tài khoản đích; `id`/`:sessionId` là mã phiên công khai, không phải JWT `jti` |
| `GET /health`, `GET /health/db` | Public |
| `GET /departments`, `GET /departments/tree`, `GET /departments/:id` | `department.view` |
| `POST /departments`, `PATCH /departments/:id` | `department.manage` |
| `GET /staff-members`, `GET /staff-members/:id`, `GET /staff-members/:id/role-assignments` | `staff.view` |
| `POST /staff-members`, `PATCH /staff-members/:id`, `POST/PATCH/DELETE /staff-members/:id/role-assignments` | `staff.manage` |
| `GET /roles` | `staff.view` |
| `POST/PATCH/DELETE /roles`, `GET/PUT /roles/:id/permissions`, `GET /roles/permissions-matrix`, `GET/POST/PATCH /roles/actions` | `system.manage` |
| `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/read-all`, `PATCH /notifications/:id/read` | Người nhận thông báo |
| `GET /push/vapid-public-key`, `POST/DELETE /push/subscriptions` | Đã đăng nhập |

## Module giao việc

Migration `202610240002_work_assignments.js` tạo `work_items`, `work_assignments`, `work_assignment_paths`, `work_history` và ba permission action nhóm `work`. Không cấp tự động cho vai trò thường; `system.manage` giữ cơ chế quản trị toàn hệ thống hiện có. Chỉ cần cấu hình vai trò/phạm vi để giao nhiều cấp; không có cặp chức danh hoặc bảng quy tắc cấp bậc.

Code ở `src/modules/work`: route/controller, query service, command service, policy, validator và repository. Policy đọc mới trong transaction khi ghi, không dùng cache quyền. Closure table lưu quan hệ tổ tiên/con cháu để kiểm tra nhánh được xem và ngăn chuyển ngược. Đơn vị trong phân công là snapshot khi giao; phân công mới kiểm tra đơn vị hiện tại. Trước/sau và lý do lưu trong lịch sử và audit log. Thông báo lưu cùng transaction, push chỉ gửi sau commit.

API dưới `/api`, dùng cookie và CSRF như các module khác:

| Endpoint | Hành vi/quyền |
| --- | --- |
| `GET /work-assignments?mode=mine\|given` | Lịch cá nhân hoặc nhánh đã giao (`mode=given` cần `work.assign`) |
| `POST /work-assignments/availability` | Kiểm tra trước lịch bận theo quyền giao/tự tạo; `{action:create\|edit\|transfer,source,segments:[{startsAt,endsAt,assigneeIds}],excludeAssignmentId?}`; chỉ đọc, cần CSRF, tối đa 50 lịch trùng và `hasMore`; tên/địa điểm chỉ trả khi được xem; không thay thế transaction lưu |
| `POST /work-assignments` | `{title, description?, source: assigned\|self, segments:[{content,place,startsAt,endsAt,assigneeIds}]}`; quyền giao theo phạm vi hoặc tự tạo cho mình |
| `GET /work-assignments/recipients` | Mặc định chọn người theo `work.assign`; `mode=given` chọn người trong nhánh đã giao, cần `work.assign`; tối đa 100 người/trang, tìm theo `q` |
| `GET /work-assignments/:workId` | Các phần được xem, tiến độ nhánh và lịch sử có phân trang |
| `PATCH /work-assignments/:workId` | Người tạo sửa `{version,title,description?}` trong phạm vi còn được cấp |
| `PATCH /work-parts/:id` | Người giao sửa `{version,segments:[một đoạn/một người cũ]}` chưa chuyển/hoàn thành |
| `POST /work-parts/:id/transfer` | Người nhận có quyền giao: `{version,reason,segments}`; cho chia/đổi lịch, giữ bản thân nếu cần |
| `POST /work-parts/:id/complete` | Người thực hiện: `{version,note?}` |
| `POST /work-parts/:id/cancel` | Người giao trực tiếp: `{version,reason}`; hủy phần chưa hoàn thành trong nhánh |
| `GET /work-schedule` | `work.schedule_view`: lịch theo người tại `at` hoặc trong `from`–`to` (tối đa 7 ngày); lọc `q`, `place`, `departmentId`, `assigneeId`; `peopleOnly=1` chỉ trả danh sách người |
| `GET /work-schedule/departments` | Danh mục đơn vị trong phạm vi xem; `q`, `page`, `limit` |

Danh sách hỗ trợ `page`, `limit` (mặc định 20, tối đa 100; page sai về 1, limit kẹp 1..100) và trả `pagination.totalPages`. Chỉ danh sách công việc đọc `from`/`to`; các endpoint khác bỏ qua hai tham số này. Lịch công việc hỗ trợ `from`, `to` (mặc định hôm nay, tối đa 366 ngày), `q`, `status`, `assigneeId` (chỉ `mode=given`, cần `work.assign`, vẫn giới hạn nhánh đã giao); chi tiết hỗ trợ `historyPage` (20 sự kiện/trang của các phần trên trang hiện tại). Thời gian API yêu cầu ISO 8601 có múi giờ; DB lưu DATETIME literal UTC, response trả ISO UTC, UI hiển thị UTC+7.

Mỗi lần tạo/chuyển tối đa 30 khung giờ, 50 người/khung và 100 phân công. Một công việc tối đa 1000 phân công, 30 lượt trong đường chuyển. Giới hạn này bảo vệ shared hosting; tạo việc mới khi đạt giới hạn. Kiểm tra phiên bản toàn công việc: cập nhật bất kỳ phần nào làm tăng `version`; dùng phiên bản cũ trả 409 và cần tải lại.

Transaction ghi công việc chạy `READ COMMITTED` và khóa theo thứ tự công việc → phân công → cán bộ (một câu `whereIn … ORDER BY id FOR UPDATE`); tạo mới khóa cán bộ theo cùng thứ tự. Mọi thao tác thêm/đổi giờ bận của một người đều giữ khóa dòng cán bộ đó, nên truy vấn trùng lịch luôn thấy các lịch vừa commit (không còn snapshot cũ của REPEATABLE READ). Kiểm tra khoảng giao nhau bằng `start < end` và `end > start`; hai lịch liền nhau hợp lệ. Trùng với lịch đã lưu, phiên bản cũ (`WORK_VERSION_CONFLICT`) hoặc thao tác phần đã hoàn thành/đã chuyển/đã hủy (`WORK_STATE_CONFLICT`) trả 409; trùng giờ ngay trong cùng request và dữ liệu sai trả 422; thiếu quyền 403. Người thao tác không nhận thông báo về chính hành động của mình. Lịch sử, phân công và thông báo được ghi theo lô; side effect (audit, push sau commit) nằm ở `work-events.js`. Chuyển thất bại rollback cả lịch cũ và mới. Hoàn thành không giải phóng giờ, hủy/chuyển thì có.

Kịch bản cURL ở `curl/work-assignments.curl`, `curl/work-schedule.curl`. `pnpm test:database` bao gồm integration test (chia subtest) giao ba cấp, đua tạo việc với chuyển/sửa cùng người cùng giờ, quyền theo mọi loại scope, thu hồi quyền, snapshot đơn vị, trùng/qua ngày, chuyển thất bại, hoàn thành/hủy và ghi đồng thời trên database E2E riêng.

Tìm kiếm `q` ở danh sách công việc khớp tên phần việc (`a.content`) hoặc tên chung (`w.title`), được AND với toàn bộ điều kiện quyền/nhánh và các bộ lọc khác. Kiểm tra availability xác thực toàn bộ người nhận theo phạm vi, không cho tùy ý loại lịch của người khác, giữ lịch hoàn thành là lịch bận. Chỉ sửa/chuyển lịch chưa hoàn thành do đúng người có thẩm quyền mới được bỏ qua lịch cũ. Phản hồi lịch bận bị lược bỏ nội dung/địa điểm/ID nếu không có quyền xem phân công; không ghi dữ liệu/audit trong bước chỉ đọc này.

Danh mục người nhận hỗ trợ `id` để khôi phục tên người đã chọn trên URL, áp dụng cùng điều kiện quyền/nhánh như danh sách thường; ID ngoài nhánh trả danh sách rỗng.

`GET /staff-members/assignment-options` cần `staff.manage`, trả `{roles,scopes,departments,canAssignToSelf,truncated}`. Dùng cùng policy kiểm tra bản nháp khi gán quyền để giới hạn vai trò theo các quyền người thao tác đang có và đơn vị/phạm vi được phép quản lý; level chỉ dùng sắp xếp. Phạm vi cây cần quyền cây bao trùm, vai trò/phạm vi hệ thống cần `system.manage`. Tối đa 500 vai trò/đơn vị được phép trong mỗi danh mục; `truncated` báo vượt giới hạn. Tham số `q` tùy chọn tìm tên vai trò (chuỗi tối đa 200 ký tự). Đây là lựa chọn gợi ý; các API ghi vẫn kiểm tra quyền/phạm vi tại server.

## Bảo trì database local

Database local lệch schema (ví dụ thiếu cột mới) thì tạo lại database trắng và chạy `pnpm migrate`; chưa deploy nên không duy trì script sửa schema cũ.

Danh sách người nhận và kiểm tra ghi giao/sửa/chuyển dùng cùng policy: đúng phạm vi `work.assign`, loại người có `system.manage`/vai trò hệ thống hoặc phạm vi giao việc rộng hơn người thao tác. `system.manage` được giao toàn bộ. Cấp quyền được so bằng phạm vi, không dùng `roles.level` hay tên chức vụ. API kiểm tra lịch bận cũng áp dụng điều kiện này; sửa URL hoặc gửi thẳng ID không vượt được quyền.

Tạo cán bộ qua `POST /api/staff-members` bắt buộc `code`, `username`, `fullName`. Tên đăng nhập thiếu/null/trống trả 422; PATCH cũng không cho xóa tên đăng nhập đã có. Phòng ban khi ghi vẫn được kiểm tra theo phạm vi `staff.manage`.

`GET /api/work-schedule`:

- Không truyền `from`/`to`: tình hình tại thời điểm `at` (mặc định bây giờ). Truyền cả hai (ISO có múi giờ, khoảng nửa mở, tối đa 7 ngày): lịch ngày/tuần theo người; thiếu một trong hai trả 422.
- Phân trang theo người, tối đa 100 người/trang; tối đa 2.000 việc mỗi phản hồi, vượt thì `scheduleTruncated: true` để UI yêu cầu thu hẹp bộ lọc.
- `place` lọc một lần trong SQL theo collation của database (không phân biệt hoa thường/dấu); người chỉ hiện khi có việc khớp nơi làm việc.
- `assigneeId` lọc đúng một người (ngoài phạm vi trả danh sách rỗng, sai định dạng trả 422); `peopleOnly=1` trả `id`, `name`, `departmentName` không kèm việc.
- `canAssign` của từng người dùng cùng policy với API ghi giao việc.

Deploy image mặc định bật `CORS_ALLOW_SAME_ORIGIN=true`: API cho phép Origin trùng `req.protocol` + Host của website qua Caddy, không cho website khác và không dùng wildcard. `TRUST_PROXY=1` chỉ dùng khi backend nằm sau Caddy và không mở port ra ngoài. Allowlist `CORS_ALLOWED_ORIGINS` vẫn hoạt động cho cấu hình origin cố định; cookie/CSRF/kiểm tra quyền giữ nguyên. Kiểm thử ở `utils/cors-origin.test.js` và `app.security.test.js`.

`POST /api/work-assignments`: sau kiểm tra quyền, nếu bất kỳ startsAt đã qua theo đồng hồ server mà chưa có `confirmPastStart: true`, trả 409 `WORK_PAST_CONFIRMATION_REQUIRED` và không ghi công việc. Giá trị xác nhận phải là boolean, sai kiểu trả 422. Xác nhận cho phép nhập việc quá khứ với quyền tạo/giao hiện có, vẫn kiểm tra trùng lịch; lưu cờ trong audit log và snapshot lịch sử tạo. Không cần migration mới. Sửa/chuyển/hoàn thành không bị chặn chỉ vì ngày cũ.

`GET /api/work-assignments?mode=given&groupBy=assignee` phân trang theo người trong đúng nhánh đã giao, vẫn áp dụng q/status/from/to/assigneeId. Mỗi người trả số việc, assigned/completed và tối đa 5 assignments đầu; pagination.total là số người, pagination.workTotal là tổng việc. Dùng truy vấn window ROW_NUMBER trên MySQL 8+ thay vì tải toàn bộ hoặc N+1. Trang tiếp của một người dùng API given thường với assigneeId, page, limit=5. Không mở rộng quyền sang các việc do người khác giao ngoài nhánh của người đang xem; không cần migration mới.

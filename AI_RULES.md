# AI Coding Rules

> Khi sửa frontend, tham chiếu màn đơn vị/cán bộ và layout hiện hữu. Giữ ngôn ngữ giao diện và checklist UI bên dưới; không tạo phong cách riêng khi chưa có yêu cầu.

## Context Efficiency & Change Routing

1. **Định tuyến trước khi đọc:** Bắt đầu từ file, symbol, lỗi, endpoint hoặc test được nêu trong yêu cầu. Dùng cấu trúc trong `README.md` và route của module để tìm lớp trực tiếp sở hữu hành vi.
2. **Đọc theo dependency gần:** Với frontend, ưu tiên `component -> hook -> api -> backend route/controller/service`; với backend, ưu tiên `route -> controller -> policy/validator -> query/command -> migration/test`.
3. **Giới hạn phạm vi:** Không đọc toàn bộ thư mục hoặc toàn bộ repository nếu chưa có bằng chứng dependency. Mỗi lần mở rộng phải nêu được file nào gọi hoặc cung cấp contract cho file hiện tại. Khi thêm file mới hoặc cần biết code thuộc module nào/được phép import từ đâu, tra cấu trúc trong `README.md`; backend đặt code theo module, frontend theo page/component/hook/api.
4. **Không lặp context:** Tài liệu trong `AGENTS.md`, `AI_RULES.md` và các README là context nền; không sao chép lại toàn bộ nội dung đó trong prompt hoặc tài liệu mới.
5. **Một giả thuyết, một kiểm tra:** Trước lần sửa đầu tiên, xác định nguyên nhân giả định và một kiểm tra rẻ nhất có thể bác bỏ nó. Sau lần sửa đầu tiên, chạy ngay kiểm tra hẹp nhất phù hợp.
6. **Ưu tiên thay đổi nhỏ:** Sửa đúng lớp quyết định hành vi, giữ nguyên public API và style hiện có nếu yêu cầu không cần thay đổi contract.
7. **Tạo tài liệu định tuyến khi cần:** Nếu thêm module lớn hoặc thay đổi kiến trúc, cập nhật README tương ứng về cấu trúc, phạm vi và quy tắc nghiệp vụ trong cùng phiên.
8. **Prompt theo phạm vi:** Prompt nên nêu module/symbol, hành vi lỗi, điều kiện chấp nhận và test cần chạy; không yêu cầu AI “hiểu toàn bộ source” nếu không cần.

### Mẫu prompt nội bộ

```text
Đọc AGENTS.md, AI_RULES.md và README theo module.
Phạm vi: <file hoặc module> và test trực tiếp liên quan.
Vấn đề: <hành vi hiện tại>.
Yêu cầu: <hành vi mong muốn>.
Không mở rộng phạm vi nếu chưa có dependency cụ thể.
Sửa, cập nhật test và chạy kiểm tra hẹp nhất trước.
```

## Backend API Rules & Test Scenarios

When generating or modifying backend APIs, the AI must strictly adhere to the following rules regarding API design, **cURL Generation**, and **Modular Test Scenarios**:

1. **Bắt buộc sinh cURL cùng API:** Mọi API được tạo mới hoặc sửa đổi đều phải đi kèm với file cURL test tương ứng trong cùng một phiên làm việc. Cập nhật file cURL ngay khi API thay đổi thiết kế payload hoặc endpoint.
2. **Tách nhỏ tệp tin cURL để dễ quản lý (Modular Test Files):**
   - Tuyệt đối KHÔNG gộp chung tất cả các bài test của hệ thống vào một file lớn (ngoại trừ khi người dùng yêu cầu kịch bản tích hợp toàn trình).
   - Phân rã tệp cURL theo phân hệ nghiệp vụ hoặc nhóm endpoint riêng biệt dưới thư mục `backend/curl/`.
   - Quy chuẩn đặt tên: `backend/curl/<ten_nghiep_vu>.curl` (Ví dụ: `auth.curl`, `departments.curl`, `staff-members.curl`).
3. **Mỗi API phải có đầy đủ 3 loại Kịch bản kiểm thử (Test Scenarios):**
   - **Kịch bản Thành công (Success Scenario - Happy Path):** Test với dữ liệu hợp lệ tối giản (chỉ có các trường bắt buộc) và kịch bản đầy đủ (chứa cả các trường tùy chọn).
   - **Kịch bản Lỗi nghiệp vụ & Ràng buộc (Validation Scenario - Unhappy Path):** Kiểm thử khi thiếu trường bắt buộc (ví dụ: thiếu `code`, `fullName`, `username`), hoặc truyền sai định dạng dữ liệu. Đảm bảo API trả về mã lỗi `422 Unprocessable Entity` và thông điệp lỗi rõ ràng.
   - **Kịch bản Bảo mật & Phân quyền (Security Scenario):** Kiểm thử với trường hợp không truyền Token đăng nhập (trả về `401 Unauthorized`), Token hết hạn, hoặc đăng nhập bằng tài khoản không đủ thẩm quyền để gọi API (ví dụ Chuyên viên gọi API của Lãnh đạo/Admin -> phải trả về `403 Forbidden`).
4. **Quy cách định dạng tệp cURL:**
   - Sử dụng lệnh cURL thuần túy (không sử dụng định dạng `.http` của các extension khác) để người dùng có thể dễ dàng sao chép chạy trực tiếp bằng Terminal hoặc import vào Postman.
   - Sử dụng comment rõ ràng bằng dấu `#` để phân biệt mục tiêu của từng kịch bản test (Ví dụ: `# [Kịch bản 1.1] Đăng nhập tài khoản Admin`).
   - Ghi chú rõ ràng nơi cần thay thế Token động dạng `<ACCESS_TOKEN>`.
5. **Thiết kế API nhất quán:**
   - Logic nghiệp vụ phải được tách biệt rõ ràng giữa Route, Controller, và Database query (Knex).
   - Các API thêm/sửa/xóa dữ liệu phải ghi audit log qua `auditLog` (`backend/src/utils/audit-log.js`), gồm người thực hiện (`req.user.id`) và dữ liệu bị thay đổi.
   - Phản hồi JSON luôn đồng bộ về định dạng (CamelCase) và sử dụng đúng HTTP status codes (`200 OK`, `201 Created`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`, `422 Unprocessable Entity`, `500 Internal Server Error`).
   - Quy tắc mã lỗi: `403` thiếu quyền/ngoài phạm vi; `404` không tìm thấy; `409` xung đột với dữ liệu đã lưu (phiên bản cũ, trạng thái đã hoàn thành/đã chuyển/đã hủy, trùng lịch với lịch đã lưu, mất admin cuối cùng); `422` dữ liệu gửi lên sai (thiếu trường, sai định dạng, mâu thuẫn ngay trong cùng request). Giữ nguyên trường `code` đã công bố (ví dụ `WORK_VERSION_CONFLICT`).
   - Lỗi HTTP dùng `AppError`/`httpError` trong `backend/src/utils/http-error.js`; không tự tạo `new Error` + `statusCode`. Phân trang dùng `backend/src/utils/pagination.js` (page sai về 1, limit kẹp 1..100); tìm kiếm LIKE dùng `containsPattern` trong `utils/sql-like.js`; thời gian xuất ISO UTC qua `utils/datetime.js`.
   - Đã mở transaction thì mọi truy vấn trong luồng đó dùng `trx` (mẫu `client = options.trx || db`); băm bcrypt và validation thuần chạy trước khi mở transaction để không giữ kết nối pool.
6. **Ngôn ngữ thông điệp báo lỗi (Error Messages Language):**
   - Bắt buộc 100% tất cả các thông điệp báo lỗi (error messages) trả về từ backend (trong các controller, validator, middleware...) phải được viết bằng **TIẾNG VIỆT** chuẩn mực, lịch sự và rõ ràng.
   - Ví dụ: Thay vì `"title is required"`, hãy trả về `"Mã cán bộ là bắt buộc"`. Thay vì `"Unauthorized"`, hãy trả về `"Không có quyền truy cập, vui lòng đăng nhập"`.

## Frontend Rules

When generating or modifying frontend UI:

1. Use React with functional components.
2. Use Ant Design components for UI:

- `Table` for data tables.
- `Form`, `Input`, `Select`, `Modal`, `Drawer` for forms and detail views.
- `Tag`, `Badge`, `Progress`, `Statistic` for status and metrics.

3. Use Axios only through shared API clients under:

```text
frontend/src/api/
```

4. Do not call Axios directly inside components.
5. Use TanStack React Query for all server state:

- `useQuery` for list/detail data.
- `useMutation` for create/update/delete.
- Invalidate or update query cache after mutations.

6. React Query hooks must live under:

```text
frontend/src/hooks/
```

7. Keep UI components focused and reusable under:

```text
frontend/src/components/
```

8. Pages should compose hooks, layout, and components under:

```text
frontend/src/pages/
```

9. Keep shared options/constants under:

```text
frontend/src/constants/
```

10. Do not put a full feature in `App.jsx`. `App.jsx` should only provide app-level providers/theme and render pages.

11. **Null-safe UI bắt buộc để tránh trắng trang:**

- Mọi component nhận dữ liệu từ API phải có default props hoặc fallback an toàn, ví dụ `items = []`, `stats = {}`, `progressCounts = {}`.
- Trước khi gọi `.map()`, `.filter()`, `.reduce()`, `.find()`, `.slice()` trên dữ liệu API phải đảm bảo dữ liệu là array bằng `Array.isArray(value) ? value : []`.
- Không truy cập sâu trực tiếp vào object có thể null như `record.stats.total`; phải dùng optional chaining hoặc fallback: `record.stats?.total`, `const stats = record.stats || {}`.
- Khi đọc `localStorage` và `JSON.parse`, bắt buộc dùng `try/catch`; nếu parse lỗi phải xóa cache hỏng hoặc fallback về `null`.
- App React phải được bọc bằng Error Boundary ở tầng cao để lỗi render không làm trắng toàn bộ trang. Error Boundary phải hiển thị màn hình lỗi có nút tải lại thay vì để crash trắng.
- React Query hook phải chuẩn hóa response trước khi trả về UI: list luôn là array, pagination/progress/stat object luôn có fallback đầy đủ.
- Chart, Table, List, Statistic không được nhận trực tiếp dữ liệu có thể `null`; luôn truyền dữ liệu đã normalize.

## Required Frontend Pattern

API module:

```js
// src/api/departmentsApi.js
import { httpClient } from './httpClient'

export const departmentsApi = {
  list: async (params = {}) => {
    const { data } = await httpClient.get('/departments', { params })
    return Array.isArray(data) ? data : []
  },
}
```

React Query hook:

```js
// src/hooks/useDepartments.js
import { useQuery } from '@tanstack/react-query'
import { departmentsApi } from '../api/departmentsApi'

export const useDepartments = (params = {}) =>
  useQuery({
    queryKey: ['departments', 'list', params],
    queryFn: () => departmentsApi.list(params),
  })
```

Component:

```jsx
// src/components/departments/DepartmentsTable.jsx
import { Table } from 'antd'

export const DepartmentsTable = ({ departments = [], loading }) => (
  <Table rowKey="id" dataSource={departments} loading={loading} />
)
```

## Automated Test Rules For Every New Feature

Khi tạo mới, sửa đổi, hoặc tối ưu bất kỳ chức năng nào, AI bắt buộc phải tạo hoặc cập nhật test case tương ứng trong cùng một phiên làm việc. Không được chỉ sửa code nghiệp vụ mà bỏ qua test.

### 1. Quy tắc chung

1. **Mỗi thay đổi nghiệp vụ phải có test đi kèm:**
   - Thêm chức năng mới: tạo test mới.
   - Sửa logic cũ: cập nhật test cũ và thêm test chống regression nếu cần.
   - Sửa bug: thêm test tái hiện bug trước hoặc cùng lúc với fix.
   - Đổi hành vi UI/route/permission/API contract: cập nhật test, helper và docs trực tiếp bị ảnh hưởng; chọn cấp kiểm tra theo mục 4, không mặc định dùng Playwright.
2. **Không test phá dữ liệu thật:**
   - Dữ liệu test tạo mới phải có prefix rõ ràng: `E2E_`, `e2e_`, hoặc prefix riêng được thống nhất trong spec.
   - Không sửa/xóa dữ liệu thật nếu dữ liệu đó không do test tạo ra.
   - Test destructive chỉ áp dụng với dữ liệu prefix do test tạo.
3. **Test phải phản ánh quyền người dùng:**
   - Chức năng có phân quyền phải test ít nhất 2 vai trò: user có quyền và user không có quyền.
   - Nếu thiếu credential trong `E2E_USERS_JSON`, test được phép skip có lý do rõ ràng, không được timeout mơ hồ.
4. **Tên test phải viết bằng tiếng Việt dễ hiểu:**
   - Tên describe/test trong Playwright phải mô tả đúng hành vi người dùng.
   - Tránh tên chung chung như `works`, `test flow`, `should render`.
5. **Test phải ổn định, không phụ thuộc thứ tự chạy:**
   - Không phụ thuộc vào dữ liệu được tạo bởi test khác trừ khi nằm trong cùng test và cùng luồng.
   - Không dùng timeout cứng tùy tiện; ưu tiên `expect`, locator theo role/text ổn định, hoặc API precondition.

### 2. Backend API test bắt buộc

Khi thêm hoặc sửa backend API:

1. Cập nhật cURL test trong `backend/curl/<ten_nghiep_vu>.curl`.
2. Mỗi endpoint phải có tối thiểu:
   - Happy path: payload hợp lệ tối thiểu và payload đầy đủ.
   - Validation path: thiếu trường bắt buộc, sai định dạng, sai enum.
   - Permission path: chưa login `401`, không đủ quyền `403`.
3. Nếu sửa logic backend, chạy kiểm tra cú pháp và test trực tiếp liên quan trong `backend/`:

```bash
node --check src/modules/<module>/<file>.js
node --test src/modules/<module>/<file>.test.js
```

   Chạy `pnpm test` khi thay đổi hạ tầng/backend dùng chung có ảnh hưởng rộng hoặc khi các test hẹp phát hiện nguy cơ liên phân hệ.

   Nếu sửa migration hoặc truy vấn database, chạy thêm `pnpm test:database` trên MySQL thử nghiệm riêng (xem `backend/README.md`).

4. Nếu API đổi contract mà frontend sử dụng hoặc đổi luồng người dùng quan trọng, cập nhật test tương ứng; chỉ chạy Playwright khi cần kiểm chứng tích hợp trình duyệt theo mục 4.

### 3. Frontend UI test bắt buộc

Khi thêm hoặc sửa màn hình/component/flow frontend:

1. Khi đổi hành vi/luồng người dùng hoặc sửa lỗi bố cục, cập nhật test tương ứng nếu cần chống tái diễn. Chỉ đổi chữ, tài liệu, comment hoặc dọn file không dùng thì không bắt buộc thêm/sửa Playwright. Chọn cấp kiểm tra theo mục 4.
2. Nếu là phân hệ mới có luồng trình duyệt, tạo spec theo tên nghiệp vụ, ví dụ:
   - `frontend/e2e/departments.spec.js`
   - `frontend/e2e/staff-members.spec.js`
   - `frontend/e2e/notifications.spec.js`
3. Mỗi flow UI quan trọng phải có tối thiểu:
   - Load màn hình không trắng trang.
   - Hiển thị dữ liệu/list/detail chính.
   - Search/filter/sort nếu màn hình có.
   - Create/update/import/export nếu chức năng có và an toàn để test.
   - Permission: user có quyền thấy action, user không có quyền không thấy action hoặc bị chặn route.
   - Responsive: desktop và mobile nếu màn hình có layout riêng.
4. Locator ưu tiên theo thứ tự:
   - `getByRole`
   - `getByLabel`
   - `getByPlaceholder`
   - Text ổn định bằng tiếng Việt
   - CSS selector chỉ dùng khi UI component không có semantic locator ổn định.
5. Không assert layout bằng text dễ thay đổi nếu có thể assert bằng role, heading, route, hoặc state ổn định hơn.

### 4. Chọn mức kiểm tra theo phạm vi thay đổi

**Mặc định dùng kiểm tra nhẹ nhất đủ chứng minh thay đổi đúng. Không chạy full Playwright sau mỗi lần sửa code.**

| Thay đổi | Kiểm tra mặc định |
| --- | --- |
| Tài liệu, comment, gom/xóa tài liệu, dọn cache/log | Kiểm tra nội dung/liên kết/file tham chiếu; không chạy Playwright, lint hoặc build |
| Đổi chữ/nhãn/hướng dẫn, không đổi hành vi | Lint phần liên quan nếu có sửa code; không chạy Playwright; build khi ảnh hưởng import/JSX/cấu hình |
| Xóa file mã nguồn không dùng | Kiểm tra import và build; không chạy Playwright |
| Hàm xử lý, validation, hook, API/backend | Unit/integration test trực tiếp liên quan; không dùng trình duyệt để kiểm tra logic đã có test ở tầng thấp |
| CSS/bố cục của một màn | Lint/build và Playwright đúng case, đúng viewport bị ảnh hưởng; không chạy cả spec hay cả suite nếu case hẹp đã đủ |
| Thêm/sửa luồng người dùng | Playwright các case của luồng thay đổi và quyền liên quan; chỉ mở rộng sang spec cùng module khi cần |
| Đổi cơ chế đăng nhập/phiên, kiểm tra quyền, routing toàn ứng dụng hoặc layout/CSS dùng chung trên nhiều màn | Test hẹp trước; full regression khi thay đổi hành vi/cơ chế có rủi ro ảnh hưởng nhiều phân hệ |

- Việc sửa một nhãn trong màn đăng nhập hoặc thêm class CSS riêng cho một màn **không** tự động là thay đổi cơ chế auth/layout dùng chung.
- Chỉ chạy full Playwright khi người dùng yêu cầu, hoặc có bằng chứng ảnh hưởng nhiều phân hệ thuộc nhóm rủi ro rộng ở bảng trên. Trước khi chạy, nêu ngắn gọn lý do; không cần hỏi lại quyền cho kiểm tra đã nằm trong phạm vi được giao.
- Ưu tiên lọc case bằng `--grep` và chọn `--project`. Ví dụ từ `frontend/`:

```bash
pnpm test:e2e e2e/work.spec.js --project=mobile --grep 'bộ lọc'
# Chỉ khi đủ điều kiện chạy toàn bộ:
pnpm test:e2e
```

- Hoàn tất các chỉnh sửa liên quan rồi mới chạy nhóm kiểm tra. Khi test hẹp đã pass và không có thay đổi/lỗi/nguy cơ mới, dừng kiểm tra; không lặp full suite chỉ để tăng độ chắc chắn.
- Khi sửa lỗi phát hiện trong test, chạy lại case lỗi và các case trực tiếp bị ảnh hưởng trước; không mặc định chạy lại toàn bộ suite.
- Giảm output để tiết kiệm context: lưu log vào thư mục tạm, đọc kết quả tổng hợp; chỉ mở trace/screenshot/log chi tiết của case thất bại hoặc viewport cần đối chiếu. Không đọc/dump lại toàn bộ report.
- Báo rõ đã kiểm tra gì, kết quả và phần không chạy kèm lý do. Phân biệt kiểm tra của phiên hiện tại với kết quả lịch sử; không nhận kết quả cũ là xác minh bản sửa mới.
- Giữ test/case có giá trị; tối ưu cách chọn test, không xóa test bảo mật/nghiệp vụ để giảm thời gian.
- Video/report là output local, không commit: `frontend/test-results/`, `frontend/playwright-report/`, `frontend/playwright-report-vi/`. Test download/push thật có thể opt-in bằng env riêng, ghi rõ trong README/spec.

### 5. Quy tắc dữ liệu E2E

1. Test có quyền tạo dữ liệu mới nhưng không cleanup nếu đã thống nhất lưu lịch sử test.
2. Tên dữ liệu test phải có prefix:
   - Phòng ban: `E2E_DEPT_`
   - Tài khoản/cán bộ: `E2E_USER_`
   - Vai trò: `E2E_ROLE_` hoặc `e2e_role_`
3. Không reset mật khẩu, đổi quyền, xóa lịch, import đè, hoặc xóa dữ liệu thật trong critical suite mặc định.
4. Nếu cần test thao tác nguy hiểm, phải:
   - Tạo dữ liệu riêng bằng prefix E2E.
   - Chỉ thao tác trên dữ liệu đó.
   - Ghi rõ trong tên test và docs.

### 6. Checklist bắt buộc trước khi báo hoàn thành

Trước khi kết luận một chức năng đã xong, AI phải báo rõ:

1. Đã thêm/cập nhật test case nào.
2. Đã chạy lệnh test/build nào.
3. Kết quả pass/fail/skip.
4. Nếu có skip, phải nêu lý do skip.
5. Nếu có lỗi không liên quan do tồn tại sẵn, phải ghi rõ lỗi đó và vì sao không thuộc phạm vi thay đổi.
6. File test/report/video sinh ra chỉ nằm local và không xuất hiện trong phần cần commit.

## Backend Stability & Shared Hosting Optimization Rules

When creating, updating, or maintaining Backend APIs and configurations, the AI must strictly adhere to the following rules to prevent application crashes and resource exhaustion on Shared Hosting (Passenger/cPanel) or restricted environments:

### 1. Bắt buộc bẫy lỗi toàn cục (Global Exception Handling)
* Tất cả các file khởi chạy của ứng dụng (ví dụ: `src/server.js`) bắt buộc phải đăng ký các trình lắng nghe sự kiện toàn cục để tránh sập app đột ngột:
  * `process.on('uncaughtException', ...)`: Dùng để bẫy và ghi log các lỗi đồng bộ nằm ngoài middleware Express.
  * `process.on('unhandledRejection', ...)`: Dùng để bẫy các Promise bị từ chối (reject) mà không có block catch tương ứng.
* Sử dụng `logger.error` từ Winston logger để lưu vết lỗi chi tiết (bao gồm cả call stack) vào file log (`logs/error.log`).

### 2. 100% Async Routes/Controllers phải có Try-Catch
* Không cho phép viết bất cứ hàm Controller hay Middleware bất đồng bộ (`async`) nào mà thiếu block `try-catch`.
* Cú pháp chuẩn bắt buộc:
  ```js
  const myEndpoint = async (req, res, next) => {
    try {
      // Thực hiện logic hoặc kết nối cơ sở dữ liệu
      const data = await db('my_table').select('*');
      return res.json(data);
    } catch (error) {
      // Bắt buộc đẩy lỗi qua next(error) để middleware Express tự động xử lý và log
      return next(error);
    }
  };
  ```
* Tuyệt đối **không viết các block catch rỗng** (`catch (e) {}` không làm gì cả), lỗi bắt buộc phải được đẩy lên `next(error)` hoặc ghi log rõ ràng bằng `logger.error`.

### 3. Giới hạn Connection Pool cực kỳ chặt chẽ (MySQL Pool < 5)
* Trên môi trường Shared Hosting, tài nguyên kết nối đồng thời cực kỳ hạn chế. Cấu hình database trong `knexfile.js` bắt buộc phải đặt giới hạn Pool nhỏ hơn 5 kết nối:
  * `min`: Đặt là `0` hoặc `1`.
  * `max`: Tối đa là `3` (không vượt quá `4`).
  * `idleTimeoutMillis`: Thiết lập thời gian rảnh rỗi tự động ngắt kết nối là `30000` (30 giây) để giải phóng tài nguyên cho hệ thống.

### 4. Tiết kiệm RAM và Tránh Rò Rỉ Bộ Nhớ (Memory Leak)
* Tránh tải toàn bộ cơ sở dữ liệu lớn vào bộ nhớ RAM cùng một lúc. Mọi API trả về danh sách dữ liệu (ví dụ: danh sách tác vụ, nhật ký hoạt động...) bắt buộc phải hỗ trợ **phân trang (Pagination)** sử dụng `limit` và `offset` hoặc giới hạn số lượng bản ghi trả về mặc định tối đa là `50` - `100`.
* Không sử dụng các biến toàn cục (Global variable/array) để lưu trữ cache dữ liệu tạm thời lớn. Mọi tài nguyên tạm (như file upload tạm) phải được xóa ngay sau khi xử lý xong.

## Checklist giao diện

- Tham chiếu các màn đơn vị/cán bộ và component layout; tái sử dụng `glass-card`, pattern bảng/card/drawer và token CSS hiện có.
- Giữ Ant Design, màu primary, radius, typography, khoảng cách và trạng thái loading/empty/error nhất quán.
- Desktop 1440px: bảng và bộ lọc thẳng hàng; tablet 768/1024px: nút không chồng, không tràn ngang; mobile 390px: card đọc được, drawer và footer không vỡ.
- Kiểm tra light/dark và các quyền khác nhau; hành động bị ẩn không để lại khoảng trống.
- Danh sách theo màn cán bộ: desktop từ 1200px dùng Table; dưới 1200px dùng card xếp dọc. Không tự chuyển desktop thành grid nhiều cột nếu chưa được yêu cầu.
- Modal phải nằm trọn trong viewport, header/footer luôn thấy được; chỉ body cuộn khi nội dung dài. Kiểm tra cả màn hình thấp, không chỉ độ rộng.
- Chọn mức kiểm tra theo mục "Chọn mức kiểm tra theo phạm vi thay đổi"; ưu tiên case/viewport liên quan, không mặc định chạy full Playwright. Báo kết quả và các kiểm tra không chạy kèm lý do.

# Frontend HTS

React + Vite, Ant Design, Tailwind, Axios và TanStack React Query.

Các màn hình còn dùng: đăng nhập, đổi mật khẩu, đơn vị, cán bộ/tài khoản, vai trò/phân quyền và công việc/lịch/tình hình. Thông báo/Web Push và cài ứng dụng PWA được giữ.

## Phát triển

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Frontend: http://localhost:3109. Backend mặc định: http://localhost:3108/api; có thể đổi `VITE_API_BASE_URL` trong `.env`. Dữ liệu lấy từ backend, không có dữ liệu mẫu.

## Kiểm tra và build

```bash
pnpm lint
pnpm build
pnpm test:e2e
```

Output build nằm trong `dist/`. `pnpm preview` phục vụ bản build tại http://localhost:4174. Khi triển khai, cấu hình web server đưa `/api` tới backend HTS và route frontend tới `index.html`.

Cấu trúc: `src/app` điều phối/route, `pages` màn hình, `components` và `layouts` giao diện chung, `hooks` React Query, `api` HTTP client, `utils` tiện ích.

## Khung ứng dụng (app shell)

- `app/App.jsx` chỉ cấp provider/theme; phiên đăng nhập (khởi tạo `/auth/me` một lần, khôi phục Web Push theo user, đăng nhập/đăng xuất) nằm ở `hooks/useAuthSession.js`. Cache React Query bị `queryClient.clear()` khi đăng xuất, khi phiên bị xóa (401) và trước khi gán người dùng mới, để tài khoản sau không thấy dữ liệu của tài khoản trước. Error Boundary bọc ngoài cùng trong `main.jsx` và trong ConfigProvider.
- `app/navigation.js` là nguồn duy nhất cho menu (sidebar, thanh dưới mobile, trang chủ), quyền vào route (`view` hoặc `manage`) và tiêu đề tab (`<Trang> · HTS`). Nhãn chung: Công việc, Phòng ban, **Cán bộ**, Vai trò & Quyền; có quyền `*.manage` thì liên kết ghi "Quản lý …", chỉ có `*.view` thì ghi "Xem …". Trên mobile, Phòng ban/Cán bộ có tab riêng; sheet "Tài khoản của tôi" chứa Vai trò & Quyền (nếu có), đổi mật khẩu, cài ứng dụng, đăng xuất.
- Layout chọn cây desktop/mobile bằng `hooks/useMediaQuery.js` (đọc `matchMedia` ngay lần render đầu, breakpoint 768px). Nút "Làm mới dữ liệu" trên mobile refetch các query đang hiển thị, không tải lại trang.
- Đăng nhập thành công vào thẳng `/work`; `/` và đường dẫn không hợp lệ chuyển đến Công việc. Người phải đổi mật khẩu vẫn vào `/change-password` trước.
- `QueryErrorState` nhận `error`: lỗi 5xx/mất mạng hiện câu thân thiện và "Mã tra cứu" (header `X-Request-Id` hoặc `requestId` trong body). Thông báo thao tác dùng `hooks/useFeedback.js`.
- Quy tắc mật khẩu ở `constants/password.js` + `utils/passwordPolicy.js`: hướng dẫn người dùng chỉ nêu tối thiểu 10 ký tự và không chứa tên đăng nhập. Giới hạn bcrypt được kiểm tra ngầm; khi vượt giới hạn chỉ nhắc nhập mật khẩu ngắn hơn, không hiển thị đơn vị byte.
- Vùng chạm ≥ 40–44px cho tablet/mobile (`max-width: 1024px` hoặc `pointer: coarse`) trong `styles/dashboard-and-mobile.css`; desktop giữ kích thước gốc. Chữ phụ AntD dùng `#595959` (nền sáng) / 60% trắng (nền tối).
- Build: chỉ tách `react-vendor` (React/Router/React Query); Ant Design được chia theo trang lazy, layout cũng lazy nên trang đăng nhập không tải sidebar/chuông.
- Spec `e2e/app-shell.spec.js` (mock, không cần credential): đổi người dùng không lộ cache, 401 xóa cache, vùng chạm 390/768/1440, sheet tài khoản, quy tắc mật khẩu, không có cảnh báo API cũ của AntD, không remount layout lần đầu.

Page cán bộ/vai trò điều phối các component chuyên trách trong `components/staff`, `components/system` và hook `useStaffMembersPage.js`, `useRolesPage.js` (không chứa JSX; tag quyền ở `components/system/PermissionTag.jsx`). `QueryErrorState` dùng chung cho lỗi tải danh mục, vai trò và phiên đăng nhập; thử lại gọi refetch đúng query. Các spec `management.spec.js`, `auth-helper.spec.js` không yêu cầu credential và không sửa database.

## UI giao việc

Menu **Công việc** dùng được trên sidebar và thanh dưới mobile. Màn duy nhất `/work` (`pages/work/WorkPage.jsx`) dùng bộ lọc **Xem công việc** để chọn việc của tôi, việc tôi đã giao hoặc tình hình trong đơn vị; component chuyên trách ở `components/work`, React Query ở `hooks/useWork.js`, HTTP ở `api/workApi.js`. Giao diện dùng pattern/card/token hiện có, không cần thư viện lịch bổ sung.

Loại xem dùng Segmented “Xem công việc” ở mọi kích thước: desktop từ 1200px dùng nhãn đầy đủ, tablet/mobile dùng nhãn ngắn và title giữ tên đầy đủ. Chuyển bằng một lần bấm, ẩn lựa chọn ngoài quyền và ẩn cả công tắc khi chỉ có một lựa chọn. Chỉ liệt kê lựa chọn được cấp quyền. Bộ lọc thay đổi nội dung ngay trên cùng trang, giữ ngày đang xem khi đóng chi tiết; đường dẫn `/work/mine`, `/work/given`, `/work/situation` cũ tự chuyển về màn chung. Mặc định hôm nay; desktop/tablet chọn Từ ngày–Đến ngày bằng AntD RangePicker, mobile chọn trong sheet thời gian, có mốc nhanh ở bên trái (hôm nay, hôm qua, 7/30 ngày qua, tuần này/trước, đầu tháng, tháng trước, đầu năm), tối đa 366 ngày; bộ lọc luôn hiển thị trên một hàng gọn ở desktop, tablet/mobile tự xuống hàng; tìm kiếm tự cập nhật, hàng điều hướng trong card lọc luôn theo thứ tự ‹, ngày, ›, Hôm nay, rồi Ngày/Tuần hoặc khoảng tuần và tùy chọn cuối tuần. Hàng trường lọc desktop xếp tên, trạng thái và các bộ lọc còn lại; Xóa bộ lọc ở cuối hàng. Việc tôi đã giao có lọc theo người thực hiện khi có `work.assign`, chỉ liệt kê người trong nhánh đã giao, hỗ trợ tìm tên và xóa lọc. Form giao việc đặt tên công việc, người thực hiện, ngày/thời gian rồi địa điểm; form tự tạo giữ thứ tự cũ. Chưa chọn người thì khóa nút lưu, chỉ hiện gợi ý đọc được bởi trình đọc màn hình ở footer; nhấn Enter sẽ kiểm tra và báo lỗi ngay tại trường người thực hiện/người nhận; chọn sáng 08:00–11:30, chiều 13:30–17:00, cả ngày 08:00–17:00 hoặc tùy chọn (hỗ trợ qua ngày). Một lần giao một lịch cho một/nhiều người; khác giờ hoặc địa điểm thì tạo việc khác. Lưu trực tiếp, không có bước xem lại hoặc danh sách khung giờ. Thông báo trùng giữ dữ liệu để sửa. Chi tiết cho xem chuỗi giao, tiến độ và lịch sử trước/sau có phân trang. Tình hình cần quyền riêng, có người chưa có lịch và nhãn theo lịch, không suy diễn vị trí thực tế.

Spec `e2e/work.spec.js` dùng mock API, không cần credential và không sửa database. Kiểm tra các buổi/thời gian tùy chọn, tự tạo/hoàn thành, chuyển/sửa/hủy, lỗi trùng giữ dữ liệu, quyền, chi tiết, thử lại, light/dark và viewport 390/768/1024/1440. Database nghiệp vụ được kiểm chứng riêng bằng integration test backend.

Danh sách Công việc dùng cùng breakpoint với cán bộ: desktop từ `xl` (1200px) dùng Table; tablet/mobile dùng card xếp dọc, không tự chia cột bằng auto-fit. `WorkListView` điều phối hai kiểu hiển thị và `WorkPartActions` dùng chung nút/quyền. Modal dùng khung giới hạn theo chiều cao viewport, giữ header/footer; chỉ body cuộn, kể cả khi chọn giờ tùy chọn hoặc màn hình thấp.

Form thời gian ở `WorkScheduleFields`; preset dùng chung ở `constants/workOptions.js`, chuyển đổi payload ở `utils/workForm.js` có unit test. API cũ vẫn giữ mảng segments để đọc/sửa dữ liệu lịch sử; giao diện mới chỉ gửi một phần lịch mỗi lần lưu.

Bộ lọc Công việc lưu vào URL (`from`, `to`, `q`, `status`, `assigneeId`, `at`, `place`, `departmentId`, `page`, `view`); F5/chia sẻ/Back giữ lựa chọn. URL sai được chuẩn hóa khi đọc, không dùng để cấp quyền. Form giao mới mặc định ngày bắt đầu đang xem (tình hình lấy ngày tại thời điểm đang xem); sửa/chuyển giữ lịch hiện hữu. Sau thao tác có thông báo thành công; việc tạo ngoài bộ lọc có nút xem chi tiết hoặc hiện trong danh sách.

Tên phần việc (`content`) là tên người dùng sửa và là tên hiển thị chính ở bảng/card/tình hình. Tên chung (`title`) giữ ngữ cảnh chuỗi giao; tìm kiếm khớp cả hai và vẫn giới hạn quyền xem. Đổi tên chung trong chi tiết không thay tên riêng của các phần việc.

`WorkAvailability` hiển thị lịch bận ngay khi chọn đủ người/giờ, không cần nhập tên/địa điểm trước. Kiểm tra có debounce; nút lưu chờ kết quả mới nhất, bị chặn nếu trùng hoặc lỗi kiểm tra (có thử lại). Khi sửa/chuyển bỏ qua đúng lịch cũ được phép; tên việc/địa điểm chỉ hiện khi có quyền xem. Backend vẫn khóa và kiểm tra lại lúc ghi. Các helper bộ lọc ở `utils/workFilters.js`, chuyển form/preview ở `utils/workForm.js` có unit test.

RangePicker lấy giá trị đã chuẩn hóa từ URL và được đặt key theo khoảng ngày để thao tác reset/Back không bị sự kiện commit cũ ghi đè. Người đang được lọc được tra lại bằng ID trong cùng phạm vi quyền, không phụ thuộc trang đầu của danh mục.

Công việc dùng `workPartTitle` và query-key factory `constants/workQueryKeys.js`; mở chi tiết bằng `workId` (khác mã phân công `id`). Lịch sử hiển thị tên phần việc/tên chung/mô tả trước–sau, kể cả mô tả được bỏ trống.

Ở tablet/mobile, ô tìm kiếm Công việc luôn hiện; Lọc thêm chỉ chứa các điều kiện bổ sung. Form tài khoản dùng một cột dưới 576px, hai cột ở màn lớn. Gán vai trò lấy danh mục được phép từ `/staff-members/assignment-options`, giới hạn scope và đơn vị ngay khi chọn; server vẫn kiểm tra lại khi lưu. Người không có `system.manage` không được sửa vai trò của chính mình. Nhãn level là Thứ tự ưu tiên hiển thị, không biểu thị quyền sử dụng.

Bộ lọc Công việc trên mobile dùng Drawer từ dưới lên, tablet từ bên phải theo mẫu NTDLS; tìm kiếm giữ ngoài danh sách, nút Lọc thêm nằm cạnh ô tìm kiếm. Drawer có Xóa bộ lọc và Xong ở footer cố định; thay đổi lọc cập nhật ngay, Xong đóng bảng lọc. Tab mobile rút gọn Của tôi/Đã giao/Tình hình, giữ tên đầy đủ cho trình đọc màn hình. Dải ngày dùng grid trên điện thoại để hai nút trước/sau luôn cùng hàng với ô ngày; giờ xem hoặc ngày kết thúc có hàng riêng. CSS chỉ giới hạn trong work-page/work-filter-drawer.

Mục Việc tôi đã giao chỉ hiển thị với `work.assign`; quyền `work.schedule_view` chỉ mở tình hình, không mở nhánh đã giao. URL `view=given` của người không có quyền được đưa về Việc của tôi trước khi gọi API.

Form cán bộ bắt buộc tên đăng nhập. Người quản lý được chọn phòng ban trong phạm vi `staff.manage`; khi tạo, tự điền đơn vị duy nhất hoặc đơn vị hiện tại nếu nằm trong phạm vi quản lý.

## Lịch theo người của đơn vị

Người có cả `work.assign` và `work.schedule_view` mặc định mở Lịch đơn vị; chuyên viên mặc định Việc của tôi. Mọi kích thước dùng Segmented; dưới 1200px rút gọn Của tôi | Đã giao | Đơn vị; Việc của tôi/Việc tôi đã giao có công tắc Ngày | Tuần. URL có `view` vẫn giữ lựa chọn đã chỉ định.

`components/work/WorkCalendar.jsx` hiển thị desktop/tablet bằng bảng tuần (mặc định thứ Hai–thứ Sáu, có tùy chọn cuối tuần), tên người cố định bên trái, cuộn ngang trong bảng. Bảng tự cuộn ngang tới ngày chọn khi đổi ngày/tuần/chế độ ngày–tuần hoặc khi bảng vừa xuất hiện, kể cả mở người chưa có lịch. Refetch sau hoàn thành/làm mới giữ vị trí cuộn ngang đang xem; không cuộn cả trang. Dưới 768px dùng thẻ theo từng người trong một ngày, nút ngày trước/sau và chọn ngày; không thu nhỏ bảng tuần vào màn điện thoại. Buổi trống ghi Trống và không mở được; nút giao (+) chỉ hiện khi rê chuột/focus trên máy có chuột; việc qua trưa chỉ hiện một lần ở buổi sáng; lịch tuần đưa việc chưa hoàn thành lên trước, lịch ngày mobile xếp theo giờ. Mỗi ngày có hai dòng Sáng/Chiều với số việc; buổi trống ghi Trống và không mở được. Người chưa có việc trong ngày/tuần gom vào một dòng “Chưa có lịch: N người” để mở khi cần. Phân trang theo người. Tìm tên người, lọc đơn vị/nơi làm việc dùng chung bộ lọc hiện hữu.

Bấm Giao việc trong ô ngày/thẻ người để điền sẵn người và ngày; công việc mở drawer chi tiết hiện hữu, sửa/hủy theo quyền hiện hữu. Nút giao chỉ hiện khi API trả `canAssign` cho người đó; API ghi vẫn kiểm tra lại quyền và trùng lịch. Giữ nguyên ngày quá khứ được chọn; khi tạo mới có giờ bắt đầu đã qua, phải xác nhận trước khi lưu. Bộ chọn ngày của lịch nằm trong card lọc như Của tôi/Đã giao, không có nút Bây giờ. Tạo việc nằm ngoài bộ lọc đang xem chỉ hiện một thông báo, có nút “Xem việc” và “Hiện trong danh sách”.

`utils/workCalendar.js` quyết định tuần/ngày theo ngày Việt Nam và việc giao qua đêm. Spec lịch nằm trong `e2e/work.spec.js`, dùng mock và không tạo dữ liệu thật.

Ô lịch hiển thị gọn tên việc (tối đa hai dòng, tên dài có dấu …), giờ và địa điểm; tên, giờ và “Địa điểm: …” mỗi nội dung một dòng; việc hoàn thành có dấu ✓ nhỏ cạnh tên, trạng thái đầy đủ xem trong chi tiết; ngày ở tiêu đề cột. Hover giữ nền ô hôm nay và màu chữ ở cả sáng/tối. Thẻ mobile đặt tên người và nút giao việc cùng hàng, không lặp phòng ban cạnh tên người trong lịch và bộ lọc. Chi tiết đầy đủ vẫn mở từ công việc.

Lịch chia Sáng (trước 12:00) và Chiều (từ 12:00) theo giờ Việt Nam; việc qua trưa chỉ xuất hiện ở buổi sáng. Bấm tiêu đề buổi để mở/đóng tất cả việc ngay tại chỗ, không dùng hover hoặc drawer xem thêm. Bảng tuần mặc định thu gọn và chỉ mở một buổi trong toàn bảng khi thao tác riêng lẻ. Nút Mở tất cả/Thu gọn tất cả nằm cùng hàng với Giao việc trên desktop/tablet (mobile giữ nút tạo nổi), áp dụng cho các người và buổi có việc trong trang, ngày/tuần đang hiển thị; sau Mở tất cả có thể đóng/mở từng buổi độc lập. Thu gọn tất cả đưa bảng tuần về chế độ mở một buổi. Mobile mặc định mở buổi hiện tại khi xem hôm nay, các buổi khác mở chủ động. Danh sách dài trên mobile dưới 768px mở đầy đủ và cuộn cùng trang, không có vùng cuộn riêng trong buổi; bảng tuần từ 768px giữ giới hạn chiều cao và cuộn bên trong; bấm tên để xem chi tiết, hoàn thành việc của mình theo quyền hiện hữu. Mở chi tiết hoặc refetch không tự thu gọn buổi đang xem.

Trong lịch đơn vị, việc đang phân công cho chính người đăng nhập có nút “Hoàn thành” ngay trong buổi được mở trên lịch web/mobile. Dùng cùng policy `workPartActions` và modal xác nhận hiện hữu, không yêu cầu quyền giao việc; việc của người khác hoặc đã hoàn thành không có nút này. Sau xác nhận, lịch được tải lại và giữ nguyên bộ lọc/ngày.

Điều hướng ngày dùng token Button chung trên desktop/tablet: 36px khi dùng chuột, 44px trên tablet/cảm ứng. Riêng bộ lọc mobile dưới 768px đồng bộ nút, ô ngày, input/select và Segmented ở size middle 32px. Nút thao tác khác trên mobile dùng middle 32px; nút hoàn thành trong ô lịch desktop dùng chuột gọn 24px. Nút hoàn thành đều dùng type primary như WorkPartActions. Header, phân trang và nút đóng modal/drawer trên thiết bị cảm ứng cũng có vùng bấm 44px.

Lịch đơn vị dùng Select “Người thực hiện” thay tìm tên tự do: có Tất cả người thực hiện, tìm trong danh sách bằng tên, lọc chính xác qua UUID `assigneeId`, lưu/khôi phục lựa chọn bằng URL. Danh sách lựa chọn lấy theo cùng ngày/tuần, đơn vị và quyền xem lịch; đổi đơn vị sẽ xóa người đã chọn.

Tạo/giao việc bắt đầu trong quá khứ (kể cả sáng nay khi hiện đã chiều) cần xác nhận rõ ngày/giờ trước khi ghi. Quay lại sửa giữ nguyên dữ liệu; không tự đổi ngày về hôm nay. Tương lai không hỏi thêm. Server yêu cầu xác nhận khi lệch đồng hồ hoặc thời gian trôi qua thì form mở cùng luồng xác nhận. Các luồng sửa/chuyển/hoàn thành việc cũ vẫn giữ quy tắc hiện hữu.

Bộ lọc Đơn vị trong lịch chỉ hiện khi API danh sách đơn vị cho biết phạm vi xem có hơn một đơn vị; không dựa vào tên vai trò. Một phòng thì ẩn bộ lọc và gỡ departmentId dư trong URL, API vẫn kiểm tra phạm vi. Số đơn vị dùng danh sách không tìm kiếm để bộ lọc không biến mất khi đang gõ tên đơn vị.

Form Tạo việc mặc định ngày hôm nay theo giờ Việt Nam, không lấy ngày đang lọc trong danh sách. Người dùng vẫn có thể đổi ngày trong form; chọn quá khứ vẫn theo bước xác nhận trước khi lưu. Giao việc theo ô lịch giữ ngày đã chọn, sửa việc giữ ngày của việc cũ.

Màn Việc tôi đã giao dùng `components/work/WorkGivenGroups.jsx`, nhóm theo người có việc trong bộ lọc hiện tại. Tổng người/việc chỉ hiện đầu danh sách; mỗi tiêu đề có tên và số chưa xong/đã xong, giữ trạng thái từng việc để phân biệt; mở một nhóm để xem việc. Desktop tái sử dụng Table, tablet/mobile dùng WorkPartCard và không lặp tên người/phòng trong từng việc. Phân trang ngoài theo người, bên trong mỗi người 5 việc/trang; trang đầu có sẵn từ API nhóm, chỉ tải trang tiếp khi bấm. Chi tiết/sửa/hủy và quyền giữ nguyên.

Điều hướng Ngày/Tuần đồng bộ chiều cao với nút ngày: 32px mobile, 36px desktop dùng chuột và 44px tablet/cảm ứng. Nút mobile khác của phân hệ giữ middle 32px. Nhãn “Tìm tên công việc” ẩn trên tablet/mobile nhưng input vẫn có aria-label. Hôm nay/Ngày mai trong form dùng Radio.Group dạng button solid như các buổi; chọn ngày tùy ý không bị tự gán mốc nhanh. WorkAvailability nằm gần thời gian; form chuyển việc giữ luồng cũ. Chi tiết chỉ ẩn tên phần việc nếu chỉ có một phần trùng tên chung; vẫn hiện tên riêng và người giao có dữ liệu, ẩn dòng rỗng.

Trên mobile dưới 768px, riêng Lịch đơn vị đặt ‹, ô ngày, ›, Hôm nay trên cùng một hàng; Của tôi/Đã giao cũng dùng cùng hàng cố định: ‹, ô thời gian, ›, Hôm nay. Bấm ô thời gian mở sheet Ngày/Tuần/Khoảng ngày; Từ ngày–Đến ngày chỉ nằm trong sheet nên đổi chế độ không tăng chiều cao bộ lọc. Lịch đơn vị mobile chỉ chọn ngày, không có Ngày/Tuần. Các lựa chọn hiển thị theo quyền, không theo tên vai trò. Checkbox cuối tuần bị khóa khi ngày chọn là thứ Bảy/Chủ nhật có tooltip giải thích. Bảng desktop chỉ hiện giá trị trong cột Địa điểm; card/ô lịch giữ tiền tố “Địa điểm:”, ẩn dòng khi không có dữ liệu.

Bộ lọc mobile ẩn nhãn ngoài của ô tìm kiếm/người thực hiện, giữ tên truy cập bằng aria-label; ô nhập và nút Lọc (tablet: Lọc thêm) cao 32px, căn giữa cùng hàng.

Màn Công việc bỏ tiêu đề lặp “Công việc”. Nút Giao việc/Tạo việc trên desktop/tablet nằm bên phải hàng tổng số, dưới bộ lọc và trên danh sách. Mobile dùng nút nổi có chữ ở góc dưới bên phải, phía trên thanh điều hướng; chừa khoảng trống cuối danh sách để xem trọn việc cuối. Nút nổi ẩn khi mở form hoặc chi tiết và chỉ hiện theo quyền tạo/giao hiện hữu.

Form tạo/giao/sửa/chuyển việc hỏi “Bỏ nội dung đang nhập?” khi bấm X, Đóng hoặc Escape nếu còn thay đổi chưa lưu; có Tiếp tục nhập và Bỏ thay đổi. Mở form chưa sửa, đổi lại giá trị ban đầu hoặc lưu thành công không hỏi. Bộ lọc vẫn cập nhật ngay; nút Xong chỉ đóng bảng lọc.

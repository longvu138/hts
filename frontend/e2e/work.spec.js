import { test, expect } from '@playwright/test';
import { mockRetainedApp } from './helpers/retained-app.js';

const workId = '00000000-0000-4000-8000-000000000010';
const partId = '00000000-0000-4000-8000-000000000011';
const memberId = '00000000-0000-4000-8000-000000000012';
const me = 'E2E_USER_mock';
const part = 'Kiểm tra tại hiện trường';
const ALL = ['work.assign', 'work.self_create', 'work.schedule_view'];
const todayVN = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const showDay = iso => iso.split('-').reverse().join('/');
const overlaps = (a, b) => Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(b.startsAt) < Date.parse(a.endsAt);

const mock = async (page, permissions = ALL, { now } = {}) => {
  // Ordinary cases start before working hours; past-time cases explicitly use 14:00.
  await page.clock.setFixedTime(now || new Date(`${todayVN()}T00:00:00+07:00`));
  await mockRetainedApp(page, { permissions });
  const state = {
    fail: false, conflict: false, empty: false, reads: [], previews: [], previewConflicts: [], writes: [], history: null,
    item: { id: partId, workId, title: 'E2E Kiểm tra hồ sơ', description: 'E2E Mô tả', content: part, place: 'Khu A', startsAt: '2026-10-24T01:00:00Z', endsAt: '2026-10-24T05:00:00Z', status: 'assigned', version: 1, assigneeId: me, assigneeName: 'E2E Quản trị', giverId: me, giverName: 'E2E Quản trị', departmentName: 'E2E Phòng kỹ thuật', source: 'assigned' },
  };
  await page.route(/\/api\/work(-assignments|-parts|-schedule)/, async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    if (path.endsWith('/availability')) {
      const body = req.postDataJSON(); state.previews.push(body);
      if (state.previewFail) return route.fulfill({ status: 503, json: { message: 'E2E Không kiểm tra được lịch' } });
      // state.busy: real overlap per request; otherwise every preview returns previewConflicts.
      const conflicts = state.busy ? state.busy.filter(slot => body.segments.some(segment => segment.assigneeIds.includes(slot.assigneeId) && overlaps(slot, segment))) : state.previewConflicts;
      return route.fulfill({ json: { conflicts, hasMore: false } });
    }
    if (req.method() === 'GET') state.reads.push({ path, ...Object.fromEntries(url.searchParams) });
    if (state.fail && req.method() === 'GET' && path === '/api/work-assignments') return route.fulfill({ status: 503, json: { message: 'E2E Lỗi tải' } });
    if (req.method() !== 'GET') {
      const body = req.postDataJSON(); state.writes.push({ path, body });
      if (state.forcePastConfirmation && path === '/api/work-assignments' && !body.confirmPastStart) return route.fulfill({ status: 409, json: { code: 'WORK_PAST_CONFIRMATION_REQUIRED', message: 'Thời gian bắt đầu đã qua. Vui lòng xác nhận' } });
      if (state.conflict) return route.fulfill({ status: 409, json: { message: 'E2E Thành viên đã có lịch từ 08:00 đến 12:00. Vui lòng chọn giờ khác' } });
      if (state.versionConflict) return route.fulfill({ status: 422, json: { code: 'WORK_VERSION_CONFLICT', message: 'E2E Công việc vừa được người khác cập nhật' } });
      if (state.stateConflict) return route.fulfill({ status: 409, json: { code: 'WORK_STATE_CONFLICT', message: 'E2E Phần việc đã được hoàn thành trước đó' } });
      if (req.method() === 'PATCH' && path.startsWith('/api/work-parts/') && body.segments?.[0]) Object.assign(state.item, { content: body.segments[0].content, place: body.segments[0].place, startsAt: body.segments[0].startsAt, endsAt: body.segments[0].endsAt });
      if (path.endsWith('/complete')) state.item.status = 'completed';
      if (path.endsWith('/cancel')) state.item.status = 'cancelled';
      if (path.endsWith('/transfer')) state.item.status = 'transferred';
      return route.fulfill({ status: path === '/api/work-assignments' ? 201 : 200, json: { workId, version: 2 } });
    }
    if (path.endsWith('/recipients') && state.omitSelected && !url.searchParams.get('id')) return route.fulfill({ json: { items: [], pagination: { total: 0 } } });
    const items = path.endsWith('/recipients') ? [{ id: memberId, name: 'E2E Thành viên', departmentName: 'E2E Phòng kỹ thuật' }, { id: me, name: 'E2E Quản trị' }]
      : path.endsWith('/departments') ? state.departments || [{ id: '00000000-0000-4000-8000-000000000020', name: 'E2E Phòng kỹ thuật' }, { id: '00000000-0000-4000-8000-000000000021', name: 'E2E Phòng khác' }]
        : path === '/api/work-schedule' ? state.schedulePeople || [{ id: memberId, name: 'E2E Thành viên', departmentName: 'E2E Phòng kỹ thuật', status: 'scheduled', canAssign: true, assignments: state.scheduleItems || [state.item] }, { id: 'free', name: 'E2E Chưa phân công', status: 'free', assignments: [] }]
          : (state.items || [state.item]);
    if (path === '/api/work-assignments' && url.searchParams.get('groupBy') === 'assignee') {
      const grouped = new Map();
      for (const item of items) {
        const group = grouped.get(item.assigneeId) || { id: item.assigneeId, name: item.assigneeName, assignments: [] };
        group.assignments.push(item); grouped.set(item.assigneeId, group);
      }
      const people = [...grouped.values()].map(person => ({ ...person, total: person.assignments.length, assigned: person.assignments.filter(item => item.status === 'assigned').length, completed: person.assignments.filter(item => item.status === 'completed').length, assignments: person.assignments.slice(0, 5) }));
      return route.fulfill({ json: { items: state.empty ? [] : people, pagination: { page: Number(url.searchParams.get('page') || 1), limit: Number(url.searchParams.get('limit') || 25), total: state.total || people.length, workTotal: items.length } } });
    }
    if (path === '/api/work-assignments' && url.searchParams.get('assigneeId') && state.groupPaging) {
      const filtered = items.filter(item => item.assigneeId === url.searchParams.get('assigneeId'));
      const page = Number(url.searchParams.get('page') || 1), limit = Number(url.searchParams.get('limit') || 5);
      return route.fulfill({ json: { items: filtered.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: filtered.length } } });
    }
    const history = state.history || [{ id: 'history1', assignmentId: partId, action: 'created', actorName: 'E2E Quản trị', createdAt: state.item.startsAt, after: JSON.stringify({ starts_at: state.item.startsAt, ends_at: state.item.endsAt, place: 'Khu A' }) }];
    await route.fulfill({ json: { items: state.empty ? null : items, pagination: { page: Number(url.searchParams.get('page') || 1), limit: Number(url.searchParams.get('limit') || 20), total: state.total || items.length, totalPages: Math.max(1, Math.ceil((state.total || items.length) / Number(url.searchParams.get('limit') || 20))) }, history } });
  });
  return state;
};

const noOverflow = async page => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
const lastRead = (state, path = '/api/work-assignments') => state.reads.filter(r => r.path === path && r.peopleOnly !== '1').at(-1);
// All sizes use Segmented; wait for it before choosing a view.
const VIEW_SHORT = { 'Việc của tôi': 'Của tôi', 'Việc tôi đã giao': 'Đã giao', 'Lịch đơn vị': 'Đơn vị' };
const viewSwitch = page => page.getByRole('radiogroup', { name: 'Xem công việc', exact: true });
const chooseView = async (page, label) => {
  const control = viewSwitch(page);
  await expect(control).toBeVisible();
  await control.getByText(new RegExp(`^(${label}|${VIEW_SHORT[label]})$`)).click();
};
const expandPeriod = async (section, count) => {
  const header = section.getByRole('button', { name: new RegExp(`(Sáng|Chiều) · ${count} việc`) });
  await expect(header).toBeVisible();
  if (await header.getAttribute('aria-expanded') !== 'true') await header.click();
};
// Below xl the optional filters live behind "Lọc thêm".
const openMoreFilters = async page => {
  // Wait for the filter card to render; otherwise the toggle may not exist yet and the filters stay collapsed.
  await expect(page.locator('.work-filters')).toBeVisible();
  const toggle = page.getByRole('button', { name: /^Lọc( thêm)?$/ });
  if (await toggle.count() && await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
};
const expectWorkDate = async (page, label, value) => {
  const summary = page.locator('.work-date-summary');
  if (await summary.count()) await expect(summary).toContainText(value);
  else await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
};
const closeMoreFilters = async page => {
  const drawer = page.getByRole('dialog', { name: 'Bộ lọc công việc', exact: true });
  if (await drawer.isVisible()) { await drawer.getByRole('button', { name: 'Xong', exact: true }).click(); await expect(drawer).not.toBeVisible(); }
};
// Small screens open a read-only TimePicker to avoid the on-screen keyboard, so pick from the panel there.
const setTime = async (page, dialog, label, value) => {
  const input = dialog.getByLabel(label, { exact: true });
  await input.click();
  if (await input.isEditable()) { await input.fill(value); await input.press('Enter'); return; }
  const [hour, minute] = value.split(':');
  // The previous picker may still be animating out, so target the newest open dropdown.
  const columns = page.locator('.ant-picker-dropdown:visible:not(.ant-slide-up-leave)').last().locator('.ant-picker-time-panel-column');
  await columns.nth(0).locator('.ant-picker-time-panel-cell-inner', { hasText: new RegExp(`^${hour}$`) }).click();
  await columns.nth(1).locator('.ant-picker-time-panel-cell-inner', { hasText: new RegExp(`^${minute}$`) }).click();
  await expect(input).toHaveValue(value);
};
const runMenu = async (page, label, title = part) => {
  await page.getByRole('button', { name: `Thao tác khác: ${title}` }).first().click();
  await page.getByRole('menuitem', { name: label }).click();
};
const pickRecipient = async (page, dialog, label = 'Người thực hiện') => {
  await dialog.getByLabel(label, { exact: true }).click();
  await page.getByText('E2E Thành viên · E2E Phòng kỹ thuật', { exact: true }).click();
  // Close the dropdown by clicking the dialog title (forwarding hides the name field by default).
  await dialog.getByLabel(label, { exact: true }).press('Escape');
};
const tomorrowVN = () => new Date(Date.parse(`${todayVN()}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
// Busy slot for the whole working day (08:00–17:00), so no preset is free and the default stays "Buổi sáng".
const fullDayBusy = (extra = {}) => ({ assigneeId: memberId, assigneeName: 'E2E Thành viên', startsAt: `${todayVN()}T08:00:00+07:00`, endsAt: `${todayVN()}T17:00:00+07:00`, canViewDetails: true, title: 'E2E Đang kiểm tra', place: 'Khu A', ...extra });
const desktopOnly = testInfo => test.skip(testInfo.project.name === 'mobile', 'Vòng lặp độ rộng cố định chỉ chạy ở project desktop');

for (const width of [390, 768, 1024, 1440]) test(`công việc và tình hình dễ đọc ở ${width}px`, async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await page.setViewportSize({ width, height: 960 }); await mock(page);
  await page.goto('/work?view=mine');
  for (const [view, label] of [['mine', 'Việc của tôi'], ['given', 'Việc tôi đã giao'], ['situation', 'Lịch đơn vị']]) {
    await chooseView(page, label);
    if (view === 'situation') await page.goto('/work?view=situation&at=2026-10-24T09:00');
    await expect(page).toHaveURL(new RegExp(`view=${view}`));
    await expect(page.getByRole('region', { name: label, exact: true })).toBeVisible();
    await expect(page.locator('.work-filters')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/work');
    if (view === 'situation') await expandPeriod(page.getByRole('region', { name: 'Sáng của E2E Thành viên ngày 2026-10-24', exact: true }), 1);
    await expect(page.getByText(/Khu A/).first()).toBeVisible(); await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`work-${width}-${view}.png`), fullPage: true, animations: 'disabled' });
  }
});

test('mobile: loại xem trong bộ lọc, dải ngày gọn, bộ lọc thêm thu gọn và danh sách hiện sớm', async ({ page }, testInfo) => {
  if (testInfo.project.name !== 'mobile') await page.setViewportSize({ width: 390, height: 844 });
  const state = await mock(page); state.item.title = `E2E ${'Tên công việc chung rất dài '.repeat(6)}`;
  await page.goto('/work?view=mine');
  await expect(page.getByRole('radiogroup', { name: 'Xem công việc', exact: true }).getByRole('radio')).toHaveCount(3);
  await noOverflow(page);
  await expect(page.getByRole('group', { name: 'Điều hướng ngày' }).getByRole('button', { name: 'Ngày trước' })).toBeVisible();
  await expect(page.getByLabel('Tìm tên công việc', { exact: true })).toBeVisible();
  const card = page.locator('.mobile-card-list .mobile-card').first();
  await expect(card).toBeVisible();
  expect((await card.boundingBox()).y).toBeLessThan(480);
  await page.getByRole('button', { name: /^Lọc( thêm)?$/ }).click();
  await expect(page.getByRole('dialog', { name: 'Bộ lọc công việc' })).toBeVisible();
  await closeMoreFilters(page);
  await page.getByLabel('Tìm tên công việc', { exact: true }).fill('Hồ sơ');
  await expect.poll(() => lastRead(state)?.q).toBe('Hồ sơ');
  await page.getByRole('button', { name: 'Ngày sau' }).click();
  const tomorrow = new Date(Date.parse(`${todayVN()}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  await expect.poll(() => lastRead(state)?.from).toBe(`${tomorrow}T00:00:00+07:00`);
  await page.getByRole('button', { name: 'Hôm nay' }).click();
  await expect.poll(() => lastRead(state)?.from).toBe(`${todayVN()}T00:00:00+07:00`);
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('work-mobile-first-screen.png'), animations: 'disabled' });
});

test('form giao việc đơn giản lưu trực tiếp và báo trùng giữ dữ liệu', async ({ page }) => {
  const state = await mock(page); await page.goto('/work?view=given');
  await page.getByRole('button', { name: 'Giao việc', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Khung giờ [0-9]/)).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /Thêm khung giờ|Sao chép|Xem lại/ })).toHaveCount(0);
  await expect(dialog.locator('.work-period-options .ant-radio-button-wrapper')).toHaveText(['Buổi sáng', 'Buổi chiều', 'Cả ngày', 'Tùy chọn']);
  await dialog.getByLabel('Tên công việc', { exact: true }).fill('E2E Việc mới');
  await dialog.getByLabel('Địa điểm', { exact: true }).fill('Khu B');
  await dialog.getByText('Buổi chiều', { exact: true }).click();
  await pickRecipient(page, dialog);
  state.conflict = true; await dialog.getByRole('button', { name: 'Giao việc', exact: true }).click();
  await expect(dialog.getByText(/E2E Thành viên đã có lịch/)).toBeVisible();
  await expect(dialog.getByLabel('Tên công việc', { exact: true })).toHaveValue('E2E Việc mới');
  state.conflict = false; await dialog.getByRole('button', { name: 'Giao việc', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes.at(-1).body.segments).toHaveLength(1);
  expect(state.writes.at(-1).body.segments[0].startsAt).toContain('T13:30:00+07:00');
  expect(state.writes.at(-1).body.segments[0].endsAt).toContain('T17:00:00+07:00');
});

test('thành viên tự tạo và hoàn thành, không được xem tình hình hay chuyển việc', async ({ page }) => {
  const state = await mock(page, ['work.self_create']); await page.goto('/work?view=mine');
  await expect(viewSwitch(page)).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Việc tôi đã giao', exact: true })).toHaveCount(0);
  // Part assigned by someone else: member may complete it, but has no forward/edit/cancel menu.
  await expect(page.getByRole('button', { name: `Hoàn thành: ${part}` })).toBeVisible();
  await expect(page.getByRole('button', { name: `Thao tác khác: ${part}` })).toHaveCount(0);
  await page.getByRole('button', { name: 'Tạo việc', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tên công việc', { exact: true }).fill('E2E Đột xuất'); await dialog.getByLabel('Địa điểm').fill('Khu C');
  await dialog.getByText('Cả ngày', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Tạo việc', exact: true }).click(); await expect(dialog).toHaveCount(0);
  expect(state.writes[0].body.source).toBe('self'); expect(state.writes[0].body.segments[0].assigneeIds).toEqual([me]);
  expect(state.writes[0].body.segments[0].startsAt).toContain('T08:00:00+07:00'); expect(state.writes[0].body.segments[0].endsAt).toContain('T17:00:00+07:00');
  await page.getByRole('button', { name: `Hoàn thành: ${part}` }).click(); await page.getByLabel('Ghi chú (không bắt buộc)').fill('E2E Đã xong'); await page.getByRole('button', { name: 'Xác nhận hoàn thành' }).click();
  await expect(page.getByText('Đã hoàn thành', { exact: true })).toBeVisible();
  // Without schedule view, ?view=situation falls back to "Việc của tôi".
  await page.goto('/work?view=situation');
  await expect(page.getByRole('region', { name: 'Việc của tôi', exact: true })).toBeVisible();
  await expect(page.locator('.work-calendar')).toHaveCount(0);
});

test('tự tạo: mặc định chọn buổi còn trống và báo trùng theo ngôi thứ nhất', async ({ page }) => {
  const state = await mock(page, ['work.self_create']);
  const day = todayVN();
  state.busy = [{ id: 'busy-morning', assigneeId: me, assigneeName: 'E2E Quản trị', startsAt: `${day}T08:00:00+07:00`, endsAt: `${day}T11:30:00+07:00`, canViewDetails: true, title: 'E2E Họp sáng', place: 'Phòng họp' }];
  await page.goto('/work?view=mine'); await page.getByRole('button', { name: 'Tạo việc', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('radio', { name: 'Buổi chiều' })).toBeChecked();
  await expect(dialog.getByText('Không trùng lịch')).toBeVisible();
  // The 08:00–17:00 probe both picks the free period and answers the preview: one request only.
  expect(state.previews).toHaveLength(1);
  await dialog.getByText('Buổi sáng', { exact: true }).click();
  await expect(dialog.getByText('Bạn đã có lịch trong khung giờ này — hãy chọn thời gian khác', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Trùng lịch — vui lòng đổi người hoặc thời gian', { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Tạo việc', exact: true })).toBeDisabled();
  await expect(dialog.getByText('Còn trùng lịch', { exact: true })).toBeVisible();
  // Self-create has no people to remove.
  await expect(dialog.getByRole('button', { name: /^Bỏ .* khỏi danh sách$/ })).toHaveCount(0);
});

test('chuyển việc bắt đầu trống, không gợi ý chính mình và giữ một phần là lựa chọn riêng', async ({ page }) => {
  const state = await mock(page); await page.goto('/work?view=mine');
  await runMenu(page, 'Chuyển việc');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Không trùng lịch')).toHaveCount(0);
  // Default form: recipient, keep-a-share and reason only; time/place stay hidden behind a link.
  await expect(dialog.getByText(/Công việc chung:/)).toHaveCount(0);
  await expect(dialog.getByLabel('Địa điểm', { exact: true })).toBeHidden();
  await expect(dialog.getByRole('button', { name: 'Đổi thời gian/địa điểm', exact: true })).toBeVisible();
  await dialog.getByLabel('Chuyển cho', { exact: true }).click();
  const options = page.locator('.ant-select-dropdown:visible .ant-select-item-option');
  await expect(options.filter({ hasText: 'E2E Thành viên' })).toHaveCount(1);
  await expect(options.filter({ hasText: /\(Tôi\)|E2E Quản trị/ })).toHaveCount(0);
  await options.filter({ hasText: 'E2E Thành viên' }).click();
  await dialog.locator('.ant-modal-title').click();
  await dialog.getByRole('checkbox', { name: 'Giữ một phần cho tôi' }).check();
  await dialog.getByLabel('Lý do chuyển việc', { exact: true }).fill('E2E Cùng làm');
  await dialog.getByRole('button', { name: 'Chuyển việc', exact: true }).click(); await expect(dialog).toHaveCount(0);
  expect(state.writes.at(-1).body.segments[0].assigneeIds).toEqual([memberId, me]);
  // Hidden time/place: the forwarded part keeps the original values.
  expect(state.writes.at(-1).body.segments[0]).toMatchObject({ startsAt: '2026-10-24T08:00:00+07:00', endsAt: '2026-10-24T12:00:00+07:00', place: 'Khu A', content: part });
  expect(state.previews.filter(body => body.action === 'transfer' && body.segments[0].assigneeIds.length === 2).at(-1).segments[0].assigneeIds).toEqual([memberId, me]);
});

test('chuyển và sửa qua menu thao tác khác; phần đã chuyển được làm mờ; hủy cần lý do', async ({ page }) => {
  const state = await mock(page); await page.goto('/work?view=mine');
  await expect(page.getByRole('button', { name: 'Sửa lịch', exact: true })).toHaveCount(0);
  await runMenu(page, 'Sửa lịch');
  let dialog = page.getByRole('dialog'); await dialog.getByLabel('Địa điểm').fill('Khu sửa'); await dialog.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click(); await expect(dialog).toHaveCount(0);
  await runMenu(page, 'Chuyển việc'); dialog = page.getByRole('dialog');
  await dialog.getByLabel('Lý do chuyển việc', { exact: true }).fill('E2E Điều chỉnh');
  await pickRecipient(page, dialog, 'Chuyển cho');
  await dialog.getByRole('button', { name: 'Đổi thời gian/địa điểm', exact: true }).click();
  await dialog.getByText('Buổi chiều', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Chuyển việc', exact: true }).click(); await expect(dialog).toHaveCount(0);
  expect(state.writes.at(-1).body.reason).toBe('E2E Điều chỉnh');
  expect(state.writes.at(-1).body.segments[0].assigneeIds).toEqual([memberId]);
  await expect(page.getByText('Đã chuyển cho người khác', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `Hoàn thành: Kiểm tra tại hiện trường` })).toHaveCount(0);
  await runMenu(page, 'Hủy việc'); dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Xác nhận hủy' }).click(); await expect(dialog.getByText('Vui lòng nhập lý do hủy')).toBeVisible();
  await dialog.getByLabel('Lý do hủy').fill('E2E Không cần nữa'); await dialog.getByRole('button', { name: 'Xác nhận hủy' }).click(); await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Đã hủy', { exact: true })).toBeVisible();
});

test('xung đột phiên bản/trạng thái nhận theo mã lỗi và hiện thông báo của máy chủ', async ({ page }) => {
  const state = await mock(page); await page.goto('/work?view=mine');
  state.versionConflict = true;
  await page.getByRole('button', { name: `Hoàn thành: ${part}` }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Xác nhận hoàn thành' }).click();
  await expect(dialog.getByText('E2E Công việc vừa được người khác cập nhật')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Đóng và tải lại công việc' })).toBeVisible();
  state.versionConflict = false; state.stateConflict = true;
  const reads = state.reads.length;
  await dialog.getByRole('button', { name: 'Xác nhận hoàn thành' }).click();
  await expect(dialog.getByText('E2E Phần việc đã được hoàn thành trước đó')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Đóng và tải lại công việc' })).toBeVisible();
  await expect.poll(() => state.reads.length).toBeGreaterThan(reads);
});

test('màu trạng thái thống nhất giữa danh sách và chi tiết', async ({ page }) => {
  const state = await mock(page); state.item.status = 'transferred'; state.item.assigneeId = memberId; state.item.assigneeName = 'E2E Thành viên';
  await page.goto('/work?view=given');
  const tag = page.locator('.ant-tag').filter({ hasText: /^Đã chuyển$/ }).first();
  await expect(tag).toHaveClass(/ant-tag-gold/);
  await page.getByRole('button', { name: `Chi tiết: ${part}` }).click();
  await expect(page.getByRole('dialog').locator('.ant-tag').filter({ hasText: /^Đã chuyển$/ })).toHaveClass(/ant-tag-gold/);
});

test('tùy chọn giờ dùng bộ chọn giờ, qua ngày hôm sau và chặn giờ kết thúc không hợp lệ', async ({ page }) => {
  const state = await mock(page, ['work.self_create'], { now: new Date('2026-11-01T00:00:00+07:00') }); await page.goto('/work?view=mine&from=2026-11-01&to=2026-11-01');
  await page.getByRole('button', { name: 'Tạo việc', exact: true }).click(); const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tên công việc', { exact: true }).fill('E2E Trực đêm'); await dialog.getByLabel('Địa điểm').fill('Khu đêm');
  await dialog.getByText('Buổi chiều', { exact: true }).click();
  await dialog.getByText('Tùy chọn', { exact: true }).click();
  await expect(dialog.getByLabel('Giờ bắt đầu', { exact: true })).toHaveValue('13:30');
  await expect(dialog.getByLabel('Giờ kết thúc', { exact: true })).toHaveValue('17:00');
  await expect(dialog.getByLabel('Ngày kết thúc', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Tạo việc', exact: true }).focus();
  for (const [label, value] of [['Giờ bắt đầu', '23:00'], ['Giờ kết thúc', '01:00']]) await setTime(page, dialog, label, value);
  await dialog.getByRole('button', { name: 'Tạo việc', exact: true }).click();
  await expect(dialog.getByText(/Thời gian kết thúc phải sau thời gian bắt đầu/)).toBeVisible(); expect(state.writes).toHaveLength(0);
  await dialog.getByRole('checkbox', { name: 'Qua ngày hôm sau' }).check();
  await expect(dialog.getByLabel('Ngày kết thúc', { exact: true })).toHaveValue('02/11/2026');
  await dialog.getByRole('button', { name: 'Tạo việc', exact: true }).click(); await expect(dialog).toHaveCount(0);
  expect(state.writes[0].body.segments[0].startsAt).toBe('2026-11-01T23:00:00+07:00'); expect(state.writes[0].body.segments[0].endsAt).toBe('2026-11-02T01:00:00+07:00');
});

test('chọn giờ trong bảng rồi bấm Tạo việc ngay vẫn lưu đúng giờ vừa chọn', async ({ page }) => {
  const state = await mock(page, ['work.self_create'], { now: new Date('2026-11-01T00:00:00+07:00') }); await page.goto('/work?view=mine&from=2026-11-01&to=2026-11-01');
  await page.getByRole('button', { name: 'Tạo việc', exact: true }).click(); const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tên công việc', { exact: true }).fill('E2E Ca chiều'); await dialog.getByLabel('Địa điểm').fill('Khu X');
  await dialog.getByText('Tùy chọn', { exact: true }).click();
  await setTime(page, dialog, 'Giờ bắt đầu', '14:00');
  await setTime(page, dialog, 'Giờ kết thúc', '16:30');
  await dialog.getByRole('button', { name: 'Tạo việc', exact: true }).click(); await expect(dialog).toHaveCount(0);
  expect(state.writes[0].body.segments[0].startsAt).toBe('2026-11-01T14:00:00+07:00'); expect(state.writes[0].body.segments[0].endsAt).toBe('2026-11-01T16:30:00+07:00');
});

test('chi tiết có lịch sử theo thời gian, tình hình có tóm tắt và lỗi tải thử lại được', async ({ page }) => {
  const state = await mock(page); state.fail = true;
  state.history = [
    { id: 'h2', assignmentId: 'child', action: 'received', actorName: 'E2E Quản trị', reason: 'E2E Cần hỗ trợ', createdAt: '2026-10-24T02:00:00Z', after: JSON.stringify({ starts_at: '2026-10-24T06:30:00Z', ends_at: '2026-10-24T10:00:00Z', place: 'Khu B' }) },
    { id: 'h1', assignmentId: partId, action: 'created', actorName: 'E2E Quản trị', createdAt: '2026-10-24T01:00:00Z', after: JSON.stringify({ starts_at: '2026-10-24T01:00:00Z', ends_at: '2026-10-24T05:00:00Z', place: 'Khu A' }) },
  ];
  await page.goto('/work?view=mine');
  await expect(page.getByText('Không tải được dữ liệu', { exact: true })).toBeVisible();
  state.fail = false; await page.getByRole('button', { name: 'Thử lại' }).click();
  state.items = [state.item, { ...state.item, id: 'child', parentId: partId, assigneeId: memberId, assigneeName: 'E2E Thành viên', place: 'Khu B' }];
  await page.getByRole('button', { name: `Chi tiết: ${part}` }).first().click(); const drawer = page.getByRole('dialog');
  await expect(drawer.getByText('Chi tiết công việc')).toBeVisible();
  await expect(drawer.getByText('Mô tả: E2E Mô tả')).toBeVisible();
  await expect(drawer.locator('.ant-pagination')).toHaveCount(0);
  // History is expanded by default.
  const entries = drawer.locator('.work-history-entry');
  await expect(entries).toHaveCount(2);
  await expect(entries.nth(0)).toContainText('Giao việc');
  await expect(entries.nth(1)).toContainText('E2E Quản trị chuyển cho E2E Thành viên: 13:30 – 17:00 · 24/10/2026 · Khu B');
  await expect(entries.nth(1)).toContainText('Lý do: E2E Cần hỗ trợ');
  await page.goto('/work?view=situation&layout=list');
  await expect(page.locator('.work-calendar')).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Kiểu hiển thị lịch' })).toHaveCount(0);
  await openMoreFilters(page);
  await expect(page.getByRole('combobox', { name: 'Đơn vị' })).toBeVisible();
});

test('form và lịch dùng được với giao diện tối', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('themeMode', 'dark'));
  await mock(page); await page.goto('/work?view=mine');
  await page.getByRole('button', { name: 'Giao việc', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Tên công việc', { exact: true })).toBeVisible(); await noOverflow(page);
  await expect(page.getByRole('dialog')).toHaveCSS('transform', 'none');
  await page.getByRole('dialog').screenshot({ path: testInfo.outputPath('work-dark-form.png') });
});

test('dữ liệu rỗng không làm trắng trang và người chưa có quyền không thấy nút giao', async ({ page }) => {
  const state = await mock(page, []); state.empty = true;
  await page.goto('/work?view=mine');
  await expect(page.locator('.work-filters')).toBeVisible();
  await expect(page.getByText('Chưa có công việc trong ngày đã chọn.', { exact: true })).toBeVisible();
  await expect(page.getByText(/nếu được cấp quyền/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Giao việc', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tạo việc', exact: true })).toHaveCount(0);
});

test('trạng thái rỗng có nút giao việc khi được cấp quyền', async ({ page }) => {
  const state = await mock(page); state.empty = true;
  await page.goto('/work?view=mine');
  const empty = page.locator('.ant-empty');
  await expect(empty.getByText('Chưa có công việc trong ngày đã chọn.', { exact: true })).toBeVisible();
  await empty.getByRole('button', { name: 'Giao việc', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Tên công việc', { exact: true })).toBeVisible();
});

test('bộ lọc giữ nguyên ngày và loại xem khi đóng chi tiết', async ({ page }) => {
  await mock(page);
  await page.goto('/work?view=given&from=2026-11-15&to=2026-11-15');
  await expectWorkDate(page, 'Ngày làm việc', '15/11/2026');
  await page.getByRole('button', { name: `Chi tiết: ${part}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Close|Đóng/ }).click();
  await expectWorkDate(page, 'Ngày làm việc', '15/11/2026');
  await expect(page).toHaveURL(/view=given/);
  await chooseView(page, 'Lịch đơn vị');
  await expectWorkDate(page, 'Ngày xem lịch', '15/11/2026');
  await chooseView(page, 'Việc của tôi');
  await expectWorkDate(page, 'Ngày làm việc', '15/11/2026');
});

test('desktop dùng bảng, tablet và mobile dùng danh sách card theo chuẩn cán bộ', async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  const state = await mock(page);
  state.items = [0, 1, 2].map(index => ({ ...state.item, id: `${partId}-${index}`, content: `E2E Công việc ${index + 1}` }));
  for (const width of [1440, 1200, 1199, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/work?view=mine');
    await expect(page.locator('.work-filters')).toBeVisible();
    if (width >= 1200) {
      const table = page.getByRole('table', { name: 'Danh sách công việc' });
      await expect(table).toBeVisible();
      await expect(table.getByRole('columnheader', { name: 'Người thực hiện', exact: true })).toHaveCount(0);
      await expect(table.getByRole('row')).toHaveCount(4);
    } else {
      await expect(page.getByRole('table', { name: 'Danh sách công việc' })).toHaveCount(0);
      const cards = page.locator('.mobile-card-list .mobile-card');
      await expect(cards).toHaveCount(3);
      await expect(cards.first().getByText(/Người thực hiện/)).toHaveCount(0);
      await expect(cards.first().getByText('Chưa hoàn thành', { exact: true })).toHaveCount(1);
      const [first, second] = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()]);
      expect(Math.abs(first.x - second.x)).toBeLessThan(1);
      expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
    }
    await noOverflow(page);
  }
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto('/work?view=given');
  await expect(page.locator('.work-given-groups')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Người thực hiện', exact: true })).toHaveCount(0);
});

for (const viewport of [{ width: 1440, height: 480 }, { width: 1024, height: 480 }, { width: 768, height: 480 }, { width: 390, height: 480 }]) {
  test(`modal dài cuộn bên trong và giữ nút thao tác trong màn hình ${viewport.width}px`, async ({ page }, testInfo) => {
    desktopOnly(testInfo);
    await page.setViewportSize(viewport); await mock(page); await page.goto('/work?view=mine');
    await page.getByRole('button', { name: 'Giao việc', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Tùy chọn', { exact: true }).click();
    await expect(dialog).toHaveCSS('transform', 'none');
    const metrics = await dialog.evaluate(element => {
      const body = element.querySelector('.ant-modal-body');
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, height: window.innerHeight, scrollable: body.scrollHeight > body.clientHeight, overflow: getComputedStyle(body).overflowY, wrapperOverflow: getComputedStyle(element.closest('.ant-modal-wrap')).overflowY };
    });
    expect(metrics.top).toBeGreaterThanOrEqual(8);
    expect(metrics.bottom).toBeLessThanOrEqual(metrics.height - 8);
    expect(metrics.scrollable).toBeTruthy(); expect(metrics.overflow).toBe('auto'); expect(metrics.wrapperOverflow).toBe('hidden');
    const footer = dialog.getByRole('button', { name: 'Giao việc', exact: true });
    await expect(footer).toBeInViewport();
    // Preset buttons are not clipped (2×2 on phones).
    for (const label of ['Buổi sáng', 'Buổi chiều', 'Cả ngày', 'Tùy chọn']) {
      await expect.poll(async () => {
        const box = await dialog.getByText(label, { exact: true }).boundingBox();
        const body = await dialog.locator('.ant-modal-body').boundingBox();
        return box.x + box.width <= body.x + body.width + 1;
      }).toBeTruthy();
    }
    if (viewport.width < 768) {
      // Phones: the people list opens below its select instead of covering the time presets.
      const people = dialog.getByLabel('Người thực hiện', { exact: true });
      await people.scrollIntoViewIfNeeded(); await people.click();
      const popup = dialog.locator('.ant-select-dropdown:visible');
      await expect(popup).toBeVisible();
      const [popupBox, presetBox] = await Promise.all([popup.boundingBox(), dialog.locator('.work-period-options').boundingBox()]);
      expect(popupBox.y).toBeLessThan(presetBox.y + presetBox.height);
      await dialog.locator('.ant-modal-title').click();
    }
    await expect(footer).toBeDisabled();
    await pickRecipient(page, dialog);
    await expect(footer).toBeEnabled();
    await footer.click();
    await expect(dialog.getByLabel('Tên công việc', { exact: true })).toBeFocused();
    await expect(dialog.getByLabel('Tên công việc', { exact: true })).toBeInViewport();
    await dialog.locator('.ant-modal-body').evaluate(body => { body.scrollTop = body.scrollHeight; });
    const lastError = dialog.getByText('Vui lòng nhập địa điểm', { exact: true });
    await expect(lastError).toBeInViewport();
    const [errorBox, footerBox] = await Promise.all([lastError.boundingBox(), dialog.locator('.ant-modal-footer').boundingBox()]);
    expect(errorBox.y + errorBox.height).toBeLessThanOrEqual(footerBox.y);
    await expect(footer).toBeInViewport();
    await expect(dialog.getByText('Chọn người thực hiện để giao việc', { exact: true })).toHaveCount(0);
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`modal-scroll-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
  });
}

test('ô tìm kiếm và nơi làm việc giữ nguyên dấu tiếng Việt khi gõ và khi dùng bộ gõ', async ({ page }, testInfo) => {
  const state = await mock(page); await page.goto('/work?view=given');
  const search = page.getByLabel('Tìm tên công việc', { exact: true });
  await search.click(); await page.keyboard.type('kiểm tra phòng', { delay: 20 });
  await expect(search).toHaveValue('kiểm tra phòng');
  await expect.poll(() => lastRead(state)?.q).toBe('kiểm tra phòng');
  // Telex/IME: nothing is committed to the URL until composition ends.
  await search.fill('');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'hồ', selectionStart: 2, selectionEnd: 2 });
  await expect(search).toHaveValue('hồ');
  expect(new URL(page.url()).searchParams.get('q')).toBeNull();
  await cdp.send('Input.insertText', { text: 'hồ' });
  await page.keyboard.type(' sơ');
  await expect(search).toHaveValue('hồ sơ');
  await expect.poll(() => lastRead(state)?.q).toBe('hồ sơ');
  if (testInfo.project.name === 'mobile') return;
  await page.goto('/work?view=situation');
  const place = page.getByLabel('Nơi làm việc', { exact: true });
  await place.click(); await page.keyboard.type('Phòng họp số 2', { delay: 20 });
  await expect(place).toHaveValue('Phòng họp số 2');
  await expect.poll(() => lastRead(state, '/api/work-schedule')?.place).toBe('Phòng họp số 2');
});

test('bộ lọc tự tìm kiếm, lọc trạng thái và xóa lọc giữ loại xem', async ({ page }) => {
  const state = await mock(page); await page.goto('/work?view=given');
  await page.getByLabel('Tìm tên công việc', { exact: true }).fill('Hồ sơ');
  await expect.poll(() => lastRead(state)?.q).toBe('Hồ sơ');
  await openMoreFilters(page);
  await page.getByRole('combobox', { name: 'Trạng thái', exact: true }).click();
  await page.locator('.ant-select-dropdown:visible').getByText('Đã hoàn thành', { exact: true }).click();
  await expect.poll(() => lastRead(state)?.status).toBe('completed');
  await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
  await closeMoreFilters(page);
  await expect(page.getByLabel('Tìm tên công việc', { exact: true })).toHaveValue('');
  await expect.poll(() => lastRead(state)?.q).toBeUndefined();
  await expect.poll(() => lastRead(state)?.status).toBeUndefined();
  await expect(page).toHaveURL(/view=given/);
});

test('lịch đơn vị lọc người, nơi làm việc và đơn vị; chuyển ngày hoặc tuần', async ({ page }) => {
  const state = await mock(page); await page.goto('/work?view=situation&layout=list&at=2026-10-24T09:00');
  await page.getByRole('combobox', { name: 'Người thực hiện', exact: true }).click();
  await page.getByRole('option', { name: 'E2E Thành viên', exact: true }).click();
  await openMoreFilters(page);
  await expect(page.getByRole('combobox', { name: 'Đơn vị', exact: true })).toBeVisible();
  await page.getByLabel('Nơi làm việc', { exact: true }).fill('Khu A');
  await expect.poll(() => lastRead(state, '/api/work-schedule')?.place).toBe('Khu A');
  await expect.poll(() => lastRead(state, '/api/work-schedule')?.assigneeId).toBe(memberId);
  await closeMoreFilters(page);
  await expect(page.getByLabel('Giờ xem', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^(Ngày sau|Tuần sau)$/ }).click();
  await expect.poll(() => lastRead(state, '/api/work-schedule')?.from).toBeTruthy();
  expect(lastRead(state, '/api/work-schedule').at).toBeUndefined();
  await openMoreFilters(page);
  await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
  await expect(page.getByLabel('Nơi làm việc', { exact: true })).toHaveValue('');
  await closeMoreFilters(page);
  await expect.poll(() => lastRead(state, '/api/work-schedule')?.assigneeId).toBeUndefined();
  await expect.poll(() => lastRead(state, '/api/work-schedule')?.place).toBeUndefined();
});

test('desktop xếp loại xem, dải ngày và bộ lọc thẳng hàng không tràn', async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await mock(page);
  for (const width of [1200, 1440, 1920]) for (const view of ['mine', 'given', 'situation']) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto(`/work?view=${view}&layout=list`);
    await expect(page.getByRole('button', { name: /^Lọc( thêm)?$/ })).toHaveCount(0);
    const fields = page.locator('.work-filter-row > .work-filter-field');
    await expect(fields).toHaveCount(view === 'mine' ? 2 : 3);
    const boxes = await fields.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top));
    expect(Math.max(...boxes) - Math.min(...boxes)).toBeLessThan(2);
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`work-inline-${width}-${view}.png`), fullPage: true });
  }
});

test('lọc việc đã giao theo người thực hiện và xóa lọc', async ({ page }) => {
  const state = await mock(page); await page.goto('/work?view=given');
  await openMoreFilters(page);
  await page.getByRole('combobox', { name: 'Người thực hiện', exact: true }).click();
  await page.locator('.ant-select-dropdown:visible').getByText('E2E Thành viên', { exact: true }).click();
  await expect.poll(() => lastRead(state)?.assigneeId).toBe(memberId);
  expect(state.reads.some(r => r.path.endsWith('/recipients') && r.mode === 'given')).toBeTruthy();
  await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
  await expect.poll(() => lastRead(state)?.assigneeId).toBeUndefined();
});
test('người chỉ xem lịch không thấy việc đã giao và không mở được bằng URL', async ({ page }) => {
  const state = await mock(page, ['work.schedule_view', 'work.self_create']); await page.goto('/work?view=given');
  await expect(page.locator('.work-filters')).toBeVisible();
  await expect(viewSwitch(page)).toBeVisible();
  await expect(viewSwitch(page).getByRole('radio', { name: /Việc tôi đã giao|Đã giao/ })).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBeNull();
  await openMoreFilters(page);
  await expect(page.getByRole('combobox', { name: 'Người thực hiện', exact: true })).toHaveCount(0);
  await closeMoreFilters(page);
  await expect(page.getByRole('button', { name: 'Giao việc', exact: true })).toHaveCount(0);
  expect(state.reads.some(row => row.mode === 'given')).toBeFalsy();
  await chooseView(page, 'Lịch đơn vị');
  await expect(page.locator('.work-calendar')).toBeVisible();
});
test('thành viên không có quyền không tải danh sách lọc người', async ({ page }) => {
  const state = await mock(page, ['work.self_create']); await page.goto('/work?view=given');
  await expect(page.locator('.work-filters')).toBeVisible();
  await openMoreFilters(page);
  await expect(page.getByRole('combobox', { name: 'Người thực hiện', exact: true })).toHaveCount(0);
  expect(state.reads.some(r => r.path.endsWith('/recipients'))).toBeFalsy();
});

for (const width of [320, 390, 768, 1440]) test(`chọn ngày một chạm, mốc tuần sau và lịch không bị cắt ở ${width}px`, async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await page.setViewportSize({ width, height: 844 }); const state = await mock(page); await page.goto('/work?view=mine&from=2026-11-10&to=2026-11-10');
  if (width < 768) await page.getByRole('button', { name: /^Chọn thời gian:/ }).click();
  await page.getByLabel('Ngày làm việc', { exact: true }).click();
  const popup = page.locator('.ant-picker-dropdown:visible').first();
  if (width >= 768) await expect(popup.getByRole('button', { name: 'Tuần sau' })).toBeVisible();
  await expect.poll(async () => { const rect = await popup.boundingBox(); return Boolean(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= 844); }).toBeTruthy();
  const box = await popup.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width); expect(box.y + box.height).toBeLessThanOrEqual(844);
  await expect(popup.locator('.ant-picker-header')).toBeInViewport();
  await popup.screenshot({ path: testInfo.outputPath(`date-picker-${width}.png`) });
  await popup.getByTitle('2026-11-15').click();
  await expect.poll(() => lastRead(state)?.from).toBe('2026-11-15T00:00:00+07:00');
  await expect.poll(() => lastRead(state)?.to).toBe('2026-11-16T00:00:00+07:00');
  if (width < 768) {
    const sheet = page.getByRole('dialog', { name: 'Thời gian', exact: true });
    await sheet.getByText('Tuần', { exact: true }).click();
    await sheet.getByRole('button', { name: 'Xong', exact: true }).click();
  } else {
    await page.getByLabel('Ngày làm việc', { exact: true }).click();
    await page.locator('.ant-picker-dropdown:visible').first().getByRole('button', { name: 'Tuần sau' }).click();
  }
  await expect.poll(() => Number(new Date(lastRead(state)?.to) - new Date(lastRead(state)?.from)) / 86400000).toBe(7);
  await expect(page.locator('.work-date-summary, .work-range-input').first()).toBeVisible();
  await page.getByRole('button', { name: 'Tuần sau', exact: true }).click();
  await page.getByRole('button', { name: 'Hôm nay', exact: true }).click();
  await expect.poll(() => lastRead(state)?.from).toBe(`${todayVN()}T00:00:00+07:00`);
  await expectWorkDate(page, 'Ngày làm việc', showDay(todayVN()));
  await noOverflow(page);
});

test('chọn khoảng ngày trên desktop bằng RangePicker', async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  const state = await mock(page); await page.goto('/work?view=mine&from=2026-11-10&to=2026-11-15');
  await page.getByPlaceholder('Từ ngày', { exact: true }).fill('10/11/2026');
  await page.getByPlaceholder('Đến ngày', { exact: true }).fill('20/11/2026');
  await page.getByPlaceholder('Đến ngày', { exact: true }).press('Enter');
  await expect.poll(() => lastRead(state)?.to).toBe('2026-11-21T00:00:00+07:00');
  await page.getByRole('button', { name: 'Một ngày' }).click();
  await expect.poll(() => lastRead(state)?.to).toBe('2026-11-11T00:00:00+07:00');
});

test('sửa tên phần việc hiển thị ngay và tìm được theo tên mới', async ({ page }) => {
  const state = await mock(page); await page.goto('/work?view=given');
  await runMenu(page, 'Sửa lịch');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tên công việc', { exact: true }).fill('E2E Tên mới');
  await dialog.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('E2E Tên mới', { exact: true })).toBeVisible();
  await expect(page.getByText('Đã cập nhật công việc', { exact: true })).toBeVisible();
  await page.getByLabel('Tìm tên công việc', { exact: true }).fill('Tên mới');
  await expect.poll(() => lastRead(state)?.q).toBe('Tên mới');
  await expect(page.getByText('E2E Tên mới', { exact: true })).toBeVisible();
});

test('ngày giao mặc định theo bộ lọc, báo việc ngoài bộ lọc và mở được việc vừa tạo', async ({ page }) => {
  const state = await mock(page); await page.goto('/work?view=given&from=2027-11-15&to=2027-11-20&status=completed');
  await page.getByRole('button', { name: 'Giao việc', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Ngày làm việc', { exact: true })).toHaveValue('15/11/2027');
  await dialog.getByLabel('Tên công việc', { exact: true }).fill('E2E Mới');
  await dialog.getByLabel('Địa điểm', { exact: true }).fill('Khu B');
  await pickRecipient(page, dialog);
  await dialog.getByRole('button', { name: 'Giao việc', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes.at(-1).body.segments[0].startsAt).toContain('2027-11-15');
  // One notice only: the success title carries the actions when the new work is filtered out.
  await expect(page.getByText('Việc nằm ngoài bộ lọc đang xem.', { exact: true })).toBeVisible();
  await expect(page.getByText('Đã giao việc cho 1 người', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Hiện trong danh sách', exact: true }).click();
  expect(new URL(page.url()).searchParams.has('status')).toBeFalsy();
  await expectWorkDate(page, 'Ngày làm việc', '15/11/2027');
});

test('tạo từ ngày quá khứ giữ nguyên ngày được chọn, không tự đổi sang hôm nay', async ({ page }) => {
  await mock(page); await page.goto('/work?view=given&from=2026-01-05&to=2026-01-05');
  await page.getByRole('button', { name: 'Giao việc', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Ngày làm việc', { exact: true })).toHaveValue('05/01/2026');
  await expect(dialog.getByText('Ngày đang xem đã qua nên lịch mới mặc định là hôm nay.')).toHaveCount(0);
});

test('kiểm tra lịch trước lưu, chặn trùng và cập nhật khi đổi giờ', async ({ page }) => {
  const state = await mock(page); state.previewConflicts = [fullDayBusy({ id: partId })];
  await page.goto('/work?view=mine'); await page.getByRole('button', { name: 'Giao việc', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await pickRecipient(page, dialog);
  await expect(dialog.getByText('Trùng lịch — vui lòng đổi người hoặc thời gian', { exact: true })).toBeVisible();
  await expect(dialog.getByText('E2E Đang kiểm tra · Khu A', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Giao việc', exact: true })).toBeDisabled();
  await expect(dialog.getByText('Còn trùng lịch', { exact: true })).toBeVisible();
  await dialog.getByLabel('Tên công việc', { exact: true }).fill('E2E Trùng lịch');
  await dialog.getByLabel('Địa điểm', { exact: true }).fill('Khu B');
  await dialog.getByLabel('Địa điểm', { exact: true }).press('Enter');
  await expect(page.getByText('Khung giờ đang trùng lịch — hãy đổi thời gian hoặc người thực hiện')).toBeVisible();
  expect(state.writes).toHaveLength(0);
  state.previewConflicts = [];
  await dialog.getByText('Buổi chiều', { exact: true }).click();
  await expect(dialog.getByText('Không trùng lịch')).toBeVisible();
  await expect(dialog.getByText('Còn trùng lịch', { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Giao việc', exact: true })).toBeEnabled();
  expect(state.previews.at(-1).segments[0].startsAt).toContain('T13:30');
});
test('lịch bận không được xem chi tiết được ẩn, lỗi kiểm tra thử lại được', async ({ page }) => {
  const state = await mock(page, ['work.self_create']); state.previewFail = true;
  await page.goto('/work?view=mine'); await page.getByRole('button', { name: 'Tạo việc', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert').getByText('Chưa kiểm tra được lịch bận', { exact: true })).toBeVisible();
  state.previewFail = false; state.previewConflicts = [fullDayBusy({ assigneeId: me, assigneeName: 'E2E Tôi', canViewDetails: false })];
  await dialog.getByRole('button', { name: 'Kiểm tra lại lịch', exact: true }).click();
  await expect(dialog.getByText('Đã có lịch bận; bạn không có quyền xem nội dung và địa điểm.', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Bạn đã có lịch trong khung giờ này — hãy chọn thời gian khác', { exact: true })).toBeVisible();
});
test('URL giữ bộ lọc sau F5, phân trang 25 dòng, mở chi tiết và quay lại bằng Back', async ({ page }) => {
  const state = await mock(page); state.total = 41; await page.goto(`/work?view=given&from=2026-11-01&to=2026-11-15&q=Hồ%20sơ&status=assigned&assigneeId=${memberId}&page=2`);
  await expect(page.locator('.work-date-summary, .work-range-input').first()).toBeVisible();
  await expect(page.getByLabel('Tìm tên công việc', { exact: true })).toHaveValue('Hồ sơ');
  await page.reload();
  await expect.poll(() => lastRead(state)?.page).toBe('2');
  expect(lastRead(state)?.limit).toBe('25');
  await expect(page.getByLabel('Tìm tên công việc', { exact: true })).toHaveValue('Hồ sơ');
  await page.getByRole('button', { name: `Chi tiết: ${part}` }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack(); await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('assigneeId')).toBe(memberId);
  await openMoreFilters(page);
  await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
  await closeMoreFilters(page);
  await expect(page.getByLabel('Tìm tên công việc', { exact: true })).toHaveValue('');
  expect(new URL(page.url()).searchParams.has('assigneeId')).toBeFalsy();
});

test('trang vượt quá tổng số được đưa về trang cuối', async ({ page }) => {
  const state = await mock(page); state.total = 30;
  await page.goto('/work?view=given&page=5');
  await expect(page).toHaveURL(/page=2/);
  await expect.poll(() => lastRead(state)?.page).toBe('2');
});

test('URL khôi phục tên người ngoài trang danh mục đầu tiên', async ({ page }) => {
  const state = await mock(page); state.omitSelected = true;
  await page.goto(`/work?view=given&assigneeId=${memberId}`);
  await openMoreFilters(page);
  await expect(page.locator('.work-filter-field').filter({ has: page.getByRole('combobox', { name: 'Người thực hiện', exact: true }) }).getByText('E2E Thành viên', { exact: true })).toBeVisible();
  expect(state.reads.some(r => r.path.endsWith('/recipients') && r.id === memberId)).toBeTruthy();
});

test('modal công việc không đổi kiểu nút của modal khác trong ứng dụng', async ({ page }) => {
  await mock(page); await page.goto('/work?view=mine');
  const leaked = await page.evaluate(() => [...document.styleSheets].flatMap(sheet => { try { return [...sheet.cssRules]; } catch { return []; } })
    .map(rule => rule.selectorText || '').filter(selector => /(^|,)\s*\.ant-modal \.ant-btn|html\[data-theme="dark"\] input\[type="date"\]/.test(selector)));
  expect(leaked).toEqual([]);
});

for (const width of [768, 1024]) test(`lịch bận dài giữ modal và nút lưu trong màn hình thấp ${width}px`, async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await page.setViewportSize({ width, height: 480 });
  await page.addInitScript(() => localStorage.setItem('themeMode', 'dark'));
  const state = await mock(page);
  state.previewConflicts = Array.from({ length: 5 }, (_, index) => fullDayBusy({ id: `busy-${index}`, title: `E2E Lịch bận ${index + 1}` }));
  await page.goto('/work?view=mine'); await page.getByRole('button', { name: 'Giao việc', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await pickRecipient(page, dialog);
  await expect(dialog.getByText('Trùng lịch — vui lòng đổi người hoặc thời gian', { exact: true })).toBeVisible();
  await dialog.getByText('E2E Lịch bận 5 · Khu A', { exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button', { name: 'Giao việc', exact: true })).toBeInViewport();
  const metrics = await dialog.evaluate(element => { const rect = element.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, viewport: window.innerHeight }; });
  expect(metrics.top).toBeGreaterThanOrEqual(8); expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewport - 8);
  await noOverflow(page);
  await dialog.screenshot({ path: testInfo.outputPath(`busy-dark-${width}.png`) });
});

test('nút giao việc từ trang chủ mở sẵn form một lần', async ({ page }) => {
  await mock(page); await page.goto('/work?view=given');
  await page.evaluate(() => {
    window.history.pushState({ usr: { openEditor: 'create' }, key: 'e2e-home', idx: 1 }, '', '/work?view=given');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  });
  await page.reload();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Tên công việc', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.reload();
  await expect(page.locator('.work-filters')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('lịch sử hiển thị tên phần việc và thông tin chung trước sau', async ({ page }) => {
  const state = await mock(page);
  await page.route(`**/api/work-assignments/${workId}*`, route => route.fulfill({ json: { items: [state.item], pagination: { total: 1 }, history: [
    { id: 'rename', assignmentId: partId, action: 'updated', actorName: 'E2E Người sửa', createdAt: state.item.startsAt, before: { content: 'E2E Tên cũ', starts_at: state.item.startsAt, ends_at: state.item.endsAt }, after: { content: 'E2E Tên mới', starts_at: state.item.startsAt, ends_at: state.item.endsAt } },
    { id: 'common', assignmentId: partId, action: 'info_updated', actorName: 'E2E Người sửa', createdAt: state.item.startsAt, before: JSON.stringify({ title: 'E2E Chung cũ', description: 'E2E Mô tả cũ' }), after: JSON.stringify({ title: 'E2E Chung mới', description: '' }) },
  ] } }));
  await page.goto(`/work?workId=${workId}`);
  const dialog = page.getByRole('dialog');
  for (const text of ['Trước: E2E Tên cũ', 'Sau: E2E Tên mới', 'Trước: E2E Chung cũ', 'Sau: E2E Chung mới', 'Trước: E2E Mô tả cũ', 'Sau: Đã bỏ trống']) await expect(dialog.getByText(text, { exact: true })).toBeVisible();
});
for (const width of [390, 768]) test(`mobile luôn có ô tìm kiếm không cần mở Lọc thêm ở ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 960 }); await mock(page); await page.goto('/work?view=mine');
  await expect(page.getByRole('textbox', { name: 'Tìm tên công việc', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Lọc( thêm)?$/, exact: true })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('textbox', { name: 'Tìm tên công việc', exact: true }).fill('Hồ sơ');
  await expect(page.getByRole('textbox', { name: 'Tìm tên công việc', exact: true })).toHaveValue('Hồ sơ');
  await page.reload();
  await expect(page.getByRole('button', { name: /^Lọc( thêm)?$/, exact: true })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: /^Lọc( thêm)?$/, exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Bộ lọc công việc' })).toBeVisible();
  await closeMoreFilters(page);
  await expect(page.getByRole('textbox', { name: 'Tìm tên công việc', exact: true })).toHaveCount(1);
});

test('bộ lọc công việc không có điều khiển tràn khỏi thẻ ở mobile hẹp', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 }); await mock(page);
  await page.goto('/work?view=situation&layout=list');
  await expect(page.locator('.work-filters')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Người thực hiện', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('work-mobile-filters.png'), fullPage: true, animations: 'disabled' });
  const escaped = await page.locator('.work-filters').evaluate(card => {
    const bounds = card.getBoundingClientRect();
    return [...card.querySelectorAll('input, button, .ant-segmented-item')].map(node => ({ text: node.getAttribute('aria-label') || node.textContent || node.id, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right })).filter(box => box.left < bounds.left - 1 || box.right > bounds.right + 1);
  });
  expect(escaped).toEqual([]);
  const previous = await page.getByRole('button', { name: 'Ngày trước', exact: true }).boundingBox();
  const next = await page.getByRole('button', { name: 'Ngày sau', exact: true }).boundingBox();
  expect(Math.abs(previous.y - next.y), 'hai nút chuyển ngày phải nằm cùng hàng với ô ngày').toBeLessThan(2);
});

for (const width of [320, 390, 768, 1024, 1440]) test(`bộ lọc theo chuẩn NTDLS, ngày và footer không chồng ở ${width}px`, async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await page.setViewportSize({ width, height: 640 }); const state = await mock(page);
  if (width === 390) await page.addInitScript(() => localStorage.setItem('themeMode', 'dark'));
  await page.goto(`/work?view=given&from=2026-11-01&to=2026-11-15&assigneeId=${memberId}`);
  await expect(page.getByRole('textbox', { name: 'Tìm tên công việc', exact: true })).toBeVisible();
  if (width < 768) await page.getByRole('button', { name: /^Chọn thời gian:/ }).click();
  const from = await page.getByPlaceholder('Từ ngày', { exact: true }).boundingBox();
  const to = await page.getByPlaceholder('Đến ngày', { exact: true }).boundingBox();
  expect(from && to).toBeTruthy();
  expect(from.y + from.height <= to.y + 1 || from.x + from.width <= to.x + 1, 'hai ô khoảng ngày không được đè lên nhau').toBeTruthy();
  if (width < 1200) {
    await page.getByPlaceholder('Từ ngày', { exact: true }).click();
    const calendar = page.locator('.ant-picker-dropdown:visible').first();
    await expect.poll(async () => { const rect = await calendar.boundingBox(); return Boolean(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= 641); }).toBeTruthy();
    await expect(calendar.locator('.ant-picker-header').first()).toBeInViewport();
    await page.getByPlaceholder('Từ ngày', { exact: true }).press('Escape');
    await expect(calendar).not.toBeVisible();
    if (width < 768) await page.getByRole('dialog', { name: 'Thời gian', exact: true }).getByRole('button', { name: 'Xong', exact: true }).click();
    await page.getByRole('button', { name: /^Lọc( thêm)?$/, exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Bộ lọc công việc', exact: true });
    await expect(drawer).toBeVisible();
    await expect.poll(async () => { const rect = await drawer.boundingBox(); return Boolean(rect && rect.x >= -1 && rect.y >= -1 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= 641); }).toBeTruthy();
    const box = await drawer.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(-1); expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(box.y).toBeGreaterThanOrEqual(-1); expect(box.y + box.height).toBeLessThanOrEqual(641);
    if (width < 768) { expect(box.width).toBeGreaterThanOrEqual(width - 1); expect(box.y).toBeGreaterThan(0); }
    else { expect(box.width).toBeLessThanOrEqual(441); expect(box.x + box.width).toBeGreaterThanOrEqual(width - 1); }
    await expect(drawer.getByRole('button', { name: 'Xong', exact: true })).toBeInViewport();
    await expect(drawer.getByRole('button', { name: 'Xóa bộ lọc', exact: true })).toBeInViewport();
    await drawer.getByRole('combobox', { name: 'Trạng thái', exact: true }).click();
    await page.locator('.ant-select-dropdown:visible').getByText('Đã hoàn thành', { exact: true }).click();
    await expect.poll(() => lastRead(state)?.status).toBe('completed');
    await page.screenshot({ path: testInfo.outputPath(`work-filter-sheet-${width}.png`), animations: 'disabled' });
    await closeMoreFilters(page);
    await page.reload();
    await expect(page.getByRole('button', { name: /^Lọc( thêm)?$/, exact: true })).toHaveAttribute('aria-expanded', 'false');
    await openMoreFilters(page);
    await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
    await expect.poll(() => lastRead(state)?.assigneeId).toBeUndefined();
    await expect.poll(() => lastRead(state)?.status).toBeUndefined();
    await closeMoreFilters(page);
  }
  await page.screenshot({ path: testInfo.outputPath(`work-filter-toolbar-${width}.png`), animations: 'disabled' });
  await noOverflow(page);
});

for (const width of [390, 768, 1440]) test(`lịch theo người: xem và giao nhanh đúng ngày ở ${width}px`, async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await page.setViewportSize({ width, height: 960 });
  const state = await mock(page);
  const date = todayVN();
  Object.assign(state.item, { startsAt: `${date}T01:00:00Z`, endsAt: `${date}T04:30:00Z`, assigneeId: memberId });
  await page.goto('/work');
  await expect(page.locator('.work-filters')).toBeVisible();
  await expect(page).toHaveURL(/\/work/);
  await expect(page.getByRole('region', { name: 'Lịch đơn vị', exact: true })).toBeVisible();
  await expandPeriod(page.getByRole('region', { name: `Sáng của E2E Thành viên ngày ${date}`, exact: true }), 1);
  await expect(page.getByRole('button', { name: `Chi tiết: ${part}`, exact: true })).toBeVisible();
  await expect.poll(() => lastRead(state, '/api/work-schedule')?.from).toBeTruthy();
  expect(lastRead(state, '/api/work-schedule').at).toBeUndefined();
  const span = (Date.parse(lastRead(state, '/api/work-schedule').to) - Date.parse(lastRead(state, '/api/work-schedule').from)) / 86400000;
  expect(span).toBe(width < 768 ? 1 : 7);
  expect(await page.locator('.work-calendar-table').count()).toBe(width < 768 ? 0 : 1);
  await expect(page.getByRole('button', { name: /^Giao việc cho E2E Chưa phân công/ })).toHaveCount(0);
  await noOverflow(page);
  expect(await page.locator('.work-calendar-task').first().evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBeTruthy();
  await expect(page.locator('.work-calendar').getByText('Chưa có việc', { exact: true })).toHaveCount(0);
  // Empty periods stay blank instead of repeating "Trống".
  await expect(page.locator('.work-calendar').getByText('Trống', { exact: true })).toHaveCount(0);
  await expect(page.locator('.work-calendar-task').first()).not.toContainText('Chưa hoàn thành');
  if (width < 768) {
    expect((await page.locator('.work-calendar-person').first().boundingBox()).height).toBeLessThan(250);
    expect((await page.locator('.work-calendar-person').first().boundingBox()).y).toBeLessThan(480);
  }

  await page.screenshot({ path: testInfo.outputPath(`calendar-${width}.png`), fullPage: true, animations: "disabled" });
  await page.getByRole('button', { name: `Giao việc cho E2E Thành viên ngày ${date}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Giao việc', exact: true });
  await expect(dialog.getByLabel('Ngày làm việc', { exact: true })).toHaveValue(showDay(date));
  await expect(dialog).toContainText('E2E Thành viên');
  await dialog.getByLabel('Tên công việc', { exact: true }).fill('E2E Giao từ lịch');
  await dialog.getByLabel('Địa điểm', { exact: true }).fill('Khu B');
  await dialog.getByRole('button', { name: 'Giao việc', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes.at(-1).body.segments[0].assigneeIds).toEqual([memberId]);
  expect(state.writes.at(-1).body.segments[0].startsAt.slice(0, 10)).toBe(date);
});

test('lịch đơn vị chỉ xem không có nút giao và chuyên viên mặc định xem việc của tôi', async ({ page }) => {
  await mock(page, ['work.self_create', 'work.schedule_view']);
  await page.goto('/work');
  await expect(page.getByRole('region', { name: 'Việc của tôi', exact: true })).toBeVisible();
  await page.goto('/work?view=situation');
  await expect(page.locator('.work-calendar')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Giao việc cho / })).toHaveCount(0);
  await expect(page.locator('.work-calendar')).toBeVisible();
});

test('mobile: lịch ngày giao diện tối chuyển ngày và giữ đúng người khi giao', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('themeMode', 'dark'));
  const state = await mock(page);
  await page.goto('/work');
  await expect(page.locator('.work-calendar')).toBeVisible();
  const addBox = await page.locator('.work-create-action').getByRole('button', { name: 'Giao việc', exact: true }).boundingBox();
  const navBox = await page.locator('.mobile-bottom-nav').boundingBox();
  expect(addBox.y + addBox.height).toBeLessThan(navBox.y);
  await page.screenshot({ path: test.info().outputPath('calendar-mobile-compact-dark.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Ngày sau', exact: true }).click();
  const next = new Date(Date.parse(`${todayVN()}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  await expect.poll(() => lastRead(state, '/api/work-schedule')?.from).toBe(`${next}T00:00:00+07:00`);
  await expect(page.locator('.work-calendar-table')).toHaveCount(0);
  await page.locator('.work-calendar-free-toggle').click();
  await page.getByRole('button', { name: `Giao việc cho E2E Thành viên ngày ${next}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Giao việc', exact: true });
  await expect(dialog.getByLabel('Ngày làm việc', { exact: true })).toHaveValue(showDay(next));
  await expect(dialog).toContainText('E2E Thành viên');
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('calendar-mobile-dark.png'), animations: 'disabled' });
});

for (const theme of ['light', 'dark']) test(`ô lịch giữ màu nền và chữ khi hover ở giao diện ${theme}`, async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await page.addInitScript(mode => localStorage.setItem('themeMode', mode), theme);
  const state = await mock(page);
  const date = todayVN();
  Object.assign(state.item, { startsAt: `${date}T01:00:00Z`, endsAt: `${date}T04:30:00Z` });
  await page.goto('/work');
  await expandPeriod(page.locator('.work-calendar').getByRole('region', { name: /^Sáng của/ }).filter({ has: page.getByRole('button', { name: /Sáng · 1 việc/ }) }).first(), 1);
  const task = page.locator('.work-calendar-task').first();
  await expect(task).toBeVisible();
  const cell = page.locator('td.work-calendar-today').first();
  const readColors = element => ({ background: getComputedStyle(element).backgroundColor, color: getComputedStyle(element).color });
  await expect(page.locator('th.work-calendar-today')).not.toHaveCSS('box-shadow', 'none');
  const beforeCell = await cell.evaluate(readColors);
  const beforeTask = await task.evaluate(readColors);
  await task.hover();
  expect(await task.evaluate(readColors)).toEqual(beforeTask);
  expect(await cell.evaluate(readColors)).toEqual(beforeCell);
  expect(beforeTask.background).not.toBe(beforeTask.color);
  expect(await task.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(13);
  await page.screenshot({ path: testInfo.outputPath(`calendar-hover-${theme}.png`), animations: 'disabled' });
});

for (const width of [390, 768, 1024, 1440]) test(`lịch mở Sáng Chiều tại chỗ và xem đủ nhiều việc ở ${width}px`, async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await page.setViewportSize({ width, height: 900 });
  const state = await mock(page);
  const date = todayVN();
  state.scheduleItems = ['Sáng', 'Chiều'].flatMap((period, index) => Array.from({ length: 5 }, (_, i) => ({ ...state.item, id: `${index}-${i}`, content: `E2E ${period} việc ${i + 1}`, startsAt: `${date}T${index ? '13' : '08'}:00:00+07:00`, endsAt: `${date}T${index ? '17' : '11'}:30:00+07:00` })));
  await page.goto('/work');
  const morning = page.getByRole('region', { name: `Sáng của E2E Thành viên ngày ${date}`, exact: true });
  const afternoon = page.getByRole('region', { name: `Chiều của E2E Thành viên ngày ${date}`, exact: true });
  await expect(morning.getByRole('button', { name: /Sáng · 5 việc/ })).toHaveAttribute('aria-expanded', width < 768 ? 'true' : 'false');
  await expandPeriod(morning, 5);
  await expect(morning.locator('.work-calendar-task')).toHaveCount(5);
  await expandPeriod(afternoon, 5);
  await expect(afternoon.locator('.work-calendar-task')).toHaveCount(5);
  if (width >= 768) {
    await expect(afternoon.locator('.work-calendar-period-list')).toHaveCSS('overflow-y', 'auto');
    expect((await afternoon.locator('.work-calendar-period-list').boundingBox()).height).toBeLessThanOrEqual(341);
  }
  if (width >= 768) await expect(morning.getByRole('button', { name: /Sáng · 5 việc/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.work-calendar-popover, .work-calendar-drawer')).toHaveCount(0);
  const last = afternoon.getByRole('button', { name: 'Chi tiết: E2E Chiều việc 5', exact: true });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath(`calendar-expand-${width}.png`), animations: 'disabled' });
  await last.click();
  await expect(page.getByRole('dialog', { name: 'Chi tiết công việc', exact: true })).toBeVisible();
});

test('chuyên viên hoàn thành việc của mình trong buổi mở trên lịch đơn vị', async ({ page }, testInfo) => {
  const state = await mock(page, ['work.self_create', 'work.schedule_view']);
  const date = todayVN();
  Object.assign(state.item, { content: 'E2E Công việc của tôi', startsAt: `${date}T01:00:00Z`, endsAt: `${date}T04:00:00Z`, assigneeId: me, giverId: memberId });
  state.schedulePeople = [
    { id: me, name: 'E2E Chuyên viên', assignments: [state.item], canAssign: false },
    { id: memberId, name: 'E2E Đồng nghiệp', assignments: [{ ...state.item, id: 'E2E_other', assigneeId: memberId, content: 'E2E Việc người khác' }], canAssign: false },
  ];
  await page.goto('/work?view=situation');
  const own = page.getByRole('region', { name: `Sáng của E2E Chuyên viên ngày ${date}`, exact: true });
  await expandPeriod(own, 1);
  await expect(page.getByRole('button', { name: 'Hoàn thành: E2E Việc người khác', exact: true })).toHaveCount(0);
  await own.getByRole('button', { name: 'Hoàn thành: E2E Công việc của tôi', exact: true }).click();
  await page.getByRole('dialog', { name: 'Hoàn thành việc' }).getByRole('button', { name: 'Xác nhận hoàn thành' }).click();
  await expect(page.getByRole('dialog', { name: 'Hoàn thành việc' })).toHaveCount(0);
  expect(state.writes.at(-1).path).toBe(`/api/work-parts/${partId}/complete`);
  await expandPeriod(own, 1);
  await expect(own.getByRole('button', { name: /^Hoàn thành:/ })).toHaveCount(0);
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('calendar-expanded-completed.png'), animations: 'disabled' });
});

for (const width of [390, 768, 1440]) test(`chọn người thực hiện lọc lịch đơn vị và khôi phục URL ở ${width}px`, async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await page.setViewportSize({ width, height: 900 });
  const state = await mock(page, ['work.self_create', 'work.schedule_view']);
  await page.goto('/work?view=situation');
  const select = page.getByRole('combobox', { name: 'Người thực hiện', exact: true });
  await expect(select).toBeVisible();
  await expect.poll(() => lastRead(state, '/api/work-schedule')?.from).toBeTruthy();
  // Person options load only once the select is opened or searched, and never carry the viewed date.
  expect(state.reads.some(row => row.peopleOnly === '1')).toBeFalsy();
  await select.fill('Thành viên');
  await expect.poll(() => state.reads.filter(row => row.peopleOnly === '1').at(-1)?.q).toBe('Thành viên');
  await page.getByRole('option', { name: 'E2E Thành viên', exact: true }).click();
  await expect.poll(() => lastRead(state, '/api/work-schedule')?.assigneeId).toBe(memberId);
  expect(new URL(page.url()).searchParams.get('assigneeId')).toBe(memberId);
  expect(state.reads.filter(row => row.peopleOnly === '1').every(row => !row.at && !row.from && !row.to)).toBeTruthy();
  await page.reload();
  await expect(page.locator('.work-filter-field').filter({ has: select })).toContainText('E2E Thành viên');
  await select.click();
  await page.getByRole('option', { name: 'Tất cả người thực hiện', exact: true }).click();
  await expect.poll(() => lastRead(state, '/api/work-schedule')?.assigneeId).toBeUndefined();
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath(`person-select-${width}.png`), animations: 'disabled' });
});

test('giao việc: chọn nhanh ngày, gợi ý bận trong danh sách người và bỏ người trùng lịch', async ({ page }) => {
  const state = await mock(page);
  const tomorrow = tomorrowVN();
  state.busy = [{ id: 'busy-afternoon', assigneeId: memberId, assigneeName: 'E2E Thành viên', startsAt: `${tomorrow}T13:30:00+07:00`, endsAt: `${tomorrow}T17:00:00+07:00`, canViewDetails: true, title: 'E2E Họp chiều', place: 'Phòng họp' }];
  await page.goto('/work?view=given'); await page.getByRole('button', { name: 'Giao việc', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radiogroup', { name: 'Chọn nhanh ngày' }).getByText('Ngày mai', { exact: true }).click();
  await expect(dialog.getByLabel('Ngày làm việc', { exact: true })).toHaveValue(showDay(tomorrow));
  await expect(dialog.getByRole('radio', { name: 'Ngày mai', exact: true })).toBeChecked();
  await dialog.getByLabel('Người thực hiện', { exact: true }).click();
  await expect(page.locator('.ant-select-dropdown:visible').getByText('· bận 13:30–17:00')).toBeVisible();
  await page.getByText('E2E Thành viên · E2E Phòng kỹ thuật', { exact: true }).click();
  await dialog.locator('.ant-modal-title').click();
  // Busy only in the afternoon: the default morning stays.
  await expect(dialog.getByRole('radio', { name: 'Buổi sáng' })).toBeChecked();
  await expect(dialog.getByText('Không trùng lịch')).toBeVisible();
  await dialog.getByText('Buổi chiều', { exact: true }).click();
  await expect(dialog.getByText('E2E Họp chiều · Phòng họp', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Bỏ E2E Thành viên khỏi danh sách', exact: true }).click();
  await expect(dialog.getByText('E2E Họp chiều · Phòng họp', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText('Chọn người thực hiện', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Giao việc', exact: true })).toBeDisabled();
});

test('giao việc: mọi người được chọn đều bận buổi sáng thì mặc định chọn buổi còn trống', async ({ page }) => {
  const state = await mock(page);
  const day = todayVN();
  state.busy = [{ id: 'busy-morning', assigneeId: memberId, assigneeName: 'E2E Thành viên', startsAt: `${day}T08:00:00+07:00`, endsAt: `${day}T11:30:00+07:00`, canViewDetails: true, title: 'E2E Họp sáng', place: 'Phòng họp' }];
  await page.goto('/work?view=given'); await page.getByRole('button', { name: 'Giao việc', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await pickRecipient(page, dialog);
  await expect(dialog.getByRole('radio', { name: 'Buổi chiều' })).toBeChecked();
  await expect(dialog.getByText('Không trùng lịch')).toBeVisible();
  // Once the user picks a time, it is kept even when busy.
  await dialog.getByText('Buổi sáng', { exact: true }).click();
  await expect(dialog.getByText('E2E Họp sáng · Phòng họp', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Buổi sáng' })).toBeChecked();
});

test('lịch đơn vị không có ai: một thông báo rỗng nằm dưới thanh chọn ngày', async ({ page }) => {
  const state = await mock(page); state.empty = true;
  await page.goto('/work?view=situation');
  const calendar = page.locator('.work-calendar');
  await expect(calendar).toBeVisible();
  const empty = page.getByText('Không tìm thấy người trong phạm vi hoặc bộ lọc đang chọn.', { exact: true });
  await expect(empty).toHaveCount(1);
  await expect(calendar.locator('.ant-empty')).toHaveCount(1);
  const [toolbar, message] = await Promise.all([page.locator('.work-calendar-toolbar').boundingBox(), empty.boundingBox()]);
  expect(message.y).toBeGreaterThan(toolbar.y + toolbar.height - 1);
});

for (const source of ['giao việc', 'tự tạo']) test(`14h tạo việc bắt đầu 8h cần xác nhận, quay lại vẫn giữ dữ liệu: ${source}`, async ({ page }, testInfo) => {
  if (testInfo.project.name === 'desktop' && source === 'giao việc') await page.setViewportSize({ width: 768, height: 900 });
  const state = await mock(page, source === 'giao việc' ? ALL : ['work.self_create'], { now: new Date('2026-10-28T14:00:00+07:00') });
  await page.goto('/work?view=mine&from=2026-10-28&to=2026-10-28');
  await page.getByRole('button', { name: source === 'giao việc' ? 'Giao việc' : 'Tạo việc', exact: true }).first().click();
  const editor = page.getByRole('dialog', { name: source === 'giao việc' ? 'Giao việc' : 'Tạo việc', exact: true });
  await editor.getByLabel('Tên công việc', { exact: true }).fill('E2E Việc buổi sáng đã qua');
  await editor.getByLabel('Địa điểm', { exact: true }).fill('Khu A');
  if (source === 'giao việc') await pickRecipient(page, editor);
  const save = editor.getByRole('button', { name: source === 'giao việc' ? 'Giao việc' : 'Tạo việc', exact: true });
  await expect(save).toBeEnabled();
  await save.click();
  const confirm = page.getByRole('dialog', { name: 'Xác nhận tạo việc trong quá khứ', exact: true });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('08:00');
  await expect(confirm).toContainText('28/10/2026');
  await page.screenshot({ path: test.info().outputPath('past-start-confirm.png'), animations: 'disabled' });
  expect(state.writes).toHaveLength(0);
  await confirm.getByRole('button', { name: 'Quay lại sửa', exact: true }).click();
  await expect(editor.getByLabel('Tên công việc', { exact: true })).toHaveValue('E2E Việc buổi sáng đã qua');
  expect(state.writes).toHaveLength(0);
  await save.click();
  await confirm.getByRole('button', { name: 'Xác nhận tạo việc', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].body.confirmPastStart).toBe(true);
  expect(state.writes[0].body.segments[0].startsAt).toBe('2026-10-28T08:00:00+07:00');
  await noOverflow(page);
});

test('thời gian tương lai không hỏi thêm, server yêu cầu xác nhận thì hiện đúng luồng', async ({ page }) => {
  const state = await mock(page, ALL, { now: new Date('2026-10-28T14:00:00+07:00') });
  await page.goto('/work?view=given&from=2026-10-29&to=2026-10-29');
  await page.getByRole('button', { name: 'Giao việc', exact: true }).first().click();
  const editor = page.getByRole('dialog', { name: 'Giao việc', exact: true });
  await editor.getByLabel('Tên công việc', { exact: true }).fill('E2E Việc ngày mai');
  await editor.getByLabel('Địa điểm', { exact: true }).fill('Khu B');
  await pickRecipient(page, editor);
  state.forcePastConfirmation = true;
  await expect(editor.getByRole('button', { name: 'Giao việc', exact: true })).toBeEnabled();
  await editor.getByRole('button', { name: 'Giao việc', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Xác nhận tạo việc trong quá khứ', exact: true });
  await expect(confirm).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].body.confirmPastStart).toBeUndefined();
  await confirm.getByRole('button', { name: 'Xác nhận tạo việc', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(state.writes).toHaveLength(2);
  expect(state.writes[1].body.confirmPastStart).toBe(true);
});

for (const width of [390, 768, 1440]) test(`lịch đơn vị bỏ Bây giờ và đường dẫn cũ vẫn mở lịch ở ${width}px`, async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await page.setViewportSize({ width, height: 900 });
  const state = await mock(page);
  await page.goto('/work?view=situation&layout=list&at=2026-10-24T09:00');
  await expect(page.locator('.work-calendar')).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Kiểu hiển thị lịch' })).toHaveCount(0);
  await expect(page.getByText('Bây giờ', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Giờ xem', { exact: true })).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).searchParams.get('layout')).toBeNull();
  await expect.poll(() => lastRead(state, '/api/work-schedule')?.from).toBeTruthy();
  expect(lastRead(state, '/api/work-schedule').at).toBeUndefined();
  expect((Date.parse(lastRead(state, '/api/work-schedule').to) - Date.parse(lastRead(state, '/api/work-schedule').from)) / 86400000).toBe(width < 768 ? 1 : 7);
  await noOverflow(page);
});

test('mobile buổi hiện tại tự mở, buổi trống khóa và nhiều việc cuộn cùng trang', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'mobile') await page.addInitScript(() => localStorage.setItem('themeMode', 'dark'));
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await mock(page, ALL, { now: new Date(`${todayVN()}T14:00:00+07:00`) });
  const date = todayVN();
  state.scheduleItems = Array.from({ length: 20 }, (_, i) => ({ ...state.item, id: `E2E_many_${i}`, content: `E2E Việc ${i}`, startsAt: `${date}T13:00:00+07:00`, endsAt: `${date}T17:00:00+07:00` }));
  await page.goto('/work?view=situation');
  const morning = page.getByRole('region', { name: `Sáng của E2E Thành viên ngày ${date}`, exact: true });
  const afternoon = page.getByRole('region', { name: `Chiều của E2E Thành viên ngày ${date}`, exact: true });
  await expect(morning.getByRole('button', { name: /Sáng · Trống/ })).toHaveAttribute('aria-disabled', 'true');
  await expect(afternoon.getByRole('button', { name: /Chiều · 20 việc/ })).toHaveAttribute('aria-expanded', 'true');
  const list = afternoon.locator('.work-calendar-period-list');
  await expect(list).toHaveCSS('overflow-y', 'visible');
  await expect(list).toHaveCSS('max-height', 'none');
  expect(await list.evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBeTruthy();
  const last = afternoon.getByRole('button', { name: 'Chi tiết: E2E Việc 19', exact: true });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  expect(await page.getByRole('main').evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await page.getByRole('main').evaluate(node => { node.scrollTop = node.scrollHeight; });
  const lastEntry = await list.locator('.work-calendar-entry').last().boundingBox();
  const create = await page.locator('.work-create-action').boundingBox();
  expect(lastEntry.y + lastEntry.height).toBeLessThanOrEqual(create.y);
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('calendar-expanded-mobile-dark.png'), animations: 'disabled' });
});

for (const width of [390, 768, 1440]) test(`phạm vi một phòng ẩn bộ lọc đơn vị, nhiều phòng vẫn chọn được ở ${width}px`, async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await page.setViewportSize({ width, height: 900 });
  const state = await mock(page, ['work.self_create', 'work.schedule_view']);
  const dept = '00000000-0000-4000-8000-000000000020';
  state.departments = [{ id: dept, name: 'E2E Phòng kỹ thuật' }];
  await page.goto(`/work?view=situation&departmentId=${dept}`);
  await expect(page.locator('.work-calendar')).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('departmentId')).toBeNull();
  await openMoreFilters(page);
  await expect(page.getByRole('combobox', { name: 'Đơn vị', exact: true })).toHaveCount(0);
  await closeMoreFilters(page);
  await noOverflow(page);
  state.departments = [{ id: dept, name: 'E2E Phòng kỹ thuật' }, { id: '00000000-0000-4000-8000-000000000021', name: 'E2E Phòng khác' }];
  await page.reload();
  await openMoreFilters(page);
  const select = page.getByRole('combobox', { name: 'Đơn vị', exact: true });
  await expect(select).toBeVisible();
  await select.click();
  await page.getByRole('option', { name: 'E2E Phòng khác', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('departmentId')).toBe('00000000-0000-4000-8000-000000000021');
  await noOverflow(page);
});

test('tự tạo việc mặc định hôm nay dù đang lọc ngày khác, vẫn chọn ngày khác được', async ({ page }) => {
  await mock(page, ['work.self_create'], { now: new Date('2026-10-28T14:00:00+07:00') });
  for (const day of ['2026-01-05', '2027-11-15']) {
    await page.goto(`/work?view=mine&from=${day}&to=${day}`);
    await page.getByRole('button', { name: 'Tạo việc', exact: true }).first().click();
    const editor = page.getByRole('dialog', { name: 'Tạo việc', exact: true });
    await expect(editor.getByLabel('Ngày làm việc', { exact: true })).toHaveValue('28/10/2026');
    await expect(editor.getByRole('radio', { name: 'Hôm nay', exact: true })).toBeChecked();
    await editor.getByRole('radiogroup', { name: 'Chọn nhanh ngày' }).getByText('Ngày mai', { exact: true }).click();
    await expect(editor.getByLabel('Ngày làm việc', { exact: true })).toHaveValue('29/10/2026');
    await editor.getByRole('button', { name: 'Đóng', exact: true }).click();
    await page.getByRole('dialog', { name: 'Bỏ nội dung đang nhập?', exact: true }).getByRole('button', { name: 'Bỏ thay đổi', exact: true }).click();
  }
});

for (const width of [390, 768, 1440]) test(`việc đã giao nhóm theo người và xem đủ công việc từng người ở ${width}px`, async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await page.setViewportSize({ width, height: 960 });
  const state = await mock(page);
  state.groupPaging = true;
  state.items = Array.from({ length: 7 }, (_, i) => ({ ...state.item, id: `E2E_member_${i}`, assigneeId: memberId, assigneeName: 'E2E An', content: `E2E Việc An ${i + 1}`, status: i === 0 ? 'completed' : 'assigned' }));
  state.items.push({ ...state.item, id: 'E2E_other', assigneeId: '00000000-0000-4000-8000-000000000099', assigneeName: 'E2E Bình', content: 'E2E Việc Bình' });
  await page.goto('/work?view=given');
  await expect(page.locator('.work-given-groups')).toBeVisible();
  await expect(page.locator('.work-given-groups .ant-collapse-header')).toHaveCount(2);
  const an = page.locator('.ant-collapse-header').filter({ hasText: 'E2E An' });
  await expect(an).not.toContainText('7 việc');
  await expect(an).toContainText('Chưa xong: 6');
  await expect(an).toContainText('Đã xong: 1');
  await expect(page.getByRole('button', { name: 'Chi tiết: E2E Việc An 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chi tiết: E2E Việc Bình', exact: true })).toHaveCount(0);
  // AntD Pagination renders a list with the supplied accessible label.
  const pagination = page.locator('.ant-pagination[aria-label="Trang công việc của E2E An"]');
  await pagination.getByTitle('2', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Chi tiết: E2E Việc An 7', exact: true })).toBeVisible();
  await page.locator('.ant-collapse-header').filter({ hasText: 'E2E Bình' }).click();
  await expect(page.getByRole('button', { name: 'Chi tiết: E2E Việc Bình', exact: true })).toBeVisible();
  expect(state.reads.filter(read => read.groupBy === 'assignee').length).toBeGreaterThan(0);
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath(`given-groups-${width}.png`), animations: 'disabled' });
});

 test('lịch gọn năm ngày, mở cuối tuần và cố định tiêu đề khi cuộn', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await mock(page);
  Object.assign(state.item, { startsAt: '2026-10-28T01:00:00Z', endsAt: '2026-10-28T04:00:00Z' });
  await page.goto('/work?view=situation&at=2026-10-28T09:00');
  const table = page.locator('.work-calendar-table');
  await expect(table.locator('thead th')).toHaveCount(6);
  await page.getByRole('checkbox', { name: 'Thứ Bảy, Chủ nhật' }).check();
  await expect(table.locator('thead th')).toHaveCount(8);
  await expect(table.locator('.ant-table-body')).toHaveCSS('overflow-y', 'scroll');
  await noOverflow(page);
});

 test('mobile chữ lịch và bộ lọc gọn, ô nhập không gây zoom', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await mock(page);
  const date = todayVN();
  state.scheduleItems = [8, 13].map((hour, i) => ({ ...state.item, id: `E2E_compact_${i}`, content: `E2E Việc ${i + 1}`, startsAt: `${date}T${String(hour).padStart(2, '0')}:00:00+07:00`, endsAt: `${date}T${String(hour + 1).padStart(2, '0')}:00:00+07:00`, assigneeId: memberId }));
  await page.goto('/work?view=situation');
  const person = page.locator('.work-calendar-person').first();
  await expect(person).toBeVisible();
  await expect(page.locator('.work-view-switch .ant-segmented-item-label').first()).toHaveCSS('font-size', '14px');
  await expect(person.locator('.work-calendar-person-header > strong')).toHaveCSS('font-size', '14px');
  await expect(page.getByText('Tất cả người thực hiện', { exact: true }).first()).toHaveCSS('font-size', '14px');
  await expect(page.getByLabel('Ngày xem lịch', { exact: true })).toHaveCSS('font-size', '16px');
  expect((await page.getByRole('button', { name: 'Ngày trước', exact: true }).boundingBox()).height).toBe(32);
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('calendar-mobile-density.png'), animations: 'disabled' });
});

 test('desktop lịch có thứ ngày cùng hàng, chữ dễ đọc và nút hoàn thành gọn', async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await mock(page);
  const date = todayVN();
  Object.assign(state.item, { startsAt: `${date}T01:00:00Z`, endsAt: `${date}T04:00:00Z` });
  await page.goto('/work?view=situation');
  const table = page.locator('.work-calendar-table');
  const heading = table.locator('.work-calendar-day-heading').first();
  await expect(heading).toHaveCSS('display', 'flex');
  await expect(heading).toHaveCSS('white-space', 'nowrap');
  await expandPeriod(page.locator('.work-calendar').getByRole('region', { name: /^Sáng của/ }).filter({ has: page.getByRole('button', { name: /Sáng · 1 việc/ }) }).first(), 1);
  await expect(table.locator('.work-calendar-title').first()).toHaveCSS('font-size', '14px');
  await expect(table.locator('.work-calendar-meta').first()).toHaveCSS('font-size', '13px');
  const complete = table.getByRole('button', { name: /^Hoàn thành:/ }).first();
  expect((await complete.boundingBox()).height).toBe(24);
  await complete.click();
  await expect(page.getByRole('dialog', { name: 'Hoàn thành việc', exact: true })).toBeVisible();
});

 test('mobile nút công việc dùng size middle kể cả bộ lọc mở rộng', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await mock(page);
  Object.assign(state.item, { startsAt: `${todayVN()}T01:00:00Z`, endsAt: `${todayVN()}T04:00:00Z` });
  await page.goto('/work?view=situation');
  await expandPeriod(page.locator('.work-calendar').getByRole('region', { name: /^Sáng của/ }).filter({ has: page.getByRole('button', { name: /Sáng · 1 việc/ }) }).first(), 1);
  for (const button of [page.locator('.work-create-action').getByRole('button', { name: 'Giao việc', exact: true }), page.getByRole('button', { name: /^Lọc( thêm)?$/, exact: true }), page.locator('.work-calendar-complete').first()]) {
    await expect(button).toHaveCSS('height', '32px');
    await expect(button).toHaveCSS('font-size', '14px');
  }
  await page.getByRole('button', { name: /^Lọc( thêm)?$/, exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Xong', exact: true })).toHaveCSS('height', '32px');
  await noOverflow(page);
});

for (const width of [768, 1024, 1440]) test(`A1-A3 lịch tự cuộn đúng ngày và ngày ở chung card lọc tại ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const state = await mock(page);
  Object.assign(state.item, { startsAt: '2026-10-24T01:00:00Z', endsAt: '2026-10-24T04:00:00Z' });
  await page.goto('/work?view=situation&at=2026-10-24T08:00');
  await expect(page.locator('[data-calendar-day="2026-10-24"]')).toBeInViewport({ ratio: 0.95 });
  await expandPeriod(page.locator('.work-calendar').getByRole('region', { name: /^Sáng của/ }).filter({ has: page.getByRole('button', { name: /Sáng · 1 việc/ }) }).first(), 1);
  await expect(page.locator('.work-calendar-table').getByRole('button', { name: `Chi tiết: ${part}`, exact: true })).toBeInViewport();
  await expect(page.locator('.work-filters').getByLabel('Ngày xem lịch', { exact: true })).toBeVisible();
  await chooseView(page, 'Việc của tôi');
  await expect(page.locator('.work-filters').getByLabel('Ngày làm việc', { exact: true })).toBeVisible();
  await chooseView(page, 'Việc tôi đã giao');
  await expect(page.locator('.work-filters').getByLabel('Ngày làm việc', { exact: true })).toBeVisible();
  await chooseView(page, 'Lịch đơn vị');
  await expect(page.locator('.work-filters').getByLabel('Ngày xem lịch', { exact: true })).toBeVisible();
  if (width === 1024) {
    Object.assign(state.item, { startsAt: '2026-10-25T01:00:00Z', endsAt: '2026-10-25T04:00:00Z' });
    const picker = page.getByLabel('Ngày xem lịch', { exact: true });
    await picker.fill('25/10/2026');
    await picker.press('Enter');
    await expect(page.locator('[data-calendar-day="2026-10-25"]')).toBeInViewport({ ratio: 0.95 });
    await expandPeriod(page.locator('.work-calendar').getByRole('region', { name: /^Sáng của/ }).filter({ has: page.getByRole('button', { name: /Sáng · 1 việc/ }) }).first(), 1);
  await expect(page.locator('.work-calendar-table').getByRole('button', { name: `Chi tiết: ${part}`, exact: true })).toBeInViewport();
  }
  await noOverflow(page);
});

for (const width of [390, 768, 1024, 1440]) test(`B4 form giao việc chọn người sau tên và chặn lưu thiếu người tại ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 844 });
  await mock(page);
  await page.goto('/work?view=mine');
  await page.locator('.work-create-action').getByRole('button', { name: 'Giao việc', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Giao việc', exact: true });
  const submit = dialog.getByRole('button', { name: 'Giao việc', exact: true });
  await expect(submit).toBeDisabled();
  await expect(dialog.locator('.ant-alert-warning')).toHaveCount(0);
  await expect(dialog.locator('#work-submit-hint')).toHaveText('Chọn người thực hiện');
  await expect(submit).toHaveAttribute('aria-describedby', 'work-submit-hint');
  await expect(dialog.locator('#work-submit-hint')).toHaveAttribute('role', 'status');
  const name = dialog.getByLabel('Tên công việc', { exact: true });
  const person = dialog.getByLabel('Người thực hiện', { exact: true });
  const date = dialog.getByLabel('Ngày làm việc', { exact: true });
  expect(await name.evaluate((node) => Boolean(node.compareDocumentPosition(document.getElementById('assigneeIds')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBeTruthy();
  const personBox = await person.boundingBox(), dateBox = await date.boundingBox();
  expect(personBox.y).toBeLessThan(dateBox.y);
  await pickRecipient(page, dialog);
  await expect(submit).toBeEnabled();
  const period = dialog.locator('.work-period-options');
  await period.scrollIntoViewIfNeeded();
  const bounds = await period.boundingBox();
  const last = await period.locator('.ant-radio-button-wrapper').last().boundingBox();
  expect(last.x + last.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath(`work-form-${width}.png`), animations: 'disabled' });
});

test('B5 chi tiết không lặp tên phần việc và ẩn dòng rỗng với dữ liệu đủ người giao', async ({ page }) => {
  const state = await mock(page);
  Object.assign(state.item, { title: 'E2E Một tên duy nhất', content: 'E2E Một tên duy nhất', giverName: 'E2E Trưởng phòng', giverId: memberId, assigneeName: 'E2E Chuyên viên', assigneeId: me, description: '' });
  await page.goto(`/work?view=mine&workId=${workId}`);
  const drawer = page.getByRole('dialog', { name: 'Chi tiết công việc' });
  await expect(drawer.getByText('E2E Một tên duy nhất', { exact: true })).toHaveCount(1);
  await expect(drawer.getByText('Người giao: E2E Trưởng phòng', { exact: true })).toBeVisible();
  await expect(drawer.getByText(/^Mô tả:/)).toHaveCount(0);
  await expect(drawer.getByText('Địa điểm: Khu A', { exact: true })).toBeVisible();
});

 test('refetch sau hoàn thành giữ cuộn ngang người dùng và bảng mới xuất hiện cuộn đúng ngày', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  const state = await mock(page);
  Object.assign(state.item, { content: 'E2E Việc thứ Hai', startsAt: '2026-10-19T01:00:00Z', endsAt: '2026-10-19T02:00:00Z' });
  state.scheduleItems = [state.item, { ...state.item, id: 'E2E_saturday', content: 'E2E Việc thứ Bảy', startsAt: '2026-10-24T01:00:00Z', endsAt: '2026-10-24T02:00:00Z' }];
  await page.goto('/work?view=situation&at=2026-10-24T08:00');
  const body = page.locator('.work-calendar-table .ant-table-body');
  await expect.poll(() => body.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  await body.evaluate(node => { node.scrollLeft = 0; });
  const reads = state.reads.filter(row => row.path === '/api/work-schedule').length;
  await expandPeriod(page.getByRole('region', { name: 'Sáng của E2E Thành viên ngày 2026-10-19', exact: true }), 1);
  await page.getByRole('button', { name: 'Hoàn thành: E2E Việc thứ Hai', exact: true }).click();
  await page.getByRole('dialog', { name: 'Hoàn thành việc', exact: true }).getByRole('button', { name: 'Xác nhận hoàn thành' }).click();
  await expect.poll(() => state.reads.filter(row => row.path === '/api/work-schedule').length).toBeGreaterThan(reads);
  await expect(page.getByRole('button', { name: 'Hoàn thành: E2E Việc thứ Hai', exact: true })).toHaveCount(0);
  await expect.poll(() => body.evaluate(node => node.scrollLeft)).toBe(0);
  state.scheduleItems = [];
  await page.goto('/work?view=situation&at=2026-10-24T08:00');
  await expect(body).toHaveCount(0);
  await page.locator('.work-calendar-free-toggle').click();
  await expect.poll(() => body.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  await expect(page.locator('[data-calendar-day="2026-10-24"]')).toBeInViewport({ ratio: 0.95 });
});

 test('footer chọn người đọc được và Enter báo lỗi tại trường cho giao và chuyển việc', async ({ page }) => {
  await mock(page);
  await page.goto('/work?view=mine');
  await page.locator('.work-create-action').getByRole('button', { name: 'Giao việc', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Giao việc', exact: true });
  await expect(dialog.locator('.ant-alert-warning')).toHaveCount(0);
  await expect(dialog.locator('#work-submit-hint')).toHaveText('Chọn người thực hiện');
  await dialog.getByLabel('Tên công việc', { exact: true }).fill('E2E Thiếu người');
  await dialog.getByLabel('Tên công việc', { exact: true }).press('Enter');
  await expect(dialog.getByText('Vui lòng chọn người thực hiện', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Giao việc', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.getByRole('dialog', { name: 'Bỏ nội dung đang nhập?', exact: true }).getByRole('button', { name: 'Bỏ thay đổi', exact: true }).click();
  await runMenu(page, 'Chuyển việc');
  dialog = page.getByRole('dialog', { name: 'Chuyển việc', exact: true });
  await expect(dialog.locator('.ant-alert-warning')).toHaveCount(0);
  await expect(dialog.locator('#work-submit-hint')).toHaveText('Chọn người nhận');
  await expect(dialog.getByRole('button', { name: 'Chuyển việc', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Đổi thời gian/địa điểm', exact: true }).click();
  await dialog.getByLabel('Tên công việc', { exact: true }).press('Enter');
  await expect(dialog.getByText('Vui lòng chọn người nhận chuyển việc', { exact: true })).toBeVisible();
});

test('địa điểm trống không có dòng thừa và bảng chỉ hiện giá trị địa điểm', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await mock(page);
  Object.assign(state.item, { place: '', startsAt: `${todayVN()}T01:00:00Z`, endsAt: `${todayVN()}T04:00:00Z` });
  await page.goto('/work?view=situation');
  await expandPeriod(page.locator('.work-calendar').getByRole('region', { name: /^Sáng của/ }).filter({ has: page.getByRole('button', { name: /Sáng · 1 việc/ }) }).first(), 1);
  await expect(page.locator('.work-calendar-task').first()).toBeVisible();
  await expect(page.locator('.work-calendar-place')).toHaveCount(0);
  state.item.place = 'Khu A';
  await chooseView(page, 'Việc của tôi');
  await expect(page.getByRole('columnheader', { name: 'Địa điểm', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Khu A', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Địa điểm: Khu A', exact: true })).toHaveCount(0);
});

test('mobile bộ lọc giữ bố cục ngày tuần khoảng ngày và đúng quyền', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, ['work.self_create', 'work.schedule_view']);
  await page.goto('/work?view=mine');
  const filters = page.locator('.work-filters');
  const initial = await filters.boundingBox();
  await expect(filters.getByText('Đã giao', { exact: true })).toHaveCount(0);
  const date = filters.getByRole('button', { name: /^Chọn thời gian:/ });
  await date.click();
  const sheet = page.getByRole('dialog', { name: 'Thời gian', exact: true });
  await sheet.getByText('Tuần', { exact: true }).click();
  await sheet.getByRole('button', { name: 'Xong', exact: true }).click();
  await expect(date).toContainText(' – ');
  expect((await filters.boundingBox()).height).toBe(initial.height);
  const before = await date.innerText();
  await filters.getByRole('button', { name: 'Tuần sau', exact: true }).click();
  await expect(date).not.toHaveText(before);
  await date.click();
  await sheet.getByText('Khoảng ngày', { exact: true }).click();
  await expect(sheet.getByLabel('Từ ngày', { exact: true })).toBeVisible();
  await expect(sheet.getByLabel('Đến ngày', { exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Xong', exact: true }).click();
  expect((await filters.boundingBox()).height).toBe(initial.height);
  await filters.getByRole('button', { name: 'Hôm nay', exact: true }).click();
  await expect(date).toContainText(showDay(todayVN()));
  await chooseView(page, 'Lịch đơn vị');
  await date.click();
  await expect(sheet.getByRole('radiogroup', { name: 'Xem theo' })).toHaveCount(0);
  await expect(sheet.getByLabel('Ngày xem lịch', { exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Xong', exact: true }).click();
  const buttons = await filters.locator('.work-date-strip button').all();
  const boxes = await Promise.all(buttons.map(button => button.boundingBox()));
  expect(Math.max(...boxes.map(box => box.y)) - Math.min(...boxes.map(box => box.y))).toBeLessThan(2);
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('mobile-stable-filter.png'), animations: 'disabled' });
});

test('mobile quản lý lọc việc đã giao trong sheet ở màn hẹp tối', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addInitScript(() => localStorage.setItem('themeMode', 'dark'));
  const state = await mock(page);
  await page.goto('/work?view=given&from=2026-11-01&to=2026-11-15');
  const filters = page.locator('.work-filters');
  await expect(filters.getByText('Đã giao', { exact: true })).toBeVisible();
  await filters.getByRole('button', { name: /^Chọn thời gian:/ }).click();
  const time = page.getByRole('dialog', { name: 'Thời gian', exact: true });
  await expect(time.getByLabel('Từ ngày', { exact: true })).toBeVisible();
  await expect(time.getByLabel('Đến ngày', { exact: true })).toBeVisible();
  await expect(time.getByRole('button', { name: 'Xong', exact: true })).toBeInViewport();
  await time.getByRole('button', { name: 'Xong', exact: true }).click();
  await openMoreFilters(page);
  const sheet = page.getByRole('dialog', { name: 'Bộ lọc công việc', exact: true });
  await sheet.getByRole('combobox', { name: 'Người thực hiện', exact: true }).click();
  await page.getByRole('option', { name: 'E2E Thành viên', exact: true }).click();
  await expect.poll(() => lastRead(state)?.assigneeId).toBe(memberId);
  await closeMoreFilters(page);
  await expect(filters.locator('.ant-badge-count')).toHaveText('1');
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('mobile-manager-filter-dark.png'), animations: 'disabled' });
});

test('cuối tuần đã chọn có giải thích tại checkbox bị khóa', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await mock(page);
  await page.goto('/work?view=situation&at=2026-10-24T08:00');
  const checkbox = page.getByRole('checkbox', { name: 'Thứ Bảy, Chủ nhật' });
  await expect(checkbox).toBeChecked();
  await expect(checkbox).toBeDisabled();
  await page.getByText('Thứ Bảy, Chủ nhật', { exact: true }).hover();
  await expect(page.getByRole('tooltip')).toHaveText('Ngày đang chọn là cuối tuần nên luôn hiển thị');
});

for (const view of ['mine', 'situation']) test(`mobile bộ lọc middle đồng chiều cao và thẳng hàng ở ${view}`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, ['work.self_create', 'work.schedule_view']);
  await page.goto(`/work?view=${view}`);
  const filters = page.locator('.work-filters');
  const input = view === 'mine' ? filters.locator('.ant-input-affix-wrapper') : filters.locator('.ant-select').first();
  const more = filters.getByRole('button', { name: /^Lọc( thêm)?$/, exact: true });
  await expect(input).toHaveCSS('height', '32px');
  await expect(more).toHaveCSS('height', '32px');
  const a = await input.boundingBox(), b = await more.boundingBox();
  expect(Math.abs(a.y - b.y)).toBeLessThan(1);
  await expect(filters.locator('.work-view-switch')).toHaveCSS('height', '32px');
  await expect(filters.getByRole('button', { name: 'Ngày trước', exact: true })).toHaveCSS('height', '32px');
  await expect(filters.locator('.work-mobile-search label')).toBeHidden();
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath(`mobile-filter-middle-${view}.png`), animations: 'disabled' });
});

for (const width of [390, 768, 1440]) test(`nút tạo việc ở dưới bộ lọc và mobile nổi khi cuộn tại ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 844 });
  const state = await mock(page, ['work.self_create']);
  state.items = Array.from({ length: 20 }, (_, i) => ({ ...state.item, id: `E2E_float_${i}`, content: `E2E Việc số ${i + 1}` }));
  await page.goto('/work?view=mine');
  await expect(page.getByRole('heading', { name: 'Công việc', exact: true })).toHaveCount(0);
  const button = page.locator('.work-create-action').getByRole('button', { name: 'Tạo việc', exact: true });
  await expect(button).toBeVisible();
  await page.locator('.app-shell').evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
  const box = await button.boundingBox();
  if (width < 768) {
    const nav = await page.locator('.mobile-bottom-nav').boundingBox();
    expect(box.y + box.height).toBeLessThan(nav.y);
    const last = page.getByRole('button', { name: 'Chi tiết: E2E Việc số 20', exact: true });
    await last.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport();
    expect(Math.abs((await button.boundingBox()).y - box.y)).toBeLessThan(2);
    await page.getByRole('main').evaluate(node => { node.scrollTop = node.scrollHeight; });
    const lastCard = page.locator('.work-part-card').last();
    const lastBox = await lastCard.boundingBox();
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(box.y);
  } else {
    const filters = await page.locator('.work-filters').boundingBox();
    const list = await page.locator('.work-table, .mobile-card-list').first().boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(filters.y + filters.height);
    expect(box.y + box.height).toBeLessThanOrEqual(list.y);
  }
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath(`create-action-${width}.png`), animations: 'disabled' });
  await button.click();
  await expect(page.getByRole('dialog', { name: 'Tạo việc', exact: true })).toBeVisible();
});

for (const width of [390, 1440]) test(`mở thu gọn tất cả buổi có việc trên lịch ở ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  const state = await mock(page);
  const date = todayVN();
  state.scheduleItems = [8, 13].map((hour, i) => ({ ...state.item, id: `E2E_bulk_${i}`, content: `E2E Buổi ${i}`, startsAt: `${date}T${String(hour).padStart(2, '0')}:00:00+07:00`, endsAt: `${date}T${String(hour + 1).padStart(2, '0')}:00:00+07:00` }));
  await page.goto('/work?view=situation');
  const morning = page.getByRole('region', { name: `Sáng của E2E Thành viên ngày ${date}`, exact: true });
  const afternoon = page.getByRole('region', { name: `Chiều của E2E Thành viên ngày ${date}`, exact: true });
  await page.getByRole('button', { name: 'Mở tất cả', exact: true }).click();
  await expect(morning.getByRole('button', { name: /Sáng · 1 việc/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(afternoon.getByRole('button', { name: /Chiều · 1 việc/ })).toHaveAttribute('aria-expanded', 'true');
  await morning.getByRole('button', { name: /Sáng · 1 việc/ }).click();
  await expect(afternoon.getByRole('button', { name: /Chiều · 1 việc/ })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Mở tất cả', exact: true }).click();
  await page.getByRole('button', { name: 'Thu gọn tất cả', exact: true }).click();
  await expect(morning.getByRole('button', { name: /Sáng · 1 việc/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(afternoon.getByRole('button', { name: /Chiều · 1 việc/ })).toHaveAttribute('aria-expanded', 'false');
  await expandPeriod(morning, 1);
  await expandPeriod(afternoon, 1);
  if (width >= 768) await expect(morning.getByRole('button', { name: /Sáng · 1 việc/ })).toHaveAttribute('aria-expanded', 'false');
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath(`calendar-bulk-${width}.png`), animations: 'disabled' });
});

for (const width of [768, 1440]) test(`nút mở tất cả cùng hàng giao việc ở ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const state = await mock(page);
  const date = todayVN();
  Object.assign(state.item, { startsAt: `${date}T01:00:00Z`, endsAt: `${date}T04:00:00Z` });
  await page.goto('/work?view=situation');
  const bulk = page.getByRole('button', { name: 'Mở tất cả', exact: true });
  const create = page.locator('.work-create-action').getByRole('button', { name: 'Giao việc', exact: true });
  await expect(bulk).toBeVisible();
  const a = await bulk.boundingBox(), b = await create.boundingBox();
  expect(Math.abs(a.y + a.height / 2 - b.y - b.height / 2)).toBeLessThan(2);
  expect(a.x + a.width).toBeLessThanOrEqual(b.x);
  await bulk.click();
  await expect(page.getByRole('button', { name: 'Thu gọn tất cả', exact: true })).toBeVisible();
  await noOverflow(page);
});

for (const kind of ['giao', 'tự tạo', 'sửa', 'chuyển']) test(`đóng form ${kind} chỉ hỏi bỏ thay đổi khi có nội dung đã sửa`, async ({ page }) => {
  await mock(page, kind === 'tự tạo' ? ['work.self_create'] : ALL);
  await page.goto('/work?view=mine');
  const title = kind === 'tự tạo' ? 'Tạo việc' : kind === 'sửa' ? 'Sửa công việc' : kind === 'chuyển' ? 'Chuyển việc' : 'Giao việc';
  const open = async () => {
    if (kind === 'sửa' || kind === 'chuyển') await runMenu(page, kind === 'sửa' ? 'Sửa lịch' : 'Chuyển việc');
    else await page.locator('.work-create-action').getByRole('button', { name: title, exact: true }).click();
  };
  await open();
  let dialog = page.getByRole('dialog', { name: title, exact: true });
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Bỏ nội dung đang nhập?', exact: true })).toHaveCount(0);
  await open();
  dialog = page.getByRole('dialog', { name: title, exact: true });
  const field = dialog.getByLabel(kind === 'chuyển' ? 'Lý do chuyển việc' : 'Tên công việc', { exact: true });
  await field.fill('E2E Bản nháp chưa lưu');
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Bỏ nội dung đang nhập?', exact: true });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Tiếp tục nhập', exact: true }).click();
  await expect(field).toHaveValue('E2E Bản nháp chưa lưu');
  await dialog.locator('.ant-modal-close').click();
  await confirm.getByRole('button', { name: 'Bỏ thay đổi', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('chọn nhanh ngày có xác nhận bỏ thay đổi và đổi lại ngày ban đầu thì không hỏi', async ({ page }) => {
  await mock(page);
  await page.goto('/work?view=mine');
  await page.locator('.work-create-action').getByRole('button', { name: 'Giao việc', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Giao việc', exact: true });
  await dialog.getByRole('radiogroup', { name: 'Chọn nhanh ngày' }).getByText('Ngày mai', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Bỏ nội dung đang nhập?', exact: true });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Tiếp tục nhập', exact: true }).click();
  await dialog.getByRole('radiogroup', { name: 'Chọn nhanh ngày' }).getByText('Hôm nay', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

for (const width of [390, 768, 1440]) test(`lịch có dấu hoàn thành và tên việc tối đa hai dòng ở ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  const state = await mock(page);
  const date = todayVN();
  Object.assign(state.item, { content: 'E2E Tên công việc rất dài cần hiển thị được hai dòng để người xem dễ hiểu công việc đang được thực hiện tại đơn vị', status: 'completed', startsAt: `${date}T01:00:00Z`, endsAt: `${date}T04:00:00Z` });
  await page.goto('/work?view=situation');
  const section = page.getByRole('region', { name: `Sáng của E2E Thành viên ngày ${date}`, exact: true });
  await expandPeriod(section, 1);
  await expect(section.getByRole('img', { name: 'Đã hoàn thành', exact: true })).toBeVisible();
  const name = section.locator('.work-calendar-title');
  await expect(name).toHaveCSS('-webkit-line-clamp', '2');
  await expect(name).toHaveCSS('white-space', 'normal');
  expect(await name.evaluate(node => node.clientHeight <= parseFloat(getComputedStyle(node).lineHeight) * 2 + 1)).toBeTruthy();
  await expect(section.getByRole('button', { name: /^Hoàn thành:/ })).toHaveCount(0);
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath(`calendar-done-two-lines-${width}.png`), animations: 'disabled' });
});

test('nút Xong đóng bộ lọc và giữ lựa chọn đã cập nhật', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await mock(page);
  await page.goto('/work?view=mine');
  await page.getByRole('button', { name: /^Lọc( thêm)?$/, exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Bộ lọc công việc', exact: true });
  await drawer.getByRole('combobox', { name: 'Trạng thái', exact: true }).click();
  await page.locator('.ant-select-dropdown:visible').getByText('Đã hoàn thành', { exact: true }).click();
  await expect.poll(() => lastRead(state)?.status).toBe('completed');
  await drawer.getByRole('button', { name: 'Xong', exact: true }).click();
  await expect(drawer).not.toBeVisible();
  expect(new URL(page.url()).searchParams.get('status')).toBe('completed');
});

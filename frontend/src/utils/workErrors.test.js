import test from 'node:test';
import assert from 'node:assert/strict';
import { isWorkVersionConflict, shouldRefreshAfterWorkError, workErrorMessage } from './workErrors.js';
test('nhận diện xung đột theo mã lỗi, không chỉ theo HTTP status', () => {
  const conflict = { response: { status: 422, data: { code: 'WORK_VERSION_CONFLICT', message: 'Công việc vừa thay đổi' } } };
  assert.equal(isWorkVersionConflict(conflict), true);
  assert.equal(isWorkVersionConflict({ response: { status: 409, data: { code: 'WORK_STATE_CONFLICT', message: 'Phần việc đã hoàn thành' } } }), true);
  assert.equal(isWorkVersionConflict({ response: { status: 409, data: { message: 'Trùng lịch' } } }), false);
  assert.equal(shouldRefreshAfterWorkError(conflict), true);
  assert.equal(shouldRefreshAfterWorkError({ response: { status: 503 } }), false);
  assert.equal(workErrorMessage(conflict), 'Công việc vừa thay đổi');
  assert.equal(workErrorMessage({ response: { data: { message: ' ' } } }), 'Không lưu được, vui lòng thử lại');
  assert.equal(workErrorMessage(null, 'Mặc định'), 'Mặc định');
});

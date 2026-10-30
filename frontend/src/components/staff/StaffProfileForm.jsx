import { Alert, Collapse, Form, Input, Select, Switch } from "antd";
import { PASSWORD_RULES } from "../../constants/password";
import { passwordPolicyRule } from "../../utils/passwordPolicy";

const hasOptionalInfo = (record) => Boolean(record && (record.position || record.email || record.phone));

export const StaffProfileForm = ({
  form,
  handleSaveStaff,
  departmentOptions,
  editing,
  assignInitialRole,
  rolesQuery,
  roleOptionsForAssignments,
  initialRoleScopeType,
  allowedScopes = [],
  initialDepartmentOptions = [],
  optionsQuery,
}) => <Form form={form} layout="vertical" initialValues={{
  isActive: true
}} onFinish={handleSaveStaff}>
                  {/* Mã cán bộ do hệ thống sinh khi tạo; không hiển thị để tránh nhầm với tài khoản đăng nhập. */}
                  <Form.Item name="code" hidden>
                    <Input />
                  </Form.Item>
                  <div className="staff-profile-grid">
                    <Form.Item name="fullName" label="Họ tên" rules={[{
      required: true,
      whitespace: true,
      message: "Vui lòng nhập họ tên"
    }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="username" label="Tài khoản đăng nhập" rules={[{ required: true, whitespace: true, message: "Vui lòng nhập tên đăng nhập" }]}>
                      <Input autoComplete="off" />
                    </Form.Item>

                    <Form.Item name="password" label={editing ? "Mật khẩu mới (để trống nếu không đổi)" : "Mật khẩu"} dependencies={["username"]} rules={[({ getFieldValue }) => passwordPolicyRule(() => getFieldValue("username"))]} extra={PASSWORD_RULES.filter(rule => rule.text).map(rule => rule.text).join(" · ")}>
                      <Input.Password autoComplete="new-password" />
                    </Form.Item>
                    <Form.Item name="departmentId" label="Phòng ban">
                      <Select allowClear showSearch optionFilterProp="label" options={departmentOptions} onChange={value => {
        if (editing || !value) return;
        const currentAssignment = form.getFieldValue("initialRoleAssignment") || {};
        if (!currentAssignment.departmentId && initialDepartmentOptions.some(option => option.value === value)) {
          form.setFieldsValue({
            initialRoleAssignment: {
              ...currentAssignment,
              departmentId: value
            }
          });
        }
      }} />
                    </Form.Item>

                    <Form.Item name="isActive" label="Hoạt động" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                  </div>
                  {/* Trường không bắt buộc gom vào "Thông tin thêm"; forceRender để giá trị vẫn được gửi khi lưu. */}
                  <Collapse key={editing?.id || "create"} ghost size="small" className="staff-profile-more" defaultActiveKey={hasOptionalInfo(editing) ? ["more"] : []} items={[{
    key: "more",
    label: "Thông tin thêm (không bắt buộc)",
    forceRender: true,
    children: <div className="staff-profile-grid">
                        <Form.Item name="position" label="Chức vụ">
                          <Input />
                        </Form.Item>
                        <Form.Item name="email" label="Email">
                          <Input inputMode="email" autoComplete="off" />
                        </Form.Item>
                        <Form.Item name="phone" label="Số điện thoại">
                          <Input inputMode="tel" autoComplete="off" />
                        </Form.Item>
                      </div>
  }]} />
                  {!editing ? <div className="staff-profile-role-section">
                      <Form.Item name="assignInitialRole" label="Gán vai trò ngay" valuePropName="checked" extra="Bật mục này để tài khoản có quyền sử dụng ngay sau khi tạo.">
                        <Switch />
                      </Form.Item>
                      {assignInitialRole && !optionsQuery?.isFetching && !roleOptionsForAssignments.length ? <Alert type="info" showIcon title="Chưa có vai trò được phép gán. Bạn có thể tắt Gán vai trò ngay để chỉ tạo hồ sơ." style={{ marginBottom: 12 }} /> : null}
                      {assignInitialRole ? <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: "0 16px"
    }}>
                          <Form.Item name={["initialRoleAssignment", "roleId"]} label="Vai trò" rules={[{
        required: true,
        message: "Chọn vai trò"
      }]}>
                            <Select aria-label="Vai trò" loading={optionsQuery?.isFetching || rolesQuery.isLoading} showSearch optionFilterProp="label" options={roleOptionsForAssignments} />
                          </Form.Item>
                          <Form.Item name={["initialRoleAssignment", "scopeType"]} label="Phạm vi" rules={[{
        required: true,
        message: "Chọn phạm vi"
      }]}>
                            <Select aria-label="Phạm vi" options={allowedScopes} onChange={() => { form.setFieldValue(['initialRoleAssignment', 'departmentId'], undefined); form.setFieldValue(['initialRoleAssignment', 'departmentIds'], []); }} />
                          </Form.Item>
                          {initialRoleScopeType === "system" ? <Form.Item label="Đơn vị">
                              <Select disabled placeholder="Không cần chọn đơn vị" />
                            </Form.Item> : initialRoleScopeType === "specific_departments" ? <Form.Item name={["initialRoleAssignment", "departmentIds"]} label="Đơn vị" rules={[{
        required: true,
        message: "Chọn đơn vị"
      }]}>
                              <Select mode="multiple" showSearch optionFilterProp="label" options={initialDepartmentOptions} />
                            </Form.Item> : <Form.Item name={["initialRoleAssignment", "departmentId"]} label="Đơn vị" rules={[{
        required: true,
        message: "Chọn đơn vị"
      }]}>
                              <Select showSearch optionFilterProp="label" options={initialDepartmentOptions} />
                            </Form.Item>}
                        </div> : null}
                    </div> : null}
                </Form>;

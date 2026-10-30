import { StaffAssignmentTags } from "./StaffAssignmentTags";
import { QueryErrorState } from "../common/QueryErrorState";
import { Button, Card, Dropdown, Empty, Input, Pagination, Space, Spin, Table, Tag } from "antd";
import { KeyOutlined, LaptopOutlined, EllipsisOutlined, PlusOutlined } from "@ant-design/icons";
import { PAGE_SIZE_OPTIONS } from "../../hooks/useUrlPagination";
import dayjs from "dayjs";
import { Typography } from "antd";

const {
  Title,
  Text
} = Typography;

// Thao tác phụ của một tài khoản; "Sửa" luôn để ngoài, phần còn lại gom vào menu "⋯".
const StaffMoreActions = ({ member, openResetPassword, openSessions }) => <Dropdown trigger={["click"]} placement="bottomRight" menu={{
  items: [{
    key: "reset-password",
    icon: <KeyOutlined />,
    label: "Đặt lại mật khẩu"
  }, {
    key: "sessions",
    icon: <LaptopOutlined />,
    label: "Phiên đăng nhập"
  }],
  onClick: ({ key, domEvent }) => {
    domEvent?.stopPropagation?.();
    if (key === "reset-password") openResetPassword(member);
    if (key === "sessions") openSessions(member);
  }
}}>
    <Button size="small" icon={<EllipsisOutlined />} aria-label={`Thao tác khác cho ${member?.fullName || member?.username || "cán bộ"}`} onClick={event => event.stopPropagation()} />
  </Dropdown>;
export const StaffListView = ({
  query,
  setQuery,
  canWrite,
  openCreate,
  staffQuery,
  useCardList,
  staff,
  page,
  pageSize,
  staffPagination,
  setPagination,
  openEdit,
  departmentMap,
  roleLabelByName,
  roleById,
  openResetPassword,
  openSessions
}) => <><div className="page-heading page-heading-row">
        <div>
          <Title level={4}>Cán bộ</Title>
          <Text type="secondary">
            {canWrite ? "Quản lý hồ sơ cán bộ, tài khoản đăng nhập và vai trò." : "Xem hồ sơ cán bộ, tài khoản đăng nhập và vai trò trong phạm vi được giao."}
          </Text>
        </div>
        <Space wrap className="page-heading-actions">
          <Input.Search placeholder="Tìm cán bộ" allowClear value={query} onSearch={setQuery} onChange={event => setQuery(event.target.value)} />
          {canWrite ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Thêm tài khoản
            </Button> : null}
        </Space>
      </div>
      {staffQuery.isError ? <QueryErrorState error={staffQuery.error} onRetry={() => staffQuery.refetch()} retrying={staffQuery.isFetching} /> : useCardList ? <Spin spinning={staffQuery.isLoading}><div className="mobile-card-list">
          {Array.isArray(staff) && staff.length ? <ul className="mobile-card-items" aria-label="Danh sách cán bộ">{staff.map(member => <li key={member.id} className="mobile-card-item">
              <Card className={`mobile-card ${canWrite ? "clickable" : ""}`} onClick={() => canWrite && openEdit(member)}>
                <div className="mobile-card-head">
                  <div className="mobile-card-title staff-card-title">{member.fullName || "-"}</div>
                  <Tag color={member.isActive ? "green" : "default"}>
                    {member.isActive ? "Hoạt động" : "Tắt"}
                  </Tag>
                </div>
                <Space wrap size={[6, 6]}>
                  <Tag>
                    {departmentMap.get(member.departmentId) || "Chưa có phòng ban"}
                  </Tag>
                </Space>
                <div>{<StaffAssignmentTags assignments={member.roleAssignments} roleLabelByName={roleLabelByName} roleById={roleById} />}</div>
                <div className="mobile-card-meta">
                  <Text type="secondary">
                    Tài khoản: {member.username || "-"}
                  </Text>
                  <Text type="secondary">Email: {member.email || "-"}</Text>
                </div>
                {member.mustChangePassword ? <Tag color="orange">Cần đổi mật khẩu</Tag> : null}
                {canWrite ? <div className="staff-card-actions">
                    <Button size="small" onClick={event => {
          event.stopPropagation();
          openEdit(member);
        }}>
                      Sửa
                    </Button>
                    <StaffMoreActions member={member} openResetPassword={openResetPassword} openSessions={openSessions} />
                  </div> : null}
              </Card>
            </li>)}</ul> : staffQuery.isLoading ? null : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query ? "Không có cán bộ phù hợp" : "Chưa có cán bộ"} />}
          {staffPagination.total > 0 ? <Pagination className="mobile-card-pagination" current={page} pageSize={pageSize} total={staffPagination.total} size="small" showSizeChanger pageSizeOptions={PAGE_SIZE_OPTIONS} onChange={setPagination} /> : null}
        </div></Spin> : <Table rowKey="id" loading={staffQuery.isLoading} dataSource={Array.isArray(staff) ? staff : []} scroll={{
    x: "max-content"
  }} pagination={{
    current: page,
    pageSize,
    total: staffPagination.total,
    showSizeChanger: true,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
    onChange: setPagination
  }} columns={[
  // { title: 'Mã', dataIndex: 'code', width: 120 },
  {
    title: "Họ tên",
    dataIndex: "fullName"
  }, {
    title: "Phòng ban",
    dataIndex: "departmentId",
    render: value => departmentMap.get(value) || "-"
  }, {
    title: "Tài khoản",
    dataIndex: "username",
    render: value => value || "-"
  }, {
    title: "Email",
    dataIndex: "email",
    render: value => value || "-"
  }, {
    title: "Vai trò & phạm vi",
    dataIndex: "roleAssignments",
    render: (assignments) => <StaffAssignmentTags assignments={assignments} roleLabelByName={roleLabelByName} roleById={roleById} />
  }, {
    title: "Truy cập cuối",
    dataIndex: "lastSeenAt",
    render: value => value ? dayjs(value).format("HH:mm DD/MM/YYYY") : "-"
  }, {
    title: "Trạng thái",
    dataIndex: "isActive",
    render: (value, record) => <Space size={[4, 4]} wrap>
                  <Tag color={value ? "green" : "default"}>
                    {value ? "Hoạt động" : "Tắt"}
                  </Tag>
                  {record?.mustChangePassword ? <Tag color="orange">Cần đổi mật khẩu</Tag> : null}
                </Space>
  }, {
    title: "",
    key: "actions",
    width: 96,
    render: (_, record) => canWrite ? <Space size={8}>
                    <Button size="small" onClick={() => openEdit(record)}>
                      Sửa
                    </Button>
                    <StaffMoreActions member={record} openResetPassword={openResetPassword} openSessions={openSessions} />
                  </Space> : null
  }]} />}</>;

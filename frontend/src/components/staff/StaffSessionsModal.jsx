import { QueryErrorState } from "../common/QueryErrorState";
import { Button, Modal, Popconfirm, Space, Switch, Table, Tag } from "antd";
import dayjs from "dayjs";
import { Typography } from "antd";
import { formatSessionIp, getSessionStatus } from "./staffPresentation.js";

const {
  Text
} = Typography;

export const StaffSessionsModal = ({
  sessionsTarget,
  setSessionsTarget,
  setShowInactiveSessions,
  managingOwnSessions,
  revokeAllSessionsMutation,
  activeSessionCount,
  sessionRows,
  showInactiveSessions,
  sessionsQuery,
  visibleSessionRows,
  revokeSessionMutation
}) => <Modal title={`Phiên đăng nhập${sessionsTarget ? ` - ${sessionsTarget.fullName}` : ""}`} open={Boolean(sessionsTarget)} onCancel={() => {
  setSessionsTarget(null);
  setShowInactiveSessions(false);
}} footer={[<Button key="close" onClick={() => setSessionsTarget(null)}>Đóng</Button>, <Popconfirm key="revoke-all" title={managingOwnSessions ? "Thu hồi tất cả phiên khác?" : "Thu hồi tất cả phiên đăng nhập?"} description={managingOwnSessions ? "Phiên bạn đang sử dụng sẽ được giữ lại." : "Người dùng sẽ bị đăng xuất trên tất cả thiết bị."} onConfirm={() => revokeAllSessionsMutation.mutate()} okText="Thu hồi" cancelText="Hủy">
            <Button danger disabled={activeSessionCount <= (managingOwnSessions ? 1 : 0)} loading={revokeAllSessionsMutation.isPending}>
              {managingOwnSessions ? "Thu hồi tất cả phiên khác" : "Thu hồi tất cả"}
            </Button>
          </Popconfirm>]} width={900}>
        <Space align="center" style={{
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 12
  }}>
          <Text type="secondary">
            {activeSessionCount} phiên đang hoạt động · {sessionRows.length} phiên gần nhất
          </Text>
          <Space size="small">
            <Text type="secondary">Hiện lịch sử</Text>
            <Switch size="small" checked={showInactiveSessions} onChange={setShowInactiveSessions} />
          </Space>
        </Space>
        {sessionsQuery.isError ? <QueryErrorState error={sessionsQuery.error} onRetry={() => sessionsQuery.refetch()} retrying={sessionsQuery.isFetching} /> : <Table rowKey="id" size="small" loading={sessionsQuery.isLoading} dataSource={visibleSessionRows} pagination={{
    pageSize: 7,
    hideOnSinglePage: true,
    showSizeChanger: false
  }} scroll={{
    x: 780
  }} columns={[{
    title: "Trình duyệt",
    dataIndex: "browser",
    render: (value, row) => <Space size={4} wrap>
                  <span>{value || "-"}</span>
                  {row.current ? <Tag color="blue">Phiên này</Tag> : null}
                </Space>
  }, {
    title: "Thiết bị",
    render: (_, row) => `${row.operatingSystem || "-"} / ${row.deviceType || "-"}`
  }, {
    title: "IP",
    dataIndex: "ipAddress",
    render: formatSessionIp
  }, {
    title: "Truy cập cuối",
    dataIndex: "lastSeenAt",
    render: value => value ? dayjs(value).format("DD/MM/YYYY HH:mm:ss") : "-"
  }, {
    title: "Trạng thái",
    render: (_, row) => {
      const status = getSessionStatus(row);
      return <Tag color={status.color}>{status.label}</Tag>;
    }
  }, {
    title: "",
    render: (_, row) => row.active ? <Popconfirm title="Thu hồi phiên này?" onConfirm={() => revokeSessionMutation.mutate(row.id)} okText="Thu hồi" cancelText="Hủy">
                  <Button danger size="small" loading={revokeSessionMutation.isPending && revokeSessionMutation.variables === row.id}>
                    {row.current ? "Đăng xuất" : "Thu hồi"}
                  </Button>
                </Popconfirm> : null
  }]} />}
      </Modal>;

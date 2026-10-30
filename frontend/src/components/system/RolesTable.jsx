import { Button, Popconfirm, Space, Table, Tag, Tooltip } from "antd";
import { EditOutlined, DeleteOutlined, SettingOutlined, LockOutlined } from "@ant-design/icons";
import { Typography } from "antd";

const {
  Text
} = Typography;
export const RolesTable = ({
  roles,
  allRolePermissions,
  openPermissionsDrawer,
  openEditRole,
  deleteRoleMutation
}) => {
  return <Table rowKey="id" dataSource={Array.isArray(roles) ? roles : []} size="small" pagination={false} scroll={{
    x: "max-content"
  }} style={{
    marginBottom: 24
  }} columns={[{
    title: 'Tên hiển thị',
    dataIndex: 'label',
    render: (label, role) => <Space>
                    {label}
                    {role.isSystem && <Tooltip title="Vai trò hệ thống, không thể xóa">
                        <LockOutlined style={{
          color: '#faad14'
        }} />
                      </Tooltip>}
                  </Space>
  }, {
    title: 'Ưu tiên hiển thị',
    dataIndex: 'level',
    width: 140,
    render: level => <Tag>{level}</Tag>
  }, {
    title: 'Quyền hạn',
    dataIndex: 'id',
    width: 220,
    render: (roleId, role) => {
      const currentActions = allRolePermissions?.[role.id] || [];
      return <Space size={8}>
                      <Tag color={currentActions.length > 0 ? 'blue' : 'default'} style={{
          margin: 0
        }}>
                        {currentActions.length} quyền
                      </Tag>
                      <Button type="link" size="small" icon={<SettingOutlined />} onClick={() => openPermissionsDrawer(role)} style={{
          padding: 0
        }}>
                        Phân quyền
                      </Button>
                    </Space>;
    }
  }, {
    title: '',
    width: 120,
    render: (_, role) => <Space>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEditRole(role)}>
                      Sửa
                    </Button>
                    {!role.isSystem && <Popconfirm title="Tắt vai trò này?" description="Người dùng đang dùng role này sẽ mất quyền." okText="Tắt" cancelText="Hủy" onConfirm={() => deleteRoleMutation.mutate(role.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} loading={deleteRoleMutation.isPending} />
                      </Popconfirm>}
                  </Space>
  }, {
    // Technical key for admins; hidden on narrow screens where it wrapped letter by letter.
    title: 'Mã',
    dataIndex: 'name',
    width: 160,
    responsive: ['lg'],
    render: name => <Text type="secondary" code>{name}</Text>
  }]} />;
};

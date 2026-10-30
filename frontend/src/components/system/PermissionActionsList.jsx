import { Button, Space, Table, Tag, Collapse } from "antd";
import { PlusOutlined, EditOutlined, SettingOutlined } from "@ant-design/icons";
import { Typography } from "antd";
import { GROUP_COLORS, GROUP_LABELS } from "../../constants/roleOptions";

const {
  Text
} = Typography;

export const PermissionActionsList = ({
  openCreateAction,
  actions,
  openEditAction
}) => {
  return <Collapse ghost items={[{
    key: 'actions',
    label: <Space>
                    <SettingOutlined />
                    <Text>Nâng cao: danh mục quyền</Text>
                  </Space>,
    children: <>
                    <div style={{
        marginBottom: 12
      }}>
                      <Button icon={<PlusOutlined />} size="small" onClick={openCreateAction}>
                        Thêm action mới
                      </Button>
                    </div>
                    <Table rowKey="name" dataSource={Array.isArray(actions) ? actions : []} size="small" pagination={false} scroll={{
        x: "max-content"
      }} columns={[{
        title: 'Action key',
        dataIndex: 'name',
        render: name => <Text code>{name}</Text>
      }, {
        title: 'Tên hiển thị',
        dataIndex: 'label'
      }, {
        title: 'Nhóm',
        dataIndex: 'groupName',
        render: g => <Tag color={GROUP_COLORS[g] || 'default'}>
                              {GROUP_LABELS[g] || g}
                            </Tag>
      }, {
        title: 'Thứ tự',
        dataIndex: 'sortOrder',
        width: 80
      }, {
        title: '',
        width: 80,
        render: (_, action) => <Button size="small" icon={<EditOutlined />} onClick={() => openEditAction(action)} />
      }]} />
                  </>
  }]} />;
};

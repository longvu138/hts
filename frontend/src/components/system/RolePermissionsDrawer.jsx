import { Button, Checkbox, Space, Tag, Select, Drawer } from "antd";
import { Typography } from "antd";
import { GROUP_LABELS, GROUP_COLORS } from "../../constants/roleOptions";
import { PermissionTag } from "./PermissionTag";

const {
  Title,
  Text
} = Typography;

export const RolePermissionsDrawer = ({
  selectedRole,
  setPermDrawerOpen,
  permDrawerOpen,
  savePermissionsMutation,
  handleBulkUpdatePermissions,
  selectedActions,
  setSelectedActions,
  actions = [],
  activeActions,
  actionGroups
}) => {
  return <Drawer title={<div>
            <Title level={5} style={{
      margin: 0
    }}>Phân quyền cho vai trò</Title>
            <Text type="secondary" style={{
      fontSize: 12
    }}>
              {selectedRole?.label} ({selectedRole?.name})
            </Text>
          </div>} placement="right" size={520} onClose={() => setPermDrawerOpen(false)} open={permDrawerOpen} footer={<div style={{
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8
  }}>
            <Button onClick={() => setPermDrawerOpen(false)}>Hủy</Button>
            <Button type="primary" loading={savePermissionsMutation.isPending} onClick={() => {
      if (selectedRole) {
        handleBulkUpdatePermissions(selectedRole.id, selectedActions);
      }
    }}>
              Lưu thay đổi
            </Button>
          </div>}>
        <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }}>
          {/* Quick Select & Search */}
          <div>
            <Text type="secondary" style={{
          display: 'block',
          marginBottom: 8,
          fontWeight: 500
        }}>
              Tìm kiếm &amp; Chọn nhanh:
            </Text>
            <Select mode="multiple" placeholder="Gõ tìm kiếm hoặc chọn quyền..." style={{
          width: '100%'
        }} value={selectedActions} onChange={setSelectedActions} maxTagCount="responsive" allowClear showSearch optionFilterProp="children" tagRender={(tagProps) => <PermissionTag {...tagProps} actions={actions} />} filterOption={(input, option) => {
          const actionObj = activeActions.find(a => a.name === option.value);
          if (!actionObj) return false;
          const searchStr = `${actionObj.label} ${actionObj.name}`.toLowerCase();
          return searchStr.includes(input.toLowerCase());
        }} styles={{ popup: { root: {
          maxHeight: 300,
          overflow: 'auto'
        } } }}>
              {Object.entries(actionGroups).map(([group, groupActions]) => <Select.OptGroup key={group} label={GROUP_LABELS[group] || group}>
                  {groupActions.map(action => <Select.Option key={action.name} value={action.name}>
                      {action.label} <Text type="secondary" style={{
                fontSize: 11
              }}>({action.name})</Text>
                    </Select.Option>)}
                </Select.OptGroup>)}
            </Select>

            <Space style={{
          marginTop: 8
        }}>
              <Button type="link" size="small" style={{
            padding: 0,
            height: 'auto',
            fontSize: 12
          }} onClick={() => setSelectedActions(activeActions.map(a => a.name))}>
                Chọn tất cả
              </Button>
              <Text type="secondary" style={{
            fontSize: 12
          }}>|</Text>
              <Button type="link" size="small" danger style={{
            padding: 0,
            height: 'auto',
            fontSize: 12
          }} onClick={() => setSelectedActions([])}>
                Xóa hết
              </Button>
            </Space>
          </div>

          <hr style={{
        border: 0,
        borderTop: '1px solid #f0f0f0',
        margin: '4px 0'
      }} />

          {/* Visual Checklist */}
          <div>
            <Text type="secondary" style={{
          display: 'block',
          marginBottom: 12,
          fontWeight: 500
        }}>
              Danh sách chi tiết theo nhóm:
            </Text>

            {Object.entries(actionGroups).map(([group, groupActions]) => {
          const isGroupAllChecked = groupActions.every(action => selectedActions.includes(action.name));
          const isGroupIndeterminate = groupActions.some(action => selectedActions.includes(action.name)) && !isGroupAllChecked;
          const handleGroupSelectAll = selectAll => {
            const actionNames = groupActions.map(a => a.name);
            if (selectAll) {
              setSelectedActions(prev => [...new Set([...prev, ...actionNames])]);
            } else {
              setSelectedActions(prev => prev.filter(a => !actionNames.includes(a)));
            }
          };
          return <div key={group} style={{
            marginBottom: 16,
            padding: 12,
            background: '#fafafa',
            borderRadius: 8,
            border: '1px solid #f0f0f0'
          }}>
                  <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
              borderBottom: '1px solid #f0f0f0',
              paddingBottom: 8
            }}>
                    <Tag color={GROUP_COLORS[group] || 'default'} style={{
                margin: 0
              }}>
                      {GROUP_LABELS[group] || group}
                    </Tag>
                    <Checkbox indeterminate={isGroupIndeterminate} checked={isGroupAllChecked} onChange={e => handleGroupSelectAll(e.target.checked)} style={{
                fontSize: 12
              }}>
                      Chọn cả nhóm
                    </Checkbox>
                  </div>

                  <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              paddingLeft: 4
            }}>
                    {groupActions.map(action => {
                const isChecked = selectedActions.includes(action.name);
                const handleCheckboxChange = checked => {
                  if (checked) {
                    setSelectedActions(prev => [...new Set([...prev, action.name])]);
                  } else {
                    setSelectedActions(prev => prev.filter(a => a !== action.name));
                  }
                };
                return <Checkbox key={action.name} checked={isChecked} onChange={e => handleCheckboxChange(e.target.checked)} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  margin: 0
                }}>
                          <div style={{
                    marginLeft: 4,
                    marginTop: -3
                  }}>
                            <div style={{
                      fontWeight: isChecked ? 600 : 400,
                      fontSize: 13,
                      lineHeight: '18px'
                    }}>
                              {action.label}
                            </div>
                            <div style={{
                      fontSize: 11,
                      color: '#8c8c8c',
                      lineHeight: '14px',
                      marginTop: 2
                    }}>
                              {action.name}
                            </div>
                          </div>
                        </Checkbox>;
              })}
                  </div>
                </div>;
        })}
          </div>
        </div>
      </Drawer>;
};

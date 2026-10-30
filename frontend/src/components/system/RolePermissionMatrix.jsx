import { useMemo } from "react";
import { Checkbox, Space, Tag, Collapse } from "antd";
import { Typography } from "antd";
import { GROUP_COLORS, GROUP_LABELS } from "../../constants/roleOptions";

const {
  Text
} = Typography;

export const RolePermissionMatrix = ({
  actionGroups,
  roles,
  allRolePermissions,
  togglePermissionMutation,
  handleTogglePermission
}) => {
  const permissionGroupItems = useMemo(() => Object.entries(actionGroups).map(([group, groupActions]) => ({
    key: group,
    label: <Space><Tag color={GROUP_COLORS[group] || 'default'}>{GROUP_LABELS[group] || group}</Tag><Text type="secondary">{groupActions.length} quyền</Text></Space>,
    children: <div className="permission-group-list">{groupActions.map(action => <div className="permission-action-row" key={action.name}>
          <div className="permission-action-info"><Space orientation="vertical" size={3}>
            <Text strong>{action.label}</Text><Text type="secondary">{action.description || 'Chưa có mô tả quyền.'}</Text><Text code>{action.name}</Text>
          </Space></div>
          <div className="permission-role-checks">{roles.map(role => {
            const currentActions = allRolePermissions[role.id] || [];
            const checked = currentActions.includes(action.name);
            return <Checkbox key={`${role.id}:${action.name}`} checked={checked} disabled={togglePermissionMutation.isPending} onChange={event => handleTogglePermission(role.id, action.name, event.target.checked)}><span className="permission-role-label">{role.label}</span></Checkbox>;
          })}</div>
        </div>)}</div>
  })), [actionGroups, allRolePermissions, handleTogglePermission, roles, togglePermissionMutation.isPending]);
  return <Collapse className="permission-groups-collapse" defaultActiveKey={['department']} items={permissionGroupItems} style={{
    marginBottom: 24
  }} />;
};

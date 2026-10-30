import { QueryErrorState } from "../../components/common/QueryErrorState";
import { Button, Space, Spin } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { Typography } from "antd";
import { useRolesPage } from "../../hooks/useRolesPage";
import { RolesTable } from "../../components/system/RolesTable";
import { RolePermissionMatrix } from "../../components/system/RolePermissionMatrix";
import { PermissionActionsList } from "../../components/system/PermissionActionsList";
import { RoleEditorModal } from "../../components/system/RoleEditorModal";
import { PermissionActionModal } from "../../components/system/PermissionActionModal";
import { RolePermissionsDrawer } from "../../components/system/RolePermissionsDrawer";

const {
  Title,
  Text
} = Typography;







export const RolesPage = props => {
  const model = useRolesPage(props);
  const {
    isLoading,
    pageError,
    rolesQuery,
    actionsQuery,
    rolePermissionsQuery,
    openCreateRole
  } = model;
  return <div className="resource-page">
      {/* Page heading */}
      <div className="page-heading page-heading-row">
        <div>
          <Title level={4}>Vai trò &amp; Quyền</Title>
          <Text type="secondary">
            Quản lý vai trò, danh sách quyền và ma trận phân quyền động.
          </Text>
        </div>
        <Space wrap>
          <Button icon={<PlusOutlined />} type="primary" onClick={openCreateRole}>
            Thêm vai trò
          </Button>
        </Space>
      </div>

      {pageError ? <QueryErrorState retrying={rolesQuery.isFetching || actionsQuery.isFetching || rolePermissionsQuery.isFetching} error={pageError} onRetry={() => {
      rolesQuery.refetch();
      actionsQuery.refetch();
      rolePermissionsQuery.refetch();
    }} /> : isLoading ? <div style={{
      textAlign: 'center',
      padding: 60
    }}>
          <Spin size="large" />
        </div> : <>
          {/* ── Roles list ────────────────────────────────────────────── */}
          <RolesTable {...model.roles} />

          {/* ── Permissions by group ──────────────────────────────────── */}
          <div className="permission-matrix-toolbar">
            <div>
              <Title level={5} style={{
            margin: 0
          }}>Ma trận phân quyền</Title>
              <Text type="secondary">
                Mở từng nhóm quyền để xem mô tả và phân quyền cho các vai trò.
              </Text>
            </div>
          </div>
          <RolePermissionMatrix {...model.matrix} />

          {/* ── Actions catalogue (collapsible) ───────────────────────── */}
          <PermissionActionsList {...model.actions} />
        </>}

      {/* ── Role modal ──────────────────────────────────────────────────── */}
      <RoleEditorModal {...model.roleEditor} />

      {/* ── Action modal ────────────────────────────────────────────────── */}
      <PermissionActionModal {...model.actionEditor} />

      {/* ── Permissions Drawer ──────────────────────────────────────────── */}
      <RolePermissionsDrawer {...model.permissions} />
    </div>;
};

import { Button, Layout, Tooltip } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import { getVisibleNavItems, isNavItemActive } from "../../app/navigation";
import { NavIcon } from "./navIcons";

export const AppSidebar = ({ collapsed, currentUser, onCollapse, onNavItemClick }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const items = getVisibleNavItems(currentUser);
  return (
    <Layout.Sider
      width={248}
      collapsedWidth={72}
      collapsed={collapsed}
      onCollapse={onCollapse}
      trigger={null}
      className={`sidebar ${collapsed ? "sidebar-collapsed" : ""}`}
    >
      <nav className="nav-group" aria-label="Menu chính">
        {items.map((item) => {
          const active = isNavItemActive(item, pathname);
          return (
            <Tooltip key={item.key} title={collapsed ? item.label : null} placement="right">
              <Button
                type="text"
                block
                icon={<NavIcon navKey={item.key} />}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={active ? "nav-active" : ""}
                onClick={() => {
                  navigate(item.path);
                  onNavItemClick?.();
                }}
              >
                {collapsed ? null : item.label}
              </Button>
            </Tooltip>
          );
        })}
      </nav>
    </Layout.Sider>
  );
};

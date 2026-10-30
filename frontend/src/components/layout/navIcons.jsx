import { CalendarOutlined, DatabaseOutlined, SettingOutlined, TeamOutlined } from "@ant-design/icons";

// Biểu tượng theo key trong NAV_ITEMS (app/navigation.js); dùng chung cho sidebar và bottom nav.
const NAV_ICONS = Object.freeze({
  work: CalendarOutlined,
  departments: DatabaseOutlined,
  staff: TeamOutlined,
  roles: SettingOutlined,
});

export const NavIcon = ({ navKey, className }) => {
  const Icon = NAV_ICONS[navKey];
  return Icon ? <Icon className={className} /> : null;
};

import { Tag } from "antd";
import { GROUP_COLORS } from "../../constants/roleOptions";

const preventMouseDown = (event) => {
  event.preventDefault();
  event.stopPropagation();
};

/** Tag quyền trong Select nhiều lựa chọn, tô màu theo nhóm quyền. Dùng làm `tagRender`. */
export const PermissionTag = ({ label, value, closable, onClose, actions = [] }) => {
  const action = Array.isArray(actions) ? actions.find((item) => item?.name === value) : null;
  const color = GROUP_COLORS[action?.groupName || "default"] || "default";
  return (
    <Tag
      color={color}
      onMouseDown={preventMouseDown}
      closable={closable}
      onClose={onClose}
      style={{ marginRight: 3, marginTop: 2, marginBottom: 2 }}
    >
      {label}
    </Tag>
  );
};

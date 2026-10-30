import { Button, Dropdown, Space } from "antd";
import { EllipsisOutlined } from "@ant-design/icons";
import { workPartActions, workPartTitle } from "../../utils/workParts";

export const WorkPartActions = ({
  item = {},
  onAction,
  userId,
  canAssign = false,
  canSelf = false,
  compact = false,
}) => {
  const title = workPartTitle(item);
  const allowed = onAction ? workPartActions(item, { userId, canAssign, canSelf }) : {};
  const size = compact ? "small" : undefined;
  const menuItems = [
    allowed.transfer && { key: "transfer", label: "Chuyển việc" },
    allowed.edit && { key: "edit", label: "Sửa lịch" },
    allowed.cancel && { type: "divider" },
    allowed.cancel && { key: "cancel", label: "Hủy việc", danger: true },
  ].filter(Boolean);
  if (menuItems[0]?.type === "divider") menuItems.shift();
  return (
    <Space wrap={!compact} size={[6, 6]} className="work-part-actions">
      {allowed.complete ? (
        <Button size={size} type="primary" aria-label={`Hoàn thành: ${title}`} onClick={() => onAction("complete", item)}>
          Hoàn thành
        </Button>
      ) : null}
      {menuItems.length ? (
        <Dropdown
          trigger={["click"]}
          menu={{ items: menuItems, onClick: ({ key, domEvent }) => { domEvent?.stopPropagation(); onAction(key, item); } }}
        >
          <Button size={size} icon={<EllipsisOutlined aria-hidden />} aria-label={`Thao tác khác: ${title}`} />
        </Dropdown>
      ) : null}
    </Space>
  );
};

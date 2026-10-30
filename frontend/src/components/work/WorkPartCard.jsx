import { Card, Tag, Typography } from "antd";
import { WorkPartActions } from "./WorkPartActions";
import { WorkStatusTag } from "./WorkStatusTag";
import { WorkTimeRange } from "./WorkTimeRange";
import { WorkTitleButton } from "./WorkTitleButton";
import { isForwardedByMe, showGiverOf } from "../../utils/workParts";

const { Text } = Typography;

// Card used below xl (list) and inside the detail drawer; mirrors StaffListView's mobile-card layout.
// Only shows what the current view does not already say (no giver in "Việc tôi đã giao", no date in a single-day list).
export const WorkPartCard = ({
  item = {},
  onOpen,
  onAction,
  userId,
  canAssign = false,
  canSelf = false,
  mode,
  singleDay = false,
  showAssignee = true,
  showCommonTitle = true,
  showTitle = true,
}) => {
  const forwarded = isForwardedByMe(item, userId);
  const giver = showGiverOf(item, { mode, userId });
  return (
    <Card className={`mobile-card work-part-card${forwarded ? " work-part-forwarded" : ""}`} size="small">
      <div className="mobile-card-head">
        <span><WorkTimeRange startsAt={item.startsAt} endsAt={item.endsAt} inline hideDay={singleDay} /></span>
        <WorkStatusTag status={item.status} forwarded={forwarded} />
      </div>
      {showTitle ? <WorkTitleButton item={item} onOpen={onOpen} className="mobile-card-title" /> : null}
      {showCommonTitle && item.content && item.title && item.content !== item.title ? (
        <Text type="secondary" className="work-summary" title={item.title}>{item.title}</Text>
      ) : null}
      <div className="mobile-card-meta">
        {item.place ? <Text type="secondary">Địa điểm: {item.place}</Text> : null}
        {showAssignee && (item.assigneeName || item.departmentName) ? (
          <Text type="secondary">
            {item.assigneeName || ""}{item.departmentName ? ` · ${item.departmentName}` : ""}
          </Text>
        ) : null}
        {item.source === "self" ? <Text type="secondary"><Tag>Tự tạo</Tag></Text> : giver && item.giverName ? (
          <Text type="secondary">Người giao: {item.giverName}{item.parentId ? " · Nhận qua chuyển tiếp" : ""}</Text>
        ) : null}
        {item.progress ? (
          <Text type="secondary">Đã xong {item.progress.completed ?? 0}/{item.progress.total ?? 0} phần</Text>
        ) : null}
        {item.note ? <Text type="secondary">Ghi chú: {item.note}</Text> : null}
      </div>
      <div className="work-card-actions">
        <WorkPartActions item={item} onAction={onAction} userId={userId} canAssign={canAssign} canSelf={canSelf} />
      </div>
    </Card>
  );
};

import { Space, Tag, Typography } from "antd";
import { WORK_SITUATION_STATUS } from "../../constants/workOptions";
import { situationCounts } from "../../utils/workParts";

// Counts come from the rows already loaded (current page), not a separate server aggregate.
export const WorkSituationSummary = ({ items = [], partial = false }) => {
  const counts = situationCounts(items);
  return (
    <div className="work-summary-strip" aria-label="Tóm tắt tình hình">
      <Space wrap size={[8, 8]}>
        {["scheduled", "free", "completed"].map((status) => (
          <Tag key={status} color={WORK_SITUATION_STATUS[status].color}>
            {WORK_SITUATION_STATUS[status].label}: <strong>{counts[status]}</strong>
          </Tag>
        ))}
      </Space>
      <Typography.Text type="secondary" className="work-caption">
        Theo lịch đã giao, không phải vị trí thực tế.{partial ? " Số liệu tính trên trang đang xem." : ""}
      </Typography.Text>
    </div>
  );
};

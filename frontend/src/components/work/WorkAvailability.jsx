import { Alert, Button, Space, Spin, Typography } from "antd";
import { CheckCircleOutlined, CloseOutlined } from "@ant-design/icons";
import { showTimeRange } from "../../utils/workTime";

// personFixed: "self" when the viewer can only schedule themselves, "other" when editing a fixed assignee.
const conflictTitle = (conflicts, { personFixed, userId }) => {
  const onlyMe = conflicts.every((item) => item.assigneeId === userId);
  if (personFixed === "self" || (onlyMe && personFixed !== "other")) return "Bạn đã có lịch trong khung giờ này — hãy chọn thời gian khác";
  if (personFixed === "other") return "Người thực hiện đã có lịch trong khung giờ này — hãy chọn thời gian khác";
  return "Trùng lịch — vui lòng đổi người hoặc thời gian";
};

// onRemovePerson: offered when the people are chosen in this form; drops that person from the selection.
export const WorkAvailability = ({ active, checking, query, personFixed, userId, onRemovePerson }) => {
  if (!active) return null;
  if (checking) {
    return <Typography.Paragraph role="status"><Spin size="small" /> Đang kiểm tra lịch bận…</Typography.Paragraph>;
  }
  if (query.isError) {
    return (
      <Alert
        type="warning"
        showIcon
        title="Chưa kiểm tra được lịch bận"
        description="Vui lòng thử lại trước khi lưu."
        action={<Button onClick={() => query.refetch()}>Kiểm tra lại lịch</Button>}
        style={{ marginBottom: 16 }}
      />
    );
  }
  const conflicts = Array.isArray(query.data?.conflicts) ? query.data.conflicts.filter(Boolean) : [];
  if (!conflicts.length) {
    return (
      <Typography.Paragraph type="success" role="status" className="work-availability-ok">
        <CheckCircleOutlined aria-hidden /> Không trùng lịch
      </Typography.Paragraph>
    );
  }
  // The remove action is shown once per person, on their first conflicting slot.
  const firstOfPerson = new Set();
  return (
    <Alert
      type="warning"
      showIcon
      role="alert"
      title={conflictTitle(conflicts, { personFixed, userId })}
      description={(
        <Space orientation="vertical" size={6} className="full-width">
          {conflicts.map((item, index) => {
            const removable = Boolean(onRemovePerson && item.assigneeId && !firstOfPerson.has(item.assigneeId));
            if (item.assigneeId) firstOfPerson.add(item.assigneeId);
            return (
              <div key={item.id || `${item.assigneeId}-${item.startsAt}-${index}`} className="work-conflict-row">
                <div className="work-conflict-text">
                  <strong>{item.assigneeName}</strong> · {showTimeRange(item.startsAt, item.endsAt)}
                  <div>{item.canViewDetails ? `${item.title} · ${item.place}` : "Đã có lịch bận; bạn không có quyền xem nội dung và địa điểm."}</div>
                </div>
                {removable ? (
                  <Button size="small" type="link" icon={<CloseOutlined aria-hidden />} className="work-conflict-remove"
                    aria-label={`Bỏ ${item.assigneeName || "người này"} khỏi danh sách`} onClick={() => onRemovePerson(item.assigneeId)}>
                    Bỏ người này
                  </Button>
                ) : null}
              </div>
            );
          })}
          {query.data?.hasMore ? <Typography.Text>Còn lịch trùng khác. Vui lòng thu hẹp thời gian hoặc số người.</Typography.Text> : null}
        </Space>
      )}
      style={{ marginBottom: 16 }}
    />
  );
};

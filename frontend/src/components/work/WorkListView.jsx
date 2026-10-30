import { Card, Pagination, Table, Tag, Typography } from "antd";
import { PAGE_SIZE_OPTIONS } from "../../hooks/useUrlPagination";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { WORK_DESKTOP_MEDIA_QUERY } from "../../constants/workOptions";
import { WorkPartCard } from "./WorkPartCard";
import { WorkPartActions } from "./WorkPartActions";
import { WorkStatusTag } from "./WorkStatusTag";
import { WorkTimeRange } from "./WorkTimeRange";
import { WorkTitleButton } from "./WorkTitleButton";
import { isForwardedByMe, showGiverOf } from "../../utils/workParts";

const { Text } = Typography;

const assignmentsOf = (item) => Array.isArray(item?.assignments) ? item.assignments.filter(Boolean) : [];

const WorkTitleCell = ({ item, mode, userId, onOpen }) => {
  const giver = showGiverOf(item, { mode, userId });
  return (
    <>
      <WorkTitleButton item={item} onOpen={onOpen} />
      {item.content && item.title && item.content !== item.title ? (
        <span className="work-summary" title={item.title}>{item.title}</span>
      ) : null}
      {item.source === "self" || (giver && item.giverName) ? (
        <span className="work-caption">
          {item.source === "self" ? <Tag>Tự tạo</Tag> : `Giao bởi ${item.giverName}`}
          {item.parentId && giver ? " · Qua chuyển tiếp" : ""}
        </span>
      ) : null}
    </>
  );
};

const workColumns = ({ mode, actions, singleDay, hideAssignee }) => [
  { title: "Công việc", key: "work", render: (_, item) => <WorkTitleCell item={item} mode={mode} userId={actions.userId} onOpen={actions.onOpen} /> },
  mode === "given" && !hideAssignee && {
    title: "Người thực hiện",
    key: "assignee",
    width: 180,
    render: (_, item) => (
      <>
        <div>{item.assigneeName || "—"}</div>
        <Text type="secondary">{item.departmentName || "—"}</Text>
      </>
    ),
  },
  { title: "Thời gian", key: "time", width: 170, render: (_, item) => <WorkTimeRange startsAt={item.startsAt} endsAt={item.endsAt} hideDay={singleDay} /> },
  { title: "Địa điểm", dataIndex: "place", width: 150, render: (value) => value || null },
  {
    title: "Trạng thái",
    key: "status",
    width: 190,
    render: (_, item) => (
      <>
        <WorkStatusTag status={item.status} forwarded={isForwardedByMe(item, actions.userId)} />
        {item.progress ? <div className="work-caption">{item.progress.completed ?? 0}/{item.progress.total ?? 0} phần hoàn thành</div> : null}
        {item.note ? <div className="work-caption">{item.note}</div> : null}
      </>
    ),
  },
  { title: "Thao tác", key: "actions", width: 200, render: (_, item) => <WorkPartActions compact item={item} {...actions} /> },
].filter(Boolean);

const SituationAssignment = ({ item, onOpen }) => (
  <div className="work-situation-line">
    <div className="work-situation-text">
      <WorkTitleButton item={item} onOpen={onOpen} />
      <Text type="secondary" className="work-caption">
        <WorkTimeRange startsAt={item.startsAt} endsAt={item.endsAt} inline hideDay />{item.place ? <> · Địa điểm: {item.place}</> : null}
      </Text>
    </div>
  </div>
);

const situationColumns = (onOpen) => [
  {
    title: "Người thực hiện",
    key: "person",
    width: 240,
    render: (_, item) => (
      <>
        <div className="work-title">{item.name || "—"}</div>
        <Text type="secondary">{item.departmentName || "Chưa có đơn vị"}</Text>
      </>
    ),
  },
  { title: "Tình trạng", key: "status", width: 150, render: (_, item) => <WorkStatusTag situation status={item.status} /> },
  {
    title: "Công việc theo lịch",
    key: "works",
    render: (_, item) => assignmentsOf(item).length
      ? assignmentsOf(item).map((assignment) => <SituationAssignment key={assignment.id} item={assignment} onOpen={onOpen} />)
      : <Text type="secondary">—</Text>,
  },
];

const SituationCard = ({ item, onOpen }) => (
  <Card className="mobile-card" size="small">
    <div className="mobile-card-head">
      <span className="mobile-card-title work-card-name">{item.name || "—"}</span>
      <WorkStatusTag situation status={item.status} />
    </div>
    <Text type="secondary">{item.departmentName || "Chưa có đơn vị"}</Text>
    {assignmentsOf(item).length ? (
      <div className="mobile-card-meta">
        {assignmentsOf(item).map((assignment) => <SituationAssignment key={assignment.id} item={assignment} onOpen={onOpen} />)}
      </div>
    ) : null}
  </Card>
);

export const WorkListView = ({
  items = [],
  mode,
  onOpen,
  onAction,
  userId,
  canAssign,
  canSelf,
  singleDay = false,
  hideAssignee = false,
  pagination,
}) => {
  const desktop = useMediaQuery(WORK_DESKTOP_MEDIA_QUERY);
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!safeItems.length) return null;
  const actions = { onOpen, onAction, userId, canAssign, canSelf };
  const pager = pagination
    ? {
      current: pagination.page,
      pageSize: pagination.pageSize,
      total: pagination.total,
      showSizeChanger: true,
      pageSizeOptions: PAGE_SIZE_OPTIONS,
      hideOnSinglePage: pagination.total <= PAGE_SIZE_OPTIONS[0],
      showTotal: (count, range) => `${range[0]}–${range[1]} / ${count} ${pagination.unit}`,
      onChange: pagination.onChange,
    }
    : false;
  // Match StaffListView: desktop >= xl uses Table; tablet/mobile use a vertical card list.
  if (desktop) {
    return (
      <Table
        aria-label="Danh sách công việc"
        className="work-table"
        rowKey="id"
        size={mode === "situation" ? "small" : "middle"}
        dataSource={safeItems}
        columns={mode === "situation" ? situationColumns(onOpen) : workColumns({ mode, actions, singleDay, hideAssignee })}
        rowClassName={(item) => isForwardedByMe(item, userId) ? "work-row-forwarded" : ""}
        pagination={pager}
      />
    );
  }
  // Same plain ul/li card markup as StaffListView (AntD List is deprecated in v6).
  return (
    <div className="mobile-card-list">
      <ul className="mobile-card-items" aria-label="Danh sách công việc">
        {safeItems.map((item) => (
          <li key={item.id} className="mobile-card-item">
            {mode === "situation"
              ? <SituationCard item={item} onOpen={onOpen} />
              : <WorkPartCard item={item} {...actions} mode={mode} singleDay={singleDay} showAssignee={mode === "given" && !hideAssignee} />}
          </li>
        ))}
      </ul>
      {pager && !pager.hideOnSinglePage ? (
        <Pagination
          className="mobile-card-pagination"
          size="small"
          current={pager.current}
          pageSize={pager.pageSize}
          total={pager.total}
          showSizeChanger
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onChange={pager.onChange}
        />
      ) : null}
    </div>
  );
};

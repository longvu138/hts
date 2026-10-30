import { useState } from "react";
import { Button, Collapse, Drawer, Empty, Pagination, Space, Spin, Typography } from "antd";
import { useWorkDetail } from "../../hooks/useWork";
import { WorkPartCard } from "./WorkPartCard";
import { QueryErrorState } from "../common/QueryErrorState";
import { WORK_HISTORY_LABELS } from "../../constants/workOptions";
import { showTime, showTimeRange } from "../../utils/workTime";
import { sortHistory, workPartTitle } from "../../utils/workParts";

const { Text, Title, Paragraph } = Typography;
const DETAIL_PAGE_SIZE = 20;

const slot = (snapshot = {}) => snapshot.startsAt
  ? `${showTimeRange(snapshot.startsAt, snapshot.endsAt)}${snapshot.place ? ` · ${snapshot.place}` : ""}`
  : snapshot.place || "";

// One readable sentence per event, e.g. "A chuyển cho B: 08:00 – 11:30 · 24/10/2026 · Khu A".
const historySentence = (entry, nameOf) => {
  const actor = entry.actorName || "Không rõ";
  const target = nameOf(entry.assignmentId);
  const after = slot(entry.after);
  switch (entry.action) {
    case "received":
      return `${actor} chuyển cho ${target || "người nhận"}${after ? `: ${after}` : ""}`;
    case "created":
      return `${actor} giao cho ${target || "người thực hiện"}${after ? `: ${after}` : ""}`;
    case "transferred": {
      const names = (entry.after?.childIds || []).map(nameOf).filter(Boolean);
      return `${actor} chuyển việc${names.length ? ` cho ${names.join(", ")}` : ""}`;
    }
    default:
      return `${actor} · ${(WORK_HISTORY_LABELS[entry.action] || entry.action || "").toLocaleLowerCase("vi")}`;
  }
};

const HistoryEntry = ({ entry, nameOf }) => {
  const before = slot(entry.before);
  const after = slot(entry.after);
  const changes = [
    ["Tên việc", entry.before?.content, entry.after?.content],
    ["Tên công việc chung", entry.before?.title, entry.after?.title],
    ["Mô tả", entry.before?.description, entry.after?.description],
  ].filter(([, oldValue, newValue]) => oldValue !== newValue && (oldValue !== undefined || newValue !== undefined));
  const showChange = entry.action === "updated" && (before || after);
  return (
    <div className="work-history-entry">
      <Text strong>{WORK_HISTORY_LABELS[entry.action] || entry.action}</Text>
      <Text type="secondary"> · {showTime(entry.createdAt)}</Text>
      <div>{historySentence(entry, nameOf)}</div>
      {showChange && before && after && before !== after ? (
        <Space orientation="vertical" size={0}>
          <Text type="secondary">Trước: {before}</Text>
          <Text>Sau: {after}</Text>
        </Space>
      ) : showChange ? <Text>{after || before}</Text> : null}
      {["updated", "info_updated"].includes(entry.action) ? changes.map(([label, oldValue, newValue]) => <div key={label}><Text strong>{label}</Text><div><Text type="secondary">Trước: {oldValue || "Chưa có"}</Text></div><div>Sau: {newValue || "Đã bỏ trống"}</div></div>) : null}
      {entry.reason ? <div><Text type="secondary">Lý do: {entry.reason}</Text></div> : null}
      {entry.action === "completed" && entry.after?.note ? <div><Text type="secondary">Ghi chú: {entry.after.note}</Text></div> : null}
    </div>
  );
};

export const WorkDetailDrawer = ({ workId, currentUser, canAssign, canSelf, onClose, onAction }) => {
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const query = useWorkDetail(workId, page, historyPage);
  const items = Array.isArray(query.data?.items) ? query.data.items : [];
  const rawHistory = Array.isArray(query.data?.history) ? query.data.history : [];
  const first = items[0];
  const partsTotal = Number(query.data?.pagination?.total || 0);
  const historyTotal = Number(query.data?.historyPagination?.total || 0);
  const names = new Map(items.map((item) => [item.id, item.assigneeName]));
  const nameOf = (id) => names.get(id);
  // A "transferred" event is redundant when its "received" events are on the same page.
  const receivedIds = new Set(rawHistory.filter((entry) => entry.action === "received").map((entry) => entry.assignmentId));
  const history = sortHistory(rawHistory).filter((entry) => entry.action !== "transferred"
    || !(entry.after?.childIds || []).some((id) => receivedIds.has(id)));

  return (
    <Drawer open title="Chi tiết công việc" size={800} onClose={onClose} rootClassName="work-drawer">
      {query.isPending ? <Spin /> : query.isError ? (
        <QueryErrorState
          error={query.error}
          onRetry={query.refetch}
          retrying={query.isFetching}
        />
      ) : (
        <Space orientation="vertical" size={16} className="full-width">
          {first ? (
            <div>
              <Title level={5}>{first.title || "Công việc"}</Title>
              {first.description ? <Paragraph type="secondary">Mô tả: {first.description}</Paragraph> : null}
              {first.giverId === currentUser.id && !first.parentId ? (
                <Button onClick={() => onAction("info", first)}>Sửa thông tin chung</Button>
              ) : null}
            </div>
          ) : null}
          {!items.length ? <Empty description="Không có việc để hiển thị" /> : null}
          {items.map((item) => (
            <div key={item.id} className={item.parentId ? "work-chain-child" : undefined} style={{ marginInlineStart: Math.min(item.depth || 0, 3) * 8 }}>
              <WorkPartCard item={item} onAction={onAction} userId={currentUser.id} canAssign={canAssign} canSelf={canSelf} showCommonTitle={false} showTitle={!(partsTotal === 1 && workPartTitle(item).trim() === first?.title?.trim())} />
            </div>
          ))}
          {partsTotal > DETAIL_PAGE_SIZE ? (
            <Pagination
              simple
              current={page}
              pageSize={DETAIL_PAGE_SIZE}
              total={partsTotal}
              showSizeChanger={false}
              onChange={(value) => {
                setPage(value);
                setHistoryPage(1);
              }}
            />
          ) : null}
          <Collapse
            defaultActiveKey={["history"]}
            items={[{
              key: "history",
              label: "Lịch sử",
              children: (
                <>
                  {historyTotal > DETAIL_PAGE_SIZE ? (
                    <Pagination simple current={historyPage} pageSize={DETAIL_PAGE_SIZE} total={historyTotal} showSizeChanger={false} onChange={setHistoryPage} style={{ marginBottom: 12 }} />
                  ) : null}
                  {history.length ? (
                    <Space orientation="vertical" size={12} className="full-width">
                      {history.map((entry) => <HistoryEntry key={entry.id} entry={entry} nameOf={nameOf} />)}
                    </Space>
                  ) : <Empty description="Chưa có lịch sử" />}
                </>
              ),
            }]}
          />
        </Space>
      )}
    </Drawer>
  );
};

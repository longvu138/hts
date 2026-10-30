import { useState } from 'react';
import { Collapse, Pagination, Space, Spin, Tag, Typography } from 'antd';
import { useWork } from '../../hooks/useWork';
import { PAGE_SIZE_OPTIONS } from '../../hooks/useUrlPagination';
import { WorkListView } from './WorkListView';
import { QueryErrorState } from '../common/QueryErrorState';

const WorkPersonAssignments = ({ person, params, ...actions }) => {
  const [requestedPage, setPage] = useState(1);
  const limit = 5;
  const maxPage = Math.max(1, Math.ceil(Number(person.total || 0) / limit));
  const page = Math.min(requestedPage, maxPage);
  const query = useWork('given', { ...params, groupBy: undefined, assigneeId: person.id, page, limit }, { enabled: page > 1 });
  const rows = page === 1 ? person.assignments : query.data?.items;
  const items = Array.isArray(rows) ? rows : [];
  return <div className="work-given-person-works">
    {page > 1 && query.isPending ? <Spin description="Đang tải công việc"><div style={{ minHeight: 80 }} /></Spin> : page > 1 && query.isError
      ? <QueryErrorState error={query.error} onRetry={query.refetch} retrying={query.isFetching} />
      : <WorkListView items={items} mode="given" hideAssignee {...actions} />}
    {Number(person.total || 0) > limit ? <Pagination aria-label={`Trang công việc của ${person.name}`} current={page} pageSize={limit} total={Number(person.total)} showSizeChanger={false}
      onChange={setPage} showTotal={(count, range) => `${range[0]}–${range[1]} / ${count} việc`} /> : null}
  </div>;
};

export const WorkGivenGroups = ({ items = [], params, pagination = {}, ...actions }) => {
  const people = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!people.length) return null;
  return <div className="work-given-groups">
    <Collapse accordion destroyOnHidden defaultActiveKey={people[0]?.id} className="glass-card"
      items={people.map(person => ({
        key: person.id,
        label: <Space wrap size={[8, 4]}>
          <Typography.Text strong>{person.name || 'Người thực hiện'}</Typography.Text>
          {Number(person.assigned || 0) > 0 ? <Tag color="blue">Chưa xong: {Number(person.assigned)}</Tag> : null}
          {Number(person.completed || 0) > 0 ? <Tag color="green">Đã xong: {Number(person.completed)}</Tag> : null}
        </Space>,
        children: <WorkPersonAssignments person={person} params={params} {...actions} />,
      }))} />
    {pagination?.total > PAGE_SIZE_OPTIONS[0] ? <Pagination aria-label="Trang người nhận việc" current={pagination.page} pageSize={pagination.pageSize} total={pagination.total} showSizeChanger
      pageSizeOptions={PAGE_SIZE_OPTIONS} onChange={pagination.onChange} showTotal={count => `${count} người`} /> : null}
  </div>;
};

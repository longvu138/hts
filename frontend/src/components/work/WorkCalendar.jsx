import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Alert, Button, Card, Collapse, Empty, Pagination, Table } from 'antd';
import { CheckOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { calendarRows, isWeekend } from '../../utils/workCalendar';
import { nowInput, shortTimeRange, today } from '../../utils/workTime';
import { workPartActions, workPartTitle } from '../../utils/workParts';


const CalendarTask = ({ item, userId, onOpen, onComplete }) => {
  const title = workPartTitle(item);
  const time = shortTimeRange(item.startsAt, item.endsAt);
  const canComplete = Boolean(userId && onComplete && workPartActions(item, { userId }).complete);
  return <div className="work-calendar-entry">
    <button type="button" className="work-calendar-task" onClick={() => onOpen(item)} aria-label={`Chi tiết: ${title}`}>
      <strong className="work-calendar-title" title={title}>{item.status === 'completed' ? <CheckOutlined className="work-calendar-done" role="img" aria-label="Đã hoàn thành" /> : null}{title}</strong>
      <span className="work-calendar-meta">
        <span className="work-calendar-time">{time}</span>
        {item.place ? <span className="work-calendar-place" title={item.place}>Địa điểm: {item.place}</span> : null}
      </span>
    </button>
    {canComplete ? <Button type="primary" size="small" icon={<CheckOutlined aria-hidden />} className="work-calendar-complete"
      aria-label={`Hoàn thành: ${title}`} onClick={() => onComplete(item)}>Hoàn thành</Button> : null}
  </div>;
};

const periodKey = (personId, day, key) => JSON.stringify([personId, day, key]);

// Expansion is controlled by the calendar so the bulk action also works on phones.
const CalendarPeriod = ({ person, day, period, userId, onOpen, onComplete, expanded, onExpand }) => {
  const key = periodKey(person.id, day, period.key);
  const items = Array.isArray(period.items) ? period.items : [];
  const open = items.length > 0 && expanded.has(key);
  return <section className="work-calendar-period" aria-label={`${period.label} của ${person.name} ngày ${day}`}>
    <Collapse ghost destroyOnHidden activeKey={open ? [key] : []} onChange={keys => {
      const nextOpen = Array.isArray(keys) ? keys.length > 0 : Boolean(keys);
      onExpand(key, nextOpen);
    }} items={[{
      key,
      label: `${period.label} · ${items.length ? `${items.length} việc` : 'Trống'}`,
      collapsible: items.length ? undefined : 'disabled',
      children: <div className="work-calendar-period-list">{items.map(item => <CalendarTask key={item.id} item={item} userId={userId} onOpen={onOpen} onComplete={onComplete} />)}</div>,
    }]} />
  </section>;
};

export const WorkCalendar = ({ items = [], days = [], actionsContainer, date, mobile, showWeekend = false, canAssign, userId, emptyText, onAction, onCreate, onOpen, pagination }) => {
  const [expansion, setExpansion] = useState(null);
  const [showFree, setShowFree] = useState(false);
  const calendarRef = useRef(null);
  const shownDays = mobile || showWeekend || isWeekend(date) ? days : days.slice(0, 5);
  // Periods per person × day are computed once per data change, not on every render.
  // Keyed by the day list's content: the page rebuilds the array on every render.
  const dayKey = shownDays.join(',');
  const { busy, free, periods } = useMemo(() => calendarRows(items, dayKey ? dayKey.split(',') : []), [items, dayKey]);
  const people = showFree ? [...busy, ...free] : busy;
  const scope = `${mobile}:${date}:${dayKey}`;
  const allKeys = people.flatMap(person => shownDays.flatMap(day =>
    (periods.get(person.id)?.[day] || []).map(period => periodKey(person.id, day, period.key))));
  const currentPeriod = Number(nowInput().slice(11, 13)) < 12 ? 'morning' : 'afternoon';
  const defaultKeys = mobile && date === today() ? people.flatMap(person =>
    (periods.get(person.id)?.[date] || []).filter(period => period.key === currentPeriod)
      .map(period => periodKey(person.id, date, period.key))) : [];
  const active = expansion?.scope === scope ? expansion : { scope, keys: new Set(defaultKeys), bulk: false };
  const allOpen = allKeys.length > 0 && allKeys.every(key => active.keys.has(key));
  const togglePeriod = (key, open) => setExpansion(previous => {
    const current = previous?.scope === scope ? previous : active;
    const keys = mobile || current.bulk ? new Set(current.keys) : new Set();
    if (open) keys.add(key); else keys.delete(key);
    return { scope, keys, bulk: current.bulk };
  });

  const hasTable = !mobile && people.length > 0;
  useEffect(() => {
    if (!hasTable) return;
    const body = calendarRef.current?.querySelector('.ant-table-body');
    const header = calendarRef.current?.querySelector(`[data-calendar-day="${date}"]`);
    if (body && header) body.scrollLeft = Math.max(0, header.offsetLeft - 150);
  }, [date, dayKey, mobile, hasTable]);

  const openItem = item => onOpen(item.workId);
  const completeItem = onAction ? item => onAction('complete', item) : undefined;
  const periodProps = { userId, onOpen: openItem, onComplete: completeItem, expanded: active.keys, onExpand: togglePeriod };
  const assignButton = (person, day) => canAssign && person.canAssign
    ? <Button icon={<PlusOutlined />} size="small" className="work-calendar-add" onClick={() => onCreate(person, day)} aria-label={`Giao việc cho ${person.name} ngày ${day}`} title="Giao việc">{mobile ? 'Giao việc' : null}</Button> : null;
  // Both periods stay visible; empty ones show Trống and cannot expand.
  const renderDay = (person, day) => (
    <div className="work-calendar-cell">
      {[{ key: 'morning', label: 'Sáng' }, { key: 'afternoon', label: 'Chiều' }].map(slot => {
        const period = (periods.get(person.id)?.[day] || []).find(value => value.key === slot.key) || { ...slot, items: [] };
        const shown = mobile ? { ...period, items: [...period.items].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)) } : period;
        return <CalendarPeriod key={`${mobile}-${day}-${slot.key}`} person={person} day={day} period={shown} {...periodProps} />;
      })}
      {!mobile ? assignButton(person, day) : null}
    </div>
  );
  const freeToggle = free.length ? <Button block type="dashed" className="work-calendar-free-toggle" aria-expanded={showFree} onClick={() => setShowFree(value => !value)}>
    {showFree ? `Ẩn ${free.length} người chưa có lịch` : `Chưa có lịch${mobile ? ' trong ngày' : ' trong tuần'}: ${free.length} người · Hiện`}
  </Button> : null;
  // One empty message, under the date toolbar: nobody matched, or nobody has work on the shown days.
  const empty = !busy.length && !showFree ? (
    <Card className="glass-card">
      <Empty description={!free.length ? emptyText : mobile ? 'Chưa có công việc trong ngày này.' : 'Chưa có công việc trong tuần này.'} />
    </Card>
  ) : null;
  const bulkControl = allKeys.length ? <div className="work-calendar-bulk-actions"><Button aria-expanded={allOpen}
    onClick={() => setExpansion({ scope, keys: new Set(allOpen ? [] : allKeys), bulk: !allOpen })}>
    {allOpen ? 'Thu gọn tất cả' : 'Mở tất cả'}
  </Button></div> : null;
  return <div className="work-calendar" ref={calendarRef}>
    {actionsContainer ? createPortal(bulkControl, actionsContainer) : bulkControl}
    {people.some(person => person.scheduleTruncated) ? <Alert type="warning" showIcon title="Lịch có nhiều công việc. Hãy lọc theo người hoặc đơn vị để xem đầy đủ." /> : null}
    {empty}
    {!people.length ? null : mobile ? <div className="mobile-card-list work-calendar-people">
      {people.map(person => <Card size="small" className="glass-card work-calendar-person" key={person.id}>
        <div className="work-calendar-person-header"><strong>{person.name}</strong>{assignButton(person, date)}</div>
        {renderDay(person, date)}
      </Card>)}
    </div> : <Table className="work-calendar-table" tableLayout="fixed" rowKey="id" dataSource={people} pagination={false} size="small" bordered scroll={{ x: shownDays.length * 200 + 150, y: 'calc(100dvh - 350px)' }} columns={[
      { title: 'Người thực hiện', key: 'person', width: 150, fixed: 'left', render: (_, person) => <strong>{person.name}</strong> },
      ...shownDays.map((day, i) => ({ title: <div className="work-calendar-day-heading"><span>{i === 6 ? 'Chủ nhật' : `Thứ ${i + 2}`} · {dayjs(day).format('DD/MM')}</span>{day === today() ? <span className="work-calendar-today-label">Hôm nay</span> : null}</div>, key: day, width: 200, onHeaderCell: () => ({ 'data-calendar-day': day }), className: day === today() ? 'work-calendar-today' : '', render: (_, person) => renderDay(person, day) })),
    ]} />}
    {freeToggle}
    {pagination?.total > pagination?.pageSize ? <Pagination current={pagination.page} pageSize={pagination.pageSize} total={pagination.total} showSizeChanger={false} onChange={pagination.onChange} showTotal={total => `${total} người`} /> : null}
  </div>;
};

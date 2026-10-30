import dayjs from 'dayjs';
import { dayEnd, dayStart, nextDate, weekStart } from './workTime.js';

export const isWeekend = date => [0, 6].includes(dayjs(date).day());

export const scheduleDays = (date, mobile) => {
  if (mobile) return [date];
  const monday = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => nextDate(monday, i));
};

export const assignmentsOnDay = (assignments, date) => (Array.isArray(assignments) ? assignments : [])
  .filter(item => item && Date.parse(item.startsAt) < Date.parse(dayEnd(date)) && Date.parse(item.endsAt) > Date.parse(dayStart(date)))
  .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

export const calendarRange = days => ({ from: dayStart(days[0]), to: dayEnd(days.at(-1)) });

export const createdIsOnCalendar = (body, days, people, place = '') => {
  const rows = Array.isArray(people) ? people : [];
  const segments = Array.isArray(body?.segments) ? body.segments : [];
  const range = calendarRange(days);
  return segments.length > 0 && segments.every(segment =>
    Date.parse(segment.startsAt) < Date.parse(range.to) && Date.parse(segment.endsAt) > Date.parse(range.from)
    && String(segment.place || '').toLocaleLowerCase('vi').includes(place.trim().toLocaleLowerCase('vi'))
    && Array.isArray(segment.assigneeIds) && segment.assigneeIds.length > 0
    && segment.assigneeIds.every(id => rows.some(person => person.id === id && !person.scheduleTruncated)));
};

// The weekly calendar shows only the first two items of each period, so unfinished work goes first;
// otherwise a completed early meeting would hide a pending task behind "Xem thêm".
const pendingFirst = (a, b) => Number(a.status !== 'assigned') - Number(b.status !== 'assigned');

// Work crossing noon is listed once, under the morning, with its full time range on the chip.
export const assignmentsByPeriod = (assignments, date) => {
  const items = assignmentsOnDay(assignments, date).sort(pendingFirst);
  const noon = Date.parse(`${date}T12:00:00+07:00`);
  return [
    { key: 'morning', label: 'Sáng', items: items.filter(item => Date.parse(item.startsAt) < noon) },
    { key: 'afternoon', label: 'Chiều', items: items.filter(item => Date.parse(item.startsAt) >= noon) },
  ];
};

// One pass over the shown people: non-empty periods per person × day, and the busy/free split.
// People with nothing on the shown days are collapsed into one "Chưa có lịch" row.
export const calendarRows = (people, days) => {
  const busy = [];
  const free = [];
  const periods = new Map();
  for (const person of Array.isArray(people) ? people : []) {
    if (!person) continue;
    const byDay = Object.fromEntries((Array.isArray(days) ? days : []).map(day => [day, assignmentsByPeriod(person.assignments, day).filter(period => period.items.length)]));
    periods.set(person.id, byDay);
    (Object.values(byDay).some(list => list.length) ? busy : free).push(person);
  }
  return { busy, free, periods };
};

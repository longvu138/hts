import { Typography } from "antd";
import { timeRangeParts } from "../../utils/workTime";

// hideDay: the list shows a single day, so repeating the date on every row is noise.
export const WorkTimeRange = ({ startsAt, endsAt, inline = false, hideDay = false }) => {
  const parts = timeRangeParts(startsAt, endsAt);
  if (!parts) return "—";
  if (inline) return <span className="work-time-range">{hideDay ? parts.time : `${parts.time} · ${parts.day}`}</span>;
  if (hideDay) return <Typography.Text strong className="work-time-range">{parts.time}</Typography.Text>;
  return (
    <>
      <Typography.Text strong className="work-time-range">{parts.time}</Typography.Text>
      <span className="work-caption">{parts.day}</span>
    </>
  );
};

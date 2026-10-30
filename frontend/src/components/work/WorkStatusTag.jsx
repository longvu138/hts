import { Tag } from "antd";
import { WORK_FORWARDED_LABEL, WORK_SITUATION_STATUS, WORK_STATUS } from "../../constants/workOptions";

export const WorkStatusTag = ({ status, forwarded = false, situation = false }) => {
  const option = (situation ? WORK_SITUATION_STATUS : WORK_STATUS)[status];
  return (
    <Tag color={option?.color || "default"}>
      {forwarded ? WORK_FORWARDED_LABEL : option?.label || status || "—"}
    </Tag>
  );
};

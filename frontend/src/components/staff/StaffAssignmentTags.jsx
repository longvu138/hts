import { Space, Tag } from "antd";

export const StaffAssignmentTags = ({ assignments = [], roleLabelByName = new Map(), roleById = new Map() }) => {
  const active = (Array.isArray(assignments) ? assignments : []).filter((assignment) => assignment?.isActive);
  if (!active.length) return <Tag>Chưa gán</Tag>;
  return <Space wrap size={[4, 4]}>{active.map((assignment) => (
    <Tag key={assignment.id} color="blue">{assignment.roleLabel || roleLabelByName.get(assignment.roleName || roleById.get(assignment.roleId)?.name) || assignment.roleName}</Tag>
  ))}</Space>;
};

import { workPartTitle } from "../../utils/workParts";

// The work title opens the detail drawer, replacing a separate "Chi tiết" button on every row/card.
export const WorkTitleButton = ({ item, onOpen, className = "work-title" }) => {
  const title = workPartTitle(item);
  if (!onOpen) return <span className={className}>{title}</span>;
  return (
    <button type="button" className={`${className} work-title-link`} aria-label={`Chi tiết: ${title}`} onClick={() => onOpen(item.workId)}>
      {title}
    </button>
  );
};

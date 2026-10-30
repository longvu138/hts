import { useState } from "react";
import { Badge, Button, Card, Drawer, Segmented, Select } from "antd";
import { ClearOutlined, FilterOutlined, SearchOutlined } from "@ant-design/icons";
import { WORK_DESKTOP_MEDIA_QUERY, WORK_STATUS, WORK_VIEWS } from "../../constants/workOptions";
import { useIsMobile, useMediaQuery } from "../../hooks/useMediaQuery";
import { activeWorkFilterCount } from "../../utils/workFilters";
import { WorkDateStrip } from "./WorkDateStrip";
import { WorkTextFilter } from "./WorkTextFilter";

const personLabel = (person) => person.name;
const STATUS_OPTIONS = [
  { value: "all", label: "Tất cả trạng thái" },
  ...Object.entries(WORK_STATUS).map(([value, option]) => ({ value, label: option.label })),
];

const Field = ({ id, label, children }) => (
  <div className="work-filter-field">
    <label htmlFor={id}>{label}</label>
    {children}
  </div>
);

// Person filter shared by "Lịch đơn vị" (toolbar) and "Việc tôi đã giao" (Lọc thêm).
// The option list is loaded only once the select is opened or searched (lookups.onPeopleOpen).
const PeopleSelect = ({ id, size, value, people, lookups, onChange }) => (
  <Field id={id} label="Người thực hiện">
    <Select
      id={id}
      aria-label="Người thực hiện"
      size={size}
      virtual={false}
      showSearch={{ filterOption: false, onSearch: (text) => { lookups.onPeopleOpen?.(true); lookups.onPeopleSearch?.(text); } }}
      onOpenChange={(open) => { if (open) lookups.onPeopleOpen?.(true); }}
      loading={lookups.peopleLoading}
      value={value || "all"}
      onChange={(next) => { lookups.onPeopleSearch?.(""); onChange(next === "all" ? undefined : next); }}
      options={[{ value: "all", label: "Tất cả người thực hiện" }, ...people.map((person) => ({ value: person.id, label: personLabel(person) }))]}
    />
  </Field>
);

// filters: values read from the URL; onChange(patch, { replace }) writes them back.
export const WorkFilters = ({
  filters,
  calendarDays = [],
  showWeekend = false,
  onWeekendChange,
  access = {},
  lookups = {},
  onChange,
  onModeChange,
  onReset,
}) => {
  const desktop = useMediaQuery(WORK_DESKTOP_MEDIA_QUERY);
  const phone = useIsMobile();
  const { mode, q, status, place, assigneeId, departmentId } = filters;
  const activeCount = activeWorkFilterCount({ ...filters, q: "" });
  const [moreOpen, setMoreOpen] = useState(false);
  const people = Array.isArray(lookups.people) ? lookups.people : [];
  const departments = Array.isArray(lookups.departments) ? lookups.departments : [];
  const situation = mode === "situation";
  const views = WORK_VIEWS.filter((view) => (!view.requiresView || access.canView) && (!view.requiresAssign || access.canAssign));
  const set = (key) => (value) => onChange({ [key]: value, page: 1 });
  const searchLabel = "Tìm tên công việc";

  // All sizes use Segmented; desktop shows full labels and smaller screens show short labels.
  const viewField = views.length < 2 ? null : (
    <Segmented block={!desktop} size={phone ? 'middle' : 'large'} aria-label="Xem công việc" className="work-view-switch"
      value={mode} onChange={onModeChange}
      options={views.map(view => ({ value: view.value, label: desktop ? view.label : view.short, title: view.label }))} />
  );
  const size = desktop || phone ? undefined : "large";
  const peopleSelect = (id) => <PeopleSelect id={id} size={size} value={assigneeId} people={people} lookups={lookups} onChange={set("assigneeId")} />;
  const searchField = situation ? peopleSelect("work-person") : (
      <Field id="work-search" label={searchLabel}>
        <WorkTextFilter
          size={size}
          id="work-search"
          aria-label={searchLabel}
          prefix={<SearchOutlined aria-hidden />}
          placeholder="Nhập tên công việc…"
          allowClear
          value={q}
          onCommit={set("q")}
        />
      </Field>
  );
  const fields = (
    <>
      {situation ? (
        <Field id="work-place" label="Nơi làm việc">
          <WorkTextFilter size={size} id="work-place" placeholder="Nhập nơi làm việc…" allowClear value={place} onCommit={set("place")} />
        </Field>
      ) : (
        <Field id="work-status" label="Trạng thái">
          <Select
            size={size}
            id="work-status"
            virtual={false}
            value={status || "all"}
            onChange={(value) => set("status")(value === "all" ? undefined : value)}
            options={STATUS_OPTIONS}
          />
        </Field>
      )}
      {access.canFilterPeople && !situation ? peopleSelect("work-assignee") : null}
      {situation && access.canFilterDepartments ? (
        <Field id="work-department" label="Đơn vị">
          <Select
            size={size}
            id="work-department"
            virtual={false}
            showSearch={{ filterOption: false, onSearch: lookups.onDepartmentSearch }}
            loading={lookups.departmentsLoading}
            value={departmentId || "all"}
            onChange={value => { lookups.onPeopleSearch?.(""); onChange({ departmentId: value === "all" ? undefined : value, assigneeId: undefined, page: 1 }); }}
            options={[{ value: "all", label: "Tất cả đơn vị được xem" }, ...departments.map((item) => ({ value: item.id, label: item.name }))]}
          />
        </Field>
      ) : null}
    </>
  );
  const reset = (
    <Button icon={<ClearOutlined aria-hidden />} onClick={onReset}>
      Xóa bộ lọc
    </Button>
  );

  return (
    <Card className="glass-card work-filters">
      <div className="work-filter-bar">
        {viewField}
        <WorkDateStrip mode={mode} from={filters.from} to={filters.to} at={filters.at} onChange={(patch) => onChange({ ...patch, page: 1 })} calendarDays={calendarDays} showWeekend={showWeekend} onWeekendChange={onWeekendChange} />
      </div>
      {desktop ? (
        <div className={`work-filter-row work-filter-cols-${2 + (access.canFilterPeople ? 1 : 0) + (situation && access.canFilterDepartments ? 1 : 0)}`}>
          {searchField}
          {fields}
          <div className="work-filter-actions">{reset}</div>
        </div>
      ) : <>
        <div className="work-mobile-toolbar">
          <div className="work-mobile-search">{searchField}</div>
          <Badge count={activeCount} size="small">
            <Button size={phone ? 'middle' : 'large'} icon={<FilterOutlined aria-hidden />} aria-expanded={moreOpen} aria-controls="work-filter-more" onClick={() => setMoreOpen(true)}>
              {phone ? "Lọc" : "Lọc thêm"}
            </Button>
          </Badge>
        </div>
        <Drawer
          title="Bộ lọc công việc"
          placement={phone ? "bottom" : "right"}
          size={phone ? "80dvh" : 440}
          rootClassName="work-filter-drawer"
          className={phone ? "mobile-profile-sheet-drawer" : undefined}
          open={moreOpen && !desktop}
          onClose={() => setMoreOpen(false)}
          styles={{ body: { padding: 16, overflowY: "auto" }, footer: { padding: "12px 16px max(12px, env(safe-area-inset-bottom))" } }}
          footer={<div className="work-filter-sheet-actions">{reset}<Button type="primary" onClick={() => setMoreOpen(false)}>Xong</Button></div>}
        >
          <div id="work-filter-more" className="work-filter-sheet-fields">{fields}</div>
        </Drawer>
      </>}
    </Card>
  );
};

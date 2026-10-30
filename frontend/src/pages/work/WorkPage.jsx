import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { App as AntApp, Button, Card, Empty, Space, Spin, Tag, Typography } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { PERMISSIONS } from "../../constants/permissions";
import { WORK_VIEWS } from "../../constants/workOptions";
import { hasPermission } from "../../utils/permissions";
import { useWork, useWorkDepartments, useWorkRecipients } from "../../hooks/useWork";
import { PAGE_SIZE_OPTIONS } from "../../hooks/useUrlPagination";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { WorkCalendar } from "../../components/work/WorkCalendar";
import { calendarRange, createdIsOnCalendar, scheduleDays } from "../../utils/workCalendar";
import { WorkEditor } from "../../components/work/WorkEditor";
import { WorkGivenGroups } from "../../components/work/WorkGivenGroups";
import { WorkListView } from "../../components/work/WorkListView";
import { WorkActionModal } from "../../components/work/WorkActionModal";
import { WorkDetailDrawer } from "../../components/work/WorkDetailDrawer";
import { WorkFilters } from "../../components/work/WorkFilters";
import { QueryErrorState } from "../../components/common/QueryErrorState";
import { createdWorkIsHidden, lastPage, patchWorkFilters, readWorkFilters, workFilterDefaults, workQueryParams } from "../../utils/workFilters";
import "./work.css";

const { Text } = Typography;
const CLEARED_FILTERS = { q: "", status: undefined, place: "", departmentId: undefined, assigneeId: undefined };
const listOf = (query) => Array.isArray(query.data?.items) ? query.data.items : [];
// People already named in the loaded rows: schedule rows are people, list rows carry their assignee.
const peopleInRows = (rows, situation) => rows
  .map((row) => situation ? { id: row?.id, name: row?.name } : { id: row?.assigneeId, name: row?.assigneeName })
  .filter((person) => person.id && person.name);

export const WorkPage = ({ currentUser }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [departmentSearch, setDepartmentSearch] = useState("");
  const [peopleSearch, setPeopleSearch] = useState("");
  // The person filter options load only after its select is opened or searched.
  const [peopleOpened, setPeopleOpened] = useState(false);
  // Links may request the editor through state.openEditor; consume it once.
  const wantsEditor = location.state?.openEditor === "create";
  const [editor, setEditor] = useState(() => (wantsEditor && (hasPermission(currentUser, PERMISSIONS.WORK_ASSIGN)
    || hasPermission(currentUser, PERMISSIONS.WORK_SELF_CREATE)) ? { action: "create" } : null));
  const { notification } = AntApp.useApp();
  const canAssign = hasPermission(currentUser, PERMISSIONS.WORK_ASSIGN);
  const canSelf = hasPermission(currentUser, PERMISSIONS.WORK_SELF_CREATE);
  const canView = hasPermission(currentUser, PERMISSIONS.WORK_SCHEDULE_VIEW);
  const canCreate = canAssign || canSelf;
  const mobile = useIsMobile();
  const [calendarActions, setCalendarActions] = useState(null);
  const [showWeekend, setShowWeekend] = useState(false);
  const effectiveParams = new URLSearchParams(searchParams);
  if (!effectiveParams.has("view") && canAssign && canView) effectiveParams.set("view", "situation");
  const filters = readWorkFilters(effectiveParams, {
    canView,
    canAssign,
    canPeople: canAssign || canView,
    defaults: workFilterDefaults(),
    pageSizes: PAGE_SIZE_OPTIONS,
  });
  const { mode, from: date, at, page, pageSize } = filters;
  useEffect(() => {
    if (searchParams.get("view") === "given" && !canAssign) {
      setSearchParams(previous => patchWorkFilters(previous, { view: "mine", assigneeId: undefined, page: 1 }), { replace: true });
    }
  }, [canAssign, searchParams, setSearchParams]);
  const situation = mode === "situation";
  const calendar = situation;
  useEffect(() => {
    if (!searchParams.has('layout')) return;
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      next.delete('layout');
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams]);
  const calendarDate = at.slice(0, 10);
  const days = scheduleDays(calendarDate, mobile);

  // Filter changes replace the history entry; opening a work item pushes one so Back closes it.
  // Base each patch on the live URL: router's functional update sees the render-time params, so two quick
  // edits (search then place) would otherwise overwrite each other.
  const patchFilters = (patch, push = false) => setSearchParams(
    () => {
      const next = patchWorkFilters(new URLSearchParams(window.location.search), patch, { defaultPageSize: PAGE_SIZE_OPTIONS[0] });
      if (patch.view === 'mine') next.set('view', 'mine');
      return next;
    },
    { replace: !push },
  );
  const changeMode = (value) => {
    let dates = {};
    if (value === "situation" && !situation) dates = { at: `${date}T${at.slice(11)}` };
    else if (situation && value !== "situation" && at.slice(0, 10) !== date) dates = { from: at.slice(0, 10), to: at.slice(0, 10) };
    patchFilters({ ...dates, ...CLEARED_FILTERS, view: value, page: 1 });
    setDepartmentSearch("");
    setPeopleSearch("");
    setPeopleOpened(false);
  };
  const openWork = (id) => patchFilters({ workId: id }, true);
  const closeWork = () => patchFilters({ workId: undefined });

  const canFilterPeople = mode === "given" && canAssign;
  const searchPeople = useDebouncedValue(peopleSearch.trim());
  const givenPeopleQuery = useWorkRecipients(canFilterPeople && peopleOpened, searchPeople, "given", undefined, currentUser.id);
  const departmentsQuery = useWorkDepartments(situation && canView, departmentSearch);
  // Use the unsearched scope count so searching one department never hides this control.
  const departmentScopeQuery = useWorkDepartments(situation && canView);
  const scopedDepartments = listOf(departmentScopeQuery);
  const canFilterDepartments = departmentScopeQuery.isSuccess
    && Math.max(Number(departmentScopeQuery.data?.pagination?.total || 0), scopedDepartments.length) > 1;
  useEffect(() => {
    if (!situation || !departmentScopeQuery.isSuccess || canFilterDepartments || !searchParams.has('departmentId')) return;
    setSearchParams(previous => patchWorkFilters(previous, { departmentId: undefined, page: 1 }), { replace: true });
  }, [situation, departmentScopeQuery.isSuccess, canFilterDepartments, searchParams, setSearchParams]);


  const debouncedQ = useDebouncedValue(filters.q.trim());
  const debouncedPlace = useDebouncedValue(filters.place.trim());
  const params = workQueryParams(filters, { q: debouncedQ, place: debouncedPlace, canFilterPeople });
  if (calendar) { delete params.at; Object.assign(params, calendarRange(days)); }
  if (mode === "given") params.groupBy = "assignee";
  const query = useWork(mode, params);
  const rows = listOf(query);
  // Person options for "Lịch đơn vị": only scope filters matter, so the date/time is left out and
  // changing the day does not refetch the list.
  const lookupParams = { departmentId: params.departmentId, q: searchPeople || undefined, page: 1, limit: 50, peopleOnly: 1 };
  const schedulePeopleQuery = useWork('situation', lookupParams, { enabled: situation && peopleOpened });
  const peopleQuery = situation ? schedulePeopleQuery : givenPeopleQuery;
  const people = listOf(peopleQuery);
  const knownPeople = [...people, ...((situation || canFilterPeople) ? peopleInRows(rows, situation || mode === "given") : [])];
  const needsSelectedPerson = (situation || canFilterPeople) && Boolean(filters.assigneeId) && !query.isPending
    && !knownPeople.some(person => person.id === filters.assigneeId);
  const givenSelectedQuery = useWorkRecipients(needsSelectedPerson && canFilterPeople, '', 'given', filters.assigneeId, currentUser.id);
  const scheduleSelectedQuery = useWork('situation', { ...lookupParams, q: undefined, assigneeId: filters.assigneeId }, { enabled: needsSelectedPerson && situation });
  const selectedPersonQuery = situation ? scheduleSelectedQuery : givenSelectedQuery;
  const filterPeople = [...new Map([...knownPeople, ...(needsSelectedPerson ? listOf(selectedPersonQuery) : [])].map(person => [person.id, person])).values()];

  const items = rows;
  const total = Number(query.data?.pagination?.total || 0);
  const unit = situation || mode === "given" ? "người" : "việc";

  // Clamp a stale/hand-edited page number to the last page that exists.
  const serverPages = Number(query.data?.pagination?.totalPages);
  const maxPage = Number.isInteger(serverPages) && serverPages > 0 ? serverPages : lastPage(total, pageSize);
  const pageTooFar = query.isSuccess && !query.isFetching && total > 0 && page > maxPage;
  useEffect(() => {
    if (pageTooFar) setSearchParams(() => patchWorkFilters(new URLSearchParams(window.location.search), { page: maxPage }), { replace: true });
  }, [pageTooFar, maxPage, setSearchParams]);

  const resetFilters = () => {
    const defaults = workFilterDefaults();
    patchFilters({ ...CLEARED_FILTERS, from: defaults.from, to: defaults.to, at: undefined, page: 1 });
    setDepartmentSearch("");
    setPeopleSearch("");
  };
  // One notice after creating: when the new work is filtered out, it carries the ways to see it.
  // Returning true tells the editor not to show its own toast.
  const onCreated = (saved) => {
    const hidden = calendar ? !createdIsOnCalendar(saved.body, days, items, filters.place) : createdWorkIsHidden(saved.body, filters, currentUser.id);
    if (!hidden) return false;
    const key = `work-created-${saved.workId}`;
    const day = saved.body.segments[0].startsAt.slice(0, 10);
    const showInList = () => {
      notification.destroy(key);
      patchFilters({ ...CLEARED_FILTERS, view: saved.body.source === "self" ? "mine" : "given", from: day, to: day, at: undefined, layout: undefined, page: 1, workId: undefined });
    };
    notification.success({
      key,
      title: saved.message,
      description: "Việc nằm ngoài bộ lọc đang xem.",
      placement: "topRight",
      duration: 8,
      actions: (
        <Space>
          <Button size="small" type="primary" onClick={() => { notification.destroy(key); openWork(saved.workId); }}>Xem việc</Button>
          <Button size="small" onClick={showInList}>Hiện trong danh sách</Button>
        </Space>
      ),
    });
    return true;
  };
  const openCreate = () => setEditor({ action: "create" });
  // Clear the one-shot state so refresh/Back does not reopen the editor.
  useEffect(() => {
    if (wantsEditor) navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
  }, [wantsEditor, navigate, location.pathname, location.search]);
  const onAction = (action, item) => setEditor({ action, item });
  const createLabel = canAssign ? "Giao việc" : "Tạo việc";
  const viewLabel = WORK_VIEWS.find((view) => view.value === mode)?.label;

  const emptyState = (
    <Card className="glass-card">
      <Empty
        description={situation
          ? "Không tìm thấy người trong phạm vi hoặc bộ lọc đang chọn."
          : filters.from === filters.to ? "Chưa có công việc trong ngày đã chọn." : "Chưa có công việc trong khoảng ngày đã chọn."}
      >
        {!situation && canCreate ? <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={openCreate}>{createLabel}</Button> : null}
      </Empty>
    </Card>
  );

  return (
    <div className={`resource-page work-page${calendar ? " work-calendar-page" : ""}${canCreate ? " work-page-can-create" : ""}`}>
      <WorkFilters
        calendarDays={days}
        showWeekend={showWeekend}
        onWeekendChange={setShowWeekend}
        filters={filters}
        access={{ canView, canAssign, canFilterPeople, canFilterDepartments }}
        lookups={{
          people: filterPeople,
          peopleLoading: peopleQuery.isFetching || selectedPersonQuery.isFetching,
          onPeopleSearch: setPeopleSearch,
          onPeopleOpen: setPeopleOpened,
          departments: listOf(departmentsQuery),
          departmentsLoading: departmentsQuery.isFetching,
          onDepartmentSearch: setDepartmentSearch,
        }}
        onChange={(patch) => patchFilters(patch)}
        onModeChange={changeMode}
        onReset={resetFilters}
      />
      {(canFilterPeople || situation) && peopleQuery.isError ? (
        <QueryErrorState title="Không tải được người thực hiện" error={peopleQuery.error} onRetry={peopleQuery.refetch} retrying={peopleQuery.isFetching} />
      ) : null}
      {situation && departmentsQuery.isError ? (
        <QueryErrorState title="Không tải được danh sách đơn vị" error={departmentsQuery.error} onRetry={departmentsQuery.refetch} retrying={departmentsQuery.isFetching} />
      ) : null}
      <section className="work-results" aria-label={viewLabel}>
        <div className="work-results-heading">
          <Space wrap size={8}>
            {!query.isPending && !query.isError ? <Tag>{total} {unit}</Tag> : null}
            {mode === "given" && query.isSuccess ? <Tag>{Number(query.data?.pagination?.workTotal || 0)} việc</Tag> : null}
          </Space>
          {query.isFetching && !query.isPending ? <Text type="secondary" role="status"><Spin size="small" /> Đang cập nhật…</Text> : null}
          <div className="work-results-actions">
            <div ref={setCalendarActions} />
            {canCreate && !(mobile && (editor || searchParams.get('workId'))) ? <div className="work-create-action">
              <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={openCreate}>{createLabel}</Button>
            </div> : null}
          </div>
        </div>
        {query.isPending ? (
          <Spin description="Đang tải công việc"><div style={{ minHeight: 120 }} /></Spin>
        ) : query.isError ? (
          <QueryErrorState error={query.error} onRetry={query.refetch} retrying={query.isFetching} />
        ) : (
          <>
            {!items.length && !calendar ? emptyState : null}
            {calendar ? <WorkCalendar actionsContainer={calendarActions} items={items} days={days} date={calendarDate} mobile={mobile} showWeekend={showWeekend} canAssign={canAssign} userId={currentUser.id} onAction={onAction}
              emptyText="Không tìm thấy người trong phạm vi hoặc bộ lọc đang chọn."
                           onCreate={(person, day) => setEditor({ action: 'create', recipient: person, date: day })}
              onOpen={openWork}
              pagination={{ page, pageSize, total, onChange: nextPage => patchFilters({ page: nextPage }) }} /> : mode === "given" ? <WorkGivenGroups
              items={items} params={params} onOpen={openWork} onAction={onAction} userId={currentUser.id} canAssign={canAssign} canSelf={canSelf}
              singleDay={filters.from === filters.to}
              pagination={{ page, pageSize, total, onChange: (nextPage, nextSize) => patchFilters({ page: nextSize !== pageSize ? 1 : nextPage, pageSize: nextSize }) }} /> : <WorkListView
              items={items}
              mode={mode}
              onOpen={openWork}
              onAction={onAction}
              userId={currentUser.id}
              canAssign={canAssign}
              canSelf={canSelf}
              singleDay={!situation && filters.from === filters.to}
              pagination={{ page, pageSize, total, unit, onChange: (nextPage, nextSize) => patchFilters({ page: nextSize !== pageSize ? 1 : nextPage, pageSize: nextSize }) }}
            />}
          </>
        )}
      </section>
      {searchParams.get("workId") ? (
        <WorkDetailDrawer
          key={searchParams.get("workId")}
          workId={searchParams.get("workId")}
          currentUser={currentUser}
          canAssign={canAssign}
          canSelf={canSelf}
          onClose={closeWork}
          onAction={onAction}
        />
      ) : null}
      {editor && ["create", "edit", "transfer"].includes(editor.action) ? (
        <WorkEditor
          key={`${editor.action}-${editor.item?.id || ""}`}
          defaultDate={editor.date || (situation ? at.slice(0, 10) : date)}
          defaultRecipient={editor.recipient}
          onCreated={onCreated}
          mode={editor.action}
          item={editor.item}
          currentUser={currentUser}
          canAssign={canAssign}
          canSelf={canSelf}
          onClose={() => setEditor(null)}
        />
      ) : editor ? (
        <WorkActionModal action={editor.action} item={editor.item} onClose={() => setEditor(null)} />
      ) : null}
    </div>
  );
};

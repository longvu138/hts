import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Checkbox, Form, Input, Modal, Select, Space, Typography } from "antd";
import { useFeedback } from "../../hooks/useFeedback";
import { useWorkAvailability, useWorkMutation, useWorkRecipients } from "../../hooks/useWork";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useIsMobile } from "../../hooks/useMediaQuery";
import {
  conflictsWithin,
  hasPastWorkStart,
  defaultPeriodFor,
  errorScrollOptions,
  probeCovers,
  workAvailabilityBody,
  workBusyHints,
  workDayBusyBody,
  workDayProbeBody,
  workFormBody,
  workFormInitial,
} from "../../utils/workForm";
import { isWorkVersionConflict, workErrorCode, workErrorMessage } from "../../utils/workErrors";
import { workPartTitle } from "../../utils/workParts";
import { showTimeRange, today } from "../../utils/workTime";
import { WORK_ERROR_CODES, WORK_PERIODS } from "../../constants/workOptions";
import { WorkScheduleFields } from "./WorkScheduleFields";
import { WorkAvailability } from "./WorkAvailability";
import { QueryErrorState } from "../common/QueryErrorState";

const TITLES = { transfer: "Chuyển việc", edit: "Sửa công việc" };
const SUBMIT_LABELS = { transfer: "Chuyển việc", edit: "Lưu thay đổi" };
const TIME_FIELDS = ["period", "startTime", "endTime", "endDate", "overnight"];
const DETAIL_FIELDS = new Set(["name", "place", "date", ...TIME_FIELDS]);
const formSnapshot = values => JSON.stringify(Object.fromEntries(Object.entries(values || {}).sort(([a], [b]) => a.localeCompare(b))
  .map(([key, value]) => [key, Array.isArray(value) ? [...value].sort() : value])));
const personLabel = (person) => `${person.name}${person.departmentName ? ` · ${person.departmentName}` : ""}`;
const selfName = (user) => `${user.name || user.username || "Tôi"} (Tôi)`;
// Phones: the people list opens below the select inside the scrolling body instead of flipping up
// over the time presets.
const MOBILE_SELECT_PROPS = {
  getPopupContainer: (trigger) => trigger.parentElement || document.body,
  listHeight: 200,
  placement: "bottomLeft",
  builtinPlacements: { bottomLeft: { points: ["tl", "bl"], offset: [0, 4], overflow: { adjustX: true, adjustY: false }, htmlRegion: "scroll" } },
};

export const WorkEditor = ({
  mode = "create",
  defaultDate,
  defaultRecipient,
  onCreated,
  item,
  currentUser,
  canAssign,
  canSelf,
  onClose,
}) => {
  const [form] = Form.useForm();
  const feedback = useFeedback();
  const mobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [peopleOpen, setPeopleOpen] = useState(false);
  // Until the user picks a time, the default period may move to the first free preset.
  const [timeTouched, setTimeTouched] = useState(false);
  const mutation = useWorkMutation();
  const errorRef = useRef(null);
  const submitting = useRef(false);
  const userChanged = useRef(false);
  const baseline = useRef(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const markChanged = () => { userChanged.current = true; };
  const selfOnly = mode === "create" && !canAssign;
  const fixedPerson = mode === "edit";
  const transfer = mode === "transfer";
  // Forwarding keeps the part's time and place unless the user asks to change them.
  const [showDetails, setShowDetails] = useState(!transfer);
  const userId = currentUser.id;
  const recipientSearch = useDebouncedValue(search.trim());
  const recipientsQuery = useWorkRecipients(canAssign && !fixedPerson, recipientSearch, "assign", undefined, userId);
  const [selectedPeople, setSelectedPeople] = useState(() => defaultRecipient ? [defaultRecipient] : []);

  // Self-create starts today even when the work list is filtered to another day.
  const [startDate] = useState(() => selfOnly ? today() : defaultDate || today());
  const [pastConfirmation, setPastConfirmation] = useState(null);

  const recipients = useMemo(() => {
    const list = Array.isArray(recipientsQuery.data?.items) ? recipientsQuery.data.items : [];
    const map = new Map(selectedPeople.map((person) => [person.id, person]));
    for (const person of list) map.set(person.id, person);
    // Forwarding to yourself is not offered here; "Giữ một phần cho tôi" covers it explicitly.
    if (transfer) map.delete(userId);
    else if (canSelf) map.set(userId, { id: userId, name: selfName(currentUser) });
    return [...map.values()];
  }, [recipientsQuery.data, selectedPeople, canSelf, transfer, userId, currentUser]);

  useEffect(() => {
    if (mutation.isError) errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [mutation.isError]);

  const initial = {
    ...workFormInitial(item, userId, startDate, mode),
    ...(mode === "create" && canAssign ? { assigneeIds: defaultRecipient ? [defaultRecipient.id] : [] } : {}),
  };

  const watched = Form.useWatch([], form);
  useEffect(() => {
    if (!userChanged.current) baseline.current = formSnapshot(form.getFieldsValue(true));
  }, [form, watched]);
  const requestClose = () => {
    if (mutation.isPending || submitting.current) return;
    if (userChanged.current && formSnapshot(form.getFieldsValue(true)) !== baseline.current) setDiscardOpen(true);
    else onClose();
  };
  const context = { mode, item, userId, canSelf };
  const previewBody = workAvailabilityBody(watched, context);
  // New work on a preset: one 08:00–17:00 probe for the chosen people answers the preview and picks the default period.
  const probeBody = mode === "create" && !timeTouched && watched?.period !== "custom" && previewBody
    ? workDayProbeBody(watched.date, previewBody.segments[0].assigneeIds, previewBody.source)
    : null;
  const checkKey = JSON.stringify({ preview: previewBody, probe: probeBody });
  const debouncedKey = useDebouncedValue(checkKey);
  const debounced = useMemo(() => JSON.parse(debouncedKey), [debouncedKey]);
  const probe = useWorkAvailability(debounced.probe);
  const fromProbe = probeCovers(debounced.probe, debounced.preview) && !probe.data?.hasMore;
  const live = useWorkAvailability(fromProbe ? null : debounced.preview);
  const availability = fromProbe ? {
    isError: probe.isError,
    isPending: probe.isPending,
    isFetching: probe.isFetching,
    refetch: probe.refetch,
    data: probe.data ? { conflicts: conflictsWithin(probe.data.conflicts, debounced.preview.segments[0]), hasMore: false } : undefined,
  } : live;
  const checking = Boolean(previewBody) && (checkKey !== debouncedKey || availability.isPending || availability.isFetching);
  const hasConflicts = Boolean(availability.data?.conflicts?.length);
  const blocked = Boolean(previewBody) && (checking || availability.isError || hasConflicts);

  useEffect(() => {
    const segment = debounced.probe?.segments?.[0];
    if (timeTouched || !segment || !probe.data) return;
    const values = form.getFieldsValue(true);
    if (values.period === "custom" || values.date !== segment.startsAt.slice(0, 10)) return;
    const free = defaultPeriodFor(values.date, segment.assigneeIds, probe.data.conflicts);
    const preset = WORK_PERIODS.find((option) => option.value === free);
    if (preset && free !== values.period) {
      form.setFieldsValue({ period: free, startTime: preset.start, endTime: preset.end, endDate: values.date });
    }
  }, [timeTouched, debounced, probe.data, form]);

  // Busy hints in the people list: one whole-day lookup for the listed people while the list is open.
  const hintBody = peopleOpen && watched?.date
    ? workDayBusyBody(watched.date, recipients.map((person) => person.id).filter((id) => id !== userId), { mode, item })
    : null;
  const hintKey = useDebouncedValue(JSON.stringify(hintBody));
  const hintQuery = useWorkAvailability(useMemo(() => JSON.parse(hintKey), [hintKey]));
  const busyHints = useMemo(() => workBusyHints(hintQuery.data?.conflicts), [hintQuery.data]);

  const title = TITLES[mode] || (selfOnly ? "Tạo việc" : "Giao việc");
  const submitLabel = SUBMIT_LABELS[mode] || (selfOnly ? "Tạo việc" : "Giao việc");
  const personFixed = selfOnly ? "self" : fixedPerson ? "other" : undefined;
  const choosesPeople = !personFixed;
  const blockReason = mutation.isPending || !blocked ? null
    : checking ? "Đang kiểm tra lịch bận…"
      : availability.isError ? "Chưa kiểm tra được lịch bận"
        : "Còn trùng lịch";
  const needsPeople = choosesPeople && !(Array.isArray(watched?.assigneeIds) && watched.assigneeIds.length);
  const submitHint = blockReason || (needsPeople ? (transfer ? "Chọn người nhận" : "Chọn người thực hiện") : null);

  const removePerson = (id) => {
    markChanged();
    if (transfer && id === userId) {
      form.setFieldValue("keepForMe", false);
      return;
    }
    form.setFieldValue("assigneeIds", (form.getFieldValue("assigneeIds") || []).filter((value) => value !== id));
    setSelectedPeople((people) => people.filter((person) => person.id !== id));
  };

  const save = async (body) => {
    if (submitting.current) return;
    submitting.current = true;
    try {
      const count = body.segments[0].assigneeIds.length;
      const result = await mutation.mutateAsync({ action: mode, id: item?.id, body });
      if (mode === "create") {
        const message = body.source === "self" ? "Đã tạo việc cho bạn" : `Đã giao việc cho ${count} người`;
        // The page may show its own single notice (e.g. with "Xem việc" when the new work is filtered out).
        if (!onCreated?.({ ...result, body, message })) feedback.success(message);
      } else feedback.success(mode === "edit" ? "Đã cập nhật công việc" : `Đã chuyển việc cho ${count} người`);
      onClose();
    } catch (error) {
      if (mode === 'create' && !body.confirmPastStart && workErrorCode(error) === WORK_ERROR_CODES.PAST_CONFIRMATION_REQUIRED) {
        mutation.reset();
        setPastConfirmation(body);
      }
      // Keep entered values; other API errors are shown above the form.
    } finally {
      submitting.current = false;
    }
  };

  const submit = async (values) => {
    if (submitting.current) return;
    if (blocked) {
      if (checking) feedback.info("Đang kiểm tra lịch bận, vui lòng đợi trong giây lát");
      else if (availability.isError) feedback.warning("Chưa kiểm tra được lịch bận — bấm \"Kiểm tra lại lịch\" trước khi lưu");
      else feedback.warning("Khung giờ đang trùng lịch — hãy đổi thời gian hoặc người thực hiện");
      return;
    }
    const body = workFormBody(values, context);
    if (mode === 'create' && hasPastWorkStart(body)) { setPastConfirmation(body); return; }
    await save(body);
  };

  const peopleField = (
    <>
        {selfOnly || fixedPerson ? (
          <>
            <Form.Item name="assigneeIds" hidden><Select mode="multiple" /></Form.Item>
            <Typography.Paragraph>
              <strong>Người thực hiện: </strong>{fixedPerson ? item.assigneeName : selfName(currentUser)}
            </Typography.Paragraph>
          </>
        ) : (
          <>
            {recipientsQuery.isError ? (
              <QueryErrorState
                title="Không tải được danh sách người nhận"
                error={recipientsQuery.error}
                onRetry={recipientsQuery.refetch}
                retrying={recipientsQuery.isFetching}
              />
            ) : null}
            <Form.Item
              name="assigneeIds"
              label={transfer ? "Chuyển cho" : "Người thực hiện"}
              rules={[{ required: true, message: transfer ? "Vui lòng chọn người nhận chuyển việc" : "Vui lòng chọn người thực hiện" }]}
            >
              <Select
                mode="multiple"
                showSearch={{ filterOption: false, onSearch: setSearch }}
                loading={recipientsQuery.isFetching}
                placeholder="Chọn một hoặc nhiều người"
                onOpenChange={setPeopleOpen}
                options={recipients.map((person) => ({ value: person.id, label: personLabel(person) }))}
                optionRender={(option) => {
                  const hint = busyHints.get(option.value);
                  return (
                    <span className="work-person-option">
                      <span>{option.label}</span>
                      {hint ? <span className="work-person-busy"> · {hint}</span> : null}
                    </span>
                  );
                }}
                onChange={(ids) => setSelectedPeople(recipients.filter((person) => ids.includes(person.id)))}
                {...(mobile ? MOBILE_SELECT_PROPS : {})}
              />
            </Form.Item>
            {transfer ? (
              <Form.Item name="keepForMe" valuePropName="checked">
                <Checkbox>Giữ một phần cho tôi</Checkbox>
              </Form.Item>
            ) : null}
          </>
        )}
    </>
  );

  // Name, time and place. Forwarding keeps them mounted (so the original values are sent) but hidden by default.
  const details = (
    <>
      <Form.Item
        name="name"
        label="Tên công việc"
        rules={[
          { required: true, whitespace: true, message: "Vui lòng nhập tên công việc" },
          { max: mode === "create" ? 200 : 500, message: "Tên công việc quá dài" },
        ]}
      >
        <Input placeholder="Ví dụ: Kiểm tra hồ sơ khu A" maxLength={mode === "create" ? 200 : 500} />
      </Form.Item>
      {choosesPeople && !transfer ? peopleField : null}
      <WorkScheduleFields form={form} onUserChange={markChanged} />
      {mode === "create" && canAssign ? <WorkAvailability active={Boolean(previewBody)} checking={checking} query={availability} personFixed={personFixed} userId={userId} onRemovePerson={choosesPeople ? removePerson : undefined} /> : null}
      <Form.Item
        name="place"
        label="Địa điểm"
        rules={[
          { required: true, whitespace: true, message: "Vui lòng nhập địa điểm" },
          { max: 200, message: "Địa điểm tối đa 200 ký tự" },
        ]}
      >
        <Input maxLength={200} placeholder="Ví dụ: Khu A, tầng 2" />
      </Form.Item>
    </>
  );

  return (
    <>
    <Modal
      centered
      open
      title={title}
      width={640}
      className="work-modal"
      rootClassName="work-modal-root work-editor-root"
      onCancel={requestClose}
      mask={{ closable: false }}
      footer={(
        <div className="work-editor-footer">
          {submitHint ? <Typography.Text type="secondary" id="work-submit-hint" role="status" aria-live="polite" className="work-submit-hint">{submitHint}</Typography.Text> : null}
          <Space wrap>
            <Button disabled={mutation.isPending} onClick={requestClose}>Đóng</Button>
            <Button type="primary" aria-label={submitLabel} aria-describedby={submitHint ? "work-submit-hint" : undefined}
              loading={mutation.isPending} disabled={mutation.isPending || blocked || needsPeople} onClick={() => form.submit()}>
              {submitLabel}
            </Button>
          </Space>
        </div>
      )}
    >
      {isWorkVersionConflict(mutation.error) ? <Button onClick={requestClose} style={{ marginBottom: 12 }}>Đóng và tải lại công việc</Button> : null}
      {mutation.isError ? (
        <div ref={errorRef}>
          <Alert showIcon type="error" role="alert" title={workErrorMessage(mutation.error)} style={{ marginBottom: 16 }} />
        </div>
      ) : null}
      <Form
        form={form}
        layout="vertical"
        initialValues={initial}
        onFinish={submit}
        onValuesChange={(changed) => {
          markChanged();
          if (TIME_FIELDS.some((name) => Object.hasOwn(changed, name))) setTimeTouched(true);
        }}
        // Enter in a text field submits (footer button is outside the form), so a blocked save explains itself.
        onKeyDown={(event) => {
          const target = event.target;
          if (event.key !== "Enter" || event.nativeEvent.isComposing || target?.tagName !== "INPUT") return;
          if (target.closest(".ant-select, .ant-picker")) return;
          event.preventDefault();
          if (needsPeople) {
            void form.validateFields(['assigneeIds']).catch(() => {
              form.scrollToField('assigneeIds', errorScrollOptions());
            });
            return;
          }
          form.submit();
        }}
        onFinishFailed={({ errorFields }) => {
          const first = errorFields?.[0];
          if (!first) return;
          if (transfer && DETAIL_FIELDS.has(first.name?.[0])) setShowDetails(true);
          // Wait one frame so a just-revealed field can be scrolled to.
          requestAnimationFrame(() => form.scrollToField(first.name, errorScrollOptions()));
        }}
      >
        {transfer ? (
          <Typography.Paragraph strong>{workPartTitle(item)}</Typography.Paragraph>
        ) : mode === "edit" ? (
          <Typography.Paragraph type="secondary">
            Công việc chung: {item.title}. Tên bên dưới áp dụng cho phần việc này.
          </Typography.Paragraph>
        ) : null}
        {transfer ? null : details}
        {selfOnly || fixedPerson || transfer ? peopleField : null}
        {transfer ? (
          <Form.Item
            name="reason"
            label="Lý do chuyển việc"
            rules={[
              { required: true, whitespace: true, message: "Vui lòng nhập lý do chuyển" },
              { max: 1000 },
            ]}
          >
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={1000} />
          </Form.Item>
        ) : null}
        {!(mode === "create" && canAssign) ? <WorkAvailability
          active={Boolean(previewBody)}
          checking={checking}
          query={availability}
          personFixed={personFixed}
          userId={userId}
          onRemovePerson={choosesPeople ? removePerson : undefined}
        /> : null}
        {transfer ? (
          <>
            {!showDetails ? (
              <Button type="link" className="work-details-toggle" aria-expanded={false} aria-controls="work-transfer-details" onClick={() => setShowDetails(true)}>
                Đổi thời gian/địa điểm
              </Button>
            ) : null}
            <div id="work-transfer-details" hidden={!showDetails}>{details}</div>
          </>
        ) : null}
      </Form>
    </Modal>
    <Modal centered open={discardOpen} title="Bỏ nội dung đang nhập?" okText="Bỏ thay đổi" cancelText="Tiếp tục nhập"
      className="work-modal" rootClassName="work-modal-root" mask={{ closable: false }}
      okButtonProps={{ danger: true }} onCancel={() => setDiscardOpen(false)} onOk={onClose}>
      <Typography.Paragraph>Nội dung chưa lưu sẽ bị mất nếu bạn đóng form.</Typography.Paragraph>
    </Modal>
    <Modal centered open={Boolean(pastConfirmation)} title="Xác nhận tạo việc trong quá khứ" okText="Xác nhận tạo việc" cancelText="Quay lại sửa"
      className="work-modal" rootClassName="work-modal-root" mask={{ closable: false }}
      onCancel={() => setPastConfirmation(null)}
      onOk={() => { const body = pastConfirmation; setPastConfirmation(null); if (body) void save({ ...body, confirmPastStart: true }); }}>
      <Typography.Paragraph>Thời gian bắt đầu đã qua. Bạn có muốn tiếp tục tạo việc với thời gian đã chọn không?</Typography.Paragraph>
      {pastConfirmation?.segments.map((segment, index) => <Typography.Paragraph strong key={index}>{showTimeRange(segment.startsAt, segment.endsAt)} · Giờ Việt Nam</Typography.Paragraph>)}
      <Typography.Text type="secondary">Chọn “Quay lại sửa” để đổi thời gian. Hệ thống vẫn kiểm tra trùng lịch khi tạo việc.</Typography.Text>
    </Modal>
    </>
  );
};

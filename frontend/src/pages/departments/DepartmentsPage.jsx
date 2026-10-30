import { QueryErrorState } from "../../components/common/QueryErrorState";
import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Tree,
  TreeSelect,
  Typography,
} from "antd";
import { EditOutlined, PlusOutlined } from "@ant-design/icons";
import {
  useDepartmentTree,
  useSaveDepartment,
} from "../../hooks/useDepartments";
import { PERMISSIONS } from "../../constants/permissions";
import { useFeedback } from "../../hooks/useFeedback";
import { hasPermission } from "../../utils/permissions";

const { Text, Title } = Typography;

const DEPARTMENT_TYPE_OPTIONS = [
  { value: "van_phong", label: "Văn phòng" },
  { value: "cuc_vu", label: "Cục/Vụ" },
  { value: "phong", label: "Phòng" },
  { value: "to_nhom", label: "Tổ/Nhóm" },
];

const DEPARTMENT_TYPE_LABELS = DEPARTMENT_TYPE_OPTIONS.reduce(
  (labels, item) => ({ ...labels, [item.value]: item.label }),
  {},
);

const DEPARTMENT_TYPE_COLORS = {
  van_phong: "blue",
  cuc_vu: "purple",
  phong: "green",
  to_nhom: "cyan",
};

const flattenDepartments = (items = []) =>
  items.flatMap((item) => [item, ...flattenDepartments(item.children || [])]);

const getTreeKeys = (items = []) =>
  items.flatMap((item) => [item.id, ...getTreeKeys(item.children || [])]);

const toTreeSelectData = (items = [], excludedId = null) =>
  items
    .filter((item) => item.id !== excludedId)
    .map((item) => ({
      title: item.name,
      value: item.id,
      children: toTreeSelectData(item.children || [], excludedId),
    }));

const filterTree = (items = [], normalizedQuery = "") => {
  if (!normalizedQuery) return items;

  return items
    .map((item) => {
      const children = filterTree(item.children || [], normalizedQuery);
      const matched =
        item.name?.toLowerCase().includes(normalizedQuery) ||
        item.code?.toLowerCase().includes(normalizedQuery);
      if (!matched && children.length === 0) return null;
      return { ...item, children };
    })
    .filter(Boolean);
};

export const DepartmentsPage = ({ currentUser }) => {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const message = useFeedback();
  const canWrite = hasPermission(currentUser, PERMISSIONS.DEPARTMENT_MANAGE);

  const departmentsQuery = useDepartmentTree();

  const departmentTree = useMemo(
    () => departmentsQuery.departments,
    [departmentsQuery.departments],
  );

  const flatDepartments = useMemo(
    () => flattenDepartments(departmentTree),
    [departmentTree],
  );

  const filteredTree = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return filterTree(departmentTree, normalized);
  }, [departmentTree, query]);

  const allTreeKeys = useMemo(() => getTreeKeys(filteredTree), [filteredTree]);

  useEffect(() => {
    setExpandedKeys(allTreeKeys);
  }, [allTreeKeys]);

  const parentOptions = useMemo(
    () => toTreeSelectData(departmentTree, editing?.id),
    [departmentTree, editing?.id],
  );

  const saveMutation = useSaveDepartment({
    departmentId: editing?.id,
    onSuccess: () => {
      setOpen(false);
      setEditing(null);
      form.resetFields();
      message.success("Đã lưu phòng ban");
    },
    onError: (error) =>
      message.error(error.response?.data?.message || "Không lưu được phòng ban"),
  });

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue({
      isActive: true,
      type: "phong",
      sortOrder: flatDepartments.length + 1,
      parentId: undefined,
    });
    setOpen(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      sortOrder: record.sortOrder || 0,
      type: record.type || "phong",
    });
    setOpen(true);
  };

  const renderTypeTag = (type) => (
    <Tag color={DEPARTMENT_TYPE_COLORS[type] || "default"}>
      {DEPARTMENT_TYPE_LABELS[type] || type || "Phòng"}
    </Tag>
  );

  const renderDepartmentTitle = (department) => (
    <div className="department-tree-node">
      <div className="department-tree-main">
        <Text strong>{department.name}</Text>
        <Space size={6} wrap>
          <Text code>{department.code || "-"}</Text>
          {renderTypeTag(department.type)}
          <Tag color={department.isActive ? "green" : "default"}>
            {department.isActive ? "Hoạt động" : "Tắt"}
          </Tag>
          <Text type="secondary">Thứ tự {department.sortOrder ?? 0}</Text>
        </Space>
      </div>
      {canWrite ? (
        <Button
          size="small"
          icon={<EditOutlined />}
          onClick={(event) => {
            event.stopPropagation();
            openEdit(department);
          }}
        >
          Sửa
        </Button>
      ) : null}
    </div>
  );

  const treeData = filteredTree.map(function toNode(department) {
    return {
      key: department.id,
      title: renderDepartmentTitle(department),
      department,
      children: (department.children || []).map(toNode),
    };
  });

  return (
    <div className="resource-page">
      <div className="page-heading page-heading-row">
        <div>
          <Title level={4}>Phòng ban</Title>
          <Text type="secondary">
            {canWrite ? "Quản lý cây tổ chức dùng cho cán bộ và giao việc." : "Xem cây tổ chức dùng cho cán bộ và giao việc."}
          </Text>
        </div>
        <Space>
          <Input.Search
            placeholder="Tìm phòng ban"
            allowClear
            onSearch={setQuery}
            onChange={(event) => setQuery(event.target.value)}
          />
          {canWrite ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Thêm
            </Button>
          ) : null}
        </Space>
      </div>

      {departmentsQuery.isError ? <QueryErrorState error={departmentsQuery.error} onRetry={() => departmentsQuery.refetch()} retrying={departmentsQuery.isFetching} /> : <Card className="department-tree-card">
        <Spin spinning={departmentsQuery.isLoading}>
          {treeData.length > 0 ? (
            <Tree
              blockNode
              showLine
              expandedKeys={expandedKeys}
              selectable={canWrite}
              treeData={treeData}
              onExpand={setExpandedKeys}
              onSelect={(_, info) => {
                if (canWrite && info.node.department) {
                  openEdit(info.node.department);
                }
              }}
            />
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={query ? "Không có phòng ban phù hợp" : "Chưa có phòng ban"}
            />
          )}
        </Spin>
      </Card>}

      <Modal
        title={editing ? "Sửa phòng ban" : "Thêm phòng ban"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okText={editing ? "Lưu" : "Thêm phòng ban"}
        cancelText="Hủy bỏ"
        confirmLoading={saveMutation.isPending}
        centered
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ isActive: true, type: "phong", sortOrder: 0 }}
          onFinish={(values) => saveMutation.mutate(values)}
        >
          <Form.Item
            name="code"
            label="Mã phòng ban"
            rules={[{ required: true, message: "Vui lòng nhập mã phòng ban" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="name"
            label="Tên phòng ban"
            rules={[{ required: true, message: "Vui lòng nhập tên phòng ban" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="type" label="Loại đơn vị">
            <Select options={DEPARTMENT_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="parentId" label="Đơn vị cha">
            <TreeSelect
              key={parentOptions.length}
              allowClear
              showSearch
              treeDefaultExpandAll
              treeNodeFilterProp="title"
              placeholder="Chọn đơn vị cha"
              treeData={parentOptions}
            />
          </Form.Item>
          <Form.Item name="sortOrder" label="Thứ tự sắp xếp">
            <InputNumber min={0} className="full-width" />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="isActive" label="Hoạt động" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

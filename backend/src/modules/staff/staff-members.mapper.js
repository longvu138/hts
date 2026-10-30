const mapStaffMember = (staff) => ({
  id: staff.id,
  code: staff.code,
  username: staff.username,
  fullName: staff.full_name,
  position: staff.position,
  departmentId: staff.department_id,
  email: staff.email,
  phone: staff.phone,
  isActive: Boolean(staff.is_active),
  mustChangePassword: Boolean(staff.must_change_password),
  passwordChangedAt: staff.password_changed_at,
  passwordResetAt: staff.password_reset_at,
  lastLoginAt: staff.last_login_at,
  createdAt: staff.created_at,
  updatedAt: staff.updated_at,
});

module.exports = {
  mapStaffMember,
};

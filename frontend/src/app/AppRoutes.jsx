import { lazy } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { canAccessNavItem, getDefaultAuthenticatedPath } from "./navigation";

// Layout cũng tải lười để trang đăng nhập không phải tải sidebar, chuông thông báo và các component AntD của khung ứng dụng.
const AppLayout = lazy(() => import("../layouts/AppLayout").then((module) => ({ default: module.AppLayout })));
const WorkPage = lazy(() => import("../pages/work/WorkPage").then((module) => ({ default: module.WorkPage })));
const ChangePasswordPage = lazy(() => import("../pages/auth/ChangePasswordPage").then((module) => ({ default: module.ChangePasswordPage })));
const LoginPage = lazy(() => import("../pages/auth/LoginPage").then((module) => ({ default: module.LoginPage })));
const DepartmentsPage = lazy(() => import("../pages/departments/DepartmentsPage").then((module) => ({ default: module.DepartmentsPage })));
const StaffMembersPage = lazy(() => import("../pages/staff/StaffMembersPage").then((module) => ({ default: module.StaffMembersPage })));
const RolesPage = lazy(() => import("../pages/system/RolesPage").then((module) => ({ default: module.RolesPage })));

export const AppRoutes = ({
  currentUser,
  handleAuthenticated,
  handleLogout,
  handlePasswordChanged,
  refreshCurrentUser,
  themeMode,
  setThemeMode,
}) => {
  const navigate = useNavigate();
  return (
    <Routes>
      <Route
        path="/login"
        element={currentUser
          ? <Navigate to={currentUser.mustChangePassword ? "/change-password" : getDefaultAuthenticatedPath()} replace />
          : <LoginPage onAuthenticated={handleAuthenticated} />}
      />
      <Route
        path="/change-password"
        element={<ChangePasswordPage currentUser={currentUser} onPasswordChanged={handlePasswordChanged} onLogout={handleLogout} />}
      />
      <Route
        element={!currentUser
          ? <Navigate to="/login" replace />
          : currentUser.mustChangePassword
            ? <Navigate to="/change-password" replace />
            : (
              <AppLayout
                currentUser={currentUser}
                onLogin={() => navigate("/login")}
                onLogout={handleLogout}
                onChangePassword={() => navigate("/change-password")}
                themeMode={themeMode}
                onToggleTheme={() => setThemeMode((current) => current === "dark" ? "light" : "dark")}
              />
            )}
      >
        <Route index element={<Navigate to={getDefaultAuthenticatedPath()} replace />} />
        <Route
          path="departments"
          element={canAccessNavItem(currentUser, "departments")
            ? <DepartmentsPage currentUser={currentUser} />
            : <Navigate to={getDefaultAuthenticatedPath()} replace />}
        />
        <Route
          path="staff"
          element={canAccessNavItem(currentUser, "staff")
            ? <StaffMembersPage currentUser={currentUser} onCurrentUserRefresh={refreshCurrentUser} />
            : <Navigate to={getDefaultAuthenticatedPath()} replace />}
        />
        <Route
          path="system/roles"
          element={canAccessNavItem(currentUser, "roles")
            ? <RolesPage currentUser={currentUser} onPermissionsChanged={refreshCurrentUser} />
            : <Navigate to={getDefaultAuthenticatedPath()} replace />}
        />
        <Route path="work" element={<WorkPage currentUser={currentUser} />} />
        <Route path="*" element={<Navigate to={getDefaultAuthenticatedPath()} replace />} />
      </Route>
    </Routes>
  );
};


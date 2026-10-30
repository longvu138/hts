import { useStaffMembersPage } from "../../hooks/useStaffMembersPage";
import { StaffListView } from "../../components/staff/StaffListView";
import { StaffAccountModal } from "../../components/staff/StaffAccountModal";
import { StaffSessionsModal } from "../../components/staff/StaffSessionsModal";
import { StaffPasswordModal } from "../../components/staff/StaffPasswordModal";
export const StaffMembersPage = props => {
  const model = useStaffMembersPage(props);
  return <div className="resource-page">
      <StaffListView {...model.list} />

      <StaffAccountModal {...model.account} />

      <StaffSessionsModal {...model.sessions} />

      <StaffPasswordModal {...model.password} />
    </div>;
};

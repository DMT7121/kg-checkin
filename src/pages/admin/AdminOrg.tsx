import { useAppStore } from '../../store/useAppStore';
import { isAdminUser } from '../../utils/permissions';
import AdminSettingsUnified from './AdminSettingsUnified';

export default function AdminOrg() {
  const currentUser = useAppStore((s) => s.currentUser);
  if (!isAdminUser(currentUser)) return null;
  return <AdminSettingsUnified initialSection="org" />;
}

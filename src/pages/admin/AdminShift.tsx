import { useAppStore } from '../../store/useAppStore';
import { isAdminUser } from '../../utils/permissions';
import AdminSettingsUnified from './AdminSettingsUnified';

export default function AdminShift() {
  const currentUser = useAppStore((s) => s.currentUser);
  if (!isAdminUser(currentUser)) return null;
  return <AdminSettingsUnified initialSection="gps" />;
}

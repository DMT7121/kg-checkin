import { useAppStore } from '../store/useAppStore';
import { isAdminUser } from '../utils/permissions';
import AdminSettingsUnified from './admin/AdminSettingsUnified';

export default function Admin() {
  const currentUser = useAppStore((s) => s.currentUser);
  if (!isAdminUser(currentUser)) return null;
  return <AdminSettingsUnified initialSection="system" />;
}

import MonthlySalaryManager from '../../components/MonthlySalaryManager';
import { KgModuleHero } from '../../components/KgDesignSystem';
import { useAppStore } from '../../store/useAppStore';
import { isAdminUser } from '../../utils/permissions';

export default function AdminPayroll() {
  const currentUser = useAppStore((s) => s.currentUser);
  const users = useAppStore((s) => s.users);
  if (!isAdminUser(currentUser) || !currentUser) return null;

  return (
    <div className="p-4 space-y-4 animate-fade-in pb-24 md:pb-12 max-w-6xl mx-auto">
      <KgModuleHero
        moduleId="admin-payroll"
        title="Đơn Giá Lương & Hạn Mức Ứng"
        description="Khai báo mức lương theo giờ hoặc lương tháng chuẩn 30 ngày, duyệt đề nghị điều chỉnh và cấu hình hạn mức ứng lương."
        eyebrow="Nhân sự & Lương"
      />
      <MonthlySalaryManager currentUser={currentUser} users={users} />
    </div>
  );
}

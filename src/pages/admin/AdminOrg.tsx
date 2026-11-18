import React, { useState, useEffect } from 'react';
import { Building2, Shield, Network, UserPlus, Save, CheckCircle2, Loader2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { useAppStore } from '../../store/useAppStore';
import { isAdminUser } from '../../utils/permissions';
import { callApi } from '../../services/api';
import { KgModuleHero, KgBottomSheet, KgInput, KgButton } from '../../components/KgDesignSystem';


export default function AdminOrg() {
  const currentUser = useAppStore((s) => s.currentUser);
  if (!isAdminUser(currentUser)) return null;
  return <AdminOrgContent />;
}

function AdminOrgContent() {
  const serverOrgConfig = useAppStore((s) => s.serverOrgConfig);
  const currentUser = useAppStore((s) => s.currentUser);
  const setServerOrgConfig = useAppStore((s) => s.setServerOrgConfig);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);
  const [companyName, setCompanyName] = useState('King\'s Grill');
  const [companyAddress, setCompanyAddress] = useState('Dĩ An, Bình Dương');
  const [roles, setRoles] = useState<any[]>([
    { id: 'admin', name: 'Quản lý (Admin)', description: 'Toàn quyền truy cập Cấu hình', isDefault: true },
    { id: 'staff', name: 'Nhân viên (Staff)', description: 'Chỉ xem và thao tác cá nhân', isDefault: false }
  ]);
  const [orgStructure, setOrgStructure] = useState<any[]>([
    { id: 'probation', name: 'Thử việc', salaryMultiplier: 0.8 },
    { id: 'official', name: 'Chính thức', salaryMultiplier: 1.0 }
  ]);
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() => JSON.stringify({
    name: 'King\'s Grill',
    address: 'Dĩ An, Bình Dương',
    roles: [
      { id: 'admin', name: 'Quản lý (Admin)', description: 'Toàn quyền truy cập Cấu hình', isDefault: true },
      { id: 'staff', name: 'Nhân viên (Staff)', description: 'Chỉ xem và thao tác cá nhân', isDefault: false }
    ],
    orgStructure: [
      { id: 'probation', name: 'Thử việc', salaryMultiplier: 0.8 },
      { id: 'official', name: 'Chính thức', salaryMultiplier: 1.0 }
    ]
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [orgSheetMode, setOrgSheetMode] = useState<'role' | 'org' | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftSecondary, setDraftSecondary] = useState('');

  useEffect(() => {
    if (serverOrgConfig) {
      const nextName = serverOrgConfig.name || 'King\'s Grill';
      const nextAddress = serverOrgConfig.address || 'Dĩ An, Bình Dương';
      const nextRoles = serverOrgConfig.roles || [
        { id: 'admin', name: 'Quản lý (Admin)', description: 'Toàn quyền truy cập Cấu hình', isDefault: true },
        { id: 'staff', name: 'Nhân viên (Staff)', description: 'Chỉ xem và thao tác cá nhân', isDefault: false }
      ];
      const nextOrg = serverOrgConfig.orgStructure || [
        { id: 'probation', name: 'Thử việc', salaryMultiplier: 0.8 },
        { id: 'official', name: 'Chính thức', salaryMultiplier: 1.0 }
      ];
      setCompanyName(nextName);
      setCompanyAddress(nextAddress);
      if (serverOrgConfig.roles) setRoles(serverOrgConfig.roles);
      if (serverOrgConfig.orgStructure) setOrgStructure(serverOrgConfig.orgStructure);
      setSavedSnapshot(JSON.stringify({
        name: nextName,
        address: nextAddress,
        roles: nextRoles,
        orgStructure: nextOrg
      }));
    }
  }, [serverOrgConfig]);

  const currentSnapshot = JSON.stringify({
    name: companyName,
    address: companyAddress,
    roles,
    orgStructure
  });
  const isDirty = currentSnapshot !== savedSnapshot;

  const handleDiscardChanges = () => {
    try {
      const parsed = JSON.parse(savedSnapshot);
      setCompanyName(parsed.name || 'King\'s Grill');
      setCompanyAddress(parsed.address || 'Dĩ An, Bình Dương');
      setRoles(parsed.roles || []);
      setOrgStructure(parsed.orgStructure || []);
    } catch { /* ignore */ }
  };
  
  const handleSave = async () => {
    if (!currentUser) return;
    setIsSaving(true);
    
    try {
      const data = await callApi('UPDATE_ORG_CONFIG', {
        role: currentUser.role,
        name: companyName,
        address: companyAddress,
        roles,
        orgStructure,
      });

      if (!data) return;

      if (data.ok) {
        const nextConfig = { name: companyName, address: companyAddress, roles, orgStructure };
        setServerOrgConfig(nextConfig);
        setSavedSnapshot(JSON.stringify(nextConfig));
        Swal.fire({
          icon: 'success',
          title: 'Đã lưu cấu hình Tổ chức',
          text: 'Thông tin tổ chức đã được cập nhật thành công.',
          confirmButtonColor: '#0b253c'
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Lỗi lưu cấu hình',
          text: data.message || 'Lỗi không xác định',
          confirmButtonColor: '#dc2626'
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddRole = () => {
    setDraftName('');
    setDraftSecondary('');
    setOrgSheetMode('role');
  };

  const handleRemoveRole = (id: string) => {
    setRoles(roles.filter(r => r.id !== id));
  };

  const handleAddOrg = () => {
    setDraftName('');
    setDraftSecondary('1.0');
    setOrgSheetMode('org');
  };

  const handleConfirmOrgSheet = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draftName.trim();
    if (!trimmed) return;
    if (orgSheetMode === 'role') {
      setRoles([...roles, { id: 'role_' + Date.now(), name: trimmed, description: draftSecondary.trim(), isDefault: false }]);
    } else if (orgSheetMode === 'org') {
      setOrgStructure([...orgStructure, { id: 'org_' + Date.now(), name: trimmed, salaryMultiplier: parseFloat(draftSecondary) || 1 }]);
    }
    setOrgSheetMode(null);
  };

  const handleRemoveOrg = (id: string) => {
    setOrgStructure(orgStructure.filter(o => o.id !== id));
  };

  return (
    <div className="p-4 space-y-4 animate-slide-up pb-24 md:pb-12">
      <KgModuleHero
        moduleId="admin-org"
        title="Tổ chức & Quyền"
        description="Thiết lập doanh nghiệp, chức vụ, phòng ban và quản lý phân quyền thành viên."
        eyebrow="Cấu hình"
        tipTitle="Hướng dẫn Thiết lập Tổ chức & Quyền"
        tips={[
          "Thông tin doanh nghiệp: Cập nhật tên cơ sở, số hotline quản lý và địa chỉ nhà hàng.",
          "Cấu hình Zalo Bot: Kết nối Webhook và Group ID để gửi lịch làm việc, thông báo khẩn và duyệt đơn bổ sung công.",
          "Phân quyền vai trò: Admin (toàn quyền quản trị), Quản lý ca (duyệt công/lịch), Nhân viên (thao tác ca làm)."
        ]}
      />


      {/* Company Info */}
      <div className="soft3d-card p-5 rounded-2xl  ">
        <h3 className="font-bold mb-4 border-b dark:border-gray-700 pb-2 flex items-center text-gray-800 dark:text-white">
          <Building2 size={18} className="mr-2 text-ocean-600" /> Thông tin Doanh nghiệp
        </h3>
        
        <div className="space-y-3">
          <div>
            <label htmlFor="org-company-name" className="block text-xs font-bold text-gray-500 mb-1">Tên quán / Doanh nghiệp</label>
            <input id="org-company-name" type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500 dark:bg-gray-900 dark:border-gray-700 dark:text-white" />
          </div>
          <div>
            <label htmlFor="org-company-address" className="block text-xs font-bold text-gray-500 mb-1">Địa chỉ</label>
            <input id="org-company-address" type="text" value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500 dark:bg-gray-900 dark:border-gray-700 dark:text-white" />
          </div>
        </div>
      </div>

      {/* Roles & Permissions */}
      <div className="soft3d-card p-5 rounded-2xl  ">
        <h3 className="font-bold mb-4 border-b dark:border-gray-700 pb-2 flex items-center text-gray-800 dark:text-white">
          <Shield size={18} className="mr-2 text-ocean-600" /> Phân quyền (Roles)
        </h3>
        
        <div className="space-y-3">
          {roles.map((r, i) => (
            <div key={r.id} className={`p-3 rounded-xl border flex flex-wrap justify-between items-center gap-2 ${i === 0 ? 'bg-ocean-50 dark:bg-ocean-900/10 border-ocean-100 dark:border-ocean-800' : 'soft3d-bg border-gray-100 dark:border-gray-800'}`}>
              <div className="min-w-0 pr-2">
                <p className={`text-sm font-bold truncate ${i === 0 ? 'text-ocean-800 dark:text-ocean-400' : 'text-gray-800 dark:text-gray-200'}`}>{r.name}</p>
                <p className={`text-[10px] truncate ${i === 0 ? 'text-ocean-600' : 'text-gray-500'}`}>{r.description}</p>
              </div>
              {r.isDefault ? (
                <span className="text-[10px] bg-ocean-200 text-ocean-700 px-2.5 py-1 rounded-lg font-bold flex-shrink-0">Mặc định</span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleRemoveRole(r.id)}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold transition-colors flex-shrink-0"
                >
                  Xóa
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={handleAddRole} className="w-full min-h-[42px] border-2 border-dashed border-gray-200 text-gray-500 font-bold py-2.5 rounded-xl text-sm transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 flex items-center justify-center">
            + Thêm Role mới
          </button>
        </div>
      </div>

      {/* Organization Chart */}
      <div className="soft3d-card p-5 rounded-2xl  ">
        <h3 className="font-bold mb-4 border-b dark:border-gray-700 pb-2 flex items-center text-gray-800 dark:text-white">
          <Network size={18} className="mr-2 text-ocean-600" /> Cơ cấu tổ chức
        </h3>
        
        <div className="space-y-3">
          {orgStructure.map((org) => (
            <div key={org.id} className="flex flex-wrap items-center justify-between gap-2 p-3 soft3d-bg rounded-xl border border-gray-100 dark:border-gray-800">
              <div className="min-w-0 pr-2">
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">{org.name}</p>
                <p className="text-[10px] text-gray-500 font-mono tabular-nums truncate">Hệ số lương: {org.salaryMultiplier}</p>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveOrg(org.id)}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold transition-colors flex-shrink-0"
              >
                Xóa
              </button>
            </div>
          ))}
          <button type="button" onClick={handleAddOrg} className="w-full min-h-[44px] border-2 border-dashed border-gray-200 text-gray-500 font-bold py-2.5 rounded-lg text-sm transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 flex items-center justify-center mt-2">
            + Thêm Loại nhân sự
          </button>
        </div>
      </div>

      {/* Onboarding Automation */}
      <div className="soft3d-card p-5 rounded-2xl  ">
        <h3 className="font-bold mb-4 border-b dark:border-gray-700 pb-2 flex items-center text-gray-800 dark:text-white">
          <UserPlus size={18} className="mr-2 text-ocean-600" /> Quy trình Onboarding
        </h3>
        
        <div className="space-y-3">
          <div className="flex items-center space-x-3 text-sm text-gray-700 dark:text-gray-300">
            <CheckCircle2 size={16} className="text-green-500" />
            <span>Tự động tạo Checklist "Nhân viên mới"</span>
          </div>
          <div className="flex items-center space-x-3 text-sm text-gray-700 dark:text-gray-300">
            <CheckCircle2 size={16} className="text-green-500" />
            <span>Thông báo trên Bảng tin nội bộ</span>
          </div>
          <button
            type="button"
            onClick={() => setCurrentTab('admin_work')}
            className="min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-ocean-50 dark:bg-ocean-900/20 hover:bg-ocean-100 dark:hover:bg-ocean-900/35 border border-ocean-200 dark:border-ocean-800 text-ocean-700 dark:text-ocean-300 text-xs font-bold inline-flex items-center gap-1.5 mt-2 transition-colors"
          >
            Cấu hình chi tiết →
          </button>
        </div>
      </div>

      {/* Unified Sticky Save Bar */}
      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface)] p-3 shadow-lg">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold text-[var(--kg-text)] flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isDirty ? 'bg-[var(--kg-warning)]' : 'bg-[var(--kg-success)]'}`} />
            <span className="truncate">
              {isDirty ? 'Có thay đổi tổ chức & phân quyền chưa lưu' : 'Cấu hình tổ chức đã đồng bộ'}
            </span>
          </p>
          <p className="text-[11px] text-[var(--kg-text-muted)] font-mono tabular-nums mt-0.5 truncate">
            {roles.length} vai trò · {orgStructure.length} loại nhân sự
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isDirty && (
            <button
              type="button"
              onClick={handleDiscardChanges}
              disabled={isSaving}
              className="min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-xs font-bold text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] transition-colors disabled:opacity-50"
            >
              Hoàn tác
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white text-xs font-extrabold inline-flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <><Loader2 size={15} className="animate-spin" /> Đang lưu...</>
            ) : (
              <><Save size={15} /> Lưu cấu hình Tổ chức</>
            )}
          </button>
        </div>
      </div>

      <KgBottomSheet
        isOpen={orgSheetMode !== null}
        onClose={() => setOrgSheetMode(null)}
        title={orgSheetMode === 'role' ? 'Thêm vai trò phân quyền (Role)' : 'Thêm loại nhân sự mới'}
      >
        <form onSubmit={handleConfirmOrgSheet} className="space-y-4">
          <KgInput
            id="org-draft-name"
            label={orgSheetMode === 'role' ? 'Tên vai trò' : 'Tên loại nhân sự'}
            placeholder={orgSheetMode === 'role' ? 'VD: Trưởng ca' : 'VD: Part-time'}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            required
          />
          {orgSheetMode === 'role' ? (
            <KgInput
              id="org-draft-desc"
              label="Mô tả quyền hạn"
              placeholder="VD: Duyệt lịch và kiểm soát ca làm"
              value={draftSecondary}
              onChange={(e) => setDraftSecondary(e.target.value)}
            />
          ) : (
            <KgInput
              id="org-draft-multiplier"
              type="number"
              step="0.1"
              min="0.1"
              label="Hệ số lương"
              placeholder="VD: 1.0"
              value={draftSecondary}
              onChange={(e) => setDraftSecondary(e.target.value)}
              className="font-mono tabular-nums text-right"
              required
            />
          )}
          <div className="flex gap-2.5 pt-2">
            <KgButton type="button" variant="secondary" className="flex-1" onClick={() => setOrgSheetMode(null)}>
              Hủy
            </KgButton>
            <KgButton type="submit" variant="primary" className="flex-1" disabled={!draftName.trim()}>
              Thêm mới
            </KgButton>
          </div>
        </form>
      </KgBottomSheet>
    </div>
  );
}

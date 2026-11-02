import React, { useState, useEffect } from 'react';
import { Building2, Shield, Network, UserPlus, Save, CheckCircle2, Loader2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { useAppStore } from '../../store/useAppStore';
import { callApi } from '../../services/api';
import { KgModuleHero, KgBottomSheet, KgInput, KgButton } from '../../components/KgDesignSystem';


export default function AdminOrg() {
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
  const [isSaving, setIsSaving] = useState(false);
  const [orgSheetMode, setOrgSheetMode] = useState<'role' | 'org' | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftSecondary, setDraftSecondary] = useState('');

  useEffect(() => {
    if (serverOrgConfig) {
      setCompanyName(serverOrgConfig.name || 'King\'s Grill');
      setCompanyAddress(serverOrgConfig.address || 'Dĩ An, Bình Dương');
      if (serverOrgConfig.roles) setRoles(serverOrgConfig.roles);
      if (serverOrgConfig.orgStructure) setOrgStructure(serverOrgConfig.orgStructure);
    }
  }, [serverOrgConfig]);
  
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
      
      if (data && data.ok) {
        setServerOrgConfig({ name: companyName, address: companyAddress, roles, orgStructure });
        Swal.fire({
          icon: 'success',
          title: 'Đã lưu cấu hình Tổ chức',
          text: 'Thông tin tổ chức đã được cập nhật thành công.',
          confirmButtonColor: '#006994'
        });
      } else {
        throw new Error(data.message || 'Lỗi không xác định');
      }
    } catch (error: any) {
      Swal.fire({
        icon: 'error',
        title: 'Lỗi lưu cấu hình',
        text: error.message || 'Không thể kết nối đến máy chủ',
        confirmButtonColor: '#dc2626'
      });
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
    <div className="p-4 space-y-4 animate-slide-up pb-10">
      <div className="flex mb-2 -mt-2">
        <button onClick={() => setCurrentTab('admin_people')} className="flex items-center text-xs font-bold text-gray-500 hover:text-ocean-600 transition-colors">
          <span className="mr-1">←</span> Quay lại Cài đặt chung
        </button>
      </div>
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
          <button type="button" onClick={handleSave} disabled={isSaving} className={`w-full font-bold py-2.5 rounded-lg text-sm transition flex items-center justify-center mt-2 ${isSaving ? 'bg-ocean-400 text-white cursor-not-allowed' : 'bg-ocean-600 hover:bg-ocean-700 text-white'}`}>
            {isSaving ? (
              <><Loader2 size={16} className="animate-spin mr-2" /> Đang lưu...</>
            ) : (
              <><Save size={16} className="mr-2" /> Lưu Thông Tin</>
            )}
          </button>
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
                <span className="text-[10px] bg-ocean-200 text-ocean-700 px-2 py-1 rounded font-bold flex-shrink-0">Mặc định</span>
              ) : (
                <button onClick={() => handleRemoveRole(r.id)} className="text-red-500 text-xs font-bold px-2 py-1 hover:underline flex-shrink-0">Xóa</button>
              )}
            </div>
          ))}
          <button onClick={handleAddRole} className="w-full border-2 border-dashed border-gray-200 text-gray-500 font-bold py-2.5 rounded-lg text-sm transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 flex items-center justify-center">
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
              <button type="button" onClick={() => handleRemoveOrg(org.id)} className="text-red-500 text-xs font-bold px-2 py-1 hover:underline flex-shrink-0">Xóa</button>
            </div>
          ))}
          <button type="button" onClick={handleAddOrg} className="w-full border-2 border-dashed border-gray-200 text-gray-500 font-bold py-2.5 rounded-lg text-sm transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 flex items-center justify-center mt-2">
            + Thêm Loại nhân sự
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className={`w-full font-bold py-2.5 rounded-lg text-sm transition flex items-center justify-center mt-2 ${isSaving ? 'bg-ocean-400 text-white cursor-not-allowed' : 'bg-ocean-600 hover:bg-ocean-700 text-white'}`}
          >
            {isSaving ? (
              <><Loader2 size={16} className="animate-spin mr-2" /> Đang lưu...</>
            ) : (
              <><Save size={16} className="mr-2" /> Lưu Phân Quyền &amp; Cơ Cấu Tổ Chức</>
            )}
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
          <button type="button" className="text-ocean-600 text-xs font-bold mt-2">Cấu hình chi tiết →</button>
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

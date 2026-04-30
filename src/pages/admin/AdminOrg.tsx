import React, { useState, useEffect } from 'react';
import { Building2, Shield, Network, UserPlus, Save, CheckCircle2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { useAppStore } from '../../store/useAppStore';
import { callApi } from '../../services/api';

export default function AdminOrg() {
  const { serverOrgConfig, currentUser, setServerOrgConfig } = useAppStore();
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
        address: companyAddress
      });
      
      if (data && data.ok) {
        setServerOrgConfig({ name: companyName, address: companyAddress });
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

  const handleAddRole = async () => {
    const { value: formValues } = await Swal.fire({
      title: 'Thêm Role mới',
      html: `
        <input id="swal-input1" class="swal2-input" placeholder="Tên (VD: Trưởng ca)">
        <input id="swal-input2" class="swal2-input" placeholder="Mô tả">
      `,
      focusConfirm: false,
      showCancelButton: true,
      preConfirm: () => {
        return [
          (document.getElementById('swal-input1') as HTMLInputElement).value,
          (document.getElementById('swal-input2') as HTMLInputElement).value
        ]
      }
    });
    if (formValues && formValues[0]) {
      setRoles([...roles, { id: 'role_' + Date.now(), name: formValues[0], description: formValues[1], isDefault: false }]);
    }
  };

  const handleRemoveRole = (id: string) => {
    setRoles(roles.filter(r => r.id !== id));
  };

  const handleAddOrg = async () => {
    const { value: formValues } = await Swal.fire({
      title: 'Thêm Loại nhân sự',
      html: `
        <input id="swal-input1" class="swal2-input" placeholder="Tên (VD: Part-time)">
        <input id="swal-input2" class="swal2-input" type="number" step="0.1" placeholder="Hệ số lương (VD: 1.0)">
      `,
      focusConfirm: false,
      showCancelButton: true,
      preConfirm: () => {
        return [
          (document.getElementById('swal-input1') as HTMLInputElement).value,
          (document.getElementById('swal-input2') as HTMLInputElement).value
        ]
      }
    });
    if (formValues && formValues[0]) {
      setOrgStructure([...orgStructure, { id: 'org_' + Date.now(), name: formValues[0], salaryMultiplier: parseFloat(formValues[1]) || 1 }]);
    }
  };

  const handleRemoveOrg = (id: string) => {
    setOrgStructure(orgStructure.filter(o => o.id !== id));
  };

  return (
    <div className="p-4 space-y-4 animate-slide-up pb-10">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-600 via-emerald-600 to-green-700 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between mb-6">
        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-inner">
              <Building2 size={20} className="text-white" />
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Tổ chức & Quyền</h2>
          </div>
          <p className="text-teal-100 font-medium opacity-90 text-sm md:text-base max-w-md">
            Thiết lập doanh nghiệp, phòng ban và phân quyền.
          </p>
        </div>
        <div className="hidden md:block relative z-10 opacity-80">
          <Network size={80} strokeWidth={1} />
        </div>
        {/* Background Decorations */}
        <div className="absolute right-[-10%] top-[-20%] w-64 h-64 bg-white/10 rounded-full blur-3xl mix-blend-overlay"></div>
        <div className="absolute left-[-5%] bottom-[-50%] w-48 h-48 bg-teal-400/30 rounded-full blur-2xl mix-blend-overlay"></div>
      </div>

      {/* Company Info */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="font-bold mb-4 border-b dark:border-gray-700 pb-2 flex items-center text-gray-800 dark:text-white">
          <Building2 size={18} className="mr-2 text-ocean-600" /> Thông tin Doanh nghiệp
        </h3>
        
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Tên quán / Doanh nghiệp</label>
            <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500 dark:bg-gray-900 dark:border-gray-700 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Địa chỉ</label>
            <input type="text" value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500 dark:bg-gray-900 dark:border-gray-700 dark:text-white" />
          </div>
          <button onClick={handleSave} disabled={isSaving} className={`w-full font-bold py-2.5 rounded-lg text-sm transition flex items-center justify-center mt-2 ${isSaving ? 'bg-ocean-400 text-white cursor-not-allowed' : 'bg-ocean-600 hover:bg-ocean-700 text-white'}`}>
            {isSaving ? (
              <><span className="animate-spin mr-2">⏳</span> Đang lưu...</>
            ) : (
              <><Save size={16} className="mr-2" /> Lưu Thông Tin</>
            )}
          </button>
        </div>
      </div>

      {/* Roles & Permissions */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="font-bold mb-4 border-b dark:border-gray-700 pb-2 flex items-center text-gray-800 dark:text-white">
          <Shield size={18} className="mr-2 text-ocean-600" /> Phân quyền (Roles)
        </h3>
        
        <div className="space-y-3">
          {roles.map((r, i) => (
            <div key={r.id} className={`p-3 rounded-xl border flex flex-wrap justify-between items-center gap-2 ${i === 0 ? 'bg-ocean-50 dark:bg-ocean-900/10 border-ocean-100 dark:border-ocean-800' : 'bg-gray-50 dark:bg-gray-900 border-gray-100 dark:border-gray-800'}`}>
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
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="font-bold mb-4 border-b dark:border-gray-700 pb-2 flex items-center text-gray-800 dark:text-white">
          <Network size={18} className="mr-2 text-ocean-600" /> Cơ cấu tổ chức
        </h3>
        
        <div className="space-y-3">
          {orgStructure.map((org, i) => (
            <div key={org.id} className="flex flex-wrap items-center justify-between gap-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
              <div className="min-w-0 pr-2">
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">{org.name}</p>
                <p className="text-[10px] text-gray-500 truncate">Hệ số lương: {org.salaryMultiplier}</p>
              </div>
              <button onClick={() => handleRemoveOrg(org.id)} className="text-red-500 text-xs font-bold px-2 py-1 hover:underline flex-shrink-0">Xóa</button>
            </div>
          ))}
          <button onClick={handleAddOrg} className="w-full border-2 border-dashed border-gray-200 text-gray-500 font-bold py-2.5 rounded-lg text-sm transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 flex items-center justify-center mt-2">
            + Thêm Loại nhân sự
          </button>
        </div>
      </div>

      {/* Onboarding Automation */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
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
          <button className="text-ocean-600 text-xs font-bold mt-2">Cấu hình chi tiết →</button>
        </div>
      </div>
    </div>
  );
}

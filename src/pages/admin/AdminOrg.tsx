import React, { useState, useEffect } from 'react';
import { Building2, Shield, Network, UserPlus, Save, CheckCircle2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { useAppStore } from '../../store/useAppStore';
import { callApi } from '../../services/api';

export default function AdminOrg() {
  const { serverOrgConfig, currentUser, setServerOrgConfig } = useAppStore();
  const [companyName, setCompanyName] = useState('King\'s Grill');
  const [companyAddress, setCompanyAddress] = useState('Dĩ An, Bình Dương');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (serverOrgConfig) {
      setCompanyName(serverOrgConfig.name);
      setCompanyAddress(serverOrgConfig.address);
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

  return (
    <div className="p-4 space-y-4 animate-slide-up pb-10">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-ocean-100 text-ocean-600 flex items-center justify-center">
          <Building2 size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-white">Tổ chức & Quyền</h2>
          <p className="text-xs text-gray-500">Thiết lập doanh nghiệp, phòng ban và phân quyền</p>
        </div>
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
          <div className="p-3 bg-ocean-50 dark:bg-ocean-900/10 rounded-xl border border-ocean-100 dark:border-ocean-800 flex justify-between items-center">
            <div>
              <p className="text-sm font-bold text-ocean-800 dark:text-ocean-400">Quản lý (Admin)</p>
              <p className="text-[10px] text-ocean-600">Toàn quyền truy cập Cấu hình</p>
            </div>
            <span className="text-[10px] bg-ocean-200 text-ocean-700 px-2 py-1 rounded font-bold">Mặc định</span>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 flex justify-between items-center">
            <div>
              <p className="text-sm font-bold text-gray-800 dark:text-gray-200">Nhân viên (Staff)</p>
              <p className="text-[10px] text-gray-500">Chỉ xem và thao tác cá nhân</p>
            </div>
            <button className="text-ocean-600 text-xs font-bold px-2 py-1">Sửa</button>
          </div>
          <button className="w-full border-2 border-dashed border-gray-200 text-gray-500 font-bold py-2.5 rounded-lg text-sm transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 flex items-center justify-center">
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
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
            <div>
              <p className="text-sm font-bold text-gray-800 dark:text-gray-200">Thử việc</p>
              <p className="text-[10px] text-gray-500">Hệ số lương: 0.8</p>
            </div>
            <button className="text-ocean-600 text-xs font-bold px-2 py-1">Sửa</button>
          </div>
          <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/10 rounded-xl border border-green-100 dark:border-green-800">
            <div>
              <p className="text-sm font-bold text-green-800 dark:text-green-400">Chính thức</p>
              <p className="text-[10px] text-green-600">Hệ số lương: 1.0</p>
            </div>
            <button className="text-ocean-600 text-xs font-bold px-2 py-1">Sửa</button>
          </div>
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

import React, { useState, useEffect } from 'react';
import { MapPin, Clock, CalendarRange, Save, Crosshair, AlertCircle } from 'lucide-react';
import Swal from 'sweetalert2';
import { useAppStore } from '../../store/useAppStore';
import { callApi } from '../../services/api';

export default function AdminShift() {
  const { serverGpsConfig, currentUser, setServerGpsConfig } = useAppStore();
  const [kgLat, setKgLat] = useState('10.9760826');
  const [kgLng, setKgLng] = useState('106.6646541');
  const [kgRadius, setKgRadius] = useState('25');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (serverGpsConfig) {
      setKgLat(serverGpsConfig.lat.toString());
      setKgLng(serverGpsConfig.lng.toString());
      setKgRadius(serverGpsConfig.radius.toString());
    }
  }, [serverGpsConfig]);

  const handleSaveGPS = async () => {
    if (!currentUser) return;
    setIsSaving(true);
    
    try {
      const data = await callApi('UPDATE_GPS_CONFIG', {
        role: currentUser.role,
        lat: kgLat,
        lng: kgLng,
        radius: kgRadius
      });
      
      if (data && data.ok) {
        setServerGpsConfig({
          lat: Number(kgLat),
          lng: Number(kgLng),
          radius: Number(kgRadius)
        });
        
        Swal.fire({
          icon: 'success',
          title: 'Đã lưu cấu hình GPS',
          text: 'Vị trí này sẽ được sử dụng cho chấm công của nhân sự.',
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
          <Clock size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-white">Ca làm & Chấm công</h2>
          <p className="text-xs text-gray-500">Thiết lập tọa độ, bán kính và mã ca làm</p>
        </div>
      </div>

      {/* GPS Configuration */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="font-bold mb-4 border-b dark:border-gray-700 pb-2 flex items-center text-gray-800 dark:text-white">
          <MapPin size={18} className="mr-2 text-ocean-600" /> Tọa độ GPS Nhà hàng
        </h3>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Vĩ độ (Latitude)</label>
              <input type="text" value={kgLat} onChange={e => setKgLat(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500 dark:bg-gray-900 dark:border-gray-700 dark:text-white" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Kinh độ (Longitude)</label>
              <input type="text" value={kgLng} onChange={e => setKgLng(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500 dark:bg-gray-900 dark:border-gray-700 dark:text-white" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Bán kính hợp lệ (Meters)</label>
            <div className="flex items-center space-x-2">
              <input type="number" value={kgRadius} onChange={e => setKgRadius(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500 dark:bg-gray-900 dark:border-gray-700 dark:text-white" />
              <button className="bg-gray-100 text-gray-600 px-3 py-2 rounded-lg text-sm font-bold whitespace-nowrap hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300">
                <Crosshair size={16} />
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Gợi ý: Đứng tại quán và ấn biểu tượng ngắm để lấy tọa độ hiện tại.</p>
          </div>

          <button onClick={handleSaveGPS} disabled={isSaving} className={`w-full font-bold py-2.5 rounded-lg text-sm transition flex items-center justify-center ${isSaving ? 'bg-ocean-400 text-white cursor-not-allowed' : 'bg-ocean-600 hover:bg-ocean-700 text-white'}`}>
            {isSaving ? (
              <><span className="animate-spin mr-2">⏳</span> Đang lưu...</>
            ) : (
              <><Save size={16} className="mr-2" /> Lưu Cấu Hình GPS</>
            )}
          </button>
        </div>
      </div>

      {/* Shift Codes */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="font-bold mb-4 border-b dark:border-gray-700 pb-2 flex items-center text-gray-800 dark:text-white">
          <CalendarRange size={18} className="mr-2 text-ocean-600" /> Mã Ca Làm
        </h3>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
            <div>
              <p className="text-sm font-bold text-gray-800 dark:text-gray-200">Ca tiêu chuẩn</p>
              <p className="text-[10px] text-gray-500">15:00, 17:00, 18:00, 19:00</p>
            </div>
            <button className="text-ocean-600 text-xs font-bold bg-ocean-50 px-2 py-1 rounded">Sửa</button>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/10 rounded-xl border border-orange-100 dark:border-orange-800">
            <div>
              <div className="flex items-center space-x-2">
                <p className="text-sm font-bold text-orange-800 dark:text-orange-400">OFF#</p>
                <span className="text-[8px] bg-orange-200 text-orange-700 px-1.5 py-0.5 rounded font-bold">ADMIN ONLY</span>
              </div>
              <p className="text-[10px] text-orange-600">Nghỉ phép (Được Admin duyệt)</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-800">
            <div>
              <div className="flex items-center space-x-2">
                <p className="text-sm font-bold text-red-800 dark:text-red-400">OFF!</p>
                <span className="text-[8px] bg-red-200 text-red-700 px-1.5 py-0.5 rounded font-bold">PENALTY</span>
              </div>
              <p className="text-[10px] text-red-600">Nghỉ không phép (Bị phạt)</p>
            </div>
          </div>

          <button className="w-full border-2 border-dashed border-gray-200 text-gray-500 font-bold py-2.5 rounded-lg text-sm transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 flex items-center justify-center mt-2">
            + Thêm mã ca mới
          </button>
        </div>
      </div>
      
      {/* Registration Settings */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="font-bold mb-4 border-b dark:border-gray-700 pb-2 flex items-center text-gray-800 dark:text-white">
          <AlertCircle size={18} className="mr-2 text-ocean-600" /> Luật Đăng Ký Ca
        </h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-gray-800 dark:text-gray-200">Giờ đóng cổng tự động</p>
              <p className="text-[10px] text-gray-500">17:00 Thứ Bảy hàng tuần</p>
            </div>
            <div className="w-10 h-5 bg-ocean-500 rounded-full relative shadow-inner cursor-pointer">
              <div className="w-4 h-4 bg-white rounded-full absolute right-0.5 top-0.5 shadow-sm"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

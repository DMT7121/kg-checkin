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
  const [shiftCodes, setShiftCodes] = useState<any[]>([
    { id: 'standard', code: 'Ca tiêu chuẩn', description: '15:00, 17:00, 18:00, 19:00', type: 'standard' },
    { id: 'off_admin', code: 'OFF#', description: 'Nghỉ phép (Được Admin duyệt)', type: 'admin' },
    { id: 'off_penalty', code: 'OFF!', description: 'Nghỉ không phép (Bị phạt)', type: 'penalty' }
  ]);
  const [registrationCloseTime, setRegistrationCloseTime] = useState('17:00 Thứ Bảy');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (serverGpsConfig) {
      setKgLat(serverGpsConfig.lat.toString());
      setKgLng(serverGpsConfig.lng.toString());
      setKgRadius(serverGpsConfig.radius.toString());
      if ((serverGpsConfig as any).shiftCodes) setShiftCodes((serverGpsConfig as any).shiftCodes);
      if ((serverGpsConfig as any).registrationCloseTime) setRegistrationCloseTime((serverGpsConfig as any).registrationCloseTime);
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
        radius: kgRadius,
        shiftCodes,
        registrationCloseTime
      });
      
      if (data && data.ok) {
        setServerGpsConfig({
          lat: Number(kgLat),
          lng: Number(kgLng),
          radius: Number(kgRadius),
          shiftCodes,
          registrationCloseTime
        } as any);
        
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

  const handleAddShiftCode = async () => {
    const { value: formValues } = await Swal.fire({
      title: 'Thêm Mã Ca Làm',
      html: `
        <input id="swal-input1" class="swal2-input" placeholder="Mã Ca (VD: T7_SANG)">
        <input id="swal-input2" class="swal2-input" placeholder="Mô tả">
        <select id="swal-input3" class="swal2-select">
          <option value="standard">Tiêu chuẩn</option>
          <option value="admin">Admin cấp</option>
          <option value="penalty">Phạt</option>
        </select>
      `,
      focusConfirm: false,
      showCancelButton: true,
      preConfirm: () => {
        return [
          (document.getElementById('swal-input1') as HTMLInputElement).value,
          (document.getElementById('swal-input2') as HTMLInputElement).value,
          (document.getElementById('swal-input3') as HTMLSelectElement).value
        ]
      }
    });
    if (formValues && formValues[0]) {
      setShiftCodes([...shiftCodes, { id: 'shift_' + Date.now(), code: formValues[0], description: formValues[1], type: formValues[2] }]);
    }
  };

  const handleRemoveShiftCode = (id: string) => {
    setShiftCodes(shiftCodes.filter(s => s.id !== id));
  };

  return (
    <div className="p-4 space-y-4 animate-slide-up pb-10">
      <div className="flex mb-2">
        <button onClick={() => useAppStore.getState().setCurrentTab('admin')} className="flex items-center text-xs font-bold text-gray-500 hover:text-ocean-600 transition-colors">
          <span className="mr-1">←</span> Quay lại Cài đặt chung
        </button>
      </div>
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-yellow-600 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between mb-6">
        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-inner">
              <Clock size={20} className="text-white" />
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Ca làm & Chấm công</h2>
          </div>
          <p className="text-orange-100 font-medium opacity-90 text-sm md:text-base max-w-md">
            Thiết lập tọa độ, bán kính và mã ca làm.
          </p>
        </div>
        <div className="hidden md:block relative z-10 opacity-80">
          <MapPin size={80} strokeWidth={1} />
        </div>
        {/* Background Decorations */}
        <div className="absolute right-[-10%] top-[-20%] w-64 h-64 bg-white/10 rounded-full blur-3xl mix-blend-overlay"></div>
        <div className="absolute left-[-5%] bottom-[-50%] w-48 h-48 bg-orange-400/30 rounded-full blur-2xl mix-blend-overlay"></div>
      </div>

      {/* GPS Configuration */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="font-bold mb-4 border-b dark:border-gray-700 pb-2 flex items-center text-gray-800 dark:text-white">
          <MapPin size={18} className="mr-2 text-ocean-600" /> Tọa độ GPS Nhà hàng
        </h3>
        
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div className="flex flex-wrap items-center gap-2">
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
          {shiftCodes.map((s) => (
            <div key={s.id} className={`flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border ${s.type === 'standard' ? 'bg-gray-50 dark:bg-gray-900 border-gray-100 dark:border-gray-800' : s.type === 'admin' ? 'bg-orange-50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-800' : 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-800'}`}>
              <div className="min-w-0 pr-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`text-sm font-bold truncate ${s.type === 'standard' ? 'text-gray-800 dark:text-gray-200' : s.type === 'admin' ? 'text-orange-800 dark:text-orange-400' : 'text-red-800 dark:text-red-400'}`}>{s.code}</p>
                  {s.type !== 'standard' && (
                    <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${s.type === 'admin' ? 'bg-orange-200 text-orange-700' : 'bg-red-200 text-red-700'}`}>{s.type === 'admin' ? 'ADMIN ONLY' : 'PENALTY'}</span>
                  )}
                </div>
                <p className={`text-[10px] truncate ${s.type === 'standard' ? 'text-gray-500' : s.type === 'admin' ? 'text-orange-600' : 'text-red-600'}`}>{s.description}</p>
              </div>
              <button onClick={() => handleRemoveShiftCode(s.id)} className="text-red-500 text-xs font-bold px-2 py-1 hover:underline flex-shrink-0">Xóa</button>
            </div>
          ))}

          <button onClick={handleAddShiftCode} className="w-full border-2 border-dashed border-gray-200 text-gray-500 font-bold py-2.5 rounded-lg text-sm transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800 flex items-center justify-center mt-2">
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 pr-2">
              <p className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">Giờ đóng cổng tự động</p>
              <input type="text" value={registrationCloseTime} onChange={(e) => setRegistrationCloseTime(e.target.value)} className="w-full text-[10px] text-gray-500 bg-transparent border-b border-gray-300 dark:border-gray-600 focus:outline-none focus:border-ocean-500" />
            </div>
            <button onClick={handleSaveGPS} disabled={isSaving} className="px-3 py-1 bg-ocean-100 text-ocean-600 font-bold text-xs rounded hover:bg-ocean-200 transition flex-shrink-0">
              {isSaving ? 'Lưu...' : 'Lưu Tất cả'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

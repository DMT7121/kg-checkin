import React, { useState, useEffect } from 'react';
import { MapPin, Clock, CalendarRange, Save, Crosshair, AlertCircle, ShieldCheck } from 'lucide-react';
import Swal from 'sweetalert2';
import { useAppStore } from '../../store/useAppStore';
import { callApi } from '../../services/api';
import { KgModuleHero } from '../../components/KgDesignSystem';
import MissedCheckInModal from '../../components/MissedCheckInModal';


export default function AdminShift() {
  const { serverGpsConfig, currentUser, setServerGpsConfig } = useAppStore();
  const [isMissedModalOpen, setIsMissedModalOpen] = useState(false);
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

  const [isLocating, setIsLocating] = useState(false);

  const handleGetLiveLocation = () => {
    if (!navigator.geolocation) {
      Swal.fire('Lỗi', 'Trình duyệt không hỗ trợ định vị GPS.', 'error');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const lat = pos.coords.latitude.toFixed(7);
        const lng = pos.coords.longitude.toFixed(7);
        const acc = Math.round(pos.coords.accuracy);
        setKgLat(lat);
        setKgLng(lng);
        setKgRadius('25');
        Swal.fire({
          icon: 'success',
          title: 'Đã nhận diện tọa độ!',
          html: `
            <p class="text-sm"><b>Vĩ độ:</b> ${lat}</p>
            <p class="text-sm"><b>Kinh độ:</b> ${lng}</p>
            <p class="text-xs text-gray-500 mt-2">Độ chính xác GPS: ±${acc}m | Bán kính: 25m</p>
            <p class="text-xs text-blue-600 font-bold mt-2">Hãy nhấn nút <b>"Lưu Cấu Hình GPS"</b> bên dưới để áp dụng ngay!</p>
          `,
          confirmButtonColor: '#2563eb'
        });
      },
      (err) => {
        setIsLocating(false);
        Swal.fire('Lỗi GPS', 'Không thể lấy vị trí hiện tại: ' + err.message + '. Vui lòng bật quyền Vị trí cho trình duyệt.', 'error');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

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
          text: `Đã cập nhật vị trí gốc nhà hàng (Bán kính ${kgRadius}m) thành công!`,
          confirmButtonColor: '#2563eb'
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
        <button onClick={() => useAppStore.getState().setCurrentTab('admin_workforce')} className="flex items-center text-xs font-bold text-gray-500 hover:text-ocean-600 transition-colors">
          <span className="mr-1">←</span> Quay lại Cài đặt chung
        </button>
      </div>
      <KgModuleHero
        moduleId="admin-shift"
        title="Ca làm & Chấm công"
        description="Thiết lập tọa độ định vị GPS nhà hàng, bán kính Check-in hợp lệ và quản lý các loại mã ca làm việc."
        eyebrow="Cấu hình"
      />

      {/* GPS Configuration */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-5 rounded-2xl shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--kg-border)] pb-3 mb-4">
          <h3 className="font-black flex items-center text-sm sm:text-base text-[var(--kg-text)]">
            <MapPin size={18} className="mr-2 text-blue-600" /> Tọa độ GPS Nhà hàng
          </h3>
          <button
            type="button"
            onClick={handleGetLiveLocation}
            disabled={isLocating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 rounded-xl text-xs font-black transition-all active:scale-95"
          >
            <Crosshair size={14} className={isLocating ? 'animate-spin' : ''} />
            {isLocating ? 'Đang lấy vị trí...' : 'Lấy GPS tại đây'}
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-[var(--kg-text-muted)] mb-1">Vĩ độ (Latitude)</label>
              <input type="text" value={kgLat} onChange={e => setKgLat(e.target.value)} className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 text-xs font-bold text-[var(--kg-text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-black text-[var(--kg-text-muted)] mb-1">Kinh độ (Longitude)</label>
              <input type="text" value={kgLng} onChange={e => setKgLng(e.target.value)} className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 text-xs font-bold text-[var(--kg-text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-[var(--kg-text-muted)] mb-1">Bán kính hợp lệ (Meters) - Chuẩn: 25m</label>
            <div className="flex items-center gap-2">
              <input type="number" value={kgRadius} onChange={e => setKgRadius(e.target.value)} className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 text-xs font-bold text-[var(--kg-text)] focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button
                type="button"
                onClick={handleGetLiveLocation}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2.5 rounded-xl text-xs font-black whitespace-nowrap shadow-sm active:scale-95 transition-all flex items-center gap-1"
                title="Lấy tọa độ hiện tại của thiết bị"
              >
                <Crosshair size={16} /> Lấy GPS
              </button>
            </div>
            <p className="text-[11px] text-[var(--kg-text-muted)] mt-1.5 font-medium">
              💡 <b>Khuyến nghị:</b> Đứng tại nhà hàng, nhấn <b>"Lấy GPS"</b> và bấm <b>"Lưu Cấu Hình GPS"</b> để hệ thống tự động chuẩn hóa vị trí gốc 25m.
            </p>
          </div>

          <button onClick={handleSaveGPS} disabled={isSaving} className={`w-full font-black py-3 rounded-xl text-xs sm:text-sm transition flex items-center justify-center shadow-md active:scale-95 ${isSaving ? 'bg-blue-400 text-white cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white'}`}>
            {isSaving ? (
              <><span className="animate-spin mr-2">⏳</span> Đang lưu cấu hình...</>
            ) : (
              <><Save size={16} className="mr-2" /> Lưu Cấu Hình GPS (Bán kính {kgRadius}m)</>
            )}
          </button>
        </div>
      </div>

      {/* Shift Codes */}
      <div className="soft3d-card p-5 rounded-2xl  ">
        <h3 className="font-bold mb-4 border-b dark:border-gray-700 pb-2 flex items-center text-gray-800 dark:text-white">
          <CalendarRange size={18} className="mr-2 text-ocean-600" /> Mã Ca Làm
        </h3>
        
        <div className="space-y-3">
          {shiftCodes.map((s) => (
            <div key={s.id} className={`flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border ${s.type === 'standard' ? 'soft3d-bg border-gray-100 dark:border-gray-800' : s.type === 'admin' ? 'bg-orange-50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-800' : 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-800'}`}>
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
      <div className="soft3d-card p-5 rounded-2xl  ">
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
      
      {/* Missed Check-ins Approval Quick Card */}
      <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-600/10 border-2 border-amber-500/30 p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-black shadow-md flex-shrink-0">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-black text-[var(--kg-text)]">
              Duyệt Đơn Bổ Sung Chấm Công (Báo Miss Công)
            </h4>
            <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5 font-medium">
              Kiểm tra các đơn giải trình của nhân viên bị lỗi mạng, hết pin, quên bấm máy và tự động ghi nhận vào Bảng công.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsMissedModalOpen(true)}
          className="w-full sm:w-auto px-4 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 text-white rounded-xl text-xs font-black shadow-md transition active:scale-95 whitespace-nowrap flex-shrink-0"
        >
          Mở hàng chờ duyệt →
        </button>
      </div>

      {/* Missed Check-in Modal */}
      {isMissedModalOpen && (
        <MissedCheckInModal
          isOpen={isMissedModalOpen}
          onClose={() => setIsMissedModalOpen(false)}
        />
      )}
    </div>
  );
}

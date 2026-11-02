import React, { useState, useEffect } from 'react';
import { MapPin, CalendarRange, Save, Crosshair, AlertCircle, ShieldCheck, Info, Loader2, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { useAppStore } from '../../store/useAppStore';
import { callApi } from '../../services/api';
import { KgModuleHero, KgBottomSheet, KgInput, KgSelect, KgButton } from '../../components/KgDesignSystem';
import MissedCheckInModal from '../../components/MissedCheckInModal';
import { normalizeGpsRadius } from '../../utils/helpers';


export default function AdminShift() {
  const serverGpsConfig = useAppStore((s) => s.serverGpsConfig);
  const currentUser = useAppStore((s) => s.currentUser);
  const setServerGpsConfig = useAppStore((s) => s.setServerGpsConfig);
  const [isMissedModalOpen, setIsMissedModalOpen] = useState(false);
  const [isAddShiftOpen, setIsAddShiftOpen] = useState(false);
  const [newShiftCode, setNewShiftCode] = useState('');
  const [newShiftDesc, setNewShiftDesc] = useState('');
  const [newShiftType, setNewShiftType] = useState<'standard' | 'admin' | 'penalty'>('standard');
  const [kgLat, setKgLat] = useState('10.9760826');
  const [kgLng, setKgLng] = useState('106.6646541');
  const [kgRadius, setKgRadius] = useState('25');
  const [shiftCodes, setShiftCodes] = useState<any[]>([
    { id: 'standard', code: 'Ca tiêu chuẩn', description: '15:00, 16:00, 17:00, 18:00, 19:00', type: 'standard' },
    { id: 'off_admin', code: 'OFF#', description: 'Nghỉ phép (Được Admin duyệt)', type: 'admin' },
    { id: 'off_penalty', code: 'OFF!', description: 'Nghỉ không phép (Bị phạt)', type: 'penalty' }
  ]);
  const [registrationCloseTime, setRegistrationCloseTime] = useState('17:00 Thứ Bảy');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (serverGpsConfig) {
      setKgLat(serverGpsConfig.lat.toString());
      setKgLng(serverGpsConfig.lng.toString());
      setKgRadius(normalizeGpsRadius(serverGpsConfig.radius).toString());
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

  const handleAddShiftCode = () => {
    setNewShiftCode('');
    setNewShiftDesc('');
    setNewShiftType('standard');
    setIsAddShiftOpen(true);
  };

  const handleConfirmAddShiftCode = (e: React.FormEvent) => {
    e.preventDefault();
    const code = newShiftCode.trim();
    if (!code) return;
    setShiftCodes([...shiftCodes, { id: 'shift_' + Date.now(), code, description: newShiftDesc.trim(), type: newShiftType }]);
    setIsAddShiftOpen(false);
  };

  const handleRemoveShiftCode = (id: string) => {
    setShiftCodes(shiftCodes.filter(s => s.id !== id));
  };

  return (
    <div className="p-4 space-y-4 animate-slide-up pb-10">
      <div className="flex mb-2">
        <button type="button" onClick={() => useAppStore.getState().setCurrentTab('admin_workforce')} className="flex items-center gap-1 text-xs font-bold text-[var(--kg-text-muted)] hover:text-[var(--kg-primary)] transition-colors">
          <ArrowLeft size={14} /> Quay lại Cài đặt chung
        </button>
      </div>
      <KgModuleHero
        moduleId="admin-shift"
        title="Ca làm & Chấm công"
        description="Thiết lập tọa độ định vị GPS nhà hàng, bán kính Check-in hợp lệ và quản lý các loại mã ca làm việc."
        eyebrow="Cấu hình"
        tipTitle="Hướng dẫn Quản trị GPS & Ca làm"
        tips={[
          "Tọa độ GPS chuẩn: Cần đứng trực tiếp tại sảnh chính King's Grill và bấm 'Lấy vị trí hiện tại' để có tọa độ chính xác nhất.",
          "Bán kính GPS hợp lệ: Chuẩn 25m để đảm bảo nhân viên trong nhà hàng chấm công nhạy và tránh trường hợp chấm công từ xa ngoài quán.",
          "Mã ca làm việc: Thiết lập đầy đủ giờ Vào, giờ Ra và thời gian nghỉ giữa ca cho từng ca Sáng, Chiều, Tối."
        ]}
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
              <label htmlFor="kg-lat" className="block text-xs font-black text-[var(--kg-text-muted)] mb-1">Vĩ độ (Latitude)</label>
              <input id="kg-lat" type="text" value={kgLat} onChange={e => setKgLat(e.target.value)} className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold tabular-nums text-[var(--kg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)]" />
            </div>
            <div>
              <label htmlFor="kg-lng" className="block text-xs font-black text-[var(--kg-text-muted)] mb-1">Kinh độ (Longitude)</label>
              <input id="kg-lng" type="text" value={kgLng} onChange={e => setKgLng(e.target.value)} className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold tabular-nums text-[var(--kg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)]" />
            </div>
          </div>

          <div>
            <label htmlFor="kg-radius" className="block text-xs font-black text-[var(--kg-text-muted)] mb-1">Bán kính hợp lệ (Meters) - Chuẩn: 25m</label>
            <div className="flex items-center gap-2">
              <input id="kg-radius" type="number" value={kgRadius} onChange={e => setKgRadius(e.target.value)} className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold tabular-nums text-[var(--kg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)]" />
              <button
                type="button"
                onClick={handleGetLiveLocation}
                className="bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white px-3.5 py-2.5 rounded-xl text-xs font-black whitespace-nowrap shadow-xs active:scale-95 transition-all flex items-center gap-1"
                title="Lấy tọa độ hiện tại của thiết bị"
              >
                <Crosshair size={16} /> Lấy GPS
              </button>
            </div>
            <p className="text-[11px] text-[var(--kg-text-muted)] mt-1.5 font-medium flex items-start gap-1.5">
              <Info size={14} className="text-[var(--kg-primary)] flex-shrink-0 mt-0.5" />
              <span><b>Khuyến nghị:</b> Đứng tại nhà hàng, nhấn <b>"Lấy GPS"</b> và bấm <b>"Lưu Cấu Hình GPS"</b> để hệ thống tự động chuẩn hóa vị trí gốc 25m.</span>
            </p>
          </div>

          <button type="button" onClick={handleSaveGPS} disabled={isSaving} className={`w-full font-black py-3 rounded-xl text-xs sm:text-sm transition flex items-center justify-center shadow-xs active:scale-95 ${isSaving ? 'bg-slate-400 text-white cursor-not-allowed' : 'bg-[var(--kg-primary)] text-white hover:bg-[var(--kg-primary-hover)]'}`}>
            {isSaving ? (
              <><Loader2 size={16} className="animate-spin mr-2" /> Đang lưu cấu hình...</>
            ) : (
              <><Save size={16} className="mr-2" /> Lưu Cấu Hình GPS (Bán kính {kgRadius}m)</>
            )}
          </button>
        </div>
      </div>

      {/* Shift Codes */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-5 rounded-2xl shadow-xs">
        <h3 className="font-bold mb-4 border-b border-[var(--kg-border)] pb-2 flex items-center text-[var(--kg-text)]">
          <CalendarRange size={18} className="mr-2 text-[var(--kg-primary)]" /> Mã Ca Làm
        </h3>
        
        <div className="space-y-3">
          {shiftCodes.map((s) => (
            <div key={s.id} className={`flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border ${s.type === 'standard' ? 'bg-[var(--kg-surface-soft)] border-[var(--kg-border)]' : s.type === 'admin' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
              <div className="min-w-0 pr-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`text-sm font-bold truncate ${s.type === 'standard' ? 'text-[var(--kg-text)]' : s.type === 'admin' ? 'text-amber-700 dark:text-amber-400' : 'text-rose-700 dark:text-rose-400'}`}>{s.code}</p>
                  {s.type !== 'standard' && (
                    <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${s.type === 'admin' ? 'bg-amber-500/20 text-amber-700' : 'bg-rose-500/20 text-rose-700'}`}>{s.type === 'admin' ? 'ADMIN ONLY' : 'PENALTY'}</span>
                  )}
                </div>
                <p className={`text-[10px] truncate ${s.type === 'standard' ? 'text-[var(--kg-text-muted)]' : s.type === 'admin' ? 'text-amber-600' : 'text-rose-600'}`}>{s.description}</p>
              </div>
              <button type="button" onClick={() => handleRemoveShiftCode(s.id)} className="text-rose-500 text-xs font-bold px-2 py-1 hover:underline flex-shrink-0 inline-flex items-center gap-1">
                <Trash2 size={13} /> Xóa
              </button>
            </div>
          ))}

          <button type="button" onClick={handleAddShiftCode} className="w-full border border-dashed border-[var(--kg-border-strong)] text-[var(--kg-text-muted)] hover:text-[var(--kg-primary)] font-bold py-2.5 rounded-xl text-sm transition hover:bg-[var(--kg-surface-soft)] flex items-center justify-center gap-1.5 mt-2">
            <Plus size={16} /> Thêm mã ca mới
          </button>
        </div>
      </div>
      
      {/* Registration Settings */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-5 rounded-2xl shadow-xs">
        <h3 className="font-bold mb-4 border-b border-[var(--kg-border)] pb-2 flex items-center text-[var(--kg-text)]">
          <AlertCircle size={18} className="mr-2 text-[var(--kg-primary)]" /> Luật Đăng Ký Ca
        </h3>
        
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 pr-2 flex-1">
              <label htmlFor="reg-close-time" className="block text-sm font-bold text-[var(--kg-text)] mb-1">Giờ đóng cổng tự động</label>
              <input id="reg-close-time" type="text" value={registrationCloseTime} onChange={(e) => setRegistrationCloseTime(e.target.value)} className="w-full max-w-xs text-xs font-semibold text-[var(--kg-text)] bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)]" />
            </div>
            <button type="button" onClick={handleSaveGPS} disabled={isSaving} className="px-3.5 py-2 bg-[var(--kg-surface-soft)] hover:bg-[var(--kg-border)]/40 border border-[var(--kg-border)] text-[var(--kg-text)] font-bold text-xs rounded-xl transition flex-shrink-0">
              {isSaving ? 'Lưu...' : 'Lưu Tất cả'}
            </button>
          </div>
        </div>
      </div>
      
      {/* Missed Check-ins Approval Quick Card */}
      <div className="bg-[var(--kg-surface)] border border-amber-500/30 p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black shadow-xs flex-shrink-0">
            <ShieldCheck size={20} />
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
          className="w-full sm:w-auto px-4 py-2.5 bg-[var(--kg-primary)] text-white hover:bg-[var(--kg-primary-hover)] rounded-xl text-xs font-black shadow-xs transition active:scale-95 whitespace-nowrap flex-shrink-0"
        >
          Mở hàng chờ duyệt →
        </button>
      </div>

      {/* Add Shift Code Sheet */}
      <KgBottomSheet
        open={isAddShiftOpen}
        onClose={() => setIsAddShiftOpen(false)}
        title="Thêm mã ca làm mới"
        subtitle="Thiết lập mã ca tiêu chuẩn, nghỉ phép Admin cấp hoặc mã phạt."
        footer={
          <div className="flex justify-end gap-2">
            <KgButton variant="ghost" onClick={() => setIsAddShiftOpen(false)}>
              Hủy
            </KgButton>
            <KgButton
              variant="primary"
              type="submit"
              form="add-shift-code-form"
              disabled={!newShiftCode.trim()}
            >
              Thêm mã ca
            </KgButton>
          </div>
        }
      >
        <form id="add-shift-code-form" onSubmit={handleConfirmAddShiftCode} className="space-y-4">
          <KgInput
            id="new-shift-code"
            label="Mã ca làm"
            placeholder="VD: T7_SANG hoặc 14:30"
            value={newShiftCode}
            onChange={(e) => setNewShiftCode(e.target.value)}
            required
          />
          <KgInput
            id="new-shift-desc"
            label="Mô tả chi tiết"
            placeholder="VD: Ca tăng cường sáng Thứ Bảy"
            value={newShiftDesc}
            onChange={(e) => setNewShiftDesc(e.target.value)}
          />
          <KgSelect
            id="new-shift-type"
            label="Phân loại mã ca"
            value={newShiftType}
            onChange={(e) => setNewShiftType(e.target.value as 'standard' | 'admin' | 'penalty')}
            options={[
              { value: 'standard', label: 'Tiêu chuẩn (Nhân viên chọn được)' },
              { value: 'admin', label: 'Admin cấp (OFF#)' },
              { value: 'penalty', label: 'Phạt vi phạm (OFF!)' },
            ]}
          />
        </form>
      </KgBottomSheet>

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

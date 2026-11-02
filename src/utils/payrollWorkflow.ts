export type PayrollWorkflowStatus = 'Draft' | 'Staff_Confirming' | 'Disputed' | 'Locked';

export interface PayrollStaffConfirmation {
  status: 'CONFIRMED' | 'DISPUTED';
  note?: string;
  fullname?: string;
  updatedAt: string;
}

export interface PayrollWorkflowState {
  month: string;
  status: PayrollWorkflowStatus;
  updatedBy?: string;
  updatedAt?: string;
  note?: string;
  confirmations: Record<string, PayrollStaffConfirmation>;
}

export const PAYROLL_WORKFLOW_STEPS: Array<{
  key: PayrollWorkflowStatus;
  step: number;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    key: 'Draft',
    step: 1,
    label: '1. Bản nháp',
    shortLabel: 'Bản nháp',
    description: 'Quản lý đối chiếu giờ công, thưởng/phạt và tạm ứng.',
  },
  {
    key: 'Staff_Confirming',
    step: 2,
    label: '2. Gửi NV đối chiếu',
    shortLabel: 'NV đối chiếu',
    description: 'Nhân viên kiểm tra phiếu lương trong 48h & bấm xác nhận.',
  },
  {
    key: 'Disputed',
    step: 3,
    label: '3. Có khiếu nại',
    shortLabel: 'Có khiếu nại',
    description: 'Có nhân viên báo sai lệch giờ công/phụ cấp cần xử lý.',
  },
  {
    key: 'Locked',
    step: 4,
    label: '4. Đã khóa sổ',
    shortLabel: 'Đã khóa sổ',
    description: 'Chốt sổ kế toán, khóa chỉnh sửa & xuất CSV ngân hàng.',
  },
];

export function normalizePayrollWorkflowStatus(raw?: string | null): PayrollWorkflowStatus {
  const s = String(raw || '').trim();
  if (s === 'Staff_Confirming' || s === 'Disputed' || s === 'Locked') return s;
  return 'Draft';
}

export function summarizeStaffConfirmations(
  usernames: string[],
  confirmations?: Record<string, PayrollStaffConfirmation> | null
): {
  totalStaff: number;
  confirmedCount: number;
  disputedCount: number;
  pendingCount: number;
} {
  const map = confirmations || {};
  let confirmedCount = 0;
  let disputedCount = 0;
  let pendingCount = 0;

  for (const uname of usernames) {
    const entry = map[uname] || map[uname.toLowerCase()];
    if (!entry) {
      pendingCount++;
    } else if (entry.status === 'DISPUTED') {
      disputedCount++;
    } else if (entry.status === 'CONFIRMED') {
      confirmedCount++;
    } else {
      pendingCount++;
    }
  }

  return {
    totalStaff: usernames.length,
    confirmedCount,
    disputedCount,
    pendingCount,
  };
}

export function stripVietnameseDiacritics(input: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeCsvCell(value: string | number): string {
  if (typeof value === 'number') {
    return String(value);
  }
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface BankExportPayrollRow {
  username: string;
  fullname: string;
  payType?: 'hourly' | 'daily';
  baseSalaryPerHour?: number;
  salaryAmount?: number;
  workedDays?: number;
  totalHours: number;
  regularHours?: number;
  overtimeHours?: number;
  totalBaseSalary: number;
  bonus: number;
  penalty: number;
  advances: number;
  netPay: number;
  isConfigured?: boolean;
  bankName?: string;
  bankAccount?: string;
}

export function generatePayrollBankCsv(
  records: BankExportPayrollRow[],
  monthYm: string,
  confirmations?: Record<string, PayrollStaffConfirmation> | null
): string {
  const [yyyy = '', mm = ''] = String(monthYm || '').split('-');
  const periodLabel = mm && yyyy ? `${mm}/${yyyy}` : monthYm;
  const map = confirmations || {};

  const headers = [
    'STT',
    'Mã NV',
    'Họ và tên',
    'Kỳ lương',
    'Hình thức',
    'Giờ công / Ngày công',
    'Lương theo công (VNĐ)',
    'Thưởng (VNĐ)',
    'Khấu trừ phạt (VNĐ)',
    'Đã tạm ứng (VNĐ)',
    'Thực lĩnh chuyển khoản (VNĐ)',
    'Ngân hàng',
    'Số tài khoản',
    'Nội dung chuyển khoản NAPAS',
    'Trạng thái NV đối chiếu',
  ];

  const lines: string[] = [headers.map(escapeCsvCell).join(',')];

  (records || []).forEach((rec, index) => {
    const baseSal = Math.round(Number(rec.totalBaseSalary) || 0);
    const bonus = Math.round(Number(rec.bonus) || 0);
    const penalty = Math.round(Number(rec.penalty) || 0);
    const advances = Math.round(Number(rec.advances) || 0);
    const netPay = Math.round(Number(rec.netPay) || 0);
    const asciiName = stripVietnameseDiacritics(rec.fullname || rec.username).toUpperCase();
    const napasMemo = `KING GRILL LUONG T${mm || 'XX'} ${yyyy} ${asciiName}`.trim().slice(0, 70);

    const conf = map[rec.username] || map[rec.username?.toLowerCase()];
    const confLabel =
      conf?.status === 'CONFIRMED'
        ? 'Đã xác nhận'
        : conf?.status === 'DISPUTED'
          ? `Khiếu nại: ${conf.note || ''}`
          : 'Chưa xác nhận';

    const workUnit =
      rec.payType === 'daily'
        ? `${rec.workedDays || 0} ngày`
        : `${Number(rec.totalHours || 0).toFixed(2)} giờ`;

    const row = [
      index + 1,
      rec.username || '',
      rec.fullname || '',
      periodLabel,
      rec.payType === 'daily' ? 'Lương tháng/30 ngày' : 'Theo giờ',
      workUnit,
      baseSal,
      bonus,
      penalty,
      advances,
      netPay,
      rec.bankName || '',
      rec.bankAccount ? `'${rec.bankAccount}` : '',
      napasMemo,
      confLabel,
    ];
    lines.push(row.map(escapeCsvCell).join(','));
  });

  // Prepend UTF-8 BOM so Microsoft Excel renders Vietnamese diacritics properly
  return `\uFEFF${lines.join('\r\n')}`;
}

function escapeHtmlSafe(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatVndPrint(val: number): string {
  return `${Math.round(Number(val) || 0).toLocaleString('vi-VN')} đ`;
}

export function buildPrintableA5PayslipHtml(params: {
  record: BankExportPayrollRow;
  month: string;
  workflowStatus?: PayrollWorkflowStatus;
  confirmation?: PayrollStaffConfirmation | null;
}): string {
  const { record, month, workflowStatus = 'Draft', confirmation } = params;
  const [yyyy = '', mm = ''] = String(month || '').split('-');
  const periodText = mm && yyyy ? `Tháng ${mm}/${yyyy}` : escapeHtmlSafe(month);
  const safeName = escapeHtmlSafe(record.fullname || record.username);
  const safeUser = escapeHtmlSafe(record.username);

  const statusText =
    workflowStatus === 'Locked'
      ? 'ĐÃ KHÓA SỔ LƯƠNG'
      : workflowStatus === 'Disputed'
        ? 'ĐANG XỬ LÝ KHIẾU NẠI'
        : workflowStatus === 'Staff_Confirming'
          ? 'ĐANG ĐỐI CHIẾU CÔNG LƯƠNG'
          : 'BẢN NHÁP ĐỐI SOÁT';

  const confirmText =
    confirmation?.status === 'CONFIRMED'
      ? `Nhân viên đã xác nhận (${escapeHtmlSafe(confirmation.updatedAt)})`
      : confirmation?.status === 'DISPUTED'
        ? `Khiếu nại: ${escapeHtmlSafe(confirmation.note || '')}`
        : 'Chưa xác nhận điện tử';

  const rateLabel =
    record.payType === 'daily' ? 'Lương định mức tháng (30 ngày)' : 'Đơn giá lương / giờ';
  const rateVal = formatVndPrint(record.salaryAmount ?? record.baseSalaryPerHour ?? 0);
  const workLabel = record.payType === 'daily' ? 'Số ngày công thực tế' : 'Tổng giờ làm thực tế';
  const workVal =
    record.payType === 'daily'
      ? `${Number(record.workedDays || 0)} ngày`
      : `${Number(record.totalHours || 0).toFixed(2)} giờ (Ca chính: ${Number(
          record.regularHours ?? record.totalHours ?? 0
        ).toFixed(2)}h · Tăng ca: ${Number(record.overtimeHours || 0).toFixed(2)}h)`;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>Phiếu Lương ${periodText} - ${safeName}</title>
  <style>
    @page { size: A5 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 12px;
      font-size: 12px;
      line-height: 1.45;
    }
    .sheet {
      max-width: 138mm;
      margin: 0 auto;
      border: 1.5px solid #0f172a;
      border-radius: 10px;
      padding: 14px 16px;
    }
    .hdr {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1.5px solid #cbd5e1;
      padding-bottom: 10px;
      margin-bottom: 12px;
    }
    .brand { font-size: 15px; font-weight: 900; letter-spacing: 0.04em; text-transform: uppercase; }
    .sub { font-size: 11px; color: #475569; margin-top: 2px; }
    .stamp {
      font-size: 10px;
      font-weight: 800;
      padding: 4px 8px;
      border-radius: 6px;
      border: 1px solid #0f172a;
      text-transform: uppercase;
    }
    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 8px 10px;
      margin-bottom: 12px;
      font-size: 11px;
    }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th, td { padding: 7px 6px; border-bottom: 1px solid #e2e8f0; font-size: 11.5px; }
    th { text-align: left; font-weight: 700; color: #334155; }
    td.num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-weight: 700;
    }
    .net-box {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #ecfdf5;
      border: 1.5px solid #059669;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 12px;
    }
    .net-label { font-size: 13px; font-weight: 900; color: #065f46; text-transform: uppercase; }
    .net-val {
      font-size: 17px;
      font-weight: 900;
      color: #047857;
      font-variant-numeric: tabular-nums;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .signs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      text-align: center;
      margin-top: 14px;
      font-size: 11px;
    }
    .sign-space { height: 48px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="hdr">
      <div>
        <div class="brand">KING'S GRILL RESTAURANT</div>
        <div class="sub">PHIẾU LƯƠNG NHÂN SỰ · ${periodText}</div>
      </div>
      <div class="stamp">${statusText}</div>
    </div>

    <div class="meta">
      <div><strong>Họ và tên:</strong> ${safeName}</div>
      <div><strong>Mã nhân viên:</strong> @${safeUser}</div>
      <div><strong>Kỳ hạch toán:</strong> ${periodText}</div>
      <div><strong>Đối chiếu:</strong> ${confirmText}</div>
    </div>

    <table>
      <tbody>
        <tr>
          <th>${rateLabel}</th>
          <td class="num">${rateVal}</td>
        </tr>
        <tr>
          <th>${workLabel}</th>
          <td class="num">${escapeHtmlSafe(workVal)}</td>
        </tr>
        <tr>
          <th><strong>Tổng lương theo công</strong></th>
          <td class="num">${formatVndPrint(record.totalBaseSalary)}</td>
        </tr>
        <tr>
          <th>+ Thưởng chuyên cần / hiệu suất</th>
          <td class="num">+ ${formatVndPrint(record.bonus)}</td>
        </tr>
        <tr>
          <th>- Khấu trừ phạt vi phạm</th>
          <td class="num">- ${formatVndPrint(record.penalty)}</td>
        </tr>
        <tr>
          <th>- Đã tạm ứng trong kỳ</th>
          <td class="num">- ${formatVndPrint(record.advances)}</td>
        </tr>
      </tbody>
    </table>

    <div class="net-box">
      <span class="net-label">Thực lĩnh chuyển khoản</span>
      <span class="net-val">${formatVndPrint(record.netPay)}</span>
    </div>

    <div class="signs">
      <div>
        <strong>Ban Quản Lý / Kế toán</strong>
        <div class="sign-space"></div>
        <div>(Ký &amp; ghi rõ họ tên)</div>
      </div>
      <div>
        <strong>Nhân viên xác nhận</strong>
        <div class="sign-space"></div>
        <div>${safeName}</div>
      </div>
    </div>
  </div>
  <script>
    window.onload = function () { setTimeout(function () { window.print(); }, 250); };
  </script>
</body>
</html>`;
}

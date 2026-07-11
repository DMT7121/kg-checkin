export type SalaryPayType = 'hourly' | 'daily';

export interface MonthlySalaryItem {
  username: string;
  fullname: string;
  payType: SalaryPayType;
  amount: number;
  standardDays: 30;
}

export interface MonthlySalaryConfig {
  version: number;
  month: string;
  standardDays: 30;
  items: MonthlySalaryItem[];
}

export interface SalaryAdjustmentRequest {
  id: string;
  createdAt: string;
  month: string;
  username: string;
  fullname: string;
  currentType: SalaryPayType | '';
  currentAmount: number;
  proposedType: SalaryPayType;
  proposedAmount: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  adminReply: string;
  updatedAt: string;
}

export const currentSalaryMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const salaryMonthLabel = (month: string) => {
  const [year, value] = month.split('-');
  return `Tháng ${Number(value)}/${year}`;
};

export const salaryTypeLabel = (type: SalaryPayType | '') =>
  type === 'daily' ? 'Lương tháng / 30 ngày' : type === 'hourly' ? 'Theo giờ' : 'Chưa cấu hình';

export const formatSalaryMoney = (amount: number) =>
  `${Math.round(Number(amount) || 0).toLocaleString('vi-VN')} đ`;

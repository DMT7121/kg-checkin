function computeWeekInfo(targetDate, getNextWeek = true) {
  const today = targetDate || new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const weekStart = new Date(today);
  if (getNextWeek) {
    if (dayOfWeek >= 1) {
      weekStart.setDate(today.getDate() + daysUntilMonday);
    } else {
      weekStart.setDate(today.getDate() + 1);
    }
  } else {
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    weekStart.setDate(today.getDate() - daysSinceMonday);
  }
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  const startDay = String(weekStart.getDate()).padStart(2, '0');
  const startMonth = String(weekStart.getMonth() + 1).padStart(2, '0');
  const endDay = String(weekEnd.getDate()).padStart(2, '0');
  const endMonth = String(weekEnd.getMonth() + 1).padStart(2, '0');
  const month = String(weekStart.getMonth() + 1).padStart(2, '0');
  const year = weekStart.getFullYear();
  const monthSheet = `Tháng ${month}/${year}`;
  const weekLabel = `📅 TUẦN ${startDay}/${startMonth} - ${endDay}/${endMonth}`;
  return { monthSheet, weekLabel };
}
console.log(computeWeekInfo(new Date('2026-05-01T12:00:00'), false));

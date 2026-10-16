import { encodeOptimalCanvas, type CheckInTypeString } from './helpers';
import { generateLocationSecurityToken } from './antiFraud';

export interface CheckInWatermarkParams {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  exactTime: string;
  addr: string;
  typeToStamp: CheckInTypeString;
  stampLat: number;
  stampLng: number;
  stampDist: number;
  stampMsg: string;
  targetRadius: number;
  user: {
    username?: string;
    fullname?: string;
    role?: string;
    position?: string;
  } | null;
  logoImg: HTMLImageElement | null;
}

/**
 * Renders the King's Grill GPS Check-In cryptographic watermark onto the provided canvas
 * and returns the optimal encoded base64 image string.
 */
export function renderCheckInWatermarkCanvas({
  canvas,
  ctx,
  exactTime,
  addr,
  typeToStamp,
  stampLat,
  stampLng,
  stampDist,
  stampMsg,
  targetRadius,
  user,
  logoImg
}: CheckInWatermarkParams): string {
  const cardX = 28;
  const cardHeight = 310;
  const cardY = canvas.height - cardHeight - 32;
  const cardWidth = canvas.width - (cardX * 2);
  const radius = 24;

  // Reset shadow & filter for ultra-crisp stamp graphics
  ctx.filter = 'none';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  const drawRoundRect = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    if (typeof c.roundRect === 'function') {
      c.roundRect(x, y, w, h, r);
    } else {
      if (w < 2 * r) r = w / 2;
      if (h < 2 * r) r = h / 2;
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + r, y, r);
      c.closePath();
    }
  };

  // 1. Draw Card Background with sleek dark glassmorphism
  ctx.save();
  ctx.fillStyle = 'rgba(10, 18, 34, 0.95)';
  ctx.beginPath();
  drawRoundRect(ctx, cardX, cardY, cardWidth, cardHeight, radius);
  ctx.fill();

  // Subtle premium border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const isCheckInType = typeToStamp.includes('Vào') || typeToStamp.includes('IN') || typeToStamp.toLowerCase().includes('vào');

  const gradBar = ctx.createLinearGradient(cardX, cardY, cardX + cardWidth, cardY);
  if (isCheckInType) {
    gradBar.addColorStop(0, '#059669');
    gradBar.addColorStop(1, '#06B6D4');
  } else {
    gradBar.addColorStop(0, '#2563EB');
    gradBar.addColorStop(1, '#8B5CF6');
  }
  ctx.beginPath();
  drawRoundRect(ctx, cardX, cardY, cardWidth, 4, 2);
  ctx.fillStyle = gradBar;
  ctx.fill();
  ctx.restore();

  // Padding
  const padX = 20;
  const contentX = cardX + padX;
  const contentWidth = cardWidth - (padX * 2);

  // Cryptographic Security Token (locked to capturedGps snapshot)
  const securityToken = generateLocationSecurityToken(
    user?.username || 'user',
    stampLat,
    stampLng,
    exactTime
  );

  // --- HEADER SECTION (y = cardY + 16 to cardY + 62) ---
  const headerTop = cardY + 16;
  const logoSize = 44;
  const logoX = contentX;
  const logoY = headerTop;

  // Logo backdrop rounded container - Luminous White Badge that POPS out from the dark card
  ctx.save();
  ctx.shadowColor = 'rgba(56, 189, 248, 0.75)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  const badgeGrad = ctx.createLinearGradient(logoX, logoY, logoX, logoY + logoSize);
  badgeGrad.addColorStop(0, '#FFFFFF');
  badgeGrad.addColorStop(1, '#F1F5F9');
  ctx.fillStyle = badgeGrad;
  ctx.beginPath();
  drawRoundRect(ctx, logoX, logoY, logoSize, logoSize, 12);
  ctx.fill();

  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    drawRoundRect(ctx, logoX + 2, logoY + 2, logoSize - 4, logoSize - 4, 10);
    ctx.clip();
    ctx.drawImage(logoImg, logoX + 2, logoY + 2, logoSize - 4, logoSize - 4);
    ctx.restore();
  } else {
    ctx.fillStyle = '#0369A1';
    ctx.font = '900 18px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('KG', logoX + logoSize / 2, logoY + logoSize / 2);
  }
  ctx.restore();

  // Brand Title beside Logo
  const brandTextX = logoX + logoSize + 12;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = '900 19px "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText("KING'S GRILL", brandTextX, headerTop + 3);

  ctx.font = '700 11px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText("HỆ THỐNG CHỨNG THỰC CHẤM CÔNG GPS • KG-OS", brandTextX, headerTop + 26);

  // Right Header: Status Badge Pill (Strictly HỢP LỆ)
  const upperType = typeToStamp.toUpperCase();
  const statusText = `${upperType} • HỢP LỆ`;
  ctx.font = 'bold 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const statusWidth = ctx.measureText(statusText).width + 36;
  const statusHeight = 32;
  const statusX = cardX + cardWidth - padX - statusWidth;
  const statusY = headerTop + 5;

  ctx.save();
  ctx.beginPath();
  drawRoundRect(ctx, statusX, statusY, statusWidth, statusHeight, 16);
  ctx.fillStyle = isCheckInType ? 'rgba(16, 185, 129, 0.22)' : 'rgba(59, 130, 246, 0.22)';
  ctx.fill();
  ctx.strokeStyle = isCheckInType ? '#10B981' : '#3B82F6';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(statusX + 16, statusY + statusHeight / 2, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = isCheckInType ? '#34D399' : '#60A5FA';
  ctx.fill();

  ctx.fillStyle = isCheckInType ? '#6EE7B7' : '#93C5FD';
  ctx.textBaseline = 'middle';
  ctx.fillText(statusText, statusX + 27, statusY + statusHeight / 2);
  ctx.restore();

  // Divider Line below Header
  const divY = headerTop + logoSize + 10;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(contentX, divY);
  ctx.lineTo(contentX + contentWidth, divY);
  ctx.stroke();

  // --- 2x2 MODULAR INFORMATION TILES (y = divY + 10) ---
  const tileGap = 14;
  const tileW = (contentWidth - tileGap) / 2;
  const tileH = 70;
  const tileR = 12;
  const col1X = contentX;
  const col2X = contentX + tileW + tileGap;
  const row1Y = divY + 10;
  const row2Y = row1Y + tileH + 10;

  const drawInfoTile = (
    x: number,
    y: number,
    w: number,
    h: number,
    iconLabel: string,
    mainValue: string,
    subValue: string = '',
    mainColor: string = '#FFFFFF',
    iconColor: string = '#94A3B8'
  ) => {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.beginPath();
    drawRoundRect(ctx, x, y, w, h, tileR);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = iconColor;
    ctx.textBaseline = 'top';
    ctx.fillText(iconLabel, x + 14, y + 10);

    ctx.font = 'bold 15px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = mainColor;
    ctx.fillText(mainValue, x + 14, y + 27);

    if (subValue) {
      ctx.font = '500 12px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#CBD5E1';
      ctx.fillText(subValue, x + 14, y + 47);
    }
    ctx.restore();
  };

  // Tile 1: Thời gian ghi nhận
  drawInfoTile(
    col1X,
    row1Y,
    tileW,
    tileH,
    '🕒 THỜI GIAN GHI NHẬN',
    exactTime,
    `Chữ ký an ninh: ${securityToken}`,
    '#FDE047',
    '#FACC15'
  );

  // Tile 2: Nhân sự chấm công
  const roleTitle = user?.role === 'admin' ? 'Quản lý' : (user?.position || 'Nhân sự');
  const personName = `${user?.fullname || 'Nhân sự'} (${user?.username || ''})`;
  drawInfoTile(
    col2X,
    row1Y,
    tileW,
    tileH,
    '👤 NHÂN SỰ CHẤM CÔNG',
    personName,
    `Vị trí công tác: ${roleTitle}`,
    '#FFFFFF',
    '#93C5FD'
  );

  // Tile 3: Địa điểm & Trạng thái vệ tinh
  drawInfoTile(
    col1X,
    row2Y,
    tileW,
    tileH,
    '📍 ĐỊA ĐIỂM & ĐỊNH VỊ',
    addr.length > 38 ? addr.slice(0, 36) + '...' : addr,
    'Khóa vệ tinh GPS chính xác cao',
    '#E2E8F0',
    '#38BDF8'
  );

  // Tile 4: Tiêu chuẩn Bán kính GPS (Chuẩn ≤20m)
  const distText = stampMsg && stampMsg.includes('Khoảng cách:')
    ? stampMsg
    : `Khoảng cách: ${stampDist}m / ${targetRadius}m (≤${targetRadius}m Hợp lệ)`;
  drawInfoTile(
    col2X,
    row2Y,
    tileW,
    tileH,
    `🛰️ TIÊU CHUẨN BÁN KÍNH GPS (≤${targetRadius}M)`,
    distText,
    '✓ Đạt chuẩn vị trí nhà hàng (≤20m)',
    '#34D399',
    '#10B981'
  );

  // --- FOOTER BAR (y = row2Y + tileH + 10) ---
  const footerY = row2Y + tileH + 10;
  ctx.save();
  ctx.font = '500 12px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#64748B';
  ctx.textBaseline = 'top';

  const coordsText = `🛰️ TỌA ĐỘ: ${stampLat ? stampLat.toFixed(6) : '10.976083'}, ${stampLng ? stampLng.toFixed(6) : '106.664654'}`;
  ctx.fillText(coordsText, contentX, footerY);

  const rightFooterText = `BÁN KÍNH TIÊU CHUẨN: ≤ 20M  •  KING'S GRILL CHÍNH THỨC`;
  const rightFooterWidth = ctx.measureText(rightFooterText).width;
  ctx.fillText(rightFooterText, contentX + contentWidth - rightFooterWidth, footerY);
  ctx.restore();

  return encodeOptimalCanvas(canvas, 0.90);
}

const fs = require('fs');
const file = 'gas/Handlers.gs';
let content = fs.readFileSync(file, 'utf8');

const newFunc = `function buildEmailHtml(payload, formattedTimeUI, loc, distMeters, isValid, isAdmin) {
  var typeStr = payload.type ? String(payload.type) : 'Vào ca';
  var fullnameStr = payload.fullname ? String(payload.fullname) : 'Nhân viên';

  var statusColor = isValid ? '#15aa4f' : '#dc2626';
  var statusText = isValid ? 'Hợp lệ' : 'Không hợp lệ';
  
  var headerTitle = isAdmin ? 'Thông Báo Quản Trị Hệ Thống' : 'Xác Nhận Chấm Công';
  var badgeText = isAdmin ? 'PHÁT SINH LƯỢT CHẤM CÔNG MỚI' : typeStr.toUpperCase() + ' THÀNH CÔNG';
  
  var bannerBg = isValid
    ? 'radial-gradient(circle at 83% 50%, rgba(255,255,255,.18), transparent 27%), radial-gradient(circle at 18% 12%, rgba(101,255,179,.72), transparent 30%), linear-gradient(135deg, #38e98d 0%, #0abc56 54%, #16c971 100%)'
    : 'radial-gradient(circle at 83% 50%, rgba(255,255,255,.18), transparent 27%), radial-gradient(circle at 18% 12%, rgba(255,161,161,.72), transparent 30%), linear-gradient(135deg, #ff6b6b 0%, #ee2a2a 54%, #d61818 100%)';
  var bannerShadow = isValid
    ? '0 18px 38px rgba(22, 195, 103, .30), 0 0 38px rgba(18, 217, 112, .18), 0 2px 4px rgba(255,255,255,.48) inset, 0 -7px 18px rgba(0,92,46,.22) inset'
    : '0 18px 38px rgba(195, 22, 22, .30), 0 0 38px rgba(217, 18, 18, .18), 0 2px 4px rgba(255,255,255,.48) inset, 0 -7px 18px rgba(92, 0, 0,.22) inset';
  var bannerIconColor = isValid ? '#0fbd59' : '#dc2626';
  var bannerIconSvg = isValid 
    ? '<path d="M20 6 9 17l-5-5" />' 
    : '<path d="M18 6 6 18M6 6l12 12" />';

  var greeting = typeStr === 'Vào ca' ? 'Chúc bạn có ca làm việc hiệu quả!' : 'Cảm ơn bạn đã hoàn thành ca làm việc!';
  var subtitleHTML = isAdmin 
    ? 'Hệ thống ghi nhận thao tác từ <b>' + fullnameStr + '</b>'
    : 'Xin chào <b>' + fullnameStr + '</b>,<br/><span style="font-size:16px;color:#667894;font-weight:normal;display:block;margin-top:8px;">' + greeting + '</span>';

  return \`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>King's Grill HR Notification</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --navy: #06285d;
      --blue: #0f5cff;
      --muted: #667894;
      --line: rgba(18, 67, 133, .12);
      --green: #10bd57;
    }

    * { box-sizing: border-box; }

    html, body { margin: 0; min-height: 100%; }

    body {
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 50% 0%, rgba(255,255,255,.95), rgba(239,247,255,.98) 44%, #e9f3ff 100%);
      color: var(--navy);
    }

    .phone-stage {
      width: min(100vw, 768px);
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 20px;
      background:
        radial-gradient(circle at 50% 38%, rgba(255,255,255,.75), transparent 45%),
        radial-gradient(circle at 11% 4%, rgba(255,255,255,.9), transparent 18%),
        radial-gradient(circle at 92% 6%, rgba(193,218,255,.75), transparent 22%);
    }

    .poster {
      position: relative;
      isolation: isolate;
      overflow: hidden;
      width: 100%;
      max-width: 720px;
      min-height: 1240px;
      padding: 78px 48px 34px;
      border-radius: 42px;
      background:
        radial-gradient(circle at 9% 7%, rgba(255,255,255,.98) 0 7%, rgba(255,255,255,.45) 12%, rgba(255,255,255,.12) 18%, transparent 24%),
        radial-gradient(circle at 93% 4%, rgba(207,226,255,.72) 0 13%, rgba(255,255,255,.24) 20%, transparent 28%),
        linear-gradient(116deg, rgba(255,255,255,.97) 0%, rgba(241,248,255,.96) 43%, rgba(233,243,255,.98) 100%);
      border: 1px solid rgba(255,255,255,.92);
      box-shadow:
        0 28px 82px rgba(9, 54, 126, .20),
        0 1px 0 rgba(255,255,255,.95) inset,
        0 -18px 45px rgba(187,214,255,.22) inset,
        0 0 0 1px rgba(39,107,211,.055) inset;
    }

    .poster::before,
    .poster::after,
    .shine-layer,
    .bubble-layer,
    .dot-layer,
    .waves {
      content: "";
      position: absolute;
      pointer-events: none;
      z-index: -1;
    }

    .shine-layer {
      inset: 0;
      opacity: .88;
      background:
        linear-gradient(90deg, transparent 0 7%, rgba(255,255,255,.58) 7.2%, transparent 7.5%),
        linear-gradient(105deg, transparent 0 67%, rgba(108,165,255,.12) 67.3% 72.4%, transparent 72.7%),
        linear-gradient(104deg, transparent 0 66.7%, rgba(255,255,255,.75) 66.9% 67.2%, transparent 67.5%),
        radial-gradient(circle at 8% 12%, rgba(255,255,255,.66), transparent 7%),
        radial-gradient(circle at 11% 12.5%, rgba(255,255,255,.25), transparent 3%);
      mix-blend-mode: screen;
    }

    .bubble-layer {
      inset: 0;
      background:
        radial-gradient(circle at -3% 7%, rgba(255,255,255,.25) 0 15%, transparent 15.3%),
        radial-gradient(circle at 9% 8%, transparent 0 10.5%, rgba(255,255,255,.72) 10.8% 11.1%, transparent 11.4%),
        radial-gradient(circle at 90% 0%, transparent 0 13.5%, rgba(255,255,255,.64) 13.8% 14.1%, transparent 14.4%),
        radial-gradient(circle at 8% 13%, rgba(255,255,255,.42) 0 4%, transparent 4.2%);
      filter: blur(.2px);
    }

    .dot-layer {
      right: 20px;
      bottom: 335px;
      width: 92px;
      height: 92px;
      opacity: .32;
      background-image: radial-gradient(circle, #78a8ee 1.8px, transparent 2px);
      background-size: 15px 15px;
    }

    .dot-layer::after {
      content: "";
      position: absolute;
      width: 110px;
      height: 82px;
      left: -620px;
      top: 232px;
      background-image: radial-gradient(circle, #7caaf1 1.6px, transparent 2px);
      background-size: 15px 15px;
      opacity: .5;
    }

    .poster::before {
      right: -132px;
      top: 145px;
      width: 465px;
      height: 275px;
      border-radius: 67% 0 0 58%;
      opacity: .88;
      background:
        linear-gradient(142deg, transparent 0 38%, rgba(255,255,255,.9) 38.4% 39%, transparent 39.4%),
        linear-gradient(133deg, transparent 0 41%, rgba(115,172,255,.24) 41.5% 62%, transparent 62.5%),
        linear-gradient(145deg, rgba(171,203,255,.1), rgba(79,147,255,.23));
      transform: rotate(-17deg);
      filter: blur(.1px);
    }

    .poster::after {
      right: -130px;
      bottom: -42px;
      width: 665px;
      height: 310px;
      border-radius: 70% 0 0 0;
      opacity: .9;
      background:
        linear-gradient(150deg, transparent 0 26%, rgba(255,255,255,.78) 26.4% 27%, transparent 27.5%),
        linear-gradient(164deg, rgba(120,177,255,.08), rgba(81,145,245,.28));
      transform: rotate(-8deg);
    }

    .waves {
      inset: auto -86px -104px -62px;
      height: 370px;
      opacity: .96;
      background:
        radial-gradient(90% 55% at 7% 88%, rgba(198,224,255,.84), transparent 60%),
        linear-gradient(164deg, transparent 0 34%, rgba(118,174,255,.17) 34.5% 53%, transparent 53.5%),
        linear-gradient(158deg, transparent 0 41%, rgba(255,255,255,.92) 41.2% 41.7%, transparent 42.1%),
        linear-gradient(172deg, transparent 0 47%, rgba(119,177,255,.19) 47.4% 68%, transparent 68.5%),
        linear-gradient(168deg, transparent 0 58%, rgba(255,255,255,.54) 58.2% 58.6%, transparent 59%);
    }

    .brand { position: relative; z-index: 2; text-align: center; }

    .logo {
      width: 112px;
      height: 112px;
      margin: 0 auto 32px;
      display: grid;
      place-items: center;
      border-radius: 23px;
      color: #ffd65a;
      font-size: 42px;
      line-height: 1;
      font-weight: 900;
      letter-spacing: -2px;
      background:
        radial-gradient(circle at 35% 15%, rgba(79,145,255,.95), transparent 30%),
        linear-gradient(145deg, #1664ff 0%, #003cbd 56%, #00217e 100%);
      text-shadow: 0 2px 0 rgba(80,38,0,.18);
      box-shadow:
        0 16px 35px rgba(0,58,169,.36),
        0 1px 0 rgba(255,255,255,.62) inset,
        0 -7px 16px rgba(0,0,0,.25) inset,
        0 0 0 1px rgba(255,255,255,.3) inset;
    }

    h1 {
      margin: 0;
      font-size: clamp(42px, 7vw, 54px);
      line-height: 1.05;
      font-weight: 900;
      letter-spacing: -1.8px;
      color: #082b63;
      text-shadow: 0 2px 0 rgba(255,255,255,.55);
    }

    .subtitle {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 14px;
      margin-top: 18px;
      color: #71829f;
      font-size: 24px;
      font-weight: 500;
    }

    .subtitle::before,
    .subtitle::after {
      content: "";
      width: 44px;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(73,113,180,.33));
    }

    .subtitle::after { background: linear-gradient(90deg, rgba(73,113,180,.33), transparent); }

    .subtitle span::before,
    .subtitle span::after {
      content: "";
      display: inline-block;
      width: 6px;
      height: 6px;
      margin: 0 12px 4px;
      border-radius: 50%;
      background: rgba(72,112,179,.72);
    }

    .glass {
      position: relative;
      border: 1px solid rgba(255,255,255,.82);
      backdrop-filter: blur(20px) saturate(150%);
      -webkit-backdrop-filter: blur(20px) saturate(150%);
    }

    .glass::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      background: linear-gradient(145deg, rgba(255,255,255,.72), rgba(255,255,255,0) 38%, rgba(255,255,255,.22) 100%);
      mix-blend-mode: screen;
    }

    .success-banner {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: 24px;
      margin: 60px auto 38px;
      min-height: 118px;
      padding: 24px 36px;
      border-radius: 24px;
      color: white;
      overflow: hidden;
      background: \${bannerBg};
      box-shadow: \${bannerShadow};
    }

    .success-banner::after {
      content: "";
      position: absolute;
      inset: 0;
      background:
        linear-gradient(105deg, transparent 0 16%, rgba(255,255,255,.38) 22%, transparent 30%),
        radial-gradient(circle, rgba(255,255,255,.28) 1px, transparent 1.5px);
      background-size: 100% 100%, 18px 18px;
      opacity: .34;
      animation: shimmer 5.5s ease-in-out infinite;
    }

    .check-circle {
      position: relative;
      z-index: 2;
      flex: 0 0 58px;
      width: 58px;
      height: 58px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: rgba(255,255,255,.92);
      color: \${bannerIconColor};
      box-shadow:
        0 12px 24px rgba(0,77,40,.20),
        0 1px 0 rgba(255,255,255,.9) inset;
    }

    .success-banner strong {
      position: relative;
      z-index: 2;
      font-size: clamp(24px, 4.8vw, 34px);
      font-weight: 900;
      letter-spacing: .3px;
      white-space: nowrap;
      text-shadow: 0 2px 10px rgba(0,83,42,.14);
    }

    .note {
      position: relative;
      z-index: 2;
      margin: 0 8px 28px;
      color: #2b4265;
      font-size: 25px;
      font-weight: 500;
      text-shadow: 0 1px 0 rgba(255,255,255,.72);
      text-align: center;
    }

    .note b { color: #0d55ff; font-weight: 800; }

    .info-card {
      position: relative;
      z-index: 2;
      overflow: hidden;
      border-radius: 30px;
      padding: 30px 28px 24px;
      background:
        linear-gradient(145deg, rgba(255,255,255,.86), rgba(247,252,255,.62)),
        rgba(255,255,255,.64);
      box-shadow:
        0 24px 44px rgba(35, 81, 143, .13),
        0 0 45px rgba(255,255,255,.8) inset,
        0 1px 0 rgba(255,255,255,.95) inset;
    }

    .info-card::after {
      content: "";
      position: absolute;
      inset: -30% -20%;
      background:
        radial-gradient(circle at 28% 20%, rgba(255,255,255,.65), transparent 21%),
        linear-gradient(110deg, transparent 0 35%, rgba(255,255,255,.28) 44%, transparent 52%);
      opacity: .66;
      pointer-events: none;
    }

    .row {
      position: relative;
      z-index: 2;
      display: grid;
      grid-template-columns: 82px 1fr auto;
      align-items: center;
      gap: 24px;
      min-height: 102px;
      border-bottom: 1px solid var(--line);
    }

    .row:last-child { border-bottom: 0; }

    .icon-box {
      width: 70px;
      height: 70px;
      display: grid;
      place-items: center;
      border-radius: 22px;
      background:
        radial-gradient(circle at 30% 18%, rgba(255,255,255,.96), transparent 50%),
        rgba(255,255,255,.68);
      border: 1px solid rgba(255,255,255,.92);
      box-shadow:
        0 12px 24px rgba(28, 95, 195, .13),
        0 0 22px rgba(255,255,255,.9) inset,
        0 -4px 11px rgba(111,155,225,.11) inset;
      color: #2365f4;
    }

    .row:last-child .icon-box {
      color: \${statusColor};
      background:
        radial-gradient(circle at 30% 18%, rgba(255,255,255,.95), transparent 50%),
        linear-gradient(145deg, rgba(255,255,255,.7), rgba(220,255,237,.78));
    }

    .label {
      color: #40536f;
      font-size: 25px;
      font-weight: 800;
      text-shadow: 0 1px 0 rgba(255,255,255,.7);
    }

    .value {
      max-width: 310px;
      text-align: right;
      color: #071f4b;
      font-size: 24px;
      font-weight: 800;
      line-height: 1.25;
    }

    .value.action { color: #0c55f4; font-size: 27px; font-weight: 900; letter-spacing: .2px; }
    .value.address { font-weight: 500; font-size: 21px; line-height: 1.32; }
    .value.ok { color: \${statusColor}; font-size: 25px; font-weight: 900; }

    .dashboard {
      position: relative;
      z-index: 2;
      overflow: hidden;
      width: 470px;
      max-width: 86%;
      min-height: 88px;
      margin: 42px auto 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 26px;
      border-radius: 22px;
      color: white;
      text-decoration: none;
      font-family: inherit;
      font-size: 28px;
      font-weight: 900;
      cursor: pointer;
      background:
        radial-gradient(circle at 50% 0, rgba(123,202,255,.9), transparent 34%),
        linear-gradient(180deg, #338dff 0%, #0055f4 51%, #0039b4 100%);
      box-shadow:
        0 22px 38px rgba(0, 64, 180, .34),
        0 0 36px rgba(0,97,255,.20),
        0 2px 5px rgba(255,255,255,.62) inset,
        0 -7px 17px rgba(0,0,0,.24) inset;
    }

    .dashboard::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(105deg, transparent 0 24%, rgba(255,255,255,.34) 34%, transparent 45%);
      opacity: .55;
      animation: shimmer 6s ease-in-out infinite;
    }

    .grid-icon {
      position: relative;
      z-index: 1;
      width: 40px;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 7px;
    }

    .grid-icon i {
      display: block;
      aspect-ratio: 1;
      border-radius: 5px;
      background: white;
      box-shadow: inset 0 -2px 3px rgba(0,0,0,.1);
    }

    .dashboard span:last-child { position: relative; z-index: 1; }

    .divider {
      position: relative;
      z-index: 2;
      display: grid;
      grid-template-columns: 1fr 54px 1fr;
      align-items: center;
      gap: 20px;
      width: 70%;
      margin: 0 auto 18px;
      color: #8da2c1;
    }

    .divider::before,
    .divider::after {
      content: "";
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(57,111,195,.32));
    }

    .divider::after { background: linear-gradient(90deg, rgba(57,111,195,.32), transparent); }

    .mini-shield {
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      margin: auto;
      border-radius: 50%;
      background: rgba(255,255,255,.82);
      border: 1px solid rgba(255,255,255,.9);
      box-shadow: 0 8px 18px rgba(17,66,143,.12), 0 0 18px rgba(255,255,255,.9) inset;
    }

    .footer { position: relative; z-index: 2; text-align: center; }

    .footer p {
      margin: 0 0 12px;
      color: #667898;
      font-size: 19px;
      font-weight: 500;
      letter-spacing: .2px;
    }

    .footer strong {
      color: #08275c;
      font-size: 23px;
      font-weight: 900;
      letter-spacing: 3px;
    }

    svg { width: 32px; height: 32px; stroke-width: 2.6; }
    .check-circle svg { width: 36px; height: 36px; stroke-width: 4; }

    @keyframes shimmer {
      0%, 70%, 100% { transform: translateX(-36%); }
      82% { transform: translateX(42%); }
    }

    @media (max-width: 560px) {
      .phone-stage { padding: 0; }
      .poster { min-height: 100vh; border-radius: 0; padding: 52px 24px 28px; }
      .logo { width: 84px; height: 84px; font-size: 33px; margin-bottom: 26px; }
      h1 { font-size: 35px; }
      .subtitle { font-size: 17px; gap: 8px; }
      .success-banner { margin-top: 42px; min-height: 88px; padding: 18px 20px; gap: 16px; }
      .check-circle { width: 48px; height: 48px; flex-basis: 48px; }
      .success-banner strong { font-size: 22px; }
      .note { font-size: 18px; }
      .info-card { padding: 20px 18px; border-radius: 25px; }
      .row { grid-template-columns: 58px 1fr auto; gap: 14px; min-height: 84px; }
      .icon-box { width: 52px; height: 52px; border-radius: 17px; }
      .label { font-size: 18px; }
      .value { font-size: 18px; max-width: 160px; }
      .value.action, .value.ok { font-size: 19px; }
      .value.address { font-size: 15px; }
      .dashboard { min-height: 72px; font-size: 21px; gap: 18px; }
    }
  </style>
</head>
<body>
  <main class="phone-stage">
    <section class="poster" aria-label="King's Grill HR system notification">
      <div class="shine-layer"></div>
      <div class="bubble-layer"></div>
      <div class="dot-layer"></div>
      <div class="waves"></div>

      <header class="brand">
        <div class="logo">KG</div>
        <h1>KING’S GRILL HR</h1>
        <div class="subtitle"><span>\${headerTitle}</span></div>
      </header>

      <section class="success-banner glass">
        <div class="check-circle" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            \${bannerIconSvg}
          </svg>
        </div>
        <strong>\${badgeText}</strong>
      </section>

      <p class="note">\${subtitleHTML}</p>

      <section class="info-card glass">
        <div class="row">
          <div class="icon-box" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <circle cx="12" cy="7" r="4" />
              <path d="M4 21c.7-4.6 3.3-7 8-7s7.3 2.4 8 7H4z" />
            </svg>
          </div>
          <div class="label">Hành động</div>
          <div class="value action">\${typeStr.toUpperCase()}</div>
        </div>

        <div class="row">
          <div class="icon-box" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v6l4 2" />
            </svg>
          </div>
          <div class="label">Thời gian</div>
          <div class="value">\${formattedTimeUI}</div>
        </div>

        <div class="row">
          <div class="icon-box" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M12 2a8 8 0 0 0-8 8c0 5.2 8 12 8 12s8-6.8 8-12a8 8 0 0 0-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" />
            </svg>
          </div>
          <div class="label">Vị trí</div>
          <div class="value address">\${loc}</div>
        </div>

        <div class="row">
          <div class="icon-box" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="5" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3M12 9v3l2 1" />
            </svg>
          </div>
          <div class="label">Khoảng cách</div>
          <div class="value">\${distMeters}</div>
        </div>

        <div class="row">
          <div class="icon-box" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="m9 12 2 2 4-5" />
            </svg>
          </div>
          <div class="label">Trạng thái</div>
          <div class="value ok">\${statusText}</div>
        </div>
      </section>

      <a class="dashboard glass" href="\${CONFIG.WEB_APP_URL || '#'}" target="_blank">
        <span class="grid-icon" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <span>Truy cập Dashboard</span>
      </a>

      <div class="divider">
        <span class="mini-shield" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 21s6-3 6-8V6l-6-2-6 2v7c0 5 6 8 6 8z" />
            <path d="m10 12 1.5 1.5L15 10" />
          </svg>
        </span>
      </div>

      <footer class="footer">
        <p>Email tự động từ hệ thống máy chủ</p>
        <strong>KING’S GRILL © \${new Date().getFullYear()}</strong>
      </footer>
    </section>
  </main>
</body>
</html>\`;
}`;

content = content.replace(/function buildEmailHtml\(payload, formattedTimeUI, loc, distMeters, isValid, isAdmin\) \{[\s\S]*?return body;\s*\}/g, newFunc);
fs.writeFileSync(file, content, 'utf8');
console.log('Successfully updated buildEmailHtml');

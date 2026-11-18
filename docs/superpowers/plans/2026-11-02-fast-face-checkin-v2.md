# Fast Multi-Employee Face Recognition Attendance (v2 Parallel Mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` (inline execution) and `superpowers:test-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and integrate the parallel Ultra-Fast Multi-Employee Face-Recognition Attendance system (`v2`) alongside Classic Check-In (`v1`) with a segmented toggle switch, open Login Kiosk mode (`<= 25m` GPS), 5-angle ArcFace 512-D + MiniFASNetV2 anti-spoofing on-device biometrics, 30-minute per-employee cooldown, `Vào 1 / Ra 1 / Vào 2 / Ra 2` + `< 06:00` overnight rule, `> 120m` late-fine protection, silent Drive watermark upload (`Col G`), and 100% compatibility with the existing Google Spreadsheet (`📊 TỔNG HỢP ✔️CHẤM CÔNG` & `Payroll`).

**Architecture:**
- **Shared Attendance Sequence State Machine (`src/utils/attendanceSequence.ts`)**: Deterministic `06:00 -> 05:59` GMT+7 workday cycle resolving `Vào 1 -> Ra 1 -> Vào 2 -> Ra 2` (max 4 punches), `< 06:00` overnight `Ra 1 / Ra 2`, and 30-minute per-`username` cooldown.
- **On-Device Biometric Engine (`src/services/faceRecognitionV2.ts`)**: MediaPipe `FaceLandmarker` (478 3D landmarks + head pose matrix) + `onnxruntime-web` WASM SIMD running 5-point `112x112` Umeyama-aligned `w600k_mbf.onnx` (ArcFace 512-D) + `minifasnet_v2.onnx` (`80x80` passive anti-spoofing) + 3D Z-depth check, cached in `CacheStorage` (`kg-face-models-v2`).
- **Dual-Write Backend (`functions/api.js` + `migrations/0002_face_profiles.sql` + `gas/*.gs`)**: Hidden protected `CONFIG_FACE_ID` sheet + Cloudflare D1 `edge_face_profiles`, server-side cosine verification (`>= 0.60`), anti-duplicate identity check (`>= 0.68`), 30-minute per-user cooldown, `Vào 1`-only late check with `> 120m` review flag, `v2_face` non-blocking schedule warning, and idempotent post-upload email receipt (`sendEmailAfterUpload`).
- **Parallel UI (`FastFaceScannerV2.tsx`, `FaceEnrollmentModal.tsx`, `CheckIn.tsx`, `Login.tsx`, `HrList.tsx`)**: Architectural HUD full-screen mobile scanner (`100dvh`, solid `#0D1015` / `#161A22` surfaces, `Be Vietnam Pro` + `JetBrains Mono` `tabular-nums`, zero glassmorphism), 5-angle enrollment modal, segmented v1/v2 toggle, open Login Kiosk trigger, and Admin Face ID unlock/reset controls.

**Tech Stack:** TypeScript, React 19, Zustand, Tailwind CSS, `@mediapipe/tasks-vision`, `onnxruntime-web`, Cloudflare Pages Functions + D1 (`functions/api.js`), Google Apps Script (`gas/*.gs`), Node Test Runner (`node --test`).

---

## File Structure & Responsibility Map

- **Create:**
  - `src/utils/attendanceSequence.ts` — Unified label classifiers (`isCheckInLabel`, `isCheckOutLabel`), GMT+7 `06:00` workday cycle resolver (`resolveNextAttendancePunch`), and per-employee 30-minute cooldown store (`kg_user_cooldown_v2`).
  - `src/services/faceRecognitionV2.ts` — Int8 Base64 vector quantization/dequantization, 5-point `112x112` Umeyama affine alignment, head pose classifier (`CENTER/LEFT/RIGHT/UP/DOWN`), 1:N matcher (`0.65*max + 0.35*centroid`), 3-frame temporal consensus voter, `CacheStorage` loader, MediaPipe + ONNX Runtime Web inference pipeline.
  - `src/components/FaceEnrollmentModal.tsx` — Guided 5-angle enrollment HUD modal with brightness/sharpness meter, internal consistency check, anti-duplicate guard, and `ENROLL_FACE_PROFILE` submission.
  - `src/components/FastFaceScannerV2.tsx` — Full-screen (`fixed inset-0 z-[70] h-[100dvh]`) mobile/tablet auto-punch scanner supporting both logged-in parallel mode and open Login Kiosk mode, Kalman GPS gate (`<= 25m`), TTS voice feedback, schedule advisory banner, and silent watermarked Drive upload via `offlineQueue.ts`.
  - `migrations/0002_face_profiles.sql` — Cloudflare D1 `edge_face_profiles` table & indexes.
  - `public/models/face-v2/` — Self-hosted `face_landmarker.task`, `w600k_mbf.onnx`, `minifasnet_v2.onnx`, and MediaPipe/ONNX WASM runtime binaries.
  - `tests/face-checkin-v2.test.ts` — Comprehensive TDD suite covering sequence rules, GAS `Engine.gs`/`Handlers.gs`/`ControlCenterService.gs`, Cloudflare Edge D1 handlers, and biometric vector/alignment/ONNX smoke tests.
- **Modify:**
  - `src/utils/helpers.ts` — Extend `CheckInTypeString`, `getSmartCheckInRecommendation`, `getRemainingCooldownSeconds` (30m per-user), `resolveAudioMeta`, `auditCheckInAnomalies` to use `attendanceSequence.ts`.
  - `src/types.ts` — Add `FaceProfileSummary`, `CheckInMode`, and extended `CheckInResponse` fields (`scheduleWarning`, `suspectedMissedCheckIn`).
  - `gas/ControlCenterService.gs` — Explicitly protect `'CONFIG_FACE_ID'` in `isProtectedSystemSheet`.
  - `gas/Engine.gs` — Update `createRowData` (`isCheckInStatus_`, `isCheckOutStatus_`) so `Vào 1..Ra 2` + `< 06:00` overnight punches aggregate accurately on `📊 TỔNG HỢP ✔️CHẤM CÔNG` & `Payroll`.
  - `gas/JsonCacheService.gs` — Count `Vào 1..2` in `todayPresent`.
  - `gas/Handlers.gs` — 30m cooldown, `Vào 1`-only late check + `> 120m` review guard, `v2_face` schedule warning + `liveVectorB64` cosine verification, `CONFIG_FACE_ID` handlers (`GET_FACE_PROFILES`, `ENROLL_FACE_PROFILE`, `RESET_FACE_PROFILE`, `GET_KIOSK_ATTENDANCE_STATE`), row/email formatting for `Vào 1..Ra 2`, and idempotent `sendEmailAfterUpload` in `handleUploadCheckinImage`.
  - `gas/Code.gs` — Route new Face ID & Kiosk actions in `doPost`.
  - `functions/api.js` — D1 `edge_face_profiles` auto-migration, `GET_FACE_PROFILES`, `ENROLL_FACE_PROFILE`, `RESET_FACE_PROFILE` (admin-only), `GET_KIOSK_ATTENDANCE_STATE`, 30m D1 cooldown, server-side `liveVectorB64` check, and unified `Vào/Ra` stats counters.
  - `src/pages/CheckIn.tsx` — Segmented mode toggle (`Chụp Xác Nhận (v1)` ↔ `Quét Khuôn Mặt (v2)`), Face ID enrollment status/trigger, unified `Vào 1..Ra 2` labels + 30m per-user cooldown while preserving v1 manual `"Ra 1 (Quên chấm Vào)"` override.
  - `src/pages/Login.tsx` — Open **"Trạm Face ID Nhanh"** button launching `FastFaceScannerV2` (`isKioskMode = true`).
  - `src/pages/admin/HrList.tsx` — Admin Face ID status badge & **"Mở khóa / Đặt lại Face ID"** (`RESET_FACE_PROFILE`) button per employee.
  - `src/pages/Dashboard.tsx` & `src/pages/ActivityHistory.tsx` — Replace hardcoded `'Vào ca'`/`'Ra ca'` checks with `isCheckInLabel` / `isCheckOutLabel`.
  - `vite.config.ts` & `package.json` — Configure clean chunking/WASM asset handling and register `tests/face-checkin-v2.test.ts` in `npm test`.

---

### Task 1: Unified Attendance Sequence State Machine & 30-Minute Per-User Cooldown (TDD)

**Files:**
- Create: `tests/face-checkin-v2.test.ts`
- Create: `src/utils/attendanceSequence.ts`
- Modify: `src/utils/helpers.ts`, `src/types.ts`, `package.json`

- [ ] **Step 1: Write failing unit tests in `tests/face-checkin-v2.test.ts`** for `isCheckInLabel`, `isCheckOutLabel`, `resolveNextAttendancePunch` (`06:00–23:59` `Vào 1 -> Ra 1 -> Vào 2 -> Ra 2 -> MAX_4_PUNCHES`, `< 06:00` overnight `Ra 1 / Ra 2`, mixed `Vào ca` + `Ra 1` compatibility, `manualOverrideOut`), and per-employee 30-minute cooldown isolation (`Employee A` locked for 30m while `Employee B` is allowed immediately on the same device).
- [ ] **Step 2: Run `node --test tests/face-checkin-v2.test.ts`** and verify failure (`ERR_MODULE_NOT_FOUND`).
- [ ] **Step 3: Implement `src/utils/attendanceSequence.ts`, update `src/types.ts`, `src/utils/helpers.ts`, and `package.json` test script.**
- [ ] **Step 4: Re-run `npm test`** and verify all existing 21 tests + new Task 1 tests pass.

**Review Focus:** Verify GMT+7 date boundary math around `00:00–05:59` and `06:00:00` works deterministically regardless of host OS timezone, and verify `Kiểm tra` logs are ignored by punch counters and cooldowns.

---

### Task 2: GAS Backend Upgrade (`Engine.gs`, `Handlers.gs`, `ControlCenterService.gs`, `JsonCacheService.gs`, `Code.gs`) + Companion Sync (TDD)

**Files:**
- Modify: `tests/face-checkin-v2.test.ts`
- Modify: `gas/ControlCenterService.gs`, `gas/Engine.gs`, `gas/JsonCacheService.gs`, `gas/Handlers.gs`, `gas/Code.gs`

- [ ] **Step 1: Add failing GAS VM sandbox tests in `tests/face-checkin-v2.test.ts`** testing:
  1. `Engine.gs` (`processSelectedSheetEnhanced` / `createRowData`): `Vào 1`, `Ra 1`, `Vào 2`, `Ra 2` + overnight `< 06:00` (`01:30`) produce exact regular & overtime hours on `📊 TỔNG HỢP ✔️CHẤM CÔNG`.
  2. `Handlers.gs` (`handleCheckInOut`): 30m per-user cooldown; `Vào 1` late `20m` -> `(Trễ 20p)` + `10,000đ` `BonusPenalty`; `Vào 1` late `180m` (`> 120m`) -> `(Lệch ca >2h - Chờ đối soát)` + zero `BonusPenalty`; `Vào 2` -> zero late fine; `Thu-Sat 17:00` schedule gate blocks `v1` (`SCHEDULE_REQUIRED`) but allows `v2_face` with `scheduleWarning: true`; server-side `liveVectorB64` verification rejects spoofed vectors (`FACE_VERIFICATION_FAILED`).
  3. `CONFIG_FACE_ID` lifecycle: `ENROLL_FACE_PROFILE` creates hidden protected sheet (`isProtectedSystemSheet('CONFIG_FACE_ID') === true`), locks profile (`IsLocked = TRUE`), blocks cross-employee duplicate face (`cosine >= 0.68`), `GET_FACE_PROFILES` & `GET_KIOSK_ATTENDANCE_STATE` return minimal non-PII data, `RESET_FACE_PROFILE` enforces Admin RBAC.
  4. `handleUploadCheckinImage`: writes `=HYPERLINK` to Col G and sends post-upload email once (`emailSent: true` idempotency).
- [ ] **Step 2: Run `node --test tests/face-checkin-v2.test.ts`** and confirm new GAS tests fail.
- [ ] **Step 3: Implement updates in `gas/*.gs` and run `npm run sync:gas`.**
- [ ] **Step 4: Run `npm test` and `npm run sync:gas:check`** — confirm 100% green and companion sync parity.

**Review Focus:** Ensure zero regression on `tests/wave1-p0.test.ts`, `tests/schedule-registration-enforcement.test.ts`, and `tests/checkin-history-completeness.test.ts`. Ensure `CONFIG_FACE_ID` is hidden and never classified as an attendance source sheet.

---

### Task 3: Cloudflare Edge D1 Gateway (`functions/api.js` + `migrations/0002_face_profiles.sql`) (TDD)

**Files:**
- Create: `migrations/0002_face_profiles.sql`
- Modify: `functions/api.js`, `tests/face-checkin-v2.test.ts`

- [ ] **Step 1: Add failing Edge Gateway tests in `tests/face-checkin-v2.test.ts`** using an in-memory D1 mock testing `ENROLL_FACE_PROFILE` (lock + anti-duplicate + GAS fallback), `GET_FACE_PROFILES`, `RESET_FACE_PROFILE` (403 for non-admin, 200 for admin), `GET_KIOSK_ATTENDANCE_STATE`, and `CHECK_IN_OUT` (`v2_face` server cosine verification + 30m D1 per-user cooldown + `Vào 1/Ra 1` stats).
- [ ] **Step 2: Run `node --test tests/face-checkin-v2.test.ts`** and confirm Edge tests fail.
- [ ] **Step 3: Create `migrations/0002_face_profiles.sql` and update `functions/api.js`.**
- [ ] **Step 4: Run `npm test`** and confirm 100% pass.

**Review Focus:** Ensure `RESET_FACE_PROFILE` is inside `ADMIN_ONLY_ACTIONS`, `GET_FACE_PROFILES` / `GET_KIOSK_ATTENDANCE_STATE` validate GPS proximity when called in Kiosk mode and leak zero PII/passwords/tokens.

---

### Task 4: On-Device Biometric Engine & Self-Hosted Model Assets (`src/services/faceRecognitionV2.ts`) (TDD)

**Files:**
- Create: `public/models/face-v2/` (`face_landmarker.task`, `w600k_mbf.onnx`, `minifasnet_v2.onnx`, WASM binaries)
- Create: `src/services/faceRecognitionV2.ts`
- Modify: `package.json`, `vite.config.ts`, `tests/face-checkin-v2.test.ts`

- [ ] **Step 1: Install `@mediapipe/tasks-vision` & `onnxruntime-web`, download verified model assets + WASM files into `public/models/face-v2/`, and verify all files are `< 15 MB` (well under Cloudflare Pages' `25 MiB` limit).**
- [ ] **Step 2: Add failing tests in `tests/face-checkin-v2.test.ts`** for:
  - `quantizeVectorsToInt8B64` <-> `decodeInt8B64ToVectors` (`cosineSim > 0.9995`).
  - `computeUmeyamaTransform112` exact 5-point similarity mapping to canonical ArcFace `112x112`.
  - `classifyEnrollmentAngle(yaw, pitch)` across all 5 target angles.
  - `matchEmployeeFace` (`0.65*max + 0.35*centroid`, `>= 0.62` threshold, `>= 0.08` margin, resigned employee exclusion) + `TemporalMatchVoter` (3 consecutive frames).
  - Live Node `onnxruntime-web` WASM inference smoke test loading `public/models/face-v2/w600k_mbf.onnx` and `public/models/face-v2/minifasnet_v2.onnx` to verify exact tensor names, shapes (`[1,3,112,112]` -> `512-D` L2 unit vector; `[1,3,80,80]` -> valid `[0..1]` liveness score).
- [ ] **Step 3: Implement `src/services/faceRecognitionV2.ts` and update `vite.config.ts` manual chunks.**
- [ ] **Step 4: Run `npm test`** and confirm all biometric + ONNX runtime smoke tests pass.

**Review Focus:** Configure `ort.env.wasm.numThreads = 1` and same-origin `/models/face-v2/wasm/` paths so iOS Safari and Android Chrome work without `Cross-Origin-Embedder-Policy` headers (which would break Google Drive avatar/photo embeds).

---

### Task 5: Parallel UI Components & Integration (`FaceEnrollmentModal`, `FastFaceScannerV2`, `CheckIn`, `Login`, `HrList`, `Dashboard`, `ActivityHistory`)

**Files:**
- Create: `src/components/FaceEnrollmentModal.tsx`
- Create: `src/components/FastFaceScannerV2.tsx`
- Modify: `src/pages/CheckIn.tsx`, `src/pages/Login.tsx`, `src/pages/admin/HrList.tsx`, `src/pages/Dashboard.tsx`, `src/pages/ActivityHistory.tsx`

- [ ] **Step 1: Build `src/components/FaceEnrollmentModal.tsx`** — Architectural HUD modal (`#0D1015` / `#161A22`, zero glassmorphism, `lucide-react` icons, `>= 44px` controls) guiding 5 poses (`Nhìn thẳng -> Quay trái -> Quay phải -> Ngẩng nhẹ -> Cúi nhẹ`) with real-time circular progress segments, brightness/sharpness meter, internal consistency & duplicate check, and `ENROLL_FACE_PROFILE` save.
- [ ] **Step 2: Build `src/components/FastFaceScannerV2.tsx`** — Full-screen (`fixed inset-0 z-[70] h-[100dvh] w-screen bg-[#0D1015]`) mobile/tablet auto-punch scanner with top solid HUD bar (Mode switch / Close, GPS distance badge, live `JetBrains Mono` clock), circular targeting reticle, multi-employee continuous loop, 30-min per-user cooldown pill, `MAX_4_PUNCHES` notice, `Thu-Sat` schedule warning banner, TTS voice throttle (`15s` per cooldown user), and silent offscreen watermark (`renderCheckInWatermarkCanvas`) + `enqueueTask('UPLOAD_CHECKIN_IMAGE', { ..., sendEmailAfterUpload: true })`.
- [ ] **Step 3: Integrate into `src/pages/CheckIn.tsx`** — Segmented `44px` mode switch (`Chụp Xác Nhận (v1)` ↔ `Quét Khuôn Mặt (v2)` persisted in `localStorage`), Face ID profile badge + self-enrollment CTA when unlocked, and unified `Vào 1..Ra 2` sequence + 30m per-user cooldown in v1 while keeping v1's manual `"Ra 1 (Quên chấm Vào)"` override.
- [ ] **Step 4: Integrate open Kiosk trigger in `src/pages/Login.tsx`**, Admin Face ID status + **"Mở khóa / Đặt lại Face ID"** (`RESET_FACE_PROFILE`) in `src/pages/admin/HrList.tsx`, and unified `isCheckInLabel` / `isCheckOutLabel` counters in `src/pages/Dashboard.tsx` & `src/pages/ActivityHistory.tsx`.
- [ ] **Step 5: Run `npm run lint` and `npm run build`** — fix any TypeScript or ESLint issues cleanly.

**Review Focus:** Strict adherence to `.design-dna/dna.json` (`glassmorphismAllowed: false`, `Be Vietnam Pro` + `JetBrains Mono` `tabular-nums`, single `lucide-react` icon family, `>= 44px` touch targets, `prefers-reduced-motion`).

---

### Task 6: End-to-End Quality Gates & Multi-Viewport Live Visual Critic

**Files:**
- Verify all modified/created files across `src/`, `functions/`, `migrations/`, `gas/`, `tests/`.

- [ ] **Step 1: Run `npm run sync:gas` && `npm run sync:gas:check`** (exit 0).
- [ ] **Step 2: Run full `npm test`** (all 4 test files, 0 failures).
- [ ] **Step 3: Run `npm run lint` && `npm run build`** (0 errors, verify `dist/` asset sizes `< 25 MiB`).
- [ ] **Step 4: Launch preview server (`npx vite preview --port 4173 --host 127.0.0.1`) and inspect via Playwright MCP across `390x844`, `768x1024`, `1440x900`, `1920x1080`** (Light & Dark modes): verify Login "Trạm Face ID Nhanh" button & full-screen Kiosk HUD, CheckIn `v1 <-> v2` toggle switch, 5-angle Enrollment Modal, HrList Admin Reset Face ID button, zero horizontal overflow, zero clipped Vietnamese diacritics, and zero console errors.

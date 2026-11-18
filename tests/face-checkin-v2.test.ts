import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type ViteDevServer } from 'vite';

// ---------------------------------------------------------------------------
// Minimal Browser Storage Shim for Node Test Environment
// ---------------------------------------------------------------------------
class MemoryStorage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  getItem(k: string): string | null {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v));
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
}

const localStore = new MemoryStorage();
const sessionStore = new MemoryStorage();
(globalThis as any).localStorage = localStore;
(globalThis as any).sessionStorage = sessionStore;
(globalThis as any).window = globalThis;

let vite: ViteDevServer;

before(async () => {
  vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
});

after(async () => {
  if (vite) await vite.close();
});

describe('Task 1: Unified Attendance Sequence (Vào 1 / Ra 1 / Vào 2 / Ra 2) + <06:00 Overnight + 30m Per-User Cooldown', () => {
  test('1.1 isCheckInLabel & isCheckOutLabel classify legacy and v2 punch types without false positives', async () => {
    const seq = await vite.ssrLoadModule('/src/utils/attendanceSequence.ts');

    for (const label of [
      'Vào 1',
      'VÀO 1',
      'Vào 2',
      'VÀO CA',
      'Vào ca',
      'Vào ca 2',
      'Vào 1 (Trễ 15p)',
      'Vào 1 (Lệch ca >2h - Chờ đối soát)',
      'IN',
    ]) {
      assert.equal(seq.isCheckInLabel(label), true, `Expected Check-In match for "${label}"`);
      assert.equal(seq.isCheckOutLabel(label), false, `Expected non-Check-Out for "${label}"`);
    }

    for (const label of ['Ra 1', 'Ra 2', 'Ra ca', 'Ra ca 2', 'Ra 1 (Ca đêm)', 'OUT']) {
      assert.equal(seq.isCheckOutLabel(label), true, `Expected Check-Out match for "${label}"`);
      assert.equal(seq.isCheckInLabel(label), false, `Expected non-Check-In for "${label}"`);
    }

    for (const nonPunch of ['Kiểm tra', 'Kiểm tra vị trí', 'Nghỉ phép', 'Cảnh báo vào ra', '', null, undefined]) {
      assert.equal(seq.isCheckInLabel(nonPunch), false, `Must reject "${String(nonPunch)}" as Check-In`);
      assert.equal(seq.isCheckOutLabel(nonPunch), false, `Must reject "${String(nonPunch)}" as Check-Out`);
    }
  });

  test('1.2 Daytime 06:00-23:59 progresses Vào ca -> Ra ca -> Vào ca -> Ra ca -> blocks 5th punch (MAX_4_PUNCHES)', async () => {
    localStore.clear();
    const seq = await vite.ssrLoadModule('/src/utils/attendanceSequence.ts');
    const userA = { username: 'nv_minh', fullname: 'Nguyễn Văn Minh' };

    const logs: Array<{ username?: string; fullname: string; type: string; time: string }> = [];

    // 08:30 -> Punch 1 = Vào ca (slot 0, shift 1)
    const r1 = seq.resolveNextAttendancePunch({
      user: userA,
      logs,
      now: new Date('2026-11-10T08:30:00+07:00'),
    });
    assert.equal(r1.canPunch, true);
    assert.equal(r1.nextType, 'Vào ca');
    assert.equal(r1.shiftIndex, 1);
    assert.equal(r1.workdayDateKey, '2026-11-10');

    logs.push({ username: 'nv_minh', fullname: 'Nguyễn Văn Minh', type: 'Vào ca (Trễ 10p)', time: '10/11/2026 08:30:00' });

    // 13:45 -> Punch 2 = Ra ca (slot 1, shift 1)
    const r2 = seq.resolveNextAttendancePunch({
      user: userA,
      logs,
      now: new Date('2026-11-10T13:45:00+07:00'),
    });
    assert.equal(r2.canPunch, true);
    assert.equal(r2.nextType, 'Ra ca');
    assert.equal(r2.shiftIndex, 1);

    logs.push({ username: 'nv_minh', fullname: 'Nguyễn Văn Minh', type: 'Ra ca', time: '10/11/2026 13:45:00' });

    // 17:00 -> Punch 3 = Vào ca (slot 2, shift 2)
    const r3 = seq.resolveNextAttendancePunch({
      user: userA,
      logs,
      now: new Date('2026-11-10T17:00:00+07:00'),
    });
    assert.equal(r3.canPunch, true);
    assert.equal(r3.nextType, 'Vào ca');
    assert.equal(r3.shiftIndex, 2);

    logs.push({ username: 'nv_minh', fullname: 'Nguyễn Văn Minh', type: 'Vào ca', time: '10/11/2026 17:00:00' });

    // 22:15 -> Punch 4 = Ra ca (slot 3, shift 2)
    const r4 = seq.resolveNextAttendancePunch({
      user: userA,
      logs,
      now: new Date('2026-11-10T22:15:00+07:00'),
    });
    assert.equal(r4.canPunch, true);
    assert.equal(r4.nextType, 'Ra ca');
    assert.equal(r4.shiftIndex, 2);

    logs.push({ username: 'nv_minh', fullname: 'Nguyễn Văn Minh', type: 'Ra ca', time: '10/11/2026 22:15:00' });

    // 23:00 (>= 30m later) -> Punch 5 = Blocked MAX_4_PUNCHES (with clean Vào ca / Ra ca wording)
    const r5 = seq.resolveNextAttendancePunch({
      user: userA,
      logs,
      now: new Date('2026-11-10T23:00:00+07:00'),
    });
    assert.equal(r5.canPunch, false);
    assert.equal(r5.blockedReason, 'MAX_4_PUNCHES');
    assert.equal(/Vào 1|Ra 1|Vào 2|Ra 2/i.test(String(r5.blockedMessage || '')), false);
  });

  test('1.3 Overnight < 06:00 AM always resolves to previous workday Ra ca, and resets to Vào ca at 06:00 (including legacy Vào 1..Ra 2 compatibility)', async () => {
    localStore.clear();
    const seq = await vite.ssrLoadModule('/src/utils/attendanceSequence.ts');
    const user = { username: 'nv_khuya', fullname: 'Lê Hoàng Khuya' };

    // Case A: Had legacy Vào 1 yesterday at 17:00, punching at 01:30 AM -> unified Ra ca of yesterday
    const caseA = seq.resolveNextAttendancePunch({
      user,
      logs: [{ username: 'nv_khuya', fullname: 'Lê Hoàng Khuya', type: 'Vào 1', time: '10/11/2026 17:00:00' }],
      now: new Date('2026-11-11T01:30:00+07:00'),
    });
    assert.equal(caseA.canPunch, true);
    assert.equal(caseA.nextType, 'Ra ca');
    assert.equal(caseA.isOvernightBefore06, true);
    assert.equal(caseA.workdayDateKey, '2026-11-10');

    // Case B: No Vào ca in 06:00 -> 05:59 cycle yet (slot = 0) at 02:10 AM -> resolves to Vào ca (never wrong Ra ca!)
    const caseB = seq.resolveNextAttendancePunch({
      user,
      logs: [],
      now: new Date('2026-11-11T02:10:00+07:00'),
    });
    assert.equal(caseB.canPunch, true);
    assert.equal(caseB.nextType, 'Vào ca');
    assert.equal(caseB.baseAction, 'Vào ca');
    assert.equal(caseB.workdayDateKey, '2026-11-10');

    // Case B2: After submitting pending supplement "Chờ duyệt: Vào ca" for 17:00 yesterday, 02:10 AM resolves to Ra ca!
    const caseB2 = seq.resolveNextAttendancePunch({
      user,
      logs: [{ username: 'nv_khuya', fullname: 'Lê Hoàng Khuya', type: 'Chờ duyệt: Vào ca', status: 'Chờ Admin duyệt', time: '10/11/2026 17:00:00' }],
      now: new Date('2026-11-11T02:10:00+07:00'),
    });
    assert.equal(caseB2.canPunch, true);
    assert.equal(caseB2.nextType, 'Ra ca');
    assert.equal(caseB2.baseAction, 'Ra ca');
    assert.equal(caseB2.workdayDateKey, '2026-11-10');

    // Case C: Had Vào ca + Ra ca + 2nd Vào ca yesterday, punching at 01:50 AM -> Ra ca of yesterday (shiftIndex = 2)
    const caseC = seq.resolveNextAttendancePunch({
      user,
      logs: [
        { username: 'nv_khuya', fullname: 'Lê Hoàng Khuya', type: 'Vào ca', time: '10/11/2026 09:00:00' },
        { username: 'nv_khuya', fullname: 'Lê Hoàng Khuya', type: 'Ra ca', time: '10/11/2026 14:00:00' },
        { username: 'nv_khuya', fullname: 'Lê Hoàng Khuya', type: 'Vào ca', time: '10/11/2026 17:30:00' },
      ],
      now: new Date('2026-11-11T01:50:00+07:00'),
    });
    assert.equal(caseC.canPunch, true);
    assert.equal(caseC.nextType, 'Ra ca');
    assert.equal(caseC.shiftIndex, 2);
    assert.equal(caseC.workdayDateKey, '2026-11-10');

    // Case D: Already had 2 pairs in yesterday's cycle, punching at 03:00 AM -> Blocked MAX_4_PUNCHES
    const caseD = seq.resolveNextAttendancePunch({
      user,
      logs: [
        { username: 'nv_khuya', fullname: 'Lê Hoàng Khuya', type: 'Vào 1', time: '10/11/2026 09:00:00' },
        { username: 'nv_khuya', fullname: 'Lê Hoàng Khuya', type: 'Ra 1', time: '10/11/2026 14:00:00' },
        { username: 'nv_khuya', fullname: 'Lê Hoàng Khuya', type: 'Vào 2', time: '10/11/2026 17:30:00' },
        { username: 'nv_khuya', fullname: 'Lê Hoàng Khuya', type: 'Ra 2', time: '11/11/2026 01:15:00' },
      ],
      now: new Date('2026-11-11T03:00:00+07:00'),
    });
    assert.equal(caseD.canPunch, false);
    assert.equal(caseD.blockedReason, 'MAX_4_PUNCHES');

    // Case E: At 06:05 AM (>= 06:00), new workday 2026-11-11 starts -> Vào ca!
    const caseE = seq.resolveNextAttendancePunch({
      user,
      logs: [
        { username: 'nv_khuya', fullname: 'Lê Hoàng Khuya', type: 'Ra ca', time: '11/11/2026 01:15:00' },
      ],
      now: new Date('2026-11-11T06:05:00+07:00'),
    });
    assert.equal(caseE.canPunch, true);
    assert.equal(caseE.nextType, 'Vào ca');
    assert.equal(caseE.workdayDateKey, '2026-11-11');

    // Case F: Manual v1 override when forgot morning Vào ca at 18:00 -> Ra ca
    const caseF = seq.resolveNextAttendancePunch({
      user,
      logs: [],
      now: new Date('2026-11-11T18:00:00+07:00'),
      manualOverrideOut: true,
    });
    assert.equal(caseF.canPunch, true);
    assert.equal(caseF.nextType, 'Ra ca');
  });

  test('1.4 Per-Employee 15-minute cooldown isolates Employee A from Employee B on the same shared device', async () => {
    localStore.clear();
    const seq = await vite.ssrLoadModule('/src/utils/attendanceSequence.ts');
    const helpers = await vite.ssrLoadModule('/src/utils/helpers.ts');

    assert.equal(seq.EMPLOYEE_COOLDOWN_MS, 15 * 60 * 1000, 'Per-employee cooldown must be strictly 15 minutes');

    const empA = { username: 'emp_a', fullname: 'Trần Thị A' };
    const empB = { username: 'emp_b', fullname: 'Phạm Văn B' };

    const t0 = new Date('2026-11-12T10:00:00+07:00');
    seq.recordEmployeePunchCooldown(empA, 'Vào ca', '12/11/2026 10:00:00', t0.getTime());

    // 2 seconds later on the EXACT same phone: Employee B scans -> MUST NOT BE BLOCKED!
    const checkB = seq.resolveNextAttendancePunch({
      user: empB,
      logs: [],
      now: new Date(t0.getTime() + 2000),
    });
    assert.equal(checkB.canPunch, true, 'Employee B on same shared phone must NOT inherit Employee A cooldown');
    assert.equal(checkB.nextType, 'Vào ca');

    // 14m 50s later: Employee A scans again -> MUST BE BLOCKED (10s remaining)
    const checkA14 = seq.resolveNextAttendancePunch({
      user: empA,
      logs: [{ username: 'emp_a', fullname: 'Trần Thị A', type: 'Vào ca', time: '12/11/2026 10:00:00' }],
      now: new Date(t0.getTime() + (14 * 60 + 50) * 1000),
    });
    assert.equal(checkA14.canPunch, false);
    assert.equal(checkA14.blockedReason, 'COOLDOWN_15M');
    assert.equal(checkA14.remainingSeconds, 10);
    assert.ok(String(checkA14.blockedMessage || '').includes('15 phút'));

    // Exactly 15m 01s later: Employee A scans -> ALLOWED -> Ra ca
    const checkA15 = seq.resolveNextAttendancePunch({
      user: empA,
      logs: [{ username: 'emp_a', fullname: 'Trần Thị A', type: 'Vào ca', time: '12/11/2026 10:00:00' }],
      now: new Date(t0.getTime() + (15 * 60 + 1) * 1000),
    });
    assert.equal(checkA15.canPunch, true);
    assert.equal(checkA15.nextType, 'Ra ca');

    // Verify helpers.getCheckInCooldown & helpers.getRecommendedCheckInType also use 15m per-user & unified Vào ca / Ra ca
    const nowReal = Date.now();
    seq.recordEmployeePunchCooldown(empA, 'Vào ca', '12/11/2026 10:00:00', nowReal - 10 * 60 * 1000);
    const cdA10 = helpers.getCheckInCooldown([], empA);
    assert.equal(cdA10.isBlocked, true, 'helpers.getCheckInCooldown must block at 10 minutes (< 15m)');
    assert.ok(cdA10.remainingSeconds > 250 && cdA10.remainingSeconds <= 300);

    seq.recordEmployeePunchCooldown(empA, 'Vào ca', '12/11/2026 10:00:00', nowReal - 16 * 60 * 1000);
    const cdA16 = helpers.getCheckInCooldown([], empA);
    assert.equal(cdA16.isBlocked, false, 'helpers.getCheckInCooldown must allow punch at 16 minutes (> 15m)');

    const cdB = helpers.getCheckInCooldown([], empB);
    assert.equal(cdB.isBlocked, false, 'helpers.getCheckInCooldown must NOT block Employee B');

    const recWait = helpers.getRecommendedCheckInType(
      [{ username: 'emp_a', fullname: 'Trần Thị A', type: 'Vào ca', time: '12/11/2026 10:00:00' }],
      empA,
      new Date('2026-11-12T10:10:00+07:00')
    );
    assert.equal(recWait.canCheckOutNow, false);
    assert.equal(recWait.minWaitMinutesRemaining, 5);

    const recReady = helpers.getRecommendedCheckInType(
      [{ username: 'emp_a', fullname: 'Trần Thị A', type: 'Vào ca', time: '12/11/2026 10:00:00' }],
      empA,
      new Date('2026-11-12T10:16:00+07:00')
    );
    assert.equal(recReady.canCheckOutNow, true);
    assert.equal(recReady.minWaitMinutesRemaining, 0);

    const recFirst = helpers.getRecommendedCheckInType([], empB, new Date('2026-11-12T09:00:00+07:00'));
    assert.equal(recFirst.recommendedType, 'Vào ca');
  });
});

// ---------------------------------------------------------------------------
// Task 2: Google Apps Script Backend (Engine.gs, Handlers.gs, ControlCenterService.gs, Code.gs)
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function makeInt8VectorB64(seedIndex: number, dim = 512): string {
  const arr = new Int8Array(dim);
  for (let i = 0; i < dim; i++) {
    arr[i] = i % 16 === seedIndex % 16 ? 110 : ((i + seedIndex) % 7) - 3;
  }
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
}

function make5AnglePackB64(seedIndex: number, dim = 512): string {
  const total = new Int8Array(dim * 5);
  for (let k = 0; k < 5; k++) {
    for (let i = 0; i < dim; i++) {
      total[k * dim + i] = i % 16 === seedIndex % 16 ? 110 - k * 2 : ((i + seedIndex + k) % 7) - 3;
    }
  }
  return Buffer.from(total.buffer, total.byteOffset, total.byteLength).toString('base64');
}

/**
 * Synthesizes a cross-phone live Int8 vector that blends `alpha` of `seedIndex`
 * with an orthogonal axis `(seedIndex + 4) % 16`, producing realistic cross-camera
 * cosine similarity around ~0.53 (inside [0.48, 0.60], where overly strict >=0.62 failed).
 */
function makeCrossPhoneLiveVectorB64(seedIndex: number, alpha = 0.54, dim = 512): string {
  const orthoIdx = (seedIndex + 4) % 16;
  const beta = Math.sqrt(Math.max(0, 1 - alpha * alpha));
  const arr = new Int8Array(dim);
  for (let i = 0; i < dim; i++) {
    if (i % 16 === seedIndex % 16) {
      arr[i] = Math.round(115 * alpha);
    } else if (i % 16 === orthoIdx) {
      arr[i] = Math.round(115 * beta);
    } else {
      arr[i] = 0;
    }
  }
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
}

function createGasV2Sandbox(initialSheets: Record<string, any[][]>, fixedNowIso = '2026-11-10T10:00:00+07:00') {
  const sheetsData: Record<string, any[][]> = {};
  const formulasData: Record<string, string[][]> = {};
  const numberFormatsData: Record<string, string[][]> = {};
  const hiddenSheets = new Set<string>();
  const sentEmails: Array<{ to: string; subject: string; htmlBody: string }> = [];

  for (const [name, rows] of Object.entries(initialSheets)) {
    sheetsData[name] = rows.map((r) => [...r]);
    formulasData[name] = rows.map((r) => r.map((c) => (typeof c === 'string' && c.startsWith('=') ? c : '')));
    numberFormatsData[name] = rows.map((r) => r.map(() => ''));
  }

  const coerceSpreadsheetCellValue = (val: any, fmt: string): any => {
    if (fmt === '@') return val;
    if (typeof val === 'string' && /^[+-][A-Za-z0-9+/=_-]{16,}$/.test(val)) {
      return '#ERROR!';
    }
    return val;
  };

  function makeSheet(name: string) {
    if (!sheetsData[name]) sheetsData[name] = [];
    if (!formulasData[name]) formulasData[name] = [];
    if (!numberFormatsData[name]) numberFormatsData[name] = [];
    const ensureCell = (r1: number, c1: number) => {
      while (sheetsData[name].length < r1) sheetsData[name].push([]);
      while (formulasData[name].length < r1) formulasData[name].push([]);
      while (numberFormatsData[name].length < r1) numberFormatsData[name].push([]);
      while (sheetsData[name][r1 - 1].length < c1) sheetsData[name][r1 - 1].push('');
      while (formulasData[name][r1 - 1].length < c1) formulasData[name][r1 - 1].push('');
      while (numberFormatsData[name][r1 - 1].length < c1) numberFormatsData[name][r1 - 1].push('');
    };
    const makeRange = (row1: number, col1: number, numRows = 1, numCols = 1) => {
      const rangeObj: any = {
        getValue: () => sheetsData[name]?.[row1 - 1]?.[col1 - 1] ?? '',
        getDisplayValue: () => String(sheetsData[name]?.[row1 - 1]?.[col1 - 1] ?? '').replace(/^'/, ''),
        getFormula: () => formulasData[name]?.[row1 - 1]?.[col1 - 1] ?? '',
        getValues: () => {
          const out: any[][] = [];
          for (let r = 0; r < numRows; r++) {
            const line: any[] = [];
            for (let c = 0; c < numCols; c++) {
              line.push(sheetsData[name]?.[row1 - 1 + r]?.[col1 - 1 + c] ?? '');
            }
            out.push(line);
          }
          return out;
        },
        getDisplayValues: () => {
          const out: string[][] = [];
          for (let r = 0; r < numRows; r++) {
            const line: string[] = [];
            for (let c = 0; c < numCols; c++) {
              const v = sheetsData[name]?.[row1 - 1 + r]?.[col1 - 1 + c] ?? '';
              line.push(String(v).replace(/^'/, ''));
            }
            out.push(line);
          }
          return out;
        },
        getFormulas: () => {
          const out: string[][] = [];
          for (let r = 0; r < numRows; r++) {
            const line: string[] = [];
            for (let c = 0; c < numCols; c++) {
              line.push(formulasData[name]?.[row1 - 1 + r]?.[col1 - 1 + c] ?? '');
            }
            out.push(line);
          }
          return out;
        },
        setValue: (val: any) => {
          ensureCell(row1, col1);
          const fmt = numberFormatsData[name]?.[row1 - 1]?.[col1 - 1] ?? '';
          sheetsData[name][row1 - 1][col1 - 1] = coerceSpreadsheetCellValue(val, fmt);
          if (typeof val === 'string' && val.startsWith('=')) {
            formulasData[name][row1 - 1][col1 - 1] = val;
          }
          return rangeObj;
        },
        setFormula: (f: string) => {
          ensureCell(row1, col1);
          formulasData[name][row1 - 1][col1 - 1] = f;
          sheetsData[name][row1 - 1][col1 - 1] = f;
          return rangeObj;
        },
        setValues: (vals: any[][]) => {
          for (let r = 0; r < vals.length; r++) {
            for (let c = 0; c < vals[r].length; c++) {
              ensureCell(row1 + r, col1 + c);
              const fmt = numberFormatsData[name]?.[row1 - 1 + r]?.[col1 - 1 + c] ?? '';
              const v = coerceSpreadsheetCellValue(vals[r][c], fmt);
              sheetsData[name][row1 - 1 + r][col1 - 1 + c] = v;
              if (typeof vals[r][c] === 'string' && vals[r][c].startsWith('=')) {
                formulasData[name][row1 - 1 + r][col1 - 1 + c] = vals[r][c];
              }
            }
          }
          return rangeObj;
        },
        setNumberFormat: (fmt: string) => {
          for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < numCols; c++) {
              ensureCell(row1 + r, col1 + c);
              numberFormatsData[name][row1 - 1 + r][col1 - 1 + c] = String(fmt || '');
            }
          }
          return rangeObj;
        },
        setNumberFormats: (fmts: string[][]) => {
          for (let r = 0; r < fmts.length; r++) {
            for (let c = 0; c < fmts[r].length; c++) {
              ensureCell(row1 + r, col1 + c);
              numberFormatsData[name][row1 - 1 + r][col1 - 1 + c] = String(fmts[r][c] || '');
            }
          }
          return rangeObj;
        },
        clearContent: () => rangeObj,
        merge: () => rangeObj,
        setBackground: () => rangeObj,
        setBackgrounds: () => rangeObj,
        setFontColor: () => rangeObj,
        setFontColors: () => rangeObj,
        setFontWeight: () => rangeObj,
        setFontWeights: () => rangeObj,
        setFontSize: () => rangeObj,
        setFontSizes: () => rangeObj,
        setFontFamily: () => rangeObj,
        setFontFamilies: () => rangeObj,
        setHorizontalAlignment: () => rangeObj,
        setHorizontalAlignments: () => rangeObj,
        setVerticalAlignment: () => rangeObj,
        setVerticalAlignments: () => rangeObj,
        setWrap: () => rangeObj,
        setWraps: () => rangeObj,
        setBorder: () => rangeObj,
      };
      return rangeObj;
    };

    return {
      getName: () => name,
      getSheetId: () => 101,
      getIndex: () => Object.keys(sheetsData).indexOf(name) + 1,
      activate: () => {},
      hideSheet: () => {
        hiddenSheets.add(name);
      },
      showSheet: () => {
        hiddenSheets.delete(name);
      },
      isSheetHidden: () => hiddenSheets.has(name),
      hideColumns: () => {},
      setRowHeight: () => {},
      setRowHeightsForRange: () => {},
      getMaxRows: () => Math.max(20, sheetsData[name].length),
      deleteRows: () => {},
      getLastRow: () => sheetsData[name].length,
      getLastColumn: () => sheetsData[name].reduce((max, row) => Math.max(max, row.length), 0),
      appendRow: (row: any[]) => {
        const nextRowIdx = sheetsData[name].length;
        const coerced = row.map((c, colIdx) => {
          const fmt = numberFormatsData[name]?.[nextRowIdx]?.[colIdx] ?? '';
          return coerceSpreadsheetCellValue(c, fmt);
        });
        sheetsData[name].push(coerced);
        formulasData[name].push(row.map((c) => (typeof c === 'string' && c.startsWith('=') ? c : '')));
        if (!numberFormatsData[name][nextRowIdx]) {
          numberFormatsData[name][nextRowIdx] = row.map(() => '');
        }
      },
      insertRowBefore: (beforeRow1: number) => {
        const idx = Math.max(0, beforeRow1 - 1);
        sheetsData[name].splice(idx, 0, []);
        formulasData[name].splice(idx, 0, []);
      },
      deleteRow: (r1: number) => {
        sheetsData[name].splice(r1 - 1, 1);
        formulasData[name].splice(r1 - 1, 1);
      },
      getDataRange: () => {
        const nr = Math.max(1, sheetsData[name].length);
        const nc = Math.max(1, sheetsData[name].reduce((m, r) => Math.max(m, r.length), 1));
        return makeRange(1, 1, nr, nc);
      },
      getRange: (r1: number | string, c1?: number, nr = 1, nc = 1) => {
        if (typeof r1 === 'string') return makeRange(1, 1, 1, 8);
        return makeRange(r1, c1 || 1, nr, nc);
      },
    };
  }

  let currentNowIso = fixedNowIso;
  const FixedDate = class extends Date {
    constructor(...args: any[]) {
      if (args.length === 0) super(currentNowIso);
      // @ts-expect-error spread into Date
      else super(...args);
    }
    static now() {
      return new Date(currentNowIso).getTime();
    }
  };

  const ssObj = {
    getId: () => 'TEST_SPREADSHEET_ID',
    getSheetByName: (n: string) => (sheetsData[n] ? makeSheet(n) : null),
    getSheets: () => Object.keys(sheetsData).map((n) => makeSheet(n)),
    insertSheet: (n: string) => {
      sheetsData[n] = [];
      formulasData[n] = [];
      return makeSheet(n);
    },
    deleteSheet: (s: any) => {
      delete sheetsData[s.getName()];
    },
    moveActiveSheet: () => {},
    toast: () => {},
  };

  const scriptCache = new Map<string, string>();
  const scriptProps = new Map<string, string>();
  let uploadCounter = 0;

  const sandbox: Record<string, any> = {
    console,
    Date: FixedDate,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    Logger: { log: () => {} },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        waitLock: () => {},
        releaseLock: () => {},
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => scriptCache.get(k) ?? null,
        put: (k: string, v: string) => scriptCache.set(k, v),
        remove: (k: string) => scriptCache.delete(k),
        removeAll: (keys: string[]) => keys.forEach((k) => scriptCache.delete(k)),
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => scriptProps.get(k) ?? null,
        setProperty: (k: string, v: string) => scriptProps.set(k, v),
      }),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (txt: string) => ({
        _text: txt,
        setMimeType() {
          return this;
        },
        getContent() {
          return txt;
        },
      }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_alg: string, input: string) => Array.from(Buffer.from(String(input), 'utf8')),
      computeHmacSha256Signature: (value: string, key: string) => Array.from(Buffer.from(`${value}:${key}`, 'utf8')),
      base64Encode: (bytes: number[] | string) =>
        Buffer.from(Array.isArray(bytes) ? Uint8Array.from(bytes) : String(bytes)).toString('base64'),
      base64EncodeWebSafe: (bytes: number[] | string) =>
        Buffer.from(Array.isArray(bytes) ? Uint8Array.from(bytes) : String(bytes)).toString('base64url'),
      base64Decode: (b64: string) => {
        // Real GAS Utilities.base64Decode returns signed Java bytes in [-128..127]
        const buf = Buffer.from(String(b64), 'base64');
        return Array.from(buf, (b) => (b > 127 ? b - 256 : b));
      },
      newBlob: (bytes: any, contentType?: string, name?: string) => ({ bytes, contentType, name }),
      formatDate: (d: Date, _tz: string, fmt: string) => {
        const utcMs = d.getTime() + 7 * 3600 * 1000;
        const vn = new Date(utcMs);
        const yyyy = String(vn.getUTCFullYear());
        const MM = String(vn.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(vn.getUTCDate()).padStart(2, '0');
        const HH = String(vn.getUTCHours()).padStart(2, '0');
        const H = String(vn.getUTCHours());
        const mm = String(vn.getUTCMinutes()).padStart(2, '0');
        const m = String(vn.getUTCMinutes());
        const ss = String(vn.getUTCSeconds()).padStart(2, '0');
        if (fmt === 'yyyy-MM-dd') return `${yyyy}-${MM}-${dd}`;
        if (fmt === 'yyyy-MM') return `${yyyy}-${MM}`;
        if (fmt === 'dd/MM/yyyy') return `${dd}/${MM}/${yyyy}`;
        if (fmt === 'dd/MM/yyyy HH:mm:ss') return `${dd}/${MM}/${yyyy} ${HH}:${mm}:${ss}`;
        if (fmt === 'dd/MM/yyyy HH:mm') return `${dd}/${MM}/${yyyy} ${HH}:${mm}`;
        if (fmt === 'HH:mm') return `${HH}:${mm}`;
        if (fmt === 'H') return H;
        if (fmt === 'm') return m;
        return `${dd}/${MM}/${yyyy} ${HH}:${mm}`;
      },
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
      Permission: { VIEW: 'VIEW' },
      getFolderById: () => ({
        createFile: () => {
          uploadCounter++;
          const id = `DRIVE_FILE_${uploadCounter}`;
          return {
            getId: () => id,
            setSharing: () => {},
            getUrl: () => `https://drive.google.com/file/d/${id}/view`,
          };
        },
      }),
    },
    MailApp: {
      getRemainingDailyQuota: () => 50,
      sendEmail: (opts: any) => {
        sentEmails.push({
          to: opts.to || '',
          subject: opts.subject || '',
          htmlBody: opts.htmlBody || '',
        });
      },
    },
    UrlFetchApp: {
      fetch: () => ({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ status: 'ZERO_RESULTS' }),
      }),
    },
    SpreadsheetApp: {
      BorderStyle: { SOLID: 'SOLID' },
      openById: () => ssObj,
      getActiveSpreadsheet: () => ssObj,
      flush: () => {},
    },
    Sheets: {
      Spreadsheets: {
        batchUpdate: () => {},
        Values: {
          update: () => {},
          batchGet: (_id: string, opts: { ranges: string[] }) => ({
            valueRanges: opts.ranges.map((r) => {
              const sheetName = r.split('!')[0].replace(/^'|'$/g, '');
              return { values: sheetsData[sheetName] || [] };
            }),
          }),
          get: (_id: string, range: string) => {
            const sheetName = range.split('!')[0].replace(/^'|'$/g, '');
            return { values: sheetsData[sheetName] || [] };
          },
        },
      },
    },
  };

  vm.createContext(sandbox);
  const gasDir = path.resolve(process.cwd(), 'gas');
  for (const file of [
    'Code.gs',
    'ControlCenterService.gs',
    'JsonCacheService.gs',
    'Handlers.gs',
    'Engine.gs',
    'ChecklistService.gs',
    'OpsChecklistHandlers.gs',
  ]) {
    const code = fs.readFileSync(path.join(gasDir, file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  }

  return {
    sandbox,
    sheetsData,
    formulasData,
    hiddenSheets,
    sentEmails,
    setNowIso: (iso: string) => {
      currentNowIso = iso;
    },
    callDoPost: (payload: Record<string, any>) => {
      const out = sandbox.doPost({ postData: { contents: JSON.stringify(payload) } });
      return JSON.parse(out.getContent());
    },
  };
}

describe('Task 2: GAS Backend — Engine Vào 1..Ra 2 Aggregation, 30m Cooldown, >120m Guard, CONFIG_FACE_ID & Async Upload Email', () => {
  test('2.1 Engine.gs createRowData & handleGetPayroll aggregate Vào 1 / Ra 1 / Vào 2 / Ra 2 + <06:00 overnight shifts identically to legacy labels', () => {
    const gas = createGasV2Sandbox(
      {
        DATA: [
          ['Bảng người dùng'],
          ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
          ['nv_anh', 'hash', 'Đặng Thị Hồng Ánh', '', 'anh@kg.vn', 'user', 'Phục vụ', '', 'active'],
        ],
        SalaryConfig: [
          ['Username', 'BaseHourly'],
          ['nv_anh', 25000],
        ],
        '✔️CHẤM CÔNG': [
          ['Họ tên', 'Loại', 'Thời gian', 'Vị trí', 'Trạng thái', 'Khoảng cách', 'Ảnh', 'JSON'],
          ['Đặng Thị Hồng Ánh', 'Ra 2', "'11/11/2026 01:30:00", "King's Grill", 'Hợp lệ', '5m', '', '{}'],
          ['Đặng Thị Hồng Ánh', 'Vào 2', "'10/11/2026 17:00:00", "King's Grill", 'Hợp lệ', '5m', '', '{}'],
          ['Đặng Thị Hồng Ánh', 'Ra 1', "'10/11/2026 14:00:00", "King's Grill", 'Hợp lệ', '5m', '', '{}'],
          ['Đặng Thị Hồng Ánh', 'Vào 1 (Trễ 10p)', "'10/11/2026 09:00:00", "King's Grill", 'Hợp lệ', '5m', '', '{}'],
        ],
      },
      '2026-11-15T10:00:00+07:00'
    );

    // 1. Direct test of Engine.gs createRowData for 10/11/2026 & 11/11/2026
    const datesMap = new gas.sandbox.Map();
    datesMap.set('10/11/2026', [
      { status: 'Vào 1 (Trễ 10p)', time: '09:00', originalTime: Date.parse('2026-11-10T09:00:00Z'), note: '' },
      { status: 'Ra 1', time: '14:00', originalTime: Date.parse('2026-11-10T14:00:00Z'), note: '' },
      { status: 'Vào 2', time: '17:00', originalTime: Date.parse('2026-11-10T17:00:00Z'), note: '' },
    ]);
    datesMap.set('11/11/2026', [
      { status: 'Ra 2', time: '01:30', originalTime: Date.parse('2026-11-11T01:30:00Z'), note: '' },
    ]);

    const rowDay10 = gas.sandbox.createRowData(
      'Đặng Thị Hồng Ánh',
      '10/11/2026',
      new gas.sandbox.Date(Date.UTC(2026, 10, 10)),
      datesMap,
      new gas.sandbox.Set(),
      new gas.sandbox.Set()
    ).values;
    // Columns: [Name, Date, Vào#, Ra#, Vào 1, Ra 1, Vào 2, Ra 2, RegularFormula, OTFormula, Multiplier]
    assert.equal(rowDay10[4], '09:00', 'Col E (Vào 1) must capture Vào 1');
    assert.equal(rowDay10[5], '14:00', 'Col F (Ra 1) must capture Ra 1');
    assert.equal(rowDay10[6], '17:00', 'Col G (Vào 2) must capture Vào 2');
    assert.equal(rowDay10[7], '00:00', 'Col H (Ra 2) must cap at 00:00 when next morning Ra 2 > 00:15');

    const rowDay11 = gas.sandbox.createRowData(
      'Đặng Thị Hồng Ánh',
      '11/11/2026',
      new gas.sandbox.Date(Date.UTC(2026, 10, 11)),
      datesMap,
      new gas.sandbox.Set(),
      new gas.sandbox.Set()
    ).values;
    assert.equal(rowDay11[2], '00:00', 'Col C (Vào#) on 11/11 must start spillover at 00:00');
    assert.equal(rowDay11[3], '01:30', 'Col D (Ra#) on 11/11 must record 01:30 overnight Ra 2');

    // 2. Verify handleGetPayroll raw-log calculator also computes 5h + 7h = 12h regular & 1.5h OT
    const payrollRes = gas.callDoPost({
      action: 'GET_PAYROLL',
      username: 'nv_anh',
      role: 'user',
      month: '2026-11',
    });
    assert.equal(payrollRes.ok, true);
    const slip = payrollRes.data.payroll[0];
    assert.equal(slip.regularHours, 12);
    assert.equal(slip.overtimeHours, 1.5);
    assert.equal(slip.totalHours, 13.5);
  });

  test('2.2 CONFIG_FACE_ID sheet lifecycle: protected + hidden, locks after 1st enroll, blocks cross-user duplicate face, Admin RESET_FACE_PROFILE unlocks', () => {
    const gas = createGasV2Sandbox({
      DATA: [
        ['Bảng người dùng'],
        ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
        ['admin', 'hash_adm', 'Quản Lý', '', 'admin@kg.vn', 'admin', 'Quản lý', '', 'active'],
        ['nv1', 'hash_1', 'Nguyễn Văn Một', '', 'nv1@kg.vn', 'user', 'Phục vụ', '', 'active'],
        ['nv2', 'hash_2', 'Trần Thị Hai', '', 'nv2@kg.vn', 'user', 'Thu ngân', '', 'active'],
      ],
      '⚙️ CẤU HÌNH': [
        ['Key', 'Value'],
        ['GPS_CONFIG', JSON.stringify({ lat: 10.976083, lng: 106.664654, radius: 25 })],
      ],
      '✔️CHẤM CÔNG': [['Họ tên', 'Loại', 'Thời gian', 'Vị trí', 'Trạng thái', 'Khoảng cách', 'Ảnh', 'JSON']],
    });

    assert.equal(gas.sandbox.isProtectedSystemSheet('CONFIG_FACE_ID'), true, 'CONFIG_FACE_ID must be protected');

    const vecPack1 = make5AnglePackB64(1);
    const enroll1 = gas.callDoPost({
      action: 'ENROLL_FACE_PROFILE',
      username: 'nv1',
      fullname: 'Nguyễn Văn Một',
      vectorsB64: vecPack1,
      anglesCount: 5,
      modelVersion: 'w600k_mbf_int8_v2',
    });
    assert.equal(enroll1.ok, true, `First enrollment must succeed: ${JSON.stringify(enroll1)}`);
    assert.equal(gas.hiddenSheets.has('CONFIG_FACE_ID'), true, 'CONFIG_FACE_ID must be hidden automatically');

    // Non-admin trying to overwrite locked profile -> BLOCKED
    const overwriteAttempt = gas.callDoPost({
      action: 'ENROLL_FACE_PROFILE',
      username: 'nv1',
      fullname: 'Nguyễn Văn Một',
      vectorsB64: make5AnglePackB64(3),
      anglesCount: 5,
    });
    assert.equal(overwriteAttempt.ok, false);
    assert.equal(overwriteAttempt.code || overwriteAttempt.data?.code, 'FACE_PROFILE_LOCKED');

    // Cross-account duplicate face: nv2 tries to enroll nv1's face vector -> BLOCKED!
    const dupAttempt = gas.callDoPost({
      action: 'ENROLL_FACE_PROFILE',
      username: 'nv2',
      fullname: 'Trần Thị Hai',
      vectorsB64: vecPack1,
      anglesCount: 5,
    });
    assert.equal(dupAttempt.ok, false);
    assert.equal(dupAttempt.code || dupAttempt.data?.code, 'DUPLICATE_FACE_IDENTITY');

    // Non-admin calling RESET_FACE_PROFILE -> BLOCKED
    const unauthReset = gas.callDoPost({
      action: 'RESET_FACE_PROFILE',
      actorUsername: 'nv1',
      username: 'nv1',
      targetUsername: 'nv1',
    });
    assert.equal(unauthReset.ok, false);

    // Admin calling RESET_FACE_PROFILE -> SUCCEEDS, allowing nv1 to re-enroll
    const adminReset = gas.callDoPost({
      action: 'RESET_FACE_PROFILE',
      actorUsername: 'admin',
      adminUsername: 'admin',
      role: 'admin',
      targetUsername: 'nv1',
    });
    assert.equal(adminReset.ok, true);

    const reEnroll = gas.callDoPost({
      action: 'ENROLL_FACE_PROFILE',
      username: 'nv1',
      fullname: 'Nguyễn Văn Một',
      vectorsB64: make5AnglePackB64(5),
      anglesCount: 5,
    });
    assert.equal(reEnroll.ok, true, 'Re-enrollment must succeed after Admin reset');

    // Kiosk GET_FACE_PROFILES outside GPS radius -> BLOCKED; inside 25m -> returns minimal non-PII profiles
    const outGpsProfiles = gas.callDoPost({
      action: 'GET_FACE_PROFILES',
      isKiosk: true,
      lat: 10.99,
      lng: 106.69,
    });
    assert.equal(outGpsProfiles.ok, false);

    const inGpsProfiles = gas.callDoPost({
      action: 'GET_FACE_PROFILES',
      isKiosk: true,
      lat: 10.976083,
      lng: 106.664654,
      gpsAccuracy: 8,
    });
    assert.equal(inGpsProfiles.ok, true);
    assert.equal(inGpsProfiles.data.profiles.length, 1);
    assert.equal(inGpsProfiles.data.profiles[0].username, 'nv1');
    assert.equal('email' in inGpsProfiles.data.profiles[0], false, 'Must NEVER leak email in Kiosk profile list');
    assert.equal('password' in inGpsProfiles.data.profiles[0], false, 'Must NEVER leak password');
  });

  test('2.3 Handlers.gs handleCheckInOut enforces 30m per-user cooldown, >120m late review guard, Vào 2 no-fine, v2_face schedule advisory, liveVectorB64 check & idempotent post-upload email', () => {
    const gas = createGasV2Sandbox(
      {
        DATA: [
          ['Bảng người dùng'],
          ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
          ['nv1', 'hash_1', 'Nguyễn Văn Một', '', 'nv1@gmail.com', 'user', 'Phục vụ', '', 'active'],
          ['nv2', 'hash_2', 'Trần Thị Hai', '', 'nv2@gmail.com', 'user', 'Thu ngân', '', 'active'],
        ],
        '⚙️ CẤU HÌNH': [
          ['Key', 'Value'],
          ['GPS_CONFIG', JSON.stringify({ lat: 10.976083, lng: 106.664654, radius: 25 })],
        ],
        'Tháng 11/2026': [
          ['📅 TUẦN 02/11 - 08/11', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'],
          ['┗ Nguyễn Văn Một', '15:00', '15:00', '15:00', '15:00', '15:00', '15:00', '15:00'],
          ['┗ Trần Thị Hai', '15:00', '15:00', '15:00', '15:00', '15:00', '15:00', '15:00'],
        ],
        '✔️CHẤM CÔNG': [['Họ tên', 'Loại', 'Thời gian', 'Vị trí', 'Trạng thái', 'Khoảng cách', 'Ảnh', 'JSON']],
      },
      '2026-11-05T15:20:00+07:00' // Thursday 15:20 VN (inside Thu -> Sat 17:00 mandatory schedule window, 20m late for 15:00 shift!)
    );

    // Enroll both nv1 and nv2
    gas.callDoPost({
      action: 'ENROLL_FACE_PROFILE',
      username: 'nv1',
      fullname: 'Nguyễn Văn Một',
      vectorsB64: make5AnglePackB64(1),
      anglesCount: 5,
    });
    gas.callDoPost({
      action: 'ENROLL_FACE_PROFILE',
      username: 'nv2',
      fullname: 'Trần Thị Hai',
      vectorsB64: make5AnglePackB64(8),
      anglesCount: 5,
    });

    // A. Spoofed liveVectorB64 (wrong person's vector) on v2_face -> REJECTED!
    const spoofRes = gas.callDoPost({
      action: 'CHECK_IN_OUT',
      checkinMode: 'v2_face',
      username: 'nv1',
      fullname: 'Nguyễn Văn Một',
      type: 'Vào 1',
      liveVectorB64: makeInt8VectorB64(8), // nv2's face!
      lat: 10.976083,
      lng: 106.664654,
      gpsAccuracy: 5,
      time: '05/11/2026 15:20:00',
      fastSync: true,
      image: 'PENDING',
    });
    assert.equal(spoofRes.ok, false);
    assert.equal(spoofRes.code || spoofRes.data?.code, 'FACE_VERIFICATION_FAILED');

    // B. Valid v2_face punch for nv1 on Thursday 15:20 (without next week's schedule registered):
    // -> Succeeds (does NOT block queue), normalizes incoming 'Vào 1' -> 'Vào ca', sets scheduleWarning=true, AND applies normal 20m late penalty (<= 120m)!
    const ci1 = gas.callDoPost({
      action: 'CHECK_IN_OUT',
      checkinMode: 'v2_face',
      checkinId: 'CI_V2_NV1_1',
      username: 'nv1',
      fullname: 'Nguyễn Văn Một',
      type: 'Vào 1',
      liveVectorB64: makeInt8VectorB64(1),
      lat: 10.976083,
      lng: 106.664654,
      gpsAccuracy: 5,
      time: '05/11/2026 15:20:00',
      fastSync: true,
      image: 'PENDING',
    });
    assert.equal(ci1.ok, true, `Valid v2_face check-in must succeed: ${JSON.stringify(ci1)}`);
    assert.equal(ci1.data.scheduleWarning, true, 'v2_face during Thu-Sat without schedule must return scheduleWarning=true');
    assert.equal(gas.sheetsData['✔️CHẤM CÔNG'][1][1], 'Vào ca (Trễ 20p)');
    assert.equal((gas.sheetsData['BonusPenalty'] || []).length, 2, '20m late on 1st Vào ca must create 1 BonusPenalty row');

    // C. 10 minutes later (15:30): nv1 tries again -> BLOCKED by 15-minute cooldown!
    gas.setNowIso('2026-11-05T15:30:00+07:00');
    const ci1Spam = gas.callDoPost({
      action: 'CHECK_IN_OUT',
      checkinMode: 'v2_face',
      username: 'nv1',
      fullname: 'Nguyễn Văn Một',
      type: 'Ra ca',
      liveVectorB64: makeInt8VectorB64(1),
      lat: 10.976083,
      lng: 106.664654,
      gpsAccuracy: 5,
      time: '05/11/2026 15:30:00',
      fastSync: true,
      image: 'PENDING',
    });
    assert.equal(ci1Spam.ok, false, '10m elapsed (< 15m) must be blocked by 15m cooldown');
    assert.equal(ci1Spam.code || ci1Spam.data?.code, 'COOLDOWN_15M');

    // D. At 18:10 (190m > 120m after 15:00 shift start): nv2 forgot 15:00 Vào ca and scans at 18:10:
    // -> Must NOT auto-insert BonusPenalty fine; must tag 'Vào ca (Lệch ca >2h - Chờ đối soát)'!
    gas.setNowIso('2026-11-05T18:10:00+07:00');
    const ci2Late190 = gas.callDoPost({
      action: 'CHECK_IN_OUT',
      checkinMode: 'v2_face',
      username: 'nv2',
      fullname: 'Trần Thị Hai',
      type: 'Vào ca',
      liveVectorB64: makeInt8VectorB64(8),
      lat: 10.976083,
      lng: 106.664654,
      gpsAccuracy: 5,
      time: '05/11/2026 18:10:00',
      fastSync: true,
      image: 'PENDING',
    });
    assert.equal(ci2Late190.ok, true);
    assert.match(String(gas.sheetsData['✔️CHẤM CÔNG'][1][1]), /^Vào ca.*Lệch ca >2h/i);
    assert.equal(
      (gas.sheetsData['BonusPenalty'] || []).length,
      2,
      '>120m discrepancy on 1st Vào ca must NOT auto-penalize in BonusPenalty'
    );
    const colH2 = JSON.parse(gas.sheetsData['✔️CHẤM CÔNG'][1][7]);
    assert.equal(colH2.suspectedMissedCheckIn, true);

    // E. nv1 punches Ra ca at 18:15, then a 2nd unified 'Vào ca' at 19:30 -> MUST NOT be fined or tagged Lệch ca against 15:00 Shift 1!
    gas.setNowIso('2026-11-05T18:15:00+07:00');
    gas.callDoPost({
      action: 'CHECK_IN_OUT',
      checkinMode: 'v2_face',
      username: 'nv1',
      fullname: 'Nguyễn Văn Một',
      type: 'Ra ca',
      liveVectorB64: makeInt8VectorB64(1),
      lat: 10.976083,
      lng: 106.664654,
      gpsAccuracy: 5,
      time: '05/11/2026 18:15:00',
      fastSync: true,
      image: 'PENDING',
    });
    gas.setNowIso('2026-11-05T19:30:00+07:00');
    const vao2Res = gas.callDoPost({
      action: 'CHECK_IN_OUT',
      checkinMode: 'v2_face',
      username: 'nv1',
      fullname: 'Nguyễn Văn Một',
      type: 'Vào ca',
      liveVectorB64: makeInt8VectorB64(1),
      lat: 10.976083 + 0.00025, // ~28m raw indoor drift, gpsAccuracy=15 -> indoorAllowance=6.75m -> effectiveDist ~21.2m <= 25m!
      lng: 106.664654,
      gpsAccuracy: 15,
      time: '05/11/2026 19:30:00',
      fastSync: true,
      image: 'PENDING',
    });
    assert.equal(vao2Res.ok, true, `2nd Vào ca with indoor GPS drift (28m raw, acc 15m) must succeed: ${JSON.stringify(vao2Res)}`);
    assert.equal(gas.sheetsData['✔️CHẤM CÔNG'][1][1], 'Vào ca', '2nd Vào ca in same workday cycle must NOT receive Shift 1 late/discrepancy tag');
    assert.equal(gas.sheetsData['✔️CHẤM CÔNG'][1][4], 'Hợp lệ', 'Indoor GPS drift within effectiveDist <= 25m must be recorded Hợp lệ in Col E');
    assert.equal((gas.sheetsData['BonusPenalty'] || []).length, 2, '2nd Vào ca must NOT add BonusPenalty');

    // F. Background UPLOAD_CHECKIN_IMAGE with sendEmailAfterUpload=true updates Col G HYPERLINK and sends email ONCE
    const fakeBase64Img = 'data:image/jpeg;base64,' + Buffer.alloc(120, 7).toString('base64');
    const emailsBefore = gas.sentEmails.length;
    const up1 = gas.callDoPost({
      action: 'UPLOAD_CHECKIN_IMAGE',
      checkinId: 'CI_V2_NV1_1',
      username: 'nv1',
      fullname: 'Nguyễn Văn Một',
      image: fakeBase64Img,
      sendEmailAfterUpload: true,
    });
    assert.equal(up1.ok, true);
    assert.ok(up1.data.url.includes('drive.google.com'));
    assert.ok(gas.sentEmails.length > emailsBefore, 'First upload with sendEmailAfterUpload=true must send email');

    const emailsAfterFirst = gas.sentEmails.length;
    const upRetry = gas.callDoPost({
      action: 'UPLOAD_CHECKIN_IMAGE',
      checkinId: 'CI_V2_NV1_1',
      username: 'nv1',
      fullname: 'Nguyễn Văn Một',
      image: fakeBase64Img,
      sendEmailAfterUpload: true,
    });
    assert.equal(upRetry.ok, true);
    assert.equal(gas.sentEmails.length, emailsAfterFirst, 'Retry of UPLOAD_CHECKIN_IMAGE must NOT send duplicate email');
  });

  test('2.4 GAS Admin-assisted employee enrollment, canonical v1 8-col sheet row, checkinId idempotency & earliest-scan-wins 15m lock', () => {
    const gas = createGasV2Sandbox(
      {
        DATA: [
          ['Bảng người dùng'],
          ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
          ['admin', 'hash_adm', 'Quản Lý Nhà Hàng', '', 'admin@kg.vn', 'admin', 'Quản lý', '', 'active'],
          ['nv_thao', 'hash_t', 'Nguyễn Thị Phương Thảo', '', 'thao@kg.vn', 'user', 'Thu ngân', '', 'active'],
        ],
        '⚙️ CẤU HÌNH': [
          ['Key', 'Value'],
          ['GPS_CONFIG', JSON.stringify({ lat: 10.9760327, lng: 106.6645922, radius: 25 })],
        ],
        'Tháng 11/2026': [
          ['📅 TUẦN 02/11 - 08/11', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'],
          ['┗ Nguyễn Thị Phương Thảo', '15:00', '15:00', '15:00', '15:00', '15:00', '15:00', '15:00'],
        ],
        '✔️CHẤM CÔNG': [['Họ tên', 'Loại', 'Thời gian', 'Vị trí', 'Trạng thái', 'Khoảng cách', 'Ảnh', 'JSON']],
      },
      '2026-11-03T15:02:00+07:00' // Tuesday 15:02 (on time for 15:00 shift)
    );

    // 1. Admin GET_FACE_PROFILES returns activeEmployees + gpsConfig so Admin can pick any employee
    const adminProfList = gas.callDoPost({
      action: 'GET_FACE_PROFILES',
      username: 'admin',
      actorUsername: 'admin',
      role: 'admin',
    });
    assert.equal(adminProfList.ok, true);
    assert.ok(Array.isArray(adminProfList.data.activeEmployees), 'Admin GET_FACE_PROFILES must return activeEmployees list');
    assert.equal(
      adminProfList.data.activeEmployees.some((e: any) => e.username === 'nv_thao'),
      true,
      'activeEmployees must include nv_thao'
    );
    assert.equal(Number(adminProfList.data.gpsConfig?.lat), 10.9760327, 'GET_FACE_PROFILES must expose calibrated gpsConfig');

    // 2. Admin enrolls on behalf of nv_thao (role='user', actorRole='admin'), then re-enrolls directly without needing RESET first!
    const enrollByAdmin1 = gas.callDoPost({
      action: 'ENROLL_FACE_PROFILE',
      username: 'nv_thao',
      fullname: 'Nguyễn Thị Phương Thảo',
      role: 'user',
      actorRole: 'admin',
      adminUsername: 'admin',
      actorUsername: 'admin',
      vectorsB64: make5AnglePackB64(3),
      anglesCount: 5,
    });
    assert.equal(enrollByAdmin1.ok, true);

    const reEnrollByAdmin = gas.callDoPost({
      action: 'ENROLL_FACE_PROFILE',
      username: 'nv_thao',
      fullname: 'Nguyễn Thị Phương Thảo',
      role: 'user',
      actorRole: 'admin',
      adminUsername: 'admin',
      actorUsername: 'admin',
      vectorsB64: make5AnglePackB64(6),
      anglesCount: 5,
    });
    assert.equal(reEnrollByAdmin.ok, true, 'Admin actorRole override must allow direct re-enrollment of selected staff');

    // 3. Employee checks in from a Kiosk phone (even if client passed unaccented fullname): GAS writes canonical 8-col v1 row!
    const scanEarliest = gas.callDoPost({
      action: 'CHECK_IN_OUT',
      checkinMode: 'v2_face',
      checkinId: 'CHK_EARLIEST_THAO_1',
      username: 'nv_thao',
      fullname: 'nguyen thi phuong thao', // unaccented client string
      type: 'Vào 1',
      liveVectorB64: makeInt8VectorB64(6),
      lat: 10.9760327,
      lng: 106.6645922,
      gpsAccuracy: 6,
      location: "King's Grill - Số 34, Hoàng Văn Thụ, Phường Thủ Dầu Một, Thành phố Hồ Chí Minh",
      time: '03/11/2026 15:02:00',
      actualTime: '03/11/2026 15:02:00',
      fastSync: true,
      image: 'PENDING',
    });
    assert.equal(scanEarliest.ok, true);
    assert.equal(gas.sheetsData['✔️CHẤM CÔNG'].length, 2);
    const writtenRow = gas.sheetsData['✔️CHẤM CÔNG'][1];
    assert.equal(writtenRow.length, 8, 'Must write full 8-column v1 row');
    assert.equal(writtenRow[0], 'Nguyễn Thị Phương Thảo', 'Col A must be canonical DATA fullname');
    assert.equal(writtenRow[1], 'Vào ca', 'Col B must be unified Vào ca');
    assert.equal(writtenRow[2], "'03/11/2026 15:02:00", 'Col C must preserve apostrophe-prefixed Vietnam timestamp');
    assert.ok(String(writtenRow[3]).includes("King's Grill"), 'Col D must record location');
    assert.equal(writtenRow[4], 'Hợp lệ', 'Col E must record Hợp lệ');
    assert.equal(writtenRow[5], '0m', 'Col F must record distance in meters');
    const parsedJson = JSON.parse(writtenRow[7]);
    assert.equal(parsedJson.hoVaTen, 'Nguyễn Thị Phương Thảo');
    assert.equal(parsedJson.caLam, '15:00', 'Phase 2 schedule lookup must match canonical fullname');

    // 4. Network retry with the EXACT SAME checkinId -> returns idempotent ok=true WITHOUT inserting duplicate row!
    const retrySameId = gas.callDoPost({
      action: 'CHECK_IN_OUT',
      checkinMode: 'v2_face',
      checkinId: 'CHK_EARLIEST_THAO_1',
      username: 'nv_thao',
      fullname: 'Nguyễn Thị Phương Thảo',
      type: 'Vào ca',
      liveVectorB64: makeInt8VectorB64(6),
      lat: 10.9760327,
      lng: 106.6645922,
      gpsAccuracy: 6,
      time: '03/11/2026 15:02:00',
      fastSync: true,
      image: 'PENDING',
    });
    assert.equal(retrySameId.ok, true, 'Idempotent retry of same checkinId must return ok=true');
    assert.equal(gas.sheetsData['✔️CHẤM CÔNG'].length, 2, 'Idempotent retry must NOT insert a second row');

    // 5. Continuous camera scan 3 seconds later (DIFFERENT checkinId) -> rejected by 15m lock, keeping ONLY earliest scan!
    gas.setNowIso('2026-11-03T15:02:03+07:00');
    const secondContinuousScan = gas.callDoPost({
      action: 'CHECK_IN_OUT',
      checkinMode: 'v2_face',
      checkinId: 'CHK_SECOND_SCAN_THAO_2',
      username: 'nv_thao',
      fullname: 'Nguyễn Thị Phương Thảo',
      type: 'Ra ca',
      liveVectorB64: makeInt8VectorB64(6),
      lat: 10.9760327,
      lng: 106.6645922,
      gpsAccuracy: 6,
      time: '03/11/2026 15:02:03',
      fastSync: true,
      image: 'PENDING',
    });
    assert.equal(secondContinuousScan.ok, false);
    assert.equal(secondContinuousScan.code || secondContinuousScan.data?.code, 'COOLDOWN_15M');
    assert.equal(gas.sheetsData['✔️CHẤM CÔNG'].length, 2, 'Only the earliest scan must exist in sheet');

    // 6. 16 minutes later (15:18:00 >= 15m) -> Ra ca succeeds (even if legacy client sent Ra 1)!
    gas.setNowIso('2026-11-03T15:18:00+07:00');
    const validRa1After15m = gas.callDoPost({
      action: 'CHECK_IN_OUT',
      checkinMode: 'v2_face',
      checkinId: 'CHK_RA1_THAO_3',
      username: 'nv_thao',
      fullname: 'Nguyễn Thị Phương Thảo',
      type: 'Ra 1',
      liveVectorB64: makeInt8VectorB64(6),
      lat: 10.9760327,
      lng: 106.6645922,
      gpsAccuracy: 6,
      time: '03/11/2026 15:18:00',
      fastSync: true,
      image: 'PENDING',
    });
    assert.equal(validRa1After15m.ok, true, 'Punch after 15 minutes must succeed');
    assert.equal(gas.sheetsData['✔️CHẤM CÔNG'].length, 3);
    assert.equal(gas.sheetsData['✔️CHẤM CÔNG'][1][1], 'Ra ca');
  });
});

// ---------------------------------------------------------------------------
// Task 3: Cloudflare Edge D1 Gateway (functions/api.js + edge_face_profiles)
// ---------------------------------------------------------------------------
function createEdgeFaceD1Mock() {
  const faceProfiles = new Map<string, any>();
  const checkinLogs: any[] = [];
  const auditLogs: any[] = [];
  const kvCache = new Map<string, any>();
  const syncQueue: any[] = [];

  const prepare = (sql: string) => {
    const normSql = sql.replace(/\s+/g, ' ').trim();
    const execRun = async (args: any[]) => {
      if (normSql.includes('INSERT INTO edge_face_profiles') || normSql.includes('INSERT OR REPLACE INTO edge_face_profiles')) {
        const row = {
          username: String(args[0] || '').toLowerCase(),
          fullname: args[1],
          role: args[2],
          position: args[3],
          avatar_url: args[4],
          employment_status: args[5],
          model_version: args[6],
          angle_count: args[7],
          vectors_b64: args[8],
          centroid_b64: args[9],
          quality_score: args[10],
          is_locked: args[11],
          enrolled_at: args[12],
          enrolled_by: args[13],
          unlocked_by: args[14],
          updated_at: args[15],
        };
        faceProfiles.set(row.username, row);
      } else if (normSql.includes('UPDATE edge_face_profiles SET vectors_b64')) {
        const u = String(args[2] || '').toLowerCase();
        const existing = faceProfiles.get(u);
        if (existing) {
          existing.vectors_b64 = args[0];
          existing.updated_at = args[1];
        }
      } else if (normSql.includes('DELETE FROM edge_face_profiles')) {
        faceProfiles.delete(String(args[0] || '').toLowerCase());
      } else if (normSql.includes('INSERT OR REPLACE INTO edge_checkin_logs')) {
        const id = String(args[0]);
        const idx = checkinLogs.findIndex((r) => r.id === id);
        const rec = {
          id,
          username: String(args[1] || '').toLowerCase(),
          fullname: args[2],
          check_type: args[3],
          shift_name: args[4],
          time_str: args[5],
          status: args[6],
          distance: args[7],
          lat: args[8],
          lng: args[9],
          note: args[10],
          image_url: args[11],
          sheet_synced: 1,
          created_at: args[12],
        };
        if (idx >= 0) checkinLogs[idx] = rec;
        else checkinLogs.unshift(rec);
      } else if (normSql.includes('UPDATE edge_checkin_logs SET image_url')) {
        const imgUrl = args[0];
        const targetId = String(args[1] || '');
        const targetUser = String(args[2] || '').toLowerCase();
        for (const r of checkinLogs) {
          if (r.id === targetId || (targetUser && r.username === targetUser && (!r.image_url || r.image_url === 'PENDING'))) {
            r.image_url = imgUrl;
            break;
          }
        }
      } else if (normSql.includes('INSERT INTO edge_audit_logs')) {
        auditLogs.unshift({
          id: args[0],
          actor: args[1],
          action: args[2],
          target: args[3],
          summary: args[4],
          record_json: args[5],
          created_at: args[6],
        });
      } else if (normSql.includes('INSERT INTO edge_kv_cache')) {
        kvCache.set(String(args[0]), {
          cache_key: args[0],
          action: args[1],
          payload_json: args[2],
          updated_at: args[3],
          expires_at: args[4],
        });
      } else if (normSql.includes('DELETE FROM edge_kv_cache')) {
        if (args.length > 0) {
          for (const [k, v] of kvCache.entries()) {
            if (v.action === args[0]) kvCache.delete(k);
          }
        } else {
          kvCache.clear();
        }
      } else if (normSql.includes('INSERT INTO edge_sync_queue')) {
        const isLiteralRegisterShift = normSql.includes("'REGISTER_SHIFT'");
        const dedupeKey = String(args[0] || '');
        const actionName = isLiteralRegisterShift ? 'REGISTER_SHIFT' : String(args[1] || '');
        const payloadJson = isLiteralRegisterShift ? args[1] : args[2];
        const tsNow = isLiteralRegisterShift ? args[2] : args[3];
        const existingIdx = syncQueue.findIndex((q) => q.dedupe_key === dedupeKey);
        const rec = {
          id: existingIdx >= 0 ? syncQueue[existingIdx].id : syncQueue.length + 1,
          dedupe_key: dedupeKey,
          action: actionName,
          payload_json: payloadJson,
          status: 'pending',
          attempts: 1,
          last_error: '',
          created_at: tsNow,
          updated_at: tsNow,
        };
        if (existingIdx >= 0) syncQueue[existingIdx] = rec;
        else syncQueue.push(rec);
      } else if (normSql.includes('DELETE FROM edge_sync_queue WHERE dedupe_key = ?1')) {
        const idx = syncQueue.findIndex((q) => q.dedupe_key === String(args[0] || ''));
        if (idx >= 0) syncQueue.splice(idx, 1);
      } else if (normSql.includes('DELETE FROM edge_sync_queue WHERE id = ?1')) {
        const idx = syncQueue.findIndex((q) => q.id === args[0]);
        if (idx >= 0) syncQueue.splice(idx, 1);
      } else if (normSql.includes('UPDATE edge_sync_queue SET attempts')) {
        const q = syncQueue.find((item) => item.id === args[2]);
        if (q) {
          q.attempts += 1;
          q.last_error = String(args[0] || '');
          q.updated_at = args[1];
        }
      }
      return { success: true };
    };

    const execAll = async (args: any[]) => {
      if (normSql.includes('FROM edge_face_profiles')) {
        return { results: Array.from(faceProfiles.values()) };
      }
      if (normSql.includes('FROM edge_sync_queue')) {
        return { results: syncQueue.filter((q) => q.status === 'pending' && q.attempts < 30) };
      }
      if (normSql.includes('FROM edge_checkin_logs')) {
        if (normSql.includes('WHERE lower(username) = ?1') || normSql.includes('WHERE username = ?1')) {
          const u = String(args[0] || '').toLowerCase();
          const minTs = Number(args[1] || 0);
          return {
            results: checkinLogs.filter((r) => r.username === u && Number(r.created_at) >= minTs),
          };
        }
        const cutoff = Number(args[0] || 0);
        return { results: checkinLogs.filter((r) => Number(r.created_at) >= cutoff) };
      }
      if (normSql.includes('FROM edge_audit_logs')) {
        return { results: auditLogs };
      }
      return { results: [] };
    };

    const execFirst = async (args: any[]) => {
      if (normSql.includes('COUNT(*) as c FROM edge_face_profiles')) {
        return { c: faceProfiles.size };
      }
      if (normSql.includes('FROM edge_face_profiles WHERE username = ?1')) {
        return faceProfiles.get(String(args[0] || '').toLowerCase()) || null;
      }
      if (normSql.includes('FROM edge_kv_cache WHERE cache_key = ?1')) {
        return kvCache.get(String(args[0])) || null;
      }
      return { c: 0 };
    };

    return {
      bind: (...args: any[]) => ({
        run: () => execRun(args),
        all: () => execAll(args),
        first: () => execFirst(args),
      }),
      run: () => execRun([]),
      all: () => execAll([]),
      first: () => execFirst([]),
    };
  };

  return {
    db: {
      batch: async (stmts: any[]) => Promise.all(stmts.map((s) => s.run())),
      prepare,
    },
    faceProfiles,
    checkinLogs,
    auditLogs,
    syncQueue,
  };
}

describe('Task 3: Cloudflare Edge D1 Gateway (Face Profiles, Kiosk GPS Gate, Biometric Verify & 30m Cooldown)', () => {
  test('3.1 Edge enforces RESET_FACE_PROFILE RBAC, ENROLL lock & anti-duplicate, Kiosk GPS <=25m, v2_face cosine verify, 30m per-user cooldown, and Vào 1/Ra 1 stats', async () => {
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    const mock = createEdgeFaceD1Mock();

    (globalThis as any).caches = {
      default: {
        match: async () => null,
        put: async () => {},
        delete: async () => false,
      },
    };

    const origFetch = globalThis.fetch;
    // Simulate a live GAS endpoint that has NOT been clasp-pushed yet for new Face ID actions,
    // while handling CHECK_IN_OUT, UPLOAD_CHECKIN_IMAGE, and GET_CHECKIN_LOGS.
    globalThis.fetch = (async (_url: any, init?: any) => {
      const parsed = JSON.parse(init.body);
      if (
        parsed.action === 'ENROLL_FACE_PROFILE' ||
        parsed.action === 'GET_FACE_PROFILES' ||
        parsed.action === 'RESET_FACE_PROFILE' ||
        parsed.action === 'GET_KIOSK_ATTENDANCE_STATE'
      ) {
        return new Response(JSON.stringify({ ok: false, message: 'Unknown action: ' + parsed.action }));
      }
      if (parsed.action === 'CHECK_IN_OUT') {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              checkinId: parsed.checkinId || 'CI_EDGE_1',
              time: parsed.time || '10/11/2026 09:00:00',
              status: 'Hợp lệ',
            },
          })
        );
      }
      if (parsed.action === 'UPLOAD_CHECKIN_IMAGE') {
        return new Response(
          JSON.stringify({
            ok: true,
            data: { url: 'https://drive.google.com/file/d/edge_photo_1/view' },
          })
        );
      }
      if (parsed.action === 'GET_CHECKIN_LOGS') {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              logs: [
                {
                  username: 'nv2',
                  fullname: 'Trần Thị Hai',
                  type: 'Ra 1',
                  time: '10/11/2026 14:00:00',
                  status: 'Hợp lệ',
                  timestamp: Date.now() - 3600_000,
                },
                {
                  username: 'nv2',
                  fullname: 'Trần Thị Hai',
                  type: 'Kiểm tra',
                  time: '10/11/2026 13:55:00',
                  status: 'Hợp lệ',
                  timestamp: Date.now() - 3900_000,
                },
              ],
              availableMonths: ['2026-11'],
              totalCount: 2,
              stats: { totalPunches: 2, totalCheckIn: 0, totalCheckOut: 2, validCount: 2 },
            },
          })
        );
      }
      return new Response(JSON.stringify({ ok: true, data: {} }));
    }) as any;

    try {
      const waitTasks: Promise<any>[] = [];
      const callEdge = async (body: any) => {
        const res = await edgeMod.onRequest({
          request: new Request('https://kg.example/api', { method: 'POST', body: JSON.stringify(body) }),
          env: { DB: mock.db },
          waitUntil: (p: Promise<any>) => waitTasks.push(p),
        });
        await Promise.all(waitTasks.splice(0));
        return { status: res.status, json: await res.json() };
      };

      // A. Non-admin calling RESET_FACE_PROFILE -> MUST BE REJECTED 403
      const resetForbidden = await callEdge({
        action: 'RESET_FACE_PROFILE',
        role: 'user',
        username: 'nv1',
        targetUsername: 'nv1',
      });
      assert.equal(resetForbidden.status, 403);

      // B. Enroll nv1 (seed 1) -> succeeds via Edge D1 fallback & locks immediately
      const enrollNv1 = await callEdge({
        action: 'ENROLL_FACE_PROFILE',
        username: 'nv1',
        fullname: 'Nguyễn Văn Một',
        position: 'Phục vụ',
        vectorsB64: make5AnglePackB64(1),
        anglesCount: 5,
      });
      assert.equal(enrollNv1.json.ok, true);
      assert.equal(mock.faceProfiles.get('nv1')?.is_locked, 1);

      // C. Re-enrolling nv1 without admin unlock -> blocked FACE_PROFILE_LOCKED
      const reEnrollLocked = await callEdge({
        action: 'ENROLL_FACE_PROFILE',
        username: 'nv1',
        fullname: 'Nguyễn Văn Một',
        vectorsB64: make5AnglePackB64(3),
        anglesCount: 5,
      });
      assert.equal(reEnrollLocked.json.ok, false);
      assert.equal(reEnrollLocked.json.data?.code || reEnrollLocked.json.code, 'FACE_PROFILE_LOCKED');

      // D. nv2 attempting to enroll nv1's face (seed 1) -> blocked DUPLICATE_FACE_IDENTITY
      const dupEnroll = await callEdge({
        action: 'ENROLL_FACE_PROFILE',
        username: 'nv2',
        fullname: 'Trần Thị Hai',
        vectorsB64: make5AnglePackB64(1),
        anglesCount: 5,
      });
      assert.equal(dupEnroll.json.ok, false);
      assert.equal(dupEnroll.json.data?.code || dupEnroll.json.code, 'DUPLICATE_FACE_IDENTITY');

      // E. nv2 enrolls distinct face (seed 5) -> succeeds
      const enrollNv2 = await callEdge({
        action: 'ENROLL_FACE_PROFILE',
        username: 'nv2',
        fullname: 'Trần Thị Hai',
        position: 'Thu ngân',
        vectorsB64: make5AnglePackB64(5),
        anglesCount: 5,
      });
      assert.equal(enrollNv2.json.ok, true);

      // F. Kiosk GPS Gate on GET_FACE_PROFILES & GET_KIOSK_ATTENDANCE_STATE
      const kioskNoGps = await callEdge({ action: 'GET_FACE_PROFILES', isKiosk: true });
      assert.equal(kioskNoGps.json.ok, false);
      assert.equal(kioskNoGps.json.data?.code || kioskNoGps.json.code, 'GPS_REQUIRED');

      const kioskFar = await callEdge({
        action: 'GET_FACE_PROFILES',
        isKiosk: true,
        lat: 10.99,
        lng: 106.7,
      });
      assert.equal(kioskFar.json.ok, false);
      assert.equal(kioskFar.json.data?.code || kioskFar.json.code, 'OUT_OF_RADIUS');

      const kioskOk = await callEdge({
        action: 'GET_FACE_PROFILES',
        isKiosk: true,
        lat: 10.976083,
        lng: 106.664654,
        gpsAccuracy: 5,
      });
      assert.equal(kioskOk.json.ok, true);
      assert.equal(kioskOk.json.data.profiles.length, 2);
      assert.equal('password' in kioskOk.json.data.profiles[0], false);
      assert.equal('email' in kioskOk.json.data.profiles[0], false);

      // G. CHECK_IN_OUT (v2_face) rejects spoofed vector on Edge before GAS
      const spoofPunch = await callEdge({
        action: 'CHECK_IN_OUT',
        checkinMode: 'v2_face',
        username: 'nv1',
        fullname: 'Nguyễn Văn Một',
        type: 'Vào 1',
        liveVectorB64: makeInt8VectorB64(9),
        lat: 10.976083,
        lng: 106.664654,
      });
      assert.equal(spoofPunch.json.ok, false);
      assert.equal(spoofPunch.json.data?.code || spoofPunch.json.code, 'FACE_VERIFICATION_FAILED');

      // H. Valid v2_face punch for nv1 -> succeeds, then 2nd punch by nv1 within 30m is blocked while nv2 succeeds!
      const validNv1 = await callEdge({
        action: 'CHECK_IN_OUT',
        checkinMode: 'v2_face',
        checkinId: 'CI_EDGE_NV1_1',
        username: 'nv1',
        fullname: 'Nguyễn Văn Một',
        type: 'Vào 1',
        liveVectorB64: makeInt8VectorB64(1),
        lat: 10.976083,
        lng: 106.664654,
        time: '10/11/2026 09:00:00',
      });
      assert.equal(validNv1.json.ok, true);

      const cooldownNv1 = await callEdge({
        action: 'CHECK_IN_OUT',
        checkinMode: 'v2_face',
        username: 'nv1',
        fullname: 'Nguyễn Văn Một',
        type: 'Ra 1',
        liveVectorB64: makeInt8VectorB64(1),
        lat: 10.976083,
        lng: 106.664654,
        time: '10/11/2026 09:05:00',
      });
      assert.equal(cooldownNv1.json.ok, false);
      assert.equal(cooldownNv1.json.data?.code || cooldownNv1.json.code, 'COOLDOWN_15M');

      const validNv2 = await callEdge({
        action: 'CHECK_IN_OUT',
        checkinMode: 'v2_face',
        checkinId: 'CI_EDGE_NV2_1',
        username: 'nv2',
        fullname: 'Trần Thị Hai',
        type: 'Vào 1',
        liveVectorB64: makeInt8VectorB64(5),
        lat: 10.976083,
        lng: 106.664654,
        time: '10/11/2026 09:01:00',
      });
      assert.equal(validNv2.json.ok, true, 'Employee 2 on same device must not be blocked by Employee 1 cooldown');

      // I. UPLOAD_CHECKIN_IMAGE updates image_url in D1, and GET_KIOSK_ATTENDANCE_STATE + GET_CHECKIN_LOGS count Vào 1/Ra 1 accurately
      const upImg = await callEdge({
        action: 'UPLOAD_CHECKIN_IMAGE',
        checkinId: 'CI_EDGE_NV1_1',
        username: 'nv1',
        image: 'data:image/jpeg;base64,AAAA',
      });
      assert.equal(upImg.json.ok, true);
      assert.equal(
        mock.checkinLogs.find((r) => r.id === 'CI_EDGE_NV1_1')?.image_url,
        'https://drive.google.com/file/d/edge_photo_1/view'
      );

      const kioskState = await callEdge({
        action: 'GET_KIOSK_ATTENDANCE_STATE',
        isKiosk: true,
        lat: 10.976083,
        lng: 106.664654,
        gpsAccuracy: 5,
      });
      assert.equal(kioskState.json.ok, true);
      assert.equal(kioskState.json.data.logs.length, 2);
      assert.equal('lat' in kioskState.json.data.logs[0], false, 'Kiosk state must not leak GPS coordinates');

      const logsRes = await callEdge({
        action: 'GET_CHECKIN_LOGS',
        role: 'admin',
        username: 'admin',
        forceRefresh: true,
      });
      assert.equal(logsRes.json.ok, true);
      assert.equal(logsRes.json.data.stats.totalCheckIn, 2, 'Must count both Vào 1 punches');
      assert.equal(logsRes.json.data.stats.totalCheckOut, 1, 'Must count Ra 1 and ignore Kiểm tra');

      // J. Admin RESET_FACE_PROFILE unlocks/deletes nv1 profile and logs audit entry
      const adminReset = await callEdge({
        action: 'RESET_FACE_PROFILE',
        role: 'admin',
        adminUsername: 'admin01',
        targetUsername: 'nv1',
      });
      assert.equal(adminReset.status, 200);
      assert.equal(adminReset.json.ok, true);
      assert.equal(mock.faceProfiles.has('nv1'), false);
      assert.equal(mock.auditLogs.some((a) => a.action === 'RESET_FACE_PROFILE'), true);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('3.2 Edge Admin-assisted enrollment syncs immediately across phones (no-store POP bypass), accepts cross-phone ~0.53 cosine, and enforces atomic earliest-scan-wins on concurrent punches', async () => {
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    const mock = createEdgeFaceD1Mock();
    const origFetch = globalThis.fetch;

    // Simulate a poisoned/stale L1 POP cache entry returning old profiles without nv_moi
    const popStore = new Map<string, Response>();
    (globalThis as any).caches = {
      default: {
        match: async (req: Request) => popStore.get(req.url)?.clone() ?? null,
        put: async (req: Request, res: Response) => {
          popStore.set(req.url, res.clone());
        },
        delete: async (req: Request) => popStore.delete(req.url),
      },
    };

    let gasCheckInCalls = 0;
    globalThis.fetch = (async (_url: any, init?: any) => {
      const parsed = JSON.parse(init.body);
      if (parsed.action === 'GET_FACE_PROFILES') {
        return new Response(JSON.stringify({ ok: true, data: { profiles: [], totalActiveUsers: 1 } }));
      }
      if (parsed.action === 'ENROLL_FACE_PROFILE') {
        return new Response(
          JSON.stringify({
            ok: true,
            data: { username: parsed.username, fullname: parsed.fullname, anglesCount: 5, isLocked: true },
          })
        );
      }
      if (parsed.action === 'CHECK_IN_OUT') {
        gasCheckInCalls += 1;
        // Simulate 40ms GAS execution latency so concurrent requests overlap in flight!
        await new Promise((r) => setTimeout(r, 40));
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              sheetSaved: true,
              checkinId: parsed.checkinId,
              time: parsed.time,
              thoiGian: parsed.time,
              status: 'Hợp lệ',
            },
          })
        );
      }
      return new Response(JSON.stringify({ ok: true, data: {} }));
    }) as any;

    try {
      const callEdgeRaw = async (body: any) => {
        const res = await edgeMod.onRequest({
          request: new Request('https://kg.example/api', { method: 'POST', body: JSON.stringify(body) }),
          env: { DB: mock.db },
          waitUntil: () => {},
        });
        return { status: res.status, headers: res.headers, json: await res.json() };
      };

      // 1. Phone B fetches GET_FACE_PROFILES before enrollment (would have populated stale POP cache previously)
      const beforeEnroll = await callEdgeRaw({
        action: 'GET_FACE_PROFILES',
        isKiosk: true,
        lat: 10.9760327,
        lng: 106.6645922,
        gpsAccuracy: 6,
      });
      assert.equal(beforeEnroll.json.ok, true);
      assert.ok(
        String(beforeEnroll.headers.get('Cache-Control') || '').includes('no-store'),
        'GET_FACE_PROFILES must set Cache-Control: no-store so cross-phone Kiosks never serve stale CDN/browser cache'
      );

      // 2. Phone A (Admin) enrolls Face ID on behalf of nv_moi (actorRole='admin', targetRole='user')
      const adminEnrollStaff = await callEdgeRaw({
        action: 'ENROLL_FACE_PROFILE',
        username: 'nv_moi',
        fullname: 'Lê Thị Mới',
        position: 'Phục vụ',
        role: 'user',
        targetRole: 'user',
        actorRole: 'admin',
        adminUsername: 'ADMIN',
        actorUsername: 'ADMIN',
        enrolledByAdmin: true,
        vectorsB64: make5AnglePackB64(2),
        anglesCount: 5,
      });
      assert.equal(adminEnrollStaff.json.ok, true);
      assert.equal(mock.faceProfiles.get('nv_moi')?.role, 'user', 'Target employee role in D1 must remain user, not admin');

      // Admin can also re-enroll nv_moi directly even when is_locked=1!
      const adminReEnrollStaff = await callEdgeRaw({
        action: 'ENROLL_FACE_PROFILE',
        username: 'nv_moi',
        fullname: 'Lê Thị Mới',
        position: 'Phục vụ',
        role: 'user',
        targetRole: 'user',
        actorRole: 'admin',
        adminUsername: 'ADMIN',
        actorUsername: 'ADMIN',
        enrolledByAdmin: true,
        vectorsB64: make5AnglePackB64(3),
        anglesCount: 5,
      });
      assert.equal(adminReEnrollStaff.json.ok, true, 'Admin must be able to re-enroll locked staff directly');

      // 3. Phone B (even WITHOUT forceRefresh!) calls GET_FACE_PROFILES 0ms later -> MUST immediately see nv_moi!
      const phoneBProfiles = await callEdgeRaw({
        action: 'GET_FACE_PROFILES',
        isKiosk: true,
        lat: 10.9760327,
        lng: 106.6645922,
        gpsAccuracy: 6,
      });
      assert.equal(phoneBProfiles.json.ok, true);
      assert.equal(
        phoneBProfiles.json.data.profiles.some((p: any) => p.username === 'nv_moi'),
        true,
        'Phone B must immediately receive newly enrolled employee profile without stale cache delay'
      );

      // 4. Phone B fires TWO concurrent continuous-scan CHECK_IN_OUT requests at the same millisecond
      // using a cross-phone live vector (~0.54 cosine): ONLY the earliest scan must reach GAS and succeed!
      const crossPhoneVec = makeCrossPhoneLiveVectorB64(3, 0.54);
      const [resScan1, resScan2] = await Promise.all([
        callEdgeRaw({
          action: 'CHECK_IN_OUT',
          checkinMode: 'v2_face',
          checkinId: 'CHK_CONCURRENT_1',
          username: 'nv_moi',
          fullname: 'Lê Thị Mới',
          type: 'Vào 1',
          liveVectorB64: crossPhoneVec,
          lat: 10.9760327,
          lng: 106.6645922,
          time: '10/11/2026 09:10:00',
        }),
        callEdgeRaw({
          action: 'CHECK_IN_OUT',
          checkinMode: 'v2_face',
          checkinId: 'CHK_CONCURRENT_2',
          username: 'nv_moi',
          fullname: 'Lê Thị Mới',
          type: 'Vào 1',
          liveVectorB64: crossPhoneVec,
          lat: 10.9760327,
          lng: 106.6645922,
          time: '10/11/2026 09:10:01',
        }),
      ]);

      const successes = [resScan1, resScan2].filter((r) => r.json.ok === true);
      const blocked = [resScan1, resScan2].filter((r) => r.json.ok === false);
      assert.equal(successes.length, 1, 'Exactly ONE earliest scan must succeed under concurrent scanning');
      assert.equal(blocked.length, 1, 'Concurrent duplicate scan must be blocked immediately');
      assert.equal(blocked[0].json.data?.code || blocked[0].json.code, 'COOLDOWN_15M');
      assert.equal(gasCheckInCalls, 1, 'Edge in-flight lock must forward only 1 request to GAS');
      assert.equal(mock.checkinLogs.length, 1, 'CHECK_IN_OUT must commit synchronously to D1 before returning');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// Task 4: On-Device Biometric Vision Engine & Real ONNX Runtime Smoke Tests
// ---------------------------------------------------------------------------
import { pathToFileURL } from 'node:url';

describe('Task 4: Biometric Vision Engine (Int8 Quantization, 5-Point Umeyama 112x112, Pose Classifier, 1:N Matcher & Live ONNX Models)', () => {
  test('4.1 Int8 Base64 vector quantization/dequantization preserves >0.9995 cosine similarity across 5 angles', async () => {
    const bio = await vite.ssrLoadModule('/src/services/faceRecognitionV2.ts');

    const originals: Float32Array[] = [];
    for (let k = 0; k < 5; k++) {
      const v = new Float32Array(512);
      let sq = 0;
      for (let i = 0; i < 512; i++) {
        v[i] = Math.sin((i + 1) * 0.13 + k * 0.7) + 0.35 * Math.cos(i * 0.07 - k);
        sq += v[i] * v[i];
      }
      const inv = 1 / Math.sqrt(sq);
      for (let i = 0; i < 512; i++) v[i] *= inv;
      originals.push(v);
    }

    const packedB64 = bio.quantizeVectorsToInt8B64(originals);
    assert.ok(packedB64.length > 3000 && packedB64.length < 3600, `Compact Base64 expected, got ${packedB64.length}`);

    const decoded: Float32Array[] = bio.decodeInt8B64ToVectors(packedB64);
    assert.equal(decoded.length, 5);

    for (let k = 0; k < 5; k++) {
      const cos = bio.cosineSimilarity(originals[k], decoded[k]);
      assert.ok(cos > 0.9995, `Angle ${k} round-trip cosine similarity ${cos} must exceed 0.9995`);
    }
  });

  test('4.2 computeUmeyamaTransform112 maps scaled & rotated 5 facial landmarks accurately onto ArcFace canonical 112x112 coordinates', async () => {
    const bio = await vite.ssrLoadModule('/src/services/faceRecognitionV2.ts');
    const canonical: Array<[number, number]> = bio.ARCFACE_DST_5PTS;

    // Synthesize observed camera landmarks by applying inverse similarity transform (scale 2.4x, rot 14 deg, shift +180,+95)
    const theta = (14 * Math.PI) / 180;
    const scale = 2.4;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const observed: Array<[number, number]> = canonical.map(([cx, cy]) => [
      180 + scale * (cx * cosT - cy * sinT),
      95 + scale * (cx * sinT + cy * cosT),
    ]);

    const M = bio.computeUmeyamaTransform112(observed);
    // M = [a, b, tx, c, d, ty] such that x' = a*x + b*y + tx, y' = c*x + d*y + ty
    for (let i = 0; i < 5; i++) {
      const [ox, oy] = observed[i];
      const [cx, cy] = canonical[i];
      const mx = M[0] * ox + M[1] * oy + M[2];
      const my = M[3] * ox + M[4] * oy + M[5];
      assert.ok(Math.hypot(mx - cx, my - cy) < 1e-3, `Landmark ${i} residual too large: (${mx}, ${my}) vs (${cx}, ${cy})`);
    }
  });

  test('4.3 classifyEnrollmentAngle & TemporalMatchVoter + matchEmployeeFace enforce margin >=0.08, score >=0.62, and 3-frame consensus', async () => {
    const bio = await vite.ssrLoadModule('/src/services/faceRecognitionV2.ts');

    assert.equal(bio.classifyEnrollmentAngle(0, 0), 'CENTER');
    assert.equal(bio.classifyEnrollmentAngle(-18, 2), 'LEFT');
    assert.equal(bio.classifyEnrollmentAngle(19, -1), 'RIGHT');
    assert.equal(bio.classifyEnrollmentAngle(2, 14), 'UP');
    assert.equal(bio.classifyEnrollmentAngle(-2, -14), 'DOWN');

    const profiles = [
      bio.hydrateFaceProfile({
        username: 'nv_an',
        fullname: 'Nguyễn Văn An',
        position: 'Phục vụ',
        employmentStatus: 'active',
        vectorsB64: make5AnglePackB64(2),
        anglesCount: 5,
        isLocked: true,
      }),
      bio.hydrateFaceProfile({
        username: 'nv_binh',
        fullname: 'Lê Thị Bình',
        position: 'Thu ngân',
        employmentStatus: 'active',
        vectorsB64: make5AnglePackB64(7),
        anglesCount: 5,
        isLocked: true,
      }),
      bio.hydrateFaceProfile({
        username: 'nv_nghi',
        fullname: 'Trần Nghỉ Việc',
        position: 'Bếp',
        employmentStatus: 'resigned',
        vectorsB64: make5AnglePackB64(11),
        anglesCount: 5,
        isLocked: true,
      }),
    ];

    const liveAn = bio.decodeInt8B64ToVectors(makeInt8VectorB64(2))[0];
    const liveResigned = bio.decodeInt8B64ToVectors(makeInt8VectorB64(11))[0];

    const mAn = bio.matchEmployeeFace(liveAn, profiles);
    assert.equal(mAn.matched, true);
    assert.equal(mAn.profile?.username, 'nv_an');
    assert.ok(mAn.score >= 0.62);
    assert.ok(mAn.margin >= 0.08);

    // Resigned employee must NEVER match even if vector is identical!
    const mResigned = bio.matchEmployeeFace(liveResigned, profiles);
    assert.equal(mResigned.matched, false);

    // 3-frame consecutive consensus voter
    const voter = new bio.TemporalMatchVoter(3);
    assert.equal(voter.pushFrame(mAn), null);
    assert.equal(voter.pushFrame(mAn), null);
    // Noise frame resets streak!
    assert.equal(voter.pushFrame({ matched: false, score: 0.2, margin: 0, profile: null }), null);
    assert.equal(voter.pushFrame(mAn), null);
    assert.equal(voter.pushFrame(mAn), null);
    const confirmed = voter.pushFrame(mAn);
    assert.equal(confirmed?.profile?.username, 'nv_an');
  });

  test('4.4 Live ONNX Runtime WASM smoke test loads w600k_mbf.onnx & minifasnet_v2.onnx and produces normalized 512-D embeddings & 3-class liveness scores', async () => {
    const bio = await vite.ssrLoadModule('/src/services/faceRecognitionV2.ts');
    const wasmDirUrl = pathToFileURL(path.resolve('public/models/face-v2/wasm')).href + '/';
    const arcBytes = new Uint8Array(fs.readFileSync(path.resolve('public/models/face-v2/w600k_mbf.onnx')));
    const fasBytes = new Uint8Array(fs.readFileSync(path.resolve('public/models/face-v2/minifasnet_v2.onnx')));

    await bio.initOnnxBiometricSessionsFromBytes(arcBytes, fasBytes, wasmDirUrl);

    const rgbA = new Float32Array(3 * 112 * 112);
    const rgbB = new Float32Array(3 * 112 * 112);
    for (let i = 0; i < rgbA.length; i++) {
      rgbA[i] = Math.sin(i * 0.017) * 0.8;
      rgbB[i] = Math.cos(i * 0.031) * 0.8;
    }

    const embA1: Float32Array = await bio.runArcFaceFromChwTensor(rgbA);
    const embA2: Float32Array = await bio.runArcFaceFromChwTensor(rgbA);
    const embB: Float32Array = await bio.runArcFaceFromChwTensor(rgbB);

    assert.equal(embA1.length, 512);
    let normSq = 0;
    for (let i = 0; i < 512; i++) normSq += embA1[i] * embA1[i];
    assert.ok(Math.abs(Math.sqrt(normSq) - 1) < 1e-4, 'ArcFace output must be L2 unit normalized');
    assert.ok(bio.cosineSimilarity(embA1, embA2) > 0.99999, 'Same tensor must produce deterministic embedding');
    assert.ok(bio.cosineSimilarity(embA1, embB) < 0.9, 'Distinct inputs must produce distinct embeddings');

    const bgr80 = new Float32Array(3 * 80 * 80);
    for (let i = 0; i < bgr80.length; i++) bgr80[i] = 120 + (i % 45);
    const liveRes = await bio.runMiniFasNetFromChwTensor(bgr80);
    assert.ok(liveRes.liveScore >= 0 && liveRes.liveScore <= 1);
    assert.ok(
      Math.abs(liveRes.liveScore + liveRes.printSpoofScore + liveRes.replaySpoofScore - 1) < 1e-4,
      'Softmax probabilities across 3 classes must sum to 1.0'
    );
  });

  test('4.5 extractLandmarksAndPose & evaluateEnrollmentPoseTarget handle OpenGL column-major pitch/yaw signs and phone-below-face baseline calibration across all 5 angles', async () => {
    const bio = await vite.ssrLoadModule('/src/services/faceRecognitionV2.ts');
    assert.equal(typeof bio.extractLandmarksAndPose, 'function', 'extractLandmarksAndPose must be exported');
    assert.equal(typeof bio.evaluateEnrollmentPoseTarget, 'function', 'evaluateEnrollmentPoseTarget must be exported');

    // Helper: synthesize 478 normalized FaceMesh landmarks + OpenGL right-handed column-major 4x4 matrix
    // OpenGL camera space: +X right, +Y up, +Z toward camera.
    // Canonical face looks along +Z.
    // - Turning head toward user's physical LEFT (visual LEFT on .mirror-cam) = +yawRad around +Y (nose moves to +X in raw frame)
    // - Tilting chin UP = -pitchUpRad around +X so forward vector [0, 0, 1] -> [0, +sin(pitchUp), cos(pitchUp)]
    function makeOpenGlPoseAndLandmarks(visualRightYawDeg: number, chinUpPitchDeg: number) {
      // Raw rotation around +Y: visual LEFT (negative visualRightYawDeg) means positive raw ry
      const ry = (-visualRightYawDeg * Math.PI) / 180;
      // Raw rotation around +X: chin UP (positive chinUpPitchDeg) means negative rx in right-handed OpenGL
      const rx = (-chinUpPitchDeg * Math.PI) / 180;

      const cy = Math.cos(ry);
      const sy = Math.sin(ry);
      const cx = Math.cos(rx);
      const sx = Math.sin(rx);

      // R = Ry(ry) * Rx(rx)
      // Col 0: [cy, 0, -sy]
      // Col 1: [sy*sx, cx, cy*sx]
      // Col 2 (forward normal): [sy*cx, -sx, cy*cx]
      const colMajor = new Float32Array([
        cy, 0, -sy, 0,
        sy * sx, cx, cy * sx, 0,
        sy * cx, -sx, cy * cx, 0,
        0, 0, -40, 1,
      ]);

      const pts = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
      // Canonical 3D offsets (in +X right, +Y up, +Z toward camera), projected to normalized image (x right, y down, z = -z_gl)
      const set3d = (idx: number, mx: number, my: number, mz: number) => {
        const x1 = mx;
        const y1 = my * cx - mz * sx;
        const z1 = my * sx + mz * cx;
        const x2 = x1 * cy + z1 * sy;
        const y2 = y1;
        const z2 = -x1 * sy + z1 * cy;
        pts[idx] = {
          x: 0.5 + x2,
          y: 0.5 - y2, // image Y points DOWN
          z: -z2, // MediaPipe NormalizedLandmark z: smaller (more negative) = closer to camera
        };
      };

      // Subject right eye (image-left, 468), subject left eye (image-right, 473)
      set3d(468, -0.07, 0.05, 0.06);
      set3d(473, +0.07, 0.05, 0.06);
      set3d(168, 0.0, 0.06, 0.07); // Nasion / between brows
      set3d(10, 0.0, 0.16, 0.03); // Forehead top
      set3d(1, 0.0, -0.01, 0.11); // Nose tip
      set3d(61, -0.055, -0.08, 0.06); // Image-left mouth
      set3d(291, +0.055, -0.08, 0.06); // Image-right mouth
      set3d(152, 0.0, -0.16, 0.03); // Chin bottom
      set3d(234, -0.14, -0.01, -0.02); // Image-left cheek/tragus
      set3d(454, +0.14, -0.01, -0.02); // Image-right cheek/tragus

      return { pts, colMajor };
    }

    // 1. Verify OpenGL column-major UP (+16°) produces POSITIVE pitchDeg (> +10°), NOT inverted negative!
    const upSample = makeOpenGlPoseAndLandmarks(0, +16);
    const upGeom = bio.extractLandmarksAndPose(upSample.pts, upSample.colMajor, 640, 480, true);
    assert.ok(upGeom.pitchDeg >= 11, `Expected chin UP (+16°) to yield pitchDeg >= +11, got ${upGeom.pitchDeg}`);

    // 2. Verify OpenGL column-major DOWN (-16°) produces NEGATIVE pitchDeg (<= -11°)!
    const downSample = makeOpenGlPoseAndLandmarks(0, -16);
    const downGeom = bio.extractLandmarksAndPose(downSample.pts, downSample.colMajor, 640, 480, true);
    assert.ok(downGeom.pitchDeg <= -11, `Expected chin DOWN (-16°) to yield pitchDeg <= -11, got ${downGeom.pitchDeg}`);

    // 3. Verify mirrored selfie LEFT (-18°) & RIGHT (+18°)
    const leftSample = makeOpenGlPoseAndLandmarks(-18, 0);
    const leftGeom = bio.extractLandmarksAndPose(leftSample.pts, leftSample.colMajor, 640, 480, true);
    assert.ok(leftGeom.yawDeg <= -12, `Expected selfie LEFT (-18°) to yield yawDeg <= -12, got ${leftGeom.yawDeg}`);

    const rightSample = makeOpenGlPoseAndLandmarks(+18, 0);
    const rightGeom = bio.extractLandmarksAndPose(rightSample.pts, rightSample.colMajor, 640, 480, true);
    assert.ok(rightGeom.yawDeg >= 12, `Expected selfie RIGHT (+18°) to yield yawDeg >= +12, got ${rightGeom.yawDeg}`);

    // 4. Verify natural handheld phone baseline calibration (user holds phone below face so CENTER has pitch = -13°)
    const centerNatural = bio.evaluateEnrollmentPoseTarget('CENTER', 3, -13, null);
    assert.equal(centerNatural.matched, true, 'Handheld selfie CENTER with -13° downward gaze must be accepted');

    const baseline = { yawDeg: 3, pitchDeg: -13 };
    // User turns 14° left from baseline -> yaw = -11°, pitch = -12°
    assert.equal(bio.evaluateEnrollmentPoseTarget('LEFT', -11, -12, baseline).matched, true);
    // User turns 14° right from baseline -> yaw = +17°, pitch = -14°
    assert.equal(bio.evaluateEnrollmentPoseTarget('RIGHT', 17, -14, baseline).matched, true);
    // User tilts chin 11° UP from -13° baseline -> absolute pitch is -2° (still negative!), relative deltaPitch = +11° -> MUST MATCH UP!
    assert.equal(
      bio.evaluateEnrollmentPoseTarget('UP', 2, -2, baseline).matched,
      true,
      'Relative +11° upward tilt from -13° handheld baseline must match UP even though absolute pitch is -2°'
    );
    // User tilts chin 11° DOWN from -13° baseline -> absolute pitch is -24°, relative deltaPitch = -11° -> MUST MATCH DOWN!
    assert.equal(bio.evaluateEnrollmentPoseTarget('DOWN', 4, -24, baseline).matched, true);
    // Turning wrong way (turning RIGHT when asked for LEFT) must NOT match and must return clear coaching hint
    const wrongWay = bio.evaluateEnrollmentPoseTarget('LEFT', 18, -13, baseline);
    assert.equal(wrongWay.matched, false);
    assert.ok(wrongWay.hint.toLowerCase().includes('trái'), `Expected directional hint mentioning trái, got "${wrongWay.hint}"`);
  });

  test('4.6 TemporalMatchVoter tolerates 1 transient blink/blur frame while resetting immediately on cross-employee switch or 2 consecutive misses', async () => {
    const bio = await vite.ssrLoadModule('/src/services/faceRecognitionV2.ts');
    const profAn = bio.hydrateFaceProfile({
      username: 'nv_an',
      fullname: 'Nguyễn Văn An',
      vectorsB64: make5AnglePackB64(2),
    });
    const profBinh = bio.hydrateFaceProfile({
      username: 'nv_binh',
      fullname: 'Lê Thị Bình',
      vectorsB64: make5AnglePackB64(7),
    });

    // Default recognition voter with 1-frame grace on transient LOW_SCORE blink
    const voter = new bio.TemporalMatchVoter(3, 1);
    assert.equal(voter.pushFrame({ matched: true, profile: profAn, score: 0.78, margin: 0.25 }), null);
    assert.equal(voter.getStreak(), 1);

    // 1 transient blink frame (matched: false, reason: 'LOW_SCORE') -> preserves streak 1!
    assert.equal(voter.pushFrame({ matched: false, profile: null, reason: 'LOW_SCORE' }), null);
    assert.equal(voter.getStreak(), 1);

    // Resumes matching nv_an -> 2/3 -> 3/3 confirmed!
    assert.equal(voter.pushFrame({ matched: true, profile: profAn, score: 0.80, margin: 0.28 }), null);
    assert.equal(voter.getStreak(), 2);
    const confirmed = voter.pushFrame({ matched: true, profile: profAn, score: 0.82, margin: 0.30 });
    assert.equal(confirmed?.profile?.username, 'nv_an');

    // Cross-employee safety: if nv_an is at 2/3 and nv_binh steps in, immediately switch to nv_binh (1/3)!
    voter.pushFrame({ matched: true, profile: profAn, score: 0.79, margin: 0.22 });
    voter.pushFrame({ matched: true, profile: profAn, score: 0.79, margin: 0.22 });
    assert.equal(voter.getStreak(), 2);
    assert.equal(voter.pushFrame({ matched: true, profile: profBinh, score: 0.81, margin: 0.24 }), null);
    assert.equal(voter.getStreak(), 1, 'Different employee must immediately reset streak to 1 for the new employee');

    // 2 consecutive misses -> hard reset to 0!
    voter.pushFrame({ matched: false, profile: null, reason: 'LOW_SCORE' });
    voter.pushFrame({ matched: false, profile: null, reason: 'LOW_SCORE' });
    assert.equal(voter.getStreak(), 0, 'Two consecutive misses must reset streak to 0');
  });

  test('4.7 Cross-phone w600k_mbf Top-2 scoring (0.85*maxCos + 0.15*max(secondCos,centCos), minScore=0.34) matches genuine cross-camera face while rejecting impostors', async () => {
    const bio = await vite.ssrLoadModule('/src/services/faceRecognitionV2.ts');

    assert.equal(bio.FACE_MATCH_MIN_SCORE, 0.34, 'Universal cross-device calibrated FACE_MATCH_MIN_SCORE must be 0.34');
    assert.equal(bio.FACE_MATCH_MIN_MARGIN, 0.06, 'Cross-phone calibrated FACE_MATCH_MIN_MARGIN must be 0.06');
    assert.equal(bio.FACE_MIN_BBOX_WIDTH_RATIO, 0.10, 'Ultra-wide mobile selfie FACE_MIN_BBOX_WIDTH_RATIO must be 0.10');

    const profiles = [
      bio.hydrateFaceProfile({
        username: 'nv_an',
        fullname: 'Nguyễn Văn An',
        employmentStatus: 'active',
        vectorsB64: make5AnglePackB64(2),
        anglesCount: 5,
        isLocked: true,
      }),
      bio.hydrateFaceProfile({
        username: 'nv_binh',
        fullname: 'Lê Thị Bình',
        employmentStatus: 'active',
        vectorsB64: make5AnglePackB64(9),
        anglesCount: 5,
        isLocked: true,
      }),
    ];

    // Genuine employee nv_an scanned on a different phone (camera ISP + lighting variance -> ~0.53 cosine)
    const crossPhoneAn = bio.decodeInt8B64ToVectors(makeCrossPhoneLiveVectorB64(2, 0.54))[0];
    const matchAn = bio.matchEmployeeFace(crossPhoneAn, profiles);
    assert.equal(matchAn.matched, true, `Expected cross-phone nv_an (~0.53) to match, got ${JSON.stringify(matchAn)}`);
    assert.equal(matchAn.profile?.username, 'nv_an');
    assert.ok(matchAn.score >= 0.45 && matchAn.score < 0.65, `Score ${matchAn.score} should be in [0.45, 0.65)`);
    assert.ok(matchAn.margin >= 0.06);

    // Unenrolled impostor face (seed 13) -> must be rejected cleanly
    const impostor = bio.decodeInt8B64ToVectors(makeInt8VectorB64(13))[0];
    const matchImpostor = bio.matchEmployeeFace(impostor, profiles);
    assert.equal(matchImpostor.matched, false, 'Unenrolled impostor must never match');
  });
});

describe('Task 5 & 6: Parallel UI Contracts, Lifecycle Stability, Design DNA Guard & Cloudflare <25MiB Asset Gate', () => {
  test('5.1 CheckIn.tsx, Login.tsx, HrList.tsx, FaceEnrollmentModal.tsx & FastFaceScannerV2.tsx uphold parallel switch, open Kiosk, Admin unlock & zero glassmorphism', () => {
    const checkinSrc = fs.readFileSync(path.resolve('src/pages/CheckIn.tsx'), 'utf8');
    const loginSrc = fs.readFileSync(path.resolve('src/pages/Login.tsx'), 'utf8');
    const hrListSrc = fs.readFileSync(path.resolve('src/pages/admin/HrList.tsx'), 'utf8');
    const enrollSrc = fs.readFileSync(path.resolve('src/components/FaceEnrollmentModal.tsx'), 'utf8');
    const scannerSrc = fs.readFileSync(path.resolve('src/components/FastFaceScannerV2.tsx'), 'utf8');

    assert.ok(checkinSrc.includes('data-testid="checkin-mode-toggle"'), 'CheckIn must render parallel v1/v2 segmented toggle');
    assert.ok(checkinSrc.includes('data-testid="mode-v1-btn"') && checkinSrc.includes('data-testid="mode-v2-btn"'));
    assert.ok(checkinSrc.includes('data-testid="open-face-enroll-btn"'), 'CheckIn must render 5-angle enrollment CTA');
    assert.ok(checkinSrc.includes('v1CameraSuspendedRef'), 'CheckIn must release v1 camera stream while v2 scanner/enrollment owns camera');

    assert.ok(loginSrc.includes('data-testid="open-kiosk-face-v2"'), 'Login must expose open multi-employee Face ID Kiosk button');
    assert.ok(loginSrc.includes('isKioskMode={true}'), 'Login must mount FastFaceScannerV2 in Kiosk mode');

    assert.ok(hrListSrc.includes('RESET_FACE_PROFILE'), 'HrList must provide Admin RESET_FACE_PROFILE unlock action');

    assert.equal(enrollSrc.includes('backdrop-blur'), false, 'FaceEnrollmentModal must obey glassmorphismAllowed: false');
    assert.equal(scannerSrc.includes('backdrop-blur'), false, 'FastFaceScannerV2 must obey glassmorphismAllowed: false');
    assert.ok(scannerSrc.includes('100dvh'), 'FastFaceScannerV2 must fill 100dvh mobile viewport');
    assert.ok(scannerSrc.includes('sendEmailAfterUpload: true'), 'FastFaceScannerV2 must trigger idempotent post-upload email receipt');
  });

  test('5.2 All self-hosted biometric models & WASM files in public/models/face-v2 stay strictly below Cloudflare Pages 24.5 MiB threshold', () => {
    const maxBytes = Math.floor(24.5 * 1024 * 1024);
    const walk = (dir: string): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) files.push(...walk(full));
        else files.push(full);
      }
      return files;
    };

    const modelRoot = path.resolve('public/models/face-v2');
    const files = walk(modelRoot);
    assert.ok(files.length >= 5, 'Expected MediaPipe + ArcFace + MiniFASNet + ORT WASM assets');
    for (const f of files) {
      const stat = fs.statSync(f);
      assert.ok(stat.size > 0, `Asset ${f} must not be empty`);
      assert.ok(
        stat.size < maxBytes,
        `Asset ${path.relative(process.cwd(), f)} (${stat.size} bytes) exceeds 24.5 MiB Cloudflare Pages limit`
      );
    }
  });

  test('5.3 FaceEnrollmentModal & FastFaceScannerV2 isolate hardware boot useEffect from parent prop churn and keep <video> persistently mounted', () => {
    const enrollSrc = fs.readFileSync(path.resolve('src/components/FaceEnrollmentModal.tsx'), 'utf8');
    const scannerSrc = fs.readFileSync(path.resolve('src/components/FastFaceScannerV2.tsx'), 'utf8');

    // 1. FaceEnrollmentModal must NEVER include bootEnrollmentSession / onEnrolledSuccess / existingProfiles in its open/close useEffect deps!
    assert.equal(
      /\},\s*\[[^\]]*bootEnrollmentSession[^\]]*\]\)/.test(enrollSrc),
      false,
      'FaceEnrollmentModal open/close useEffect must NOT depend on bootEnrollmentSession (prevents 1s clock / GPS re-boot loop!)'
    );

    // 2. FastFaceScannerV2 must NEVER include bootScannerHardware in its open/close useEffect deps!
    assert.equal(
      /\},\s*\[[^\]]*bootScannerHardware[^\]]*\]\)/.test(scannerSrc),
      false,
      'FastFaceScannerV2 open/close useEffect must NOT depend on bootScannerHardware (prevents store update re-boot loop!)'
    );

    // 3. FaceEnrollmentModal must keep <video ref={videoRef} mounted outside conditional {phase === 'SCANNING' && ...}
    // Verify <video ref={videoRef} appears BEFORE {phase === 'BOOTING' or inside a persistent container!
    const bootBlockIdx = enrollSrc.indexOf("phase === 'BOOTING'");
    const videoRefIdx = enrollSrc.indexOf('ref={videoRef}');
    assert.ok(videoRefIdx > 0 && bootBlockIdx > 0, 'Expected both videoRef and BOOTING phase in FaceEnrollmentModal');
    // Check that <video ref={videoRef} is NOT gated inside `phase === 'SCANNING' && (`
    const scanningGateIdx = enrollSrc.indexOf("phase === 'SCANNING' &&");
    assert.equal(
      scanningGateIdx !== -1 && videoRefIdx > scanningGateIdx,
      false,
      '<video ref={videoRef}> must remain persistently mounted across BOOTING and SCANNING so getUserMedia never races a null videoRef'
    );
  });

  test('5.4 GAS virtual ADMIN enrollment & Cloudflare Edge synchronous D1 read-after-write consistency on ENROLL_FACE_PROFILE', async () => {
    // Part A: GAS virtual Super Admin ('ADMIN') not present as a row in DATA sheet can still enroll & fetch Face ID
    const gas = createGasV2Sandbox({
      DATA: [
        ['Bảng người dùng'],
        ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
        ['nv1', 'hash_1', 'Nguyễn Văn Một', '', 'nv1@kg.vn', 'user', 'Phục vụ', '', 'active'],
      ],
      '✔️CHẤM CÔNG': [['Họ tên', 'Loại', 'Thời gian', 'Vị trí', 'Trạng thái', 'Khoảng cách', 'Ảnh', 'JSON']],
    });

    const adminEnroll = gas.callDoPost({
      action: 'ENROLL_FACE_PROFILE',
      username: 'ADMIN',
      fullname: 'SUPER ADMIN',
      role: 'admin',
      vectorsB64: make5AnglePackB64(13),
      anglesCount: 5,
    });
    assert.equal(adminEnroll.ok, true, `Virtual ADMIN enrollment must succeed: ${JSON.stringify(adminEnroll)}`);

    const profRes = gas.callDoPost({
      action: 'GET_FACE_PROFILES',
      username: 'ADMIN',
      role: 'admin',
    });
    assert.equal(profRes.ok, true);
    assert.equal(
      profRes.data.profiles.some((p: any) => String(p.username).toUpperCase() === 'ADMIN'),
      true,
      'GET_FACE_PROFILES must include enrolled virtual ADMIN profile'
    );

    // Part B: Edge D1 commits ENROLL_FACE_PROFILE synchronously BEFORE returning HTTP 200 (even before waitUntil resolves!)
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    const origFetch = globalThis.fetch;
    let enrolledRowCountDuringResponse = 0;

    const fakeDb = {
      prepare: (sql: string) => ({
        bind: () => ({
          run: async () => {
            if (sql.includes('INSERT OR REPLACE INTO edge_face_profiles')) {
              enrolledRowCountDuringResponse += 1;
            }
            return { success: true };
          },
          all: async () => ({ results: [] }),
          first: async () => null,
        }),
        all: async () => ({ results: [] }),
        first: async () => null,
        run: async () => ({ success: true }),
      }),
    };

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          ok: true,
          data: { username: 'nv1', anglesCount: 5, isLocked: true },
        })
      )) as any;

    try {
      // Notice we intentionally DO NOT await waitUntil tasks here!
      const res = await edgeMod.onRequest({
        request: new Request('https://kg.example/api', {
          method: 'POST',
          body: JSON.stringify({
            action: 'ENROLL_FACE_PROFILE',
            username: 'nv1',
            fullname: 'Nguyễn Văn Một',
            vectorsB64: make5AnglePackB64(4),
            anglesCount: 5,
          }),
        }),
        env: { DB: fakeDb },
        waitUntil: () => {
          // intentionally deferred
        },
      });
      const json = await res.json();
      assert.equal(json.ok, true);
      assert.equal(
        enrolledRowCountDuringResponse,
        1,
        'ENROLL_FACE_PROFILE must commit to D1 synchronously before returning HTTP response'
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('5.5 Post-enrollment v2 switch, honest server-verified confirmation UI, 15m anti-repeat notice & Admin Staff Face Picker across CheckIn / Scanner / HrList', () => {
    const checkinSrc = fs.readFileSync(path.resolve('src/pages/CheckIn.tsx'), 'utf8');
    const hrListSrc = fs.readFileSync(path.resolve('src/pages/admin/HrList.tsx'), 'utf8');
    const enrollSrc = fs.readFileSync(path.resolve('src/components/FaceEnrollmentModal.tsx'), 'utf8');
    const scannerSrc = fs.readFileSync(path.resolve('src/components/FastFaceScannerV2.tsx'), 'utf8');
    const pickerPath = path.resolve('src/components/AdminStaffFacePickerModal.tsx');

    assert.equal(fs.existsSync(pickerPath), true, 'AdminStaffFacePickerModal.tsx must exist');
    const pickerSrc = fs.readFileSync(pickerPath, 'utf8');
    assert.equal(pickerSrc.includes('backdrop-blur'), false, 'AdminStaffFacePickerModal must obey glassmorphismAllowed: false');

    // 1. Completing enrollment CTA switches CheckIn directly into Face ID v2 scanner
    assert.ok(enrollSrc.includes('onStartScanningNow'), 'FaceEnrollmentModal must support onStartScanningNow callback');
    assert.ok(checkinSrc.includes('onStartScanningNow='), 'CheckIn must wire onStartScanningNow to switchCheckinMode("v2")');

    // 2. Admin can pick any employee and enroll them from CheckIn, FastFaceScannerV2, and HrList
    assert.ok(checkinSrc.includes('data-testid="admin-enroll-staff-btn"'), 'CheckIn must expose Admin staff face enrollment button');
    assert.ok(scannerSrc.includes('data-testid="v2-admin-enroll-staff-btn"'), 'FastFaceScannerV2 must expose Admin staff face enrollment button');
    assert.ok(hrListSrc.includes('enrolledByAdmin'), 'HrList must allow Admin to launch 5-angle FaceEnrollmentModal for any employee');

    // 3. FastFaceScannerV2 displays prominent post-scan confirmation card & 15-minute anti-repeat notice
    assert.ok(scannerSrc.includes('data-testid="v2-punch-confirmed-card"'), 'FastFaceScannerV2 must render prominent confirmation card');
    assert.ok(scannerSrc.includes('15 phút'), 'FastFaceScannerV2 must clearly communicate 15-minute cooldown');
    assert.equal(checkinSrc.includes('30 phút'), false, 'CheckIn must update all 30-minute cooldown copy to 15 phút');
  });
});

describe('Task 9: Universal Cross-Phone Biometric Recognition (Mirror Invariance, Top-2 Multi-Angle Scoring, Gaze-Stable Alignment, Frozen Frame & Front/Rear Camera)', () => {
  test('9.1 flipChwHorizontal112 & matchEmployeeFaceWithCandidates resolve Front/Rear & cross-driver horizontal mirror asymmetry for existing 5-vector profiles', async () => {
    const bio = await vite.ssrLoadModule('/src/services/faceRecognitionV2.ts');

    assert.equal(typeof bio.flipChwHorizontal112, 'function', 'flipChwHorizontal112 must be exported');
    assert.equal(
      typeof bio.matchEmployeeFaceWithCandidates,
      'function',
      'matchEmployeeFaceWithCandidates must be exported'
    );

    // 1. Verify CHW [3, 112, 112] horizontal mirror exactness & involution flip(flip(x)) === x
    const chw = new Float32Array(3 * 112 * 112);
    for (let c = 0; c < 3; c++) {
      for (let y = 0; y < 112; y++) {
        for (let x = 0; x < 112; x++) {
          chw[c * 12544 + y * 112 + x] = (c + 1) * 1000 + y * 10 + x * 0.05;
        }
      }
    }
    const flipped = bio.flipChwHorizontal112(chw);
    assert.equal(flipped.length, chw.length);
    assert.ok(Math.abs(flipped[0] - chw[111]) < 1e-5, 'Leftmost pixel must swap with rightmost pixel (x=111)');
    assert.ok(
      Math.abs(flipped[2 * 12544 + 55 * 112 + 12] - chw[2 * 12544 + 55 * 112 + (111 - 12)]) < 1e-5,
      'Channel 2 row 55 col 12 must equal col 99 before flip'
    );
    const doubleFlipped = bio.flipChwHorizontal112(flipped);
    for (let i = 0; i < chw.length; i += 97) {
      assert.ok(Math.abs(doubleFlipped[i] - chw[i]) < 1e-6, 'flip(flip(x)) must equal x');
    }

    // 2. Existing 5-vector profile (like nongvanhao enrolled by Admin on Phone 1) scanned on Phone 2 with opposite horizontal mirror:
    //    rawEmb scores ~0.12 (would fail!), while flippedEmb scores ~0.55 and its Int8B64 is returned for server verification!
    const profiles = [
      bio.hydrateFaceProfile({
        username: 'nongvanhao',
        fullname: 'Nông Văn Hào',
        position: 'Tổ trưởng',
        employmentStatus: 'active',
        vectorsB64: make5AnglePackB64(4),
        anglesCount: 5,
        isLocked: true,
      }),
      bio.hydrateFaceProfile({
        username: 'testapp',
        fullname: 'Nhân viên Test',
        employmentStatus: 'active',
        vectorsB64: make5AnglePackB64(11),
        anglesCount: 5,
        isLocked: true,
      }),
    ];

    const rawMirroredWrongB64 = makeInt8VectorB64(17); // Unaligned mirror orientation (~0 cosine)
    const rawMirroredWrongVec = bio.decodeInt8B64ToVectors(rawMirroredWrongB64)[0];
    const flippedMatchingB64 = makeCrossPhoneLiveVectorB64(4, 0.54);
    const flippedMatchingVec = bio.decodeInt8B64ToVectors(flippedMatchingB64)[0];

    const res = bio.matchEmployeeFaceWithCandidates(
      [
        { embedding: rawMirroredWrongVec, int8B64: rawMirroredWrongB64 },
        { embedding: flippedMatchingVec, int8B64: flippedMatchingB64 },
      ],
      profiles
    );

    assert.equal(res.matched, true, 'Mirror candidate must rescue cross-phone horizontally flipped camera stream');
    assert.equal(res.profile?.username, 'nongvanhao');
    assert.equal(
      res.matchedEmbeddingInt8B64,
      flippedMatchingB64,
      'matchedEmbeddingInt8B64 must match the winning orientation so Edge & GAS verify with identical high score'
    );
  });

  test('9.2 Top-2 Multi-Angle Scoring (0.85*maxCos + 0.15*max(secondCos,centCos)) & calibrated thresholds (0.38 Client / 0.34 Server) accept genuine ~0.41 cross-phone scans across Client, Edge & GAS while rejecting impostors', async () => {
    const bio = await vite.ssrLoadModule('/src/services/faceRecognitionV2.ts');
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');

    // Construct an orthonormal basis e0..e5 in 512-D to synthesize exact realistic cross-phone cosines:
    // Stored 5-angle profile:
    //   v0 (CENTER): e0
    //   v1 (UP):     0.60*e0 + 0.80*e1
    //   v2 (LEFT):   0.35*e0 + 0.93675*e2
    //   v3 (RIGHT):  0.35*e0 + 0.93675*e3
    //   v4 (DOWN):   0.35*e0 + 0.93675*e4
    // Phone 2 live frontal scan (indoor warm lighting + different lens ISP):
    //   liveVec = 0.43*e0 + 0.15*e1 + sqrt(1 - 0.43^2 - 0.15^2)*e5
    //   -> cos(live, v0) = 0.43, cos(live, v1) = 0.378, cos(live, v2..v4) = 0.1505!
    //   Notice old formula (0.75*0.43 + 0.25*centCos = 0.402) FAILED old 0.48 Client & 0.45 Server thresholds!
    const basis = (idx: number): Float32Array => {
      const v = new Float32Array(512);
      // Spread energy across 64 dimensions per basis block so Int8 quantization stays >0.999 accurate!
      const start = idx * 64;
      const val = 1 / Math.sqrt(64);
      for (let i = 0; i < 64; i++) {
        v[start + i] = i % 2 === 0 ? val : -val;
      }
      return v;
    };
    const combine = (terms: Array<[number, Float32Array]>): Float32Array => {
      const out = new Float32Array(512);
      for (const [w, b] of terms) {
        for (let i = 0; i < 512; i++) out[i] += w * b[i];
      }
      return bio.l2Normalize(out);
    };

    const e0 = basis(0);
    const e1 = basis(1);
    const e2 = basis(2);
    const e3 = basis(3);
    const e4 = basis(4);
    const e5 = basis(5);
    const e6 = basis(6);

    const stored5Vecs = [
      e0,
      combine([[0.6, e0], [0.8, e1]]),
      combine([[0.35, e0], [Math.sqrt(1 - 0.35 * 0.35), e2]]),
      combine([[0.35, e0], [Math.sqrt(1 - 0.35 * 0.35), e3]]),
      combine([[0.35, e0], [Math.sqrt(1 - 0.35 * 0.35), e4]]),
    ];
    const storedPackB64: string = bio.quantizeVectorsToInt8B64(stored5Vecs);

    const liveGenuineVec = combine([
      [0.43, e0],
      [0.15, e1],
      [Math.sqrt(1 - 0.43 * 0.43 - 0.15 * 0.15), e5],
    ]);
    const liveGenuineB64: string = bio.quantizeVectorsToInt8B64([liveGenuineVec]);

    // Real impostor with maxCos ~ 0.16 (matching real D1 impostor max 0.1507)
    const liveImpostorVec = combine([
      [0.16, e0],
      [Math.sqrt(1 - 0.16 * 0.16), e6],
    ]);
    const liveImpostorB64: string = bio.quantizeVectorsToInt8B64([liveImpostorVec]);

    // A. Client matcher accepts genuine cross-phone (~0.42 score) & rejects impostor (~0.16 score)
    const hydrated = [
      bio.hydrateFaceProfile({
        username: 'nongvanhao',
        fullname: 'Nông Văn Hào',
        employmentStatus: 'active',
        vectorsB64: storedPackB64,
        anglesCount: 5,
        isLocked: true,
      }),
    ];
    const clientMatch = bio.matchEmployeeFace(bio.decodeInt8B64ToVectors(liveGenuineB64)[0], hydrated);
    assert.equal(clientMatch.matched, true, `Client must accept ~0.42 cross-phone genuine scan: ${JSON.stringify(clientMatch)}`);
    assert.ok(clientMatch.score >= 0.38 && clientMatch.score < 0.48);

    const clientImpostor = bio.matchEmployeeFace(bio.decodeInt8B64ToVectors(liveImpostorB64)[0], hydrated);
    assert.equal(clientImpostor.matched, false, 'Client must reject ~0.16 impostor');

    // B. GAS verifyEmployeeFaceVectorGas_ accepts genuine (~0.42) & rejects impostor (~0.16)
    const gas = createGasV2Sandbox({
      DATA: [
        ['Bảng người dùng'],
        ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
        ['nongvanhao', 'hash_1', 'Nông Văn Hào', '', 'hao@kg.vn', 'user', 'Tổ trưởng', '', 'active'],
      ],
      '✔️CHẤM CÔNG': [['Họ tên', 'Loại', 'Thời gian', 'Vị trí', 'Trạng thái', 'Khoảng cách', 'Ảnh', 'JSON']],
    });
    const gasEnroll = gas.callDoPost({
      action: 'ENROLL_FACE_PROFILE',
      username: 'nongvanhao',
      fullname: 'Nông Văn Hào',
      actorRole: 'admin',
      adminUsername: 'ADMIN',
      enrolledByAdmin: true,
      vectorsB64: storedPackB64,
      anglesCount: 5,
    });
    assert.equal(gasEnroll.ok, true);

    const gasBadPunch = gas.callDoPost({
      action: 'CHECK_IN_OUT',
      checkinMode: 'v2_face',
      checkinId: 'CHK_IMP_92',
      username: 'nongvanhao',
      fullname: 'Nông Văn Hào',
      type: 'Vào 1',
      liveVectorB64: liveImpostorB64,
      lat: 10.9760327,
      lng: 106.6645922,
      distance: '4m',
      time: '11/11/2026 17:00:00',
    });
    assert.equal(gasBadPunch.ok, false, 'GAS must reject impostor face vector');
    assert.equal(gasBadPunch.data?.code || gasBadPunch.code, 'FACE_VERIFICATION_FAILED');

    const gasGoodPunch = gas.callDoPost({
      action: 'CHECK_IN_OUT',
      checkinMode: 'v2_face',
      checkinId: 'CHK_GEN_92',
      username: 'nongvanhao',
      fullname: 'Nông Văn Hào',
      type: 'Vào 1',
      liveVectorB64: liveGenuineB64,
      lat: 10.9760327,
      lng: 106.6645922,
      distance: '4m',
      time: '11/11/2026 17:00:05',
    });
    assert.equal(gasGoodPunch.ok, true, `GAS must accept genuine cross-phone scan: ${JSON.stringify(gasGoodPunch)}`);

    // C. Edge preCheckCheckInEdge accepts genuine (~0.42) & rejects impostor (~0.16)
    const mock = createEdgeFaceD1Mock();
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: any, init?: any) => {
      const p = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            sheetSaved: true,
            checkinId: p.checkinId,
            time: p.time,
            thoiGian: p.time,
            status: 'Hợp lệ',
          },
        })
      );
    }) as any;

    try {
      const callEdge = async (body: any) => {
        const res = await edgeMod.onRequest({
          request: new Request('https://kg.example/api', { method: 'POST', body: JSON.stringify(body) }),
          env: { DB: mock.db },
          waitUntil: () => {},
        });
        return res.json();
      };

      await callEdge({
        action: 'ENROLL_FACE_PROFILE',
        username: 'nongvanhao',
        fullname: 'Nông Văn Hào',
        actorRole: 'admin',
        adminUsername: 'ADMIN',
        enrolledByAdmin: true,
        vectorsB64: storedPackB64,
        anglesCount: 5,
      });

      const edgeBad = await callEdge({
        action: 'CHECK_IN_OUT',
        checkinMode: 'v2_face',
        checkinId: 'EDGE_IMP_92',
        username: 'nongvanhao',
        fullname: 'Nông Văn Hào',
        type: 'Vào 1',
        liveVectorB64: liveImpostorB64,
        lat: 10.9760327,
        lng: 106.6645922,
        time: '11/11/2026 17:01:00',
      });
      assert.equal(edgeBad.ok, false, 'Edge must reject impostor vector');
      assert.equal(edgeBad.data?.code || edgeBad.code, 'FACE_VERIFICATION_FAILED');

      const edgeGood = await callEdge({
        action: 'CHECK_IN_OUT',
        checkinMode: 'v2_face',
        checkinId: 'EDGE_GEN_92',
        username: 'nongvanhao',
        fullname: 'Nông Văn Hào',
        type: 'Vào 1',
        liveVectorB64: liveGenuineB64,
        lat: 10.9760327,
        lng: 106.6645922,
        time: '11/11/2026 17:01:05',
      });
      assert.equal(edgeGood.ok, true, `Edge must accept genuine cross-phone scan: ${JSON.stringify(edgeGood)}`);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('9.3 extractLandmarksAndPose stabilizes eye keypoints against iris gaze drift (70% anatomical eye socket + 30% iris) and supports unmirrored yaw flag', async () => {
    const bio = await vite.ssrLoadModule('/src/services/faceRecognitionV2.ts');

    const buildMeshWithEyeCorners = (irisOffsetPxY: number) => {
      const W = 640;
      const H = 480;
      const pts = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));

      // Image-left eye anatomical corners/lids centered at (260, 200)
      pts[33] = { x: 245 / W, y: 200 / H, z: -0.02 };
      pts[133] = { x: 275 / W, y: 200 / H, z: -0.02 };
      pts[159] = { x: 260 / W, y: 194 / H, z: -0.02 };
      pts[145] = { x: 260 / W, y: 206 / H, z: -0.02 };
      pts[468] = { x: 260 / W, y: (200 + irisOffsetPxY) / H, z: -0.02 };

      // Image-right eye anatomical corners/lids centered at (380, 200)
      pts[362] = { x: 365 / W, y: 200 / H, z: -0.02 };
      pts[263] = { x: 395 / W, y: 200 / H, z: -0.02 };
      pts[386] = { x: 380 / W, y: 194 / H, z: -0.02 };
      pts[374] = { x: 380 / W, y: 206 / H, z: -0.02 };
      pts[473] = { x: 380 / W, y: (200 + irisOffsetPxY) / H, z: -0.02 };

      pts[1] = { x: 320 / W, y: 250 / H, z: -0.08 };
      pts[61] = { x: 285 / W, y: 300 / H, z: -0.02 };
      pts[291] = { x: 355 / W, y: 300 / H, z: -0.02 };
      pts[234] = { x: 210 / W, y: 245 / H, z: 0.01 };
      pts[454] = { x: 430 / W, y: 245 / H, z: 0.01 };
      return pts;
    };

    const gazeLens = bio.extractLandmarksAndPose(buildMeshWithEyeCorners(0), undefined, 640, 480, true);
    const gazeDown = bio.extractLandmarksAndPose(buildMeshWithEyeCorners(10), undefined, 640, 480, true);
    const eyeShiftY = Math.abs(gazeDown.keypoints5[0][1] - gazeLens.keypoints5[0][1]);
    assert.ok(
      eyeShiftY >= 2.5 && eyeShiftY <= 3.5,
      `10px iris gaze shift must move aligned eye keypoint by ~3px (30%), got ${eyeShiftY}px`
    );

    // Verify mirrorYawForFrontCamera flag flips yaw sign cleanly
    const turnedMesh = buildMeshWithEyeCorners(0);
    turnedMesh[1] = { x: 355 / 640, y: 250 / 480, z: -0.08 }; // Nose shifted toward +X
    const frontPose = bio.extractLandmarksAndPose(turnedMesh, undefined, 640, 480, true);
    const rawPose = bio.extractLandmarksAndPose(turnedMesh, undefined, 640, 480, false);
    assert.ok(frontPose.yawDeg < 0 && rawPose.yawDeg > 0, 'mirrorYawForFrontCamera=false must preserve raw +X yaw sign');
  });

  test('9.4 Frozen 2D frame snapshot & Front/Rear camera switcher contracts across faceRecognitionV2, FaceEnrollmentModal & FastFaceScannerV2', () => {
    const engineSrc = fs.readFileSync(path.resolve('src/services/faceRecognitionV2.ts'), 'utf8');
    const enrollSrc = fs.readFileSync(path.resolve('src/components/FaceEnrollmentModal.tsx'), 'utf8');
    const scannerSrc = fs.readFileSync(path.resolve('src/components/FastFaceScannerV2.tsx'), 'utf8');

    // 1. Unified 2D frozen snapshot canvas prevents <video> WebGL vs 2D canvas desync across iOS Safari & Android Chrome
    assert.ok(
      engineSrc.includes('frameSnapCanvas') && engineSrc.includes('detectForVideo(frameSnapCanvas'),
      'faceRecognitionV2.ts must snapshot <video> once onto frameSnapCanvas before detectForVideo & 112x112 alignment'
    );

    // 2. Both Enrollment & Live Scanner expose Front/Rear camera toggle button (>=44px, zero glassmorphism)
    assert.ok(
      enrollSrc.includes('data-testid="toggle-camera-facing-btn"'),
      'FaceEnrollmentModal must expose Front/Rear camera toggle button for Admin enrolling staff'
    );
    assert.ok(
      scannerSrc.includes('data-testid="toggle-camera-facing-btn"'),
      'FastFaceScannerV2 must expose Front/Rear camera toggle button'
    );
    assert.equal(enrollSrc.includes('backdrop-blur'), false, 'Zero glassmorphism in FaceEnrollmentModal');
    assert.equal(scannerSrc.includes('backdrop-blur'), false, 'Zero glassmorphism in FastFaceScannerV2');
  });
});

describe('Task 10: Instant Edge D1 Hydration (<50ms), Dual-Keypoint Legacy+New Compatibility & Indoor Night-Shift Liveness', () => {
  test('10.1 Edge serves GET_FACE_PROFILES & GET_KIOSK_ATTENDANCE_STATE instantaneously from D1 (fastEdge: true) and supports Kiosk preloadOnly without blocking on slow GAS or writing KV', async () => {
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    const mock = createEdgeFaceD1Mock();
    const origFetch = globalThis.fetch;

    let kvPutCalls = 0;
    const mockKv = {
      get: async () => null,
      put: async () => {
        kvPutCalls += 1;
      },
    };

    // Seed D1 directly with testapp & nongvanhao (matching live production D1 state) + 1 recent punch
    const now = Date.now();
    await mock.db
      .prepare(
        `INSERT OR REPLACE INTO edge_face_profiles (username, fullname, role, position, avatar_url, employment_status, model_version, angle_count, vectors_b64, centroid_b64, quality_score, is_locked, enrolled_at, enrolled_by, unlocked_by, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)`
      )
      .bind(
        'nongvanhao',
        'Nông Văn Hào',
        'user',
        'Tổ trưởng',
        '',
        'active',
        'w600k_mbf_int8_v2',
        5,
        make5AnglePackB64(4),
        makeInt8VectorB64(4),
        92,
        1,
        '02/11/2026 21:17',
        'admin',
        '',
        now
      )
      .run();
    await mock.db
      .prepare(
        `INSERT OR REPLACE INTO edge_face_profiles (username, fullname, role, position, avatar_url, employment_status, model_version, angle_count, vectors_b64, centroid_b64, quality_score, is_locked, enrolled_at, enrolled_by, unlocked_by, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)`
      )
      .bind(
        'testapp',
        'Nhân viên Test',
        'user',
        'Phục vụ',
        '',
        'active',
        'w600k_mbf_int8_v2',
        5,
        make5AnglePackB64(9),
        makeInt8VectorB64(9),
        90,
        1,
        '02/11/2026 20:02',
        'testapp',
        '',
        now
      )
      .run();
    await mock.db
      .prepare(
        `INSERT OR REPLACE INTO edge_checkin_logs (id, username, fullname, check_type, shift_name, time_str, status, distance, lat, lng, note, image_url, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`
      )
      .bind(
        'CHK_D1_FAST_1',
        'nongvanhao',
        'Nông Văn Hào',
        'Vào 1',
        'Ca chiều',
        '02/11/2026 17:00:00',
        'Hợp lệ',
        5,
        10.9760327,
        106.6645922,
        '',
        'PENDING',
        now - 3600_000
      )
      .run();

    // Simulate a stalled GAS backend (e.g. 23s GET_DATA lock contention)
    globalThis.fetch = (async () => {
      await new Promise((r) => setTimeout(r, 4000));
      return new Response(
        JSON.stringify({
          ok: true,
          data: { profiles: [], logs: [], totalActiveUsers: 2 },
        })
      );
    }) as any;

    try {
      const callFastEdge = async (body: any) => {
        const t0 = performance.now();
        const res = await edgeMod.onRequest({
          request: new Request('https://kg.example/api', {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          env: { DB: mock.db, KG_EDGE_DB: mockKv },
          waitUntil: () => {
            // background revalidation must never block HTTP response!
          },
        });
        const elapsedMs = performance.now() - t0;
        return { status: res.status, headers: res.headers, elapsedMs, json: await res.json() };
      };

      // A. Kiosk preloadOnly=true + fastEdge=true BEFORE GPS satellite lock -> instant <100ms D1 vectors, zero sensitive activeEmployees
      const preloadRes = await callFastEdge({
        action: 'GET_FACE_PROFILES',
        isKiosk: true,
        preloadOnly: true,
        fastEdge: true,
      });
      assert.equal(preloadRes.json.ok, true);
      assert.ok(
        preloadRes.elapsedMs < 150,
        `Expected instant D1 preload <150ms despite 4000ms GAS stall, got ${preloadRes.elapsedMs}ms`
      );
      assert.equal(preloadRes.headers.get('X-Edge-DB'), 'D1-INSTANT');
      assert.equal(preloadRes.json.data.profiles.length, 2);
      assert.equal('activeEmployees' in preloadRes.json.data, false);

      // B. Standard Kiosk GET_FACE_PROFILES WITHOUT preloadOnly and WITHOUT GPS -> still enforces GPS_REQUIRED!
      const noGpsStandard = await callFastEdge({
        action: 'GET_FACE_PROFILES',
        isKiosk: true,
        fastEdge: true,
      });
      assert.equal(noGpsStandard.json.ok, false);
      assert.equal(noGpsStandard.json.data?.code || noGpsStandard.json.code, 'GPS_REQUIRED');

      // C. Kiosk GET_FACE_PROFILES WITH valid GPS + fastEdge=true -> instant <100ms D1 response!
      const fastProfRes = await callFastEdge({
        action: 'GET_FACE_PROFILES',
        isKiosk: true,
        lat: 10.9760327,
        lng: 106.6645922,
        gpsAccuracy: 10,
        fastEdge: true,
      });
      assert.equal(fastProfRes.json.ok, true);
      assert.ok(fastProfRes.elapsedMs < 150, `Expected <150ms D1 profiles, got ${fastProfRes.elapsedMs}ms`);
      assert.equal(fastProfRes.headers.get('X-Edge-DB'), 'D1-INSTANT');
      assert.equal(fastProfRes.json.data.profiles.length, 2);

      // D. Kiosk GET_KIOSK_ATTENDANCE_STATE WITH valid GPS + fastEdge=true -> instant <100ms D1 response!
      const fastStateRes = await callFastEdge({
        action: 'GET_KIOSK_ATTENDANCE_STATE',
        isKiosk: true,
        lat: 10.9760327,
        lng: 106.6645922,
        gpsAccuracy: 10,
        fastEdge: true,
      });
      assert.equal(fastStateRes.json.ok, true);
      assert.ok(fastStateRes.elapsedMs < 150, `Expected <150ms D1 state, got ${fastStateRes.elapsedMs}ms`);
      assert.equal(fastStateRes.headers.get('X-Edge-DB'), 'D1-INSTANT');
      assert.equal(fastStateRes.json.data.logs.length, 1);

      // E. Zero KV writes when D1 is bound
      assert.equal(kvPutCalls, 0, 'Must perform zero KV put calls when D1 is bound');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('10.2 extractLandmarksAndPose outputs dual keypoints (anatomical keypoints5 + legacy 100% irisKeypoints5) for backward-compatible recognition of @testapp & @nongvanhao', async () => {
    const bio = await vite.ssrLoadModule('/src/services/faceRecognitionV2.ts');

    const W = 640;
    const H = 480;
    const pts = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    pts[33] = { x: 245 / W, y: 200 / H, z: -0.02 };
    pts[133] = { x: 275 / W, y: 200 / H, z: -0.02 };
    pts[159] = { x: 260 / W, y: 194 / H, z: -0.02 };
    pts[145] = { x: 260 / W, y: 206 / H, z: -0.02 };
    pts[468] = { x: 260 / W, y: 210 / H, z: -0.02 }; // +10px downward iris gaze

    pts[362] = { x: 365 / W, y: 200 / H, z: -0.02 };
    pts[263] = { x: 395 / W, y: 200 / H, z: -0.02 };
    pts[386] = { x: 380 / W, y: 194 / H, z: -0.02 };
    pts[374] = { x: 380 / W, y: 206 / H, z: -0.02 };
    pts[473] = { x: 380 / W, y: 210 / H, z: -0.02 }; // +10px downward iris gaze

    pts[1] = { x: 320 / W, y: 250 / H, z: -0.08 };
    pts[61] = { x: 285 / W, y: 300 / H, z: -0.02 };
    pts[291] = { x: 355 / W, y: 300 / H, z: -0.02 };

    const geom = bio.extractLandmarksAndPose(pts, undefined, W, H, true);
    assert.ok(Array.isArray(geom.irisKeypoints5) && geom.irisKeypoints5.length === 5, 'Must return irisKeypoints5');
    assert.ok(Math.abs(geom.keypoints5[0][1] - 203) < 0.5, 'keypoints5 stays 70% anatomical + 30% iris (~203)');
    assert.ok(Math.abs(geom.irisKeypoints5[0][1] - 210) < 0.5, 'irisKeypoints5 tracks 100% iris (210) for @299 profiles');
  });

  test('10.3 evaluateHybridLiveness accepts 3D live faces under warm night LEDs (high replaySpoofScore false positive) while rejecting flat 2D & print spoofs, and frameSnapCanvas stays GPU-accelerated', async () => {
    const bio = await vite.ssrLoadModule('/src/services/faceRecognitionV2.ts');
    assert.equal(typeof bio.evaluateHybridLiveness, 'function', 'evaluateHybridLiveness must be exported');

    // 1. Night-shift smartphone camera under warm overhead restaurant LEDs:
    //    MiniFASNetV2 outputs replaySpoofScore=0.96, liveScore=0.02, printSpoofScore=0.02, while 3D mesh shows real nose protrusion (0.048)
    const nightPhoneLive = bio.evaluateHybridLiveness(
      { liveScore: 0.02, printSpoofScore: 0.02, replaySpoofScore: 0.96 },
      0.048
    );
    assert.equal(
      nightPhoneLive.isLive,
      true,
      'Real 3D face under evening LEDs must NOT be blocked by MiniFASNetV2 mobile ISP replay false positive'
    );

    // 2. Flat 2D surface with negligible depth & low CNN liveScore -> REJECTED
    const flatSpoof = bio.evaluateHybridLiveness(
      { liveScore: 0.02, printSpoofScore: 0.03, replaySpoofScore: 0.95 },
      0.001
    );
    assert.equal(flatSpoof.isLive, false, 'Flat 2D spoof without 3D nose protrusion must be rejected');

    // 3. Printed paper cutout spoof (printSpoofScore = 0.99) -> REJECTED
    const printSpoof = bio.evaluateHybridLiveness(
      { liveScore: 0.005, printSpoofScore: 0.99, replaySpoofScore: 0.005 },
      0.04
    );
    assert.equal(printSpoof.isLive, false, 'High-confidence paper print spoof must be rejected');

    // 4. Verify frameSnapCanvas does NOT force CPU software backing via willReadFrequently: true
    const engineSrc = fs.readFileSync(path.resolve('src/services/faceRecognitionV2.ts'), 'utf8');
    assert.equal(
      /frameSnapCanvas\.getContext\(['"]2d['"],\s*\{\s*willReadFrequently:\s*true/.test(engineSrc),
      false,
      'frameSnapCanvas must stay GPU-backed (no willReadFrequently: true) for WebGL2 detectForVideo compatibility'
    );
  });

  test('10.4 Shared instant client profile cache (setCachedFaceProfiles / getCachedHydratedFaceProfiles), App prewarm & SW v5 cache bump', async () => {
    const bio = await vite.ssrLoadModule('/src/services/faceRecognitionV2.ts');
    assert.equal(typeof bio.setCachedFaceProfiles, 'function');
    assert.equal(typeof bio.getCachedFaceProfiles, 'function');
    assert.equal(typeof bio.getCachedHydratedFaceProfiles, 'function');
    assert.equal(typeof bio.prewarmFaceRecognitionSystem, 'function');

    bio.setCachedFaceProfiles([
      {
        username: 'nongvanhao',
        fullname: 'Nông Văn Hào',
        position: 'Tổ trưởng',
        employmentStatus: 'active',
        vectorsB64: make5AnglePackB64(4),
        anglesCount: 5,
        isLocked: true,
      },
    ]);

    const rawCached = bio.getCachedFaceProfiles();
    const hydratedCached = bio.getCachedHydratedFaceProfiles();
    assert.equal(rawCached.length, 1);
    assert.equal(hydratedCached.length, 1);
    assert.equal(hydratedCached[0].username, 'nongvanhao');
    assert.equal(hydratedCached[0].vectors.length, 5);

    const appSrc = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
    const scannerSrc = fs.readFileSync(path.resolve('src/components/FastFaceScannerV2.tsx'), 'utf8');
    const swSrc = fs.readFileSync(path.resolve('public/sw.js'), 'utf8');

    assert.ok(
      appSrc.includes('prewarmFaceRecognitionSystem'),
      'App.tsx must prewarm biometric models & D1 face profiles automatically on any device opening the app'
    );
    assert.ok(
      scannerSrc.includes('fastEdge: true') && scannerSrc.includes('irisChwRgb'),
      'FastFaceScannerV2 must query D1 fastEdge and evaluate dual-keypoint irisChwRgb candidates'
    );
    assert.ok(
      /kg-staff-os-v([5-9]|\d{2,})/.test(swSrc),
      'public/sw.js must bump CACHE_VERSION to kg-staff-os-v5+ so existing PWA devices upgrade immediately'
    );
  });
});

// ============================================================================
// 11. BRAND-NEW PHONE INSTANT CONNECTION, MULTI-ENDPOINT FAILOVER & UI POLISH
// ============================================================================
describe('11. Brand-New Phone Instant Connection, Multi-Endpoint Failover & Streamlined UI (Task 11)', () => {
  test('11.1 Reactive profile pub/sub (subscribeCachedFaceProfiles) + in-flight biometric progress fan-out & WebKit safe buffer slice', async () => {
    const bio = await vite.ssrLoadModule('/src/services/faceRecognitionV2.ts');
    assert.equal(
      typeof bio.subscribeCachedFaceProfiles,
      'function',
      'faceRecognitionV2 must export subscribeCachedFaceProfiles so mounted components update in 0ms when prewarm finishes'
    );

    const events: number[] = [];
    const unsubscribe = bio.subscribeCachedFaceProfiles((profiles: unknown[]) => {
      events.push(Array.isArray(profiles) ? profiles.length : -1);
    });

    try {
      bio.setCachedFaceProfiles([
        {
          username: 'testapp',
          fullname: 'Test App',
          position: 'Phục vụ',
          employmentStatus: 'active',
          vectorsB64: make5AnglePackB64(1),
          anglesCount: 5,
          isLocked: true,
        },
      ]);
      bio.upsertCachedFaceProfile({
        username: 'nongvanhao',
        fullname: 'Nông Văn Hào',
        position: 'Tổ trưởng',
        employmentStatus: 'active',
        vectorsB64: make5AnglePackB64(2),
        anglesCount: 5,
        isLocked: true,
      });
      bio.removeCachedFaceProfile('testapp');

      assert.deepEqual(
        events,
        [1, 2, 1],
        'subscribeCachedFaceProfiles must notify mounted listeners on set, upsert, and remove'
      );
    } finally {
      unsubscribe();
    }

    const countBeforeAfterUnsub = events.length;
    bio.setCachedFaceProfiles([]);
    assert.equal(events.length, countBeforeAfterUnsub, 'Unsubscribed listener must not receive further updates');

    const engineSrc = fs.readFileSync(path.resolve('src/services/faceRecognitionV2.ts'), 'utf8');
    assert.ok(
      engineSrc.includes('engineProgressListeners'),
      'initFaceBiometricEngine must fan out live download/compile progress to late callers attaching to an in-flight engineInitPromise'
    );
    assert.ok(
      engineSrc.includes('landmarkerBytes.slice('),
      'createResilientFaceLandmarker must pass a sliced Uint8Array so WebGL2 failure on mobile WebKit cannot detach the buffer before CPU fallback'
    );
  });

  test('11.2 callApi multi-endpoint failover: retries PRIMARY_EDGE_API_URL when secondary /api returns 404 HTML or stale unknown-action error', async () => {
    const apiMod = await vite.ssrLoadModule('/src/services/api.ts');
    assert.equal(
      apiMod.PRIMARY_EDGE_API_URL,
      'https://kg-checkin.pages.dev/api',
      'api.ts must export PRIMARY_EDGE_API_URL pointing to the primary D1-bound Cloudflare Edge gateway'
    );

    const origFetch = globalThis.fetch;
    const origLocalStorage = (globalThis as any).localStorage;
    const origSessionStorage = (globalThis as any).sessionStorage;

    const memLocal = new Map<string, string>([['kg_gas_url', '/api']]);
    const memSession = new Map<string, string>();
    const makeStorage = (map: Map<string, string>) => ({
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => {
        map.set(k, String(v));
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
      clear: () => map.clear(),
      key: (idx: number) => Array.from(map.keys())[idx] ?? null,
      get length() {
        return map.size;
      },
    });

    (globalThis as any).localStorage = makeStorage(memLocal);
    (globalThis as any).sessionStorage = makeStorage(memSession);

    try {
      // Case A: Secondary domain returns 404 HTML for '/api' -> fails over to PRIMARY_EDGE_API_URL
      const seenUrlsA: string[] = [];
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        seenUrlsA.push(url);
        if (url === '/api') {
          return new Response('<!DOCTYPE html><html><body>404 Not Found</body></html>', {
            status: 404,
            headers: { 'Content-Type': 'text/html' },
          });
        }
        if (url === 'https://kg-checkin.pages.dev/api') {
          return new Response(
            JSON.stringify({
              ok: true,
              data: {
                profiles: [
                  { username: 'testapp', fullname: 'Test App', anglesCount: 5 },
                  { username: 'nongvanhao', fullname: 'Nông Văn Hào', anglesCount: 5 },
                ],
                totalActiveUsers: 58,
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        throw new Error(`Unexpected URL: ${url}`);
      }) as typeof fetch;

      apiMod.clearApiCache();
      const resA = await apiMod.callApi(
        'GET_FACE_PROFILES',
        { isKiosk: true, fastEdge: true, preloadOnly: true },
        { background: true, cacheTtlMs: 0 }
      );
      assert.equal(resA?.ok, true, 'Case A: callApi must recover via PRIMARY_EDGE_API_URL when /api returns HTML/404');
      assert.equal(resA?.data?.profiles?.length, 2);
      assert.deepEqual(seenUrlsA, ['/api', 'https://kg-checkin.pages.dev/api']);

      // Case B: Stale deployment returns { ok: false, message: 'Action không hợp lệ: GET_FACE_PROFILES' } -> fails over to PRIMARY_EDGE_API_URL
      const seenUrlsB: string[] = [];
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        seenUrlsB.push(url);
        if (url === '/api') {
          return new Response(
            JSON.stringify({ ok: false, message: 'Action không hợp lệ: GET_FACE_PROFILES' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url === 'https://kg-checkin.pages.dev/api') {
          return new Response(
            JSON.stringify({
              ok: true,
              data: {
                profiles: [{ username: 'nongvanhao', fullname: 'Nông Văn Hào', anglesCount: 5 }],
                totalActiveUsers: 58,
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        throw new Error(`Unexpected URL: ${url}`);
      }) as typeof fetch;

      apiMod.clearApiCache();
      const resB = await apiMod.callApi(
        'GET_FACE_PROFILES',
        { isKiosk: true, fastEdge: true, preloadOnly: true },
        { background: true, cacheTtlMs: 0 }
      );
      assert.equal(
        resB?.ok,
        true,
        'Case B: callApi must recover via PRIMARY_EDGE_API_URL when stale /api rejects GET_FACE_PROFILES as unknown action'
      );
      assert.equal(resB?.data?.profiles?.[0]?.username, 'nongvanhao');
      assert.deepEqual(seenUrlsB, ['/api', 'https://kg-checkin.pages.dev/api']);
    } finally {
      globalThis.fetch = origFetch;
      (globalThis as any).localStorage = origLocalStorage;
      (globalThis as any).sessionStorage = origSessionStorage;
    }
  });

  test('11.3 Brand-new phone indoor 2-phase GPS resilience, preview-before-GPS-lock & ZaloWarning browser escape', () => {
    const scannerSrc = fs.readFileSync(path.resolve('src/components/FastFaceScannerV2.tsx'), 'utf8');
    const zaloSrc = fs.readFileSync(path.resolve('src/components/ZaloWarning.tsx'), 'utf8');

    assert.ok(
      scannerSrc.includes('subscribeCachedFaceProfiles'),
      'FastFaceScannerV2 must subscribe to live cached face profile updates'
    );
    assert.ok(
      scannerSrc.includes('enableHighAccuracy: false') && scannerSrc.includes('enableHighAccuracy: true'),
      'FastFaceScannerV2 must acquire a fast coarse Wi-Fi/Cell GPS fix alongside high-accuracy GPS so indoor phones do not cold-start timeout'
    );
    assert.ok(
      scannerSrc.includes('err.code === 1') || scannerSrc.includes('PERMISSION_DENIED'),
      'FastFaceScannerV2 must distinguish true GPS permission denial (code 1) from indoor GPS timeout (code 3)'
    );
    assert.equal(
      scannerSrc.includes('disabled={loadingProfiles || (isKioskMode && !isGpsReady)}'),
      false,
      'Manual profile sync button must NEVER be disabled while waiting for GPS lock'
    );

    assert.ok(
      zaloSrc.includes('clipboard') && zaloSrc.includes('intent://'),
      'ZaloWarning must provide 1-tap Copy Link and Android Chrome intent:// escape buttons for shared Zalo links'
    );
    assert.equal(
      zaloSrc.includes('backdrop-blur'),
      false,
      'ZaloWarning must obey Design DNA (zero backdrop-blur)'
    );
  });

  test('11.4 Ergonomic UI & Design DNA invariants across Scanner, Login, CheckIn, Enrollment, Picker & SW v6', () => {
    const filesToCheck = [
      'src/components/FastFaceScannerV2.tsx',
      'src/pages/Login.tsx',
      'src/components/FaceEnrollmentModal.tsx',
      'src/components/AdminStaffFacePickerModal.tsx',
      'src/components/ZaloWarning.tsx',
    ];

    for (const relPath of filesToCheck) {
      const src = fs.readFileSync(path.resolve(relPath), 'utf8');
      assert.equal(
        src.includes('backdrop-blur'),
        false,
        `${relPath} must contain zero backdrop-blur (glassmorphismAllowed: false in .design-dna/dna.json)`
      );
    }

    const scannerSrc = fs.readFileSync(path.resolve('src/components/FastFaceScannerV2.tsx'), 'utf8');
    const loginSrc = fs.readFileSync(path.resolve('src/pages/Login.tsx'), 'utf8');
    const checkinSrc = fs.readFileSync(path.resolve('src/pages/CheckIn.tsx'), 'utf8');
    const v2ToggleIdx = checkinSrc.indexOf('data-testid="checkin-mode-toggle"');
    const v2ToggleSection = checkinSrc.slice(Math.max(0, v2ToggleIdx - 120), v2ToggleIdx + 4200);
    assert.equal(
      v2ToggleSection.includes('backdrop-blur'),
      false,
      'CheckIn.tsx Face ID v2 switcher block must contain zero backdrop-blur'
    );
    const enrollSrc = fs.readFileSync(path.resolve('src/components/FaceEnrollmentModal.tsx'), 'utf8');
    const pickerSrc = fs.readFileSync(path.resolve('src/components/AdminStaffFacePickerModal.tsx'), 'utf8');
    const swSrc = fs.readFileSync(path.resolve('public/sw.js'), 'utf8');

    for (const testId of ['toggle-camera-facing-btn', 'v2-admin-enroll-staff-btn', 'v2-punch-confirmed-card']) {
      assert.ok(scannerSrc.includes(`data-testid="${testId}"`), `FastFaceScannerV2 must preserve data-testid="${testId}"`);
    }
    assert.ok(loginSrc.includes('data-testid="open-kiosk-face-v2"'), 'Login must preserve data-testid="open-kiosk-face-v2"');
    assert.ok(loginSrc.includes('subscribeCachedFaceProfiles'), 'Login must show live prewarmed profile readiness');

    for (const testId of ['checkin-mode-toggle', 'mode-v1-btn', 'mode-v2-btn', 'open-face-enroll-btn', 'admin-enroll-staff-btn']) {
      assert.ok(checkinSrc.includes(`data-testid="${testId}"`), `CheckIn must preserve data-testid="${testId}"`);
    }
    for (const testId of ['enroll-angle-pills', 'enroll-video-feed', 'enroll-booting-card', 'enroll-start-scanning-btn', 'toggle-camera-facing-btn']) {
      assert.ok(enrollSrc.includes(`data-testid="${testId}"`), `FaceEnrollmentModal must preserve data-testid="${testId}"`);
    }
    for (const testId of ['admin-staff-face-picker-modal', 'staff-face-picker-search']) {
      assert.ok(pickerSrc.includes(`data-testid="${testId}"`), `AdminStaffFacePickerModal must preserve data-testid="${testId}"`);
    }
    assert.ok(
      /const CACHE_VERSION = 'kg-staff-os-v([6-9]|\d{2,})'/.test(swSrc),
      'public/sw.js must bump CACHE_VERSION to kg-staff-os-v6+'
    );
  });
});

describe('Task 12 & 13: Unified Smart Vào ca / Ra ca Alternation (06:00-05:59) + Always-Interactive Shutter & Clean Supplement', () => {
  test('12.1 Exact user 06:00 -> 05:59 scenario: 15:00 Vào ca -> 22:22 Ra ca -> 23:15 Vào ca -> 01:45 (<06:00) Ra ca -> 06:05 Vào ca', async () => {
    localStore.clear();
    const seq = await vite.ssrLoadModule('/src/utils/attendanceSequence.ts');
    const user = { username: 'nv_ca_gay', fullname: 'Phạm Minh Tuấn' };
    const logs: any[] = [];

    // 1. 15:00 (first punch of 06:00 -> 05:59 cycle) -> ONLY Vào ca
    const s1 = seq.resolveNextAttendancePunch({
      user,
      logs,
      now: new Date('2026-11-10T15:00:00+07:00'),
    });
    assert.equal(s1.canPunch, true);
    assert.equal(s1.nextType, 'Vào ca');
    assert.equal(s1.baseAction, 'Vào ca');
    assert.equal(s1.confirmButtonLabel, 'Xác nhận Vào ca');
    logs.push({ username: 'nv_ca_gay', fullname: 'Phạm Minh Tuấn', type: 'Vào ca', time: '10/11/2026 15:00:00' });

    // 2. 22:22 (already has open Vào ca) -> ONLY Ra ca
    const s2 = seq.resolveNextAttendancePunch({
      user,
      logs,
      now: new Date('2026-11-10T22:22:00+07:00'),
    });
    assert.equal(s2.canPunch, true);
    assert.equal(s2.nextType, 'Ra ca');
    assert.equal(s2.baseAction, 'Ra ca');
    assert.equal(s2.confirmButtonLabel, 'Xác nhận Ra ca');
    logs.push({ username: 'nv_ca_gay', fullname: 'Phạm Minh Tuấn', type: 'Ra ca', time: '10/11/2026 22:22:00' });

    // 3. 23:15 (already has 1 closed pair 15:00-22:22) -> ONLY Vào ca (shiftIndex = 2)
    const s3 = seq.resolveNextAttendancePunch({
      user,
      logs,
      now: new Date('2026-11-10T23:15:00+07:00'),
    });
    assert.equal(s3.canPunch, true);
    assert.equal(s3.nextType, 'Vào ca');
    assert.equal(s3.shiftIndex, 2);
    assert.equal(s3.baseAction, 'Vào ca');
    assert.equal(s3.confirmButtonLabel, 'Xác nhận Vào ca');
    logs.push({ username: 'nv_ca_gay', fullname: 'Phạm Minh Tuấn', type: 'Vào ca', time: '10/11/2026 23:15:00' });

    // 4. 01:45 next morning (< 06:00) -> ONLY Ra ca (shiftIndex = 2)
    const s4 = seq.resolveNextAttendancePunch({
      user,
      logs,
      now: new Date('2026-11-11T01:45:00+07:00'),
    });
    assert.equal(s4.canPunch, true);
    assert.equal(s4.nextType, 'Ra ca');
    assert.equal(s4.shiftIndex, 2);
    assert.equal(s4.baseAction, 'Ra ca');
    assert.equal(s4.confirmButtonLabel, 'Xác nhận Ra ca');
    logs.push({ username: 'nv_ca_gay', fullname: 'Phạm Minh Tuấn', type: 'Ra ca', time: '11/11/2026 01:45:00' });

    // 5. 03:00 next morning (< 06:00, already 2 pairs) -> blocked MAX_4_PUNCHES
    const s4Blocked = seq.resolveNextAttendancePunch({
      user,
      logs,
      now: new Date('2026-11-11T03:00:00+07:00'),
    });
    assert.equal(s4Blocked.canPunch, false);
    assert.equal(s4Blocked.blockedReason, 'MAX_4_PUNCHES');

    // 6. 06:05 next morning (>= 06:00 new workday cycle) -> resets to Vào ca (shiftIndex = 1)
    const s5 = seq.resolveNextAttendancePunch({
      user,
      logs,
      now: new Date('2026-11-11T06:05:00+07:00'),
    });
    assert.equal(s5.canPunch, true);
    assert.equal(s5.nextType, 'Vào ca');
    assert.equal(s5.shiftIndex, 1);
    assert.equal(s5.baseAction, 'Vào ca');
    assert.equal(s5.confirmButtonLabel, 'Xác nhận Vào ca');
  });

  test('12.2 Pending supplement "Chờ duyệt: Vào ca" immediately unlocks live Ra ca without 15m spam cooldown and counts 0 payroll hours until Admin approves (including double-shift Vào ca / Ra ca)', async () => {
    localStore.clear();
    const seq = await vite.ssrLoadModule('/src/utils/attendanceSequence.ts');
    const tsCalc = await vite.ssrLoadModule('/src/utils/timesheetCalculator.ts');
    const user = { username: 'nv_quen_vao', fullname: 'Nguyễn Thị Hoa' };

    // Verify label classifiers strictly protect payroll while recognizing pending supplements
    assert.equal(seq.isCheckInLabel('Chờ duyệt: Vào ca'), false);
    assert.equal(seq.isCheckOutLabel('Chờ duyệt: Ra ca'), false);
    assert.equal(seq.isCheckInLabel('Từ chối: Vào ca'), false);
    assert.equal(seq.isPendingCheckInSupplementLabel('Chờ duyệt: Vào ca'), true);
    assert.equal(seq.isPendingCheckOutSupplementLabel('Chờ duyệt: Ra ca'), true);
    assert.equal(seq.isPendingCheckInSupplementLabel('Chờ duyệt: Vào 1'), true);
    assert.equal(seq.isPendingCheckOutSupplementLabel('Chờ duyệt: Ra 1'), true);

    // Verify formatUnifiedPunchLabel normalizes legacy Vào 1..Ra 2 labels cleanly for UI display
    assert.equal(seq.formatUnifiedPunchLabel('Vào 1'), 'Vào ca');
    assert.equal(seq.formatUnifiedPunchLabel('Ra 1'), 'Ra ca');
    assert.equal(seq.formatUnifiedPunchLabel('Vào 2'), 'Vào ca');
    assert.equal(seq.formatUnifiedPunchLabel('Ra 2'), 'Ra ca');
    assert.equal(seq.formatUnifiedPunchLabel('Vào ca 2'), 'Vào ca');
    assert.equal(seq.formatUnifiedPunchLabel('Ra ca 2'), 'Ra ca');
    assert.equal(seq.formatUnifiedPunchLabel('Vào 1 (Trễ 10p)'), 'Vào ca (Trễ 10p)');
    assert.equal(seq.formatUnifiedPunchLabel('Chờ duyệt: Vào 1'), 'Chờ duyệt: Vào ca');
    assert.equal(seq.formatUnifiedPunchLabel('Từ chối: Ra 2'), 'Từ chối: Ra ca');

    const logsWithPending = [
      {
        username: 'nv_quen_vao',
        fullname: 'Nguyễn Thị Hoa',
        type: 'Chờ duyệt: Vào ca',
        status: 'Chờ Admin duyệt',
        time: '10/11/2026 22:18:00',
      },
    ];

    const nextLive = seq.resolveNextAttendancePunch({
      user,
      logs: logsWithPending,
      now: new Date('2026-11-10T22:22:00+07:00'),
    });
    assert.equal(nextLive.canPunch, true, 'Pending supplement must NOT trigger 15m live punch cooldown');
    assert.equal(nextLive.nextType, 'Ra ca');
    assert.equal(nextLive.baseAction, 'Ra ca');
    assert.equal(nextLive.confirmButtonLabel, 'Xác nhận Ra ca');

    const inMs = new Date('2026-11-10T15:00:00+07:00').getTime();
    const outMs = new Date('2026-11-10T22:30:00+07:00').getTime();

    const sheetBeforeApprove = tsCalc.calculateEmployeeMonthTimesheet(
      'Nguyễn Thị Hoa',
      {
        '10/11/2026': [
          {
            status: 'Chờ duyệt: Vào ca',
            validStatus: 'Chờ Admin duyệt',
            time: '15:00',
            originalTimeMs: inMs,
          },
          {
            status: 'Ra ca',
            validStatus: 'Hợp lệ',
            time: '22:30',
            originalTimeMs: outMs,
          },
        ],
      },
      30,
      11,
      2026
    );
    assert.equal(sheetBeforeApprove.totalHours, 0, 'Unapproved supplement must NEVER count in payroll hours');

    // Double shift in a single workday using ONLY unified Vào ca / Ra ca labels: 09:00-14:00 (5h) + 17:00-01:00 (8h) = 13.0h!
    const doubleShiftApproved = tsCalc.calculateEmployeeMonthTimesheet(
      'Nguyễn Thị Hoa',
      {
        '10/11/2026': [
          { status: 'Vào ca', validStatus: 'Hợp lệ', time: '09:00', originalTimeMs: new Date('2026-11-10T09:00:00+07:00').getTime() },
          { status: 'Ra ca', validStatus: 'Hợp lệ', time: '14:00', originalTimeMs: new Date('2026-11-10T14:00:00+07:00').getTime() },
          { status: 'Vào ca', validStatus: 'Hợp lệ', time: '17:00', originalTimeMs: new Date('2026-11-10T17:00:00+07:00').getTime() },
          { status: 'Ra ca', validStatus: 'Hợp lệ', time: '01:00', originalTimeMs: new Date('2026-11-11T01:00:00+07:00').getTime(), isNextDayEarlyMorning: true },
        ],
      },
      30,
      11,
      2026
    );
    assert.equal(doubleShiftApproved.totalHours, 13.0, 'Double shift with unified Vào ca / Ra ca must compute exact 13.0h');
  });

  test('12.3 resolveSupplementActionForDate detects exact missing Vào ca / Ra ca per date and rolls <06:00 overnight Ra ca to D+1', async () => {
    localStore.clear();
    const seq = await vite.ssrLoadModule('/src/utils/attendanceSequence.ts');
    const user = { username: 'nv_supp', fullname: 'Trần Văn Bổ Sung' };

    // 1. Empty day -> Vào ca
    const d0 = seq.resolveSupplementActionForDate({
      user,
      dateStr: '10/11/2026',
      timeStr: '15:00',
      logs: [],
    });
    assert.equal(d0.canSupplement, true);
    assert.equal(d0.baseAction, 'Vào ca');
    assert.equal(d0.canonicalType, 'Vào ca');
    assert.equal(d0.effectiveDateStr, '10/11/2026');

    // 2. Day has open Vào ca at 15:00 -> Ra ca
    const d1 = seq.resolveSupplementActionForDate({
      user,
      dateStr: '10/11/2026',
      timeStr: '22:30',
      logs: [{ username: 'nv_supp', fullname: 'Trần Văn Bổ Sung', type: 'Vào ca', time: '10/11/2026 15:00:00' }],
    });
    assert.equal(d1.canSupplement, true);
    assert.equal(d1.baseAction, 'Ra ca');
    assert.equal(d1.canonicalType, 'Ra ca');
    assert.equal(d1.effectiveDateStr, '10/11/2026');

    // 3. Day has open Vào ca at 17:00 and staff enters overnight Ra time 01:20 (< 06:00) -> rolls effectiveDateStr to 11/11/2026!
    const d1Overnight = seq.resolveSupplementActionForDate({
      user,
      dateStr: '10/11/2026',
      timeStr: '01:20',
      logs: [{ username: 'nv_supp', fullname: 'Trần Văn Bổ Sung', type: 'Vào ca', time: '10/11/2026 17:00:00' }],
    });
    assert.equal(d1Overnight.canSupplement, true);
    assert.equal(d1Overnight.baseAction, 'Ra ca');
    assert.equal(d1Overnight.canonicalType, 'Ra ca');
    assert.equal(d1Overnight.isNextCalendarDayOvernight, true);
    assert.equal(d1Overnight.effectiveDateStr, '11/11/2026');

    // 4. Day has closed pair 1 (09:00 - 14:00) -> Vào ca (shiftIndex = 2)
    const d2 = seq.resolveSupplementActionForDate({
      user,
      dateStr: '10/11/2026',
      timeStr: '17:00',
      logs: [
        { username: 'nv_supp', fullname: 'Trần Văn Bổ Sung', type: 'Vào ca', time: '10/11/2026 09:00:00' },
        { username: 'nv_supp', fullname: 'Trần Văn Bổ Sung', type: 'Ra ca', time: '10/11/2026 14:00:00' },
      ],
    });
    assert.equal(d2.canSupplement, true);
    assert.equal(d2.baseAction, 'Vào ca');
    assert.equal(d2.canonicalType, 'Vào ca');
    assert.equal(d2.shiftIndex, 2);
    assert.equal(/Vào 1|Ra 1|Vào 2|Ra 2/i.test(d2.reasonHint), false);

    // 5. Day has orphaned Ra ca at 22:22 (missing earlier Vào ca) -> Vào ca
    const dOrphanOut = seq.resolveSupplementActionForDate({
      user,
      dateStr: '10/11/2026',
      timeStr: '15:00',
      logs: [{ username: 'nv_supp', fullname: 'Trần Văn Bổ Sung', type: 'Ra ca', time: '10/11/2026 22:22:00' }],
    });
    assert.equal(dOrphanOut.canSupplement, true);
    assert.equal(dOrphanOut.baseAction, 'Vào ca');
    assert.equal(dOrphanOut.canonicalType, 'Vào ca');
  });

  test('12.4 CheckIn.tsx, FastFaceScannerV2.tsx, MissedCheckInModal.tsx, ActivityHistory.tsx & FaceEnrollmentModal.tsx unified Vào ca / Ra ca & interactive shutter invariants', () => {
    const checkinSrc = fs.readFileSync(path.resolve('src/pages/CheckIn.tsx'), 'utf8');
    const faceScannerSrc = fs.readFileSync(path.resolve('src/components/FastFaceScannerV2.tsx'), 'utf8');
    const missedSrc = fs.readFileSync(path.resolve('src/components/MissedCheckInModal.tsx'), 'utf8');
    const historySrc = fs.readFileSync(path.resolve('src/pages/ActivityHistory.tsx'), 'utf8');
    const enrollSrc = fs.readFileSync(path.resolve('src/components/FaceEnrollmentModal.tsx'), 'utf8');

    for (const [name, src] of [
      ['CheckIn.tsx', checkinSrc],
      ['FastFaceScannerV2.tsx', faceScannerSrc],
      ['MissedCheckInModal.tsx', missedSrc],
      ['ActivityHistory.tsx', historySrc],
      ['FaceEnrollmentModal.tsx', enrollSrc],
    ] as const) {
      assert.equal(
        /Vào 1|Ra 1|Vào 2|Ra 2|Vào ca 2|Ra ca 2/.test(src),
        false,
        `${name} must NOT contain any numbered Vào 1 / Ra 1 / Vào 2 / Ra 2 / Vào ca 2 / Ra ca 2 labels`
      );
    }

    assert.ok(
      checkinSrc.includes('data-testid="smart-confirm-punch-btn"') &&
        checkinSrc.includes('handleCaptureTrigger'),
      'CheckIn.tsx must route shutter & CHỤP ẢNH VÀO CA / RA CA through always-responsive handleCaptureTrigger'
    );
    assert.equal(
      checkinSrc.includes('disabled={!isPrimaryActionReady || isSubmitting}'),
      false,
      'CheckIn.tsx primary CHỤP ẢNH VÀO CA button must NEVER be dead/disabled when !capturedImage'
    );
    assert.equal(
      checkinSrc.includes('setHasAcknowledgedMissingIn'),
      false,
      'CheckIn.tsx must NOT contain orphaned setHasAcknowledgedMissingIn calls that crash takePhoto / handleFileUpload'
    );
    assert.equal(
      missedSrc.includes('backdrop-blur'),
      false,
      'MissedCheckInModal.tsx must contain zero backdrop-blur per Design DNA'
    );
    assert.equal(
      missedSrc.includes('Swal.fire'),
      false,
      'MissedCheckInModal.tsx must contain zero Swal.fire modal-over-modal popups'
    );
  });
});

// ---------------------------------------------------------------------------
// Task 13: Definitive Cross-Device Face ID V2 Sync, Zero-#ERROR! Encoding,
//          D1->GAS Self-Healing & Canonical Mirror Fusion
// ---------------------------------------------------------------------------
describe('Task 13: Definitive Cross-Device Face ID V2 Sync, Zero-#ERROR! Encoding, D1->GAS Self-Healing & Canonical Mirror Fusion', () => {
  /**
   * Build 5 deterministic 512-D unit vectors whose first quantized Int8 byte is -6 (0xFA = 250,
   * top 6 bits = 62 -> '+' in standard Base64, exactly reproducing @nongvanhao's +ffH+PASzz3/... bug!).
   */
  function makePlusLeadingVectors(): { floatVecs: Float32Array[]; legacyPlusB64: string; singleLivePlusB64: string } {
    const floatVecs: Float32Array[] = [];
    const rawPack = new Int8Array(5 * 512);
    for (let k = 0; k < 5; k++) {
      const v = new Float32Array(512);
      // Choose v[0] so round((v[0] / maxAbs) * 127) === -6 -> byte 250 -> Base64 starts with '+'
      v[0] = -6 / 127;
      v[1] = 1.0; // maxAbs = 1.0 -> scale = 127
      for (let i = 2; i < 512; i++) {
        v[i] = 0.65 * Math.sin((i + 1) * 0.19 + k * 0.22);
      }
      // Quantize before unit-norm check: maxAbs is 1.0, so q[0] = -6!
      for (let i = 0; i < 512; i++) {
        rawPack[k * 512 + i] = Math.max(-127, Math.min(127, Math.round(v[i] * 127)));
      }
      let sq = 0;
      for (let i = 0; i < 512; i++) sq += v[i] * v[i];
      const inv = 1 / Math.sqrt(sq);
      for (let i = 0; i < 512; i++) v[i] *= inv;
      // Rescale so maxAbs after normalization still quantizes v[0] to -6:
      // Wait: quantizeVectorsToInt8B64 uses scale = 127 / maxAbs, which cancels uniform inv!
      floatVecs.push(v);
    }
    const legacyPlusB64 = Buffer.from(rawPack.buffer, rawPack.byteOffset, rawPack.byteLength).toString('base64');
    const singleLivePlusB64 = Buffer.from(rawPack.buffer, rawPack.byteOffset, 512).toString('base64');
    assert.equal(legacyPlusB64.startsWith('+'), true, 'Test fixture must start with "+" in standard Base64');
    return { floatVecs, legacyPlusB64, singleLivePlusB64 };
  }

  test('13.1 Formula-proof v2: Base64URL encoding & GAS Plain-Text guard prevent Google Sheets #ERROR! and allow recovery of corrupted rows', async () => {
    localStore.clear();
    const bio = await vite.ssrLoadModule('/src/services/faceRecognitionV2.ts');
    const { floatVecs, legacyPlusB64, singleLivePlusB64 } = makePlusLeadingVectors();

    // 1. Client encoder MUST emit formula-proof 'v2:' prefix (never starting with +, -, =, ')
    const safeEncoded: string = bio.quantizeVectorsToInt8B64(floatVecs);
    assert.equal(safeEncoded.startsWith('v2:'), true, `Expected v2: prefix, got "${safeEncoded.slice(0, 12)}"`);
    assert.equal(/^[+-=']/.test(safeEncoded), false, 'Encoded face vector must NEVER start with spreadsheet formula operator');
    assert.equal(safeEncoded.includes('+'), false, 'v2: Base64URL must not contain "+"');
    assert.equal(safeEncoded.includes('/'), false, 'v2: Base64URL must not contain "/"');

    // 2. Client decoder MUST decode both new 'v2:...' AND legacy '+...' identically, and reject '#ERROR!'
    const decSafe = bio.decodeInt8B64ToVectors(safeEncoded);
    const decLegacy = bio.decodeInt8B64ToVectors(legacyPlusB64);
    assert.equal(decSafe.length, 5);
    assert.equal(decLegacy.length, 5);
    assert.ok(bio.cosineSimilarity(decSafe[0], decLegacy[0]) > 0.9999);
    assert.equal(bio.decodeInt8B64ToVectors('#ERROR!').length, 0);
    assert.equal(bio.decodeInt8B64ToVectors('#NAME?').length, 0);

    // 3. setCachedFaceProfiles must drop '#ERROR!' rows even if padded > 64 chars
    bio.setCachedFaceProfiles([
      {
        username: 'bad_sheet_row',
        fullname: 'Lỗi Sheet',
        vectorsB64: '#ERROR!' + ' '.repeat(80),
        anglesCount: 5,
      },
      {
        username: 'nongvanhao',
        fullname: 'Nông Văn Hào',
        vectorsB64: safeEncoded,
        anglesCount: 5,
      },
    ]);
    const cached = bio.getCachedFaceProfiles();
    assert.equal(cached.length, 1);
    assert.equal(cached[0].username, 'nongvanhao');

    // 4. GAS Sandbox: enrolling a '+' leading vector MUST NOT turn into '#ERROR!' in CONFIG_FACE_ID,
    //    and real employee CHECK_IN_OUT (v2_face) on Device B MUST succeed!
    const gas = createGasV2Sandbox(
      {
        DATA: [
          ['Bảng người dùng'],
          ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
          ['nongvanhao', 'hash', 'Nông Văn Hào', '', 'hao@kg.vn', 'user', 'Phục vụ', '', 'active'],
          ['corrupted_nv', 'hash', 'Nhân Viên Lỗi Cũ', '', 'err@kg.vn', 'user', 'Bếp', '', 'active'],
        ],
        CONFIG_FACE_ID: [
          ['Username', 'Fullname', 'VectorsInt8B64', 'AnglesCount', 'ModelVersion', 'SampleImageUrl', 'EnrolledAt', 'UpdatedBy', 'IsLocked'],
          ['corrupted_nv', 'Nhân Viên Lỗi Cũ', '#ERROR!', 5, 'w600k_mbf_int8_v2', '', '02/11/2026 21:17:00', 'corrupted_nv', true],
        ],
        '✔️CHẤM CÔNG': [
          ['Họ tên', 'Loại', 'Thời gian', 'Vị trí', 'Trạng thái', 'Khoảng cách', 'Ảnh', 'JSON'],
        ],
      },
      '2026-11-03T10:00:00+07:00'
    );

    // 4A. GET_FACE_PROFILES must NOT return corrupted '#ERROR!' row as enrolled
    const initProfRes = gas.callDoPost({ action: 'GET_FACE_PROFILES', isKiosk: true, preloadOnly: true });
    assert.equal(initProfRes.ok, true);
    assert.equal(initProfRes.data.profiles.length, 0, 'Corrupted #ERROR! row must not be served as valid profile');

    // 4B. Employee with corrupted '#ERROR!' row (even with IsLocked=TRUE) can re-enroll immediately without admin unlock!
    const recoverEnroll = gas.callDoPost({
      action: 'ENROLL_FACE_PROFILE',
      username: 'corrupted_nv',
      fullname: 'Nhân Viên Lỗi Cũ',
      vectorsB64: legacyPlusB64,
      anglesCount: 5,
    });
    assert.equal(recoverEnroll.ok, true, 'Corrupted #ERROR! row must allow immediate self-healing / re-enrollment');

    // 4C. Enrolling nongvanhao with legacy '+' leading Base64 stores safe v2: string in CONFIG_FACE_ID (never #ERROR!)
    const enrollHao = gas.callDoPost({
      action: 'ENROLL_FACE_PROFILE',
      username: 'nongvanhao',
      fullname: 'Nông Văn Hào',
      vectorsB64: make5AnglePackB64(9),
      anglesCount: 5,
    });
    assert.equal(enrollHao.ok, true);
    const haoRow = gas.sheetsData['CONFIG_FACE_ID'].find((r) => r[0] === 'nongvanhao');
    assert.ok(haoRow, 'nongvanhao row must exist in CONFIG_FACE_ID');
    assert.notEqual(haoRow![2], '#ERROR!', 'VectorsInt8B64 must NEVER become #ERROR! in Google Sheets');
    assert.equal(String(haoRow![2]).startsWith('v2:'), true, 'GAS must normalize stored vector to v2: formula-safe format');

    // Check-in on Device B for corrupted_nv (whose vector started with '+') succeeds on GAS!
    const punchRecovered = gas.callDoPost({
      action: 'CHECK_IN_OUT',
      checkinMode: 'v2_face',
      checkinId: 'FV2_CORRUPTED_RECOVERED_1',
      username: 'corrupted_nv',
      fullname: 'Nhân Viên Lỗi Cũ',
      type: 'Vào ca',
      liveVectorB64: singleLivePlusB64,
      lat: 10.9760327,
      lng: 106.6645922,
      gpsAccuracy: 6,
      time: '03/11/2026 10:00:00',
      fastSync: true,
      image: 'PENDING',
    });
    assert.equal(punchRecovered.ok, true, `Expected CHECK_IN_OUT ok=true on Device B, got: ${JSON.stringify(punchRecovered)}`);
  });

  test('13.2 Edge D1 -> GAS bidirectional self-healing repairs live #ERROR! row on first CHECK_IN_OUT & queues ENROLL_FACE_PROFILE on GAS timeout', async () => {
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    const mock = createEdgeFaceD1Mock();
    const { legacyPlusB64, singleLivePlusB64 } = makePlusLeadingVectors();
    const origFetch = globalThis.fetch;

    (globalThis as any).caches = {
      default: {
        match: async () => null,
        put: async () => undefined,
        delete: async () => true,
      },
    };

    // Seed D1 with @nongvanhao's intact '+ffH...' vector (exact production state!)
    mock.faceProfiles.set('nongvanhao', {
      username: 'nongvanhao',
      fullname: 'Nông Văn Hào',
      role: 'user',
      position: 'Phục vụ',
      avatar_url: '',
      employment_status: 'active',
      model_version: 'w600k_mbf_int8_v2',
      angle_count: 5,
      vectors_b64: legacyPlusB64,
      centroid_b64: singleLivePlusB64,
      quality_score: 0.88,
      is_locked: 1,
      enrolled_at: '02/11/2026 21:17:00',
      enrolled_by: 'nongvanhao',
      unlocked_by: '',
      updated_at: Date.now() - 60000,
    });

    let gasHaoVectorState = '#ERROR!'; // Exact corrupted state on live Google Sheets!
    let gasEnrollHealCount = 0;
    let simulateGasTimeoutOnEnroll = false;

    globalThis.fetch = (async (_url: any, init?: any) => {
      const parsed = JSON.parse(init.body);
      if (parsed.action === 'ENROLL_FACE_PROFILE') {
        if (simulateGasTimeoutOnEnroll) {
          throw new Error('GAS Timeout (>28s)');
        }
        if (String(parsed.username || '').toLowerCase() === 'nongvanhao') {
          gasEnrollHealCount += 1;
          gasHaoVectorState = String(parsed.vectorsB64 || '');
        }
        return new Response(
          JSON.stringify({
            ok: true,
            data: { username: parsed.username, fullname: parsed.fullname, anglesCount: 5, isLocked: true },
          }),
          { status: 200 }
        );
      }

      if (parsed.action === 'CHECK_IN_OUT') {
        if (String(parsed.username || '').toLowerCase() === 'nongvanhao') {
          if (gasHaoVectorState === '#ERROR!' || gasHaoVectorState.startsWith('+')) {
            return new Response(
              JSON.stringify({
                ok: false,
                code: 'FACE_VERIFICATION_FAILED',
                data: { code: 'FACE_VERIFICATION_FAILED', message: 'Xác thực khuôn mặt không khớp với hồ sơ gốc trên hệ thống.' },
                message: 'Xác thực khuôn mặt không khớp với hồ sơ gốc trên hệ thống.',
              }),
              { status: 200 }
            );
          }
        }
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              fullname: parsed.fullname,
              loaiChamCong: 'Vào ca',
              thoiGian: parsed.time || '03/11/2026 10:05:00',
              xacMinh: 'Hợp lệ',
            },
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 });
    }) as any;

    const waitTasks: Promise<any>[] = [];
    const callEdge = async (body: Record<string, any>) => {
      const req = new Request('https://kg-checkin.pages.dev/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const res = await edgeMod.onRequest({
        request: req,
        env: { DB: mock.db, SESSION_SECRET: 'test-heal-secret' },
        waitUntil: (p: Promise<any>) => {
          waitTasks.push(Promise.resolve(p).catch(() => {}));
        },
      });
      return { status: res.status, json: await res.json() };
    };

    try {
      // 1. Device B scans @nongvanhao -> GAS initially fails with FACE_VERIFICATION_FAILED due to #ERROR!,
      //    Edge MUST auto-heal GAS from D1 with safe 'v2:' vector AND retry CHECK_IN_OUT so first scan succeeds!
      const punchHao = await callEdge({
        action: 'CHECK_IN_OUT',
        checkinMode: 'v2_face',
        checkinId: 'FV2_HAO_HEAL_1',
        username: 'nongvanhao',
        fullname: 'Nông Văn Hào',
        type: 'Vào ca',
        liveVectorB64: singleLivePlusB64,
        lat: 10.9760327,
        lng: 106.6645922,
        gpsAccuracy: 6,
        time: '03/11/2026 10:05:00',
      });
      await Promise.allSettled(waitTasks);

      assert.equal(punchHao.json.ok, true, `Expected Edge self-heal + retry to succeed, got: ${JSON.stringify(punchHao.json)}`);
      assert.equal(gasEnrollHealCount, 1, 'Edge must push repaired profile from D1 to GAS once');
      assert.equal(gasHaoVectorState.startsWith('v2:'), true, 'Healed GAS vector must use formula-safe v2: prefix');

      // 2. Device A enrolls new employee @nv_offline_gas while GAS times out -> Edge saves to D1 + enqueues to edge_sync_queue!
      simulateGasTimeoutOnEnroll = true;
      const enrollTimeoutRes = await callEdge({
        action: 'ENROLL_FACE_PROFILE',
        username: 'nv_offline_gas',
        fullname: 'Phạm Văn Bền Bỉ',
        position: 'Pha chế',
        vectorsB64: make5AnglePackB64(4),
        anglesCount: 5,
      });
      await Promise.allSettled(waitTasks);

      assert.equal(enrollTimeoutRes.json.ok, true, 'Enrollment must succeed via D1 + sync queue when GAS times out');
      assert.equal(mock.faceProfiles.has('nv_offline_gas'), true, 'D1 must immediately hold nv_offline_gas for other devices');
      assert.equal(
        mock.syncQueue.some((q) => q.action === 'ENROLL_FACE_PROFILE' && q.dedupe_key.includes('nv_offline_gas')),
        true,
        'Edge must enqueue ENROLL_FACE_PROFILE into edge_sync_queue for guaranteed Sheet persistence'
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('13.3 Cross-device routing & SWR revalidation invariants (no stale script.google.com bypass, Login.tsx always revalidates profiles)', async () => {
    const apiSrc = fs.readFileSync(path.resolve('src/services/api.ts'), 'utf8');
    const appSrc = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
    const loginSrc = fs.readFileSync(path.resolve('src/pages/Login.tsx'), 'utf8');

    // Login.tsx must NOT gate GET_FACE_PROFILES behind `getCachedFaceProfiles().length === 0`
    assert.equal(
      loginSrc.includes('getCachedFaceProfiles().length === 0'),
      false,
      'Login.tsx must ALWAYS revalidate GET_FACE_PROFILES in background even when localStorage already has old profiles'
    );

    // Production routing in api.ts & App.tsx must not let legacy script.google.com in localStorage bypass /api Edge D1
    assert.equal(
      appSrc.includes("!storedGas.trim().startsWith('https://script.google.com/macros/s/')"),
      false,
      'App.tsx must migrate legacy script.google.com kg_gas_url to Edge /api so old phones do not bypass D1'
    );
    assert.ok(
      apiSrc.includes('isProd') && !apiSrc.includes("!trimmed.startsWith('https://script.google.com/macros/s/')"),
      'api.ts in production must route through Edge Gateway (/api or PRIMARY_EDGE_API_URL) instead of legacy script.google.com localStorage override'
    );
  });

  test('13.4 Per-angle canonical mirror-invariant fusion produces identical vectors across Front/Rear cameras & stores 5 clean canonical vectors', async () => {
    const bio = await vite.ssrLoadModule('/src/services/faceRecognitionV2.ts');
    const enrollSrc = fs.readFileSync(path.resolve('src/components/FaceEnrollmentModal.tsx'), 'utf8');
    const scannerSrc = fs.readFileSync(path.resolve('src/components/FastFaceScannerV2.tsx'), 'utf8');

    assert.equal(typeof bio.fuseCanonicalMirrorEmbedding, 'function', 'Must export fuseCanonicalMirrorEmbedding');

    // Simulate asymmetric left/right camera chirality: Device A sees rawEmb, Device B sees flippedEmb (swapped order!)
    const rawEmb = new Float32Array(512);
    const flipEmb = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      rawEmb[i] = Math.sin(i * 0.17 + 0.4);
      flipEmb[i] = Math.cos(i * 0.11 - 0.3);
    }
    const normRaw = bio.l2Normalize(rawEmb);
    const normFlip = bio.l2Normalize(flipEmb);

    // Device A computes fuse(normRaw, normFlip); Device B (mirrored camera) sees normFlip as primary and normRaw as its flip!
    const canonDeviceA = bio.fuseCanonicalMirrorEmbedding(normRaw, normFlip);
    const canonDeviceB = bio.fuseCanonicalMirrorEmbedding(normFlip, normRaw);

    assert.ok(
      bio.cosineSimilarity(canonDeviceA, canonDeviceB) > 0.999999,
      'Canonical mirror fusion must be 100% invariant between un-mirrored (Rear) and mirrored (Front) cameras'
    );

    // FaceEnrollmentModal must fuse each angle into 1 canonical vector (5 total = 2560 bytes), NOT push 2 separate vectors per angle
    assert.ok(
      enrollSrc.includes('fuseCanonicalMirrorEmbedding'),
      'FaceEnrollmentModal.tsx must use fuseCanonicalMirrorEmbedding per angle'
    );
    assert.equal(
      enrollSrc.includes('capturedVectorsRef.current.push(mirrorCand.embedding)'),
      false,
      'FaceEnrollmentModal.tsx must NOT push raw + mirror separately as 10 vectors distorting centroid'
    );

    // FastFaceScannerV2 must query 30h attendance state with isKiosk: true when inside restaurant geofence
    // so colleagues scanning on a shared/logged-in phone always get accurate Vào ca / Ra ca sequencing
    assert.equal(
      /GET_KIOSK_ATTENDANCE_STATE[\s\S]{0,160}isKiosk:\s*Boolean\(isKioskMode\)/.test(scannerSrc),
      false,
      'FastFaceScannerV2.tsx must fetch multi-employee 30h attendance state (isKiosk: true) when GPS is ready so any colleague scanning gets accurate Vào/Ra state'
    );
  });
});

// ============================================================================
// Task 14: Cross-Device Recognition Hardening v2.1 (Wire Compatibility, Pixel Lock,
// Scale-Invariant 3D Liveness, Linear Primary + Multi-Scale/Gamma Fallbacks, Kiosk Testapp)
// ============================================================================
describe('Task 14 — Cross-Device Recognition Hardening v2.1', () => {
  test('14.1 GET_FACE_PROFILES emits raw atob()-compatible standard Base64 on wire while keeping v2: formula-safe storage in Google Sheets + SW auto-reload', async () => {
    const bio = await vite.ssrLoadModule('/src/services/faceRecognitionV2.ts');
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    const mainSrc = fs.readFileSync(path.resolve('src/main.tsx'), 'utf8');

    // Build a vector pack whose standard Base64 starts with '+'
    const rawPack = new Int8Array(5 * 512);
    const floatVecs: Float32Array[] = [];
    for (let k = 0; k < 5; k++) {
      const v = new Float32Array(512);
      v[0] = -6 / 127;
      v[1] = 1.0;
      v[2] = 0.5;
      for (let i = 3; i < 512; i++) v[i] = Math.sin((i + 1) * (k + 2)) * 0.25;
      for (let i = 0; i < 512; i++) {
        rawPack[k * 512 + i] = Math.max(-127, Math.min(127, Math.round(v[i] * 127)));
      }
      floatVecs.push(bio.l2Normalize(v));
    }
    const safeV2Pack: string = bio.quantizeVectorsToInt8B64(floatVecs);
    assert.equal(safeV2Pack.startsWith('v2:'), true);

    // 1. GAS: Sheet cell stores 'v2:...' (no #ERROR!), while GET_FACE_PROFILES emits standard Base64 decodable by raw atob()!
    const gas = createGasV2Sandbox(
      {
        DATA: [
          ['Bảng người dùng'],
          ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
          ['nongvanhao', 'hash', 'Nông Văn Hào', '', 'hao@kg.vn', 'user', 'Phục vụ', '', 'active'],
        ],
        CONFIG_FACE_ID: [
          ['Username', 'Fullname', 'VectorsInt8B64', 'AnglesCount', 'ModelVersion', 'SampleImageUrl', 'EnrolledAt', 'UpdatedBy', 'IsLocked'],
        ],
      },
      '2026-11-03T17:45:00+07:00'
    );

    const enrollGas = gas.callDoPost({
      action: 'ENROLL_FACE_PROFILE',
      username: 'nongvanhao',
      fullname: 'Nông Văn Hào',
      vectorsB64: safeV2Pack,
      anglesCount: 5,
    });
    assert.equal(enrollGas.ok, true);
    const sheetStoredVec = String(gas.sheetsData['CONFIG_FACE_ID'][1][2]);
    assert.equal(sheetStoredVec.startsWith('v2:'), true, 'Google Sheet Col C must still store formula-safe v2: string');

    const gasProfRes = gas.callDoPost({
      action: 'GET_FACE_PROFILES',
      isKiosk: true,
      preloadOnly: true,
    });
    assert.equal(gasProfRes.ok, true);
    const gasWireB64 = String(gasProfRes.data.profiles[0].vectorsB64);
    assert.equal(gasWireB64.startsWith('v2:'), false, 'GET_FACE_PROFILES JSON must NOT emit v2: prefix that crashes un-reloaded atob() clients');
    assert.match(gasWireB64, /^[A-Za-z0-9+/]+=*$/, 'GET_FACE_PROFILES wire vectorsB64 must be pure standard Base64');
    const rawAtobGas = atob(gasWireB64);
    assert.equal(rawAtobGas.length, 2560, 'Legacy pre-17:34 client raw atob() must decode 2560 bytes cleanly');

    // 2. Edge D1: D1 row holds 'v2:...', while GET_FACE_PROFILES emits standard Base64 decodable by BOTH raw atob() and new bio decoder!
    const mock = createEdgeFaceD1Mock();
    mock.faceProfiles.set('nongvanhao', {
      username: 'nongvanhao',
      fullname: 'Nông Văn Hào',
      role: 'user',
      position: 'Phục vụ',
      avatar_url: '',
      employment_status: 'active',
      model_version: 'w600k_mbf_int8_v2',
      angle_count: 5,
      vectors_b64: safeV2Pack,
      centroid_b64: bio.quantizeVectorsToInt8B64([floatVecs[0]]),
      quality_score: 0.9,
      is_locked: 1,
      enrolled_at: '02/11/2026 21:17',
      enrolled_by: 'nongvanhao',
      unlocked_by: '',
      updated_at: Date.now(),
    });

    const edgeRes = await edgeMod.onRequest({
      request: new Request('https://kg-checkin.pages.dev/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'GET_FACE_PROFILES', isKiosk: true, preloadOnly: true, fastEdge: true }),
      }),
      env: { DB: mock.db, SESSION_SECRET: 'test-wire-compat' },
      waitUntil: () => {},
    });
    const edgeJson = await edgeRes.json();
    assert.equal(edgeJson.ok, true);
    const edgeWireB64 = String(edgeJson.data.profiles[0].vectorsB64);
    assert.equal(edgeWireB64.startsWith('v2:'), false, 'Edge GET_FACE_PROFILES must emit standard Base64 compatible with old open PWAs');
    assert.match(edgeWireB64, /^[A-Za-z0-9+/]+=*$/);
    assert.equal(atob(edgeWireB64).length, 2560);
    const decodedNew = bio.decodeInt8B64ToVectors(edgeWireB64);
    assert.equal(decodedNew.length, 5);
    assert.ok(bio.cosineSimilarity(decodedNew[0], floatVecs[0]) > 0.999);

    // 3. src/main.tsx must bypass HTTP cache for /sw.js and reload open tabs on controllerchange
    assert.ok(mainSrc.includes("updateViaCache: 'none'"), 'main.tsx must register /sw.js with updateViaCache: none');
    assert.ok(mainSrc.includes('controllerchange'), 'main.tsx must listen to controllerchange so background PWAs auto-refresh');
  });

  test('14.2 Frame landmark detection never latches preferDirectVideoDetect on empty initial frames', () => {
    const faceSrc = fs.readFileSync(path.resolve('src/services/faceRecognitionV2.ts'), 'utf8');
    assert.equal(
      faceSrc.includes('preferDirectVideoDetect = true'),
      false,
      'faceRecognitionV2.ts must NEVER permanently latch preferDirectVideoDetect = true and desync <video> landmarks from frameSnapCanvas crop'
    );
  });

  test('14.3 Scale-invariant 3D liveness & pure linear primary chwRgb with monotonic multi-scale/gamma fallbacks', async () => {
    const bio = await vite.ssrLoadModule('/src/services/faceRecognitionV2.ts');
    const faceSrc = fs.readFileSync(path.resolve('src/services/faceRecognitionV2.ts'), 'utf8');
    const scannerSrc = fs.readFileSync(path.resolve('src/components/FastFaceScannerV2.tsx'), 'utf8');

    // 1. Real 3D face at arm's length / laptop webcam (faceWidthRatio = 0.14, raw noseProtrusionZ = 0.0024 < 0.0035)
    //    under indoor evening LEDs where MiniFASNet liveScore = 0.02 -> MUST pass liveness!
    const armLengthLive = bio.evaluateHybridLiveness(
      { liveScore: 0.02, printSpoofScore: 0.04, replaySpoofScore: 0.94 },
      0.0024,
      0.14
    );
    assert.equal(armLengthLive.isLive, true, 'Real 3D face at 55cm / webcam (relative depth 0.017) must pass liveness');

    // 2. Flat 2D screen spoof at close range (faceWidthRatio = 0.28, noseProtrusionZ = 0.0004) -> MUST fail liveness!
    const flatScreenSpoof = bio.evaluateHybridLiveness(
      { liveScore: 0.01, printSpoofScore: 0.05, replaySpoofScore: 0.94 },
      0.0004,
      0.28
    );
    assert.equal(flatScreenSpoof.isLive, false, 'Flat 2D screen spoof must still be rejected');

    // 3. Multi-scale ArcFace target points helper preserves (56, 56) center while scaling context for cross-lens perspective
    assert.equal(typeof bio.scaleArcFaceDst5Pts, 'function', 'Must export scaleArcFaceDst5Pts');
    const widePts = bio.scaleArcFaceDst5Pts(0.92);
    assert.equal(widePts.length, 5);
    const origSpan = bio.ARCFACE_DST_5PTS[1][0] - bio.ARCFACE_DST_5PTS[0][0];
    const wideSpan = widePts[1][0] - widePts[0][0];
    assert.ok(Math.abs(wideSpan / origSpan - 0.92) < 1e-4, '0.92x target landmarks must contract inter-ocular span by 8% to capture wider face context');

    // 4. Primary chwRgb must NOT overwrite standard linear (c - 127.5) / 127.5; gammaChwRgb & wideChwRgb must be fallback candidates
    assert.ok(faceSrc.includes('gammaChwRgb'), 'faceRecognitionV2.ts must expose gammaChwRgb separately without mutating primary linear chwRgb');
    assert.ok(faceSrc.includes('wideChwRgb'), 'faceRecognitionV2.ts must expose wideChwRgb for cross-lens perspective matching');
    assert.ok(scannerSrc.includes('frame.wideChwRgb'), 'FastFaceScannerV2.tsx must evaluate wideChwRgb fallback candidate');
    assert.ok(scannerSrc.includes('frame.gammaChwRgb'), 'FastFaceScannerV2.tsx must evaluate gammaChwRgb fallback candidate');
  });

  test('14.4 Kiosk Mode allows authorized test accounts (testapp/admin) to verify recognition away from 25m while enforcing strict GPS for staff', () => {
    const scannerSrc = fs.readFileSync(path.resolve('src/components/FastFaceScannerV2.tsx'), 'utf8');
    assert.ok(
      scannerSrc.includes('isAuthorizedTestUser(match.profile)'),
      'FastFaceScannerV2.tsx must allow recognized authorized test profile (testapp/admin) to complete Kiosk test punch'
    );
  });
});

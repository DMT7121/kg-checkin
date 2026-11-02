import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const GAS_COMPANION_SCRIPT =
  'G:/04_HR_Attendance_And_Payroll/GAS BẢNG CHẤM CÔNG/scripts/sync-kg-checkin-gas.mjs';

if (!fs.existsSync(GAS_COMPANION_SCRIPT)) {
  console.error(`ERROR: Companion sync script not found at ${GAS_COMPANION_SCRIPT}`);
  process.exit(1);
}

execFileSync(process.execPath, [GAS_COMPANION_SCRIPT, ...process.argv.slice(2)], {
  cwd: path.dirname(path.dirname(GAS_COMPANION_SCRIPT)),
  stdio: 'inherit',
});

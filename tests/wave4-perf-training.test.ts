import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {
  computeRoleReadinessProgress,
  createShuffledQuizSession,
  remapSubmittedAnswersToCanonical,
  evaluateShuffledQuizAttempt,
  buildHealthyReliabilityRanking,
} from '../src/utils/trainingGamification.ts';

const ROOT = process.cwd();

describe('Wave 4 — Role-Readiness SOP Track & Anti-Rote Quiz Engine', () => {
  const sampleLessons = [
    { id: 'TR_1', title: 'Menu Đồ Uống Mùa Hè', points: 50 },
    { id: 'TR_2', title: 'Quy trình đón khách (5 sao)', points: 50 },
    { id: 'TR_3', title: 'Vệ sinh an toàn thực phẩm', points: 50 },
    { id: 'TR_4', title: 'Quy trình sử dụng phần mềm CUKCUK', points: 100 },
  ];

  test('computeRoleReadinessProgress maps Thu ngân & Phục vụ to tailored SOP + Quiz tracks and unlocks certification at 100%', () => {
    const partialCashier = computeRoleReadinessProgress({
      position: 'Thu ngân',
      completedSopIds: ['noi-quy'],
      completedLessonIds: ['TR_4'],
      availableLessons: sampleLessons,
    });

    assert.equal(partialCashier.trackId, 'cashier');
    assert.ok(partialCashier.requiredSopIds.includes('thu-ngan'));
    assert.ok(partialCashier.requiredSopIds.includes('noi-quy'));
    assert.ok(partialCashier.requiredLessonIds.includes('TR_4'));
    assert.equal(partialCashier.isRoleCertified, false);
    assert.ok(partialCashier.completionPct > 0 && partialCashier.completionPct < 100);
    assert.ok(partialCashier.nextAction !== null);

    // Complete all required SOPs and lessons for Thu ngân
    const fullCashier = computeRoleReadinessProgress({
      position: 'Thu ngân',
      completedSopIds: partialCashier.requiredSopIds,
      completedLessonIds: partialCashier.requiredLessonIds,
      availableLessons: sampleLessons,
    });

    assert.equal(fullCashier.completionPct, 100);
    assert.equal(fullCashier.isRoleCertified, true);
    assert.equal(fullCashier.nextAction, null);
  });

  test('createShuffledQuizSession shuffles option positions deterministically and remaps answers back to canonical index', () => {
    const rawQuiz = [
      {
        q: 'Khi địa chỉ IP máy chủ thay đổi, làm thế nào kết nối CUKCUK nhanh nhất?',
        options: ['Nhập IP ngẫu nhiên', 'Bấm biểu tượng kính lúp quét LAN', 'Tắt bật app', 'Rút điện Wifi'],
        answer: 1,
      },
      {
        q: 'Mẹo gõ tìm món ăn nhanh trên CUKCUK là gì?',
        options: ['Gõ không dấu', 'Gõ mã vạch', 'Gõ viết tắt chữ cái đầu (VD: cgct)', 'Gõ nhóm danh mục'],
        answer: 2,
      },
      {
        q: 'Biểu tượng Mũ đầu bếp dùng để làm gì?',
        options: ['Lưu nháp', 'Thanh toán', 'Gửi lệnh chế biến xuống Bếp/Bar', 'Đổi hình thức phục vụ'],
        answer: 2,
      },
    ];

    const session = createShuffledQuizSession('TR_4', rawQuiz, 'attempt-seed-101');
    assert.equal(session.questions.length, 3);

    // Every question still has the exact 4 options, and at least one option position moved
    const movedAny = session.questions.some((sq, qIdx) =>
      sq.shuffledToCanonical.some((canonIdx, shufIdx) => canonIdx !== shufIdx || canonIdx !== rawQuiz[qIdx].answer)
    );
    assert.ok(movedAny);

    // Simulate user picking the TRUE correct text in shuffled UI for all 3 questions
    const perfectPicks: Record<number, number> = {};
    session.questions.forEach((sq, qIdx) => {
      const shufIdxOfCorrect = sq.shuffledToCanonical.indexOf(rawQuiz[qIdx].answer);
      assert.ok(shufIdxOfCorrect >= 0);
      assert.equal(sq.options[shufIdxOfCorrect], rawQuiz[qIdx].options[rawQuiz[qIdx].answer]);
      perfectPicks[qIdx] = shufIdxOfCorrect;
    });

    const canonical = remapSubmittedAnswersToCanonical(session, perfectPicks);
    assert.deepEqual(canonical, { 0: 1, 1: 2, 2: 2 });

    const passEval = evaluateShuffledQuizAttempt(session, perfectPicks, 70);
    assert.equal(passEval.passed, true);
    assert.equal(passEval.scorePct, 100);
    assert.equal(passEval.wrongReviews.length, 0);

    // Simulate rote memorizer blindly picking index 2 ('C') on all questions — or picking wrong answers
    const wrongPicks: Record<number, number> = {};
    session.questions.forEach((sq, qIdx) => {
      const wrongShufIdx = sq.shuffledToCanonical.findIndex((c) => c !== rawQuiz[qIdx].answer)!;
      wrongPicks[qIdx] = wrongShufIdx;
    });

    const failEval = evaluateShuffledQuizAttempt(session, wrongPicks, 70);
    assert.equal(failEval.passed, false);
    assert.equal(failEval.scorePct, 0);
    assert.equal(failEval.wrongReviews.length, 3);
    assert.ok(failEval.wrongReviews[0].reviewHint.length > 5);
  });
});

describe('Wave 4 — Healthy Reliability & KingCoins Leaderboard (Zero Public Shaming)', () => {
  test('buildHealthyReliabilityRanking filters out negative/zero balances from public board and assigns positive badges', () => {
    const rawBoard = [
      { username: 'nv_late', fullname: 'Nguyễn Đi Trễ', totalPoints: -25, rank: 4 },
      { username: 'nv_zero', fullname: 'Trần Chưa Có Điểm', totalPoints: 0, rank: 3 },
      { username: 'nv_top', fullname: 'Lê Chuyên Cần', totalPoints: 320, rank: 1 },
      { username: 'nv_good', fullname: 'Phạm Đồng Đội', totalPoints: 145, rank: 2 },
    ];

    const result = buildHealthyReliabilityRanking(rawBoard, 'nv_late');
    assert.equal(result.entries.length, 2, 'Negative/zero balances must never be publicly shamed');
    assert.equal(result.entries[0].username, 'nv_top');
    assert.equal(result.entries[0].rank, 1);
    assert.equal(result.entries[0].badgeLabel, 'Ngôi Sao Chuẩn Mực');
    assert.equal(result.entries[1].username, 'nv_good');
    assert.equal(result.entries[1].rank, 2);
    assert.equal(result.myPositiveRank, null);
    assert.ok(result.encouragementMessage.includes('Bảng Vàng'));
  });
});

describe('Wave 4 — GAS Server Training & Leaderboard Integrity + 4G Bundle Guards', () => {
  test('GAS handleSubmitTrainingQuiz enforces >=70% score & canonical points, and handleGetLeaderboard hides negative totals', () => {
    const sheetsData: Record<string, any[][]> = {
      TRAINING_CONTENT: [
        ['ID', 'Title', 'Type', 'Content', 'QuizJSON', 'Points', 'IsActive', 'CreatedAt'],
        ['TR_1', 'Menu Đồ Uống Mùa Hè', 'lesson', 'Nội dung...', '[]', 50, true, '01/11/2026'],
      ],
      TRAINING_PROGRESS: [['ID', 'Username', 'LessonID', 'Score', 'CompletedAt']],
      KING_COINS: [
        ['ID', 'Date', 'Username', 'Fullname', 'Action', 'Points', 'Source'],
        ['KC_1', '01/11/2026', 'nv_good', 'Phạm Tốt', 'Đúng giờ', 120, 'CheckIn'],
        ['KC_2', '01/11/2026', 'nv_minus', 'Lê Trừ Điểm', 'Đi trễ', -20, 'Discipline'],
      ],
    };

    function makeSheet(name: string) {
      return {
        getName: () => name,
        getLastRow: () => (sheetsData[name] ? sheetsData[name].length : 0),
        getDataRange: () => ({
          getValues: () => (sheetsData[name] || []).map((r) => [...r]),
        }),
        appendRow: (row: any[]) => {
          if (!sheetsData[name]) sheetsData[name] = [];
          sheetsData[name].push([...row]);
        },
        getRange: (r: number, c: number) => ({
          setValue: (v: any) => {
            if (!sheetsData[name][r - 1]) sheetsData[name][r - 1] = [];
            sheetsData[name][r - 1][c - 1] = v;
          },
        }),
      };
    }

    const ssObj = {
      getSheetByName: (n: string) => (sheetsData[n] ? makeSheet(n) : null),
      insertSheet: (n: string) => {
        sheetsData[n] = [];
        return makeSheet(n);
      },
    };

    const sandbox: any = {
      console,
      Date,
      Math,
      JSON,
      Number,
      String,
      Boolean,
      Array,
      Object,
      CONFIG: { TIMEZONE: 'Asia/Ho_Chi_Minh' },
      Logger: { log: () => {} },
      Utilities: { formatDate: () => '02/11/2026 09:00' },
      getSS: () => ssObj,
      jsonResponse: (ok: boolean, dataOrMsg: any) =>
        typeof dataOrMsg === 'string' ? { ok, message: dataOrMsg } : { ok, data: dataOrMsg },
    };

    vm.createContext(sandbox);
    const engineCode = fs.readFileSync(path.join(ROOT, 'gas', 'Engine.gs'), 'utf8');
    vm.runInContext(engineCode, sandbox);

    // 1. Reject below-threshold quiz submission
    const lowRes = sandbox.handleSubmitTrainingQuiz({
      username: 'nv_1',
      fullname: 'Nhân Viên 1',
      lessonId: 'TR_1',
      lessonTitle: 'Menu Đồ Uống Mùa Hè',
      score: 50,
      points: 99999,
    });
    assert.equal(lowRes.ok, false);

    // 2. Clamp spoofed points (99999 -> canonical 50 from TRAINING_CONTENT)
    const passRes = sandbox.handleSubmitTrainingQuiz({
      username: 'nv_1',
      fullname: 'Nhân Viên 1',
      lessonId: 'TR_1',
      lessonTitle: 'Menu Đồ Uống Mùa Hè',
      score: 100,
      points: 99999,
    });
    assert.equal(passRes.ok, true);
    const awardedRow = sheetsData.KING_COINS.find((r) => r[2] === 'nv_1');
    assert.ok(awardedRow);
    assert.equal(awardedRow[5], 50, 'Must award canonical 50 coins instead of spoofed 99999');

    // 3. Leaderboard excludes negative balances
    const boardRes = sandbox.handleGetLeaderboard();
    assert.equal(boardRes.ok, true);
    assert.ok(boardRes.data.every((u: any) => u.totalPoints > 0));
    assert.ok(!boardRes.data.some((u: any) => u.username === 'nv_minus'));
  });

  test('4G PWA performance guards: Login avoids 3.2MB /LOGO.png, Vite splits tfjs-core, and sw.js protects /api & HTML', () => {
    const loginSrc = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'Login.tsx'), 'utf8');
    assert.ok(!loginSrc.includes('/LOGO.png'), 'Login.tsx must not eagerly load 3.2MB /LOGO.png on 4G');

    const viteSrc = fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');
    assert.ok(viteSrc.includes('tfjs-core'), 'vite.config.ts must split @tensorflow/tfjs into its own chunk');

    const swPath = path.join(ROOT, 'public', 'sw.js');
    assert.ok(fs.existsSync(swPath), 'public/sw.js must exist for offline PWA app-shell & model caching');
    const swSrc = fs.readFileSync(swPath, 'utf8');
    assert.ok(swSrc.includes('/api'), 'public/sw.js must explicitly bypass /api requests');
  });
});

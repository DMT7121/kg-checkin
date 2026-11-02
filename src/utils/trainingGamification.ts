export interface TrainingQuizQuestionInput {
  q: string;
  options: string[];
  answer: number;
}

export interface ShuffledQuizQuestion {
  questionIndex: number;
  q: string;
  options: string[];
  /** Maps shuffled option index -> original canonical option index */
  shuffledToCanonical: number[];
  canonicalAnswer: number;
}

export interface ShuffledQuizSession {
  lessonId: string;
  seed: string;
  questions: ShuffledQuizQuestion[];
}

export interface QuizWrongReview {
  questionNumber: number;
  questionText: string;
  pickedOptionText: string;
  reviewHint: string;
}

export interface QuizEvaluationResult {
  correctCount: number;
  totalQuestions: number;
  scorePct: number;
  passed: boolean;
  canonicalAnswers: Record<number, number>;
  wrongReviews: QuizWrongReview[];
}

export interface AvailableLessonSummary {
  id: string;
  title: string;
  points?: number;
}

export interface RoleReadinessNextAction {
  kind: 'sop' | 'quiz';
  targetId: string;
  label: string;
}

export interface RoleReadinessProgress {
  trackId: 'service' | 'cashier' | 'bar' | 'kitchen' | 'support' | 'management' | 'general';
  trackTitle: string;
  badgeLabel: string;
  unlockedPermissionsSummary: string;
  requiredSopIds: string[];
  completedSopIds: string[];
  requiredLessonIds: string[];
  completedLessonIds: string[];
  totalMilestones: number;
  completedMilestones: number;
  completionPct: number;
  isRoleCertified: boolean;
  nextAction: RoleReadinessNextAction | null;
}

export interface RawLeaderboardEntry {
  username: string;
  fullname: string;
  totalPoints: number;
  rank?: number;
}

export interface HealthyLeaderboardEntry {
  username: string;
  fullname: string;
  totalPoints: number;
  rank: number;
  badgeLabel: 'Ngôi Sao Chuẩn Mực' | 'Đồng Đội Tin Cậy' | 'Chuyên Cần Tích Cực';
}

export interface HealthyLeaderboardResult {
  entries: HealthyLeaderboardEntry[];
  myPositiveRank: number | null;
  encouragementMessage: string;
}

const SOP_TITLES_BY_ID: Record<string, string> = {
  welcome: 'Giới Thiệu Sổ Tay',
  'noi-quy': 'Nội Quy Nhà Hàng & PCCC',
  'triet-ly': 'Triết Lý & Tác Phong Chung',
  'tieu-chuan': 'Tiêu Chuẩn Năng Lực',
  'ky-thuat': 'Kỹ Thuật & Liên Kết',
  'phuc-vu': 'Phục Vụ (Tổng Quan)',
  'qtpv-chi-tiet': 'Quy Trình Phục Vụ 5 Bước',
  'tiep-thuc': 'Tiếp Thực',
  bep: 'Nghiệp Vụ Bếp & VSATTP',
  'pha-che': 'Pha Chế & Kho Nước',
  'thu-ngan': 'Nghiệp Vụ Thu Ngân & Đối Soát Két',
  'bao-ve': 'Bảo Vệ & An Ninh',
  'tap-vu': 'Tạp Vụ & Vệ Sinh Khu Vực',
};

function normalizeFoldedText(value?: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function hashSeed(seedText: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createSeededPrng(seedText: string): () => number {
  let state = hashSeed(seedText) || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function computeRoleReadinessProgress(params: {
  position?: string;
  completedSopIds: Iterable<string>;
  completedLessonIds: Iterable<string>;
  availableLessons: AvailableLessonSummary[];
}): RoleReadinessProgress {
  const pos = normalizeFoldedText(params.position);

  let trackId: RoleReadinessProgress['trackId'] = 'general';
  let trackTitle = 'Lộ trình Chuẩn Vận Hành Nhà Hàng';
  let badgeLabel = 'Chứng chỉ Chuẩn Vận Hành';
  let unlockedPermissionsSummary = 'Đủ điều kiện nhận ca độc lập & tham gia đổi ca linh hoạt';
  let requiredSopIds = ['noi-quy', 'triet-ly', 'tieu-chuan'];
  let preferredLessonPrefixes = ['TR_2', 'TR_3'];

  if (pos.includes('thu ngan') || pos.includes('cashier')) {
    trackId = 'cashier';
    trackTitle = 'Lộ trình Mở khóa Thu Ngân & Đối Soát Két';
    badgeLabel = 'Chứng chỉ Thu Ngân Chuẩn Mực';
    unlockedPermissionsSummary = 'Mở khóa chuẩn nghiệp vụ Đứng quầy POS CUKCUK & Bàn giao Két tiền mặt 2 chiều';
    requiredSopIds = ['noi-quy', 'triet-ly', 'thu-ngan'];
    preferredLessonPrefixes = ['TR_2', 'TR_3', 'TR_4'];
  } else if (pos.includes('pha che') || pos.includes('bar')) {
    trackId = 'bar';
    trackTitle = 'Lộ trình Mở khóa Pha Chế & Kiểm Kho Nước';
    badgeLabel = 'Chứng chỉ Barista / Pha Chế Chuẩn';
    unlockedPermissionsSummary = 'Mở khóa chuẩn nghiệp vụ Pha chế định lượng chuẩn & Kiểm soát kho quầy Bar';
    requiredSopIds = ['noi-quy', 'triet-ly', 'pha-che'];
    preferredLessonPrefixes = ['TR_1', 'TR_3', 'TR_4'];
  } else if (pos.includes('bep') || pos.includes('kitchen')) {
    trackId = 'kitchen';
    trackTitle = 'Lộ trình Mở khóa Bếp & An Toàn Thực Phẩm';
    badgeLabel = 'Chứng chỉ Bếp & VSATTP';
    unlockedPermissionsSummary = 'Mở khóa chuẩn nghiệp vụ Vận hành Bếp, Báo Sold-out & An toàn Vệ sinh Thực phẩm';
    requiredSopIds = ['noi-quy', 'triet-ly', 'bep'];
    preferredLessonPrefixes = ['TR_3'];
  } else if (pos.includes('phuc vu') || pos.includes('tiep thuc') || pos.includes('le tan')) {
    trackId = 'service';
    trackTitle = 'Lộ trình Mở khóa Phục Vụ 5 Sao & Order POS';
    badgeLabel = 'Chứng chỉ Đại Sứ Phục Vụ 5 Sao';
    unlockedPermissionsSummary = 'Mở khóa chuẩn nghiệp vụ Đón khách 3 giây, Order CUKCUK & Xử lý tình huống tại bàn';
    requiredSopIds = ['noi-quy', 'triet-ly', 'phuc-vu', 'qtpv-chi-tiet'];
    preferredLessonPrefixes = ['TR_2', 'TR_3', 'TR_4'];
  } else if (pos.includes('tap vu') || pos.includes('bao ve')) {
    trackId = 'support';
    trackTitle = 'Lộ trình Mở khóa An Ninh & Vệ Sinh Chuẩn';
    badgeLabel = 'Chứng chỉ Hậu Cần Tin Cậy';
    unlockedPermissionsSummary = 'Mở khóa chuẩn nghiệp vụ PCCC, An ninh tài sản & Checklist vệ sinh ca';
    requiredSopIds = pos.includes('bao ve')
      ? ['noi-quy', 'triet-ly', 'bao-ve']
      : ['noi-quy', 'triet-ly', 'tap-vu'];
    preferredLessonPrefixes = ['TR_3'];
  } else if (pos.includes('quan ly') || pos.includes('ca truong') || pos.includes('giam sat')) {
    trackId = 'management';
    trackTitle = 'Lộ trình Mở khóa Quản Lý Ca & Điều Phối';
    badgeLabel = 'Chứng chỉ Chỉ Huy Ca Trực';
    unlockedPermissionsSummary = 'Mở khóa toàn bộ quy trình Duyệt két, Xử lý sự cố & Chốt công lương 4 bước';
    requiredSopIds = ['noi-quy', 'tieu-chuan', 'qtpv-chi-tiet', 'thu-ngan'];
    preferredLessonPrefixes = ['TR_1', 'TR_2', 'TR_3', 'TR_4'];
  }

  const availableIds = new Set(params.availableLessons.map((l) => l.id));
  let requiredLessonIds = preferredLessonPrefixes.filter((id) => availableIds.has(id));
  if (requiredLessonIds.length === 0 && params.availableLessons.length > 0) {
    requiredLessonIds = params.availableLessons.map((l) => l.id);
  }

  const doneSopSet = new Set(Array.from(params.completedSopIds));
  const doneLessonSet = new Set(Array.from(params.completedLessonIds));

  const completedSopIds = requiredSopIds.filter((id) => doneSopSet.has(id));
  const completedLessonIds = requiredLessonIds.filter((id) => doneLessonSet.has(id));

  const totalMilestones = requiredSopIds.length + requiredLessonIds.length;
  const completedMilestones = completedSopIds.length + completedLessonIds.length;
  const completionPct =
    totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 100;
  const isRoleCertified = totalMilestones > 0 ? completedMilestones >= totalMilestones : true;

  let nextAction: RoleReadinessNextAction | null = null;
  const missingSop = requiredSopIds.find((id) => !doneSopSet.has(id));
  if (missingSop) {
    nextAction = {
      kind: 'sop',
      targetId: missingSop,
      label: `Đọc & xác nhận SOP: ${SOP_TITLES_BY_ID[missingSop] || missingSop}`,
    };
  } else {
    const missingLessonId = requiredLessonIds.find((id) => !doneLessonSet.has(id));
    if (missingLessonId) {
      const lessonTitle =
        params.availableLessons.find((l) => l.id === missingLessonId)?.title || missingLessonId;
      nextAction = {
        kind: 'quiz',
        targetId: missingLessonId,
        label: `Hoàn thành bài kiểm tra: ${lessonTitle}`,
      };
    }
  }

  return {
    trackId,
    trackTitle,
    badgeLabel,
    unlockedPermissionsSummary,
    requiredSopIds,
    completedSopIds,
    requiredLessonIds,
    completedLessonIds,
    totalMilestones,
    completedMilestones,
    completionPct,
    isRoleCertified,
    nextAction,
  };
}

export function createShuffledQuizSession(
  lessonId: string,
  quiz: TrainingQuizQuestionInput[],
  seed = 'default-seed'
): ShuffledQuizSession {
  const rand = createSeededPrng(`${lessonId}::${seed}`);

  const questions: ShuffledQuizQuestion[] = quiz.map((q, qIdx) => {
    const indices = q.options.map((_, idx) => idx);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = indices[i];
      indices[i] = indices[j];
      indices[j] = tmp;
    }

    // Prevent trivial unchanged permutation so rote position memorization is defeated
    if (
      indices.length >= 2 &&
      indices.every((val, idx) => val === idx)
    ) {
      const swapIdx = (qIdx + 1) % indices.length;
      const tmp = indices[0];
      indices[0] = indices[swapIdx];
      indices[swapIdx] = tmp;
    }

    return {
      questionIndex: qIdx,
      q: q.q,
      options: indices.map((canonIdx) => q.options[canonIdx]),
      shuffledToCanonical: indices,
      canonicalAnswer: q.answer,
    };
  });

  return {
    lessonId,
    seed,
    questions,
  };
}

export function remapSubmittedAnswersToCanonical(
  session: ShuffledQuizSession,
  pickedShuffledAnswers: Record<number, number>
): Record<number, number> {
  const canonical: Record<number, number> = {};
  session.questions.forEach((sq, qIdx) => {
    const picked = pickedShuffledAnswers[qIdx];
    if (typeof picked === 'number' && picked >= 0 && picked < sq.shuffledToCanonical.length) {
      canonical[qIdx] = sq.shuffledToCanonical[picked];
    }
  });
  return canonical;
}

export function evaluateShuffledQuizAttempt(
  session: ShuffledQuizSession,
  pickedShuffledAnswers: Record<number, number>,
  passThresholdPct = 70
): QuizEvaluationResult {
  const canonicalAnswers = remapSubmittedAnswersToCanonical(session, pickedShuffledAnswers);
  const totalQuestions = session.questions.length;
  let correctCount = 0;
  const wrongReviews: QuizWrongReview[] = [];

  session.questions.forEach((sq, qIdx) => {
    const pickedShuf = pickedShuffledAnswers[qIdx];
    const pickedCanon = canonicalAnswers[qIdx];
    if (pickedCanon === sq.canonicalAnswer) {
      correctCount++;
    } else {
      const pickedText =
        typeof pickedShuf === 'number' && sq.options[pickedShuf]
          ? sq.options[pickedShuf]
          : 'Chưa chọn đáp án';
      wrongReviews.push({
        questionNumber: qIdx + 1,
        questionText: sq.q,
        pickedOptionText: pickedText,
        reviewHint:
          'Hãy đối chiếu lại thông số định lượng / thao tác chuẩn trong nội dung bài học ở trên trước khi thử lượt mới (vị trí đáp án sẽ tự động đảo lại).',
      });
    }
  });

  const scorePct = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 100;
  return {
    correctCount,
    totalQuestions,
    scorePct,
    passed: scorePct >= passThresholdPct,
    canonicalAnswers,
    wrongReviews,
  };
}

export function buildHealthyReliabilityRanking(
  rawEntries: RawLeaderboardEntry[],
  currentUsername?: string
): HealthyLeaderboardResult {
  const normalizedMe = String(currentUsername || '').trim().toLowerCase();

  const positiveFiltered = (Array.isArray(rawEntries) ? rawEntries : [])
    .map((entry) => ({
      username: String(entry.username || '').trim(),
      fullname: String(entry.fullname || entry.username || '').trim(),
      totalPoints: Math.round(Number(entry.totalPoints) || 0),
    }))
    .filter((entry) => entry.username.length > 0 && entry.totalPoints > 0)
    .sort(
      (a, b) =>
        b.totalPoints - a.totalPoints || a.fullname.localeCompare(b.fullname, 'vi')
    );

  const entries: HealthyLeaderboardEntry[] = positiveFiltered.map((entry, idx) => {
    const rank = idx + 1;
    const badgeLabel: HealthyLeaderboardEntry['badgeLabel'] =
      entry.totalPoints >= 250 || rank === 1
        ? 'Ngôi Sao Chuẩn Mực'
        : entry.totalPoints >= 100 || rank <= 3
          ? 'Đồng Đội Tin Cậy'
          : 'Chuyên Cần Tích Cực';
    return {
      username: entry.username,
      fullname: entry.fullname,
      totalPoints: entry.totalPoints,
      rank,
      badgeLabel,
    };
  });

  const myEntry = normalizedMe
    ? entries.find((e) => e.username.toLowerCase() === normalizedMe)
    : undefined;

  const myPositiveRank = myEntry ? myEntry.rank : null;
  const encouragementMessage = myEntry
    ? `Bạn đang đứng Hạng #${myEntry.rank} trên Bảng Vàng với danh hiệu "${myEntry.badgeLabel}". Tiếp tục duy trì ca trực đúng giờ và checklist chuẩn nhé!`
    : 'Hoàn thành 1 ca trực đúng giờ, 1 checklist khu vực hoặc 1 bài kiểm tra SOP để ghi danh lên Bảng Vàng Chuyên Cần!';

  return {
    entries,
    myPositiveRank,
    encouragementMessage,
  };
}

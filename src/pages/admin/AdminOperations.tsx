import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  Inbox,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Star,
  Trash2,
  UsersRound,
} from 'lucide-react';
import {
  KgBottomSheet,
  KgButton,
  KgErrorState,
  KgInput,
  KgModuleHero,
  KgSkeleton,
  KgTextarea,
} from '../../components/KgDesignSystem';
import { callApi } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { kgConfirm, kgToast } from '../../store/useFeedbackStore';
import type {
  OperationAssignment,
  OperationEvaluation,
  OperationsConfig,
  OperationTaskLog,
  OperationTeam,
} from '../../types/operations';
import {
  emptyOperationsConfig,
  formatOperationDate,
  normalizeOperationsConfig,
  operationScore,
  todayIso,
} from '../../types/operations';
import { isWorkEligible } from '../../utils/employment';
import { navigateToHubSubTab } from '../../utils/hubNavigation';
import { isAdminUser } from '../../utils/permissions';

type DispatchSection = 'teams' | 'assignments' | 'evaluations';

const teamColors = ['#0e7490', '#7c3aed', '#059669', '#ea580c', '#db2777', '#2563eb'];
const newId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const clampScore = (value: number) => Math.min(5, Math.max(1, Number(value) || 3));

export default function AdminOperations() {
  const currentUser = useAppStore((state) => state.currentUser);
  if (!isAdminUser(currentUser)) return null;
  return <AdminOperationsContent />;
}

function AdminOperationsContent() {
  const currentUser = useAppStore((state) => state.currentUser);
  const users = useAppStore((state) => state.users);

  const [config, setConfig] = useState<OperationsConfig>(emptyOperationsConfig);
  const [taskLogs, setTaskLogs] = useState<OperationTaskLog[]>([]);
  const [section, setSection] = useState<DispatchSection>('teams');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [prevSelectedTeamId, setPrevSelectedTeamId] = useState(selectedTeamId);
  if (prevSelectedTeamId !== selectedTeamId) {
    setPrevSelectedTeamId(selectedTeamId);
    setMemberSearchQuery('');
  }
  const [evalSearchQuery, setEvalSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [assignmentDraft, setAssignmentDraft] = useState({
    date: todayIso(),
    teamId: '',
    zoneId: '',
    shift: 'Cả ngày',
    note: '',
  });
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [modalError, setModalError] = useState('');
  const [teamDraft, setTeamDraft] = useState({ name: '', description: '' });

  const employees = useMemo(
    () => users.filter((user) => user.username && user.role !== 'admin' && isWorkEligible(user)),
    [users],
  );

  const loadData = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    setLoadError('');
    try {
      const res = await callApi(
        'GET_OPERATIONS_CONFIG',
        {
          role: currentUser.role,
          username: currentUser.username,
          forceRefresh: true,
        },
        { background: true, cacheTtlMs: 0, timeoutMs: 35000 },
      );
      if (res?.ok) {
        const next = normalizeOperationsConfig(res.data?.config);
        setConfig(next);
        setTaskLogs(Array.isArray(res.data?.taskLogs) ? res.data.taskLogs : []);
        setSelectedTeamId((current) => current || next.teams?.[0]?.id || '');
        setAssignmentDraft((current) => ({
          ...current,
          teamId: current.teamId || next.teams?.[0]?.id || '',
          zoneId: current.zoneId || next.zones?.[0]?.id || '',
        }));
        setDirty(false);
      } else {
        setLoadError(res?.message || 'Không thể tải cấu hình vận hành từ máy chủ.');
      }
    } catch {
      setLoadError('Mất kết nối khi tải dữ liệu điều phối vận hành.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const patchConfig = (updater: (current: OperationsConfig) => OperationsConfig) => {
    setConfig((current) => updater(current));
    setDirty(true);
  };

  const saveConfig = async () => {
    if (!currentUser) return;
    setSaving(true);
    try {
      const res = await callApi('UPDATE_OPERATIONS_CONFIG', {
        role: currentUser.role,
        username: currentUser.username,
        config,
      });
      if (!res) return;
      if (!res.ok) {
        kgToast(res.message || 'Vui lòng thử lại.', 'error', 'Không thể lưu');
        return;
      }
      setConfig(res.data.config);
      setDirty(false);
      kgToast('Cấu hình vận hành đã được cập nhật lên Spreadsheet.', 'success', 'Đã lưu phân công');
    } finally {
      setSaving(false);
    }
  };

  const createTeam = () => {
    setTeamDraft({ name: '', description: '' });
    setModalError('');
    setIsTeamModalOpen(true);
  };

  const submitCreateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    const name = teamDraft.name.trim();
    const description = teamDraft.description.trim();
    if (!name) {
      setModalError('Vui lòng nhập tên nhóm');
      return;
    }
    const team: OperationTeam = {
      id: newId('TEAM'),
      name,
      description,
      color: teamColors[config.teams.length % teamColors.length],
      leaderUsername: '',
      memberUsernames: [],
    };
    patchConfig((current) => ({ ...current, teams: [...current.teams, team] }));
    setSelectedTeamId(team.id);
    setAssignmentDraft((current) => ({ ...current, teamId: current.teamId || team.id }));
    setSection('teams');
    setIsTeamModalOpen(false);
  };

  const toggleMember = (teamId: string, username: string) => {
    patchConfig((current) => ({
      ...current,
      teams: current.teams.map((team) => {
        if (team.id !== teamId) {
          return {
            ...team,
            memberUsernames: team.memberUsernames.filter((value) => value !== username),
          };
        }
        const exists = team.memberUsernames.includes(username);
        return {
          ...team,
          memberUsernames: exists
            ? team.memberUsernames.filter((value) => value !== username)
            : [...team.memberUsernames, username],
        };
      }),
    }));
  };

  const setTeamLeader = (teamId: string, username: string) => {
    patchConfig((current) => ({
      ...current,
      teams: current.teams.map((team) =>
        team.id === teamId
          ? {
              ...team,
              leaderUsername: username,
              memberUsernames:
                username && !team.memberUsernames.includes(username)
                  ? [...team.memberUsernames, username]
                  : team.memberUsernames,
            }
          : team,
      ),
    }));
  };

  const removeTeam = async (team: OperationTeam) => {
    const confirmed = await kgConfirm({
      title: `Xóa ${team.name}?`,
      message: 'Các phân công liên quan tới nhóm này cũng sẽ bị xóa.',
      confirmLabel: 'Xóa nhóm',
      cancelLabel: 'Hủy',
      tone: 'danger',
    });
    if (!confirmed) return;
    patchConfig((current) => ({
      ...current,
      teams: current.teams.filter((item) => item.id !== team.id),
      assignments: current.assignments.filter((item) => item.teamId !== team.id),
    }));
    setSelectedTeamId(config.teams.find((item) => item.id !== team.id)?.id || '');
  };

  const addAssignment = () => {
    if (!assignmentDraft.date || !assignmentDraft.teamId || !assignmentDraft.zoneId) {
      kgToast('Vui lòng chọn ngày, nhóm trực và khu trực.', 'warning', 'Thiếu thông tin');
      return;
    }
    const duplicate = config.assignments.some(
      (item) =>
        item.date === assignmentDraft.date &&
        item.teamId === assignmentDraft.teamId &&
        item.zoneId === assignmentDraft.zoneId &&
        item.shift === assignmentDraft.shift,
    );
    if (duplicate) {
      kgToast('Nhóm này đã được xếp vào khu trực trong cùng ca.', 'info', 'Phân công đã tồn tại');
      return;
    }
    const assignment: OperationAssignment = {
      id: newId('ASSIGN'),
      ...assignmentDraft,
      note: assignmentDraft.note.trim(),
    };
    patchConfig((current) => ({ ...current, assignments: [...current.assignments, assignment] }));
    setAssignmentDraft((current) => ({ ...current, note: '' }));
  };

  const updateEvaluation = (
    username: string,
    field: keyof OperationEvaluation,
    value: number | string,
  ) => {
    patchConfig((current) => {
      const existing = current.evaluations.find((item) => item.username === username);
      const base: OperationEvaluation = existing || {
        username,
        service: 3,
        speed: 3,
        teamwork: 3,
        reliability: 3,
        leadership: 3,
        note: '',
        updatedAt: '',
      };
      const next = {
        ...base,
        [field]: typeof value === 'number' ? clampScore(value) : value,
        updatedAt: new Date().toLocaleString('vi-VN'),
      };
      return {
        ...current,
        evaluations: [
          ...current.evaluations.filter((item) => item.username !== username),
          next,
        ],
      };
    });
  };

  const autoBalanceTeams = async () => {
    if (config.teams.length < 2 || !employees.length) {
      kgToast('Cần ít nhất 2 nhóm và danh sách nhân viên.', 'info', 'Chưa đủ dữ liệu');
      return;
    }
    const confirmed = await kgConfirm({
      title: 'Tự động cân bằng đội hình?',
      message: 'Hệ thống sẽ dùng điểm năng lực, quy mô nhóm và giữ nguyên nhóm trưởng.',
      confirmLabel: 'Cân bằng ngay',
      cancelLabel: 'Hủy',
      tone: 'primary',
    });
    if (!confirmed) return;

    const leaders = new Set(config.teams.map((team) => team.leaderUsername).filter(Boolean));
    const ranked = employees
      .filter((employee) => !leaders.has(employee.username))
      .sort((a, b) => {
        const evalA = config.evaluations.find((item) => item.username === a.username);
        const evalB = config.evaluations.find((item) => item.username === b.username);
        return operationScore(evalB) - operationScore(evalA);
      });
    const buckets = config.teams.map((team) => {
      const leader = employees.find((employee) => employee.username === team.leaderUsername);
      const leaderEvaluation = config.evaluations.find(
        (item) => item.username === team.leaderUsername,
      );
      return {
        team,
        members: leader ? [leader.username] : [],
        total: leader ? operationScore(leaderEvaluation) : 0,
      };
    });
    ranked.forEach((employee) => {
      const evaluation = config.evaluations.find((item) => item.username === employee.username);
      const target = [...buckets].sort(
        (a, b) => a.members.length - b.members.length || a.total - b.total,
      )[0];
      target.members.push(employee.username);
      target.total += operationScore(evaluation);
    });
    patchConfig((current) => ({
      ...current,
      teams: current.teams.map((team) => ({
        ...team,
        memberUsernames: buckets.find((bucket) => bucket.team.id === team.id)?.members || [],
      })),
    }));
    setSection('teams');
    kgToast('Hãy kiểm tra đội hình rồi nhấn “Lưu cấu hình”.', 'success', 'Đã cân bằng tạm thời');
  };

  const selectedTeam = config.teams.find((team) => team.id === selectedTeamId);
  const upcomingAssignments = useMemo(() => {
    const today = todayIso();
    return [...config.assignments]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((item) => item.date >= today);
  }, [config.assignments]);

  const assignedOnOtherTeams = useMemo(() => {
    const set = new Set<string>();
    config.teams.forEach((team) => {
      if (team.id !== selectedTeamId) {
        team.memberUsernames.forEach((username) => set.add(username));
      }
    });
    return set;
  }, [config.teams, selectedTeamId]);

  const filterByMemberSearch = useCallback(
    (employee: (typeof employees)[number]) => {
      if (!memberSearchQuery.trim()) return true;
      const query = memberSearchQuery.toLowerCase().trim();
      return (
        employee.fullname.toLowerCase().includes(query) ||
        (employee.position || '').toLowerCase().includes(query) ||
        employee.username.toLowerCase().includes(query)
      );
    },
    [memberSearchQuery],
  );

  const filteredCurrentTeamEmployees = useMemo(
    () =>
      employees.filter(
        (employee) =>
          selectedTeam?.memberUsernames.includes(employee.username) &&
          filterByMemberSearch(employee),
      ),
    [employees, selectedTeam?.memberUsernames, filterByMemberSearch],
  );

  const filteredUnassignedEmployees = useMemo(
    () =>
      employees.filter(
        (employee) =>
          !selectedTeam?.memberUsernames.includes(employee.username) &&
          !assignedOnOtherTeams.has(employee.username) &&
          filterByMemberSearch(employee),
      ),
    [employees, selectedTeam?.memberUsernames, assignedOnOtherTeams, filterByMemberSearch],
  );

  const filteredOtherTeamEmployees = useMemo(
    () =>
      employees.filter(
        (employee) => assignedOnOtherTeams.has(employee.username) && filterByMemberSearch(employee),
      ),
    [employees, assignedOnOtherTeams, filterByMemberSearch],
  );

  const filteredEvalEmployees = useMemo(() => {
    if (!evalSearchQuery.trim()) return employees;
    const query = evalSearchQuery.toLowerCase().trim();
    return employees.filter(
      (employee) =>
        employee.fullname.toLowerCase().includes(query) ||
        (employee.position || '').toLowerCase().includes(query) ||
        employee.username.toLowerCase().includes(query),
    );
  }, [employees, evalSearchQuery]);

  const getSuggestedZoneId = useCallback(
    (teamId: string, dateStr: string) => {
      if (!teamId || !dateStr) return '';
      const prevAssignments = config.assignments
        .filter((a) => a.teamId === teamId && a.date < dateStr)
        .sort((a, b) => b.date.localeCompare(a.date));
      if (prevAssignments.length === 0) return 'A';
      const lastZoneId = prevAssignments[0].zoneId;
      const rotation = ['A', 'B', 'C', 'D&E'];
      const lastIdx = rotation.indexOf(lastZoneId);
      if (lastIdx === -1) return 'A';
      return rotation[(lastIdx + 1) % rotation.length];
    },
    [config.assignments],
  );

  useEffect(() => {
    if (assignmentDraft.teamId && assignmentDraft.date) {
      const suggested = getSuggestedZoneId(assignmentDraft.teamId, assignmentDraft.date);
      if (suggested && suggested !== assignmentDraft.zoneId) {
        const timer = setTimeout(() => {
          setAssignmentDraft((current) => ({ ...current, zoneId: suggested }));
        }, 0);
        return () => clearTimeout(timer);
      }
    }
  }, [assignmentDraft.teamId, assignmentDraft.date, assignmentDraft.zoneId, getSuggestedZoneId]);

  const autoRotateAllAssignments = () => {
    if (!assignmentDraft.date) {
      kgToast('Vui lòng chọn ngày trước.', 'warning', 'Chú ý');
      return;
    }
    const newAssignments: OperationAssignment[] = [];
    config.teams.forEach((team) => {
      const isAssigned = config.assignments.some(
        (a) =>
          a.date === assignmentDraft.date &&
          a.teamId === team.id &&
          a.shift === assignmentDraft.shift,
      );
      if (isAssigned) return;
      const suggestedZone = getSuggestedZoneId(team.id, assignmentDraft.date);
      if (suggestedZone) {
        newAssignments.push({
          id: newId('ASSIGN'),
          date: assignmentDraft.date,
          teamId: team.id,
          zoneId: suggestedZone,
          shift: assignmentDraft.shift,
          note: 'Xoay ca tự động',
        });
      }
    });
    if (newAssignments.length === 0) {
      kgToast('Tất cả các nhóm đã được phân công trong ca này.', 'info', 'Thông báo');
      return;
    }
    patchConfig((current) => ({
      ...current,
      assignments: [...current.assignments, ...newAssignments],
    }));
    kgToast(
      `Đã tự động xếp khu trực cho ${newAssignments.length} nhóm theo quy tắc xoay vòng ca.`,
      'success',
      'Thành công',
    );
  };

  const teamMetrics = useMemo(
    () =>
      config.teams.map((team) => {
        const scores = team.memberUsernames.map((username) =>
          operationScore(config.evaluations.find((item) => item.username === username)),
        );
        return {
          team,
          size: team.memberUsernames.length,
          average: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0,
        };
      }),
    [config.teams, config.evaluations],
  );

  const scoreGap = useMemo(() => {
    const activeAverages = teamMetrics.filter((item) => item.size).map((item) => item.average);
    return activeAverages.length ? Math.max(...activeAverages) - Math.min(...activeAverages) : 0;
  }, [teamMetrics]);

  const navItems: Array<{ id: DispatchSection; label: string; icon: typeof UsersRound; badge?: number }> = [
    { id: 'teams', label: 'Nhóm trực', icon: UsersRound, badge: config.teams.length },
    { id: 'assignments', label: 'Phân công khu', icon: CalendarPlus, badge: upcomingAssignments.length },
    { id: 'evaluations', label: 'Năng lực NV', icon: Star },
  ];

  return (
    <div className="p-4 md:px-0 md:pt-1 space-y-4 animate-fade-in pb-28 md:pb-12 max-w-6xl mx-auto">
      <KgModuleHero
        moduleId="admin-operations"
        title="Điều Phối Đội Hình & Khu Trực"
        description="Chia nhóm trực, xoay vòng khu vực A/B/C/D&E tự động và đánh giá năng lực cân bằng ca."
        eyebrow="Điều hành"
        actions={
          <button
            type="button"
            onClick={() => void autoBalanceTeams()}
            className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shadow-xs whitespace-nowrap"
          >
            <Sparkles size={14} className="shrink-0" /> Tự cân bằng đội
          </button>
        }
      />

      {/* Compact 1-Tap Banner to AdminApprovalInbox for Cash Audit & Incidents */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-xs">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-xl bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] flex items-center justify-center shrink-0">
            <Inbox size={17} />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-extrabold text-[var(--kg-text)] leading-snug sm:truncate">
              Đối soát Két 2 chiều &amp; Trung tâm Sự cố đã chuyển sang Hộp duyệt
            </p>
            <p className="text-[11px] text-[var(--kg-text-muted)] leading-snug line-clamp-2 sm:line-clamp-1">
              Duyệt chốt két, duyệt ca khớp 1 chạm và cập nhật sự cố 4 bước ngay tại Hộp duyệt.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigateToHubSubTab('admin_ops', 'inbox')}
          className="w-full sm:w-auto min-h-[44px] sm:min-h-[36px] px-3.5 py-2 rounded-xl bg-[var(--kg-primary-soft)] hover:opacity-90 text-[var(--kg-primary-ink)] text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap"
        >
          <span>Mở Hộp duyệt</span>
          <ArrowRight size={14} className="shrink-0" />
        </button>
      </div>

      {/* Clean 3-Tab Dispatch Switcher */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-1.5 shadow-xs">
        <div className="grid grid-cols-3 gap-1.5" role="tablist" aria-label="Phân mục điều phối">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSection(item.id)}
                className={`min-w-0 min-h-[44px] sm:min-h-[38px] flex items-center justify-center gap-1.5 rounded-xl px-2 sm:px-3 py-2 text-xs font-extrabold transition-colors ${
                  active
                    ? 'bg-[var(--kg-primary)] text-white shadow-xs'
                    : 'text-[var(--kg-text-muted)] hover:bg-[var(--kg-surface-soft)] hover:text-[var(--kg-text)]'
                }`}
              >
                <Icon size={15} className="shrink-0" />
                <span className="truncate">{item.label}</span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span
                    className={`hidden sm:inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-black ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {loadError && (
        <KgErrorState
          title="Không thể tải cấu hình điều phối"
          description={loadError}
          onRetry={() => void loadData()}
        />
      )}

      {loading ? (
        <div className="space-y-3">
          <KgSkeleton className="h-24 w-full" />
          <KgSkeleton className="h-44 w-full" />
        </div>
      ) : (
        <>
          {section === 'teams' && (
            <div className="space-y-4">
              {/* Compact Team Balance Indicator */}
              {config.teams.length > 0 && (
                <div
                  className={`rounded-2xl border p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs ${
                    scoreGap > 1
                      ? 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold">
                    {scoreGap > 1 ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                    <span>
                      {scoreGap > 1
                        ? `Đội hình đang chênh lệch (${scoreGap.toFixed(1)}/5 điểm)`
                        : `Năng lực các nhóm cân bằng (chênh ${scoreGap.toFixed(1)}/5 điểm)`}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums text-[11px]">
                    {teamMetrics.map((m) => (
                      <span
                        key={m.team.id}
                        className="px-2 py-0.5 rounded-lg bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[var(--kg-text)]"
                      >
                        {m.team.name}: {m.size} NV · {m.average.toFixed(1)}★
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 shadow-xs">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-extrabold text-[var(--kg-text)] text-sm">Nhóm trực</h3>
                    <button
                      type="button"
                      onClick={createTeam}
                      aria-label="Tạo nhóm trực mới"
                      title="Tạo nhóm trực mới"
                      className="min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] rounded-xl bg-[var(--kg-primary-soft)] hover:opacity-90 border border-[var(--kg-primary)]/20 text-[var(--kg-primary-ink)] inline-flex items-center justify-center shrink-0"
                    >
                      <Plus size={17} />
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {config.teams.map((team) => (
                      <button
                        type="button"
                        key={team.id}
                        onClick={() => setSelectedTeamId(team.id)}
                        className={`w-full rounded-xl border p-3 text-left transition-colors ${
                          selectedTeamId === team.id
                            ? 'border-[var(--kg-primary)] bg-[var(--kg-primary-soft)]'
                            : 'border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full shrink-0"
                            style={{ backgroundColor: team.color }}
                          />
                          <span className="truncate text-sm font-extrabold text-[var(--kg-text)]">
                            {team.name}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)]">
                          {team.memberUsernames.length} thành viên
                        </p>
                      </button>
                    ))}
                    {config.teams.length === 0 && (
                      <button
                        type="button"
                        onClick={createTeam}
                        className="w-full min-h-[44px] rounded-xl border border-dashed border-[var(--kg-border-strong)] py-6 text-xs font-bold text-[var(--kg-primary-ink)]"
                      >
                        + Tạo nhóm trực đầu tiên
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-5 shadow-xs">
                  {selectedTeam ? (
                    <>
                      <div className="flex items-start justify-between gap-3 border-b border-[var(--kg-border)] pb-4">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-lg font-black text-[var(--kg-text)] truncate">
                            {selectedTeam.name}
                          </h3>
                          <p className="mt-0.5 text-xs text-[var(--kg-text-muted)]">
                            {selectedTeam.description || 'Chưa có mô tả nhóm'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void removeTeam(selectedTeam)}
                          aria-label={`Xóa nhóm ${selectedTeam.name}`}
                          title={`Xóa nhóm ${selectedTeam.name}`}
                          className="min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] rounded-xl text-rose-500 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 inline-flex items-center justify-center shrink-0"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>

                      <label className="mt-4 block">
                        <span className="mb-1.5 block text-[11px] font-bold uppercase text-[var(--kg-text-muted)]">
                          Nhóm trưởng / người theo dõi
                        </span>
                        <select
                          value={selectedTeam.leaderUsername}
                          onChange={(event) => setTeamLeader(selectedTeam.id, event.target.value)}
                          className="w-full min-h-[44px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] px-3 py-2 text-base sm:text-sm font-bold text-[var(--kg-text)]"
                        >
                          <option value="">Chưa chọn nhóm trưởng</option>
                          {employees
                            .filter(
                              (employee) =>
                                !assignedOnOtherTeams.has(employee.username) ||
                                employee.username === selectedTeam.leaderUsername,
                            )
                            .map((employee) => (
                              <option key={employee.username} value={employee.username}>
                                {employee.fullname} · {employee.position || 'Nhân viên'}
                              </option>
                            ))}
                        </select>
                      </label>

                      <div className="mt-5">
                        <p className="text-[11px] font-bold uppercase text-[var(--kg-text-muted)] mb-2">
                          Thành viên nhóm
                        </p>
                        <input
                          type="text"
                          placeholder="Tìm nhân viên theo tên hoặc bộ phận..."
                          value={memberSearchQuery}
                          onChange={(e) => setMemberSearchQuery(e.target.value)}
                          className="mb-3 w-full min-h-[44px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] px-3 py-2 text-base sm:text-sm text-[var(--kg-text)]"
                        />
                        <div className="space-y-4">
                          <div>
                            <p className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400 mb-2">
                              Thành viên hiện tại ({filteredCurrentTeamEmployees.length})
                            </p>
                            {filteredCurrentTeamEmployees.length > 0 ? (
                              <div className="grid gap-2 sm:grid-cols-2">
                                {filteredCurrentTeamEmployees.map((employee) => {
                                  const evaluation = config.evaluations.find(
                                    (item) => item.username === employee.username,
                                  );
                                  return (
                                    <button
                                      type="button"
                                      key={employee.username}
                                      onClick={() => toggleMember(selectedTeam.id, employee.username)}
                                      className="min-h-[48px] flex items-center gap-3 rounded-xl border border-[var(--kg-primary)] bg-[var(--kg-primary-soft)] p-3 text-left transition-colors"
                                    >
                                      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--kg-primary)] text-white shrink-0">
                                        <CheckCircle2 size={14} />
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-xs font-extrabold text-[var(--kg-text)]">
                                          {employee.fullname}
                                        </span>
                                        <span className="block truncate text-[10px] text-[var(--kg-text-muted)]">
                                          {employee.position || 'Nhân viên'} ·{' '}
                                          {operationScore(evaluation).toFixed(1)}/5
                                        </span>
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-xs text-[var(--kg-text-muted)] italic py-1">
                                Chưa có thành viên nào trong nhóm này
                              </p>
                            )}
                          </div>

                          <div className="border-t border-[var(--kg-border)] pt-4">
                            <p className="text-[10px] font-bold uppercase text-[var(--kg-text-muted)] mb-2">
                              Nhân sự chưa phân nhóm ({filteredUnassignedEmployees.length})
                            </p>
                            {filteredUnassignedEmployees.length > 0 ? (
                              <div className="grid gap-2 sm:grid-cols-2">
                                {filteredUnassignedEmployees.map((employee) => {
                                  const evaluation = config.evaluations.find(
                                    (item) => item.username === employee.username,
                                  );
                                  return (
                                    <button
                                      type="button"
                                      key={employee.username}
                                      onClick={() => toggleMember(selectedTeam.id, employee.username)}
                                      className="min-h-[48px] flex items-center gap-3 rounded-xl border border-[var(--kg-border)] hover:border-[var(--kg-primary)] p-3 text-left transition-colors"
                                    >
                                      <span className="h-5 w-5 rounded-md border border-[var(--kg-border-strong)] bg-[var(--kg-surface)] shrink-0" />
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-xs font-extrabold text-[var(--kg-text)]">
                                          {employee.fullname}
                                        </span>
                                        <span className="block truncate text-[10px] text-[var(--kg-text-muted)]">
                                          {employee.position || 'Nhân viên'} ·{' '}
                                          {operationScore(evaluation).toFixed(1)}/5
                                        </span>
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-xs text-[var(--kg-text-muted)] italic py-1">
                                Tất cả nhân sự đã được chia nhóm
                              </p>
                            )}
                          </div>

                          {filteredOtherTeamEmployees.length > 0 && (
                            <div className="border-t border-[var(--kg-border)] pt-4">
                              <p className="text-[10px] font-bold uppercase text-rose-600 dark:text-rose-400 mb-2">
                                Thành viên ở nhóm khác ({filteredOtherTeamEmployees.length}) — chạm để chuyển
                              </p>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {filteredOtherTeamEmployees.map((employee) => {
                                  const evaluation = config.evaluations.find(
                                    (item) => item.username === employee.username,
                                  );
                                  const otherTeam = config.teams.find(
                                    (t) =>
                                      t.id !== selectedTeamId &&
                                      t.memberUsernames.includes(employee.username),
                                  );
                                  return (
                                    <button
                                      type="button"
                                      key={employee.username}
                                      onClick={() => toggleMember(selectedTeam.id, employee.username)}
                                      className="min-h-[48px] flex items-center gap-3 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)]/50 p-3 text-left opacity-75 hover:opacity-100 hover:border-[var(--kg-primary)] transition-all"
                                    >
                                      <span className="h-5 w-5 rounded-md border border-[var(--kg-border-strong)] bg-[var(--kg-surface)] shrink-0" />
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-xs font-extrabold text-[var(--kg-text)]">
                                          {employee.fullname}
                                        </span>
                                        <span className="block truncate text-[10px] text-[var(--kg-text-muted)]">
                                          {employee.position || 'Nhân viên'} ·{' '}
                                          {operationScore(evaluation).toFixed(1)}/5
                                        </span>
                                        <span className="mt-0.5 inline-block text-[9px] font-bold text-[var(--kg-primary-ink)]">
                                          Đang ở: {otherTeam?.name || 'Nhóm khác'}
                                        </span>
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="py-16 text-center text-[var(--kg-text-muted)]">
                      <UsersRound className="mx-auto" size={32} />
                      <p className="mt-3 text-sm font-bold">Chọn hoặc tạo một nhóm trực</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {section === 'assignments' && (
            <div className="space-y-4">
              <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-5 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--kg-border)] pb-3 mb-4">
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-[var(--kg-text)] text-sm sm:text-base">
                      Tạo phân công theo ngày
                    </h3>
                    <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5">
                      Xoay vòng khu trực tự động A ➔ B ➔ C ➔ D&amp;E ({config.zones.length} khu,{' '}
                      {config.tasks.length} công việc đồng bộ từ Checklist)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={autoRotateAllAssignments}
                    className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] px-4 py-2 text-xs font-bold text-white shadow-xs whitespace-nowrap shrink-0"
                  >
                    <Sparkles size={14} className="shrink-0" /> Tự động xoay ca tất cả nhóm
                  </button>
                </div>
                <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <input
                    type="date"
                    value={assignmentDraft.date}
                    onChange={(event) =>
                      setAssignmentDraft((current) => ({ ...current, date: event.target.value }))
                    }
                    className="w-full min-h-[44px] sm:min-h-[40px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] px-3 py-2 text-base sm:text-sm font-bold font-mono text-[var(--kg-text)]"
                  />
                  <select
                    value={assignmentDraft.teamId}
                    onChange={(event) =>
                      setAssignmentDraft((current) => ({ ...current, teamId: event.target.value }))
                    }
                    className="w-full min-h-[44px] sm:min-h-[40px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] px-3 py-2 text-base sm:text-sm font-bold text-[var(--kg-text)]"
                  >
                    <option value="">Chọn nhóm trực</option>
                    {config.teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={assignmentDraft.zoneId}
                    onChange={(event) =>
                      setAssignmentDraft((current) => ({ ...current, zoneId: event.target.value }))
                    }
                    className="w-full min-h-[44px] sm:min-h-[40px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] px-3 py-2 text-base sm:text-sm font-bold text-[var(--kg-text)]"
                  >
                    <option value="">Chọn khu trực</option>
                    {config.zones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={assignmentDraft.shift}
                    onChange={(event) =>
                      setAssignmentDraft((current) => ({ ...current, shift: event.target.value }))
                    }
                    className="w-full min-h-[44px] sm:min-h-[40px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] px-3 py-2 text-base sm:text-sm font-bold text-[var(--kg-text)]"
                  >
                    <option>Cả ngày</option>
                    <option>Ca sáng</option>
                    <option>Ca chiều</option>
                    <option>Ca tối</option>
                  </select>
                  <button
                    type="button"
                    onClick={addAssignment}
                    className="sm:col-span-2 lg:col-span-1 min-h-[44px] sm:min-h-[40px] inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] px-4 py-2 text-sm font-extrabold text-white shadow-xs whitespace-nowrap"
                  >
                    <CalendarPlus size={16} className="shrink-0" /> Phân công
                  </button>
                </div>
                <input
                  value={assignmentDraft.note}
                  onChange={(event) =>
                    setAssignmentDraft((current) => ({ ...current, note: event.target.value }))
                  }
                  placeholder="Ghi chú vận hành, yêu cầu đặc biệt..."
                  className="mt-3 w-full min-h-[44px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] px-3 py-2 text-base sm:text-sm text-[var(--kg-text)]"
                />
              </div>

              <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-5 shadow-xs">
                <h3 className="font-extrabold text-[var(--kg-text)] text-sm sm:text-base">
                  Lịch phân công sắp tới
                </h3>
                <div className="mt-4 space-y-3">
                  {upcomingAssignments.map((assignment) => {
                    const team = config.teams.find((item) => item.id === assignment.teamId);
                    const zone = config.zones.find((item) => item.id === assignment.zoneId);
                    const totalTasks = config.tasks.filter(
                      (task) => task.zoneId === assignment.zoneId,
                    ).length;
                    const completedTasks = new Set(
                      taskLogs
                        .filter((log) => log.assignmentId === assignment.id)
                        .map((log) => log.taskId),
                    ).size;
                    return (
                      <div
                        key={assignment.id}
                        className="grid gap-3 rounded-2xl border border-[var(--kg-border)] p-4 md:grid-cols-[130px_1fr_1fr_auto] md:items-center"
                      >
                        <div>
                          <p className="text-sm font-black font-mono tabular-nums text-[var(--kg-text)]">
                            {formatOperationDate(assignment.date)}
                          </p>
                          <p className="mt-0.5 text-[11px] font-bold text-[var(--kg-text-muted)]">
                            {assignment.shift}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-[var(--kg-text-muted)]">
                            Nhóm trực
                          </p>
                          <p className="mt-0.5 text-sm font-extrabold text-[var(--kg-primary-ink)]">
                            {team?.name || 'Nhóm đã xóa'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-[var(--kg-text-muted)]">
                            Khu &amp; tiến độ
                          </p>
                          <p className="mt-0.5 text-sm font-extrabold text-[var(--kg-text)] font-mono tabular-nums">
                            <span className="font-sans">{zone?.name || 'Khu đã xóa'}</span> ·{' '}
                            {completedTasks}/{totalTasks} việc
                          </p>
                        </div>
                        {assignment.isVirtual ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-[var(--kg-primary-ink)] bg-[var(--kg-primary-soft)] px-2.5 py-1 rounded-lg justify-self-end">
                            <Sparkles size={11} /> Tự động
                          </span>
                        ) : (
                          <button
                            type="button"
                            aria-label="Xóa phân công"
                            onClick={() =>
                              patchConfig((current) => ({
                                ...current,
                                assignments: current.assignments.filter(
                                  (item) => item.id !== assignment.id,
                                ),
                              }))
                            }
                            className="justify-self-end min-h-[40px] min-w-[40px] rounded-xl text-[var(--kg-text-muted)] hover:text-rose-500 hover:bg-rose-500/10 inline-flex items-center justify-center"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {!upcomingAssignments.length && (
                    <div className="py-10 text-center text-sm font-bold text-[var(--kg-text-muted)]">
                      Chưa có lịch phân công sắp tới.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {section === 'evaluations' && (
            <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-5 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-extrabold text-[var(--kg-text)] text-sm sm:text-base">
                    Đánh giá &amp; xếp loại nhân sự
                  </h3>
                  <p className="mt-1 text-xs text-[var(--kg-text-muted)]">
                    Thang điểm 1–5 được dùng khi tự động cân bằng nhóm.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                  <input
                    type="text"
                    placeholder="Tìm nhân viên..."
                    value={evalSearchQuery}
                    onChange={(e) => setEvalSearchQuery(e.target.value)}
                    className="w-full sm:w-52 min-h-[44px] sm:min-h-[38px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] px-3 py-2 text-base sm:text-xs text-[var(--kg-text)]"
                  />
                  <button
                    type="button"
                    onClick={() => void autoBalanceTeams()}
                    className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--kg-primary-soft)] px-3.5 py-2 text-xs font-bold text-[var(--kg-primary-ink)] whitespace-nowrap"
                  >
                    <Sparkles size={14} className="shrink-0" /> Xếp đội theo điểm
                  </button>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {[...filteredEvalEmployees]
                  .sort((a, b) => {
                    const aScore = operationScore(
                      config.evaluations.find((item) => item.username === a.username),
                    );
                    const bScore = operationScore(
                      config.evaluations.find((item) => item.username === b.username),
                    );
                    return bScore - aScore;
                  })
                  .map((employee) => {
                    const evaluation = config.evaluations.find(
                      (item) => item.username === employee.username,
                    );
                    const values = evaluation || {
                      username: employee.username,
                      service: 3,
                      speed: 3,
                      teamwork: 3,
                      reliability: 3,
                      leadership: 3,
                      note: '',
                      updatedAt: '',
                    };
                    return (
                      <div
                        key={employee.username}
                        className="rounded-2xl border border-[var(--kg-border)] p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-extrabold text-[var(--kg-text)]">
                              {employee.fullname}
                            </p>
                            <p className="text-[11px] text-[var(--kg-text-muted)]">
                              {employee.position || 'Nhân viên'}
                            </p>
                          </div>
                          <span className="rounded-full bg-amber-500/15 px-3 py-1 text-sm font-black font-mono tabular-nums text-amber-700 dark:text-amber-300">
                            {operationScore(evaluation).toFixed(1)}/5
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                          {(
                            [
                              ['service', 'Nghiệp vụ'],
                              ['speed', 'Tốc độ'],
                              ['teamwork', 'Phối hợp'],
                              ['reliability', 'Ổn định'],
                              ['leadership', 'Dẫn dắt'],
                            ] as const
                          ).map(([field, label], idx) => (
                            <label
                              key={field}
                              className={`rounded-xl bg-[var(--kg-surface-soft)] p-2.5 border border-[var(--kg-border)] ${idx === 4 ? 'col-span-2 sm:col-span-1' : ''}`}
                            >
                              <span className="block text-[10px] font-bold uppercase text-[var(--kg-text-muted)]">
                                {label}
                              </span>
                              <select
                                value={values[field]}
                                onChange={(event) =>
                                  updateEvaluation(
                                    employee.username,
                                    field,
                                    Number(event.target.value),
                                  )
                                }
                                className="mt-1 w-full !min-h-[34px] !border-0 !bg-transparent !px-0 text-base sm:text-sm font-black font-mono text-[var(--kg-text)] outline-none"
                              >
                                {[1, 2, 3, 4, 5].map((score) => (
                                  <option key={score} value={score}>
                                    {score}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ))}
                        </div>
                        <input
                          value={values.note}
                          onChange={(event) =>
                            updateEvaluation(employee.username, 'note', event.target.value)
                          }
                          placeholder="Nhận xét, điểm mạnh, hạn chế hoặc lưu ý khi xếp nhóm..."
                          className="mt-3 w-full min-h-[44px] sm:min-h-[38px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] px-3 py-2 text-base sm:text-xs text-[var(--kg-text)]"
                        />
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Sticky Save Bar — stays centered within the workspace container across all devices */}
      <div className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] md:bottom-4 z-30 mx-auto flex w-full max-w-[720px] items-center gap-2 rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface)]/95 backdrop-blur-sm p-2 shadow-xl">
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="inline-flex h-11 w-11 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl text-[var(--kg-text-muted)] hover:bg-[var(--kg-surface-soft)]"
          title="Tải lại"
          aria-label="Tải lại cấu hình điều phối"
        >
          <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
        </button>
        <div className="min-w-0 flex-1 px-1.5 sm:px-2">
          <p className="truncate text-xs font-extrabold text-[var(--kg-text)]">
            {dirty ? 'Có thay đổi chưa lưu' : 'Cấu hình điều phối đã đồng bộ'}
          </p>
          <p className="truncate text-[10px] font-mono tabular-nums text-[var(--kg-text-muted)]">
            {config.teams.length} nhóm · {config.zones.length} khu · {config.assignments.length} phân công
          </p>
        </div>
        <button
          type="button"
          onClick={() => void saveConfig()}
          disabled={saving || loading || !dirty}
          className="inline-flex h-11 sm:h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] px-4 text-xs font-extrabold text-white shadow-xs disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
        >
          {saving ? <LoaderCircle size={16} className="animate-spin shrink-0" /> : <Save size={16} className="shrink-0" />}
          <span>{saving ? 'Đang lưu' : 'Lưu cấu hình'}</span>
        </button>
      </div>

      {/* Modal: Tạo nhóm trực */}
      <KgBottomSheet
        isOpen={isTeamModalOpen}
        onClose={() => setIsTeamModalOpen(false)}
        title="Tạo nhóm trực"
      >
        <form onSubmit={submitCreateTeam} className="space-y-4">
          <KgInput
            label="Tên nhóm trực *"
            placeholder="Ví dụ: Nhóm A, Tổ Phục vụ Sáng..."
            value={teamDraft.name}
            onChange={(e) => {
              setTeamDraft((prev) => ({ ...prev, name: e.target.value }));
              if (modalError) setModalError('');
            }}
            error={modalError}
            autoFocus
          />
          <KgTextarea
            label="Mô tả phạm vi hoặc thế mạnh"
            placeholder="Mô tả phạm vi phụ trách hoặc thế mạnh của nhóm..."
            value={teamDraft.description}
            onChange={(e) => setTeamDraft((prev) => ({ ...prev, description: e.target.value }))}
          />
          <div className="flex gap-3 pt-2">
            <KgButton
              variant="secondary"
              className="flex-1"
              onClick={() => setIsTeamModalOpen(false)}
            >
              Hủy
            </KgButton>
            <KgButton type="submit" variant="primary" className="flex-1" icon={Plus}>
              Tạo nhóm
            </KgButton>
          </div>
        </form>
      </KgBottomSheet>
    </div>
  );
}

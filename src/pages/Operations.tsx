import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  CalendarDays,
  Check,
  ChevronDown,
  Circle,
  ClipboardCheck,
  ExternalLink,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Sparkles,
  Star,
  UsersRound,
} from 'lucide-react';
import {
  KgButton,
  KgEmptyState,
  KgErrorState,
  KgModuleHero,
  KgSkeleton,
  KgToast,
  type ToastMessage,
} from '../components/KgDesignSystem';
import { callApi } from '../services/api';
import { useAppStore, type User } from '../store/useAppStore';
import type {
  OperationAssignment,
  OperationsConfig,
  OperationTaskLog,
} from '../types/operations';
import { isWorkEligible } from '../utils/employment';
import EmploymentStatusNotice from '../components/EmploymentStatusNotice';
import {
  emptyOperationsConfig,
  formatOperationDate,
  normalizeOperationsConfig,
  operationScore,
  todayIso,
} from '../types/operations';

export default function Operations() {
  const currentUser = useAppStore((state) => state.currentUser);
  const users = useAppStore((state) => state.users);
  const setCurrentTab = useAppStore((state) => state.setCurrentTab);
  const setCurrentUser = useAppStore((state) => state.setCurrentUser);
  const [config, setConfig] = useState<OperationsConfig>(emptyOperationsConfig);
  const [taskLogs, setTaskLogs] = useState<OperationTaskLog[]>([]);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [updatingTaskId, setUpdatingTaskId] = useState('');
  const [expandedId, setExpandedId] = useState('');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((title: string, type: ToastMessage['type']) => {
    setToasts((prev) => [...prev.slice(-2), { id: `${Date.now()}_${Math.random()}`, title, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const openChecklistTab = () => {
    try {
      sessionStorage.setItem('kg_hub_subtab_work', 'checklist');
    } catch {
      // ignore storage errors
    }
    setCurrentTab('work');
    window.dispatchEvent(new CustomEvent('kg:subtab-select', { detail: { hub: 'work', subTab: 'checklist' } }));
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('kg:subtab-select', { detail: { hub: 'work', subTab: 'checklist' } }));
    }, 30);
  };

  const loadData = useCallback(async () => {
    const user = useAppStore.getState().currentUser;
    if (!user) return;
    setLoading(true);
    setLoadError('');
    try {
      const res = await callApi(
        'GET_OPERATIONS_CONFIG',
        {
          role: user.role,
          username: user.username,
          forceRefresh: true,
        },
        { background: true, cacheTtlMs: 0, timeoutMs: 35000 },
      );
      if (res?.ok) {
        if (res.data.employmentProfile) {
          const refreshedUser = { ...user, ...res.data.employmentProfile };
          setCurrentUser(refreshedUser);
          localStorage.setItem('kg_user', JSON.stringify(refreshedUser));
        }
        const normalizedConfig = normalizeOperationsConfig(res.data?.config);
        setConfig(normalizedConfig);
        setTaskLogs(Array.isArray(res.data?.taskLogs) ? res.data.taskLogs : []);
        setTeamMembers(Array.isArray(res.data?.members) ? res.data.members : []);
        const next = [...normalizedConfig.assignments]
          .sort((a: OperationAssignment, b: OperationAssignment) => a.date.localeCompare(b.date))
          .find((assignment: OperationAssignment) => assignment.date >= todayIso());
        setExpandedId((current) => current || next?.id || '');
      } else {
        setLoadError(res?.message || 'Không thể tải dữ liệu phân công trực.');
      }
    } catch {
      setLoadError('Lỗi kết nối máy chủ khi tải lịch phân công trực.');
    } finally {
      setLoading(false);
    }
  }, [setCurrentUser]);

  useEffect(() => {
    const timer = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const assignments = useMemo(
    () =>
      [...config.assignments]
        .filter((assignment) => assignment.date >= todayIso())
        .sort((a, b) => a.date.localeCompare(b.date)),
    [config.assignments],
  );

  const todayAssignments = assignments.filter((assignment) => assignment.date === todayIso());
  const directoryUsers = users.length ? users : teamMembers;
  const myTeam = config.teams.find(
    (team) =>
      currentUser &&
      (team.leaderUsername === currentUser.username || team.memberUsernames.includes(currentUser.username)),
  );
  const myEvaluation = config.evaluations.find((item) => item.username === currentUser?.username);

  const myTodayCompletedCount = useMemo(() => {
    if (!currentUser) return 0;
    const today = todayIso();
    return taskLogs.filter((log) => log.date === today && log.username === currentUser.username).length;
  }, [taskLogs, currentUser]);

  const toggleTask = async (assignment: OperationAssignment, taskId: string, completed: boolean) => {
    if (!currentUser) return;
    setUpdatingTaskId(`${assignment.id}_${taskId}`);
    try {
      const res = await callApi('TOGGLE_OPERATION_TASK', {
        role: currentUser.role,
        username: currentUser.username,
        fullname: currentUser.fullname,
        assignmentId: assignment.id,
        taskId,
        date: assignment.date,
        completed,
      });
      if (!res?.ok) {
        pushToast(res?.message || 'Chưa cập nhật được đầu việc điều phối. Vui lòng thử lại.', 'error');
        return;
      }
      if (completed) {
        setTaskLogs((current) => [
          ...current.filter(
            (log) =>
              !(
                log.assignmentId === assignment.id &&
                log.taskId === taskId &&
                log.username === currentUser.username
              ),
          ),
          {
            id: `${assignment.id}_${taskId}_${currentUser.username}`,
            date: assignment.date,
            assignmentId: assignment.id,
            taskId,
            username: currentUser.username,
            fullname: currentUser.fullname,
            completedAt: res.data.completedAt || 'Vừa xong',
            status: 'Completed',
            note: '',
          },
        ]);
      } else {
        setTaskLogs((current) =>
          current.filter(
            (log) =>
              !(
                log.assignmentId === assignment.id &&
                log.taskId === taskId &&
                log.username === currentUser.username
              ),
          ),
        );
      }
    } catch {
      pushToast('Lỗi kết nối khi cập nhật trạng thái nhiệm vụ.', 'error');
    } finally {
      setUpdatingTaskId('');
    }
  };

  if (!currentUser) return null;

  if (currentUser.role !== 'admin' && !isWorkEligible(currentUser)) {
    return <EmploymentStatusNotice user={currentUser} actionLabel="xem phân công trực và điều phối đội ngũ" />;
  }

  if (currentUser.role === 'admin') {
    return (
      <div className="p-4 space-y-4 animate-slide-up">
        <KgModuleHero
          moduleId="operations"
          title="Phân Ca & Điều Phối Đội Ngũ"
          description="Admin quản lý nhóm trực, khu vực và phân công đội ngũ tại khu vực cấu hình vận hành."
          eyebrow="Vận hành"
        />
        <button
          type="button"
          onClick={() => setCurrentTab('admin_work')}
          className="bg-[var(--kg-surface)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] flex w-full items-center justify-between rounded-2xl p-5 text-left transition-colors shadow-xs min-h-[44px]"
        >
          <span>
            <span className="block font-extrabold text-[var(--kg-text)]">Mở Phân công vận hành</span>
            <span className="mt-1 block text-xs text-[var(--kg-text-muted)]">
              Thiết lập nhóm trực, khu vực điều phối, đầu việc và năng lực đội ngũ.
            </span>
          </span>
          <Sparkles className="text-[var(--kg-primary-ink)]" size={24} />
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 animate-slide-up pb-10">
      <KgModuleHero
        moduleId="operations"
        title="Phân Ca & Điều Phối Đội Ngũ"
        description="Xem nhóm trực, khu vực phụ trách và phân công đồng đội theo ca (thực thi quy trình chi tiết tại Checklist phân khu)."
        eyebrow="Điều phối"
        actions={
          <KgButton
            type="button"
            variant="secondary"
            size="sm"
            icon={ExternalLink}
            onClick={openChecklistTab}
          >
            Checklist phân khu
          </KgButton>
        }
      />

      {loadError ? (
        <KgErrorState title="Không thể tải phân công trực" description={loadError} onRetry={loadData} />
      ) : loading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KgSkeleton className="h-24 w-full" />
            <KgSkeleton className="h-24 w-full" />
            <KgSkeleton className="h-24 w-full" />
            <KgSkeleton className="h-24 w-full" />
          </div>
          <KgSkeleton className="h-36 w-full" />
          <KgSkeleton className="h-36 w-full" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 shadow-xs">
              <CalendarDays className="text-[var(--kg-info)]" size={20} />
              <p className="mt-3 text-2xl font-bold font-mono tabular-nums text-[var(--kg-text)]">
                {todayAssignments.length}
              </p>
              <p className="text-xs font-semibold text-[var(--kg-text-muted)]">Khu trực hôm nay</p>
            </div>
            <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 shadow-xs">
              <UsersRound className="text-[var(--kg-primary-ink)]" size={20} />
              <p className="mt-3 truncate text-lg font-bold text-[var(--kg-text)]">{myTeam?.name || 'Chưa xếp'}</p>
              <p className="text-xs font-semibold text-[var(--kg-text-muted)]">Nhóm của bạn</p>
            </div>
            <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 shadow-xs">
              <ClipboardCheck className="text-[var(--kg-success)]" size={20} />
              <p className="mt-3 text-2xl font-bold font-mono tabular-nums text-[var(--kg-text)]">
                {myTodayCompletedCount}
              </p>
              <p className="text-xs font-semibold text-[var(--kg-text-muted)]">Nhiệm vụ bạn đã xong</p>
            </div>
            <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 shadow-xs">
              <Star className="text-[var(--kg-warning)]" size={20} />
              <p className="mt-3 text-2xl font-bold font-mono tabular-nums text-[var(--kg-text)]">
                {operationScore(myEvaluation).toFixed(1)}
              </p>
              <p className="text-xs font-semibold text-[var(--kg-text-muted)]">Điểm năng lực</p>
            </div>
          </div>

          {myTeam && (
            <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-5 shadow-xs">
              <div className="flex items-center gap-3">
                <span className="h-4 w-4 rounded-full flex-shrink-0" style={{ backgroundColor: myTeam.color }} />
                <div>
                  <h3 className="font-extrabold text-[var(--kg-text)]">{myTeam.name}</h3>
                  <p className="text-xs text-[var(--kg-text-muted)]">{myTeam.description || 'Nhóm trực vận hành'}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {myTeam.memberUsernames.map((username) => {
                  const employee = directoryUsers.find((user) => user.username === username);
                  const isLeader = myTeam.leaderUsername === username;
                  return (
                    <div
                      key={username}
                      className={`rounded-xl border px-3 py-2 ${
                        isLeader
                          ? 'border-[var(--kg-warning)]/40 bg-[var(--kg-warning-soft)]'
                          : 'border-[var(--kg-border)] bg-[var(--kg-surface-soft)]'
                      }`}
                    >
                      <p className="text-xs font-extrabold text-[var(--kg-text)]">
                        {employee?.fullname || username}
                      </p>
                      <p className="mt-0.5 text-[10px] text-[var(--kg-text-muted)]">
                        {isLeader ? 'Nhóm trưởng' : employee?.position || 'Thành viên'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {assignments.map((assignment) => {
              const team = config.teams.find((item) => item.id === assignment.teamId);
              const zone = config.zones.find((item) => item.id === assignment.zoneId);
              const tasks = config.tasks.filter((task) => task.zoneId === assignment.zoneId);
              const completedIds = new Set(
                taskLogs
                  .filter((log) => log.assignmentId === assignment.id && log.username === currentUser.username)
                  .map((log) => log.taskId),
              );
              const expanded = expandedId === assignment.id;
              const isToday = assignment.date === todayIso();
              return (
                <article
                  key={assignment.id}
                  className={`bg-[var(--kg-surface)] border border-[var(--kg-border)] overflow-hidden rounded-2xl shadow-xs ${
                    isToday ? 'ring-2 ring-[var(--kg-info)]/40' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? '' : assignment.id)}
                    className="w-full p-4 sm:p-5 text-left min-h-[44px]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-3">
                        <span
                          className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl ${
                            isToday
                              ? 'bg-[var(--kg-primary)] text-white'
                              : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]'
                          }`}
                        >
                          <MapPin size={21} />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base sm:text-lg font-black text-[var(--kg-text)]">
                              {zone?.name || 'Khu trực'}
                            </h3>
                            {isToday && (
                              <span className="rounded-full bg-[var(--kg-info-soft)] px-2 py-0.5 text-[10px] font-black uppercase text-[var(--kg-info)]">
                                Hôm nay
                              </span>
                            )}
                            {assignment.isVirtual && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--kg-primary-soft)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--kg-primary-ink)]">
                                <Sparkles size={10} /> Tự động
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs font-mono tabular-nums text-[var(--kg-text-muted)]">
                            {formatOperationDate(assignment.date)} · {assignment.shift}
                          </p>
                          <p className="mt-1 text-[11px] font-bold text-[var(--kg-primary-ink)]">
                            {team?.name} ·{' '}
                            <span className="font-mono tabular-nums">
                              {completedIds.size}/{tasks.length}
                            </span>{' '}
                            đầu việc điều phối
                          </p>
                        </div>
                      </div>
                      <ChevronDown
                        className={`mt-2 flex-shrink-0 text-[var(--kg-text-soft)] transition ${
                          expanded ? 'rotate-180' : ''
                        }`}
                        size={19}
                      />
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--kg-surface-soft)]">
                      <div
                        className="h-full rounded-full bg-[var(--kg-success)] transition-all"
                        style={{ width: `${tasks.length ? (completedIds.size / tasks.length) * 100 : 0}%` }}
                      />
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-[var(--kg-border)] p-4 sm:p-5">
                      {assignment.note && (
                        <p className="mb-4 rounded-xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/25 px-3 py-2.5 text-xs font-semibold text-[var(--kg-warning)]">
                          Lưu ý điều phối: {assignment.note}
                        </p>
                      )}

                      {(() => {
                        const memberShifts = assignment.memberShifts || {};
                        const myShift = memberShifts[currentUser.username] || 'OFF';

                        const matchesShiftText = (taskStr: string, timeStr: string) => {
                          const text = taskStr.toLowerCase();
                          if (timeStr === '15:00') {
                            return text.includes('15h') || text.includes('15:00') || text.includes('đầu ca');
                          }
                          if (timeStr === '17:00') {
                            return text.includes('17h') || text.includes('17:00');
                          }
                          if (timeStr === '18:00') {
                            return (
                              text.includes('cuối ca') ||
                              text.includes('18h') ||
                              text.includes('18:00') ||
                              text.includes('cuối')
                            );
                          }
                          return false;
                        };

                        const activeMembersByShift: Record<string, string[]> = {
                          '15:00': [],
                          '17:00': [],
                          '18:00': [],
                        };
                        const allActiveMembers: string[] = [];

                        Object.keys(memberShifts).forEach((username) => {
                          const shiftVal = memberShifts[username];
                          if (shiftVal && shiftVal !== 'OFF') {
                            allActiveMembers.push(username);
                            if (activeMembersByShift[shiftVal]) {
                              activeMembersByShift[shiftVal].push(username);
                            }
                          }
                        });

                        allActiveMembers.sort();
                        Object.keys(activeMembersByShift).forEach((k) => activeMembersByShift[k].sort());

                        const tasks15: typeof tasks = [];
                        const tasks17: typeof tasks = [];
                        const tasks18: typeof tasks = [];
                        const generalTasks: typeof tasks = [];

                        tasks.forEach((task) => {
                          const text = `${task.title} ${task.description} ${task.frequency}`;
                          if (matchesShiftText(text, '15:00')) {
                            tasks15.push(task);
                          } else if (matchesShiftText(text, '17:00')) {
                            tasks17.push(task);
                          } else if (matchesShiftText(text, '18:00')) {
                            tasks18.push(task);
                          } else {
                            generalTasks.push(task);
                          }
                        });

                        const myTasks: typeof tasks = [];
                        const teammateTasks: typeof tasks = [];
                        const unassignedTasks: typeof tasks = [];

                        const distribute = (taskList: typeof tasks, shiftKey: string) => {
                          const shiftMembers = activeMembersByShift[shiftKey] || [];
                          taskList.forEach((task, idx) => {
                            if (shiftMembers.length === 0) {
                              unassignedTasks.push(task);
                            } else {
                              const assignedUsername = shiftMembers[idx % shiftMembers.length];
                              if (assignedUsername === currentUser.username) {
                                myTasks.push(task);
                              } else {
                                const assigneeUser = directoryUsers.find((u) => u.username === assignedUsername);
                                const copy = { ...task } as any;
                                copy.assignedToName = assigneeUser ? assigneeUser.fullname : assignedUsername;
                                teammateTasks.push(copy);
                              }
                            }
                          });
                        };

                        distribute(tasks15, '15:00');
                        distribute(tasks17, '17:00');
                        distribute(tasks18, '18:00');

                        generalTasks.forEach((task, idx) => {
                          if (allActiveMembers.length === 0) {
                            unassignedTasks.push(task);
                          } else {
                            const assignedUsername = allActiveMembers[idx % allActiveMembers.length];
                            if (assignedUsername === currentUser.username) {
                              myTasks.push(task);
                            } else {
                              const assigneeUser = directoryUsers.find((u) => u.username === assignedUsername);
                              const copy = { ...task } as any;
                              copy.assignedToName = assigneeUser ? assigneeUser.fullname : assignedUsername;
                              teammateTasks.push(copy);
                            }
                          }
                        });

                        const renderTaskItem = (task: any, isTeammate: boolean) => {
                          const completed = completedIds.has(task.id);
                          const updating = updatingTaskId === `${assignment.id}_${task.id}`;
                          const assigneeName = task.assignedToName;

                          return (
                            <button
                              type="button"
                              key={task.id}
                              onClick={() => toggleTask(assignment, task.id, !completed)}
                              disabled={updating}
                              className={`flex w-full min-h-[44px] items-start gap-3 rounded-xl border p-3.5 text-left transition touch-manipulation ${
                                completed
                                  ? 'border-[var(--kg-success)]/40 bg-[var(--kg-success-soft)]'
                                  : isTeammate
                                    ? 'border-[var(--kg-border)] bg-[var(--kg-surface-soft)]/60 opacity-80 hover:opacity-100 hover:border-[var(--kg-border-strong)]'
                                    : 'border-[var(--kg-border)] bg-[var(--kg-surface)] hover:border-[var(--kg-primary)]'
                              }`}
                            >
                              <span
                                className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg ${
                                  completed
                                    ? 'bg-[var(--kg-success)] text-white'
                                    : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border border-[var(--kg-border)]'
                                }`}
                              >
                                {updating ? (
                                  <LoaderCircle size={15} className="animate-spin" />
                                ) : completed ? (
                                  <Check size={16} />
                                ) : (
                                  <Circle size={15} />
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span
                                  className={`block text-sm font-extrabold ${
                                    completed
                                      ? 'text-[var(--kg-success)] line-through'
                                      : 'text-[var(--kg-text)]'
                                  }`}
                                >
                                  {task.title}
                                </span>
                                <span className="mt-1 block text-xs leading-5 text-[var(--kg-text-muted)]">
                                  {task.description}
                                </span>
                                <span className="mt-1.5 flex flex-wrap items-center gap-2">
                                  <span className="inline-block text-[10px] font-bold uppercase text-[var(--kg-text-muted)] bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] px-1.5 py-0.5 rounded">
                                    {task.frequency}
                                  </span>
                                  {isTeammate && assigneeName && (
                                    <span className="inline-block text-[10px] font-bold text-[var(--kg-primary-ink)] bg-[var(--kg-primary-soft)] px-2 py-0.5 rounded-full">
                                      Phụ trách: {assigneeName}
                                    </span>
                                  )}
                                </span>
                              </span>
                            </button>
                          );
                        };

                        if (!tasks.length) {
                          return (
                            <div className="py-8 text-center text-xs font-semibold text-[var(--kg-text-muted)]">
                              Khu trực này chưa có đầu việc điều phối riêng. Hãy thực hiện checklist tại tab Checklist phân khu.
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-5">
                            <div>
                              <div className="flex items-center gap-1.5 mb-2.5">
                                <span className="h-2 w-2 rounded-full bg-[var(--kg-info)] animate-pulse" />
                                <p className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--kg-info)]">
                                  Việc điều phối giao cho bạn (
                                  <span className="font-mono tabular-nums">{myTasks.length}</span>) · Ca{' '}
                                  {myShift === 'OFF' ? 'Chưa rõ' : myShift}
                                </p>
                              </div>
                              {myTasks.length > 0 ? (
                                <div className="space-y-2">{myTasks.map((t) => renderTaskItem(t, false))}</div>
                              ) : (
                                <p className="text-xs text-[var(--kg-text-muted)] bg-[var(--kg-surface-soft)] rounded-xl p-3 text-center border border-dashed border-[var(--kg-border)]">
                                  Bạn không có đầu việc điều phối riêng trong ca trực này
                                </p>
                              )}
                            </div>

                            {teammateTasks.length > 0 && (
                              <div className="pt-3 border-t border-[var(--kg-border)]">
                                <p className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--kg-text-muted)] mb-2.5 flex items-center gap-1.5">
                                  <UsersRound size={12} /> Việc của đồng đội (
                                  <span className="font-mono tabular-nums">{teammateTasks.length}</span>)
                                </p>
                                <div className="space-y-2">
                                  {teammateTasks.map((t) => renderTaskItem(t, true))}
                                </div>
                              </div>
                            )}

                            {unassignedTasks.length > 0 && (
                              <div className="pt-3 border-t border-[var(--kg-border)]">
                                <p className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--kg-text-muted)] mb-2.5 flex items-center gap-1.5">
                                  <ClipboardCheck size={12} /> Công việc chung &amp; Khác (
                                  <span className="font-mono tabular-nums">{unassignedTasks.length}</span>)
                                </p>
                                <div className="space-y-2">
                                  {unassignedTasks.map((t) => renderTaskItem(t, false))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </article>
              );
            })}

            {!assignments.length && (
              <KgEmptyState
                icon={CalendarDays}
                title="Chưa có phân công sắp tới"
                description="Khi admin xếp nhóm và khu trực, lịch điều phối cùng danh sách đồng đội sẽ xuất hiện tại đây."
              />
            )}
          </div>

          <KgButton
            type="button"
            variant="secondary"
            size="md"
            icon={RefreshCw}
            loading={loading}
            onClick={loadData}
            className="w-full"
          >
            Cập nhật phân công mới nhất
          </KgButton>
        </>
      )}

      <div className="fixed bottom-20 md:bottom-6 right-4 z-[10100] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <KgToast key={t.id} message={t} onClose={dismissToast} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

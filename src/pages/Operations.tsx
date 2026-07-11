import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  ChevronDown,
  Circle,
  ClipboardCheck,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Sparkles,
  Star,
  UsersRound,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { KgModuleHero } from '../components/KgDesignSystem';
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
  operationScore,
  todayIso,
} from '../types/operations';

export default function Operations() {
  const currentUser = useAppStore(state => state.currentUser);
  const users = useAppStore(state => state.users);
  const setCurrentTab = useAppStore(state => state.setCurrentTab);
  const setCurrentUser = useAppStore(state => state.setCurrentUser);
  const [config, setConfig] = useState<OperationsConfig>(emptyOperationsConfig);
  const [taskLogs, setTaskLogs] = useState<OperationTaskLog[]>([]);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingTaskId, setUpdatingTaskId] = useState('');
  const [expandedId, setExpandedId] = useState('');

  const loadData = useCallback(async () => {
    const user = useAppStore.getState().currentUser;
    if (!user) return;
    setLoading(true);
    const res = await callApi(
      'GET_OPERATIONS_CONFIG',
      {
        role: user.role,
        username: user.username,
        forceRefresh: true,
      },
      { background: true, cacheTtlMs: 0 },
    );
    if (res?.ok) {
      if (res.data.employmentProfile) {
        const refreshedUser = { ...user, ...res.data.employmentProfile };
        setCurrentUser(refreshedUser);
        localStorage.setItem('kg_user', JSON.stringify(refreshedUser));
      }
      setConfig(res.data.config || emptyOperationsConfig());
      setTaskLogs(res.data.taskLogs || []);
      setTeamMembers(res.data.members || []);
      const next = [...(res.data.config?.assignments || [])]
        .sort((a: OperationAssignment, b: OperationAssignment) => a.date.localeCompare(b.date))
        .find((assignment: OperationAssignment) => assignment.date >= todayIso());
      setExpandedId(current => current || next?.id || '');
    }
    setLoading(false);
  }, [setCurrentUser]);

  useEffect(() => {
    const timer = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const assignments = useMemo(
    () => [...config.assignments]
      .filter(assignment => assignment.date >= todayIso())
      .sort((a, b) => a.date.localeCompare(b.date)),
    [config.assignments],
  );

  const todayAssignments = assignments.filter(assignment => assignment.date === todayIso());
  const directoryUsers = users.length ? users : teamMembers;
  const myTeam = config.teams.find(team => (
    currentUser
      && (team.leaderUsername === currentUser.username || team.memberUsernames.includes(currentUser.username))
  ));
  const myEvaluation = config.evaluations.find(item => item.username === currentUser?.username);

  const toggleTask = async (assignment: OperationAssignment, taskId: string, completed: boolean) => {
    if (!currentUser) return;
    setUpdatingTaskId(`${assignment.id}_${taskId}`);
    const res = await callApi('TOGGLE_OPERATION_TASK', {
      role: currentUser.role,
      username: currentUser.username,
      fullname: currentUser.fullname,
      assignmentId: assignment.id,
      taskId,
      date: assignment.date,
      completed,
    });
    setUpdatingTaskId('');
    if (!res?.ok) {
      Swal.fire('Chưa cập nhật được', res?.message || 'Vui lòng thử lại.', 'error');
      return;
    }
    if (completed) {
      setTaskLogs(current => [
        ...current.filter(log => !(
          log.assignmentId === assignment.id
          && log.taskId === taskId
          && log.username === currentUser.username
        )),
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
      setTaskLogs(current => current.filter(log => !(
        log.assignmentId === assignment.id
        && log.taskId === taskId
        && log.username === currentUser.username
      )));
    }
  };

  if (!currentUser) return null;

  if (currentUser.role !== 'admin' && !isWorkEligible(currentUser)) {
    return <EmploymentStatusNotice user={currentUser} actionLabel="nhận phân công và thực hiện checklist" />;
  }

  if (currentUser.role === 'admin') {
    return (
      <div className="p-4 space-y-4 animate-slide-up">
        <KgModuleHero
          moduleId="operations"
          title="Phân Công Trực"
          description="Admin quản lý nhóm, khu và lịch phân công tại khu vực cấu hình vận hành."
          eyebrow="Vận hành"
        />
        <button
          type="button"
          onClick={() => setCurrentTab('admin_work')}
          className="soft3d-card flex w-full items-center justify-between rounded-2xl p-5 text-left"
        >
          <span>
            <span className="block font-extrabold text-slate-800 dark:text-white">Mở Phân công vận hành</span>
            <span className="mt-1 block text-xs text-slate-500">Thiết lập nhóm trực, khu vực, nhiệm vụ và năng lực.</span>
          </span>
          <Sparkles className="text-cyan-600" size={24} />
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 animate-slide-up pb-10">
      <KgModuleHero
        moduleId="operations"
        title="Phân Công Trực"
        description="Xem nhóm, khu vực, đồng đội và checklist công việc được giao cho bạn."
        eyebrow="Vận hành"
      />

      {loading ? (
        <div className="soft3d-card flex items-center justify-center gap-2 rounded-2xl py-16 text-sm font-bold text-slate-500">
          <LoaderCircle className="animate-spin" size={22} />
          Đang tải phân công của bạn...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="soft3d-card rounded-2xl p-4">
              <CalendarDays className="text-cyan-600" size={20} />
              <p className="mt-3 text-2xl font-black text-slate-900 dark:text-white">{todayAssignments.length}</p>
              <p className="text-xs font-bold text-slate-500">Khu trực hôm nay</p>
            </div>
            <div className="soft3d-card rounded-2xl p-4">
              <UsersRound className="text-violet-600" size={20} />
              <p className="mt-3 truncate text-lg font-black text-slate-900 dark:text-white">{myTeam?.name || 'Chưa xếp'}</p>
              <p className="text-xs font-bold text-slate-500">Nhóm của bạn</p>
            </div>
            <div className="soft3d-card rounded-2xl p-4">
              <ClipboardCheck className="text-emerald-600" size={20} />
              <p className="mt-3 text-2xl font-black text-slate-900 dark:text-white">
                {taskLogs.filter(log => log.date === todayIso()).length}
              </p>
              <p className="text-xs font-bold text-slate-500">Việc đã hoàn thành</p>
            </div>
            <div className="soft3d-card rounded-2xl p-4">
              <Star className="text-amber-500" size={20} />
              <p className="mt-3 text-2xl font-black text-slate-900 dark:text-white">
                {operationScore(myEvaluation).toFixed(1)}
              </p>
              <p className="text-xs font-bold text-slate-500">Điểm năng lực</p>
            </div>
          </div>

          {myTeam && (
            <div className="soft3d-card rounded-2xl p-5">
              <div className="flex items-center gap-3">
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: myTeam.color }} />
                <div>
                  <h3 className="font-extrabold text-slate-800 dark:text-white">{myTeam.name}</h3>
                  <p className="text-xs text-slate-500">{myTeam.description || 'Nhóm trực vận hành'}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {myTeam.memberUsernames.map(username => {
                  const employee = directoryUsers.find(user => user.username === username);
                  const isLeader = myTeam.leaderUsername === username;
                  return (
                    <div key={username} className={`rounded-xl border px-3 py-2 ${
                      isLeader
                        ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20'
                        : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60'
                    }`}>
                      <p className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
                        {employee?.fullname || username}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {isLeader ? 'Nhóm trưởng' : employee?.position || 'Thành viên'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {assignments.map(assignment => {
              const team = config.teams.find(item => item.id === assignment.teamId);
              const zone = config.zones.find(item => item.id === assignment.zoneId);
              const tasks = config.tasks.filter(task => task.zoneId === assignment.zoneId);
              const completedIds = new Set(
                taskLogs
                  .filter(log => log.assignmentId === assignment.id && log.username === currentUser.username)
                  .map(log => log.taskId),
              );
              const expanded = expandedId === assignment.id;
              const isToday = assignment.date === todayIso();
              return (
                <article
                  key={assignment.id}
                  className={`soft3d-card overflow-hidden rounded-2xl ${
                    isToday ? 'ring-2 ring-cyan-500/40' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? '' : assignment.id)}
                    className="w-full p-5 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-3">
                        <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl ${
                          isToday
                            ? 'bg-cyan-600 text-white'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                        }`}>
                          <MapPin size={21} />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-lg font-black text-slate-900 dark:text-white">
                              {zone?.name || 'Khu trực'}
                            </h3>
                            {isToday && (
                              <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-black uppercase text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
                                Hôm nay
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatOperationDate(assignment.date)} · {assignment.shift}
                          </p>
                          <p className="mt-1 text-[11px] font-bold text-violet-600 dark:text-violet-300">
                            {team?.name} · {completedIds.size}/{tasks.length} việc
                          </p>
                        </div>
                      </div>
                      <ChevronDown className={`mt-2 flex-shrink-0 text-slate-400 transition ${expanded ? 'rotate-180' : ''}`} size={19} />
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all"
                        style={{ width: `${tasks.length ? (completedIds.size / tasks.length) * 100 : 0}%` }}
                      />
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-slate-200 p-5 dark:border-slate-700">
                      {assignment.note && (
                        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/25 dark:text-amber-300">
                          Lưu ý: {assignment.note}
                        </p>
                      )}
                      <div className="space-y-2.5">
                        {tasks.map(task => {
                          const completed = completedIds.has(task.id);
                          const updating = updatingTaskId === `${assignment.id}_${task.id}`;
                          return (
                            <button
                              type="button"
                              key={task.id}
                              onClick={() => toggleTask(assignment, task.id, !completed)}
                              disabled={updating}
                              className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition ${
                                completed
                                  ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20'
                                  : 'border-slate-200 hover:border-cyan-300 dark:border-slate-700'
                              }`}
                            >
                              <span className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg ${
                                completed ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                              }`}>
                                {updating
                                  ? <LoaderCircle size={15} className="animate-spin" />
                                  : completed ? <Check size={16} /> : <Circle size={15} />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className={`block text-sm font-extrabold ${
                                  completed
                                    ? 'text-emerald-800 line-through dark:text-emerald-300'
                                    : 'text-slate-700 dark:text-slate-200'
                                }`}>
                                  {task.title}
                                </span>
                                <span className="mt-1 block text-xs leading-5 text-slate-500">{task.description}</span>
                                <span className="mt-1 block text-[10px] font-bold uppercase text-slate-400">
                                  {task.frequency}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                        {!tasks.length && (
                          <div className="py-8 text-center text-xs font-bold text-slate-400">
                            Khu trực này chưa có checklist công việc.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}

            {!assignments.length && (
              <div className="soft3d-card flex flex-col items-center rounded-2xl px-6 py-14 text-center">
                <CalendarDays className="text-slate-300" size={38} />
                <h3 className="mt-4 font-extrabold text-slate-700 dark:text-slate-200">Chưa có phân công sắp tới</h3>
                <p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">
                  Khi admin xếp nhóm và khu trực, lịch cùng danh sách đồng đội sẽ xuất hiện tại đây.
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={loadData}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-xs font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
          >
            <RefreshCw size={15} /> Cập nhật phân công mới nhất
          </button>
        </>
      )}
    </div>
  );
}

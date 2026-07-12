import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  LoaderCircle,
  MapPinned,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  UsersRound,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { KgModuleHero } from '../../components/KgDesignSystem';
import { callApi } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import type {
  OperationAssignment,
  OperationEvaluation,
  OperationsConfig,
  OperationTask,
  OperationTaskLog,
  OperationTeam,
  OperationZone,
} from '../../types/operations';
import { isWorkEligible } from '../../utils/employment';
import {
  emptyOperationsConfig,
  formatOperationDate,
  operationScore,
  todayIso,
} from '../../types/operations';

type Section = 'overview' | 'teams' | 'zones' | 'assignments' | 'evaluations';

const teamColors = ['#0e7490', '#7c3aed', '#059669', '#ea580c', '#db2777', '#2563eb'];
const newId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const clampScore = (value: number) => Math.min(5, Math.max(1, Number(value) || 3));

export default function AdminOperations() {
  const currentUser = useAppStore(state => state.currentUser);
  const users = useAppStore(state => state.users);
  const setCurrentTab = useAppStore(state => state.setCurrentTab);
  const [config, setConfig] = useState<OperationsConfig>(emptyOperationsConfig);
  const [taskLogs, setTaskLogs] = useState<OperationTaskLog[]>([]);
  const [section, setSection] = useState<Section>('overview');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [prevSelectedTeamId, setPrevSelectedTeamId] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');

  if (selectedTeamId !== prevSelectedTeamId) {
    setPrevSelectedTeamId(selectedTeamId);
    setMemberSearchQuery('');
  }
  const [evalSearchQuery, setEvalSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [assignmentDraft, setAssignmentDraft] = useState({
    date: todayIso(),
    teamId: '',
    zoneId: '',
    shift: 'Cả ngày',
    note: '',
  });

  const employees = useMemo(
    () => users.filter(user => user.username && user.role !== 'admin' && isWorkEligible(user)),
    [users],
  );

  const loadData = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
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
      const next = res.data.config || emptyOperationsConfig();
      setConfig(next);
      setTaskLogs(res.data.taskLogs || []);
      setSelectedTeamId(current => current || next.teams?.[0]?.id || '');
      setSelectedZoneId(current => current || next.zones?.[0]?.id || '');
      setAssignmentDraft(current => ({
        ...current,
        teamId: current.teamId || next.teams?.[0]?.id || '',
        zoneId: current.zoneId || next.zones?.[0]?.id || '',
      }));
      setDirty(false);
    }
    setLoading(false);
  }, [currentUser]);

  useEffect(() => {
    const timer = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);



  const patchConfig = (updater: (current: OperationsConfig) => OperationsConfig) => {
    setConfig(current => updater(current));
    setDirty(true);
  };

  const saveConfig = async () => {
    if (!currentUser) return;
    setSaving(true);
    const res = await callApi('UPDATE_OPERATIONS_CONFIG', {
      role: currentUser.role,
      username: currentUser.username,
      config,
    });
    setSaving(false);
    if (!res?.ok) {
      Swal.fire('Không thể lưu', res?.message || 'Vui lòng thử lại.', 'error');
      return;
    }
    setConfig(res.data.config);
    setDirty(false);
    Swal.fire({
      icon: 'success',
      title: 'Đã lưu phân công',
      text: 'Cấu hình vận hành đã được cập nhật lên Spreadsheet.',
      timer: 1700,
      showConfirmButton: false,
    });
  };

  const createTeam = async () => {
    const { value } = await Swal.fire({
      title: 'Tạo nhóm trực',
      html: `
        <input id="team-name" class="swal2-input" placeholder="Tên nhóm, ví dụ: Nhóm A">
        <textarea id="team-desc" class="swal2-textarea" placeholder="Mô tả phạm vi hoặc thế mạnh của nhóm"></textarea>
      `,
      showCancelButton: true,
      confirmButtonText: 'Tạo nhóm',
      cancelButtonText: 'Hủy',
      preConfirm: () => {
        const name = (document.getElementById('team-name') as HTMLInputElement)?.value.trim();
        const description = (document.getElementById('team-desc') as HTMLTextAreaElement)?.value.trim();
        if (!name) {
          Swal.showValidationMessage('Vui lòng nhập tên nhóm');
          return false;
        }
        return { name, description };
      },
    });
    if (!value) return;
    const team: OperationTeam = {
      id: newId('TEAM'),
      name: value.name,
      description: value.description,
      color: teamColors[config.teams.length % teamColors.length],
      leaderUsername: '',
      memberUsernames: [],
    };
    patchConfig(current => ({ ...current, teams: [...current.teams, team] }));
    setSelectedTeamId(team.id);
    setAssignmentDraft(current => ({ ...current, teamId: current.teamId || team.id }));
    setSection('teams');
  };

  const createZone = async () => {
    const { value } = await Swal.fire({
      title: 'Tạo khu trực',
      html: `
        <input id="zone-name" class="swal2-input" placeholder="Ví dụ: Sảnh A, Quầy bar, Khu VIP">
        <textarea id="zone-desc" class="swal2-textarea" placeholder="Mô tả phạm vi, bàn hoặc thiết bị phụ trách"></textarea>
      `,
      showCancelButton: true,
      confirmButtonText: 'Tạo khu',
      cancelButtonText: 'Hủy',
      preConfirm: () => {
        const name = (document.getElementById('zone-name') as HTMLInputElement)?.value.trim();
        const description = (document.getElementById('zone-desc') as HTMLTextAreaElement)?.value.trim();
        if (!name) {
          Swal.showValidationMessage('Vui lòng nhập tên khu trực');
          return false;
        }
        return { name, description };
      },
    });
    if (!value) return;
    const zone: OperationZone = {
      id: newId('ZONE'),
      name: value.name,
      description: value.description,
      color: teamColors[config.zones.length % teamColors.length],
    };
    patchConfig(current => ({ ...current, zones: [...current.zones, zone] }));
    setSelectedZoneId(zone.id);
    setAssignmentDraft(current => ({ ...current, zoneId: current.zoneId || zone.id }));
    setSection('zones');
  };

  const createTask = async () => {
    if (!selectedZoneId) {
      Swal.fire('Chưa có khu trực', 'Hãy tạo hoặc chọn khu trực trước.', 'info');
      return;
    }
    const { value } = await Swal.fire({
      title: 'Thêm công việc cho khu',
      html: `
        <input id="task-title" class="swal2-input" placeholder="Tên công việc">
        <textarea id="task-desc" class="swal2-textarea" placeholder="Tiêu chuẩn hoặc hướng dẫn thực hiện"></textarea>
        <select id="task-priority" class="swal2-select">
          <option value="normal">Thông thường</option>
          <option value="important">Quan trọng</option>
          <option value="critical">Bắt buộc ưu tiên</option>
        </select>
        <input id="task-frequency" class="swal2-input" placeholder="Tần suất, ví dụ: Đầu ca / Mỗi 60 phút">
      `,
      showCancelButton: true,
      confirmButtonText: 'Thêm công việc',
      cancelButtonText: 'Hủy',
      preConfirm: () => {
        const title = (document.getElementById('task-title') as HTMLInputElement)?.value.trim();
        if (!title) {
          Swal.showValidationMessage('Vui lòng nhập tên công việc');
          return false;
        }
        return {
          title,
          description: (document.getElementById('task-desc') as HTMLTextAreaElement)?.value.trim(),
          priority: (document.getElementById('task-priority') as HTMLSelectElement)?.value,
          frequency: (document.getElementById('task-frequency') as HTMLInputElement)?.value.trim() || 'Mỗi ca',
        };
      },
    });
    if (!value) return;
    const task: OperationTask = {
      id: newId('TASK'),
      zoneId: selectedZoneId,
      title: value.title,
      description: value.description,
      priority: value.priority,
      frequency: value.frequency,
    };
    patchConfig(current => ({ ...current, tasks: [...current.tasks, task] }));
  };

  const toggleMember = (teamId: string, username: string) => {
    patchConfig(current => ({
      ...current,
      teams: current.teams.map(team => {
        if (team.id !== teamId) {
          return { ...team, memberUsernames: team.memberUsernames.filter(value => value !== username) };
        }
        const exists = team.memberUsernames.includes(username);
        return {
          ...team,
          memberUsernames: exists
            ? team.memberUsernames.filter(value => value !== username)
            : [...team.memberUsernames, username],
        };
      }),
    }));
  };

  const setTeamLeader = (teamId: string, username: string) => {
    patchConfig(current => ({
      ...current,
      teams: current.teams.map(team => (
        team.id === teamId
          ? {
              ...team,
              leaderUsername: username,
              memberUsernames: username && !team.memberUsernames.includes(username)
                ? [...team.memberUsernames, username]
                : team.memberUsernames,
            }
          : team
      )),
    }));
  };

  const removeTeam = async (team: OperationTeam) => {
    const result = await Swal.fire({
      icon: 'warning',
      title: `Xóa ${team.name}?`,
      text: 'Các phân công liên quan tới nhóm này cũng sẽ bị xóa.',
      showCancelButton: true,
      confirmButtonText: 'Xóa nhóm',
      cancelButtonText: 'Hủy',
      confirmButtonColor: '#dc2626',
    });
    if (!result.isConfirmed) return;
    patchConfig(current => ({
      ...current,
      teams: current.teams.filter(item => item.id !== team.id),
      assignments: current.assignments.filter(item => item.teamId !== team.id),
    }));
    setSelectedTeamId(config.teams.find(item => item.id !== team.id)?.id || '');
  };

  const removeZone = async (zone: OperationZone) => {
    const result = await Swal.fire({
      icon: 'warning',
      title: `Xóa ${zone.name}?`,
      text: 'Công việc và phân công của khu này cũng sẽ bị xóa.',
      showCancelButton: true,
      confirmButtonText: 'Xóa khu',
      cancelButtonText: 'Hủy',
      confirmButtonColor: '#dc2626',
    });
    if (!result.isConfirmed) return;
    patchConfig(current => ({
      ...current,
      zones: current.zones.filter(item => item.id !== zone.id),
      tasks: current.tasks.filter(item => item.zoneId !== zone.id),
      assignments: current.assignments.filter(item => item.zoneId !== zone.id),
    }));
    setSelectedZoneId(config.zones.find(item => item.id !== zone.id)?.id || '');
  };

  const addAssignment = () => {
    if (!assignmentDraft.date || !assignmentDraft.teamId || !assignmentDraft.zoneId) {
      Swal.fire('Thiếu thông tin', 'Vui lòng chọn ngày, nhóm trực và khu trực.', 'warning');
      return;
    }
    const duplicate = config.assignments.some(item => (
      item.date === assignmentDraft.date
      && item.teamId === assignmentDraft.teamId
      && item.zoneId === assignmentDraft.zoneId
      && item.shift === assignmentDraft.shift
    ));
    if (duplicate) {
      Swal.fire('Phân công đã tồn tại', 'Nhóm này đã được xếp vào khu trực trong cùng ca.', 'info');
      return;
    }
    const assignment: OperationAssignment = {
      id: newId('ASSIGN'),
      ...assignmentDraft,
      note: assignmentDraft.note.trim(),
    };
    patchConfig(current => ({ ...current, assignments: [...current.assignments, assignment] }));
    setAssignmentDraft(current => ({ ...current, note: '' }));
  };

  const updateEvaluation = (username: string, field: keyof OperationEvaluation, value: number | string) => {
    patchConfig(current => {
      const existing = current.evaluations.find(item => item.username === username);
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
          ...current.evaluations.filter(item => item.username !== username),
          next,
        ],
      };
    });
  };

  const autoBalanceTeams = async () => {
    if (config.teams.length < 2 || !employees.length) {
      Swal.fire('Chưa đủ dữ liệu', 'Cần ít nhất 2 nhóm và danh sách nhân viên.', 'info');
      return;
    }
    const result = await Swal.fire({
      icon: 'question',
      title: 'Tự động cân bằng đội hình?',
      text: 'Hệ thống sẽ dùng điểm năng lực, quy mô nhóm và giữ nguyên nhóm trưởng.',
      showCancelButton: true,
      confirmButtonText: 'Cân bằng ngay',
      cancelButtonText: 'Hủy',
      confirmButtonColor: '#0e7490',
    });
    if (!result.isConfirmed) return;

    const leaders = new Set(config.teams.map(team => team.leaderUsername).filter(Boolean));
    const ranked = employees
      .filter(employee => !leaders.has(employee.username))
      .sort((a, b) => {
        const evalA = config.evaluations.find(item => item.username === a.username);
        const evalB = config.evaluations.find(item => item.username === b.username);
        return operationScore(evalB) - operationScore(evalA);
      });
    const buckets = config.teams.map(team => {
      const leader = employees.find(employee => employee.username === team.leaderUsername);
      const leaderEvaluation = config.evaluations.find(item => item.username === team.leaderUsername);
      return {
        team,
        members: leader ? [leader.username] : [],
        total: leader ? operationScore(leaderEvaluation) : 0,
      };
    });
    ranked.forEach(employee => {
      const evaluation = config.evaluations.find(item => item.username === employee.username);
      const target = [...buckets].sort((a, b) => (
        a.members.length - b.members.length || a.total - b.total
      ))[0];
      target.members.push(employee.username);
      target.total += operationScore(evaluation);
    });
    patchConfig(current => ({
      ...current,
      teams: current.teams.map(team => ({
        ...team,
        memberUsernames: buckets.find(bucket => bucket.team.id === team.id)?.members || [],
      })),
    }));
    setSection('teams');
    Swal.fire('Đã cân bằng tạm thời', 'Hãy kiểm tra đội hình rồi nhấn “Lưu cấu hình”.', 'success');
  };

  const selectedTeam = config.teams.find(team => team.id === selectedTeamId);
  const selectedZone = config.zones.find(zone => zone.id === selectedZoneId);
  const zoneTasks = config.tasks.filter(task => task.zoneId === selectedZoneId);
  const upcomingAssignments = [...config.assignments]
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter(item => item.date >= todayIso());

  const assignedOnOtherTeams = useMemo(() => {
    const set = new Set<string>();
    config.teams.forEach(team => {
      if (team.id !== selectedTeamId) {
        team.memberUsernames.forEach(username => set.add(username));
      }
    });
    return set;
  }, [config.teams, selectedTeamId]);

  const filteredCurrentTeamEmployees = useMemo(() => {
    return employees.filter(employee => {
      const isCurrentTeam = selectedTeam?.memberUsernames.includes(employee.username);
      if (!isCurrentTeam) return false;
      
      if (memberSearchQuery.trim()) {
        const query = memberSearchQuery.toLowerCase().trim();
        const nameMatch = employee.fullname.toLowerCase().includes(query);
        const posMatch = (employee.position || '').toLowerCase().includes(query);
        const userMatch = employee.username.toLowerCase().includes(query);
        return nameMatch || posMatch || userMatch;
      }
      return true;
    });
  }, [employees, selectedTeam?.memberUsernames, memberSearchQuery]);

  const filteredUnassignedEmployees = useMemo(() => {
    return employees.filter(employee => {
      const isCurrentTeam = selectedTeam?.memberUsernames.includes(employee.username);
      const inOtherTeam = assignedOnOtherTeams.has(employee.username);
      if (isCurrentTeam || inOtherTeam) return false;
      
      if (memberSearchQuery.trim()) {
        const query = memberSearchQuery.toLowerCase().trim();
        const nameMatch = employee.fullname.toLowerCase().includes(query);
        const posMatch = (employee.position || '').toLowerCase().includes(query);
        const userMatch = employee.username.toLowerCase().includes(query);
        return nameMatch || posMatch || userMatch;
      }
      return true;
    });
  }, [employees, selectedTeam?.memberUsernames, assignedOnOtherTeams, memberSearchQuery]);

  const filteredOtherTeamEmployees = useMemo(() => {
    return employees.filter(employee => {
      const inOtherTeam = assignedOnOtherTeams.has(employee.username);
      if (!inOtherTeam) return false;
      
      if (memberSearchQuery.trim()) {
        const query = memberSearchQuery.toLowerCase().trim();
        const nameMatch = employee.fullname.toLowerCase().includes(query);
        const posMatch = (employee.position || '').toLowerCase().includes(query);
        const userMatch = employee.username.toLowerCase().includes(query);
        return nameMatch || posMatch || userMatch;
      }
      return true;
    });
  }, [employees, assignedOnOtherTeams, memberSearchQuery]);

  const filteredEvalEmployees = useMemo(() => {
    if (!evalSearchQuery.trim()) return employees;
    const query = evalSearchQuery.toLowerCase().trim();
    return employees.filter(employee => {
      const nameMatch = employee.fullname.toLowerCase().includes(query);
      const posMatch = (employee.position || '').toLowerCase().includes(query);
      const userMatch = employee.username.toLowerCase().includes(query);
      return nameMatch || posMatch || userMatch;
    });
  }, [employees, evalSearchQuery]);

  const getSuggestedZoneId = useCallback((teamId: string, dateStr: string) => {
    if (!teamId || !dateStr) return '';
    const prevAssignments = config.assignments
      .filter(a => a.teamId === teamId && a.date < dateStr)
      .sort((a, b) => b.date.localeCompare(a.date));
    
    if (prevAssignments.length === 0) {
      return 'A';
    }
    
    const lastZoneId = prevAssignments[0].zoneId;
    const rotation = ['A', 'B', 'C', 'D&E'];
    const lastIdx = rotation.indexOf(lastZoneId);
    if (lastIdx === -1) return 'A';
    
    const nextIdx = (lastIdx + 1) % rotation.length;
    return rotation[nextIdx];
  }, [config.assignments]);

  useEffect(() => {
    if (assignmentDraft.teamId && assignmentDraft.date) {
      const suggested = getSuggestedZoneId(assignmentDraft.teamId, assignmentDraft.date);
      if (suggested && suggested !== assignmentDraft.zoneId) {
        const timer = setTimeout(() => {
          setAssignmentDraft(current => ({ ...current, zoneId: suggested }));
        }, 0);
        return () => clearTimeout(timer);
      }
    }
  }, [assignmentDraft.teamId, assignmentDraft.date, assignmentDraft.zoneId, getSuggestedZoneId]);

  const autoRotateAllAssignments = () => {
    if (!assignmentDraft.date) {
      Swal.fire('Chú ý', 'Vui lòng chọn ngày trước.', 'warning');
      return;
    }
    
    const newAssignments: OperationAssignment[] = [];
    config.teams.forEach(team => {
      const isAssigned = config.assignments.some(a => (
        a.date === assignmentDraft.date
        && a.teamId === team.id
        && a.shift === assignmentDraft.shift
      ));
      if (isAssigned) return;
      
      const suggestedZone = getSuggestedZoneId(team.id, assignmentDraft.date);
      if (suggestedZone) {
        newAssignments.push({
          id: newId('ASSIGN'),
          date: assignmentDraft.date,
          teamId: team.id,
          zoneId: suggestedZone,
          shift: assignmentDraft.shift,
          note: 'Xoay ca tự động'
        });
      }
    });
    
    if (newAssignments.length === 0) {
      Swal.fire('Thông báo', 'Tất cả các nhóm đã được phân công trong ca này.', 'info');
      return;
    }
    
    patchConfig(current => ({
      ...current,
      assignments: [...current.assignments, ...newAssignments]
    }));
    
    Swal.fire('Thành công', `Đã tự động xếp khu trực cho ${newAssignments.length} nhóm theo quy tắc xoay vòng ca.`, 'success');
  };

  const teamMetrics = config.teams.map(team => {
    const scores = team.memberUsernames.map(username => (
      operationScore(config.evaluations.find(item => item.username === username))
    ));
    return {
      team,
      size: team.memberUsernames.length,
      average: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0,
    };
  });
  const activeAverages = teamMetrics.filter(item => item.size).map(item => item.average);
  const scoreGap = activeAverages.length
    ? Math.max(...activeAverages) - Math.min(...activeAverages)
    : 0;

  if (currentUser?.role !== 'admin') {
    return (
      <div className="p-6 text-center">
        <ShieldCheck className="mx-auto text-slate-400" size={36} />
        <p className="mt-3 font-bold text-slate-700 dark:text-slate-200">Chỉ admin được cấu hình phân công.</p>
      </div>
    );
  }

  const navItems: { id: Section; label: string; icon: typeof BarChart3 }[] = [
    { id: 'overview', label: 'Tổng quan', icon: BarChart3 },
    { id: 'teams', label: 'Nhóm trực', icon: UsersRound },
    { id: 'zones', label: 'Khu & việc', icon: MapPinned },
    { id: 'assignments', label: 'Phân công', icon: CalendarPlus },
    { id: 'evaluations', label: 'Năng lực', icon: Star },
  ];

  return (
    <div className="p-4 space-y-4 animate-slide-up pb-24">
      <div className="flex -mt-2">
        <button
          type="button"
          onClick={() => setCurrentTab('admin_work')}
          className="text-xs font-bold text-slate-500 hover:text-cyan-700"
        >
          ← Quay lại Quản lý & Cấu hình
        </button>
      </div>

      <KgModuleHero
        moduleId="admin-operations"
        title="Phân Công Vận Hành"
        description="Tổ chức nhóm trực, khu vực, checklist và cân bằng năng lực nhân sự theo từng ngày."
        eyebrow="Điều phối"
      />

      <div className="soft3d-card rounded-2xl p-2">
        <div className="grid grid-cols-5 gap-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => setSection(item.id)}
                className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2.5 text-[10px] font-extrabold transition sm:flex-row sm:text-xs ${
                  active
                    ? 'bg-cyan-700 text-white shadow-md'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon size={16} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="soft3d-card flex items-center justify-center gap-2 rounded-2xl py-16 text-sm font-bold text-slate-500">
          <LoaderCircle size={22} className="animate-spin" />
          Đang tải cấu hình vận hành...
        </div>
      ) : (
        <>
          {section === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  { label: 'Nhóm trực', value: config.teams.length, icon: UsersRound, iconClass: 'text-cyan-600' },
                  { label: 'Khu trực', value: config.zones.length, icon: MapPinned, iconClass: 'text-violet-600' },
                  { label: 'Công việc', value: config.tasks.length, icon: ClipboardList, iconClass: 'text-emerald-600' },
                  { label: 'Lịch sắp tới', value: upcomingAssignments.length, icon: CalendarPlus, iconClass: 'text-amber-600' },
                ].map(card => {
                  const Icon = card.icon;
                  return (
                    <div key={card.label} className="soft3d-card rounded-2xl p-4">
                      <Icon size={20} className={card.iconClass} />
                      <p className="mt-3 text-2xl font-black text-slate-900 dark:text-white">{card.value}</p>
                      <p className="text-xs font-bold text-slate-500">{card.label}</p>
                    </div>
                  );
                })}
              </div>

              <div className={`rounded-2xl border p-4 ${
                scoreGap > 1
                  ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20'
                  : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20'
              }`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex gap-3">
                    {scoreGap > 1
                      ? <AlertTriangle className="text-amber-600" size={22} />
                      : <CheckCircle2 className="text-emerald-600" size={22} />}
                    <div>
                      <p className="font-extrabold text-slate-800 dark:text-white">
                        {scoreGap > 1 ? 'Đội hình đang chênh lệch' : 'Năng lực các nhóm tương đối cân bằng'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Chênh lệch điểm trung bình: {scoreGap.toFixed(1)}/5
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={autoBalanceTeams}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-md"
                  >
                    <Sparkles size={15} /> Tự cân bằng đội
                  </button>
                </div>
              </div>

              <div className="soft3d-card rounded-2xl p-5">
                <h3 className="font-extrabold text-slate-800 dark:text-white">Sức mạnh đội hình</h3>
                <div className="mt-4 space-y-3">
                  {teamMetrics.map(metric => (
                    <div key={metric.team.id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: metric.team.color }} />
                          <span className="truncate text-sm font-extrabold text-slate-700 dark:text-slate-200">
                            {metric.team.name}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-slate-500">
                          {metric.size} người · {metric.average.toFixed(1)}/5
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${metric.average * 20}%`, backgroundColor: metric.team.color }}
                        />
                      </div>
                    </div>
                  ))}
                  {!config.teams.length && (
                    <button
                      type="button"
                      onClick={createTeam}
                      className="w-full rounded-xl border border-dashed border-cyan-300 py-8 text-sm font-bold text-cyan-700"
                    >
                      + Tạo nhóm trực đầu tiên
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {section === 'teams' && (
            <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="soft3d-card rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-slate-800 dark:text-white">Nhóm trực</h3>
                  <button type="button" onClick={createTeam} className="rounded-lg bg-cyan-50 p-2 text-cyan-700 dark:bg-cyan-950/30">
                    <Plus size={17} />
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {config.teams.map(team => (
                    <button
                      type="button"
                      key={team.id}
                      onClick={() => setSelectedTeamId(team.id)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        selectedTeamId === team.id
                          ? 'border-cyan-300 bg-cyan-50 dark:border-cyan-800 dark:bg-cyan-950/25'
                          : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: team.color }} />
                        <span className="truncate text-sm font-extrabold text-slate-700 dark:text-slate-200">{team.name}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">{team.memberUsernames.length} thành viên</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="soft3d-card rounded-2xl p-5">
                {selectedTeam ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-700">
                      <div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white">{selectedTeam.name}</h3>
                        <p className="mt-1 text-xs text-slate-500">{selectedTeam.description || 'Chưa có mô tả nhóm'}</p>
                      </div>
                      <button type="button" onClick={() => removeTeam(selectedTeam)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50">
                        <Trash2 size={17} />
                      </button>
                    </div>

                    <label className="mt-4 block">
                      <span className="mb-1.5 block text-[11px] font-bold uppercase text-slate-500">Nhóm trưởng / người theo dõi</span>
                      <select
                        value={selectedTeam.leaderUsername}
                        onChange={event => setTeamLeader(selectedTeam.id, event.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      >
                        <option value="">Chưa chọn nhóm trưởng</option>
                        {employees.filter(employee => !assignedOnOtherTeams.has(employee.username) || employee.username === selectedTeam.leaderUsername).map(employee => (
                          <option key={employee.username} value={employee.username}>
                            {employee.fullname} · {employee.position || 'Nhân viên'}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="mt-5">
                      <p className="text-[11px] font-bold uppercase text-slate-500 mb-2">Thành viên nhóm</p>
                      <input
                        type="text"
                        placeholder="Tìm nhân viên theo tên hoặc bộ phận..."
                        value={memberSearchQuery}
                        onChange={e => setMemberSearchQuery(e.target.value)}
                        className="mb-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                      <div className="space-y-4">
                        {/* Section 1: Current Team Members */}
                        <div>
                          <p className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400 mb-2">Thành viên hiện tại của nhóm ({filteredCurrentTeamEmployees.length})</p>
                          {filteredCurrentTeamEmployees.length > 0 ? (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {filteredCurrentTeamEmployees.map(employee => {
                                const checked = true;
                                const evaluation = config.evaluations.find(item => item.username === employee.username);
                                return (
                                  <button
                                    type="button"
                                    key={employee.username}
                                    onClick={() => toggleMember(selectedTeam.id, employee.username)}
                                    className="flex items-center gap-3 rounded-xl border border-cyan-300 bg-cyan-50 dark:border-cyan-800 dark:bg-cyan-950/25 p-3 text-left transition"
                                  >
                                    <span className="flex h-5 w-5 items-center justify-center rounded-md border border-cyan-600 bg-cyan-600 text-white">
                                      <CheckCircle2 size={14} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-xs font-extrabold text-slate-700 dark:text-slate-200">
                                        {employee.fullname}
                                      </span>
                                      <span className="block truncate text-[10px] text-slate-400">
                                        {employee.position || 'Nhân viên'} · {operationScore(evaluation).toFixed(1)}/5
                                      </span>
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 italic py-1">Chưa có thành viên nào trong nhóm này</p>
                          )}
                        </div>

                        {/* Section 2: Unassigned Staff */}
                        <div className="mt-6 border-t border-slate-100 dark:border-slate-800 pt-4">
                          <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">Nhân sự chưa phân nhóm ({filteredUnassignedEmployees.length})</p>
                          {filteredUnassignedEmployees.length > 0 ? (
                            <div className="grid gap-2 sm:grid-cols-2">
                              {filteredUnassignedEmployees.map(employee => {
                                const evaluation = config.evaluations.find(item => item.username === employee.username);
                                return (
                                  <button
                                    type="button"
                                    key={employee.username}
                                    onClick={() => toggleMember(selectedTeam.id, employee.username)}
                                    className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-cyan-300 p-3 text-left transition"
                                  >
                                    <span className="flex h-5 w-5 items-center justify-center rounded-md border border-slate-300 bg-white" />
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-xs font-extrabold text-slate-700 dark:text-slate-200">
                                        {employee.fullname}
                                      </span>
                                      <span className="block truncate text-[10px] text-slate-400">
                                        {employee.position || 'Nhân viên'} · {operationScore(evaluation).toFixed(1)}/5
                                      </span>
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 italic py-1">Tất cả nhân sự đã được chia nhóm</p>
                          )}
                        </div>

                        {/* Section 3: Staff in Other Groups */}
                        {filteredOtherTeamEmployees.length > 0 && (
                          <div className="mt-6 border-t border-slate-200 dark:border-slate-700 pt-4">
                            <p className="text-[10px] font-bold uppercase text-rose-500 mb-2">Thành viên đã ở nhóm khác ({filteredOtherTeamEmployees.length}) - Nhấp để chuyển sang nhóm này</p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {filteredOtherTeamEmployees.map(employee => {
                                const evaluation = config.evaluations.find(item => item.username === employee.username);
                                const otherTeam = config.teams.find(t => t.id !== selectedTeamId && t.memberUsernames.includes(employee.username));
                                return (
                                  <button
                                    type="button"
                                    key={employee.username}
                                    onClick={() => toggleMember(selectedTeam.id, employee.username)}
                                    className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 p-3 text-left transition opacity-60 hover:opacity-100 hover:border-cyan-300"
                                  >
                                    <span className="flex h-5 w-5 items-center justify-center rounded-md border border-slate-300 bg-white" />
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-xs font-extrabold text-slate-600 dark:text-slate-300">
                                        {employee.fullname}
                                      </span>
                                      <span className="block truncate text-[10px] text-slate-400">
                                        {employee.position || 'Nhân viên'} · {operationScore(evaluation).toFixed(1)}/5
                                      </span>
                                      <span className="mt-0.5 inline-block text-[9px] font-bold text-cyan-750 dark:text-cyan-400">
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
                  <div className="py-16 text-center text-slate-400">
                    <UsersRound className="mx-auto" size={32} />
                    <p className="mt-3 text-sm font-bold">Chọn hoặc tạo một nhóm trực</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {section === 'zones' && (
            <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="soft3d-card rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-slate-800 dark:text-white">Khu trực</h3>
                  <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-black">ĐỒNG BỘ</span>
                </div>
                <div className="mt-3 space-y-2">
                  {config.zones.map(zone => (
                    <button
                      type="button"
                      key={zone.id}
                      onClick={() => setSelectedZoneId(zone.id)}
                      className={`w-full rounded-xl border p-3 text-left ${
                        selectedZoneId === zone.id
                          ? 'border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/25'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <p className="text-sm font-extrabold text-slate-700 dark:text-slate-200">{zone.name}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {config.tasks.filter(task => task.zoneId === zone.id).length} công việc
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="soft3d-card rounded-2xl p-5">
                {selectedZone ? (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-700">
                      <div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white">{selectedZone.name}</h3>
                        <p className="mt-1 text-xs text-slate-500">Khu trực và checklist công việc được đồng bộ tự động từ danh mục Checklist.</p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2.5">
                      {zoneTasks.map(task => (
                        <div key={task.id} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3.5 dark:border-slate-700">
                          <span className={`mt-1 h-2.5 w-2.5 rounded-full ${
                            task.priority === 'critical'
                              ? 'bg-rose-500'
                              : task.priority === 'important' ? 'bg-amber-500' : 'bg-emerald-500'
                          }`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-extrabold text-slate-700 dark:text-slate-200">{task.title}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">{task.description || 'Không có mô tả'}</p>
                            <p className="mt-1 text-[10px] font-bold uppercase text-slate-400">{task.frequency}</p>
                          </div>
                          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-2.5 py-1 rounded-lg font-bold">
                            ĐỒNG BỘ
                          </span>
                        </div>
                      ))}
                      {!zoneTasks.length && (
                        <div className="py-12 text-center text-xs font-bold text-slate-400">
                          Khu trực này chưa có checklist công việc trong hệ thống.
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="py-16 text-center text-slate-400">
                    <MapPinned className="mx-auto" size={32} />
                    <p className="mt-3 text-sm font-bold">Chọn hoặc tạo một khu trực</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {section === 'assignments' && (
            <div className="space-y-4">
              <div className="soft3d-card rounded-2xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
                  <div>
                    <h3 className="font-extrabold text-slate-800 dark:text-white">Tạo phân công theo ngày</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">Xoay vòng khu trực tự động A ➔ B ➔ C ➔ D&E</p>
                  </div>
                  <button
                    type="button"
                    onClick={autoRotateAllAssignments}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition"
                  >
                    <Sparkles size={14} /> Tự động xoay ca tất cả các nhóm
                  </button>
                </div>
                <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <input
                    type="date"
                    value={assignmentDraft.date}
                    onChange={event => setAssignmentDraft(current => ({ ...current, date: event.target.value }))}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <select
                    value={assignmentDraft.teamId}
                    onChange={event => setAssignmentDraft(current => ({ ...current, teamId: event.target.value }))}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">Chọn nhóm trực</option>
                    {config.teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                  <select
                    value={assignmentDraft.zoneId}
                    onChange={event => setAssignmentDraft(current => ({ ...current, zoneId: event.target.value }))}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">Chọn khu trực</option>
                    {config.zones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
                  </select>
                  <select
                    value={assignmentDraft.shift}
                    onChange={event => setAssignmentDraft(current => ({ ...current, shift: event.target.value }))}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option>Cả ngày</option>
                    <option>Ca sáng</option>
                    <option>Ca chiều</option>
                    <option>Ca tối</option>
                  </select>
                  <button type="button" onClick={addAssignment} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-extrabold text-white">
                    <CalendarPlus size={16} /> Phân công
                  </button>
                </div>
                <input
                  value={assignmentDraft.note}
                  onChange={event => setAssignmentDraft(current => ({ ...current, note: event.target.value }))}
                  placeholder="Ghi chú vận hành, yêu cầu đặc biệt..."
                  className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="soft3d-card rounded-2xl p-5">
                <h3 className="font-extrabold text-slate-800 dark:text-white">Lịch phân công sắp tới</h3>
                <div className="mt-4 space-y-3">
                  {upcomingAssignments.map(assignment => {
                    const team = config.teams.find(item => item.id === assignment.teamId);
                    const zone = config.zones.find(item => item.id === assignment.zoneId);
                    const totalTasks = config.tasks.filter(task => task.zoneId === assignment.zoneId).length;
                    const completedTasks = new Set(
                      taskLogs
                        .filter(log => log.assignmentId === assignment.id)
                        .map(log => log.taskId),
                    ).size;
                    return (
                      <div key={assignment.id} className="grid gap-3 rounded-2xl border border-slate-200 p-4 md:grid-cols-[130px_1fr_1fr_auto] md:items-center dark:border-slate-700">
                        <div>
                          <p className="text-sm font-black text-slate-800 dark:text-white">{formatOperationDate(assignment.date)}</p>
                          <p className="mt-1 text-[11px] font-bold text-slate-400">{assignment.shift}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-slate-400">Nhóm trực</p>
                          <p className="mt-1 text-sm font-extrabold text-cyan-700 dark:text-cyan-300">{team?.name || 'Nhóm đã xóa'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-slate-400">Khu & tiến độ</p>
                          <p className="mt-1 text-sm font-extrabold text-violet-700 dark:text-violet-300">
                            {zone?.name || 'Khu đã xóa'} · {completedTasks}/{totalTasks} việc
                          </p>
                        </div>
                        {assignment.isVirtual ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-violet-750 dark:text-violet-400 bg-violet-100 dark:bg-violet-950/30 px-2.5 py-1 rounded-lg justify-self-end">
                            ✨ Tự động
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => patchConfig(current => ({
                              ...current,
                              assignments: current.assignments.filter(item => item.id !== assignment.id),
                            }))}
                            className="justify-self-end rounded-lg p-2 text-slate-400 hover:text-rose-500"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {!upcomingAssignments.length && (
                    <div className="py-12 text-center text-sm font-bold text-slate-400">Chưa có lịch phân công sắp tới.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {section === 'evaluations' && (
            <div className="soft3d-card rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-extrabold text-slate-800 dark:text-white">Đánh giá & xếp loại nhân sự</h3>
                  <p className="mt-1 text-xs text-slate-500">Thang điểm 1–5 được dùng khi tự động cân bằng nhóm.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="Tìm nhân viên..."
                    value={evalSearchQuery}
                    onChange={e => setEvalSearchQuery(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <button type="button" onClick={autoBalanceTeams} className="inline-flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 dark:bg-violet-950/30 dark:text-violet-300">
                    <Sparkles size={15} /> Xếp đội theo điểm
                  </button>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {[...filteredEvalEmployees]
                  .sort((a, b) => {
                    const aScore = operationScore(config.evaluations.find(item => item.username === a.username));
                    const bScore = operationScore(config.evaluations.find(item => item.username === b.username));
                    return bScore - aScore;
                  })
                  .map(employee => {
                    const evaluation = config.evaluations.find(item => item.username === employee.username);
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
                      <div key={employee.username} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-extrabold text-slate-800 dark:text-white">{employee.fullname}</p>
                            <p className="text-[11px] text-slate-400">{employee.position || 'Nhân viên'}</p>
                          </div>
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-black text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                            {operationScore(evaluation).toFixed(1)}/5
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                          {[
                            ['service', 'Nghiệp vụ'],
                            ['speed', 'Tốc độ'],
                            ['teamwork', 'Phối hợp'],
                            ['reliability', 'Ổn định'],
                            ['leadership', 'Dẫn dắt'],
                          ].map(([field, label]) => (
                            <label key={field} className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/70">
                              <span className="block text-[10px] font-bold uppercase text-slate-400">{label}</span>
                              <select
                                value={values[field as keyof OperationEvaluation] as number}
                                onChange={event => updateEvaluation(
                                  employee.username,
                                  field as keyof OperationEvaluation,
                                  Number(event.target.value),
                                )}
                                className="mt-1 w-full bg-transparent text-sm font-black text-slate-700 outline-none dark:text-white"
                              >
                                {[1, 2, 3, 4, 5].map(score => <option key={score}>{score}</option>)}
                              </select>
                            </label>
                          ))}
                        </div>
                        <input
                          value={values.note}
                          onChange={event => updateEvaluation(employee.username, 'note', event.target.value)}
                          placeholder="Nhận xét, điểm mạnh, hạn chế hoặc lưu ý khi xếp nhóm..."
                          className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </>
      )}

      <div className="fixed bottom-20 left-1/2 z-30 flex w-[min(92vw,720px)] -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/70 bg-white/90 p-2 shadow-2xl backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/90 lg:bottom-5">
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          title="Tải lại"
        >
          <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
        </button>
        <div className="min-w-0 flex-1 px-2">
          <p className="truncate text-xs font-extrabold text-slate-700 dark:text-slate-200">
            {dirty ? 'Có thay đổi chưa lưu' : 'Cấu hình đã đồng bộ'}
          </p>
          <p className="truncate text-[10px] text-slate-400">
            {config.teams.length} nhóm · {config.zones.length} khu · {config.assignments.length} phân công
          </p>
        </div>
        <button
          type="button"
          onClick={saveConfig}
          disabled={saving || loading || !dirty}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 text-xs font-extrabold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-45"
        >
          {saving ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Đang lưu' : 'Lưu cấu hình'}
        </button>
      </div>
    </div>
  );
}

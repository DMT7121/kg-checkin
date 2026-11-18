export interface OperationTeam {
  id: string;
  name: string;
  color: string;
  description: string;
  leaderUsername: string;
  memberUsernames: string[];
}

export interface OperationZone {
  id: string;
  name: string;
  color: string;
  description: string;
}

export type OperationTaskPriority = 'normal' | 'important' | 'critical';

export interface OperationTask {
  id: string;
  zoneId: string;
  title: string;
  description: string;
  priority: OperationTaskPriority;
  frequency: string;
}

export interface OperationAssignment {
  id: string;
  date: string;
  teamId: string;
  zoneId: string;
  shift: string;
  note: string;
  isVirtual?: boolean;
  memberShifts?: Record<string, string>;
}

export interface OperationEvaluation {
  username: string;
  service: number;
  speed: number;
  teamwork: number;
  reliability: number;
  leadership: number;
  note: string;
  updatedAt: string;
}

export interface OperationTaskLog {
  id: string;
  date: string;
  assignmentId: string;
  taskId: string;
  username: string;
  fullname: string;
  completedAt: string;
  status: string;
  note: string;
}

export interface OperationsConfig {
  version: number;
  teams: OperationTeam[];
  zones: OperationZone[];
  tasks: OperationTask[];
  assignments: OperationAssignment[];
  evaluations: OperationEvaluation[];
}

export const emptyOperationsConfig = (): OperationsConfig => ({
  version: 1,
  teams: [],
  zones: [],
  tasks: [],
  assignments: [],
  evaluations: [],
});

export const normalizeOperationsConfig = (
  raw?: Partial<OperationsConfig> | null,
): OperationsConfig => ({
  version: typeof raw?.version === 'number' ? raw.version : 1,
  teams: Array.isArray(raw?.teams)
    ? raw.teams.map((team) => ({
        ...team,
        id: String(team?.id ?? ''),
        name: String(team?.name ?? ''),
        color: String(team?.color || '#0e7490'),
        description: String(team?.description ?? ''),
        leaderUsername: String(team?.leaderUsername ?? ''),
        memberUsernames: Array.isArray(team?.memberUsernames) ? team.memberUsernames : [],
      }))
    : [],
  zones: Array.isArray(raw?.zones) ? raw.zones : [],
  tasks: Array.isArray(raw?.tasks) ? raw.tasks : [],
  assignments: Array.isArray(raw?.assignments)
    ? raw.assignments.map((assignment) => ({
        ...assignment,
        date: typeof assignment?.date === 'string' ? assignment.date : '',
      }))
    : [],
  evaluations: Array.isArray(raw?.evaluations) ? raw.evaluations : [],
});

export const operationScore = (evaluation?: OperationEvaluation) => {
  if (!evaluation) return 3;
  return (
    evaluation.service
    + evaluation.speed
    + evaluation.teamwork
    + evaluation.reliability
    + evaluation.leadership
  ) / 5;
};

export const todayIso = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

export const formatOperationDate = (date: string) => {
  if (!date) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`));
};

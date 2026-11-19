import Checklist from './Checklist';

/**
 * Legacy compatibility wrapper — team/zone dispatch assignment & extra operational tasks
 * are consolidated directly into Checklist.tsx to eliminate duplicate task lists.
 */
export default function Operations() {
  return <Checklist />;
}

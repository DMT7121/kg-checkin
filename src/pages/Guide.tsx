import Training from './Training';

/**
 * Legacy compatibility wrapper — KnowledgeCenter (SOP, Quiz, CUKCUK, and 1-tap OS Onboarding)
 * is consolidated in Training.tsx to remove 3-way content duplication.
 */
export default function Guide() {
  return <Training />;
}

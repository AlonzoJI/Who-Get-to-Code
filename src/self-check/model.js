// Pure logic for the self-check, so it runs under `node --test`.

// answers: { [questionId]: optionId }
// Returns the study id most answers point to. Ties go to the study first
// pointed to by an earlier question; no pointers returns the default.
export function pickStudy(check, answers) {
  const votes = new Map();
  for (const q of check.questions) {
    const option = q.options.find((o) => o.id === answers[q.id]);
    if (option?.study) votes.set(option.study, (votes.get(option.study) ?? 0) + 1);
  }
  let best = null;
  for (const [study, count] of votes) if (best === null || count > votes.get(best)) best = study;
  return { study: best ?? check.default_study, votes: best ? votes.get(best) : 0 };
}

export const answeredCount = (check, answers) =>
  check.questions.filter((q) => q.options.some((o) => o.id === answers[q.id])).length;

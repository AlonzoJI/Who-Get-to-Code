// A complete, valid set of answers for the educator form tests.
export const validAnswers = () => ({
  role: 'cs-teacher',
  state: 'OH',
  schoolSector: 'public',
  schoolLocale: 'rural',
  gradeBands: ['9-12'],
  courses: ['ap-csp', 'ap-csa'],
  shares: { girls: 'under-25', studentsOfColor: '25-49', lowIncome: 'not-sure' },
  barriers: ['scheduling', 'belonging'],
  changedSince2025: 'yes',
  changeDetails: 'Our summer camp lost its grant.',
  whatWorked: 'Inviting every student in Algebra I to an open lab.',
  consentToPublish: true,
});

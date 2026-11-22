// Answer options for "Share from your classroom". Shared by the server
// (lib/educator.js validates against these ids) and the browser form
// (src/classroom/form.js renders these labels), so the two never drift apart.
// Changing an id changes what is stored; add new ids instead of renaming.

export const FORM_VERSION = 1;

export const ROLES = [
  { id: 'cs-teacher', label: 'Computer Science teacher' },
  { id: 'other-teacher', label: 'Teacher of another subject' },
  { id: 'counselor', label: 'School counselor' },
  { id: 'administrator', label: 'Administrator' },
];

export const SECTORS = [
  { id: 'public', label: 'Public' },
  { id: 'charter', label: 'Public charter' },
  { id: 'private', label: 'Private or independent' },
];

export const LOCALES = [
  { id: 'rural', label: 'Rural' },
  { id: 'suburban', label: 'Suburban' },
  { id: 'urban', label: 'Urban' },
];

export const GRADE_BANDS = [
  { id: 'k-5', label: 'K-5' },
  { id: '6-8', label: '6-8' },
  { id: '9-12', label: '9-12' },
];

// "none" can't be combined with any other course.
export const COURSES = [
  { id: 'none', label: 'No computer science courses' },
  { id: 'intro', label: 'An introductory or exploratory CS course' },
  { id: 'ap-csp', label: 'AP Computer Science Principles' },
  { id: 'ap-csa', label: 'AP Computer Science A' },
  { id: 'elective', label: 'Other CS electives, such as web design, game design or robotics' },
  { id: 'cte', label: 'A career-tech (CTE) computing pathway' },
  { id: 'dual', label: 'Dual enrollment or college-credit CS' },
  { id: 'ib', label: 'IB Computer Science' },
  { id: 'integrated', label: 'CS taught inside other classes' },
  { id: 'other', label: 'Something else' },
];

export const SHARE_GROUPS = [
  { id: 'girls', label: 'Girls' },
  { id: 'studentsOfColor', label: 'Students of color' },
  { id: 'lowIncome', label: 'Low-income students' },
];

export const SHARE_RANGES = [
  { id: 'under-25', label: 'Under 25%' },
  { id: '25-49', label: '25 to 49%' },
  { id: '50-74', label: '50 to 74%' },
  { id: '75-plus', label: '75% or more' },
  { id: 'not-sure', label: 'Not sure' },
];

export const BARRIERS = [
  { id: 'no-teacher', label: 'No teacher trained or certified to teach CS' },
  { id: 'not-offered', label: 'The course is not offered, or not every year' },
  { id: 'scheduling', label: 'Scheduling conflicts with required courses' },
  { id: 'prerequisites', label: 'Math prerequisites or placement rules' },
  { id: 'recommendations', label: 'Who gets recommended or encouraged to enroll' },
  { id: 'belonging', label: 'Students do not see themselves in CS' },
  { id: 'awareness', label: 'Students and families do not know the course exists' },
  { id: 'resources', label: 'Funding, devices or internet access' },
  { id: 'graduation', label: 'CS does not count toward graduation requirements' },
  { id: 'other', label: 'Something else' },
];

export const CHANGED = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
  { id: 'not-sure', label: 'Not sure' },
];

// States, the public-count threshold and label helpers are shared with the
// outreach form (lib/shared-options.js).
export { STATES, MIN_PUBLIC_COUNT, ids, labelOf } from './shared-options.js';

// Text limits, in characters after HTML is stripped.
export const LIMITS = { long: 2000, other: 200, name: 100, school: 150, email: 254 };


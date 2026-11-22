// Choices for the STEM outreach directory, shared by the form, the directory
// page and the API so labels and filter rules never drift apart.
// Pure JS with no Node imports, so the browser bundle can import it too.

export const GRADE_BANDS = [
  { id: 'elementary', label: 'Elementary (K-5)' },
  { id: 'middle', label: 'Middle school (6-8)' },
  { id: 'high', label: 'High school (9-12)' },
  { id: 'college', label: 'College and adult' },
];

export const FORMATS = [
  { id: 'after-school', label: 'After school' },
  { id: 'summer-camp', label: 'Summer camp' },
  { id: 'weekend', label: 'Weekend' },
  { id: 'mentorship', label: 'Mentorship' },
  { id: 'online', label: 'Online' },
  { id: 'in-school', label: 'In school' },
];

export const COSTS = [
  { id: 'free', label: 'Free' },
  { id: 'low-cost', label: 'Low cost' },
  { id: 'paid', label: 'Paid' },
];

// The cost filter also offers "scholarships", which matches the separate checkbox.
export const COST_FILTERS = [...COSTS, { id: 'scholarships', label: 'Scholarships available' }];

export const FUNDING_ANSWERS = [
  { id: 'yes', label: 'Yes, it changed' },
  { id: 'no', label: 'No change' },
  { id: 'not-sure', label: 'Not sure' },
];

// "US" means the program serves students nationwide, usually online.
export const NATIONWIDE = 'US';
export const STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
  ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'],
  ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'],
  ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'],
  ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'],
  ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'], ['PR', 'Puerto Rico'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
  ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'],
  ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
].map(([id, label]) => ({ id, label }));
export const REGIONS = [{ id: NATIONWIDE, label: 'Nationwide (online)' }, ...STATES];

export const ids = (list) => list.map((o) => o.id);
export const labelFor = (list, id) => list.find((o) => o.id === id)?.label ?? id;

// Counts under this are never shown publicly (CLAUDE.md).
export const MIN_PUBLIC_COUNT = 10;

// One rule for "does this listing match these filters", used by the API and the page.
// A state filter also matches nationwide programs, since those students can join too.
export function matchesFilters(listing, { state, grade, format, cost, q } = {}) {
  if (state && listing.state !== state && listing.state !== NATIONWIDE) return false;
  if (grade && !listing.gradeBands?.includes(grade)) return false;
  if (format && !listing.formats?.includes(format)) return false;
  if (cost === 'scholarships' ? !listing.scholarships : cost && listing.cost !== cost) return false;
  if (q) {
    const haystack = [listing.programName, listing.organization, listing.audience, listing.city, listing.howToConnect]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!q.toLowerCase().trim().split(/\s+/).every((word) => haystack.includes(word))) return false;
  }
  return true;
}

// Counts of "has your funding or partnerships changed since 2025" across approved
// listings. Any count under 10 is hidden. When exactly one count is hidden, the
// next smallest is hidden too, so the hidden one can't be worked out by subtracting
// from the number of listed programs.
export function fundingSummary(answers) {
  const rows = FUNDING_ANSWERS.map(({ id, label }) => ({
    answer: id,
    label,
    count: answers.filter((a) => a === id).length,
  }));
  const hidden = new Set(rows.filter((r) => r.count < MIN_PUBLIC_COUNT).map((r) => r.answer));
  if (hidden.size === 1) {
    const nextSmallest = rows.filter((r) => !hidden.has(r.answer)).sort((a, b) => a.count - b.count)[0];
    hidden.add(nextSmallest.answer);
  }
  return {
    total: answers.length,
    rows: rows.map((r) => (hidden.has(r.answer) ? { ...r, count: null, suppressed: true } : { ...r, suppressed: false })),
  };
}

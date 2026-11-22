// Private review page. Everything a visitor submitted is put on the page with
// textContent, never innerHTML. The password goes only to POST /api/admin/login;
// the session is an HttpOnly cookie this script cannot read.
import '../styles/admin.css';
import * as edu from '../../lib/educator-form.js';
import * as out from '../../lib/outreach-options.js';

const root = document.getElementById('admin-app');
const API = '/api/admin';

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
};
const labels = (list, ids = []) => (ids ?? []).map((id) => (list.find((o) => o.id === id)?.label ?? id)).join(', ') || 'None';
const count = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;
const date = (iso) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  return { status: res.status, data };
}

// ── sign in ───────────────────────────────────────────────
function showLogin(message) {
  const status = el('p', { className: 'ad-status', role: 'alert' }, message ?? '');
  const input = el('input', { type: 'password', id: 'ad-password', name: 'password', autocomplete: 'current-password', required: true });
  const form = el('form', { className: 'ad-login' },
    el('label', { htmlFor: 'ad-password' }, 'Admin password'),
    input,
    el('button', { type: 'submit', className: 'btn primary' }, 'Sign in'),
    status,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = 'Signing in…';
    const { status: code, data } = await api('/login', { method: 'POST', body: { password: input.value } });
    input.value = '';
    if (code === 200) return showQueue();
    status.textContent = data?.error ?? 'Sign-in failed';
  });
  root.replaceChildren(form);
  input.focus();
}

// ── queue ─────────────────────────────────────────────────
async function showQueue() {
  root.replaceChildren(el('p', { className: 'ad-status' }, 'Loading…'));
  const { status, data } = await api('/pending');
  if (status === 401) return showLogin();
  if (status !== 200) return root.replaceChildren(el('p', { className: 'ad-status', role: 'alert' }, data?.error ?? 'Could not load submissions'));

  const live = el('p', { className: 'ad-live', role: 'status' });
  const exportBtn = el('button', { type: 'button', className: 'btn' }, 'Export approved as JSON');
  const signOut = el('button', { type: 'button', className: 'btn text' }, 'Sign out');
  exportBtn.addEventListener('click', () => exportApproved(live));
  signOut.addEventListener('click', async () => {
    await api('/login', { method: 'DELETE' });
    showLogin('Signed out.');
  });

  const eduList = el('ol', { className: 'ad-list' }, data.educator.map((d) => educatorCard(d, live)));
  const outList = el('ol', { className: 'ad-list' }, data.outreach.map((d) => outreachCard(d, live)));

  root.replaceChildren(
    el('div', { className: 'ad-bar' }, el('p', {}, `${count(data.educator.length, 'educator submission')} and ${count(data.outreach.length, 'outreach program')} waiting`), exportBtn, signOut),
    live,
    el('section', { 'aria-labelledby': 'ad-edu' },
      el('h2', { id: 'ad-edu' }, `Share from your classroom (${data.educator.length} pending)`),
      data.educator.length ? eduList : el('p', { className: 'ad-empty' }, 'Nothing waiting.')),
    el('section', { 'aria-labelledby': 'ad-out' },
      el('h2', { id: 'ad-out' }, `Outreach directory (${data.outreach.length} pending)`),
      data.outreach.length ? outList : el('p', { className: 'ad-empty' }, 'Nothing waiting.')),
  );
}

async function exportApproved(live) {
  const res = await fetch(`${API}/export`, { credentials: 'same-origin' });
  if (res.status === 401) return showLogin('Your session ended. Sign in again.');
  if (!res.ok) return (live.textContent = 'Export failed.');
  const blob = await res.blob();
  const name = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'approved-submissions.json';
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  live.textContent = `Downloaded ${name}.`;
}

// ── shared card pieces ────────────────────────────────────
const row = (term, value) => [el('dt', {}, term), el('dd', {}, value || '—')];

function editField(name, label, value, { long = false } = {}) {
  const id = `f-${name.replace('.', '-')}-${Math.random().toString(36).slice(2, 8)}`;
  const input = long
    ? el('textarea', { id, rows: 4, value: value ?? '' })
    : el('input', { id, type: 'text', value: value ?? '' });
  input.dataset.field = name;
  input.dataset.original = value ?? '';
  return el('div', { className: 'ad-edit' }, el('label', { htmlFor: id }, label), input);
}

const editsFrom = (card) =>
  Object.fromEntries(
    [...card.querySelectorAll('[data-field]')]
      .filter((i) => i.value !== i.dataset.original)
      .map((i) => [i.dataset.field, i.value])
  );

function actions(card, item, collection, live, { quotePicker } = {}) {
  const approve = el('button', { type: 'button', className: 'btn primary' }, 'Approve');
  const save = el('button', { type: 'button', className: 'btn' }, 'Save edits only');
  const reject = el('button', { type: 'button', className: 'btn text ad-reject' }, 'Reject');
  const msg = el('p', { className: 'ad-msg', role: 'status' });

  async function run(action) {
    if (action === 'reject' && !confirm('Reject this submission? It will stay off the site.')) return;
    [approve, save, reject].forEach((b) => (b.disabled = true));
    msg.textContent = 'Saving…';
    const body = { collection, id: item._id, action, edits: editsFrom(card) };
    if (quotePicker && action === 'approve') body.quoteField = quotePicker() || null;
    const { status, data } = await api('/moderate', { method: 'POST', body });
    if (status === 401) return showLogin('Your session ended. Sign in again.');
    if (status !== 200) {
      msg.textContent = data?.error ?? 'That did not work.';
      [approve, save, reject].forEach((b) => (b.disabled = false));
      return;
    }
    if (action === 'edit') {
      card.querySelectorAll('[data-field]').forEach((i) => (i.dataset.original = i.value));
      msg.textContent = 'Edits saved and logged.';
      [approve, save, reject].forEach((b) => (b.disabled = false));
      return;
    }
    live.textContent = `${action === 'approve' ? 'Approved' : 'Rejected'}: ${card.dataset.title}.`;
    card.remove();
  }
  approve.addEventListener('click', () => run('approve'));
  save.addEventListener('click', () => run('edit'));
  reject.addEventListener('click', () => run('reject'));
  return el('div', { className: 'ad-actions' }, approve, save, reject, msg);
}

// ── educator submission ───────────────────────────────────
function educatorCard(d, live) {
  const title = `${labels(edu.ROLES, [d.role])}, ${labels(edu.STATES, [d.state])}`;
  const card = el('li', { className: 'ad-card' });
  card.dataset.title = title;

  const shares = edu.SHARE_GROUPS.map((g) => `${g.label}: ${labels(edu.SHARE_RANGES, [d.shares?.[g.id]])}`).join('; ');
  const facts = el('dl', { className: 'ad-facts' },
    row('School', `${labels(edu.SECTORS, [d.schoolSector])}, ${labels(edu.LOCALES, [d.schoolLocale])}`),
    row('Grades', labels(edu.GRADE_BANDS, d.gradeBands)),
    row('Courses', labels(edu.COURSES, d.courses)),
    row('Shares in CS', shares),
    row('Barriers', labels(edu.BARRIERS, d.barriers)),
    row('Changed since 2025', labels(edu.CHANGED, [d.changedSince2025])),
    row('Consent to publish', d.consentToPublish ? 'Yes' : 'No'),
  );

  const edits = el('div', { className: 'ad-edits' },
    d.courses?.includes('other') ? editField('coursesOther', 'Other course', d.coursesOther) : null,
    d.barriers?.includes('other') ? editField('barriersOther', 'Other barrier', d.barriersOther) : null,
    editField('changeDetails', 'What changed', d.changeDetails, { long: true }),
    editField('whatWorked', 'What has worked', d.whatWorked, { long: true }),
  );

  // Which answer, if any, becomes the public quote card.
  const group = `quote-${d._id}`;
  const options = [['', 'No quote'], ['whatWorked', 'What has worked'], ['changeDetails', 'What changed']];
  const quote = el('fieldset', { className: 'ad-quote' },
    el('legend', {}, 'Quote card on From the classroom'),
    options.map(([value, text], i) => {
      const input = el('input', { type: 'radio', name: group, value, id: `${group}-${i}`, checked: i === 0 });
      return el('label', { htmlFor: input.id }, input, ` ${text}`);
    }),
  );
  const syncQuote = () => {
    for (const input of quote.querySelectorAll('input[value]:not([value=""])')) {
      const box = edits.querySelector(`[data-field="${input.value}"]`);
      input.disabled = !box?.value.trim();
      if (input.disabled && input.checked) quote.querySelector('input[value=""]').checked = true;
    }
  };
  edits.addEventListener('input', syncQuote);
  syncQuote();

  const contact = el('div', { className: 'ad-contact' },
    el('h4', {}, 'Contact (private, only on this page)'),
    el('dl', { className: 'ad-facts' },
      row('Email', d.contactEmail),
      row('Name shown publicly?', d.showNameAndSchool ? 'Yes, with a quote' : 'No'),
    ),
    el('div', { className: 'ad-edits' },
      editField('contact.name', 'Name', d.contact?.name),
      editField('contact.school', 'School', d.contact?.school),
    ),
  );

  card.append(
    el('header', {}, el('h3', {}, title), el('p', { className: 'ad-meta' }, `Submitted ${date(d.createdAt)} · ${d._id}`)),
    facts, edits, quote, contact,
    actions(card, d, 'educator', live, { quotePicker: () => quote.querySelector('input:checked')?.value }),
  );
  return card;
}

// ── outreach program ──────────────────────────────────────
function outreachCard(d, live) {
  const card = el('li', { className: 'ad-card' });
  card.dataset.title = d.programName;
  const web = el('a', { href: /^https?:\/\//.test(d.website) ? d.website : '#', rel: 'noopener noreferrer', target: '_blank' }, d.website);

  const facts = el('dl', { className: 'ad-facts' },
    row('Website', web),
    row('Grades', labels(out.GRADE_BANDS, d.gradeBands)),
    row('Where', labels(out.REGIONS, [d.state])),
    row('Format', labels(out.FORMATS, d.formats)),
    row('Cost', `${labels(out.COSTS, [d.cost])}${d.scholarships ? ', scholarships available' : ''}`),
    row('Funding changed since 2025 (private)', labels(out.FUNDING_ANSWERS, [d.fundingChange])),
    row('Consent to list', d.consentToPublish ? 'Yes' : 'No'),
  );
  const edits = el('div', { className: 'ad-edits' },
    editField('programName', 'Program name', d.programName),
    editField('organization', 'Organization', d.organization),
    editField('city', 'City', d.city),
    editField('audience', 'Who it serves', d.audience, { long: true }),
    editField('howToConnect', 'How to connect students', d.howToConnect, { long: true }),
    editField('fundingDetails', 'Funding details (private)', d.fundingDetails, { long: true }),
  );
  const contact = el('div', { className: 'ad-contact' },
    el('h4', {}, 'Contact (private, only on this page)'),
    el('dl', { className: 'ad-facts' }, row('Email', d.contactEmail)),
    el('div', { className: 'ad-edits' }, editField('contactName', 'Name', d.contactName)),
  );

  card.append(
    el('header', {}, el('h3', {}, d.programName), el('p', { className: 'ad-meta' }, `${d.organization} · submitted ${date(d.createdAt)} · ${d._id}`)),
    facts, edits, contact,
    actions(card, d, 'outreach', live),
  );
  return card;
}

// ── start ─────────────────────────────────────────────────
if (root) {
  api('/session').then(({ status, data }) => {
    if (status === 200) return showQueue();
    if (status === 503) return root.replaceChildren(el('p', { className: 'ad-status', role: 'alert' }, data?.error ?? 'Admin is unavailable.'));
    showLogin();
  });
}

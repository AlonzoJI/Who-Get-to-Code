// "Share from your classroom": the educator form, one section at a time, in
// the same step card as the self-check. Answers stay in this module's memory
// until the last step sends them to POST /api/submissions/educator, which
// validates everything again and saves the response as pending.
import '../styles/self-check.css';
import '../styles/classroom.css';
import {
  BARRIERS, CHANGED, COURSES, GRADE_BANDS, LIMITS, LOCALES, ROLES, SECTORS, SHARE_GROUPS, SHARE_RANGES, STATES,
} from '../../lib/educator-form.js';

const ENDPOINT = '/api/submissions/educator';
const HONEYPOT = 'homepage';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

const blank = () => ({
  role: '', state: '', schoolSector: '', schoolLocale: '', gradeBands: [], courses: [], coursesOther: '',
  shares: {}, barriers: [], barriersOther: '', changedSince2025: '', changeDetails: '', whatWorked: '',
  name: '', school: '', email: '', showNameAndSchool: false, consentToPublish: false,
});

// Each step lists its fields. `check` returns an error message or ''.
const STEPS = [
  {
    title: 'Your role and state',
    fields: [
      { type: 'radio', name: 'role', legend: 'What is your role?', options: ROLES, required: 'Pick your role.' },
      { type: 'select', name: 'state', label: 'State where your school is', options: STATES, required: 'Pick your state.' },
    ],
  },
  {
    title: 'Your school',
    fields: [
      { type: 'radio', name: 'schoolSector', legend: 'What kind of school is it?', options: SECTORS, inline: true, required: 'Pick a school type.' },
      { type: 'radio', name: 'schoolLocale', legend: 'Where is it?', options: LOCALES, inline: true, required: 'Pick rural, suburban or urban.' },
      { type: 'check', name: 'gradeBands', legend: 'Which grades does it serve?', hint: 'Pick all that apply.', options: GRADE_BANDS, inline: true, required: 'Pick at least one grade band.' },
    ],
  },
  {
    title: 'Which Computer Science courses does your school offer?',
    fields: [
      { type: 'check', name: 'courses', hint: 'Pick all that apply.', options: COURSES, cols: true, exclusive: 'none', required: 'Pick at least one, or No computer science courses.' },
      { type: 'text', name: 'coursesOther', label: 'Which other course?', max: LIMITS.other, showWhen: ['courses', 'other'], required: 'Say which other course.' },
    ],
  },
  {
    title: 'Roughly what share of your CS students are...',
    intro: 'A rough range is enough. Please do not look up or share exact counts.',
    fields: [{ type: 'scale', name: 'shares', groups: SHARE_GROUPS, options: SHARE_RANGES, required: 'Pick a range, or Not sure, for each group.' }],
  },
  {
    title: 'What are the biggest barriers to CS participation at your school?',
    fields: [
      { type: 'check', name: 'barriers', hint: 'Pick all that apply, or skip this question.', options: BARRIERS, cols: true },
      { type: 'text', name: 'barriersOther', label: 'What is the other barrier?', max: LIMITS.other, showWhen: ['barriers', 'other'], required: 'Say what the other barrier is.' },
    ],
  },
  {
    title: 'Has anything changed since 2025 because of DEI rollbacks, funding or policy?',
    fields: [
      { type: 'radio', name: 'changedSince2025', options: CHANGED, inline: true, required: 'Pick yes, no or not sure.' },
      { type: 'textarea', name: 'changeDetails', label: 'What changed? (optional)', hint: 'For example a program that ended, a grant that was cut or a rule your district changed.', max: LIMITS.long },
    ],
  },
  {
    title: 'What has worked to bring more students into CS?',
    fields: [
      { type: 'textarea', name: 'whatWorked', label: 'Your answer (optional)', hint: 'Recruiting, scheduling, partnerships, anything you have seen make a difference.', max: LIMITS.long },
    ],
  },
  {
    title: 'About you, and consent',
    intro: 'Everything on this step is optional except the consent box.',
    fields: [
      { type: 'text', name: 'name', label: 'Your name (optional)', max: LIMITS.name, autocomplete: 'name' },
      { type: 'text', name: 'school', label: 'Your school (optional)', max: LIMITS.school, autocomplete: 'organization' },
      { type: 'email', name: 'email', label: 'Email for follow-up (optional, never shown)', max: LIMITS.email, autocomplete: 'email' },
      { type: 'flag', name: 'showNameAndSchool', label: 'My name and school may be shown next to a quote from my answers.', note: 'Leave this unchecked to stay anonymous.' },
      { type: 'consent' },
    ],
  },
];

const fieldStep = Object.fromEntries(STEPS.flatMap((s, i) => s.fields.filter((f) => f.name).map((f) => [f.name, i])));
fieldStep.consentToPublish = STEPS.length - 1;

function optionRow(type, name, o, checked, idPrefix = name) {
  const id = `cf-${idPrefix}-${o.id}`;
  const input = Object.assign(document.createElement('input'), { type, name: idPrefix, id, value: o.id, checked });
  const label = el('label', 'sc-option');
  label.htmlFor = id;
  label.append(input, el('span', null, o.label));
  return label;
}

export function mountClassroomForm(root) {
  let answers = blank();
  let step = 0;
  const total = STEPS.length;

  root.replaceChildren();
  root.classList.add('sc', 'cf');

  const bar = el('div', 'sc-bar');
  const progress = el('ol', 'sc-progress');
  progress.setAttribute('aria-hidden', 'true');
  const pips = STEPS.map(() => progress.appendChild(el('li')));
  const stepLabel = el('span', 'sc-step');
  stepLabel.setAttribute('aria-live', 'polite');
  bar.append(el('span', 'label', 'Share from your classroom'), progress, stepLabel);
  const body = el('div', 'sc-body');
  root.append(bar, body);

  const visible = (f) => !f.showWhen || answers[f.showWhen[0]].includes(f.showWhen[1]);

  function checkStep(i) {
    for (const f of STEPS[i].fields) {
      if (!visible(f)) continue;
      const v = answers[f.name];
      if (f.type === 'scale' && SHARE_GROUPS.some((g) => !answers.shares[g.id])) return { field: f, message: f.required };
      if (f.type === 'consent' && !answers.consentToPublish) return { field: f, message: 'Check the consent box to send your answers.' };
      if (f.required && (Array.isArray(v) ? v.length === 0 : !String(v ?? '').trim())) return { field: f, message: f.required };
      if (f.type === 'email' && v.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return { field: f, message: 'Enter a valid email address, or leave it blank.' };
    }
    return null;
  }

  function renderField(f, form) {
    const wrap = el('div', 'cf-group');
    const hint = f.hint ? el('p', 'cf-hint', f.hint) : null;
    if (hint) hint.id = `cf-${f.name ?? f.type}-hint`;

    if (f.type === 'radio' || f.type === 'check') {
      const fs = el('fieldset');
      fs.dataset.field = f.name;
      if (f.legend) fs.append(el('legend', 'cf-legend', f.legend));
      else fs.setAttribute('aria-labelledby', 'cf-step-title');
      if (hint) { fs.append(hint); fs.setAttribute('aria-describedby', hint.id); }
      const list = el('div', `sc-options${f.cols ? ' cf-cols' : ''}${f.inline ? ' cf-inline' : ''}`);
      for (const o of f.options) {
        const checked = f.type === 'radio' ? answers[f.name] === o.id : answers[f.name].includes(o.id);
        list.append(optionRow(f.type === 'radio' ? 'radio' : 'checkbox', f.name, o, checked));
      }
      fs.append(list);
      fs.addEventListener('change', (e) => {
        if (f.type === 'radio') answers[f.name] = e.target.value;
        else {
          const boxes = [...list.querySelectorAll('input')];
          if (f.exclusive && e.target.checked) {
            for (const b of boxes) {
              if (e.target.value === f.exclusive ? b !== e.target : b.value === f.exclusive) b.checked = false;
            }
          }
          answers[f.name] = boxes.filter((b) => b.checked).map((b) => b.value);
        }
        form.dispatchEvent(new Event('answers'));
      });
      wrap.append(fs);
    } else if (f.type === 'select') {
      const label = el('label', 'cf-label', f.label);
      label.htmlFor = `cf-${f.name}`;
      const select = Object.assign(document.createElement('select'), { id: `cf-${f.name}`, name: f.name, className: 'cf-select' });
      select.dataset.field = f.name;
      select.append(Object.assign(document.createElement('option'), { value: '', textContent: 'Choose a state' }));
      for (const o of f.options) select.append(Object.assign(document.createElement('option'), { value: o.id, textContent: o.label, selected: answers[f.name] === o.id }));
      select.addEventListener('change', () => { answers[f.name] = select.value; form.dispatchEvent(new Event('answers')); });
      wrap.append(label, select);
    } else if (f.type === 'scale') {
      const fs = el('fieldset');
      fs.dataset.field = f.name;
      fs.setAttribute('aria-labelledby', 'cf-step-title');
      for (const g of f.groups) {
        const row = el('fieldset', 'cf-scale');
        row.append(el('legend', null, g.label));
        const list = el('div', 'sc-options');
        for (const o of f.options) list.append(optionRow('radio', g.id, o, answers.shares[g.id] === o.id, `share-${g.id}`));
        row.append(list);
        row.addEventListener('change', (e) => { answers.shares[g.id] = e.target.value; form.dispatchEvent(new Event('answers')); });
        fs.append(row);
      }
      wrap.append(fs);
    } else if (f.type === 'text' || f.type === 'email' || f.type === 'textarea') {
      const id = `cf-${f.name}`;
      const label = el('label', 'cf-label', f.label);
      label.htmlFor = id;
      const input = f.type === 'textarea'
        ? Object.assign(document.createElement('textarea'), { rows: 5, className: 'sc-note cf-long' })
        : Object.assign(document.createElement('input'), { type: f.type, className: 'cf-input' });
      Object.assign(input, { id, name: f.name, value: answers[f.name], maxLength: f.max });
      input.dataset.field = f.name;
      input.setAttribute('autocomplete', f.autocomplete ?? 'off');
      if (hint) input.setAttribute('aria-describedby', hint.id);
      input.addEventListener('input', () => { answers[f.name] = input.value; });
      wrap.append(label);
      if (hint) wrap.append(hint);
      wrap.append(input);
      if (f.showWhen) {
        const sync = () => { wrap.hidden = !visible(f); };
        form.addEventListener('answers', sync);
        sync();
      }
    } else if (f.type === 'flag') {
      const box = el('div', 'sc-options cf-consent');
      const row = optionRow('checkbox', f.name, { id: 'yes', label: f.label }, answers[f.name]);
      row.querySelector('span').append(el('small', null, f.note));
      row.querySelector('input').addEventListener('change', (e) => { answers[f.name] = e.target.checked; });
      box.append(row);
      wrap.append(box);
    } else if (f.type === 'consent') {
      const box = el('div', 'sc-options cf-consent');
      box.dataset.field = 'consentToPublish';
      const row = optionRow('checkbox', 'consentToPublish', { id: 'yes', label: '' }, answers.consentToPublish);
      const text = row.querySelector('span');
      text.append('I agree that my answers may be published on this site in summary form, after review.');
      text.append(el('span', 'cf-req', 'Required'));
      text.append(el('small', null, 'Summary form means counts across many responses, with any count under 10 hidden, and possibly a short quote from my written answers.'));
      row.querySelector('input').addEventListener('change', (e) => { answers.consentToPublish = e.target.checked; });
      box.append(row);

      // Honeypot. People never see it; bots that fill every field get caught.
      const hp = el('div', 'cf-hp');
      hp.setAttribute('aria-hidden', 'true');
      const hpLabel = el('label', null, 'Leave this field empty');
      const hpInput = Object.assign(document.createElement('input'), { type: 'text', name: HONEYPOT, tabIndex: -1 });
      hpInput.setAttribute('autocomplete', 'off');
      hpLabel.append(hpInput);
      hp.append(hpLabel);
      wrap.append(box, hp);
    }
    return wrap;
  }

  function markInvalid(form, field) {
    form.querySelectorAll('[aria-invalid]').forEach((n) => n.removeAttribute('aria-invalid'));
    const name = field?.type === 'consent' ? 'consentToPublish' : field?.name;
    const target = name && form.querySelector(`[data-field="${name}"]`);
    if (!target) return;
    target.setAttribute('aria-invalid', 'true');
    const focusable = target.matches('input, select, textarea') ? target : target.querySelector('input:not(:checked), input');
    focusable?.focus();
  }

  function render({ focus = true, issues } = {}) {
    const s = STEPS[step];
    stepLabel.textContent = `Section ${step + 1} of ${total}`;
    pips.forEach((p, i) => { p.className = i < step ? 'done' : i === step ? 'on' : ''; });

    const form = el('form', 'sc-q');
    form.noValidate = true;
    form.setAttribute('autocomplete', 'on');
    const heading = el('h2', 'sc-question', s.title);
    heading.id = 'cf-step-title';
    heading.tabIndex = -1;
    form.append(heading);
    if (s.intro) form.append(el('p', 'cf-hint', s.intro));
    for (const f of s.fields) form.append(renderField(f, form));

    const error = el('p', 'sc-error');
    error.setAttribute('role', 'alert');
    const issueList = el('ul', 'cf-issues');
    if (issues?.length) {
      error.textContent = 'Some answers need another look before they can be sent:';
      for (const issue of issues) {
        const li = el('li');
        const target = fieldStep[issue.path.split('.')[0]];
        if (target != null && target !== step) {
          const go = el('button', null, `Section ${target + 1}: ${issue.message}`);
          go.type = 'button';
          go.addEventListener('click', () => { step = target; render(); });
          li.append(go);
        } else li.textContent = issue.message;
        issueList.append(li);
      }
    }

    const actions = el('div', 'sc-actions');
    const back = el('button', 'btn text', 'Back');
    back.type = 'button';
    back.disabled = step === 0;
    const next = el('button', 'btn primary', step === total - 1 ? 'Send my answers' : 'Next');
    next.type = 'submit';
    actions.append(back, next);
    form.append(error, issueList, actions);
    body.replaceChildren(form);

    back.addEventListener('click', () => { step -= 1; render(); });
    form.addEventListener('answers', () => { error.textContent = ''; markInvalid(form, null); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const problem = checkStep(step);
      if (problem) {
        error.textContent = problem.message;
        issueList.replaceChildren();
        markInvalid(form, problem.field);
        return;
      }
      if (step < total - 1) {
        step += 1;
        return render();
      }
      next.disabled = true;
      next.textContent = 'Sending...';
      await send(form.querySelector(`[name="${HONEYPOT}"]`)?.value ?? '', { error, next });
    });

    if (focus) heading.focus({ preventScroll: false });
  }

  async function send(honeypot, { error, next }) {
    const payload = { ...answers, [HONEYPOT]: honeypot };
    if (!answers.courses.includes('other')) payload.coursesOther = '';
    if (!answers.barriers.includes('other')) payload.barriersOther = '';
    let res, reply;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      reply = await res.json().catch(() => ({}));
    } catch {
      res = null;
    }
    if (res?.ok) return renderDone();
    next.disabled = false;
    next.textContent = 'Send my answers';
    if (res?.status === 400 && reply.issues) return render({ issues: reply.issues });
    error.textContent = res?.status === 429
      ? 'Too many responses have come from this connection in the last hour. Your answers are still here; please try again later.'
      : 'Your answers could not be sent right now. They are still here; please try again in a few minutes.';
  }

  function renderDone() {
    stepLabel.textContent = 'Sent';
    pips.forEach((p) => { p.className = 'done'; });
    answers = blank();
    const wrap = el('div', 'cf-done');
    const heading = el('h2', 'sc-question', 'Thank you. Your response was received.');
    heading.tabIndex = -1;
    wrap.append(el('span', 'pill', 'Pending review'), heading);
    wrap.append(el('p', null, 'Every response is read and reviewed before anything appears on this site. Nothing you wrote is public yet.'));
    wrap.append(el('p', null, 'If it is approved, your answers are added to the summary counts, and a short quote may appear as a card. Your name and school appear only if you said they could. Your email is never shown.'));
    const group = el('div', 'btn-group');
    const see = el('a', 'btn', 'See what educators have shared');
    see.href = 'from-the-classroom.html';
    const again = el('button', 'btn text', 'Send another response');
    again.type = 'button';
    again.addEventListener('click', () => { step = 0; render(); });
    group.append(see, again);
    wrap.append(group);
    body.replaceChildren(wrap);
    heading.focus();
  }

  render({ focus: false });
}

const root = document.getElementById('classroom-form');
if (root) mountClassroomForm(root);

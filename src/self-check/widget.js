// Self-check: five reflection questions, one at a time, then a summary next to
// one research finding. Answers live only in this module's memory. Nothing is
// written to storage, cookies, the URL or the network, and a reload clears it.
import '../styles/self-check.css';
import check from '../../data/self-check.json';
import tracking from '../../data/tracking.json';
import { pickStudy } from './model.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

export function mountSelfCheck(root) {
  const total = check.questions.length;
  const state = { step: 0, answers: {}, notes: {} };

  root.replaceChildren();
  root.classList.add('sc');

  // top bar: progress + step counter + start over
  const bar = el('div', 'sc-bar');
  const progress = el('ol', 'sc-progress');
  progress.setAttribute('aria-hidden', 'true');
  const pips = check.questions.map(() => progress.appendChild(el('li')));
  const stepLabel = el('span', 'sc-step');
  stepLabel.setAttribute('aria-live', 'polite');
  const restart = el('button', 'btn text sm', 'Start over');
  restart.type = 'button';
  bar.append(el('span', 'label', 'Self-check'), progress, stepLabel, restart);

  const body = el('div', 'sc-body');
  root.append(bar, body);

  function renderQuestion({ focus = true } = {}) {
    const q = check.questions[state.step];
    stepLabel.textContent = `Question ${state.step + 1} of ${total}`;
    pips.forEach((p, i) => {
      p.className = i < state.step ? 'done' : i === state.step ? 'on' : '';
    });

    const form = el('form', 'sc-q');
    form.setAttribute('autocomplete', 'off');
    form.noValidate = true;

    const heading = el('h3', 'sc-question', q.text);
    heading.id = `sc-q-${q.id}`;
    heading.tabIndex = -1;

    const fieldset = el('fieldset', 'sc-options');
    fieldset.setAttribute('aria-labelledby', heading.id);
    for (const o of q.options) {
      const id = `sc-${q.id}-${o.id}`;
      const input = Object.assign(document.createElement('input'), {
        type: 'radio', name: q.id, id, value: o.id, checked: state.answers[q.id] === o.id,
      });
      input.setAttribute('autocomplete', 'off');
      const label = el('label', 'sc-option');
      label.htmlFor = id;
      label.append(input, el('span', null, o.label));
      fieldset.append(label);
    }

    const noteId = `sc-note-${q.id}`;
    const noteLabel = el('label', 'sc-note-label', 'A note for yourself (optional)');
    noteLabel.htmlFor = noteId;
    const note = Object.assign(document.createElement('textarea'), { id: noteId, rows: 2, value: state.notes[q.id] ?? '' });
    note.className = 'sc-note';
    note.setAttribute('autocomplete', 'off');
    note.setAttribute('spellcheck', 'false');

    const error = el('p', 'sc-error');
    error.setAttribute('role', 'alert');

    const actions = el('div', 'sc-actions');
    const back = el('button', 'btn text', 'Back');
    back.type = 'button';
    back.disabled = state.step === 0;
    const next = el('button', 'btn primary', state.step === total - 1 ? 'See my summary' : 'Next');
    next.type = 'submit';
    actions.append(back, next);

    form.append(heading, fieldset, noteLabel, note, error, actions);
    body.replaceChildren(form);

    fieldset.addEventListener('change', (e) => {
      state.answers[q.id] = e.target.value;
      error.textContent = '';
    });
    note.addEventListener('input', () => { state.notes[q.id] = note.value; });
    back.addEventListener('click', () => { state.step -= 1; renderQuestion(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!state.answers[q.id]) {
        error.textContent = 'Pick one answer to continue.';
        fieldset.querySelector('input')?.focus();
        return;
      }
      state.step += 1;
      state.step < total ? renderQuestion() : renderSummary();
    });

    if (focus) heading.focus({ preventScroll: true });
  }

  function renderSummary() {
    stepLabel.textContent = 'Summary';
    pips.forEach((p) => { p.className = 'done'; });

    const wrap = el('div', 'sc-summary');
    const heading = el('h3', 'sc-question', 'Your answers');
    heading.tabIndex = -1;

    const list = el('ol', 'sc-answers');
    for (const q of check.questions) {
      const option = q.options.find((o) => o.id === state.answers[q.id]);
      const li = el('li');
      li.append(el('span', 'sc-a-q', q.text), el('span', 'sc-a-a', option?.label ?? 'No answer'));
      const note = state.notes[q.id]?.trim();
      if (note) li.append(el('span', 'sc-a-note', note));
      list.append(li);
    }
    const left = el('div', 'sc-col');
    left.append(heading, list);

    const { study: studyId, votes } = pickStudy(check, state.answers);
    const study = tracking.studies.find((s) => s.id === studyId);
    const right = el('aside', 'sc-finding');
    right.setAttribute('aria-labelledby', 'sc-finding-title');
    right.append(el('span', 'label', 'What the research found'));
    const title = el('h3', null, `${study.n} ${study.title}`);
    title.id = 'sc-finding-title';
    right.append(title, el('p', null, study.finding));
    right.append(el('p', 'sc-why', votes
      ? `${votes} of your answers point to this study.`
      : 'None of your answers pointed to one study, so this is the finding that applies to anyone who recommends students.'));
    const link = el('a', 'btn text sm', `Read card ${study.n} above`);
    link.href = `#study-${study.id}`;
    const arrow = el('span', 'arr', ' →');
    arrow.setAttribute('aria-hidden', 'true');
    link.append(arrow);
    right.append(link);

    const again = el('button', 'btn', 'Start over');
    again.type = 'button';
    again.addEventListener('click', reset);

    wrap.append(left, right);
    body.replaceChildren(wrap, el('div', 'sc-actions sc-end'));
    body.lastChild.append(again);
    heading.focus({ preventScroll: true });
  }

  function reset() {
    state.step = 0;
    state.answers = {};
    state.notes = {};
    renderQuestion();
  }
  restart.addEventListener('click', reset);

  // First render doesn't move focus away from wherever the reader is.
  renderQuestion({ focus: false });
}

const mount = document.getElementById('self-check-widget');
if (mount) mountSelfCheck(mount);

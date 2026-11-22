// Build-time markup for the "List your program" form on outreach.html
// (<!-- @outreach-form -->). Choices come from lib/outreach-options.js, the same
// lists the server validates against. The form posts normally without
// JavaScript; src/outreach/form.js upgrades it to a fetch with inline errors.
import { COSTS, FORMATS, FUNDING_ANSWERS, GRADE_BANDS, REGIONS } from './outreach-options.js';
import { HONEYPOT_FIELD } from './outreach.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const optional = '<span class="of-opt">Optional</span>';
const err = (name) => `<p class="of-error" id="err-${name}" data-error-for="${name}"></p>`;
const describedBy = (name, hint) => [hint ? `hint-${name}` : '', `err-${name}`].filter(Boolean).join(' ');

// control(attrs) returns the input, textarea or select with the shared attributes in place.
function field(name, label, control, { required = true, hint } = {}) {
  const attrs = `id="o-${name}" name="${name}" aria-describedby="${describedBy(name, hint)}"${required ? ' required' : ''}`;
  return `
      <div class="of-field" data-field="${name}">
        <label for="o-${name}">${esc(label)}${required ? '' : ` ${optional}`}</label>
        ${hint ? `<p class="of-hint" id="hint-${name}">${esc(hint)}</p>` : ''}
        ${control(attrs)}
        ${err(name)}
      </div>`;
}

const input = (name, label, { type = 'text', max, autocomplete = 'off', ...opts } = {}) =>
  field(name, label, (a) => `<input ${a} type="${type}" maxlength="${max}" autocomplete="${autocomplete}">`, opts);

const textarea = (name, label, { max, rows = 3, ...opts } = {}) =>
  field(name, label, (a) => `<textarea ${a} rows="${rows}" maxlength="${max}"></textarea>`, opts);

// Checkbox or radio group in a fieldset, so the legend labels the whole group.
function group(name, legend, options, { type = 'checkbox', required = true, hint } = {}) {
  return `
      <fieldset class="of-field of-group" data-field="${name}" aria-describedby="${describedBy(name, hint)}">
        <legend>${esc(legend)}${required ? '' : ` ${optional}`}</legend>
        ${hint ? `<p class="of-hint" id="hint-${name}">${esc(hint)}</p>` : ''}
        <div class="of-choices">${options
          .map(
            (o) => `
          <label class="of-choice"><input type="${type}" name="${name}" value="${esc(o.id)}"${
            type === 'radio' && required ? ' required' : ''
          }> <span>${esc(o.label)}</span></label>`
          )
          .join('')}
        </div>
        ${err(name)}
      </fieldset>`;
}

export function outreachForm() {
  const regions = REGIONS.map((r) => `<option value="${esc(r.id)}">${esc(r.label)}</option>`).join('');
  return `
    <form class="of" id="outreach-form" action="api/submissions/outreach" method="post" aria-labelledby="list-your-program">
      <div class="od-private of-use">
        <p><b>How your answers are used.</b> If you agree below, everything in "About the program" is shown on
          this page after the site owner reviews it. Your answer about funding changes is never shown with your
          program; it only counts toward the totals in the chart, and only when a total reaches 10. Your name and
          email are private and used only if we have a question about the listing.</p>
        <p>Please describe the program, not individual students. Don't include any student's name or details
          that could identify a student.</p>
        <p>Every field is required unless it says Optional.</p>
      </div>

      <fieldset class="of-section">
        <legend class="of-legend">About the program</legend>
        ${input('programName', 'Program name', { max: 120 })}
        ${input('organization', 'Organization that runs it', { max: 120, autocomplete: 'organization' })}
        ${input('website', 'Website', { type: 'url', max: 300, autocomplete: 'url', hint: 'For example https://example.org/program' })}
        ${group('gradeBands', 'Grade bands it serves', GRADE_BANDS, { hint: 'Choose all that apply.' })}
        ${textarea('audience', 'Who it serves', {
          max: 600,
          hint: 'In your own words: who can join, any eligibility rules, and who you hope to reach. The directory filters only by place, grade, format and cost.',
        })}
        <div class="of-row">
          ${field('state', 'State or region', (a) => `<select ${a}><option value="">Choose one</option>${regions}</select>`, {
            hint: 'Choose Nationwide (online) if students can join from anywhere.',
          })}
          ${input('city', 'City', { max: 80, required: false, autocomplete: 'address-level2', hint: 'Leave blank if it runs in many places or online.' })}
        </div>
        ${group('formats', 'Format', FORMATS, { hint: 'Choose all that apply.' })}
        ${group('cost', 'Cost for families', COSTS, { type: 'radio' })}
        <div class="of-field" data-field="scholarships">
          <label class="of-choice of-solo"><input type="checkbox" id="o-scholarships" name="scholarships" value="on"> <span>Scholarships or fee waivers are available</span></label>
        </div>
        ${textarea('howToConnect', 'How a teacher or counselor can connect students to it', {
          max: 1000,
          rows: 4,
          hint: 'Who to contact, how students sign up, deadlines, and whether a school can refer students.',
        })}
      </fieldset>

      <fieldset class="of-section">
        <legend class="of-legend">Since 2025 (private)</legend>
        ${group('fundingChange', 'Has the program’s funding or partnerships changed since 2025?', FUNDING_ANSWERS, {
          type: 'radio',
          hint: 'For example a grant ended, a sponsor left or a new partner joined. Only the totals are public.',
        })}
        ${textarea('fundingDetails', 'What changed?', { max: 1000, required: false, hint: 'Private. Helps the site owner understand the totals.' })}
      </fieldset>

      <fieldset class="of-section">
        <legend class="of-legend">Contact (private, never shown)</legend>
        <div class="of-row">
          ${input('contactName', 'Your name', { max: 120, autocomplete: 'name' })}
          ${input('contactEmail', 'Your email', { type: 'email', max: 254, autocomplete: 'email' })}
        </div>
      </fieldset>

      <div class="of-trap" aria-hidden="true">
        <label for="o-${HONEYPOT_FIELD}">Leave this field empty</label>
        <input type="text" id="o-${HONEYPOT_FIELD}" name="${HONEYPOT_FIELD}" tabindex="-1" autocomplete="off">
      </div>

      <div class="of-field of-consent" data-field="consentToPublish">
        <label class="of-choice"><input type="checkbox" id="o-consentToPublish" name="consentToPublish" value="on" required aria-describedby="err-consentToPublish">
          <span>I run or represent this program, and I agree to list it publicly on this site with the details
            under "About the program".</span></label>
        ${err('consentToPublish')}
      </div>

      <p class="of-status" id="of-status" role="status" aria-live="polite"></p>
      <div class="of-actions">
        <button class="btn primary" type="submit">Send for review</button>
        <span class="of-after">Nothing appears on the site until it is reviewed.</span>
      </div>
    </form>`;
}

// "List your program" form. Without JavaScript it posts normally and the server
// redirects back. With JavaScript it checks answers first, sends JSON and shows
// the server's field-level errors next to the fields they belong to.
const form = document.getElementById('outreach-form');
const status = document.getElementById('of-status');
const MULTI = ['gradeBands', 'formats'];
const CHOICE_MESSAGES = {
  gradeBands: 'Choose at least one grade band',
  formats: 'Choose at least one format',
  cost: 'Choose what the program costs',
  fundingChange: 'Choose yes, no or not sure',
};

if (form) {
  form.noValidate = true;

  const fieldBox = (name) => form.querySelector(`[data-field="${name}"]`);
  const controls = (name) => [...form.querySelectorAll(`[name="${name}"]`)];

  function setError(name, message) {
    const box = fieldBox(name);
    const slot = form.querySelector(`[data-error-for="${name}"]`);
    if (slot) slot.textContent = message ?? '';
    box?.classList.toggle('has-error', Boolean(message));
    for (const c of controls(name)) {
      if (message) c.setAttribute('aria-invalid', 'true');
      else c.removeAttribute('aria-invalid');
    }
  }

  function clearErrors() {
    for (const slot of form.querySelectorAll('[data-error-for]')) setError(slot.dataset.errorFor, null);
  }

  // Quick checks before sending. The server repeats every rule.
  function checkLocally() {
    const errors = {};
    for (const c of form.querySelectorAll('input[required], textarea[required], select[required]')) {
      if (c.type === 'radio' || c.type === 'checkbox') continue;
      if (!c.value.trim()) errors[c.name] = 'This field is required';
      else if (c.type === 'email' && !c.checkValidity()) errors[c.name] = 'Enter an email address we can reach you at';
    }
    for (const [name, message] of Object.entries(CHOICE_MESSAGES)) {
      if (!controls(name).some((c) => c.checked)) errors[name] = message;
    }
    if (!form.elements.consentToPublish.checked) errors.consentToPublish = 'You must agree before the program can be listed';
    return errors;
  }

  function showErrors(errors) {
    const names = Object.keys(errors);
    for (const name of names) setError(name, errors[name]);
    status.textContent = `${names.length} answer${names.length === 1 ? ' needs' : 's need'} another look.`;
    // Focus the first problem in page order.
    const first = [...form.querySelectorAll('[data-field]')].find((box) => names.includes(box.dataset.field));
    first?.querySelector('input, textarea, select')?.focus();
  }

  function payload() {
    const data = new FormData(form);
    const body = {};
    for (const [key, value] of data) {
      if (MULTI.includes(key)) (body[key] ??= []).push(value);
      else body[key] = value;
    }
    body.scholarships = form.elements.scholarships.checked;
    body.consentToPublish = form.elements.consentToPublish.checked;
    return body;
  }

  function showThanks() {
    const done = document.createElement('div');
    done.className = 'od-private of-done';
    done.tabIndex = -1;
    done.setAttribute('role', 'status');
    const p = document.createElement('p');
    const b = document.createElement('b');
    b.textContent = 'Thanks, your program was sent.';
    p.append(b, ' It will show up in the directory after it is reviewed. We will only use your email if we have a question about the listing.');
    done.append(p);
    form.replaceWith(done);
    done.focus();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors();
    const errors = checkLocally();
    if (Object.keys(errors).length) return showErrors(errors);

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = 'Sending…';
    try {
      const res = await fetch(form.getAttribute('action'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload()),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 201) return showThanks();
      if (res.status === 400 && body.issues?.length) {
        const fromServer = {};
        for (const issue of body.issues) fromServer[issue.field] ??= issue.message;
        return showErrors(fromServer);
      }
      status.textContent = body.error ?? 'Something went wrong. Please try again later.';
    } catch {
      status.textContent = 'The form could not be sent. Check your connection and try again.';
    } finally {
      button.disabled = false;
    }
  });

  // Clear a field's error as soon as it is changed.
  form.addEventListener('input', (e) => {
    const name = e.target.name;
    if (name && form.querySelector(`[data-error-for="${name}"]`)?.textContent) setError(name, null);
  });
}

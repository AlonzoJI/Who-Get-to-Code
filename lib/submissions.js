// Shared by every contribution form route (educator and outreach): HTML
// stripping, the honeypot, request-body limits and parsing, the rate limit
// setting and the shape of validation issues. One place, so the two forms
// can't drift apart.

// Hidden from people; anything typed here came from a bot.
export const HONEYPOT_FIELD = 'homepage';

export const MAX_BODY_BYTES = 20_000;

// School and district networks often share one IP, so this is looser than a
// typical form limit: 10 attempts per hour per connection, per form.
export const MAX_ATTEMPTS_PER_HOUR = 10;

// Removes HTML: script and style blocks with their contents, comments (closed
// or not), every other tag including <!doctype>, and control characters. Keeps
// line breaks so longer answers stay readable. Output is plain text; pages still
// escape it when they display it.
export function plainText(value) {
  return String(value ?? '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?(-->|$)/g, ' ')
    .replace(/<\/?[a-z!][^>]*>?/gi, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const isBot = (body) => typeof body?.[HONEYPOT_FIELD] === 'string' && body[HONEYPOT_FIELD].trim() !== '';

// Validation issues in one shape for both forms: `path` is the full dotted path
// ("shares.black"), `field` is its first part ("shares").
export function toIssues(zodError) {
  return zodError.issues.map((i) => ({
    path: i.path.join('.'),
    field: String(i.path[0] ?? ''),
    message: i.message,
  }));
}

// Reads a JSON body, or a regular form post when allowForm is set (repeated
// keys listed in multiValue become arrays). Returns { body, isForm } or { error }.
export async function readSubmissionBody(request, { allowForm = false, multiValue = [] } = {}) {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return { error: 'too-large' };
  const type = request.headers.get('content-type') ?? '';
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return { error: 'too-large' };

  if (type.includes('application/json')) {
    try {
      const body = JSON.parse(raw);
      return body && typeof body === 'object' && !Array.isArray(body) ? { body, isForm: false } : { error: 'bad-body' };
    } catch {
      return { error: 'bad-body' };
    }
  }
  if (allowForm && type.includes('application/x-www-form-urlencoded')) {
    const multi = new Set(multiValue);
    const body = {};
    for (const [key, value] of new URLSearchParams(raw)) {
      if (multi.has(key)) (body[key] ??= []).push(value);
      else body[key] = value;
    }
    return { body, isForm: true };
  }
  return { error: 'bad-type' };
}

export const BODY_ERRORS = {
  'too-large': { status: 413, error: 'Submission is too large' },
  'bad-type': { status: 415, error: 'Send the form as JSON' },
  'bad-body': { status: 400, error: 'The submission could not be read' },
};

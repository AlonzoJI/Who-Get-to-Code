// POST /api/admin/moderate  (signed in, same origin only)
// { collection: "educator" | "outreach", id, action: "approve" | "reject" | "edit",
//   edits?: { field: text }, quoteField?: "whatWorked" | "changeDetails" | null }
// Edits are applied first, then the action. Every step is logged in moderationLog.
import { z } from 'zod';
import { getDb } from '../../lib/mongodb.js';
import { adminJson, requireAdmin } from '../../lib/admin-auth.js';
import { COLLECTIONS, ModerationError, QUOTE_FIELDS, moderate } from '../../lib/moderation.js';

const input = z.object({
  collection: z.enum(Object.keys(COLLECTIONS)),
  id: z.string().regex(/^[a-f0-9]{24}$/),
  action: z.enum(['approve', 'reject', 'edit']),
  edits: z.record(z.string(), z.string().max(4000).nullable()).optional(),
  quoteField: z.enum(QUOTE_FIELDS).nullable().optional(),
});

export async function POST(request) {
  const denied = requireAdmin(request, { write: true });
  if (denied) return denied;
  let parsed;
  try {
    parsed = input.safeParse(JSON.parse((await request.text()).slice(0, 30_000)));
  } catch {
    return adminJson({ error: 'Could not read the request' }, 400);
  }
  if (!parsed.success) return adminJson({ error: 'Invalid request', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, 400);

  const { collection, id, action, edits, quoteField } = parsed.data;
  try {
    const doc = await moderate(await getDb(), { collection: COLLECTIONS[collection], id, action, edits, quoteField: quoteField ?? null, via: 'admin-page' });
    return adminJson({ ok: true, item: { ...doc, _id: String(doc._id) } });
  } catch (err) {
    if (err instanceof ModerationError) return adminJson({ error: err.message }, err.status);
    console.error('Admin moderate error:', err.message);
    return adminJson({ error: 'Database unavailable' }, 503);
  }
}

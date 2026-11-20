// Rollback timeline: the dots and the list both select an event card.
// Without JS every card stays visible, so the page still reads top to bottom.
import './styles/rollback.css';

const root = document.querySelector('[data-timeline]');
if (root) {
  const cards = [...root.querySelectorAll('.ev-card')];
  const triggers = [...root.querySelectorAll('[data-event]')];
  const dots = [...root.querySelectorAll('.tl-dot')].sort(
    (a, b) => parseFloat(a.style.left) - parseFloat(b.style.left)
  );
  const order = cards.map((c) => c.id.replace(/^ev-/, ''));
  root.classList.add('is-enhanced');

  function select(id, { focusCard = false } = {}) {
    for (const card of cards) card.hidden = card.id !== `ev-${id}`;
    for (const t of triggers) t.setAttribute('aria-pressed', String(t.dataset.event === id));
    const card = document.getElementById(`ev-${id}`);
    if (focusCard && card) {
      card.focus({ preventScroll: true });
      const r = card.getBoundingClientRect();
      if (r.top < 70 || r.top > window.innerHeight * 0.6) {
        card.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      }
    }
    try { history.replaceState(null, '', `#${id}`); } catch (e) {}
  }

  for (const t of triggers) {
    t.addEventListener('click', () => select(t.dataset.event, { focusCard: t.classList.contains('tl-item') }));
  }

  // Left/Right arrows step through the dots in date order.
  root.querySelector('.tl-axis')?.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = dots.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = dots[(i + (e.key === 'ArrowRight' ? 1 : -1) + dots.length) % dots.length];
    next.focus();
    select(next.dataset.event);
  });

  const fromHash = location.hash.slice(1);
  select(order.includes(fromHash) ? fromHash : order[0]);
}

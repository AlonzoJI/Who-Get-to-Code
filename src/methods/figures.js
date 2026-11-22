// Methods page: rebuilds the figure table and counts from MongoDB
// (GET /api/datapoints). If the API is unavailable, the copy built from /data
// at deploy time stays on the page, and the line under the counts says so.
import { loadDatapoints } from '../data-client.js';
import { figureSummary, figureTable, rowsFromDatapoints } from '../../lib/render.js';

const table = document.getElementById('figure-table');
const summary = document.getElementById('figure-summary');
const origin = document.getElementById('figure-origin');

if (table && summary && origin) {
  loadDatapoints().then((byId) => {
    if (!byId?.all?.length) {
      origin.textContent = 'Showing the copy built from the /data files when the site was last deployed.';
      return;
    }
    const rows = rowsFromDatapoints(byId.all);
    summary.innerHTML = figureSummary(rows);
    table.innerHTML = figureTable(rows);
    const seeded = byId.all.map((d) => d.seededAt).filter(Boolean).sort().at(-1);
    origin.textContent = `Showing live figures from the database${seeded ? `, last loaded ${new Date(seeded).toLocaleDateString('en-US', { dateStyle: 'medium' })}` : ''}.`;
  });
}

const control = document.querySelector('#ipeds-period-control');
const select = control.querySelector('select');
const panels = document.querySelectorAll('[data-ipeds-period]');

function showSelectedPeriod() {
  for (const panel of panels) {
    panel.hidden = panel.dataset.ipedsPeriod !== select.value;
  }
}

select.addEventListener('change', showSelectedPeriod);
showSelectedPeriod();
control.hidden = false;

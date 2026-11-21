import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/charts.css';

// Light/Dark toggle. The button names the theme it will switch to.
const toggle = document.getElementById('theme-toggle');
if (toggle) {
  const sync = () => {
    const isLight = document.documentElement.classList.contains('light');
    toggle.textContent = isLight ? 'Dark' : 'Light';
    toggle.setAttribute('aria-label', `Switch to ${isLight ? 'dark' : 'light'} theme`);
  };
  sync();
  toggle.addEventListener('click', () => {
    const isLight = document.documentElement.classList.toggle('light');
    try { localStorage.setItem('wgc-theme', isLight ? 'light' : 'dark'); } catch (e) {}
    sync();
    window.dispatchEvent(new CustomEvent('themechange'));
  });
}

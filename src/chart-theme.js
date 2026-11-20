// Chart colors read from the CSS tokens so charts follow the Light/Dark toggle.
// Re-render charts on the window 'themechange' event.
export function chartTheme() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  return {
    categorical: [v('--cat-1'), v('--cat-2'), v('--cat-3')],
    ramp: [v('--lv-0'), v('--lv-1'), v('--lv-2'), v('--lv-3')],
    grid: v('--grid'),
    axis: v('--axis'),
    text: v('--t2'),
    font: v('--mono'),
  };
}

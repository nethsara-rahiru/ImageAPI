let render = () => {};
export function navigate(path, { replace = false } = {}) {
  history[replace ? 'replaceState' : 'pushState']({}, '', path);
  render();
}
export function startRouter(callback) {
  render = callback;
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-link]');
    if (
      !link ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0 ||
      link.target === '_blank'
    )
      return;
    const url = new URL(link.href, location.origin);
    if (url.origin !== location.origin) return;
    event.preventDefault();
    navigate(url.pathname + url.search + url.hash);
  });
  window.addEventListener('popstate', render);
  render();
}

import { icon } from './icons.js';
export function toast(message, type = 'success') {
  const element = document.createElement('div');
  element.className = `toast ${type === 'error' ? 'toast-error' : ''}`;
  element.innerHTML = icon(type === 'error' ? 'info' : 'check');
  const text = document.createElement('span');
  text.textContent = message;
  element.append(text);
  document.querySelector('#toast-region').append(element);
  setTimeout(() => element.remove(), 6000);
}
export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch {
    toast('Clipboard access is unavailable. Select and copy the text manually.', 'error');
  }
}

import { escape } from '../core/html.js';
import { icon } from './icons.js';
import { copy } from './toast.js';
export function codePanel(code, { label = 'cURL', id = 'code-example', footer = '' } = {}) {
  return /* HTML */ `<div class="code-panel">
    <div class="code-top">
      <span>${escape(label)}</span
      ><button class="btn btn-icon" data-copy-code="${id}" aria-label="Copy code">
        ${icon('copy')}
      </button>
    </div>
    <pre id="${id}"><code>${escape(code)}</code></pre>
    ${footer ? /* HTML */ `<div class="code-footer">${icon('check')}${escape(footer)}</div>` : ''}
  </div>`;
}
export function bindCode(root = document) {
  root
    .querySelectorAll('[data-copy-code]')
    .forEach((button) =>
      button.addEventListener('click', () =>
        copy(root.querySelector(`#${button.dataset.copyCode}`).textContent),
      ),
    );
}
export function curlExample() {
  return `curl ${location.origin}/v1/images/generations \\\n  -H "Authorization: Bearer YOUR_IMAGEAPI_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "prompt": "A quiet world, a little surreal",\n    "provider": "openai",\n    "model": "gpt-image-1",\n    "size": "1024x1024",\n    "quality": "auto"\n  }'`;
}

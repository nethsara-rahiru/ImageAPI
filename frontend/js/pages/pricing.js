import { api } from '../core/api.js';
import { escape } from '../core/html.js';
import { state } from '../core/state.js';
import { marketingLayout, bindMarketing } from '../components/marketing-layout.js';
import { icon } from '../components/icons.js';
export async function render() {
  const { plans, notice } = await api('/api/plans');
  const faqs = [
    [
      'Do I still need a provider API key?',
      'Yes. Bring your own OpenAI, Google Gemini, fal.ai, or Cloudflare Workers AI key. Generation runs on that provider account, which bills you directly for its usage. ImageAPI does not include provider credits.',
    ],
    [
      'What counts toward my monthly allowance?',
      'Successful image generations from the playground and API share the same allowance. Failed requests do not count. Interrupted requests with an unknown provider outcome count conservatively, because the provider may have completed them.',
    ],
    [
      'Can I subscribe to Plus or Pro today?',
      'Not yet. Free is available now. Plus, Pro, and Enterprise are previews of proposed plans; prices and features may change. No checkout, payment, or automatic upgrade is enabled.',
    ],
    [
      'When does my usage reset?',
      'Your monthly allowance resets on the first day of each calendar month at 00:00 UTC. The dashboard shows your next reset date.',
    ],
    [
      'What happens if I reach the Free limit?',
      'New generation requests return a clear limit error until the next monthly reset. Your existing API keys and provider settings stay in place.',
    ],
    [
      'Are my images and prompts stored?',
      'ImageAPI returns the generated image to you and stores only usage metadata, such as model, status, and duration. The provider processes your prompt under its own policies. Download images you want to keep.',
    ],
  ];
  return {
    html: marketingLayout(
      /* HTML */ `<div class="container">
        <header class="pricing-header">
          <div class="eyebrow">Room for your next idea</div>
          <h1>Start small. Imagine bigger.</h1>
          <p>
            A simple workspace for every stage of creating.<br />Bring your own keys. Keep your
            provider billing separate.
          </p>
          <div class="pricing-note">${icon('info')} Free is live · Paid plans are a preview</div>
        </header>
        <section class="pricing-grid" aria-label="Pricing plans">
          ${plans
            .map(
              (plan) =>
                /* HTML */ `<article class="price-card ${plan.id === 'free' ? 'featured' : ''}">
                  <span class="badge ${plan.available ? 'badge-blue' : ''}"
                    >${plan.available ? 'AVAILABLE NOW' : 'COMING LATER'}</span
                  >
                  <h3>${escape(plan.name)}</h3>
                  <p class="price-description">${escape(plan.description)}</p>
                  <div class="price">
                    ${escape(plan.price)} <small>${escape(plan.period)}</small>
                  </div>
                  ${plan.available ? /* HTML */ `<a href="${state.user ? '/dashboard' : '/signup'}" data-link class="btn btn-primary btn-block">${state.user ? 'Open workspace' : 'Get started free'} ${icon('arrow')}</a>` : /* HTML */ `<button class="btn btn-secondary btn-block" disabled title="Subscriptions are not enabled yet">${plan.id === 'enterprise' ? 'Coming later' : 'Not available yet'}</button>`}
                  <ul>
                    ${plan.features.map((feature) => /* HTML */ `<li>${icon('check')}<span>${escape(feature)}</span></li>`).join('')}
                  </ul>
                </article>`,
            )
            .join('')}
        </section>
        <p class="pricing-disclaimer">${escape(notice)}</p>
        <h2 class="faq-title">A few things to know.</h2>
        <section class="faq-grid">
          ${faqs
            .map(
              ([q, a]) =>
                /* HTML */ `<details class="faq-item">
                  <summary>${escape(q)}</summary>
                  <p>${escape(a)}</p>
                </details>`,
            )
            .join('')}
        </section>
      </div>`,
      'pricing',
    ),
    mount: bindMarketing,
  };
}

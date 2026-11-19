/* CoinLink.co forms — lead capture, multi-step flows, delivery via FormSubmit AJAX. */
(function () {
  'use strict';
  const CL = window.CL;
  const cfg = CL.cfg;

  function endpoint() {
    if (cfg.formAlias) return 'https://formsubmit.co/ajax/' + cfg.formAlias;
    const k = (cfg._k || []).slice().reverse().join('');
    return 'https://formsubmit.co/ajax/' + atob(k).split('').reverse().join('');
  }

  function collect(form) {
    const out = {};
    new FormData(form).forEach((v, k) => {
      if (k === '_gotcha') return;
      if (typeof v !== 'string') return;
      v = v.trim();
      if (!v) return;
      out[k] = out[k] ? out[k] + ', ' + v : v;
    });
    return out;
  }

  function validate(scope) {
    let ok = true;
    CL.$$('input,select,textarea', scope).forEach((el) => {
      if (el.closest('.step') && !el.closest('.step.on') && scope.matches('form')) return;
      if (!el.checkValidity()) { ok = false; el.setAttribute('aria-invalid', 'true'); } else el.removeAttribute('aria-invalid');
    });
    // required radio/checkbox groups
    CL.$$('[data-required-group]', scope).forEach((g) => {
      if (g.closest('.step') && !g.closest('.step.on')) return;
      if (!CL.$$('input:checked', g).length) { ok = false; g.classList.add('invalid'); } else g.classList.remove('invalid');
    });
    if (!ok) { const bad = scope.querySelector('[aria-invalid="true"], .invalid input'); if (bad) bad.focus(); }
    return ok;
  }

  async function send(form) {
    const msg = form.querySelector('.form-msg');
    const btn = form.querySelector('[type=submit]');
    if (form.querySelector('[name=_gotcha]') && form.querySelector('[name=_gotcha]').value) return; // bot
    if (!validate(form)) { if (msg) { msg.className = 'form-msg err'; msg.textContent = 'Please complete the highlighted fields.'; } return; }
    const label = form.dataset.label || form.dataset.form || 'Website form';
    const data = collect(form);
    const payload = Object.assign({
      _subject: 'CoinLink.co — ' + label + (data.name ? ' from ' + data.name : ''),
      _template: 'table',
      _captcha: 'false',
      form: label,
      page: location.pathname + location.search,
      submitted: new Date().toISOString()
    }, data);
    if (btn) { btn.disabled = true; btn.dataset.txt = btn.textContent; btn.textContent = 'Sending…'; }
    if (msg) { msg.className = 'form-msg'; msg.textContent = ''; }
    try {
      const r = await fetch(endpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || String(j.success) === 'false') throw new Error(j.message || 'Delivery failed');
      done(form, true);
    } catch (e) {
      if (msg) { msg.className = 'form-msg err'; msg.textContent = 'We could not send that just now. Please check your connection and try again in a minute.'; }
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset.txt; }
    }
  }

  function done(form) {
    const msg = form.querySelector('.form-msg');
    const ok = form.dataset.ok || 'Thanks! We received it and will reply by email.';
    if (form.dataset.unlock) { CL.store.set('cl_' + form.dataset.unlock, Date.now()); CL.$$('.kit-unlocked').forEach((x) => x.classList.add('on')); }
    if (form.dataset.success) {
      const panel = document.querySelector(form.dataset.success);
      if (panel) { form.hidden = true; panel.classList.add('on'); panel.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    } else if (msg) { msg.className = 'form-msg ok'; msg.textContent = ok; }
    form.reset();
    const btn = form.querySelector('[type=submit]');
    if (btn) { btn.disabled = false; btn.textContent = btn.dataset.txt || btn.textContent; }
    CL.toast('Sent ✓');
    document.dispatchEvent(new CustomEvent('cl:form-sent', { detail: form.dataset.form }));
  }

  function initSteps(form) {
    const steps = CL.$$('.step', form);
    if (!steps.length) return;
    let i = 0;
    const bar = form.querySelector('.progress span');
    const back = form.querySelector('[data-back]'), next = form.querySelector('[data-next]'), sub = form.querySelector('[type=submit]');
    const show = () => {
      steps.forEach((s, k) => s.classList.toggle('on', k === i));
      if (bar) bar.style.width = ((i + 1) / steps.length * 100) + '%';
      const lbl = form.querySelector('[data-step-label]'); if (lbl) lbl.textContent = 'Step ' + (i + 1) + ' of ' + steps.length;
      if (back) back.style.visibility = i === 0 ? 'hidden' : 'visible';
      if (next) next.hidden = i === steps.length - 1;
      if (sub) sub.hidden = i !== steps.length - 1;
      form.dataset.lastStep = i === steps.length - 1 ? '1' : '';
    };
    form.addEventListener('submit', (e) => {
      if (form.dataset.lastStep) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (validate(steps[i])) { i = Math.min(i + 1, steps.length - 1); show(); }
    }, true);
    form.addEventListener('click', (e) => {
      if (e.target.closest('[data-next]')) { e.preventDefault(); if (validate(steps[i])) { i = Math.min(i + 1, steps.length - 1); show(); } }
      if (e.target.closest('[data-back]')) { e.preventDefault(); i = Math.max(i - 1, 0); show(); }
    });
    // auto-advance on single-choice steps
    steps.forEach((s, k) => {
      if (s.dataset.auto === undefined) return;
      s.addEventListener('change', (e) => { if (e.target.type === 'radio' && k < steps.length - 1) setTimeout(() => { i = k + 1; show(); }, 180); });
    });
    show();
  }

  function prefill() {
    const q = new URLSearchParams(location.search);
    q.forEach((v, k) => {
      CL.$$('form [name="' + k + '"]').forEach((el) => {
        if (el.type === 'radio' || el.type === 'checkbox') { if (el.value === v) el.checked = true; }
        else if (!el.value) el.value = v;
      });
    });
  }

  CL.ready(() => {
    CL.$$('form[data-form]').forEach((f) => {
      f.setAttribute('novalidate', '');
      initSteps(f);
      f.addEventListener('submit', (e) => { e.preventDefault(); send(f); });
    });
    prefill();
    if (CL.store.get('cl_kit')) CL.$$('.kit-unlocked').forEach((x) => x.classList.add('on'));
  });
  CL.sendForm = send;
})();

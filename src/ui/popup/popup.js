/**
 * popup.js — AIPP Local popup controller.
 *
 * Queries the background service worker for policy and exception counts.
 * Submits exception requests through message-router (never writes storage directly).
 *
 * @module ui/popup
 */

const $ = (id) => document.getElementById(id);

const EXCEPTION_DURATION_MS = 3_600_000; // 1 hour

// ── Boot ───────────────────────────────────────────────────────────────────

async function init() {
  // Detect active tab origin.
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const origin = getOrigin(tab?.url);
  $('current-origin').textContent = origin ?? 'Unknown origin';

  // Load policy info.
  const { policy } = await sendMessage({ type: 'query.policy', payload: {} });
  if (policy) {
    $('hard-rule-count').textContent   = policy.hardRules?.length   ?? '—';
    $('bundled-rule-count').textContent = policy.bundledRules?.length ?? '—';
    $('policy-version').textContent    = policy.version ?? '—';
  }

  // Load ledger — check for recent INTEGRITY_FAILURE events.
  const { ledger } = await sendMessage({ type: 'query.ledger', payload: {} });
  const hasFailure = ledger?.some(e => e.eventType === 'INTEGRITY_FAILURE');
  if (hasFailure) {
    $('integrity-warning').classList.remove('hidden');
    $('status-badge').className = 'badge badge--error';
    $('status-badge').textContent = 'ERR';
  }

  // Count active exceptions.
  const exceptions = await getExceptions();
  $('exception-count').textContent = exceptions.length;

  // Enable exception button only if origin is known and not a browser page.
  if (origin && !origin.startsWith('about:') && !origin.startsWith('moz-extension:')) {
    const btn = $('btn-exception');
    btn.disabled = false;
    btn.addEventListener('click', () => requestException(origin));
  }

  // Navigation.
  $('btn-dashboard').addEventListener('click', () => {
    browser.tabs.create({ url: browser.runtime.getURL('src/ui/dashboard/dashboard.html') });
    window.close();
  });
  $('btn-settings').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
    window.close();
  });

  // Placeholder stats (real counts need declarativeNetRequestFeedback — milestone-03).
  $('blocked-count').textContent = '—';
  $('allowed-count').textContent = '—';
}

// ── Exception request ──────────────────────────────────────────────────────

async function requestException(origin) {
  const btn = $('btn-exception');
  btn.disabled = true;
  btn.textContent = 'Requesting…';

  try {
    const result = await sendMessage({
      type:    'policy.requestException',
      payload: {
        origin,
        resourceTypes: ['script', 'xmlhttprequest', 'image', 'font', 'media'],
        durationMs:    EXCEPTION_DURATION_MS,
        reason:        'User requested via popup',
      },
    });

    if (result?.ok) {
      btn.textContent = '✓ Allowed for 1 hour';
      showToast('Exception created — expires in 1 hour');
      const exceptions = await getExceptions();
      animateStat($('exception-count'), exceptions.length);
    } else {
      const msg = result?.error === 'HARD_RULE_CONFLICT'
        ? 'Cannot allow: site is hard-blocked'
        : result?.error ?? 'Failed';
      btn.textContent = msg;
      setTimeout(() => { btn.disabled = false; btn.textContent = 'Allow this site for 1 hour'; }, 2500);
    }
  } catch (e) {
    btn.textContent = 'Error — try again';
    btn.disabled = false;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function sendMessage(msg) {
  try {
    return await browser.runtime.sendMessage(msg);
  } catch {
    return {};
  }
}

async function getExceptions() {
  try {
    const stored = await browser.storage.local.get('aipp.exceptions');
    return stored['aipp.exceptions'] ?? [];
  } catch { return []; }
}

function getOrigin(url) {
  if (!url) return null;
  try { return new URL(url).origin; }
  catch { return null; }
}

function animateStat(el, value) {
  el.textContent = value;
  el.classList.remove('bump');
  void el.offsetWidth; // reflow
  el.classList.add('bump');
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    t.addEventListener('transitionend', () => t.remove());
  }, 2800);
}

// ── Run ────────────────────────────────────────────────────────────────────
init().catch(console.error);

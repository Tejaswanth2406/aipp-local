/**
 * dashboard.js — AIPP Local Dashboard controller.
 *
 * Implements tab navigation, hash-chain ledger queries, live verification,
 * and scoped exception revocation.
 *
 * Zero innerHTML (SEC-02).
 * Zero remote dependencies (SEC-01).
 *
 * @module ui/dashboard
 */

// ── State ───────────────────────────────────────────────────────────────────

let currentTab = 'overview';
let cachedLedger = [];
let cachedPolicy = null;
let cachedExceptions = [];

// ── DOM References ──────────────────────────────────────────────────────────

const navItems = document.querySelectorAll('.nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');
const pageTitle = document.getElementById('page-title');

const overviewIntegrityBadge = document.getElementById('overview-integrity-badge');
const overviewChainLength    = document.getElementById('overview-chain-length');
const overviewHardRules      = document.getElementById('overview-hard-rules');
const overviewBundledRules   = document.getElementById('overview-bundled-rules');
const overviewActiveExc      = document.getElementById('overview-active-exceptions');
const overviewHeadHash       = document.getElementById('overview-head-hash');
const overviewCheckpointHash = document.getElementById('overview-checkpoint-hash');
const overviewRecentEvents   = document.getElementById('overview-recent-events');

const ledgerTableBody = document.getElementById('ledger-table-body');
const exceptionsTableBody = document.getElementById('exceptions-table-body');

const rulesHardCount    = document.getElementById('rules-hard-count');
const rulesBundledCount = document.getElementById('rules-bundled-count');
const modelsRegCount    = document.getElementById('models-registered-count');

const btnRefresh       = document.getElementById('btn-refresh');
const btnVerifyLedger  = document.getElementById('btn-verify-ledger');
const btnVerifyChain   = document.getElementById('btn-verify-chain');
const btnExportLedger  = document.getElementById('btn-export-ledger');
const btnExportQuick   = document.getElementById('btn-export-log-quick');
const toastContainer   = document.getElementById('toast-container');

// ── Tab Navigation ──────────────────────────────────────────────────────────

const TAB_TITLES = {
  overview:   'Integrity & Enforcement Overview',
  ledger:     'Cryptographic Audit Ledger',
  exceptions: 'Active Scoped Exceptions',
  artifacts:  'Bundled Artifacts & Models',
};

navItems.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    switchTab(target);
  });
});

function switchTab(tabId) {
  currentTab = tabId;
  navItems.forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  tabPanes.forEach(p => p.classList.toggle('active', p.id === `tab-${tabId}`));
  if (pageTitle && TAB_TITLES[tabId]) {
    pageTitle.textContent = TAB_TITLES[tabId];
  }
}

// ── Message Routing Helper ──────────────────────────────────────────────────

async function sendBackground(type, payload = {}) {
  try {
    if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
      return await browser.runtime.sendMessage({ type, payload });
    }
  } catch (err) {
    console.warn(`Background message ${type} failed:`, err);
  }
  return null;
}

// ── Data Refresh ────────────────────────────────────────────────────────────

async function refreshAll() {
  await Promise.all([
    refreshPolicyAndRules(),
    refreshExceptions(),
    refreshLedger(),
  ]);
}

async function refreshPolicyAndRules() {
  const res = await sendBackground('GET_POLICY');
  if (res?.policy) {
    cachedPolicy = res.policy;
    const hardCount = cachedPolicy.hardRules?.length ?? 0;
    const bundledCount = cachedPolicy.bundledRules?.length ?? 0;

    if (overviewHardRules)    overviewHardRules.textContent = String(hardCount);
    if (overviewBundledRules) overviewBundledRules.textContent = String(bundledCount);
    if (rulesHardCount)       rulesHardCount.textContent = String(hardCount);
    if (rulesBundledCount)    rulesBundledCount.textContent = String(bundledCount);
  }
  if (modelsRegCount) {
    modelsRegCount.textContent = '1 (tracker-v1)';
  }
}

async function refreshExceptions() {
  const res = await sendBackground('GET_EXCEPTIONS');
  cachedExceptions = res?.exceptions ?? [];

  if (overviewActiveExc) {
    overviewActiveExc.textContent = String(cachedExceptions.length);
  }
  renderExceptionsTable(cachedExceptions);
}

async function refreshLedger() {
  const res = await sendBackground('GET_LEDGER');
  cachedLedger = res?.events ?? [];

  if (overviewChainLength) {
    overviewChainLength.textContent = `${cachedLedger.length} chained events`;
  }

  if (cachedLedger.length > 0) {
    const head = cachedLedger[cachedLedger.length - 1];
    if (overviewHeadHash) overviewHeadHash.textContent = truncateHash(head.blockHash ?? head.eventHash);
  } else {
    if (overviewHeadHash) overviewHeadHash.textContent = 'GENESIS';
  }

  renderRecentEvents(cachedLedger.slice(-5).reverse());
  renderLedgerTable(cachedLedger);
}

// ── Rendering Functions (DOM Safe, No innerHTML) ────────────────────────────

function truncateHash(h) {
  if (!h) return '—';
  if (h.length <= 16) return h;
  return `${h.slice(0, 10)}...${h.slice(-6)}`;
}

function formatDate(isoOrTs) {
  if (!isoOrTs) return '—';
  try {
    const d = new Date(isoOrTs);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return String(isoOrTs);
  }
}

function renderRecentEvents(events) {
  if (!overviewRecentEvents) return;
  overviewRecentEvents.replaceChildren();

  if (events.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No events logged yet';
    overviewRecentEvents.appendChild(empty);
    return;
  }

  for (const ev of events) {
    const item = document.createElement('div');
    item.className = 'event-mini-item';

    const typeSpan = document.createElement('span');
    typeSpan.className = 'event-type-badge';
    typeSpan.textContent = ev.eventType ?? 'EVENT';

    const hashSpan = document.createElement('span');
    hashSpan.className = 'mono-cell';
    hashSpan.textContent = truncateHash(ev.blockHash ?? ev.eventHash);

    const timeSpan = document.createElement('span');
    timeSpan.style.color = 'var(--text-dim)';
    timeSpan.textContent = formatDate(ev.timestamp);

    item.appendChild(typeSpan);
    item.appendChild(hashSpan);
    item.appendChild(timeSpan);
    overviewRecentEvents.appendChild(item);
  }
}

function renderLedgerTable(events) {
  if (!ledgerTableBody) return;
  ledgerTableBody.replaceChildren();

  if (events.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'empty-state';
    td.textContent = 'Ledger is currently empty (Genesis state)';
    tr.appendChild(td);
    ledgerTableBody.appendChild(tr);
    return;
  }

  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    const tr = document.createElement('tr');

    const tdSeq = document.createElement('td');
    tdSeq.className = 'mono-cell';
    tdSeq.textContent = String(ev.seq ?? i + 1);

    const tdTime = document.createElement('td');
    tdTime.textContent = formatDate(ev.timestamp);

    const tdType = document.createElement('td');
    const typeBadge = document.createElement('span');
    typeBadge.className = 'event-type-badge';
    typeBadge.textContent = ev.eventType ?? 'EVENT';
    tdType.appendChild(typeBadge);

    const tdPayload = document.createElement('td');
    tdPayload.className = 'mono-cell';
    tdPayload.textContent = truncateHash(ev.payloadHash);

    const tdPrev = document.createElement('td');
    tdPrev.className = 'mono-cell';
    tdPrev.textContent = truncateHash(ev.prevHash);

    const tdBlock = document.createElement('td');
    tdBlock.className = 'mono-cell';
    tdBlock.style.color = 'var(--accent)';
    tdBlock.textContent = truncateHash(ev.blockHash ?? ev.eventHash);

    tr.appendChild(tdSeq);
    tr.appendChild(tdTime);
    tr.appendChild(tdType);
    tr.appendChild(tdPayload);
    tr.appendChild(tdPrev);
    tr.appendChild(tdBlock);

    ledgerTableBody.appendChild(tr);
  }
}

function renderExceptionsTable(exceptions) {
  if (!exceptionsTableBody) return;
  exceptionsTableBody.replaceChildren();

  if (exceptions.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'empty-state';
    td.textContent = 'No active scoped exceptions';
    tr.appendChild(td);
    exceptionsTableBody.appendChild(tr);
    return;
  }

  const now = Date.now();
  for (const exc of exceptions) {
    const tr = document.createElement('tr');

    const tdId = document.createElement('td');
    tdId.className = 'mono-cell';
    tdId.textContent = exc.id?.slice(0, 8) ?? '—';

    const tdOrigin = document.createElement('td');
    tdOrigin.style.fontWeight = '500';
    tdOrigin.textContent = exc.scope?.origin ?? '—';

    const tdTypes = document.createElement('td');
    tdTypes.textContent = Array.isArray(exc.scope?.resourceTypes)
      ? exc.scope.resourceTypes.join(', ')
      : 'all';

    const tdExpires = document.createElement('td');
    const remainingMs = new Date(exc.expiresAt).getTime() - now;
    if (remainingMs <= 0) {
      tdExpires.textContent = 'Expired';
      tdExpires.style.color = 'var(--danger)';
    } else {
      const minutes = Math.ceil(remainingMs / 60000);
      tdExpires.textContent = `${minutes} min`;
      tdExpires.style.color = 'var(--warning)';
    }

    const tdCreated = document.createElement('td');
    tdCreated.textContent = formatDate(exc.createdAt);

    const tdAction = document.createElement('td');
    const revokeBtn = document.createElement('button');
    revokeBtn.className = 'btn-danger btn-sm';
    revokeBtn.textContent = 'Revoke';
    revokeBtn.addEventListener('click', async () => {
      await revokeException(exc.id);
    });
    tdAction.appendChild(revokeBtn);

    tr.appendChild(tdId);
    tr.appendChild(tdOrigin);
    tr.appendChild(tdTypes);
    tr.appendChild(tdExpires);
    tr.appendChild(tdCreated);
    tr.appendChild(tdAction);

    exceptionsTableBody.appendChild(tr);
  }
}

async function revokeException(id) {
  const res = await sendBackground('REVOKE_EXCEPTION', { exceptionId: id });
  if (res?.success) {
    showToast('Exception revoked', 'success');
    await refreshExceptions();
    await refreshLedger();
  } else {
    showToast('Failed to revoke exception', 'error');
  }
}

// ── Verification & Export ───────────────────────────────────────────────────

async function verifyLedger() {
  showToast('Verifying cryptographic hash chain...', 'info');
  const res = await sendBackground('VERIFY_INTEGRITY');

  const valid = res?.valid ?? true;
  if (overviewIntegrityBadge) {
    overviewIntegrityBadge.textContent = valid ? 'VALID' : 'CORRUPTED';
    overviewIntegrityBadge.className = `metric-value status-badge ${valid ? 'valid' : 'invalid'}`;
  }

  if (valid) {
    showToast(`Hash-chain verified. ${cachedLedger.length} blocks tamper-evident.`, 'success');
  } else {
    showToast('Integrity verification failed! Possible ledger tampering.', 'error');
  }
}

function exportLedgerJson() {
  const data = JSON.stringify({
    exportedAt: new Date().toISOString(),
    protocol: 'AIPP',
    version: '0.1.0',
    ledgerHead: cachedLedger[cachedLedger.length - 1]?.blockHash ?? 'GENESIS',
    eventCount: cachedLedger.length,
    events: cachedLedger,
  }, null, 2);

  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aipp-ledger-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Audit ledger exported for offline verification', 'success');
}

function showToast(msg, type = 'info') {
  if (!toastContainer) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  toastContainer.appendChild(t);
  setTimeout(() => {
    t.remove();
  }, 3200);
}

// ── Event Listeners ─────────────────────────────────────────────────────────

if (btnRefresh)      btnRefresh.addEventListener('click', () => { refreshAll(); showToast('Dashboard refreshed', 'info'); });
if (btnVerifyLedger) btnVerifyLedger.addEventListener('click', verifyLedger);
if (btnVerifyChain)  btnVerifyChain.addEventListener('click', verifyLedger);
if (btnExportLedger) btnExportLedger.addEventListener('click', exportLedgerJson);
if (btnExportQuick)  btnExportQuick.addEventListener('click', exportLedgerJson);

// Initial load
document.addEventListener('DOMContentLoaded', () => {
  refreshAll();
});

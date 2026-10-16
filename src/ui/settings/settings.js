/**
 * settings.js — AIPP Local Policy & Security Settings controller.
 *
 * Saves ML advisory toggles, threshold values, and retention limits.
 * Communicates with background router using structured messages.
 *
 * Zero innerHTML (SEC-02).
 * Zero remote dependencies (SEC-01).
 *
 * @module ui/settings
 */

// ── DOM References ──────────────────────────────────────────────────────────

const toggleMlEnabled      = document.getElementById('toggle-ml-enabled');
const sliderMlBlock        = document.getElementById('slider-ml-block');
const sliderMlAllow        = document.getElementById('slider-ml-allow');
const valMlBlock           = document.getElementById('val-ml-block');
const valMlAllow           = document.getElementById('val-ml-allow');
const selectMaxDuration    = document.getElementById('select-max-duration');
const selectDecayHalflife  = document.getElementById('select-decay-halflife');

const btnPurgeExpired      = document.getElementById('btn-purge-expired');
const btnCreateCheckpoint  = document.getElementById('btn-create-checkpoint');
const btnSaveSettings      = document.getElementById('btn-save-settings');
const saveStatusText       = document.getElementById('save-status-text');
const toastContainer       = document.getElementById('toast-container');

// ── Helper ──────────────────────────────────────────────────────────────────

async function sendBackground(type, payload = {}) {
  try {
    if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
      return await browser.runtime.sendMessage({ type, payload });
    }
  } catch (err) {
    console.warn(`Message ${type} failed:`, err);
  }
  return null;
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

// ── Slider Binding ──────────────────────────────────────────────────────────

sliderMlBlock.addEventListener('input', () => {
  valMlBlock.textContent = Number(sliderMlBlock.value).toFixed(2);
});

sliderMlAllow.addEventListener('input', () => {
  valMlAllow.textContent = Number(sliderMlAllow.value).toFixed(2);
});

// ── Load Settings ───────────────────────────────────────────────────────────

async function loadSettings() {
  const res = await sendBackground('GET_POLICY');
  const policy = res?.policy;
  if (!policy) return;

  if (toggleMlEnabled) {
    toggleMlEnabled.checked = Boolean(policy.mlEnabled);
  }

  if (policy.riskThresholds) {
    if (sliderMlBlock) {
      sliderMlBlock.value = String(policy.riskThresholds.block ?? 0.75);
      valMlBlock.textContent = Number(sliderMlBlock.value).toFixed(2);
    }
    if (sliderMlAllow) {
      sliderMlAllow.value = String(policy.riskThresholds.allow ?? 0.25);
      valMlAllow.textContent = Number(sliderMlAllow.value).toFixed(2);
    }
  }

  if (selectMaxDuration && policy.maxExceptionDurationMs) {
    selectMaxDuration.value = String(policy.maxExceptionDurationMs);
  }
}

// ── Save Settings ───────────────────────────────────────────────────────────

async function saveSettings() {
  const blockThresh = parseFloat(sliderMlBlock.value);
  const allowThresh = parseFloat(sliderMlAllow.value);

  if (allowThresh >= blockThresh) {
    showToast('Allow threshold must be lower than block threshold', 'error');
    return;
  }

  const patch = {
    mlEnabled: toggleMlEnabled.checked,
    riskThresholds: {
      block: blockThresh,
      allow: allowThresh,
    },
    maxExceptionDurationMs: parseInt(selectMaxDuration.value, 10),
  };

  const res = await sendBackground('UPDATE_POLICY', patch);
  if (res?.success) {
    showToast('Policy updated and committed to ledger', 'success');
    if (saveStatusText) {
      saveStatusText.textContent = `Saved at ${new Date().toLocaleTimeString()}`;
    }
  } else {
    showToast('Failed to update policy', 'error');
  }
}

// ── Actions ─────────────────────────────────────────────────────────────────

async function purgeExpired() {
  showToast('Sweeping expired exceptions...', 'info');
  const res = await sendBackground('PURGE_EXPIRED');
  if (res?.success) {
    showToast(`Sweep complete. ${res.purgedCount ?? 0} expired exceptions purged.`, 'success');
  } else {
    showToast('Failed to run purge sweep', 'error');
  }
}

async function createCheckpoint() {
  showToast('Creating integrity checkpoint...', 'info');
  const res = await sendBackground('CREATE_CHECKPOINT');
  if (res?.success) {
    showToast('Cryptographic checkpoint generated and anchored.', 'success');
  } else {
    showToast('Failed to create checkpoint', 'error');
  }
}

// ── Event Listeners ─────────────────────────────────────────────────────────

btnSaveSettings.addEventListener('click', saveSettings);
btnPurgeExpired.addEventListener('click', purgeExpired);
btnCreateCheckpoint.addEventListener('click', createCheckpoint);

document.addEventListener('DOMContentLoaded', loadSettings);

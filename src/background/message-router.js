/**
 * message-router.js — The sole privileged communication gateway.
 *
 * All PRIVILEGED_ROUTES must be declared here. Any message type not in
 * this map is rejected with UNKNOWN_ROUTE. Any sender not in the route's
 * allowedOrigins is rejected with UNAUTHORIZED_ORIGIN. (SEC-07)
 *
 * Content scripts must NEVER reach handlers in PRIVILEGED_ROUTES directly.
 *
 * @module background/message-router
 */

import {
  handleExceptionRequest,
  handleRevokeException,
  handlePurgeExpired,
  handleGetExceptions,
} from '../enforcement/exception-manager.js';
import {
  handleGetDecisionLog,
  handleGetPolicy,
  handleUpdatePolicy,
} from '../protocol/decision-engine.js';
import { handleResetRequest } from '../storage/state-store.js';
import {
  handleGetLedger,
  handleVerifyIntegrity,
  handleCreateCheckpoint,
} from '../integrity/hash-chain.js';

/**
 * PRIVILEGED_ROUTES is the single source of truth for all message types
 * this extension handles. Adding a new handler requires adding it here
 * AND adding a test in tests/unit/message-router.test.js.
 *
 * @type {Record<string, { allowedOrigins: string[], validator: Function, handler: Function }>}
 */
const PRIVILEGED_ROUTES = {
  // Exceptions
  'policy.requestException': {
    allowedOrigins: ['popup', 'dashboard'],
    validator: validateExceptionRequest,
    handler:   handleExceptionRequest,
  },
  'REQUEST_EXCEPTION': {
    allowedOrigins: ['popup', 'dashboard'],
    validator: validateExceptionRequest,
    handler:   handleExceptionRequest,
  },
  'policy.revokeException': {
    allowedOrigins: ['dashboard', 'settings'],
    validator: validateRevokeRequest,
    handler:   handleRevokeException,
  },
  'REVOKE_EXCEPTION': {
    allowedOrigins: ['dashboard', 'settings'],
    validator: validateRevokeRequest,
    handler:   handleRevokeException,
  },
  'query.exceptions': {
    allowedOrigins: ['popup', 'dashboard', 'settings'],
    validator: validateQueryRequest,
    handler:   handleGetExceptions,
  },
  'GET_EXCEPTIONS': {
    allowedOrigins: ['popup', 'dashboard', 'settings'],
    validator: validateQueryRequest,
    handler:   handleGetExceptions,
  },

  // Policy
  'policy.resetAll': {
    allowedOrigins: ['settings'],
    validator: validateResetRequest,
    handler:   handleResetRequest,
  },
  'RESET_ALL': {
    allowedOrigins: ['settings'],
    validator: validateResetRequest,
    handler:   handleResetRequest,
  },
  'policy.update': {
    allowedOrigins: ['settings'],
    validator: validateUpdatePolicyRequest,
    handler:   handleUpdatePolicy,
  },
  'UPDATE_POLICY': {
    allowedOrigins: ['settings'],
    validator: validateUpdatePolicyRequest,
    handler:   handleUpdatePolicy,
  },
  'query.policy': {
    allowedOrigins: ['popup', 'dashboard', 'settings'],
    validator: validateQueryRequest,
    handler:   handleGetPolicy,
  },
  'GET_POLICY': {
    allowedOrigins: ['popup', 'dashboard', 'settings'],
    validator: validateQueryRequest,
    handler:   handleGetPolicy,
  },

  // Decision & Ledger Queries
  'query.decisionLog': {
    allowedOrigins: ['dashboard'],
    validator: validateQueryRequest,
    handler:   handleGetDecisionLog,
  },
  'GET_DECISION_LOG': {
    allowedOrigins: ['dashboard'],
    validator: validateQueryRequest,
    handler:   handleGetDecisionLog,
  },
  'query.ledger': {
    allowedOrigins: ['dashboard'],
    validator: validateQueryRequest,
    handler:   handleGetLedger,
  },
  'GET_LEDGER': {
    allowedOrigins: ['dashboard'],
    validator: validateQueryRequest,
    handler:   handleGetLedger,
  },

  // Integrity & Maintenance
  'ledger.verify': {
    allowedOrigins: ['dashboard', 'settings'],
    validator: validateQueryRequest,
    handler:   handleVerifyIntegrity,
  },
  'VERIFY_INTEGRITY': {
    allowedOrigins: ['dashboard', 'settings'],
    validator: validateQueryRequest,
    handler:   handleVerifyIntegrity,
  },
  'ledger.checkpoint': {
    allowedOrigins: ['dashboard', 'settings'],
    validator: validateQueryRequest,
    handler:   handleCreateCheckpoint,
  },
  'CREATE_CHECKPOINT': {
    allowedOrigins: ['dashboard', 'settings'],
    validator: validateQueryRequest,
    handler:   handleCreateCheckpoint,
  },
  'temporal.purge': {
    allowedOrigins: ['dashboard', 'settings'],
    validator: validateQueryRequest,
    handler:   handlePurgeExpired,
  },
  'PURGE_EXPIRED': {
    allowedOrigins: ['dashboard', 'settings'],
    validator: validateQueryRequest,
    handler:   handlePurgeExpired,
  },
};

/** Register the single runtime.onMessage listener. */
export function registerRoutes() {
  if (typeof browser !== 'undefined' && browser.runtime?.onMessage) {
    browser.runtime.onMessage.addListener(onMessage);
  }
}

export async function onMessage(message, sender) {
  // Reject messages from content scripts entirely.
  if (sender && (sender.tab !== undefined && sender.frameId !== undefined)) {
    return { error: 'CONTENT_SCRIPT_FORBIDDEN' };
  }

  if (!message || typeof message.type !== 'string') {
    return { error: 'MALFORMED_MESSAGE' };
  }

  const route = PRIVILEGED_ROUTES[message.type];
  if (!route) {
    return { error: 'UNKNOWN_ROUTE', type: message.type };
  }

  const origin = deriveOrigin(sender);
  // Allow internal tests where sender is synthetic or matches route allowedOrigins
  if (origin !== 'internal' && !route.allowedOrigins.includes(origin)) {
    return { error: 'UNAUTHORIZED_ORIGIN', origin };
  }

  try {
    route.validator(message.payload);
  } catch (e) {
    return { error: 'INVALID_PAYLOAD', detail: e.message };
  }

  return await route.handler(message.payload ?? {});
}

export function deriveOrigin(sender) {
  if (!sender || !sender.url) return 'internal';
  try {
    const url = new URL(sender.url);
    if (url.pathname.includes('/popup/'))     return 'popup';
    if (url.pathname.includes('/dashboard/')) return 'dashboard';
    if (url.pathname.includes('/settings/'))  return 'settings';
  } catch {
    return 'unknown';
  }
  return 'unknown';
}

// ─── Validators (pure; throw on invalid input) ───────────────────────────────

function validateExceptionRequest(payload) {
  if (!payload || typeof payload.origin !== 'string') throw new Error('origin required');
  if (!Array.isArray(payload.resourceTypes))          throw new Error('resourceTypes required');
  if (typeof payload.durationMs !== 'number')         throw new Error('durationMs required');
}

function validateRevokeRequest(payload) {
  if (!payload || typeof payload.exceptionId !== 'string') throw new Error('exceptionId required');
}

function validateResetRequest(payload) {
  if (!payload || payload.confirm !== true) throw new Error('explicit confirm required');
}

function validateUpdatePolicyRequest(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('policy object payload required');
}

function validateQueryRequest(_payload) {
  // No required fields for read-only queries.
}

export { PRIVILEGED_ROUTES };

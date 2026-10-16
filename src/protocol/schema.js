/**
 * schema.js — JSON schema definitions for AIPP protocol types.
 *
 * All schemas are represented as validation functions rather than
 * raw JSON Schema objects to avoid a runtime JSON Schema library dependency.
 *
 * @module protocol/schema
 */

/**
 * Validate an AIPPRequest object.
 * @param {unknown} req
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateRequest(req) {
  const errors = [];
  if (!req || typeof req !== 'object')                errors.push('request must be an object');
  if (typeof req?.url !== 'string')                   errors.push('url must be a string');
  if (req?.url?.length > 2048)                        errors.push('url exceeds 2048 character limit');
  if (typeof req?.originUrl !== 'string')             errors.push('originUrl must be a string');
  if (!ALLOWED_RESOURCE_TYPES.has(req?.resourceType)) errors.push(`unknown resourceType: ${req?.resourceType}`);
  if (!ALLOWED_SCHEMES.test(req?.url))                errors.push('url scheme not permitted');
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a RiskEstimate returned by the ML classifier.
 * @param {unknown} est
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateRiskEstimate(est) {
  const errors = [];
  if (!est || typeof est !== 'object')                    errors.push('estimate must be an object');
  if (typeof est?.riskScore !== 'number')                 errors.push('riskScore must be a number');
  if (est?.riskScore < 0 || est?.riskScore > 1)           errors.push('riskScore out of range [0,1]');
  if (typeof est?.modelId !== 'string')                   errors.push('modelId must be a string');
  if (!Array.isArray(est?.evidenceCodes))                 errors.push('evidenceCodes must be an array');
  if (est?.evidenceCodes?.length > 10)                    errors.push('evidenceCodes exceeds maximum of 10');
  if (typeof est?.inferenceTimeMs !== 'number')           errors.push('inferenceTimeMs must be a number');
  return { valid: errors.length === 0, errors };
}

const ALLOWED_RESOURCE_TYPES = new Set([
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image',
  'font', 'object', 'xmlhttprequest', 'ping', 'csp_report',
  'media', 'websocket', 'webtransport', 'webbundle', 'other',
]);

const ALLOWED_SCHEMES = /^https?:\/\//i;

/**
 * classifier.js — Local ML inference with strictly advisory authority.
 *
 * The classifier produces a RiskEstimate. It cannot:
 *   - Override hard rules or bundled rules (SEC-04).
 *   - Write to storage or modify policy.
 *   - Approve its own model replacement.
 *   - Produce scores outside [0.0, 1.0] (clamped and logged).
 *
 * Execution is bounded by policy.mlTimeoutMs; timeouts return null.
 *
 * @module intelligence/classifier
 */

import { validateRiskEstimate } from '../protocol/schema.js';

/** @type {object|null} */
let _model = null;

/**
 * Set the active model (must be pre-verified by artifact-verifier).
 * @param {object} model
 */
export function setModel(model) {
  _model = model;
}

/**
 * Compute a risk estimate for a bounded feature vector.
 * Returns null if the model is unavailable or inference times out.
 *
 * @param {BoundedFeatureVector} features
 * @param {number}               timeoutMs
 * @returns {Promise<RiskEstimate|null>}
 */
export async function classify(features, timeoutMs) {
  if (!_model) return null;

  const inferencePromise = runInference(features);
  const timeoutPromise   = new Promise(resolve =>
    setTimeout(() => resolve(null), timeoutMs)
  );

  const result = await Promise.race([inferencePromise, timeoutPromise]);
  if (!result) return null;

  // Clamp and validate output before returning.
  result.riskScore = Math.max(0, Math.min(1, result.riskScore));
  const { valid } = validateRiskEstimate(result);
  if (!valid) return null;

  return result;
}

async function runInference(features) {
  // TODO(milestone-04): Implement model inference using the loaded model artifact.
  // This is a stub that returns a neutral estimate.
  return {
    riskScore:       0.5,
    modelId:         _model?.id ?? 'unknown',
    evidenceCodes:   [],
    inferenceTimeMs: 0,
  };
}

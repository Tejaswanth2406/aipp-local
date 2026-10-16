/**
 * feature-extractor.js — Privacy-preserving feature extraction.
 *
 * Converts a raw request descriptor into a BoundedFeatureVector.
 * Raw URLs, domain names, cookies, and user identifiers must never
 * appear in the output vector.
 *
 * @module intelligence/feature-extractor
 */

const MAX_REDIRECT_DEPTH  = 5;
const MAX_PATTERN_COUNT   = 20;
const REPUTATION_BINS     = 10;

/**
 * @param {AIPPRequest} request
 * @returns {BoundedFeatureVector}
 */
export function extractFeatures(request) {
  return {
    requestContextCode:   classifyRequestContext(request),
    resourceTypeCode:     classifyResourceType(request.resourceType),
    originReputationBin:  computeReputationBin(request.originUrl),
    redirectDepth:        Math.min(request.redirectDepth ?? 0, MAX_REDIRECT_DEPTH),
    headerAnomalyScore:   computeHeaderAnomalyScore(request),
    patternMatchCount:    Math.min(countPatternMatches(request), MAX_PATTERN_COUNT),
  };
}

function classifyRequestContext(request) {
  // TODO(milestone-04): Map request context to an integer enum value.
  // No raw URL or domain is returned.
  return 0;
}

function classifyResourceType(resourceType) {
  const types = ['script', 'xmlhttprequest', 'image', 'font', 'media', 'other'];
  const idx   = types.indexOf(resourceType);
  return idx >= 0 ? idx : types.length - 1;
}

function computeReputationBin(originUrl) {
  // TODO(milestone-04): Look up origin in reputation table and return bin 0-9.
  // Never return the raw domain.
  return 5;
}

function computeHeaderAnomalyScore(request) {
  // TODO(milestone-04): Score header anomalies.
  return 0.0;
}

function countPatternMatches(request) {
  // TODO(milestone-04): Count known tracker pattern matches.
  return 0;
}

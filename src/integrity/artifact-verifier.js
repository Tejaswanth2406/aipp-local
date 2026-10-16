/**
 * artifact-verifier.js — Four-step artifact integrity pipeline.
 *
 * Steps (must all pass):
 *   1. Schema validation
 *   2. Version check
 *   3. Hash verification (SHA-256)
 *   4. Signature verification (if a trust anchor is available)
 *
 * SEC-05: An artifact cannot establish its own authenticity by embedding
 * its own hash. The expected hash must come from the bundled manifest.
 *
 * @module integrity/artifact-verifier
 */

import { sha256, digestsEqual } from './hash.js';
import { canonicalize }         from '../protocol/canonicalize.js';
import { recordEvent }          from './hash-chain.js';

export async function initArtifactVerifier() {
  // TODO(milestone-03): Load bundled manifest and verify all listed artifacts.
}

/**
 * Verify a single artifact against an expected descriptor from the manifest.
 * @param {unknown} artifact         — parsed artifact content
 * @param {ArtifactDescriptor} desc  — expected schema, version, hash from manifest
 * @returns {Promise<boolean>}
 */
export async function verifyArtifact(artifact, desc) {
  // Step 1: Schema validation.
  if (!matchesSchema(artifact, desc.schema)) {
    await recordEvent('ARTIFACT_REJECTED', { reason: 'SCHEMA_MISMATCH', artifactId: desc.id });
    return false;
  }

  // Step 2: Version check.
  if (!isVersionSupported(artifact?.schemaVersion, desc.supportedVersionRange)) {
    await recordEvent('ARTIFACT_REJECTED', { reason: 'VERSION_UNSUPPORTED', artifactId: desc.id });
    return false;
  }

  // Step 3: Hash verification (SEC-05: expected hash comes from manifest, not the artifact).
  const bytes  = canonicalize(artifact);
  const actual = await sha256(bytes);
  if (!digestsEqual(actual, desc.expectedHash)) {
    await recordEvent('ARTIFACT_REJECTED', { reason: 'HASH_MISMATCH', artifactId: desc.id });
    return false;
  }

  // Step 4: Signature verification (where trust anchor is available).
  if (desc.signature && !await verifySignature(bytes, desc.signature, desc.publicKey)) {
    await recordEvent('ARTIFACT_REJECTED', { reason: 'SIGNATURE_INVALID', artifactId: desc.id });
    return false;
  }

  await recordEvent('ARTIFACT_VERIFIED', { artifactId: desc.id });
  return true;
}

function matchesSchema(artifact, schema) {
  // TODO(milestone-03): Implement schema validation for each artifact type.
  return artifact !== null && artifact !== undefined;
}

function isVersionSupported(version, range) {
  // TODO(milestone-03): Compare semver version against supported range.
  return typeof version === 'number' && version >= 1;
}

async function verifySignature(bytes, signature, publicKeyDer) {
  // TODO(milestone-03): Import publicKeyDer with crypto.subtle.importKey,
  // then verify signature with ECDSA/P-256 or Ed25519.
  return true;
}

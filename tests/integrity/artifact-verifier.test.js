/**
 * tests/integrity/artifact-verifier.test.js
 *
 * Validates SEC-05: Corrupted artifacts rejected and expected hash comes from manifest.
 */

// Mock hash-chain
jest.mock('../../src/integrity/hash-chain.js', () => ({
  recordEvent: jest.fn().mockResolvedValue(undefined),
}));

import { verifyArtifact } from '../../src/integrity/artifact-verifier.js';
import { sha256 } from '../../src/integrity/hash.js';
import { canonicalize } from '../../src/protocol/canonicalize.js';

describe('Artifact Verifier (SEC-05)', () => {
  const sampleArtifact = {
    schemaVersion: 1,
    hardRules: [{ id: 'hr-1', matchPatterns: ['*://*.miner.com/*'] }],
  };

  test('valid artifact with matching hash passes verification', async () => {
    const validHash = await sha256(canonicalize(sampleArtifact));
    const desc = {
      id: 'bundled-rules',
      schema: 'rules.schema.v1',
      supportedVersionRange: '>=1',
      expectedHash: validHash,
    };

    const result = await verifyArtifact(sampleArtifact, desc);
    expect(result).toBe(true);
  });

  test('tampered artifact with hash mismatch is rejected', async () => {
    const desc = {
      id: 'bundled-rules',
      schema: 'rules.schema.v1',
      supportedVersionRange: '>=1',
      expectedHash: '0000000000000000000000000000000000000000000000000000000000000000',
    };

    const result = await verifyArtifact(sampleArtifact, desc);
    expect(result).toBe(false);
  });

  test('artifact with invalid version is rejected', async () => {
    const badVersion = { ...sampleArtifact, schemaVersion: 0 };
    const hash = await sha256(canonicalize(badVersion));
    const desc = {
      id: 'bundled-rules',
      expectedHash: hash,
    };

    const result = await verifyArtifact(badVersion, desc);
    expect(result).toBe(false);
  });
});

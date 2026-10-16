/**
 * model-registry.js — Versioned model manifest and lifecycle management.
 *
 * Models must be declared in models/model-manifest.json and pass
 * artifact verification before they can be activated. The classifier
 * receives a verified model object, never a raw artifact.
 *
 * Models past their validUntil date are deactivated; the classifier
 * returns null until a verified replacement is loaded.
 *
 * @module intelligence/model-registry
 */

import { verifyArtifact } from '../integrity/artifact-verifier.js';
import { setModel }       from './classifier.js';
import { recordEvent }    from '../integrity/hash-chain.js';

export async function initModelRegistry(manifest) {
  const now = new Date();

  for (const descriptor of manifest.models) {
    const validUntil = new Date(descriptor.validUntil);
    if (validUntil < now) {
      await recordEvent('ARTIFACT_REJECTED', {
        reason:     'MODEL_EXPIRED',
        artifactId: descriptor.modelId,
        validUntil: descriptor.validUntil,
      });
      continue;
    }

    // TODO(milestone-04): Load the actual model artifact from the bundled file,
    // then pass it and the descriptor to verifyArtifact.
    const model      = null; // placeholder
    const isVerified = await verifyArtifact(model, descriptor);
    if (!isVerified) continue;

    setModel({ id: descriptor.modelId, ...model });
    await recordEvent('ML_MODEL_LOADED', { modelId: descriptor.modelId, version: descriptor.version });
    return; // Activate only the first valid model in manifest order.
  }
}

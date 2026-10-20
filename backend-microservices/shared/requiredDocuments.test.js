const assert = require('node:assert/strict');
const { test } = require('node:test');
const { getMissingRequiredDocuments } = require('./requiredDocuments');

test('requires all company identity and registration documents', () => {
  assert.deepEqual(
    getMissingRequiredDocuments('ENTREPRISE', ['CARTE_IDENTITE_RECTO', 'CARTE_IDENTITE_VERSO']),
    ['NINEA', 'REGISTRE_COMMERCE']
  );
});

test('requires driver identity and driving permit', () => {
  assert.deepEqual(
    getMissingRequiredDocuments('CHAUFFEUR', ['CARTE_IDENTITE_RECTO', 'PERMIS']),
    ['CARTE_IDENTITE_VERSO']
  );
});

test('accepts a complete carrier dossier and requires no admin documents', () => {
  assert.deepEqual(
    getMissingRequiredDocuments('TRANSPORTEUR', [
      'CARTE_IDENTITE_RECTO',
      'CARTE_IDENTITE_VERSO',
      'NINEA',
      'REGISTRE_COMMERCE',
      'LICENCE_TRANSPORT'
    ]),
    []
  );
  assert.deepEqual(getMissingRequiredDocuments('ADMIN', []), []);
});

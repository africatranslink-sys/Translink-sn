const assert = require('node:assert/strict');
const { test } = require('node:test');
const db = require('../config/db');
const DocumentModel = require('./documentModel');

test('updates a document status using explicit PostgreSQL enum and text types', async () => {
  const originalQuery = db.query;
  let query;
  let values;
  db.query = async (sql, params) => {
    query = sql;
    values = params;
    return { rows: [{ id: 42, statut: 'VALIDE', motif_refus: null }] };
  };

  try {
    const document = await DocumentModel.updateStatus(42, 'VALIDE', null);

    assert.equal(document.id, 42);
    assert.match(query, /statut\s*=\s*\$1::user_status/);
    assert.match(query, /motif_refus\s*=\s*\$3::text/);
    assert.deepEqual(values, ['VALIDE', 42, null]);
  } finally {
    db.query = originalQuery;
  }
});

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const isIgnorableDuplicateError = (error) => {
  const code = error && error.code;
  const message = (error && error.message) || '';

  return (
    code === '42710' ||
    code === '42P07' ||
    code === '23505' ||
    message.includes('already exists') ||
    message.includes('exist déjà') ||
    message.includes('déjà existe')
  );
};

const executeSqlFile = async (sqlFilePath) => {
  const sql = fs.readFileSync(sqlFilePath, 'utf8');
  const statements = sql
    .split(/;\s*(?=(?:[^'\"]|'[^']*'|\"[^\"]*\")*$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    try {
      await db.query(statement);
    } catch (error) {
      if (isIgnorableDuplicateError(error)) {
        continue;
      }

      throw error;
    }
  }
};

const initializeDatabase = async () => {
  try {
    console.log('Début de l\'initialisation de la base de données...');

    const sqlFilePath = path.join(__dirname, '../../database.sql');
    await executeSqlFile(sqlFilePath);
    console.log('Les tables sont disponibles et la base est prête.');
    return true;
  } catch (error) {
    console.error('Erreur lors de la création des tables :', error);
    throw error;
  }
};

if (require.main === module) {
  initializeDatabase().finally(() => {
    db.pool.end();
  });
}

module.exports = { initializeDatabase };

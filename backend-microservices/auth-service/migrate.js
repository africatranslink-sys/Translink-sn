const db = require('./src/config/db');

async function migrate() {
    try {
        await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS employeur_id INTEGER REFERENCES users(id) ON DELETE SET NULL;");
        console.log("employeur_id added to users");
        await db.query("ALTER TABLE camions ADD COLUMN IF NOT EXISTS chauffeur_id INTEGER REFERENCES users(id) ON DELETE SET NULL;");
        console.log("chauffeur_id added to camions");
        
        // Let's also update the database.sql file
    } catch(err) {
        console.error("Migration error:", err);
    } finally {
        process.exit();
    }
}
migrate();

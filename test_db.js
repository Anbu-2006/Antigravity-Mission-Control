const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require(path.join(__dirname, 'node_modules', 'sql.js'));
const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Antigravity IDE', 'User', 'globalStorage', 'state.vscdb');

async function main() {
    const SQL = await initSqlJs();
    const dbBuffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(dbBuffer);
    const stmt = db.prepare("SELECT value FROM ItemTable WHERE key = 'antigravityUnifiedStateSync.oauthToken'");
    if (stmt.step()) {
        const row = stmt.getAsObject();
        console.log("Raw hex of antigravityUnifiedStateSync.oauthToken:");
        console.log(Buffer.from(row.value, 'base64').toString('hex'));
    } else {
        console.log('Not found');
    }
    stmt.free();
    db.close();
}
main().catch(console.error);

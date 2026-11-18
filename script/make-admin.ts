// Usage: npm run make-admin -- <username> [admin|moderator|user]
import Database from "better-sqlite3";
const [name, role = "admin"] = process.argv.slice(2);
if (!name || !["admin", "moderator", "user"].includes(role)) { console.error("Usage: npm run make-admin -- <username> [admin|moderator|user]"); process.exit(1); }
const db = new Database("data.db");
const r = db.prepare(`UPDATE users SET role = ? WHERE lower(username) = lower(?)`).run(role, name);
console.log(r.changes ? `${name} is now ${role}.` : `No user named "${name}".`);
process.exit(r.changes ? 0 : 1);

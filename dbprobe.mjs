import { drizzle } from 'drizzle-orm/mysql2';
import { sql } from 'drizzle-orm';
import 'dotenv/config';
const db = drizzle(process.env.DATABASE_URL);
const r = await db.execute(sql`SELECT DATE(createdAt) as day, COUNT(*) as count FROM missions WHERE userId = 1 AND createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY day ORDER BY day ASC`);
console.log('isArray:', Array.isArray(r), 'len:', Array.isArray(r) ? r.length : Object.keys(r).length);
console.log(JSON.stringify(r, null, 2).slice(0, 800));

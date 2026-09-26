import { initSiteData, pool } from './site-data.js';

try {
  const email = process.env.SITE_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error('Set SITE_ADMIN_EMAIL');
  await initSiteData();
  const result = await pool.query(`INSERT INTO site_admin (user_id)
    SELECT id FROM "user" WHERE lower(email)= $1 AND "emailVerified"=true
    ON CONFLICT (user_id) DO NOTHING RETURNING user_id`, [email]);
  if (!result.rowCount) {
    const existing = await pool.query(`SELECT 1 FROM site_admin a JOIN "user" u ON u.id=a.user_id WHERE lower(u.email)=$1`, [email]);
    if (!existing.rowCount) throw new Error('Verified site user not found');
  }
  console.log(`Site administrator ready: ${email}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await pool.end(); }

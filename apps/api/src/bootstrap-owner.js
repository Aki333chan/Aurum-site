import { randomBytes } from 'node:crypto';
import { createAuth, pool } from './auth.js';
import { readConfig } from './config.js';
import { initSiteData } from './site-data.js';

try {
  const config = readConfig();
  await initSiteData();
  if (config.registrationEnabled || config.emailEnabled) throw new Error('Bootstrap is only allowed before public registration and email delivery are enabled');

  const email = process.env.BOOTSTRAP_EMAIL?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set BOOTSTRAP_EMAIL to a valid email address');
  const nickname = process.env.BOOTSTRAP_NICKNAME?.trim();
  if (!nickname) throw new Error('Set BOOTSTRAP_NICKNAME');
  const existing = await pool.query('SELECT COUNT(*)::int AS count FROM "user"');
  if (existing.rows[0].count !== 0) throw new Error('Bootstrap is only allowed for an empty site database');

  const password = randomBytes(24).toString('base64url');
  const bootstrapAuth = createAuth({ bootstrap: true });
  const result = await bootstrapAuth.api.signUpEmail({ body: { name: nickname, username: nickname, email, password } });
  const userId = result?.user?.id;
  if (!userId) throw new Error('Account creation did not return a user ID');

  const verified = await pool.query('UPDATE "user" SET "emailVerified" = TRUE WHERE id = $1 AND email = $2 RETURNING id', [userId, email]);
  if (verified.rowCount !== 1) throw new Error('Account was created but could not be marked verified');
  await pool.query('INSERT INTO site_admin (user_id) VALUES ($1)', [userId]);
  console.log(`Owner account ready: ${email}`);
  console.log(`Temporary password (shown once): ${password}`);
  console.log('Sign in and change this password in Settings immediately.');
} catch (error) {
  console.error('Owner bootstrap failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

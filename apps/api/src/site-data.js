import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { readConfig } from './config.js';

const config = readConfig();
const key = Buffer.from(hkdfSync('sha256', config.secret, 'aurum-site', 'smtp-password-v1', 32));

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 4,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

export function encryptSecret(plain) {
  if (!plain) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

export function decryptSecret(encoded) {
  if (!encoded) return '';
  const data = Buffer.from(encoded, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
}

export async function initSiteData() {
  await pool.query(`CREATE TABLE IF NOT EXISTS site_settings (
    id integer PRIMARY KEY CHECK (id = 1),
    maintenance_enabled boolean NOT NULL DEFAULT false,
    registration_enabled boolean NOT NULL DEFAULT false,
    email_enabled boolean NOT NULL DEFAULT false,
    smtp_host text NOT NULL DEFAULT '',
    smtp_port integer NOT NULL DEFAULT 587,
    smtp_user text NOT NULL DEFAULT '',
    smtp_password text,
    smtp_from text NOT NULL DEFAULT '',
    smtp_tested_at timestamptz,
    avatar_cooldown_hours integer NOT NULL DEFAULT 24 CHECK (avatar_cooldown_hours BETWEEN 1 AND 720)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS site_admin (
    user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS site_avatar (
    user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
    image bytea NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`INSERT INTO site_settings
    (id, registration_enabled, email_enabled, smtp_host, smtp_port, smtp_user, smtp_password, smtp_from)
    VALUES (1, $1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
  [config.registrationEnabled, config.emailEnabled, config.smtpHost, config.smtpPort || 587,
    config.smtpUser, encryptSecret(config.smtpPassword), config.smtpFrom]);
}

let cachedSettings;
let cachedUntil = 0;
export async function getSiteSettings() {
  if (cachedSettings && Date.now() < cachedUntil) return cachedSettings;
  const { rows } = await pool.query('SELECT * FROM site_settings WHERE id = 1');
  if (!rows[0]) throw new Error('Site settings are not initialized');
  cachedSettings = {
    maintenanceEnabled: rows[0].maintenance_enabled,
    registrationEnabled: rows[0].registration_enabled,
    emailEnabled: rows[0].email_enabled,
    smtpHost: rows[0].smtp_host,
    smtpPort: rows[0].smtp_port,
    smtpUser: rows[0].smtp_user,
    smtpPassword: decryptSecret(rows[0].smtp_password),
    smtpFrom: rows[0].smtp_from,
    smtpTestedAt: rows[0].smtp_tested_at,
    avatarCooldownHours: rows[0].avatar_cooldown_hours,
  };
  cachedUntil = Date.now() + 5000;
  return cachedSettings;
}

export function invalidateSiteSettings() { cachedUntil = 0; }

export async function isSiteAdmin(userId) {
  if (!userId) return false;
  const result = await pool.query('SELECT 1 FROM site_admin WHERE user_id = $1', [userId]);
  return result.rowCount === 1;
}

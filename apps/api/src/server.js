import { createServer } from 'node:http';
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import sharp from 'sharp';
import nodemailer from 'nodemailer';
import { auth } from './auth.js';
import { readConfig } from './config.js';
import { encryptSecret, getSiteSettings, initSiteData, invalidateSiteSettings, isSiteAdmin, pool } from './site-data.js';

const config = readConfig();
const handleAuth = toNodeHandler(auth);
const emailPaths = new Set(['/api/auth/request-password-reset', '/api/auth/forget-password', '/api/auth/send-verification-email']);

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.writeHead(status).end(JSON.stringify(body));
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function sessionFor(req) {
  return auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
}

function safeSettings(settings) {
  const { smtpPassword, ...publicSettings } = settings;
  return { ...publicSettings, smtpHasPassword: Boolean(smtpPassword) };
}

function validText(value, max) { return typeof value === 'string' && value.length <= max; }

async function updateSettings(body, current) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid settings');
  for (const field of ['maintenanceEnabled', 'registrationEnabled', 'emailEnabled']) {
    if (typeof body[field] !== 'boolean') throw new Error(`Invalid ${field}`);
  }
  for (const field of ['smtpHost', 'smtpUser', 'smtpFrom']) {
    if (!validText(body[field], 254)) throw new Error(`Invalid ${field}`);
  }
  if (!Number.isInteger(body.smtpPort) || body.smtpPort < 1 || body.smtpPort > 65535) throw new Error('Invalid SMTP port');
  if (!Number.isInteger(body.avatarCooldownHours) || body.avatarCooldownHours < 1 || body.avatarCooldownHours > 720) throw new Error('Invalid avatar cooldown');
  if (body.smtpPassword !== undefined && !validText(body.smtpPassword, 1024)) throw new Error('Invalid SMTP password');
  const nextPassword = body.smtpPassword || current.smtpPassword;
  const smtpChanged = ['smtpHost', 'smtpPort', 'smtpUser', 'smtpFrom'].some((field) => body[field] !== current[field]) || Boolean(body.smtpPassword);
  const testedAt = smtpChanged ? null : current.smtpTestedAt;
  const emailEnabled = smtpChanged ? false : body.emailEnabled;
  const registrationEnabled = smtpChanged ? false : body.registrationEnabled;
  if (emailEnabled && !testedAt) throw new Error('Сначала сохрани SMTP и отправь тестовое письмо');
  if (registrationEnabled && !emailEnabled) throw new Error('Для регистрации сначала включи почту');
  await pool.query(`UPDATE site_settings SET
    maintenance_enabled=$1, registration_enabled=$2, email_enabled=$3, smtp_host=$4, smtp_port=$5,
    smtp_user=$6, smtp_password=$7, smtp_from=$8, smtp_tested_at=$9, avatar_cooldown_hours=$10 WHERE id=1`,
  [body.maintenanceEnabled, registrationEnabled, emailEnabled, body.smtpHost.trim(), body.smtpPort,
    body.smtpUser.trim(), encryptSecret(nextPassword), body.smtpFrom.trim(), testedAt, body.avatarCooldownHours]);
  invalidateSiteSettings();
  return getSiteSettings();
}

function imageFormat(buffer) {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url || '/', 'http://localhost').pathname;
    if (path === '/api/health/ready' && req.method === 'GET') {
      await pool.query('SELECT 1');
      return json(res, 200, { ready: true });
    }
    const settings = await getSiteSettings();
    if (path === '/api/site/config' && req.method === 'GET') {
      return json(res, 200, { registrationEnabled: settings.registrationEnabled && !settings.maintenanceEnabled,
        emailEnabled: settings.emailEnabled, maintenanceEnabled: settings.maintenanceEnabled });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD' && !path.startsWith('/api/auth/') && req.headers.origin && req.headers.origin !== config.publicUrl) {
      return json(res, 403, { error: 'Invalid origin' });
    }
    if (path.startsWith('/api/auth/')) {
      if (!settings.emailEnabled && emailPaths.has(path)) return json(res, 503, { error: 'Email delivery is not configured' });
      if (settings.maintenanceEnabled && !['/api/auth/sign-in/email', '/api/auth/sign-in/username', '/api/auth/sign-out'].includes(path)) {
        const session = await sessionFor(req);
        if (!session || !await isSiteAdmin(session.user.id)) {
          if (path === '/api/auth/get-session') return json(res, 200, null);
          return json(res, 503, { error: 'Site maintenance' });
        }
      }
      return await handleAuth(req, res);
    }

    const session = await sessionFor(req);
    if (!session) return json(res, 401, { error: 'Sign in required' });
    const admin = await isSiteAdmin(session.user.id);
    if (settings.maintenanceEnabled && !admin) return json(res, 503, { error: 'Site maintenance' });

    if (path === '/api/site/me' && req.method === 'GET') {
      const avatar = await pool.query('SELECT updated_at FROM site_avatar WHERE user_id=$1', [session.user.id]);
      return json(res, 200, { admin, avatarUpdatedAt: avatar.rows[0]?.updated_at || null,
        avatarCooldownHours: settings.avatarCooldownHours });
    }
    if (path === '/api/site/me/avatar' && req.method === 'GET') {
      const avatar = await pool.query('SELECT image FROM site_avatar WHERE user_id=$1', [session.user.id]);
      if (!avatar.rows[0]) return json(res, 404, { error: 'No avatar' });
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.writeHead(200).end(avatar.rows[0].image);
    }
    if (path === '/api/site/me/avatar' && req.method === 'PUT') {
      const type = String(req.headers['content-type'] || '').split(';')[0];
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return json(res, 415, { error: 'Choose JPG, PNG or WebP' });
      if (Number(req.headers['content-length'] || 0) > 2_000_000) return json(res, 413, { error: 'Image exceeds 2 MB' });
      const previous = await pool.query('SELECT updated_at FROM site_avatar WHERE user_id=$1', [session.user.id]);
      if (previous.rows[0] && Date.now() < new Date(previous.rows[0].updated_at).getTime() + settings.avatarCooldownHours * 3600_000) {
        return json(res, 429, { error: 'Avatar change is on cooldown' });
      }
      const input = await readBody(req, 2_000_000);
      if (imageFormat(input) !== type) return json(res, 415, { error: 'Invalid image' });
      let image;
      try {
        image = await sharp(input, { limitInputPixels: 16_000_000, failOn: 'warning' })
          .rotate().resize(256, 256, { fit: 'cover' }).webp({ quality: 82 }).toBuffer();
      } catch { return json(res, 415, { error: 'Invalid image' }); }
      const saved = await pool.query(`INSERT INTO site_avatar (user_id, image) VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET image=EXCLUDED.image, updated_at=now()
        WHERE site_avatar.updated_at <= now() - ($3::integer * interval '1 hour') RETURNING updated_at`,
      [session.user.id, image, settings.avatarCooldownHours]);
      if (!saved.rowCount) return json(res, 429, { error: 'Avatar change is on cooldown' });
      return json(res, 200, { avatarUpdatedAt: saved.rows[0].updated_at });
    }

    if (path.startsWith('/api/site/admin/')) {
      if (!admin) return json(res, 403, { error: 'Admin access required' });
      if (path === '/api/site/admin/settings' && req.method === 'GET') return json(res, 200, safeSettings(settings));
      if (path === '/api/site/admin/settings' && req.method === 'PUT') {
        if (req.headers['content-type']?.split(';')[0] !== 'application/json') return json(res, 415, { error: 'JSON required' });
        let body;
        try { body = JSON.parse((await readBody(req, 8192)).toString('utf8')); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
        try { return json(res, 200, safeSettings(await updateSettings(body, settings))); }
        catch (error) { return json(res, 400, { error: error.message }); }
      }
      if (path === '/api/site/admin/smtp/test' && req.method === 'POST') {
        if (!settings.smtpHost || !settings.smtpPort || !settings.smtpUser || !settings.smtpPassword || !settings.smtpFrom) {
          return json(res, 400, { error: 'Fill in SMTP settings first' });
        }
        const transport = nodemailer.createTransport({ host: settings.smtpHost, port: settings.smtpPort,
          secure: settings.smtpPort === 465, requireTLS: settings.smtpPort !== 465,
          auth: { user: settings.smtpUser, pass: settings.smtpPassword }, connectionTimeout: 10000, greetingTimeout: 10000 });
        try {
          await transport.verify();
          await transport.sendMail({ from: settings.smtpFrom, to: session.user.email,
            subject: 'Aurum — проверка почты', text: 'Тестовое письмо из настроек Aurum Site.' });
          await pool.query('UPDATE site_settings SET smtp_tested_at=now() WHERE id=1');
          invalidateSiteSettings();
          return json(res, 200, { sentTo: session.user.email });
        } catch (error) {
          console.error('SMTP test failed:', error.message);
          return json(res, 502, { error: 'SMTP test failed; check host, port and credentials' });
        } finally { transport.close(); }
      }
    }
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error('Site request failed:', error.message);
    if (!res.headersSent) json(res, error.message === 'Body too large' ? 413 : 503, { error: 'Service unavailable' });
    else res.destroy();
  }
});

try {
  await initSiteData();
  server.listen(config.port, '127.0.0.1', () => console.log(`Aurum Site API listening on 127.0.0.1:${config.port}`));
} catch (error) {
  console.error('Aurum Site database unavailable:', error.message);
  await pool.end();
  process.exitCode = 1;
}

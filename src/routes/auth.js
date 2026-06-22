const express = require('express');
const crypto = require('crypto');
const { rateLimit } = require('express-rate-limit');
const OTPAuth = require('otpauth');
const QRCode = require('qrcode');
const mfaStore = require('../services/mfaStore');
const logger = require('../utils/logger');

const router = express.Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' }
});

const totpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many code attempts — try again in 15 minutes.' }
});

function timingSafeCompare(a, b) {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
        crypto.timingSafeEqual(bufA, bufA);
        return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
}

function isAuthEnabled() {
    return process.env.AUTH_ENABLED !== 'false';
}

function verifyTotp(token) {
    const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(mfaStore.getSecret()),
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
    });
    return totp.validate({ token, window: 1 }) !== null;
}

function buildQr(secret) {
    const totp = new OTPAuth.TOTP({
        issuer: 'RegistryView',
        label: process.env.UI_USERNAME || 'admin',
        secret: OTPAuth.Secret.fromBase32(secret),
        digits: 6,
        period: 30,
        algorithm: 'SHA1',
    });
    return QRCode.toDataURL(totp.toString(), { width: 200, margin: 1 });
}

// Login page
router.get('/login', (req, res) => {
    if (!isAuthEnabled()) return res.redirect('/');
    if (req.session && req.session.authenticated) return res.redirect('/');
    if (req.session) req.session.pendingUser = null;
    res.sendFile('login.html', { root: 'public' });
});

// Step 1 — username + password
router.post('/api/auth/login', loginLimiter, (req, res) => {
    if (!isAuthEnabled()) {
        req.session.authenticated = true;
        return res.json({ ok: true, mfaRequired: false });
    }

    const { username, password } = req.body || {};
    const validUser = process.env.UI_USERNAME || 'admin';
    const validPass = process.env.UI_PASSWORD;

    if (!validPass) return res.status(503).json({ error: 'UI_PASSWORD not configured' });

    const userOk = timingSafeCompare(username || '', validUser);
    const passOk = timingSafeCompare(password || '', validPass);

    if (userOk && passOk) {
        if (mfaStore.isConfigured() && mfaStore.isEnabled() && mfaStore.isConfirmed()) {
            req.session.pendingUser = { username };
            return res.json({ ok: true, mfaRequired: true });
        }
        req.session.authenticated = true;
        return res.json({ ok: true, mfaRequired: false });
    }

    return res.status(401).json({ error: 'Invalid username or password.' });
});

// Step 2 — TOTP code
router.post('/api/auth/totp', totpLimiter, (req, res) => {
    if (!req.session?.pendingUser) {
        return res.status(401).json({ error: 'No pending authentication' });
    }
    const { code } = req.body || {};
    if (!code || !/^\d{6}$/.test(code)) {
        return res.status(400).json({ error: 'A 6-digit code is required' });
    }
    try {
        if (verifyTotp(code)) {
            req.session.pendingUser = null;
            req.session.authenticated = true;
            return res.json({ ok: true });
        }
        return res.status(401).json({ error: 'Invalid code — check your authenticator app' });
    } catch {
        return res.status(503).json({ error: 'MFA configuration error — contact administrator' });
    }
});

// GET — current 2FA status. Returns configured:false when mfa.json doesn't exist.
router.get('/api/auth/2fa/setup', async (req, res) => {
    if (isAuthEnabled() && !req.session?.authenticated) {
        return res.status(401).json({ error: 'Unauthorised' });
    }
    if (!mfaStore.isConfigured()) {
        return res.json({ configured: false, confirmed: false, enabled: false });
    }
    try {
        const confirmed = mfaStore.isConfirmed();
        const secret = mfaStore.getSecret();
        // Only expose the raw secret and QR when setup is not yet confirmed — once confirmed
        // the authenticator is already enrolled and returning the secret would be unnecessary exposure.
        if (confirmed) {
            return res.json({ configured: true, confirmed: true, enabled: mfaStore.isEnabled() });
        }
        const qrDataUrl = await buildQr(secret);
        res.json({ configured: true, confirmed: false, enabled: false, qrDataUrl, secret });
    } catch (err) {
        logger.error('2FA setup GET error:', err.message);
        res.status(503).json({ error: 'Failed to load 2FA configuration.' });
    }
});

// POST — generate a new secret and write mfa.json (idempotent if already exists).
router.post('/api/auth/2fa/setup', async (req, res) => {
    if (isAuthEnabled() && !req.session?.authenticated) {
        return res.status(401).json({ error: 'Unauthorised' });
    }
    try {
        const secret = mfaStore.isConfigured() ? mfaStore.getSecret() : mfaStore.createSecret();
        mfaStore.resetConfirmed();
        const qrDataUrl = await buildQr(secret);
        res.json({ configured: true, confirmed: mfaStore.isConfirmed(), enabled: mfaStore.isEnabled(), qrDataUrl, secret });
    } catch (err) {
        logger.error('2FA setup POST error:', err.message);
        res.status(503).json({ error: 'Failed to generate 2FA secret.' });
    }
});

// 2FA verify — checks a code and marks setup as confirmed on success.
router.post('/api/auth/2fa/verify', (req, res) => {
    if (isAuthEnabled() && !req.session?.authenticated) return res.status(401).json({ error: 'Unauthorised' });
    if (!mfaStore.isConfigured()) return res.status(400).json({ error: '2FA is not set up' });
    const { code } = req.body || {};
    if (!code || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'A 6-digit code is required' });
    try {
        if (verifyTotp(code)) {
            mfaStore.markConfirmed();
            return res.json({ ok: true });
        }
        return res.status(401).json({ error: 'Invalid code — check your authenticator app' });
    } catch {
        return res.status(503).json({ error: 'MFA configuration error' });
    }
});

// Disable 2FA
router.post('/api/auth/2fa/disable', (req, res) => {
    if (isAuthEnabled() && !req.session?.authenticated) return res.status(401).json({ error: 'Unauthorised' });
    try {
        mfaStore.setEnabled(false);
        res.json({ ok: true });
    } catch (err) {
        logger.error('2FA disable error:', err.message);
        res.status(500).json({ error: 'Failed to disable 2FA.' });
    }
});

// Reset 2FA — deletes mfa.json so a new secret is generated on next access.
// Accessible when authenticated, or when auth is disabled (recovery mode).
router.post('/api/auth/2fa/reset', (req, res) => {
    if (isAuthEnabled() && !req.session?.authenticated) return res.status(401).json({ error: 'Unauthorised' });
    try {
        mfaStore.resetSecret();
        res.json({ ok: true });
    } catch (err) {
        logger.error('2FA reset error:', err.message);
        res.status(500).json({ error: 'Failed to reset 2FA.' });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;

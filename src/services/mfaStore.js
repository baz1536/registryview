const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const ALGORITHM = 'aes-256-gcm';
const MFA_FILE = path.join(process.env.DATA_DIR || '/app/data', 'mfa.json');

function generateSecret() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let s = '';
    while (s.length < 32) {
        const buf = crypto.randomBytes(64);
        for (const b of buf) {
            // Rejection sampling — discard values that would introduce bias
            if (b < 224 && s.length < 32) s += chars[b % 32];
        }
    }
    return s;
}

function deriveKey(salt) {
    const raw = process.env.ENCRYPTION_KEY;
    if (!raw) throw new Error('ENCRYPTION_KEY is not set');
    return crypto.scryptSync(raw, salt, 32);
}

function encrypt(plaintext) {
    const salt = crypto.randomBytes(16).toString('hex');
    const key = deriveKey(salt);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return { salt, data: Buffer.concat([iv, authTag, encrypted]).toString('hex') };
}

function decrypt(salt, hex) {
    const key = deriveKey(salt);
    const buf = Buffer.from(hex, 'hex');
    const iv = buf.subarray(0, 16);
    const authTag = buf.subarray(16, 32);
    const encrypted = buf.subarray(32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final('utf8');
}

function readFile() {
    if (!fs.existsSync(MFA_FILE)) return null;
    return JSON.parse(fs.readFileSync(MFA_FILE, 'utf8'));
}

function writeFile(payload) {
    fs.mkdirSync(path.dirname(MFA_FILE), { recursive: true });
    fs.writeFileSync(MFA_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

// Returns true if mfa.json exists (2FA has been set up).
function isConfigured() {
    return fs.existsSync(MFA_FILE);
}

// Returns the TOTP secret. Throws if mfa.json does not exist.
function getSecret() {
    const stored = readFile();
    if (!stored) throw new Error('MFA not configured');
    try {
        return decrypt(stored.salt, stored.data);
    } catch (err) {
        logger.error('Failed to decrypt mfa.json — ENCRYPTION_KEY may have changed:', err.message);
        throw new Error('MFA secret could not be decrypted', { cause: err });
    }
}

// Generates a new secret and writes mfa.json. Call when user initiates setup.
function createSecret() {
    const secret = generateSecret();
    const { salt, data } = encrypt(secret);
    writeFile({ salt, data, confirmed: false, enabled: false });
    logger.info('Generated new TOTP secret and saved to mfa.json');
    return secret;
}

// Returns true if the user has verified a code at least once (scanned and confirmed).
function isConfirmed() {
    const stored = readFile();
    return !!(stored && stored.confirmed);
}

// Called after a successful TOTP verify — marks setup as confirmed and enables 2FA.
function markConfirmed() {
    const stored = readFile();
    if (stored) {
        stored.confirmed = true;
        stored.enabled = true;
        writeFile(stored);
    }
}

// Resets confirmed and enabled flags — used when re-entering setup flow.
function resetConfirmed() {
    const stored = readFile();
    if (stored) {
        stored.confirmed = false;
        stored.enabled = false;
        writeFile(stored);
    }
}

// Deletes mfa.json — treated as 2FA not configured / disabled.
function resetSecret() {
    if (fs.existsSync(MFA_FILE)) {
        fs.unlinkSync(MFA_FILE);
        logger.info('mfa.json deleted — 2FA is now unconfigured');
    }
}

// Returns true if 2FA has been enabled by the user.
function isEnabled() {
    const stored = readFile();
    return !!(stored && stored.enabled);
}

// Enable or disable 2FA (only allowed once confirmed).
function setEnabled(value) {
    const stored = readFile();
    if (!stored) throw new Error('No MFA secret exists yet');
    stored.enabled = !!value;
    writeFile(stored);
}

module.exports = { isConfigured, getSecret, createSecret, isConfirmed, markConfirmed, resetConfirmed, isEnabled, setEnabled, resetSecret };

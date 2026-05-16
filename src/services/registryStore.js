const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const ALGORITHM = 'aes-256-gcm';
const LEGACY_SALT = 'registryview-salt';
const DATA_FILE = path.join(process.env.DATA_DIR || '/app/data', 'registries.json');

let derivedKey = null;
let activeSalt = null;

function deriveKey(salt) {
    const raw = process.env.ENCRYPTION_KEY;
    if (!raw) throw new Error('ENCRYPTION_KEY environment variable is not set');
    return crypto.scryptSync(raw, salt, 32);
}

function getKey() {
    if (derivedKey) return derivedKey;
    derivedKey = deriveKey(activeSalt);
    return derivedKey;
}

function encrypt(plaintext) {
    const key = getKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('hex');
}

function decrypt(hex) {
    const key = getKey();
    const buf = Buffer.from(hex, 'hex');
    const iv = buf.subarray(0, 16);
    const authTag = buf.subarray(16, 32);
    const encrypted = buf.subarray(32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final('utf8');
}

function readRaw() {
    try {
        if (!fs.existsSync(DATA_FILE)) return null;
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (err) {
        logger.error('Failed to read registries file:', err.message);
        return null;
    }
}

function writeFile(salt, registries) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify({ salt, registries }, null, 2), 'utf8');
}

// Called once at startup — migrates legacy flat-array format and ensures a random salt exists
function initialise() {
    const raw = readRaw();

    if (raw === null) {
        // Fresh install — generate salt, write empty store
        activeSalt = crypto.randomBytes(32).toString('hex');
        derivedKey = deriveKey(activeSalt);
        writeFile(activeSalt, []);
        logger.info('Initialised new registry store with random salt');
        return;
    }

    if (Array.isArray(raw)) {
        // Legacy format — flat array encrypted with hardcoded salt
        // Re-encrypt all passwords with a new random salt
        const newSalt = crypto.randomBytes(32).toString('hex');
        const legacyKey = deriveKey(LEGACY_SALT);

        const migrated = raw.map(reg => {
            if (!reg.password) return reg;
            try {
                // Decrypt with legacy key
                const buf = Buffer.from(reg.password, 'hex');
                const iv = buf.subarray(0, 16);
                const authTag = buf.subarray(16, 32);
                const encrypted = buf.subarray(32);
                const decipher = crypto.createDecipheriv(ALGORITHM, legacyKey, iv);
                decipher.setAuthTag(authTag);
                const plaintext = decipher.update(encrypted) + decipher.final('utf8');

                // Re-encrypt with new key (derived from newSalt)
                const newKey = deriveKey(newSalt);
                const newIv = crypto.randomBytes(16);
                const cipher = crypto.createCipheriv(ALGORITHM, newKey, newIv);
                const reEncrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
                const newAuthTag = cipher.getAuthTag();
                return { ...reg, password: Buffer.concat([newIv, newAuthTag, reEncrypted]).toString('hex') };
            } catch (err) {
                logger.error(`Migration: failed to re-encrypt password for registry ${reg.id}:`, err.message);
                return { ...reg, password: '' };
            }
        });

        activeSalt = newSalt;
        derivedKey = deriveKey(activeSalt);
        writeFile(activeSalt, migrated);
        logger.info(`Migrated ${migrated.length} registries to new salt format`);
        return;
    }

    // Current format — salt + registries object
    activeSalt = raw.salt;
    derivedKey = deriveKey(activeSalt);
}

function readRegistries() {
    const raw = readRaw();
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    return raw.registries || [];
}

function saveRegistries(registries) {
    writeFile(activeSalt, registries);
}

function decryptRegistry(reg) {
    return { ...reg, password: reg.password ? decrypt(reg.password) : '' };
}

function redact(reg) {
    const { password: _password, ...safe } = reg;
    return safe;
}

function getAll() {
    return readRegistries().map(redact);
}

function getById(id) {
    const reg = readRegistries().find(r => r.id === id);
    if (!reg) return null;
    return decryptRegistry(reg);
}

function create({ name, url, username, password }) {
    const registries = readRegistries();
    const entry = {
        id: uuidv4(),
        name,
        url: url.replace(/^https?:\/\//, '').replace(/\/$/, ''),
        username: username || '',
        password: password ? encrypt(password) : ''
    };
    registries.push(entry);
    saveRegistries(registries);
    logger.info(`Registry created: ${name}`);
    return redact(entry);
}

function update(id, { name, url, username, password }) {
    const registries = readRegistries();
    const idx = registries.findIndex(r => r.id === id);
    if (idx === -1) return null;
    const existing = registries[idx];
    registries[idx] = {
        ...existing,
        name: name ?? existing.name,
        url: url ? url.replace(/^https?:\/\//, '').replace(/\/$/, '') : existing.url,
        username: username ?? existing.username,
        password: password ? encrypt(password) : existing.password
    };
    saveRegistries(registries);
    logger.info(`Registry updated: ${registries[idx].name}`);
    return redact(registries[idx]);
}

function remove(id) {
    const registries = readRegistries();
    const idx = registries.findIndex(r => r.id === id);
    if (idx === -1) return false;
    registries.splice(idx, 1);
    saveRegistries(registries);
    logger.info(`Registry deleted: ${id}`);
    return true;
}

module.exports = { initialise, getAll, getById, create, update, remove };

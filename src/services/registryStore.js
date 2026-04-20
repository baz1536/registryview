const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const ALGORITHM = 'aes-256-gcm';
const SALT = 'registryview-salt';
const DATA_FILE = path.join(process.env.DATA_DIR || '/app/data', 'registries.json');

let derivedKey = null;

function getKey() {
    if (derivedKey) return derivedKey;
    const raw = process.env.ENCRYPTION_KEY;
    if (!raw) throw new Error('ENCRYPTION_KEY environment variable is not set');
    derivedKey = crypto.scryptSync(raw, SALT, 32);
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

function readFile() {
    try {
        if (!fs.existsSync(DATA_FILE)) return [];
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (err) {
        logger.error('Failed to read registries file:', err.message);
        return [];
    }
}

function writeFile(data) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function decryptRegistry(reg) {
    return { ...reg, password: reg.password ? decrypt(reg.password) : '' };
}

function redact(reg) {
    const { password, ...safe } = reg;
    return safe;
}

function getAll() {
    return readFile().map(redact);
}

function getById(id) {
    const reg = readFile().find(r => r.id === id);
    if (!reg) return null;
    return decryptRegistry(reg);
}

function create({ name, url, username, password }) {
    const registries = readFile();
    const entry = {
        id: uuidv4(),
        name,
        url: url.replace(/^https?:\/\//, '').replace(/\/$/, ''),
        username: username || '',
        password: password ? encrypt(password) : ''
    };
    registries.push(entry);
    writeFile(registries);
    logger.info(`Registry created: ${name}`);
    return redact(entry);
}

function update(id, { name, url, username, password }) {
    const registries = readFile();
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
    writeFile(registries);
    logger.info(`Registry updated: ${registries[idx].name}`);
    return redact(registries[idx]);
}

function remove(id) {
    const registries = readFile();
    const idx = registries.findIndex(r => r.id === id);
    if (idx === -1) return false;
    registries.splice(idx, 1);
    writeFile(registries);
    logger.info(`Registry deleted: ${id}`);
    return true;
}

module.exports = { getAll, getById, create, update, remove };

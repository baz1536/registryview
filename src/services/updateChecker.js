const https = require('https');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const REPO = 'baz1536/registryview';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // re-check every 6 hours

let cache = { latestVersion: null, updateAvailable: false, checkedAt: null };

function getCurrentVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
        return pkg.version;
    } catch {
        return null;
    }
}

function compareVersions(current, latest) {
    const parse = v => v.replace(/^v/, '').split('.').map(Number);
    const [cMaj, cMin, cPat] = parse(current);
    const [lMaj, lMin, lPat] = parse(latest);
    if (lMaj !== cMaj) return lMaj > cMaj;
    if (lMin !== cMin) return lMin > cMin;
    return lPat > cPat;
}

function fetchLatestRelease() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: `/repos/${REPO}/releases/latest`,
            headers: { 'User-Agent': 'RegistryView-UpdateChecker' },
        };
        const MAX_BYTES = 1024 * 1024; // 1 MB cap
        https.get(options, (res) => {
            let body = '';
            let size = 0;
            res.on('data', chunk => {
                size += chunk.length;
                if (size > MAX_BYTES) {
                    res.destroy();
                    reject(new Error('GitHub response too large'));
                    return;
                }
                body += chunk;
            });
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    resolve(data.tag_name || null);
                } catch {
                    reject(new Error('Failed to parse GitHub response'));
                }
            });
        }).on('error', reject);
    });
}

async function check() {
    const current = getCurrentVersion();
    if (!current) return;
    try {
        const tag = await fetchLatestRelease();
        if (!tag) return;
        const latest = tag.replace(/^v/, '');
        const updateAvailable = compareVersions(current, latest);
        cache = { latestVersion: latest, updateAvailable, checkedAt: Date.now() };
        if (updateAvailable) {
            logger.info(`Update available: v${current} → v${latest}`);
        } else {
            logger.info(`RegistryView is up to date (v${current})`);
        }
    } catch (err) {
        logger.warn('Update check failed:', err.message);
    }
}

function getStatus() {
    return {
        latestVersion: cache.latestVersion,
        updateAvailable: cache.updateAvailable,
        checkedAt: cache.checkedAt,
    };
}

function start() {
    check();
    setInterval(check, CACHE_TTL_MS);
}

module.exports = { start, getStatus };

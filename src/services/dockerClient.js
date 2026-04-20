const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const logger = require('../utils/logger');

const MANIFEST_ACCEPT = [
    'application/vnd.docker.distribution.manifest.v2+json',
    'application/vnd.docker.distribution.manifest.list.v2+json',
    'application/vnd.oci.image.manifest.v1+json',
    'application/vnd.oci.image.index.v1+json',
    'application/vnd.docker.distribution.manifest.v1+json'
].join(', ');

function basicAuth(username, password) {
    return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

function resolveBaseUrl(host) {
    const clean = host.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const isLocal = /^localhost(:\d+)?$/.test(clean) || /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(clean);
    return `${isLocal ? 'http' : 'https'}://${clean}`;
}

function isNoProxy(host) {
    const noProxy = process.env.NO_PROXY || process.env.no_proxy || '';
    if (!noProxy) return false;
    const clean = host.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    return noProxy.split(',').map(s => s.trim()).some(entry => {
        if (!entry) return false;
        if (entry === '*') return true;
        return clean === entry || clean.endsWith('.' + entry);
    });
}

function getProxyAgent(targetUrl) {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy ||
                     process.env.HTTP_PROXY  || process.env.http_proxy;
    if (!proxyUrl) return null;
    if (isNoProxy(targetUrl)) return null;
    return new HttpsProxyAgent(proxyUrl);
}

function buildAxiosConfig(registry, extra = {}) {
    const baseUrl = resolveBaseUrl(registry.url);
    const config = { ...extra, headers: { ...(extra.headers || {}) } };
    if (registry.username) {
        config.headers['Authorization'] = basicAuth(registry.username, registry.password);
    }
    const agent = getProxyAgent(baseUrl);
    if (agent) {
        config.httpsAgent = agent;
        config.httpAgent = agent;
        config.proxy = false; // disable axios built-in proxy so agent takes over
    }
    return { baseUrl, config };
}

async function registryRequest(registry, path, options = {}) {
    const { baseUrl, config } = buildAxiosConfig(registry, options);
    const url = `${baseUrl}${path}`;
    return axios({ url, ...config, validateStatus: () => true });
}

async function getCatalog(registry) {
    const res = await registryRequest(registry, '/v2/_catalog');
    if (res.status !== 200) throw new Error(`Registry catalog failed: ${res.status} ${res.statusText}`);
    return res.data;
}

async function getTags(registry, repoName) {
    const res = await registryRequest(registry, `/v2/${repoName}/tags/list`);
    if (res.status !== 200) throw new Error(`Tags list failed: ${res.status} ${res.statusText}`);
    return res.data;
}

async function getDigest(registry, repoName, tag) {
    const res = await registryRequest(registry, `/v2/${repoName}/manifests/${tag}`, {
        method: 'GET',
        headers: { Accept: MANIFEST_ACCEPT }
    });
    if (res.status === 404) throw new Error('404');
    if (res.status !== 200) throw new Error(`Manifest fetch failed: ${res.status} ${res.statusText}`);
    const digest = res.headers['docker-content-digest'];
    if (!digest) throw new Error(`No digest returned for ${repoName}:${tag} — the registry may not support deletion`);
    return digest;
}

async function deleteManifest(registry, repoName, digest) {
    const res = await registryRequest(registry, `/v2/${repoName}/manifests/${digest}`, {
        method: 'DELETE'
    });
    if (res.status !== 202 && res.status !== 200) {
        throw new Error(`Delete failed: ${res.status} ${res.statusText}`);
    }
    return true;
}

async function deleteTags(registry, repoName, tags) {
    const deleted = [];
    const errors = [];
    const deletedDigests = new Set();

    for (const tag of tags) {
        try {
            const digest = await getDigest(registry, repoName, tag);
            if (deletedDigests.has(digest)) {
                deleted.push(tag);
                logger.info(`Skipped ${repoName}:${tag} (${digest}) — manifest already deleted`);
            } else {
                await deleteManifest(registry, repoName, digest);
                deletedDigests.add(digest);
                deleted.push(tag);
                logger.info(`Deleted ${repoName}:${tag} (${digest})`);
            }
        } catch (err) {
            if (err.message === '404') {
                deleted.push(tag);
                logger.info(`Skipped ${repoName}:${tag} — manifest not found, treating as already deleted`);
            } else {
                errors.push({ tag, error: err.message });
                logger.error(`Failed to delete ${repoName}:${tag}: ${err.message}`);
            }
        }
    }

    return { deleted, errors };
}

async function getArchitectures(registry, repoName, tag) {
    const res = await registryRequest(registry, `/v2/${repoName}/manifests/${tag}`, {
        method: 'GET',
        headers: { Accept: MANIFEST_ACCEPT }
    });
    if (res.status !== 200) return [];
    const contentType = res.headers['content-type'] || '';
    const body = res.data;

    if (
        contentType.includes('manifest.list') ||
        contentType.includes('oci.image.index') ||
        body.mediaType === 'application/vnd.docker.distribution.manifest.list.v2+json' ||
        body.mediaType === 'application/vnd.oci.image.index.v1+json' ||
        (body.schemaVersion === 2 && Array.isArray(body.manifests))
    ) {
        return (body.manifests || [])
            .filter(m => m.platform && m.platform.architecture !== 'unknown')
            .map(m => {
                const p = m.platform;
                const variant = p.variant ? `/${p.variant}` : '';
                return `${p.os}/${p.architecture}${variant}`;
            });
    }

    if (body.config && body.config.digest) {
        try {
            const cfgRes = await registryRequest(registry, `/v2/${repoName}/blobs/${body.config.digest}`, {
                headers: { Accept: 'application/json' }
            });
            if (cfgRes.status === 200) {
                const cfg = cfgRes.data;
                if (cfg.architecture) return [`${cfg.os || 'linux'}/${cfg.architecture}`];
            }
        } catch {}
    }

    return [];
}

async function testConnection(registry) {
    try {
        const res = await registryRequest(registry, '/v2/');
        if (res.status === 200) return { ok: true, message: 'Connected and authenticated successfully.' };
        if (res.status === 401) return { ok: false, error: 'Registry reachable but authentication failed. Check username and password.' };
        return { ok: false, error: `Unexpected response: ${res.status} ${res.statusText}` };
    } catch (err) {
        return { ok: false, error: `Could not reach registry: ${err.message}` };
    }
}

module.exports = { getCatalog, getTags, getDigest, deleteManifest, deleteTags, testConnection, getArchitectures };

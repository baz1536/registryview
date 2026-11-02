const express = require('express');
const router = express.Router();
const store = require('../services/registryStore');
const docker = require('../services/dockerClient');
const logger = require('../utils/logger');

// Repo and tag names go straight into upstream API paths, so only valid Docker names are accepted
function isValidRepo(repo) {
    return typeof repo === 'string' && repo.length <= 255 && /^[a-z0-9._/-]+$/.test(repo) &&
        repo.split('/').every(part => part && part !== '.' && part !== '..');
}

function isValidTag(tag) {
    return typeof tag === 'string' && /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(tag);
}

function getRegistry(req, res) {
    const registry = store.getById(req.params.registryId);
    if (!registry) {
        res.status(404).json({ error: 'Registry not found' });
        return null;
    }
    return registry;
}

// Catalog with tag counts fetched in parallel
router.get('/:registryId/catalog', async (req, res) => {
    const registry = getRegistry(req, res);
    if (!registry) return;
    try {
        const { repositories } = await docker.getCatalog(registry);
        const firstRepo = (repositories || [])[0];
        const deletionEnabled = await docker.checkDeletionEnabled(registry, firstRepo);
        const withCounts = await Promise.all(
            (repositories || []).map(async name => {
                try {
                    const { tags } = await docker.getTags(registry, name);
                    return { name, tagCount: (tags || []).length };
                } catch {
                    return { name, tagCount: null };
                }
            })
        );
        res.json({ repositories: withCounts, deletionEnabled });
    } catch (err) {
        logger.error('Catalog error:', err.message);
        res.status(502).json({ error: 'Failed to fetch catalog from registry.' });
    }
});

router.get('/:registryId/tags', async (req, res) => {
    const registry = getRegistry(req, res);
    if (!registry) return;
    const { repo } = req.query;
    if (!repo) return res.status(400).json({ error: 'repo query param required' });
    if (!isValidRepo(repo)) return res.status(400).json({ error: 'Invalid repo name' });
    try {
        const data = await docker.getTags(registry, repo);
        res.json(data);
    } catch (err) {
        logger.error('Tags error:', err.message);
        res.status(502).json({ error: 'Failed to fetch tags from registry.' });
    }
});

router.delete('/:registryId/tags', async (req, res) => {
    const registry = getRegistry(req, res);
    if (!registry) return;
    const { repo, tags } = req.body;
    if (!repo || !Array.isArray(tags) || tags.length === 0) {
        return res.status(400).json({ error: 'repo and tags[] are required' });
    }
    if (!isValidRepo(repo) || !tags.every(isValidTag)) {
        return res.status(400).json({ error: 'Invalid repo or tag name' });
    }
    try {
        const result = await docker.deleteTags(registry, repo, tags);
        res.json(result);
    } catch (err) {
        logger.error('Delete tags error:', err.message);
        res.status(502).json({ error: 'Failed to delete tags from registry.' });
    }
});

router.get('/:registryId/architectures', async (req, res) => {
    const registry = getRegistry(req, res);
    if (!registry) return;
    const { repo, tag } = req.query;
    if (!repo || !tag) return res.status(400).json({ error: 'repo and tag query params required' });
    if (!isValidRepo(repo) || !isValidTag(tag)) return res.status(400).json({ error: 'Invalid repo or tag name' });
    try {
        const archs = await docker.getArchitectures(registry, repo, tag);
        res.json({ architectures: archs });
    } catch (err) {
        logger.error('Architectures error:', err.message);
        res.status(502).json({ error: 'Failed to fetch image architectures from registry.' });
    }
});

// Delete all tags for a repo (delete image)
router.delete('/:registryId/image', async (req, res) => {
    const registry = getRegistry(req, res);
    if (!registry) return;
    const { repo } = req.body;
    if (!repo) return res.status(400).json({ error: 'repo is required' });
    if (!isValidRepo(repo)) return res.status(400).json({ error: 'Invalid repo name' });
    try {
        const { tags } = await docker.getTags(registry, repo);
        if (!tags || !tags.length) return res.json({ deleted: [], errors: [] });
        const result = await docker.deleteTags(registry, repo, tags);
        res.json(result);
    } catch (err) {
        logger.error('Delete image error:', err.message);
        res.status(502).json({ error: 'Failed to delete image from registry.' });
    }
});

module.exports = router;

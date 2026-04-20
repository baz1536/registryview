const express = require('express');
const router = express.Router();
const store = require('../services/registryStore');
const docker = require('../services/dockerClient');
const logger = require('../utils/logger');

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
        res.json({ repositories: withCounts });
    } catch (err) {
        logger.error('Catalog error:', err.message);
        res.status(502).json({ error: err.message });
    }
});

router.get('/:registryId/tags', async (req, res) => {
    const registry = getRegistry(req, res);
    if (!registry) return;
    const { repo } = req.query;
    if (!repo) return res.status(400).json({ error: 'repo query param required' });
    try {
        const data = await docker.getTags(registry, repo);
        res.json(data);
    } catch (err) {
        logger.error('Tags error:', err.message);
        res.status(502).json({ error: err.message });
    }
});

router.delete('/:registryId/tags', async (req, res) => {
    const registry = getRegistry(req, res);
    if (!registry) return;
    const { repo, tags } = req.body;
    if (!repo || !Array.isArray(tags) || tags.length === 0) {
        return res.status(400).json({ error: 'repo and tags[] are required' });
    }
    try {
        const result = await docker.deleteTags(registry, repo, tags);
        res.json(result);
    } catch (err) {
        logger.error('Delete tags error:', err.message);
        res.status(502).json({ error: err.message });
    }
});

router.get('/:registryId/architectures', async (req, res) => {
    const registry = getRegistry(req, res);
    if (!registry) return;
    const { repo, tag } = req.query;
    if (!repo || !tag) return res.status(400).json({ error: 'repo and tag query params required' });
    try {
        const archs = await docker.getArchitectures(registry, repo, tag);
        res.json({ architectures: archs });
    } catch (err) {
        logger.error('Architectures error:', err.message);
        res.status(502).json({ error: err.message });
    }
});

// Delete all tags for a repo (delete image)
router.delete('/:registryId/image', async (req, res) => {
    const registry = getRegistry(req, res);
    if (!registry) return;
    const { repo } = req.body;
    if (!repo) return res.status(400).json({ error: 'repo is required' });
    try {
        const { tags } = await docker.getTags(registry, repo);
        if (!tags || !tags.length) return res.json({ deleted: [], errors: [] });
        const result = await docker.deleteTags(registry, repo, tags);
        res.json(result);
    } catch (err) {
        logger.error('Delete image error:', err.message);
        res.status(502).json({ error: err.message });
    }
});

module.exports = router;

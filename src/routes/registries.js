const express = require('express');
const router = express.Router();
const store = require('../services/registryStore');
const docker = require('../services/dockerClient');
const logger = require('../utils/logger');

function validateHost(url) {
    const clean = url.replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
    return clean.length > 0 && /[.:]/.test(clean);
}

router.get('/', (req, res) => {
    res.json(store.getAll());
});

router.post('/', (req, res) => {
    const { name, url, username, password } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'name and url are required' });
    if (!validateHost(url)) return res.status(400).json({ error: 'url must be a valid registry hostname, e.g. docker.dbrose.uk or localhost:5000' });
    try {
        const registry = store.create({ name, url, username, password });
        res.status(201).json(registry);
    } catch (err) {
        logger.error('Create registry error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', (req, res) => {
    const { name, url, username, password } = req.body;
    if (url && !validateHost(url)) return res.status(400).json({ error: 'url must be a valid registry hostname, e.g. docker.dbrose.uk or localhost:5000' });
    try {
        const registry = store.update(req.params.id, { name, url, username, password });
        if (!registry) return res.status(404).json({ error: 'Registry not found' });
        res.json(registry);
    } catch (err) {
        logger.error('Update registry error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/:id/test', async (req, res) => {
    const registry = store.getById(req.params.id);
    if (!registry) return res.status(404).json({ error: 'Registry not found' });
    const result = await docker.testConnection(registry);
    res.json(result);
});

router.delete('/:id', (req, res) => {
    const ok = store.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Registry not found' });
    res.json({ ok: true });
});

module.exports = router;

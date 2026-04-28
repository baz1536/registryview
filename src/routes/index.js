const express = require('express');
const router = express.Router();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const logger = require('../utils/logger');

router.get('/about', async (_req, res) => {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));

        // Read real installed versions from package-lock.json, fall back to node_modules, then package.json range
        let lockVersions = {};
        try {
            const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package-lock.json'), 'utf8'));
            for (const [key, val] of Object.entries(lock.packages || {})) {
                if (key.startsWith('node_modules/') && !key.slice(13).includes('/')) {
                    lockVersions[key.slice(13)] = val.version;
                }
            }
        } catch {}

        function resolvedVersions(deps) {
            const result = {};
            for (const name of Object.keys(deps || {})) {
                if (lockVersions[name]) {
                    result[name] = lockVersions[name];
                } else {
                    try {
                        const depPkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../node_modules', name, 'package.json'), 'utf8'));
                        result[name] = depPkg.version;
                    } catch {
                        result[name] = deps[name];
                    }
                }
            }
            return result;
        }

        const resolvedDeps = resolvedVersions(pkg.dependencies);
        const _resolvedDevDeps = resolvedVersions(pkg.devDependencies);

        const nodeVersion = process.version;
        let npmVersion = 'Unknown';
        try { npmVersion = `v${execSync('npm --version').toString().trim()}`; } catch {}

        const platform = os.platform();
        let environment = 'Unknown';
        if (platform === 'win32') environment = 'Windows';
        else if (platform === 'darwin') environment = 'macOS';
        else if (platform === 'linux') environment = 'Linux';

        const isDocker = fs.existsSync('/.dockerenv');

        let distro = null;
        try {
            if (fs.existsSync('/etc/os-release')) {
                const m = fs.readFileSync('/etc/os-release', 'utf8').match(/PRETTY_NAME="([^"]+)"/);
                if (m) distro = m[1];
            }
        } catch {}

        const networkInterfaces = os.networkInterfaces();
        const ipAddresses = [];
        for (const name of Object.keys(networkInterfaces)) {
            for (const net of networkInterfaces[name]) {
                if (!net.internal && net.family === 'IPv4') {
                    ipAddresses.push(net.address);
                }
            }
        }

        const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3544;

        let gitBranch = null;
        try { gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim(); } catch {}

        res.json({
            name: pkg.name,
            version: pkg.version,
            description: pkg.description,
            nodeVersion,
            npmVersion,
            gitBranch,
            authEnabled: process.env.AUTH_ENABLED !== 'false',
            showEnvironment: process.env.SHOW_ENVIRONMENT !== 'false',
            environment: {
                os: environment,
                distro,
                platform,
                architecture: os.arch(),
                isDocker,
                hostname: os.hostname(),
                port,
                ipAddresses
            },
            dependencies: resolvedDeps,
            devDependencies: pkg.devDependencies || {}
        });
    } catch (err) {
        logger.error('About info error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

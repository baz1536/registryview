const express = require('express');
const session = require('express-session');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');
const logger = require('./utils/logger');
const requireAuth = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const registriesRoutes = require('./routes/registries');
const dockerRoutes = require('./routes/docker');
const aboutRoutes = require('./routes/index');

const app = express();
const DEFAULT_PORT = 3544;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'change-me-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 }
}));

// Public routes — no auth
app.use('/', authRoutes);
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Serve static assets (css, js, images) publicly
app.use('/css', express.static(path.join(__dirname, '../public/css')));
app.use('/js', express.static(path.join(__dirname, '../public/js')));
app.use('/images', express.static(path.join(__dirname, '../public/images')));

// Protected HTML pages
app.get('/', requireAuth, (req, res) => res.redirect('/repositories.html'));
app.get('/repositories.html', requireAuth, (req, res) => res.sendFile('repositories.html', { root: 'public' }));
app.get('/registries.html', requireAuth, (req, res) => res.sendFile('registries.html', { root: 'public' }));
app.get('/about.html', requireAuth, (req, res) => res.sendFile('about.html', { root: 'public' }));

// Protected API routes
app.use('/api/registries', requireAuth, registriesRoutes);
app.use('/api/docker', requireAuth, dockerRoutes);
app.use('/api', requireAuth, aboutRoutes);

async function startServer() {
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_PORT;
    const isDocker = fs.existsSync('/.dockerenv');

    app.listen(port, () => {
        let npmVersion = 'Unknown';
        try { npmVersion = `v${execSync('npm --version').toString().trim()}`; } catch {}

        logger.info(`RegistryView running on http://localhost:${port}`);
        console.log(`\nRegistryView is running!\n`);
        console.log(`  Node:    ${process.version} / npm ${npmVersion}`);
        console.log(`  Local:   http://localhost:${port}`);

        if (!isDocker) {
            const nets = os.networkInterfaces();
            for (const name of Object.keys(nets)) {
                for (const net of nets[name]) {
                    if (net.family === 'IPv4' && !net.internal) {
                        console.log(`  Network: http://${net.address}:${port}`);
                        break;
                    }
                }
            }
        }

        if (process.env.NGINX_URL) console.log(`  Nginx:   ${process.env.NGINX_URL}`);
        console.log(`  Auth:    ${process.env.AUTH_ENABLED === 'false' ? 'disabled' : 'enabled'}`);
        console.log('');

        if (isDocker) logger.info('Running inside Docker container');
        logger.info(`Environment: ${os.platform()} / ${os.arch()}`);
        logger.info(`Auth: ${process.env.AUTH_ENABLED === 'false' ? 'disabled' : 'enabled'}`);
    });
}

startServer();

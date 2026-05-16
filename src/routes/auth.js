const express = require('express');
const crypto = require('crypto');
const { rateLimit } = require('express-rate-limit');
const router = express.Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' }
});

function timingSafeCompare(a, b) {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
        // Still run comparison to avoid timing leak
        crypto.timingSafeEqual(bufA, bufA);
        return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
}

router.get('/login', (req, res) => {
    if (process.env.AUTH_ENABLED === 'false') return res.redirect('/');
    if (req.session && req.session.authenticated) return res.redirect('/');
    res.sendFile('login.html', { root: 'public' });
});

router.post('/login', loginLimiter, (req, res) => {
    const { username, password } = req.body;
    const validUser = process.env.UI_USERNAME || 'admin';
    const validPass = process.env.UI_PASSWORD;
    if (!validPass) return res.redirect('/login?error=1');

    const userOk = timingSafeCompare(username || '', validUser);
    const passOk = timingSafeCompare(password || '', validPass);

    if (userOk && passOk) {
        req.session.authenticated = true;
        return res.redirect('/');
    }

    res.redirect('/login?error=1');
});

router.post('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

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

router.post('/login', (req, res) => {
    const { username, password } = req.body;
    const validUser = process.env.UI_USERNAME || 'admin';
    const validPass = process.env.UI_PASSWORD || 'changeme';

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

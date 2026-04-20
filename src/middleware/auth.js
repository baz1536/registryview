module.exports = function requireAuth(req, res, next) {
    if (process.env.AUTH_ENABLED === 'false') return next();
    if (req.session && req.session.authenticated) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorised' });
    return res.redirect('/login');
};

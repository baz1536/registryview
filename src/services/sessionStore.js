const fs = require('fs');
const path = require('path');
const session = require('express-session');
const logger = require('../utils/logger');
const { writeFileAtomic } = require('../utils/atomicFile');

const SESSION_FILE = path.join(process.env.DATA_DIR || '/app/data', 'sessions.json');
const PRUNE_INTERVAL_MS = 15 * 60 * 1000;

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function isExpired(sess) {
    const expires = sess.cookie && sess.cookie.expires;
    return !!expires && new Date(expires).getTime() <= Date.now();
}

// File-backed session store — sessions survive restarts and expired ones are pruned
class FileSessionStore extends session.Store {
    constructor() {
        super();
        this.sessions = this.load();
        this.prune();
        setInterval(() => this.prune(), PRUNE_INTERVAL_MS).unref();
    }

    load() {
        try {
            if (!fs.existsSync(SESSION_FILE)) return new Map();
            return new Map(Object.entries(JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'))));
        } catch (err) {
            logger.warn(`Ignoring unreadable sessions file: ${err.message}`);
            return new Map();
        }
    }

    save() {
        try {
            writeFileAtomic(SESSION_FILE, JSON.stringify(Object.fromEntries(this.sessions)));
        } catch (err) {
            logger.error(`Failed to write sessions file: ${err.message}`);
        }
    }

    prune() {
        let removed = false;
        for (const [sid, sess] of this.sessions) {
            if (isExpired(sess)) {
                this.sessions.delete(sid);
                removed = true;
            }
        }
        if (removed) this.save();
    }

    get(sid, callback) {
        const sess = this.sessions.get(sid);
        if (!sess || isExpired(sess)) return callback(null, null);
        callback(null, clone(sess));
    }

    set(sid, sess, callback) {
        this.sessions.set(sid, clone(sess));
        this.save();
        callback(null);
    }

    destroy(sid, callback) {
        this.sessions.delete(sid);
        this.save();
        callback(null);
    }

    // Called on every request, so only updates memory — set() and destroy() persist
    touch(sid, sess, callback) {
        const existing = this.sessions.get(sid);
        if (existing) existing.cookie = clone(sess.cookie);
        callback(null);
    }
}

module.exports = FileSessionStore;

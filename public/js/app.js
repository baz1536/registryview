// Shared utilities and nav initialisation

function initNav(activePage) {
    const nav = document.getElementById('main-nav');
    if (!nav) return;

    function renderNav(authEnabled) {
        nav.innerHTML = `
            <a href="/repositories.html" class="nav-brand">
                <img src="/images/logo.svg" alt="" width="32" height="32">
                <span><span class="nav-brand-registry">Registry</span><span class="nav-brand-view">View</span></span>
            </a>
            <a href="/repositories.html" class="nav-link ${activePage === 'repositories' ? 'active' : ''}">Repositories</a>
            <a href="/registries.html" class="nav-link ${activePage === 'registries' ? 'active' : ''}">Registries</a>
            ${authEnabled ? `<a href="/security.html" class="nav-link ${activePage === 'security' ? 'active' : ''}">Security</a>` : ''}
            <a href="/about.html" class="nav-link ${activePage === 'about' ? 'active' : ''}">About</a>
            <span class="nav-spacer"></span>
            ${authEnabled ? `<form method="POST" action="/logout" class="nav-logout-form"><button type="submit" class="nav-logout">Sign out</button></form>` : ''}
        `;
    }

    fetch('/api/about').then(r => r.json()).then(d => {
        renderNav(d.authEnabled !== false);
        if (d.updateAvailable && d.latestVersion) {
            _showUpdateToast(d.latestVersion);
        }
    }).catch(() => renderNav(true));
    fetch('/api/env').then(r => r.json()).then(d => {
        if (d.isDevelopment) { document.getElementById('dev-banner')?.classList.add('show'); document.body.classList.add('has-dev-banner'); }
    }).catch(() => {});
}

async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options
    });
    if (res.status === 401) {
        window.location.href = '/login';
        return null;
    }
    return res;
}

function showAlert(containerId, message, type = 'error') {
    const el = document.getElementById(containerId);
    if (!el) return;
    const div = document.createElement('div');
    div.className = `alert alert-${type}`;
    const msgSpan = document.createElement('span');
    msgSpan.className = 'alert-message';
    msgSpan.textContent = message;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'alert-close';
    closeBtn.setAttribute('aria-label', 'Dismiss');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => div.remove());
    div.appendChild(msgSpan);
    div.appendChild(closeBtn);
    el.appendChild(div);
    if (type === 'success') {
        setTimeout(() => div.remove(), 5000);
    }
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
}

// ===== Confirm Modal =====

let _modalResolve = null;

function _ensureModal() {
    if (document.getElementById('confirm-modal')) return;

    const el = document.createElement('div');
    el.id = 'confirm-modal';
    el.className = 'modal-backdrop';
    el.innerHTML = `
        <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div class="modal-header">
                <span class="modal-icon" id="modal-icon">⚠️</span>
                <h3 class="modal-title" id="modal-title"></h3>
            </div>
            <p class="modal-body" id="modal-body"></p>
            <div class="modal-confirm-input hidden" id="modal-confirm-input-wrap">
                <label class="modal-confirm-label" for="modal-confirm-input">Type <strong>DELETE</strong> to confirm</label>
                <input type="text" id="modal-confirm-input" class="modal-confirm-field" autocomplete="off" spellcheck="false" placeholder="DELETE">
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-ghost" id="modal-cancel">Cancel</button>
                <button type="button" class="btn btn-danger" id="modal-confirm">Delete</button>
            </div>
        </div>
    `;
    document.body.appendChild(el);

    document.getElementById('modal-cancel').addEventListener('click', () => _closeModal(false));
    document.getElementById('modal-confirm').addEventListener('click', () => _closeModal(true));
    document.getElementById('modal-confirm-input').addEventListener('input', _syncConfirmButton);
    el.addEventListener('click', (e) => { if (e.target === el) _closeModal(false); });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && el.classList.contains('open')) _closeModal(false);
    });
}

function _syncConfirmButton() {
    const input = document.getElementById('modal-confirm-input');
    const btn = document.getElementById('modal-confirm');
    if (input && btn) btn.disabled = input.value !== 'DELETE';
}

function _closeModal(result) {
    const modal = document.getElementById('confirm-modal');
    if (modal) modal.classList.remove('open');
    const input = document.getElementById('modal-confirm-input');
    if (input) input.value = '';
    if (_modalResolve) {
        _modalResolve(result);
        _modalResolve = null;
    }
}

function showConfirm({ title, body, confirmText = 'Delete', icon = '🗑️', requireWord = false }) {
    _ensureModal();
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').textContent = body;
    document.getElementById('modal-confirm').textContent = confirmText;
    document.getElementById('modal-icon').textContent = icon;

    const inputWrap = document.getElementById('modal-confirm-input-wrap');
    const confirmBtn = document.getElementById('modal-confirm');
    const input = document.getElementById('modal-confirm-input');

    if (requireWord) {
        inputWrap.classList.remove('hidden');
        confirmBtn.disabled = true;
        input.value = '';
        setTimeout(() => input.focus(), 50);
    } else {
        inputWrap.classList.add('hidden');
        confirmBtn.disabled = false;
    }

    document.getElementById('confirm-modal').classList.add('open');
    if (!requireWord) confirmBtn.focus();

    return new Promise(resolve => { _modalResolve = resolve; });
}

// ===== Update toast =====

function _showUpdateToast(latestVersion) {
    if (document.getElementById('update-toast')) return;
    if (sessionStorage.getItem('update-toast-dismissed') === latestVersion) return;
    const el = document.createElement('div');
    el.id = 'update-toast';
    el.className = 'update-toast';
    el.innerHTML = `
        <span class="update-toast-icon">&#8593;</span>
        <div class="update-toast-body">
            <div class="update-toast-title">Update available — v${escapeHtml(latestVersion)}</div>
            <div class="update-toast-sub">
                <a href="https://hub.docker.com/r/baz1536/registryview" class="update-toast-link" target="_blank" rel="noopener">Docker Hub &#8599;</a>
                <span style="color:var(--border-strong);margin:0 4px">|</span>
                <a href="https://github.com/baz1536/registryview/releases/latest" class="update-toast-link" target="_blank" rel="noopener">Release notes &#8599;</a>
            </div>
        </div>
        <button class="update-toast-close" aria-label="Dismiss">&times;</button>`;
    document.body.appendChild(el);
    el.querySelector('.update-toast-close').addEventListener('click', () => {
        sessionStorage.setItem('update-toast-dismissed', latestVersion);
        el.remove();
    });
}

document.getElementById('year').textContent = new Date().getFullYear();
initNav('repositories');

const state = {
    registryId: null,
    repos: {},       // { repoName: { tags: [], open: bool, tagCount: null } }
    selected: {},    // { 'repoName::tag': true }
    deletionEnabled: true
};

// ===== Registry selector =====

async function loadRegistryOptions() {
    const select = document.getElementById('registry-select');
    const res = await apiFetch('/api/registries');
    if (!res) return;
    const registries = await res.json();

    if (!registries.length) {
        window.location.href = '/registries.html';
        return;
    }

    select.innerHTML = '<option value="">— Select a registry —</option>' +
        registries.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');

    if (registries.length === 1) {
        select.style.display = 'none';
        const subtitle = document.getElementById('registry-subtitle');
        if (subtitle) {
            subtitle.textContent = registries[0].name;
            const h1 = subtitle.closest('.toolbar')?.querySelector('h1');
            if (h1) { h1.style.fontSize = '11px'; h1.style.color = 'var(--text-muted)'; h1.style.textTransform = 'uppercase'; h1.style.letterSpacing = '0.6px'; h1.style.fontWeight = '600'; }
        }
        select.value = registries[0].id;
        select.dispatchEvent(new Event('change'));
    }
}

document.getElementById('registry-select').addEventListener('change', (e) => {
    state.registryId = e.target.value || null;
    state.repos = {};
    state.selected = {};
    setDeletionEnabled(true);
    document.getElementById('btn-refresh').disabled = !state.registryId;
    if (state.registryId) loadCatalog();
    else renderEmptyCard('Select a registry to browse repositories.');
});

document.getElementById('btn-refresh').addEventListener('click', () => {
    if (state.registryId) {
        state.repos = {};
        state.selected = {};
        updateDeleteBar();
        loadCatalog();
    }
});

// ===== Deletion state =====

function setDeletionEnabled(enabled) {
    if (state.deletionEnabled === enabled) return;
    state.deletionEnabled = enabled;
    const alertArea = document.getElementById('alert-area');
    const existingWarning = document.getElementById('deletion-disabled-warning');
    if (existingWarning) existingWarning.remove();
    if (!enabled) {
        const warning = document.createElement('div');
        warning.id = 'deletion-disabled-warning';
        warning.className = 'alert alert-warning';
        warning.innerHTML = '⚠️ <strong>Deletion is disabled on this registry.</strong> Set <code>REGISTRY_STORAGE_DELETE_ENABLED=true</code> on your registry to enable tag and image deletion.';
        alertArea.appendChild(warning);
        // Remove delete controls from DOM immediately
        document.querySelectorAll('.repo-delete-btn').forEach(btn => btn.remove());
        Object.keys(state.repos).forEach(name => {
            if (state.repos[name].open) renderTags(name);
        });
    }
    updateDeleteBar();
}

// ===== Catalog =====

async function loadCatalog() {
    const card = document.getElementById('repos-card');
    card.innerHTML = '<p class="loading"><span class="spinner"></span> Loading repositories…</p>';

    const res = await apiFetch(`/api/docker/${state.registryId}/catalog`);
    if (!res) return;

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        card.innerHTML = `<p class="empty-state">Error: ${escapeHtml(data.error || res.statusText)}</p>`;
        return;
    }

    const { repositories, deletionEnabled } = await res.json();
    setDeletionEnabled(deletionEnabled !== false);

    if (!repositories || !repositories.length) {
        card.innerHTML = '<p class="empty-state">No repositories found in this registry.</p>';
        return;
    }

    const visible = repositories.filter(r => r.tagCount === null || r.tagCount > 0);

    if (!visible.length) {
        card.innerHTML = '<p class="empty-state">No repositories found in this registry.</p>';
        return;
    }

    visible.forEach(({ name, tagCount }) => {
        state.repos[name] = { tags: [], open: false, tagCount };
    });

    renderCatalog(visible.map(r => r.name));
}

function renderCatalog(names) {
    const card = document.getElementById('repos-card');
    card.innerHTML = names.map(name => repoAccordionHtml(name)).join('');
}

function repoAccordionHtml(name) {
    const repo = state.repos[name];
    const safeId = getSafeId(name);
    const tagLabel = repo.tagCount === null ? '—' : `${repo.tagCount} tag${repo.tagCount !== 1 ? 's' : ''}`;
    return `
        <div class="repo-accordion" id="accordion-${safeId}">
            <div class="repo-accordion-header">
                <span class="repo-toggle-icon ${repo.open ? 'open' : ''}" id="toggle-${safeId}" onclick="toggleRepo('${escapeHtml(name)}')">▶</span>
                <span class="repo-accordion-name" onclick="toggleRepo('${escapeHtml(name)}')">${escapeHtml(name)}</span>
                <span class="repo-tag-pill" id="tagpill-${safeId}">${tagLabel}</span>
                ${state.deletionEnabled ? `<button type="button" class="btn btn-danger btn-sm repo-delete-btn" onclick="deleteImage('${escapeHtml(name)}')" title="Delete image">Delete image</button>` : ''}
            </div>
            <div class="repo-accordion-body ${repo.open ? 'open' : ''}" id="body-${safeId}">
                <div class="repo-tags-inner" id="tags-${safeId}">
                    <p class="loading"><span class="spinner"></span> Loading…</p>
                </div>
            </div>
        </div>
    `;
}

function getSafeId(name) {
    return btoa(unescape(encodeURIComponent(name))).replace(/[^a-zA-Z0-9]/g, '_');
}

function sortTags(tags) {
    return [...tags].sort((a, b) => {
        if (a === 'latest') return -1;
        if (b === 'latest') return 1;
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const na = pa[i] ?? 0;
            const nb = pb[i] ?? 0;
            if (na !== nb) return nb - na;
        }
        return a.localeCompare(b);
    });
}

async function toggleRepo(name) {
    const repo = state.repos[name];
    repo.open = !repo.open;

    const safeId = getSafeId(name);
    const toggle = document.getElementById(`toggle-${safeId}`);
    const body = document.getElementById(`body-${safeId}`);

    if (toggle) toggle.className = `repo-toggle-icon ${repo.open ? 'open' : ''}`;
    if (body) body.className = `repo-accordion-body ${repo.open ? 'open' : ''}`;

    if (repo.open && !repo.tags.length) {
        await loadTags(name);
    }
}

async function loadTags(name) {
    const safeId = getSafeId(name);
    const inner = document.getElementById(`tags-${safeId}`);
    const pill = document.getElementById(`tagpill-${safeId}`);
    if (!inner) return;

    inner.innerHTML = '<p class="loading"><span class="spinner"></span> Loading…</p>';

    const res = await apiFetch(`/api/docker/${state.registryId}/tags?repo=${encodeURIComponent(name)}`);
    if (!res) return;

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        inner.innerHTML = `<p class="empty-state">Error: ${escapeHtml(data.error || res.statusText)}</p>`;
        return;
    }

    const data = await res.json();
    const tags = data.tags || [];
    state.repos[name].tags = tags;
    state.repos[name].tagCount = tags.length;
    state.repos[name].archs = state.repos[name].archs || {};
    if (pill) pill.textContent = `${state.repos[name].tagCount} tag${state.repos[name].tagCount !== 1 ? 's' : ''}`;
    renderTags(name);

    // Fetch architectures for all tags in parallel (non-blocking)
    Promise.all(tags.map(async tag => {
        try {
            const r = await apiFetch(`/api/docker/${state.registryId}/architectures?repo=${encodeURIComponent(name)}&tag=${encodeURIComponent(tag)}`);
            if (!r || !r.ok) return;
            const d = await r.json();
            if (!state.repos[name]) return;
            state.repos[name].archs[tag] = d.architectures || [];
            updateTagArchBadges(name, tag);
        } catch {}
    }));
}

function renderTags(name) {
    const safeId = getSafeId(name);
    const inner = document.getElementById(`tags-${safeId}`);
    if (!inner) return;

    const tags = sortTags(state.repos[name].tags);
    if (!tags.length) {
        inner.innerHTML = '<p class="empty-state">No tags.</p>';
        return;
    }

    const archs = state.repos[name].archs || {};
    inner.innerHTML = `
        ${state.deletionEnabled ? `
        <div class="tag-select-all">
            <label class="tag-label">
                <input type="checkbox" id="selectall-${safeId}" onchange="toggleSelectAll('${escapeHtml(name)}', this.checked)">
                Select all ${tags.length} tags
            </label>
        </div>` : ''}
        <div class="tag-list">
            ${tags.map(tag => {
                const key = `${name}::${tag}`;
                const checked = !!state.selected[key];
                const tagSafeId = getSafeId(name + '::' + tag);
                const tagArchs = archs[tag] || [];
                const badgesHtml = tagArchs.map(a => `<span class="arch-badge">${escapeHtml(a)}</span>`).join('');
                return `
                    <div class="tag-item">
                        <label class="tag-label">
                            ${state.deletionEnabled ? `<input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleTag('${escapeHtml(name)}', '${escapeHtml(tag)}', this.checked)">` : ''}
                            <span class="tag-name">${escapeHtml(tag)}</span>
                            <span class="arch-badges" id="archs-${tagSafeId}">${badgesHtml}</span>
                        </label>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    syncSelectAll(name);
}

function updateTagArchBadges(name, tag) {
    const tagSafeId = getSafeId(name + '::' + tag);
    const el = document.getElementById(`archs-${tagSafeId}`);
    if (!el) return;
    const tagArchs = (state.repos[name] && state.repos[name].archs && state.repos[name].archs[tag]) || [];
    el.innerHTML = tagArchs.map(a => `<span class="arch-badge">${escapeHtml(a)}</span>`).join('');
}

function toggleTag(name, tag, checked) {
    const key = `${name}::${tag}`;
    if (checked) state.selected[key] = true;
    else delete state.selected[key];
    syncSelectAll(name);
    updateDeleteBar();
}

function toggleSelectAll(name, checked) {
    const tags = state.repos[name].tags || [];
    tags.forEach(tag => {
        const key = `${name}::${tag}`;
        if (checked) state.selected[key] = true;
        else delete state.selected[key];
    });
    renderTags(name);
    updateDeleteBar();
}

function syncSelectAll(name) {
    const safeId = getSafeId(name);
    const cb = document.getElementById(`selectall-${safeId}`);
    if (!cb) return;
    const tags = state.repos[name].tags || [];
    const selectedCount = tags.filter(t => state.selected[`${name}::${t}`]).length;
    cb.checked = selectedCount === tags.length && tags.length > 0;
    cb.indeterminate = selectedCount > 0 && selectedCount < tags.length;
}

// ===== Delete image (all tags) =====

async function deleteImage(name) {
    const tagCount = state.repos[name].tagCount;
    const countLabel = tagCount !== null && tagCount > 0 ? `all ${tagCount} tag${tagCount !== 1 ? 's' : ''}` : 'this image';

    const confirmed = await showConfirm({
        title: `Delete image "${name}"`,
        body: `This will permanently delete ${countLabel} from "${name}", removing the image from the registry. This cannot be undone.`,
        confirmText: 'Delete image',
        requireWord: true
    });
    if (!confirmed) return;

    const safeId = getSafeId(name);
    const btn = document.querySelector(`#accordion-${safeId} .repo-delete-btn`);
    if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }

    const res = await apiFetch(`/api/docker/${state.registryId}/image`, {
        method: 'DELETE',
        body: JSON.stringify({ repo: name })
    });

    if (!res) return;
    const result = await res.json();

    const hasDeleted = result.deleted && result.deleted.length;
    const hasErrors = result.errors && result.errors.length;

    if (hasErrors && (result.errors || []).some(e => e.error && e.error.includes('REGISTRY_STORAGE_DELETE_ENABLED'))) {
        setDeletionEnabled(false);
    }

    if (hasErrors && !hasDeleted) {
        showAlert('alert-area', `Could not delete "${name}": ${result.errors.map(e => e.error).join('; ')}`);
        if (btn) { btn.disabled = false; btn.textContent = 'Delete image'; }
        return;
    }

    // Remove accordion from DOM and state
    const accordion = document.getElementById(`accordion-${safeId}`);
    if (accordion) accordion.remove();

    Object.keys(state.selected).forEach(key => {
        if (key.startsWith(`${name}::`)) delete state.selected[key];
    });
    delete state.repos[name];
    updateDeleteBar();

    if (hasDeleted) showAlert('alert-area', `Image "${name}" deleted successfully. Note: layers remain on disk until garbage collection is run on the registry.`, 'success');
    if (hasErrors) showAlert('alert-area', `"${name}": ${result.errors.map(e => `"${e.tag}" — ${e.error}`).join('; ')}`);
}

// ===== Remove empty repo from storage =====

async function removeRepoFromStorage(name) {
    const confirmed = await showConfirm({
        title: `Remove "${name}" from storage`,
        body: `This will permanently delete the repository directory from the registry's storage. The repo has no tags. This cannot be undone.`,
        confirmText: 'Remove from storage'
    });
    if (!confirmed) return;

    const safeId = getSafeId(name);
    const btn = document.querySelector(`#accordion-${safeId} .repo-delete-btn`);
    if (btn) { btn.disabled = true; btn.textContent = 'Removing…'; }

    const res = await apiFetch(`/api/docker/${state.registryId}/repo`, {
        method: 'DELETE',
        body: JSON.stringify({ repo: name })
    });

    if (!res) return;
    const result = await res.json();

    if (!result.ok) {
        showAlert('alert-area', `Failed to remove "${name}": ${result.error}`);
        if (btn) { btn.disabled = false; btn.textContent = 'Remove from storage'; }
        return;
    }

    const accordion = document.getElementById(`accordion-${safeId}`);
    if (accordion) accordion.remove();
    delete state.repos[name];

    showAlert('alert-area', `Repository "${name}" removed from storage.`, 'success');
}

// ===== Delete selected tags =====

function updateDeleteBar() {
    const count = Object.keys(state.selected).length;
    const bar = document.getElementById('delete-bar');
    const countEl = document.getElementById('delete-count');
    bar.className = (count > 0 && state.deletionEnabled) ? 'delete-bar visible' : 'delete-bar';
    countEl.textContent = `${count} tag${count !== 1 ? 's' : ''} selected`;
}

document.getElementById('btn-deselect-all').addEventListener('click', () => {
    state.selected = {};
    Object.keys(state.repos).forEach(name => {
        if (state.repos[name].open) renderTags(name);
    });
    updateDeleteBar();
});

document.getElementById('btn-delete-selected').addEventListener('click', async () => {
    const keys = Object.keys(state.selected);
    if (!keys.length) return;

    const byRepo = {};
    keys.forEach(key => {
        const sep = key.indexOf('::');
        const repo = key.slice(0, sep);
        const tag = key.slice(sep + 2);
        if (!byRepo[repo]) byRepo[repo] = [];
        byRepo[repo].push(tag);
    });

    const repoCount = Object.keys(byRepo).length;
    const tagCount = keys.length;

    const confirmed = await showConfirm({
        title: `Delete ${tagCount} tag${tagCount !== 1 ? 's' : ''}`,
        body: `You are about to permanently delete ${tagCount} tag${tagCount !== 1 ? 's' : ''} from ${repoCount} repo${repoCount !== 1 ? 's' : ''}. This cannot be undone.`,
        confirmText: `Delete ${tagCount} tag${tagCount !== 1 ? 's' : ''}`,
        requireWord: true
    });
    if (!confirmed) return;

    const btn = document.getElementById('btn-delete-selected');
    btn.disabled = true;
    btn.textContent = 'Deleting…';

    const allDeleted = [];
    const allErrors = [];

    for (const [repo, tags] of Object.entries(byRepo)) {
        const res = await apiFetch(`/api/docker/${state.registryId}/tags`, {
            method: 'DELETE',
            body: JSON.stringify({ repo, tags })
        });
        if (!res) break;
        const result = await res.json();
        allDeleted.push(...(result.deleted || []).map(t => `${repo}::${t}`));
        allErrors.push(...(result.errors || []).map(e => `${repo}:${e.tag} — ${e.error}`));
        if ((result.errors || []).some(e => e.error && e.error.includes('REGISTRY_STORAGE_DELETE_ENABLED'))) {
            setDeletionEnabled(false);
        }
    }

    allDeleted.forEach(key => {
        delete state.selected[key];
        const sep = key.indexOf('::');
        const repo = key.slice(0, sep);
        const tag = key.slice(sep + 2);
        if (state.repos[repo]) {
            state.repos[repo].tags = state.repos[repo].tags.filter(t => t !== tag);
            state.repos[repo].tagCount = state.repos[repo].tags.length;
        }
    });

    const affectedRepos = [...new Set(allDeleted.map(k => k.slice(0, k.indexOf('::'))))];
    affectedRepos.forEach(name => {
        if (state.repos[name] && state.repos[name].open) renderTags(name);
        const pill = document.getElementById(`tagpill-${getSafeId(name)}`);
        if (pill) {
            const c = state.repos[name].tagCount;
            pill.textContent = `${c} tag${c !== 1 ? 's' : ''}`;
        }
    });

    updateDeleteBar();
    btn.disabled = false;
    btn.textContent = 'Delete selected';

    if (allDeleted.length) showAlert('alert-area', `Deleted ${allDeleted.length} tag${allDeleted.length !== 1 ? 's' : ''} successfully. Note: layers remain on disk until garbage collection is run on the registry.`, 'success');
    if (allErrors.length) showAlert('alert-area', `Errors: ${allErrors.join('; ')}`);
});

function renderEmptyCard(msg) {
    document.getElementById('repos-card').innerHTML = `<p class="empty-state">${escapeHtml(msg)}</p>`;
}

loadRegistryOptions();

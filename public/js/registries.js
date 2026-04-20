document.getElementById('year').textContent = new Date().getFullYear();
initNav('registries');

let editingId = null;

async function loadRegistries() {
    const tbody = document.getElementById('registry-list');
    const res = await apiFetch('/api/registries');
    if (!res) return;

    if (!res.ok) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Failed to load registries.</td></tr>';
        return;
    }

    const registries = await res.json();
    if (!registries.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No registries configured. Add one above.</td></tr>';
        return;
    }

    tbody.innerHTML = registries.map(r => {
        const data = escapeHtml(JSON.stringify({ id: r.id, name: r.name, url: r.url, username: r.username || '' }));
        return `
        <tr>
            <td>${escapeHtml(r.name)}</td>
            <td>${escapeHtml(r.url)}</td>
            <td>${escapeHtml(r.username || '—')}</td>
            <td>
                <div class="action-btns">
                    <button type="button" class="btn btn-ghost btn-sm" onclick="testRegistry('${r.id}', this)">Test</button>
                    <button type="button" class="btn btn-ghost btn-sm" onclick="editRegistry('${data}')">Edit</button>
                    <button type="button" class="btn btn-danger btn-sm" onclick="deleteRegistry('${r.id}', this)">Delete</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function showForm(title, id = null, name = '', url = '', username = '') {
    editingId = id;
    document.getElementById('form-title').textContent = title;
    document.getElementById('f-name').value = name;
    document.getElementById('f-url').value = url;
    document.getElementById('f-username').value = username;
    document.getElementById('f-password').value = '';
    document.getElementById('form-panel').classList.add('open');
    document.getElementById('f-name').focus();
}

function hideForm() {
    editingId = null;
    document.getElementById('form-panel').classList.remove('open');
}

function editRegistry(encodedData) {
    const r = JSON.parse(encodedData);
    showForm('Edit Registry', r.id, r.name, r.url, r.username);
}

async function testRegistry(id, btn) {
    btn.disabled = true;
    btn.textContent = 'Testing…';
    const res = await apiFetch(`/api/registries/${id}/test`, { method: 'POST' });
    btn.disabled = false;
    btn.textContent = 'Test';
    if (!res) return;
    const data = await res.json();
    if (data.ok) {
        showAlert('alert-area', data.message, 'success');
    } else {
        showAlert('alert-area', `Connection failed: ${data.error}`);
    }
}

async function deleteRegistry(id, btn) {
    const name = btn.closest('tr').querySelector('td').textContent;
    const confirmed = await showConfirm({
        title: `Delete registry "${name}"`,
        body: `This will remove the registry configuration. This cannot be undone.`,
        confirmText: 'Delete registry'
    });
    if (!confirmed) return;
    const res = await apiFetch(`/api/registries/${id}`, { method: 'DELETE' });
    if (!res) return;
    if (res.ok) {
        showAlert('alert-area', `Registry "${name}" deleted.`, 'success');
        loadRegistries();
    } else {
        const data = await res.json();
        showAlert('alert-area', data.error || 'Delete failed.');
    }
}

document.getElementById('btn-add').addEventListener('click', () => showForm('Add Registry'));
document.getElementById('btn-cancel').addEventListener('click', hideForm);

document.getElementById('btn-save').addEventListener('click', async () => {
    const name = document.getElementById('f-name').value.trim();
    const url = document.getElementById('f-url').value.trim();
    const username = document.getElementById('f-username').value.trim();
    const password = document.getElementById('f-password').value;
    if (!name || !url) {
        showAlert('alert-area', 'Name and URL are required.');
        return;
    }

    const btn = document.getElementById('btn-save');
    btn.disabled = true;
    btn.textContent = 'Testing connection…';

    // Save first so we can test using the stored (encrypted) credentials
    const body = { name, url, username, password };
    const isEdit = !!editingId;
    const saveRes = await apiFetch(
        isEdit ? `/api/registries/${editingId}` : '/api/registries',
        { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(body) }
    );

    btn.disabled = false;
    btn.textContent = 'Save';

    if (!saveRes) return;

    if (!saveRes.ok) {
        const data = await saveRes.json();
        showAlert('alert-area', data.error || 'Save failed.');
        return;
    }

    const saved = await saveRes.json();

    // Test connection with the saved registry
    const testRes = await apiFetch(`/api/registries/${saved.id}/test`, { method: 'POST' });
    if (testRes) {
        const testData = await testRes.json();
        if (testData.ok) {
            hideForm();
            showAlert('alert-area', `Registry ${isEdit ? 'updated' : 'added'} and connected successfully.`, 'success');
        } else {
            showAlert('alert-area', `Registry saved but connection failed: ${testData.error}`);
        }
    }

    loadRegistries();
});

loadRegistries();

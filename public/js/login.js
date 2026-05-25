(async () => {
    try {
        const res = await fetch('/api/env');
        const data = await res.json();
        if (data.isDevelopment) { document.getElementById('dev-banner').classList.add('show'); document.body.classList.add('has-dev-banner'); }
    } catch {}
})();

const loginForm  = document.getElementById('loginForm');
const totpForm   = document.getElementById('totpForm');
const alertArea  = document.getElementById('alert-area');
const loginBtn   = document.getElementById('loginBtn');
const totpBtn    = document.getElementById('totpBtn');
const heading    = document.getElementById('loginHeading');

function showError(msg) {
    alertArea.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'alert alert-error';
    div.textContent = msg;
    alertArea.appendChild(div);
}

function clearError() {
    alertArea.innerHTML = '';
}

// Auto-submit when 6 digits entered
document.getElementById('totpCode').addEventListener('input', (e) => {
    if (e.target.value.length === 6) totpForm.requestSubmit();
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in…';

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: document.getElementById('username').value,
                password: document.getElementById('password').value,
            }),
        });
        const data = await res.json();
        if (res.ok && data.mfaRequired) {
            loginForm.classList.add('hidden');
            heading.textContent = 'Two-factor authentication';
            totpForm.classList.remove('hidden');
            document.getElementById('totpCode').focus();
        } else if (res.ok) {
            window.location.replace('/');
        } else {
            showError(data.error || 'Login failed.');
            loginBtn.disabled = false;
            loginBtn.textContent = 'Sign in';
        }
    } catch {
        showError('Network error — please try again.');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign in';
    }
});

totpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    totpBtn.disabled = true;
    totpBtn.textContent = 'Verifying…';

    try {
        const res = await fetch('/api/auth/totp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: document.getElementById('totpCode').value.trim() }),
        });
        const data = await res.json();
        if (res.ok) {
            window.location.replace('/');
        } else {
            showError(data.error || 'Invalid code — check your authenticator app.');
            document.getElementById('totpCode').value = '';
            document.getElementById('totpCode').focus();
            totpBtn.disabled = false;
            totpBtn.textContent = 'Verify';
        }
    } catch {
        showError('Network error — please try again.');
        totpBtn.disabled = false;
        totpBtn.textContent = 'Verify';
    }
});

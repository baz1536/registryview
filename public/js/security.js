initNav('security');

async function loadSecurity() {
    const el = document.getElementById('security-2fa');
    const modal = document.getElementById('twoFaModal');
    const contentEl = document.getElementById('twoFaContent');
    const closeBtn = document.getElementById('twoFaClose');
    if (!el || !modal) return;

    try {
        const [setupRes, aboutRes] = await Promise.all([
            fetch('/api/auth/2fa/setup'),
            fetch('/api/about'),
        ]);
        if (!setupRes.ok) {
            el.innerHTML = '<p class="empty-state">Failed to load security settings.</p>';
            return;
        }
        const data = await setupRes.json();
        const about = aboutRes.ok ? await aboutRes.json() : {};

        const authDisabled = about.authEnabled === false;
        const authBadge = authDisabled
            ? '<span class="badge badge-muted">Disabled</span>'
            : '<span class="badge badge-success">Enabled</span>';
        const totpBadge = data.enabled
            ? '<span class="badge badge-success">Enabled</span>'
            : '<span class="badge badge-muted">Disabled</span>';

        // Auth disabled — recovery mode only
        if (authDisabled) {
            el.innerHTML = `
                <div class="card security-card">
                    <div class="security-card-header">
                        <div class="security-icon security-icon-warning">&#9888;</div>
                        <div>
                            <h2 class="security-section-title">Two-Factor Authentication</h2>
                            <p class="security-subtitle">Authentication is currently disabled. You can reset the 2FA secret below.</p>
                        </div>
                    </div>
                    <div class="security-status-grid">
                        <div class="security-status-item">
                            <span class="security-status-label">Authentication</span>
                            <span class="security-status-value">${authBadge}</span>
                        </div>
                        <div class="security-status-item">
                            <span class="security-status-label">Two-Factor Auth</span>
                            <span class="security-status-value">${totpBadge}</span>
                        </div>
                    </div>
                    <div class="security-action-row">
                        <button class="btn btn-danger btn-sm" id="reset2faBtn">Reset 2FA secret</button>
                        <p class="security-hint">Resetting deletes the current secret — you will need to set up 2FA again.</p>
                    </div>
                </div>`;

            document.getElementById('reset2faBtn').addEventListener('click', async () => {
                const ok = await showConfirm({
                    title: 'Reset 2FA secret',
                    body: 'This will delete the current secret. Your authenticator app will stop working and you will need to set up 2FA again.',
                    confirmText: 'Reset secret',
                    icon: '⚠️',
                });
                if (!ok) return;
                const r = await fetch('/api/auth/2fa/reset', { method: 'POST' });
                const result = await r.json();
                if (result.ok) { loadSecurity(); } else { alert(result.error || 'Reset failed.'); }
            });
            return;
        }

        // Auth enabled — determine state
        // not configured (no mfa.json): show Set up 2FA
        // configured, not confirmed: show Set up 2FA (secret exists, not yet scanned)
        // confirmed, not enabled: show Enable + re-scan + reset
        // confirmed, enabled: show Disable + re-scan + reset
        let stateDesc = '';
        let actionHtml = '';
        if (!data.configured || !data.enabled) {
            stateDesc = 'Set up two-factor authentication to add an extra layer of security to your account.';
            actionHtml = `<button class="btn btn-primary" id="open2faSetup">Set up 2FA</button>`;
        } else {
            stateDesc = '2FA is active. A one-time code from your authenticator app is required at every login.';
            actionHtml = `
                <button class="btn btn-danger btn-sm" id="disable2faBtn">Disable 2FA</button>
                <button class="btn btn-danger btn-sm" id="reset2faBtn">Reset secret</button>`;
        }

        el.innerHTML = `
            <div class="card security-card">
                <div class="security-card-header">
                    <div class="security-icon ${data.enabled ? 'security-icon-active' : 'security-icon-idle'}">&#128274;</div>
                    <div>
                        <h2 class="security-section-title">Two-Factor Authentication</h2>
                        <p class="security-subtitle">${stateDesc}</p>
                    </div>
                </div>
                <div class="security-status-grid">
                    <div class="security-status-item">
                        <span class="security-status-label">Authentication</span>
                        <span class="security-status-value">${authBadge}</span>
                    </div>
                    <div class="security-status-item">
                        <span class="security-status-label">Two-Factor Auth</span>
                        <span class="security-status-value">${totpBadge}</span>
                    </div>
                </div>
                <div class="security-action-row">
                    ${actionHtml}
                </div>
            </div>`;

        document.getElementById('disable2faBtn')?.addEventListener('click', async () => {
            const ok = await showConfirm({
                title: 'Disable two-factor authentication',
                body: 'A one-time code will no longer be required to sign in. You can re-enable 2FA at any time from this page.',
                confirmText: 'Disable 2FA',
                icon: '🔓',
            });
            if (!ok) return;
            const r = await fetch('/api/auth/2fa/disable', { method: 'POST' });
            const result = await r.json();
            if (result.ok) { loadSecurity(); } else { alert(result.error || 'Failed to disable 2FA.'); }
        });

        document.getElementById('reset2faBtn')?.addEventListener('click', async () => {
            const ok = await showConfirm({
                title: 'Reset 2FA secret',
                body: 'This will delete the current secret. Your authenticator app will stop working and you will need to set up 2FA again.',
                confirmText: 'Reset secret',
                icon: '⚠️',
            });
            if (!ok) return;
            const r = await fetch('/api/auth/2fa/reset', { method: 'POST' });
            const result = await r.json();
            if (result.ok) { loadSecurity(); } else { alert(result.error || 'Reset failed.'); }
        });

        const openBtn = document.getElementById('open2faSetup');
        if (!openBtn) return;

        function fallbackCopy(text, cb) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(ta);
            ta.focus(); ta.select();
            try { document.execCommand('copy'); cb(); } catch {}
            document.body.removeChild(ta);
        }

        function buildModalContent(qrDataUrl, secret) {
            contentEl.innerHTML = `
                <div class="twofa-step">
                    <span class="twofa-step-num">1</span>
                    <div class="twofa-step-body"><strong>Scan this QR code</strong><br>Open your authenticator app (Google Authenticator, Authy, 1Password, etc.) and scan the code below.</div>
                </div>
                <img src="${qrDataUrl}" alt="2FA QR Code" width="200" height="200" class="twofa-qr-img">

                <div class="twofa-step" style="margin-top:20px">
                    <span class="twofa-step-num">2</span>
                    <div class="twofa-step-body"><strong>Or enter the key manually</strong><br>If you can't scan, enter this key into your app:</div>
                </div>
                <div class="twofa-secret" id="twoFaSecret">${escapeHtml(secret || '—')}<small>Click to copy</small></div>

                <div class="twofa-step" style="margin-top:20px">
                    <span class="twofa-step-num">3</span>
                    <div class="twofa-step-body"><strong>Confirm it's working</strong><br>Enter the 6-digit code from your app to verify setup is correct.</div>
                </div>
                <input type="text" id="twoFaCode" class="twofa-verify-input" inputmode="numeric" pattern="\\d{6}" maxlength="6" placeholder="000000" autocomplete="one-time-code">
                <button class="twofa-verify-btn" id="twoFaVerifyBtn">Confirm &amp; Close</button>
                <div id="twoFaResult" class="twofa-result" style="display:none"></div>`;

            document.getElementById('twoFaSecret').addEventListener('click', () => {
                const text = secret || '';
                const cb = () => {
                    const hint = document.querySelector('#twoFaSecret small');
                    if (hint) { hint.textContent = 'Copied!'; setTimeout(() => { hint.textContent = 'Click to copy'; }, 2000); }
                };
                if (navigator.clipboard && window.isSecureContext) {
                    navigator.clipboard.writeText(text).then(cb).catch(() => fallbackCopy(text, cb));
                } else {
                    fallbackCopy(text, cb);
                }
            });

            document.getElementById('twoFaVerifyBtn').addEventListener('click', verifyCode);
            document.getElementById('twoFaCode').addEventListener('input', (e) => {
                if (e.target.value.length === 6) verifyCode();
            });
        }

        async function verifyCode() {
            const code = document.getElementById('twoFaCode').value.trim();
            const resultEl = document.getElementById('twoFaResult');
            const btn = document.getElementById('twoFaVerifyBtn');
            if (!/^\d{6}$/.test(code)) {
                resultEl.textContent = 'Enter the 6-digit code from your authenticator app.';
                resultEl.className = 'twofa-result twofa-result-error';
                resultEl.style.display = 'block';
                return;
            }
            btn.disabled = true;
            resultEl.style.display = 'none';
            try {
                const r = await fetch('/api/auth/2fa/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code }),
                });
                const result = await r.json();
                if (result.ok) {
                    resultEl.textContent = '✓ Code is valid — 2FA is working correctly.';
                    resultEl.className = 'twofa-result twofa-result-success';
                    resultEl.style.display = 'block';
                    setTimeout(() => { modal.style.display = 'none'; loadSecurity(); }, 1500);
                } else {
                    resultEl.textContent = result.error || 'Invalid code — try again.';
                    resultEl.className = 'twofa-result twofa-result-error';
                    resultEl.style.display = 'block';
                    document.getElementById('twoFaCode').value = '';
                    document.getElementById('twoFaCode').focus();
                }
            } catch {
                resultEl.textContent = 'Network error — please try again.';
                resultEl.className = 'twofa-result twofa-result-error';
                resultEl.style.display = 'block';
            }
            btn.disabled = false;
        }

        async function openModal() {
            document.getElementById('twoFaCode') && (document.getElementById('twoFaCode').value = '');
            document.getElementById('twoFaResult') && (document.getElementById('twoFaResult').style.display = 'none');

            // If not yet configured, generate the secret first
            if (!data.configured || !data.secret) {
                contentEl.innerHTML = '<p class="loading"><span class="spinner"></span> Generating secret…</p>';
                modal.style.display = 'flex';
                try {
                    const r = await fetch('/api/auth/2fa/setup', { method: 'POST' });
                    const setupData = await r.json();
                    if (!r.ok || !setupData.qrDataUrl) {
                        contentEl.innerHTML = '<p class="empty-state">Failed to generate 2FA secret.</p>';
                        return;
                    }
                    buildModalContent(setupData.qrDataUrl, setupData.secret);
                } catch {
                    contentEl.innerHTML = '<p class="empty-state">Network error — please try again.</p>';
                    return;
                }
            } else {
                buildModalContent(data.qrDataUrl, data.secret);
                modal.style.display = 'flex';
            }

            setTimeout(() => document.getElementById('twoFaCode')?.focus(), 100);
        }

        function closeModal() { modal.style.display = 'none'; }

        openBtn.addEventListener('click', openModal);
        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    } catch {
        el.innerHTML = '<p class="empty-state">Failed to load security settings.</p>';
    }
}

loadSecurity();

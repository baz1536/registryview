document.getElementById('year') && (document.getElementById('year').textContent = new Date().getFullYear());
initNav('about');

async function loadAboutInfo() {
    const infoEl = document.getElementById('about-info');
    if (!infoEl) return;

    try {
        const info = await fetch('/api/about').then(r => r.json());
        const env = info.environment || {};

        const html = `
        <div class="about-tech-grid">
            <div class="card about-tech-card">
                <h2 class="about-tech-title">Application</h2>
                <div class="about-kv">
                    <span class="about-k">Version</span>
                    <span class="about-v"><span class="badge">v${escapeHtml(info.version)}</span></span>
                </div>
                <div class="about-kv">
                    <span class="about-k">Node.js</span>
                    <span class="about-v">${escapeHtml(info.nodeVersion || 'Unknown')}</span>
                </div>
                <div class="about-kv">
                    <span class="about-k">npm</span>
                    <span class="about-v">${escapeHtml(info.npmVersion || 'Unknown')}</span>
                </div>
                ${info.gitBranch && info.gitBranch !== 'main' && info.gitBranch !== 'master' ? `
                <div class="about-kv">
                    <span class="about-k">Git branch</span>
                    <span class="about-v"><code>${escapeHtml(info.gitBranch)}</code></span>
                </div>` : ''}
            </div>

            <div class="card about-tech-card">
                <h2 class="about-tech-title">Environment</h2>
                <div class="about-kv">
                    <span class="about-k">Hostname</span>
                    <span class="about-v">${escapeHtml(env.hostname || 'Unknown')}</span>
                </div>
                <div class="about-kv">
                    <span class="about-k">Address</span>
                    <span class="about-v">${escapeHtml(
                        env.ipAddresses && env.ipAddresses.length
                            ? env.ipAddresses.map(ip => `${ip}:${env.port}`).join(', ')
                            : `localhost:${env.port || ''}`
                    )}</span>
                </div>
                <div class="about-kv">
                    <span class="about-k">OS</span>
                    <span class="about-v">${escapeHtml(env.distro || env.os || 'Unknown')}</span>
                </div>
                <div class="about-kv">
                    <span class="about-k">Architecture</span>
                    <span class="about-v">${escapeHtml(env.architecture || 'Unknown')}</span>
                </div>
                <div class="about-kv">
                    <span class="about-k">Docker</span>
                    <span class="about-v">${env.isDocker
                        ? '<span class="badge badge-success">Yes</span>'
                        : '<span class="badge badge-muted">No</span>'
                    }</span>
                </div>
            </div>
        </div>

        `;

        infoEl.innerHTML = html;
    } catch {
        infoEl.innerHTML = '<p class="empty-state">Failed to load application information.</p>';
    }
}

function toggleAccordion(header) {
    header.classList.toggle('open');
    header.nextElementSibling.classList.toggle('open');
}

document.querySelectorAll('.info-accordion-header').forEach(header => {
    header.addEventListener('click', () => toggleAccordion(header));
});

loadAboutInfo();

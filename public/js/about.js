document.getElementById('year').textContent = new Date().getFullYear();
initNav('about');

function row(key, val) {
    return `<div class="about-row"><span class="about-key">${key}</span><span class="about-val">${val}</span></div>`;
}

async function loadAboutInfo() {
    try {
        const info = await fetch('/api/about').then(r => r.json());
        const env = info.environment || {};

        let appHtml = '<h2>Application</h2>';
        appHtml += row('Version', `<span class="badge">v${escapeHtml(info.version)}</span>`);
        if (info.description) appHtml += row('Description', escapeHtml(info.description));
        appHtml += row('Node.js', escapeHtml(info.nodeVersion || 'Unknown'));
        appHtml += row('npm', escapeHtml(info.npmVersion || 'Unknown'));
        if (info.gitBranch && info.gitBranch !== 'main' && info.gitBranch !== 'master') {
            appHtml += row('Git Branch', escapeHtml(info.gitBranch));
        }
        document.getElementById('appCard').innerHTML = appHtml;

        if (info.showEnvironment !== false) {
            let envHtml = '';
            envHtml += row('Hostname', escapeHtml(env.hostname || 'Unknown'));
            envHtml += row('Address', env.ipAddresses && env.ipAddresses.length
                ? env.ipAddresses.map(ip => escapeHtml(`${ip}:${env.port}`)).join(', ')
                : escapeHtml(`localhost:${env.port || ''}`));
            envHtml += row('Operating System', escapeHtml(env.os || 'Unknown'));
            if (env.distro) envHtml += row('Distribution', escapeHtml(env.distro));
            envHtml += row('Architecture', escapeHtml(env.architecture || 'Unknown'));
            envHtml += row('Docker', env.isDocker ? 'Yes' : 'No');
            document.getElementById('envContent').innerHTML = envHtml;
            document.getElementById('envCard').removeAttribute('hidden');
        }

        if (info.dependencies && Object.keys(info.dependencies).length) {
            let html = '<table><thead><tr><th>Package</th><th>Version</th></tr></thead><tbody>';
            Object.entries(info.dependencies).sort().forEach(([pkg, ver]) => {
                html += `<tr><td>${escapeHtml(pkg)}</td><td>${escapeHtml(ver)}</td></tr>`;
            });
            html += '</tbody></table>';
            document.getElementById('depsContent').innerHTML = html;
            document.getElementById('depsCard').removeAttribute('hidden');
        }
    } catch {
        document.getElementById('appCard').innerHTML = '<p class="empty-state">Failed to load application information.</p>';
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

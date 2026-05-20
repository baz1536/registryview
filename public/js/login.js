(async () => {
    try {
        const res = await fetch('/api/about');
        const data = await res.json();
        if (data.isDevelopment) { document.getElementById('dev-banner').classList.add('show'); document.body.classList.add('has-dev-banner'); }
    } catch {}
})();

const params = new URLSearchParams(window.location.search);
if (params.get('error')) {
    const area = document.getElementById('alert-area');
    area.innerHTML = '<div class="alert alert-error">Invalid username or password.</div>';
}

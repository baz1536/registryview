const params = new URLSearchParams(window.location.search);
if (params.get('error')) {
    const area = document.getElementById('alert-area');
    area.innerHTML = '<div class="alert alert-error">Invalid username or password.</div>';
}

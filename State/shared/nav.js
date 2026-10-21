const PERFIL_LABELS = {
    gestor: 'Gestora',
    inspetor: 'Inspetor(a) de campo',
    representante: 'Representante institucional',
};

function preencherUsuario() {
    const params = new URLSearchParams(window.location.search);
    const nome = params.get('nome');
    const perfil = params.get('perfil');

    document.getElementById('userName').textContent = nome || 'Usuário';
    document.getElementById('userRole').textContent = PERFIL_LABELS[perfil] || 'Perfil não identificado';

    document.querySelectorAll('.nav-item').forEach((link) => {
        const href = link.getAttribute('href');
        if (href && href !== '#') {
            link.href = `${href}${window.location.search}`;
        }
    });
}

preencherUsuario();

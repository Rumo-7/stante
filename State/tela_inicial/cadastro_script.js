const form = document.getElementById('cadastroForm');
const messageEl = document.getElementById('formMessage');

const showMessage = (text, type) => {
    messageEl.textContent = text;
    messageEl.className = `form-message ${type}`;
};

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nome = document.getElementById('nome').value.trim();
    const email = document.getElementById('email').value.trim();
    const perfil = document.getElementById('perfil').value;
    const senha = document.getElementById('senha').value;
    const confirmarSenha = document.getElementById('confirmarSenha').value;

    if (senha !== confirmarSenha) {
        showMessage('As senhas não coincidem.', 'error');
        return;
    }

    try {
        const response = await fetch('/api/cadastro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, email, perfil, senha, confirmarSenha }),
        });

        const data = await response.json();

        if (!response.ok) {
            showMessage(data.erro || 'Não foi possível concluir o cadastro.', 'error');
            return;
        }

        showMessage('Cadastro realizado! Redirecionando...', 'success');
        const params = new URLSearchParams({ nome, perfil });
        setTimeout(() => {
            window.location.href = `dashboard.html?${params.toString()}`;
        }, 1200);
    } catch (err) {
        showMessage('Erro ao conectar com o servidor.', 'error');
    }
});

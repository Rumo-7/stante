
        const toggleButton = document.getElementById('togglePassword');
        const passwordInput = document.getElementById('senha');
        const eyeIcon = document.getElementById('eyeIcon');
 
        const eyeOpenPath = `
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
        `;
 
        const eyeClosedPath = `
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.6 18.6 0 0 1 5.06-5.94"></path>
            <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.6 18.6 0 0 1-2.16 3.19"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
        `;
 
        toggleButton.addEventListener('click', () => {
            const isPassword = passwordInput.type === 'password';
            passwordInput.type = isPassword ? 'text' : 'password';
            eyeIcon.innerHTML = isPassword ? eyeClosedPath : eyeOpenPath;
            toggleButton.setAttribute('aria-label', isPassword ? 'Ocultar senha' : 'Mostrar senha');
        });

        const loginForm = document.getElementById('loginForm');
        const loginMessage = document.getElementById('loginMessage');

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('email').value.trim();
            const senha = passwordInput.value;

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, senha }),
                });

                const data = await response.json();

                if (!response.ok) {
                    loginMessage.textContent = data.erro || 'Não foi possível entrar.';
                    loginMessage.className = 'form-message error';
                    return;
                }

                const params = new URLSearchParams({ nome: data.nome, perfil: data.perfil });
                window.location.href = `dashboard.html?${params.toString()}`;
            } catch (err) {
                loginMessage.textContent = 'Erro ao conectar com o servidor.';
                loginMessage.className = 'form-message error';
            }
        });

        document.getElementById('googleLogin').addEventListener('click', () => {
            alert('Login com Google ainda não implementado.');
        });

        document.getElementById('govbrLogin').addEventListener('click', () => {
            alert('Login com gov.br ainda não implementado.');
        });
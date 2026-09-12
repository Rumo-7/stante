
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

        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            alert('Login ainda não conectado a um backend. Em breve!');
        });

        document.getElementById('googleLogin').addEventListener('click', () => {
            alert('Login com Google ainda não implementado.');
        });

        document.getElementById('govbrLogin').addEventListener('click', () => {
            alert('Login com gov.br ainda não implementado.');
        });
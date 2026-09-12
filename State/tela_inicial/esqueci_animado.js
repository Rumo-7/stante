const resetForm = document.querySelector('.form');

resetForm.addEventListener('submit', (e) => {
    e.preventDefault();
    alert('Se o email existir em nossa base, você receberá um link para redefinir a senha.');
});

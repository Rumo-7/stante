const AVATAR_COLORS = ['#CC8712', '#142721', '#315f28', '#8f4e10', '#1c3a30', '#b3261e'];

function iniciais(nome) {
    return nome
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((parte) => parte[0].toUpperCase())
        .join('');
}

function corAvatar(nome) {
    let soma = 0;
    for (let i = 0; i < nome.length; i += 1) soma += nome.charCodeAt(i);
    return AVATAR_COLORS[soma % AVATAR_COLORS.length];
}

function cargaInfo(quantidade) {
    if (quantidade === 0) return { label: 'SEM DEMANDAS', className: 'badge-gray' };
    if (quantidade <= 2) return { label: 'CARGA BAIXA', className: 'badge-green' };
    if (quantidade <= 5) return { label: 'CARGA MÉDIA', className: 'badge-amber' };
    return { label: 'CARGA ALTA', className: 'badge-red' };
}

function renderizarFiscais(fiscais) {
    const grid = document.getElementById('fiscaisGrid');

    if (!fiscais.length) {
        grid.innerHTML = '<p class="empty-state">Nenhum fiscal cadastrado ainda.</p>';
        return;
    }

    grid.innerHTML = fiscais.map((fiscal) => {
        const carga = cargaInfo(fiscal.demandas_ativas);
        return `
            <div class="fiscal-card">
                <div class="fiscal-card-header">
                    <div class="fiscal-avatar" style="background:${corAvatar(fiscal.nome)}">${iniciais(fiscal.nome)}</div>
                    <div>
                        <div class="fiscal-name">${fiscal.nome}</div>
                        <div class="fiscal-especialidade">${fiscal.especialidade || 'Especialidade não informada'}</div>
                    </div>
                </div>
                <div class="fiscal-stats">
                    <div class="valor">${fiscal.demandas_ativas}</div>
                    <p class="rotulo">demanda(s) ativa(s)</p>
                    <span class="badge ${carga.className}">${carga.label}</span>
                </div>
                <div class="fiscal-footer">
                    <img src="logo_stante.png" alt="Stante">
                    <span>VISAT/CEREST Recife</span>
                </div>
            </div>
        `;
    }).join('');
}

async function carregarFiscais() {
    const fiscais = await fetch('/api/fiscais').then((r) => r.json());
    renderizarFiscais(fiscais);
}

function configurarModal() {
    const modal = document.getElementById('novoFiscalModal');
    const form = document.getElementById('novoFiscalForm');
    const messageEl = document.getElementById('novoFiscalMessage');

    const abrirModal = () => {
        messageEl.className = 'form-message';
        messageEl.textContent = '';
        form.reset();
        modal.hidden = false;
    };

    const fecharModal = () => {
        modal.hidden = true;
    };

    document.getElementById('novoFiscalBtn').addEventListener('click', abrirModal);
    document.getElementById('cancelarNovoFiscal').addEventListener('click', fecharModal);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const payload = {
            nome: document.getElementById('fiscalNomeInput').value.trim(),
            especialidade: document.getElementById('fiscalEspecialidadeInput').value.trim(),
        };

        try {
            const response = await fetch('/api/fiscais', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await response.json();

            if (!response.ok) {
                messageEl.className = 'form-message error';
                messageEl.textContent = data.erro || 'Não foi possível adicionar o fiscal.';
                return;
            }

            fecharModal();
            await carregarFiscais();
        } catch (err) {
            messageEl.className = 'form-message error';
            messageEl.textContent = 'Erro ao conectar com o servidor.';
        }
    });
}

configurarModal();
carregarFiscais();

const STATUS_BADGES = {
    aberta: { label: 'ABERTA', className: 'badge-gray' },
    em_andamento: { label: 'EM ANDAMENTO', className: 'badge-gray' },
    prazo_critico: { label: 'PRAZO', className: 'badge-amber' },
    vencida: { label: 'VENCIDA', className: 'badge-red' },
    concluida: { label: 'CONCLUÍDA', className: 'badge-green' },
};

let demandasAtuais = [];
let fiscaisCache = [];
const selecionados = new Set();

function formatarData(isoDate) {
    const [ano, mes, dia] = isoDate.split('-');
    return `${dia}/${mes}/${ano}`;
}

function construirQuery() {
    const params = new URLSearchParams();
    const de = document.getElementById('filtroDe').value;
    const ate = document.getElementById('filtroAte').value;
    const status = document.getElementById('filtroStatus').value;
    const busca = document.getElementById('filtroBusca').value.trim();

    if (de) params.set('de', de);
    if (ate) params.set('ate', ate);
    if (status) params.set('status', status);
    if (busca) params.set('busca', busca);

    return params.toString();
}

function atualizarBulkBar() {
    const barra = document.getElementById('bulkBar');
    const contador = document.getElementById('bulkCount');

    if (selecionados.size === 0) {
        barra.hidden = true;
        return;
    }

    barra.hidden = false;
    contador.textContent = `${selecionados.size} selecionada(s)`;
}

function renderizarTabela(demandas) {
    const corpo = document.getElementById('demandasTableBody');
    document.getElementById('totalResultados').textContent = `${demandas.length} demanda(s) encontrada(s)`;

    if (!demandas.length) {
        corpo.innerHTML = '<tr><td colspan="8" class="empty-state">Nenhuma demanda encontrada com esses filtros.</td></tr>';
        return;
    }

    corpo.innerHTML = demandas.map((demanda) => {
        const badge = STATUS_BADGES[demanda.status];
        const marcado = selecionados.has(demanda.id) ? 'checked' : '';
        return `
            <tr>
                <td><input type="checkbox" class="linha-checkbox" data-id="${demanda.id}" ${marcado}></td>
                <td>${demanda.numero}</td>
                <td>${demanda.demandante || '—'}</td>
                <td>${demanda.assunto}</td>
                <td>${demanda.fiscal || '—'}</td>
                <td>${formatarData(demanda.prazo)}</td>
                <td><span class="badge ${badge.className}">${badge.label}</span></td>
                <td><button type="button" class="btn-ver" data-id="${demanda.id}">Ver demanda</button></td>
            </tr>
        `;
    }).join('');

    document.querySelectorAll('.linha-checkbox').forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
            const id = Number(checkbox.dataset.id);
            if (checkbox.checked) selecionados.add(id);
            else selecionados.delete(id);
            atualizarBulkBar();
        });
    });

    document.querySelectorAll('.btn-ver').forEach((botao) => {
        botao.addEventListener('click', () => abrirVerDemanda(Number(botao.dataset.id)));
    });
}

async function carregarDemandas() {
    demandasAtuais = await fetch(`/api/demandas?${construirQuery()}`).then((r) => r.json());
    selecionados.clear();
    document.getElementById('selecionarTodos').checked = false;
    atualizarBulkBar();
    renderizarTabela(demandasAtuais);
}

async function carregarFiscaisCache() {
    if (!fiscaisCache.length) {
        fiscaisCache = await fetch('/api/fiscais').then((r) => r.json());
    }
    return fiscaisCache;
}

function configurarFiltros() {
    ['filtroDe', 'filtroAte', 'filtroStatus'].forEach((id) => {
        document.getElementById(id).addEventListener('change', carregarDemandas);
    });

    let debounce;
    document.getElementById('filtroBusca').addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(carregarDemandas, 300);
    });

    document.getElementById('limparFiltros').addEventListener('click', () => {
        document.getElementById('filtroDe').value = '';
        document.getElementById('filtroAte').value = '';
        document.getElementById('filtroStatus').value = '';
        document.getElementById('filtroBusca').value = '';
        carregarDemandas();
    });

    document.getElementById('selecionarTodos').addEventListener('change', (e) => {
        selecionados.clear();
        if (e.target.checked) {
            demandasAtuais.forEach((d) => selecionados.add(d.id));
        }
        atualizarBulkBar();
        renderizarTabela(demandasAtuais);
    });

    document.getElementById('bulkConcluir').addEventListener('click', async () => {
        await Promise.all([...selecionados].map((id) => fetch(`/api/demandas/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'concluida' }),
        })));
        await carregarDemandas();
    });
}

async function abrirVerDemanda(id) {
    const demanda = demandasAtuais.find((d) => d.id === id);
    if (!demanda) return;

    const modal = document.getElementById('verDemandaModal');
    const messageEl = document.getElementById('verDemandaMessage');
    messageEl.className = 'form-message';
    messageEl.textContent = '';

    document.getElementById('verDemandaNumero').textContent = `${demanda.numero} · ${demanda.demandante || 'Sem demandante'}`;
    document.getElementById('verDemandaAssunto').textContent = demanda.assunto;
    document.getElementById('verDemandaDemandante').textContent = demanda.demandante || '—';
    document.getElementById('verDemandaPrazo').textContent = formatarData(demanda.prazo);

    const statusSelect = document.getElementById('verDemandaStatus');
    statusSelect.value = ['aberta', 'em_andamento', 'concluida'].includes(demanda.status) ? demanda.status : 'aberta';

    const fiscais = await carregarFiscaisCache();
    const fiscalSelect = document.getElementById('verDemandaFiscal');
    fiscalSelect.innerHTML = '<option value="">Não atribuído</option>' +
        fiscais.map((f) => `<option value="${f.id}" ${f.id === demanda.fiscalId ? 'selected' : ''}>${f.nome}</option>`).join('');

    modal.dataset.demandaId = demanda.id;
    modal.hidden = false;
}

function configurarModalVerDemanda() {
    const modal = document.getElementById('verDemandaModal');
    const messageEl = document.getElementById('verDemandaMessage');

    document.getElementById('fecharVerDemanda').addEventListener('click', () => {
        modal.hidden = true;
    });

    document.getElementById('salvarVerDemanda').addEventListener('click', async () => {
        const id = modal.dataset.demandaId;
        const status = document.getElementById('verDemandaStatus').value;
        const fiscalId = document.getElementById('verDemandaFiscal').value || null;

        try {
            const response = await fetch(`/api/demandas/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, fiscalId }),
            });

            const data = await response.json();

            if (!response.ok) {
                messageEl.className = 'form-message error';
                messageEl.textContent = data.erro || 'Não foi possível salvar.';
                return;
            }

            modal.hidden = true;
            await carregarDemandas();
        } catch (err) {
            messageEl.className = 'form-message error';
            messageEl.textContent = 'Erro ao conectar com o servidor.';
        }
    });
}

function configurarModalNovaDemanda() {
    const modal = document.getElementById('novaDemandaModal');
    const form = document.getElementById('novaDemandaForm');
    const messageEl = document.getElementById('novaDemandaMessage');
    const demandanteSelect = document.getElementById('demandanteSelect');
    const outroGroup = document.getElementById('outroDemandanteGroup');
    const outroInput = document.getElementById('outroDemandanteInput');

    const abrirModal = async () => {
        messageEl.className = 'form-message';
        messageEl.textContent = '';
        form.reset();
        outroGroup.hidden = true;

        const [demandantes, fiscais] = await Promise.all([
            fetch('/api/demandantes').then((r) => r.json()),
            carregarFiscaisCache(),
        ]);

        demandanteSelect.innerHTML = demandantes.map((d) => `<option value="${d.id}">${d.nome}</option>`).join('')
            + '<option value="outro">Outro</option>';

        document.getElementById('fiscalSelect').innerHTML = '<option value="">Não atribuído</option>' +
            fiscais.map((f) => `<option value="${f.id}">${f.nome}</option>`).join('');

        modal.hidden = false;
    };

    const fecharModal = () => {
        modal.hidden = true;
    };

    document.getElementById('novaDemandaBtn').addEventListener('click', abrirModal);
    document.getElementById('cancelarNovaDemanda').addEventListener('click', fecharModal);

    demandanteSelect.addEventListener('change', () => {
        const isOutro = demandanteSelect.value === 'outro';
        outroGroup.hidden = !isOutro;
        outroInput.required = isOutro;
        if (!isOutro) outroInput.value = '';
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        try {
            let demandanteId = demandanteSelect.value;

            if (demandanteId === 'outro') {
                const nomeOutro = outroInput.value.trim();
                if (!nomeOutro) {
                    messageEl.className = 'form-message error';
                    messageEl.textContent = 'Digite o nome do órgão.';
                    return;
                }

                const criarResponse = await fetch('/api/demandantes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nome: nomeOutro }),
                });
                const criado = await criarResponse.json();

                if (!criarResponse.ok) {
                    messageEl.className = 'form-message error';
                    messageEl.textContent = criado.erro || 'Não foi possível registrar o órgão.';
                    return;
                }

                demandanteId = criado.id;
            }

            const payload = {
                demandanteId,
                assunto: document.getElementById('assuntoInput').value.trim(),
                fiscalId: document.getElementById('fiscalSelect').value || null,
                prazo: document.getElementById('prazoInput').value,
            };

            const response = await fetch('/api/demandas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await response.json();

            if (!response.ok) {
                messageEl.className = 'form-message error';
                messageEl.textContent = data.erro || 'Não foi possível criar a demanda.';
                return;
            }

            fecharModal();
            await carregarDemandas();
        } catch (err) {
            messageEl.className = 'form-message error';
            messageEl.textContent = 'Erro ao conectar com o servidor.';
        }
    });
}

configurarFiltros();
configurarModalVerDemanda();
configurarModalNovaDemanda();
carregarDemandas();

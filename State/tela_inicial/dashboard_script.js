const PERFIL_LABELS = {
    gestor: 'Gestora',
    inspetor: 'Inspetor(a) de campo',
    representante: 'Representante institucional',
};

const STATUS_BADGES = {
    aberta: { label: 'ABERTA', className: 'badge-gray' },
    em_andamento: { label: 'EM ANDAMENTO', className: 'badge-gray' },
    prazo_critico: { label: 'PRAZO', className: 'badge-amber' },
    vencida: { label: 'VENCIDA', className: 'badge-red' },
    concluida: { label: 'CONCLUÍDA', className: 'badge-green' },
};

const BAR_COLORS = ['#CC8712', '#142721', '#E0A526', '#315f28', '#8f9c96'];

function preencherUsuario() {
    const params = new URLSearchParams(window.location.search);
    const nome = params.get('nome');
    const perfil = params.get('perfil');

    document.getElementById('userName').textContent = nome || 'Usuário';
    document.getElementById('userRole').textContent = PERFIL_LABELS[perfil] || 'Perfil não identificado';
}

function formatarData(isoDate) {
    const [ano, mes, dia] = isoDate.split('-');
    return `${dia}/${mes}/${ano}`;
}

function renderizarBarras(container, itens, chaveLabel, chaveValor) {
    if (!itens.length) {
        container.innerHTML = '<p class="empty-state">Nenhum dado ainda.</p>';
        return;
    }

    const max = Math.max(...itens.map((item) => item[chaveValor]));

    container.innerHTML = itens.map((item, index) => {
        const largura = max ? Math.max((item[chaveValor] / max) * 100, 6) : 0;
        const cor = BAR_COLORS[index % BAR_COLORS.length];
        return `
            <div class="bar-list-item">
                <div class="bar-label-row">
                    <span>${item[chaveLabel]}</span>
                    <span>${item[chaveValor]}</span>
                </div>
                <div class="bar-track">
                    <div class="bar-fill" style="width:${largura}%; background:${cor}"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderizarPrazos(container, prazos) {
    if (!prazos.length) {
        container.innerHTML = '<p class="empty-state">Nenhum prazo nos próximos 30 dias.</p>';
        return;
    }

    container.innerHTML = prazos.map((prazo, index) => `
        <div class="prazo-item ${index === 0 && prazo.dias <= 5 ? 'urgente' : ''}">
            <div class="prazo-info">
                <strong>${prazo.numero} · ${prazo.demandante}</strong>
                <span>${prazo.assunto}</span>
            </div>
            <span class="prazo-dias-badge">${prazo.dias}d</span>
        </div>
    `).join('');
}

function renderizarTabela(corpo, demandas) {
    if (!demandas.length) {
        corpo.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhuma demanda cadastrada ainda.</td></tr>';
        return;
    }

    corpo.innerHTML = demandas.map((demanda) => {
        const badge = STATUS_BADGES[demanda.status];
        return `
            <tr>
                <td>${demanda.numero}</td>
                <td>${demanda.demandante || '—'}</td>
                <td>${demanda.assunto}</td>
                <td>${demanda.fiscal || '—'}</td>
                <td>${formatarData(demanda.prazo)}</td>
                <td><span class="badge ${badge.className}">${badge.label}</span></td>
            </tr>
        `;
    }).join('');
}

let tendenciaChart;

function renderizarGrafico(tendenciaMensal) {
    const ctx = document.getElementById('tendenciaChart');

    const dados = {
        labels: tendenciaMensal.map((item) => item.mes),
        datasets: [
            {
                label: 'Recebidas',
                data: tendenciaMensal.map((item) => item.recebidas),
                borderColor: '#142721',
                backgroundColor: '#142721',
                tension: 0.35,
            },
            {
                label: 'Concluídas',
                data: tendenciaMensal.map((item) => item.concluidas),
                borderColor: '#315f28',
                backgroundColor: '#315f28',
                tension: 0.35,
            },
        ],
    };

    if (tendenciaChart) {
        tendenciaChart.data = dados;
        tendenciaChart.update();
        return;
    }

    tendenciaChart = new Chart(ctx, {
        type: 'line',
        data: dados,
        options: {
            responsive: true,
            plugins: { legend: { position: 'top', align: 'end' } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
        },
    });
}

async function carregarDashboard() {
    const [dashboard, demandas] = await Promise.all([
        fetch('/api/dashboard').then((r) => r.json()),
        fetch('/api/demandas').then((r) => r.json()),
    ]);

    document.getElementById('kpiTotal').textContent = dashboard.total;
    document.getElementById('kpiEmAndamento').textContent = dashboard.emAndamento;
    document.getElementById('kpiAtribuidas').textContent = `${dashboard.atribuidas} atribuídas`;
    document.getElementById('kpiPrazoCritico').textContent = dashboard.prazoCritico;
    document.getElementById('kpiVencidas').textContent = dashboard.vencidas;
    document.getElementById('kpiConcluidas').textContent = dashboard.concluidas;

    const alertBanner = document.getElementById('alertBanner');
    if (dashboard.vencidas > 0 || dashboard.prazoCritico > 0) {
        alertBanner.hidden = false;
        document.getElementById('alertText').textContent =
            `${dashboard.vencidas} demanda(s) com prazo vencido e ${dashboard.prazoCritico} com prazo crítico (≤ 5 dias). Verifique imediatamente.`;
    } else {
        alertBanner.hidden = true;
    }

    renderizarBarras(document.getElementById('porDemandanteList'), dashboard.porDemandante, 'tipo', 'quantidade');
    renderizarBarras(document.getElementById('cargaFiscaisList'), dashboard.cargaFiscais, 'fiscal', 'quantidade');
    renderizarPrazos(document.getElementById('prazosProximosList'), dashboard.prazosProximos);
    renderizarGrafico(dashboard.tendenciaMensal);

    const recentes = [...demandas].sort((a, b) => b.id - a.id).slice(0, 5);
    renderizarTabela(document.getElementById('demandasTableBody'), recentes);
}

async function carregarOpcoesFormulario() {
    const [demandantes, fiscais] = await Promise.all([
        fetch('/api/demandantes').then((r) => r.json()),
        fetch('/api/fiscais').then((r) => r.json()),
    ]);

    const demandanteSelect = document.getElementById('demandanteSelect');
    demandanteSelect.innerHTML = demandantes.map((d) => `<option value="${d.id}">${d.nome}</option>`).join('')
        + '<option value="outro">Outro</option>';

    const fiscalSelect = document.getElementById('fiscalSelect');
    fiscalSelect.innerHTML = '<option value="">Não atribuído</option>' +
        fiscais.map((f) => `<option value="${f.id}">${f.nome}</option>`).join('');
}

function configurarModal() {
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
        await carregarOpcoesFormulario();
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
            await carregarDashboard();
        } catch (err) {
            messageEl.className = 'form-message error';
            messageEl.textContent = 'Erro ao conectar com o servidor.';
        }
    });
}

preencherUsuario();
configurarModal();
carregarDashboard();

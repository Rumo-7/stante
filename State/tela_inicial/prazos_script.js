const STATUS_BADGES = {
    aberta: { label: 'ABERTA', className: 'badge-gray' },
    em_andamento: { label: 'EM ANDAMENTO', className: 'badge-gray' },
    prazo_critico: { label: 'PRAZO', className: 'badge-amber' },
    vencida: { label: 'VENCIDA', className: 'badge-red' },
    concluida: { label: 'CONCLUÍDA', className: 'badge-green' },
};

let demandasAtuais = [];
let fiscaisCache = [];
let visaoAtual = 'lista';
const hoje = new Date();
let calendarioAno = hoje.getFullYear();
let calendarioMes = hoje.getMonth();

function formatarData(isoDate) {
    const [ano, mes, dia] = isoDate.split('-');
    return `${dia}/${mes}/${ano}`;
}

function diasParaPrazo(isoDate) {
    const hojeSemHora = new Date();
    hojeSemHora.setHours(0, 0, 0, 0);
    const data = new Date(`${isoDate}T00:00:00`);
    return Math.ceil((data - hojeSemHora) / (1000 * 60 * 60 * 24));
}

async function carregarFiscaisCache() {
    if (!fiscaisCache.length) {
        fiscaisCache = await fetch('/api/fiscais').then((r) => r.json());
    }
    return fiscaisCache;
}

async function popularFiltroFiscal() {
    const fiscais = await carregarFiscaisCache();
    const select = document.getElementById('filtroFiscal');
    select.innerHTML = '<option value="">Todos os fiscais</option>' +
        fiscais.map((f) => `<option value="${f.id}">${f.nome}</option>`).join('');
}

function renderizarRow(demanda) {
    const dias = diasParaPrazo(demanda.prazo);
    const borda = demanda.status === 'vencida' ? 'borda-vencida' : demanda.status === 'prazo_critico' ? 'borda-critico' : '';
    const rotuloDias = dias < 0 ? `${Math.abs(dias)}d em atraso` : `${dias}d restantes`;

    return `
        <div class="prazo-row ${borda}">
            <div class="prazo-row-info">
                <strong>${demanda.numero} · ${demanda.demandante || 'Sem demandante'}</strong>
                <span>${demanda.assunto} — ${demanda.fiscal || 'Sem fiscal atribuído'}</span>
            </div>
            <div class="prazo-row-meta">
                <span>${formatarData(demanda.prazo)}</span>
                <span class="prazo-row-dias">${rotuloDias}</span>
                <button type="button" class="btn-ver" data-id="${demanda.id}">Ver demanda</button>
            </div>
        </div>
    `;
}

function renderizarLista(demandas) {
    const vencidas = demandas.filter((d) => d.status === 'vencida');
    const criticas = demandas.filter((d) => d.status === 'prazo_critico');
    const proximas = demandas.filter((d) => {
        const dias = diasParaPrazo(d.prazo);
        return d.status !== 'vencida' && d.status !== 'prazo_critico' && dias >= 0 && dias <= 30;
    });

    document.getElementById('contagemVencidas').textContent = vencidas.length;
    document.getElementById('contagemCritico').textContent = criticas.length;
    document.getElementById('contagemProximos').textContent = proximas.length;

    document.getElementById('listaVencidas').innerHTML = vencidas.length
        ? vencidas.map(renderizarRow).join('')
        : '<p class="empty-state">Nenhuma demanda vencida. 🎉</p>';

    document.getElementById('listaCritico').innerHTML = criticas.length
        ? criticas.map(renderizarRow).join('')
        : '<p class="empty-state">Nenhuma demanda com prazo crítico.</p>';

    document.getElementById('listaProximos').innerHTML = proximas.length
        ? proximas.map(renderizarRow).join('')
        : '<p class="empty-state">Nenhum prazo nos próximos 30 dias.</p>';

    document.querySelectorAll('#visaoLista .btn-ver').forEach((botao) => {
        botao.addEventListener('click', () => abrirVerDemanda(Number(botao.dataset.id)));
    });
}

function renderizarCalendario(demandas) {
    const grid = document.getElementById('calendarioGrid');
    const NOMES_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    document.getElementById('calendarioTitulo').textContent = `${NOMES_MESES[calendarioMes]} de ${calendarioAno}`;

    const primeiroDiaSemana = new Date(calendarioAno, calendarioMes, 1).getDay();
    const totalDiasMes = new Date(calendarioAno, calendarioMes + 1, 0).getDate();
    const totalDiasMesAnterior = new Date(calendarioAno, calendarioMes, 0).getDate();

    const porDia = {};
    demandas.forEach((demanda) => {
        const [ano, mes, dia] = demanda.prazo.split('-').map(Number);
        if (ano === calendarioAno && mes - 1 === calendarioMes) {
            porDia[dia] = porDia[dia] || [];
            porDia[dia].push(demanda);
        }
    });

    const celulas = [];

    for (let i = primeiroDiaSemana - 1; i >= 0; i -= 1) {
        celulas.push({ numero: totalDiasMesAnterior - i, foraDoMes: true, demandas: [] });
    }

    for (let dia = 1; dia <= totalDiasMes; dia += 1) {
        celulas.push({ numero: dia, foraDoMes: false, demandas: porDia[dia] || [] });
    }

    while (celulas.length % 7 !== 0) {
        celulas.push({ numero: celulas.length - (primeiroDiaSemana + totalDiasMes) + 1, foraDoMes: true, demandas: [] });
    }

    const ehHoje = (numero) => calendarioAno === hoje.getFullYear()
        && calendarioMes === hoje.getMonth() && numero === hoje.getDate();

    grid.innerHTML = celulas.map((celula) => `
        <div class="calendario-dia ${celula.foraDoMes ? 'fora-do-mes' : ''} ${!celula.foraDoMes && ehHoje(celula.numero) ? 'hoje' : ''}">
            <div class="calendario-dia-numero">${celula.numero}</div>
            ${celula.demandas.map((d) => {
                const classe = d.status === 'vencida' ? 'pill-vencida' : d.status === 'prazo_critico' ? 'pill-critico' : d.status === 'concluida' ? 'pill-concluida' : '';
                return `<button type="button" class="calendario-pill ${classe}" data-id="${d.id}" title="${d.numero} — ${d.assunto}">${d.numero}</button>`;
            }).join('')}
        </div>
    `).join('');

    document.querySelectorAll('.calendario-pill').forEach((botao) => {
        botao.addEventListener('click', () => abrirVerDemanda(Number(botao.dataset.id)));
    });
}

function renderizarView() {
    if (visaoAtual === 'lista') {
        renderizarLista(demandasAtuais);
    } else {
        renderizarCalendario(demandasAtuais);
    }
}

async function carregarPrazos() {
    const params = new URLSearchParams();
    const fiscalId = document.getElementById('filtroFiscal').value;
    if (fiscalId) params.set('fiscalId', fiscalId);

    const todas = await fetch(`/api/demandas?${params.toString()}`).then((r) => r.json());
    demandasAtuais = todas.filter((d) => d.status !== 'concluida');
    renderizarView();
}

function configurarToggle() {
    const listaBtn = document.getElementById('verListaBtn');
    const calendarioBtn = document.getElementById('verCalendarioBtn');
    const visaoLista = document.getElementById('visaoLista');
    const visaoCalendario = document.getElementById('visaoCalendario');

    listaBtn.addEventListener('click', () => {
        visaoAtual = 'lista';
        listaBtn.classList.add('active');
        calendarioBtn.classList.remove('active');
        visaoLista.hidden = false;
        visaoCalendario.hidden = true;
        renderizarView();
    });

    calendarioBtn.addEventListener('click', () => {
        visaoAtual = 'calendario';
        calendarioBtn.classList.add('active');
        listaBtn.classList.remove('active');
        visaoLista.hidden = true;
        visaoCalendario.hidden = false;
        renderizarView();
    });

    document.getElementById('mesAnterior').addEventListener('click', () => {
        calendarioMes -= 1;
        if (calendarioMes < 0) {
            calendarioMes = 11;
            calendarioAno -= 1;
        }
        renderizarView();
    });

    document.getElementById('mesSeguinte').addEventListener('click', () => {
        calendarioMes += 1;
        if (calendarioMes > 11) {
            calendarioMes = 0;
            calendarioAno += 1;
        }
        renderizarView();
    });

    document.getElementById('filtroFiscal').addEventListener('change', carregarPrazos);
}

function formatarTamanho(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function carregarAnexos(demandaId) {
    const anexos = await fetch(`/api/demandas/${demandaId}/anexos`).then((r) => r.json());
    const lista = document.getElementById('verDemandaAnexosList');

    if (!anexos.length) {
        lista.innerHTML = '<li class="empty-state">Nenhum anexo enviado.</li>';
        return;
    }

    lista.innerHTML = anexos.map((anexo) => `
        <li>
            <a href="/api/anexos/${anexo.id}/download" target="_blank">${anexo.nomeOriginal}</a>
            <span class="anexo-tamanho">${formatarTamanho(anexo.tamanho)}</span>
            <button type="button" class="anexo-remover" data-id="${anexo.id}" title="Remover anexo">✕</button>
        </li>
    `).join('');

    document.querySelectorAll('.anexo-remover').forEach((botao) => {
        botao.addEventListener('click', async () => {
            await fetch(`/api/anexos/${botao.dataset.id}`, { method: 'DELETE' });
            carregarAnexos(demandaId);
        });
    });
}

async function abrirVerDemanda(id) {
    const demanda = demandasAtuais.find((d) => d.id === id);
    if (!demanda) return;

    const modal = document.getElementById('verDemandaModal');
    const messageEl = document.getElementById('verDemandaMessage');
    messageEl.className = 'form-message';
    messageEl.textContent = '';
    document.getElementById('verDemandaAnexoInput').value = '';

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
    await carregarAnexos(demanda.id);
}

function configurarModalVerDemanda() {
    const modal = document.getElementById('verDemandaModal');
    const messageEl = document.getElementById('verDemandaMessage');

    document.getElementById('fecharVerDemanda').addEventListener('click', () => {
        modal.hidden = true;
    });

    document.getElementById('verDemandaAnexoUpload').addEventListener('click', async () => {
        const id = modal.dataset.demandaId;
        const input = document.getElementById('verDemandaAnexoInput');
        if (!input.files.length) return;

        const formData = new FormData();
        Array.from(input.files).forEach((file) => formData.append('anexos', file));

        const response = await fetch(`/api/demandas/${id}/anexos`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const data = await response.json();
            messageEl.className = 'form-message error';
            messageEl.textContent = data.erro || 'Não foi possível enviar o anexo.';
            return;
        }

        input.value = '';
        await carregarAnexos(id);
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
            await carregarPrazos();
        } catch (err) {
            messageEl.className = 'form-message error';
            messageEl.textContent = 'Erro ao conectar com o servidor.';
        }
    });
}

popularFiltroFiscal();
configurarToggle();
configurarModalVerDemanda();
carregarPrazos();

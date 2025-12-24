import { 
    saveVeiculo, 
    getAllVeiculos, 
    getVeiculoByPlaca, 
    deleteVeiculo, 
    openDB, 
    saveMovimentacao, 
    updateVeiculoKm, 
    deleteMovimentacaoById, 
    getAllMovimentacoes 
} from './db.js';

// --- INICIALIZAÇÃO DO SISTEMA ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await openDB();
        console.log("JSCar: Banco de dados conectado.");
        
        // Carregamento inicial
        await loadVeiculosList();
        
        // Configuração de todas as funcionalidades
        setupNavigation();
        setupCadastroVeiculo();
        setupMovimentacaoForm(); 
        setupHistorico(); 
        setupAtualizacaoKm();
        setupBackup(); // Ativa o sistema de segurança de dados
        
    } catch (err) {
        console.error("JSCar: Erro na inicialização:", err);
    }

    // Atalho do Botão Flutuante (+)
    const fab = document.getElementById('fab-action');
    if(fab) {
        fab.onclick = () => document.querySelector('[data-target="movimentacao"]').click();
    }
});

// --- SISTEMA DE NAVEGAÇÃO ---
function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const pages = document.querySelectorAll('.page');

    navButtons.forEach(button => {
        button.onclick = (e) => {
            const target = e.currentTarget.getAttribute('data-target');
            
            navButtons.forEach(b => b.classList.remove('active'));
            pages.forEach(p => p.classList.add('hidden'));
            
            e.currentTarget.classList.add('active');
            document.getElementById(target).classList.remove('hidden');

            // Recarregar dados específicos da aba
            if (target === 'dashboard') loadVeiculosList();
            if (target === 'movimentacao') fillSelect('mov-placa');
            if (target === 'historico') fillSelect('filtro-veiculo');
            if (target === 'atualizacao-km') fillSelect('update-placa');
        };
    });
}

// --- CONTROLE DE FROTA (DASHBOARD) ---
async function loadVeiculosList() {
    const vs = await getAllVeiculos();
    const dash = document.getElementById('movimentacoes-list');
    const cadList = document.getElementById('delete-veiculo-list');
    
    if(dash) dash.innerHTML = '';
    if(cadList) cadList.innerHTML = '';
    
    vs.forEach(v => {
        const kmDesdeTroca = v.km_atual - (v.km_ultima_troca || 0);
        const precisaTroca = kmDesdeTroca >= 10000;
        const corStatus = precisaTroca ? '#F44336' : '#4CAF50';
        
        const cardHtml = `
            <div class="card" style="border-left: 6px solid ${corStatus}; margin-bottom: 15px;">
                <h3 style="margin: 0; color: #FF0000;">${v.placa}</h3>
                <small style="color: #AAA;">${v.modelo}</small>
                <p style="margin: 10px 0 5px 0;">KM Atual: <strong>${v.km_atual.toLocaleString('pt-BR')}</strong></p>
                <p style="color: ${corStatus}; font-weight: bold; font-size: 13px;">
                    ${precisaTroca ? '🚨 ALERTA: TROCA DE ÓLEO VENCIDA' : '✅ STATUS: ÓLEO OK'}
                </p>
                ${!document.getElementById('cadastro-veiculo').classList.contains('hidden') ? 
                    `<button onclick="window.delV('${v.placa}')" class="btn-danger" style="margin-top:10px; width: auto; padding: 5px 15px;">Remover Carro</button>` : ''}
            </div>`;
            
        if(dash) dash.insertAdjacentHTML('beforeend', cardHtml);
        if(cadList && !document.getElementById('cadastro-veiculo').classList.contains('hidden')) {
            cadList.insertAdjacentHTML('beforeend', cardHtml);
        }
    });
}

window.delV = async (placa) => {
    if(confirm(`Excluir a viatura ${placa} do sistema?`)) {
        await deleteVeiculo(placa);
        loadVeiculosList();
    }
};

// --- REGISTRO DE MOVIMENTAÇÃO (ASSINATURA E FORM) ---
function setupMovimentacaoForm() {
    const canvas = document.getElementById('signature-pad');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    let drawing = false;

    const resizeCanvas = () => {
        const ratio = window.devicePixelRatio || 1;
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        ctx.scale(ratio, ratio);
        ctx.strokeStyle = '#000000'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    canvas.onmousedown = canvas.ontouchstart = (e) => {
        drawing = true; ctx.beginPath();
        const { x, y } = getPos(e); ctx.moveTo(x, y);
        if(e.type === 'touchstart') e.preventDefault();
    };

    canvas.onmousemove = canvas.ontouchmove = (e) => {
        if (!drawing) return;
        const { x, y } = getPos(e); ctx.lineTo(x, y); ctx.stroke();
        if(e.type === 'touchmove') e.preventDefault();
    };

    canvas.onmouseup = canvas.ontouchend = () => drawing = false;
    document.getElementById('clear-signature').onclick = () => ctx.clearRect(0, 0, canvas.width, canvas.height);

    document.getElementById('form-movimentacao').onsubmit = async (e) => {
        e.preventDefault();
        const placa = document.getElementById('mov-placa').value;
        const km = parseInt(document.getElementById('mov-km-atual').value || 0);

        if (km > 0) await updateVeiculoKm(placa, km, null);

        await saveMovimentacao({
            placa_veiculo: placa,
            motorista: document.getElementById('mov-motorista').value,
            tipo: document.getElementById('mov-tipo').value,
            data_hora: document.getElementById('mov-data-hora').value,
            km_atual: km,
            assinatura: canvas.toDataURL(),
            checklist: Array.from(document.querySelectorAll('#mov-checklist-container input:checked')).map(i => i.parentElement.textContent.trim()),
            observacao: document.getElementById('mov-observacao').value
        });

        alert("Registro Salvo!"); e.target.reset();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        document.querySelector('[data-target="dashboard"]').click();
    };
}

// --- VISTORIA E MANUTENÇÃO DE ÓLEO ---
function setupAtualizacaoKm() {
    const form = document.getElementById('form-atualizacao-km');
    if(!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const placa = document.getElementById('update-placa').value;
        const novoKm = parseInt(document.getElementById('update-km-novo').value);
        const trocouOleo = document.getElementById('update-troca-oleo').checked;

        await updateVeiculoKm(placa, novoKm, trocouOleo ? novoKm : null);
        
        alert(trocouOleo ? "Óleo trocado e KM atualizado!" : "Vistoria realizada!");
        e.target.reset();
        loadVeiculosList();
    };
}

// --- RELATÓRIOS E AUDITORIA ---
function setupHistorico() {
    document.getElementById('btn-buscar-auditoria').onclick = renderizarHistorico;
    document.getElementById('btn-gerar-pdf').onclick = gerarRelatorioPDF;
}

async function renderizarHistorico() {
    const ini = document.getElementById('filtro-data-inicio').value;
    const fim = document.getElementById('filtro-data-fim').value;
    const placa = document.getElementById('filtro-veiculo').value;
    const res = document.getElementById('resultados-auditoria');

    let movs = await getAllMovimentacoes();
    if (ini) movs = movs.filter(r => r.data_hora >= ini);
    if (fim) movs = movs.filter(r => r.data_hora <= fim);
    if (placa) movs = movs.filter(r => r.placa_veiculo === placa);

    movs.sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora));
    res.innerHTML = movs.length === 0 ? '<p class="card">Sem registros no período.</p>' : '';

    movs.forEach(r => {
        const cor = r.tipo === 'saida' ? '#F44336' : '#4CAF50';
        res.insertAdjacentHTML('beforeend', `
            <div class="card" style="border-left: 5px solid ${cor};">
                <strong>${r.tipo.toUpperCase()} - ${r.placa_veiculo}</strong>
                <p>${r.motorista} | KM: ${r.km_atual || '---'}</p>
                <small>${new Date(r.data_hora).toLocaleString('pt-BR')}</small>
            </div>
        `);
    });
}

async function gerarRelatorioPDF() {
    const ini = document.getElementById('filtro-data-inicio').value;
    const fim = document.getElementById('filtro-data-fim').value;
    if (!ini || !fim) return alert("Selecione Início e Fim do plantão.");

    const movs = await getAllMovimentacoes();
    const veiculos = await getAllVeiculos();
    const vMap = new Map(veiculos.map(v => [v.placa, v.modelo]));
    const filtered = movs.filter(r => r.data_hora >= ini && r.data_hora <= fim);

    const agrupado = {};
    filtered.forEach(r => {
        if (!agrupado[r.placa_veiculo]) agrupado[r.placa_veiculo] = [];
        agrupado[r.placa_veiculo].push(r);
    });

    let html = `<h1>Relatório de Plantão JSCar</h1><p>De: ${new Date(ini).toLocaleString()} Até: ${new Date(fim).toLocaleString()}</p>`;
    for (const p in agrupado) {
        agrupado[p].sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));
        html += `<h3>Viatura: ${p} - ${vMap.get(p) || ''}</h3>
            <table border="1" style="width:100%; border-collapse:collapse; margin-bottom:20px;">
                <tr style="background:#eee"><th>Tipo</th><th>Hora</th><th>Motorista</th><th>KM</th></tr>
                ${agrupado[p].map(m => `<tr><td>${m.tipo.toUpperCase()}</td><td>${new Date(m.data_hora).toLocaleTimeString()}</td><td>${m.motorista}</td><td>${m.km_atual || '--'}</td></tr>`).join('')}
            </table>`;
    }
    const win = window.open('', '_blank');
    win.document.write(`<html><body>${html}</body></html>`); win.document.close(); win.print();
}

// --- SISTEMA DE BACKUP ---
function setupBackup() {
    document.getElementById('btn-exportar').onclick = exportarDados;
    document.getElementById('btn-importar-trigger').onclick = () => document.getElementById('input-importar').click();
    document.getElementById('input-importar').onchange = importarDados;
}

async function exportarDados() {
    const v = await getAllVeiculos();
    const m = await getAllMovimentacoes();
    const blob = new Blob([JSON.stringify({v, m}, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `JSCar_Backup_${new Date().toLocaleDateString()}.json`;
    a.click();
}

async function importarDados(event) {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = JSON.parse(e.target.result);
        for(const item of data.v) await saveVeiculo(item);
        for(const item of data.m) { delete item.id; await saveMovimentacao(item); }
        alert("Backup Restaurado!"); loadVeiculosList();
    };
    reader.readAsText(file);
}

// --- AUXILIARES ---
async function fillSelect(id) {
    const s = document.getElementById(id);
    const vs = await getAllVeiculos();
    s.innerHTML = `<option value="">Selecione...</option>` + vs.map(v => `<option value="${v.placa}">${v.placa} - ${v.modelo}</option>`).join('');
}

function setupCadastroVeiculo() {
    document.getElementById('form-cadastro-veiculo').onsubmit = async (e) => {
        e.preventDefault();
        await saveVeiculo({
            placa: document.getElementById('veiculo-placa').value.toUpperCase(),
            modelo: document.getElementById('veiculo-modelo').value,
            km_atual: parseInt(document.getElementById('veiculo-km').value),
            km_ultima_troca: parseInt(document.getElementById('veiculo-km').value)
        });
        alert("Viatura Cadastrada!"); e.target.reset(); loadVeiculosList();
    };
}

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
        console.log("JSCar: Sistema iniciado e banco de dados conectado.");
        
        await loadVeiculosList();
        setupNavigation();
        setupCadastroVeiculo();
        setupMovimentacaoForm(); 
        setupHistorico(); 
        setupAtualizacaoKm();
        setupBackup(); // Ativa exportação/importação de dados
        
    } catch (err) {
        console.error("Erro na inicialização:", err);
    }

    // Botão flutuante para registro rápido
    const fab = document.getElementById('fab-action');
    if(fab) {
        fab.onclick = () => document.querySelector('[data-target="movimentacao"]').click();
    }
});

// --- GESTÃO DE NAVEGAÇÃO ---
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

            // Atualiza listas ao trocar de aba
            if (target === 'dashboard') loadVeiculosList();
            if (target === 'movimentacao') fillSelect('mov-placa');
            if (target === 'historico') fillSelect('filtro-veiculo');
            if (target === 'atualizacao-km') fillSelect('update-placa');
        };
    });
}

// --- DASHBOARD (STATUS DA FROTA) ---
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
                    ${precisaTroca ? '🚨 MANUTENÇÃO: ÓLEO VENCIDO' : '✅ STATUS: ÓLEO OK'}
                </p>
                ${!document.getElementById('cadastro-veiculo').classList.contains('hidden') ? 
                    `<button onclick="window.delV('${v.placa}')" class="btn-danger" style="margin-top:10px; width: auto; padding: 5px 15px;">Remover</button>` : ''}
            </div>`;
            
        if(dash) dash.insertAdjacentHTML('beforeend', cardHtml);
        if(cadList && !document.getElementById('cadastro-veiculo').classList.contains('hidden')) {
            cadList.insertAdjacentHTML('beforeend', cardHtml);
        }
    });
}

window.delV = async (placa) => {
    if(confirm(`Deseja remover a viatura ${placa}?`)) {
        await deleteVeiculo(placa);
        loadVeiculosList();
    }
};

// --- MOVIMENTAÇÃO (SAÍDA/ENTRADA) COM AUTO-PREENCHIMENTO ---
function setupMovimentacaoForm() {
    const canvas = document.getElementById('signature-pad');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const selectPlaca = document.getElementById('mov-placa');
    const inputKm = document.getElementById('mov-km-atual');
    let drawing = false;

    // AUTO-PREENCHIMENTO: Busca o KM assim que seleciona o carro
    selectPlaca.onchange = async () => {
        const v = await getVeiculoByPlaca(selectPlaca.value);
        if(v) {
            inputKm.value = v.km_atual;
        }
    };

    // Assinatura Digital
    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    canvas.onmousedown = canvas.ontouchstart = (e) => {
        drawing = true; ctx.beginPath();
        const { x, y } = getPos(e); ctx.moveTo(x, y);
    };
    canvas.onmousemove = canvas.ontouchmove = (e) => {
        if (!drawing) return;
        const { x, y } = getPos(e); ctx.lineTo(x, y); ctx.stroke();
    };
    canvas.onmouseup = canvas.ontouchend = () => drawing = false;
    document.getElementById('clear-signature').onclick = () => ctx.clearRect(0, 0, canvas.width, canvas.height);

    document.getElementById('form-movimentacao').onsubmit = async (e) => {
        e.preventDefault();
        const placa = selectPlaca.value;
        const kmVal = inputKm.value ? parseInt(inputKm.value) : null;

        // Se o usuário digitou ou aceitou o KM sugerido, atualizamos a base
        if (kmVal) await updateVeiculoKm(placa, kmVal, null);

        await saveMovimentacao({
            placa_veiculo: placa,
            motorista: document.getElementById('mov-motorista').value,
            tipo: document.getElementById('mov-tipo').value,
            data_hora: document.getElementById('mov-data-hora').value,
            km_atual: kmVal,
            assinatura: canvas.toDataURL(),
            checklist: Array.from(document.querySelectorAll('#mov-checklist-container input:checked')).map(i => i.parentElement.textContent.trim()),
            observacao: document.getElementById('mov-observacao').value
        });

        alert("Registro salvo com sucesso!");
        e.target.reset();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        document.querySelector('[data-target="dashboard"]').click();
    };
}

// --- VISTORIA E TROCA DE ÓLEO ---
function setupAtualizacaoKm() {
    const form = document.getElementById('form-atualizacao-km');
    if(!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const placa = document.getElementById('update-placa').value;
        const novoKm = parseInt(document.getElementById('update-km-novo').value);
        const trocouOleo = document.getElementById('update-troca-oleo').checked;

        // Atualiza KM e, se marcado, reseta a contagem de óleo
        await updateVeiculoKm(placa, novoKm, trocouOleo ? novoKm : null);
        
        alert("Vistoria atualizada!");
        e.target.reset();
        loadVeiculosList();
    };
}

// --- HISTÓRICO E PDF AGRUPADO POR VIATURA ---
function setupHistorico() {
    document.getElementById('btn-buscar-auditoria').onclick = renderizarHistorico;
    document.getElementById('btn-gerar-pdf').onclick = gerarRelatorioPDF;
}

async function renderizarHistorico() {
    const ini = document.getElementById('filtro-data-inicio').value;
    const fim = document.getElementById('filtro-data-fim').value;
    const res = document.getElementById('resultados-auditoria');
    let movs = await getAllMovimentacoes();

    if (ini) movs = movs.filter(m => m.data_hora >= ini);
    if (fim) movs = movs.filter(m => m.data_hora <= fim);

    movs.sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora));
    res.innerHTML = movs.length === 0 ? '<p>Nenhum registro no período.</p>' : '';

    movs.forEach(m => {
        res.insertAdjacentHTML('beforeend', `
            <div class="card">
                <strong>${m.tipo.toUpperCase()} - ${m.placa_veiculo}</strong><br>
                <small>${new Date(m.data_hora).toLocaleString()} - Motorista: ${m.motorista}</small>
            </div>
        `);
    });
}

async function gerarRelatorioPDF() {
    const ini = document.getElementById('filtro-data-inicio').value;
    const fim = document.getElementById('filtro-data-fim').value;
    if (!ini || !fim) return alert("Defina o início e fim do plantão.");

    const movs = await getAllMovimentacoes();
    const filtered = movs.filter(m => m.data_hora >= ini && m.data_hora <= fim);
    
    // Agrupamento por Viatura
    const agrupado = {};
    filtered.forEach(m => {
        if (!agrupado[m.placa_veiculo]) agrupado[m.placa_veiculo] = [];
        agrupado[m.placa_veiculo].push(m);
    });

    let html = `<h2>Relatório de Plantão JSCar</h2><p>Período: ${ini} a ${fim}</p>`;
    
    for (const placa in agrupado) {
        agrupado[placa].sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));
        html += `<h3>Viatura: ${placa}</h3>
            <table border="1" width="100%" style="border-collapse:collapse; margin-bottom:20px;">
                <tr style="background:#eee"><th>Tipo</th><th>Hora</th><th>Motorista</th><th>KM</th></tr>
                ${agrupado[placa].map(m => `
                    <tr><td>${m.tipo}</td><td>${new Date(m.data_hora).toLocaleTimeString()}</td><td>${m.motorista}</td><td>${m.km_atual || '--'}</td></tr>
                `).join('')}
            </table>`;
    }

    const win = window.open('', '_blank');
    win.document.write(`<html><body>${html}</body></html>`);
    win.document.close();
    win.print();
}

// --- SISTEMA DE BACKUP (SEGURANÇA TOTAL) ---
function setupBackup() {
    document.getElementById('btn-exportar').onclick = async () => {
        const veiculos = await getAllVeiculos();
        const movimentacoes = await getAllMovimentacoes();
        const backup = { veiculos, movimentacoes, data: new Date().toISOString() };
        
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `JSCar_Backup_${new Date().toLocaleDateString()}.json`;
        a.click();
    };

    document.getElementById('btn-importar-trigger').onclick = () => document.getElementById('input-importar').click();
    
    document.getElementById('input-importar').onchange = (e) => {
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const data = JSON.parse(ev.target.result);
            if (data.veiculos) for (let v of data.veiculos) await saveVeiculo(v);
            if (data.movimentacoes) for (let m of data.movimentacoes) { delete m.id; await saveMovimentacao(m); }
            alert("Backup restaurado com sucesso!");
            location.reload();
        };
        reader.readAsText(e.target.files[0]);
    };
}

// --- AUXILIARES ---
async function fillSelect(id) {
    const select = document.getElementById(id);
    const vs = await getAllVeiculos();
    select.innerHTML = '<option value="">Selecione a Viatura</option>' + 
        vs.map(v => `<option value="${v.placa}">${v.placa} - ${v.modelo}</option>`).join('');
}

function setupCadastroVeiculo() {
    const form = document.getElementById('form-cadastro-veiculo');
    form.onsubmit = async (e) => {
        e.preventDefault();
        await saveVeiculo({
            placa: document.getElementById('veiculo-placa').value.toUpperCase(),
            modelo: document.getElementById('veiculo-modelo').value,
            km_atual: parseInt(document.getElementById('veiculo-km').value),
            km_ultima_troca: parseInt(document.getElementById('veiculo-km').value)
        });
        alert("Veículo cadastrado!");
        e.target.reset();
        loadVeiculosList();
    };
}

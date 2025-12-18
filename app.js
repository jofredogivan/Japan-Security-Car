// app.js - VERSÃO FINAL UNIFICADA COM RELATÓRIO AGRUPADO
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

// -------------------------------------------------------------
// 1. INICIALIZAÇÃO
// -------------------------------------------------------------
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.error(err));
    });
}

document.addEventListener('DOMContentLoaded', () => {
    openDB().then(() => loadVeiculosList());
    setupNavigation();
    setupCadastroVeiculo();
    setupMovimentacaoForm(); 
    setupHistorico(); 
    setupAtualizacaoKm(); 

    // Botão flutuante para nova movimentação
    document.getElementById('fab-action').addEventListener('click', () => {
        document.querySelector('.nav-btn[data-target="movimentacao"]').click(); 
    });
});

// -------------------------------------------------------------
// 2. NAVEGAÇÃO
// -------------------------------------------------------------
function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const pages = document.querySelectorAll('.page');

    navButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const targetId = e.currentTarget.getAttribute('data-target');
            navButtons.forEach(btn => btn.classList.remove('active'));
            pages.forEach(page => page.classList.add('hidden'));
            e.currentTarget.classList.add('active');
            
            const targetPage = document.getElementById(targetId);
            if (targetPage) {
                targetPage.classList.remove('hidden');
                // Recarga de dados por contexto
                if (targetId === 'dashboard' || targetId === 'cadastro-veiculo') loadVeiculosList();
                if (targetId === 'movimentacao') loadVeiculosForMovimentacao();
                if (targetId === 'historico') loadVeiculosForHistorico();
                if (targetId === 'atualizacao-km') loadVeiculosForKmUpdate();
            }
        });
    });
}

// -------------------------------------------------------------
// 3. GESTÃO DE VEÍCULOS
// -------------------------------------------------------------
async function loadVeiculosList() {
    const veiculos = await getAllVeiculos();
    const dashList = document.getElementById('movimentacoes-list');
    const cadList = document.getElementById('delete-veiculo-list');
    const isCad = !document.getElementById('cadastro-veiculo').classList.contains('hidden');

    dashList.innerHTML = cadList.innerHTML = '';

    if (veiculos.length === 0) {
        const msg = '<div class="card card-placeholder">Nenhuma viatura cadastrada.</div>';
        dashList.innerHTML = cadList.innerHTML = msg;
        return;
    }

    veiculos.forEach(v => {
        const precisaTrocar = (v.km_atual - v.km_ultima_troca) >= 10000;
        const cor = precisaTrocar ? '#f44336' : '#4caf50';
        
        const cardHTML = `
            <div class="card veiculo-card" id="veiculo-card-${v.placa}" style="border-left: 5px solid ${cor};">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3 style="margin:0;">${v.placa}</h3>
                        <small>${v.modelo}</small>
                    </div>
                    ${isCad ? `<div>
                        <button class="btn btn-danger" onclick="window.delV('${v.placa}')" style="padding:5px 10px;"><i class="fas fa-trash"></i></button>
                    </div>` : ''}
                </div>
                <p style="margin: 10px 0 5px 0;">KM Atual: <strong>${v.km_atual.toLocaleString('pt-BR')}</strong></p>
                <p style="color:${cor}; font-weight:bold; font-size:13px;">
                    ${precisaTrocar ? '🚨 TROCA DE ÓLEO NECESSÁRIA' : '✅ ÓLEO OK'}
                </p>
            </div>`;
        
        if (isCad) cadList.insertAdjacentHTML('beforeend', cardHTML);
        else dashList.insertAdjacentHTML('beforeend', cardHTML);
    });
}

window.delV = async (p) => { if(confirm(`Excluir ${p}?`)) { await deleteVeiculo(p); loadVeiculosList(); } };

function setupCadastroVeiculo() {
    document.getElementById('form-cadastro-veiculo').onsubmit = async (e) => {
        e.preventDefault();
        const placa = document.getElementById('veiculo-placa').value.toUpperCase().trim();
        const modelo = document.getElementById('veiculo-modelo').value.trim();
        const km = parseInt(document.getElementById('veiculo-km').value);
        await saveVeiculo({ placa, modelo, km_atual: km, km_ultima_troca: km });
        alert("Veículo Cadastrado!");
        e.target.reset(); loadVeiculosList();
        document.querySelector('.nav-btn[data-target="dashboard"]').click();
    };
}

// -------------------------------------------------------------
// 4. MOVIMENTAÇÃO (SAÍDA / ENTRADA)
// -------------------------------------------------------------
function setupMovimentacaoForm() {
    const canvas = document.getElementById('signature-pad');
    const ctx = canvas.getContext('2d');
    const form = document.getElementById('form-movimentacao');
    let drawing = false;

    const resize = () => {
        const ratio = window.devicePixelRatio || 1;
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        ctx.scale(ratio, ratio);
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    };
    window.addEventListener('resize', resize); resize();

    const getPos = (e) => {
        const r = canvas.getBoundingClientRect();
        const t = e.touches ? e.touches[0] : e;
        return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    canvas.onmousedown = canvas.ontouchstart = (e) => { drawing = true; ctx.beginPath(); const {x,y} = getPos(e); ctx.moveTo(x,y); };
    canvas.onmousemove = canvas.ontouchmove = (e) => {
        if (!drawing) return; const {x,y} = getPos(e); ctx.lineTo(x,y); ctx.stroke();
        if(e.type === 'touchmove') e.preventDefault();
    };
    canvas.onmouseup = canvas.ontouchend = () => drawing = false;
    document.getElementById('clear-signature').onclick = () => ctx.clearRect(0,0,canvas.width,canvas.height);

    form.onsubmit = async (e) => {
        e.preventDefault();
        const kmVal = document.getElementById('mov-km-atual').value;
        const placa = document.getElementById('mov-placa').value;
        const km = kmVal !== "" ? parseInt(kmVal, 10) : null;

        if (km !== null) {
            const v = await getVeiculoByPlaca(placa);
            if (km < v.km_atual) return alert("Erro: KM informado é menor que o atual!");
            let novaTroca = null;
            if ((km - v.km_ultima_troca) >= 10000) {
                if (confirm("🚨 Troca de óleo vencida! Você trocou o óleo agora?")) novaTroca = km;
            }
            await updateVeiculoKm(placa, km, novaTroca);
        }

        const dados = {
            placa_veiculo: placa,
            motorista: document.getElementById('mov-motorista').value,
            tipo: document.getElementById('mov-tipo').value,
            data_hora: new Date(document.getElementById('mov-data-hora').value).toISOString(),
            checklist: Array.from(document.querySelectorAll('#mov-checklist-container input:checked')).map(i => i.parentElement.textContent.trim()),
            observacao: document.getElementById('mov-observacao').value,
            assinatura: canvas.toDataURL(),
            km_atual: km
        };

        await saveMovimentacao(dados);
        alert("Salvo com sucesso!");
        form.reset(); ctx.clearRect(0,0,canvas.width,canvas.height);
        document.querySelector('.nav-btn[data-target="dashboard"]').click();
    };
}

// -------------------------------------------------------------
// 5. HISTÓRICO E RELATÓRIO PDF (SINCRONIZADO POR CARRO)
// -------------------------------------------------------------
function setupHistorico() {
    // Botão de Busca na Tela
    document.getElementById('btn-buscar-auditoria').onclick = async () => renderizarHistorico();

    // Botão de Gerar Relatório Diário (PDF)
    const btnPdf = document.createElement('button');
    btnPdf.className = "btn btn-primary";
    btnPdf.style.marginTop = "10px";
    btnPdf.innerHTML = '<i class="fas fa-file-pdf"></i> Gerar Relatório do Dia';
    btnPdf.onclick = gerarRelatorioPDF;
    document.getElementById('historico').insertBefore(btnPdf, document.getElementById('resultados-auditoria'));
}

async function renderizarHistorico() {
    const placaFiltro = document.getElementById('filtro-veiculo').value;
    const inicio = document.getElementById('filtro-data-inicio').value;
    const fim = document.getElementById('filtro-data-fim').value;
    const resDiv = document.getElementById('resultados-auditoria');

    let movs = await getAllMovimentacoes();
    const veiculos = await getAllVeiculos();
    const vMap = new Map(veiculos.map(v => [v.placa, v.modelo]));

    movs = movs.filter(m => {
        const d = new Date(m.data_hora).getTime();
        let ok = true;
        if (placaFiltro && m.placa_veiculo !== placaFiltro) ok = false;
        if (inicio && d < new Date(inicio + 'T00:00').getTime()) ok = false;
        if (fim && d > new Date(fim + 'T23:59').getTime()) ok = false;
        return ok;
    }).sort((a,b) => new Date(b.data_hora) - new Date(a.data_hora));

    resDiv.innerHTML = movs.length ? '' : '<p class="card">Nenhum registro.</p>';
    movs.forEach(m => {
        const cor = m.tipo === 'saida' ? '#f44336' : '#4caf50';
        resDiv.insertAdjacentHTML('beforeend', `
            <div class="card" style="border-left: 6px solid ${cor};">
                <div style="display:flex; justify-content:space-between;">
                    <div>
                        <strong style="color:${cor}">${m.tipo.toUpperCase()}</strong> - <strong>${m.placa_veiculo}</strong><br>
                        <small>${vMap.get(m.placa_veiculo) || ''}</small>
                    </div>
                    <button class="btn btn-danger" onclick="window.delMov(${m.id})" style="padding:2px 8px;">X</button>
                </div>
                <p style="margin:5px 0;">Motorista: ${m.motorista} | KM: ${m.km_atual || 'Vistoria Pendente'}</p>
                <small>${new Date(m.data_hora).toLocaleString('pt-BR')}</small>
            </div>`);
    });
}

async function gerarRelatorioPDF() {
    const dataAlvo = document.getElementById('filtro-data-inicio').value;
    if (!dataAlvo) return alert("Selecione a data no filtro de 'Início' primeiro.");

    const movs = await getAllMovimentacoes();
    const veiculos = await getAllVeiculos();
    const vMap = new Map(veiculos.map(v => [v.placa, v.modelo]));

    // Filtra apenas o dia e agrupa por placa
    const diaMovs = movs.filter(m => m.data_hora.startsWith(dataAlvo));
    const agrupado = {};
    diaMovs.forEach(m => {
        if (!agrupado[m.placa_veiculo]) agrupado[m.placa_veiculo] = [];
        agrupado[m.placa_veiculo].push(m);
    });

    let conteudo = `<h1 style="text-align:center;">Relatório Diário - ${dataAlvo.split('-').reverse().join('/')}</h1>`;

    for (const placa in agrupado) {
        agrupado[placa].sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));
        conteudo += `
            <div style="border:1px solid #000; margin-bottom:20px; padding:10px;">
                <h3 style="background:#eee; margin:0; padding:5px;">Viatura: ${placa} - ${vMap.get(placa)}</h3>
                <table style="width:100%; border-collapse:collapse; margin-top:10px;">
                    <thead><tr style="border-bottom:1px solid #000; text-align:left;">
                        <th>Tipo</th><th>Hora</th><th>Motorista</th><th>KM</th>
                    </tr></thead>
                    <tbody>`;
        agrupado[placa].forEach(m => {
            conteudo += `
                <tr style="border-bottom:1px solid #eee;">
                    <td>${m.tipo.toUpperCase()}</td>
                    <td>${new Date(m.data_hora).toLocaleTimeString('pt-BR')}</td>
                    <td>${m.motorista}</td>
                    <td>${m.km_atual || '---'}</td>
                </tr>`;
        });
        conteudo += `</tbody></table></div>`;
    }

    const win = window.open('', '_blank');
    win.document.write(`<html><head><style>body{font-family:sans-serif;} table td{padding:5px;}</style></head><body>${conteudo}</body></html>`);
    win.document.close();
    win.print();
}

window.delMov = async (id) => { if(confirm("Excluir registro?")) { await deleteMovimentacaoById(id); renderizarHistorico(); } };

// -------------------------------------------------------------
// 6. VISTORIA NOTURNA E HELPERS
// -------------------------------------------------------------
function setupAtualizacaoKm() {
    document.getElementById('form-atualizacao-km').onsubmit = async (e) => {
        e.preventDefault();
        const p = document.getElementById('update-placa').value;
        const k = parseInt(document.getElementById('update-km-novo').value);
        await updateVeiculoKm(p, k, null);
        alert("KM Atualizado!"); e.target.reset();
    };
}

async function loadVeiculosForMovimentacao() { fillSelect('mov-placa'); }
async function loadVeiculosForHistorico() { fillSelect('filtro-veiculo'); }
async function loadVeiculosForKmUpdate() { fillSelect('update-placa'); }

async function fillSelect(id) {
    const s = document.getElementById(id);
    const vs = await getAllVeiculos();
    s.innerHTML = '<option value="">Selecione...</option>';
    vs.forEach(v => s.add(new Option(`${v.placa} - ${v.modelo}`, v.placa)));
}

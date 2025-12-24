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

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await openDB();
        setupNavigation();
        setupBackup(); // Função de Backup/Importação incluída abaixo
        setupCadastroVeiculo();
        setupMovimentacaoForm(); 
        setupHistorico(); 
        setupAtualizacaoKm(); 
        await loadVeiculosList();

        // Botão flutuante para nova movimentação
        const fab = document.getElementById('fab-action');
        if(fab) {
            fab.addEventListener('click', () => {
                document.querySelector('.nav-btn[data-target="movimentacao"]').click(); 
            });
        }
    } catch (err) {
        console.error("Erro ao carregar banco de dados:", err);
    }
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
    if(!dashList || !cadList) return;

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
            <div class="card veiculo-card" style="border-left: 5px solid ${cor};">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3 style="margin:0;">${v.placa}</h3>
                        <small>${v.modelo}</small>
                    </div>
                    <button class="btn btn-danger" onclick="window.delV('${v.placa}')" style="padding:5px 10px;"><i class="fas fa-trash"></i></button>
                </div>
                <p style="margin: 10px 0 5px 0;">KM Atual: <strong>${v.km_atual.toLocaleString('pt-BR')}</strong></p>
                <p style="color:${cor}; font-weight:bold; font-size:13px;">
                    ${precisaTrocar ? '🚨 TROCA DE ÓLEO NECESSÁRIA' : '✅ ÓLEO OK'}
                </p>
            </div>`;
        
        dashList.insertAdjacentHTML('beforeend', cardHTML);
        cadList.insertAdjacentHTML('beforeend', cardHTML);
    });
}

window.delV = async (p) => { if(confirm(`Excluir ${p}?`)) { await deleteVeiculo(p); loadVeiculosList(); } };

function setupCadastroVeiculo() {
    const form = document.getElementById('form-cadastro-veiculo');
    if(!form) return;
    form.onsubmit = async (e) => {
        e.preventDefault();
        const placa = document.getElementById('veiculo-placa').value.toUpperCase().trim();
        const modelo = document.getElementById('veiculo-modelo').value.trim();
        const km = parseInt(document.getElementById('veiculo-km').value);
        await saveVeiculo({ placa, modelo, km_atual: km, km_ultima_troca: km });
        alert("Veículo Cadastrado!");
        e.target.reset(); loadVeiculosList();
    };
}

// -------------------------------------------------------------
// 4. MOVIMENTAÇÃO (KM NÃO OBRIGATÓRIO)
// -------------------------------------------------------------
function setupMovimentacaoForm() {
    const canvas = document.getElementById('signature-pad');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const form = document.getElementById('form-movimentacao');
    let drawing = false;

    // Ajuste de DPI do Canvas
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    ctx.scale(ratio, ratio);
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 2;

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
        const kmIn = document.getElementById('mov-km-atual').value;
        const placa = document.getElementById('mov-placa').value;
        const km = kmIn !== "" ? parseInt(kmIn, 10) : null;

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
// 5. RELATÓRIOS E PDF
// -------------------------------------------------------------
function setupHistorico() {
    const btnBusca = document.getElementById('btn-buscar-auditoria');
    if(btnBusca) btnBusca.onclick = renderizarHistorico;

    // Exportar PDF Agrupado
    const btnPdf = document.getElementById('btn-export-pdf');
    if(btnPdf) btnPdf.onclick = gerarRelatorioPDF;

    // Exportar Excel
    const btnExcel = document.getElementById('btn-export-excel');
    if(btnExcel) btnExcel.onclick = exportarExcel;
}

async function renderizarHistorico() {
    const placaFiltro = document.getElementById('filtro-veiculo').value;
    const inicio = document.getElementById('filtro-data-inicio').value;
    const fim = document.getElementById('filtro-data-fim').value;
    const resDiv = document.getElementById('resultados-auditoria');

    let movs = await getAllMovimentacoes();
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
                    <strong>${m.tipo.toUpperCase()} - ${m.placa_veiculo}</strong>
                    <button class="btn btn-danger" onclick="window.delMov(${m.id})" style="padding:2px 8px;">X</button>
                </div>
                <p>Motorista: ${m.motorista} | KM: ${m.km_atual || '---'}</p>
                <small>${new Date(m.data_hora).toLocaleString('pt-BR')}</small>
            </div>`);
    });
}

async function gerarRelatorioPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const movs = await getAllMovimentacoes();
    const veiculos = await getAllVeiculos();
    const vMap = new Map(veiculos.map(v => [v.placa, v.modelo]));

    doc.setFontSize(18);
    doc.text("Relatório de Movimentação JSCAR", 14, 20);
    
    // Agrupamento por placa
    const agrupado = {};
    movs.forEach(m => {
        if (!agrupado[m.placa_veiculo]) agrupado[m.placa_veiculo] = [];
        agrupado[m.placa_veiculo].push(m);
    });

    let y = 30;
    for (const placa in agrupado) {
        doc.setFontSize(14);
        doc.text(`Viatura: ${placa} - ${vMap.get(placa) || ''}`, 14, y);
        y += 7;
        
        const rows = agrupado[placa].map(m => [
            new Date(m.data_hora).toLocaleString('pt-BR'),
            m.tipo.toUpperCase(),
            m.motorista,
            m.km_atual || '---'
        ]);

        doc.autoTable({
            head: [['Data/Hora', 'Tipo', 'Motorista', 'KM']],
            body: rows,
            startY: y,
            theme: 'grid'
        });
        y = doc.lastAutoTable.finalY + 10;
    }
    doc.save("Relatorio_JSCAR.pdf");
}

async function exportarExcel() {
    const movs = await getAllMovimentacoes();
    const ws = XLSX.utils.json_to_sheet(movs);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimentacoes");
    XLSX.writeFile(wb, "JSCAR_Dados.xlsx");
}

window.delMov = async (id) => { if(confirm("Excluir?")) { await deleteMovimentacaoById(id); renderizarHistorico(); } };

// -------------------------------------------------------------
// 6. BACKUP E IMPORTAÇÃO
// -------------------------------------------------------------
function setupBackup() {
    const btnExp = document.getElementById('btn-exportar');
    const btnImp = document.getElementById('btn-importar-trigger');
    const inputImp = document.getElementById('input-importar');

    if(btnExp) {
        btnExp.onclick = async () => {
            const data = { v: await getAllVeiculos(), m: await getAllMovimentacoes() };
            const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `JSCAR_BACKUP_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
        };
    }

    if(btnImp) btnImp.onclick = () => inputImp.click();
    if(inputImp) {
        inputImp.onchange = (e) => {
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const data = JSON.parse(ev.target.result);
                if (data.v) for (let v of data.v) await saveVeiculo(v);
                if (data.m) for (let m of data.m) { delete m.id; await saveMovimentacao(m); }
                alert("Dados importados com sucesso!");
                window.location.reload();
            };
            reader.readAsText(e.target.files[0]);
        };
    }
}

// -------------------------------------------------------------
// 7. VISTORIA E HELPERS
// -------------------------------------------------------------
function setupAtualizacaoKm() {
    const form = document.getElementById('form-atualizacao-km');
    if(!form) return;
    form.onsubmit = async (e) => {
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
    if(!s) return;
    const vs = await getAllVeiculos();
    s.innerHTML = '<option value="">Selecione...</option>';
    vs.forEach(v => s.add(new Option(`${v.placa} - ${v.modelo}`, v.placa)));
}

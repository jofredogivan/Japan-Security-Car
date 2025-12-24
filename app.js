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

// 1. INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await openDB();
        setupNavigation();
        setupBackup();
        setupCadastroVeiculo();
        setupMovimentacaoForm(); 
        setupHistorico(); 
        setupAtualizacaoKm(); 
        await loadVeiculosList();
        
        // Ativa o botão flutuante
        const fab = document.getElementById('fab-action');
        if(fab) fab.onclick = () => document.querySelector('.nav-btn[data-target="movimentacao"]').click();
        
    } catch (err) {
        console.error("Erro ao iniciar sistema:", err);
    }
});

// 2. NAVEGAÇÃO
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
                if (targetId === 'dashboard' || targetId === 'cadastro-veiculo') loadVeiculosList();
                if (targetId === 'movimentacao') fillSelect('mov-placa');
                if (targetId === 'historico') fillSelect('filtro-veiculo');
                if (targetId === 'atualizacao-km') fillSelect('update-placa');
            }
        });
    });
}

// 3. MOVIMENTAÇÃO E ASSINATURA (CORRIGIDO)
function setupMovimentacaoForm() {
    const canvas = document.getElementById('signature-pad');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const form = document.getElementById('form-movimentacao');
    const selectPlaca = document.getElementById('mov-placa');
    const inputKm = document.getElementById('mov-km-atual');
    let drawing = false;

    // Ajuste de DPI e Tamanho do Canvas
    const resizeCanvas = () => {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        ctx.scale(ratio, ratio);
        ctx.strokeStyle = "#000000"; 
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
    };
    
    // Observer para disparar o resize quando a aba de movimentação abrir
    const observer = new MutationObserver(() => {
        if(!document.getElementById('movimentacao').classList.contains('hidden')) {
            setTimeout(resizeCanvas, 100);
        }
    });
    observer.observe(document.getElementById('movimentacao'), { attributes: true });

    // Lógica de desenho (Mouse e Touch)
    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const start = (e) => {
        drawing = true;
        const { x, y } = getPos(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
        if(e.type === 'touchstart') e.preventDefault();
    };

    const move = (e) => {
        if (!drawing) return;
        const { x, y } = getPos(e);
        ctx.lineTo(x, y);
        ctx.stroke();
        if(e.type === 'touchmove') e.preventDefault();
    };

    const stop = () => { drawing = false; };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', stop);

    document.getElementById('clear-signature').onclick = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        resizeCanvas();
    };

    // Atualiza KM ao selecionar placa
    selectPlaca.onchange = async () => {
        const v = await getVeiculoByPlaca(selectPlaca.value);
        if (v) inputKm.value = v.km_atual;
    };

    // SALVAR REGISTRO
    form.onsubmit = async (e) => {
        e.preventDefault();
        const placa = selectPlaca.value;
        const kmVal = inputKm.value ? parseInt(inputKm.value) : null;

        if (kmVal !== null) {
            const v = await getVeiculoByPlaca(placa);
            if (kmVal < v.km_atual) return alert("Erro: KM informado é menor que o atual!");
            
            let novaTroca = null;
            if ((kmVal - v.km_ultima_troca) >= 10000) {
                if (confirm("🚨 Troca de óleo vencida! Você trocou o óleo agora?")) {
                    novaTroca = kmVal;
                }
            }
            await updateVeiculoKm(placa, kmVal, novaTroca);
        }

        await saveMovimentacao({
            placa_veiculo: placa,
            motorista: document.getElementById('mov-motorista').value,
            tipo: document.getElementById('mov-tipo').value,
            data_hora: new Date(document.getElementById('mov-data-hora').value).toISOString(),
            km_atual: kmVal,
            assinatura: canvas.toDataURL(),
            checklist: Array.from(document.querySelectorAll('#mov-checklist-container input:checked')).map(i => i.parentElement.textContent.trim()),
            observacao: document.getElementById('mov-observacao').value
        });

        alert("Sucesso!");
        window.location.reload();
    };
}

// 4. HISTÓRICO E EXPORTAÇÃO
function setupHistorico() {
    document.getElementById('btn-buscar-auditoria').onclick = renderizarHistorico;
    document.getElementById('btn-export-pdf').onclick = gerarPDF;
    document.getElementById('btn-export-excel').onclick = gerarExcel;
}

async function renderizarHistorico() {
    const placa = document.getElementById('filtro-veiculo').value;
    const inicio = document.getElementById('filtro-data-inicio').value;
    const fim = document.getElementById('filtro-data-fim').value;
    const res = document.getElementById('resultados-auditoria');

    let movs = await getAllMovimentacoes();
    movs = movs.filter(m => {
        const d = m.data_hora.split('T')[0];
        let ok = true;
        if (placa && m.placa_veiculo !== placa) ok = false;
        if (inicio && d < inicio) ok = false;
        if (fim && d > fim) ok = false;
        return ok;
    }).sort((a,b) => new Date(b.data_hora) - new Date(a.data_hora));

    res.innerHTML = movs.map(m => `
        <div class="card" style="border-left: 5px solid ${m.tipo === 'saida' ? 'red' : 'green'};">
            <div style="display:flex; justify-content:space-between;">
                <b>${m.tipo.toUpperCase()} - ${m.placa_veiculo}</b>
                <button onclick="window.delMov(${m.id})" style="background:none; border:none; color:red; cursor:pointer;">X</button>
            </div>
            <p>Motorista: ${m.motorista} | KM: ${m.km_atual || '---'}</p>
            <small>${new Date(m.data_hora).toLocaleString('pt-BR')}</small>
        </div>
    `).join('');
}

window.delMov = async (id) => { if(confirm("Remover registro?")) { await deleteMovimentacaoById(id); renderizarHistorico(); } };

async function gerarPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const movs = await getAllMovimentacoes();
    doc.text("Relatório de Movimentação - JSCAR", 14, 15);
    const rows = movs.map(m => [new Date(m.data_hora).toLocaleString('pt-BR'), m.placa_veiculo, m.tipo, m.motorista, m.km_atual || '---']);
    doc.autoTable({ head: [['Data', 'Placa', 'Tipo', 'Motorista', 'KM']], body: rows, startY: 22 });
    doc.save("JSCAR_Relatorio.pdf");
}

async function gerarExcel() {
    const movs = await getAllMovimentacoes();
    const ws = XLSX.utils.json_to_sheet(movs);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados");
    XLSX.writeFile(wb, "JSCAR_Export.xlsx");
}

// 5. BACKUP, CADASTRO E VISTORIA
function setupBackup() {
    const btnExp = document.getElementById('btn-exportar');
    const btnImp = document.getElementById('btn-importar-trigger');
    const inputImp = document.getElementById('input-importar');

    btnExp.onclick = async () => {
        const data = { v: await getAllVeiculos(), m: await getAllMovimentacoes() };
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = "JSCAR_Backup.json";
        a.click();
    };

    btnImp.onclick = () => inputImp.click();
    inputImp.onchange = (e) => {
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const data = JSON.parse(ev.target.result);
            if (data.v) for (let v of data.v) await saveVeiculo(v);
            if (data.m) for (let m of data.m) { delete m.id; await saveMovimentacao(m); }
            alert("Backup Restaurado!"); window.location.reload();
        };
        reader.readAsText(e.target.files[0]);
    };
}

async function loadVeiculosList() {
    const vs = await getAllVeiculos();
    const dash = document.getElementById('movimentacoes-list');
    const cad = document.getElementById('delete-veiculo-list');
    if(!dash) return;
    dash.innerHTML = cad.innerHTML = vs.map(v => {
        const troca = (v.km_atual - v.km_ultima_troca) >= 10000;
        return `<div class="card" style="border-left:5px solid ${troca ? 'red' : 'green'};">
            <b>${v.placa}</b> - KM: ${v.km_atual.toLocaleString()}
            <p style="color:${troca ? 'red' : 'green'}; margin:0;">${troca ? '🚨 REVISÃO' : '✅ Óleo OK'}</p>
            <button onclick="window.delV('${v.placa}')" style="font-size:10px; margin-top:5px;">Excluir</button>
        </div>`;
    }).join('');
}

window.delV = async (p) => { if(confirm("Excluir?")) { await deleteVeiculo(p); loadVeiculosList(); } };

function setupCadastroVeiculo() {
    document.getElementById('form-cadastro-veiculo').onsubmit = async (e) => {
        e.preventDefault();
        const km = parseInt(document.getElementById('veiculo-km').value);
        await saveVeiculo({
            placa: document.getElementById('veiculo-placa').value.toUpperCase(),
            modelo: document.getElementById('veiculo-modelo').value,
            km_atual: km,
            km_ultima_troca: km
        });
        alert("Cadastrado!"); e.target.reset(); loadVeiculosList();
    };
}

function setupAtualizacaoKm() {
    document.getElementById('form-atualizacao-km').onsubmit = async (e) => {
        e.preventDefault();
        const p = document.getElementById('update-placa').value;
        const k = parseInt(document.getElementById('update-km-novo').value);
        await updateVeiculoKm(p, k, null);
        alert("KM Atualizado!"); e.target.reset();
    };
}

async function fillSelect(id) {
    const s = document.getElementById(id);
    const vs = await getAllVeiculos();
    if(!s) return;
    s.innerHTML = '<option value="">Selecione...</option>' + vs.map(v => `<option value="${v.placa}">${v.placa}</option>`).join('');
}

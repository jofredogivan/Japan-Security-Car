import { 
    saveVeiculo, getAllVeiculos, getVeiculoByPlaca, deleteVeiculo, 
    openDB, saveMovimentacao, updateVeiculoKm,
    deleteMovimentacaoById, getAllMovimentacoes 
} from './db.js';

// 1. INICIALIZAÇÃO DO SISTEMA
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

// 3. MOVIMENTAÇÃO E ASSINATURA
function setupMovimentacaoForm() {
    const canvas = document.getElementById('signature-pad');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const form = document.getElementById('form-movimentacao');
    let drawing = false;

    const resizeCanvas = () => {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        ctx.scale(ratio, ratio);
        ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.lineCap = "round";
    };
    
    const observer = new MutationObserver(() => {
        if(!document.getElementById('movimentacao').classList.contains('hidden')) {
            setTimeout(resizeCanvas, 200);
        }
    });
    observer.observe(document.getElementById('movimentacao'), { attributes: true });

    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        let clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const start = (e) => { drawing = true; const {x,y} = getPos(e); ctx.beginPath(); ctx.moveTo(x,y); if(e.cancelable) e.preventDefault(); };
    const move = (e) => { if(!drawing) return; const {x,y} = getPos(e); ctx.lineTo(x,y); ctx.stroke(); if(e.cancelable) e.preventDefault(); };
    const stop = () => drawing = false;

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', stop);

    document.getElementById('clear-signature').onclick = () => ctx.clearRect(0,0,canvas.width,canvas.height);

    form.onsubmit = async (e) => {
        e.preventDefault();
        const placa = document.getElementById('mov-placa').value;
        const kmVal = document.getElementById('mov-km-atual').value ? parseInt(document.getElementById('mov-km-atual').value) : null;
        const v = await getVeiculoByPlaca(placa);

        if (kmVal !== null) {
            if (kmVal < v.km_atual) return alert("Erro: KM informado é menor que o atual!");
            let novaTroca = null;
            if ((kmVal - v.km_ultima_troca) >= 10000) {
                if (confirm("🚨 Troca de óleo vencida! Você trocou o óleo agora?")) novaTroca = kmVal;
            }
            await updateVeiculoKm(placa, kmVal, novaTroca);
        }

        await saveMovimentacao({
            placa_veiculo: placa,
            modelo_veiculo: v.modelo || 'Sem Modelo',
            motorista: document.getElementById('mov-motorista').value,
            tipo: document.getElementById('mov-tipo').value,
            data_hora: new Date(document.getElementById('mov-data-hora').value).toISOString(),
            km_atual: kmVal,
            assinatura: canvas.toDataURL(),
            observacao: document.getElementById('mov-observacao').value
        });

        alert("Registro Salvo!"); window.location.reload();
    };
}

// 4. DASHBOARD
async function loadVeiculosList() {
    const vs = await getAllVeiculos();
    const dash = document.getElementById('movimentacoes-list');
    if(!dash) return;

    dash.innerHTML = vs.map(v => {
        const troca = (v.km_atual - v.km_ultima_troca) >= 10000;
        return `
        <div class="card" style="border-left:5px solid ${troca ? 'red' : 'green'};">
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <div>
                    <b style="font-size:1.2rem;">${v.placa}</b><br>
                    <span style="color:#aaa; font-size:0.9rem;">${v.modelo || 'Sem Modelo'}</span>
                </div>
                <button onclick="window.delV('${v.placa}')" class="btn-danger" style="margin:0; padding:5px 10px;">Excluir</button>
            </div>
            <div style="margin-top:10px;">
                <span>KM: ${v.km_atual.toLocaleString()}</span> | 
                <b style="color:${troca ? 'red' : 'green'};">${troca ? '🚨 REVISÃO' : '✅ ÓLEO OK'}</b>
            </div>
        </div>`;
    }).join('');
}

window.delV = async (p) => { if(confirm("Excluir Viatura?")) { await deleteVeiculo(p); loadVeiculosList(); } };

// 5. HISTÓRICO E PDF (PESQUISA POR DATA E HORA)
function setupHistorico() {
    const btnBusca = document.getElementById('btn-buscar-auditoria');
    const btnPdf = document.getElementById('btn-export-pdf');
    const btnExcel = document.getElementById('btn-export-excel');

    if(btnBusca) btnBusca.onclick = renderizarHistorico;
    if(btnPdf) btnPdf.onclick = gerarPDF;
    if(btnExcel) btnExcel.onclick = gerarExcel;
}

async function renderizarHistorico() {
    const placa = document.getElementById('filtro-veiculo').value;
    const inicioRaw = document.getElementById('filtro-data-inicio').value;
    const fimRaw = document.getElementById('filtro-data-fim').value;
    const res = document.getElementById('resultados-auditoria');

    let movs = await getAllMovimentacoes();
    
    const dataInicio = inicioRaw ? new Date(inicioRaw) : null;
    const dataFim = fimRaw ? new Date(fimRaw) : null;

    movs = movs.filter(m => {
        const dataMov = new Date(m.data_hora);
        if (placa && m.placa_veiculo !== placa) return false;
        if (dataInicio && dataMov < dataInicio) return false;
        if (dataFim && dataMov > dataFim) return false;
        return true;
    }).sort((a,b) => new Date(b.data_hora) - new Date(a.data_hora));

    res.innerHTML = movs.map(m => `
        <div class="card" style="border-left: 5px solid ${m.tipo === 'saida' ? '#f44336' : '#4caf50'}">
            <b>${m.tipo.toUpperCase()} - ${m.placa_veiculo}</b><br>
            <small>${new Date(m.data_hora).toLocaleString('pt-BR')}</small><br>
            <span>Motorista: ${m.motorista} | KM: ${m.km_atual || '---'}</span>
            <button onclick="window.delMov(${m.id})" style="background:none; border:none; color:red; float:right; cursor:pointer;">Apagar</button>
        </div>
    `).join('');
}

async function gerarPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let movs = await getAllMovimentacoes();
    
    const inicioRaw = document.getElementById('filtro-data-inicio').value;
    const fimRaw = document.getElementById('filtro-data-fim').value;
    const placaFiltro = document.getElementById('filtro-veiculo').value;

    const dataInicio = inicioRaw ? new Date(inicioRaw) : null;
    const dataFim = fimRaw ? new Date(fimRaw) : null;

    // Filtro cronológico para o PDF
    movs = movs.filter(m => {
        const dataMov = new Date(m.data_hora);
        if (placaFiltro && m.placa_veiculo !== placaFiltro) return false;
        if (dataInicio && dataMov < dataInicio) return false;
        if (dataFim && dataMov > dataFim) return false;
        return true;
    }).sort((a,b) => new Date(a.data_hora) - new Date(b.data_hora));

    const textoPeriodo = dataInicio ? dataInicio.toLocaleString('pt-BR') : new Date().toLocaleDateString('pt-BR');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(`Relatório de Movimentação - ${textoPeriodo}`, 105, 20, { align: "center" });

    let yPos = 35;
    const veiculosUnicos = [...new Set(movs.map(m => m.placa_veiculo))];

    veiculosUnicos.forEach(placa => {
        const movsVeiculo = movs.filter(m => m.placa_veiculo === placa);
        const modelo = movsVeiculo[0].modelo_veiculo || "---";

        if (yPos > 240) { doc.addPage(); yPos = 20; }

        // Desenha a Moldura da Viatura (Igual à sua imagem)
        doc.setDrawColor(0);
        doc.rect(14, yPos, 182, 10); 
        doc.setFontSize(12);
        doc.text(`Viatura: ${placa} - ${modelo}`, 18, yPos + 7);
        yPos += 10;

        const rows = movsVeiculo.map(m => [
            m.tipo.toUpperCase(),
            new Date(m.data_hora).toLocaleTimeString('pt-BR'),
            m.motorista,
            m.km_atual || "---"
        ]);

        doc.autoTable({
            startY: yPos,
            head: [['Tipo', 'Hora', 'Motorista', 'KM']],
            body: rows,
            theme: 'grid',
            headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: 0.1 },
            styles: { fontSize: 10, cellPadding: 3 },
            margin: { left: 14, right: 14 }
        });

        yPos = doc.lastAutoTable.finalY + 15;
    });

    doc.save(`Relatorio_JSCAR_${new Date().getTime()}.pdf`);
}

async function gerarExcel() {
    const movs = await getAllMovimentacoes();
    const ws = XLSX.utils.json_to_sheet(movs);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados");
    XLSX.writeFile(wb, "Relatorio_JSCAR.xlsx");
}

window.delMov = async (id) => { if(confirm("Remover registro?")) { await deleteMovimentacaoById(id); renderizarHistorico(); } };

// 6. AUXILIARES E BACKUP
async function fillSelect(id) {
    const s = document.getElementById(id);
    const vs = await getAllVeiculos();
    if(s) s.innerHTML = '<option value="">Selecione...</option>' + vs.map(v => `<option value="${v.placa}">${v.placa} - ${v.modelo}</option>`).join('');
}

function setupCadastroVeiculo() {
    const form = document.getElementById('form-cadastro-veiculo');
    if(form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const km = parseInt(document.getElementById('veiculo-km').value);
            await saveVeiculo({
                placa: document.getElementById('veiculo-placa').value.toUpperCase(),
                modelo: document.getElementById('veiculo-modelo').value,
                km_atual: km,
                km_ultima_troca: km
            });
            alert("Viatura cadastrada!"); e.target.reset(); loadVeiculosList();
        };
    }
}

function setupAtualizacaoKm() {
    const form = document.getElementById('form-atualizacao-km');
    if(form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const p = document.getElementById('update-placa').value;
            const k = parseInt(document.getElementById('update-km-novo').value);
            await updateVeiculoKm(p, k, null);
            alert("KM Atualizado!"); e.target.reset(); loadVeiculosList();
        };
    }
}

function setupBackup() {
    const btnExp = document.getElementById('btn-exportar');
    const btnImpTrigger = document.getElementById('btn-importar-trigger');
    const inputImp = document.getElementById('input-importar');

    if(btnExp) btnExp.onclick = async () => {
        const data = { v: await getAllVeiculos(), m: await getAllMovimentacoes() };
        const blob = new Blob([JSON.stringify(data)], {type:'application/json'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download="jscar_backup.json"; a.click();
    };

    if(btnImpTrigger) btnImpTrigger.onclick = () => inputImp.click();
    if(inputImp) inputImp.onchange = (e) => {
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (data.v) for (let v of data.v) await saveVeiculo(v);
                if (data.m) for (let m of data.m) { delete m.id; await saveMovimentacao(m); }
                alert("Backup Restaurado!"); window.location.reload();
            } catch (err) { alert("Erro ao importar arquivo."); }
        };
        reader.readAsText(e.target.files[0]);
    };
}

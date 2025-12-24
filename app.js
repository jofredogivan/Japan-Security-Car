import { 
    saveVeiculo, 
    getAllVeiculos, 
    getVeiculoByPlaca, 
    deleteVeiculo, 
    openDB, 
    saveMovimentacao, 
    updateVeiculoKm, 
    getAllMovimentacoes 
} from './db.js';

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await openDB();
        await loadVeiculosList();
        setupNavigation();
        setupCadastroVeiculo();
        setupMovimentacaoForm(); 
        setupHistorico(); 
        setupAtualizacaoKm();
        setupBackup();
    } catch (err) {
        console.error("Erro ao iniciar sistema:", err);
    }

    const fab = document.getElementById('fab-action');
    if(fab) fab.onclick = () => document.querySelector('[data-target="movimentacao"]').click();
});

// --- NAVEGAÇÃO ENTRE ABAS ---
function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const pages = document.querySelectorAll('.page');

    navButtons.forEach(btn => {
        btn.onclick = (e) => {
            const target = e.currentTarget.getAttribute('data-target');
            navButtons.forEach(b => b.classList.remove('active'));
            pages.forEach(p => p.classList.add('hidden'));
            
            e.currentTarget.classList.add('active');
            document.getElementById(target).classList.remove('hidden');

            if (target === 'dashboard') loadVeiculosList();
            if (target === 'movimentacao') fillSelect('mov-placa');
            if (target === 'historico') fillSelect('filtro-veiculo');
            if (target === 'atualizacao-km') fillSelect('update-placa');
        };
    });
}

// --- DASHBOARD: LISTA DE VIATURAS ---
async function loadVeiculosList() {
    const vs = await getAllVeiculos();
    const dash = document.getElementById('movimentacoes-list');
    const cadList = document.getElementById('delete-veiculo-list');
    
    if(dash) dash.innerHTML = '';
    if(cadList) cadList.innerHTML = '';
    
    vs.forEach(v => {
        const kmRodado = v.km_atual - (v.km_ultima_troca || v.km_atual);
        const alerta = kmRodado >= 10000;
        
        const card = `
            <div class="card" style="border-left: 6px solid ${alerta ? '#f44336' : '#4caf50'};">
                <h3 style="margin:0; color:#FF0000;">${v.placa}</h3>
                <p style="margin:5px 0;">KM Atual: <strong>${v.km_atual.toLocaleString()}</strong></p>
                <p style="font-size:12px; color:${alerta ? '#f44336' : '#4caf50'}; font-weight:bold;">
                    ${alerta ? '🚨 ATENÇÃO: TROCA DE ÓLEO VENCIDA' : '✅ STATUS: ÓLEO EM DIA'}
                </p>
                ${!document.getElementById('cadastro-veiculo').classList.contains('hidden') ? 
                `<button onclick="window.delV('${v.placa}')" class="btn-danger" style="margin-top:10px; padding:5px 10px;">Excluir</button>` : ''}
            </div>`;
            
        if(dash) dash.insertAdjacentHTML('beforeend', card);
        if(cadList && !document.getElementById('cadastro-veiculo').classList.contains('hidden')) {
            cadList.insertAdjacentHTML('beforeend', card);
        }
    });
}

window.delV = async (p) => {
    if(confirm(`Excluir viatura ${p}?`)) {
        await deleteVeiculo(p);
        loadVeiculosList();
    }
};

// --- FORMULÁRIO DE MOVIMENTAÇÃO (SAÍDA/ENTRADA) ---
function setupMovimentacaoForm() {
    const canvas = document.getElementById('signature-pad');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const select = document.getElementById('mov-placa');
    const inputKm = document.getElementById('mov-km-atual');
    let drawing = false;

    // AUTO-PREENCHIMENTO AO SELECIONAR VEÍCULO
    select.onchange = async () => {
        const v = await getVeiculoByPlaca(select.value);
        if(v) inputKm.value = v.km_atual;
    };

    // Lógica da Assinatura
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
        if(e.touches) e.preventDefault();
    };
    canvas.onmouseup = canvas.ontouchend = () => drawing = false;
    document.getElementById('clear-signature').onclick = () => ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Salvar Movimentação
    document.getElementById('form-movimentacao').onsubmit = async (e) => {
        e.preventDefault();
        const kmVal = inputKm.value ? parseInt(inputKm.value) : null;
        
        // Captura o checklist personalizado
        const checklist = Array.from(document.querySelectorAll('#mov-checklist-container input:checked'))
            .map(i => i.parentElement.textContent.trim());

        // Se informou KM, atualiza o cadastro do carro
        if(kmVal) await updateVeiculoKm(select.value, kmVal, null);

        await saveMovimentacao({
            placa_veiculo: select.value,
            motorista: document.getElementById('mov-motorista').value,
            tipo: document.getElementById('mov-tipo').value,
            data_hora: document.getElementById('mov-data-hora').value,
            km_atual: kmVal,
            checklist: checklist,
            assinatura: canvas.toDataURL(),
            observacao: document.getElementById('mov-observacao').value
        });

        alert("Registro Salvo!");
        e.target.reset();
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
        const p = document.getElementById('update-placa').value;
        const k = parseInt(document.getElementById('update-km-novo').value);
        const t = document.getElementById('update-troca-oleo').checked;

        await updateVeiculoKm(p, k, t ? k : null);
        alert("Vistoria/Troca de Óleo registrada!");
        e.target.reset();
        loadVeiculosList();
    };
}

// --- BACKUP E RESTAURAÇÃO (CORRIGIDO) ---
function setupBackup() {
    // Exportar
    document.getElementById('btn-exportar').onclick = async () => {
        const data = { 
            v: await getAllVeiculos(), 
            m: await getAllMovimentacoes(),
            exportado_em: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Backup_JSCar_${new Date().toLocaleDateString()}.json`;
        a.click();
    };

    // Importar
    const inputImp = document.getElementById('input-importar');
    document.getElementById('btn-importar-trigger').onclick = () => inputImp.click();
    
    inputImp.onchange = (e) => {
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if(data.v) for(let v of data.v) await saveVeiculo(v);
                if(data.m) {
                    for(let m of data.m) { 
                        delete m.id; // Deixa o banco gerar novos IDs para evitar conflito
                        await saveMovimentacao(m); 
                    }
                }
                alert("Dados restaurados com sucesso!");
                window.location.reload(); // Recarrega para mostrar tudo novo
            } catch (err) {
                alert("Erro ao ler arquivo de backup.");
            }
        };
        reader.readAsText(e.target.files[0]);
    };
}

// --- RELATÓRIOS E PDF ---
function setupHistorico() {
    document.getElementById('btn-buscar-auditoria').onclick = async () => {
        const ini = document.getElementById('filtro-data-inicio').value;
        const fim = document.getElementById('filtro-data-fim').value;
        const res = document.getElementById('resultados-auditoria');
        let movs = await getAllMovimentacoes();

        if(ini) movs = movs.filter(m => m.data_hora >= ini);
        if(fim) movs = movs.filter(m => m.data_hora <= fim);

        movs.sort((a,b) => new Date(b.data_hora) - new Date(a.data_hora));
        res.innerHTML = movs.map(m => `
            <div class="card">
                <strong>${m.tipo.toUpperCase()}</strong> - ${m.placa_veiculo}<br>
                <small>${new Date(m.data_hora).toLocaleString()} - Mot: ${m.motorista}</small>
            </div>`).join('');
    };

    document.getElementById('btn-gerar-pdf').onclick = async () => {
        const movs = await getAllMovimentacoes();
        // Lógica de agrupamento por viatura para o PDF
        const agrupado = {};
        movs.forEach(m => {
            if(!agrupado[m.placa_veiculo]) agrupado[m.placa_veiculo] = [];
            agrupado[m.placa_veiculo].push(m);
        });
        
        let rel = "<h2>Relatório de Plantão JSCar</h2>";
        for(let p in agrupado) {
            rel += `<h3>Viatura: ${p}</h3><ul>` + 
                   agrupado[p].map(m => `<li>${m.data_hora} - ${m.tipo} - ${m.motorista}</li>`).join('') + 
                   `</ul>`;
        }
        const win = window.open('', '_blank');
        win.document.write(rel); win.print();
    };
}

// --- AUXILIARES ---
async function fillSelect(id) {
    const s = document.getElementById(id);
    const vs = await getAllVeiculos();
    s.innerHTML = '<option value="">Selecione...</option>' + 
                  vs.map(v => `<option value="${v.placa}">${v.placa} - ${v.modelo}</option>`).join('');
}

function setupCadastroVeiculo() {
    const form = document.getElementById('form-cadastro-veiculo');
    if(!form) return;
    form.onsubmit = async (e) => {
        e.preventDefault();
        const km = parseInt(document.getElementById('veiculo-km').value);
        await saveVeiculo({
            placa: document.getElementById('veiculo-placa').value.toUpperCase(),
            modelo: document.getElementById('veiculo-modelo').value,
            km_atual: km,
            km_ultima_troca: km
        });
        alert("Veículo Cadastrado!");
        e.target.reset();
        loadVeiculosList();
    };
}

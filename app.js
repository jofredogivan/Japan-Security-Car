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

// --- INICIALIZAÇÃO DO SISTEMA ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await openDB();
        console.log("JSCAR: Ligação ao banco de dados estabelecida.");
        
        // Configurações iniciais
        setupNavigation();
        setupBackup();
        setupCadastroVeiculo();
        setupMovimentacaoForm(); 
        setupAtualizacaoKm();
        setupRelatorios();
        
        // Carregamento inicial da frota
        await loadVeiculosList();

        // Botão flutuante (FAB) para abrir movimentação rápida
        const fab = document.getElementById('fab-action');
        if(fab) {
            fab.onclick = () => {
                const btnMov = document.querySelector('[data-target="movimentacao"]');
                if(btnMov) btnMov.click();
            };
        }
    } catch (err) {
        console.error("Erro ao iniciar a aplicação:", err);
    }
});

// --- SISTEMA DE NAVEGAÇÃO ENTRE ABAS ---
function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const pages = document.querySelectorAll('.page');

    navButtons.forEach(btn => {
        btn.onclick = (e) => {
            const target = e.currentTarget.getAttribute('data-target');
            
            // Alternar classes de visibilidade
            navButtons.forEach(b => b.classList.remove('active'));
            pages.forEach(p => p.classList.add('hidden'));
            
            e.currentTarget.classList.add('active');
            const targetPage = document.getElementById(target);
            if(targetPage) targetPage.classList.remove('hidden');

            // Atualizar dados conforme a aba aberta
            if (target === 'dashboard') loadVeiculosList();
            if (target === 'movimentacao') fillSelect('mov-placa');
            if (target === 'atualizacao-km') fillSelect('update-placa');
            if (target === 'cadastro-veiculo') loadVeiculosList();
        };
    });
}

// --- GESTÃO DE FROTA (DASHBOARD) ---
async function loadVeiculosList() {
    const vs = await getAllVeiculos();
    const dash = document.getElementById('movimentacoes-list');
    const cadList = document.getElementById('delete-veiculo-list');
    
    if(dash) dash.innerHTML = '';
    if(cadList) cadList.innerHTML = '';
    
    vs.forEach(v => {
        const kmRodado = v.km_atual - (v.km_ultima_troca || v.km_atual);
        const alertaTroca = kmRodado >= 10000;
        
        const cardHTML = `
            <div class="card" style="border-left: 6px solid ${alertaTroca ? '#f44336' : '#4caf50'};">
                <h3 style="margin:0; color:#FF0000;">${v.placa}</h3>
                <p>Modelo: ${v.modelo}</p>
                <p>KM Atual: <strong>${v.km_atual.toLocaleString()}</strong></p>
                <p style="color:${alertaTroca ? '#f44336' : '#4caf50'}; font-weight:bold;">
                    ${alertaTroca ? '🚨 ALERTA: TROCA DE ÓLEO VENCIDA' : '✅ STATUS: ÓLEO OK'}
                </p>
                <button onclick="window.confirmDelete('${v.placa}')" class="btn" style="background:#555; color:white; padding:5px; font-size:11px; width:auto; margin-top:10px;">Remover</button>
            </div>`;
            
        if(dash) dash.insertAdjacentHTML('beforeend', cardHTML);
        if(cadList) cadList.insertAdjacentHTML('beforeend', cardHTML);
    });
}

// Função global para deletar (necessária para botões inline)
window.confirmDelete = async (placa) => {
    if(confirm(`Deseja remover a viatura ${placa} do sistema?`)) {
        await deleteVeiculo(placa);
        loadVeiculosList();
    }
};

// --- FORMULÁRIO DE MOVIMENTAÇÃO E ASSINATURA ---
function setupMovimentacaoForm() {
    const canvas = document.getElementById('signature-pad');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const select = document.getElementById('mov-placa');
    const inputKm = document.getElementById('mov-km-atual');

    // Auto-preenchimento do KM ao selecionar viatura
    select.onchange = async () => {
        const v = await getVeiculoByPlaca(select.value);
        if(v) inputKm.value = v.km_atual;
    };

    // Lógica da Assinatura (Touch e Mouse)
    let isDrawing = false;
    const startPos = (e) => { isDrawing = true; ctx.beginPath(); };
    const draw = (e) => {
        if(!isDrawing) return;
        const rect = canvas.getBoundingClientRect();
        const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
        const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
        ctx.lineTo(x, y);
        ctx.stroke();
        if(e.touches) e.preventDefault();
    };
    
    canvas.addEventListener('mousedown', startPos);
    canvas.addEventListener('touchstart', startPos);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('touchmove', draw);
    window.addEventListener('mouseup', () => isDrawing = false);
    window.addEventListener('touchend', () => isDrawing = false);

    document.getElementById('clear-signature').onclick = () => ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Submissão do Formulário
    document.getElementById('form-movimentacao').onsubmit = async (e) => {
        e.preventDefault();
        const placa = select.value;
        const km = parseInt(inputKm.value);
        const checklist = Array.from(document.querySelectorAll('#mov-checklist-container input:checked'))
                               .map(i => i.parentElement.textContent.trim());

        // Atualiza o KM da viatura e salva a movimentação
        await updateVeiculoKm(placa, km, null);
        await saveMovimentacao({
            placa_veiculo: placa,
            motorista: document.getElementById('mov-motorista').value,
            tipo: document.getElementById('mov-tipo').value,
            data_hora: document.getElementById('mov-data-hora').value,
            km_atual: km,
            checklist: checklist,
            assinatura: canvas.toDataURL(),
            observacao: document.getElementById('mov-observacao').value
        });

        alert("Movimentação registada com sucesso!");
        window.location.reload();
    };
}

// --- SISTEMA DE BACKUP (EXPORTAÇÃO E IMPORTAÇÃO) ---
function setupBackup() {
    const btnExp = document.getElementById('btn-exportar');
    const btnImpTrigger = document.getElementById('btn-importar-trigger');
    const inputImp = document.getElementById('input-importar');

    // Exportar para JSON
    if(btnExp) {
        btnExp.onclick = async () => {
            const data = {
                veiculos: await getAllVeiculos(),
                movimentacoes: await getAllMovimentacoes(),
                timestamp: new Date().toISOString()
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `JSCAR_BACKUP_${new Date().toISOString().split('T')[0]}.json`;
            link.click();
        };
    }

    // Importar de JSON
    if(btnImpTrigger) btnImpTrigger.onclick = () => inputImp.click();

    if(inputImp) {
        inputImp.onchange = (e) => {
            const file = e.target.files[0];
            if(!file) return;

            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    // Importar Veículos
                    if(data.veiculos) {
                        for(let v of data.veiculos) await saveVeiculo(v);
                    }
                    // Importar Movimentações (ID deve ser novo para evitar conflitos)
                    if(data.movimentacoes) {
                        for(let m of data.movimentacoes) {
                            delete m.id; 
                            await saveMovimentacao(m);
                        }
                    }
                    alert("Dados restaurados com sucesso!");
                    window.location.reload();
                } catch (err) {
                    alert("Erro ao processar o arquivo de backup.");
                }
            };
            reader.readAsText(file);
        };
    }
}

// --- VISTORIA E TROCA DE ÓLEO ---
function setupAtualizacaoKm() {
    const form = document.getElementById('form-atualizacao-km');
    if(!form) return;
    
    form.onsubmit = async (e) => {
        e.preventDefault();
        const placa = document.getElementById('update-placa').value;
        const km = parseInt(document.getElementById('update-km-novo').value);
        const trocouOleo = document.getElementById('update-troca-oleo').checked;

        await updateVeiculoKm(placa, km, trocouOleo ? km : null);
        alert("Vistoria atualizada com sucesso!");
        window.location.reload();
    };
}

// --- RELATÓRIOS (HISTÓRICO) ---
async function setupRelatorios() {
    const res = document.getElementById('resultados-auditoria');
    if(!res) return;
    
    // Carrega o histórico automaticamente ao clicar na aba
    document.querySelector('[data-target="historico"]').onclick = async () => {
        const movs = await getAllMovimentacoes();
        // Ordenar do mais recente para o mais antigo
        movs.sort((a,b) => new Date(b.data_hora) - new Date(a.data_hora));
        
        res.innerHTML = movs.map(m => `
            <div class="card" style="font-size: 13px;">
                <b style="color:red;">${m.tipo.toUpperCase()}</b> - ${m.placa_veiculo}<br>
                <span>Condutor: ${m.motorista}</span><br>
                <span>KM: ${m.km_atual} | Data: ${new Date(m.data_hora).toLocaleString()}</span>
            </div>`).join('');
    };
}

// --- GESTÃO DE CADASTRO ---
function setupCadastroVeiculo() {
    const form = document.getElementById('form-cadastro-veiculo');
    if(!form) return;
    
    form.onsubmit = async (e) => {
        e.preventDefault();
        const kmVal = parseInt(document.getElementById('veiculo-km').value);
        await saveVeiculo({
            placa: document.getElementById('veiculo-placa').value.toUpperCase(),
            modelo: document.getElementById('veiculo-modelo').value,
            km_atual: kmVal,
            km_ultima_troca: kmVal
        });
        alert("Viatura registada com sucesso!");
        e.target.reset();
        loadVeiculosList();
    };
}

// --- FUNÇÃO AUXILIAR PARA PREENCHER SELECTS ---
async function fillSelect(id) {
    const select = document.getElementById(id);
    if(!select) return;
    const veiculos = await getAllVeiculos();
    select.innerHTML = '<option value="">Selecione a Viatura...</option>' + 
                      veiculos.map(v => `<option value="${v.placa}">${v.placa} - ${v.modelo}</option>`).join('');
}

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
        
        // Carregamento inicial de dados
        await loadVeiculosList();
        
        // Configuração de componentes
        setupNavigation();
        setupCadastroVeiculo();
        setupMovimentacaoForm(); 
        setupHistorico(); 
        setupAtualizacaoKm();
        
    } catch (err) {
        console.error("JSCar: Erro na inicialização:", err);
    }

    // Botão flutuante de atalho
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

            // Atualização de dados conforme a aba aberta
            if (target === 'dashboard') loadVeiculosList();
            if (target === 'movimentacao') fillSelect('mov-placa');
            if (target === 'historico') fillSelect('filtro-veiculo');
            if (target === 'atualizacao-km') fillSelect('update-placa');
        };
    });
}

// --- DASHBOARD (HOME) E LISTAGEM ---
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
            <div class="card" style="border-left: 6px solid ${corStatus}; margin-bottom: 15px; padding: 15px; background: #1E1E1E; border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <h3 style="margin: 0; color: #FF0000;">${v.placa}</h3>
                        <small style="color: #AAA;">${v.modelo}</small>
                    </div>
                </div>
                <p style="margin: 10px 0 5px 0;">KM Atual: <strong>${v.km_atual.toLocaleString('pt-BR')}</strong></p>
                <p style="color: ${corStatus}; font-weight: bold; font-size: 13px; margin: 0;">
                    ${precisaTroca ? '🚨 MANUTENÇÃO: TROCA DE ÓLEO VENCIDA' : '✅ STATUS: ÓLEO OK'}
                </p>
                ${!document.getElementById('cadastro-veiculo').classList.contains('hidden') ? 
                    `<button onclick="window.delV('${v.placa}')" class="btn-danger" style="margin-top:10px; padding: 5px 10px; width: auto;">Excluir Viatura</button>` : ''}
            </div>`;
            
        if(dash) dash.insertAdjacentHTML('beforeend', cardHtml);
        if(cadList && !document.getElementById('cadastro-veiculo').classList.contains('hidden')) {
            cadList.insertAdjacentHTML('beforeend', cardHtml);
        }
    });
}

window.delV = async (placa) => {
    if(confirm(`Deseja realmente excluir a viatura ${placa}?`)) {
        await deleteVeiculo(placa);
        loadVeiculosList();
    }
};

// --- REGISTRO DE MOVIMENTAÇÃO (SAÍDA/ENTRADA) ---
function setupMovimentacaoForm() {
    const canvas = document.getElementById('signature-pad');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    let drawing = false;

    // Ajuste de DPI para assinatura
    const resizeCanvas = () => {
        const ratio = window.devicePixelRatio || 1;
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        ctx.scale(ratio, ratio);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Eventos de desenho
    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    canvas.onmousedown = canvas.ontouchstart = (e) => {
        drawing = true;
        ctx.beginPath();
        const { x, y } = getPos(e);
        ctx.moveTo(x, y);
        if(e.type === 'touchstart') e.preventDefault();
    };

    canvas.onmousemove = canvas.ontouchmove = (e) => {
        if (!drawing) return;
        const { x, y } = getPos(e);
        ctx.lineTo(x, y);
        ctx.stroke();
        if(e.type === 'touchmove') e.preventDefault();
    };

    canvas.onmouseup = canvas.ontouchend = () => drawing = false;

    document.getElementById('clear-signature').onclick = () => ctx.clearRect(0, 0, canvas.width, canvas.height);

    document.getElementById('form-movimentacao').onsubmit = async (e) => {
        e.preventDefault();
        const placa = document.getElementById('mov-placa').value;
        const kmInput = document.getElementById('mov-km-atual').value;
        const km = kmInput ? parseInt(kmInput) : null;

        if (km) {
            const v = await getVeiculoByPlaca(placa);
            if (km < v.km_atual) {
                alert("Erro: O KM informado não pode ser menor que o atual!");
                return;
            }
            await updateVeiculoKm(placa, km, null);
        }

        const dados = {
            placa_veiculo: placa,
            motorista: document.getElementById('mov-motorista').value,
            tipo: document.getElementById('mov-tipo').value,
            data_hora: document.getElementById('mov-data-hora').value,
            km_atual: km,
            assinatura: canvas.toDataURL(),
            checklist: Array.from(document.querySelectorAll('#mov-checklist-container input:checked')).map(i => i.parentElement.textContent.trim()),
            observacao: document.getElementById('mov-observacao').value
        };

        await saveMovimentacao(dados);
        alert("Movimentação registrada com sucesso!");
        e.target.reset();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        document.querySelector('[data-target="dashboard"]').click();
    };
}

// --- VISTORIA NOTURNA E TROCA DE ÓLEO ---
function setupAtualizacaoKm() {
    const form = document.getElementById('form-atualizacao-km');
    if(!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const placa = document.getElementById('update-placa').value;
        const novoKm = parseInt(document.getElementById('update-km-novo').value);
        const trocouOleo = document.getElementById('update-troca-oleo').checked;

        const v = await getVeiculoByPlaca(placa);
        if (novoKm < v.km_atual) {
            alert("Erro: KM informado é menor que o KM registrado no sistema.");
            return;
        }

        // Se marcou a troca, o campo km_ultima_troca recebe o novoKm
        await updateVeiculoKm(placa, novoKm, trocouOleo ? novoKm : null);
        
        alert(trocouOleo ? "KM e Manutenção de Óleo atualizados!" : "KM de Vistoria atualizado!");
        e.target.reset();
        loadVeiculosList();
    };
}

// --- HISTÓRICO E RELATÓRIO PDF POR PLANTÃO ---
function setupHistorico() {
    const btnBusca = document.getElementById('btn-buscar-auditoria');
    const btnPdf = document.getElementById('btn-gerar-pdf');

    if(btnBusca) btnBusca.onclick = renderizarHistorico;
    if(btnPdf) btnPdf.onclick = gerarRelatorioPDF;
}

async function renderizarHistorico() {
    const inicio = document.getElementById('filtro-data-inicio').value;
    const fim = document.getElementById('filtro-data-fim').value;
    const placaFiltro = document.getElementById('filtro-veiculo').value;
    const resultados = document.getElementById('resultados-auditoria');

    let registros = await getAllMovimentacoes();

    // Filtro por período exato (Data e Hora)
    if (inicio) registros = registros.filter(r => r.data_hora >= inicio);
    if (fim) registros = registros.filter(r => r.data_hora <= fim);
    if (placaFiltro) registros = registros.filter(r => r.placa_veiculo === placaFiltro);

    // Ordenação Decrescente (Mais recentes primeiro na tela)
    registros.sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora));

    resultados.innerHTML = registros.length === 0 ? '<p class="card">Nenhum registro encontrado para este período.</p>' : '';

    registros.forEach(r => {
        const cor = r.tipo === 'saida' ? '#F44336' : '#4CAF50';
        resultados.insertAdjacentHTML('beforeend', `
            <div class="card" style="border-left: 5px solid ${cor};">
                <div style="display:flex; justify-content:space-between;">
                    <strong>${r.tipo.toUpperCase()} - ${r.placa_veiculo}</strong>
                    <button class="btn-danger" onclick="window.delMov(${r.id})" style="padding:2px 8px; width:auto; font-size:12px;">X</button>
                </div>
                <p style="margin: 5px 0;">Motorista: ${r.motorista} | KM: ${r.km_atual || '---'}</p>
                <small>${new Date(r.data_hora).toLocaleString('pt-BR')}</small>
            </div>
        `);
    });
}

window.delMov = async (id) => {
    if(confirm("Deseja excluir este registro do histórico?")) {
        await deleteMovimentacaoById(id);
        renderizarHistorico();
    }
};

async function gerarRelatorioPDF() {
    const inicio = document.getElementById('filtro-data-inicio').value;
    const fim = document.getElementById('filtro-data-fim').value;

    if (!inicio || !fim) {
        alert("Por favor, selecione o Início e o Fim do plantão para gerar o PDF.");
        return;
    }

    const todosRegistros = await getAllMovimentacoes();
    const veiculos = await getAllVeiculos();
    const vMap = new Map(veiculos.map(v => [v.placa, v.modelo]));

    // Filtra pelo período do plantão
    const registrosPlantao = todosRegistros.filter(r => r.data_hora >= inicio && r.data_hora <= fim);

    if (registrosPlantao.length === 0) {
        alert("Não há movimentações registradas neste intervalo de tempo.");
        return;
    }

    // AGRUPAMENTO POR VIATURA
    const agrupado = {};
    registrosPlantao.forEach(r => {
        if (!agrupado[r.placa_veiculo]) agrupado[r.placa_veiculo] = [];
        agrupado[r.placa_veiculo].push(r);
    });

    let htmlPdf = `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h1 style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px;">Relatório de Plantão - JSCar</h1>
            <p style="text-align: center;"><strong>Período:</strong> ${new Date(inicio).toLocaleString()} até ${new Date(fim).toLocaleString()}</p>
    `;

    for (const placa in agrupado) {
        // Ordena cronologicamente dentro do grupo do carro
        agrupado[placa].sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));

        htmlPdf += `
            <div style="margin-top: 30px; border: 1px solid #ccc; padding: 10px; page-break-inside: avoid;">
                <h3 style="background: #eee; padding: 8px; margin-top: 0;">Viatura: ${placa} - ${vMap.get(placa) || 'Modelo não identificado'}</h3>
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                    <thead>
                        <tr style="border-bottom: 1px solid #000; text-align: left; background: #f9f9f9;">
                            <th style="padding: 8px;">Tipo</th>
                            <th style="padding: 8px;">Data/Hora</th>
                            <th style="padding: 8px;">Motorista</th>
                            <th style="padding: 8px;">KM</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        agrupado[placa].forEach(m => {
            htmlPdf += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 8px;"><strong>${m.tipo.toUpperCase()}</strong></td>
                    <td style="padding: 8px;">${new Date(m.data_hora).toLocaleString('pt-BR')}</td>
                    <td style="padding: 8px;">${m.motorista}</td>
                    <td style="padding: 8px;">${m.km_atual || '---'}</td>
                </tr>
            `;
        });

        htmlPdf += `</tbody></table></div>`;
    }

    htmlPdf += `</div>`;

    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>Relatorio_Plantao_JSCar</title></head><body>${htmlPdf}</body></html>`);
    win.document.close();
    
    setTimeout(() => {
        win.print();
        win.close();
    }, 500);
}

// --- HELPERS ---
async function fillSelect(id) {
    const select = document.getElementById(id);
    if(!select) return;
    const vs = await getAllVeiculos();
    
    // Mantém a primeira opção padrão
    const primeiraOpcao = select.options[0]?.text || "Selecione a Viatura";
    select.innerHTML = `<option value="">${primeiraOpcao}</option>`;
    
    vs.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.placa;
        opt.textContent = `${v.placa} - ${v.modelo}`;
        select.appendChild(opt);
    });
}

function setupCadastroVeiculo() {
    const form = document.getElementById('form-cadastro-veiculo');
    if(!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const placa = document.getElementById('veiculo-placa').value.toUpperCase().trim();
        const modelo = document.getElementById('veiculo-modelo').value.trim();
        const km = parseInt(document.getElementById('veiculo-km').value);

        await saveVeiculo({
            placa,
            modelo,
            km_atual: km,
            km_ultima_troca: km // Inicia a contagem de óleo do zero
        });

        alert("Veículo cadastrado na frota com sucesso!");
        e.target.reset();
        loadVeiculosList();
    };
}

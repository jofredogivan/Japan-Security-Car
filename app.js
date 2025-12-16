// app.js (Código completo, finalizado, com todas as correções e edições)

import { 
    saveVeiculo, 
    getAllVeiculos, 
    getVeiculoByPlaca, 
    deleteVeiculo, 
    openDB, 
    saveMovimentacao, 
    updateVeiculoKm,
    deleteMovimentacaoById,
    getAllMovimentacoes,
    editMovimentacao 
} from './db.js';

let lastSearchResult = []; 

// -------------------------------------------------------------
// REGISTRO DO SERVICE WORKER (PWA OFFLINE)
// -------------------------------------------------------------
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // CORREÇÃO: Certificando-se de que o caminho é relativo à raiz
        navigator.serviceWorker.register('./sw.js') 
            .then((registration) => {
                console.log('ServiceWorker registrado com sucesso: ', registration.scope);
            })
            .catch((err) => {
                console.log('Falha no registro do ServiceWorker: ', err);
            });
    });
}
// -------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicializa o IndexedDB na carga da página
    openDB()
        .then(() => console.log('IndexedDB pronto e aberto!'))
        .catch(err => console.error('Falha ao abrir o DB:', err));

    // 2. Lógica de Navegação (Mudança de Telas)
    setupNavigation();

    // 3. Lógica do Formulário de Cadastro de Veículo
    setupCadastroVeiculo();

    // 4. Carrega a lista de veículos (usada no Dashboard e na tela de Cadastro para exclusão/edição)
    loadVeiculosList();
    
    // 5. Carrega as opções de veículos no formulário de movimentação
    loadVeiculosForMovimentacao(); 
    
    // 6. Lógica do formulário de Movimentação (incluindo assinatura)
    setupMovimentacaoForm(); 
    
    // 7. Lógica da Tela de Histórico e Auditoria
    setupHistorico(); 
    
    // 8. Lógica da tela de Atualização de KM Noturna
    setupAtualizacaoKm(); 

    // 9. Botão Flutuante (FAB) para ir para a Movimentação
    document.getElementById('fab-action').addEventListener('click', () => {
        document.querySelector('.nav-btn[data-target="movimentacao"]').click(); 
    });
});

// --- NAVEGAÇÃO ---
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
                
                // Recarrega dados relevantes ao mudar de tela
                if (targetId === 'dashboard' || targetId === 'cadastro-veiculo') { 
                    loadVeiculosList(); 
                } else if (targetId === 'movimentacao') {
                    loadVeiculosForMovimentacao();
                } else if (targetId === 'historico') {
                    loadVeiculosForHistorico(); 
                    setupPesquisaKmRapida(); 
                } else if (targetId === 'atualizacao-km') { 
                    loadVeiculosForKmUpdate(); 
                }
            }
        });
    });
}

// --- CADASTRO DE VEÍCULO ---
function setupCadastroVeiculo() {
    const form = document.getElementById('form-cadastro-veiculo');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const placa = document.getElementById('veiculo-placa').value.toUpperCase().trim();
        const modelo = document.getElementById('veiculo-modelo').value.trim();
        const kmAtual = parseInt(document.getElementById('veiculo-km').value, 10);

        if (!placa || !modelo || isNaN(kmAtual) || kmAtual < 0) {
            alert('Por favor, preencha todos os campos corretamente.');
            return;
        }

        const novoVeiculo = {
            placa: placa,
            modelo: modelo,
            km_atual: kmAtual,
            km_ultima_troca: kmAtual 
        };

        try {
            await saveVeiculo(novoVeiculo);
            alert(`Viatura PLACA: ${placa} salva com sucesso!`);
            form.reset();
            
            // AÇÃO CHAVE: Recarrega as listas e navega para o Dashboard
            loadVeiculosList(); 
            document.querySelector('.nav-btn[data-target="dashboard"]').click();
            
        } catch (error) {
            console.error('Erro ao salvar veículo:', error);
            alert('Erro ao salvar viatura. Verifique se a placa já existe ou se há outro erro de DB.');
        }
    });
}

// --- DASHBOARD/CADASTRO: EXIBIÇÃO DE VEÍCULOS E ALERTA DE ÓLEO (E BOTÃO DE EXCLUSÃO/EDIÇÃO) ---
async function loadVeiculosList() {
    const veiculos = await getAllVeiculos();
    
    const dashboardListElement = document.getElementById('movimentacoes-list');
    const deleteListElement = document.getElementById('delete-veiculo-list');
    
    // Verifica se estamos na página de Cadastro de Veículo (onde o botão Excluir/Editar deve aparecer)
    const isCadastroPage = !document.getElementById('cadastro-veiculo').classList.contains('hidden');

    // Limpa ambas as listas no início
    dashboardListElement.innerHTML = ''; 
    deleteListElement.innerHTML = ''; 

    if (veiculos.length === 0) {
        const msg = '<div class="card card-placeholder">Nenhuma viatura cadastrada.</div>';
        dashboardListElement.innerHTML = msg;
        deleteListElement.innerHTML = msg;
        return;
    }
    
    // 1. Renderiza os cards
    veiculos.forEach(v => {
        const kmRodadoAposTroca = v.km_atual - v.km_ultima_troca;
        const precisaTrocar = kmRodadoAposTroca >= 10000;
        
        const corAlerta = precisaTrocar ? 'var(--color-primary-solid)' : 'var(--color-success)'; 
        
        const cardHTML = `
            <div class="card veiculo-card" id="veiculo-card-${v.placa}" style="border-left-color: ${corAlerta};">
                <h3 style="display: flex; justify-content: space-between; align-items: center;">
                    PLACA: ${v.placa}
                    ${isCadastroPage ? 
                        // Adiciona botão de Edição e Exclusão na tela de Cadastro
                        `<div style="display: flex; gap: 5px;">
                            <button class="btn edit-veiculo-btn" data-placa="${v.placa}" style="width: auto; padding: 5px 10px; margin: 0; font-size: 12px; background-color: #3f51b5;"><i class="fas fa-edit"></i> Editar</button>
                            <button class="btn btn-danger delete-veiculo-btn" data-placa="${v.placa}" style="width: auto; padding: 5px 10px; margin: 0; font-size: 12px;"><i class="fas fa-trash"></i> Excluir</button>
                         </div>` 
                        : ''}
                </h3>
                <p>Modelo: <strong>${v.modelo}</strong></p>
                <p>KM Atual: <strong>${v.km_atual.toLocaleString('pt-BR')}</strong></p>
                <p style="color: ${corAlerta}; font-size: 14px; font-weight: bold;">
                    Status Óleo: ${precisaTrocar ? '🚨 TROCA NECESSÁRIA!' : `OK (Próx. KM: ${(v.km_ultima_troca + 10000).toLocaleString('pt-BR')})`}
                </p>
            </div>
        `;
        
        // Renderiza no Dashboard OU na Lista de Gestão (Cadastro)
        if (isCadastroPage) {
            deleteListElement.insertAdjacentHTML('beforeend', cardHTML);
        } else {
            dashboardListElement.insertAdjacentHTML('beforeend', cardHTML);
        }
    });
    
    // 2. Lógica Específica para a Tela de Cadastro (Adiciona listeners de gestão)
    if (isCadastroPage) {
        // Listener de Exclusão
        deleteListElement.querySelectorAll('.delete-veiculo-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const placa = e.target.getAttribute('data-placa');
                if (confirm(`Tem certeza que deseja EXCLUIR o veículo ${placa} e todo seu histórico? Esta ação é irreversível!`)) {
                    try {
                        await deleteVeiculo(placa); 
                        alert(`Veículo ${placa} excluído com sucesso.`);
                        // Recarrega todas as listas
                        loadVeiculosList(); 
                        loadVeiculosForMovimentacao(); 
                        loadVeiculosForHistorico(); 
                        loadVeiculosForKmUpdate(); 
                    } catch (error) {
                        alert('Erro ao excluir veículo.');
                        console.error('Erro ao excluir veículo:', error);
                    }
                }
            });
        });
        
        // Listener de Edição de Veículo
        deleteListElement.querySelectorAll('.edit-veiculo-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const placa = e.target.getAttribute('data-placa');
                const veiculo = veiculos.find(v => v.placa === placa);
                if (veiculo) {
                    renderEditVeiculoForm(veiculo);
                }
            });
        });
    }
}

// --- NOVO: FUNÇÃO PARA RENDERIZAR O FORM DE EDIÇÃO DE VEÍCULO ---
async function renderEditVeiculoForm(veiculo) {
    const card = document.getElementById(`veiculo-card-${veiculo.placa}`);
    if (!card) return;
    
    // Renderiza o formulário no lugar do card
    const formHtml = `
        <div class="card" style="border-left: 5px solid #3f51b5; padding: 15px; margin-top: 10px;">
            <h4>Editando Viatura: ${veiculo.placa}</h4>
            <form id="form-edit-veiculo-${veiculo.placa}" class="edit-form-veiculo">
                <p style="font-size: 12px; color: #888;">* Placa não pode ser alterada.</p>
                
                <label for="edit-modelo-${veiculo.placa}">Modelo/Descrição:</label>
                <input type="text" id="edit-modelo-${veiculo.placa}" value="${veiculo.modelo}" required>

                <label for="edit-km-atual-${veiculo.placa}">KM Atual:</label>
                <input type="number" id="edit-km-atual-${veiculo.placa}" value="${veiculo.km_atual}" min="0" required>
                
                <label for="edit-km-ultima-troca-${veiculo.placa}">KM Última Troca (Resetar Óleo):</label>
                <input type="number" id="edit-km-ultima-troca-${veiculo.placa}" value="${veiculo.km_ultima_troca}" min="0" required>

                <button type="submit" class="btn btn-primary" style="margin-top: 10px; background-color: #3f51b5;"><i class="fas fa-save"></i> Salvar Edição</button>
                <button type="button" class="btn btn-secondary cancel-edit-veiculo-btn" data-placa="${veiculo.placa}" style="margin-top: 5px;"><i class="fas fa-times"></i> Cancelar</button>
            </form>
        </div>
    `;

    card.innerHTML = formHtml; // Substitui o conteúdo

    // Lógica para salvar a edição
    document.getElementById(`form-edit-veiculo-${veiculo.placa}`).addEventListener('submit', async (e) => {
        e.preventDefault();

        const novoModelo = document.getElementById(`edit-modelo-${veiculo.placa}`).value;
        const novoKmAtual = parseInt(document.getElementById(`edit-km-atual-${veiculo.placa}`).value, 10);
        const novoKmUltimaTroca = parseInt(document.getElementById(`edit-km-ultima-troca-${veiculo.placa}`).value, 10);
        
        if (isNaN(novoKmAtual) || isNaN(novoKmUltimaTroca) || novoKmAtual < 0 || novoKmUltimaTroca < 0) {
            alert('KM inválido. O KM deve ser um número positivo.');
            return;
        }

        const veiculoEditado = {
            placa: veiculo.placa,
            modelo: novoModelo,
            km_atual: novoKmAtual,
            km_ultima_troca: novoKmUltimaTroca,
        };

        try {
            await saveVeiculo(veiculoEditado); // Reutiliza a função saveVeiculo (que usa put/atualiza)
            alert(`Viatura ${veiculo.placa} editada com sucesso.`);
            loadVeiculosList(); // Recarrega a lista
        } catch (error) {
            console.error('Erro ao editar veículo:', error);
            alert('Erro ao editar veículo. Verifique se o KM da Última Troca não é maior que o KM Atual.');
        }
    });

    // Lógica para cancelar a edição
    document.querySelector(`#form-edit-veiculo-${veiculo.placa} .cancel-edit-veiculo-btn`).addEventListener('click', () => {
        loadVeiculosList(); // Recarrega a lista para mostrar o card original
    });
}


// --- MOVIMENTAÇÃO: CARREGAR VEÍCULOS NO SELECT ---
async function loadVeiculosForMovimentacao() {
    const select = document.getElementById('mov-placa');
    const veiculos = await getAllVeiculos();

    while (select.options.length > 1) {
        select.remove(1);
    }

    veiculos.forEach(v => {
        const option = document.createElement('option');
        option.value = v.placa;
        option.textContent = `${v.placa} - ${v.modelo} (KM: ${v.km_atual.toLocaleString('pt-BR')})`;
        select.appendChild(option);
    });
}

// --- MOVIMENTAÇÃO: CONFIGURAÇÃO DO FORMULÁRIO E ASSINATURA ---
function setupMovimentacaoForm() {
    const form = document.getElementById('form-movimentacao');
    const canvas = document.getElementById('signature-pad');
    const clearButton = document.getElementById('clear-signature');
    const ctx = canvas.getContext('2d');
    let drawing = false;

    const selectPlacaMov = document.getElementById('mov-placa');
    const kmInputMov = document.getElementById('mov-km-atual');

    // ⭐ CORREÇÃO 1: Cor da caneta para BRANCO PURO (#FFFFFF) para garantir visibilidade no modo escuro.
    ctx.strokeStyle = '#FFFFFF'; 
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // -------------------------------------------------------------

    // -------------------------------------------------------------
    // OTIMIZAÇÃO E REDIMENSIONAMENTO DO CANVAS (DPR)
    // -------------------------------------------------------------
    function resizeCanvas() {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        
        ctx.scale(ratio, ratio);
        
        // Limpa a tela
        ctx.clearRect(0, 0, canvas.width, canvas.height); 
    }
    
    // Inicializa e monitora o redimensionamento
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas(); // Chama no início para configurar o tamanho e limpar a tela
    
    // -------------------------------------------------------------
    // Lógica de Preencher o KM
    // -------------------------------------------------------------
    selectPlacaMov.addEventListener('change', async (e) => {
        const placa = e.target.value;
        kmInputMov.value = ''; 

        if (placa) {
            const veiculo = await getVeiculoByPlaca(placa);
            if (veiculo) {
                // Define o KM MÍNIMO
                kmInputMov.setAttribute('min', veiculo.km_atual);
                
                if (document.getElementById('mov-tipo').value === 'saida') {
                    kmInputMov.value = veiculo.km_atual;
                }
            }
        }
    });
    
    document.getElementById('mov-tipo').addEventListener('change', async (e) => {
        const tipo = e.target.value;
        const placa = selectPlacaMov.value;
        kmInputMov.value = '';

        if (placa) {
            const veiculo = await getVeiculoByPlaca(placa);
            if (veiculo) {
                kmInputMov.setAttribute('min', veiculo.km_atual);
                if (tipo === 'saida') {
                    kmInputMov.value = veiculo.km_atual;
                }
            }
        }
    });

    // -------------------------------------------------------------
    // Lógica de Desenho (Touch e Mouse)
    // -------------------------------------------------------------
    function getCursorPosition(e) {
        const rect = canvas.getBoundingClientRect();
        let x, y;

        if (e.touches && e.touches.length > 0) {
            x = e.touches[0].clientX - rect.left;
            y = e.touches[0].clientY - rect.top;
        } else {
            x = e.clientX - rect.left;
            y = e.clientY - rect.top;
        }
        return { x, y };
    }

    function startPosition(e) { 
        e.preventDefault(); 
        drawing = true; 
        const { x, y } = getCursorPosition(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
    }
    
    function endPosition() { 
        drawing = false; 
    }
    
    function draw(e) {
        if (!drawing) return;
        e.preventDefault(); 
        
        const { x, y } = getCursorPosition(e);
        
        ctx.lineTo(x, y);
        ctx.stroke();
    }

    canvas.addEventListener('mousedown', startPosition);
    canvas.addEventListener('mouseup', endPosition);
    canvas.addEventListener('mousemove', draw);
    
    // Eventos Touch: com passive: false para impedir rolagem da página ao assinar
    canvas.addEventListener('touchstart', startPosition, { passive: false });
    canvas.addEventListener('touchend', endPosition, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    
    // Botão Limpar
    clearButton.addEventListener('click', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        resizeCanvas(); 
    });

    // --- SALVAR MOVIMENTAÇÃO (com Lógica de KM e Alerta) ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const placa = selectPlacaMov.value;
        const motorista = document.getElementById('mov-motorista').value;
        const tipo = document.getElementById('mov-tipo').value;
        const dataHora = document.getElementById('mov-data-hora').value; 
        const observacao = document.getElementById('mov-observacao').value;
        const kmAtualMovimentacao = parseInt(kmInputMov.value, 10);
        
        // ⭐ CORREÇÃO: KM é opcional na entrada, a validação é que os campos básicos estejam preenchidos. ⭐
        if (!placa || !motorista || !dataHora) {
             alert('Por favor, preencha a placa, motorista e data/hora.');
             return;
        }

        const checklistItems = document.querySelectorAll('#mov-checklist-container input[type="checkbox"]:checked'); 
        const checklist = Array.from(checklistItems).map(item => item.parentElement.querySelector('label').textContent); 

        const assinaturaDataUrl = canvas.toDataURL('image/png');
        
        const dataHoraISO = new Date(dataHora).toISOString();
        
        // Verifica se o KM é válido para ser registrado (só na ENTRADA)
        const kmValidoParaEntrada = (tipo === 'entrada' && !isNaN(kmAtualMovimentacao) && kmAtualMovimentacao > 0);

        const novaMovimentacao = {
            placa_veiculo: placa,
            motorista: motorista,
            tipo: tipo,
            data_hora: dataHoraISO, 
            checklist: checklist,
            observacao: observacao,
            assinatura: assinaturaDataUrl, 
            // Só registra o KM se for um número válido (> 0) e se for entrada
            km_atual: kmValidoParaEntrada ? kmAtualMovimentacao : null 
        };

        try {
            // ⭐ NOVO FLUXO: SÓ ATUALIZA O KM DO VEÍCULO SE UM KM VÁLIDO FOI INFORMADO! ⭐
            if (kmValidoParaEntrada) {
                const veiculo = await getVeiculoByPlaca(placa);
                
                if (novaMovimentacao.km_atual < veiculo.km_atual) {
                    alert('ERRO: O KM atual inserido é menor que o KM registrado anteriormente. Por favor, corrija ou use a função "KM Vistoria".');
                    return;
                }
                
                const kmRodado = novaMovimentacao.km_atual - veiculo.km_ultima_troca;

                if (kmRodado >= 10000) {
                    const confirmarTroca = confirm(`🚨 ALERTA: Esta viatura rodou ${kmRodado.toLocaleString('pt-BR')} km desde a última troca de óleo.
                    
                    KM ATUAL: ${novaMovimentacao.km_atual.toLocaleString('pt-BR')}
                    
                    A troca de óleo foi realizada agora? (Clique em OK se sim, Cancelar se a troca não foi feita)`);

                    if (confirmarTroca) {
                        // Passa o novo KM como KM da última troca (reseta o contador)
                        await updateVeiculoKm(placa, novaMovimentacao.km_atual, novaMovimentacao.km_atual);
                    } else {
                        // Mantém o KM da última troca anterior
                        await updateVeiculoKm(placa, novaMovimentacao.km_atual, null); 
                    }
                } else {
                    // Atualiza apenas o KM atual
                    await updateVeiculoKm(placa, novaMovimentacao.km_atual, null); 
                }
            }
            
            await saveMovimentacao(novaMovimentacao);
            alert(`Movimentação de ${tipo.toUpperCase()} da placa ${placa} registrada com sucesso!`);
            
            form.reset();
            ctx.clearRect(0, 0, canvas.width, canvas.height); 
            resizeCanvas(); 
            kmInputMov.value = ''; 
            
            loadVeiculosList(); // Atualiza dashboard
            document.querySelector('.nav-btn[data-target="dashboard"]').click(); 

        } catch (error) {
            console.error('Erro ao salvar movimentação:', error);
            alert(`Erro ao salvar movimentação: ${error.message || 'Consulte o console.'}`);
        }
    });
}

// --- HISTÓRICO: Carregar Veículos para Pesquisa ---
async function loadVeiculosForHistorico() {
    const veiculos = await getAllVeiculos();
    
    const selectKM = document.getElementById('select-veiculos-km');
    const selectFiltro = document.getElementById('filtro-veiculo');
    
    [selectKM, selectFiltro].forEach(select => {
        while (select.options.length > 1) {
            select.remove(1);
        }
    });

    veiculos.forEach(v => {
        const option = document.createElement('option');
        option.value = v.placa;
        option.textContent = `${v.placa} - ${v.modelo}`;
        
        selectKM.appendChild(option.cloneNode(true)); 
        selectFiltro.appendChild(option); 
    });
}

// --- HISTÓRICO: Pesquisa de KM Rápida ---
function setupPesquisaKmRapida() {
    const selectKM = document.getElementById('select-veiculos-km');
    const infoDiv = document.getElementById('veiculo-km-info');

    selectKM.addEventListener('change', async (e) => {
        const placa = e.target.value;
        infoDiv.innerHTML = '';
        
        if (!placa) {
            infoDiv.innerHTML = 'Selecione um veículo acima.';
            return;
        }

        try {
            const veiculo = await getVeiculoByPlaca(placa);
            if (veiculo) {
                const kmRodadoAposTroca = veiculo.km_atual - veiculo.km_ultima_troca;
                const precisaTrocar = kmRodadoAposTroca >= 10000; 
                
                const corAlerta = precisaTrocar ? 'var(--color-primary-solid)' : 'var(--color-success)';

                infoDiv.innerHTML = `
                    <p><strong>KM Atual:</strong> ${veiculo.km_atual.toLocaleString('pt-BR')}</p>
                    <p><strong>KM Última Troca:</strong> ${veiculo.km_ultima_troca.toLocaleString('pt-BR')}</p>
                    <p style="color: ${corAlerta};"><strong>Status Óleo:</strong> ${precisaTrocar ? '🚨 TROCA NECESSÁRIA!' : 'OK'}</p>
                `;
            }
        } catch (error) {
            infoDiv.innerHTML = `<p style="color: var(--color-primary-solid);">Erro ao buscar informações.</p>`;
            console.error('Erro na pesquisa rápida de KM:', error);
        }
    });
}

// --- HISTÓRICO: Lógica de Auditoria e Edição/Exclusão (AGORA INCLUI MODELO) ---
// Função auxiliar para obter o início do dia local
function getStartOfTodayLocal(dateStr) {
    const date = dateStr ? new Date(dateStr) : new Date();
    // Zera hora, minuto, segundo e milissegundo no fuso horário local
    date.setHours(0, 0, 0, 0); 
    return date.getTime(); // Retorna o timestamp em ms
}

async function buscarMovimentacoesAuditoria() {
    const placaFiltro = document.getElementById('filtro-veiculo').value;
    const dataInicioStr = document.getElementById('filtro-data-inicio').value;
    const dataFimStr = document.getElementById('filtro-data-fim').value;
    const resultadosDiv = document.getElementById('resultados-auditoria');
    
    resultadosDiv.innerHTML = '<div class="card card-placeholder">Buscando...</div>';

    let movimentacoes = await getAllMovimentacoes();
    
    // ⭐ NOVO PASSO: BUSCAR TODOS OS VEÍCULOS PARA PEGAR O MODELO ⭐
    const veiculos = await getAllVeiculos();
    const veiculosMap = new Map(veiculos.map(v => [v.placa, v.modelo])); // Mapeia Placa -> Modelo

    // 1. Filtrar
    movimentacoes = movimentacoes.filter(mov => {
        let passaFiltro = true;
        // O timestamp da movimentação é criado em UTC, mas a comparação deve ser justa.
        const dataMovTime = new Date(mov.data_hora).getTime();
        
        if (placaFiltro && mov.placa_veiculo !== placaFiltro) {
            passaFiltro = false;
        }
        
        // ⭐ CORREÇÃO 2: Filtro de Data Início (Meia-noite local)
        if (dataInicioStr) {
            // Obtém o timestamp da meia-noite do dia inicial (local)
            const dataInicioTime = getStartOfTodayLocal(dataInicioStr);
            if (dataMovTime < dataInicioTime) passaFiltro = false;
        }

        // ⭐ CORREÇÃO 3: Filtro de Data Fim (Meia-noite do dia seguinte)
        if (dataFimStr) {
            // Pega a data de Fim e avança 1 dia no fuso local, depois pega a meia-noite.
            // Isso garante que todos os registros do dia 16 (00:00:00 até 23:59:59) sejam incluídos.
            const dataFim = new Date(dataFimStr);
            dataFim.setDate(dataFim.getDate() + 1); // Avança um dia
            const dataFimTime = getStartOfTodayLocal(dataFim.toISOString().substring(0, 10)); // Meia-noite do dia seguinte

            if (dataMovTime >= dataFimTime) passaFiltro = false;
        }
        // O código anterior estava comparando a data Mov (UTC) com a dataFim (UTC), o que causava o erro
        // se o fuso horário fosse negativo. Agora está tudo baseado na meia-noite local.
        

        return passaFiltro;
    });

    // 2. Ordenar por data
    movimentacoes.sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));
    
    lastSearchResult = movimentacoes;

    // 3. Renderizar resultados
    resultadosDiv.innerHTML = '';
    
    if (movimentacoes.length === 0) {
        resultadosDiv.innerHTML = '<div class="card card-placeholder">Nenhuma movimentação encontrada com os filtros.</div>';
        return;
    }
    
    movimentacoes.forEach(mov => {
        const isSaida = mov.tipo === 'saida';
        const card = document.createElement('div');
        card.classList.add('card');
        card.id = `mov-card-${mov.id}`; // Adiciona ID para facilitar a substituição/edição
        
        // Cor do card baseada no tipo de movimentação
        card.style.borderLeftColor = isSaida ? 'var(--color-primary-solid)' : 'var(--color-success)'; 
        
        const dataLocal = new Date(mov.data_hora).toLocaleString('pt-BR'); 
        
        // ⭐ NOVO: OBTÉM o modelo do mapa ⭐
        const modelo = veiculosMap.get(mov.placa_veiculo) || 'Modelo N/D';

        card.innerHTML = `
            <h3 style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: ${isSaida ? 'var(--color-primary-solid)' : 'var(--color-success)'};">
                    ${isSaida ? 'SAÍDA' : 'ENTRADA'} - ${mov.placa_veiculo}
                </span>
                <div style="display: flex; gap: 5px;">
                    <button class="btn edit-mov-btn" data-id="${mov.id}" style="width: auto; padding: 5px 10px; margin: 0; background-color: #3f51b5; font-size: 12px;"><i class="fas fa-edit"></i> Editar</button>
                    <button class="btn delete-mov-btn" data-id="${mov.id}" style="width: auto; padding: 5px 10px; margin: 0; background-color: #8B0000; font-size: 12px;"><i class="fas fa-trash"></i> Excluir</button>
                </div>
            </h3>
            <p style="font-size: 10px; color: #888;">ID: ${mov.id}</p>
            
            <p><strong>Viatura:</strong> ${mov.placa_veiculo} - ${modelo}</p>
            
            <p><strong>Motorista:</strong> ${mov.motorista}</p>
            <p><strong>Data/Hora:</strong> ${dataLocal}</p>
            ${mov.km_atual ? `<p><strong>KM:</strong> ${mov.km_atual.toLocaleString('pt-BR')}</p>` : ''}
            <p><strong>Checklist:</strong> ${mov.checklist.join(', ') || 'Nenhum item marcado'}</p>
            <p><strong>Obs:</strong> ${mov.observacao || 'Nenhuma'}</p>
            <details style="margin-top: 10px; color: var(--color-secondary-solid);">
                <summary>Visualizar Assinatura</summary>
                <img src="${mov.assinatura}" alt="Assinatura Digital" style="max-width: 100%; height: auto; background: white; margin-top: 5px; border-radius: 5px; border: 1px solid #ddd;">
            </details>
        `;
        resultadosDiv.appendChild(card);
    });

    // Adicionar listener de exclusão
    resultadosDiv.querySelectorAll('.delete-mov-btn').forEach(button => {
        button.addEventListener('click', async (e) => {
            const id = parseInt(e.target.getAttribute('data-id'), 10);
            if (confirm(`Tem certeza que deseja EXCLUIR o registro de movimentação ID: ${id}? O KM do veículo será recalculado.`)) {
                await deleteMovimentacao(id); 
            }
        });
    });
    
    // Adicionar listener de edição
    resultadosDiv.querySelectorAll('.edit-mov-btn').forEach(button => {
        button.addEventListener('click', async (e) => {
            const id = parseInt(e.target.getAttribute('data-id'), 10);
            // Procura o registro na lista filtrada atualmente
            const registro = lastSearchResult.find(mov => mov.id === id); 
            if (registro) {
                renderEditForm(registro);
            }
        });
    });
}

// --- NOVO: FUNÇÃO PARA RENDERIZAR O FORM DE EDIÇÃO DO HISTÓRICO ---
async function renderEditForm(registro) {
    const card = document.getElementById(`mov-card-${registro.id}`);
    if (!card) return;

    // Converte a data_hora ISO para o formato local do input datetime-local
    const dataHoraLocal = registro.data_hora ? new Date(registro.data_hora).toISOString().substring(0, 16) : '';

    const isEntrada = registro.tipo === 'entrada';

    const formHtml = `
        <div class="card" style="border-left: 5px solid #3f51b5; padding: 15px; margin-top: 10px;">
            <h4>Editando Registro ID: ${registro.id} (${registro.placa_veiculo})</h4>
            <form id="form-edit-mov-${registro.id}" class="edit-form-mov">
                <label for="edit-motorista-${registro.id}">Motorista:</label>
                <input type="text" id="edit-motorista-${registro.id}" value="${registro.motorista}" required>

                <label for="edit-data-hora-${registro.id}">Data e Hora:</label>
                <input type="datetime-local" id="edit-data-hora-${registro.id}" value="${dataHoraLocal}" required>
                
                ${isEntrada ? `
                    <label for="edit-km-atual-${registro.id}">KM Atual (Entrada):</label>
                    <input type="number" id="edit-km-atual-${registro.id}" value="${registro.km_atual || ''}" min="0" placeholder="Obrigatório para Entrada">
                ` : ''}

                <label for="edit-observacao-${registro.id}">Observações:</label>
                <textarea id="edit-observacao-${registro.id}" rows="3">${registro.observacao || ''}</textarea>

                <button type="submit" class="btn btn-primary" style="margin-top: 10px; background-color: #3f51b5;"><i class="fas fa-save"></i> Salvar Edição</button>
                <button type="button" class="btn btn-secondary cancel-edit-btn" data-id="${registro.id}" style="margin-top: 5px;"><i class="fas fa-times"></i> Cancelar</button>
            </form>
        </div>
    `;

    card.innerHTML = formHtml; // Substitui o conteúdo do card pelo formulário de edição

    // Lógica para salvar a edição
    document.getElementById(`form-edit-mov-${registro.id}`).addEventListener('submit', async (e) => {
        e.preventDefault();

        let novoKm = null;
        if (isEntrada) {
            const kmValue = document.getElementById(`edit-km-atual-${registro.id}`).value;
            novoKm = kmValue ? parseInt(kmValue, 10) : null;
            
            // Validação básica para KM na entrada (continua no DB.js)
            if (novoKm !== null && novoKm < 0) {
                alert('O KM Atual não pode ser negativo.');
                return;
            }
        }
        
        const motoristaEdit = document.getElementById(`edit-motorista-${registro.id}`).value;
        const dataHoraEdit = document.getElementById(`edit-data-hora-${registro.id}`).value;
        const observacaoEdit = document.getElementById(`edit-observacao-${registro.id}`).value;

        if (!motoristaEdit || !dataHoraEdit) {
            alert('Motorista e Data/Hora são campos obrigatórios.');
            return;
        }

        const dadosEditados = {
            id: registro.id,
            motorista: motoristaEdit,
            data_hora: new Date(dataHoraEdit).toISOString(), // Converte para ISO
            km_atual: novoKm,
            observacao: observacaoEdit
        };

        try {
            await editMovimentacao(dadosEditados); // Função do db.js que lida com o recálculo
            alert('Registro atualizado com sucesso. O KM do veículo foi recalculado.');
            card.innerHTML = ''; // Limpa o formulário
            buscarMovimentacoesAuditoria(); // Recarrega os resultados
            loadVeiculosList(); // Atualiza dashboard
        } catch (error) {
            alert(`Erro ao salvar edição: ${error.message}`);
            console.error('Erro ao editar movimentação:', error);
        }
    });

    // Lógica para cancelar a edição
    document.querySelector(`#form-edit-mov-${registro.id} .cancel-edit-btn`).addEventListener('click', () => {
        buscarMovimentacoesAuditoria(); // Recarrega os resultados para mostrar o card original
    });
}

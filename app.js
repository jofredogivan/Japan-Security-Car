// app.js (Código completo, finalizado, com importações, agrupamento de PDF e exclusão de veículos ativa)

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

let lastSearchResult = []; 

// -------------------------------------------------------------
// REGISTRO DO SERVICE WORKER (PWA OFFLINE)
// -------------------------------------------------------------
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
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

    // 4. Carrega a lista de veículos (usada no Dashboard e na tela de Cadastro para exclusão)
    loadVeiculosList();
    
    // 5. Carrega as opções de veículos no formulário de movimentação
    loadVeiculosForMovimentacao(); 
    
    // 6. Lógica do formulário de Movimentação (incluindo assinatura)
    setupMovimentacaoForm(); 
    
    // 7. Lógica da Tela de Histórico e Auditoria
    setupHistorico(); 
    
    // 8. Botão Flutuante (FAB) para ir para a Movimentação
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
                
                // Recarrega a lista para mostrar/ocultar o botão de excluir
                if (targetId === 'dashboard' || targetId === 'cadastro-veiculo') { 
                    loadVeiculosList(); 
                } else if (targetId === 'movimentacao') {
                    loadVeiculosForMovimentacao();
                } else if (targetId === 'historico') {
                    loadVeiculosForHistorico(); 
                    setupPesquisaKmRapida(); 
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

        if (!placa || !modelo || isNaN(kmAtual)) {
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
            loadVeiculosList(); 
        } catch (error) {
            console.error('Erro ao salvar veículo:', error);
            alert('Erro ao salvar viatura. Verifique se a placa já existe.');
        }
    });
}

// --- DASHBOARD/CADASTRO: EXIBIÇÃO DE VEÍCULOS E ALERTA DE ÓLEO (E BOTÃO DE EXCLUSÃO) ---
async function loadVeiculosList() {
    const veiculos = await getAllVeiculos();
    
    const listElement = document.getElementById('movimentacoes-list');
    
    // Verifica se o elemento 'cadastro-veiculo' é a página atualmente visível (não tem a classe 'hidden')
    const isCadastroPage = !document.getElementById('cadastro-veiculo').classList.contains('hidden');

    listElement.innerHTML = ''; 

    if (veiculos.length === 0) {
        listElement.innerHTML = '<div class="card card-placeholder">Nenhuma viatura cadastrada.</div>';
        return;
    }
    
    veiculos.forEach(v => {
        const kmRodadoAposTroca = v.km_atual - v.km_ultima_troca;
        const precisaTrocar = kmRodadoAposTroca >= 10000;
        const corAlerta = precisaTrocar ? 'var(--color-primary)' : 'green'; 
        
        const card = document.createElement('div');
        card.classList.add('card');
        card.style.borderLeftColor = corAlerta; 
        
        card.innerHTML = `
            <h3 style="display: flex; justify-content: space-between; align-items: center;">
                PLACA: ${v.placa}
                ${isCadastroPage ? 
                    `<button class="btn btn-secondary delete-veiculo-btn" data-placa="${v.placa}" style="width: auto; padding: 5px 10px; margin: 0; background-color: #8B0000;">Excluir</button>` 
                    : ''}
            </h3>
            <p>Modelo: ${v.modelo}</p>
            <p>KM Atual: <strong>${v.km_atual.toLocaleString('pt-BR')}</strong></p>
            <p style="color: ${corAlerta}; font-size: 14px; font-weight: bold;">
                Status Óleo: ${precisaTrocar ? '🚨 TROCA NECESSÁRIA!' : `OK (Próx. KM: ${(v.km_ultima_troca + 10000).toLocaleString('pt-BR')})`}
            </p>
        `;
        listElement.appendChild(card);
    });
    
    // Adicionar listener de exclusão APENAS se estiver na página de Cadastro
    if (isCadastroPage) {
        listElement.querySelectorAll('.delete-veiculo-btn').forEach(button => {
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
                    } catch (error) {
                        alert('Erro ao excluir veículo.');
                        console.error('Erro ao excluir veículo:', error);
                    }
                }
            });
        });
    }
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
        option.textContent = `${v.placa} - ${v.modelo} (KM: ${v.km_atual})`;
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

    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    function startPosition(e) { drawing = true; draw(e); }
    function endPosition() { drawing = false; ctx.beginPath(); }
    
    function draw(e) {
        if (!drawing) return;
        const rect = canvas.getBoundingClientRect();
        let x, y;

        if (e.touches && e.touches.length > 0) {
            x = e.touches[0].clientX - rect.left;
            y = e.touches[0].clientY - rect.top;
        } else {
            x = e.clientX - rect.left;
            y = e.clientY - rect.top;
        }

        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    }

    canvas.addEventListener('mousedown', startPosition);
    canvas.addEventListener('mouseup', endPosition);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('touchstart', startPosition, { passive: true });
    canvas.addEventListener('touchend', endPosition);
    canvas.addEventListener('touchmove', draw, { passive: true });
    
    clearButton.addEventListener('click', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    // --- SALVAR MOVIMENTAÇÃO (com Lógica de KM e Alerta) ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const placa = document.getElementById('mov-placa').value;
        const motorista = document.getElementById('mov-motorista').value;
        const tipo = document.getElementById('mov-tipo').value;
        const dataHora = document.getElementById('mov-data-hora').value; // String YYYY-MM-DDTHH:MM
        const observacao = document.getElementById('mov-observacao').value;
        const kmInput = document.getElementById('mov-km-atual');
        const kmAtualMovimentacao = parseInt(kmInput.value, 10);
        
        if (tipo === 'entrada' && (isNaN(kmAtualMovimentacao) || kmAtualMovimentacao <= 0)) {
            alert('Por favor, informe a KM Atual para a Entrada da Viatura.');
            return;
        }

        const checklistItems = document.querySelectorAll('#mov-checklist input[type="checkbox"]:checked');
        const checklist = Array.from(checklistItems).map(item => item.value);

        const assinaturaDataUrl = canvas.toDataURL('image/png');
        
        // Converte a string YYYY-MM-DDTHH:MM para ISO string para salvar no DB
        const dataHoraISO = new Date(dataHora).toISOString();
        
        const novaMovimentacao = {
            placa_veiculo: placa,
            motorista: motorista,
            tipo: tipo,
            data_hora: dataHoraISO, // Salva em formato ISO (com hora)
            checklist: checklist,
            observacao: observacao,
            assinatura: assinaturaDataUrl, 
            km_atual: tipo === 'entrada' ? kmAtualMovimentacao : null 
        };

        try {
            if (tipo === 'entrada') {
                const veiculo = await getVeiculoByPlaca(placa);
                
                if (kmAtualMovimentacao < veiculo.km_atual) {
                    alert('ERRO: O KM atual inserido é menor que o KM registrado anteriormente. Verifique o valor.');
                    return;
                }
                
                const kmRodado = kmAtualMovimentacao - veiculo.km_ultima_troca;

                if (kmRodado >= 10000) {
                    const confirmarTroca = confirm(`🚨 ALERTA: Esta viatura rodou ${kmRodado.toLocaleString('pt-BR')} km desde a última troca de óleo.
                    
                    KM ATUAL: ${kmAtualMovimentacao.toLocaleString('pt-BR')}
                    
                    A troca de óleo foi realizada agora?`);

                    if (confirmarTroca) {
                        await updateVeiculoKm(placa, kmAtualMovimentacao, kmAtualMovimentacao);
                    }
                }
            }
            
            await saveMovimentacao(novaMovimentacao);
            alert(`Movimentação de ${tipo.toUpperCase()} da placa ${placa} registrada com sucesso!`);
            
            form.reset();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            loadVeiculosList(); 
            
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
                const corAlerta = precisaTrocar ? 'var(--color-primary)' : 'green';

                infoDiv.innerHTML = `
                    <p><strong>KM Atual:</strong> ${veiculo.km_atual.toLocaleString('pt-BR')}</p>
                    <p><strong>KM Última Troca:</strong> ${veiculo.km_ultima_troca.toLocaleString('pt-BR')}</p>
                    <p style="color: ${corAlerta};"><strong>Status Óleo:</strong> ${precisaTrocar ? '🚨 TROCA NECESSÁRIA!' : 'OK'}</p>
                `;
            }
        } catch (error) {
            infoDiv.innerHTML = `<p style="color: var(--color-primary);">Erro ao buscar informações.</p>`;
            console.error('Erro na pesquisa rápida de KM:', error);
        }
    });
}

// --- HISTÓRICO: Lógica de Auditoria e Associações (E BOTÃO DE EXCLUSÃO) ---
async function buscarMovimentacoesAuditoria() {
    const placaFiltro = document.getElementById('filtro-veiculo').value;
    const dataInicioStr = document.getElementById('filtro-data-inicio').value;
    const dataFimStr = document.getElementById('filtro-data-fim').value;
    const resultadosDiv = document.getElementById('resultados-auditoria');
    
    resultadosDiv.innerHTML = '<div class="card card-placeholder">Buscando...</div>';

    let movimentacoes = await getAllMovimentacoes();

    // 1. Filtrar
    movimentacoes = movimentacoes.filter(mov => {
        let passaFiltro = true;
        const dataMov = new Date(mov.data_hora).getTime();
        
        if (placaFiltro && mov.placa_veiculo !== placaFiltro) {
            passaFiltro = false;
        }
        
        if (dataInicioStr) {
            const dataInicio = new Date(dataInicioStr).getTime();
            if (dataMov < dataInicio) passaFiltro = false;
        }

        if (dataFimStr) {
            const dataFim = new Date(dataFimStr);
            dataFim.setDate(dataFim.getDate() + 1);
            if (dataMov >= dataFim.getTime()) passaFiltro = false;
        }

        return passaFiltro;
    });

    // 2. Ordenar por data (garante que Saída e Entrada fiquem em ordem cronológica)
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
        card.style.borderLeftColor = isSaida ? 'var(--color-primary)' : 'yellowgreen'; 
        
        const dataLocal = new Date(mov.data_hora).toLocaleString('pt-BR'); 

        card.innerHTML = `
            <h3 style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: ${isSaida ? 'var(--color-primary)' : 'yellowgreen'};">
                    ${isSaida ? 'SAÍDA' : 'ENTRADA'} - ${mov.placa_veiculo}
                </span>
                <button class="btn delete-mov-btn" data-id="${mov.id}" style="width: auto; padding: 5px 10px; margin: 0; background-color: #8B0000; font-size: 12px;">Excluir</button>
            </h3>
            <p style="font-size: 10px; color: #888;">ID: ${mov.id}</p>
            <p><strong>Motorista:</strong> ${mov.motorista}</p>
            <p><strong>Data/Hora:</strong> ${dataLocal}</p>
            ${mov.km_atual ? `<p><strong>KM:</strong> ${mov.km_atual.toLocaleString('pt-BR')}</p>` : ''}
            <p><strong>Checklist:</strong> ${mov.checklist.join(', ') || 'Nenhum item marcado'}</p>
            <p><strong>Obs:</strong> ${mov.observacao || 'Nenhuma'}</p>
            <details style="margin-top: 10px; color: var(--color-secondary);">
                <summary>Visualizar Assinatura</summary>
                <img src="${mov.assinatura}" alt="Assinatura Digital" style="max-width: 100%; height: auto; background: white; margin-top: 5px; border-radius: 5px;">
            </details>
        `;
        resultadosDiv.appendChild(card);
    });

    // Adicionar listener de exclusão para o histórico APÓS a renderização:
    resultadosDiv.querySelectorAll('.delete-mov-btn').forEach(button => {
        button.addEventListener('click', async (e) => {
            const id = parseInt(e.target.getAttribute('data-id'));
            if (confirm(`Tem certeza que deseja EXCLUIR o registro de movimentação ID: ${id}?`)) {
                await deleteMovimentacao(id); 
            }
        });
    });
}

// --- FUNÇÃO DE EXCLUSÃO DE MOVIMENTAÇÃO ---
async function deleteMovimentacao(id) {
    try {
        await deleteMovimentacaoById(id);
        alert(`Registro ID: ${id} excluído com sucesso.`);
        buscarMovimentacoesAuditoria(); // Recarrega a lista
    } catch (error) {
        alert('Erro ao excluir registro. Verifique o console.');
        console.error('Erro ao excluir movimentação:', error);
    }
}


// --- HISTÓRICO: Configuração Final ---
function setupHistorico() {
    loadVeiculosForHistorico();
    setupPesquisaKmRapida();
    
    document.getElementById('btn-buscar-auditoria').addEventListener('click', buscarMovimentacoesAuditoria);
    
    document.getElementById('btn-download-pdf').addEventListener('click', () => exportToPDF(lastSearchResult));
    document.getElementById('btn-download-excel').addEventListener('click', () => exportToExcel(lastSearchResult));
}

// --- FUNÇÕES DE EXPORTAÇÃO ---

// FUNÇÃO ATUALIZADA: Agrupa dados por veículo para o PDF.
function exportToPDF(data) {
    if (typeof window.jspdf === 'undefined' || !data || data.length === 0) {
        alert('Faça uma busca antes de exportar! (Verifique se os CDNs do PDF estão carregados)');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape'); 
    
    doc.setFontSize(16);
    doc.text("Relatório de Auditoria - Japan Security Car", 10, 10);
    doc.setFontSize(10);
    doc.text(`Data de Geração: ${new Date().toLocaleString('pt-BR')}`, 10, 15);
    
    // 1. AGRUPAR DADOS POR PLACA
    const groupedData = data.reduce((acc, mov) => {
        const placa = mov.placa_veiculo;
        if (!acc[placa]) {
            acc[placa] = [];
        }
        acc[placa].push(mov);
        return acc;
    }, {});
    
    let tableRows = [];
    let finalData = [];
    
    // 2. ITERAR SOBRE OS GRUPOS E PREPARAR DADOS DE FORMA ORGANIZADA
    for (const placa in groupedData) {
        // Adiciona um separador visual no PDF
        finalData.push({ isSeparator: true, placa: placa });
        
        // Adiciona todas as movimentações do veículo
        groupedData[placa].forEach(mov => {
            finalData.push(mov);
        });
    }

    // 3. MONTAR AS LINHAS PARA O PDF ORGANIZADAS
    finalData.forEach(item => {
        if (item.isSeparator) {
            // Linha Separadora (Cabeçalho do Veículo)
            tableRows.push([
                { content: `VEÍCULO: ${item.placa}`, colSpan: 8, styles: { fillColor: [200, 200, 200], fontStyle: 'bold' } }
            ]);
        } else {
            // Linha de Movimentação
            const movData = [
                item.id,
                item.placa_veiculo,
                item.tipo.toUpperCase(),
                item.motorista,
                new Date(item.data_hora).toLocaleString('pt-BR'),
                item.km_atual ? item.km_atual.toLocaleString('pt-BR') : '-',
                item.checklist.join(', '),
                item.observacao ? item.observacao.substring(0, 30) + (item.observacao.length > 30 ? '...' : '') : '-'
            ];
            tableRows.push(movData);
        }
    });


    const tableColumn = ["ID", "Placa", "Tipo", "Motorista", "Data/Hora", "KM", "Checklist", "Observação"];

    // @ts-ignore
    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 25, 
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [255, 0, 0] } 
    });
    
    doc.save("auditoria_jscar_organizada.pdf");
    alert('PDF gerado com sucesso, organizado por veículo!');
}

function exportToExcel(data) {
    if (typeof window.XLSX === 'undefined' || !data || data.length === 0) {
        alert('Faça uma busca antes de exportar! (Verifique se o CDN do Excel está carregado)');
        return;
    }
    
    const worksheet = XLSX.utils.json_to_sheet(data.map(mov => ({
        ID: mov.id,
        Placa: mov.placa_veiculo,
        Tipo: mov.tipo.toUpperCase(),
        Motorista: mov.motorista,
        DataHora: new Date(mov.data_hora).toLocaleString('pt-BR'),
        KM: mov.km_atual || '0',
        Checklist: mov.checklist.join(' | '),
        Observacao: mov.observacao || '',
    })));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Auditoria");

    XLSX.writeFile(workbook, "auditoria_jscar.xlsx");
    alert('Excel gerado com sucesso!');
}

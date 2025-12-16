// app.js

document.addEventListener('DOMContentLoaded', () => {
    // Referências dos formulários e seções
    const vehicleFormSection = document.getElementById('vehicle-form-section');
    const movimentacaoFormSection = document.getElementById('movimentacao-form-section');
    const showVehicleFormButton = document.getElementById('show-vehicle-form');
    const vehicleForm = document.getElementById('vehicle-form');
    const movimentacaoForm = document.getElementById('movimentacao-form');
    const movimentacoesList = document.getElementById('movimentacoes-list');
    const veiculosAuditoria = document.getElementById('veiculos-auditoria');
    
    // Referências do Modal de Edição
    const editModal = document.getElementById('edit-modal');
    const editForm = document.getElementById('edit-form');
    const closeButton = document.querySelector('.close-button');

    // Estado da Aplicação
    let signatureBase64 = '';
    
    // Inicialização
    loadVehiclePlacas();
    loadMovimentacoes();
    loadVeiculosAuditoria();

    // --- Lógica de UI (Troca de Formulários) ---
    showVehicleFormButton.addEventListener('click', () => {
        vehicleFormSection.style.display = 'block';
        movimentacaoFormSection.style.display = 'none';
        showVehicleFormButton.textContent = 'Voltar para Movimentação';
    });

    // Oculta o form de veículo se for submetido ou se o botão for clicado novamente
    vehicleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const placaInput = document.getElementById('placa').value.toUpperCase();
        const modeloInput = document.getElementById('modelo').value;
        const kmInicialInput = parseFloat(document.getElementById('km-inicial').value);

        const newVehicle = {
            placa: placaInput,
            modelo: modeloInput,
            km_inicial: kmInicialInput,
            km_atual: kmInicialInput // O KM atual começa com o KM inicial
        };

        try {
            await putData(VEHICULOS_STORE, newVehicle);
            alert(`Veículo ${placaInput} cadastrado com sucesso.`);
            vehicleForm.reset();
            vehicleFormSection.style.display = 'none';
            movimentacaoFormSection.style.display = 'block';
            showVehicleFormButton.textContent = 'Cadastrar Novo';
            loadVehiclePlacas();
            loadVeiculosAuditoria();
        } catch (error) {
            alert(`Erro ao cadastrar veículo: ${error.message}`);
        }
    });

    // --- Lógica de Assinatura ---
    function setupMovimentacaoForm() {
        const canvas = document.getElementById('signature-pad');
        const clearButton = document.getElementById('clear-signature');
        const ctx = canvas.getContext('2d');
        let drawing = false;

        // --- CORREÇÃO DA ASSINATURA: Cor da caneta definida para BRANCO PURO (#FFFFFF) ---
        ctx.strokeStyle = '#FFFFFF'; 
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Garante que o Canvas esteja limpo e pronto para desenhar
        function resizeCanvas() {
            const ratio = Math.max(window.devicePixelRatio || 1, 1);
            
            canvas.width = canvas.offsetWidth * ratio;
            canvas.height = canvas.offsetHeight * ratio;
            
            ctx.scale(ratio, ratio);
            
            // Limpa a tela (torna transparente)
            ctx.clearRect(0, 0, canvas.width, canvas.height); 
            
            // Re-aplica o estilo da caneta (Branco)
            ctx.strokeStyle = '#FFFFFF'; 
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
        }
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        function startDrawing(e) {
            drawing = true;
            draw(e);
        }

        function stopDrawing() {
            drawing = false;
            ctx.beginPath();
            signatureBase64 = canvas.toDataURL(); // Salva a imagem ao parar de desenhar
        }

        function draw(e) {
            if (!drawing) return;
            e.preventDefault();

            const rect = canvas.getBoundingClientRect();
            let x, y;

            if (e.touches && e.touches.length > 0) {
                x = e.touches[0].clientX - rect.left;
                y = e.touches[0].clientY - rect.top;
            } else {
                x = e.clientX - rect.left;
                y = e.clientY - rect.top;
            }

            // Corrige a posição para o scale do ratio (devicePixelRatio)
            const ratio = Math.max(window.devicePixelRatio || 1, 1);
            x = x * ratio / ctx.scaleX;
            y = y * ratio / ctx.scaleY;

            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, y);
        }

        // Eventos do Mouse
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mousemove', draw);

        // Eventos do Touch
        canvas.addEventListener('touchstart', startDrawing);
        canvas.addEventListener('touchend', stopDrawing);
        canvas.addEventListener('touchmove', draw);

        clearButton.addEventListener('click', () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            resizeCanvas(); // Garante que a caneta seja branca novamente
            signatureBase64 = '';
        });
    }

    setupMovimentacaoForm();

    // --- Lógica de Movimentação ---
    movimentacaoForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!signatureBase64) {
            alert('A assinatura do motorista é obrigatória.');
            return;
        }

        const placa = document.getElementById('veiculo-placa').value;
        const tipo = document.getElementById('tipo').value;
        const kmAtual = parseFloat(document.getElementById('km-atual').value);
        const motorista = document.getElementById('motorista').value;
        const observacoes = document.getElementById('observacoes').value;

        const veiculo = await getData(VEHICULOS_STORE, placa);

        if (veiculo && kmAtual < veiculo.km_atual) {
             alert(`Erro: O KM atual (${kmAtual}) não pode ser menor que o último KM registrado (${veiculo.km_atual}).`);
             return;
        }

        const movimentacao = {
            placa,
            tipo,
            km_atual: kmAtual,
            motorista,
            observacoes,
            assinatura: signatureBase64,
            timestamp: new Date().toISOString()
        };

        try {
            await putData(MOVIMENTACOES_STORE, movimentacao);
            
            // Atualiza o KM do Veículo
            if (veiculo) {
                veiculo.km_atual = kmAtual;
                await putData(VEHICULOS_STORE, veiculo);
            }

            alert(`Movimentação de ${placa} registrada com sucesso!`);
            movimentacaoForm.reset();
            signatureBase64 = ''; // Limpa a base64
            document.getElementById('clear-signature').click(); // Limpa o canvas visualmente
            loadMovimentacoes();
            loadVeiculosAuditoria();
        } catch (error) {
            alert(`Erro ao registrar movimentação: ${error.message}`);
        }
    });

    // --- Lógica de Carregamento ---
    async function loadVehiclePlacas() {
        const select = document.getElementById('veiculo-placa');
        select.innerHTML = '<option value="">Selecione...</option>';
        try {
            const veiculos = await getAllData(VEHICULOS_STORE);
            veiculos.forEach(v => {
                const option = document.createElement('option');
                option.value = v.placa;
                option.textContent = `${v.placa} (${v.modelo || 'N/I'})`;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Erro ao carregar placas:', error);
        }
    }

    async function loadMovimentacoes() {
        movimentacoesList.innerHTML = '';
        try {
            let movimentacoes = await getAllData(MOVIMENTACOES_STORE);
            // Ordena as movimentações pela data mais recente primeiro
            movimentacoes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); 

            if (movimentacoes.length === 0) {
                movimentacoesList.innerHTML = '<p>Nenhuma movimentação registrada ainda.</p>';
                return;
            }

            movimentacoes.forEach(m => {
                const item = document.createElement('div');
                item.className = 'movimentacao-item';
                item.innerHTML = `
                    <p><strong>Placa:</strong> ${m.placa}</p>
                    <p><strong>Tipo:</strong> ${m.tipo.charAt(0).toUpperCase() + m.tipo.slice(1)}</p>
                    <p><strong>KM:</strong> ${m.km_atual}</p>
                    <p><strong>Motorista:</strong> ${m.motorista}</p>
                    <p><strong>Data:</strong> ${new Date(m.timestamp).toLocaleString()}</p>
                    ${m.assinatura ? `<img src="${m.assinatura}" alt="Assinatura" style="max-width: 150px; height: auto; border: 1px solid #aaa; background-color: #333;">` : ''}
                    <button class="btn-edit" data-id="${m.id}">Editar</button>
                    <hr>
                `;
                movimentacoesList.appendChild(item);
            });
            setupEditButtons();
        } catch (error) {
            console.error('Erro ao carregar movimentações:', error);
            movimentacoesList.innerHTML = '<p>Erro ao carregar dados.</p>';
        }
    }

    async function loadVeiculosAuditoria() {
        veiculosAuditoria.innerHTML = '';
        try {
            const veiculos = await getAllData(VEHICULOS_STORE);
            if (veiculos.length === 0) {
                veiculosAuditoria.innerHTML = '<p>Nenhum veículo cadastrado.</p>';
                return;
            }

            veiculos.forEach(v => {
                const item = document.createElement('div');
                item.className = 'auditoria-item';
                item.innerHTML = `
                    <p><strong>Placa:</strong> ${v.placa}</p>
                    <p><strong>Modelo:</strong> ${v.modelo || 'N/I'}</p>
                    <p><strong>Último KM:</strong> ${v.km_atual}</p>
                    <hr>
                `;
                veiculosAuditoria.appendChild(item);
            });
        } catch (error) {
            console.error('Erro ao carregar auditoria de veículos:', error);
        }
    }

    // --- Lógica de Edição (Modal) ---
    function setupEditButtons() {
        document.querySelectorAll('.btn-edit').forEach(button => {
            button.addEventListener('click', async (e) => {
                const id = parseInt(e.target.dataset.id);
                const movimentacao = await getData(MOVIMENTACOES_STORE, id);
                
                if (movimentacao) {
                    document.getElementById('edit-id').value = id;
                    document.getElementById('edit-tipo').value = movimentacao.tipo;
                    document.getElementById('edit-km-atual').value = movimentacao.km_atual;
                    document.getElementById('edit-motorista').value = movimentacao.motorista;
                    document.getElementById('edit-observacoes').value = movimentacao.observacoes;
                    
                    editModal.style.display = 'block';
                }
            });
        });
    }

    closeButton.addEventListener('click', () => {
        editModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target === editModal) {
            editModal.style.display = 'none';
        }
    });

    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = parseInt(document.getElementById('edit-id').value);
        const newData = {
            tipo: document.getElementById('edit-tipo').value,
            km_atual: document.getElementById('edit-km-atual').value, // Será convertido para float na função editMovimentacao
            motorista: document.getElementById('edit-motorista').value,
            observacoes: document.getElementById('edit-observacoes').value,
        };

        try {
            await editMovimentacao(id, newData);
            alert('Movimentação atualizada com sucesso!');
            editModal.style.display = 'none';
            loadMovimentacoes();
            loadVeiculosAuditoria();
        } catch (error) {
            alert(`Erro ao salvar edição: ${error.message}`);
        }
    });
});

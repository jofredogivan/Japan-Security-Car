// db.js

const DB_NAME = 'JapanSecurityCarDB';
const DB_VERSION = 1;
const VEHICULOS_STORE = 'veiculos';
const MOVIMENTACOES_STORE = 'movimentacoes';

let db;

// Função para abrir o banco de dados
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('Erro ao abrir o banco de dados:', event.target.errorCode);
            reject(event.target.errorCode);
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('Banco de dados aberto com sucesso.');
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Criação da Object Store para Veículos
            if (!db.objectStoreNames.contains(VEHICULOS_STORE)) {
                const veiculosStore = db.createObjectStore(VEHICULOS_STORE, { keyPath: 'placa' });
                // Índice para buscar por modelo (útil para auditoria)
                veiculosStore.createIndex('by_modelo', 'modelo', { unique: false });
            }

            // Criação da Object Store para Movimentações
            if (!db.objectStoreNames.contains(MOVIMENTACOES_STORE)) {
                const movimentacoesStore = db.createObjectStore(MOVIMENTACOES_STORE, { keyPath: 'id', autoIncrement: true });
                // Índice para buscar movimentações por placa
                movimentacoesStore.createIndex('by_placa', 'placa', { unique: false });
            }
        };
    });
}

// Função CRUD Genérica para adicionar ou atualizar dados
function putData(storeName, data) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(data);

        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

// Função CRUD Genérica para buscar todos os dados
function getAllData(storeName) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

// Função para buscar um item específico por chave (ID/Placa)
function getData(storeName, key) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

// Função para editar uma movimentação existente
async function editMovimentacao(id, newData) {
    const movimentacao = await getData(MOVIMENTACOES_STORE, id);
    if (!movimentacao) {
        throw new Error('Movimentação não encontrada.');
    }

    const oldKm = movimentacao.km_atual;
    const newKm = parseFloat(newData.km_atual);

    // 1. Atualiza os campos na movimentação
    movimentacao.tipo = newData.tipo;
    movimentacao.km_atual = newKm;
    movimentacao.motorista = newData.motorista;
    movimentacao.observacoes = newData.observacoes;
    movimentacao.data_edicao = new Date().toISOString();

    // 2. Salva a movimentação atualizada
    await putData(MOVIMENTACOES_STORE, movimentacao);

    // 3. Verifica se o KM foi alterado e precisa de recálculo
    if (oldKm !== newKm) {
        console.log(`KM de ${movimentacao.placa} alterado de ${oldKm} para ${newKm}. Recalculando...`);
        // O recálculo será feito após salvar a movimentação
        await recalculateVehicleKm(movimentacao.placa); 
    }
}

// NOVO: Função para recalcular o KM de um veículo após edição
async function recalculateVehicleKm(placa) {
    const allMovimentacoes = await getAllData(MOVIMENTACOES_STORE);
    const veiculoMovimentacoes = allMovimentacoes
        .filter(m => m.placa === placa)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const veiculo = await getData(VEHICULOS_STORE, placa);
    if (!veiculo) return;

    let ultimoKm = veiculo.km_inicial;

    // Itera sobre as movimentações para encontrar o KM mais recente
    veiculoMovimentacoes.forEach(mov => {
        if (mov.km_atual > ultimoKm) {
            ultimoKm = mov.km_atual;
        }
    });

    // Atualiza o KM no cadastro do veículo
    veiculo.km_atual = ultimoKm;
    await putData(VEHICULOS_STORE, veiculo);
}

// Inicializa o banco de dados
openDB().catch(e => console.error('Falha na inicialização do DB:', e));

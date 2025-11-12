// db.js (Código completo e atualizado - Lógica de KM, Manutenção e CRUD)

const DB_NAME = 'JapanSecurityCarDB';
const DB_VERSION = 1;
const KM_INTERVALO_OLEO = 10000; // Intervalo de 10.000 km para troca de óleo

// Nomes das nossas Object Stores (Tabelas)
const STORE_VEICULOS = 'veiculos';
const STORE_MOVIMENTACOES = 'movimentacoes';
const STORE_MANUTENCOES = 'manutencoes';

let db;

/**
 * Função para abrir e inicializar o banco de dados IndexedDB.
 */
function openDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            db = event.target.result;

            // 1. Object Store de VEÍCULOS
            if (!db.objectStoreNames.contains(STORE_VEICULOS)) {
                const veiculosStore = db.createObjectStore(STORE_VEICULOS, { 
                    keyPath: 'placa', 
                    autoIncrement: false 
                });
                veiculosStore.createIndex('modelo', 'modelo', { unique: false });
                veiculosStore.createIndex('km_atual', 'km_atual', { unique: false });
            }

            // 2. Object Store de MOVIMENTAÇÕES
            if (!db.objectStoreNames.contains(STORE_MOVIMENTACOES)) {
                const movimentacoesStore = db.createObjectStore(STORE_MOVIMENTACOES, { 
                    keyPath: 'id', 
                    autoIncrement: true 
                });
                movimentacoesStore.createIndex('placa_veiculo', 'placa_veiculo', { unique: false });
                movimentacoesStore.createIndex('data_hora', 'data_hora', { unique: false });
                movimentacoesStore.createIndex('motorista', 'motorista', { unique: false });
            }

            // 3. Object Store de MANUTENÇÕES
            if (!db.objectStoreNames.contains(STORE_MANUTENCOES)) {
                const manutencoesStore = db.createObjectStore(STORE_MANUTENCOES, { 
                    keyPath: 'id', 
                    autoIncrement: true 
                });
                manutencoesStore.createIndex('placa_veiculo', 'placa_veiculo', { unique: false });
                manutencoesStore.createIndex('data_troca', 'data_troca', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onerror = (event) => {
            console.error("Erro ao abrir IndexedDB:", event.target.errorCode);
            reject(new Error("Erro ao abrir IndexedDB"));
        };
    });
}

/**
 * Executa uma transação genérica de leitura/escrita.
 */
async function executeTransaction(storeName, mode, callback) {
    const database = await openDB();
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
        const request = callback(store);

        transaction.oncomplete = () => {
            resolve(request ? request.result : undefined); 
        };

        transaction.onerror = (event) => {
            reject(event.target.error);
        };
        
        if (request) {
            request.onerror = (event) => {
                reject(event.target.error);
            };
        }
    });
}

// -------------------------------------------------------------
// OPERAÇÕES CRUD PARA VEÍCULOS
// -------------------------------------------------------------

/**
 * Adiciona um novo veículo ou atualiza um existente (Update/Put).
 */
export async function saveVeiculo(veiculo) {
    return executeTransaction(STORE_VEICULOS, 'readwrite', (store) => store.put(veiculo));
}

/**
 * Busca todos os veículos cadastrados.
 */
export async function getAllVeiculos() {
    return executeTransaction(STORE_VEICULOS, 'readonly', (store) => store.getAll());
}

/**
 * Busca um veículo específico pela placa.
 */
export async function getVeiculoByPlaca(placa) {
    return executeTransaction(STORE_VEICULOS, 'readonly', (store) => store.get(placa));
}

/**
 * Exclui um veículo pela placa.
 */
export async function deleteVeiculo(placa) {
    return executeTransaction(STORE_VEICULOS, 'readwrite', (store) => store.delete(placa));
}

/**
 * Atualiza o KM atual do veículo (e opcionalmente a KM da última troca de óleo).
 */
export async function updateVeiculoKm(placa, novoKm, kmUltimaTroca = null) {
    const veiculo = await getVeiculoByPlaca(placa);
    if (!veiculo) {
        throw new Error(`Veículo com placa ${placa} não encontrado.`);
    }

    veiculo.km_atual = novoKm;
    if (kmUltimaTroca !== null) {
        veiculo.km_ultima_troca = kmUltimaTroca;
        
        // Registra a troca na store de Manutenções
        const manutencao = {
            placa_veiculo: placa,
            data_troca: new Date().toISOString(),
            km_troca: novoKm,
            tipo: "Troca de Óleo",
            proximo_km_alerta: novoKm + KM_INTERVALO_OLEO
        };
        await saveManutencao(manutencao);
    }
    
    return saveVeiculo(veiculo); // Salva o veículo atualizado
}

// -------------------------------------------------------------
// OPERAÇÕES CRUD PARA MOVIMENTAÇÕES
// -------------------------------------------------------------

/**
 * Adiciona uma nova movimentação (Saída/Entrada).
 */
export async function saveMovimentacao(movimentacao) {
    // 1. Salva a movimentação no Object Store
    const id = await executeTransaction(STORE_MOVIMENTACOES, 'readwrite', (store) => store.add(movimentacao));
    
    // 2. Lógica de atualização de KM APENAS na ENTRADA
    if (movimentacao.tipo === 'entrada' && movimentacao.km_atual) {
        
        const placa = movimentacao.placa_veiculo;
        const novoKm = movimentacao.km_atual;

        // Atualiza apenas o KM atual. O alerta é tratado no app.js
        await updateVeiculoKm(placa, novoKm, null); 
    }

    return id;
}

/**
 * Busca todas as movimentações.
 */
export async function getAllMovimentacoes() {
    return executeTransaction(STORE_MOVIMENTACOES, 'readonly', (store) => store.getAll());
}

// -------------------------------------------------------------
// OPERAÇÕES CRUD PARA MANUTENÇÕES
// -------------------------------------------------------------

/**
 * Adiciona um novo registro de manutenção.
 */
export async function saveManutencao(manutencao) {
    return executeTransaction(STORE_MANUTENCOES, 'readwrite', (store) => store.add(manutencao));
}


// Exporta todas as funções e constantes necessárias
export { 
    openDB, 
    STORE_VEICULOS, 
    STORE_MOVIMENTACOES, 
    STORE_MANUTENCOES,
    executeTransaction,
    saveVeiculo,
    getAllVeiculos,
    getVeiculoByPlaca,
    deleteVeiculo,
    updateVeiculoKm, 
    saveMovimentacao,
    getAllMovimentacoes
};
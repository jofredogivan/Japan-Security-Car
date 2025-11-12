// db.js (Código completo, finalizado e com todas as funções exportadas)

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

async function saveVeiculo(veiculo) {
    return executeTransaction(STORE_VEICULOS, 'readwrite', (store) => store.put(veiculo));
}

async function getAllVeiculos() {
    return executeTransaction(STORE_VEICULOS, 'readonly', (store) => store.getAll());
}

async function getVeiculoByPlaca(placa) {
    return executeTransaction(STORE_VEICULOS, 'readonly', (store) => store.get(placa));
}

async function deleteVeiculo(placa) {
    return executeTransaction(STORE_VEICULOS, 'readwrite', (store) => store.delete(placa));
}

async function updateVeiculoKm(placa, novoKm, kmUltimaTroca = null) {
    const veiculo = await getVeiculoByPlaca(placa);
    if (!veiculo) {
        throw new Error(`Veículo com placa ${placa} não encontrado.`);
    }

    veiculo.km_atual = novoKm;
    if (kmUltimaTroca !== null) {
        veiculo.km_ultima_troca = kmUltimaTroca;
        
        const manutencao = {
            placa_veiculo: placa,
            data_troca: new Date().toISOString(),
            km_troca: novoKm,
            tipo: "Troca de Óleo",
            proximo_km_alerta: novoKm + KM_INTERVALO_OLEO
        };
        await saveManutencao(manutencao);
    }
    
    return saveVeiculo(veiculo); 
}

// -------------------------------------------------------------
// OPERAÇÕES CRUD PARA MOVIMENTAÇÕES
// -------------------------------------------------------------

async function saveMovimentacao(movimentacao) { 
    const id = await executeTransaction(STORE_MOVIMENTACOES, 'readwrite', (store) => store.add(movimentacao));
    
    if (movimentacao.tipo === 'entrada' && movimentacao.km_atual) {
        const placa = movimentacao.placa_veiculo;
        const novoKm = movimentacao.km_atual;

        await updateVeiculoKm(placa, novoKm, null); 
    }

    return id;
}

async function getAllMovimentacoes() { 
    return executeTransaction(STORE_MOVIMENTACOES, 'readonly', (store) => store.getAll());
}

/**
 * Exclui uma movimentação pelo ID.
 */
async function deleteMovimentacaoById(id) { 
    return executeTransaction(STORE_MOVIMENTACOES, 'readwrite', (store) => store.delete(id));
}

// -------------------------------------------------------------
// OPERAÇÕES CRUD PARA MANUTENÇÕES
// -------------------------------------------------------------

async function saveManutencao(manutencao) { 
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
    getAllMovimentacoes,
    deleteMovimentacaoById, 
    saveManutencao
};

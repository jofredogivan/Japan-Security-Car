// db.js

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

// ATUALIZADO: Adiciona forceUpdate para permitir correções de KM (Edição)
async function updateVeiculoKm(placa, novoKm, kmUltimaTroca = null, forceUpdate = false) {
    const veiculo = await getVeiculoByPlaca(placa);
    if (!veiculo) {
        throw new Error(`Veículo com placa ${placa} não encontrado.`);
    }

    // Se não for uma atualização forçada (edição/recalculo) E o novo KM for menor, lança erro.
    if (!forceUpdate && novoKm < veiculo.km_atual) {
        throw new Error(`O novo KM (${novoKm}) é menor que o KM atual registrado (${veiculo.km_atual}).`);
    }

    veiculo.km_atual = novoKm;
    
    if (kmUltimaTroca !== null) {
        veiculo.km_ultima_troca = kmUltimaTroca;
        
        // Se o KM de última troca for atualizado, registra uma manutenção (troca de óleo)
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
    
    // Agora só atualiza o KM do veículo se um KM válido foi informado
    if (movimentacao.tipo === 'entrada' && movimentacao.km_atual) {
        const placa = movimentacao.placa_veiculo;
        const novoKm = movimentacao.km_atual;

        // Note: Se a KM for menor que a atual, a função updateVeiculoKm vai lançar um erro (a menos que seja forceUpdate)
        // Isso é tratado no app.js antes de chamar o saveMovimentacao
        await updateVeiculoKm(placa, novoKm, null); 
    }

    return id;
}

async function getAllMovimentacoes() { 
    return executeTransaction(STORE_MOVIMENTACOES, 'readonly', (store) => store.getAll());
}

/**
 * Exclui uma movimentação pelo ID e recalcula o KM atual do veículo.
 */
async function deleteMovimentacaoById(id) { 
    const movimentacaoDeletada = await executeTransaction(STORE_MOVIMENTACOES, 'readwrite', (store) => store.get(id));
    if (!movimentacaoDeletada) return;

    // 1. Deleta o registro.
    await executeTransaction(STORE_MOVIMENTACOES, 'readwrite', (store) => store.delete(id));

    // 2. Se a movimentação excluída era de ENTRADA e tinha KM, RECALCULA o KM atual.
    if (movimentacaoDeletada.tipo === 'entrada' && movimentacaoDeletada.km_atual) {
        await recalculateVehicleKm(movimentacaoDeletada.placa_veiculo);
    }
}

/**
 * NOVA FUNÇÃO: Atualiza o KM atual do veículo após uma edição ou exclusão,
 * buscando o último KM de entrada válido.
 */
async function recalculateVehicleKm(placa) {
    const movimentacoes = await getAllMovimentacoes();
    
    // Acha o último registro de ENTRADA válido para definir o KM atual.
    const ultimaEntradaValida = movimentacoes
        .filter(mov => mov.placa_veiculo === placa && mov.tipo === 'entrada' && mov.km_atual)
        .sort((a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime()) // Mais recente primeiro
        [0]; // Pega o primeiro (o mais recente)
        
    // Se não houver entradas, o KM volta para 0 ou precisará de uma busca mais complexa
    // Aqui, simplificamos para 0 se não houver entradas válidas.
    const kmParaAtualizar = ultimaEntradaValida ? ultimaEntradaValida.km_atual : 0; 
    
    const veiculo = await getVeiculoByPlaca(placa);
    
    if (veiculo) {
        // Só atualiza se o KM for diferente, usando forceUpdate=true para permitir correções retroativas.
        if (veiculo.km_atual !== kmParaAtualizar) {
             await updateVeiculoKm(placa, kmParaAtualizar, null, true); 
        }
    }
}

/**
 * NOVA FUNÇÃO: Edita um registro de movimentação e recalcula o KM.
 */
async function editMovimentacao(movimentacaoEditada) {
    // 1. Atualizar o registro de movimentação (usando put - substituição pelo keyPath ID).
    await executeTransaction(STORE_MOVIMENTACOES, 'readwrite', (store) => store.put(movimentacaoEditada));
    
    // 2. Após a edição, recalcula o KM atual do veículo com base na nova lista.
    await recalculateVehicleKm(movimentacaoEditada.placa_veiculo);
    
    return movimentacaoEditada.id;
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
    editMovimentacao, 
    saveManutencao
};

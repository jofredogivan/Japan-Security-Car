// db.js - Banco de Dados IndexedDB Atualizado para JSCar
const DB_NAME = 'ControleViaturaDB';
const DB_VERSION = 1;

export function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            // Criação das tabelas (Object Stores) se não existirem
            if (!db.objectStoreNames.contains('veiculos')) {
                db.createObjectStore('veiculos', { keyPath: 'placa' });
            }
            if (!db.objectStoreNames.contains('movimentacoes')) {
                db.createObjectStore('movimentacoes', { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// --- FUNÇÕES DE VEÍCULOS ---

export async function saveVeiculo(veiculo) {
    const db = await openDB();
    const transaction = db.transaction('veiculos', 'readwrite');
    transaction.objectStore('veiculos').put(veiculo);
}

export async function getAllVeiculos() {
    const db = await openDB();
    return new Promise((resolve) => {
        const transaction = db.transaction('veiculos', 'readonly');
        const request = transaction.objectStore('veiculos').getAll();
        request.onsuccess = () => resolve(request.result);
    });
}

export async function getVeiculoByPlaca(placa) {
    const db = await openDB();
    return new Promise((resolve) => {
        const transaction = db.transaction('veiculos', 'readonly');
        const request = transaction.objectStore('veiculos').get(placa);
        request.onsuccess = () => resolve(request.result);
    });
}

/**
 * Atualiza o KM e opcionalmente a data da última troca de óleo
 * @param {string} placa - Placa da viatura
 * @param {number} novoKm - Novo KM registado
 * @param {number|null} novaTrocaOleo - Se preenchido, define o novo KM de referência para manutenção
 */
export async function updateVeiculoKm(placa, novoKm, novaTrocaOleo = null) {
    const veiculo = await getVeiculoByPlaca(placa);
    if (veiculo) {
        veiculo.km_atual = novoKm;
        // Se a troca de óleo foi marcada no formulário, atualizamos o marco de referência
        if (novaTrocaOleo !== null) {
            veiculo.km_ultima_troca = novaTrocaOleo;
        }
        await saveVeiculo(veiculo);
    }
}

export async function deleteVeiculo(placa) {
    const db = await openDB();
    const transaction = db.transaction('veiculos', 'readwrite');
    transaction.objectStore('veiculos').delete(placa);
}

// --- FUNÇÕES DE MOVIMENTAÇÃO ---

export async function saveMovimentacao(dados) {
    const db = await openDB();
    const transaction = db.transaction('movimentacoes', 'readwrite');
    transaction.objectStore('movimentacoes').add(dados);
}

export async function getAllMovimentacoes() {
    const db = await openDB();
    return new Promise((resolve) => {
        const transaction = db.transaction('movimentacoes', 'readonly');
        const request = transaction.objectStore('movimentacoes').getAll();
        request.onsuccess = () => resolve(request.result);
    });
}

export async function deleteMovimentacaoById(id) {
    const db = await openDB();
    const transaction = db.transaction('movimentacoes', 'readwrite');
    transaction.objectStore('movimentacoes').delete(id);
}

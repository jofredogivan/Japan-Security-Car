// db.js - BANCO DE DADOS INDEXEDDB
const DB_NAME = 'JSCAR_DB';
const DB_VERSION = 1;
let db;

export function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('veiculos')) {
                db.createObjectStore('veiculos', { keyPath: 'placa' });
            }
            if (!db.objectStoreNames.contains('movimentacoes')) {
                db.createObjectStore('movimentacoes', { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };

        request.onerror = (e) => reject(e.target.error);
    });
}

// --- FUNÇÕES DE VEÍCULOS ---

export async function saveVeiculo(veiculo) {
    const tx = db.transaction('veiculos', 'readwrite');
    await tx.objectStore('veiculos').put(veiculo);
    return tx.complete;
}

export async function getAllVeiculos() {
    const tx = db.transaction('veiculos', 'readonly');
    return new Promise(resolve => {
        const request = tx.objectStore('veiculos').getAll();
        request.onsuccess = () => resolve(request.result);
    });
}

export async function getVeiculoByPlaca(placa) {
    const tx = db.transaction('veiculos', 'readonly');
    return new Promise(resolve => {
        const request = tx.objectStore('veiculos').get(placa);
        request.onsuccess = () => resolve(request.result);
    });
}

export async function deleteVeiculo(placa) {
    const tx = db.transaction('veiculos', 'readwrite');
    await tx.objectStore('veiculos').delete(placa);
    return tx.complete;
}

// Atualiza KM e opcionalmente a data da última troca de óleo
export async function updateVeiculoKm(placa, novoKm, kmTrocaOleo = null) {
    const v = await getVeiculoByPlaca(placa);
    if (!v) return;

    v.km_atual = novoKm;
    if (kmTrocaOleo !== null) {
        v.km_ultima_troca = kmTrocaOleo;
    }

    const tx = db.transaction('veiculos', 'readwrite');
    tx.objectStore('veiculos').put(v);
}

// --- FUNÇÕES DE MOVIMENTAÇÃO ---

export async function saveMovimentacao(mov) {
    const tx = db.transaction('movimentacoes', 'readwrite');
    await tx.objectStore('movimentacoes').add(mov);
    return tx.complete;
}

export async function getAllMovimentacoes() {
    const tx = db.transaction('movimentacoes', 'readonly');
    return new Promise(resolve => {
        const request = tx.objectStore('movimentacoes').getAll();
        request.onsuccess = () => resolve(request.result);
    });
}

export async function deleteMovimentacaoById(id) {
    const tx = db.transaction('movimentacoes', 'readwrite');
    await tx.objectStore('movimentacoes').delete(id);
    return tx.complete;
}

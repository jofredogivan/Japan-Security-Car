// db.js - BANCO DE DADOS INDEXEDDB
const DB_NAME = 'JSCAR_DB';
const DB_VERSION = 1;

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

        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

// --- FUNÇÕES DE VEÍCULOS ---

export async function saveVeiculo(veiculo) {
    const db = await openDB();
    const tx = db.transaction('veiculos', 'readwrite');
    tx.objectStore('veiculos').put(veiculo);
    return new Promise(res => tx.oncomplete = () => res());
}

export async function getAllVeiculos() {
    const db = await openDB();
    const tx = db.transaction('veiculos', 'readonly');
    const store = tx.objectStore('veiculos');
    return new Promise(res => {
        const req = store.getAll();
        req.onsuccess = () => res(req.result);
    });
}

export async function getVeiculoByPlaca(placa) {
    const db = await openDB();
    const tx = db.transaction('veiculos', 'readonly');
    const store = tx.objectStore('veiculos');
    return new Promise(res => {
        const req = store.get(placa);
        req.onsuccess = () => res(req.result);
    });
}

export async function deleteVeiculo(placa) {
    const db = await openDB();
    const tx = db.transaction('veiculos', 'readwrite');
    tx.objectStore('veiculos').delete(placa);
    return new Promise(res => tx.oncomplete = () => res());
}

export async function updateVeiculoKm(placa, novoKm, kmTrocaOleo = null) {
    const db = await openDB();
    const tx = db.transaction('veiculos', 'readwrite');
    const store = tx.objectStore('veiculos');
    
    const req = store.get(placa);
    req.onsuccess = () => {
        const v = req.result;
        if (v) {
            v.km_atual = novoKm;
            if (kmTrocaOleo !== null) v.km_ultima_troca = kmTrocaOleo;
            store.put(v);
        }
    };
}

// --- FUNÇÕES DE MOVIMENTAÇÃO ---

export async function saveMovimentacao(mov) {
    const db = await openDB();
    const tx = db.transaction('movimentacoes', 'readwrite');
    tx.objectStore('movimentacoes').add(mov);
    return new Promise(res => tx.oncomplete = () => res());
}

export async function getAllMovimentacoes() {
    const db = await openDB();
    const tx = db.transaction('movimentacoes', 'readonly');
    const store = tx.objectStore('movimentacoes');
    return new Promise(res => {
        const req = store.getAll();
        req.onsuccess = () => res(req.result);
    });
}

export async function deleteMovimentacaoById(id) {
    const db = await openDB();
    const tx = db.transaction('movimentacoes', 'readwrite');
    tx.objectStore('movimentacoes').delete(id);
    return new Promise(res => tx.oncomplete = () => res());
}

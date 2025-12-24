const DB_NAME = 'ControleViaturaDB';
const DB_VERSION = 1;

export function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
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

export async function saveVeiculo(veiculo) {
    const db = await openDB();
    const tx = db.transaction('veiculos', 'readwrite');
    tx.objectStore('veiculos').put(veiculo);
}

export async function getAllVeiculos() {
    const db = await openDB();
    return new Promise((res) => {
        const tx = db.transaction('veiculos', 'readonly');
        const req = tx.objectStore('veiculos').getAll();
        req.onsuccess = () => res(req.result);
    });
}

export async function getVeiculoByPlaca(placa) {
    const db = await openDB();
    return new Promise((res) => {
        const tx = db.transaction('veiculos', 'readonly');
        const req = tx.objectStore('veiculos').get(placa);
        req.onsuccess = () => res(req.result);
    });
}

export async function updateVeiculoKm(placa, novoKm, novaTrocaOleo = null) {
    const v = await getVeiculoByPlaca(placa);
    if (v) {
        v.km_atual = novoKm;
        if (novaTrocaOleo !== null) v.km_ultima_troca = novaTrocaOleo;
        await saveVeiculo(v);
    }
}

export async function deleteVeiculo(placa) {
    const db = await openDB();
    const tx = db.transaction('veiculos', 'readwrite');
    tx.objectStore('veiculos').delete(placa);
}

export async function saveMovimentacao(dados) {
    const db = await openDB();
    const tx = db.transaction('movimentacoes', 'readwrite');
    tx.objectStore('movimentacoes').add(dados);
}

export async function getAllMovimentacoes() {
    const db = await openDB();
    return new Promise((res) => {
        const tx = db.transaction('movimentacoes', 'readonly');
        const req = tx.objectStore('movimentacoes').getAll();
        req.onsuccess = () => res(req.result);
    });
}

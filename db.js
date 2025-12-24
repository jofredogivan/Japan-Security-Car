import { 
    saveVeiculo, getAllVeiculos, getVeiculoByPlaca, deleteVeiculo, 
    openDB, saveMovimentacao, updateVeiculoKm, getAllMovimentacoes 
} from './db.js';

document.addEventListener('DOMContentLoaded', async () => {
    await openDB();
    await loadVeiculosList();
    setupNavigation();
    setupCadastroVeiculo();
    setupMovimentacaoForm(); 
    setupHistorico(); 
    setupAtualizacaoKm();
    setupBackup();

    document.getElementById('fab-action').onclick = () => document.querySelector('[data-target="movimentacao"]').click();
});

function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const pages = document.querySelectorAll('.page');
    navButtons.forEach(btn => {
        btn.onclick = (e) => {
            const target = e.currentTarget.getAttribute('data-target');
            navButtons.forEach(b => b.classList.remove('active'));
            pages.forEach(p => p.classList.add('hidden'));
            e.currentTarget.classList.add('active');
            document.getElementById(target).classList.remove('hidden');
            if (target === 'dashboard') loadVeiculosList();
            if (target === 'movimentacao') fillSelect('mov-placa');
            if (target === 'historico') fillSelect('filtro-veiculo');
            if (target === 'atualizacao-km') fillSelect('update-placa');
        };
    });
}

async function loadVeiculosList() {
    const vs = await getAllVeiculos();
    const dash = document.getElementById('movimentacoes-list');
    const cadList = document.getElementById('delete-veiculo-list');
    if(dash) dash.innerHTML = '';
    if(cadList) cadList.innerHTML = '';
    
    vs.forEach(v => {
        const kmRodado = v.km_atual - (v.km_ultima_troca || v.km_atual);
        const alerta = kmRodado >= 10000;
        const card = `
            <div class="card" style="border-left: 5px solid ${alerta ? '#f00' : '#0f0'}">
                <h3>${v.placa}</h3>
                <p>KM: ${v.km_atual.toLocaleString()}</p>
                <p style="color:${alerta ? '#f00' : '#0f0'}"><b>${alerta ? '🚨 TROCA DE ÓLEO' : '✅ ÓLEO OK'}</b></p>
                <button onclick="window.delV('${v.placa}')" class="btn-danger">Remover</button>
            </div>`;
        if(dash) dash.insertAdjacentHTML('beforeend', card);
        if(cadList) cadList.insertAdjacentHTML('beforeend', card);
    });
}

window.delV = async (p) => { if(confirm("Remover viatura?")) { await deleteVeiculo(p); loadVeiculosList(); }};

function setupMovimentacaoForm() {
    const canvas = document.getElementById('signature-pad');
    const ctx = canvas.getContext('2d');
    const select = document.getElementById('mov-placa');
    const inputKm = document.getElementById('mov-km-atual');

    select.onchange = async () => {
        const v = await getVeiculoByPlaca(select.value);
        if(v) inputKm.value = v.km_atual;
    };

    // Assinatura simples
    canvas.ontouchmove = (e) => {
        const rect = canvas.getBoundingClientRect();
        ctx.lineTo(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
        ctx.stroke(); e.preventDefault();
    };
    canvas.ontouchstart = (e) => { ctx.beginPath(); };
    document.getElementById('clear-signature').onclick = () => ctx.clearRect(0,0,canvas.width,canvas.height);

    document.getElementById('form-movimentacao').onsubmit = async (e) => {
        e.preventDefault();
        const kmVal = inputKm.value ? parseInt(inputKm.value) : null;
        if(kmVal) await updateVeiculoKm(select.value, kmVal, null);
        await saveMovimentacao({
            placa_veiculo: select.value,
            motorista: document.getElementById('mov-motorista').value,
            tipo: document.getElementById('mov-tipo').value,
            data_hora: document.getElementById('mov-data-hora').value,
            km_atual: kmVal,
            assinatura: canvas.toDataURL()
        });
        alert("Salvo!"); e.target.reset(); ctx.clearRect(0,0,canvas.width,canvas.height);
        document.querySelector('[data-target="dashboard"]').click();
    };
}

function setupBackup() {
    document.getElementById('btn-exportar').onclick = async () => {
        const data = { v: await getAllVeiculos(), m: await getAllMovimentacoes() };
        const blob = new Blob([JSON.stringify(data)], {type:'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `JSCar_Backup.json`;
        a.click();
    };

    const inputImp = document.getElementById('input-importar');
    document.getElementById('btn-importar-trigger').onclick = () => inputImp.click();
    inputImp.onchange = (e) => {
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const data = JSON.parse(ev.target.result);
            if(data.v) for(let v of data.v) await saveVeiculo(v);
            if(data.m) for(let m of data.m) { delete m.id; await saveMovimentacao(m); }
            alert("Sucesso! Recarregando...");
            window.location.reload(); // Força a atualização para exibir os dados
        };
        reader.readAsText(e.target.files[0]);
    };
}

// ... (Outras funções auxiliares setupHistorico, setupAtualizacaoKm permanecem as mesmas das versões anteriores)
async function fillSelect(id) {
    const s = document.getElementById(id);
    const vs = await getAllVeiculos();
    s.innerHTML = '<option value="">Selecione...</option>' + vs.map(v => `<option value="${v.placa}">${v.placa}</option>`).join('');
}

function setupCadastroVeiculo() {
    document.getElementById('form-cadastro-veiculo').onsubmit = async (e) => {
        e.preventDefault();
        const km = parseInt(document.getElementById('veiculo-km').value);
        await saveVeiculo({
            placa: document.getElementById('veiculo-placa').value.toUpperCase(),
            modelo: document.getElementById('veiculo-modelo').value,
            km_atual: km,
            km_ultima_troca: km
        });
        alert("Cadastrado!"); e.target.reset(); loadVeiculosList();
    };
}

function setupAtualizacaoKm() {
    document.getElementById('form-atualizacao-km').onsubmit = async (e) => {
        e.preventDefault();
        const p = document.getElementById('update-placa').value;
        const k = parseInt(document.getElementById('update-km-novo').value);
        const t = document.getElementById('update-troca-oleo').checked;
        await updateVeiculoKm(p, k, t ? k : null);
        alert("Atualizado!"); e.target.reset(); loadVeiculosList();
    };
}

function setupHistorico() {
    document.getElementById('btn-buscar-auditoria').onclick = async () => {
        const ini = document.getElementById('filtro-data-inicio').value;
        const fim = document.getElementById('filtro-data-fim').value;
        const res = document.getElementById('resultados-auditoria');
        let movs = await getAllMovimentacoes();
        if(ini) movs = movs.filter(m => m.data_hora >= ini);
        if(fim) movs = movs.filter(m => m.data_hora <= fim);
        res.innerHTML = movs.map(m => `<div class="card"><b>${m.tipo}</b>: ${m.placa_veiculo} - ${m.motorista}</div>`).join('');
    };
}

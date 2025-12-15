// === ESTADO GLOBAL (A "Memória" da Aplicação) ===
let memoriaArquivos = []; // Aqui ficam os dados processados de cada arquivo

// Listeners
document.getElementById('fileInput').addEventListener('change', receberArquivos);

// 1. Função que recebe os arquivos do input
async function receberArquivos(event) {
    const files = event.target.files;
    if (files.length === 0) return;

    const statusArea = document.getElementById('statusArea');
    statusArea.style.display = 'block';

    // Processa cada arquivo individualmente
    for (let file of files) {
        // Evita duplicidade (se o arquivo já foi carregado pelo nome)
        if (memoriaArquivos.some(f => f.nomeArquivo === file.name)) {
            console.warn(`Arquivo ${file.name} já foi carregado. Ignorando.`);
            continue;
        }

        try {
            const conteudo = await lerArquivoTexto(file);
            const dadosExtraidos = processarXML(conteudo);
            
            // Adiciona à memória global com metadados do arquivo
            memoriaArquivos.push({
                nomeArquivo: file.name,
                dados: dadosExtraidos
            });

            adicionarNaListaVisual(file.name, true);

        } catch (erro) {
            console.error(erro);
            adicionarNaListaVisual(file.name, false);
        }
    }

    atualizarContador();
    // Limpa o input para permitir selecionar os mesmos arquivos novamente se necessário (após limpar)
    event.target.value = ''; 
}

// 2. Auxiliar para ler arquivo como texto (Promessa)
function lerArquivoTexto(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
}

// 3. O "Cérebro": Lê o XML S-5002
function processarXML(xmlTexto) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlTexto, "text/xml");
    
    // Namespaces do eSocial são chatos. Usamos local-name() no XPath para ignorá-los.
    // Isso garante compatibilidade com qualquer versão do layout.
    
    // Tenta pegar o CPF
    let cpf = "";
    const cpfNode = buscarNoXML(xmlDoc, "//*[local-name()='cpfBenef']");
    if (cpfNode) cpf = cpfNode.textContent;

    let registros = [];

    // Busca blocos de Informação de IR (infoIR)
    const infoIRNodes = buscarTodosNoXML(xmlDoc, "//*[local-name()='infoIR']");
    
    infoIRNodes.forEach(nodeIR => {
        // Data de Apuração (Regime de Caixa) - Formato AAAA-MM
        const perApurNode = buscarNoXML(nodeIR, ".//*[local-name()='perApur']");
        const perApur = perApurNode ? perApurNode.textContent : "Indefinido";

        // Bases de Cálculo dentro deste período
        const basesNodes = buscarTodosNoXML(nodeIR, ".//*[local-name()='basesApur']");
        
        basesNodes.forEach(baseNode => {
            const vrBcNode = buscarNoXML(baseNode, ".//*[local-name()='vrBcMensal']");
            const vrIrrfNode = buscarNoXML(baseNode, ".//*[local-name()='vrIrrfDesc']");

            // Convertendo para Float (Cuidado: JS puro tem problemas com centavos,
            // mas para visualização simples funciona. Idealmente usaríamos inteiros.)
            const vrBc = vrBcNode ? parseFloat(vrBcNode.textContent) : 0;
            const vrIrrf = vrIrrfNode ? parseFloat(vrIrrfNode.textContent) : 0;

            registros.push({
                competencia: perApur,
                base: vrBc,
                irrf: vrIrrf,
                cpf: cpf
            });
        });
    });

    return registros;
}

// 4. Função para Consolidar e Exibir (A "Matemática")
function calcularTudo() {
    if (memoriaArquivos.length === 0) {
        alert("Nenhum arquivo carregado na memória.");
        return;
    }

    const consolidado = {}; // Objeto para somar por competência
    let cpfFinal = "---";

    // Varrer toda a memória
    memoriaArquivos.forEach(arquivo => {
        arquivo.dados.forEach(registro => {
            if (registro.cpf) cpfFinal = registro.cpf;
            
            const chave = registro.competencia;
            
            if (!consolidado[chave]) {
                consolidado[chave] = { base: 0, irrf: 0 };
            }

            // Truque para precisão: Multiplica por 100, soma inteiros, depois divide
            consolidado[chave].base += Math.round(registro.base * 100);
            consolidado[chave].irrf += Math.round(registro.irrf * 100);
        });
    });

    renderizarTabela(consolidado, cpfFinal);
}

// 5. Renderização na Tela
function renderizarTabela(dados, cpf) {
    const tbody = document.querySelector("#tabelaResultados tbody");
    tbody.innerHTML = "";
    document.getElementById("cpfDisplay").textContent = formatarCPF(cpf);

    const chavesOrdenadas = Object.keys(dados).sort();
    let totalBase = 0;
    let totalIrrf = 0;

    chavesOrdenadas.forEach(comp => {
        const baseVal = dados[comp].base;
        const irrfVal = dados[comp].irrf;

        totalBase += baseVal;
        totalIrrf += irrfVal;

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${comp}</td>
            <td class="text-right">${formatarMoeda(baseVal)}</td>
            <td class="text-right">${formatarMoeda(irrfVal)}</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById("totalBase").textContent = formatarMoeda(totalBase);
    document.getElementById("totalIRRF").textContent = formatarMoeda(totalIrrf);
    document.getElementById("output").style.display = "block";
}

// --- Funções Utilitárias e de Interface ---

function buscarNoXML(contexto, xpath) {
    const result = document.evaluate(xpath, contexto, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    return result.singleNodeValue;
}

function buscarTodosNoXML(contexto, xpath) {
    const result = document.evaluate(xpath, contexto, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    let nodes = [];
    for (let i = 0; i < result.snapshotLength; i++) nodes.push(result.snapshotItem(i));
    return nodes;
}

function adicionarNaListaVisual(nome, sucesso) {
    const lista = document.getElementById("listaArquivos");
    const li = document.createElement("li");
    li.className = sucesso ? "ok" : "error";
    li.innerHTML = `<span>${nome}</span> <span>${sucesso ? '✔ Carregado' : '❌ Erro'}</span>`;
    lista.appendChild(li);
}

function atualizarContador() {
    document.getElementById("contadorArquivos").textContent = memoriaArquivos.length;
}

function limparMemoria() {
    memoriaArquivos = [];
    document.getElementById("listaArquivos").innerHTML = "";
    document.getElementById("output").style.display = "none";
    document.getElementById("statusArea").style.display = "none";
    atualizarContador();
}

function formatarMoeda(valorCentavos) {
    return (valorCentavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarCPF(cpf) {
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}
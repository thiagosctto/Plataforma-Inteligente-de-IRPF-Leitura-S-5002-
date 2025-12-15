// === ESTADO GLOBAL ===
let memoriaArquivos = []; 

// Listeners
document.getElementById('fileInput').addEventListener('change', receberArquivos);

// 1. Função que recebe os arquivos do input
async function receberArquivos(event) {
    const files = event.target.files;
    if (files.length === 0) return;

    const statusArea = document.getElementById('statusArea');
    statusArea.style.display = 'block';

    for (let file of files) {
        // Evita duplicidade
        if (memoriaArquivos.some(f => f.nomeArquivo === file.name)) {
            continue;
        }

        try {
            const conteudo = await lerArquivoTexto(file);
            const dadosExtraidos = processarXML(conteudo);
            
            // Validação: Se o XML não tiver dados de IR, avisa
            if (dadosExtraidos.length === 0) {
                throw new Error("Arquivo lido, mas sem dados de S-5002 (IRRF). Verifique se é o XML correto.");
            }

            memoriaArquivos.push({
                nomeArquivo: file.name,
                dados: dadosExtraidos
            });

            adicionarNaListaVisual(file.name, true);

        } catch (erro) {
            console.error("Erro no arquivo " + file.name, erro);
            // Mostra o motivo do erro na tela para ajudar você
            adicionarNaListaVisual(file.name, false, erro.message);
        }
    }

    atualizarContador();
    event.target.value = ''; 
}

// 2. Auxiliar para ler arquivo como texto
function lerArquivoTexto(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
}

// 3. O "Cérebro" Atualizado (Mais robusto contra namespaces do eSocial)
function processarXML(xmlTexto) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlTexto, "text/xml");

    // Verifica erros de parsing do navegador
    if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
        throw new Error("O arquivo não é um XML válido ou está corrompido.");
    }
    
    // --- Nova Estratégia de Leitura (Ignora prefixos como 'esocial:') ---
    
    // Tenta pegar o CPF
    let cpf = "";
    const tagsCPF = encontrarTagsPorNome(xmlDoc, "cpfBenef");
    if (tagsCPF.length > 0) cpf = tagsCPF[0].textContent;

    let registros = [];

    // Busca blocos 'infoIR' onde quer que estejam
    const infoIRNodes = encontrarTagsPorNome(xmlDoc, "infoIR");
    
    infoIRNodes.forEach(nodeIR => {
        // Busca Competência (perApur) DENTRO do bloco infoIR
        const tagsPerApur = encontrarTagsPorNome(nodeIR, "perApur");
        const perApur = tagsPerApur.length > 0 ? tagsPerApur[0].textContent : "Indefinido";

        // Busca as bases de cálculo DENTRO deste infoIR
        const basesNodes = encontrarTagsPorNome(nodeIR, "basesApur");
        
        basesNodes.forEach(baseNode => {
            const tagsVrBc = encontrarTagsPorNome(baseNode, "vrBcMensal");
            const tagsVrIrrf = encontrarTagsPorNome(baseNode, "vrIrrfDesc");

            const vrBc = tagsVrBc.length > 0 ? parseFloat(tagsVrBc[0].textContent) : 0;
            const vrIrrf = tagsVrIrrf.length > 0 ? parseFloat(tagsVrIrrf[0].textContent) : 0;

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

// --- Nova Função Auxiliar Poderosa ---
// Encontra tags apenas pelo nome final, ignorando namespaces (esocial:, ns2:, etc)
function encontrarTagsPorNome(elementoPai, nomeTagDesejada) {
    // Se o elementoPai for o documento todo, usa getElementsByTagName("*")
    // Se for um nó específico, também usa getElementsByTagName("*") nele
    const todosElementos = elementoPai.getElementsByTagName("*");
    const encontrados = [];

    for (let i = 0; i < todosElementos.length; i++) {
        const el = todosElementos[i];
        // Verifica se o 'localName' (nome sem prefixo) bate com o que queremos
        if (el.localName === nomeTagDesejada || el.tagName === nomeTagDesejada) {
            encontrados.push(el);
        }
    }
    return encontrados;
}

// 4. Função para Consolidar e Exibir
function calcularTudo() {
    if (memoriaArquivos.length === 0) {
        alert("Nenhum arquivo carregado corretamente.");
        return;
    }

    const consolidado = {};
    let cpfFinal = "---";

    memoriaArquivos.forEach(arquivo => {
        arquivo.dados.forEach(registro => {
            if (registro.cpf) cpfFinal = registro.cpf;
            
            const chave = registro.competencia; // Ex: 2025-10
            
            if (!consolidado[chave]) {
                consolidado[chave] = { base: 0, irrf: 0 };
            }

            // Soma segura usando inteiros (evita erros de centavos do JS)
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

// --- Utilitários ---

function adicionarNaListaVisual(nome, sucesso, msgErro = "") {
    const lista = document.getElementById("listaArquivos");
    const li = document.createElement("li");
    li.className = sucesso ? "ok" : "error";
    
    const textoStatus = sucesso ? '✔ Carregado' : `❌ Erro: ${msgErro}`;
    
    li.innerHTML = `<span>${nome}</span> <span>${textoStatus}</span>`;
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
    if(!cpf || cpf.length < 11) return cpf;
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

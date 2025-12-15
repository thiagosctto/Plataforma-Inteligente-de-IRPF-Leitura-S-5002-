// === ESTADO GLOBAL ===
let memoriaArquivos = []; 

// Listeners
document.getElementById('fileInput').addEventListener('change', receberArquivos);

// 1. Função que recebe os arquivos
async function receberArquivos(event) {
    const files = event.target.files;
    if (files.length === 0) return;

    const statusArea = document.getElementById('statusArea');
    statusArea.style.display = 'block';

    for (let file of files) {
        // Evita duplicidade de nome
        if (memoriaArquivos.some(f => f.nomeArquivo === file.name)) continue;

        try {
            const conteudo = await lerArquivoTexto(file);
            
            // Chama o processador
            const resultado = processarXMLcomFiltro(conteudo);
            
            memoriaArquivos.push({
                nomeArquivo: file.name,
                tipo: resultado.tipo, 
                dados: resultado.registros
            });

            adicionarNaListaVisual(file.name, true, resultado.tipo);

        } catch (erro) {
            console.error("Erro no arquivo " + file.name, erro);
            adicionarNaListaVisual(file.name, false, erro.message);
        }
    }

    atualizarContador();
    event.target.value = ''; 
}

function lerArquivoTexto(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
}

// 2. O Cérebro Ajustado para suas Tags (totApurMen / consolidApurMen)
function processarXMLcomFiltro(xmlTexto) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlTexto, "text/xml");

    if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
        throw new Error("Arquivo corrompido (XML inválido).");
    }

    // --- IDENTIFICAÇÃO DO TIPO ---
    const temS5002 = buscarTags(xmlDoc, "evtIrrfBenef").length > 0;
    const temS1210 = buscarTags(xmlDoc, "evtPgtos").length > 0;

    if (!temS5002 && !temS1210) {
        throw new Error("Arquivo ignorado (Não é S-5002 nem S-1210).");
    }

    // --- EXTRAÇÃO DE DADOS ---
    let registros = [];
    let tipoDetectado = "";
    
    // Tenta pegar CPF
    let cpf = "---";
    const tagsCPF = buscarTags(xmlDoc, "cpfBenef");
    if (tagsCPF.length > 0) cpf = tagsCPF[0].textContent;

    // >> MODO S-5002 (Baseado nas tags que você enviou)
    if (temS5002) {
        tipoDetectado = "S-5002 (IRRF)";
        
        // 1. Tenta achar a DATA (Competência)
        const tagsPerApur = buscarTags(xmlDoc, "perApur");
        const competenciaGeral = tagsPerApur.length > 0 ? tagsPerApur[0].textContent : "Indefinido";

        // 2. Tenta achar o bloco consolidado (Sua tag: consolidApurMen)
        let blocosValores = buscarTags(xmlDoc, "consolidApurMen");
        
        // Se não achar o consolidado, tenta o totalizador (Sua tag: totApurMen)
        if (blocosValores.length === 0) {
            blocosValores = buscarTags(xmlDoc, "totApurMen");
        }

        if (blocosValores.length > 0) {
            blocosValores.forEach(node => {
                // --- AQUI ESTÁ A MÁGICA DAS SUAS TAGS ---
                
                // Rendimento Tributável (Salário Base)
                const vlrRendTrib = obterValor(node, "vlrRendTrib");
                
                // Imposto Retido (A tag do imposto costuma ser vlrCRMen ou vlrIRRF)
                // No seu snippet tem vlrCRMen. Se for 0, é zero.
                const vlrIRRF = obterValor(node, "vlrCRMen"); 

                // INSS (Opcional, mas bom ter)
                const vlrINSS = obterValor(node, "vlrPrevOficial");

                // NOTA: Se quiser somar também o 13º (vlrRendTrib13), podemos somar aqui.
                // Por enquanto vou pegar o rendimento mensal padrão.
                
                registros.push({
                    competencia: competenciaGeral,
                    base: vlrRendTrib,
                    irrf: vlrIRRF,
                    cpf: cpf
                });
            });
        } else {
            // Se chegou aqui, é S-5002 mas não achou as tags de totais. 
            // Tenta o método antigo (basesApur) só por garantia.
            const basesAntigas = buscarTags(xmlDoc, "basesApur");
            basesAntigas.forEach(node => {
                registros.push({
                    competencia: competenciaGeral,
                    base: obterValor(node, "vrBcMensal"),
                    irrf: obterValor(node, "vrIrrfDesc"),
                    cpf: cpf
                });
            });
        }
    }
    
    // >> MODO S-1210 (Pagamento - Mantido caso você use)
    else if (temS1210) {
        tipoDetectado = "S-1210 (Pagto)";
        const tagsInfoPgto = buscarTags(xmlDoc, "infoPgto");
        
        tagsInfoPgto.forEach(node => {
            const dtPgto = obterTexto(node, "dtPgto");
            let competencia = dtPgto.substring(0, 7); 
            let vrLiq = obterValor(node, "vrLiq");
            let vrIrrf = obterValor(node, "vrIrrf"); 

            registros.push({
                competencia: competencia,
                base: vrLiq, 
                irrf: vrIrrf,
                cpf: cpf
            });
        });
    }

    if (registros.length === 0) {
        throw new Error(`Sem valores financeiros (vlrRendTrib/consolidApurMen) encontrados.`);
    }

    return { tipo: tipoDetectado, registros: registros };
}

// --- Funções Auxiliares (Blindadas contra prefixos) ---

function buscarTags(escopo, nomeTag) {
    const resultado = [];
    const todos = escopo.getElementsByTagName("*");
    for (let i = 0; i < todos.length; i++) {
        // Ignora maiúsculas/minúsculas e prefixos (esocial:)
        if ((todos[i].localName.toLowerCase() === nomeTag.toLowerCase()) || 
            (todos[i].tagName.toLowerCase() === nomeTag.toLowerCase())) {
            resultado.push(todos[i]);
        }
    }
    return resultado;
}

function obterTexto(noPai, nomeTag) {
    const tags = buscarTags(noPai, nomeTag);
    return tags.length > 0 ? tags[0].textContent : "";
}

function obterValor(noPai, nomeTag) {
    const texto = obterTexto(noPai, nomeTag);
    return texto ? parseFloat(texto) : 0;
}

// --- Renderização e Interface ---
function adicionarNaListaVisual(nome, sucesso, msgExtra = "") {
    const lista = document.getElementById("listaArquivos");
    const li = document.createElement("li");
    li.className = sucesso ? "ok" : "error";
    
    let htmlStatus = sucesso 
        ? `<span style="background:#e8f5e9; color:#2e7d32; padding:2px 8px; border-radius:4px; font-size:0.8em; font-weight:bold;">${msgExtra}</span>`
        : `<span style="color:#c62828; font-size:0.9em;">${msgExtra}</span>`;
    
    li.innerHTML = `<span>${nome}</span> ${htmlStatus}`;
    lista.appendChild(li);
}

function calcularTudo() {
    if (memoriaArquivos.length === 0) {
        alert("Nenhum arquivo válido carregado.");
        return;
    }

    const consolidado = {};
    let cpfFinal = "---";

    memoriaArquivos.forEach(arquivo => {
        arquivo.dados.forEach(registro => {
            if (registro.cpf && registro.cpf.length > 5) cpfFinal = registro.cpf;
            
            const chave = registro.competencia;
            if (!consolidado[chave]) consolidado[chave] = { base: 0, irrf: 0 };

            consolidado[chave].base += Math.round(registro.base * 100);
            consolidado[chave].irrf += Math.round(registro.irrf * 100);
        });
    });

    renderizarTabela(consolidado, cpfFinal);
}

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

function atualizarContador() { document.getElementById("contadorArquivos").textContent = memoriaArquivos.length; }
function limparMemoria() { memoriaArquivos = []; document.getElementById("listaArquivos").innerHTML = ""; document.getElementById("output").style.display = "none"; document.getElementById("statusArea").style.display = "none"; atualizarContador(); }
function formatarMoeda(v) { return (v/100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function formatarCPF(v) { if(!v) return ""; return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4"); }

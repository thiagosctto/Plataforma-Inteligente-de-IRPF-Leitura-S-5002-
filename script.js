let memoriaArquivos = []; 

// Listeners
document.getElementById('fileInput').addEventListener('change', receberArquivos);

// Funções de Inicialização
const dataHoje = new Date();
document.getElementById('anoCalendario').textContent = dataHoje.getFullYear() - 1;
document.getElementById('anoExercicio').textContent = dataHoje.getFullYear();
document.getElementById('dataAtual').textContent = dataHoje.toLocaleDateString('pt-BR');

async function receberArquivos(event) {
    const files = event.target.files;
    if (files.length === 0) return;

    document.getElementById('statusArea').style.display = 'block';

    for (let file of files) {
        if (memoriaArquivos.some(f => f.nomeArquivo === file.name)) continue;

        try {
            const conteudo = await lerArquivoTexto(file);
            const dados = processarXMLCompleto(conteudo);
            
            memoriaArquivos.push({ nome: file.name, dados: dados });
            adicionarNaListaVisual(file.name, true);
        } catch (erro) {
            adicionarNaListaVisual(file.name, false);
            console.error(erro);
        }
    }
    document.getElementById("contadorArquivos").textContent = memoriaArquivos.length;
    event.target.value = ''; 
}

function lerArquivoTexto(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsText(file);
    });
}

function processarXMLCompleto(xmlTexto) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlTexto, "text/xml");

    // Identificação
    const cpf = obterTexto(xmlDoc, "cpfBenef");
    const nome = obterTexto(xmlDoc, "nmBenefic"); // Tentativa de pegar nome se existir

    // Valores Acumuladores
    let baseSalario = 0;
    let inss = 0;
    let irrf = 0;
    
    let base13 = 0;
    let irrf13 = 0;

    // Busca blocos de totais (consolidApurMen ou totApurMen)
    const blocos = buscarTags(xmlDoc, "consolidApurMen");
    const blocosTot = buscarTags(xmlDoc, "totApurMen");
    const todosBlocos = [...blocos, ...blocosTot];

    todosBlocos.forEach(node => {
        // --- RENDIMENTOS TRIBUTÁVEIS (Linha 1) ---
        baseSalario += obterValor(node, "vlrRendTrib"); 

        // --- PREVIDÊNCIA OFICIAL (Linha 2) ---
        // A tag vlrPrevOficial é a correta para INSS descontado
        inss += obterValor(node, "vlrPrevOficial");

        // --- IMPOSTO RETIDO (Linha 5) ---
        // A tag vlrCRMen é o valor do IRRF efetivamente descontado
        irrf += obterValor(node, "vlrCRMen");

        // --- 13º SALÁRIO (Bloco 5 - Exclusiva) ---
        base13 += obterValor(node, "vlrRendTrib13");
        irrf13 += obterValor(node, "vlrCR13Men");
    });

    return { cpf, nome, baseSalario, inss, irrf, base13, irrf13 };
}

function gerarDocumentoOficial() {
    if (memoriaArquivos.length === 0) return alert("Nenhum arquivo importado!");

    // Totais Anuais
    let totalSalario = 0;
    let totalINSS = 0;
    let totalIRRF = 0;
    let total13 = 0;
    let totalIRRF13 = 0;
    let cpfFinal = "";

    // Soma tudo o que está na memória
    memoriaArquivos.forEach(arq => {
        const d = arq.dados;
        if(d.cpf) cpfFinal = d.cpf;
        
        totalSalario += d.baseSalario;
        totalINSS += d.inss;
        totalIRRF += d.irrf;
        total13 += d.base13;
        totalIRRF13 += d.irrf13;
    });

    // --- PREENCHIMENTO DO FORMULÁRIO HTML --- //
    
    // Cabeçalho
    document.getElementById('docEmpresa').textContent = document.getElementById('empresaNome').value || "EMPRESA NÃO INFORMADA";
    document.getElementById('docCNPJ').textContent = document.getElementById('empresaCnpj').value || "";
    document.getElementById('docCPF').textContent = formatarCPF(cpfFinal);
    document.getElementById('docNome').textContent = "FUNCIONÁRIO CPF " + cpfFinal; // Nome é difícil vir no S-5002

    // Bloco 3 - Tributáveis
    preencherValor('linha3_01', totalSalario); // Total Rendimentos
    preencherValor('linha3_02', totalINSS);    // Contribuição Prev.
    preencherValor('linha3_05', totalIRRF);    // Imposto Retido

    // Bloco 5 - Tributação Exclusiva
    preencherValor('linha5_01', total13);      // 13º Salário
    preencherValor('linha5_02', totalIRRF13);  // IRRF sobre 13º

    // Visualização
    document.getElementById('documentoOficial').style.display = 'block';
    document.getElementById('btnImprimir').style.display = 'block';
    
    // Rola a tela até o documento
    document.getElementById('documentoOficial').scrollIntoView({ behavior: 'smooth' });
}

// --- UTILITÁRIOS ---
function buscarTags(escopo, nomeTag) {
    const resultado = [];
    const todos = escopo.getElementsByTagName("*");
    for (let i = 0; i < todos.length; i++) {
        if (todos[i].localName.toLowerCase() === nomeTag.toLowerCase()) resultado.push(todos[i]);
    }
    return resultado;
}

function obterTexto(escopo, tag) {
    const els = buscarTags(escopo, tag);
    return els.length > 0 ? els[0].textContent : "";
}

function obterValor(escopo, tag) {
    const val = obterTexto(escopo, tag);
    return val ? parseFloat(val) : 0;
}

function preencherValor(idElemento, valorNumerico) {
    document.getElementById(idElemento).textContent = valorNumerico.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatarCPF(v) { if(!v) return ""; return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4"); }

function adicionarNaListaVisual(nome, ok) {
    const li = document.createElement("li");
    li.className = ok ? "ok" : "error";
    li.textContent = ok ? `✔ ${nome}` : `❌ ${nome}`;
    document.getElementById("listaArquivos").appendChild(li);
}

function limparMemoria() {
    memoriaArquivos = [];
    document.getElementById("listaArquivos").innerHTML = "";
    document.getElementById("statusArea").style.display = "none";
    document.getElementById("documentoOficial").style.display = "none";
    document.getElementById("btnImprimir").style.display = "none";
}

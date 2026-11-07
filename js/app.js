// ================== REGRAS DE NEGÓCIO POR NICHO ==================
const REGRAS_NICHOS = {
  '1': {
    nome: 'Alimentos',
    estoqueSeguranca: 15,
    alerta: '⚠️ Alerta de Rotatividade Alta — fique atento às validades! (controle por lote com prioridade FEFO)'
  },
  '2': {
    nome: 'Vestuários',
    estoqueSeguranca: 3,
    alerta: '🏷️ Modo Curadoria de Moda — grade de tamanhos, medidas e cores'
  },
  '3': {
    nome: 'Cosméticos',
    estoqueSeguranca: 8,
    alerta: '✨ Modo Lote e Fragrâncias ativo'
  },
  '4': {
    nome: 'Varejo',
    estoqueSeguranca: 5,
    alerta: '📦 Modo Varejo Padrão'
  }
};

// ================== CHAVES DE ARMAZENAMENTO ==================
const LS_EMPRESAS = 'sgse_empresas_v1';

function chaveDados(empresaId) {
  return 'sgse_dados_v1_' + empresaId;
}

// ================== ESTADO GLOBAL ==================
let empresas = [];
let empresaAtual = null;
let modoCadastro = 'nova';
let nichoSelecionado = null;

let limiteBaixoPadrao = 5;
let estoque = [];
let movimentacoes = [];
let fornecedores = [];
let clientes = [];
let compras = [];

// ================== REFERÊNCIAS DO DOM: LOGIN ==================
const telaCadastro = document.getElementById('tela-cadastro');
const appContainer = document.getElementById('app-container');
const inputCeo = document.getElementById('input-ceo');
const inputEmpresa = document.getElementById('input-empresa');
const inputSenhaNova = document.getElementById('input-senha-nova');
const inputSenhaNovaConfirma = document.getElementById('input-senha-nova-confirma');
const inputPalavraChave = document.getElementById('input-palavra-chave');
const selectEmpresaLogin = document.getElementById('select-empresa-login');
const inputSenhaLogin = document.getElementById('input-senha-login');
const erroCadastroEl = document.getElementById('erro-cadastro');
const alertaNichoEl = document.getElementById('alerta-nicho');
const boasVindasBannerEl = document.getElementById('boas-vindas-banner');
const tituloApp = document.querySelector('.title-block h1');
const subtituloApp = document.querySelector('.title-block p');

// ================== REFERÊNCIAS DO DOM: ESTOQUE ==================
const inputNome = document.getElementById('nome');
const inputCategoria = document.getElementById('categoria');
const inputPreco = document.getElementById('preco');
const inputQtd = document.getElementById('qtd');
const inputEstoqueMinimo = document.getElementById('estoqueMinimo');
const inputBusca = document.getElementById('busca');
const listaCategorias = document.getElementById('lista-categorias');
const erroMsg = document.getElementById('erro-msg');
const flashMsg = document.getElementById('flash-msg');
const listaContainer = document.getElementById('lista-container');
const valorTotalEl = document.getElementById('valor-total');
const btnCadastrar = document.getElementById('btn-cadastrar');
const alertaResumo = document.getElementById('alerta-resumo');
const historicoContainer = document.getElementById('historico-container');
const filtroProdutoEl = document.getElementById('filtro-produto');
const analiseEntradasEl = document.getElementById('analise-entradas');
const analiseSaidasEl = document.getElementById('analise-saidas');
const analiseSaldoEl = document.getElementById('analise-saldo');
const analiseListaContainer = document.getElementById('analise-lista-container');
const filtrosGradeEl = document.getElementById('filtros-grade');
const filtroCorEl = document.getElementById('filtro-cor');
const filtroTamanhoEl = document.getElementById('filtro-tamanho');
const painelFefoEl = document.getElementById('painel-fefo');

// ================== FUNÇÕES UTILITÁRIAS ==================

function padronizarTexto(texto) {
  return texto
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)([a-zà-ú])/g, (m, sep, letra) => sep + letra.toUpperCase());
}

function escapeHtml(valor) {
  return String(valor).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function formatarDataBR(dataISO) {
  if (!dataISO) return '';

  const partes = dataISO.split('-');

  if (partes.length !== 3) return dataISO;

  return partes[2] + '/' + partes[1] + '/' + partes[0];
}

function formatarDataHora(timestamp) {
  const d = new Date(timestamp);

  return d.toLocaleDateString('pt-BR') + ' ' +
    d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
}

function diasParaVencer(validadeISO) {
  if (!validadeISO) return null;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const dataVal = new Date(validadeISO + 'T00:00:00');

  return Math.round((dataVal - hoje) / 86400000);
}

function nichoEhAlimentos() {
  return !!empresaAtual && empresaAtual.nichoId === '1';
}

function nichoEhVestuario() {
  return !!empresaAtual && empresaAtual.nichoId === '2';
}

function limiteDe(produto) {
  return (
    produto.estoqueMinimo === undefined ||
    produto.estoqueMinimo === null ||
    isNaN(produto.estoqueMinimo)
  ) ? limiteBaixoPadrao : produto.estoqueMinimo;
}

function produtoParado(p) {
  if (!p.criadoEm || !(p.quantidade > 0)) return false;

  const diasEmEstoque = (Date.now() - p.criadoEm) / 86400000;

  const teveSaida = movimentacoes.some(
    (m) => m.tipo === 'saida' && m.nome === p.nome
  );

  return diasEmEstoque > 30 && !teveSaida;
}

function atualizarListaCategorias() {
  const categorias = [
    ...new Set(estoque.map((p) => p.categoria).filter(Boolean))
  ].sort();

  listaCategorias.innerHTML = categorias
    .map((c) => `<option value="${escapeHtml(c)}"></option>`)
    .join('');
}
// ================== PERSISTÊNCIA: ÍNDICE DE EMPRESAS ==================

function carregarEmpresas() {
  try {
    const salvo = localStorage.getItem(LS_EMPRESAS);
    empresas = salvo ? JSON.parse(salvo) : [];
  } catch (e) {
    console.error('Erro ao ler índice de empresas:', e);
    empresas = [];
  }
}

function salvarEmpresas() {
  try {
    localStorage.setItem(LS_EMPRESAS, JSON.stringify(empresas));
  } catch (e) {
    console.error('Erro ao salvar índice de empresas:', e);
    mostrarErroCadastro('Não foi possível salvar os dados agora.');
  }
}

function atualizarSelectEmpresasLogin() {
  if (empresas.length === 0) {
    selectEmpresaLogin.innerHTML =
      '<option value="">Nenhuma empresa cadastrada ainda</option>';
    return;
  }

  selectEmpresaLogin.innerHTML = empresas
    .map((e) => `<option value="${e.id}"></option>`)
    .join('');

  selectEmpresaLogin.querySelectorAll('option').forEach((opt, i) => {
    opt.textContent = empresas[i].empresaNome + ' — ' + empresas[i].nicho;
  });
}

// ================== PERSISTÊNCIA: DADOS DE CADA EMPRESA ==================

function carregarDadosEmpresa(empresaId) {
  try {
    const salvo = localStorage.getItem(chaveDados(empresaId));
    const dados = salvo ? JSON.parse(salvo) : {};

    estoque = dados.estoque || [];
    movimentacoes = dados.movimentacoes || [];
    fornecedores = dados.fornecedores || [];
    clientes = dados.clientes || [];
    compras = dados.compras || [];
  } catch (e) {
    console.error('Erro ao ler dados da empresa:', e);

    estoque = [];
    movimentacoes = [];
    fornecedores = [];
    clientes = [];
    compras = [];
  }
}

function salvarDadosEmpresa() {
  if (!empresaAtual) return;

  try {
    localStorage.setItem(
      chaveDados(empresaAtual.id),
      JSON.stringify({
        estoque,
        movimentacoes,
        fornecedores,
        clientes,
        compras
      })
    );
  } catch (e) {
    console.error('Erro ao salvar dados da empresa:', e);
    mostrarErro('Não foi possível salvar os dados agora.');
  }
}

function salvarEstoque() {
  salvarDadosEmpresa();
}

function salvarMovimentacoes() {
  salvarDadosEmpresa();
}

// ================== MENSAGENS DE FEEDBACK: LOGIN ==================

function mostrarErroCadastro(texto) {
  erroCadastroEl.textContent = texto;
  erroCadastroEl.style.display = 'block';
}

function esconderErroCadastro() {
  erroCadastroEl.style.display = 'none';
}

// ================== MENSAGENS DE FEEDBACK: ESTOQUE ==================

function esconderMensagens() {
  erroMsg.style.display = 'none';
  flashMsg.style.display = 'none';
}

function mostrarErro(texto) {
  esconderMensagens();
  erroMsg.textContent = texto;
  erroMsg.style.display = 'block';
}

function mostrarFlash(texto) {
  esconderMensagens();
  flashMsg.textContent = texto;
  flashMsg.style.display = 'block';

  setTimeout(() => {
    flashMsg.style.display = 'none';
  }, 2200);
}

// ================== ALTERNÂNCIA ENTRE CADASTRO E LOGIN ==================

document.querySelectorAll('.modo-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.modo-btn').forEach((b) => {
      b.classList.remove('ativo');
    });

    btn.classList.add('ativo');
    modoCadastro = btn.getAttribute('data-modo');

    document.getElementById('form-nova-empresa').style.display =
      modoCadastro === 'nova' ? 'block' : 'none';

    document.getElementById('form-login-empresa').style.display =
      modoCadastro === 'login' ? 'block' : 'none';

    esconderErroCadastro();

    if (modoCadastro === 'login') {
      atualizarSelectEmpresasLogin();
    }

    fecharRecuperarSenha();
  });
});

// ================== SELEÇÃO DO SEGMENTO ==================

document.querySelectorAll('.nicho-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nicho-btn').forEach((b) => {
      b.classList.remove('selecionado');
    });

    btn.classList.add('selecionado');
    nichoSelecionado = btn.getAttribute('data-nicho');
  });
});

// ================== LIMPAR ERROS AO DIGITAR ==================

[
  inputCeo,
  inputEmpresa,
  inputSenhaNova,
  inputSenhaNovaConfirma,
  inputSenhaLogin
].forEach((el) => {
  el.addEventListener('input', esconderErroCadastro);
});

    // ================== CRIAÇÃO DE NOVA EMPRESA (com isolamento de estoque) ==================

    function criarEmpresa() {
      esconderErroCadastro();

      const ceoDigitado = inputCeo.value.trim();
      const empresaDigitada = inputEmpresa.value.trim();
      const senha = inputSenhaNova.value;
      const senhaConfirma = inputSenhaNovaConfirma.value;
      const palavraChave = inputPalavraChave.value.trim();

      if (ceoDigitado === '' || empresaDigitada === '') {
        mostrarErroCadastro('Informe seu nome e o nome da empresa para continuar.');
        return;
      }
      if (!nichoSelecionado) {
        mostrarErroCadastro('Selecione o nicho da empresa.');
        return;
      }
      if (senha === '') {
        mostrarErroCadastro('Crie uma senha de acesso para proteger os dados da empresa.');
        return;
      }
      if (senha !== senhaConfirma) {
        mostrarErroCadastro('As senhas não conferem. Digite novamente.');
        return;
      }
      if (palavraChave === '') {
        mostrarErroCadastro('Crie uma palavra-chave de segurança, ela será usada para recuperar a senha.');
        return;
      }

      const nomeEmpresaPadronizado = padronizarTexto(empresaDigitada);
      const jaExiste = empresas.some(
        (e) => e.empresaNome.toLowerCase() === nomeEmpresaPadronizado.toLowerCase()
      );

      if (jaExiste) {
        mostrarErroCadastro('Já existe uma empresa cadastrada com esse nome. Use "Já tenho empresa" para acessar.');
        return;
      }

      const nichoInfo = REGRAS_NICHOS[nichoSelecionado] || REGRAS_NICHOS['4'];

      const novaEmpresa = {
        id: 'emp_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
        ceo: padronizarTexto(ceoDigitado),
        empresaNome: nomeEmpresaPadronizado,
        nicho: nichoInfo.nome,
        nichoId: nichoSelecionado,
        senha: senha,
        palavraChave: palavraChave,
        estoqueSeguranca: nichoInfo.estoqueSeguranca,
        alertaNicho: nichoInfo.alerta,
        criadoEm: Date.now(),
      };

      empresas.push(novaEmpresa);
      salvarEmpresas();

      // Cria um estoque separado para a nova empresa.
      estoque = [];
      movimentacoes = [];
      fornecedores = [];
      clientes = [];
      compras = [];

      empresaAtual = novaEmpresa;
      salvarDadosEmpresa();

      logarEmpresa(novaEmpresa);
    }

    // ================== LOGIN EM EMPRESA JÁ CADASTRADA ==================

    function autenticarEmpresa() {
      esconderErroCadastro();

      const id = selectEmpresaLogin.value;
      const senha = inputSenhaLogin.value;

      if (!id) {
        mostrarErroCadastro('Selecione uma empresa cadastrada.');
        return;
      }

      const empresa = empresas.find((e) => e.id === id);

      if (!empresa) {
        mostrarErroCadastro('Empresa não encontrada.');
        return;
      }

      if (empresa.senha !== senha) {
        mostrarErroCadastro('Senha incorreta. Verifique e tente novamente.');
        return;
      }

      carregarDadosEmpresa(empresa.id);
      empresaAtual = empresa;
      logarEmpresa(empresa);
    }

    // ================== EXCLUSÃO DE EMPRESA CADASTRADA ==================

    function excluirEmpresa() {
      esconderErroCadastro();

      const id = selectEmpresaLogin.value;
      const senha = inputSenhaLogin.value;

      if (!id) {
        mostrarErroCadastro('Selecione uma empresa cadastrada para excluir.');
        return;
      }

      const empresa = empresas.find((e) => e.id === id);

      if (!empresa) {
        mostrarErroCadastro('Empresa não encontrada.');
        return;
      }

      if (empresa.senha !== senha) {
        mostrarErroCadastro('Senha incorreta. Informe a senha correta para confirmar a exclusão.');
        return;
      }

      const confirmar = window.confirm(
        `Tem certeza que deseja excluir a empresa "${empresa.empresaNome}"? Todos os dados (estoque, movimentações, fornecedores, clientes e compras) serão apagados permanentemente e essa ação não pode ser desfeita.`
      );

      if (!confirmar) return;

      empresas = empresas.filter((e) => e.id !== id);
      salvarEmpresas();

      try {
        localStorage.removeItem(chaveDados(id));
      } catch (e) {
        console.error('Erro ao remover dados da empresa:', e);
      }

      inputSenhaLogin.value = '';
      atualizarSelectEmpresasLogin();
      mostrarErroCadastro('Empresa excluída com sucesso.');
    }

    // ================== RECUPERAÇÃO DE SENHA ESQUECIDA ==================

    const grupoSenhaLoginEl = document.getElementById('grupo-senha-login');
    const linkEsqueciSenhaEl = document.getElementById('link-esqueci-senha');
    const formRecuperarSenhaEl = document.getElementById('form-recuperar-senha');
    const inputSenhaRecuperarNova = document.getElementById('input-senha-recuperar-nova');
    const inputSenhaRecuperarConfirma = document.getElementById('input-senha-recuperar-confirma');
    const inputPalavraChaveRecuperar = document.getElementById('input-palavra-chave-recuperar');
    const labelPalavraChaveRecuperar = document.getElementById('label-palavra-chave-recuperar');

    function abrirRecuperarSenha() {
      esconderErroCadastro();

      const id = selectEmpresaLogin.value;

      if (!id) {
        mostrarErroCadastro('Selecione uma empresa cadastrada para redefinir a senha.');
        return;
      }

      const empresa = empresas.find((e) => e.id === id);
      const temPalavraChave = !!(
        empresa && empresa.palavraChave && empresa.palavraChave.trim() !== ''
      );

      if (temPalavraChave) {
        labelPalavraChaveRecuperar.textContent = 'Palavra-chave de Segurança';
        inputPalavraChaveRecuperar.placeholder = 'Informe a palavra-chave cadastrada';
      } else {
        labelPalavraChaveRecuperar.textContent =
          'Esta empresa é antiga e ainda não tem palavra-chave — crie uma agora';
        inputPalavraChaveRecuperar.placeholder = 'Crie uma palavra-chave para o futuro';
      }

      grupoSenhaLoginEl.style.display = 'none';
      linkEsqueciSenhaEl.style.display = 'none';
      formRecuperarSenhaEl.style.display = 'block';
    }

    function fecharRecuperarSenha() {
      esconderErroCadastro();
      inputPalavraChaveRecuperar.value = '';
      inputSenhaRecuperarNova.value = '';
      inputSenhaRecuperarConfirma.value = '';

      labelPalavraChaveRecuperar.textContent = 'Palavra-chave de Segurança';
      inputPalavraChaveRecuperar.placeholder = 'Informe a palavra-chave cadastrada';

      formRecuperarSenhaEl.style.display = 'none';
      grupoSenhaLoginEl.style.display = 'block';
      linkEsqueciSenhaEl.style.display = 'block';
    }

    function redefinirSenha() {
      esconderErroCadastro();

      const id = selectEmpresaLogin.value;
      const palavraChaveDigitada = inputPalavraChaveRecuperar.value.trim();
      const novaSenha = inputSenhaRecuperarNova.value;
      const confirmaSenha = inputSenhaRecuperarConfirma.value;

      if (!id) {
        mostrarErroCadastro('Selecione uma empresa cadastrada.');
        return;
      }

      const empresa = empresas.find((e) => e.id === id);

      if (!empresa) {
        mostrarErroCadastro('Empresa não encontrada.');
        return;
      }

      if (palavraChaveDigitada === '') {
        mostrarErroCadastro('Informe a palavra-chave de segurança cadastrada.');
        return;
      }

      const temPalavraChave = !!(
        empresa.palavraChave && empresa.palavraChave.trim() !== ''
      );

      if (temPalavraChave) {
        if (palavraChaveDigitada.toLowerCase() !== empresa.palavraChave.toLowerCase()) {
          mostrarErroCadastro('Palavra-chave incorreta. Não foi possível redefinir a senha.');
          return;
        }
      } else {
        empresa.palavraChave = palavraChaveDigitada;
      }

      if (novaSenha === '') {
        mostrarErroCadastro('Crie uma nova senha de acesso.');
        return;
      }

      if (novaSenha !== confirmaSenha) {
        mostrarErroCadastro('As senhas não conferem. Digite novamente.');
        return;
      }

      empresa.senha = novaSenha;
      salvarEmpresas();

      inputPalavraChaveRecuperar.value = '';
      inputSenhaRecuperarNova.value = '';
      inputSenhaRecuperarConfirma.value = '';

      formRecuperarSenhaEl.style.display = 'none';
      grupoSenhaLoginEl.style.display = 'block';
      linkEsqueciSenhaEl.style.display = 'block';

      carregarDadosEmpresa(empresa.id);
      empresaAtual = empresa;
      logarEmpresa(empresa);
    }

    linkEsqueciSenhaEl.addEventListener('click', abrirRecuperarSenha);
    document.getElementById('btn-cancelar-recuperar').addEventListener('click', fecharRecuperarSenha);
    document.getElementById('btn-redefinir-senha').addEventListener('click', redefinirSenha);

    [inputSenhaRecuperarNova, inputSenhaRecuperarConfirma].forEach((el) => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          redefinirSenha();
        }
      });
    });

    // Aplica os dados da empresa autenticada à interface e libera o acesso ao sistema
    function logarEmpresa(empresa) {
      limiteBaixoPadrao = empresa.estoqueSeguranca;
      inputEstoqueMinimo.placeholder = String(limiteBaixoPadrao);

      tituloApp.textContent = empresa.empresaNome;
      subtituloApp.textContent =
        `CEO: ${empresa.ceo} · Nicho: ${empresa.nicho} · Estoque mínimo: ${empresa.estoqueSeguranca} un.`;

      boasVindasBannerEl.textContent = `Bem-vindo(a), ${empresa.ceo}! Bom te ver por aqui.`;
      boasVindasBannerEl.style.display = 'flex';
      setTimeout(() => {
        boasVindasBannerEl.style.display = 'none';
      }, 5000);

      alertaNichoEl.textContent = empresa.alertaNicho;
      alertaNichoEl.style.display = 'flex';

      aplicarCamposNicho();

      telaCadastro.style.display = 'none';
      appContainer.style.display = 'block';

      atualizarSelectFornecedoresNoProduto();
      atualizarSelectFornecedoresCompras();
      atualizarSelectClientesFEFO();

      renderLista();
      renderFornecedores();
      renderClientes();
      renderCompras();
    }

    // Mostra/oculta os campos condicionais do formulário conforme o nicho da empresa logada
    function aplicarCamposNicho() {
      document.querySelectorAll('.campo-alimentos').forEach((el) => {
        el.style.display = nichoEhAlimentos() ? 'block' : 'none';
      });

      document.querySelectorAll('.campo-vestuario').forEach((el) => {
        el.style.display = nichoEhVestuario() ? 'block' : 'none';
      });

      painelFefoEl.style.display = nichoEhAlimentos() ? 'block' : 'none';
      filtrosGradeEl.style.display = nichoEhVestuario() ? 'flex' : 'none';
    }

    // ================== LOGOUT ==================

    document.getElementById('btn-logout').addEventListener('click', () => {
      empresaAtual = null;
      estoque = [];
      movimentacoes = [];
      fornecedores = [];
      clientes = [];
      compras = [];

      appContainer.style.display = 'none';
      telaCadastro.style.display = 'flex';

      inputCeo.value = '';
      inputEmpresa.value = '';
      inputSenhaNova.value = '';
      inputSenhaNovaConfirma.value = '';
      inputPalavraChave.value = '';
      inputSenhaLogin.value = '';

      nichoSelecionado = null;
      document.querySelectorAll('.nicho-btn').forEach((b) => b.classList.remove('selecionado'));

      fecharRecuperarSenha();
      atualizarSelectEmpresasLogin();
    });

    document.getElementById('btn-criar-empresa').addEventListener('click', criarEmpresa);
    document.getElementById('btn-login-empresa').addEventListener('click', autenticarEmpresa);
    document.getElementById('btn-excluir-empresa').addEventListener('click', excluirEmpresa);

    [inputCeo, inputEmpresa, inputSenhaNova, inputSenhaNovaConfirma, inputPalavraChave].forEach((el) => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          criarEmpresa();
        }
      });
    });

    inputSenhaLogin.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        autenticarEmpresa();
      }
    });
    // ================== HISTÓRICO / MOVIMENTAÇÕES ==================

    // Registra uma movimentação de entrada ou saída
    function registrarMovimentacao(tipo, nome, quantidade, clienteNome) {
      movimentacoes.unshift({
        tipo,
        nome,
        quantidade,
        timestamp: Date.now(),
        cliente: clienteNome || null
      });

      if (movimentacoes.length > 200) {
        movimentacoes.length = 200;
      }

      salvarMovimentacoes();
      renderHistorico();
      atualizarFiltroProdutos();
      renderAnaliseProduto();
    }

    function renderHistorico() {
      if (movimentacoes.length === 0) {
        historicoContainer.innerHTML =
          '<div class="vazio">Nenhuma movimentação registrada ainda.</div>';
        return;
      }

      historicoContainer.innerHTML = movimentacoes.slice(0, 50).map((m) => `
        <div class="historico-item">
          <span class="historico-tipo ${m.tipo}">
            ${m.tipo === 'entrada' ? '+ Entrada' : '− Saída'}
          </span>
          <span class="historico-nome"></span>
          <span class="historico-data"></span>
        </div>
      `).join('');

      historicoContainer.querySelectorAll('.historico-nome').forEach((el, i) => {
        const m = movimentacoes[i];
        el.textContent = m.nome + (m.cliente ? ' · Cliente: ' + m.cliente : '');
      });

      historicoContainer.querySelectorAll('.historico-data').forEach((el, i) => {
        el.textContent = formatarDataHora(movimentacoes[i].timestamp);
      });
    }

    // ================== ANÁLISE DE ENTRADAS E SAÍDAS POR PRODUTO ==================

    function atualizarFiltroProdutos() {
      const nomesEstoque = estoque.map((p) => p.nome);
      const nomesMovs = movimentacoes.map((m) => m.nome);
      const nomes = [...new Set([...nomesEstoque, ...nomesMovs])].sort();

      const valorAtual = filtroProdutoEl.value;

      filtroProdutoEl.innerHTML =
        '<option value="">Todos os produtos</option>' +
        nomes.map((n) => `<option value="${escapeHtml(n)}"></option>`).join('');

      filtroProdutoEl.querySelectorAll('option[value]:not([value=""])')
        .forEach((opt, i) => {
          opt.textContent = nomes[i];
        });

      if (nomes.includes(valorAtual)) {
        filtroProdutoEl.value = valorAtual;
      }
    }

    function renderAnaliseProduto() {
      const nomeSelecionado = filtroProdutoEl.value;

      const movsFiltradas = nomeSelecionado
        ? movimentacoes.filter((m) => m.nome === nomeSelecionado)
        : movimentacoes;

      const entradas = movsFiltradas
        .filter((m) => m.tipo === 'entrada')
        .reduce((soma, m) => soma + m.quantidade, 0);

      const saidas = movsFiltradas
        .filter((m) => m.tipo === 'saida')
        .reduce((soma, m) => soma + m.quantidade, 0);

      const saldo = entradas - saidas;

      analiseEntradasEl.textContent = entradas;
      analiseSaidasEl.textContent = saidas;
      analiseSaldoEl.textContent = (saldo > 0 ? '+' : '') + saldo;

      if (movsFiltradas.length === 0) {
        analiseListaContainer.innerHTML =
          '<div class="vazio">Nenhuma movimentação encontrada para esse filtro.</div>';
        return;
      }

      analiseListaContainer.innerHTML = movsFiltradas.slice(0, 50).map((m) => `
        <div class="historico-item">
          <span class="historico-tipo ${m.tipo}">
            ${m.tipo === 'entrada' ? '+ Entrada' : '− Saída'}
          </span>
          <span class="historico-nome"></span>
          <span class="historico-data">
            ${formatarDataHora(m.timestamp)} · ${m.quantidade} un.
          </span>
        </div>
      `).join('');

      analiseListaContainer.querySelectorAll('.historico-nome').forEach((el, i) => {
        el.textContent = movsFiltradas[i].nome;
      });
    }

    filtroProdutoEl.addEventListener('change', renderAnaliseProduto);

    // ================== ALERTAS DE ESTOQUE ==================

    function atualizarAlertaResumo() {
      const partes = [];

      const criticos = estoque.filter((p) => p.quantidade <= limiteDe(p));

      if (criticos.length > 0) {
        partes.push(
          `⚠️ ${criticos.length} produto${criticos.length > 1 ? 's' : ''} precisam de reposição urgente`
        );
      }

      if (nichoEhAlimentos()) {
        const vencendo = estoque.filter((p) => {
          const dias = diasParaVencer(p.validade);
          return p.quantidade > 0 && dias !== null && dias <= 7;
        });

        if (vencendo.length > 0) {
          partes.push(
            `⏰ ${vencendo.length} lote${vencendo.length > 1 ? 's' : ''} com validade próxima ou vencida`
          );
        }

        const parados = estoque.filter(produtoParado);

        if (parados.length > 0) {
          partes.push(
            `🐌 ${parados.length} produto${parados.length > 1 ? 's' : ''} parado(s) há mais de 30 dias`
          );
        }
      }

      if (partes.length > 0) {
        alertaResumo.style.display = 'flex';
        alertaResumo.textContent = partes.join('  ·  ');
      } else {
        alertaResumo.style.display = 'none';
      }
    }

    // ================== ALTERAÇÃO MANUAL DO ESTOQUE ==================

    function alterarQuantidade(id, delta) {
      const p = estoque.find((x) => x.id === id);
      if (!p) return;

      if (delta < 0) {
        if (p.quantidade <= 0) return;

        p.quantidade -= 1;
        registrarMovimentacao('saida', p.nome, 1);
      } else {
        p.quantidade += 1;
        registrarMovimentacao('entrada', p.nome, 1);
      }

      salvarEstoque();
      renderLista();
    }

    // ================== FILTROS DE COR E TAMANHO ==================

    function atualizarFiltrosGrade() {
      if (!nichoEhVestuario()) return;

      const cores = [...new Set(estoque.map((p) => p.cor).filter(Boolean))].sort();
      const tamanhos = [...new Set(estoque.map((p) => p.tamanho).filter(Boolean))].sort();

      const corAtual = filtroCorEl.value;
      const tamAtual = filtroTamanhoEl.value;

      filtroCorEl.innerHTML =
        '<option value="">Todas as cores</option>' +
        cores.map((c) => `<option value="${escapeHtml(c)}"></option>`).join('');

      filtroCorEl.querySelectorAll('option[value]:not([value=""])')
        .forEach((opt, i) => {
          opt.textContent = cores[i];
        });

      filtroTamanhoEl.innerHTML =
        '<option value="">Todos os tamanhos</option>' +
        tamanhos.map((t) => `<option value="${escapeHtml(t)}"></option>`).join('');

      filtroTamanhoEl.querySelectorAll('option[value]:not([value=""])')
        .forEach((opt, i) => {
          opt.textContent = tamanhos[i];
        });

      if (cores.includes(corAtual)) filtroCorEl.value = corAtual;
      if (tamanhos.includes(tamAtual)) filtroTamanhoEl.value = tamAtual;
    }

    filtroCorEl.addEventListener('change', renderLista);
    filtroTamanhoEl.addEventListener('change', renderLista);
    
    // ================== RENDERIZAÇÃO DA LISTA DE PRODUTOS ==================

    function renderLista() {
      atualizarListaCategorias();
      atualizarAlertaResumo();
      atualizarFiltroProdutos();
      atualizarFiltrosGrade();
      atualizarSelectFEFOProdutos();
      renderAnaliseProduto();

      const termo = inputBusca.value.trim().toLowerCase();
      const corFiltro = nichoEhVestuario() ? filtroCorEl.value : '';
      const tamFiltro = nichoEhVestuario() ? filtroTamanhoEl.value : '';

      const itensFiltrados = estoque.filter((p) => {
        const passaTermo = !termo ||
          p.nome.toLowerCase().includes(termo) ||
          (p.categoria && p.categoria.toLowerCase().includes(termo));

        const passaCor = !corFiltro ||
          (p.cor && p.cor.toLowerCase() === corFiltro.toLowerCase());

        const passaTam = !tamFiltro || p.tamanho === tamFiltro;

        return passaTermo && passaCor && passaTam;
      });

      let total = 0;
      estoque.forEach((p) => {
        total += p.preco * p.quantidade;
      });

      valorTotalEl.textContent = 'Valor total: R$ ' + total.toFixed(2);

      if (estoque.length === 0) {
        listaContainer.innerHTML =
          '<div class="vazio">Nenhum produto no estoque.</div>';
        return;
      }

      if (itensFiltrados.length === 0) {
        listaContainer.innerHTML =
          '<div class="vazio">Nenhum produto encontrado para essa busca/filtro.</div>';
        return;
      }

      listaContainer.innerHTML = '';

      itensFiltrados.forEach((p) => {
        const critico = p.quantidade <= limiteDe(p);
        const dias = diasParaVencer(p.validade);
        const vencendoOuVencido = dias !== null && dias <= 7 && p.quantidade > 0;
        const parado = produtoParado(p);
        const numOriginal = estoque.indexOf(p) + 1;

        let badges = '';

        if (p.numeroLote) {
          badges += `<span class="mini-badge">Lote ${escapeHtml(p.numeroLote)}</span>`;
        }

        if (p.validade) {
          let rotulo;

          if (dias < 0) rotulo = 'Vencido';
          else if (dias <= 7) rotulo = `Vence em ${dias}d`;
          else rotulo = 'Val. ' + formatarDataBR(p.validade);

          badges += `<span class="mini-badge ${vencendoOuVencido ? 'alerta' : ''}">${rotulo}</span>`;
        }

        if (p.tamanho) {
          badges += `<span class="mini-badge">Tam. ${escapeHtml(p.tamanho)}</span>`;
        }

        if (p.cor) {
          badges += `<span class="mini-badge">${escapeHtml(p.cor)}</span>`;
        }

        if (p.medidas) {
          badges += `<span class="mini-badge">${escapeHtml(p.medidas)}</span>`;
        }

        if (parado) {
          badges += '<span class="mini-badge alerta">Parado</span>';
        }

        const row = document.createElement('div');

        row.className = 'item-row' +
          (critico ? ' critico' : '') +
          (vencendoOuVencido ? ' vencendo' : '');

        row.innerHTML = `
          <span class="item-num">${String(numOriginal).padStart(2, '0')}</span>
          <div class="item-nome-wrap">
            <span class="item-nome"></span>
            <span class="item-categoria"></span>
            <div class="mini-badges">${badges}</div>
          </div>
          <span class="item-preco">R$ ${p.preco.toFixed(2)}</span>
          <div class="qtd-controles">
            <button class="btn-qtd menos" title="Registrar saída" data-id="${p.id}" ${p.quantidade <= 0 ? 'disabled' : ''}>−</button>
            <span class="badge-qtd ${critico ? 'critico' : 'ok'}">${p.quantidade} un.${critico ? ' · Estoque Crítico' : ''}</span>
            <button class="btn-qtd mais" title="Registrar entrada" data-id="${p.id}">+</button>
          </div>
          <button class="btn-remover" title="Remover produto" data-id="${p.id}">×</button>
        `;

        row.querySelector('.item-nome').textContent = p.nome;
        row.querySelector('.item-categoria').textContent = p.categoria || '';

        listaContainer.appendChild(row);
      });

      listaContainer.querySelectorAll('.btn-remover').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = Number(btn.getAttribute('data-id'));
          estoque = estoque.filter((p) => p.id !== id);
          renderLista();
          salvarEstoque();
        });
      });

      listaContainer.querySelectorAll('.btn-qtd.menos').forEach((btn) => {
        btn.addEventListener('click', () => {
          alterarQuantidade(Number(btn.getAttribute('data-id')), -1);
        });
      });

      listaContainer.querySelectorAll('.btn-qtd.mais').forEach((btn) => {
        btn.addEventListener('click', () => {
          alterarQuantidade(Number(btn.getAttribute('data-id')), 1);
        });
      });
    }

    // ================== CADASTRO DE PRODUTO ==================

    function cadastrarProduto() {
      esconderMensagens();

      const nomeDigitado = inputNome.value.trim();

      if (nomeDigitado === '') {
        mostrarErro('Digite um nome válido!');
        return;
      }

      const precoStr = inputPreco.value.trim();
      const qtdStr = inputQtd.value.trim();
      const preco = parseFloat(precoStr.replace(',', '.'));
      const quantidade = parseInt(qtdStr, 10);

      if (precoStr === '' || qtdStr === '' || isNaN(preco) || isNaN(quantidade)) {
        mostrarErro('Digite valores válidos para preço e quantidade!');
        return;
      }

      const minStr = inputEstoqueMinimo.value.trim();
      const estoqueMinimo = minStr === ''
        ? limiteBaixoPadrao
        : parseInt(minStr, 10);

      const nome = padronizarTexto(nomeDigitado);
      const categoria = padronizarTexto(inputCategoria.value);

      let validade = '';
      let numeroLote = '';
      let tamanho = '';
      let medidas = '';
      let cor = '';
      let fornecedorId = '';

      // Campos obrigatórios para o nicho Alimentos
      if (nichoEhAlimentos()) {
        validade = document.getElementById('validade').value;
        numeroLote = document.getElementById('numeroLote').value.trim();

        if (validade === '' || numeroLote === '') {
          mostrarErro('Para o nicho Alimentos, a Data de Validade e o Número do Lote são obrigatórios.');
          return;
        }
      }

      // Campos específicos para o nicho Vestuário
      if (nichoEhVestuario()) {
        tamanho = document.getElementById('tamanho').value;
        medidas = document.getElementById('medidas').value.trim();
        cor = padronizarTexto(document.getElementById('cor').value);
        fornecedorId = document.getElementById('fornecedorProduto').value;
      }

      // Verifica se já existe um produto equivalente
      let existente = null;

      if (nichoEhAlimentos()) {
        existente = estoque.find((p) =>
          p.nome.toLowerCase() === nome.toLowerCase() &&
          p.numeroLote === numeroLote
        );
      } else if (nichoEhVestuario()) {
        existente = estoque.find((p) =>
          p.nome.toLowerCase() === nome.toLowerCase() &&
          (p.categoria || '').toLowerCase() === categoria.toLowerCase() &&
          p.tamanho === tamanho &&
          (p.cor || '').toLowerCase() === cor.toLowerCase()
        );
      } else {
        existente = estoque.find((p) =>
          p.nome.toLowerCase() === nome.toLowerCase() &&
          (p.categoria || '').toLowerCase() === categoria.toLowerCase()
        );
      }

      if (existente) {
        existente.quantidade += quantidade;
        existente.preco = preco;

        if (minStr !== '' && !isNaN(estoqueMinimo)) {
          existente.estoqueMinimo = estoqueMinimo;
        }

        mostrarFlash(
          '"' + nome + '" já existia — quantidade somada (' +
          existente.quantidade + ' un.)'
        );
      } else {
        estoque.push({
          id: Date.now() + Math.random(),
          nome: nome,
          categoria: categoria,
          preco: preco,
          quantidade: quantidade,
          estoqueMinimo: isNaN(estoqueMinimo)
            ? limiteBaixoPadrao
            : estoqueMinimo,
          criadoEm: Date.now(),
          validade: validade || null,
          numeroLote: numeroLote || null,
          tamanho: tamanho || null,
          medidas: medidas || null,
          cor: cor || null,
          fornecedorId: fornecedorId || null
        });

        mostrarFlash('"' + nome + '" cadastrado com sucesso!');
      }

      renderLista();
      salvarEstoque();

      inputNome.value = '';
      inputCategoria.value = '';
      inputPreco.value = '';
      inputQtd.value = '';
      inputEstoqueMinimo.value = '';

      if (nichoEhAlimentos()) {
        document.getElementById('validade').value = '';
        document.getElementById('numeroLote').value = '';
      }

      if (nichoEhVestuario()) {
        document.getElementById('tamanho').value = '';
        document.getElementById('medidas').value = '';
        document.getElementById('cor').value = '';
        document.getElementById('fornecedorProduto').value = '';
      }

      inputNome.focus();
    }

    btnCadastrar.addEventListener('click', cadastrarProduto);

    [inputNome, inputCategoria, inputPreco, inputQtd, inputEstoqueMinimo].forEach((el) => {
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          cadastrarProduto();
        }
      });
    });

    inputBusca.addEventListener('input', renderLista);
    
    // ================== VENDA COM PRIORIDADE FEFO (exclusivo Alimentos) ==================

    // Atualiza a lista de produtos disponíveis no painel de venda FEFO
    function atualizarSelectFEFOProdutos() {
      const sel = document.getElementById('fefo-produto');
      if (!sel || !nichoEhAlimentos()) return;

      const valorAtual = sel.value;
      const nomes = [...new Set(
        estoque.filter((p) => p.quantidade > 0).map((p) => p.nome)
      )].sort();

      sel.innerHTML = nomes
        .map((n) => `<option value="${escapeHtml(n)}"></option>`)
        .join('');

      sel.querySelectorAll('option').forEach((opt, i) => {
        opt.textContent = nomes[i];
      });

      if (nomes.includes(valorAtual)) sel.value = valorAtual;
    }

    function atualizarSelectClientesFEFO() {
      const sel = document.getElementById('fefo-cliente');
      const valorAtual = sel.value;

      sel.innerHTML =
        '<option value="">Venda avulsa (sem cliente)</option>' +
        clientes.map((c) => `<option value="${c.id}"></option>`).join('');

      sel.querySelectorAll('option[value]:not([value=""])').forEach((opt, i) => {
        opt.textContent = clientes[i].nome;
      });

      if (clientes.some((c) => c.id === valorAtual)) sel.value = valorAtual;
    }

    // Registra a venda priorizando o lote mais próximo do vencimento
    function registrarVendaFEFO() {
      const fefoMsg = document.getElementById('fefo-msg');
      fefoMsg.style.display = 'none';

      const nomeProduto = document.getElementById('fefo-produto').value;
      const qtdVender = parseInt(
        document.getElementById('fefo-qtd').value.trim(),
        10
      );
      const clienteId = document.getElementById('fefo-cliente').value;

      function erroFefo(texto) {
        fefoMsg.style.background = 'var(--rust)';
        fefoMsg.textContent = texto;
        fefoMsg.style.display = 'block';
      }

      if (!nomeProduto) {
        erroFefo('Selecione um produto para vender.');
        return;
      }

      if (isNaN(qtdVender) || qtdVender <= 0) {
        erroFefo('Informe uma quantidade válida.');
        return;
      }

      const lotes = estoque
        .filter((p) => p.nome === nomeProduto && p.quantidade > 0)
        .sort((a, b) =>
          new Date(a.validade || '9999-12-31') -
          new Date(b.validade || '9999-12-31')
        );

      const totalDisponivel = lotes.reduce(
        (soma, p) => soma + p.quantidade,
        0
      );

      if (totalDisponivel < qtdVender) {
        erroFefo(`Estoque insuficiente. Disponível: ${totalDisponivel} un.`);
        return;
      }

      let restante = qtdVender;
      const lotesUsados = [];

      for (const lote of lotes) {
        if (restante <= 0) break;

        const retirar = Math.min(lote.quantidade, restante);
        lote.quantidade -= retirar;
        restante -= retirar;

        lotesUsados.push(
          `Lote ${lote.numeroLote || 's/nº'} (${retirar} un.)`
        );
      }

      const cliente = clientes.find((c) => c.id === clienteId);

      registrarMovimentacao(
        'saida',
        nomeProduto,
        qtdVender,
        cliente ? cliente.nome : null
      );

      fefoMsg.style.background = 'var(--sage)';
      fefoMsg.textContent =
        `Venda registrada! Lotes utilizados (mais próximos do vencimento primeiro): ${lotesUsados.join(', ')}`;
      fefoMsg.style.display = 'block';

      setTimeout(() => {
        fefoMsg.style.display = 'none';
      }, 5000);

      document.getElementById('fefo-qtd').value = '';
      renderLista();
      salvarEstoque();
    }

    document
      .getElementById('btn-fefo-vender')
      .addEventListener('click', registrarVendaFEFO);

    // ================== GESTÃO DE FORNECEDORES ==================

    // Atualiza o seletor de fornecedor no cadastro de produto
    function atualizarSelectFornecedoresNoProduto() {
      const sel = document.getElementById('fornecedorProduto');
      if (!sel) return;

      const valorAtual = sel.value;

      sel.innerHTML =
        '<option value="">Nenhum</option>' +
        fornecedores.map((f) => `<option value="${f.id}"></option>`).join('');

      sel.querySelectorAll('option[value]:not([value=""])').forEach((opt, i) => {
        opt.textContent = fornecedores[i].nomeFantasia;
      });

      if (fornecedores.some((f) => f.id === valorAtual)) {
        sel.value = valorAtual;
      }
    }

    // Cadastra um fornecedor e salva os dados da empresa
    function cadastrarFornecedor() {
      const erro = document.getElementById('erro-fornecedor');
      const flash = document.getElementById('flash-fornecedor');

      erro.style.display = 'none';
      flash.style.display = 'none';

      const razao = document.getElementById('forn-razao').value.trim();
      const fantasia = document.getElementById('forn-fantasia').value.trim();
      const doc = document.getElementById('forn-doc').value.trim();
      const tel = document.getElementById('forn-tel').value.trim();
      const produtosFornecidos =
        document.getElementById('forn-produtos').value.trim();

      if (razao === '' || doc === '') {
        erro.textContent =
          'Informe ao menos a Razão Social e o CNPJ/CPF do fornecedor.';
        erro.style.display = 'block';
        return;
      }

      fornecedores.unshift({
        id: 'forn_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
        razaoSocial: padronizarTexto(razao),
        nomeFantasia: fantasia
          ? padronizarTexto(fantasia)
          : padronizarTexto(razao),
        cnpjCpf: doc,
        telefone: tel,
        produtos: produtosFornecidos,
        criadoEm: Date.now(),
      });

      salvarDadosEmpresa();
      renderFornecedores();
      atualizarSelectFornecedoresNoProduto();
      atualizarSelectFornecedoresCompras();

      document.getElementById('forn-razao').value = '';
      document.getElementById('forn-fantasia').value = '';
      document.getElementById('forn-doc').value = '';
      document.getElementById('forn-tel').value = '';
      document.getElementById('forn-produtos').value = '';

      flash.textContent = 'Fornecedor cadastrado com sucesso!';
      flash.style.display = 'block';

      setTimeout(() => {
        flash.style.display = 'none';
      }, 2200);
    }

    // Lista os fornecedores cadastrados, com busca e exclusão
    function renderFornecedores() {
      const termo = document
        .getElementById('busca-fornecedor')
        .value.trim().toLowerCase();

      const tbody = document.getElementById('tabela-fornecedores-body');
      const totalEl = document.getElementById('total-fornecedores');

      totalEl.textContent =
        fornecedores.length +
        (fornecedores.length === 1 ? ' fornecedor' : ' fornecedores');

      const filtrados = termo
        ? fornecedores.filter((f) =>
            f.razaoSocial.toLowerCase().includes(termo) ||
            f.nomeFantasia.toLowerCase().includes(termo) ||
            f.cnpjCpf.toLowerCase().includes(termo) ||
            (f.produtos || '').toLowerCase().includes(termo)
          )
        : fornecedores;

      if (filtrados.length === 0) {
        tbody.innerHTML =
          `<tr><td colspan="6" class="vazio-td">${
            fornecedores.length === 0
              ? 'Nenhum fornecedor cadastrado.'
              : 'Nenhum fornecedor encontrado para essa busca.'
          }</td></tr>`;
        return;
      }

      const visiveis = filtrados.slice(0, 50);

      tbody.innerHTML = visiveis.map(() => `
        <tr>
          <td class="fin-nome"></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td>
            <button class="btn-remover btn-remover-forn" title="Remover fornecedor">×</button>
          </td>
        </tr>
      `).join('');

      const linhas = tbody.querySelectorAll('tr');

      visiveis.forEach((f, i) => {
        const tds = linhas[i].querySelectorAll('td');

        tds[0].textContent = f.nomeFantasia;
        tds[1].textContent = f.razaoSocial;
        tds[2].textContent = f.cnpjCpf;
        tds[3].textContent = f.telefone || '—';
        tds[4].textContent = f.produtos || '—';

        linhas[i]
          .querySelector('.btn-remover-forn')
          .addEventListener('click', () => {
            fornecedores = fornecedores.filter((x) => x.id !== f.id);

            salvarDadosEmpresa();
            renderFornecedores();
            atualizarSelectFornecedoresNoProduto();
            atualizarSelectFornecedoresCompras();
          });
      });
    }

    document
      .getElementById('btn-cadastrar-fornecedor')
      .addEventListener('click', cadastrarFornecedor);

    document
      .getElementById('busca-fornecedor')
      .addEventListener('input', renderFornecedores);
      
    // ================== REGISTRO DE COMPRAS ==================

    function atualizarSelectFornecedoresCompras() {
      const sel = document.getElementById('compra-fornecedor');
      const valorAtual = sel.value;

      sel.innerHTML =
        '<option value="">Selecione um fornecedor</option>' +
        fornecedores.map((f) => `<option value="${f.id}"></option>`).join('');

      sel.querySelectorAll('option[value]:not([value=""])')
        .forEach((opt, i) => {
          opt.textContent = fornecedores[i].nomeFantasia;
        });

      if (fornecedores.some((f) => f.id === valorAtual)) {
        sel.value = valorAtual;
      }
    }

    // Registra uma compra e atualiza o estoque automaticamente
    function registrarCompra() {
      const erro = document.getElementById('erro-compra');
      const flash = document.getElementById('flash-compra');

      erro.style.display = 'none';
      flash.style.display = 'none';

      const fornecedorId = document.getElementById('compra-fornecedor').value;
      const produtoDigitado = document.getElementById('compra-produto').value.trim();
      const quantidade = parseInt(
        document.getElementById('compra-qtd').value.trim(),
        10
      );
      const valorUnitario = parseFloat(
        document.getElementById('compra-valor').value.trim().replace(',', '.')
      );
      const dataCompra =
        document.getElementById('compra-data').value ||
        new Date().toISOString().slice(0, 10);

      if (!fornecedorId) {
        erro.textContent = 'Selecione o fornecedor da compra.';
        erro.style.display = 'block';
        return;
      }

      if (
        produtoDigitado === '' ||
        isNaN(quantidade) ||
        quantidade <= 0 ||
        isNaN(valorUnitario)
      ) {
        erro.textContent =
          'Preencha o produto, a quantidade e o valor unitário corretamente.';
        erro.style.display = 'block';
        return;
      }

      let validadeCompra = '';
      let loteCompra = '';

      if (nichoEhAlimentos()) {
        validadeCompra = document.getElementById('compra-validade').value;
        loteCompra = document.getElementById('compra-lote').value.trim();

        if (validadeCompra === '' || loteCompra === '') {
          erro.textContent =
            'Para o nicho Alimentos, informe a validade e o número do lote da compra.';
          erro.style.display = 'block';
          return;
        }
      }

      const nomePadronizado = padronizarTexto(produtoDigitado);

      // Atualiza o item existente ou cria um novo produto/lote
      let item = null;

      if (nichoEhAlimentos()) {
        item = estoque.find(
          (p) =>
            p.nome.toLowerCase() === nomePadronizado.toLowerCase() &&
            p.numeroLote === loteCompra
        );
      } else {
        item = estoque.find(
          (p) => p.nome.toLowerCase() === nomePadronizado.toLowerCase()
        );
      }

      if (item) {
        item.quantidade += quantidade;
        item.preco = valorUnitario;

        if (fornecedorId) {
          item.fornecedorId = fornecedorId;
        }
      } else {
        estoque.push({
          id: Date.now() + Math.random(),
          nome: nomePadronizado,
          categoria: '',
          preco: valorUnitario,
          quantidade: quantidade,
          estoqueMinimo: limiteBaixoPadrao,
          criadoEm: Date.now(),
          validade: validadeCompra || null,
          numeroLote: loteCompra || null,
          tamanho: null,
          medidas: null,
          cor: null,
          fornecedorId: fornecedorId || null,
        });
      }

      compras.unshift({
        id: 'compra_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
        fornecedorId: fornecedorId,
        produtoNome: nomePadronizado,
        quantidade: quantidade,
        valorUnitario: valorUnitario,
        total: quantidade * valorUnitario,
        data: dataCompra,
        criadoEm: Date.now(),
      });

      registrarMovimentacao('entrada', nomePadronizado, quantidade);
      salvarDadosEmpresa();

      renderLista();
      renderCompras();

      document.getElementById('compra-produto').value = '';
      document.getElementById('compra-qtd').value = '';
      document.getElementById('compra-valor').value = '';

      if (nichoEhAlimentos()) {
        document.getElementById('compra-validade').value = '';
        document.getElementById('compra-lote').value = '';
      }

      flash.textContent =
        'Compra registrada e estoque atualizado com sucesso!';
      flash.style.display = 'block';

      setTimeout(() => {
        flash.style.display = 'none';
      }, 2200);
    }

    // Exibe o histórico de compras
    function renderCompras() {
      const tbody = document.getElementById('tabela-compras-body');

      if (compras.length === 0) {
        tbody.innerHTML =
          '<tr><td colspan="5" class="vazio-td">Nenhuma compra registrada.</td></tr>';
        return;
      }

      const visiveis = compras.slice(0, 50);

      tbody.innerHTML = visiveis.map(() => `
        <tr>
          <td class="fin-nome"></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
      `).join('');

      const linhas = tbody.querySelectorAll('tr');

      visiveis.forEach((c, i) => {
        const fornecedor = fornecedores.find(
          (f) => f.id === c.fornecedorId
        );

        const tds = linhas[i].querySelectorAll('td');

        tds[0].textContent = c.produtoNome;
        tds[1].textContent = fornecedor
          ? fornecedor.nomeFantasia
          : '—';
        tds[2].textContent = c.quantidade + ' un.';
        tds[3].textContent = 'R$ ' + c.total.toFixed(2);
        tds[4].textContent = formatarDataBR(c.data);
      });
    }

    document
      .getElementById('btn-registrar-compra')
      .addEventListener('click', registrarCompra);

    // ================== CADASTRO DE CLIENTES ==================

    function cadastrarCliente() {
      const erro = document.getElementById('erro-cliente');
      const flash = document.getElementById('flash-cliente');

      erro.style.display = 'none';
      flash.style.display = 'none';

      const nome = document.getElementById('cli-nome').value.trim();
      const tel = document.getElementById('cli-tel').value.trim();
      const cpf = document.getElementById('cli-cpf').value.trim();

      if (nome === '') {
        erro.textContent = 'Informe o nome do cliente.';
        erro.style.display = 'block';
        return;
      }

      clientes.unshift({
        id: 'cli_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
        nome: padronizarTexto(nome),
        telefone: tel,
        cpf: cpf,
        criadoEm: Date.now(),
      });

      salvarDadosEmpresa();
      renderClientes();
      atualizarSelectClientesFEFO();

      document.getElementById('cli-nome').value = '';
      document.getElementById('cli-tel').value = '';
      document.getElementById('cli-cpf').value = '';

      flash.textContent = 'Cliente cadastrado com sucesso!';
      flash.style.display = 'block';

      setTimeout(() => {
        flash.style.display = 'none';
      }, 2200);
    }

    // Lista clientes cadastrados com busca e opção de exclusão
    function renderClientes() {
      const termo = document
        .getElementById('busca-cliente')
        .value.trim().toLowerCase();

      const tbody = document.getElementById('tabela-clientes-body');
      const totalEl = document.getElementById('total-clientes');

      totalEl.textContent =
        clientes.length +
        (clientes.length === 1 ? ' cliente' : ' clientes');

      const filtrados = termo
        ? clientes.filter((c) =>
            c.nome.toLowerCase().includes(termo) ||
            (c.telefone || '').toLowerCase().includes(termo) ||
            (c.cpf || '').toLowerCase().includes(termo)
          )
        : clientes;

      if (filtrados.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="vazio-td">
              ${
                clientes.length === 0
                  ? 'Nenhum cliente cadastrado.'
                  : 'Nenhum cliente encontrado para essa busca.'
              }
            </td>
          </tr>
        `;
        return;
      }

      const visiveis = filtrados.slice(0, 50);

      tbody.innerHTML = visiveis.map(() => `
        <tr>
          <td class="fin-nome"></td>
          <td></td>
          <td></td>
          <td>
            <button
              class="btn-remover btn-remover-cli"
              title="Remover cliente"
            >×</button>
          </td>
        </tr>
      `).join('');

      const linhas = tbody.querySelectorAll('tr');

      visiveis.forEach((c, i) => {
        const tds = linhas[i].querySelectorAll('td');

        tds[0].textContent = c.nome;
        tds[1].textContent = c.telefone || '—';
        tds[2].textContent = c.cpf || '—';

        linhas[i]
          .querySelector('.btn-remover-cli')
          .addEventListener('click', () => {
            clientes = clientes.filter((x) => x.id !== c.id);

            salvarDadosEmpresa();
            renderClientes();
            atualizarSelectClientesFEFO();
          });
      });
    }

    document
      .getElementById('btn-cadastrar-cliente')
      .addEventListener('click', cadastrarCliente);

    document
      .getElementById('busca-cliente')
      .addEventListener('input', renderClientes);
      
    // ================== ABAS (NAVEGAÇÃO) ==================

    document.querySelectorAll('.tab-btn[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn[data-tab]').forEach((b) => {
          b.classList.remove('ativo');
        });

        document.querySelectorAll('.tab-content').forEach((c) => {
          c.classList.remove('ativo');
        });

        btn.classList.add('ativo');

        document
          .getElementById('tab-' + btn.getAttribute('data-tab'))
          .classList.add('ativo');

        const tab = btn.getAttribute('data-tab');

        if (tab === 'relatorios') renderRelatorios();
        if (tab === 'financeiro') renderFinanceiro();
        if (tab === 'fornecedores') renderFornecedores();
        if (tab === 'compras') renderCompras();
        if (tab === 'clientes') renderClientes();
      });
    });

    // ================== RELATÓRIOS ==================

    function renderRelatorios() {
      const vendasPorNome = {};

      movimentacoes
        .filter((m) => m.tipo === 'saida')
        .forEach((m) => {
          vendasPorNome[m.nome] =
            (vendasPorNome[m.nome] || 0) + m.quantidade;
        });

      // Produtos vencendo em breve — exclusivo para Alimentos
      const cardVencendo = document.getElementById('card-vencendo');

      if (nichoEhAlimentos()) {
        cardVencendo.style.display = 'block';

        const vencendoLista = estoque
          .filter((p) =>
            p.quantidade > 0 &&
            diasParaVencer(p.validade) !== null &&
            diasParaVencer(p.validade) <= 7
          )
          .sort((a, b) => new Date(a.validade) - new Date(b.validade));

        const vencendoEl = document.getElementById('vencendo-container');

        if (vencendoLista.length === 0) {
          vencendoEl.innerHTML =
            '<div class="vazio">Nenhum produto vencendo no momento.</div>';
        } else {
          vencendoEl.innerHTML = vencendoLista.map(() => `
            <div class="historico-item">
              <span class="historico-tipo saida"></span>
              <span class="historico-nome"></span>
              <span class="historico-data"></span>
            </div>
          `).join('');

          const itens = vencendoEl.querySelectorAll('.historico-item');

          vencendoLista.forEach((p, i) => {
            const dias = diasParaVencer(p.validade);

            itens[i].querySelector('.historico-tipo').textContent =
              dias < 0 ? 'Vencido' : `${dias}d`;

            itens[i].querySelector('.historico-nome').textContent =
              p.nome + ' (Lote ' + (p.numeroLote || 's/nº') + ')';

            itens[i].querySelector('.historico-data').textContent =
              formatarDataBR(p.validade) + ' · ' + p.quantidade + ' un.';
          });
        }
      } else {
        cardVencendo.style.display = 'none';
      }

      // Produtos mais vendidos
      const ranking = Object.entries(vendasPorNome)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      const maisVendidosEl =
        document.getElementById('mais-vendidos-container');

      if (ranking.length === 0) {
        maisVendidosEl.innerHTML =
          '<div class="vazio">Nenhuma venda registrada ainda.</div>';
      } else {
        maisVendidosEl.innerHTML = ranking.map((r, i) => `
          <div class="historico-item">
            <span class="historico-tipo entrada">#${i + 1}</span>
            <span class="historico-nome"></span>
            <span class="historico-data">${r[1]} un. vendidas</span>
          </div>
        `).join('');

        maisVendidosEl
          .querySelectorAll('.historico-nome')
          .forEach((el, i) => {
            el.textContent = ranking[i][0];
          });
      }

      // Produtos parados em estoque
      const parados = estoque.filter(
        (p) => p.quantidade > 0 && !(vendasPorNome[p.nome] > 0)
      );

      const paradosEl = document.getElementById('parados-container');

      if (parados.length === 0) {
        paradosEl.innerHTML =
          '<div class="vazio">Nenhum produto parado no momento.</div>';
      } else {
        paradosEl.innerHTML = parados.map(() => `
          <div class="historico-item">
            <span class="historico-tipo saida">Parado</span>
            <span class="historico-nome"></span>
            <span class="historico-data"></span>
          </div>
        `).join('');

        paradosEl
          .querySelectorAll('.historico-nome')
          .forEach((el, i) => {
            el.textContent = parados[i].nome;
          });

        paradosEl
          .querySelectorAll('.historico-data')
          .forEach((el, i) => {
            el.textContent = parados[i].quantidade + ' un. sem vender';
          });
      }

      // Balanço de entradas, saídas e receita
      const totalEntradas = movimentacoes
        .filter((m) => m.tipo === 'entrada')
        .reduce((s, m) => s + m.quantidade, 0);

      const totalSaidas = movimentacoes
        .filter((m) => m.tipo === 'saida')
        .reduce((s, m) => s + m.quantidade, 0);

      const receitaTotal = Object.entries(vendasPorNome).reduce(
        (soma, [nome, qtd]) => {
          const p = estoque.find((x) => x.nome === nome);
          return soma + (p ? p.preco * qtd : 0);
        },
        0
      );

      document.getElementById('balanco-entradas').textContent = totalEntradas;
      document.getElementById('balanco-saidas').textContent = totalSaidas;

      document.getElementById('balanco-saldo').textContent =
        (totalEntradas - totalSaidas >= 0 ? '+' : '') +
        (totalEntradas - totalSaidas);

      document.getElementById('balanco-receita').textContent =
        'R$ ' + receitaTotal.toFixed(2);
    }

    // ================== ABA FINANCEIRA ==================

    function renderFinanceiro() {
      const vendasPorNome = {};

      movimentacoes
        .filter((m) => m.tipo === 'saida')
        .forEach((m) => {
          vendasPorNome[m.nome] =
            (vendasPorNome[m.nome] || 0) + m.quantidade;
        });

      const tbody = document.getElementById('tabela-financeiro-body');

      if (estoque.length === 0) {
        tbody.innerHTML =
          '<tr><td colspan="5" class="vazio-td">Nenhum produto cadastrado.</td></tr>';
        return;
      }

      tbody.innerHTML = estoque.map(() => `
        <tr>
          <td class="fin-nome"></td>
          <td class="fin-preco"></td>
          <td class="fin-vendido"></td>
          <td class="fin-receita"></td>
          <td class="fin-estoque"></td>
        </tr>
      `).join('');

      const linhas = tbody.querySelectorAll('tr');

      estoque.forEach((p, i) => {
        const vendidos = vendasPorNome[p.nome] || 0;
        const receita = vendidos * p.preco;
        const valorEstoque = p.quantidade * p.preco;
        const linha = linhas[i];

        linha.querySelector('.fin-nome').textContent = p.nome;
        linha.querySelector('.fin-preco').textContent =
          'R$ ' + p.preco.toFixed(2);
        linha.querySelector('.fin-vendido').textContent =
          vendidos + ' un.';
        linha.querySelector('.fin-receita').textContent =
          'R$ ' + receita.toFixed(2);
        linha.querySelector('.fin-estoque').textContent =
          'R$ ' + valorEstoque.toFixed(2);
      });
    }

    // ================== INICIALIZAÇÃO ==================

    carregarEmpresas();
    atualizarSelectEmpresasLogin();



const { Client } = require('@notionhq/client');

// Inicializa o cliente Notion (singleton para reutilização)
let notion = null;

/**
 * Obtém ou cria a instância do cliente Notion
 * @returns {Client} Cliente Notion configurado
 */
function getNotionClient() {
  if (!notion) {
    // Verifica se o token está configurado
    if (!process.env.NOTION_TOKEN) {
      throw new Error('NOTION_TOKEN não configurado nas variáveis de ambiente');
    }
    notion = new Client({ auth: process.env.NOTION_TOKEN });
  }
  return notion;
}

/**
 * Mapeamento de meses em português
 */
const MESES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

/**
 * Formata uma data no padrão "DD MMMM YYYY" em português
 * Exemplo: "30 Janeiro 2026"
 * @param {Date} date - Objeto Date a ser formatado
 * @returns {string} Data formatada em português
 */
function formatarData(date) {
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = MESES_PT[date.getMonth()];
  const ano = date.getFullYear();
  return `${dia} ${mes} ${ano}`;
}

/**
 * Divide texto longo em blocos de parágrafo para o Notion
 * (Notion tem limite de 2000 caracteres por bloco de texto)
 * @param {string} texto - Texto a ser dividido
 * @returns {Array} Array de blocos de parágrafo
 */
function dividirEmBlocos(texto) {
  const limite = 1900; // Margem de segurança abaixo do limite de 2000
  const paragrafos = texto.split('\n\n');
  const blocos = [];
  let blocoAtual = '';

  for (const paragrafo of paragrafos) {
    // Se o parágrafo sozinho é muito grande, divide por frases
    if (paragrafo.length > limite) {
      if (blocoAtual) {
        blocos.push(criarBlocoParagrafo(blocoAtual));
        blocoAtual = '';
      }
      // Divide por pontos finais, mantendo o ponto com a frase anterior
      const frases = paragrafo.split(/(?<=\.)\s+/);
      let frazeBloco = '';
      for (const frase of frases) {
        if ((frazeBloco + frase).length > limite) {
          if (frazeBloco) blocos.push(criarBlocoParagrafo(frazeBloco));
          frazeBloco = frase;
        } else {
          frazeBloco += (frazeBloco ? ' ' : '') + frase;
        }
      }
      if (frazeBloco) blocos.push(criarBlocoParagrafo(frazeBloco));
    }
    // Se cabe no bloco atual, adiciona
    else if ((blocoAtual + '\n\n' + paragrafo).length <= limite) {
      blocoAtual += (blocoAtual ? '\n\n' : '') + paragrafo;
    }
    // Senão, fecha o bloco atual e inicia novo
    else {
      if (blocoAtual) blocos.push(criarBlocoParagrafo(blocoAtual));
      blocoAtual = paragrafo;
    }
  }

  // Adiciona o último bloco pendente
  if (blocoAtual) {
    blocos.push(criarBlocoParagrafo(blocoAtual));
  }

  // Retorna pelo menos um bloco vazio se não houver conteúdo
  return blocos.length > 0 ? blocos : [criarBlocoParagrafo(texto || '(vazio)')];
}

/**
 * Cria um bloco de parágrafo no formato da API do Notion
 * @param {string} texto - Conteúdo do parágrafo
 * @returns {Object} Bloco de parágrafo formatado
 */
function criarBlocoParagrafo(texto) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{
        type: 'text',
        text: { content: texto }
      }]
    }
  };
}

/**
 * Adiciona uma entrada de diário NO FINAL da página do Notion (append)
 *
 * Formato gerado:
 * ## DD MMMM YYYY
 * [Conteúdo do diário]
 *
 * [linha em branco]
 *
 * @param {Date} date - Data da entrada
 * @param {string} content - Conteúdo do diário (texto processado)
 * @returns {Promise<Object>} Resposta da API do Notion
 * @throws {Error} Se houver erro na API ou configuração
 */
async function addDiaryEntry(date, content) {
  // Obtém o cliente Notion
  const client = getNotionClient();

  // Verifica se o ID da página está configurado
  if (!process.env.NOTION_PAGE_ID) {
    throw new Error('NOTION_PAGE_ID não configurado nas variáveis de ambiente');
  }

  try {
    // Formata a data no padrão "DD MMMM YYYY" em português
    const dataFormatada = formatarData(date);

    // Cria os blocos de conteúdo para adicionar
    const blocos = [
      // Heading 2 com a data formatada
      {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{
            type: 'text',
            text: { content: dataFormatada }
          }]
        }
      },
      // Parágrafos com o conteúdo (dividido se necessário)
      ...dividirEmBlocos(content),
      // Linha em branco após a entrada (separador visual)
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [] // Parágrafo vazio = linha em branco
        }
      }
    ];

    // Usa blocks.children.append para adicionar NO FINAL da página
    // Este método SEMPRE adiciona após os blocos existentes (append, não prepend)
    const response = await client.blocks.children.append({
      block_id: process.env.NOTION_PAGE_ID,
      children: blocos
    });

    return response;

  } catch (error) {
    // Tratamento de erros específicos da API do Notion
    if (error.code === 'object_not_found') {
      throw new Error('Página do Notion não encontrada. Verifique o NOTION_PAGE_ID e as permissões da integração.');
    }
    if (error.code === 'unauthorized') {
      throw new Error('Token do Notion inválido ou sem permissão para acessar a página.');
    }
    if (error.code === 'validation_error') {
      throw new Error(`Erro de validação do Notion: ${error.message}`);
    }
    if (error.code === 'rate_limited') {
      throw new Error('Limite de requisições do Notion atingido. Tente novamente em alguns segundos.');
    }

    // Erro genérico
    throw new Error(`Erro ao salvar no Notion: ${error.message}`);
  }
}

/**
 * Verifica se a conexão com o Notion está funcionando
 * @returns {Promise<boolean>} True se conectado com sucesso
 */
async function verificarConexao() {
  try {
    const client = getNotionClient();
    await client.users.me();
    return true;
  } catch {
    return false;
  }
}

/**
 * Retorna emoji baseado no estilo de processamento
 * @param {string} estilo - Estilo do diário
 * @returns {string} Emoji correspondente
 */
function getEstiloEmoji(estilo) {
  const emojis = {
    fiel: '📖',
    objetivo: '🎯',
    categorizado: '📊'
  };
  return emojis[estilo] || '📝';
}

/**
 * Salva uma entrada do diário no Notion (formato completo com metadados)
 * @param {Object} dados - Dados da entrada
 * @param {string} dados.transcricaoOriginal - Transcrição original do áudio
 * @param {string} dados.textoProcessado - Texto processado pelo Claude
 * @param {string} dados.estilo - Estilo usado no processamento
 * @returns {Promise<Object>} Resposta da API do Notion
 */
async function salvarEntrada({ transcricaoOriginal, textoProcessado, estilo }) {
  const client = getNotionClient();

  if (!process.env.NOTION_PAGE_ID) {
    throw new Error('NOTION_PAGE_ID não configurado');
  }

  try {
    // Formata a data atual
    const agora = new Date();
    const dataFormatada = formatarData(agora);
    const horaFormatada = agora.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Cria os blocos de conteúdo
    const blocos = [
      // Cabeçalho com data e hora
      {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{
            type: 'text',
            text: { content: `${dataFormatada} - ${horaFormatada}` }
          }]
        }
      },
      // Badge do estilo
      {
        object: 'block',
        type: 'callout',
        callout: {
          icon: { emoji: getEstiloEmoji(estilo) },
          rich_text: [{
            type: 'text',
            text: { content: `Estilo: ${estilo.toUpperCase()}` }
          }]
        }
      },
      // Texto processado
      {
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [{
            type: 'text',
            text: { content: 'Entrada do Diário' }
          }]
        }
      },
      // Divide o texto em parágrafos
      ...dividirEmBlocos(textoProcessado),
      // Divisor
      {
        object: 'block',
        type: 'divider',
        divider: {}
      },
      // Toggle com transcrição original
      {
        object: 'block',
        type: 'toggle',
        toggle: {
          rich_text: [{
            type: 'text',
            text: { content: '📝 Ver transcrição original' }
          }],
          children: dividirEmBlocos(transcricaoOriginal)
        }
      },
      // Linha em branco
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: []
        }
      }
    ];

    // Adiciona os blocos NO FINAL da página (append)
    const response = await client.blocks.children.append({
      block_id: process.env.NOTION_PAGE_ID,
      children: blocos
    });

    return response;

  } catch (error) {
    if (error.code === 'object_not_found') {
      throw new Error('Página do Notion não encontrada. Verifique o NOTION_PAGE_ID e as permissões da integração.');
    }
    if (error.code === 'unauthorized') {
      throw new Error('Token do Notion inválido ou sem permissão para acessar a página.');
    }
    if (error.code === 'validation_error') {
      throw new Error(`Erro de validação do Notion: ${error.message}`);
    }

    throw new Error(`Erro ao salvar no Notion: ${error.message}`);
  }
}

// Exporta as funções do serviço
module.exports = {
  addDiaryEntry,      // Função simplificada solicitada
  salvarEntrada,      // Função completa com metadados
  verificarConexao,   // Verificação de conexão
  formatarData        // Utilitário de formatação
};

const Anthropic = require('@anthropic-ai/sdk');
const { getPrompt, isEstiloValido, ESTILOS_VALIDOS } = require('../utils/prompts');

// Cliente Anthropic (singleton)
let anthropic = null;

/**
 * Obtém ou cria a instância do cliente Anthropic
 * @returns {Anthropic} Cliente Anthropic configurado
 */
function getAnthropicClient() {
  if (!anthropic) {
    // Verifica se a chave da API está configurada
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY não configurada nas variáveis de ambiente');
    }
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  return anthropic;
}

/**
 * Processa texto transcrito usando Claude AI conforme o estilo escolhido
 *
 * Estilos disponíveis:
 * - 'fiel': Transcrição literal com correção gramatical, mantém narrativa pessoal
 * - 'objetivo': Resumo direto ao ponto, 2-3 parágrafos máximo
 * - 'categorizado': Organizado por temas com emojis e bullet points
 *
 * @param {string} transcricao - Texto transcrito do áudio (via Whisper)
 * @param {string} estilo - Estilo de processamento: 'fiel' | 'objetivo' | 'categorizado'
 * @returns {Promise<string>} Texto processado conforme o estilo
 * @throws {Error} Se transcrição vazia, estilo inválido, ou erro na API
 *
 * @example
 * const texto = await processarTexto(transcricao, 'fiel');
 * // Retorna texto processado mantendo narrativa original
 */
async function processarTexto(transcricao, estilo) {
  console.log(`[Claude] Iniciando processamento (estilo: ${estilo})...`);

  // Validação: transcrição não vazia
  if (!transcricao || transcricao.trim().length === 0) {
    throw new Error('Transcrição vazia não pode ser processada');
  }

  // Validação: estilo válido
  if (!isEstiloValido(estilo)) {
    throw new Error(`Estilo inválido: "${estilo}". Use: ${ESTILOS_VALIDOS.join(', ')}`);
  }

  // Log: informações da transcrição
  console.log(`[Claude] Transcrição: ${transcricao.length} caracteres`);

  try {
    // Obtém o cliente Anthropic
    const client = getAnthropicClient();

    // Obtém o prompt do estilo escolhido
    const systemPrompt = getPrompt(estilo);

    console.log('[Claude] Enviando para API Anthropic...');

    // Chama a API Claude
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',  // Claude Sonnet 4.5
      max_tokens: 2000,                    // Limite de tokens na resposta
      messages: [
        {
          role: 'user',
          content: `${systemPrompt}\n\n${transcricao}`
        }
      ]
    });

    // Extrai o texto da resposta (pode ter múltiplos blocos)
    const textoProcessado = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim();

    // Validação: resposta não vazia
    if (!textoProcessado || textoProcessado.length === 0) {
      throw new Error('Claude retornou resposta vazia');
    }

    console.log(`[Claude] Processamento concluído: ${textoProcessado.length} caracteres`);

    return textoProcessado;

  } catch (error) {
    // Tratamento de erros específicos da API Anthropic
    if (error.status === 401) {
      throw new Error('Chave da API Anthropic inválida. Verifique ANTHROPIC_API_KEY.');
    }
    if (error.status === 429) {
      throw new Error('Limite de requisições da Anthropic excedido. Tente novamente em alguns minutos.');
    }
    if (error.status === 529) {
      throw new Error('API Anthropic sobrecarregada. Tente novamente em alguns instantes.');
    }
    if (error.status === 400) {
      throw new Error(`Erro de requisição: ${error.message}`);
    }
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      throw new Error('Não foi possível conectar à API da Anthropic. Verifique sua conexão.');
    }

    // Erro genérico
    console.error('[Claude] Erro:', error.message);
    throw new Error(`Erro no processamento: ${error.message}`);
  }
}

// Exporta a função principal e alias para compatibilidade
module.exports = {
  processarTexto,                    // Função principal
  processar: processarTexto          // Alias para compatibilidade com código existente
};

const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

// Cliente OpenAI (singleton)
let openai = null;

/**
 * Obtém ou cria a instância do cliente OpenAI
 * @returns {OpenAI} Cliente OpenAI configurado
 */
function getOpenAIClient() {
  if (!openai) {
    // Verifica se a chave da API está configurada
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY não configurada nas variáveis de ambiente');
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openai;
}

/**
 * Formatos de áudio suportados pelo Whisper
 */
const FORMATOS_SUPORTADOS = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm', '.ogg', '.flac'];

/**
 * Transcreve um arquivo de áudio para texto usando OpenAI Whisper API
 *
 * @param {string} audioFilePath - Caminho absoluto do arquivo de áudio
 * @returns {Promise<string>} Texto transcrito em português
 * @throws {Error} Se o arquivo não existir, formato inválido, ou erro na API
 *
 * @example
 * const texto = await transcribeAudio('/tmp/audio.mp3');
 * // Retorna: "Hoje foi um dia incrível..."
 */
async function transcribeAudio(audioFilePath) {
  console.log('[Whisper] Iniciando transcrição...');

  // Validação: arquivo existe?
  if (!fs.existsSync(audioFilePath)) {
    throw new Error(`Arquivo de áudio não encontrado: ${audioFilePath}`);
  }

  // Validação: formato suportado?
  const extensao = path.extname(audioFilePath).toLowerCase();
  if (!FORMATOS_SUPORTADOS.includes(extensao)) {
    throw new Error(`Formato de áudio não suportado: ${extensao}. Use: ${FORMATOS_SUPORTADOS.join(', ')}`);
  }

  // Log: informações do arquivo
  const stats = fs.statSync(audioFilePath);
  const tamanhoMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`[Whisper] Arquivo: ${path.basename(audioFilePath)} (${tamanhoMB} MB)`);

  // Validação: tamanho máximo (25MB é o limite do Whisper)
  if (stats.size > 25 * 1024 * 1024) {
    throw new Error('Arquivo muito grande. O limite do Whisper é 25MB.');
  }

  try {
    // Obtém o cliente OpenAI
    const client = getOpenAIClient();

    // Cria stream do arquivo para upload
    const audioFile = fs.createReadStream(audioFilePath);

    console.log('[Whisper] Enviando para API OpenAI...');

    // Chama a API Whisper para transcrição
    const response = await client.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',           // Modelo Whisper da OpenAI
      language: 'pt',                // Idioma: português
      response_format: 'text',       // Retorna texto puro (não JSON)
      prompt: 'Transcrição de diário pessoal em português brasileiro.' // Contexto para melhor precisão
    });

    // Validação: resposta não vazia
    if (!response || response.trim().length === 0) {
      throw new Error('Transcrição retornou vazia. O áudio pode estar silencioso ou corrompido.');
    }

    const textoTranscrito = response.trim();
    console.log(`[Whisper] Transcrição concluída: ${textoTranscrito.length} caracteres`);

    return textoTranscrito;

  } catch (error) {
    // Tratamento de erros específicos da API OpenAI
    if (error.status === 401) {
      throw new Error('Chave da API OpenAI inválida. Verifique OPENAI_API_KEY.');
    }
    if (error.status === 429) {
      throw new Error('Limite de requisições da OpenAI excedido. Tente novamente em alguns minutos.');
    }
    if (error.status === 413) {
      throw new Error('Arquivo de áudio muito grande para a API.');
    }
    if (error.code === 'ENOENT') {
      throw new Error('Arquivo de áudio não pode ser lido.');
    }
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      throw new Error('Não foi possível conectar à API da OpenAI. Verifique sua conexão.');
    }

    // Erro genérico
    console.error('[Whisper] Erro:', error.message);
    throw new Error(`Erro na transcrição: ${error.message}`);
  }
}

// Exporta a função principal e alias para compatibilidade
module.exports = {
  transcribeAudio,                    // Função principal
  transcrever: transcribeAudio        // Alias para compatibilidade com código existente
};

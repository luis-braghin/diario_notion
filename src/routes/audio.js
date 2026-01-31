const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Importa os serviços
const { transcribeAudio } = require('../services/whisper');
const { processarTexto } = require('../services/claude');
const { addDiaryEntry, formatarData } = require('../services/notion');

// Cria o router Express
const router = express.Router();

/**
 * Estilos de processamento válidos
 */
const ESTILOS_VALIDOS = ['fiel', 'objetivo', 'categorizado'];

/**
 * Formatos de áudio aceitos (extensões)
 */
const FORMATOS_ACEITOS = ['.mp3', '.wav', '.m4a', '.webm', '.ogg', '.mp4', '.flac'];

/**
 * Configuração do Multer para upload de arquivos de áudio
 * - Salva em /uploads com nome único
 * - Limite de 25MB (máximo do Whisper)
 * - Filtra apenas formatos de áudio válidos
 */
const storage = multer.diskStorage({
  // Define o diretório de destino
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    // Cria o diretório se não existir
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  // Gera nome único para evitar conflitos
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `audio-${timestamp}-${random}${ext}`);
  }
});

/**
 * Configuração do upload com validações
 */
const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB - limite do Whisper API
  },
  fileFilter: (req, file, cb) => {
    // Verifica extensão do arquivo
    const ext = path.extname(file.originalname).toLowerCase();
    if (FORMATOS_ACEITOS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Formato não suportado: ${ext}. Use: ${FORMATOS_ACEITOS.join(', ')}`));
    }
  }
});

/**
 * Remove arquivo temporário de forma segura
 * @param {string} filePath - Caminho do arquivo
 */
function limparArquivoTemp(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error('[Audio API] Erro ao limpar arquivo temp:', err.message);
      } else {
        console.log('[Audio API] Arquivo temporário removido');
      }
    });
  }
}

/**
 * POST /api/process-audio
 *
 * Processa áudio de diário pessoal:
 * 1. Transcreve com Whisper
 * 2. Processa com Claude (3 estilos)
 * 3. Salva no Notion
 *
 * @body {FormData}
 *   - audio: arquivo de áudio (obrigatório)
 *   - style: 'fiel' | 'objetivo' | 'categorizado' (obrigatório)
 *
 * @returns {Object}
 *   - success: boolean
 *   - text: texto processado
 *   - date: data formatada ("30 Janeiro 2026")
 *   - transcricao: transcrição original
 */
router.post('/process-audio', upload.single('audio'), async (req, res) => {
  let audioPath = null;
  const dataAtual = new Date();

  try {
    // ========== VALIDAÇÕES ==========

    // Validação: arquivo de áudio obrigatório
    if (!req.file) {
      console.log('[Audio API] Erro: Nenhum arquivo enviado');
      return res.status(400).json({
        success: false,
        error: 'Arquivo de áudio obrigatório. Envie no campo "audio".'
      });
    }

    audioPath = req.file.path;
    const style = req.body.style;

    console.log('[Audio API] ----------------------------------------');
    console.log(`[Audio API] Recebido: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`[Audio API] Estilo: ${style || '(não informado)'}`);

    // Validação: estilo obrigatório
    if (!style) {
      console.log('[Audio API] Erro: Estilo não informado');
      return res.status(400).json({
        success: false,
        error: `Estilo obrigatório. Use: ${ESTILOS_VALIDOS.join(', ')}`
      });
    }

    // Validação: estilo válido
    if (!ESTILOS_VALIDOS.includes(style)) {
      console.log(`[Audio API] Erro: Estilo inválido "${style}"`);
      return res.status(400).json({
        success: false,
        error: `Estilo inválido: "${style}". Use: ${ESTILOS_VALIDOS.join(', ')}`
      });
    }

    // ========== ETAPA 1: TRANSCRIÇÃO ==========

    console.log('[Audio API] Etapa 1/3: Transcrevendo com Whisper...');

    let transcricao;
    try {
      transcricao = await transcribeAudio(audioPath);
    } catch (error) {
      console.error('[Audio API] Erro na transcrição:', error.message);
      return res.status(500).json({
        success: false,
        error: `Erro na transcrição: ${error.message}`
      });
    }

    console.log(`[Audio API] Transcrição OK: ${transcricao.length} caracteres`);

    // ========== ETAPA 2: PROCESSAMENTO ==========

    console.log(`[Audio API] Etapa 2/3: Processando com Claude (${style})...`);

    let textoProcessado;
    try {
      textoProcessado = await processarTexto(transcricao, style);
    } catch (error) {
      console.error('[Audio API] Erro no processamento:', error.message);
      return res.status(500).json({
        success: false,
        error: `Erro no processamento: ${error.message}`
      });
    }

    console.log(`[Audio API] Processamento OK: ${textoProcessado.length} caracteres`);

    // ========== SUCESSO (SEM SALVAR NO NOTION) ==========
    // O salvamento no Notion é feito separadamente via POST /api/entries
    // após o usuário confirmar na tela de preview

    // Formata a data para resposta
    const dataFormatada = formatarData(dataAtual);

    console.log('[Audio API] ----------------------------------------');
    console.log('[Audio API] Sucesso! Texto processado (aguardando confirmação para salvar).');

    // Retorna resposta de sucesso COM os dados para preview
    return res.json({
      success: true,
      text: textoProcessado,
      date: dataFormatada,
      transcricao: transcricao
    });

  } catch (error) {
    // Erro inesperado
    console.error('[Audio API] Erro inesperado:', error.message);
    return res.status(500).json({
      success: false,
      error: `Erro interno: ${error.message}`
    });

  } finally {
    // SEMPRE limpa o arquivo temporário (sucesso ou erro)
    limparArquivoTemp(audioPath);
  }
});

/**
 * POST /api/entries
 *
 * Salva uma entrada de diário no Notion
 * Chamado APÓS o usuário confirmar na tela de preview
 *
 * @body {JSON}
 *   - text: texto processado a ser salvo (obrigatório)
 *   - date: data da entrada (opcional, default: agora)
 *
 * @returns {Object}
 *   - success: boolean
 *   - message: mensagem de confirmação
 *   - date: data formatada
 */
router.post('/entries', express.json(), async (req, res) => {
  try {
    const { text, date } = req.body;

    // Validação: texto obrigatório
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      console.log('[Entries API] Erro: Texto não fornecido');
      return res.status(400).json({
        success: false,
        error: 'Texto obrigatório para salvar a entrada.'
      });
    }

    console.log('[Entries API] ----------------------------------------');
    console.log(`[Entries API] Salvando entrada (${text.length} caracteres)...`);

    // Usa a data fornecida ou a data atual
    const dataEntrada = date ? new Date(date) : new Date();

    // Valida se a data é válida
    if (isNaN(dataEntrada.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Data inválida fornecida.'
      });
    }

    // Salva no Notion
    try {
      await addDiaryEntry(dataEntrada, text.trim());
    } catch (error) {
      console.error('[Entries API] Erro ao salvar no Notion:', error.message);
      return res.status(500).json({
        success: false,
        error: `Erro ao salvar no Notion: ${error.message}`
      });
    }

    const dataFormatada = formatarData(dataEntrada);
    console.log(`[Entries API] Salvo com sucesso: ${dataFormatada}`);
    console.log('[Entries API] ----------------------------------------');

    return res.json({
      success: true,
      message: 'Entrada salva no Notion com sucesso!',
      date: dataFormatada
    });

  } catch (error) {
    console.error('[Entries API] Erro inesperado:', error.message);
    return res.status(500).json({
      success: false,
      error: `Erro interno: ${error.message}`
    });
  }
});

/**
 * Middleware de erro do Multer
 * Captura erros de upload (tamanho, formato, etc)
 */
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    // Erros específicos do Multer
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'Arquivo muito grande. Máximo: 25MB.'
      });
    }
    return res.status(400).json({
      success: false,
      error: `Erro no upload: ${error.message}`
    });
  }

  if (error) {
    // Outros erros (ex: formato inválido do fileFilter)
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }

  next();
});

module.exports = router;

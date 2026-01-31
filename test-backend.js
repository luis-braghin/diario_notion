/**
 * Script de teste do backend Diário Positivo
 *
 * Uso:
 *   node test-backend.js                    # Testa tudo (com áudio de exemplo)
 *   node test-backend.js --whisper audio.mp3  # Testa só Whisper com arquivo
 *   node test-backend.js --claude           # Testa só Claude (usa texto fake)
 *   node test-backend.js --notion           # Testa conexão Notion (não salva)
 *   node test-backend.js --full audio.mp3   # Teste completo com arquivo real
 */

require('dotenv').config();

const whisperService = require('./src/services/whisper');
const claudeService = require('./src/services/claude');
const notionService = require('./src/services/notion');
const { listarEstilos } = require('./src/utils/prompts');
const fs = require('fs');
const path = require('path');

// Cores para o console
const cores = {
  reset: '\x1b[0m',
  verde: '\x1b[32m',
  vermelho: '\x1b[31m',
  amarelo: '\x1b[33m',
  azul: '\x1b[34m',
  cinza: '\x1b[90m'
};

function log(msg, cor = 'reset') {
  console.log(`${cores[cor]}${msg}${cores.reset}`);
}

function header(titulo) {
  console.log('\n' + '='.repeat(60));
  log(`  ${titulo}`, 'azul');
  console.log('='.repeat(60));
}

function sucesso(msg) {
  log(`✓ ${msg}`, 'verde');
}

function erro(msg) {
  log(`✗ ${msg}`, 'vermelho');
}

function info(msg) {
  log(`→ ${msg}`, 'cinza');
}

// Texto de exemplo para testes (simula uma transcrição)
const TRANSCRICAO_EXEMPLO = `
Bom dia, hoje foi um dia bem interessante. Acordei cedo, tipo umas seis e meia,
e consegui fazer minha meditação de manhã, o que foi muito bom né.

Depois fui trabalhar e tive uma reunião importante com o time. A gente discutiu
sobre o novo projeto e eu apresentei minhas ideias. Foi bem legal porque o pessoal
gostou bastante e vamos implementar algumas das minhas sugestões.

No almoço encontrei com a Maria, uma amiga que não via há muito tempo.
Conversamos sobre a vida, ela tá bem, começou um curso novo de design.

À tarde foi mais tranquilo, consegui focar bastante e terminei aquela tarefa
que tava pendente há dias. Me senti muito produtivo.

Ah, e comecei a ler aquele livro que comprei semana passada. Tô gostando muito,
já li uns três capítulos.

No geral foi um dia positivo. Gratidão por ter saúde, um trabalho bom e
amigos queridos. Amanhã quero acordar cedo de novo e manter esse ritmo.
`.trim();

/**
 * Teste 1: Verificar variáveis de ambiente
 */
async function testarEnv() {
  header('TESTE 1: Variáveis de Ambiente');

  const vars = {
    'OPENAI_API_KEY': process.env.OPENAI_API_KEY,
    'ANTHROPIC_API_KEY': process.env.ANTHROPIC_API_KEY,
    'NOTION_TOKEN': process.env.NOTION_TOKEN,
    'NOTION_PAGE_ID': process.env.NOTION_PAGE_ID
  };

  let ok = true;
  for (const [nome, valor] of Object.entries(vars)) {
    if (valor) {
      sucesso(`${nome}: ${valor.substring(0, 10)}...${valor.slice(-4)}`);
    } else {
      erro(`${nome}: NÃO CONFIGURADA`);
      ok = false;
    }
  }

  return ok;
}

/**
 * Teste 2: Whisper (transcrição)
 */
async function testarWhisper(audioPath) {
  header('TESTE 2: Whisper (Transcrição)');

  if (!audioPath) {
    info('Nenhum arquivo de áudio fornecido');
    info('Use: node test-backend.js --whisper seu_audio.mp3');
    info('Pulando teste do Whisper...');
    return null;
  }

  if (!fs.existsSync(audioPath)) {
    erro(`Arquivo não encontrado: ${audioPath}`);
    return null;
  }

  info(`Transcrevendo: ${audioPath}`);
  const stats = fs.statSync(audioPath);
  info(`Tamanho: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  try {
    const inicio = Date.now();
    const transcricao = await whisperService.transcrever(audioPath);
    const tempo = ((Date.now() - inicio) / 1000).toFixed(1);

    sucesso(`Transcrição concluída em ${tempo}s`);
    info(`Caracteres: ${transcricao.length}`);
    console.log('\n--- Transcrição ---');
    console.log(transcricao);
    console.log('--- Fim ---\n');

    return transcricao;
  } catch (err) {
    erro(`Falha: ${err.message}`);
    return null;
  }
}

/**
 * Teste 3: Claude (processamento nos 3 estilos)
 */
async function testarClaude(transcricao) {
  header('TESTE 3: Claude (Processamento)');

  const texto = transcricao || TRANSCRICAO_EXEMPLO;

  if (!transcricao) {
    info('Usando texto de exemplo (nenhuma transcrição fornecida)');
  }

  info(`Texto de entrada: ${texto.length} caracteres`);

  const estilos = listarEstilos();
  const resultados = {};

  for (const estilo of estilos) {
    console.log(`\n${'─'.repeat(50)}`);
    log(`Estilo: ${estilo.toUpperCase()}`, 'amarelo');
    console.log('─'.repeat(50));

    try {
      const inicio = Date.now();
      const resultado = await claudeService.processar(texto, estilo);
      const tempo = ((Date.now() - inicio) / 1000).toFixed(1);

      sucesso(`Processado em ${tempo}s (${resultado.length} chars)`);
      console.log('\n' + resultado + '\n');

      resultados[estilo] = resultado;
    } catch (err) {
      erro(`Falha: ${err.message}`);
      resultados[estilo] = null;
    }
  }

  return resultados;
}

/**
 * Teste 4: Notion (apenas verificar conexão, NÃO salva)
 */
async function testarNotion() {
  header('TESTE 4: Notion (Verificação de Conexão)');

  info('Verificando conexão com Notion...');
  info('Modo DRY-RUN: Nenhum dado será salvo');

  try {
    const conectado = await notionService.verificarConexao();

    if (conectado) {
      sucesso('Conexão com Notion OK');
      sucesso(`Page ID configurado: ${process.env.NOTION_PAGE_ID}`);
      return true;
    } else {
      erro('Falha na conexão com Notion');
      return false;
    }
  } catch (err) {
    erro(`Erro: ${err.message}`);
    return false;
  }
}

/**
 * Teste completo (Whisper + Claude + verificação Notion)
 */
async function testeCompleto(audioPath) {
  header('TESTE COMPLETO (DRY-RUN)');

  // 1. Env
  const envOk = await testarEnv();
  if (!envOk) {
    erro('Configure as variáveis de ambiente antes de continuar');
    return;
  }

  // 2. Whisper (se tiver áudio)
  let transcricao = null;
  if (audioPath) {
    transcricao = await testarWhisper(audioPath);
  } else {
    info('Sem arquivo de áudio - usando texto de exemplo para Claude');
  }

  // 3. Claude
  const resultados = await testarClaude(transcricao);

  // 4. Notion (só verifica)
  await testarNotion();

  // Resumo
  header('RESUMO DO TESTE');

  const estilosOk = Object.values(resultados).filter(r => r !== null).length;
  sucesso(`Estilos processados: ${estilosOk}/${Object.keys(resultados).length}`);

  if (transcricao) {
    sucesso('Whisper: OK');
  } else {
    info('Whisper: Não testado (sem arquivo de áudio)');
  }

  console.log('\n' + '─'.repeat(60));
  log('Teste concluído! Nenhum dado foi salvo no Notion.', 'verde');
  console.log('─'.repeat(60) + '\n');
}

// CLI
async function main() {
  const args = process.argv.slice(2);

  console.log('\n');
  log('🧪 DIÁRIO POSITIVO - SCRIPT DE TESTE', 'azul');
  log('   Modo: DRY-RUN (nada será salvo)', 'cinza');

  // Parse argumentos
  if (args.includes('--whisper')) {
    const idx = args.indexOf('--whisper');
    const audioPath = args[idx + 1];
    await testarEnv();
    await testarWhisper(audioPath);
  }
  else if (args.includes('--claude')) {
    await testarEnv();
    await testarClaude(null); // Usa texto de exemplo
  }
  else if (args.includes('--notion')) {
    await testarEnv();
    await testarNotion();
  }
  else if (args.includes('--full')) {
    const idx = args.indexOf('--full');
    const audioPath = args[idx + 1];
    await testeCompleto(audioPath);
  }
  else if (args.length > 0 && !args[0].startsWith('--')) {
    // Se passou só um arquivo, assume teste completo
    await testeCompleto(args[0]);
  }
  else {
    // Sem argumentos: teste completo sem áudio
    await testeCompleto(null);
  }
}

main().catch(err => {
  erro(`Erro fatal: ${err.message}`);
  process.exit(1);
});

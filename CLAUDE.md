\# Diário Positivo AI - Backend



\## Visão Geral

API Node.js que processa áudios de diário e salva no Notion.



\## Estrutura

```

/src

&nbsp; /routes

&nbsp;   - audio.js (POST /api/process-audio)

&nbsp; /services

&nbsp;   - whisper.js (OpenAI Whisper API - Speech-to-Text)

&nbsp;   - claude.js (Anthropic Claude API - Processamento)

&nbsp;   - notion.js (Notion API - Salvar entradas)

&nbsp; /utils

&nbsp;   - prompts.js (Prompts para cada estilo)

&nbsp; server.js

```



\## Stack

\- Node.js + Express

\- OpenAI Whisper API (transcrição)

\- Anthropic Claude API (processamento de texto)

\- Notion API (storage)



\## Variáveis de Ambiente (.env)

```

OPENAI\_API\_KEY=sk-...

ANTHROPIC\_API\_KEY=sk-ant-...

NOTION\_API\_KEY=secret\_...

NOTION\_PAGE\_ID=xxxxxxxx-xxxx-...

PORT=3000

```



\## Fluxo da API

1\. POST /api/process-audio recebe:

&nbsp;  - audio (file)

&nbsp;  - style ("fiel" | "objetivo" | "categorizado")

2\. Whisper API transcreve áudio

3\. Claude API processa conforme estilo

4\. Notion API salva na página do ano

5\. Retorna texto processado



\## Estilos de Processamento



\### 📝 Fiel

\- Transcrição literal + correção gramatical

\- Mantém tom pessoal

\- Organiza em parágrafos



\### 🎯 Objetivo

\- Resumo direto ao ponto

\- Remove redundâncias

\- 2-3 parágrafos max



\### 📊 Categorizado

\- Organiza por temas (Trabalho, Pessoal, etc)

\- Bullet points

\- Usa emojis



## Formato Notion
## 01 Janeiro 2026
[Texto do diário aqui]

## 02 Janeiro 2026
[Texto seguinte]

## 03 Janeiro 2026
[Texto mais recente]

- Heading 2 (##) com data
- Texto normal abaixo
- Ordem cronológica normal (mais antiga no topo, mais recente no fim)
- Adicionar nova entrada NO FINAL da página

## Regras
- Sempre adicionar nova entrada NO FINAL da página (append)
- Formato de data: "DD MMMM YYYY" em português (ex: "30 Janeiro 2026")
- Adicionar linha em branco entre entradas
- Sempre testar endpoints antes de commitar
- NÃO sobrescrever entradas existentes

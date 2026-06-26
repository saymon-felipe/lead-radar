# Lead Radar Worker - IA local embutida

## Objetivo

A IA local roda tarefas frequentes e baratas no próprio worker:

- validar se uma string é nome de pessoa;
- classificar resultados de busca;
- reescrever queries que deram zero resultado;
- limpar texto HTML antes de extrações.

A OpenAI continua sendo usada no backend para validações críticas/ambíguas, como DDD/localidade e decisões finais.

## Runtime

Provider inicial: `llama.cpp` via `llama-server` local.

O painel do worker fica em:

```txt
http://127.0.0.1:4004
```

A aba **IA local** permite configurar:

- endpoint;
- caminho do `llama-server.exe`;
- caminho do modelo `.gguf`;
- dispositivo `auto/cpu/cuda/vulkan`;
- tarefas habilitadas.

## Estrutura esperada

```txt
worker/vendor/llama.cpp/cpu/llama-server.exe
worker/vendor/llama.cpp/cuda/llama-server.exe
worker/vendor/models/lead-radar-local.gguf
```

Para baixar e organizar os arquivos automaticamente:

```powershell
npm run setup:local-ai --workspace worker
```

## Modelos recomendados

Para GTX 1050 Ti 4 GB ou CPU comum, use modelos pequenos quantizados:

```txt
Llama 3.2 1B Instruct Q4_K_M
Gemma 3 1B Instruct Q4
Qwen 2.5/3 1.5B Instruct Q4
```

Renomeie o arquivo `.gguf` escolhido para:

```txt
lead-radar-local.gguf
```

ou altere o caminho no painel.

## Telemetria

O worker registra localmente:

- chamadas;
- erros;
- tokens estimados;
- latência média;
- uso de RAM;
- GPU via `nvidia-smi`, quando disponível.

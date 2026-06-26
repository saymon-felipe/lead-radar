# Lead Radar Worker - setup da IA local

## Como preparar

Execute na raiz do repositório:

```powershell
npm run setup:local-ai --workspace worker
```

O script consulta a latest release oficial do `ggml-org/llama.cpp`, baixa os zips Windows x64 de CPU e CUDA quando encontrados, extrai os arquivos e posiciona o `llama-server.exe` nestes caminhos:

```txt
worker/vendor/llama.cpp/cpu/llama-server.exe
worker/vendor/llama.cpp/cuda/llama-server.exe
```

Se a release tiver um pacote separado de DLL/runtime CUDA, o script copia as DLLs para:

```txt
worker/vendor/llama.cpp/cuda/
```

O modelo padrão é:

```txt
Repo: bartowski/Llama-3.2-1B-Instruct-GGUF
Arquivo: Llama-3.2-1B-Instruct-Q4_K_M.gguf
Destino: worker/vendor/models/lead-radar-local.gguf
```

## Como testar

Depois do setup:

```powershell
npm run build --workspace worker
npm run dev
```

Abra:

```txt
http://127.0.0.1:4004
```

Na aba **IA local**, use:

```txt
Preparar IA local
Iniciar runtime
Testar runtime
```

Também existem endpoints locais:

```txt
GET  /v1/local-ai/status
POST /v1/local-ai/setup
POST /v1/local-ai/start
POST /v1/local-ai/stop
POST /v1/local-ai/test
```

## CPU, CUDA e fallback

Com `device = auto`, o worker tenta CUDA quando:

- `worker/vendor/llama.cpp/cuda/llama-server.exe` existe;
- `nvidia-smi` responde com código 0;
- o healthcheck inicial do `llama-server` fica saudável.

Se CUDA não existir, a NVIDIA não for detectada ou o servidor CUDA falhar no healthcheck, o worker registra o motivo e cai para CPU.

Para forçar CPU, selecione:

```txt
device = cpu
```

Para tentar CUDA primeiro:

```txt
device = cuda
```

Por padrão, `device = cuda` ainda pode cair para CPU se CUDA falhar. Para impedir fallback, marque **exigir CUDA sem fallback**.

## Trocar modelo

Edite as constantes em:

```txt
worker/src/local-ai/setup.ts
```

```ts
DEFAULT_MODEL_REPO
DEFAULT_MODEL_FILE
DEFAULT_MODEL_OUTPUT
```

Ou informe manualmente outro caminho GGUF no painel do worker. Se o caminho manual existir, ele será respeitado; caso contrário, o worker usa:

```txt
worker/vendor/models/lead-radar-local.gguf
```

## Arquivos não versionados

Por padrão, estes arquivos não devem entrar no Git:

```txt
worker/vendor/models/*.gguf
worker/vendor/tmp/
worker/vendor/**/*.zip
```


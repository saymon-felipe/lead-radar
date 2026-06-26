# llama.cpp bundled runtime

Coloque aqui os binarios embutidos do `llama.cpp` usados pelo worker.

Estrutura esperada no Windows:

```txt
worker/vendor/llama.cpp/cpu/llama-server.exe
worker/vendor/llama.cpp/cuda/llama-server.exe
worker/vendor/models/lead-radar-local.gguf
```

O worker nao exige instalacao externa. Execute:

```powershell
npm run setup:local-ai --workspace worker
```

Quando `device = auto`, o worker tenta CUDA se `nvidia-smi` detectar NVIDIA e o runtime CUDA existir. Se CUDA falhar, ele cai para CPU e registra o motivo no status local.

Arquivos grandes nao sao versionados por padrao:

- `llama-server.exe`
- DLLs CUDA/Vulkan, se usadas
- modelo `.gguf`
- zips temporarios


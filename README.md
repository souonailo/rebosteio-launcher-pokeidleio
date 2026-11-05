<div align="center">

<img src="src/ui/assets/pokeidle-logo-smooth.png" width="320" alt="PokeIdle.IO">

<p>By</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="src/ui/assets/rebosteio-logo.png">
  <img src="src/ui/assets/rebosteio-logo-ink.png" width="280" alt="Rebosteio">
</picture>

# PIO Rebosteio — Launcher Multi-Contas

**Quatro contas, uma equipe e muita história pra compartilhar.** 🎮

Um cantinho da comunidade para quem curte PokeIdle, boas caçadas e aquela resenha entre treinadores.

![Windows x64](https://img.shields.io/badge/Windows-x64-0078D6?style=flat-square)
![Rust](https://img.shields.io/badge/backend-Rust-D97757?style=flat-square)
![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square)
![Contas](https://img.shields.io/badge/contas-4-A78BFA?style=flat-square)
[![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-58A65C?style=flat-square)](LICENSE)

[English](README.en.md) · [Tutorial](TUTORIAL.md) · [Manual](MANUAL.md) · [FAQ](FAQ.md) · [Contribuir](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

</div>

---

## Instalação por executável (Windows x64)

Abra `PIO-Nailo-2.0.32-Setup.exe` e conclua a instalação. O pacote tem aproximadamente 1,62 GB; a extração pode levar alguns minutos e requer cerca de 5 GB livres durante a instalação. Depois use o atalho PIO Nailo. O pacote inclui Python, bibliotecas de login, Camoufox e o instalador offline do WebView2; não requer Rust, Visual Studio, Node ou comandos no computador do jogador. O acesso ao jogo continua exigindo internet.

Para gerar o instalador neste checkout preparado: `powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-installer.ps1`. O resultado fica em `dist/`. Abra o aplicativo pelo `pio-nailo-rust.exe` da pasta principal.

### Compilação de release para a raiz (`pio-nailo-rust.exe`)

Para compilar o binário otimizado de release diretamente para a raiz do repositório:

- Execute **`npm run build:release`** na raiz ou execute:
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-release.ps1
  ```
- Para reutilização por instaladores ou cópia direta do binário compilado sem recompilar, utilize a flag `-CopyOnly`:
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-release.ps1 -CopyOnly
  ```

O script `tools/build-release.ps1`:

- Executa a compilação via `cargo tauri build --no-bundle -- --locked`.
- Controla explicitamente o diretório de saída (`CARGO_TARGET_DIR`, padronizado em `rust-migration/src-tauri/target`), prevenindo a cópia de binários obsoletos.
- Interrompe a execução com mensagem clara caso o executável de destino (`pio-nailo-rust.exe`) esteja em execução ou bloqueado.
- Copia o executável resultante para a raiz apenas após build bem-sucedido, preservando o executável existente se houver falha de compilação.
- Valida a integridade do arquivo conferindo o hash SHA256 do binário de origem com o executável copiado no destino.
- Após validar a cópia, apaga toda a pasta `rust-migration/src-tauri/target`. Falhas de build ou validação preservam `target`. Uma falha na limpeza é informada sem apagar o `.exe` da raiz.

O build do instalador primeiro copia e valida o instalador em `dist/`, depois atualiza o `.exe` da raiz e remove `target`. A próxima compilação recriará o cache e demorará mais. Um `cargo build --release` avulso não realiza essa cópia nem a limpeza. Não execute builds concorrentes neste checkout.

## 👋 Chega mais, treinador!

Launcher de PokeIdle para Windows x64, com quatro contas, WebView2 e backend Rust. Esta é a versão principal do projeto. O código Electron permanece como referência e para testes de migração; seu antigo inicializador foi removido.

> 🌱 **Primeira vez por aqui?** Comece pelo [tutorial](TUTORIAL.md). O passo a passo te acompanha na preparação do launcher.

## 📊 Quanto o launcher consome?

Cinco modos lado a lado para você comparar o consumo de CPU e memória. 💜

| Modo | CPU média | CPU pico | RAM média | RAM pico |
|:---|---:|---:|---:|---:|
| 🟣 **Normal** | 38,4% | 88,6% | 3.323 MiB | 4.022 MiB |
| 🔵 **Eco** | 26,2% | 37,1% | 2.205 MiB | 2.383 MiB |
| 🩵 **Só caça** | 24,4% | 40,4% | 2.171 MiB | 2.417 MiB |
| 🟡 **Batalha** | **4,9%** | **11,2%** | 928 MiB | 1.126 MiB |
| 🟢 **Headless** | 6,1% | 14,3% | **560 MiB** | **769 MiB** |

<sub>Valores transcritos da tabela enviada pelo mantenedor. Hardware, versão do launcher, quantidade de contas, duração e método de medição não informados; os resultados não representam uma garantia de consumo no seu computador.</sub>

## 🚀 Bora abrir o launcher

1. Clone este repositório ou seu fork, ou use **Code → Download ZIP** e extraia tudo.
2. No checkout já preparado, gere o release com **`npm run build:release`** ou com o comando PowerShell acima.
3. Abra **`pio-nailo-rust.exe`** na raiz. Para a segunda instância, use `pio-nailo-rust.exe --instance=2`. Atalhos devem apontar para esse executável.

Um ambiente novo precisa das seguintes dependências (o build de release não as instala automaticamente):

| Dependência | Uso |
|---|---|
| Rust stable / Cargo, via rustup | Compilação incremental do backend |
| Microsoft C++ Build Tools, carga VCTools e componentes recomendados | Compilador/linker e SDK do Windows |
| Microsoft Edge WebView2 Runtime | Interface e páginas das contas |
| Tauri CLI 2.12.1 | Execução da aplicação e servidor local da interface |
| Python e ambiente virtual em `.runtime/python` | Ponte de login |
| Camoufox 0.5.4 e seu navegador | Dependência do login pelo helper Python |
| Crates de `Cargo.lock` | Bibliotecas Rust baixadas pelo Cargo |

Node.js/npm são necessários apenas se você escolher o comando npm; o comando PowerShell dispensa ambos. Electron não é necessário. Consulte o [tutorial](TUTORIAL.md) para preparar um ambiente novo.

## 🔄 Manter a equipe em dia

Atualize o código manualmente, preservando alterações locais, e execute novamente `npm run build:release`. O executável não atualiza o repositório automaticamente.

A interface principal está em `rust-migration/ui/` e é incluída no release. Mudanças na interface ou no Rust exigem um novo build para aparecer no `.exe`.

Feche o executável da raiz antes de substituí-lo por um novo build. As sessões permanecem nas pastas de dados descritas abaixo.

## 🧭 Por dentro do projeto

- `rust-migration/src-tauri/`: backend Rust, configuração e permissões Tauri.
- `rust-migration/ui/`: HTML, CSS, JavaScript, imagens e ponte Tauri.
- `rust-migration/tools/turnstile_solver.py`: helper de login.
- `tools/build-release.ps1`: compilação, cópia validada do release para a raiz e limpeza de `target`.
- `tools/start-rust.ps1`: preparação e execução; `tools/update-source.ps1`: atualização conservadora pelo Git.
- `test/`: verificações, incluindo contratos de migração.
- `index.html`, `main.js`, `preload.js` e `src/`: implementação Electron anterior.

## 🔐 Seu cantinho no computador e caminhos de sessão

O backend Rust isola os dados de sessão, perfis WebView2 e credenciais protegidas por DPAPI em diretórios específicos no `%APPDATA%`:

- **Instância padrão (1):** `%APPDATA%/pionailo` (identificador `com.pionailo.launcher`).
- **Instâncias adicionais (`--instance=N`):** `%APPDATA%/pionailo-instancia-N` (identificador `com.pionailo.launcher.instanciaN`, por exemplo `pionailo-instancia-2`).

Não apague essas pastas ao atualizar, pois guardam as contas e configurações de cada perfil. Perfis do Electron e do Rust são distintos; não há promessa de migração automática dos cookies entre engines. A execução de desenvolvimento usa uma origem local diferente do executável empacotado, podendo ter preferências de interface próprias.

### Recursos locais ao lado do repositório

Mantenha o executável na raiz deste checkout preparado. O login local encontra `tools/turnstile_solver.py` e `.runtime/python/Scripts/python.exe` a partir da localização do executável, mesmo quando um atalho usa outra pasta de trabalho. A variável `PIO_NAILO_PYTHON`, quando definida, continua tendo prioridade. Os arquivos de sessão existentes não são copiados nem alterados pelo build.

Credenciais precisam ser enviadas aos serviços envolvidos no login; criptografia local não significa ausência de tráfego de autenticação. Não envie perfis, tokens, cookies ou arquivos de contas em commits/issues.

## 📦 Publicação

Não há build automática a cada commit. Pacotes de distribuição são gerados manualmente quando o mantenedor decidir publicar uma versão. Veja [CONTRIBUTING.md](CONTRIBUTING.md). O fluxo principal para usuários que fazem forks é o código-fonte.

Windows x64 é o alvo deste inicializador. Outros sistemas não estão cobertos por este fluxo.

Licença: [MIT](LICENSE).

---

## 💬 A comunidade também faz parte

Achou um problema, teve uma ideia ou quer ajudar quem está chegando? Tem espaço pra isso aqui.

- **Encontrou um bug?** Abra uma issue contando o que aconteceu e como reproduzir. Lembre de remover dados pessoais dos prints e logs.
- **Tem uma ideia?** Conte o que ela facilitaria nas suas caçadas.
- **Quer colocar a mão no código?** O [guia de contribuição](CONTRIBUTING.md) mostra por onde começar.
- **Ficou com dúvida?** Dê uma olhada no [FAQ](FAQ.md), no [manual](MANUAL.md) e no [tutorial](TUTORIAL.md).

Vale perguntar, ensinar e discordar com respeito. Cada contribuição ajuda o próximo treinador. 💜

<div align="center">

**Boa caçada — e que venha aquele shiny!** ✨

<sub>PokeIdle.IO · By Rebosteio · Comunidade PokeIdle</sub>

</div>

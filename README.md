# Fable TV

Aplicativo IPTV **legal, privado e local-first** para Windows, Linux, macOS e Android, construído com **Tauri v2 + Rust + React + TypeScript + Tailwind CSS + Framer Motion + SQLite**.

O Fable TV transforma **as suas próprias fontes legais** — listas M3U/M3U8, URLs autorizadas ou catálogos compatíveis configurados manualmente — em uma biblioteca pessoal com cara de plataforma de streaming: tela inicial com "continue assistindo", favoritos, categorias, busca global e player imersivo.

---

## ⚖️ Aviso legal

- O app **não vem com nenhum conteúdo, lista, servidor, chave ou credencial**.
- Ele só funciona com fontes **fornecidas e autorizadas pelo próprio usuário**.
- "Sincronizar/baixar" significa **cachear listas, catálogos, índices e metadados** (nomes, logos, EPG) no banco SQLite local — **nunca** baixar mídia para uso offline.
- Não há scraping de conteúdo pirata, burla de DRM, desbloqueio ou qualquer mecanismo de acesso não autorizado.
- Você é responsável por garantir que tem direito de acesso às fontes que configurar.

## 🔒 Privacidade

- **Zero telemetria.** Nenhum dado é enviado a servidores externos.
- O app só fala com os servidores **que você configurou** (para baixar a lista/EPG/logos) e com nada mais.
- Credenciais ficam apenas no banco SQLite local, dentro do diretório de dados do app.
- URLs são validadas (somente `http`/`https`), entradas são sanitizadas e **todas** as queries SQL são parametrizadas.

---

## Arquitetura — Rust primeiro

Toda a lógica de negócio vive no backend Rust (`src-tauri/`). O React cuida apenas de interface, animações, estado de tela e player.

```
src-tauri/src/
├── lib.rs           # bootstrap do Tauri, estado global, registro de comandos
├── commands.rs      # ~35 comandos Tauri (única API exposta ao frontend)
├── db.rs            # SQLite (rusqlite): WAL, writer serializado + pool de leitores, migrações
├── m3u.rs           # parser M3U/M3U8 robusto + classificador de conteúdo
├── catalog_api.rs   # cliente para fontes de catálogo separado (convenção player_api)
├── epg.rs           # parser XMLTV em streaming (com suporte a .gz)
├── sync.rs          # motor de sincronização: jobs assíncronos, progresso, cancelamento
├── security.rs      # validação de URLs, caminhos e tipos
├── models.rs        # structs serde compartilhadas com o frontend
└── repo/            # todo o SQL fica aqui (parametrizado)
    ├── catalog.rs   # canais, filmes, séries, episódios, categorias
    ├── epg.rs       # cache de programação, now/next
    ├── user_data.rs # favoritos, histórico, perfis
    ├── search.rs    # busca global
    ├── home.rs      # payload da tela inicial
    ├── settings.rs  # configurações chave/valor
    ├── sources.rs   # CRUD de fontes
    └── import_export.rs # exportação/importação JSON

src/                 # React (UI apenas)
├── lib/api.ts       # wrappers tipados de invoke() — o front NUNCA executa SQL
├── lib/nav.ts       # navegação espacial (setas/D-pad/controle remoto)
├── lib/i18n.tsx     # pt-BR (padrão) e inglês
├── components/      # cards, grades virtualizadas, modais, layout
└── pages/           # Home, TV ao Vivo, Filmes, Séries, Busca, Fontes, Ajustes, Player
```

**Regras de comunicação:**
- Frontend → Rust: somente comandos Tauri (`invoke`).
- Rust → Frontend: eventos (`sync://progress`) para progresso de tarefas longas.
- URLs de stream (que podem conter credenciais) são montadas **no Rust** e só são entregues no momento de reproduzir (`resolve_stream`); as listagens nunca incluem URLs.

## Catálogos separados (não é "uma playlist gigante")

O IPTV é tratado como catálogos independentes no SQLite:

| Catálogo  | Tabela           | Sincronização |
|-----------|------------------|---------------|
| Canais    | `channels`       | seletiva por fonte |
| Filmes    | `movies`         | seletiva por fonte |
| Séries    | `series`         | seletiva por fonte |
| Episódios | `episodes`       | M3U: na sincronização; API: **sob demanda** ao abrir a série |
| EPG       | `epg_programs`   | seletiva, com janela de dias configurável |
| Logos     | arquivos em cache + `logo_path` | seletiva, com limite configurável |

Ao adicionar uma fonte você escolhe o que sincronizar (só canais, só filmes, só séries, só EPG, só logos ou tudo) — e na tela **Fontes** há botões para sincronizar cada catálogo isoladamente, com barra de progresso e **cancelamento**.

### Como o cache seletivo funciona

- Cada sincronização recebe um `sync_token`; os itens são **upsertados por chave estável** (`source_id + stream_url` ou `external_id`), então os IDs internos sobrevivem à ressincronização e favoritos/histórico não quebram. Itens que sumiram da fonte são removidos ao final.
- EPG é filtrado: só programas de canais que existem localmente, dentro da janela `epg_days` (1–14 dias; 1 dia no modo leve).
- Logos são baixados com concorrência limitada (6), tamanho máximo 2 MB, e gravados no diretório de cache do app; o limite é de 5000 por sincronização (300 no modo leve).

### Classificação de playlists mistas

O parser M3U extrai nome, URL, duração, `tvg-id`, `tvg-name`, `tvg-logo`, `group-title`, `#EXTGRP` e atributos extras. O classificador decide entre **canal / filme / episódio de série / desconhecido** usando:
- extensão da URL (`.mp4/.mkv/...` = VOD; `.ts/.m3u8`/sem extensão = live);
- caminho da URL (`/movie/`, `/series/`, `/live/`);
- dicas do grupo ("Filmes", "Séries", "Canais"…);
- padrões de título: `S01E02`, `2x08`, `Temporada 3 Episódio 12`, `Ep. 1071` etc.

Itens desconhecidos são mantidos como canais para nada desaparecer. Episódios de M3U são agrupados em séries sintéticas pelo nome.

## Banco de dados local

- Arquivo: `<dados do app>/fabletv.db` (ex.: `%APPDATA%/com.fabletv.app/` no Windows).
- `journal_mode=WAL`, `synchronous=NORMAL`, foreign keys, índices em todas as colunas de filtro/ordenação.
- Escritas em **lotes de 1000 dentro de transações**; um escritor serializado + pool de conexões de leitura (a UI continua respondendo durante uma sincronização grande).
- Busca em colunas `search_text` normalizadas (minúsculas, sem acentos) — "acao" encontra "Ação".
- Versionamento de esquema via `PRAGMA user_version`.

## Como rodar

### Pré-requisitos

- Node.js 18+ e npm
- Rust estável (1.80+) — <https://rustup.rs>
- Dependências do Tauri v2 por plataforma: <https://v2.tauri.app/start/prerequisites/>
  - Windows: WebView2 (já incluso no Win 10/11) + Build Tools do VS
  - Linux: `webkit2gtk-4.1`, `libayatana-appindicator` etc.
  - macOS: Xcode Command Line Tools

### Desenvolvimento (desktop)

```bash
npm install
npm run tauri dev
```

### Build de produção (desktop)

```bash
npm run tauri build
# instaladores em src-tauri/target/release/bundle/
```

### Android

```bash
# uma vez: instale Android Studio + SDK/NDK e exporte ANDROID_HOME/NDK_HOME
npm run tauri android init
npm run tauri android dev      # roda no emulador/dispositivo
npm run tauri android build    # gera APK/AAB
```

O modo leve é ativado por padrão no Android (menos EPG, menos logos, episódios sob demanda).

### Testes (Rust)

```bash
cd src-tauri
cargo test
```

Cobertura: parser M3U (atributos, aspas, EXTGRP, BOM), classificação de conteúdo, validações de segurança, migração do banco, upserts com IDs estáveis, favoritos, histórico/continue assistindo, perfis, busca global, EPG (XMLTV, gzip, fusos), exportação/importação e registro de jobs.

## Funcionalidades

- **Home estilo streaming**: continue assistindo, favoritos, canais recentes, filmes/séries recém-adicionados, categorias e status das fontes — você nunca cai numa lista técnica gigante.
- **TV ao Vivo** com categorias na lateral, grade virtualizada e *now/next* do EPG.
- **Filmes e Séries** com pôsteres, filtros por categoria, paginação sob demanda e telas de detalhe com sinopse.
- **Player imersivo**: HLS (hls.js) + MP4/MKV nativo, controles com auto-ocultar, retomar de onde parou, próximo episódio automático, favorito rápido, fullscreen, atalhos (espaço, ←/→ ±10s, `f`, `m`, Esc) e tela de erro com retry. Histórico só é gravado após ~5 s de reprodução real.
- **Busca global em Rust** agrupada por canais, filmes, séries, episódios, categorias e EPG das próximas 24h.
- **Favoritos e histórico** para todos os tipos de conteúdo, por perfil.
- **Perfis** com favoritos/histórico separados.
- **Navegação por teclado/D-pad** em todo o app (foco visível, setas espaciais, Esc/Backspace volta, `/` abre a busca).
- **Exportar/Importar** configuração (fontes, ajustes e favoritos com chaves estáveis) via JSON local.
- **Ajustes**: tema escuro/claro, idioma (pt-BR padrão / inglês), modo leve, dias de EPG, preferências do player, limpeza de caches com estatísticas de uso.

## Limitações atuais

- **MPEG-TS bruto** (`.ts` direto) não toca no `<video>` nativo — prefira a variante HLS (`.m3u8`) da sua fonte. Fontes de catálogo separado já usam `.m3u8` para canais.
- Conteúdo com DRM não é suportado (e burlar DRM está fora do escopo por princípio).
- Favoritos importados de outro aparelho só são religados após sincronizar as mesmas fontes (a correspondência usa URL de stream/IDs externos).
- A correspondência de EPG usa `tvg-id`; canais sem `tvg-id` não mostram programação.
- Auto-update de catálogos em segundo plano ainda não é agendado (sincronização é manual ou ao abrir a tela de fontes).
- `m3u_file` referencia o arquivo local pelo caminho; se o arquivo mudar de lugar, edite a fonte.

## Licença

Uso pessoal/educacional. Não distribua com conteúdo, listas ou credenciais de terceiros.

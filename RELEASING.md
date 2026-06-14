# Publicando o Fable TV (instaladores + links de download)

O build de cada plataforma roda no runner certo via GitHub Actions
(`.github/workflows/release.yml`) e os instaladores são anexados a uma
**Release** do GitHub — é dela que saem os **links de download**, e é ela que o
botão **Ajustes → Atualizações → Verificar atualizações** consulta dentro do app.

## Como gerar uma versão

1. Ajuste a versão em **três** lugares (devem bater com a tag):
   - `package.json` → `"version"`
   - `src-tauri/Cargo.toml` → `version`
   - `src-tauri/tauri.conf.json` → `"version"`
2. Suba o código e crie a tag:
   ```bash
   git add -A && git commit -m "release: v0.2.0"
   git push origin master
   git tag v0.2.0
   git push origin v0.2.0
   ```
3. O workflow dispara sozinho e, ao terminar, a Release aparece em
   `https://github.com/domagalskidasilva-coder/fable-tv/releases` com:
   - **Windows**: `Fable TV_<versão>_x64-setup.exe`
   - **Linux**: `.deb` (Debian/Ubuntu) e `.AppImage` (universal)
   - **Android**: `app-universal-debug.apk` (instalável para testes)

   Também dá para disparar manualmente em **Actions → Release → Run workflow**,
   informando a tag.

## Atualização dentro do app

`Ajustes → Atualizações` compara a versão instalada com a **última Release** do
repositório. Quando a tag publicada for maior que a versão do app, aparece
"Nova versão disponível" + **Baixar atualização** (abre o instalador no
navegador). Por isso a tag/versão da Release precisa ser **maior** que a do app
instalado para o usuário ver a atualização.

## APK de release assinado (opcional)

O workflow gera um **APK debug** (sem segredos, instala para testes). Para um
APK de release assinado para distribuição:

1. Gere uma keystore:
   ```bash
   keytool -genkey -v -keystore fabletv.jks -keyalg RSA -keysize 2048 \
     -validity 10000 -alias fabletv
   ```
2. Cadastre como **secrets** do repositório (Settings → Secrets → Actions):
   `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
   `ANDROID_KEY_PASSWORD`.
3. Acrescente, antes do `tauri android build`, um passo que recria a keystore a
   partir do secret e grava `src-tauri/gen/android/keystore.properties`, e troque
   o build para `npx tauri android build --apk` (sem `--debug`).

(Os secrets só são necessários para o APK assinado; Windows e Linux não
precisam de nenhum segredo.)

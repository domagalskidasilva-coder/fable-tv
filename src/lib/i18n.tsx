import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

export type Language = "pt-BR" | "en";

const ptBR: Record<string, string> = {
  // navigation
  "nav.home": "Início",
  "nav.live": "TV ao Vivo",
  "nav.movies": "Filmes",
  "nav.series": "Séries",
  "nav.search": "Buscar",
  "nav.favorites": "Favoritos",
  "nav.history": "Histórico",
  "nav.sources": "Fontes",
  "nav.profiles": "Perfis",
  "nav.settings": "Ajustes",

  // profiles
  "who.title": "Quem está assistindo?",
  "who.manage": "Gerenciar perfis",
  "who.add": "Adicionar perfil",
  "who.welcomeTitle": "Bem-vindo ao Fable TV",
  "who.welcomeSub": "Crie seu primeiro perfil para começar a montar sua biblioteca pessoal.",
  "who.createFirst": "Criar meu perfil",
  "profiles.title": "Perfis",
  "profiles.subtitle":
    "Cada perfil é uma biblioteca isolada, com suas próprias listas, favoritos e histórico.",
  "profiles.new": "Novo perfil",
  "profiles.edit": "Editar perfil",
  "profiles.name": "Nome do perfil",
  "profiles.color": "Cor",
  "profiles.image": "Imagem",
  "profiles.uploadImage": "Enviar imagem",
  "detail.cast": "Elenco",
  "detail.director": "Direção",
  "detail.country": "País",
  "detail.trailer": "Trailer",
  "profiles.switchTo": "Entrar neste perfil",
  "profiles.switch": "Trocar perfil",
  "profiles.manage": "Gerenciar",
  "profiles.active": "Em uso",
  "profiles.deleteConfirm":
    "Excluir este perfil, suas listas e tudo que foi sincronizado nele? Favoritos e histórico do perfil também serão apagados.",
  "profiles.counts": "{c} canais · {m} filmes · {s} séries",
  "profiles.empty": "Sem conteúdo ainda. Adicione uma lista e sincronize.",
  "profiles.playlists": "Listas deste perfil",
  "profiles.addPlaylist": "Adicionar lista",
  "profiles.back": "Perfis",

  // common
  "common.loading": "Carregando…",
  "common.retry": "Tentar novamente",
  "common.cancel": "Cancelar",
  "common.save": "Salvar",
  "common.delete": "Excluir",
  "common.edit": "Editar",
  "common.add": "Adicionar",
  "common.close": "Fechar",
  "common.all": "Todos",
  "common.play": "Assistir",
  "common.resume": "Continuar",
  "common.back": "Voltar",
  "common.error": "Algo deu errado",
  "common.seeAll": "Ver tudo",
  "common.moreInfo": "Mais informações",
  "common.items": "{n} itens",
  "common.never": "nunca",
  "common.confirmTitle": "Tem certeza?",

  // home
  "home.welcome": "Sua central de streaming pessoal",
  "home.welcomeSub":
    "Adicione suas próprias fontes legais (listas M3U ou catálogos configurados por você) e o Fable TV organiza tudo em uma biblioteca bonita e rápida.",
  "home.addFirstSource": "Adicionar minha primeira fonte",
  "home.continueWatching": "Continue assistindo",
  "home.favorites": "Seus favoritos",
  "home.recentChannels": "Canais recentes",
  "home.latestMovies": "Filmes adicionados",
  "home.latestSeries": "Séries adicionadas",
  "home.top10": "Top 10 de hoje",
  "home.categories": "Categorias de TV",
  "home.sources": "Suas fontes",
  "home.lastSync": "Última sincronização: {when}",
  "home.syncNow": "Sincronizar",
  "home.channels": "{n} canais",
  "home.movies": "{n} filmes",
  "home.series": "{n} séries",

  // live
  "live.title": "TV ao Vivo",
  "live.allCategories": "Todas as categorias",
  "live.now": "Agora",
  "live.next": "A seguir",
  "live.empty": "Nenhum canal ainda. Adicione uma fonte e sincronize os canais.",
  "live.searchPlaceholder": "Filtrar canais…",

  // movies
  "movies.title": "Filmes",
  "movies.empty": "Nenhum filme ainda. Sincronize o catálogo de filmes de uma fonte.",
  "movies.searchPlaceholder": "Filtrar filmes…",

  // series
  "series.title": "Séries",
  "series.empty": "Nenhuma série ainda. Sincronize o catálogo de séries de uma fonte.",
  "series.searchPlaceholder": "Filtrar séries…",
  "series.season": "Temporada {n}",
  "series.episodes": "{n} episódios",
  "series.watched": "Assistido",

  // search
  "search.placeholder": "Busque canais, filmes, séries, episódios…",
  "search.hint": "Digite pelo menos 2 caracteres para buscar em todo o catálogo.",
  "search.noResults": "Nada encontrado para “{q}”.",
  "search.all": "Tudo",
  "search.live": "Ao vivo",
  "search.channels": "Canais",
  "search.movies": "Filmes",
  "search.series": "Séries",
  "search.episodes": "Episódios",
  "search.categories": "Categorias",
  "search.epg": "Na programação (24h)",

  // favorites
  "favorites.title": "Favoritos",
  "favorites.empty": "Você ainda não favoritou nada. Toque no coração em qualquer card.",

  // history
  "history.title": "Histórico",
  "history.empty": "Seu histórico aparece aqui depois que você assistir algo.",
  "history.clear": "Limpar histórico",
  "history.confirmClear": "Limpar todo o histórico deste perfil?",
  "history.completed": "Concluído",

  // sources
  "sources.title": "Fontes",
  "sources.subtitle":
    "Somente fontes suas e legais: listas M3U/M3U8, URLs autorizadas ou catálogos que você configura manualmente.",
  "sources.add": "Adicionar fonte",
  "sources.edit": "Editar fonte",
  "sources.name": "Nome",
  "sources.kind": "Tipo de fonte",
  "sources.kind.m3u_url": "Lista M3U por URL",
  "sources.kind.m3u_file": "Arquivo M3U local",
  "sources.kind.xc_api": "Catálogo separado (API compatível)",
  "sources.url": "URL da lista",
  "sources.serverUrl": "URL do servidor",
  "sources.file": "Arquivo",
  "sources.chooseFile": "Escolher arquivo…",
  "sources.username": "Usuário",
  "sources.password": "Senha",
  "sources.passwordKeep": "Deixe em branco para manter a senha atual",
  "sources.epgUrl": "URL do EPG (XMLTV, opcional)",
  "sources.whatToSync": "O que sincronizar por padrão",
  "sources.sync.channels": "Canais ao vivo",
  "sources.sync.movies": "Filmes (VOD)",
  "sources.sync.series": "Séries",
  "sources.sync.epg": "Guia de programação (EPG)",
  "sources.sync.logos": "Logos e capas",
  "sources.test": "Testar conexão",
  "sources.testing": "Testando…",
  "sources.syncNow": "Sincronizar agora",
  "sources.syncSelected": "Sincronizar selecionados",
  "sources.syncing": "Sincronizando…",
  "sources.cancelSync": "Cancelar sincronização",
  "sources.deleteConfirm": "Excluir esta fonte e todo o catálogo local dela?",
  "sources.empty": "Nenhuma fonte ainda.",
  "sources.legal":
    "“Sincronizar” baixa apenas listas, catálogos e metadados para o banco local. O app nunca baixa mídia nem burla qualquer proteção.",
  "sources.lastSync": "Última sincronização",
  "sources.counts": "{c} canais · {m} filmes · {s} séries",

  // sync phases
  "sync.download": "Baixando lista…",
  "sync.parse": "Processando lista…",
  "sync.channels": "Canais",
  "sync.movies": "Filmes",
  "sync.series": "Séries",
  "sync.epg": "EPG",
  "sync.logos": "Logos",
  "sync.done": "Sincronização concluída",
  "sync.error": "Erro na sincronização",
  "sync.cancelled": "Sincronização cancelada",

  // settings
  "settings.title": "Ajustes",
  "settings.appearance": "Aparência",
  "settings.theme": "Tema",
  "settings.theme.dark": "Escuro",
  "settings.theme.light": "Claro",
  "settings.language": "Idioma",
  "settings.behavior": "Comportamento",
  "settings.lightweight": "Modo leve",
  "settings.lightweightHint":
    "Ideal para Android e aparelhos modestos: menos EPG, menos logos e carregamento sob demanda.",
  "settings.blockAdultContent": "Bloquear conteúdo adulto",
  "settings.blockAdultContentHint":
    "Oculta canais, filmes, séries, episódios e resultados com metadados adultos.",
  "settings.epgDays": "Dias de EPG para guardar",
  "settings.player": "Player",
  "settings.autoplayNext": "Reproduzir próximo episódio automaticamente",
  "settings.rememberPosition": "Lembrar onde parei",
  "settings.historyEnabled": "Salvar histórico de reprodução",
  "settings.profiles": "Perfis",
  "settings.newProfile": "Nome do novo perfil",
  "settings.updates": "Atualizações",
  "settings.currentVersion": "Versão atual",
  "settings.checkUpdates": "Verificar atualizações",
  "settings.checking": "Verificando…",
  "settings.upToDate": "Você já está na versão mais recente.",
  "settings.updateAvailable": "Nova versão {v} disponível",
  "settings.download": "Baixar atualização",
  "settings.updateError": "Não foi possível verificar agora. Tente novamente mais tarde.",
  "settings.data": "Dados e cache",
  "settings.export": "Exportar configuração",
  "settings.import": "Importar configuração",
  "settings.exportDone": "Exportado com sucesso.",
  "settings.importDone":
    "Importado: {sources} fontes novas, {favorites} favoritos restaurados.",
  "settings.clearLogos": "Limpar cache de logos",
  "settings.clearEpg": "Limpar EPG",
  "settings.clearAll": "Limpar todo o catálogo",
  "settings.clearAllConfirm":
    "Apagar canais, filmes, séries e EPG do banco local? Suas fontes e favoritos são mantidos, mas será preciso sincronizar de novo.",
  "settings.stats.db": "Banco de dados",
  "settings.stats.logos": "Cache de logos",
  "settings.stats.channels": "Canais",
  "settings.stats.movies": "Filmes",
  "settings.stats.series": "Séries",
  "settings.stats.episodes": "Episódios",
  "settings.stats.epg": "Programas de EPG",
  "settings.privacy":
    "Privacidade: o Fable TV não coleta telemetria e não envia seus dados a lugar nenhum. Tudo fica no seu aparelho.",

  // player
  "player.loading": "Abrindo transmissão…",
  "player.error": "Não foi possível reproduzir",
  "player.errorHint":
    "Verifique sua conexão e se a fonte está no ar. Alguns formatos (como MPEG-TS bruto) não são suportados pelo player nativo.",
  "player.live": "AO VIVO",
  "player.nextEpisode": "Próximo episódio",
};

const en: Record<string, string> = {
  "nav.home": "Home",
  "nav.live": "Live TV",
  "nav.movies": "Movies",
  "nav.series": "Series",
  "nav.search": "Search",
  "nav.favorites": "Favorites",
  "nav.history": "History",
  "nav.sources": "Sources",
  "nav.profiles": "Profiles",
  "nav.settings": "Settings",

  // profiles
  "who.title": "Who's watching?",
  "who.manage": "Manage profiles",
  "who.add": "Add profile",
  "who.welcomeTitle": "Welcome to Fable TV",
  "who.welcomeSub": "Create your first profile to start building your personal library.",
  "who.createFirst": "Create my profile",
  "profiles.title": "Profiles",
  "profiles.subtitle":
    "Each profile is an isolated library with its own playlists, favorites and history.",
  "profiles.new": "New profile",
  "profiles.edit": "Edit profile",
  "profiles.name": "Profile name",
  "profiles.color": "Color",
  "profiles.image": "Image",
  "profiles.uploadImage": "Upload image",
  "detail.cast": "Cast",
  "detail.director": "Director",
  "detail.country": "Country",
  "detail.trailer": "Trailer",
  "profiles.switchTo": "Enter this profile",
  "profiles.switch": "Switch profile",
  "profiles.manage": "Manage",
  "profiles.active": "In use",
  "profiles.deleteConfirm":
    "Delete this profile, its playlists and everything synced into it? The profile's favorites and history will be removed too.",
  "profiles.counts": "{c} channels · {m} movies · {s} series",
  "profiles.empty": "No content yet. Add a playlist and sync.",
  "profiles.playlists": "Playlists in this profile",
  "profiles.addPlaylist": "Add playlist",
  "profiles.back": "Profiles",

  "common.loading": "Loading…",
  "common.retry": "Retry",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.add": "Add",
  "common.close": "Close",
  "common.all": "All",
  "common.play": "Play",
  "common.resume": "Resume",
  "common.back": "Back",
  "common.error": "Something went wrong",
  "common.seeAll": "See all",
  "common.moreInfo": "More info",
  "common.items": "{n} items",
  "common.never": "never",
  "common.confirmTitle": "Are you sure?",

  "home.welcome": "Your personal streaming hub",
  "home.welcomeSub":
    "Add your own legal sources (M3U playlists or catalogs you configure) and Fable TV turns them into a beautiful, fast library.",
  "home.addFirstSource": "Add my first source",
  "home.continueWatching": "Continue watching",
  "home.favorites": "Your favorites",
  "home.recentChannels": "Recent channels",
  "home.latestMovies": "Recently added movies",
  "home.latestSeries": "Recently added series",
  "home.top10": "Top 10 today",
  "home.categories": "TV categories",
  "home.sources": "Your sources",
  "home.lastSync": "Last sync: {when}",
  "home.syncNow": "Sync",
  "home.channels": "{n} channels",
  "home.movies": "{n} movies",
  "home.series": "{n} series",

  "live.title": "Live TV",
  "live.allCategories": "All categories",
  "live.now": "Now",
  "live.next": "Next",
  "live.empty": "No channels yet. Add a source and sync channels.",
  "live.searchPlaceholder": "Filter channels…",

  "movies.title": "Movies",
  "movies.empty": "No movies yet. Sync the movie catalog of a source.",
  "movies.searchPlaceholder": "Filter movies…",

  "series.title": "Series",
  "series.empty": "No series yet. Sync the series catalog of a source.",
  "series.searchPlaceholder": "Filter series…",
  "series.season": "Season {n}",
  "series.episodes": "{n} episodes",
  "series.watched": "Watched",

  "search.placeholder": "Search channels, movies, series, episodes…",
  "search.hint": "Type at least 2 characters to search the whole catalog.",
  "search.noResults": "Nothing found for “{q}”.",
  "search.all": "All",
  "search.live": "Live",
  "search.channels": "Channels",
  "search.movies": "Movies",
  "search.series": "Series",
  "search.episodes": "Episodes",
  "search.categories": "Categories",
  "search.epg": "On air (next 24h)",

  "favorites.title": "Favorites",
  "favorites.empty": "Nothing favorited yet. Tap the heart on any card.",

  "history.title": "History",
  "history.empty": "Your history shows up here after you watch something.",
  "history.clear": "Clear history",
  "history.confirmClear": "Clear the whole history for this profile?",
  "history.completed": "Completed",

  "sources.title": "Sources",
  "sources.subtitle":
    "Only your own legal sources: M3U/M3U8 playlists, authorized URLs or catalogs you configure manually.",
  "sources.add": "Add source",
  "sources.edit": "Edit source",
  "sources.name": "Name",
  "sources.kind": "Source type",
  "sources.kind.m3u_url": "M3U playlist by URL",
  "sources.kind.m3u_file": "Local M3U file",
  "sources.kind.xc_api": "Separated catalog (compatible API)",
  "sources.url": "Playlist URL",
  "sources.serverUrl": "Server URL",
  "sources.file": "File",
  "sources.chooseFile": "Choose file…",
  "sources.username": "Username",
  "sources.password": "Password",
  "sources.passwordKeep": "Leave empty to keep the current password",
  "sources.epgUrl": "EPG URL (XMLTV, optional)",
  "sources.whatToSync": "What to sync by default",
  "sources.sync.channels": "Live channels",
  "sources.sync.movies": "Movies (VOD)",
  "sources.sync.series": "Series",
  "sources.sync.epg": "Program guide (EPG)",
  "sources.sync.logos": "Logos & covers",
  "sources.test": "Test connection",
  "sources.testing": "Testing…",
  "sources.syncNow": "Sync now",
  "sources.syncSelected": "Sync selected",
  "sources.syncing": "Syncing…",
  "sources.cancelSync": "Cancel sync",
  "sources.deleteConfirm": "Delete this source and its whole local catalog?",
  "sources.empty": "No sources yet.",
  "sources.legal":
    "“Sync” only caches playlists, catalogs and metadata in the local database. The app never downloads media or bypasses any protection.",
  "sources.lastSync": "Last sync",
  "sources.counts": "{c} channels · {m} movies · {s} series",

  "sync.download": "Downloading playlist…",
  "sync.parse": "Parsing playlist…",
  "sync.channels": "Channels",
  "sync.movies": "Movies",
  "sync.series": "Series",
  "sync.epg": "EPG",
  "sync.logos": "Logos",
  "sync.done": "Sync finished",
  "sync.error": "Sync failed",
  "sync.cancelled": "Sync cancelled",

  "settings.title": "Settings",
  "settings.appearance": "Appearance",
  "settings.theme": "Theme",
  "settings.theme.dark": "Dark",
  "settings.theme.light": "Light",
  "settings.language": "Language",
  "settings.behavior": "Behavior",
  "settings.lightweight": "Lightweight mode",
  "settings.lightweightHint":
    "Great for Android and modest devices: less EPG, fewer logos, on-demand loading.",
  "settings.blockAdultContent": "Block adult content",
  "settings.blockAdultContentHint":
    "Hides channels, movies, series, episodes and results with adult metadata.",
  "settings.epgDays": "EPG days to keep",
  "settings.player": "Player",
  "settings.autoplayNext": "Autoplay next episode",
  "settings.rememberPosition": "Remember where I stopped",
  "settings.historyEnabled": "Save playback history",
  "settings.profiles": "Profiles",
  "settings.newProfile": "New profile name",
  "settings.updates": "Updates",
  "settings.currentVersion": "Current version",
  "settings.checkUpdates": "Check for updates",
  "settings.checking": "Checking…",
  "settings.upToDate": "You're on the latest version.",
  "settings.updateAvailable": "New version {v} available",
  "settings.download": "Download update",
  "settings.updateError": "Couldn't check right now. Try again later.",
  "settings.data": "Data & cache",
  "settings.export": "Export configuration",
  "settings.import": "Import configuration",
  "settings.exportDone": "Exported successfully.",
  "settings.importDone": "Imported: {sources} new sources, {favorites} favorites restored.",
  "settings.clearLogos": "Clear logo cache",
  "settings.clearEpg": "Clear EPG",
  "settings.clearAll": "Clear whole catalog",
  "settings.clearAllConfirm":
    "Delete channels, movies, series and EPG from the local database? Sources and favorites are kept, but you will need to sync again.",
  "settings.stats.db": "Database",
  "settings.stats.logos": "Logo cache",
  "settings.stats.channels": "Channels",
  "settings.stats.movies": "Movies",
  "settings.stats.series": "Series",
  "settings.stats.episodes": "Episodes",
  "settings.stats.epg": "EPG programs",
  "settings.privacy":
    "Privacy: Fable TV collects no telemetry and sends your data nowhere. Everything stays on your device.",

  "player.loading": "Opening stream…",
  "player.error": "Playback failed",
  "player.errorHint":
    "Check your connection and that the source is up. Some formats (like raw MPEG-TS) are not supported by the native player.",
  "player.live": "LIVE",
  "player.nextEpisode": "Next episode",
};

const DICTS: Record<Language, Record<string, string>> = { "pt-BR": ptBR, en };

interface I18nValue {
  lang: Language;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue>({
  lang: "pt-BR",
  t: (k) => k,
});

export function I18nProvider({ lang, children }: { lang: Language; children: ReactNode }) {
  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      let text = DICTS[lang][key] ?? DICTS["pt-BR"][key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replaceAll(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [lang],
  );
  const value = useMemo(() => ({ lang, t }), [lang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

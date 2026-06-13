import { useCallback, useEffect, useState } from "react";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { getSettings } from "./lib/api";
import { I18nProvider, type Language } from "./lib/i18n";
import CatalogPage from "./pages/CatalogPage";
import Favorites from "./pages/Favorites";
import History from "./pages/History";
import Home from "./pages/Home";
import LiveTV from "./pages/LiveTV";
import MovieDetail from "./pages/MovieDetail";
import Player from "./pages/Player";
import Search from "./pages/Search";
import SeriesDetail from "./pages/SeriesDetail";
import Settings from "./pages/Settings";
import Sources from "./pages/Sources";

function Shell({ onSettingsChanged }: { onSettingsChanged: () => void }) {
  const location = useLocation();
  const isPlayer = location.pathname.startsWith("/player/");

  if (isPlayer) {
    return (
      <Routes location={location}>
        <Route path="/player/:itemType/:itemId" element={<Player />} />
      </Routes>
    );
  }

  return (
    <Layout onSettingsChanged={onSettingsChanged}>
      <Routes location={location}>
        <Route path="/" element={<Home />} />
        <Route path="/live" element={<LiveTV />} />
        <Route path="/movies" element={<CatalogPage kind="movie" />} />
        <Route path="/movie/:id" element={<MovieDetail />} />
        <Route path="/series" element={<CatalogPage kind="series" />} />
        <Route path="/series/:id" element={<SeriesDetail />} />
        <Route path="/search" element={<Search />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/history" element={<History />} />
        <Route path="/sources" element={<Sources />} />
        <Route path="/settings" element={<Settings onSettingsChanged={onSettingsChanged} />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  const [lang, setLang] = useState<Language>("pt-BR");
  const [theme, setTheme] = useState("dark");

  const refreshSettings = useCallback(() => {
    getSettings()
      .then((s) => {
        setLang((s.language as Language) === "en" ? "en" : "pt-BR");
        setTheme(s.theme === "light" ? "light" : "dark");
      })
      .catch(() => undefined);
  }, []);

  useEffect(refreshSettings, [refreshSettings]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <I18nProvider lang={lang}>
      <HashRouter>
        <Shell onSettingsChanged={refreshSettings} />
      </HashRouter>
    </I18nProvider>
  );
}

import { useCallback, useEffect, useState } from "react";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { getSettings, listProfiles } from "./lib/api";
import { I18nProvider, type Language } from "./lib/i18n";
import { Spinner } from "./components/ui";
import CatalogPage from "./pages/CatalogPage";
import Favorites from "./pages/Favorites";
import History from "./pages/History";
import Home from "./pages/Home";
import LiveTV from "./pages/LiveTV";
import MovieDetail from "./pages/MovieDetail";
import Player from "./pages/Player";
import Profiles from "./pages/Profiles";
import Search from "./pages/Search";
import SeriesDetail from "./pages/SeriesDetail";
import Settings from "./pages/Settings";
import WhoIsWatching from "./pages/WhoIsWatching";

function Shell({
  onSettingsChanged,
  onSwitchProfile,
}: {
  onSettingsChanged: () => void;
  onSwitchProfile: () => void;
}) {
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
    <Layout onSettingsChanged={onSettingsChanged} onSwitchProfile={onSwitchProfile}>
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
        <Route path="/profiles" element={<Profiles onProfileChanged={onSettingsChanged} />} />
        <Route path="/settings" element={<Settings onSettingsChanged={onSettingsChanged} />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </Layout>
  );
}

type Phase = "loading" | "gate" | "app";

export default function App() {
  const [lang, setLang] = useState<Language>("pt-BR");
  const [theme, setTheme] = useState("dark");
  const [phase, setPhase] = useState<Phase>("loading");

  const refreshSettings = useCallback(() => {
    getSettings()
      .then((s) => {
        setLang((s.language as Language) === "en" ? "en" : "pt-BR");
        setTheme(s.theme === "light" ? "light" : "dark");
      })
      .catch(() => undefined);
  }, []);

  useEffect(refreshSettings, [refreshSettings]);

  // On launch, show the profile gate only when there's a real choice to make.
  useEffect(() => {
    listProfiles()
      .then((ps) => setPhase(ps.length > 1 ? "gate" : "app"))
      .catch(() => setPhase("app"));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <I18nProvider lang={lang}>
      <HashRouter>
        {phase === "loading" ? (
          <div className="grid h-screen place-items-center">
            <Spinner />
          </div>
        ) : phase === "gate" ? (
          <WhoIsWatching onEnter={() => setPhase("app")} />
        ) : (
          <Shell onSettingsChanged={refreshSettings} onSwitchProfile={() => setPhase("gate")} />
        )}
      </HashRouter>
    </I18nProvider>
  );
}

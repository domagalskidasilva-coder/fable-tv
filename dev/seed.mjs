// Dev-only: seed the local Fable TV SQLite DB with sample catalog content so
// the UI can be previewed with real rows. Uses Node's built-in sqlite.
// Run: node dev/seed.mjs
import { DatabaseSync } from "node:sqlite";
import { homedir } from "node:os";
import { join } from "node:path";

const dbPath =
  process.env.FABLE_DB ||
  join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "com.fabletv.app", "fabletv.db");

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");

const norm = (s) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
const now = Math.floor(Date.now() / 1000);
const poster = (seed) => `https://picsum.photos/seed/${seed}/400/600`;
const logo = (seed) => `https://picsum.photos/seed/${seed}/320/200`;
const HLS = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
const MP4 = (f) => `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/${f}`;

// Give the default profile a name + color, and add a second, empty profile
// so the "Who's watching?" gate appears and isolation is visible.
try {
  db.exec("UPDATE profiles SET name = 'Sala', color = '#e8b65a' WHERE id = 1");
  db.prepare(
    "INSERT OR IGNORE INTO profiles (name, color, created_at) VALUES (?, ?, ?)",
  ).run("Crianças", "#5a8fe0", now);
} catch {
  // older schema without color — ignore
}

// Fresh start for the demo source (bound to profile 1).
db.exec("DELETE FROM sources WHERE name = 'Demo (amostra)'");
const src = db
  .prepare(
    `INSERT INTO sources (name, kind, url, sync_channels, sync_movies, sync_series, sync_epg, sync_logos, created_at, last_sync_at, last_sync_status)
     VALUES (?, 'm3u_file', ?, 1, 1, 1, 0, 0, ?, ?, 'ok: amostra')`,
  )
  .run("Demo (amostra)", "D:/fable-tv/dev/sample.m3u", now, now);
const sourceId = Number(src.lastInsertRowid);

const insCat = db.prepare(
  `INSERT OR IGNORE INTO categories (source_id, kind, name, search_text) VALUES (?, ?, ?, ?)`,
);
const catId = (kind, name) => {
  insCat.run(sourceId, kind, name, norm(name));
  return db
    .prepare(`SELECT id FROM categories WHERE source_id=? AND kind=? AND name=?`)
    .get(sourceId, kind, name).id;
};

// Channels
const channels = [
  ["Aurora TV HD", "Canais | Abertos", "chan1"],
  ["Nimbus News 24h", "Canais | Notícias", "chan2"],
  ["Vertex Sports HD", "Canais | Esportes", "chan3"],
  ["Vertex Sports 2", "Canais | Esportes", "chan4"],
  ["Cine Lumen", "Canais | Filmes", "chan5"],
  ["Praça Pública TV", "Canais | Abertos", "chan6"],
  ["Boletim Global", "Canais | Notícias", "chan7"],
  ["Pequenos Mundos", "Canais | Infantil", "chan8"],
];
const insCh = db.prepare(
  `INSERT INTO channels (source_id, category_id, name, search_text, logo_url, stream_url, tvg_id, group_title, position, sync_token, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
channels.forEach(([name, group, seed], i) => {
  insCh.run(sourceId, catId("live", group), name, norm(name), logo(seed), `${HLS}#${i}`, `demo.${i}`, group, i, now, now);
});

// Movies
const movies = [
  ["O Grande Coelho", 2008, "Animação", "mv01", "BigBuckBunny.mp4", "Um coelho gigante e gentil enfrenta três roedores travessos numa floresta ensolarada."],
  ["O Sonho do Elefante", 2006, "Animação", "mv02", "ElephantsDream.mp4", "Dois personagens exploram uma máquina surreal e infinita."],
  ["Chamas Maiores", 2013, "Ação", "mv03", "ForBiggerBlazes.mp4", "Curta de demonstração cheio de explosões."],
  ["Fugas Maiores", 2013, "Ação", "mv04", "ForBiggerEscapes.mp4", "Perseguições alucinantes neste curta de ação."],
  ["Diversão Maior", 2013, "Comédia", "mv05", "ForBiggerFun.mp4", "Risadas garantidas neste curta divertido."],
  ["Aventuras Maiores", 2013, "Ação", "mv06", "ForBiggerJoyrides.mp4", "Aventuras de tirar o fôlego."],
  ["Colapsos", 2013, "Drama", "mv07", "ForBiggerMeltdowns.mp4", "Drama intenso em formato curto."],
  ["Sintel: A Caçadora", 2010, "Fantasia", "mv08", "Sintel.mp4", "Uma jovem cruza um mundo hostil em busca de seu dragão."],
  ["Lágrimas de Aço", 2012, "Ficção", "mv09", "TearsOfSteel.mp4", "Cientistas tentam salvar o mundo de robôs numa Amsterdã futurista."],
  ["Sobre Rodas", 2014, "Documentário", "mv10", "VolkswagenGTIReview.mp4", "Uma análise apaixonada sobre automóveis."],
  ["Bullrun: A Corrida", 2014, "Aventura", "mv11", "WeAreGoingOnBullrun.mp4", "A energia de uma corrida pelas estradas."],
  ["Por Uma Nota Só", 2014, "Comédia", "mv12", "WhatCarCanYouGetForAGrand.mp4", "O que dá pra comprar com pouco dinheiro?"],
];
const insMv = db.prepare(
  `INSERT INTO movies (source_id, category_id, name, search_text, logo_url, stream_url, year, duration_secs, rating, plot, genre, sync_token, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const movieIds = movies.map(([name, year, genre, seed, file, plot], i) => {
  const r = insMv.run(
    sourceId,
    catId("movie", `Filmes | ${genre}`),
    name,
    norm(name),
    poster(seed),
    MP4(file),
    year,
    600 + i * 120,
    (7 + (i % 3)).toString() + ".5",
    plot,
    genre,
    now,
    now - i * 3600,
  );
  return Number(r.lastInsertRowid);
});

// Series + episodes
const series = [
  ["Horizonte Perdido", 2021, "Drama", "sr01", "Náufragos de um voo descobrem uma ilha que desafia o tempo.", [
    [1, 1, "ForBiggerBlazes.mp4"],
    [1, 2, "ForBiggerEscapes.mp4"],
    [1, 3, "ForBiggerFun.mp4"],
    [2, 1, "ForBiggerJoyrides.mp4"],
  ]],
  ["Vizinhos do Barulho", 2019, "Comédia", "sr02", "A rotina caótica e hilária de um prédio cheio de personagens.", [
    [1, 1, "ForBiggerMeltdowns.mp4"],
    [1, 2, "ForBiggerFun.mp4"],
    [1, 3, "ForBiggerEscapes.mp4"],
  ]],
  ["Estação Órbita", 2023, "Ficção", "sr03", "A tripulação de uma estação espacial enfrenta o desconhecido.", [
    [1, 1, "Sintel.mp4"],
    [1, 2, "TearsOfSteel.mp4"],
    [1, 3, "BigBuckBunny.mp4"],
  ]],
];
const insSe = db.prepare(
  `INSERT INTO series (source_id, category_id, external_id, name, search_text, cover_url, plot, year, rating, genre, episodes_synced, sync_token, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
);
const insEp = db.prepare(
  `INSERT INTO episodes (series_id, source_id, season, episode_num, name, search_text, stream_url, duration_secs, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const episodeIds = [];
series.forEach(([name, year, genre, seed, plot, eps], i) => {
  const r = insSe.run(
    sourceId,
    catId("series", `Séries | ${genre}`),
    `m3u:${norm(name)}`,
    name,
    norm(name),
    poster(seed),
    plot,
    year,
    "8." + i,
    genre,
    now,
    now - i * 7200,
  );
  const seriesId = Number(r.lastInsertRowid);
  eps.forEach(([season, num, file]) => {
    const epName = `${name} S${String(season).padStart(2, "0")}E${String(num).padStart(2, "0")}`;
    const er = insEp.run(seriesId, sourceId, season, num, epName, norm(epName), MP4(file), 600, now);
    episodeIds.push(Number(er.lastInsertRowid));
  });
});

// Continue-watching + favorites for profile 1 so the home rows fill.
const insHist = db.prepare(
  `INSERT OR REPLACE INTO history (profile_id, item_type, item_id, position_secs, duration_secs, completed, updated_at)
   VALUES (1, ?, ?, ?, ?, ?, ?)`,
);
insHist.run("movie", movieIds[0], 220, 600, 0, now - 100);
insHist.run("movie", movieIds[2], 90, 720, 0, now - 500);
insHist.run("episode", episodeIds[0], 300, 600, 0, now - 800);
insHist.run("channel", db.prepare("SELECT id FROM channels WHERE source_id=? LIMIT 1").get(sourceId).id, 0, 0, 0, now - 1200);

const insFav = db.prepare(
  `INSERT OR IGNORE INTO favorites (profile_id, item_type, item_id, created_at) VALUES (1, ?, ?, ?)`,
);
insFav.run("movie", movieIds[7], now);
insFav.run("movie", movieIds[8], now);
insFav.run("series", db.prepare("SELECT id FROM series WHERE source_id=? LIMIT 1").get(sourceId).id, now);

const counts = {
  channels: db.prepare("SELECT COUNT(*) c FROM channels").get().c,
  movies: db.prepare("SELECT COUNT(*) c FROM movies").get().c,
  series: db.prepare("SELECT COUNT(*) c FROM series").get().c,
  episodes: db.prepare("SELECT COUNT(*) c FROM episodes").get().c,
};
db.close();
console.log("Seeded:", JSON.stringify(counts));

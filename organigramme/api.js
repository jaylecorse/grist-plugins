'use strict';

/* ==========================================================================
   Widget Grist « Organigramme »  (d3-org-chart 3.0.1)
   Une ligne de la table = un poste, occupé par un agent (nom vide = poste vacant).
   Seul parentId et nom sont obligatoires ; toute colonne non associée (ou masquée
   par les règles d'accès Grist) est simplement absente de la fiche et des exports.
   ========================================================================== */

const DEFAULTS = Object.freeze({ titre: 'Organigramme', couleur: 'lightblue', mode: 'strate' });
const NODE = Object.freeze({ width: 270, height: 118 });
const NIVEAUX_INITIAUX = '2';
const PALETTE = ['#cfe3ff', '#d4f0cf', '#ffe2b5', '#f1d2ee', '#ffd0d0', '#cdeeea', '#e5dfff', '#f3efbd'];
const FLAGS = ['_expanded', '_highlighted', '_upToTheRootHighlighted'];

const COLUMNS = [
  { name: 'parentId', title: "Identifiant du N+1", optional: false, allowMultiple: false },
  { name: 'nom', title: "Nom de l'agent (vide = poste vacant)", optional: false, type: 'Text', allowMultiple: false },
  { name: 'prenom', title: "Prénom (ajouté au nom s'il n'y figure pas déjà)", optional: true, type: 'Text' },
  { name: 'fonction', title: "Libellé du poste", optional: true },
  { name: 'direction', title: "Libellé de la structure", optional: true },
  { name: 'photo', title: "URL de la photo", optional: true, type: 'Text', allowMultiple: false },
  { name: 'collectivite', title: "Collectivité (couleur Ville / Métropole)", optional: true },
  { name: 'typePoste', title: "Type de poste (permanent / non permanent)", optional: true },
  { name: 'statut', title: "Statut (organisation validée / travail préparatoire)", optional: true },
  { name: 'sorh', title: "SORH gestionnaire", optional: true },
  { name: 'metier', title: "Libellé métier", optional: true },
  { name: 'site', title: "Site de travail", optional: true },
  { name: 'mail', title: "Mail professionnel", optional: true },
  { name: 'telephone', title: "Téléphone", optional: true },
  { name: 'teams', title: "Lien Teams", optional: true },
  { name: 'matricule', title: "RH : matricule", optional: true },
  { name: 'grade', title: "RH : grade", optional: true },
  { name: 'cadreEmploi', title: "RH : cadre d'emploi", optional: true },
  { name: 'categorie', title: "RH : catégorie", optional: true },
  { name: 'filiere', title: "RH : filière", optional: true },
];
const ATTRIBUTS = COLUMNS.map((c) => c.name).filter((n) => !['parentId', 'nom', 'photo'].includes(n));

const FICHE_STRUCT = [['collectivite', 'Collectivité'], ['typePoste', 'Type de poste'], ['sorh', 'SORH gestionnaire'], ['statut', 'Statut']];
const FICHE_INDIV = [['metier', 'Métier'], ['site', 'Site de travail'], ['mail', 'Mail professionnel'], ['telephone', 'Téléphone'], ['teams', 'Teams']];
const FICHE_RH = [['matricule', 'Matricule'], ['grade', 'Grade'], ['cadreEmploi', "Cadre d'emploi"], ['categorie', 'Catégorie'], ['filiere', 'Filière']];
const EXPORT_COLS = [['collectivite', 'Collectivité'], ['typePoste', 'Type de poste'], ['statut', 'Statut'], ['sorh', 'SORH'],
  ['metier', 'Métier'], ['site', 'Site'], ['mail', 'Mail'], ['telephone', 'Téléphone'], ['teams', 'Teams'],
  ['matricule', 'Matricule'], ['grade', 'Grade'], ['cadreEmploi', "Cadre d'emploi"], ['categorie', 'Catégorie'], ['filiere', 'Filière']];

const MODES = { strate: 'Niveau hiérarchique', collectivite: 'Collectivité', typePoste: 'Type de poste', uniforme: 'Une seule couleur' };
const MAX_LISTE = 25;

const state = {
  chart: null,
  mappings: null,
  rows: [], byId: new Map(), enfants: new Map(), racine: null,
  focusId: null,          // branche isolée (null = organigramme complet)
  exportId: null,
  niveaux: NIVEAUX_INITIAUX,
  categories: new Map(),  // valeur -> couleur (modes collectivité / type de poste)
  options: {}, titre: DEFAULTS.titre, couleur: DEFAULTS.couleur, mode: DEFAULTS.mode, lexique: '',
};

const $ = (id) => document.getElementById(id);

/* --------------------------------------------------------------------------
   Utilitaires
   -------------------------------------------------------------------------- */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHTML = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/** URL http(s) uniquement (photos, logos, liens), sinon chaîne vide. */
function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch { return ''; }
}

function initiales(nom) {
  return String(nom ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((m) => Array.from(m)[0].toUpperCase()).join('');
}

const normaliser = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function debounce(fn, delay) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

const showMessage = (t) => { $('msg').textContent = t || ''; };
const annoncer = (t) => { $('statut').textContent = t || ''; };
const libelle = (r) => (r.vacant ? 'Poste vacant' : r.nom);

function ouvrir(dlg) { if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', ''); }
function fermer(dlg) { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }

/* --------------------------------------------------------------------------
   Données
   -------------------------------------------------------------------------- */

function toRows(records, mappings) {
  const val = (rec, name) => {
    const col = mappings[name];
    const v = col ? rec[col] : '';
    return v === null || v === undefined ? '' : String(v).trim();
  };
  return records.map((rec) => {
    const parent = Number(rec[mappings.parentId]);
    let nom = val(rec, 'nom');
    const prenom = val(rec, 'prenom');
    if (prenom && !normaliser(nom).includes(normaliser(prenom))) nom = `${nom} ${prenom}`.trim();
    const a = {};
    ATTRIBUTS.forEach((n) => { a[n] = val(rec, n); });
    return {
      id: rec.id,
      parentId: Number.isFinite(parent) && parent > 0 ? parent : null,
      nom, vacant: !nom, a,
      photo: safeUrl(val(rec, 'photo')),
      _recherche: normaliser([nom, ...Object.values(a)].join(' ')),
    };
  });
}

/** Message d'erreur si la hiérarchie est inexploitable, sinon ''. */
function validerHierarchie(rows) {
  if (!rows.length) return 'Aucun agent à afficher.';
  const ids = new Set(rows.map((r) => r.id));
  const racines = rows.filter((r) => r.parentId === null);
  const noms = (liste) => liste.slice(0, 5).map((r) => r.nom || `#${r.id}`).join(', ') + (liste.length > 5 ? ', …' : '');

  if (racines.length === 0) return "Il faut un agent sans N+1 (parentId vide).\nL'organigramme ne peut pas fonctionner.";
  if (racines.length > 1) return `Il ne faut qu'un seul agent sans N+1 (parentId vide) : ${racines.length} trouvés (${noms(racines)}).\nL'organigramme ne peut pas fonctionner.`;

  const orphelins = rows.filter((r) => r.parentId !== null && !ids.has(r.parentId));
  if (orphelins.length) return `${orphelins.length} agent(s) ont un N+1 introuvable (${noms(orphelins)}).\nVérifiez parentId et les filtres posés sur le widget.`;

  const enfants = new Map();
  rows.forEach((r) => { if (r.parentId !== null) (enfants.get(r.parentId) || enfants.set(r.parentId, []).get(r.parentId)).push(r.id); });
  const vus = new Set([racines[0].id]);
  const pile = [racines[0].id];
  while (pile.length) {
    for (const e of enfants.get(pile.pop()) || []) if (!vus.has(e)) { vus.add(e); pile.push(e); }
  }
  if (vus.size !== rows.length) return `${rows.length - vus.size} agent(s) ne sont pas rattachés au N°1 (boucle dans les N+1).\nL'organigramme ne peut pas fonctionner.`;
  return '';
}

/** Index de l'arbre : enfants, profondeur, effectifs (postes / agents) par structure. */
function preparer(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const enfants = new Map(rows.map((r) => [r.id, []]));
  rows.forEach((r) => { if (r.parentId !== null) enfants.get(r.parentId).push(r); });
  const racine = rows.find((r) => r.parentId === null);
  racine._depth = 0;
  const ordre = [racine];
  for (let i = 0; i < ordre.length; i++) {
    for (const e of enfants.get(ordre[i].id)) { e._depth = ordre[i]._depth + 1; ordre.push(e); }
  }
  for (let i = ordre.length - 1; i >= 0; i--) {
    const r = ordre[i];
    r._nbPostes = 1;
    r._nbAgents = r.vacant ? 0 : 1;
    for (const e of enfants.get(r.id)) { r._nbPostes += e._nbPostes; r._nbAgents += e._nbAgents; }
  }
  return { byId, enfants, racine };
}

function sousArbre(id) {
  const out = [];
  const pile = [state.byId.get(id)];
  while (pile.length) { const r = pile.pop(); out.push(r); pile.push(...state.enfants.get(r.id)); }
  return out;
}

const racineVue = () => state.byId.get(state.focusId) || state.racine;
const vueRows = () => (state.focusId === null ? state.rows : sousArbre(state.focusId));

/** Ancêtres d'un agent, jusqu'à la racine de la vue courante. */
function* ancetres(r) {
  if (r.id === racineVue().id) return;
  for (let p = state.byId.get(r.parentId); p; p = state.byId.get(p.parentId)) {
    yield p;
    if (p.id === racineVue().id) return;
  }
}

/* --------------------------------------------------------------------------
   Couleurs et légende
   -------------------------------------------------------------------------- */

function modeEffectif() {
  const m = state.mode;
  if ((m === 'collectivite' || m === 'typePoste') && !(state.mappings && state.mappings[m])) return 'strate';
  return m;
}

function construireCategories() {
  state.categories = new Map();
  const m = modeEffectif();
  if (m !== 'collectivite' && m !== 'typePoste') return;
  [...new Set(state.rows.map((r) => r.a[m]).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'fr'))
    .forEach((v, i) => state.categories.set(v, PALETTE[i % PALETTE.length]));
}

function couleur(r) {
  const m = modeEffectif();
  if (m === 'strate') return PALETTE[r._depth % PALETTE.length];
  if (m === 'uniforme') return state.couleur;
  return state.categories.get(r.a[m]) || state.couleur;
}

function dessinerLegende() {
  const m = modeEffectif();
  let items = [];
  if (m === 'strate') {
    const max = Math.min(Math.max(...state.rows.map((r) => r._depth)) + 1, PALETTE.length);
    items = Array.from({ length: max }, (_, i) => [`Niveau ${i + 1}`, PALETTE[i]]);
  } else if (m !== 'uniforme') {
    items = [...state.categories.entries()];
  }
  $('legende').innerHTML = items.map(([t, c]) => `<li><i style="background:${escapeHTML(c)}"></i>${escapeHTML(t)}</li>`).join('');
}

/* --------------------------------------------------------------------------
   Rendu de l'organigramme
   -------------------------------------------------------------------------- */

function renderNode(d) {
  const r = d.data;
  const statut = r.a.statut;
  const draft = /draft|brouillon|travail/.test(normaliser(statut));
  const aria = [libelle(r), r.a.fonction, r.a.direction].filter(Boolean).join(', ');
  const img = r.photo ? `<img src="${escapeHTML(r.photo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '';
  const compte = r._nbPostes > 1
    ? `<div class="org-count" title="${r._nbAgents} agent(s) pour ${r._nbPostes} poste(s) dans la structure">${r._nbAgents} agent(s) · ${r._nbPostes} poste(s)</div>` : '';
  return `
    <div class="org-node">
      <div class="org-card${r.vacant ? ' vacant' : ''}${draft ? ' draft' : ''}${r._highlighted ? ' trouve' : ''}"
           style="--bg:${escapeHTML(couleur(r))}" role="button" tabindex="0" data-id="${r.id}"
           aria-label="${escapeHTML(aria)}. Ouvrir la fiche">
        <span class="org-id" aria-hidden="true">#${r.id}</span>
        <div class="org-photo"><span class="org-initials">${r.vacant ? '' : escapeHTML(initiales(r.nom))}</span>${img}</div>
        <div class="org-infos">
          <div class="org-nom" title="${escapeHTML(libelle(r))}">${escapeHTML(libelle(r))}</div>
          <div class="org-poste">${escapeHTML(r.a.fonction)}</div>
          <div class="org-struct">${escapeHTML(r.a.direction)}</div>
          ${compte}
        </div>
        ${statut ? `<span class="org-tag">${escapeHTML(statut)}</span>` : ''}
      </div>
    </div>`;
}

function creerOrganigramme() {
  const conteneur = document.querySelector('.chart-container');
  const chart = new d3.OrgChart()
    .container('.chart-container')
    .svgWidth(conteneur.clientWidth)
    .svgHeight(conteneur.clientHeight)
    .nodeHeight(() => NODE.height)
    .nodeWidth(() => NODE.width)
    .childrenMargin(() => 50)
    .compactMarginBetween(() => 35)
    .compactMarginPair(() => 30)
    .neighbourMargin(() => 20)
    .parentNodeId((d) => (d.id === state.focusId ? null : d.parentId))
    .linkUpdate(function (d) {
      const surligne = Boolean(d.data._upToTheRootHighlighted);
      const lien = d3.select(this).attr('stroke', surligne ? '#c2185b' : '#9a98a3').attr('stroke-width', surligne ? 5 : 1.5);
      if (surligne) lien.raise();
    })
    .nodeContent(renderNode);

  const ouvrirCarte = (e) => {
    const carte = e.target.closest('.org-card');
    if (carte) ouvrirFiche(Number(carte.dataset.id));
  };
  conteneur.addEventListener('click', ouvrirCarte);
  conteneur.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.org-card')) { e.preventDefault(); ouvrirCarte(e); }
  });
  // Photo introuvable : on la retire, les initiales restent visibles.
  conteneur.addEventListener('error', (e) => { if (e.target instanceof HTMLImageElement) e.target.remove(); }, true);
  return chart;
}

function dessiner(ajuster = false) {
  if (!state.chart) return;
  state.chart.data(vueRows()).render();
  if (ajuster) state.chart.fit();
}

function afficher(rows) {
  const premier = !state.chart;
  const anciens = state.byId;
  const index = preparer(rows);
  Object.assign(state, index, { rows });
  rows.forEach((r) => {
    const a = anciens.get(r.id);
    if (a) FLAGS.forEach((k) => { if (a[k] !== undefined) r[k] = a[k]; });
  });
  if (state.focusId !== null && !state.byId.has(state.focusId)) state.focusId = null;
  if (premier) { state.chart = creerOrganigramme(); appliquerNiveaux(state.niveaux); }
  construireCategories();
  majInterface();
  dessiner(premier);
}

/* --------------------------------------------------------------------------
   Navigation : niveaux, branche, chemin, fiche
   -------------------------------------------------------------------------- */

function appliquerNiveaux(n) {
  state.niveaux = String(n);
  const base = racineVue()._depth;
  vueRows().forEach((r) => {
    // Dans d3-org-chart, _expanded = true rend le nœud visible (ses ancêtres se déplient).
    r._expanded = state.niveaux === 'tous' ? true : r._depth - base <= Number(state.niveaux);
    r._highlighted = false;
    r._upToTheRootHighlighted = false;
  });
}

function changerNiveaux(n) { appliquerNiveaux(n); dessiner(true); annoncer(''); }

function focaliser(id) {
  state.focusId = !id || id === state.racine.id ? null : id;
  appliquerNiveaux(state.niveaux);
  majInterface();
  dessiner(true);
}

/** Rend un agent visible (change de branche si besoin, déplie ses ancêtres). */
function rendreVisible(id) {
  const r = state.byId.get(id);
  if (!r) return null;
  const dansVue = state.focusId === null || id === state.focusId || [...ancetres(r)].some((p) => p.id === state.focusId);
  if (!dansVue) { state.focusId = null; majInterface(); }
  r._expanded = true;
  return r;
}

function aller(id) {
  const r = rendreVisible(id);
  if (!r) return;
  state.chart.clearHighlighting();
  r._highlighted = true;
  dessiner();
  if (typeof state.chart.setCentered === 'function') state.chart.setCentered(id).render(); else state.chart.fit();
  annoncer(`${libelle(r)} affiché dans l'organigramme.`);
}

function chemin(id) {
  const r = rendreVisible(id);
  if (!r) return;
  state.chart.clearHighlighting();
  state.chart.data(vueRows());
  state.chart.setUpToTheRootHighlighted(id).render().fit();
}

/* --------------------------------------------------------------------------
   Fiche agent
   -------------------------------------------------------------------------- */

function formaterValeur(cle, v) {
  const e = escapeHTML(v);
  if (cle === 'mail' && /^[^\s@<>"']+@[^\s@<>"']+$/.test(v)) return `<a href="mailto:${e}">${e}</a>`;
  if (cle === 'telephone' && /^[+\d][\d\s().-]{3,}$/.test(v)) return `<a href="tel:${escapeHTML(v.replace(/[^\d+]/g, ''))}">${e}</a>`;
  if (cle === 'teams') { const u = safeUrl(v); if (u) return `<a href="${escapeHTML(u)}" target="_blank" rel="noopener noreferrer">Ouvrir dans Teams</a>`; }
  return e;
}

const lignesDl = (paires, r) => paires.filter(([k]) => r.a[k]).map(([k, l]) => `<dt>${l}</dt><dd>${formaterValeur(k, r.a[k])}</dd>`).join('');

function lienAgent(e) {
  return `<button type="button" class="lien" data-action="aller" data-id="${e.id}">${escapeHTML(libelle(e) + (e.a.fonction ? ` — ${e.a.fonction}` : ''))}</button>`;
}

function listeAgents(rows) {
  if (!rows.length) return '<p class="vide">Aucun</p>';
  const reste = rows.length - MAX_LISTE;
  return `<ul>${rows.slice(0, MAX_LISTE).map((e) => `<li>${lienAgent(e)}</li>`).join('')}${reste > 0 ? `<li>… et ${reste} autre(s)</li>` : ''}</ul>`;
}

function ouvrirFiche(id) {
  const r = state.byId.get(id);
  if (!r) return;
  const parent = state.byId.get(r.parentId);
  const collegues = parent ? state.enfants.get(parent.id).filter((e) => e.id !== id) : [];
  const subs = state.enfants.get(id);
  const struct = lignesDl(FICHE_STRUCT, r);
  const indiv = lignesDl(FICHE_INDIV, r);
  const rh = lignesDl(FICHE_RH, r);
  const img = r.photo ? `<img src="${escapeHTML(r.photo)}" alt="" referrerpolicy="no-referrer">` : '';

  $('fiche').innerHTML = `
    <div class="fiche-tete">
      <div class="org-photo"><span class="org-initials">${r.vacant ? '' : escapeHTML(initiales(r.nom))}</span>${img}</div>
      <div>
        <h2 id="fiche-titre">${escapeHTML(libelle(r))}</h2>
        <div>${escapeHTML(r.a.fonction)}</div>
        <div class="vide">${escapeHTML(r.a.direction)}</div>
      </div>
    </div>
    ${struct || indiv ? `<h3>Informations</h3><dl>${struct}${indiv}</dl>` : ''}
    ${rh ? `<h3>Informations RH</h3><dl>${rh}</dl>` : ''}
    <h3>Effectifs de la structure</h3>
    <p class="vide">${r._nbAgents} agent(s), ${r._nbPostes} poste(s), ${subs.length} rattaché(s) direct(s)</p>
    <h3>Positionnement</h3>
    <dl><dt>N+1</dt><dd>${parent ? lienAgent(parent) : '<span class="vide">Aucun (N°1)</span>'}</dd></dl>
    <h3>Collègues (même N+1)</h3>${listeAgents(collegues)}
    <h3>Subordonnés directs</h3>${listeAgents(subs)}
    <div class="actions">
      <button type="button" data-action="chemin" data-id="${id}">Chemin jusqu'au N°1</button>
      ${subs.length ? `<button type="button" data-action="branche" data-id="${id}">Afficher cette branche seule</button>` : ''}
      <button type="button" data-action="export" data-id="${id}">Exporter cette structure…</button>
      <button type="button" data-action="fermer">Fermer</button>
    </div>`;
  ouvrir($('dlg-fiche'));
}

const ACTIONS = {
  fermer: (id, btn) => fermer(btn.closest('dialog')),
  aller: (id) => { fermer($('dlg-fiche')); aller(id); },
  chemin: (id) => { fermer($('dlg-fiche')); chemin(id); },
  branche: (id) => { fermer($('dlg-fiche')); focaliser(id); },
  export: (id) => { fermer($('dlg-fiche')); ouvrirExport(id); },
};

/* --------------------------------------------------------------------------
   Recherche (tous les attributs associés)
   -------------------------------------------------------------------------- */

function filtrer(texte) {
  if (!state.chart) return;
  const mots = normaliser(texte).split(/\s+/).filter(Boolean);
  if (!mots.length) { changerNiveaux(state.niveaux); return; }

  const rows = vueRows();
  state.chart.clearHighlighting();
  rows.forEach((r) => { r._expanded = false; r._highlighted = false; });
  const trouves = rows.filter((r) => mots.every((m) => r._recherche.includes(m)));
  racineVue()._expanded = true;
  trouves.forEach((r) => { r._highlighted = true; r._expanded = true; });
  dessiner(true);
  annoncer(trouves.length ? `${trouves.length} résultat(s)${state.focusId !== null ? ' dans la branche affichée' : ''}.` : 'Aucun résultat.');
}

/* --------------------------------------------------------------------------
   Exports
   -------------------------------------------------------------------------- */

function ouvrirExport(id) {
  const r = state.byId.get(id) || racineVue();
  state.exportId = r.id;
  $('export-structure').textContent = [libelle(r), r.a.direction].filter(Boolean).join(' — ');
  ouvrir($('dlg-export'));
}

/** Agents de la structure exportée, en ordre hiérarchique, limités à n sous-niveaux. */
function lignesExport(id, n) {
  const racine = state.byId.get(id);
  const max = n === 'tous' ? Infinity : Number(n);
  const out = [];
  const pile = [racine];
  while (pile.length) {
    const r = pile.pop();
    if (r._depth - racine._depth > max) continue;
    out.push(r);
    pile.push(...[...state.enfants.get(r.id)].reverse());
  }
  return out;
}

function celluleCSV(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;   // neutralise l'injection de formules Excel
  return `"${s.replace(/"/g, '""')}"`;
}

function exporterCSV() {
  const racine = state.byId.get(state.exportId);
  const rows = lignesExport(racine.id, $('export-niveaux').value);
  const cols = EXPORT_COLS.filter(([k]) => state.mappings && state.mappings[k]);
  const entete = ['Niveau', 'Nom', 'Poste', 'Structure', 'N+1', ...cols.map(([, l]) => l), "Nb agents (structure)", "Nb postes (structure)"];
  const lignes = rows.map((r) => [
    r._depth - racine._depth + 1, libelle(r), r.a.fonction, r.a.direction,
    r.id === racine.id ? '' : libelle(state.byId.get(r.parentId)),
    ...cols.map(([k]) => r.a[k]), r._nbAgents, r._nbPostes,
  ]);
  const csv = '\ufeff' + [entete, ...lignes].map((l) => l.map(celluleCSV).join(';')).join('\r\n');
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  lien.download = `organigramme_${normaliser(libelle(racine)).replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'export'}.csv`;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
  fermer($('dlg-export'));
  annoncer(`${rows.length} ligne(s) exportée(s).`);
}

function exporterPDF() {
  const id = state.exportId;
  const n = $('export-niveaux').value;
  fermer($('dlg-export'));
  state.focusId = id === state.racine.id ? null : id;
  appliquerNiveaux(n);
  majInterface();
  dessiner(true);
  setTimeout(() => window.print(), 500);   // laisse le temps à l'ajustement avant l'impression
}

/* --------------------------------------------------------------------------
   Options et interface
   -------------------------------------------------------------------------- */

function majInterface() {
  const sel = $('sel-mode');
  if (!sel.options.length) {
    Object.entries(MODES).forEach(([k, l]) => sel.add(new Option(l, k)));
  }
  [...sel.options].forEach((o) => {
    o.disabled = (o.value === 'collectivite' || o.value === 'typePoste') && !(state.mappings && state.mappings[o.value]);
  });
  sel.value = modeEffectif();
  $('sel-niveaux').value = state.niveaux;
  $('btn-complet').hidden = state.focusId === null;
  if (state.focusId !== null) $('btn-complet').textContent = `Retour à l'organigramme complet (branche : ${libelle(state.byId.get(state.focusId))})`;
  if (state.rows.length) dessinerLegende();
}

function appliquerOptions(options) {
  const opts = options || {};
  state.options = opts;
  state.titre = opts.titre || DEFAULTS.titre;
  state.couleur = opts.couleurVignette && CSS.supports('color', opts.couleurVignette) ? opts.couleurVignette : DEFAULTS.couleur;
  state.mode = MODES[opts.modeCouleur] ? opts.modeCouleur : DEFAULTS.mode;
  state.lexique = typeof opts.lexique === 'string' ? opts.lexique : '';

  $('titre').textContent = state.titre;
  document.title = state.titre;
  document.documentElement.style.setProperty('--vignette', state.couleur);
  [['logo1', opts.logo1], ['logo2', opts.logo2]].forEach(([id, url]) => {
    const img = $(id);
    const u = safeUrl(url);
    img.hidden = !u;
    if (u) img.src = u; else img.removeAttribute('src');
  });
  $('btn-lexique').hidden = !state.lexique.trim();

  if (state.chart) { construireCategories(); majInterface(); dessiner(); }
}

const sauverOptions = (partiel) => grist.setOptions({ ...state.options, ...partiel });

function ouvrirConfig() {
  $('input-titre').value = state.titre;
  $('input-couleur').value = state.couleur;
  $('input-logo1').value = state.options.logo1 || '';
  $('input-logo2').value = state.options.logo2 || '';
  $('input-lexique').value = state.lexique;
  ouvrir($('dlg-config'));
}

async function enregistrerConfig() {
  await sauverOptions({
    titre: $('input-titre').value.trim(),
    couleurVignette: $('input-couleur').value.trim(),
    logo1: $('input-logo1').value.trim(),
    logo2: $('input-logo2').value.trim(),
    lexique: $('input-lexique').value,
  });
  fermer($('dlg-config'));
}

function ouvrirLexique() {
  const zone = $('lexique-txt');
  zone.replaceChildren(...state.lexique.split(/\r?\n/).filter((l) => l.trim()).map((l) => {
    const p = document.createElement('p');
    p.textContent = l;
    return p;
  }));
  ouvrir($('dlg-lexique'));
}

/* --------------------------------------------------------------------------
   Initialisation
   -------------------------------------------------------------------------- */

grist.ready({ requiredAccess: 'read table', columns: COLUMNS });
grist.onOptions(appliquerOptions);

grist.onRecords((records, mappings) => {
  if (!mappings) { showMessage('Associez les colonnes dans la configuration du widget.'); return; }
  state.mappings = mappings;
  const rows = toRows(records, mappings);
  const erreur = validerHierarchie(rows);
  showMessage(erreur);
  if (!erreur) afficher(rows);
});

$('recherche').addEventListener('input', debounce((e) => filtrer(e.target.value), 200));
$('sel-mode').addEventListener('change', (e) => sauverOptions({ modeCouleur: e.target.value }));
$('sel-niveaux').addEventListener('change', (e) => { $('recherche').value = ''; changerNiveaux(e.target.value); });
$('btn-deplier').addEventListener('click', () => { $('sel-niveaux').value = 'tous'; changerNiveaux('tous'); });
$('btn-replier').addEventListener('click', () => { $('sel-niveaux').value = '0'; changerNiveaux('0'); });
$('btn-ajuster').addEventListener('click', () => state.chart && state.chart.fit());
$('btn-complet').addEventListener('click', () => focaliser(null));
$('btn-export').addEventListener('click', () => state.chart && ouvrirExport(racineVue().id));
$('btn-export-csv').addEventListener('click', exporterCSV);
$('btn-export-pdf').addEventListener('click', exporterPDF);
$('btn-lexique').addEventListener('click', ouvrirLexique);
$('btn-config').addEventListener('click', ouvrirConfig);
$('btn-ok').addEventListener('click', enregistrerConfig);
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (b && ACTIONS[b.dataset.action]) ACTIONS[b.dataset.action](Number(b.dataset.id), b);
});
// Les logos illisibles sont masqués.
['logo1', 'logo2'].forEach((id) => $(id).addEventListener('error', () => { $(id).hidden = true; }));

window.addEventListener('beforeprint', () => state.chart && state.chart.fit());
window.addEventListener('resize', debounce(() => {
  if (!state.chart) return;
  const c = document.querySelector('.chart-container');
  state.chart.svgWidth(c.clientWidth).svgHeight(c.clientHeight).render();
}, 150));

'use strict';

/* ==========================================================================
   Widget Grist « Organigramme »  (d3-org-chart 3.0.1)
   Une ligne de la table = un poste, occupé par un agent (nom vide = poste vacant).
   Seul parentId et nom sont obligatoires ; toute colonne non associée (ou masquée
   par les règles d'accès Grist) est simplement absente de la fiche et des exports.
   ========================================================================== */

const DEFAULTS = Object.freeze({ titre: 'Organigramme', couleur: 'lightblue', mode: 'strate' });
const NIVEAUX_INITIAUX = '2';
const PALETTE = ['#cfe3ff', '#d4f0cf', '#ffe2b5', '#f1d2ee', '#ffd0d0', '#cdeeea', '#e5dfff', '#f3efbd', '#d9e4c8', '#f5d9c4', '#c9dcec', '#e8d0e0'];
const FLAGS = ['_expanded', '_highlighted', '_upToTheRootHighlighted'];

const COLUMNS = [
  { name: 'parentId', title: "Identifiant du N+1", optional: false, allowMultiple: false },
  { name: 'nom', title: "Nom de l'agent (vide = poste vacant)", optional: false, type: 'Text', allowMultiple: false },
  { name: 'prenom', title: "Prénom (ajouté au nom s'il n'y figure pas déjà)", optional: true, type: 'Text' },
  { name: 'fonction', title: "Libellé du poste", optional: true },
  { name: 'directionGenerale', title: "Direction générale", optional: true },
  { name: 'direction', title: "Direction", optional: true },
  { name: 'pole', title: "Pôle", optional: true },
  { name: 'service', title: "Service", optional: true },
  { name: 'equipe', title: "Équipe", optional: true },
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
  { name: 'synchro', title: "Date de synchronisation (la plus récente est affichée)", optional: true },
];
const ATTRIBUTS = COLUMNS.map((c) => c.name).filter((n) => !['parentId', 'nom', 'photo', 'synchro'].includes(n));

const FICHE_ORGA = [['directionGenerale', 'Direction générale'], ['direction', 'Direction'], ['pole', 'Pôle'], ['service', 'Service'], ['equipe', 'Équipe']];
const FICHE_STRUCT = [['collectivite', 'Collectivité'], ['typePoste', 'Type de poste'], ['sorh', 'SORH gestionnaire'], ['statut', 'Statut']];
const FICHE_INDIV = [['metier', 'Métier'], ['site', 'Site de travail'], ['mail', 'Mail professionnel'], ['telephone', 'Téléphone'], ['teams', 'Teams']];
const FICHE_RH = [['matricule', 'Matricule'], ['grade', 'Grade'], ['cadreEmploi', "Cadre d'emploi"], ['categorie', 'Catégorie'], ['filiere', 'Filière']];
const EXPORT_COLS = [['directionGenerale', 'Direction générale'], ['direction', 'Direction'], ['pole', 'Pôle'], ['service', 'Service'], ['equipe', 'Équipe'], ['collectivite', 'Collectivité'], ['typePoste', 'Type de poste'], ['statut', 'Statut'], ['sorh', 'SORH'],
  ['metier', 'Métier'], ['site', 'Site'], ['mail', 'Mail'], ['telephone', 'Téléphone'], ['teams', 'Teams'],
  ['matricule', 'Matricule'], ['grade', 'Grade'], ['cadreEmploi', "Cadre d'emploi"], ['categorie', 'Catégorie'], ['filiere', 'Filière']];

const MODES = { strate: 'Niveau hiérarchique', collectivite: 'Collectivité', typePoste: 'Type de poste', sorh: 'SORH', pole: 'Pôle', service: 'Service', uniforme: 'Une seule couleur' };
const CATEG_MODES = ['collectivite', 'typePoste', 'sorh', 'pole', 'service'];
const MAX_LEGENDE = 14;
const MAX_LISTE = 25;
const SEUIL_LOIN = 0.35;
const SEUIL_MOYEN = 0.65;
const mouvementReduit = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const dureeAnim = () => (mouvementReduit() ? 0 : 400);
const PERSO = new Set(['prenom', 'mail', 'telephone', 'teams', 'matricule', 'grade', 'cadreEmploi', 'categorie', 'filiere']);
const FILTRES = [['collectivite', 'Collectivité'], ['typePoste', 'Type de poste'], ['sorh', 'SORH'], ['pole', 'Pôle'], ['service', 'Service'], ['site', 'Site']];
const COLONNES_STRUCTURE = ['directionGenerale', 'direction', 'pole', 'service', 'equipe'];
const CHAMPS_RECHERCHE = [['tout', 'Tout'], ['nom', 'Nom'], ['fonction', 'Poste'], ['structure', 'Structure'], ['metier', 'Métier'], ['site', 'Site'], ['sorh', 'SORH']];
const STAT_ATTRS = [['collectivite', 'Collectivité'], ['typePoste', 'Type de poste'], ['sorh', 'SORH'], ['direction', 'Direction'], ['pole', 'Pôle'],
  ['service', 'Service'], ['equipe', 'Équipe'], ['metier', 'Métier'], ['site', 'Site'], ['grade', 'Grade'], ['cadreEmploi', "Cadre d'emploi"],
  ['categorie', 'Catégorie'], ['filiere', 'Filière']];
const DIM = { detaillee: { width: 270, height: 118 }, compacte: { width: 230, height: 66 } };
const ECHELLE = { petite: 0.9, normale: 1, grande: 1.15 };
const MODELES = { compact: { layout: 'top', compact: true }, vertical: { layout: 'top', compact: false }, horizontal: { layout: 'left', compact: true } };

const state = {
  chart: null,
  mappings: null,
  rows: [], byId: new Map(), enfants: new Map(), racine: null,
  focusId: null,          // branche isolée (null = organigramme complet)
  exportId: null,
  niveaux: NIVEAUX_INITIAUX,
  categories: new Map(),  // valeur -> couleur (modes collectivité / type de poste)
  filtres: {},            // filtres actifs : clé -> valeur
  masques: new Set(),     // branches masquées
  vue: { rows: [], ombres: new Set(), nb: 0 },
  nominatif: true, modele: 'compact', densite: 'detaillee', police: 'normale', afficherSorh: false,
  logosCollectivites: new Map(), miseEnPage: '', statsId: null,
  tabId: null,            // vignette atteignable au clavier (tabindex = 0)
  courantId: null, resultats: [], idxResultat: -1, cleRecherche: '',
  zoomFige: false,        // vrai pendant un export : détail complet quel que soit le zoom
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
/** Structure la plus précise renseignée : équipe > service > pôle > direction > direction générale. */
const etiquette = (r) => (state.nominatif ? libelle(r) : `${r.a.fonction || 'Poste'}${r.vacant ? ' (vacant)' : ''}`);
const structure = (r) => r.a.equipe || r.a.service || r.a.pole || r.a.direction || r.a.directionGenerale || '';

function ouvrir(dlg, modal = true) {
  if (dlg.open || dlg.hasAttribute('open')) return;
  const f = modal ? dlg.showModal : dlg.show;
  if (f) f.call(dlg); else dlg.setAttribute('open', '');
}
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
      _rech: construireRecherche(nom, a),
    };
  });
}

function construireRecherche(nom, a) {
  const n = (...cles) => normaliser(cles.map((k) => a[k]).join(' '));
  return {
    tout: normaliser([nom, ...Object.values(a)].join(' ')),
    toutAnon: normaliser(Object.entries(a).filter(([k]) => !PERSO.has(k)).map(([, v]) => v).join(' ')),
    nom: normaliser(nom), fonction: n('fonction'), structure: n(...COLONNES_STRUCTURE), metier: n('metier'), site: n('site'), sorh: n('sorh'),
  };
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
/** Postes affichés : branche courante, sans branches masquées, restreints par les filtres (les ancêtres restent, estompés). */
function calculerVue() {
  const racine = racineVue();
  const base = [];
  const pile = [racine];
  while (pile.length) {
    const r = pile.pop();
    base.push(r);
    for (const e of [...state.enfants.get(r.id)].reverse()) if (!state.masques.has(e.id)) pile.push(e);   // ordre de la table conservé
  }
  const actifs = FILTRES.filter(([k]) => state.filtres[k]);
  if (!actifs.length) return { rows: base, ombres: new Set(), nb: base.length };
  const ok = (r) => actifs.every(([k]) => r.a[k] === state.filtres[k]);
  const trouves = base.filter(ok);
  const garde = new Set(trouves.map((r) => r.id));
  trouves.forEach((r) => { for (const p of ancetres(r)) garde.add(p.id); });
  if (!garde.size) garde.add(racine.id);
  const rows = base.filter((r) => garde.has(r.id));
  return { rows, ombres: new Set(rows.filter((r) => !ok(r)).map((r) => r.id)), nb: trouves.length };
}

function vueRows() {
  state.vue = calculerVue();
  return state.vue.rows;
}

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
  if (CATEG_MODES.includes(m) && !(state.mappings && state.mappings[m])) return 'strate';
  return m;
}

function construireCategories() {
  state.categories = new Map();
  const m = modeEffectif();
  if (!CATEG_MODES.includes(m)) return;
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
    if (items.length > MAX_LEGENDE) items = [...items.slice(0, MAX_LEGENDE), [`+ ${items.length - MAX_LEGENDE} autres (couleurs répétées)`, 'transparent']];
  }
  $('legende').innerHTML = items.map(([t, c]) => `<li><i style="background:${escapeHTML(c)}"></i>${escapeHTML(t)}</li>`).join('');
}

/* --------------------------------------------------------------------------
   Rendu de l'organigramme
   -------------------------------------------------------------------------- */

function dim() {
  const base = DIM[state.densite] || DIM.detaillee;
  const f = Math.max(1, ECHELLE[state.police] || 1);
  return { width: Math.round(base.width * f), height: Math.round(base.height * f) };
}

function renderNode(d) {
  const r = d.data;
  const nominatif = state.nominatif;
  const statut = r.a.statut;
  const draft = /draft|brouillon|travail/.test(normaliser(statut));
  const titre = etiquette(r);
  const sousTitre = nominatif ? r.a.fonction : (r.vacant ? 'Poste vacant' : '');
  const struct = [structure(r), state.afficherSorh && r.a.sorh ? `SORH ${r.a.sorh}` : ''].filter(Boolean).join(' · ');
  const aria = [titre, nominatif ? r.a.fonction : '', structure(r)].filter(Boolean).join(', ');
  const img = nominatif && r.photo ? `<img src="${escapeHTML(r.photo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '';
  const compte = r._nbPostes > 1
    ? `<div class="org-count" title="${r._nbAgents} agent(s) pour ${r._nbPostes} poste(s) dans la structure">${r._nbAgents} agent(s) · ${r._nbPostes} poste(s)</div>` : '';
  const classes = ['org-card', r.vacant && 'vacant', draft && 'draft', r._highlighted && 'trouve', !nominatif && 'anon', state.vue.ombres.has(r.id) && 'ombre', r.id === state.courantId && 'courant'].filter(Boolean).join(' ');
  return `
    <div class="org-node">
      <div class="${classes}" style="--bg:${escapeHTML(couleur(r))}" role="button" tabindex="${r.id === state.tabId ? 0 : -1}" data-id="${r.id}"
           aria-label="${escapeHTML(aria)}. Ouvrir la fiche">
        <span class="org-id" aria-hidden="true">#${r.id}</span>
        <div class="org-photo"><span class="org-initials">${nominatif && !r.vacant ? escapeHTML(initiales(r.nom)) : ''}</span>${img}</div>
        <div class="org-infos">
          <div class="org-nom" title="${escapeHTML(titre)}">${escapeHTML(titre)}</div>
          <div class="org-poste">${escapeHTML(sousTitre)}</div>
          <div class="org-struct">${escapeHTML(struct)}</div>
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
    .nodeHeight(() => dim().height)
    .nodeWidth(() => dim().width)
    .layout((MODELES[state.modele] || MODELES.compact).layout)
    .compact((MODELES[state.modele] || MODELES.compact).compact)
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
    .duration(dureeAnim())
    .buttonContent(({ node }) => `<div class="org-btn" aria-hidden="true">${node.children ? '−' : '+'} ${node.data._directSubordinatesPaging}</div>`)
    .onZoom((e) => majZoom(e.transform.k))
    .nodeContent(renderNode);

  const ouvrirCarte = (e) => {
    const carte = e.target.closest('.org-card');
    if (carte) ouvrirFiche(Number(carte.dataset.id));
  };
  conteneur.addEventListener('click', ouvrirCarte);
  conteneur.addEventListener('keydown', naviguerClavier);
  conteneur.addEventListener('focusin', (e) => {
    const carte = e.target.closest && e.target.closest('.org-card');
    if (!carte) return;
    state.tabId = Number(carte.dataset.id);
    conteneur.querySelectorAll('.org-card[tabindex="0"]').forEach((c) => { if (c !== carte) c.setAttribute('tabindex', '-1'); });
    carte.setAttribute('tabindex', '0');
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
  if (!state.byId.has(state.tabId)) state.tabId = state.racine.id;
  if (premier) { state.chart = creerOrganigramme(); appliquerNiveaux(state.niveaux); annoncer(''); }
  construireCategories();
  majFiltres();
  majChampsRecherche();
  majInterface();
  dessiner(premier);
}

/* --------------------------------------------------------------------------
   Zoom sémantique et commandes de zoom
   -------------------------------------------------------------------------- */

function niveauDetail(k) { return k < SEUIL_LOIN ? 'loin' : k < SEUIL_MOYEN ? 'moyen' : 'pres'; }

function majZoom(k) {
  $('zoom-niveau').textContent = `${Math.round(k * 100)} %`;
  if (state.zoomFige) return;
  const zone = document.querySelector('.chart-container');
  const niveau = niveauDetail(k);
  if (zone.dataset.zoom !== niveau) zone.dataset.zoom = niveau;   // un seul changement d'attribut : pas de nouveau rendu
}

function figerDetail(ms) {
  state.zoomFige = true;
  document.querySelector('.chart-container').dataset.zoom = 'pres';
  setTimeout(() => { state.zoomFige = false; majZoom(state.chart.lastTransform().k); }, ms);
}

function basculerPleinEcran() {
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => annoncer('Plein écran indisponible dans ce contexte.'));
}

/* --------------------------------------------------------------------------
   Clavier : flèches entre vignettes, + / - pour déplier / replier
   -------------------------------------------------------------------------- */

function deplierBranche(id) {
  const r = state.byId.get(id);
  r._expanded = true;
  const visibles = vueRows().length ? new Set(vueRows().map((x) => x.id)) : new Set();
  const enfants = state.enfants.get(id).filter((e) => visibles.has(e.id));
  enfants.forEach((e) => { e._expanded = true; });
  dessiner();
  annoncer(`${etiquette(r)} : ${enfants.length} rattaché(s) affiché(s).`);
}

function condenserBranche(id) {
  sousArbre(id).forEach((r) => { r._expanded = false; r._highlighted = false; });
  state.byId.get(id)._expanded = true;
  dessiner();
  annoncer(`${etiquette(state.byId.get(id))} : branche condensée.`);
}

function focusCarte(id) {
  setTimeout(() => {
    const carte = document.querySelector(`.org-card[data-id="${id}"]`);
    if (!carte) return;
    carte.focus({ preventScroll: true });
    const z = document.querySelector('.chart-container').getBoundingClientRect();
    const c = carte.getBoundingClientRect();
    const dehors = c.left < z.left || c.right > z.right || c.top < z.top || c.bottom > z.bottom;
    if (dehors && typeof state.chart.setCentered === 'function') { state.chart.setCentered(id).render(); }
  }, dureeAnim() + 60);
}

function naviguerClavier(e) {
  const carte = e.target.closest && e.target.closest('.org-card');
  if (!carte || e.ctrlKey || e.metaKey || e.altKey) return;
  const id = Number(carte.dataset.id);
  const r = state.byId.get(id);

  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrirFiche(id); return; }
  if (e.key === '+' || e.key === '=') { e.preventDefault(); deplierBranche(id); focusCarte(id); return; }
  if (e.key === '-') { e.preventDefault(); condenserBranche(id); focusCarte(id); return; }

  const ordre = new Map(state.chart.data().map((d, i) => [d.id, i]));
  const visibles = new Set([...document.querySelectorAll('.chart-container .org-card')].map((c) => Number(c.dataset.id)));
  const parent = id === racineVue().id ? null : state.byId.get(r.parentId);
  const triees = (liste) => liste.filter((x) => visibles.has(x.id)).sort((a, b) => ordre.get(a.id) - ordre.get(b.id));
  let cible = null;
  if (e.key === 'ArrowUp') cible = parent && visibles.has(parent.id) ? parent : null;
  else if (e.key === 'ArrowDown') cible = triees(state.enfants.get(id))[0] || null;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const fratrie = parent ? triees(state.enfants.get(parent.id)) : [];
    const i = fratrie.findIndex((x) => x.id === id);
    cible = fratrie[i + (e.key === 'ArrowRight' ? 1 : -1)] || null;
  } else if (e.key === 'Home') cible = racineVue();
  else return;

  e.preventDefault();
  if (cible) { state.tabId = cible.id; focusCarte(cible.id); const el = document.querySelector(`.org-card[data-id="${cible.id}"]`); if (el) el.focus({ preventScroll: true }); }
}

/* --------------------------------------------------------------------------
   Résultats de recherche : Entrée / Maj+Entrée pour passer de l'un à l'autre
   -------------------------------------------------------------------------- */

function allerResultat(delta) {
  const cle = `${$('recherche').value}|${$('champ-recherche').value}`;
  if (cle !== state.cleRecherche) appliquerRecherche();
  const n = state.resultats.length;
  if (!n) return;
  state.idxResultat = (state.idxResultat + delta + n) % n;
  const id = state.resultats[state.idxResultat];
  state.courantId = id;
  dessiner();
  if (typeof state.chart.setCentered === 'function') state.chart.setCentered(id).render();
  annoncer(`Résultat ${state.idxResultat + 1}/${n} : ${etiquette(state.byId.get(id))}.`);
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
  state.masques.delete(id);
  appliquerNiveaux(state.niveaux);
  majInterface();
  dessiner(true);
}

/** Rend un agent visible (change de branche si besoin, déplie ses ancêtres). */
function rendreVisible(id) {
  const r = state.byId.get(id);
  if (!r) return null;
  const dansFocus = state.focusId === null || id === state.focusId || [...ancetres(r)].some((p) => p.id === state.focusId);
  if (!dansFocus) state.focusId = null;
  if (!vueRows().some((x) => x.id === id)) { state.filtres = {}; state.masques.clear(); majFiltres(); }
  majInterface();
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
  annoncer(`${etiquette(r)} affiché dans l'organigramme.`);
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

const lignesDl = (paires, r) => paires.filter(([k]) => r.a[k] && (state.nominatif || !PERSO.has(k))).map(([k, l]) => `<dt>${l}</dt><dd>${formaterValeur(k, r.a[k])}</dd>`).join('');

function lienAgent(e) {
  const txt = state.nominatif ? libelle(e) + (e.a.fonction ? ` — ${e.a.fonction}` : '') : etiquette(e);
  return `<button type="button" class="lien" data-action="aller" data-id="${e.id}">${escapeHTML(txt)}</button>`;
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
  const orga = lignesDl(FICHE_ORGA, r);
  const struct = lignesDl(FICHE_STRUCT, r);
  const indiv = lignesDl(FICHE_INDIV, r);
  const rh = lignesDl(FICHE_RH, r);
  const img = state.nominatif && r.photo ? `<img src="${escapeHTML(r.photo)}" alt="" referrerpolicy="no-referrer">` : '';
  const estRacineVue = id === racineVue().id;

  $('fiche').innerHTML = `
    <button type="button" class="icone" data-action="fermer" aria-label="Fermer la fiche" style="position:absolute;top:8px;right:8px">✖</button>
    <div class="fiche-tete">
      <div class="org-photo"><span class="org-initials">${state.nominatif && !r.vacant ? escapeHTML(initiales(r.nom)) : ''}</span>${img}</div>
      <div>
        <h2 id="fiche-titre">${escapeHTML(etiquette(r))}</h2>
        <div>${state.nominatif ? escapeHTML(r.a.fonction) : ''}</div>
        <div class="vide">${escapeHTML(structure(r))}</div>
      </div>
    </div>
    <div class="badges">
      <span class="badge">${r._nbAgents} agent(s)</span><span class="badge">${r._nbPostes} poste(s)</span>
      <span class="badge">${subs.length} direct(s)</span>
    </div>
    ${orga ? `<h3>Rattachement</h3><dl>${orga}</dl>` : ''}
    ${struct || indiv ? `<h3>Informations</h3><dl>${struct}${indiv}</dl>` : ''}
    ${rh ? `<h3>Informations RH</h3><dl>${rh}</dl>` : ''}
    <h3>Positionnement</h3>
    <dl><dt>N+1</dt><dd>${parent ? lienAgent(parent) : '<span class="vide">Aucun (N°1)</span>'}</dd></dl>
    <h3>Collègues (même N+1)</h3>${listeAgents(collegues)}
    <h3>Subordonnés directs</h3>${listeAgents(subs)}
    <div class="actions">
      <button type="button" data-action="chemin" data-id="${id}">Chemin jusqu'au N°1</button>
      ${subs.length ? `<button type="button" data-action="branche" data-id="${id}">Afficher cette branche seule</button>` : ''}
      ${subs.length ? `<button type="button" data-action="condenser" data-id="${id}">Condenser cette branche</button>` : ''}
      ${estRacineVue ? '' : `<button type="button" data-action="masquer" data-id="${id}">Masquer cette branche</button>`}
      <button type="button" data-action="stats" data-id="${id}">Comptages…</button>
      <button type="button" data-action="export" data-id="${id}">Exporter cette structure…</button>
      <button type="button" data-action="fermer">Fermer</button>
    </div>`;
  ouvrir($('dlg-fiche'), false);
  $('dlg-fiche').scrollTop = 0;
}

const ACTIONS = {
  fermer: (id, btn) => fermer(btn.closest('dialog')),
  aller: (id) => { fermer($('dlg-fiche')); aller(id); },
  chemin: (id) => { fermer($('dlg-fiche')); chemin(id); },
  branche: (id) => { fermer($('dlg-fiche')); focaliser(id); },
  export: (id) => { fermer($('dlg-fiche')); ouvrirExport(id); },
  stats: (id) => { fermer($('dlg-fiche')); ouvrirStats(id); },
  masquer: (id) => {
    fermer($('dlg-fiche'));
    state.masques.add(id);
    majInterface();
    dessiner(true);
    annoncer('Branche masquée.');
  },
  condenser: (id) => { fermer($('dlg-fiche')); condenserBranche(id); },
  filtrer: (_id, btn) => {
    fermer($('dlg-stats'));
    state.filtres[btn.dataset.cle] = btn.dataset.valeur;
    majFiltres();
    appliquerFiltres();
  },
  razfiltres: () => { state.filtres = {}; majFiltres(); appliquerFiltres(); },
};

/* --------------------------------------------------------------------------
   Recherche (tous les attributs associés)
   -------------------------------------------------------------------------- */

function appliquerRecherche() {
  if (!state.chart) return;
  const mots = normaliser($('recherche').value).split(/\s+/).filter(Boolean);
  if (!mots.length) { state.resultats = []; state.courantId = null; state.cleRecherche = ''; changerNiveaux(state.niveaux); return; }

  const champ = $('champ-recherche').value || 'tout';
  const cle = champ === 'tout' && !state.nominatif ? 'toutAnon' : champ;
  const rows = vueRows();
  state.chart.clearHighlighting();
  rows.forEach((r) => { r._expanded = false; r._highlighted = false; });
  const trouves = rows.filter((r) => !state.vue.ombres.has(r.id) && mots.every((m) => r._rech[cle].includes(m)));
  racineVue()._expanded = true;
  trouves.forEach((r) => { r._highlighted = true; r._expanded = true; });
  state.resultats = trouves.map((r) => r.id);
  state.idxResultat = -1;
  state.courantId = null;
  state.cleRecherche = `${$('recherche').value}|${$('champ-recherche').value}`;
  dessiner(true);
  annoncer(trouves.length ? `${trouves.length} résultat(s)${state.focusId !== null ? ' dans la branche affichée' : ''}. Entrée pour les parcourir.` : 'Aucun résultat.');
}

function majChampsRecherche() {
  const sel = $('champ-recherche');
  const precedent = sel.value;
  const m = state.mappings || {};
  const dispo = CHAMPS_RECHERCHE.filter(([k]) => {
    if (k === 'tout' || k === 'fonction') return true;
    if (k === 'nom') return state.nominatif;
    if (k === 'structure') return COLONNES_STRUCTURE.some((c) => m[c]);
    return Boolean(m[k]);
  });
  sel.replaceChildren(...dispo.map(([k, l]) => new Option(l, k)));
  sel.value = dispo.some(([k]) => k === precedent) ? precedent : 'tout';
}

/* --------------------------------------------------------------------------
   Filtres (collectivité, type de poste, SORH, pôle, service, site)
   -------------------------------------------------------------------------- */

function majFiltres() {
  const corps = $('filtres-corps');
  const selCol = $('sel-collectivite');
  corps.replaceChildren();
  selCol.replaceChildren();
  selCol.dataset.filtre = 'collectivite';
  selCol.parentElement.hidden = true;

  FILTRES.forEach(([cle, label]) => {
    const valeurs = state.mappings && state.mappings[cle]
      ? [...new Set(state.rows.map((r) => r.a[cle]).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'fr')) : [];
    if (!valeurs.length) { delete state.filtres[cle]; return; }
    const sel = cle === 'collectivite' ? selCol : document.createElement('select');
    sel.dataset.filtre = cle;
    sel.add(new Option(cle === 'collectivite' ? 'Toutes (mutualisé)' : 'Tous', ''));
    valeurs.forEach((v) => sel.add(new Option(v, v)));
    if (!valeurs.includes(state.filtres[cle])) delete state.filtres[cle];
    sel.value = state.filtres[cle] || '';
    if (cle === 'collectivite') { selCol.parentElement.hidden = false; return; }
    const lab = document.createElement('label');
    lab.append(`${label} `, sel);
    corps.append(lab);
  });

  if (corps.children.length) {
    const raz = document.createElement('button');
    raz.type = 'button';
    raz.dataset.action = 'razfiltres';
    raz.textContent = 'Réinitialiser les filtres';
    corps.append(raz);
  }
  $('filtres').hidden = !corps.children.length;
  majLogos();
}

function appliquerFiltres() {
  majLogos();
  changerNiveaux(state.niveaux);
  majInterface();
  if ($('recherche').value.trim()) { appliquerRecherche(); return; }
  if (FILTRES.some(([k]) => state.filtres[k])) {
    annoncer(state.vue.nb ? `${state.vue.nb} poste(s) correspondent aux filtres.` : 'Aucun poste ne correspond aux filtres.');
  }
}

/* --------------------------------------------------------------------------
   Comptages par attribut
   -------------------------------------------------------------------------- */

function ouvrirStats(id) {
  const r = state.byId.get(id) || racineVue();
  state.statsId = r.id;
  $('stats-structure').textContent = [etiquette(r), structure(r)].filter(Boolean).join(' — ');
  const sel = $('stats-attribut');
  const precedent = sel.value;
  const dispo = STAT_ATTRS.filter(([k]) => state.mappings && state.mappings[k] && (state.nominatif || !PERSO.has(k)));
  sel.replaceChildren(...dispo.map(([k, l]) => new Option(l, k)));
  if (dispo.some(([k]) => k === precedent)) sel.value = precedent;
  if (dispo.length) dessinerStats(); else $('stats-corps').textContent = 'Associez au moins une colonne d\'attribut (collectivité, grade, filière…).';
  ouvrir($('dlg-stats'));
}

function dessinerStats() {
  const cle = $('stats-attribut').value;
  const rows = sousArbre(state.statsId);
  const groupes = new Map();
  rows.forEach((r) => {
    const v = r.a[cle] || '';
    const g = groupes.get(v) || { postes: 0, agents: 0 };
    g.postes += 1;
    if (!r.vacant) g.agents += 1;
    groupes.set(v, g);
  });
  const lignes = [...groupes.entries()].sort((a, b) => b[1].postes - a[1].postes || a[0].localeCompare(b[0], 'fr'));
  const filtrable = FILTRES.some(([k]) => k === cle);
  const agents = rows.filter((r) => !r.vacant).length;
  $('stats-corps').innerHTML = `
    <table class="stats-table">
      <thead><tr><th>Valeur</th><th class="n">Agents</th><th class="n">Postes</th><th>Part des postes</th></tr></thead>
      <tbody>${lignes.map(([v, g]) => {
        const pct = Math.round((g.postes / rows.length) * 100);
        const nom = v || 'Non renseigné';
        const lien = filtrable && v
          ? `<button type="button" class="lien" data-action="filtrer" data-cle="${escapeHTML(cle)}" data-valeur="${escapeHTML(v)}">${escapeHTML(nom)}</button>` : escapeHTML(nom);
        return `<tr><td>${lien}</td><td class="n">${g.agents}</td><td class="n">${g.postes}</td>
          <td><span class="barre" style="width:${pct}%" title="${pct} %"></span></td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr><th>Total</th><th class="n">${agents}</th><th class="n">${rows.length}</th><th></th></tr></tfoot>
    </table>`;
}

/* --------------------------------------------------------------------------
   Exports
   -------------------------------------------------------------------------- */

function ouvrirExport(id) {
  const r = state.byId.get(id) || racineVue();
  state.exportId = r.id;
  $('export-structure').textContent = [etiquette(r), structure(r)].filter(Boolean).join(' — ');
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
  const nominatif = state.nominatif;
  const cols = EXPORT_COLS.filter(([k]) => state.mappings && state.mappings[k] && (nominatif || !PERSO.has(k)));
  const entete = ['Niveau', ...(nominatif ? ['Nom'] : []), 'Poste', 'Structure', 'N+1', 'Poste vacant', ...cols.map(([, l]) => l), 'Nb agents (structure)', 'Nb postes (structure)'];
  const lignes = rows.map((r) => [
    r._depth - racine._depth + 1, ...(nominatif ? [libelle(r)] : []), r.a.fonction, structure(r),
    r.id === racine.id ? '' : etiquette(state.byId.get(r.parentId)), r.vacant ? 'Oui' : 'Non',
    ...cols.map(([k]) => r.a[k]), r._nbAgents, r._nbPostes,
  ]);
  const csv = '\ufeff' + [entete, ...lignes].map((l) => l.map(celluleCSV).join(';')).join('\r\n');
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  lien.download = `organigramme_${normaliser(etiquette(racine)).replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'export'}.csv`;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
  fermer($('dlg-export'));
  annoncer(`${rows.length} ligne(s) exportée(s).`);
}

/** Convertit les photos en données locales ; celles dont l'hébergeur refuse le CORS sont retirées (initiales). */
async function preparerPhotos() {
  const imgs = [...document.querySelectorAll('.chart-container .org-photo img')];
  let retirees = 0;
  await Promise.all(imgs.map(async (img) => {
    try {
      const rep = await fetch(img.src, { mode: 'cors', referrerPolicy: 'no-referrer' });
      if (!rep.ok) throw new Error('http');
      const blob = await rep.blob();
      img.src = await new Promise((ok, ko) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = ko; f.readAsDataURL(blob); });
    } catch { img.remove(); retirees += 1; }
  }));
  return retirees;
}

async function exporterImage(format) {
  const id = state.exportId;
  const n = $('export-niveaux').value;
  fermer($('dlg-export'));
  state.focusId = id === state.racine.id ? null : id;
  appliquerNiveaux(n);
  majInterface();
  dessiner(true);
  figerDetail(12000);
  annoncer('Préparation de l\'image…');
  await new Promise((ok) => setTimeout(ok, dureeAnim() + 300));
  if (format === 'svg') {
    state.chart.exportSvg();
    annoncer('Image SVG générée.');
  } else {
    const retirees = await preparerPhotos();
    state.chart.exportImg({ full: true, scale: 2, backgroundColor: getComputedStyle(document.body).getPropertyValue('--surface').trim() || '#ffffff' });
    annoncer(retirees ? `Image PNG générée ; ${retirees} photo(s) remplacée(s) par les initiales (hébergeur sans CORS).` : 'Image PNG générée.');
    setTimeout(() => dessiner(), 4000);   // restitue les photos retirées du DOM
  }
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
    o.disabled = CATEG_MODES.includes(o.value) && !(state.mappings && state.mappings[o.value]);
  });
  sel.value = modeEffectif();
  $('sel-niveaux').value = state.niveaux;
  $('sel-modele').value = state.modele;
  $('chk-anon').checked = !state.nominatif;
  $('btn-complet').hidden = state.focusId === null;
  if (state.focusId !== null) $('btn-complet').textContent = `Retour à l'organigramme complet (branche : ${etiquette(state.byId.get(state.focusId))})`;
  $('btn-masques').hidden = state.masques.size === 0;
  $('btn-masques').textContent = `Branches masquées (${state.masques.size}) — tout afficher`;
  const nbFiltres = FILTRES.filter(([k]) => state.filtres[k]).length;
  $('filtres').querySelector('summary').textContent = nbFiltres ? `Filtres (${nbFiltres})` : 'Filtres';
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
  state.nominatif = opts.nominatif !== false;
  state.modele = MODELES[opts.modele] ? opts.modele : 'compact';
  state.densite = DIM[opts.densite] ? opts.densite : 'detaillee';
  state.police = ECHELLE[opts.police] ? opts.police : 'normale';
  state.afficherSorh = opts.afficherSorh === true;
  state.logosCollectivites = new Map(String(opts.logosCollectivites || '').split(/\r?\n/).map((l) => {
    const k = l.indexOf('=');
    return k > 0 ? [normaliser(l.slice(0, k).trim()), safeUrl(l.slice(k + 1))] : null;
  }).filter((e) => e && e[1]));
  majLogos();
  majChampsRecherche();
  const signature = `${state.modele}|${state.densite}|${state.police}`;
  const refit = signature !== state.miseEnPage;
  state.miseEnPage = signature;
  appliquerMiseEnPage();
  $('btn-lexique').hidden = !state.lexique.trim();

  if (state.chart) {
    construireCategories();
    majInterface();
    if (!state.nominatif) fermer($('dlg-fiche'));
    dessiner(refit);
    if ($('recherche').value.trim()) appliquerRecherche();
  }
}

function appliquerMiseEnPage() {
  document.documentElement.dataset.densite = state.densite;
  document.documentElement.style.setProperty('--fs', ECHELLE[state.police] || 1);
  if (state.chart) {
    const m = MODELES[state.modele] || MODELES.compact;
    state.chart.layout(m.layout).compact(m.compact);
  }
}

/** Logos : ceux de la configuration, ou celui de la collectivité filtrée s'il existe. */
function majLogos() {
  const col = state.filtres.collectivite;
  const specifique = col && state.logosCollectivites.get(normaliser(col));
  const urls = specifique ? [specifique] : [safeUrl(state.options.logo1), safeUrl(state.options.logo2)];
  ['logo1', 'logo2'].forEach((id, i) => {
    const img = $(id);
    img.hidden = !urls[i];
    if (urls[i]) { img.src = urls[i]; img.alt = col ? `Logo ${col}` : 'Logo'; } else img.removeAttribute('src');
  });
}

const sauverOptions = (partiel) => grist.setOptions({ ...state.options, ...partiel });

function ouvrirConfig() {
  $('input-titre').value = state.titre;
  $('input-couleur').value = state.couleur;
  $('input-logo1').value = state.options.logo1 || '';
  $('input-logo2').value = state.options.logo2 || '';
  $('input-lexique').value = state.lexique;
  $('input-logos').value = state.options.logosCollectivites || '';
  $('input-densite').value = state.densite;
  $('input-police').value = state.police;
  $('chk-sorh').checked = state.afficherSorh;
  ouvrir($('dlg-config'));
}

async function enregistrerConfig() {
  await sauverOptions({
    titre: $('input-titre').value.trim(),
    couleurVignette: $('input-couleur').value.trim(),
    logo1: $('input-logo1').value.trim(),
    logo2: $('input-logo2').value.trim(),
    lexique: $('input-lexique').value,
    logosCollectivites: $('input-logos').value,
    densite: $('input-densite').value,
    police: $('input-police').value,
    afficherSorh: $('chk-sorh').checked,
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

function majSynchro(records, mappings) {
  const col = mappings.synchro;
  let max = 0;
  let brut = '';
  if (col) {
    records.forEach((rec) => {
      const v = rec[col];
      const t = typeof v === 'number' ? v * 1000 : Date.parse(v);
      if (Number.isFinite(t)) max = Math.max(max, t); else if (v && !brut) brut = String(v);
    });
  }
  const texte = max ? new Date(max).toLocaleString('fr-FR') : brut;
  $('synchro').textContent = texte ? `Dernière synchronisation : ${texte}` : '';
}

grist.ready({ requiredAccess: 'read table', columns: COLUMNS });
grist.onOptions(appliquerOptions);

grist.onRecords((records, mappings) => {
  if (!mappings) { showMessage('Associez les colonnes dans la configuration du widget.'); return; }
  state.mappings = mappings;
  majSynchro(records, mappings);
  const rows = toRows(records, mappings);
  const erreur = validerHierarchie(rows);
  showMessage(erreur);
  if (!erreur) afficher(rows);
});

$('recherche').addEventListener('input', debounce(appliquerRecherche, 200));
$('champ-recherche').addEventListener('change', appliquerRecherche);
$('sel-modele').addEventListener('change', (e) => sauverOptions({ modele: e.target.value }));
$('chk-anon').addEventListener('change', (e) => sauverOptions({ nominatif: !e.target.checked }));
$('btn-stats').addEventListener('click', () => state.chart && ouvrirStats(racineVue().id));
$('stats-attribut').addEventListener('change', dessinerStats);
$('btn-masques').addEventListener('click', () => { state.masques.clear(); majInterface(); dessiner(true); });
document.addEventListener('change', (e) => {
  const cle = e.target.dataset && e.target.dataset.filtre;
  if (!cle) return;
  if (e.target.value) state.filtres[cle] = e.target.value; else delete state.filtres[cle];
  appliquerFiltres();
});
$('sel-mode').addEventListener('change', (e) => sauverOptions({ modeCouleur: e.target.value }));
$('sel-niveaux').addEventListener('change', (e) => { $('recherche').value = ''; changerNiveaux(e.target.value); });
$('btn-deplier').addEventListener('click', () => { $('sel-niveaux').value = 'tous'; changerNiveaux('tous'); });
$('btn-replier').addEventListener('click', () => { $('sel-niveaux').value = '0'; changerNiveaux('0'); });
$('btn-ajuster').addEventListener('click', () => state.chart && state.chart.fit());
$('btn-zoom-plus').addEventListener('click', () => state.chart && state.chart.zoomIn());
$('btn-zoom-moins').addEventListener('click', () => state.chart && state.chart.zoomOut());
if (document.fullscreenEnabled) { $('btn-plein-ecran').hidden = false; $('btn-plein-ecran').addEventListener('click', basculerPleinEcran); }
$('btn-export-png').addEventListener('click', () => exporterImage('png'));
$('btn-export-svg').addEventListener('click', () => exporterImage('svg'));
$('recherche').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); allerResultat(e.shiftKey ? -1 : 1); }
});
document.addEventListener('click', (e) => {
  document.querySelectorAll('details.menu[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; });
});
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

document.addEventListener('keydown', (e) => {
  const fiche = $('dlg-fiche');
  if (e.key === 'Escape') document.querySelectorAll('details.menu[open]').forEach((d) => { d.open = false; });
  if (e.key === 'Escape' && (fiche.open || fiche.hasAttribute('open'))) fermer(fiche);
  const saisie = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (e.key === '/' && !saisie) { e.preventDefault(); $('recherche').focus(); }
});

window.addEventListener('beforeprint', () => {
  if (!state.chart) return;
  state.zoomFige = true;
  document.querySelector('.chart-container').dataset.zoom = 'pres';
  state.chart.fit();
});
window.addEventListener('afterprint', () => { state.zoomFige = false; if (state.chart) majZoom(state.chart.lastTransform().k); });
window.addEventListener('resize', debounce(() => {
  if (!state.chart) return;
  const c = document.querySelector('.chart-container');
  state.chart.svgWidth(c.clientWidth).svgHeight(c.clientHeight).render();
}, 150));

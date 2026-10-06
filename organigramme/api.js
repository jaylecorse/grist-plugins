'use strict';

/* ==========================================================================
   Widget Grist « Organigramme »  (d3-org-chart 3.0.1)
   --------------------------------------------------------------------------
   Colonnes à associer dans le panneau de configuration du widget :
     - parentId  : identifiant (id de ligne) du N+1, vide pour le N°1
     - nom       : nom affiché sur la vignette
     - fonction  : (optionnel)
     - direction : (optionnel)
     - photo     : (optionnel) colonne Texte contenant l'URL http(s) de la photo
   ========================================================================== */

const DEFAULTS = Object.freeze({ titre: 'Organigramme', couleur: 'lightblue' });
const NODE = Object.freeze({ width: 250, height: 100 });

const COLUMNS = [
  { name: 'parentId', title: "Identifiant du N+1", optional: false, allowMultiple: false },
  { name: 'nom', title: "Le nom de l'agent", optional: false, type: 'Text', allowMultiple: false },
  { name: 'fonction', title: "La fonction de l'agent", optional: true },
  { name: 'direction', title: "La direction de l'agent", optional: true },
  { name: 'photo', title: "L'URL de la photo de l'agent", optional: true, type: 'Text', allowMultiple: false },
];

const state = {
  chart: null,
  byId: new Map(),
  titre: DEFAULTS.titre,
  couleur: DEFAULTS.couleur,
};

const $ = (id) => document.getElementById(id);

/* --------------------------------------------------------------------------
   Utilitaires
   -------------------------------------------------------------------------- */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Échappe une valeur pour l'insérer dans du HTML (texte ou attribut). */
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Retourne l'URL de la photo si elle est en http(s), sinon une chaîne vide. */
function safePhotoUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

/** « ARASSE-COUGOULE Martine » -> « AM » */
function initiales(nom) {
  return String(nom ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => Array.from(mot)[0].toUpperCase())
    .join('');
}

/** Minuscules sans accents, pour la recherche. */
function normaliser(text) {
  return String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function showMessage(text) {
  $('msg').textContent = text || '';
}

/* --------------------------------------------------------------------------
   Données
   -------------------------------------------------------------------------- */

/** Transforme les enregistrements Grist en lignes normalisées. */
function toRows(records, mappings) {
  const col = (name) => mappings[name];
  return records.map((rec) => {
    const parent = Number(rec[col('parentId')]);
    const nom = String(rec[col('nom')] ?? '');
    return {
      id: rec.id,
      parentId: Number.isFinite(parent) && parent > 0 ? parent : null,
      nom,
      fonction: col('fonction') ? String(rec[col('fonction')] ?? '') : '',
      direction: col('direction') ? String(rec[col('direction')] ?? '') : '',
      photo: col('photo') ? safePhotoUrl(rec[col('photo')]) : '',
      _recherche: normaliser(nom),
    };
  });
}

/** Retourne un message d'erreur si la hiérarchie est inexploitable, sinon ''. */
function validerHierarchie(rows) {
  if (!rows.length) return "Aucun agent à afficher.";

  const ids = new Set(rows.map((r) => r.id));
  const racines = rows.filter((r) => r.parentId === null);

  if (racines.length === 0) {
    return "Il faut un agent sans N+1 (parentId vide).\nL'organigramme ne peut pas fonctionner.";
  }
  if (racines.length > 1) {
    const noms = racines.slice(0, 5).map((r) => r.nom || `#${r.id}`).join(', ');
    return `Il ne faut qu'un seul agent sans N+1 (parentId vide) : ${racines.length} trouvés (${noms}${racines.length > 5 ? ', …' : ''}).\nL'organigramme ne peut pas fonctionner.`;
  }

  const orphelins = rows.filter((r) => r.parentId !== null && !ids.has(r.parentId));
  if (orphelins.length) {
    const noms = orphelins.slice(0, 5).map((r) => r.nom || `#${r.id}`).join(', ');
    return `${orphelins.length} agent(s) ont un N+1 introuvable (${noms}${orphelins.length > 5 ? ', …' : ''}).\nVérifiez parentId et les filtres posés sur le widget.`;
  }

  // Tout agent doit être atteignable depuis la racine (sinon : boucle dans les N+1).
  const enfants = new Map();
  rows.forEach((r) => {
    if (r.parentId === null) return;
    if (!enfants.has(r.parentId)) enfants.set(r.parentId, []);
    enfants.get(r.parentId).push(r.id);
  });
  const vus = new Set([racines[0].id]);
  const pile = [racines[0].id];
  while (pile.length) {
    for (const enfant of enfants.get(pile.pop()) || []) {
      if (!vus.has(enfant)) {
        vus.add(enfant);
        pile.push(enfant);
      }
    }
  }
  if (vus.size !== rows.length) {
    return `${rows.length - vus.size} agent(s) ne sont pas rattachés au N°1 (boucle dans les N+1).\nL'organigramme ne peut pas fonctionner.`;
  }
  return '';
}

/** Conserve l'état (ouvert / surligné) des nœuds lors d'une mise à jour des données. */
function restaurerEtat(rows) {
  if (!state.chart) return;
  const anciens = new Map((state.chart.data() || []).map((d) => [d.id, d]));
  rows.forEach((row) => {
    const ancien = anciens.get(row.id);
    if (!ancien) return;
    ['_expanded', '_highlighted', '_upToTheRootHighlighted'].forEach((cle) => {
      if (ancien[cle] !== undefined) row[cle] = ancien[cle];
    });
  });
}

/* --------------------------------------------------------------------------
   Rendu
   -------------------------------------------------------------------------- */

function renderNode(d) {
  const { id, nom, fonction, direction, photo } = d.data;
  const detail = [fonction, direction].filter(Boolean).map(escapeHTML).join('<br>');
  const img = photo
    ? `<img src="${escapeHTML(photo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : '';

  return `
    <div class="org-node">
      <div class="org-card">
        <span class="org-id" data-id="${id}" title="Afficher le chemin jusqu'au N°1">#${id}</span>
        <div class="org-photo"><span class="org-initials">${escapeHTML(initiales(nom))}</span>${img}</div>
        <div class="org-infos">
          <div class="org-nom" title="${escapeHTML(nom)}">${escapeHTML(nom)}</div>
          <div class="org-detail">${detail}</div>
        </div>
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
    .parentNodeId((d) => d.parentId)
    .linkUpdate(function (d) {
      const surligne = Boolean(d.data._upToTheRootHighlighted);
      const lien = d3.select(this)
        .attr('stroke', surligne ? '#e27396' : 'lightgray')
        .attr('stroke-width', surligne ? 5 : 1.5);
      if (surligne) lien.raise();
    })
    .nodeContent(renderNode);

  // Délégation d'événements : un seul écouteur pour toutes les vignettes.
  conteneur.addEventListener('click', (e) => {
    const cible = e.target.closest('.org-id');
    if (cible) cheminVersRacine(Number(cible.dataset.id));
  });
  // Photo introuvable / illisible : on retire l'image, les initiales restent visibles.
  conteneur.addEventListener('error', (e) => {
    if (e.target instanceof HTMLImageElement) e.target.remove();
  }, true);

  return chart;
}

function afficher(rows) {
  const premierAffichage = !state.chart;
  if (premierAffichage) state.chart = creerOrganigramme();

  restaurerEtat(rows);
  state.byId = new Map(rows.map((r) => [r.id, r]));
  state.chart.data(rows).render();
}

function cheminVersRacine(id) {
  const { chart, byId } = state;
  if (!chart) return;
  const dejaSurligne = byId.get(id)?._upToTheRootHighlighted === true;
  chart.clearHighlighting();
  if (!dejaSurligne) chart.setUpToTheRootHighlighted(id).render().fit();
}

/* --------------------------------------------------------------------------
   Recherche
   -------------------------------------------------------------------------- */

function filtrer(texte) {
  const { chart, byId } = state;
  if (!chart) return;
  const terme = normaliser(texte).trim();
  const rows = chart.data();

  chart.clearHighlighting();
  rows.forEach((r) => { r._expanded = false; });

  if (terme) {
    rows.forEach((r) => {
      if (!r._recherche.includes(terme)) return;
      r._highlighted = true;
      // Déplie les ancêtres pour que la personne trouvée soit visible.
      for (let p = byId.get(r.parentId); p && !p._expanded; p = byId.get(p.parentId)) {
        p._expanded = true;
      }
    });
  }
  chart.data(rows).render().fit();
}

/* --------------------------------------------------------------------------
   Configuration (titre, couleur)
   -------------------------------------------------------------------------- */

function appliquerOptions(options) {
  const opts = options || {};
  state.titre = opts.titre || DEFAULTS.titre;

  const couleur = opts.couleurVignette;
  // CSS.supports évite toute injection : seule une vraie couleur CSS est acceptée.
  state.couleur = couleur && CSS.supports('color', couleur) ? couleur : DEFAULTS.couleur;

  $('titre').textContent = state.titre;
  document.documentElement.style.setProperty('--vignette', state.couleur);
}

function basculerConfig(ouvrir) {
  const panneau = $('config-panel');
  const visible = ouvrir ?? !panneau.classList.contains('ouvert');
  if (visible) {
    $('input-titre').value = state.titre;
    $('input-couleur').value = state.couleur;
  }
  panneau.classList.toggle('ouvert', visible);
}

async function enregistrerConfig() {
  await grist.setOptions({
    titre: $('input-titre').value.trim(),
    couleurVignette: $('input-couleur').value.trim(),
  });
  basculerConfig(false);
}

/* --------------------------------------------------------------------------
   Initialisation
   -------------------------------------------------------------------------- */

grist.ready({ requiredAccess: 'read table', columns: COLUMNS });

grist.onOptions(appliquerOptions);

grist.onRecords((records, mappings) => {
  if (!mappings) {
    showMessage("Associez les colonnes dans la configuration du widget.");
    return;
  }
  const rows = toRows(records, mappings);
  const erreur = validerHierarchie(rows);
  showMessage(erreur);
  if (!erreur) afficher(rows);
});

$('recherche').addEventListener('input', debounce((e) => filtrer(e.target.value), 200));
$('btn-config').addEventListener('click', () => basculerConfig());
$('btn-ok').addEventListener('click', enregistrerConfig);
$('btn-annuler').addEventListener('click', () => basculerConfig(false));

window.addEventListener('resize', debounce(() => {
  if (!state.chart) return;
  const conteneur = document.querySelector('.chart-container');
  state.chart.svgWidth(conteneur.clientWidth).svgHeight(conteneur.clientHeight).render();
}, 150));

const DEFAULT_VIGNETTE_COLOR = "lightblue";
let chart;
let cols = {};   // colonnes mappées (parentId, nom, fonction, direction, image)
let token = "";
let baseUrl = "";

// Mapping des colonnes configurables dans Grist (sélection du widget)
const columnsMappingOptions = [
  { name: "parentId",   title: "Identifiant du N+1 (ParentID)", optional: false, allowMultiple: false },
  { name: "nom",        title: "Le nom de l'agent",             optional: false, allowMultiple: false },
  { name: "fonction",   title: "La fonction de l'agent",         optional: true },
  { name: "direction",  title: "La direction de l'agent",       optional: true },
  { name: "image",      title: "Photo (URL ou pièce jointe)",   optional: true, allowMultiple: false }
];

function ready(fn) {
  if (document.readyState !== 'loading') fn();
  else document.addEventListener('DOMContentLoaded', fn);
}

ready(function () {
  grist.ready({ requiredAccess: 'read table', columns: columnsMappingOptions });

  grist.onRecords((table, mappings) => {
    cols = {
      chpParentId:  mappings.parentId,
      chpNom:       mappings.nom,
      chpFonction:  mappings.fonction,
      chpDirection: mappings.direction,
      chpImage:     mappings.image
    };
    const chpParentId = cols.chpParentId;

    const nbNull = table.filter(elt => elt[chpParentId] == null).length;

    if (nbNull !== 1) {
      document.getElementById('msg').innerHTML = nbNull === 0
        ? "Il faut un agent sans N+1 (ParentID=null)<br>L'organigramme ne peut pas fonctionner"
        : "Il ne faut qu'un seul agent sans N+1 (ParentID=null)<br>L'organigramme ne peut pas fonctionner";
      return;
    }

    document.getElementById('msg').innerHTML = "";
    grist.docApi.getAccessToken({ readOnly: true }).then(response => {
      token = response.token;
      baseUrl = response.baseUrl;
      genereOrganigramme(table, cols);
    });
  });

  grist.onOptions((options) => {
    document.getElementById('titre').textContent = (options && options.titre) || "Organigramme";
  });
});

// Extrait l'URL d'une photo : URL directe (texte) ou pièce jointe Grist (liste)
function getImageUrl(value) {
  if (!value) return "";
  if (Array.isArray(value) && value.length > 0) {
    // Pièce jointe Grist : liste [{id, ...}]
    if (typeof value[0] === 'object' && value[0].id != null) {
      return `${baseUrl}/attachments/${parseInt(value[0].id)}/download?auth=${token}`;
    }
    return String(value[0]);
  }
  const url = String(value).trim();
  return /^(https?:\/\/|data:image\/)/i.test(url) ? url : "";
}

function escapeHTML(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

async function genereOrganigramme(table, cols) {
  let colorVignette = await grist.getOption("couleurVignette") || DEFAULT_VIGNETTE_COLOR;
  if (!/^[#-\w]+$/.test(colorVignette)) colorVignette = DEFAULT_VIGNETTE_COLOR;

  chart = new d3.OrgChart()
    .nodeHeight(() => 110)
    .nodeWidth(() => 222)
    .childrenMargin(() => 50)
    .compactMarginBetween(() => 35)
    .compactMarginPair(() => 30)
    .neighbourMargin(() => 20)
    .parentNodeId(d => d[cols.chpParentId])
    .linkUpdate(function (d) {
      d3.select(this)
        .attr('stroke', d.data._upToTheRootHighlighted ? '#e27396' : 'lightgray')
        .attr('stroke-width', d.data._upToTheRootHighlighted ? 5 : 1.5);
      if (d.data._upToTheRootHighlighted) d3.select(this).raise();
    })
    .nodeContent(function (d) {
      const url = getImageUrl(d.data[cols.chpImage]);
      const fonction = escapeHTML(d.data[cols.chpFonction] || "");
      const direction = escapeHTML(d.data[cols.chpDirection] || "");
      const nom = escapeHTML(d.data[cols.chpNom]);

      // Photo : affichée seulement si une URL valide est renseignée, sinon zone neutre
      const photoHtml = url
        ? `<img src="${escapeHTML(url)}" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;">`
        : `<div style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.6);border:1px dashed #b9b6c3;"></div>`;

      // Fonction : petite zone affichée seulement si renseignée
      const fonctionHtml = fonction
        ? `<div style="margin-top:2px;padding:2px 6px;border-radius:6px;background:rgba(0,0,0,.07);font-size:10px;color:#08011E;display:inline-block;">${fonction}</div>`
        : "";

      const directionHtml = direction
        ? `<div style="color:#716E7B;margin-top:4px;font-size:10px;">${direction}</div>`
        : "";

      return `
        <div style="width:${parseInt(d.width)}px;height:${parseInt(d.height)}px;padding:2px 1px;">
          <div style="font-family:'Inter',sans-serif;background-color:${colorVignette};width:${parseInt(d.width) - 2}px;height:${parseInt(d.height) - 4}px;border-radius:10px;border:1px solid #E4E2E9;box-sizing:border-box;padding:8px 10px;">
            <div onclick="toRoot(${d.data.id},${d.data._upToTheRootHighlighted})" style="text-align:right;font-size:10px;color:#716E7B;cursor:pointer;">#${parseInt(d.data.id)}</div>
            <div style="display:flex;align-items:center;gap:10px;margin-top:2px;">
              ${photoHtml}
              <div>
                <div style="font-size:15px;color:#08011E;font-weight:600;">${nom}</div>
                ${fonctionHtml}
              </div>
            </div>
            ${directionHtml}
          </div>
        </div>`;
    })
    .container('.chart-container')
    .data(table)
    .render();
}

function toRoot(id, highlighted) {
  chart.clearHighlighting();
  if (highlighted !== true) {
    chart.setUpToTheRootHighlighted(parseInt(id)).render().fit();
  }
}

function filterChart(e) {
  if (!chart) return;
  const value = e.srcElement.value;
  chart.clearHighlighting();
  const data = chart.data();
  data.forEach(d => (d._expanded = false));
  if (value !== '') {
    data.forEach(d => {
      if (String(d[cols.chpNom] || "").toLowerCase().includes(value.toLowerCase())) {
        d._highlighted = true;
        d._expanded = true;
      }
    });
  }
  chart.data(data).render().fit();
}

async function clic(action) {
  const configPanel = document.getElementById('config-panel');
  if (action === 0 || action === 2) {
    document.getElementById("input-titre").value = await grist.getOption("titre") || "Organigramme";
    document.getElementById("input-couleur").value = await grist.getOption("couleurVignette") || DEFAULT_VIGNETTE_COLOR;
  }
  if (action === 1) {
    await grist.setOption("titre", document.getElementById("input-titre").value);
    await grist.setOption("couleurVignette", document.getElementById("input-couleur").value);
  }
  configPanel.style.display = configPanel.style.display === 'block' ? 'none' : 'block';
}

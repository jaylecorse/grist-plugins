# Organigramme (widget Grist) — v2

Visualisation d'organigramme alimentée par une table Grist (une ligne = un poste, occupé par un agent ; nom vide = poste vacant).
Utilise d3 v7, d3-flextree 2.1.2 et d3-org-chart 3.0.1.

## Ajouter le widget
1. La table doit avoir un champ `parentId` qui retourne l'**id de ligne** du N+1 (vide pour le N°1, un seul agent sans N+1).
2. Ajouter un widget personnalisé (**URL personnalisée**) lié à la table, avec l'URL de publication de ce dossier.
3. Associer les colonnes (seules `parentId` et `nom` sont obligatoires).

| Champ | Usage |
|---|---|
| parentId, nom | hiérarchie et nom affiché (+ `prenom` s'il n'est pas déjà dans le nom) |
| fonction, direction | libellé du poste, libellé de la structure (affichés sur la vignette) |
| photo | URL http(s) directe vers l'image (colonne Texte) |
| collectivite, typePoste | couleurs Ville/Métropole, permanent/non permanent |
| statut | « travail préparatoire / draft / brouillon » = vignette en pointillés bleus ; le libellé s'affiche en étiquette |
| sorh, metier, site, mail, telephone, teams | fiche agent (informations individuelles) |
| matricule, grade, cadreEmploi, categorie, filiere | fiche agent, section « Informations RH » |

## Couverture des spécifications
| Exigence | Dans le widget |
|---|---|
| Couleurs par collectivité / type de poste / strate | menu « Couleur par » + légende |
| Logos | Configuration (⋯) : URL logo 1 et 2 |
| Vue d'ensemble : nom, poste, structure | vignette ; compteurs agents/postes par structure |
| Zoom, déplacement, plier/déplier | souris, boutons Tout déplier / Tout replier / Ajuster, « sous-niveaux affichés » (0 à 4, tous) |
| Isoler une branche | fiche → « Afficher cette branche seule » |
| Positionnement d'un agent (N+1, collègues, subordonnés) | fiche agent (clic ou Entrée sur la vignette) |
| Photos | colonne photo (initiales si absente) |
| Recherche sur tous les attributs | champ de recherche (accents ignorés, plusieurs mots = ET) |
| Exports | CSV modifiable (Excel) et PDF paysage, par structure avec 1 à 4 sous-niveaux ou tous |
| Poste vacant | vignette en pointillés « Poste vacant » |
| Lexique | Configuration → texte affiché par le bouton « Lexique » |
| RGAA (bases) | navigation clavier, étiquettes, dialogues natifs, annonces des résultats, contrastes |

## Hors périmètre du widget (à traiter dans Grist ou ailleurs)
- **Profils et visibilité des champs** : à régler par les règles d'accès Grist (colonnes masquées par profil) ; une colonne masquée n'est tout simplement pas affichée.
- **Mode draft / workflow de validation / versioning** : tables ou vues Grist dédiées ; le widget reconnaît la colonne `statut`.
- **Authentification SSO, supervision, actualisation BOA/ASTRE, PWA, exports PPT/DOCX/XLSX natifs** : plateforme et intégrations.
- Un filtre posé sur le widget peut rendre des agents orphelins : un message explicite est alors affiché.

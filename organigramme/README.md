# Organigramme (widget Grist) — v3

Widget d'organigramme alimenté par une table Grist (une ligne = un poste occupé par un agent ; nom vide = poste vacant).
Fichiers : `index.html` + `api.js` (`popup.html` n'est plus nécessaire : la fiche agent est un panneau latéral intégré).
Librairies : d3 v7, d3-flextree 2.1.2, d3-org-chart 3.0.1.

## Mise en place avec la table « Agents »
1. Colonne `ParentID` (formule) : id de ligne du N+1. Exemple, à adapter aux identifiants de colonnes réels :
   ```python
   n1 = Agents.lookupOne(NOM_Prenom=$Nplus1)
   return n1.id if n1 else None
   ```
   Un seul agent doit avoir `ParentID` vide (le N°1). Un N+1 inconnu ou en doublon (homonymes) rend `ParentID` incorrect : le widget affiche alors un message précis.
2. Ajouter un widget personnalisé (URL personnalisée) lié à la table et publier ce dossier.
3. Associer les colonnes :

| Champ du widget | Colonne de la table |
|---|---|
| Identifiant du N+1 (obligatoire) | `ParentID` |
| Nom de l'agent (obligatoire) | `NOM Prenom` |
| Libellé du poste | `Fonction` |
| Direction générale / Direction / Pôle / Service / Équipe | colonnes du même nom |
| URL de la photo | `Photo` (texte, URL http(s) directe vers l'image) |
| Collectivité, type de poste, statut, SORH | si elles existent |
| Métier, site, mail, téléphone, Teams, champs RH | si elles existent (fiche agent) |

## Fonctionnalités
- **Vignette** : photo (initiales sinon), nom, poste, structure la plus précise (équipe > service > pôle > direction), compteurs agents / postes. Poste vacant en pointillés ; statut « travail préparatoire / brouillon / draft » en pointillés bleus.
- **Couleurs** : par niveau hiérarchique, collectivité, type de poste, pôle, service, ou unique ; légende automatique.
- **Fiche agent** (clic ou Entrée sur la vignette, Échap ou ✖ pour fermer) : rattachement, informations individuelles et RH, N+1, collègues, subordonnés (cliquables), chemin jusqu'au N°1, branche seule, export de la structure.
- **Navigation** : zoom et déplacement à la souris, sous-niveaux affichés (0 à 4, tous), tout déplier / replier, ajuster, retour à l'organigramme complet.
- **Recherche** (raccourci `/`) sur tous les attributs associés, sans accents, plusieurs mots = ET ; résultats annoncés.
- **Exports** par structure, 1 à 4 sous-niveaux ou tous : CSV modifiable (Excel) et PDF paysage (impression navigateur).
- **Configuration (⚙)** : titre, couleur par défaut, 2 logos (URL), lexique des règles de gestion. Enregistrer le widget Grist après modification.
- **Interface** : responsive, thème clair / sombre automatique, navigation clavier, dialogues natifs (bases RGAA, sans audit).

## Hors périmètre du widget
Profils et visibilité par champ (règles d'accès Grist : une colonne masquée n'est ni affichée ni exportée), mode draft / workflow / versioning (tables ou vues Grist ; le widget reconnaît la colonne `statut`), SSO, supervision, synchronisation BOA/ASTRE, PWA, exports PPT/DOCX/XLSX natifs.

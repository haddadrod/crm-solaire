// Scanner Drive — utilitaire one-shot
//
// Objectif : lister tous les PDFs d'un dossier Drive (et sous-dossiers)
// pour pouvoir matcher chaque facture à un dossier CRM côté serveur.
//
// Mode d'emploi (à répéter une fois par société : Yolico, Elsun) :
//   1. https://script.google.com → "Nouveau projet"
//   2. Coller TOUT ce fichier dans Code.gs (remplace ce qu'il y avait)
//   3. Mettre l'ID du dossier Drive dans ROOT_FOLDER_ID ci-dessous
//      (l'ID = la partie après /folders/ dans l'URL du Drive)
//   4. Choisir la fonction `scanDriveFolder` dans le menu déroulant
//      en haut, puis cliquer ▶ Exécuter.
//   5. Autoriser l'accès à ton Drive (script perso → "Avancé" → autoriser)
//   6. Quand c'est fini, regarder les Logs : tu verras
//      "Scanné N fichiers. Sauvegardé dans drive-scan-XXX.json"
//   7. Ce fichier JSON est dans la racine de ton Drive perso. Télécharge-le
//      et envoie-le-moi (ou copie-colle le contenu).
//
// Le script ne modifie rien dans le Drive, il lit seulement.

// 👇 ID du dossier Drive à scanner. Pour ELS :
var ROOT_FOLDER_ID = '1sXipHhwhhnhKcOx6gAsLWFWl2JBr2SA1';

// 👇 Préfixe du fichier JSON sortie. Mets 'elsun' pour ELS, 'yolico' pour Yolico.
var SOCIETE_LABEL = 'elsun';

function scanDriveFolder() {
  var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var result = [];
  walkFolder_(root, '', result);

  var json = JSON.stringify(result, null, 2);
  var ts = Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd_HH-mm');
  var filename = 'drive-scan-' + SOCIETE_LABEL + '-' + ts + '.json';
  var out = DriveApp.createFile(filename, json, MimeType.PLAIN_TEXT);

  Logger.log('✅ Scanné %s fichiers/objets.', result.length);
  Logger.log('📄 Fichier JSON créé : "%s"', filename);
  Logger.log('🔗 URL : %s', out.getUrl());
  Logger.log('Dans la racine de ton Drive perso. Télécharge-le et envoie-le-moi.');
}

// Récursif : parcourt fichiers + sous-dossiers, garde un chemin lisible.
function walkFolder_(folder, parentPath, result) {
  var folderName = folder.getName();
  var currentPath = parentPath ? parentPath + ' / ' + folderName : folderName;

  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    try {
      result.push({
        name: f.getName(),
        id: f.getId(),
        url: f.getUrl(),
        path: currentPath,
        mimeType: f.getMimeType(),
        sizeBytes: f.getSize(),
        modifiedAt: f.getLastUpdated().toISOString(),
      });
    } catch (e) {
      // Sécurité : un fichier inaccessible (permissions) ne casse pas le scan
      result.push({ name: '(inaccessible)', error: String(e), path: currentPath });
    }
  }

  var subs = folder.getFolders();
  while (subs.hasNext()) {
    walkFolder_(subs.next(), currentPath, result);
  }
}

// (Optionnel) Affiche les 20 premiers fichiers dans les Logs sans rien créer.
// Pratique pour vérifier vite fait que ça marche.
function previewPremierFichiers() {
  var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var preview = [];
  walkFolder_(root, '', preview);
  Logger.log('Total: %s fichiers/objets dans %s', preview.length, root.getName());
  Logger.log('—— 20 premiers ——');
  preview.slice(0, 20).forEach(function (f, i) {
    Logger.log('%s. [%s] %s', i + 1, f.path, f.name);
  });
}

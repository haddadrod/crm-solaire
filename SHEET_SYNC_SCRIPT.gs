/* =====================================================================
 *  SYNC SHEET → CRM SOLAIRE
 * =====================================================================
 *  À coller dans le Google Apps Script de CHAQUE sheet (Yolico et Elsun).
 *
 *  Comment ça marche :
 *  1. Tu modifies une cellule dans le sheet
 *  2. onEdit s'active automatiquement
 *  3. La ligne entière est relue et envoyée à l'API /api/sheet-sync du CRM
 *  4. Le CRM met à jour le dossier correspondant (matché par colonne B = id)
 *
 *  Avant la 1re utilisation :
 *  - Renseigner les 3 Script Properties (cf SHEET_SYNC_GUIDE.md) :
 *      CRM_URL      → ex: https://crm-solaire.vercel.app
 *      CRM_SECRET   → même valeur que SHEET_SYNC_SECRET côté Vercel
 *      SHEET_SOCIETE → 'yolico' ou 'elsun' (selon le sheet où le script est installé)
 *  - Autoriser le script (1re exécution → bouton "Réviser les autorisations")
 *  - Activer le déclencheur onEdit installable (cf installerDeclencheurs)
 * ===================================================================== */

// ── 1. Configuration ────────────────────────────────────────────────────

// Onglet "DOSSIERS" — adapter si ton onglet a un autre nom
var FEUILLE_DOSSIERS = 'TABLEAU INSTA';

// Si on touche une ligne au-dessus de cette ligne, on ignore (entêtes / récap).
var PREMIERE_LIGNE_DOSSIER = 2;

// Mapping colonne-lettre → champ CRM. Aligné sur le parseur Python (validé
// avec Rodney lors de la session d'import). Toute colonne absente de cette
// map est ignorée par la sync — on ne pousse QUE ce qui est mappé.
var MAPPING = {
  B: { field: 'id',             type: 'text'   }, // numéro dossier (clé de matching)
  C: { field: 'dateInsta',      type: 'date'   },
  C2: { field: 'datePoseTerminee', type: 'date', sourceCol: 'C' }, // dupliqué à l'import — la sync garde dateInsta == datePoseTerminee tant que les 2 ne divergent pas côté CRM
  D: { field: 'accordDef',      type: 'bool'   }, // TRUE = accord CONSUEL → on dérive statutConsuel='accepté' + consuel=true
  E: { field: 'consuel',        type: 'bool'   }, // TRUE = envoyé Consuel
  F: { field: 'statut',         type: 'statut' }, // ex: "W DOSSIER PAYER" → 'W_DOSSIER_PAYER'
  H: { field: 'nom',            type: 'text'   },
  I: { field: 'prenom',         type: 'text'   },
  K: { field: 'financement',    type: 'fin'    }, // SOFINCO, PROJEXIO, COMPTANT…
  L: { field: 'montantTotal',   type: 'number' }, // TTC
  N: { field: 'montantHtCustom', type: 'numberStr' }, // HT en chaîne
  O: { field: 'payeClientDate', type: 'date'   },
  R: { field: 'payeClient',     type: 'bool'   }, // PAYER TRUE/FALSE
  S: { field: 'puissance',      type: 'int'    }, // Wc
};

// Mapping statut col F → id CRM (mêmes que le parseur).
var STATUT_NORM = {
  'W DOSSIER PAYER':        'W_DOSSIER_PAYER',
  'F ATTENTE DE DEBLOCAGE': 'F_ATTENTE_DEBLOCAGE',
  'C LITIGE':               'C_LITIGE',
  'D SAV':                  'D_SAV',
  'W2 ANNULER':             'W2_ANNULER',
  'G ATTENTE ACCORD DEF':   'G_ATTENTE_ACCORD_DEF',
  'Z DEPLACEMENT':          'Z_DEPLACEMENT',
  'W1 DEPOSER':             'W1_DEPOSER',
  'CONFORMITE CONTRAT':     'CONFORMITE_CONTRAT',
  'F1 ACCEPTÉ':             'F1_ACCEPTE',
  'F3 MANQUE RECEP':        'F3_MANQUE_RECEP',
  'F2 PRÉFINANCEMENT':      'F2_PREFINANCEMENT',
  'M ATT DOSSIER':          'M_ATT_DOSSIER',
  'H NRP CQ LIVRAISON':     'H_NRP_CQ_LIVRAISON',
  'K ATTENTE CONSUEL':      'K_ATTENTE_CONSUEL',
  'J VISITE CONSUEL':       'J_VISITE_CONSUEL',
  'E PASSE COMPTANT':       'E_PASSE_COMPTANT',
};

var FIN_NORM = {
  'PROJEXIO': 'PROJEXIO', 'SOFINCO': 'SOFINCO', 'DOMOFINANCE': 'DOMOFINANCE',
  'COMPTANT': 'COMPTANT', 'CETELEM': 'CETELEM', 'FINANCO': 'FINANCO',
  'FRANFINANCE': 'FRANFINANCE',
};

// ── 2. Trigger principal — appelé à CHAQUE modif de cellule ─────────────

function onEditInstallable(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    if (sheet.getName() !== FEUILLE_DOSSIERS) return;

    var row = e.range.getRow();
    if (row < PREMIERE_LIGNE_DOSSIER) return; // entête / récap

    // ⏱ Debounce naïf : si plusieurs cellules sont modifiées dans la même
    // seconde sur la même ligne (paste, formule en cascade), on n'envoie
    // qu'une seule fois. Stocké dans CacheService.
    var cache = CacheService.getScriptCache();
    var cacheKey = 'lastsync:' + sheet.getName() + ':' + row;
    var last = cache.get(cacheKey);
    if (last && Date.now() - Number(last) < 2000) return;
    cache.put(cacheKey, String(Date.now()), 10);

    syncRow_(sheet, row);
  } catch (err) {
    Logger.log('[sheet-sync] onEdit error: ' + err);
  }
}

// ── 3. Lecture + envoi d'une ligne ──────────────────────────────────────

function syncRow_(sheet, row) {
  var props = PropertiesService.getScriptProperties();
  var crmUrl = props.getProperty('CRM_URL');
  var crmSecret = props.getProperty('CRM_SECRET');
  var societe = (props.getProperty('SHEET_SOCIETE') || '').toLowerCase();

  if (!crmUrl || !crmSecret || !societe) {
    Logger.log('[sheet-sync] Configuration manquante (CRM_URL / CRM_SECRET / SHEET_SOCIETE)');
    return;
  }

  // Lit la ligne entière jusqu'à la dernière colonne mappée connue.
  var lastCol = sheet.getLastColumn();
  if (lastCol < 19) return; // pas assez de colonnes pour avoir un id (B)
  var rowValues = sheet.getRange(row, 1, 1, lastCol).getDisplayValues()[0];
  // getValues() pour les booléens et nombres (getDisplayValues les renvoie "TRUE"/"FALSE")
  var rowRaw = sheet.getRange(row, 1, 1, lastCol).getValues()[0];

  var dossierId = (rowValues[1] || '').toString().trim(); // colonne B (index 1)
  if (!dossierId) return; // ligne vide / pas un dossier

  var fields = {};
  for (var key in MAPPING) {
    var def = MAPPING[key];
    if (key === 'B') continue; // id sert de clé, pas de champ
    var colIdx = (def.sourceCol ? letterToIndex_(def.sourceCol) : letterToIndex_(key));
    if (colIdx >= lastCol) continue;
    var disp = rowValues[colIdx];
    var raw = rowRaw[colIdx];
    var value = convertValue_(disp, raw, def.type);
    if (value === undefined) continue;
    fields[def.field] = value;
  }

  // Dérive 'consuel' + 'statutConsuel' depuis col D et E si présentes.
  if (typeof fields.accordDef === 'boolean') {
    // Col D = "ACCORD DEF" — chez Rodney c'est en fait l'accord CONSUEL reçu.
    // (cf session de mapping : D = consuel accepté, E = consuel envoyé)
    fields.consuel = fields.accordDef || fields.consuel || false;
    fields.statutConsuel = fields.accordDef ? 'accepté' : (fields.consuel ? '' : '');
    // L'accord financeur n'est pas dans le sheet → on ne pousse PAS accordDef vers le CRM
    delete fields.accordDef;
  } else if (typeof fields.consuel === 'boolean' && fields.consuel) {
    fields.statutConsuel = ''; // envoyé mais pas accepté
  }

  // Produits : si on a une puissance, on (re)génère un produit PANNEAU_SOLAIRE.
  if (typeof fields.puissance === 'number' && fields.puissance > 0) {
    fields.produits = [{
      type: 'PANNEAU_SOLAIRE', variantId: '',
      puissance: fields.puissance, description: '', quantite: 1
    }];
  }

  var payload = {
    id: dossierId,
    societe: societe,
    fields: fields,
  };

  var endpoint = crmUrl.replace(/\/$/, '') + '/api/sheet-sync';
  var resp;
  try {
    resp = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + crmSecret },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
  } catch (err) {
    Logger.log('[sheet-sync] fetch error: ' + err);
    return;
  }

  var code = resp.getResponseCode();
  if (code >= 200 && code < 300) {
    Logger.log('[sheet-sync] OK row=' + row + ' id=' + dossierId + ' code=' + code + ' applied=' + (function(){
      try { return JSON.parse(resp.getContentText()).applied; } catch(e){ return '?'; }
    })());
  } else {
    Logger.log('[sheet-sync] FAIL row=' + row + ' id=' + dossierId + ' code=' + code + ' body=' + resp.getContentText());
  }
}

// ── 4. Utils ────────────────────────────────────────────────────────────

function letterToIndex_(letter) {
  var s = letter.toUpperCase();
  var n = 0;
  for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n - 1; // 0-indexed
}

function convertValue_(display, raw, type) {
  var d = (display == null ? '' : String(display)).trim();
  if (type === 'bool') {
    // Apps Script renvoie déjà true/false pour les cases à cocher.
    if (typeof raw === 'boolean') return raw;
    if (d === '') return false;
    return /^(true|vrai|oui|1)$/i.test(d);
  }
  if (type === 'text') return d;
  if (type === 'date') {
    // Format attendu côté CRM : 'YYYY-MM-DD'
    if (raw instanceof Date && !isNaN(raw.getTime())) return Utilities.formatDate(raw, 'Europe/Paris', 'yyyy-MM-dd');
    if (!d) return '';
    var m = d.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return m[3] + '-' + pad_(m[2]) + '-' + pad_(m[1]);
    return '';
  }
  if (type === 'number') {
    var n = parseFloat(String(raw || d).replace(/[^\d.,-]/g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }
  if (type === 'numberStr') {
    var n2 = parseFloat(String(raw || d).replace(/[^\d.,-]/g, '').replace(',', '.'));
    return isNaN(n2) ? '' : String(n2);
  }
  if (type === 'int') {
    if (/[a-z]/i.test(d)) return 0; // ex: "PAC" → 0
    var digits = d.replace(/[^\d]/g, '');
    return digits ? parseInt(digits, 10) : 0;
  }
  if (type === 'statut') {
    var key = d.toUpperCase();
    return STATUT_NORM[key] || ''; // statut inconnu → on n'écrase pas côté CRM
  }
  if (type === 'fin') {
    var k = d.toUpperCase();
    return FIN_NORM[k] || k || '';
  }
  return d;
}

function pad_(n) { return ('0' + Number(n)).slice(-2); }

// ── 5. Setup — à exécuter UNE FOIS, depuis le menu Apps Script ──────────

/**
 * Installe le trigger onEditInstallable. À exécuter UNE SEULE FOIS depuis
 * l'éditeur Apps Script (menu "Exécuter" → "installerDeclencheurs").
 *
 * Pourquoi un trigger installable ? Le onEdit simple (sans installation)
 * ne peut PAS appeler UrlFetchApp pour des raisons de sécurité Google.
 * L'installable, lui, tourne en arrière-plan avec les droits du créateur.
 */
function installerDeclencheurs() {
  // Supprime les anciens triggers pour éviter les doublons.
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onEditInstallable') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('onEditInstallable')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();
  Logger.log('Trigger onEditInstallable installé ✅');
}

/**
 * Sync manuelle d'une ligne. Utile pour tester :
 * 1. Ouvrir l'éditeur Apps Script.
 * 2. Modifier le numéro de ligne ci-dessous.
 * 3. Lancer la fonction "testSyncRowManuel".
 * 4. Vérifier les Logs (menu "Affichage" → "Journaux").
 */
function testSyncRowManuel() {
  var ROW_A_TESTER = 2;
  var sheet = SpreadsheetApp.getActive().getSheetByName(FEUILLE_DOSSIERS);
  if (!sheet) {
    Logger.log('Feuille "' + FEUILLE_DOSSIERS + '" introuvable.');
    return;
  }
  syncRow_(sheet, ROW_A_TESTER);
}

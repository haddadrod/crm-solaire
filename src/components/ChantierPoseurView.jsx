import { useState, useEffect, useRef } from 'react';

// Page publique ouverte par le poseur depuis le lien envoyé dans le message
// WhatsApp/email. Pas d'authentification : le token dans l'URL fait foi.
// Affiche les infos du chantier en lecture seule + permet d'envoyer des
// photos depuis le téléphone (camera ou galerie).

const PRODUITS_LABELS = {
  PANNEAU_SOLAIRE: { emoji: '☀️', label: 'Panneaux solaires' },
  PERGOLA: { emoji: '🏡', label: 'Pergola' },
  POMPE_A_CHALEUR: { emoji: '🌡️', label: 'Pompe à chaleur' },
  CLIMATISATION: { emoji: '❄️', label: 'Climatisation' },
  BALLON_THERMO: { emoji: '🚿', label: 'Ballon thermodynamique' },
  BATTERIE: { emoji: '🔋', label: 'Batterie de stockage' },
  ISOLATION: { emoji: '🏠', label: 'Isolation' },
  VMC: { emoji: '💨', label: 'VMC' },
  AUTRE: { emoji: '🔨', label: 'Autre rénovation' },
};

const TYPES_TOIT_LABELS = {
  tuile_meca: 'Tuile mécanique', tuile_canal: 'Tuile canal', tuile_plate: 'Tuile plate',
  ardoise: 'Ardoise', bac_acier: 'Bac acier', fibrociment: 'Fibrociment',
  toit_plat: 'Toit plat', shingle: 'Shingle', autre: 'Autre',
};

const ORIENTATIONS_LABELS = { paysage: 'Paysage', portrait: 'Portrait', les_deux: 'Les deux' };

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return iso; }
}

// Redimensionne une image avant upload pour rester sous la limite Vercel.
function resizeImage(file, maxWidth = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ratio = Math.min(1, maxWidth / img.width);
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/jpeg', quality);
    };
    img.onerror = () => reject(new Error('Impossible de lire l\'image'));
    img.src = URL.createObjectURL(file);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Lecture impossible'));
    r.readAsDataURL(blob);
  });
}

export default function ChantierPoseurView({ token }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  const fetchInfo = async () => {
    try {
      const r = await fetch(`/api/chantier?token=${encodeURIComponent(token)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Erreur');
      setInfo(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInfo(); }, [token]);

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    setUploadProgress({ done: 0, total: files.length });
    let latestPhotos = info?.photosChantier || [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const blob = await resizeImage(file, 1600, 0.85);
        const dataUrl = await blobToDataUrl(blob);
        const r = await fetch(`/api/chantier?token=${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name || `photo-${Date.now()}.jpg`, dataUrl }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Upload échoué');
        latestPhotos = data.photosChantier || latestPhotos;
        setInfo(prev => ({ ...prev, photosChantier: latestPhotos }));
      } catch (e) {
        setUploadError(`${file.name || 'Photo'} : ${e.message}`);
      }
      setUploadProgress({ done: i + 1, total: files.length });
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50 px-4">
        <div className="text-center">
          <div className="text-5xl mb-3 animate-pulse">🔧</div>
          <div className="text-sm font-semibold text-slate-600">Chargement du chantier...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 to-red-50 px-4">
        <div className="bg-white rounded-2xl shadow-lg border border-rose-200 p-6 max-w-md w-full text-center">
          <div className="text-5xl mb-3">❌</div>
          <h1 className="text-lg font-bold text-rose-700 mb-1">Lien invalide</h1>
          <p className="text-sm text-slate-600">{error}</p>
          <p className="text-xs text-slate-400 mt-3">Vérifie le lien reçu dans le message ou contacte la régie.</p>
        </div>
      </div>
    );
  }

  const fullName = `${(info.nom || '').toUpperCase()} ${info.prenom || ''}`.trim();
  const fullAddress = [info.adresse, info.codePostal, info.ville].filter(Boolean).join(', ');
  const toitLabel = TYPES_TOIT_LABELS[info.typeToit] || null;
  const orientLabel = ORIENTATIONS_LABELS[info.orientationPanneaux] || null;
  const photos = info.photosChantier || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 pb-12">
      {/* HEADER */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="text-xs font-bold uppercase tracking-widest opacity-80">🔧 Chantier à poser</div>
          <h1 className="text-2xl font-bold mt-1 break-words">{fullName || '(sans nom)'}</h1>
          {info.dateInsta && (
            <div className="mt-2 inline-flex items-center gap-1.5 bg-white/20 backdrop-blur px-3 py-1 rounded-lg text-sm font-semibold">
              📅 {formatDate(info.dateInsta)}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 mt-4 space-y-3">
        {/* ADRESSE & CONTACT */}
        <div className="bg-white rounded-2xl shadow-md border border-amber-200 p-4">
          <h2 className="text-[11px] font-bold text-amber-700 uppercase mb-2 tracking-wide">📍 Lieu &amp; contact</h2>
          {fullAddress && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-2 text-sm font-semibold text-slate-800 hover:text-violet-600 break-words"
            >
              <span className="text-lg leading-none">📍</span>
              <span className="underline decoration-dotted">{fullAddress}</span>
            </a>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            {info.telephone && (
              <a href={`tel:${info.telephone}`} className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm px-3 py-2 rounded-xl shadow-sm">
                📞 Appeler
              </a>
            )}
            {info.telephone && (
              <a href={`https://wa.me/${info.telephone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-600 text-white font-bold text-sm px-3 py-2 rounded-xl shadow-sm">
                💬 WhatsApp
              </a>
            )}
            {fullAddress && (
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress)}`} target="_blank" rel="noreferrer" className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm px-3 py-2 rounded-xl shadow-sm">
                🧭 Itinéraire
              </a>
            )}
          </div>
        </div>

        {/* MATERIEL */}
        {info.produits && info.produits.length > 0 && (
          <div className="bg-white rounded-2xl shadow-md border border-amber-200 p-4">
            <h2 className="text-[11px] font-bold text-amber-700 uppercase mb-2 tracking-wide">📦 Matériel à installer</h2>
            <ul className="space-y-1.5">
              {info.produits.filter(p => p && p.type).map((p, i) => {
                const meta = PRODUITS_LABELS[p.type] || { emoji: '📦', label: p.type };
                const qty = p.quantite || 1;
                const qtyPrefix = p.type === 'PANNEAU_SOLAIRE'
                  ? ''
                  : p.type === 'ISOLATION'
                    ? `${qty} m² `
                    : (qty > 1 ? `${qty}× ` : '');
                const sizing = p.type === 'PANNEAU_SOLAIRE' && p.puissance ? ` — ${p.puissance} Wc` : '';
                return (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-800">
                    <span className="text-lg">{meta.emoji}</span>
                    <span className="flex-1">
                      <strong>{qtyPrefix}{meta.label}</strong>{sizing}
                      {p.description && <span className="text-slate-500"> — {p.description}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
            {(toitLabel || orientLabel) && (
              <div className="mt-3 pt-3 border-t border-amber-100 grid grid-cols-2 gap-2 text-xs">
                {toitLabel && <div><span className="text-slate-500">🏠 Toit :</span> <strong>{toitLabel}</strong></div>}
                {orientLabel && <div><span className="text-slate-500">📐 Orientation :</span> <strong>{orientLabel}</strong></div>}
              </div>
            )}
          </div>
        )}

        {/* INSTRUCTIONS */}
        {info.instructionsPose && (
          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-2xl shadow-md p-4">
            <h2 className="text-[11px] font-bold text-yellow-800 uppercase mb-2 tracking-wide">🛠️ Instructions</h2>
            <p className="text-sm text-yellow-900 whitespace-pre-wrap leading-relaxed">{info.instructionsPose}</p>
          </div>
        )}

        {/* PHOTOS */}
        <div className="bg-white rounded-2xl shadow-md border border-violet-200 p-4">
          <h2 className="text-[11px] font-bold text-violet-700 uppercase mb-2 tracking-wide">📸 Photos du chantier</h2>
          <p className="text-xs text-slate-500 mb-3">
            Prends des photos avant, pendant et après la pose. Elles arrivent directement dans le CRM.
          </p>

          <div className="flex flex-col gap-2">
            <label className="cursor-pointer inline-flex items-center justify-center gap-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white font-bold text-base px-4 py-3 rounded-xl shadow-md">
              📷 Prendre une photo
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
                disabled={uploading}
              />
            </label>
            <label className="cursor-pointer inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm px-4 py-2.5 rounded-xl">
              🖼️ Choisir depuis la galerie
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
                disabled={uploading}
              />
            </label>
          </div>

          {uploading && (
            <div className="mt-3 bg-violet-50 border border-violet-200 rounded-xl p-3 text-center">
              <div className="text-2xl mb-1 animate-pulse">📤</div>
              <div className="text-xs font-bold text-violet-700">
                Envoi {uploadProgress.done}/{uploadProgress.total}…
              </div>
            </div>
          )}
          {uploadError && (
            <div className="mt-3 bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-700">
              ❌ {uploadError}
            </div>
          )}

          {photos.length > 0 && (
            <div className="mt-4">
              <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">
                {photos.length} photo{photos.length > 1 ? 's' : ''} envoyée{photos.length > 1 ? 's' : ''}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((p, i) => (
                  <div key={i} className="aspect-square rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-xs text-slate-500 overflow-hidden relative">
                    <span className="text-2xl">📷</span>
                    <span className="absolute bottom-1 right-1 bg-white/80 text-[9px] font-bold px-1 rounded">
                      {new Date(p.uploadedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="text-center text-[11px] text-slate-400 italic mt-4">
          Lien sécurisé — ne le partage pas. ☀️ CRM Solaire
        </div>
      </div>
    </div>
  );
}

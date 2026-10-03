// Odysseus — classement en ligne (Supabase, table public.players).
// Chaque joueur est identifié par un identifiant aléatoire gardé sur son téléphone et un simple pseudo :
// pas de compte, pas d'e-mail. On publie seulement pseudo, niveau, XP et étoiles.
// Clé « publishable » : publique par nature (lecture et écriture limitées par les règles de la table).
(function () {
  'use strict';
  const C = window.Carnet;
  const URL = 'https://nnnotnqjolgnwuatjrlx.supabase.co/rest/v1/players';
  const KEY = 'sb_publishable_VQKf1isY0MH5LCf4n7cTUw_HaILMqBW';
  const HEAD = { apikey: KEY, 'Content-Type': 'application/json' };

  // identifiant du joueur : tiré une fois, gardé dans la sauvegarde
  function playerId() {
    const P = (C.store.profile = C.store.profile || {});
    if (!P.id) {
      P.id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
      C.save();
    }
    return P.id;
  }
  const clean = (s) => String(s || 'Ulysse').replace(/[<>]/g, '').trim().slice(0, 20) || 'Ulysse';

  // envoie (ou met à jour) la ligne du joueur ; silencieux hors ligne
  async function push(stats) {
    try {
      const row = { id: playerId(), name: clean(stats.name), level: stats.level | 0, xp: stats.xp | 0, stars: stats.stars | 0, updated_at: new Date().toISOString() };
      const r = await fetch(URL + '?on_conflict=id', {
        method: 'POST', headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, HEAD), body: JSON.stringify(row)
      });
      return r.ok;
    } catch (e) { return false; }
  }

  // les meilleurs joueurs, puis le rang du joueur (nombre de joueurs devant lui + 1)
  async function top(limit) {
    const r = await fetch(URL + '?select=id,name,level,xp,stars&order=level.desc,xp.desc&limit=' + (limit || 50), { headers: HEAD });
    if (!r.ok) throw new Error('classement indisponible');
    return r.json();
  }
  async function myRank(stats) {
    const lv = stats.level | 0, xp = stats.xp | 0;
    const q = URL + '?select=id&or=(level.gt.' + lv + ',and(level.eq.' + lv + ',xp.gt.' + xp + '))';
    const r = await fetch(q, { headers: Object.assign({ Prefer: 'count=exact', Range: '0-0' }, HEAD) });
    if (!r.ok) return null;
    const range = r.headers.get('content-range') || '';
    const total = +(range.split('/')[1] || 0);
    return total + 1;
  }

  C.rank = { playerId, push, top, myRank };
})();

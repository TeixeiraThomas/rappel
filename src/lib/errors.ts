/** Transforme une erreur technique en message français compréhensible. */
export function friendlyError(e: unknown): string {
  const err = e as { name?: string; message?: string; inner?: { name?: string } }
  const name = err?.name ?? err?.inner?.name ?? ''
  const msg = err?.message ?? ''
  if (name === 'QuotaExceededError' || /quota/i.test(msg)) {
    return "Espace de stockage insuffisant sur cet appareil. Libérez de la place ou supprimez des images, puis réessayez."
  }
  if (name === 'DatabaseClosedError' || name === 'OpenFailedError' || /IndexedDB/i.test(msg)) {
    return "Le stockage local n'est pas disponible (navigation privée ou accès bloqué ?). Vos données ne peuvent pas être enregistrées."
  }
  if (name === 'VersionError') {
    return "Les données locales viennent d'une version plus récente de l'application. Rechargez la page pour la mettre à jour."
  }
  if (name === 'AbortError') return "L'opération a été interrompue. Réessayez."
  // Les erreurs métier (validation…) sont déjà rédigées en français.
  return msg || 'Une erreur inattendue est survenue.'
}

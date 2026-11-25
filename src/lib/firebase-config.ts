// Configuration publique de l'application web Firebase (projet « rappel-9f76b »).
//
// Ces valeurs ne sont PAS secrètes : elles sont envoyées à chaque navigateur qui ouvre l'app.
// La sécurité repose sur les règles Firestore (chaque compte n'accède qu'à ses propres données)
// et sur l'authentification Firebase.
//
// À COMPLÉTER : console Firebase > Paramètres du projet > Vos applications > « Rappel web »
// > Configuration du SDK > copiez l'objet firebaseConfig et remplacez celui-ci.
export const firebaseConfig = {
  apiKey: '',
  authDomain: 'rappel-9f76b.firebaseapp.com',
  projectId: 'rappel-9f76b',
  storageBucket: 'rappel-9f76b.firebasestorage.app',
  messagingSenderId: '50906154109',
  appId: '',
}

/** Vrai quand la configuration a été renseignée : la section « Compte » s'affiche alors. */
export function isCloudConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.appId)
}

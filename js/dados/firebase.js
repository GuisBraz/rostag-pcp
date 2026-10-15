/* ---------------------------------------------------------------------------
   Configuração do Firebase (projeto rostag-pcp).
   Estes valores são públicos por natureza — a segurança está nas regras do
   Firestore (firestore.rules) e no login, não em esconder a chave.
--------------------------------------------------------------------------- */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAUKnkhW9ImeJulQ11jpIDkDEgQ_2wJU_E',
  authDomain: 'rostag-pcp.firebaseapp.com',
  projectId: 'rostag-pcp',
  storageBucket: 'rostag-pcp.firebasestorage.app',
  messagingSenderId: '80716963344',
  appId: '1:80716963344:web:d1cb2e4947023cd2dbf495'
};

// O SDK (compat) vem por <script> do gstatic e expõe o global `firebase`.
export const FIREBASE_PRONTO = typeof window !== 'undefined' && typeof window.firebase !== 'undefined';

let iniciado = false;
export function iniciarFirebase() {
  if (!FIREBASE_PRONTO || iniciado) return;
  iniciado = true;
  window.firebase.initializeApp(FIREBASE_CONFIG);
  // Cache local do Firestore: o app instalado abre e mostra os dados mesmo
  // sem internet, e as gravações feitas offline sobem quando a rede volta.
  window.firebase.firestore().enablePersistence({ synchronizeTabs: true }).catch(function (e) {
    console.info('Cache offline do Firestore indisponível:', e && e.code);
  });
}

export function db() { return window.firebase.firestore(); }
export function auth() { return window.firebase.auth(); }
export function apagarCampo() { return window.firebase.firestore.FieldValue.delete(); }
export function horaDoServidor() { return window.firebase.firestore.FieldValue.serverTimestamp(); }

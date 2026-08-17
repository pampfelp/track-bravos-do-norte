// Inicialização do Firebase — via CDN (ESM), sem bundler, mantendo o padrão
// de "sem etapa de build".
//
// Só usa Firestore. Fotos de atividades/ensinamentos NÃO passam pelo
// Firebase Storage (exige o plano pago Blaze) — vão pro Google Drive via um
// Apps Script mínimo (veja Code.gs).
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  connectFirestoreEmulator
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

// TROQUE pela config do SEU projeto (Firebase Console > Configurações do
// projeto > seus apps > app Web > "Config"). Essas chaves são públicas por
// design no Firebase Web — a segurança vem das regras (firestore.rules),
// não de esconder essa config.
const firebaseConfig = {
  apiKey: "AIzaSyABcCDYG0xWbMEYEN0Kvzk8mx7DUJO5GvQ",
  authDomain: "app-legendarios-834b3.firebaseapp.com",
  projectId: "app-legendarios-834b3",
  storageBucket: "app-legendarios-834b3.firebasestorage.app",
  messagingSenderId: "487658333430",
  appId: "1:487658333430:web:85858519d247c7d81a38d7"
};

export const firebaseApp = initializeApp(firebaseConfig);

// Cache local persistente (IndexedDB): marcar itens, registrar atividades e
// anotar ensinamentos funciona mesmo sem sinal no mato — fica guardado no
// aparelho e sincroniza sozinho com o Firestore assim que a internet
// voltar. Sem isso, o app pararia de funcionar em qualquer tela sem rede.
export const db = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() })
});

// Por padrão, sempre conecta no projeto Firestore REAL (mesmo testando
// local ou pela hospedagem) — assim dá pra testar sem precisar rodar
// nenhum emulador. Só usa o emulador local se a página abrir com
// "?emulator=1" na URL (ex: http://localhost:8000/?emulator=1).
if (new URLSearchParams(location.search).has("emulator")) {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  console.log("[firebase] usando emulador local do Firestore (:8080)");
}

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDHzNqv4dRHZtdECMGc2uxp0YoU95qh1TI",
  authDomain: "comedor-escolar-2025.firebaseapp.com",
  projectId: "comedor-escolar-2025",
  storageBucket: "comedor-escolar-2025.firebasestorage.app",
  messagingSenderId: "636168746154",
  appId: "1:636168746154:web:c21d9437d97a76579d4cd3",
  measurementId: "G-80L3QFZMD0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export { auth };
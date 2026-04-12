import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCEtOJ9MLg93LAFcDF0VclfZo6ZA3BzYCs",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "profit-tracker-50268.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://profit-tracker-50268-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "profit-tracker-50268",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "profit-tracker-50268.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "698048472105",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:698048472105:web:f7999bdcf315d7dc5aa838"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

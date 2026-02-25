import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBBdDUApJ07UHuucOwXOjguwRDWK7JzPFc",
  authDomain: "cabinlog.firebaseapp.com",
  projectId: "cabinlog",
  storageBucket: "cabinlog.firebasestorage.app",
  messagingSenderId: "951293610076",
  appId: "1:951293610076:web:aef4ed3beb25f86121be99"
};

// Initialize Firebase
let app;
let db;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  console.log("✅ Firebase initialized successfully");
} catch (error) {
  console.error("❌ Firebase initialization error:", error);
  console.error("Check your Firebase configuration and make sure Firestore is enabled");
}

export { db };

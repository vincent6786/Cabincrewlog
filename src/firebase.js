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

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

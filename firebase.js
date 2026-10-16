
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import {
  getAuth
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC2CHOeYB0P27f2Hby-PpaXAeAFj4CcUgg",
  authDomain: "schoolmanagementsystem-69f2a.firebaseapp.com",
  projectId: "schoolmanagementsystem-69f2a",
  storageBucket: "schoolmanagementsystem-69f2a.firebasestorage.app",
  messagingSenderId: "251601014479",
  appId: "1:251601014479:web:ec71bd9dd02f6ebc5831ba",
  measurementId: "G-4W0CZHYPEX"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

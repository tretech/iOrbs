import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, query, where, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import authState from './state.js';
import { initAdmin } from './admin.js';
import { initExplorer } from './explorer.js';
// Removed: import Papa from 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.0/papaparse.min.js';


// Firebase should already be initialized in index.html, this file is for module-specific initialization
export function initializeFirebase(showConfirmModal) {
  const auth = getAuth();
  const db = getFirestore();
  const appId = getAuth().app.options.appId;

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log("Firebase initialized and user signed in:", user.uid);
      authState.update({ userId: user.uid, isAuthenticated: true });

      // Pass Papa (global) and showConfirmModal to initAdmin
      initAdmin(db, auth, appId, user.uid, serverTimestamp, Papa, showConfirmModal, collection, query, where, addDoc, getDocs, doc, updateDoc, deleteDoc);
      
      // Explorer initialization is now handled within loadModuleContent in index.html
      // This check is no longer strictly necessary here as loadModuleContent will handle it.
      // However, if there's a scenario where Explorer might need to be initialized outside of a button click,
      // this block would be relevant. For now, it's commented out as it's redundant.
      /*
      if (document.getElementById('orb-display-area')) {
        initExplorer(db, appId, collection, query, getDocs);
      } else {
        console.warn("Explorer skipped: #orb-display-area not present (possibly due to tab state).");
      }
      */
    } else {
      try {
        console.log("No user signed in. Attempting anonymous sign-in.");
        await signInAnonymously(auth);
        // onAuthStateChanged will fire again with the signed-in user
      } catch (error) {
        console.error("Error during anonymous sign-in:", error);
        authState.update({ userId: 'anonymous', isAuthenticated: false });

        // Pass Papa (global) and showConfirmModal to initAdmin even for anonymous
        initAdmin(null, null, appId, 'anonymous', () => new Date(), Papa, showConfirmModal, null, null, null, null, null, null, null);
        // Explorer initialization is now handled within loadModuleContent in index.html
        // initExplorer(null, appId, null, null, null);
      }
    }
  });
}

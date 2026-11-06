// This object is NOT secret — it's meant to be public in client-side code.
// Security comes from Firestore security rules + Authentication, not from hiding this.
// Same Firebase project as the Card Deals tracker, so the same login works for both.
export const firebaseConfig = {
  apiKey: "AIzaSyD4qbOKRRiOHJhVXyUzA21Na2N8gF_A0-8",
  authDomain: "card-tracker-79906.firebaseapp.com",
  projectId: "card-tracker-79906",
  storageBucket: "card-tracker-79906.firebasestorage.app",
  messagingSenderId: "694160409653",
  appId: "1:694160409653:web:4c11f5c94f286a0a2a1d7c",
};

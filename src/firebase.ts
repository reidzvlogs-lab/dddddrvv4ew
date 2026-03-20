import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, getDocFromServer, setDoc, onSnapshot, collection, query, where, addDoc, updateDoc, deleteDoc, increment, orderBy, arrayUnion } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export { doc, getDoc, getDocFromServer, setDoc, onSnapshot, collection, query, where, addDoc, updateDoc, deleteDoc, increment, orderBy, arrayUnion };

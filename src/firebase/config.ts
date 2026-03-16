import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage'; 
import { getRemoteConfig } from 'firebase/remote-config';

// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyDw-oqZJRiIXMtfglyexCvGLoBjZY52BZg",
  authDomain: "chai-money.firebaseapp.com",
  projectId: "chai-money",
  storageBucket: "chai-money.firebasestorage.app",
  messagingSenderId: "658543947824",
  appId: "1:658543947824:web:2dd19ac875fd2808d4bdf5"
};

const app = initializeApp(firebaseConfig);

// 서비스 초기화
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const remoteConfig = getRemoteConfig(app);

export default app;
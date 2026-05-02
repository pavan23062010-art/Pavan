import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface Filter {
  id?: string;
  name: string;
  userId: string;
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  createdAt?: any;
}

const FILTERS_COLLECTION = 'filters';

export const saveFilter = async (filter: Omit<Filter, 'id' | 'userId' | 'createdAt'>) => {
  if (!auth.currentUser) throw new Error("User must be signed in");
  
  const path = FILTERS_COLLECTION;
  try {
    const docRef = await addDoc(collection(db, path), {
      ...filter,
      userId: auth.currentUser.uid,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const getFilters = async () => {
  if (!auth.currentUser) return [];
  
  const path = FILTERS_COLLECTION;
  try {
    const q = query(
      collection(db, path), 
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Filter[];
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
};

export const deleteFilter = async (filterId: string) => {
  const path = `${FILTERS_COLLECTION}/${filterId}`;
  try {
    await deleteDoc(doc(db, FILTERS_COLLECTION, filterId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

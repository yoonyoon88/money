import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  DocumentData,
  QuerySnapshot,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { db } from './config';
import type { MissionType } from '../types';

export interface MissionTemplate {
  id: string;
  parentId: string;
  title: string;
  description: string;
  rewardPoint: number;
  missionType: MissionType;
  createdAt?: string;
  sourceMissionId?: string;
}

const COLLECTION_NAME = 'missionTemplates';

const docToTemplate = (doc: DocumentData, id: string): MissionTemplate => {
  const createdAt =
    doc.createdAt && typeof doc.createdAt.toDate === 'function'
      ? doc.createdAt.toDate().toISOString()
      : undefined;

  return {
    id,
    parentId: doc.parentId,
    title: doc.title ?? '',
    description: doc.description ?? '',
    rewardPoint: doc.rewardPoint ?? 0,
    missionType: (doc.missionType as MissionType) ?? 'DAILY',
    createdAt,
    sourceMissionId: doc.sourceMissionId,
  };
};

export const createMissionTemplate = async (
  parentId: string,
  params: {
    title: string;
    description: string;
    rewardPoint: number;
    missionType: MissionType;
    sourceMissionId?: string;
  }
): Promise<string> => {
  if (!db) {
    throw new Error('Firestore가 초기화되지 않았습니다.');
  }

  // 이미 동일한 템플릿이 있는지 검사 (제목 + 포인트 + 타입 + 설명 기준)
  const existing = await fetchMissionTemplates(parentId);
  const normalizedDesc = params.description ?? '';
  const duplicated = existing.find((tpl) => {
    const tplDesc = tpl.description ?? '';
    return (
      tpl.title === params.title &&
      tpl.rewardPoint === params.rewardPoint &&
      tpl.missionType === params.missionType &&
      tplDesc === normalizedDesc
    );
  });

  if (duplicated) {
    // 이미 같은 템플릿이 있으면 새로 만들지 않고 기존 ID 반환
    return duplicated.id;
  }

  const ref = collection(db, COLLECTION_NAME);
  const data: any = {
    parentId,
    title: params.title,
    description: params.description,
    rewardPoint: params.rewardPoint,
    missionType: params.missionType,
    createdAt: serverTimestamp(),
  };

  if (params.sourceMissionId) {
    data.sourceMissionId = params.sourceMissionId;
  }

  const docRef = await addDoc(ref, data);
  return docRef.id;
};

export const fetchMissionTemplates = async (parentId: string): Promise<MissionTemplate[]> => {
  if (!db) {
    return [];
  }

  const ref = collection(db, COLLECTION_NAME);
  const q = query(ref, where('parentId', '==', parentId), orderBy('createdAt', 'desc'));
  const snapshot: QuerySnapshot<DocumentData> = await getDocs(q);
  return snapshot.docs.map((d) => docToTemplate(d.data(), d.id));
};

export const deleteMissionTemplate = async (templateId: string): Promise<void> => {
  if (!db) return;
  await deleteDoc(doc(db, COLLECTION_NAME, templateId));
};

export const deleteMissionTemplateBySource = async (
  parentId: string,
  sourceMissionId: string
): Promise<void> => {
  if (!db) {
    return;
  }
  const ref = collection(db, COLLECTION_NAME);
  const q = query(ref, where('parentId', '==', parentId), where('sourceMissionId', '==', sourceMissionId));
  const snapshot = await getDocs(q);
  await Promise.all(snapshot.docs.map((d) => deleteDoc(d.ref)));
};



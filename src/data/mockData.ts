import { Mission, User } from '../types';

export const initialUser: User = {
  id: 'x4zOoUIfXkS5BLvov395gwk1d8Z2', // Firebase Auth UID (child)
  name: '채이',
  totalPoint: 1500,
  role: 'CHILD',
  parentId: 'dtvgilfsrXgfQNDtg75VsPW9Iaz2', // Firebase Auth UID (parent)
};

export const initialParentUser: User = {
  id: 'dtvgilfsrXgfQNDtg75VsPW9Iaz2', // Firebase Auth UID (parent)
  name: '부모님',
  totalPoint: 0,
  role: 'PARENT',
  childrenIds: ['x4zOoUIfXkS5BLvov395gwk1d8Z2'], // Firebase Auth UID (child)
};


export const initialMissions: Mission[] = [
  {
    id: '1',
    title: '숙제하기',
    description: '오늘은 10페이지 읽기!',
    rewardPoint: 300,
    dueAt: new Date().toISOString().split('T')[0] + 'T17:00:00',
    status: 'APPROVED',
    missionType: 'DAILY',
    memo: '',
    childId: 'x4zOoUIfXkS5BLvov395gwk1d8Z2',
    parentId: 'dtvgilfsrXgfQNDtg75VsPW9Iaz2',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    completedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    approvedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: '2',
    title: '책 읽기',
    description: '오늘은 20페이지 읽기!',
    rewardPoint: 200,
    dueAt: '2024-04-23T00:00:00',
    status: 'SUBMITTED',
    missionType: 'DAILY',
    childId: 'x4zOoUIfXkS5BLvov395gwk1d8Z2',
    parentId: 'dtvgilfsrXgfQNDtg75VsPW9Iaz2',
    memo: '오늘 20쪽 읽었어요',
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  },
  {
    id: '3',
    title: '설거지',
    description: '저녁 설거지 하기',
    rewardPoint: 100,
    dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T18:00:00',
    status: 'TODO',
    missionType: 'DAILY',
    childId: 'x4zOoUIfXkS5BLvov395gwk1d8Z2',
    parentId: 'dtvgilfsrXgfQNDtg75VsPW9Iaz2',
    createdAt: new Date().toISOString(),
  },
  {
    id: '4',
    title: '방 정리하기',
    description: '방을 깨끗하게 정리하기',
    rewardPoint: 150,
    dueAt: new Date().toISOString().split('T')[0] + 'T20:00:00',
    status: 'TODO',
    missionType: 'DAILY',
    childId: 'x4zOoUIfXkS5BLvov395gwk1d8Z2',
    parentId: 'dtvgilfsrXgfQNDtg75VsPW9Iaz2',
    createdAt: new Date().toISOString(),
  },
  {
    id: '5',
    title: '운동하기',
    description: '이번 주에 3번 이상 운동하기',
    rewardPoint: 500,
    dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T23:59:59',
    status: 'TODO',
    missionType: 'WEEKLY',
    childId: 'x4zOoUIfXkS5BLvov395gwk1d8Z2',
    parentId: 'dtvgilfsrXgfQNDtg75VsPW9Iaz2',
    createdAt: new Date().toISOString(),
  },
  {
    id: '6',
    title: '독서 목표 달성',
    description: '이번 주에 책 1권 읽기',
    rewardPoint: 400,
    dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T23:59:59',
    status: 'TODO',
    missionType: 'WEEKLY',
    childId: 'x4zOoUIfXkS5BLvov395gwk1d8Z2',
    parentId: 'dtvgilfsrXgfQNDtg75VsPW9Iaz2',
    createdAt: new Date().toISOString(),
  },
];


import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Mission, User, MissionStatus, MissionType } from '../types';
import { auth, db } from '../firebase/config';
import { subscribeUser, getUser } from '../firebase/users';
import { subscribeChildMissions, subscribeSubmittedMissions, subscribeParentChildMissions, updateMissionSubmission, rejectMission as rejectMissionInFirebase, approveMission as approveMissionInFirebase, createMission as createMissionInFirebase, deleteMission as deleteMissionInFirebase, retryMission as retryMissionInFirebase, requestRetry as requestRetryInFirebase, requestRetryByParent as requestRetryByParentInFirebase, approveRetry as approveRetryInFirebase, rejectRetry as rejectRetryInFirebase, updateMission as updateMissionInFirebase, markMissionAsNotCompleted as markMissionAsNotCompletedInFirebase, docToMission } from '../firebase/missions';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { canSubmitMission, canApproveMission, canRejectMission } from '../utils/permissions';
import { initialUser, initialMissions, initialParentUser } from '../data/mockData';

// ============================================================================
// 타입 정의
// ============================================================================

// 기기 역할 타입
export type DeviceRole = 'PARENT' | 'CHILD' | null;

interface AppContextType {
  // 상태
  user: User | null;
  missions: Mission[];
  loading: boolean;
  isAuthChecked: boolean; // 인증 상태 확인 완료 여부
  isAuthLoading: boolean; // Auth 초기 로딩 상태 (상태 꼬임 방지)
  authLoading: boolean; // Firestore 사용자 데이터 로딩 상태 (플리커 방지)
  selectedChildId: string | null;
  lastRewardPoint: number | null; // 포인트 지급 애니메이션용
  isParentVerified: boolean; // 부모 PIN 확인 상태
  deviceRole: DeviceRole; // 기기 역할 (기기 기준)
  hasSelectedRole: boolean; // 역할 선택 완료 여부
  
  // 상태 변경 함수
  setSelectedChildId: (childId: string | null) => void;
  setLastRewardPoint: (point: number | null) => void;
  setIsParentVerified: (verified: boolean) => void;
  setDeviceRole: (role: DeviceRole) => void;
  
  // 비즈니스 로직 함수
  submitMission: (missionId: string, memo: string, currentChildId?: string | null) => Promise<void>;
  approveMission: (missionId: string) => Promise<void>;
  partialApproveMission: (missionId: string, partialPoint: number) => Promise<void>;
  rejectMission: (missionId: string) => Promise<void>;
  createMission: (title: string, rewardPoint: number, dueDate: string, missionType?: 'DAILY' | 'WEEKLY', description?: string, childId?: string, isRepeat?: boolean, repeatDays?: number[], repeatStartDate?: string, repeatEndDate?: string | null) => Promise<void>;
  deleteMission: (missionId: string) => Promise<void>;
  retryMission: (missionId: string, newDueDate: string) => Promise<void>;
  requestRetry: (missionId: string, childId: string) => Promise<void>;
  requestRetryByParent: (missionId: string) => Promise<void>;
  approveRetry: (missionId: string, newDueDate?: string) => Promise<void>;
  rejectRetry: (missionId: string) => Promise<void>;
  updateMission: (missionId: string, title: string, description: string, rewardPoint: number, dueDate: string, missionType?: 'DAILY' | 'WEEKLY', isRepeat?: boolean, repeatDays?: number[], repeatStartDate?: string, repeatEndDate?: string | null) => Promise<void>;
  markMissionAsNotCompleted: (missionId: string) => Promise<void>;
  
  // 개발용 임시 로그인 함수 (Firebase 연동 시 제거 예정)
  tempLogin: () => void;
  tempLoginChild: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// ============================================================================
// AppProvider 컴포넌트
// ============================================================================

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // ==========================================================================
  // 상태 관리
  // ==========================================================================
  
  // 핵심 상태: Context에서만 변경 가능
  const [user, setUser] = useState<User | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState<boolean>(true); // mount 시 1회만 true → false
  const [isAuthChecked, setIsAuthChecked] = useState<boolean>(false); // 인증 상태 확인 완료 여부
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true); // Auth 초기 로딩 상태 (상태 꼬임 방지)
  const [authLoading, setAuthLoading] = useState<boolean>(true); // Firestore 사용자 데이터 로딩 상태 (플리커 방지)
  const [selectedChildId, setSelectedChildIdState] = useState<string | null>(null);
  const [lastRewardPoint, setLastRewardPoint] = useState<number | null>(null);
  const [isParentVerified, setIsParentVerified] = useState<boolean>(false);
  
  // 기기 역할 관리 (localStorage 기반)
  const [deviceRole, setDeviceRoleState] = useState<DeviceRole>(() => {
    // 초기값: localStorage에서 읽기
    const stored = localStorage.getItem('deviceRole');
    return (stored === 'PARENT' || stored === 'CHILD') ? stored : null;
  });
  const [hasSelectedRole, setHasSelectedRole] = useState<boolean>(() => {
    // 역할 선택 완료 여부: localStorage에 deviceRole이 있으면 true
    return localStorage.getItem('deviceRole') !== null;
  });
  
  // 내부 상태: 임시 로그인 모드 플래그
  const [isTempLogin, setIsTempLogin] = useState<boolean>(false);

  // localStorage와 연동된 selectedChildId 관리
  const setSelectedChildId = (childId: string | null) => {
    setSelectedChildIdState(childId);
    if (childId) {
      localStorage.setItem('defaultChildId', childId);
    } else {
      localStorage.removeItem('defaultChildId');
    }
  };

  // 기기 역할 설정 함수 (localStorage에 저장)
  const setDeviceRole = (role: DeviceRole) => {
    setDeviceRoleState(role);
    if (role) {
      localStorage.setItem('deviceRole', role);
      setHasSelectedRole(true);
    } else {
      localStorage.removeItem('deviceRole');
      setHasSelectedRole(false);
    }
  };

  // 세션 저장 (uid, role)
  const saveSession = (uid: string, role: string) => {
    try {
      localStorage.setItem('session_uid', uid);
      localStorage.setItem('session_role', role);
    } catch (error) {
    }
  };

  // 세션 복원 (uid, role)
  const restoreSession = (): { uid: string | null; role: string | null } => {
    try {
      const uid = localStorage.getItem('session_uid');
      const role = localStorage.getItem('session_role');
      return { uid, role };
    } catch (error) {
      return { uid: null, role: null };
    }
  };

  // 세션 삭제
  const clearSession = () => {
    try {
      localStorage.removeItem('session_uid');
      localStorage.removeItem('session_role');
    } catch (error) {
    }
  };

  // 로그인 시 상태 초기화
  useEffect(() => {
    if (user) {
      // 로그인 성공 시 selectedChildId 초기화
      // 역할 선택은 RoleSelection 화면에서만 결정됨
      setSelectedChildIdState(null);
      localStorage.removeItem('defaultChildId');
      
      if (user.role === 'CHILD') {
        // 아이는 PIN 검증 없이 바로 접근 가능
        setIsParentVerified(true);
      }
      // 부모의 경우 PIN 인증은 세션 단위로 유지 (로그아웃 시에만 초기화)
    } else {
      // 로그아웃 시 모든 상태 초기화
      setSelectedChildIdState(null);
      localStorage.removeItem('defaultChildId');
      setIsParentVerified(false);
    }
  }, [user]);

  // ==========================================================================
  // 인증(Auth) 관리
  // ==========================================================================
  // 
  // TODO: Firebase Auth 연동 시 이 섹션을 교체
  // 
  // 현재 구조:
  // 1. Firebase Auth가 있으면 → onAuthStateChanged로 인증 상태 감지
  // 2. Firebase Auth가 없으면 → 임시 로그인 모드로 자동 전환
  // 
  // Firebase 연동 시:
  // - onAuthStateChanged에서 firebaseUser를 받으면
  // - subscribeUser(firebaseUser.uid)로 사용자 정보 구독
  // - user.role을 통해 권한 확인
  // - isTempLogin 플래그 제거
  // ==========================================================================

  // ==========================================================================
  // 인증(Auth) 관리 - 앱 시작 시 한 번만 구독
  // 빠른 초기 렌더링을 위해 Firestore 조회는 지연 처리
  // ==========================================================================
  useEffect(() => {
    let isMounted = true;
    let unsubscribeAuth: (() => void) | null = null;
    let isFirstAuthCheck = true; // 최초 인증 확인 여부

    console.log('[AppContext] 인증 초기화 시작');

    // Firebase가 초기화되지 않았으면 loading만 해제
    if (!auth) {
      console.log('[AppContext] Firebase Auth가 초기화되지 않았습니다.');
      setLoading(false);
      setIsAuthChecked(true);
      setIsAuthLoading(false);
      const rootElement = document.getElementById('root');
      if (rootElement) {
        rootElement.style.display = 'block';
      }
      return;
    }

    // Firebase Auth가 있으면 isTempLogin 무시 (Firebase Auth 우선)
    if (isTempLogin) {
      setIsTempLogin(false);
    }

    // Firebase Auth 상태 변경 감지 - 앱 시작 시 한 번만 구독
    unsubscribeAuth = auth.onAuthStateChanged(async (firebaseUser) => {
      if (!isMounted) {
        console.log('[AppContext] onAuthStateChanged: 컴포넌트가 언마운트됨, 무시');
        return;
      }

      // 최초 인증 확인 완료 표시
      if (isFirstAuthCheck) {
        isFirstAuthCheck = false;
        setIsAuthChecked(true);
        setIsAuthLoading(false);
        setLoading(false);
        const rootElement = document.getElementById('root');
        if (rootElement) {
          rootElement.style.display = 'block';
        }
        console.log('[AppContext] 최초 인증 확인 완료');
      }

      if (!firebaseUser) {
        // 로그아웃 시 상태 초기화
        console.log('[AppContext] onAuthStateChanged: 로그아웃 감지');
        setUser(null);
        setMissions([]);
        setSelectedChildIdState(null);
        localStorage.removeItem('defaultChildId');
        setIsParentVerified(false);
        clearSession();
        localStorage.removeItem('autoLogin');
        setAuthLoading(false);
        return;
      }

      // 로그인 사용자 감지 - Firestore 조회 시작
      console.log('[AppContext] onAuthStateChanged: 로그인 사용자 감지', firebaseUser.uid);
      setAuthLoading(true);

      try {
        // Firestore에서 사용자 문서 조회
        if (!db) {
          console.error('[AppContext] Firestore가 초기화되지 않았습니다.');
          // Firestore가 없어도 임시 User 객체로 로그인 상태 유지
          const tempUser: User = {
            id: firebaseUser.uid,
            name: firebaseUser.email?.split('@')[0] || '사용자',
            totalPoint: 0,
            role: 'PARENT',
            email: firebaseUser.email || undefined,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          setUser(tempUser);
          saveSession(tempUser.id, tempUser.role);
          setAuthLoading(false);
          return;
        }

        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));

        if (userDoc.exists()) {
          // Firestore 문서가 존재하는 경우
          const userData = userDoc.data();
          const user: User = {
            id: firebaseUser.uid,
            name: userData.name || firebaseUser.email?.split('@')[0] || '사용자',
            totalPoint: typeof userData.totalPoint === 'number' ? userData.totalPoint : 0,
            role: (userData.role as 'PARENT' | 'CHILD') || 'PARENT',
            email: userData.email || firebaseUser.email || undefined,
            createdAt: userData.createdAt ? (typeof userData.createdAt === 'string' ? userData.createdAt : userData.createdAt.toDate().toISOString()) : new Date().toISOString(),
            updatedAt: userData.updatedAt ? (typeof userData.updatedAt === 'string' ? userData.updatedAt : userData.updatedAt.toDate().toISOString()) : new Date().toISOString(),
            childrenIds: Array.isArray(userData.childrenIds) ? userData.childrenIds : undefined,
            parentPin: userData.parentPin || undefined,
            parentId: userData.parentId || undefined,
            gender: (userData.gender === 'male' || userData.gender === 'female') ? userData.gender : undefined,
          };
          
          console.log('[AppContext] Firestore 사용자 데이터 로드 완료', user.id, user.role);
          setUser(user);
          saveSession(user.id, user.role);
        } else {
          // Firestore 문서가 없는 경우 - 기본 사용자 문서 생성
          console.log('[AppContext] 사용자 문서가 없습니다. 기본 문서 생성 중...', firebaseUser.uid);
          
          try {
            const now = new Date().toISOString();
            const defaultUserData = {
              name: firebaseUser.email?.split('@')[0] || '사용자',
              totalPoint: 0,
              role: 'PARENT' as const,
              email: firebaseUser.email || undefined,
              createdAt: now,
              updatedAt: now,
            };

            await setDoc(doc(db, 'users', firebaseUser.uid), defaultUserData, { merge: true });
            
            const user: User = {
              id: firebaseUser.uid,
              name: defaultUserData.name,
              totalPoint: defaultUserData.totalPoint,
              role: defaultUserData.role,
              email: defaultUserData.email,
              createdAt: defaultUserData.createdAt,
              updatedAt: defaultUserData.updatedAt,
            };
            
            console.log('[AppContext] 기본 사용자 문서 생성 완료', user.id);
            setUser(user);
            saveSession(user.id, user.role);
          } catch (createError) {
            console.error('[AppContext] 기본 사용자 문서 생성 실패:', createError);
            // 문서 생성 실패해도 임시 User 객체로 로그인 상태 유지
            const tempUser: User = {
              id: firebaseUser.uid,
              name: firebaseUser.email?.split('@')[0] || '사용자',
              totalPoint: 0,
              role: 'PARENT',
              email: firebaseUser.email || undefined,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            setUser(tempUser);
            saveSession(tempUser.id, tempUser.role);
          }
        }
      } catch (error) {
        console.error('[AppContext] Firestore 사용자 데이터 조회 실패:', error);
        // 에러가 발생해도 임시 User 객체로 로그인 상태 유지
        const tempUser: User = {
          id: firebaseUser.uid,
          name: firebaseUser.email?.split('@')[0] || '사용자',
          totalPoint: 0,
          role: 'PARENT',
          email: firebaseUser.email || undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setUser(tempUser);
        saveSession(tempUser.id, tempUser.role);
      } finally {
        // Firestore 로딩 완료
        setAuthLoading(false);
      }
    });

    return () => {
      console.log('[AppContext] 인증 구독 해제');
      isMounted = false;
      if (unsubscribeAuth) {
        unsubscribeAuth();
      }
    };
  }, []); // mount 시 1회만 실행

  // ==========================================================================
  // Firestore 사용자 정보 구독 - user가 있을 때만 실행 (지연 처리)
  // ==========================================================================
  useEffect(() => {
    let isMounted = true;
    let unsubscribeUser: (() => void) | null = null;

    // user가 없거나 auth.currentUser가 없으면 실행하지 않음
    if (!user || !auth?.currentUser || user.id !== auth.currentUser.uid) {
      return;
    }

    // authLoading이 true면 아직 Firestore 조회가 완료되지 않았으므로 구독하지 않음
    if (authLoading) {
      return;
    }

    console.log('[AppContext] Firestore 사용자 정보 실시간 구독 시작', user.id);

    try {
      // subscribeUser는 firebaseUser.uid를 받아서
      // Firestore의 users/{uid} 문서를 실시간 구독
      // userData에는 role, name, totalPoint, childrenIds, parentId 등이 포함됨
      // 문서가 없을 경우 자동으로 기본 사용자 문서 생성
      unsubscribeUser = subscribeUser(
        auth.currentUser.uid,
        (userData) => {
          if (!isMounted) {
            console.log('[AppContext] subscribeUser callback: 컴포넌트가 언마운트됨, 무시');
            return;
          }
          
          try {
            if (userData) {
              console.log('[AppContext] subscribeUser callback: 사용자 데이터 업데이트', userData.id, userData.role);
              setUser(userData);
              // 세션 저장 (uid, role)
              saveSession(userData.id, userData.role);
            } else {
              console.warn('[AppContext] subscribeUser callback: 사용자 데이터가 null입니다.');
              // 문서가 삭제된 경우에도 기존 User 객체 유지
            }
          } catch (error) {
            console.error('[AppContext] subscribeUser callback 처리 중 오류:', error);
            // 에러가 발생해도 기존 임시 User 객체 유지
          }
        },
        auth.currentUser.email || undefined
      );
    } catch (error) {
      console.error('[AppContext] subscribeUser 호출 중 오류:', error);
      // 에러가 발생해도 기존 임시 User 객체 유지
    }

    return () => {
      if (unsubscribeUser) {
        console.log('[AppContext] Firestore 사용자 정보 구독 해제');
        unsubscribeUser();
      }
    };
  }, [user?.id, authLoading]); // user.id와 authLoading이 변경될 때만 실행

  // ==========================================================================
  // 데이터(Missions) 관리
  // ==========================================================================
  // 
  // TODO: Firebase Firestore 연동 시 이 섹션을 교체
  // 
  // 현재 구조:
  // 1. 임시 로그인 모드면 → mock 데이터 사용
  // 2. Firebase 모드면 → Firestore 실시간 구독
  // 
  // Firebase 연동 시:
  // - user.role === 'CHILD' → subscribeChildMissions(user.id)
  // - user.role === 'PARENT' && selectedChildId → subscribeParentChildMissions(selectedChildId)
  // - user.role === 'PARENT' && !selectedChildId → subscribeSubmittedMissions(...)
  // - 실시간 구독으로 missions 상태 자동 업데이트
  // ==========================================================================

  useEffect(() => {
    if (!user) {
      setMissions([]);
      return;
    }

    // Firebase가 초기화되지 않았으면 빈 배열
    if (!db) {
      setMissions([]);
      return;
    }

    let unsubscribe: (() => void) | undefined;

    if (user.role === 'CHILD') {
      // 아이: 자신의 미션만 구독
      unsubscribe = subscribeChildMissions(user.id, (missionsData) => {
        setMissions(missionsData);
      });
    } else if (user.role === 'PARENT') {
      // 부모: selectedChildId에 따라 구독 변경
      if (selectedChildId) {
        // 선택된 자녀의 모든 미션 구독 (부모 홈 화면용)
        unsubscribe = subscribeParentChildMissions(selectedChildId, (missionsData) => {
          setMissions(missionsData);
        });
      } else {
        // 제출된 미션만 구독 (승인 화면용)
        unsubscribe = subscribeSubmittedMissions(
          user.id,
          user.childrenIds || [],
          (missionsData) => {
            setMissions(missionsData);
          }
        );
      }
    } else {
      setMissions([]);
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [user, selectedChildId]); // isTempLogin 의존성 제거

  // ==========================================================================
  // 비즈니스 로직 함수
  // ==========================================================================

  const submitMission = async (
    missionId: string,
    memo: string,
    currentChildId?: string | null
  ): Promise<void> => {
    if (!user) {
      throw new Error('로그인이 필요합니다.');
    }

    // 임시 로그인 모드면 로컬 상태만 업데이트
    if (isTempLogin) {
      const mission = missions.find((m) => m.id === missionId);
      if (!mission) {
        throw new Error('미션 정보를 불러올 수 없어요');
      }

      // 제출 가능한 상태 목록 정의
      // - TODO: 아직 시작하지 않은 미션
      // - IN_PROGRESS: 아이가 진행 중인 미션
      // - RESUBMITTED: 부모가 '다시 해볼까'를 눌러 아이가 재도전 요청한 상태 (부모가 요청한 경우만)
      const SUBMITTABLE_STATUSES = [
        'TODO',
        'IN_PROGRESS',
        'RESUBMITTED',       // 부모가 재도전 요청한 상태만 제출 가능
        'REQUEST',           // RESUBMITTED와 동일 의미 (하위 호환성)
        'RETRY_REQUESTED',   // RESUBMITTED와 동일 의미 (하위 호환성)
        'ACTIVE',
        'RETRY_APPROVED',
      ] as const;
      
      // 상태 해석: RESUBMITTED이지만 부모가 요청한 것이 아닌 경우 제외
      const interpretedStatus = mission.status === 'RESUBMITTED' || 
                                mission.status === 'REQUEST' || 
                                mission.status === 'RETRY_REQUESTED'
                                ? (mission.retryRequestedBy === 'parent' ? mission.status : 'SUBMITTED')
                                : mission.status;
      
      // 해석된 상태가 제출 가능한지 확인
      const isSubmittableStatus = SUBMITTABLE_STATUSES.includes(interpretedStatus as any);

      // 권한 체크 - currentChildId가 있으면 childId 기준으로 체크
      if (currentChildId !== null && currentChildId !== undefined) {
        if (mission.childId !== currentChildId) {
          throw new Error('이 미션은 지금 제출할 수 없어요');
        }
        // 제출 가능한 상태인지 확인
        if (!isSubmittableStatus) {
          throw new Error('이미 제출했거나 제출할 수 없는 미션이에요');
        }
      } else {
        // currentChildId가 없으면 기존 로직 사용 (하위 호환성)
        // 제출 가능한 상태인지 확인
        if (!isSubmittableStatus) {
          throw new Error('이미 제출했거나 제출할 수 없는 미션이에요');
        }
        // 권한 체크
        if (mission.childId !== user.id) {
          throw new Error('이 미션은 지금 제출할 수 없어요');
        }
      }

      setMissions((prevMissions) =>
        prevMissions.map((m) =>
          m.id === missionId
            ? {
                ...m,
                status: 'DONE_PENDING' as MissionStatus,
                memo,
                completedAt: new Date().toISOString(),
              }
            : m
        )
      );
      return;
    }

    // Firebase 연동 시: Firestore에서 직접 미션 조회
    if (!db) {
      throw new Error('Firestore가 초기화되지 않았습니다.');
    }

    try {
      // Firestore에서 미션 직접 조회
      const missionRef = doc(db, 'missions', missionId);
      const missionDoc = await getDoc(missionRef);

      if (!missionDoc.exists()) {
        throw new Error('미션 정보를 불러올 수 없어요');
      }

      const missionData = missionDoc.data();
      const mission = docToMission(missionData, missionDoc.id);

      // 제출 가능한 상태 목록 정의
      // - TODO: 아직 시작하지 않은 미션
      // - IN_PROGRESS: 아이가 진행 중인 미션
      // - RESUBMITTED: 부모가 '다시 해볼까'를 눌러 아이가 재도전 요청한 상태 (부모가 요청한 경우만)
      const SUBMITTABLE_STATUSES = [
        'TODO',
        'IN_PROGRESS',
        'RESUBMITTED',       // 부모가 재도전 요청한 상태만 제출 가능
        'REQUEST',           // RESUBMITTED와 동일 의미 (하위 호환성)
        'RETRY_REQUESTED',   // RESUBMITTED와 동일 의미 (하위 호환성)
        'ACTIVE',
        'RETRY_APPROVED',
      ] as const;
      
      // 상태 해석: RESUBMITTED이지만 부모가 요청한 것이 아닌 경우 제외
      const interpretedStatus = mission.status === 'RESUBMITTED' || 
                                mission.status === 'REQUEST' || 
                                mission.status === 'RETRY_REQUESTED'
                                ? (mission.retryRequestedBy === 'parent' ? mission.status : 'SUBMITTED')
                                : mission.status;
      
      // 해석된 상태가 제출 가능한지 확인
      const isSubmittableStatus = SUBMITTABLE_STATUSES.includes(interpretedStatus as any);

      // 권한 체크 - currentChildId가 있으면 childId 기준으로만 체크
      if (currentChildId !== null && currentChildId !== undefined) {
        // currentChildId가 없는 경우에만 예외 처리
        if (!currentChildId) {
          throw new Error('자녀 정보를 찾을 수 없습니다.');
        }
        // mission.childId === currentChildId 기준으로만 판단
        if (mission.childId !== currentChildId) {
          throw new Error('이 미션은 지금 제출할 수 없어요');
        }
        // 미션 상태 체크 - 제출 가능한 상태인지 확인
        if (!isSubmittableStatus) {
          throw new Error('이미 제출했거나 제출할 수 없는 미션이에요');
        }
      } else {
        // currentChildId가 없으면 기존 로직 사용 (하위 호환성)
        // 제출 가능한 상태인지 확인
        if (!isSubmittableStatus) {
          throw new Error('이미 제출했거나 제출할 수 없는 미션이에요');
        }
        // 권한 체크
        if (mission.childId !== user.id) {
          throw new Error('이 미션은 지금 제출할 수 없어요');
        }
      }

      // updateMissionSubmission으로 Firestore 업데이트
      // 실시간 구독으로 자동으로 missions 상태 업데이트됨
      await updateMissionSubmission(missionId, memo);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('미션 제출이 완료되지 않았어요');
    }
  };

  const approveMission = async (missionId: string): Promise<void> => {
    if (!user) {
      throw new Error('로그인이 필요합니다.');
    }

    const mission = missions.find((m) => m.id === missionId);
    if (!mission) {
      throw new Error('미션을 찾을 수 없습니다.');
    }

    // 권한 체크 - 부모만 승인 가능
    if (!canApproveMission(user, mission)) {
      throw new Error('이 미션은 이미 처리되었어요');
    }

    // 임시 로그인 모드면 로컬 상태만 업데이트
    if (isTempLogin) {
      setMissions((prevMissions) => {
        const m = prevMissions.find((m) => m.id === missionId);
        if (m && (m.status === 'SUBMITTED' || m.status === 'PENDING_REVIEW')) {
          const rewardPoint = m.rewardPoint;
          setUser((prevUser) => {
            if (!prevUser) return prevUser;
            return {
              ...prevUser,
              totalPoint: prevUser.totalPoint + rewardPoint,
              updatedAt: new Date().toISOString(),
            };
          });
          // 포인트 지급 애니메이션을 위한 상태 설정
          setLastRewardPoint(rewardPoint);
          return prevMissions.map((mission) =>
            mission.id === missionId
              ? {
                  ...mission,
                  status: 'DONE_APPROVED' as MissionStatus,
                  approvedAt: new Date().toISOString(),
                  approvedBy: user.id,
                }
              : mission
          );
        }
        return prevMissions;
      });
      return;
    }

    // Firebase 연동 시
    // approveMissionInFirebase로 미션 상태 업데이트 및 포인트 적립 (트랜잭션으로 처리)
      // 실시간 구독으로 user.totalPoint와 missions 상태 자동 업데이트
      // lastRewardPoint 설정 (애니메이션용)
      try {
        await approveMissionInFirebase(missionId, user.id);
        setLastRewardPoint(mission.rewardPoint);
      } catch (error) {
        throw new Error('승인 처리가 완료되지 않았어요');
      }
  };

  const partialApproveMission = async (missionId: string, partialPoint: number): Promise<void> => {
    if (!user) {
      throw new Error('로그인이 필요합니다.');
    }

    const mission = missions.find((m) => m.id === missionId);
    if (!mission) {
      throw new Error('미션을 찾을 수 없습니다.');
    }

    if (user.role !== 'PARENT') {
      throw new Error('부모만 미션을 부분 승인할 수 있습니다.');
    }

    // 부분 포인트 검증
    if (partialPoint <= 0) {
      throw new Error('부분 승인 포인트는 0보다 커야 합니다.');
    }
    if (partialPoint > mission.rewardPoint) {
      throw new Error('부분 승인 포인트는 전체 보상 포인트를 초과할 수 없습니다.');
    }

    // Firebase가 초기화되지 않았으면 에러
    if (!db) {
      throw new Error('Firebase가 초기화되지 않았습니다.');
    }

    try {
      // TODO: 부분 승인 기능은 현재 미지원
      throw new Error('부분 승인 기능은 현재 지원되지 않습니다.');
      // 실시간 구독으로 자동으로 missions 상태 업데이트됨
      setLastRewardPoint(partialPoint);
    } catch (error) {
      throw new Error('부분 승인 처리가 완료되지 않았어요');
    }
  };

  const rejectMission = async (missionId: string): Promise<void> => {
    if (!user) {
      throw new Error('로그인이 필요합니다.');
    }

    const mission = missions.find((m) => m.id === missionId);
    if (!mission) {
      throw new Error('미션을 찾을 수 없습니다.');
    }

    // 권한 체크 - 부모만 반려 가능
    if (!canRejectMission(user, mission)) {
      throw new Error('이 미션은 이미 처리되었어요');
    }

    // 임시 로그인 모드면 로컬 상태만 업데이트
    if (isTempLogin) {
      setMissions((prevMissions) =>
        prevMissions.map((m) =>
          m.id === missionId
            ? {
                ...m,
                status: 'ACTIVE' as MissionStatus,
                completedAt: null, // 완료 시간 초기화
              }
            : m
        )
      );
      return;
    }

    // Firebase 연동 시
    // rejectMissionInFirebase로 Firestore 업데이트
    // 실시간 구독으로 자동으로 missions 상태 업데이트됨
    try {
      await rejectMissionInFirebase(missionId);
    } catch (error) {
      throw new Error('처리가 완료되지 않았어요');
    }
  };

  const createMission = async (
    title: string,
    rewardPoint: number,
    dueDate: string,
    missionType: 'DAILY' | 'WEEKLY' = 'DAILY',
    description: string = '',
    targetChildId?: string,
    isRepeat: boolean = false,
    repeatDays: number[] = [],
    repeatStartDate?: string,
    repeatEndDate?: string | null
  ): Promise<void> => {
    if (!user || user.role !== 'PARENT') {
      throw new Error('부모만 미션을 생성할 수 있습니다.');
    }

    // childId 파라미터가 있으면 사용, 없으면 selectedChildId 사용
    const childId = targetChildId || selectedChildId;
    if (!childId) {
      throw new Error('자녀를 선택해주세요.');
    }

    // 임시 로그인 모드면 로컬 상태만 업데이트
    if (isTempLogin) {
      const newMission: Mission = {
        id: `mission-${Date.now()}`,
        title,
        description: description || title,
        rewardPoint,
        dueAt: dueDate, // 필드명 변경
        status: 'TODO',
        missionType,
        childId: childId,
        parentId: user.id,
        createdAt: new Date().toISOString(),
        // 반복 미션 정보는 Mission 타입에 없으므로 임시 로그인 모드에서는 무시
      };
      setMissions((prevMissions) => [...prevMissions, newMission]);
      return;
    }

    // Firebase가 초기화되지 않았으면 에러
    if (!db) {
      throw new Error('Firebase가 초기화되지 않았습니다.');
    }

    // TODO: Firebase 연동 시
    // createMissionInFirebase로 Firestore에 미션 생성
    // 실시간 구독으로 자동으로 missions 상태 업데이트됨
    try {
      await createMissionInFirebase(
        title,
        description || title,
        rewardPoint,
        dueDate,
        missionType,
        childId,
        user.id,
        isRepeat,
        repeatDays,
        repeatStartDate,
        repeatEndDate
      );
    } catch (error) {
      throw new Error('미션 생성에 실패했습니다.');
    }
  };

  const deleteMission = async (missionId: string): Promise<void> => {
    if (!user || user.role !== 'PARENT') {
      throw new Error('부모만 미션을 삭제할 수 있습니다.');
    }

    // 임시 로그인 모드면 로컬 상태만 업데이트
    if (isTempLogin) {
      setMissions((prevMissions) =>
        prevMissions.filter((m) => m.id !== missionId)
      );
      return;
    }

    // Firebase가 초기화되지 않았으면 에러
    if (!db) {
      throw new Error('Firebase가 초기화되지 않았습니다.');
    }

    // 낙관적 업데이트: UI를 즉시 갱신
    setMissions((prevMissions) =>
      prevMissions.map((m) =>
        m.id === missionId
          ? { ...m, isDeleted: true, deletedAt: new Date().toISOString() }
          : m
      )
    );

    try {
      await deleteMissionInFirebase(missionId, user.id);
      // 실시간 구독으로 자동으로 missions 상태 업데이트됨
      // 낙관적 업데이트와 Firestore 업데이트가 일치하므로 추가 작업 불필요
    } catch (error) {
      // 에러 발생 시 낙관적 업데이트 롤백
      setMissions((prevMissions) =>
        prevMissions.map((m) =>
          m.id === missionId
            ? { ...m, isDeleted: false, deletedAt: undefined }
            : m
        )
      );
      throw new Error('미션 삭제에 실패했습니다.');
    }
  };

  const retryMission = async (missionId: string, newDueDate: string): Promise<void> => {
    if (!user || user.role !== 'PARENT') {
      throw new Error('부모만 미션을 재도전할 수 있습니다.');
    }

    // Firebase가 초기화되지 않았으면 에러
    if (!db) {
      throw new Error('Firebase가 초기화되지 않았습니다.');
    }

    try {
      await retryMissionInFirebase(missionId, newDueDate, user.id);
      // 실시간 구독으로 자동으로 missions 상태 업데이트됨
    } catch (error) {
      throw new Error('미션 재도전에 실패했습니다.');
    }
  };

  /**
   * 재도전 요청 (아이가 요청)
   * 
   * @param missionId - 미션 ID
   * @param childId - 아이 ID (권한 확인용, ChildHome에서 URL 파라미터로 받은 childId 전달)
   */
  const requestRetry = async (missionId: string, childId: string): Promise<void> => {
    // Firebase가 초기화되지 않았으면 에러
    if (!db) {
      throw new Error('Firebase가 초기화되지 않았습니다.');
    }

    // childId가 전달되지 않았으면 에러
    if (!childId) {
      throw new Error('아이 ID가 필요합니다.');
    }

    try {
      // Firestore에서 childId를 기준으로 권한 확인 (requestRetryInFirebase 내부에서 처리)
      await requestRetryInFirebase(missionId, childId);
      // 실시간 구독으로 자동으로 missions 상태 업데이트됨
    } catch (error) {
      throw error; // 원본 에러 메시지 전달
    }
  };

  /**
   * 재도전 승인 (부모가 승인)
   */
  const approveRetry = async (missionId: string, newDueDate?: string): Promise<void> => {
    if (!user || user.role !== 'PARENT') {
      throw new Error('부모만 재도전을 승인할 수 있습니다.');
    }

    // Firebase가 초기화되지 않았으면 에러
    if (!db) {
      throw new Error('Firebase가 초기화되지 않았습니다.');
    }

    try {
      await approveRetryInFirebase(missionId, user.id, newDueDate);
      // 실시간 구독으로 자동으로 missions 상태 업데이트됨
    } catch (error) {
      throw new Error('재도전 승인에 실패했습니다.');
    }
  };

  /**
   * 재도전 거절 (부모가 거절)
   */
  const rejectRetry = async (missionId: string): Promise<void> => {
    if (!user || user.role !== 'PARENT') {
      throw new Error('부모만 재도전을 거절할 수 있습니다.');
    }

    // Firebase가 초기화되지 않았으면 에러
    if (!db) {
      throw new Error('Firebase가 초기화되지 않았습니다.');
    }

    try {
      await rejectRetryInFirebase(missionId, user.id);
      // 실시간 구독으로 자동으로 missions 상태 업데이트됨
    } catch (error) {
      throw new Error('재도전 거절에 실패했습니다.');
    }
  };

  /**
   * 부모가 만료된 미션을 재도전 요청 상태로 변경
   */
  const requestRetryByParent = async (missionId: string): Promise<void> => {
    if (!user || user.role !== 'PARENT') {
      throw new Error('부모만 재도전 요청할 수 있습니다.');
    }

    if (!db) {
      throw new Error('Firebase가 초기화되지 않았습니다.');
    }

    try {
      await requestRetryByParentInFirebase(missionId, user.id);
      // 실시간 구독으로 자동으로 missions 상태 업데이트됨
    } catch (error) {
      throw error;
    }
  };

  /**
   * 미션 수정
   */
  const updateMission = async (
    missionId: string,
    title: string,
    description: string,
    rewardPoint: number,
    dueDate: string,
    missionType: 'DAILY' | 'WEEKLY' = 'DAILY',
    isRepeat: boolean = false,
    repeatDays: number[] = [],
    repeatStartDate?: string,
    repeatEndDate?: string | null
  ): Promise<void> => {
    if (!user || user.role !== 'PARENT') {
      throw new Error('부모만 미션을 수정할 수 있습니다.');
    }

    if (!db) {
      throw new Error('Firebase가 초기화되지 않았습니다.');
    }

    try {
      await updateMissionInFirebase(
        missionId,
        title,
        description,
        rewardPoint,
        dueDate,
        missionType,
        isRepeat,
        repeatDays,
        repeatStartDate,
        repeatEndDate,
        user.id
      );
      // 실시간 구독으로 자동으로 missions 상태 업데이트됨
    } catch (error) {
      throw error;
    }
  };

  /**
   * 미진행으로 처리
   */
  const markMissionAsNotCompleted = async (missionId: string): Promise<void> => {
    if (!user || user.role !== 'PARENT') {
      throw new Error('부모만 미션을 미진행으로 처리할 수 있습니다.');
    }

    if (!db) {
      throw new Error('Firebase가 초기화되지 않았습니다.');
    }

    try {
      await markMissionAsNotCompletedInFirebase(missionId, user.id);
      // 실시간 구독으로 자동으로 missions 상태 업데이트됨
    } catch (error) {
      throw error;
    }
  };

  // ==========================================================================
  // 개발용 임시 로그인 함수
  // ==========================================================================
  // 
  // Firebase Auth가 있으면 자동으로 무시됩니다.
  // Firebase Auth가 없을 때만 사용됩니다 (fallback 용도).
  // 
  // 현재 용도:
  // - Firebase가 없을 때 자동으로 호출됨
  // - 개발/테스트 목적으로 수동 호출 가능
  // 
  // Firebase 연동 시:
  // - Firebase Auth가 있으면 tempLogin은 무시됨
  // - Firebase Auth가 없을 때만 tempLogin 사용 (fallback)
  // ==========================================================================

  const tempLogin = () => {
    // Firebase Auth가 있으면 tempLogin 무시 (Firebase Auth 우선)
    if (auth) {
      return;
    }

    setIsTempLogin(true);
    setUser(initialParentUser);
    setMissions(initialMissions);
    setLoading(false);
  };

  const tempLoginChild = () => {
    // Firebase Auth가 있으면 tempLoginChild 무시 (Firebase Auth 우선)
    if (auth) {
      return;
    }

    setIsTempLogin(true);
    setUser(initialUser);
    setMissions(initialMissions);
    setLoading(false);
  };

  // ==========================================================================
  // 최종 안전장치: 무한 로딩 방지
  // ==========================================================================
  // 
  // mount 시 1초 후에도 loading이 true면 강제로 false로 설정
  // 모든 다른 경로(Firebase, tempLogin)가 실패해도 최대 1초 후에는 반드시 해제
  // ==========================================================================

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setLoading((prevLoading) => {
        if (!prevLoading) return prevLoading;
        return false;
      });
    }, 1000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, []); // 마운트 시 한 번만 실행

  // ==========================================================================
  // Context Provider
  // ==========================================================================

  return (
    <AppContext.Provider
      value={{
      user,
      missions,
      loading,
      isAuthChecked,
      isAuthLoading,
      authLoading,
      selectedChildId,
        setSelectedChildId,
        lastRewardPoint,
        setLastRewardPoint,
        isParentVerified,
        setIsParentVerified,
        deviceRole,
        hasSelectedRole,
        setDeviceRole,
        submitMission,
        approveMission,
        partialApproveMission,
        rejectMission,
        createMission,
        deleteMission,
        retryMission,
        requestRetry,
        requestRetryByParent,
        approveRetry,
        rejectRetry,
        updateMission,
        markMissionAsNotCompleted,
        tempLogin,
        tempLoginChild,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

// ============================================================================
// useApp Hook
// ============================================================================

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

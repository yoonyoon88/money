import React, { useMemo, useEffect, useState, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { db } from '../firebase/config';
import { getUser, subscribeUser } from '../firebase/users';
import { subscribeChildMissions, checkAndUpdateExpiredMissions } from '../firebase/missions';
import { subscribeWishlist, addWishItem, deleteWishItem, WishItem } from '../firebase/wishlist';
import { Mission } from '../types';
import MissionCard from './MissionCard';
import PinInput from './PinInput';
import AppInfoModal from './AppInfoModal';
import Toast from './Toast';
import TimeDebugPanel from './TimeDebugPanel';
import { useApp } from '../context/AppContext';
import { isDebugTimeEnabled, debugLog, debugWarn } from '../utils/debug';
import { getInterpretedStatus, isParentRequestedRetry, isChildRetrying } from '../utils/missionStatusUtils';
import PageLayout from './PageLayout';
import { NORMAL_HEADER_HEIGHT } from '../constants/layout';

// 아이 기준 수행 가능한 미션 상태 목록
// - TODO: 아직 시작하지 않은 미션
// - IN_PROGRESS: 아이가 진행 중인 미션
// - RESUBMITTED: 부모가 '다시 해볼까'를 눌러 아이가 재도전 요청한 상태
// 하위 호환성: REQUEST(RESUBMITTED), RETRY_REQUESTED(RESUBMITTED)
// 아이 기준 수행 가능한 미션 상태 목록
// - TODO: 아직 시작하지 않은 미션
// - IN_PROGRESS: 아이가 진행 중인 미션
// - RESUBMITTED: 부모가 '다시 해볼까'를 눌러 아이가 재도전 요청한 상태 (부모가 요청한 경우만)
// 하위 호환성: REQUEST(RESUBMITTED), RETRY_REQUESTED(RESUBMITTED)
const PERFORMABLE_STATUSES = [
  'TODO',              // 아직 시작하지 않은 미션
  'IN_PROGRESS',       // 아이가 진행 중인 미션
  'RESUBMITTED',       // 부모가 '다시 해볼까'를 눌러 아이가 재도전 요청한 상태
  'REQUEST',           // RESUBMITTED와 동일 의미 (하위 호환성)
  'RETRY_REQUESTED',   // RESUBMITTED와 동일 의미 (하위 호환성)
] as const;

// 미션 상태 정의 (정합성 필수)
// Firestore mission.status 값은 아래로 통일
// - TODO: 아직 시작하지 않은 미션
// - IN_PROGRESS: 아이가 진행 중인 미션
// - SUBMITTED: 아이가 결과를 제출했고 부모 확인을 기다리는 상태
// - RESUBMITTED: 부모가 '다시 해볼까'를 눌러 아이가 재도전 요청한 상태
// - APPROVED: 부모가 승인 완료한 상태
// - COMPLETED: 승인까지 끝나고 기록용으로 완료된 상태

// 아이 화면에서 표시 가능한 미션 상태 목록
const CHILD_VISIBLE_STATUSES = [
  'TODO',              // 아직 시작하지 않은 미션
  'IN_PROGRESS',       // 아이가 진행 중인 미션
  'SUBMITTED',         // 아이가 결과를 제출했고 부모 확인을 기다리는 상태
  'RESUBMITTED',       // 부모가 '다시 해볼까'를 눌러 아이가 재도전 요청한 상태
  'APPROVED',          // 부모가 승인 완료한 상태
  'COMPLETED',         // 승인까지 끝나고 기록용으로 완료된 상태
  'EXPIRED',           // 기한 초과
  // 하위 호환성
  'REQUEST',           // RESUBMITTED와 동일 의미
  'RETRY_REQUESTED',   // RESUBMITTED와 동일 의미
  'PENDING_REVIEW',    // SUBMITTED와 동일 의미
  'REJECTED',          // 하위 호환성
] as const;

/**
 * 아이 전용 홈 화면
 * - URL 파라미터로 childId를 받아서 해당 자녀의 미션만 표시
 * - AppContext를 사용하지 않고 childId 기준으로 직접 Firestore 구독
 * - 아이 이름, 누적 포인트 표시
 * - 오늘의 할 일 (오늘 마감 미션 - TODO/SUBMITTED 상태)
 * - 예정된 미션 (오늘 이후 마감 미션)
 * - isPreview 모드: 부모가 아이 화면을 미리보기하는 읽기 전용 모드
 */
const ChildHome: React.FC = () => {
  const { childId } = useParams<{ childId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, setIsParentVerified, deviceRole, requestRetry } = useApp();
  
  // 미리보기 모드 확인 (location.state에서 전달)
  const isPreview = (location.state as { isPreview?: boolean })?.isPreview || false;
  
  // 로컬 상태
  const [childName, setChildName] = useState<string | null>(null);
  const [childGender, setChildGender] = useState<string | undefined>(undefined);
  const [totalPoint, setTotalPoint] = useState<number>(0);
  const [allMissions, setAllMissions] = useState<Mission[]>([]); // 모든 미션 (필터링 전)
  const [nowMs, setNowMs] = useState<number>(Date.now()); // 현재 시간 (밀리초, 리렌더링 트리거용)
  const [currentTime, setCurrentTime] = useState<number>(Date.now()); // 현재 시간 (리렌더링 트리거용) - 하위 호환성
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'today' | 'all' | 'week' | 'completed'>('today');
  const [showPinInput, setShowPinInput] = useState<boolean>(false); // PIN 입력 모달 표시 여부
  const [familyId, setFamilyId] = useState<string | null>(null); // 부모 ID (familyId로 사용)
  
  // 애니메이션 상태
  const [isAnimating, setIsAnimating] = useState(false);
  const [floatingText, setFloatingText] = useState<string | null>(null);
  const [displayPoint, setDisplayPoint] = useState<number>(0);
  const pointRef = useRef<HTMLDivElement>(null);
  const [showPointInfo, setShowPointInfo] = useState<boolean>(false);
  const [showPointInfoSheet, setShowPointInfoSheet] = useState<boolean>(false); // 포인트 설명 바텀시트 표시 여부
  const [wishlist, setWishlist] = useState<WishItem[]>([]);
  const [newWishText, setNewWishText] = useState<string>('');
  const [isAddingWish, setIsAddingWish] = useState<boolean>(false);
  const [showWishPanel, setShowWishPanel] = useState<boolean>(false); // 소원 패널 표시 여부
  const wishInputRef = useRef<HTMLInputElement>(null); // 소원 입력창 ref
  const [hasShared, setHasShared] = useState<boolean>(false); // 공유 완료 여부
  const [showShareMessage, setShowShareMessage] = useState<boolean>(false); // 공유 후 메시지 표시 여부
  const [showAppInfo, setShowAppInfo] = useState<boolean>(false); // 앱 정보 모달 표시 여부
  const [toastMessage, setToastMessage] = useState<string | null>(null); // 토스트 메시지

  // location.state에서 역할 전환 Toast 메시지 확인 (1회성)
  useEffect(() => {
    const state = location.state as { toastMessage?: string; isRoleSwitch?: boolean } | null;
    // 역할 전환 시에만 Toast 표시 (부모 → 아이 전환)
    if (state?.toastMessage && state?.isRoleSwitch) {
      setToastMessage(state.toastMessage);
      // state를 즉시 초기화하여 뒤로가기 시 다시 표시되지 않도록
      window.history.replaceState({}, '');
      // 2초 후 자동으로 Toast 닫기 (Toast 컴포넌트에서도 처리되지만 명시적으로 처리)
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [location.state]);

  // 보호자 버튼 클릭 핸들러 (PIN 인증 후 보호자 화면으로 전환)
  const handleParentButtonClick = () => {
    // PIN 입력 화면 표시
    setShowPinInput(true);
  };

  // PIN 입력 성공 핸들러
  const handlePinSuccess = () => {
    setIsParentVerified(true);
    setShowPinInput(false);
    // PIN 검증 성공 시 보호자 홈으로 이동
    navigate('/parent', { replace: true });
  };

  // childId가 없으면 에러
  if (!childId) {
    return (
      <div className="min-h-screen bg-[#FFFEF9] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg mb-2">자녀 정보를 찾을 수 없습니다.</p>
          <button
            onClick={() => navigate('/role-select')}
            className="text-blue-500 hover:underline"
          >
            역할 선택으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  // 자녀 정보 조회 (users/{childId})
  useEffect(() => {
    if (!childId || !db) {
      setLoading(false);
      return;
    }

    debugLog('[ChildHome] 자녀 정보 조회 시작:', { childId });

    // 자녀 정보 조회
    getUser(childId)
      .then((childUser) => {
        if (childUser) {
          setChildName(childUser.name);
          setTotalPoint(childUser.totalPoint || 0);
          setDisplayPoint(childUser.totalPoint || 0);
          // Firestore에서 gender 필드 가져오기 (타입에 없을 수 있으므로 any로 접근)
          const childData = childUser as any;
          setChildGender(childData.gender || undefined);
          // parentId를 familyId로 사용
          setFamilyId(childUser.parentId || null);
          debugLog('[ChildHome] 자녀 정보 조회 완료:', {
            childId,
            name: childUser.name,
            totalPoint: childUser.totalPoint,
            gender: childData.gender,
            parentId: childUser.parentId,
          });
        } else {
          debugWarn('[ChildHome] 자녀 정보를 찾을 수 없습니다:', childId);
          setChildName(null);
          setChildGender(undefined);
          setTotalPoint(0);
          setDisplayPoint(0);
          setFamilyId(null);
        }
        setLoading(false);
      })
      .catch((error) => {
        setChildName(null);
        setChildGender(undefined);
        setTotalPoint(0);
        setDisplayPoint(0);
        setFamilyId(null);
        setLoading(false);
      });
  }, [childId]);


  // childId 변경 시 탭을 [오늘]로 초기화
  useEffect(() => {
    setActiveTab('today');
  }, [childId]);

  // 미션 실시간 구독 (childId 기준, 모든 상태 포함)
  useEffect(() => {
    if (!childId || !db) {
      setAllMissions([]);
      return;
    }

    debugLog('[ChildHome] 미션 구독 시작:', { childId });

    const unsubscribe = subscribeChildMissions(childId, (missions) => {
      debugLog('[ChildHome] 미션 업데이트:', {
        childId,
        total: missions.length,
        activeMissions: missions.filter(m => m.status === 'TODO' || m.status === 'IN_PROGRESS').length,
        expiredMissions: missions.filter(m => m.status === 'EXPIRED').length,
        missions: missions.map(m => ({
          id: m.id,
          title: m.title,
          status: m.status,
          dueAt: m.dueAt,
          dueAtParsed: new Date(m.dueAt).toLocaleString('ko-KR'),
        })),
      });
      setAllMissions(missions);
    });

    // cleanup: childId가 변경되면 이전 구독 해제
    return () => {
      debugLog('[ChildHome] 미션 구독 해제:', { childId });
      unsubscribe();
    };
  }, [childId]);

  // 현재 시간을 주기적으로 업데이트 (1초마다) - 즉시 반영을 위해
  // 절대 조건: 시간 변화만으로는 리렌더가 발생하지 않기 때문에 state로 관리
  useEffect(() => {
    // 즉시 한 번 실행 (마운트 시)
    const initialTime = Date.now();
    setNowMs(initialTime);
    setCurrentTime(initialTime); // 하위 호환성
    debugLog('[ChildHome] 초기 시간 설정:', new Date(initialTime).toLocaleString('ko-KR'));
    
    // 1초마다 업데이트 (더 빠른 반응성)
    const interval = setInterval(() => {
      const newTime = Date.now();
      // state 업데이트로 리렌더 트리거
      setNowMs(newTime);
      setCurrentTime(newTime); // 하위 호환성
      
      // 매 10초마다만 로그 출력 (너무 많은 로그 방지)
      if (newTime % 10000 < 1000) {
        debugLog('[ChildHome] 현재 시간 업데이트:', {
          nowMs: newTime,
          local: new Date(newTime).toLocaleString('ko-KR'),
          iso: new Date(newTime).toISOString(),
        });
      }
    }, 1000); // 1초마다 업데이트

    return () => clearInterval(interval);
  }, []);

  // 마감 체크: allMissions 또는 nowMs가 변경될 때마다 마감 처리 적용
  // nowMs state가 변경되면 useMemo가 재실행되어 상태 판정 로직이 재실행됨
  const checkedMissions = useMemo(() => {
    const now = new Date(nowMs);
    const checked = checkAndUpdateExpiredMissions(allMissions, now);
    
    // 디버깅: 상태가 변경된 미션 확인
    const changedMissions = checked.filter((checkedMission, index) => {
      const original = allMissions[index];
      return original && original.status !== checkedMission.status;
    });
    
    if (changedMissions.length > 0) {
      debugLog('[ChildHome] 상태 변경된 미션:', changedMissions.map(m => ({
        id: m.id,
        title: m.title,
        oldStatus: allMissions.find(om => om.id === m.id)?.status,
        newStatus: m.status,
        dueAt: m.dueAt,
        nowMs: new Date(nowMs).toLocaleString('ko-KR'),
        currentTime: new Date(nowMs).toLocaleString('ko-KR'),
      })));
    }
    
    return checked;
  }, [allMissions, nowMs]); // nowMs를 dependency로 사용하여 시간 변화 시 재실행

  // 오늘 탭: dueDate가 오늘인 미션 (status 무관, 완료 포함)
  // TODO: 반복 미션 기능은 출시 이후 재도입 예정. 현재는 단일 미션만 지원
  const todayMissions = useMemo(() => {
    if (!childId) return [];
    const now = new Date(nowMs);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    today.setHours(0, 0, 0, 0);

    const filtered = checkedMissions.filter((mission) => {
      // 1. 반복 미션 제외 (출시 버전에서는 반복 미션 미지원)
      if (mission.isRepeat === true && mission.missionType === 'DAILY') {
        return false;
      }
      
      // 2. 아이 화면 허용 상태인지 확인
      if (!CHILD_VISIBLE_STATUSES.includes(mission.status as any)) {
        return false;
      }
      
      // 3. 오늘 날짜인 미션만 포함 (로컬 시간 기준, status 무관)
      const dueAt = new Date(mission.dueAt);
      const missionDate = new Date(dueAt.getFullYear(), dueAt.getMonth(), dueAt.getDate());
      missionDate.setHours(0, 0, 0, 0);
      
      const isToday = missionDate.getTime() === today.getTime();
      return isToday;
    });

    return filtered;
  }, [checkedMissions, childId, nowMs]);

  // 전체 탭: 아이 화면 허용 상태의 모든 미션 (기간 필터 없음, 상태 무관)
  // TODO: 반복 미션 기능은 출시 이후 재도입 예정. 현재는 단일 미션만 지원
  // 재도전 미션은 항상 새로운 미션으로 취급 (retryOfMissionId는 필터 기준에서 제외)
  const activeMissions = useMemo(() => {
    if (!childId) return [];
    
    const filtered = checkedMissions.filter((mission) => {
      // 1. 반복 미션 제외 (출시 버전에서는 반복 미션 미지원)
      if (mission.isRepeat === true && mission.missionType === 'DAILY') {
        return false;
      }
      
      // 2. 아이 화면 허용 상태만 필터링 (재도전 미션 포함)
      // retryOfMissionId는 필터 기준에서 제외 - 재도전 미션도 새로운 미션으로 취급
      return CHILD_VISIBLE_STATUSES.includes(mission.status as any);
    });

    return filtered;
  }, [checkedMissions, childId]);

  // 완료 탭: status === APPROVED 인 미션만 표시
  // TODO: 반복 미션 기능은 출시 이후 재도입 예정. 현재는 단일 미션만 지원
  const completedMissions = useMemo(() => {
    if (!childId) return [];
    return checkedMissions.filter((mission) => {
      // 1. 반복 미션 제외 (출시 버전에서는 반복 미션 미지원)
      if (mission.isRepeat === true && mission.missionType === 'DAILY') {
        return false;
      }
      
      // 2. APPROVED 또는 하위 호환성 상태
      return mission.status === 'APPROVED' || 
             mission.status === 'COMPLETED';
    });
  }, [checkedMissions, childId]);

  // 이번 주 탭: dueDate가 이번 주에 포함된 미션만 표시
  // TODO: 반복 미션 기능은 출시 이후 재도입 예정. 현재는 단일 미션만 지원
  // 필터 조건: dueDate가 이번 주(startOfWeek ~ endOfWeek) 범위에 포함된 미션
  const weekMissions = useMemo(() => {
    if (!childId) return [];
    const now = new Date(nowMs);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // 이번 주 월요일 계산 (로컬 시간 기준)
    const dayOfWeek = today.getDay(); // 0(일) ~ 6(토)
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 일요일이면 -6, 아니면 1-dayOfWeek
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    
    // 이번 주 일요일 계산
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const filtered = checkedMissions.filter((mission) => {
      // 1. 반복 미션 제외 (출시 버전에서는 반복 미션 미지원)
      if (mission.isRepeat === true && mission.missionType === 'DAILY') {
        return false;
      }
      
      // 2. 아이 화면 허용 상태인지 확인
      if (!CHILD_VISIBLE_STATUSES.includes(mission.status as any)) {
        return false;
      }
      
      // 3. 이번 주 날짜인 미션만 포함 (로컬 시간 기준, status 무관)
      const dueAt = new Date(mission.dueAt);
      return dueAt >= monday && dueAt <= sunday;
    });

    return filtered;
  }, [checkedMissions, childId, nowMs]);

  // 현재 탭에 표시할 미션 목록
  // TODO: 반복 미션 기능은 출시 이후 재도입 예정. 현재는 단일 미션만 지원
  // 필터 기준:
  // - 전체: 모든 상태 표시
  // - 오늘: dueDate가 오늘인 미션 (status 무관, 완료 포함)
  // - 이번 주: dueDate가 이번 주에 포함된 미션 (status 무관, 완료 포함)
  // - 완료: APPROVED, COMPLETED 상태 미션만 표시
  const displayMissions = useMemo(() => {
    let result: Mission[] = [];
    
    if (activeTab === 'today') {
      // 오늘 탭: dueDate가 오늘인 미션 (status 무관)
      result = todayMissions;
    } else if (activeTab === 'week') {
      // 이번 주 탭: dueDate가 이번 주에 포함된 미션 (status 무관)
      result = weekMissions;
    } else if (activeTab === 'completed') {
      // 완료 탭: APPROVED, COMPLETED 상태 미션만
      result = completedMissions;
    } else {
      // 전체 탭: 모든 상태 (CHILD_VISIBLE_STATUSES만 필터)
      result = activeMissions;
    }

    return result;
  }, [activeTab, todayMissions, weekMissions, activeMissions, completedMissions]);

  // 오늘 할 미션 개수 (TODO 또는 IN_PROGRESS 상태)
  const todayTodoCount = useMemo(() => {
    return todayMissions.filter((mission) => (mission.status === 'TODO' || mission.status === 'IN_PROGRESS') && !mission.isDeleted).length;
  }, [todayMissions]);

  // 오늘 확인 중(SUBMITTED) 미션 개수
  const todayPendingCount = useMemo(() => {
    return todayMissions.filter((mission) => mission.status === 'SUBMITTED' && !mission.isDeleted).length;
  }, [todayMissions]);

  // 오늘 완료한 미션 개수와 획득한 포인트
  const todayCompletedInfo = useMemo(() => {
    const completed = todayMissions.filter(
      (mission) => (mission.status === 'APPROVED' || mission.status === 'COMPLETED') && !mission.isDeleted
    );
    const completedCount = completed.length;
    const earnedPoint = completed.reduce((sum, mission) => sum + (mission.rewardPoint || 0), 0);
    return { completedCount, earnedPoint };
  }, [todayMissions]);

  // 공유 버튼 노출 조건: 완료한 미션 1개 이상 && 확인 중 미션 0개
  const shouldShowShareButton = useMemo(() => {
    return todayCompletedInfo.completedCount >= 1 && todayPendingCount === 0 && !hasShared;
  }, [todayCompletedInfo.completedCount, todayPendingCount, hasShared]);

  // 공유 텍스트 생성 함수
  const generateShareText = (): string => {
    const { completedCount, earnedPoint } = todayCompletedInfo;
    return `🎉 오늘 미션을 모두 완료했어요!
✔️ 미션 ${completedCount}개 완료
✨ ${earnedPoint}P 획득

아이와 약속을 지키는 하루 🙂`;
  };

  // 공유하기 핸들러
  const handleShare = async () => {
    const shareText = generateShareText();

    // Web Share API 지원 확인
    if (navigator.share) {
      try {
        await navigator.share({
          text: shareText,
        });
        // 공유 성공
        setHasShared(true);
        setShowShareMessage(true);
      } catch (error: any) {
        // 사용자가 공유를 취소한 경우는 에러로 처리하지 않음
        if (error.name !== 'AbortError') {
          // Web Share API 실패 시 클립보드로 fallback
          await handleClipboardShare(shareText);
        }
      }
    } else {
      // Web Share API 미지원 시 클립보드로 fallback
      await handleClipboardShare(shareText);
    }
  };

  // 클립보드 공유 fallback
  const handleClipboardShare = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // 클립보드 복사 성공
      setHasShared(true);
      setShowShareMessage(true);
    } catch (error) {
      alert('공유에 실패했습니다. 다시 시도해주세요.');
    }
  };

  // 포인트 실시간 업데이트 (자녀 정보 구독)
  useEffect(() => {
    if (!childId || !db) {
      return;
    }

    const unsubscribe = subscribeUser(childId, (childUser) => {
      if (childUser) {
        const newPoint = childUser.totalPoint || 0;
        const oldPoint = totalPoint;
        
        // 포인트가 증가한 경우 애니메이션
        if (newPoint > oldPoint && oldPoint > 0) {
          const rewardPoint = newPoint - oldPoint;
          setIsAnimating(true);
          setFloatingText(`+${rewardPoint}P`);
          
          const duration = 1000; // 1초
          const startTime = Date.now();

          const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const currentPoint = Math.floor(oldPoint + (newPoint - oldPoint) * progress);
            setDisplayPoint(currentPoint);

            if (progress < 1) {
              requestAnimationFrame(animate);
            } else {
              setIsAnimating(false);
              setFloatingText(null);
            }
          };

          requestAnimationFrame(animate);
        } else {
          setDisplayPoint(newPoint);
        }
        
        setTotalPoint(newPoint);
        setChildName(childUser.name);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [childId, totalPoint]);

  // 하고 싶은 리스트 구독
  useEffect(() => {
    if (!childId) {
      setWishlist([]);
      return;
    }

    const unsubscribe = subscribeWishlist(childId, (items) => {
      setWishlist(items);
    });

    return () => {
      unsubscribe();
    };
  }, [childId]);

  // loading 중이면 로딩 UI 표시
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFEF9] flex items-center justify-center">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    );
  }

  // 자녀 이름 (state의 childName이 있으면 사용, 없으면 기본값)
  const displayChildName = childName || '자녀';

  // PIN 입력 모달 표시
  if (showPinInput) {
    return (
      <PinInput
        onSuccess={handlePinSuccess}
        onCancel={() => {
          setShowPinInput(false);
        }}
        title="PIN 입력"
        description="보호자 화면에 접근하려면 PIN을 입력해주세요"
      />
    );
  }

  // 보호자 버튼 표시 여부: 아이 기기로 설정된 경우에만 표시 (preview 모드에서는 제외)
  const showParentButton = !isPreview && deviceRole === 'CHILD' && user && user.role === 'PARENT';

  // 미리보기 모드 닫기 핸들러
  const handleClosePreview = () => {
    navigate('/parent', { replace: true });
  };

  return (
    <PageLayout headerHeight={NORMAL_HEADER_HEIGHT} className="pb-8">
      {/* 포인트 강조 영역 - 상단 최우선 표시 */}
      <div className="bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 px-5 pt-6 pb-6">
        {/* 상단 버튼 영역 - 미리보기 닫기 / 보호자 버튼 */}
        <div className="flex items-center justify-end mb-4">
          {/* 미리보기 모드: 닫기 버튼 */}
          {isPreview && (
            <button
              onClick={handleClosePreview}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm transition-colors"
              aria-label="닫기"
            >
              <svg 
                className="w-6 h-6 text-white" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M6 18L18 6M6 6l12 12" 
                />
              </svg>
            </button>
          )}
          {/* 보호자 버튼 - 우측 상단 (아이 기기로 설정된 경우에만 표시, 미리보기 모드에서는 제외) */}
          {showParentButton && (
            <button
              onClick={handleParentButtonClick}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-white/90 hover:text-white hover:bg-white/20 rounded-lg transition-colors backdrop-blur-sm"
              aria-label="보호자"
            >
              <svg 
                className="w-4 h-4" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" 
                />
              </svg>
              <span className="font-medium">보호자</span>
            </button>
          )}
        </div>
        
        {/* 포인트 표시 - 크게 강조 (클릭 가능) */}
        <button
          onClick={() => {
            if (childId) {
              navigate(`/points/history?childId=${childId}`);
            }
          }}
          className="flex flex-col items-center justify-center w-full cursor-pointer hover:opacity-90 transition-opacity"
        >
          <div className="flex items-center gap-3 mb-2">
            <svg className="w-10 h-10 text-yellow-900" fill="currentColor" viewBox="0 0 20 20">
              <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
            </svg>
            <div className="relative flex items-baseline gap-2" ref={pointRef}>
              <span className="text-5xl font-extrabold text-yellow-900 drop-shadow-lg">
                {displayPoint.toLocaleString()}
              </span>
              <span className="text-3xl font-bold text-yellow-800">P</span>
              {/* 포인트 설명 아이콘 (미리보기 모드에서는 비활성화) */}
              {!isPreview && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPointInfoSheet(true);
                  }}
                  className="text-yellow-800/60 hover:text-yellow-800/80 transition-colors cursor-pointer"
                  aria-label="포인트 설명"
                >
                  <span className="text-lg leading-none">ⓘ</span>
                </div>
              )}
              {floatingText && (
                <span
                  className={`absolute -top-10 left-1/2 transform -translate-x-1/2 text-2xl font-bold text-green-600 animate-bounce ${
                    isAnimating ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{
                    animation: 'floatUp 1s ease-out forwards',
                  }}
                >
                  {floatingText}
                </span>
              )}
            </div>
          </div>
          {/* 포인트 설명 텍스트 (선택사항) */}
          <p className="text-sm text-yellow-900/80 font-medium">포인트내역</p>
        </button>
      </div>

      {/* 공유 영역 (한 줄 요약 형태) */}
      {shouldShowShareButton && (
        <div className="px-5 mt-4">
          <div className="bg-pink-50 rounded-xl border border-pink-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">
                완료한 미션 {todayCompletedInfo.completedCount}개 · +{todayCompletedInfo.earnedPoint}P 획득
              </span>
              {!isPreview && (
                <button
                  onClick={handleShare}
                  className="w-8 h-8 rounded-full border-2 border-pink-400 bg-white hover:bg-pink-50 flex items-center justify-center transition-colors flex-shrink-0 ml-3"
                  aria-label="공유하기"
                >
                  <svg className="w-4 h-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 공유 후 메시지 */}
      {showShareMessage && (
        <div className="px-5 mt-4">
          <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4">
            <p className="text-sm text-gray-700 mb-3">
              이 기록을 남긴 방법이 궁금하다면
            </p>
            <button
              onClick={() => setShowAppInfo(true)}
              className="text-sm font-semibold text-blue-600 hover:text-blue-700 underline"
            >
              앱 정보 보기
            </button>
          </div>
        </div>
      )}

      {/* 내 소원 보기 영역 (미리보기 모드에서는 비활성화) - 인라인 확장 방식 */}
      {!isPreview && (
        <div className="px-5 mt-4">
          <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm overflow-hidden">
            {/* 소원 보기 버튼 (1줄) */}
            <button
              onClick={() => setShowWishPanel(!showWishPanel)}
              className="w-full py-3 px-4 hover:bg-gray-50 transition-colors flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">🎁</span>
                <span className="text-base font-medium text-gray-800">내 소원 보기</span>
              </div>
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform ${showWishPanel ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* 소원 패널 (인라인 확장) */}
            {showWishPanel && (
              <div className="border-t border-gray-200">
                {/* 소원 리스트 */}
                <div className="px-4 py-3 max-h-64 overflow-y-auto">
                  {wishlist.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">
                      소원이 없어요
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {wishlist.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <p className="text-sm text-gray-700 flex-1 truncate pr-2">{item.text}</p>
                          <div
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await deleteWishItem(item.id);
                              } catch (error) {
                                alert('삭제에 실패했어요');
                              }
                            }}
                            className="p-1.5 hover:bg-gray-200 rounded-full transition-colors flex-shrink-0 cursor-pointer"
                            aria-label="소원 삭제"
                          >
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 소원 개수 제한 안내 */}
                {wishlist.length >= 3 && (
                  <div className="px-4 pb-2">
                    <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-xs text-yellow-700 text-center">
                        소원은 최대 3개까지 작성할 수 있어요
                      </p>
                    </div>
                  </div>
                )}

                {/* 소원 입력 영역 */}
                <div className="px-4 pb-4 pt-2 border-t border-gray-100">
                  <div className="flex gap-2">
                    <input
                      ref={wishInputRef}
                      type="text"
                      value={newWishText}
                      onChange={(e) => setNewWishText(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && newWishText.trim() && !isAddingWish && wishlist.length < 3) {
                          e.preventDefault();
                          setIsAddingWish(true);
                          try {
                            if (childId) {
                              await addWishItem(childId, newWishText);
                              setNewWishText('');
                            }
                          } catch (error) {
                            alert('추가에 실패했어요');
                          } finally {
                            setIsAddingWish(false);
                          }
                        }
                      }}
                      placeholder="소원을 입력하세요"
                      disabled={isAddingWish || wishlist.length >= 3}
                      className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 text-sm disabled:bg-gray-50 disabled:cursor-not-allowed"
                    />
                    <button
                      onClick={async () => {
                        if (!newWishText.trim() || isAddingWish || wishlist.length >= 3) return;
                        setIsAddingWish(true);
                        try {
                          if (childId) {
                            await addWishItem(childId, newWishText);
                            setNewWishText('');
                          }
                        } catch (error) {
                          alert('추가에 실패했어요');
                        } finally {
                          setIsAddingWish(false);
                        }
                      }}
                      disabled={!newWishText.trim() || isAddingWish || wishlist.length >= 3}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      추가
                    </button>
                  </div>
                  
                  {/* 안내 문구 */}
                  <p className="text-xs text-gray-400 text-center mt-2 leading-relaxed">
                    소원은 약속이 아니에요 🙂<br />
                    부모가 참고해서 미션이나 보상으로 만들어줄 수 있어요.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 탭 네비게이션 */}
      <div className="px-5 mt-6">
        <div className="flex gap-2 bg-white rounded-2xl p-1 border-2 border-gray-200">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 py-3 px-4 rounded-xl text-base font-medium transition-colors whitespace-nowrap min-w-0 ${
              activeTab === 'all'
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            모두
          </button>
          <button
            onClick={() => setActiveTab('today')}
            className={`flex-1 py-3 px-4 rounded-xl text-base font-medium transition-colors whitespace-nowrap min-w-0 ${
              activeTab === 'today'
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            오늘
          </button>
          <button
            onClick={() => setActiveTab('week')}
            className={`flex-1 py-3 px-4 rounded-xl text-base font-medium transition-colors whitespace-nowrap min-w-0 ${
              activeTab === 'week'
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            이번 주
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`flex-1 py-3 px-4 rounded-xl text-base font-medium transition-colors whitespace-nowrap min-w-0 ${
              activeTab === 'completed'
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            완료
          </button>
        </div>
      </div>

      {/* 탭 컨텐츠 */}
      <div className="px-5 mt-6">
        {displayMissions.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border-2 border-dashed border-gray-200">
            {/* 성별에 따른 빈 상태 아이콘 */}
            <div className="w-32 h-32 rounded-2xl overflow-hidden flex items-center justify-center bg-yellow-200 mx-auto mb-4">
              <img 
                src={childGender === 'male' ? '/boy.png' : '/girl.png'}
                alt="빈 상태"
                className="w-full h-full object-cover rounded-2xl"
                onError={(e) => {
                  // 이미지 로드 실패 시 대체 UI
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    parent.innerHTML = `
                      <div class="w-full h-full flex items-center justify-center bg-yellow-200 rounded-2xl">
                        <span class="text-4xl">👶</span>
                      </div>
                    `;
                  }
                }}
              />
            </div>
            <p className="text-gray-400 text-base">
              {activeTab === 'today' && '오늘은 미션이 없어요 😊'}
              {activeTab === 'all' && '진행 중인 미션이 없어요'}
              {activeTab === 'week' && '이번 주 미션이 없어요'}
              {activeTab === 'completed' && '완료된 미션이 없어요'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayMissions.map((mission) => (
              <MissionCard
                key={mission.id}
                mission={mission}
                isPreview={isPreview}
                {...(isPreview ? {} : {
                  onClick: () => {
                    // 클릭 가능 여부 규칙:
                    // - TODO: 클릭 가능, 미션 수정/제출 화면으로 이동 가능
                    // - IN_PROGRESS: 클릭 가능, 수행 화면으로 이동
                    // - RESUBMITTED (부모가 요청한 경우): 클릭 가능, 미션 다시 수행 화면으로 이동
                    // - SUBMITTED: 클릭 시 알림 표시
                    // - APPROVED/COMPLETED: 클릭 불가 (비활성)
                    const interpretedStatus = getInterpretedStatus(mission);
                    if (interpretedStatus === 'SUBMITTED') {
                      alert('이미 결과를 제출했어요. 부모의 확인을 기다려 주세요 🙂');
                      return;
                    }
                    
                    // 수행 가능한 상태: TODO, IN_PROGRESS, 또는 부모가 재도전 요청한 경우
                    const isParentRetry = isParentRequestedRetry(mission);
                    const isChildRetryingNow = isChildRetrying(mission);
                    if (
                      interpretedStatus === 'TODO' ||
                      interpretedStatus === 'IN_PROGRESS' ||
                      isParentRetry ||
                      isChildRetryingNow ||
                      PERFORMABLE_STATUSES.includes(mission.status as any)
                    ) {
                      navigate(`/child-mission/${mission.id}`, {
                        state: { from: `/child/${childId}`, childId },
                      });
                    }
                  },
                  onRetryRequest: async (missionId: string) => {
                    try {
                      // childId를 전달하여 해당 아이의 권한으로 재도전 요청
                      if (!childId) {
                        setToastMessage('아이 정보를 찾을 수 없어요.');
                        return;
                      }
                      await requestRetry(missionId, childId);
                      setToastMessage('부모에게 재도전 요청을 보냈어요 🙏');
                    } catch (error) {
                      const errorMessage = error instanceof Error ? error.message : '재도전 요청에 실패했어요. 다시 시도해주세요.';
                      setToastMessage(errorMessage);
                    }
                  },
                })}
                isParentMode={false}
              />
            ))}
          </div>
        )}

      </div>


      {/* 포인트 설명 바텀시트 */}
      {showPointInfoSheet && (
        <>
          {/* 배경 오버레이 */}
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setShowPointInfoSheet(false)}
          />
          {/* 바텀시트 */}
          <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-50">
            {/* 헤더 */}
            <div className="px-5 pt-6 pb-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">포인트</h3>
              <button
                onClick={() => setShowPointInfoSheet(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                aria-label="닫기"
              >
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* 설명 문구 */}
            <div className="px-5 py-6">
              <p className="text-base text-gray-700 leading-relaxed">
                포인트는 부모와 약속한 보상의 기준이에요.<br />
                어떤 보상을 받을지는 가족이 함께 정해보세요.
              </p>
            </div>
          </div>
        </>
      )}

      {/* 앱 정보 모달 */}
      <AppInfoModal
        isOpen={showAppInfo}
        onClose={() => setShowAppInfo(false)}
      />

      {/* 토스트 메시지 */}
      {toastMessage && (
        <Toast
          message={toastMessage}
          type="success"
          onClose={() => setToastMessage(null)}
        />
      )}

      {/* 시간 디버그 패널 (디버그 모드에서만) */}
      {isDebugTimeEnabled && (
        <TimeDebugPanel 
          missionDueAt={checkedMissions.find(m => m.status === 'IN_PROGRESS' || m.status === 'TODO')?.dueAt}
          currentTime={nowMs}
        />
      )}
    </PageLayout>
  );
};

export default ChildHome;

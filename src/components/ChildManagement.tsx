import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import MissionCard from './MissionCard';
import { getUser, deductChildPoint, savePointUsageRecord } from '../firebase/users';
import { subscribeWishlist, completeWishItem, WishItem } from '../firebase/wishlist';
import { db } from '../firebase/config';
import { createMissionTemplate, fetchMissionTemplates, MissionTemplate, deleteMissionTemplate, deleteMissionTemplateBySource } from '../firebase/missionTemplates';
import Character from './Character';
import FixedHeader from './FixedHeader';
import PageLayout from './PageLayout';
import { HEADER_HEIGHT } from '../constants/layout';
import Toast from './Toast';
import PinInput from './PinInput';
import ReviewModal from './ReviewModal';
import CompletedMissionModal from './CompletedMissionModal';
import { getInterpretedStatus, isParentRequestedRetry } from '../utils/missionStatusUtils';
import { canEditMission } from '../utils/permissions';
import { Mission } from '../types';

// 오늘 날짜 문자열 반환 함수 (컴포넌트 외부로 이동하여 TDZ 문제 해결)
const getTodayDateString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 마감일시 포맷팅 함수 (2026년 1월 2일 · 오후 11:00)
const formatDateTime = (date: string, hour: string, minute: string): string => {
  if (!date) return '';
  
  const dateObj = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();
  const hours = parseInt(hour, 10);
  const minutes = parseInt(minute, 10);
  
  // 오전/오후 구분
  const period = hours >= 12 ? '오후' : '오전';
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const displayMinute = String(minutes).padStart(2, '0');
  
  return `${year}년 ${month}월 ${day}일 · ${period} ${displayHour}:${displayMinute}`;
};

const ChildManagement: React.FC = () => {
  // ============================================================================
  // 모든 Hook 선언 (조건부 return 이전에 모두 선언)
  // ============================================================================
  const { childId } = useParams<{ childId: string }>();
  const { user, missions, loading, createMission, updateMission, deleteMission, setSelectedChildId, approveRetry, rejectRetry } = useApp();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED'>('ALL');
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false); // 수정 모달 표시 여부
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null); // 수정 중인 미션 ID
  const [childName, setChildName] = useState<string | null>(null);
  const [childGender, setChildGender] = useState<'male' | 'female' | undefined>(undefined);
  const [toastMessage, setToastMessage] = useState<string | null>(null); // Toast 메시지 상태
  const [showPointModal, setShowPointModal] = useState<boolean>(false);
  const [showPointPinModal, setShowPointPinModal] = useState<boolean>(false);
  const [pointAction, setPointAction] = useState<'deduct' | null>(null);
  const [deductAmount, setDeductAmount] = useState<string>('');
  const [deductReasonType, setDeductReasonType] = useState<string>(''); // 사유 타입 (용돈 지급, 선물 구매, 보상 지급, 기타)
  const [deductReasonCustom, setDeductReasonCustom] = useState<string>(''); // 기타 선택 시 입력 텍스트
  const [childCurrentPoint, setChildCurrentPoint] = useState<number>(0);
  const [wishlist, setWishlist] = useState<WishItem[]>([]);
  const [showWishCompleteModal, setShowWishCompleteModal] = useState<boolean>(false);
  const [wishToComplete, setWishToComplete] = useState<WishItem | null>(null);
  const [showWishDetail, setShowWishDetail] = useState<boolean>(false); // 소원 상세 영역 표시 여부
  const [showPointInfo, setShowPointInfo] = useState<boolean>(false); // 포인트 설명 표시 여부 (토글)
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false); // 삭제 확인 모달 표시 여부
  const [missionToDelete, setMissionToDelete] = useState<string | null>(null); // 삭제할 미션 ID
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false); // 리뷰 모달 표시 여부
  const [completedMission, setCompletedMission] = useState<Mission | null>(null); // 완료 미션 상세 모달
  const [showPointUseModal, setShowPointUseModal] = useState<boolean>(false); // 포인트 사용 모달 표시 여부
  const [rewardType, setRewardType] = useState<string>(''); // 보상 종류 (선물, 용돈, 음식, 기타)
  const [rewardCustomText, setRewardCustomText] = useState<string>(''); // 기타 선택 시 입력 텍스트
  const [deductPointAmount, setDeductPointAmount] = useState<string>(''); // 차감할 포인트
  const [useReason, setUseReason] = useState<string>(''); // 포인트 사용 사유 (선택)
  const [newMission, setNewMission] = useState({
    title: '',
    rewardPoint: 500,
    dueDate: '',
    missionType: 'DAILY' as 'DAILY' | 'WEEKLY',
    description: '',
  });
  /** 포인트 입력 필드용 (맨 앞 0 제거 표시) */
  const [pointInputStr, setPointInputStr] = useState<string>('500');
  // 자주 쓰는 미션 템플릿
  const [missionTemplates, setMissionTemplates] = useState<MissionTemplate[]>([]);
  const [showTemplateSheet, setShowTemplateSheet] = useState<boolean>(false);
  const [isRepeatMission, setIsRepeatMission] = useState<boolean>(false); // 반복 미션 여부
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set()); // 선택된 요일 (0=일, 1=월, ..., 6=토)
  const [repeatStartDate, setRepeatStartDate] = useState<string>(getTodayDateString()); // 반복 시작일 (기본값: 오늘)
  const [hasEndDate, setHasEndDate] = useState<boolean>(false); // 종료일 설정 여부
  const [repeatEndDate, setRepeatEndDate] = useState<string>(''); // 반복 종료일

  // 마감일시 선택을 위한 상태
  // 기본값: 오늘 23시 59분
  const [dueDateParts, setDueDateParts] = useState({
    date: getTodayDateString(),
    hour: '23',
    minute: '59',
  });
  
  // 날짜/시간 선택 모달 표시 여부
  const [showDateTimePicker, setShowDateTimePicker] = useState(false);

  // 미션 추가/수정 모달이 열릴 때 포인트 입력 문자열 동기화
  useEffect(() => {
    if (showCreateModal || showEditModal) {
      setPointInputStr(String(newMission.rewardPoint || ''));
    }
  }, [showCreateModal, showEditModal]);

  // childId가 변경되면 selectedChildId 설정 (미션 구독을 위해)
  useEffect(() => {
    if (childId) {
      setSelectedChildId(childId);
    }
  }, [childId, setSelectedChildId]);

  // 부모용: 자주 쓰는 미션 템플릿 불러오기
  useEffect(() => {
    const loadTemplates = async () => {
      if (!user || user.role !== 'PARENT') return;
      try {
        const list = await fetchMissionTemplates(user.id);
        setMissionTemplates(list);
      } catch {
        // 무시 (템플릿은 선택 기능)
      }
    };
    loadTemplates();
  }, [user]);

  // 자녀 정보 가져오기 및 접근 권한 검증
  useEffect(() => {
    if (!childId || !user) return;

    // 부모인 경우: 자신의 childrenIds에 포함된 자녀만 접근 가능
    if (user.role === 'PARENT') {
      if (!user.childrenIds?.includes(childId)) {
        navigate('/parent');
        return;
      }
    }

    // 자녀 정보 조회
    if (db) {
      getUser(childId).then((childUser) => {
        if (childUser) {
          setChildName(childUser.name);
          setChildCurrentPoint(childUser.totalPoint || 0);
          setChildGender(childUser.gender);
        } else {
          setChildName(null);
          setChildCurrentPoint(0);
          setChildGender(undefined);
        }
      }).catch((error) => {
        setChildName(null);
        setChildCurrentPoint(0);
        setChildGender(undefined);
      });
    }
  }, [childId, user, navigate]);

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

  // 선택된 자녀의 미션만 필터링 (조건부 return 이전에 선언)
  const childMissions = useMemo(() => {
    if (!childId) return [];
    return missions.filter((m) => m.childId === childId);
  }, [missions, childId]);

  // 확인 중 미션 (SUBMITTED) - 상단 강조 표시용
  // 의미: 아이가 미션을 완료하여 제출했고 현재 부모가 확인 중인 상태
  // 승인대기 기준: status === 'SUBMITTED' 단 하나만 사용
  const pendingMissions = useMemo(() => {
    return childMissions.filter(
      (mission) => mission.status === 'SUBMITTED' && !mission.isDeleted
    );
  }, [childMissions]);

  // 필터링된 미션 목록 (삭제된 미션 제외, 반복 미션 제외)
  // TODO: 반복 미션 기능은 출시 이후 재도입 예정. 현재는 단일 미션만 지원
  // 필터 규칙:
  // - 전체: 모든 상태 표시 (단일 미션만)
  // - 확인 중: SUBMITTED, RESUBMITTED
  // - 완료: APPROVED, COMPLETED
  const filteredMissions = useMemo(() => {
    // 삭제되지 않은 미션만 필터링
    // 반복 미션은 화면에 표시하지 않음 (출시 버전에서는 반복 미션 미지원)
    const activeMissions = childMissions.filter((m) => 
      !m.isDeleted && 
      !(m.isRepeat === true && m.missionType === 'DAILY') // 반복 미션 제외
    );
    
    if (filter === 'ALL') {
      // 전체: 모든 상태 표시
      return activeMissions;
    }
    // 확인 중 필터: SUBMITTED 상태만 (승인대기 기준을 SUBMITTED 단 하나로 통일)
    if (filter === 'PENDING') {
      return activeMissions.filter((m) => m.status === 'SUBMITTED');
    }
    // 완료 필터: APPROVED, COMPLETED
    if (filter === 'APPROVED') {
      return activeMissions.filter((m) => 
        m.status === 'APPROVED' || 
        m.status === 'COMPLETED'
      );
    }
    return [];
  }, [childMissions, filter]);

  // 승인한 미션 개수 (삭제된 미션 제외)
  const approvedMissionsCount = useMemo(() => {
    return childMissions.filter((m) => m.status === 'COMPLETED' && !m.isDeleted).length;
  }, [childMissions]);

  // 리뷰 모달 자동 노출 조건 판단 함수
  const shouldShowReviewModal = useMemo(() => {
    // 승인한 미션이 5개 미만이면 노출하지 않음
    if (approvedMissionsCount < 5) {
      return false;
    }

    // localStorage에서 리뷰 모달 상태 확인
    const reviewPromptStateStr = localStorage.getItem('reviewPromptState');
    if (!reviewPromptStateStr) {
      // 상태가 없으면 최초 노출 가능
      return true;
    }

    try {
      const reviewPromptState = JSON.parse(reviewPromptStateStr) as {
        hasAsked: boolean;
        dismissedAt?: number;
      };

      // 평가하기를 눌렀으면 더 이상 노출하지 않음
      if (reviewPromptState.hasAsked) {
        return false;
      }

      // 나중에 할게요를 눌렀을 경우
      if (reviewPromptState.dismissedAt) {
        const dismissedDate = new Date(reviewPromptState.dismissedAt);
        const now = new Date();
        const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000; // 7일을 밀리초로 변환

        // 7일이 지나지 않았으면 노출하지 않음
        if (now.getTime() - dismissedDate.getTime() < sevenDaysInMs) {
          return false;
        }
      }

      // 조건을 만족하면 노출 가능
      return true;
    } catch (error) {
      // 파싱 에러 시 기본값으로 최초 노출 가능
      return true;
    }
  }, [approvedMissionsCount]);

  // 리뷰 모달 자동 노출 로직
  useEffect(() => {
    if (shouldShowReviewModal) {
      setShowReviewModal(true);
    }
  }, [shouldShowReviewModal]);

  // 오늘 완료한 미션 개수 계산
  const todayCompletedCount = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return childMissions.filter((mission) => {
      if (mission.status !== 'COMPLETED' || mission.isDeleted) return false;
      
      // approvedAt이 있으면 그 날짜 기준, 없으면 dueAt 기준
      const completedDate = mission.approvedAt 
        ? new Date(mission.approvedAt)
        : new Date(mission.dueAt || new Date());
      const missionDate = new Date(completedDate.getFullYear(), completedDate.getMonth(), completedDate.getDate());
      
      return missionDate.getTime() === today.getTime();
    }).length;
  }, [childMissions]);

  // 이번 주 완료한 미션 개수 계산
  const weekCompletedCount = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // 이번 주 월요일 계산
    const dayOfWeek = today.getDay(); // 0(일) ~ 6(토)
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 일요일이면 -6, 아니면 1-dayOfWeek
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    
    // 이번 주 일요일 계산
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    
    return childMissions.filter((mission) => {
      if (mission.status !== 'COMPLETED' || mission.isDeleted) return false;
      
      // approvedAt이 있으면 그 날짜 기준, 없으면 dueAt 기준
      const completedDate = mission.approvedAt 
        ? new Date(mission.approvedAt)
        : new Date(mission.dueAt || new Date());
      
      return completedDate >= monday && completedDate <= sunday;
    }).length;
  }, [childMissions]);

  // 공유 텍스트 생성 함수
  const generateShareText = (): string => {
    return `우리 집 약속 기록입니다.

✔️ 오늘 미션 ${todayCompletedCount}개 완료
✔️ 이번 주 총 ${weekCompletedCount}개 수행
✔️ 현재 포인트 ${childCurrentPoint}P

아이와 정한 약속을
차근차근 지켜가는 중이에요.`;
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
      setToastMessage('기록이 클립보드에 복사되었습니다.');
    } catch (error) {
      setToastMessage('공유에 실패했습니다. 다시 시도해주세요.');
    }
  };

  // ============================================================================
  // 조건부 return (모든 Hook 선언 이후)
  // ============================================================================

  // 부모 기능 접근 시 PIN 확인 (이미 ParentRouteGuard에서 처리되므로 바로 실행)
  const handleParentAction = (action: () => void) => {
    // ParentRouteGuard에서 이미 PIN 인증을 처리했으므로 바로 실행
    action();
  };

  // loading 중이면 로딩 UI 표시
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFEF9] flex items-center justify-center">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    );
  }

  // user가 없으면 임시 로그인 대기
  if (!user) {
    return (
      <div className="min-h-screen bg-[#FFFEF9] flex items-center justify-center">
        <p className="text-gray-500">로그인 중...</p>
      </div>
    );
  }

  // 부모가 아니면 홈으로 리다이렉트
  if (user.role !== 'PARENT') {
    return <Navigate to="/role-select" replace />;
  }

  // childId가 없거나 자녀가 부모의 childrenIds에 없으면 에러
  if (!childId || !user.childrenIds?.includes(childId)) {
    return (
      <div className="min-h-screen bg-[#FFFEF9] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg mb-2">자녀를 찾을 수 없습니다.</p>
          <button
            onClick={() => navigate('/parent')}
            className="text-blue-500 hover:underline"
          >
            부모 홈으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const handleMissionClick = (missionId: string) => {
    const mission = missions.find(m => m.id === missionId);
    if (!mission) return;

    // 완료 미션: 상세 모달 표시
    if (mission.status === 'APPROVED' || mission.status === 'COMPLETED') {
      setCompletedMission(mission);
      return;
    }

    // 제출된 미션: 승인 화면으로 이동
    if (mission.status === 'SUBMITTED') {
      navigate('/approval', {
        state: { childId: childId, missionId: missionId },
      });
    }
  };

  // 미션 수정 핸들러
  const handleEditMission = (missionId: string) => {
    const mission = childMissions.find(m => m.id === missionId);
    
    if (!mission) {
      setToastMessage('미션을 찾을 수 없어요');
      return;
    }

    // TODO: 반복 미션 기능은 출시 이후 재도입 예정. 현재는 단일 미션만 지원
    // 수정 가능 여부 확인 (단일 미션 기준으로만 판단)
    const canEdit = canEditMission(mission);
    
    if (!canEdit) {
      // 단일 미션: 완료 상태 안내
      setToastMessage('이미 완료된 미션은 수정할 수 없어요.');
      return;
    }

    // 미션 데이터로 prefill
    setEditingMissionId(missionId);
    
    // dueAt을 날짜/시간으로 분리
    const dueAtDate = new Date(mission.dueAt);
    const year = dueAtDate.getFullYear();
    const month = String(dueAtDate.getMonth() + 1).padStart(2, '0');
    const day = String(dueAtDate.getDate()).padStart(2, '0');
    const hour = String(dueAtDate.getHours()).padStart(2, '0');
    const minute = String(dueAtDate.getMinutes()).padStart(2, '0');
    
    // 마감일시를 ISO string으로 설정 (먼저 계산)
    const datetimeValue = `${year}-${month}-${day}T${hour}:${minute}:00`;
    
    // 모든 값을 한 번에 설정 (setNewMission을 한 번만 호출)
    setNewMission({
      title: mission.title,
      rewardPoint: mission.rewardPoint,
      dueDate: datetimeValue, // ISO string 형식으로 설정
      missionType: mission.missionType,
      description: mission.description || '',
    });
    setPointInputStr(String(mission.rewardPoint));

    // 날짜/시간 파트 설정
    setDueDateParts({
      date: `${year}-${month}-${day}`,
      hour: String(dueAtDate.getHours()),
      minute: String(dueAtDate.getMinutes()),
    });

    // TODO: 반복 미션 기능은 출시 이후 재도입 예정. 현재는 단일 미션만 지원
    // 반복 미션 정보는 로드하지 않음 (출시 버전에서는 반복 미션 미지원)

    setShowEditModal(true);
    setShowCreateModal(true); // 수정 모달도 생성 모달을 재사용
  };

  return (
    <PageLayout headerHeight={HEADER_HEIGHT} className="pb-[calc(7rem+env(safe-area-inset-bottom))]">
      {/* 고정 헤더 */}
      <FixedHeader
        title={childName ? `${childName}의 미션 관리` : '미션 관리'}
        onBack={() => navigate('/parent')}
      />

      {/* 포인트 단독 표시 영역 - 부모홈과 비슷한 상단 여백 */}
      <div className="px-5 pt-4">
        <div className="bg-indigo-50 rounded-2xl border border-indigo-100 p-3.5 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            {/* 포인트 숫자 영역 - 한 줄 고정, 숫자 강조 */}
            <div className="flex-1 min-w-0">
              <div className="text-xl font-bold text-gray-900 whitespace-nowrap">
                {childCurrentPoint.toLocaleString()}P
              </div>
            </div>
            {/* 버튼 영역: 사용하기 + 내역 - shrink 방지 */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => {
                  // 부모만 포인트 사용 팝업 표시
                  if (user?.role === 'PARENT') {
                    setShowPointUseModal(true);
                  } else {
                    // 아이 계정이 잘못 접근한 경우 조용히 무시
                  }
                }}
                className="px-3.5 py-1.5 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors whitespace-nowrap"
              >
                사용하기
              </button>
              {/* 내역 버튼 */}
              <button
                onClick={() => {
                  if (childId) {
                    navigate(`/points/history?childId=${childId}`);
                  }
                }}
                className="px-3.5 py-1.5 bg-pink-50 text-pink-600 border border-pink-200 rounded-lg text-sm font-medium hover:bg-pink-100 hover:border-pink-300 transition-colors whitespace-nowrap"
              >
                내역
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 보조 요약 영역 - 소원, 승인 대기 */}
      <div className="px-5 pt-2">
        <div className="bg-white rounded-xl border border-gray-200 p-2.5">
          <div className="flex items-center justify-center gap-5">
            {/* 소원 개수 - 클릭 가능 (토글) */}
            {wishlist.length > 0 ? (
              <button
                onClick={() => setShowWishDetail(!showWishDetail)}
                className="flex items-center gap-2 hover:bg-gray-50 rounded-lg px-2.5 py-1 transition-colors"
              >
                <span className="text-base">⭐</span>
                <span className="text-sm text-gray-700">
                  소원 {wishlist.length}개
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-base">⭐</span>
                <span className="text-sm text-gray-400">
                  소원 0개
                </span>
              </div>
            )}

            {/* 구분선 */}
            <div className="w-px h-5 bg-gray-300" />

            {/* 승인 대기 개수 - 클릭 가능 (탭으로 이동) */}
            {pendingMissions.length > 0 ? (
              <button
                onClick={() => {
                  setFilter('PENDING');
                  // 탭 영역으로 스크롤
                  setTimeout(() => {
                    const tabElement = document.querySelector('[data-tab-section]');
                    tabElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 100);
                }}
                className="flex items-center gap-2 hover:bg-gray-50 rounded-lg px-2.5 py-1 transition-colors"
              >
                <span className="text-base">⏳</span>
                <span className="text-sm text-gray-700">
                  승인대기 {pendingMissions.length}개
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-base">⏳</span>
                <span className="text-sm text-gray-400">
                  승인대기 0개
                </span>
              </div>
            )}
          </div>
          {/* 소원 상세 영역 (토글) - 카드 내부 */}
          {wishlist.length > 0 && showWishDetail && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="space-y-4">
                {wishlist.map((item) => (
                  <div
                    key={item.id}
                    className="bg-purple-50 rounded-xl p-4 border border-purple-200"
                  >
                    {/* 소원 제목 */}
                    <h4 className="text-sm font-medium text-gray-500 mb-2">소원</h4>
                    
                    {/* 소원 텍스트 */}
                    <p className="text-base text-gray-800 mb-4">
                      {item.text}
                    </p>
                    
                    {/* 버튼 영역 (하단 고정) */}
                    <div className="flex gap-2 pt-3 border-t border-purple-200">
                      <button
                        onClick={() => {
                          handleParentAction(() => {
                            setWishToComplete(item);
                            setShowWishCompleteModal(true);
                          });
                        }}
                        className="flex-1 py-2.5 bg-green-500 text-white rounded-xl text-sm font-semibold hover:bg-green-600 transition-colors"
                      >
                        소원 이루어주기
                      </button>
                      <button
                        onClick={() => {
                          handleParentAction(() => {
                            // 미션 추가 모달 열기 및 제목 자동 입력
                            const todayDate = getTodayDateString();
                            const initialDateTime = `${todayDate}T23:59:00`;
                            setDueDateParts({
                              date: todayDate,
                              hour: '23',
                              minute: '59',
                            });
                            setNewMission((prev) => ({
                              ...prev,
                              title: item.text, // 소원을 제목으로 자동 입력
                              dueDate: initialDateTime,
                            }));
                            setShowCreateModal(true);
                          });
                        }}
                        className="flex-1 py-2.5 bg-purple-500 text-white rounded-xl text-sm font-semibold hover:bg-purple-600 transition-colors"
                      >
                        미션으로 만들기
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>


      {/* 필터 탭 */}
      <div data-tab-section className="px-5 mt-3">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('ALL')}
            className={`
              flex-1 py-2.5 px-3 rounded-xl text-sm font-medium transition-colors
              ${filter === 'ALL' 
                ? 'bg-blue-100 border-2 border-blue-300 text-blue-800' 
                : 'bg-white border-2 border-gray-200 text-gray-600'}
            `}
          >
            전체
          </button>
          <button
            onClick={() => setFilter('PENDING')}
            className={`
              flex-1 py-2.5 px-3 rounded-xl text-sm font-medium transition-colors
              ${filter === 'PENDING' 
                ? 'bg-orange-100 border-2 border-orange-300 text-orange-800' 
                : 'bg-white border-2 border-gray-200 text-gray-600'}
            `}
          >
            확인 중
          </button>
          <button
            onClick={() => setFilter('APPROVED')}
            className={`
              flex-1 py-2.5 px-3 rounded-xl text-sm font-medium transition-colors
              ${filter === 'APPROVED' 
                ? 'bg-green-100 border-2 border-green-300 text-green-800' 
                : 'bg-white border-2 border-gray-200 text-gray-600'}
            `}
          >
            완료
          </button>
        </div>
      </div>

      {/* Mission List */}
      <div className="px-5 mt-4">
        {filteredMissions.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="mb-4 flex justify-center">
              <Character size="large" gender={childGender} />
            </div>
            {filter === 'ALL' && (
              <>
                <p className="text-lg">이 아이에게 아직 미션이 없습니다</p>
                <p className="text-sm text-gray-400 mt-1">첫 미션을 만들어볼까요?</p>
              </>
            )}
            {filter === 'PENDING' && (
              <>
                <p className="text-lg">현재 확인 중인 미션이 없습니다</p>
                <p className="text-sm text-gray-400 mt-1">아이의 미션을 확인해보세요</p>
              </>
            )}
            {filter === 'APPROVED' && (
              <>
                <p className="text-lg">아직 완료된 미션이 없습니다</p>
                <p className="text-sm text-gray-400 mt-1">미션을 완료하면 여기에 표시됩니다</p>
              </>
            )}
          </div>
        ) : (
          filteredMissions
            .map((mission) => (
              // 미션이 자주 쓰는 미션 템플릿에 포함되어 있는지 여부 판단
              (() => {
                const isFavorite = missionTemplates.some((tpl) => {
                  if (tpl.sourceMissionId && tpl.sourceMissionId === mission.id) {
                    return true;
                  }
                  const tplDesc = tpl.description ?? '';
                  const missionDesc = mission.description ?? '';
                  return (
                    tpl.title === mission.title &&
                    tpl.rewardPoint === mission.rewardPoint &&
                    tpl.missionType === mission.missionType &&
                    tplDesc === missionDesc
                  );
                });

                return (
              <MissionCard
                key={mission.id}
                mission={mission}
                onClick={() => handleMissionClick(mission.id)}
                isParentMode={true}
                isFavorite={isFavorite}
                onToggleFavorite={async (missionId) => {
                  if (!user || user.role !== 'PARENT') return;
                  try {
                    const target = missions.find((m) => m.id === missionId);
                    if (!target) return;

                    const matchedTemplates = missionTemplates.filter((tpl) => {
                      if (tpl.sourceMissionId && tpl.sourceMissionId === missionId) {
                        return true;
                      }
                      const tplDesc = tpl.description ?? '';
                      const missionDesc = target.description ?? '';
                      return (
                        tpl.title === target.title &&
                        tpl.rewardPoint === target.rewardPoint &&
                        tpl.missionType === target.missionType &&
                        tplDesc === missionDesc
                      );
                    });

                    if (isFavorite && matchedTemplates.length > 0) {
                      // 즐겨찾기 해제: 매칭되는 템플릿 모두 삭제
                      await Promise.all(matchedTemplates.map((tpl) => deleteMissionTemplate(tpl.id)));
                    } else {
                      await createMissionTemplate(user.id, {
                        title: target.title,
                        description: target.description ?? '',
                        rewardPoint: target.rewardPoint,
                        missionType: target.missionType,
                        sourceMissionId: target.id,
                      });
                    }
                    const list = await fetchMissionTemplates(user.id);
                    setMissionTemplates(list);
                  } catch (error) {
                    console.error(error);
                    setToastMessage('자주 쓰는 미션 저장에 실패했어요');
                  }
                }}
                onDelete={(missionId) => {
                  setMissionToDelete(missionId);
                  setShowDeleteModal(true);
                }}
                onEdit={(missionId) => {
                  handleEditMission(missionId);
                }}
                onRetry={async (missionId: string) => {
                  try {
                    // 재도전 승인 (마감 시간 +1일 자동 설정)
                    await approveRetry(missionId);
                    setToastMessage('재도전을 승인했어요! 아이에게 바로 반영돼요.');
                  } catch (error) {
                    setToastMessage('재도전 승인에 실패했어요. 다시 시도해주세요.');
                  }
                }}
                onFail={async (missionId: string) => {
                  try {
                    // 재도전 거절
                    await rejectRetry(missionId);
                    setToastMessage('재도전 요청을 거절했어요.');
                  } catch (error) {
                    setToastMessage('재도전 거절에 실패했어요. 다시 시도해주세요.');
                  }
                }}
              />
                );
              })()
            ))
        )}
      </div>

      {/* 하단 고정 CTA (스크롤 없이 언제든 추가 가능) */}
      {(filter === 'ALL' || (filter === 'PENDING' && pendingMissions.length > 0)) && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#FFFEF9] border-t border-gray-200 px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] z-10">
          {filter === 'ALL' && (
            <button
              onClick={() => {
                handleParentAction(() => {
                  const todayDate = getTodayDateString();
                  const initialDateTime = `${todayDate}T23:59:00`;
                  setDueDateParts({
                    date: todayDate,
                    hour: '23',
                    minute: '59',
                  });
                  setNewMission((prev) => ({
                    ...prev,
                    dueDate: initialDateTime,
                  }));
                  setIsRepeatMission(false);
                  setSelectedDays(new Set());
                  setRepeatStartDate(getTodayDateString());
                  setHasEndDate(false);
                  setRepeatEndDate('');
                  setShowCreateModal(true);
                });
              }}
              className="w-full py-4 bg-blue-500 text-white rounded-2xl font-bold text-lg shadow-lg hover:bg-blue-600 active:bg-blue-700 transition-colors"
            >
              + 미션 추가하기
            </button>
          )}
          {filter === 'PENDING' && pendingMissions.length > 0 && (
            <button
              onClick={() => {
                handleParentAction(() => {
                  navigate('/approval', { 
                    state: { childId: childId },
                  });
                });
              }}
              className="w-full py-4 bg-orange-500 text-white rounded-2xl font-bold text-lg shadow-lg hover:bg-orange-600 transition-colors"
            >
              승인 대기 보기 ({pendingMissions.length}개)
            </button>
          )}
        </div>
      )}

          {/* 미션 생성/수정 모달 */}
          {(showCreateModal || showEditModal) && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-5">
              <div className="bg-white rounded-2xl p-4 w-full max-w-md max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xl font-bold text-gray-800">
                    {editingMissionId ? '미션 수정하기' : '미션 추가하기'}
                  </h2>
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setShowEditModal(false);
                      setEditingMissionId(null);
                      const todayDate = getTodayDateString();
                      setNewMission({
                        title: '',
                        rewardPoint: 500,
                        dueDate: '',
                        missionType: 'DAILY',
                        description: '',
                      });
                      setPointInputStr('500');
                      setDueDateParts({
                        date: todayDate,
                        hour: '23',
                        minute: '59',
                      });
                      setIsRepeatMission(false);
                      setSelectedDays(new Set());
                      setRepeatStartDate(getTodayDateString());
                      setHasEndDate(false);
                      setRepeatEndDate('');
                    }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newMission.title.trim()) {
                  alert('미션 제목을 입력해주세요.');
                  return;
                }

                if (!childId) {
                  alert('자녀를 선택해주세요.');
                  return;
                }

                // TODO: 반복 미션 기능은 출시 이후 재도입 예정. 현재는 단일 미션만 지원
                // 마감일 필수 검증 (모든 미션에서 필수)
                if (!dueDateParts.date) {
                  alert('마감일을 선택해주세요.');
                  return;
                }

                try {
                  // TODO: 반복 미션 기능은 출시 이후 재도입 예정. 현재는 단일 미션만 지원
                  // 마감일 생성 (모든 미션에서 필수)
                  const dueDate = new Date(
                    `${dueDateParts.date}T${String(dueDateParts.hour).padStart(2, '0')}:${String(dueDateParts.minute).padStart(2, '0')}:00`
                  );
                  const dueDateISO = dueDate.toISOString();

                  // 반복 미션 정보는 항상 false로 설정 (출시 버전에서는 반복 미션 미지원)
                  const isRepeat = false;
                  const repeatDays: number[] = [];
                  const repeatStartDateISO = undefined;
                  const repeatEndDateISO = null;

                  // 수정 모드인지 확인
                  if (editingMissionId) {
                    // 미션 수정
                    await updateMission(
                      editingMissionId,
                      newMission.title,
                      newMission.description,
                      newMission.rewardPoint,
                      dueDateISO,
                      newMission.missionType,
                      isRepeat,
                      repeatDays,
                      repeatStartDateISO,
                      repeatEndDateISO
                    );
                    setToastMessage('미션을 수정했어요');
                  } else {
                    // 미션 생성
                    // TODO: 반복 미션 기능은 출시 이후 재도입 예정. 현재는 단일 미션만 지원
                    await createMission(
                      newMission.title,
                      newMission.rewardPoint,
                      dueDateISO,
                      newMission.missionType,
                      newMission.description,
                      childId, // childId를 파라미터로 전달
                      isRepeat, // 반복 미션 여부
                      repeatDays, // 반복 요일 배열
                      repeatStartDateISO, // 반복 시작일
                      repeatEndDateISO // 반복 종료일
                    );
                  }
                  
                  setShowCreateModal(false);
                  setShowEditModal(false);
                  setEditingMissionId(null);
                  const todayDate = getTodayDateString();
                  setNewMission({
                    title: '',
                    rewardPoint: 100,
                    dueDate: '',
                    missionType: 'DAILY',
                    description: '',
                  });
                  setPointInputStr('100');
                  setDueDateParts({
                    date: todayDate,
                    hour: '23',
                    minute: '59',
                  });
                  setIsRepeatMission(false);
                  setSelectedDays(new Set());
                  setRepeatStartDate(getTodayDateString());
                  setHasEndDate(false);
                    setRepeatEndDate('');
                  } catch (error) {
                  alert(error instanceof Error ? error.message : (editingMissionId ? '미션 수정에 실패했습니다.' : '미션 생성에 실패했습니다.'));
                }
              }}
              className="space-y-3"
            >
              {/* 자주 쓰는 미션에서 불러오기 (미션 생성 시) */}
              {user?.role === 'PARENT' && !editingMissionId && missionTemplates.length > 0 && (
              <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">자주 쓰는 미션</span>
                    <button
                      type="button"
                      onClick={() => setShowTemplateSheet(true)}
                      className="text-xs text-blue-500 hover:text-blue-600 font-medium"
                    >
                      템플릿 선택
                    </button>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-0.5">
                    {missionTemplates.slice(0, 2).map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => {
                          const todayDate = getTodayDateString();
                          const due = new Date(
                            `${todayDate}T23:59:00`
                          );
                          const dueISO = due.toISOString();
                          setNewMission((prev) => ({
                            ...prev,
                            title: tpl.title,
                            rewardPoint: tpl.rewardPoint,
                            missionType: tpl.missionType,
                            description: tpl.description ?? '',
                            dueDate: dueISO,
                          }));
                          setPointInputStr(String(tpl.rewardPoint));
                          setDueDateParts({
                            date: todayDate,
                            hour: '23',
                            minute: '59',
                          });
                        }}
                        className="flex-shrink-0 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700 hover:bg-blue-100 transition-colors"
                      >
                        {tpl.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  미션 제목 <span className="text-red-500 text-sm">*</span>
                </label>
                <input
                  type="text"
                  value={newMission.title}
                  onChange={(e) => setNewMission({ ...newMission, title: e.target.value })}
                  required
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 text-sm"
                  placeholder="예: 숙제하기"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  포인트 <span className="text-red-500 text-sm">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pointInputStr}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, '');
                    const normalized = raw === '' ? '' : String(parseInt(raw, 10));
                    setPointInputStr(normalized);
                    setNewMission({ ...newMission, rewardPoint: normalized === '' ? 0 : parseInt(normalized, 10) });
                  }}
                  required
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 text-sm"
                  placeholder="예: 100"
                />
              </div>

              {/* 마감일시 입력 영역 - 모든 미션에서 필수 */}
              {/* TODO: 반복 미션 기능은 출시 이후 재도입 예정. 현재는 단일 미션만 지원 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  마감일시 <span className="text-red-500 text-sm">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowDateTimePicker(true)}
                  className={`w-full min-h-[44px] px-3 py-2.5 border-2 rounded-xl text-sm text-left ${
                    dueDateParts.date
                      ? 'border-gray-200 bg-white text-gray-800'
                      : 'border-gray-200 bg-gray-50 text-gray-400'
                  } hover:border-blue-400 transition-colors flex items-center justify-between`}
                >
                  <span>
                    {dueDateParts.date
                      ? formatDateTime(dueDateParts.date, dueDateParts.hour, dueDateParts.minute)
                      : '마감일시를 선택해주세요'}
                  </span>
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* TODO: 반복 미션 기능은 출시 이후 재도입 예정. 현재는 단일 미션만 지원 */}
              {/* 반복 미션 관련 UI는 전면 비활성화됨 */}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  설명 (선택사항)
                </label>
                <textarea
                  value={newMission.description}
                  onChange={(e) => setNewMission({ ...newMission, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 text-sm resize-none"
                  placeholder="미션에 대한 추가 설명"
                />
                {user?.role === 'PARENT' && (
                  <div className="flex justify-end mt-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!user) return;
                        if (!newMission.title.trim()) {
                          alert('미션 제목을 먼저 입력해주세요.');
                          return;
                        }
                        if (newMission.rewardPoint <= 0) {
                          alert('포인트는 0보다 커야 합니다.');
                          return;
                        }
                        try {
                          await createMissionTemplate(user.id, {
                            title: newMission.title.trim(),
                            description: newMission.description ?? '',
                            rewardPoint: newMission.rewardPoint,
                            missionType: newMission.missionType,
                            sourceMissionId: editingMissionId || undefined,
                          });
                          const list = await fetchMissionTemplates(user.id);
                          setMissionTemplates(list);
                          setToastMessage('자주 쓰는 미션에 저장했어요');
                        } catch (error) {
                          // 에러 메시지는 간단히 처리
                          setToastMessage('자주 쓰는 미션 저장에 실패했어요');
                          console.error(error);
                        }
                      }}
                      className="text-xs text-blue-500 hover:text-blue-600 font-medium"
                    >
                      현재 내용을 자주 쓰는 미션으로 저장
                    </button>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setShowEditModal(false);
                    setEditingMissionId(null);
                    const todayDate = getTodayDateString();
                    setNewMission({
                      title: '',
                      rewardPoint: 100,
                      dueDate: '',
                      missionType: 'DAILY',
                      description: '',
                    });
                    setPointInputStr('100');
                    setDueDateParts({
                      date: todayDate,
                      hour: '23',
                      minute: '59',
                    });
                    setIsRepeatMission(false);
                    setSelectedDays(new Set());
                    setRepeatStartDate(getTodayDateString());
                    setHasEndDate(false);
                    setRepeatEndDate('');
                  }}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors text-sm"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={!newMission.title.trim() || !dueDateParts.date}
                  className="flex-1 py-2.5 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600 transition-colors disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed text-sm"
                >
                  {editingMissionId ? '수정하기' : '추가하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 날짜/시간 선택 모달 */}
      {showDateTimePicker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-50">
          <div className="bg-white rounded-t-3xl w-full max-w-md shadow-lg animate-slide-up">
            <div className="p-6">
              {/* 모달 헤더 */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-800">마감일시 선택</h2>
                <button
                  onClick={() => setShowDateTimePicker(false)}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* 날짜 선택 */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  날짜
                </label>
                <input
                  type="date"
                  value={dueDateParts.date}
                  min={getTodayDateString()}
                  onChange={(e) => {
                    const selectedDate = e.target.value;
                    // 오늘 이전 날짜는 선택 불가
                    if (selectedDate < getTodayDateString()) {
                      return;
                    }
                    
                    // 오늘 날짜를 선택한 경우, 현재 시간 이후로만 선택 가능하도록 시간 조정
                    const today = getTodayDateString();
                    let newHour = parseInt(dueDateParts.hour, 10);
                    let newMinute = parseInt(dueDateParts.minute, 10);
                    
                    if (selectedDate === today) {
                      const now = new Date();
                      const currentHour = now.getHours();
                      const currentMinute = now.getMinutes();
                      
                      // 선택한 시간이 현재 시간보다 이전이면 현재 시간으로 조정
                      if (newHour < currentHour || (newHour === currentHour && newMinute <= currentMinute)) {
                        newHour = currentHour;
                        newMinute = currentMinute < 30 ? 30 : currentMinute + 1;
                        if (newMinute >= 60) {
                          newHour += 1;
                          newMinute = 0;
                        }
                        if (newHour >= 24) {
                          newHour = 23;
                          newMinute = 59;
                        }
                      }
                    }
                    
                    setDueDateParts({
                      date: selectedDate,
                      hour: String(newHour),
                      minute: String(newMinute),
                    });
                  }}
                  className="w-full p-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 text-base"
                />
              </div>

              {/* 시간 선택 */}
              {dueDateParts.date && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    시간
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={dueDateParts.hour}
                      onChange={(e) => {
                        setDueDateParts({ ...dueDateParts, hour: e.target.value });
                      }}
                      className="flex-1 p-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 text-base"
                    >
                      {Array.from({ length: 24 }, (_, i) => {
                        // 오늘 날짜인 경우 현재 시간 이전은 비활성화
                        const today = getTodayDateString();
                        const isToday = dueDateParts.date === today;
                        const now = new Date();
                        const currentHour = now.getHours();
                        const isDisabled = isToday && i < currentHour;
                        
                        return (
                          <option key={i} value={i} disabled={isDisabled}>
                            {String(i).padStart(2, '0')}시
                          </option>
                        );
                      })}
                    </select>
                    <select
                      value={dueDateParts.minute}
                      onChange={(e) => {
                        setDueDateParts({ ...dueDateParts, minute: e.target.value });
                      }}
                      className="flex-1 p-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 text-base"
                    >
                      <option value="0">00분</option>
                      <option value="30">30분</option>
                    </select>
                  </div>
                </div>
              )}

              {/* 미리보기 */}
              {dueDateParts.date && (
                <div className="mb-6 p-4 bg-blue-50 rounded-xl">
                  <p className="text-sm text-gray-600 mb-1">선택한 마감일시</p>
                  <p className="text-base font-semibold text-blue-700">
                    {formatDateTime(dueDateParts.date, dueDateParts.hour, dueDateParts.minute)}
                  </p>
                </div>
              )}

              {/* 확인 버튼 */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDateTimePicker(false)}
                  className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!dueDateParts.date) {
                      alert('날짜를 선택해주세요.');
                      return;
                    }
                    
                    // 과거 시간 선택 방지
                    const selectedDateTime = new Date(
                      `${dueDateParts.date}T${String(dueDateParts.hour).padStart(2, '0')}:${String(dueDateParts.minute).padStart(2, '0')}:00`
                    );
                    const now = new Date();
                    
                    if (selectedDateTime < now) {
                      alert('과거 시간은 선택할 수 없어요. 현재 시간 이후로 선택해주세요.');
                      return;
                    }
                    
                    // 선택한 날짜와 시간을 ISO string으로 변환하여 저장
                    const datetimeValue = `${dueDateParts.date}T${String(dueDateParts.hour).padStart(2, '0')}:${String(dueDateParts.minute).padStart(2, '0')}:00`;
                    setNewMission({ ...newMission, dueDate: datetimeValue });
                    setShowDateTimePicker(false);
                  }}
                  disabled={!dueDateParts.date}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 자주 쓰는 미션 전체 목록 바텀시트 */}
      {showTemplateSheet && user?.role === 'PARENT' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-50">
          <div className="bg-white rounded-t-3xl w-full max-w-md shadow-lg">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">자주 쓰는 미션 선택</h2>
              <button
                type="button"
                onClick={() => setShowTemplateSheet(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-4 space-y-3">
              {missionTemplates.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  아직 저장된 자주 쓰는 미션이 없어요.
                </p>
              ) : (
                missionTemplates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      const todayDate = getTodayDateString();
                      const due = new Date(
                        `${todayDate}T23:59:00`
                      );
                      const dueISO = due.toISOString();
                      setNewMission((prev) => ({
                        ...prev,
                        title: tpl.title,
                        rewardPoint: tpl.rewardPoint,
                        missionType: tpl.missionType,
                        description: tpl.description ?? '',
                        dueDate: dueISO,
                      }));
                      setPointInputStr(String(tpl.rewardPoint));
                      setDueDateParts({
                        date: todayDate,
                        hour: '23',
                        minute: '59',
                      });
                      setShowTemplateSheet(false);
                    }}
                    className="w-full text-left bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-2xl px-4 py-3 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-semibold text-sm text-gray-800 truncate">{tpl.title}</p>
                      <span className="text-xs text-blue-600 font-medium">
                        +{tpl.rewardPoint}P
                      </span>
                    </div>
                    {tpl.description && (
                      <p className="text-xs text-gray-500 line-clamp-2">{tpl.description}</p>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 포인트 차감 입력 모달 */}
      {showPointModal && pointAction === 'deduct' && !showPointPinModal && !wishToComplete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-5">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-800">포인트 차감</h2>
              <button
                onClick={() => {
                  setShowPointModal(false);
                  setPointAction(null);
                  setDeductAmount('');
                  setDeductReasonType('');
                  setDeductReasonCustom('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
              <p className="text-sm text-gray-600 mb-2">현재 포인트</p>
              <p className="text-2xl font-bold text-yellow-700">{childCurrentPoint.toLocaleString()}P</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  차감할 포인트 <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={deductAmount}
                  onChange={(e) => setDeductAmount(e.target.value)}
                  min="1"
                  max={childCurrentPoint}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-orange-400 text-base"
                  placeholder="차감할 포인트를 입력하세요"
                />
                <p className="text-xs text-gray-500 mt-1">
                  최대 {childCurrentPoint.toLocaleString()}P까지 차감 가능
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  사유 <span className="text-red-500">*</span>
                </label>
                <select
                  value={deductReasonType}
                  onChange={(e) => {
                    setDeductReasonType(e.target.value);
                    if (e.target.value !== '기타') {
                      setDeductReasonCustom('');
                    }
                  }}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-orange-400 text-base"
                >
                  <option value="">사유 선택</option>
                  <option value="용돈 지급">용돈 지급</option>
                  <option value="선물 구매">선물 구매</option>
                  <option value="보상 지급">보상 지급</option>
                  <option value="기타">기타</option>
                </select>
              </div>

              {deductReasonType === '기타' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    사유 입력 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={deductReasonCustom}
                    onChange={(e) => setDeductReasonCustom(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-orange-400 text-base"
                    placeholder="차감 사유를 입력하세요"
                  />
                </div>
              )}

              {(() => {
                const amount = parseInt(deductAmount);
                const isAmountValid = !isNaN(amount) && amount > 0 && amount <= childCurrentPoint;
                const isReasonValid = deductReasonType !== '' && (deductReasonType !== '기타' || deductReasonCustom.trim() !== '');
                const isFormValid = isAmountValid && isReasonValid;
                return (
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowPointModal(false);
                        setPointAction(null);
                        setDeductAmount('');
                        setDeductReasonType('');
                        setDeductReasonCustom('');
                      }}
                      className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isFormValid) return;
                        setShowPointPinModal(true);
                      }}
                      disabled={!isFormValid}
                      className={`flex-1 py-3 rounded-xl font-bold transition-colors ${
                        isFormValid
                          ? 'bg-orange-500 text-white hover:bg-orange-600'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      차감하기
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 소원 완료 확인 모달 */}
      {showWishCompleteModal && wishToComplete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-5">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="text-center mb-6">
              <div className="text-4xl mb-3">🎉</div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">
                소원을 이루어줬어요
              </h2>
              <p className="text-sm text-gray-600">
                포인트도 정리할까요?
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={async () => {
                  try {
                    // 소원만 완료 처리 (포인트 차감 없음)
                    await completeWishItem(wishToComplete.id);
                    setToastMessage('소원을 이루어줬어요 ✨');
                    setShowWishCompleteModal(false);
                    setWishToComplete(null);
                  } catch (error) {
                    setToastMessage('처리에 실패했어요');
                  }
                }}
                className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              >
                포인트 정리 안 할게요
              </button>
              <button
                onClick={() => {
                  // 포인트 차감 모달로 이동
                  setShowWishCompleteModal(false);
                  setPointAction('deduct');
                  // 소원 완료는 포인트 차감 성공 후 처리
                }}
                className="w-full py-3 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 transition-colors"
              >
                포인트 정리하기
              </button>
            </div>

            <button
              onClick={() => {
                setShowWishCompleteModal(false);
                setWishToComplete(null);
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* 포인트 차감 입력 모달 (소원 완료 후) */}
      {pointAction === 'deduct' && !showPointPinModal && wishToComplete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-5">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-800">포인트 차감</h2>
              <button
                onClick={async () => {
                  // 포인트 차감 없이 소원만 완료 처리
                  try {
                    if (wishToComplete) {
                      await completeWishItem(wishToComplete.id);
                      setToastMessage('소원을 이루어줬어요 ✨');
                    }
                    setPointAction(null);
                    setDeductAmount('');
                    setDeductReasonType('');
                    setDeductReasonCustom('');
                    setWishToComplete(null);
                  } catch (error) {
                    setToastMessage('처리에 실패했어요');
                  }
                }}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
            <p className="text-sm text-gray-600 mb-2">현재 포인트</p>
            <p className="text-2xl font-bold text-yellow-700">{childCurrentPoint.toLocaleString()}P</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                차감할 포인트 <span className="text-red-500">*</span>
              </label>
                <input
                  type="number"
                  value={deductAmount}
                  onChange={(e) => setDeductAmount(e.target.value)}
                  min="1"
                  max={childCurrentPoint}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-orange-400 text-base"
                  placeholder="차감할 포인트를 입력하세요"
                />
                <p className="text-xs text-gray-500 mt-1">
                  최대 {childCurrentPoint.toLocaleString()}P까지 차감 가능
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  사유 <span className="text-red-500">*</span>
                </label>
                <select
                  value={deductReasonType}
                  onChange={(e) => {
                    setDeductReasonType(e.target.value);
                    if (e.target.value !== '기타') {
                      setDeductReasonCustom('');
                    }
                  }}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-orange-400 text-base"
                >
                  <option value="">사유 선택</option>
                  <option value="용돈 지급">용돈 지급</option>
                  <option value="선물 구매">선물 구매</option>
                  <option value="보상 지급">보상 지급</option>
                  <option value="기타">기타</option>
                </select>
              </div>

              {deductReasonType === '기타' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    사유 입력 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={deductReasonCustom}
                    onChange={(e) => setDeductReasonCustom(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-orange-400 text-base"
                    placeholder="차감 사유를 입력하세요"
                  />
                </div>
              )}

              {(() => {
                const amount = parseInt(deductAmount);
                const isAmountValid = !isNaN(amount) && amount > 0 && amount <= childCurrentPoint;
                const isReasonValid = deductReasonType !== '' && (deductReasonType !== '기타' || deductReasonCustom.trim() !== '');
                const isFormValid = isAmountValid && isReasonValid;
                return (
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          if (wishToComplete) {
                            await completeWishItem(wishToComplete.id);
                            setToastMessage('소원을 이루어줬어요 ✨');
                          }
                          setPointAction(null);
                          setDeductAmount('');
                          setDeductReasonType('');
                          setDeductReasonCustom('');
                          setWishToComplete(null);
                        } catch (error) {
                          setToastMessage('처리에 실패했어요');
                        }
                      }}
                      className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                    >
                      포인트 차감 안 할게요
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isFormValid) return;
                        setShowPointPinModal(true);
                      }}
                      disabled={!isFormValid}
                      className={`flex-1 py-3 rounded-xl font-bold transition-colors ${
                        isFormValid
                          ? 'bg-orange-500 text-white hover:bg-orange-600'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      차감하기
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 포인트 차감 PIN 인증 모달 (소원 완료 후) */}
      {showPointPinModal && pointAction === 'deduct' && wishToComplete && (
        <PinInput
          onSuccess={async () => {
            setShowPointPinModal(false);
            try {
              if (!childId || !wishToComplete) {
                throw new Error('정보를 찾을 수 없습니다.');
              }

              const amount = parseInt(deductAmount);
              if (isNaN(amount) || amount <= 0) {
                throw new Error('차감할 포인트를 올바르게 입력해주세요.');
              }
              if (amount > childCurrentPoint) {
                throw new Error('현재 포인트보다 많이 차감할 수 없어요');
              }

              // 1. 포인트 차감
              await deductChildPoint(childId, amount);
              
              // 2. 소원 완료 처리 (포인트 차감 정보 포함)
              await completeWishItem(wishToComplete.id, amount);
              
              setToastMessage(`소원을 이루어줬고 포인트 ${amount.toLocaleString()}P를 차감했어요 ✨`);
              
              // 자녀 정보 갱신
              const childUser = await getUser(childId);
              if (childUser) {
                setChildCurrentPoint(childUser.totalPoint || 0);
              }
              
              setPointAction(null);
              setDeductAmount('');
              setDeductReasonType('');
              setDeductReasonCustom('');
              setWishToComplete(null);
            } catch (error) {
              setToastMessage(error instanceof Error ? error.message : '처리에 실패했어요');
            }
          }}
          onCancel={() => {
            setShowPointPinModal(false);
            // PIN 인증 취소 시 차감 입력 모달로 돌아감
          }}
          title="PIN 입력"
          description="포인트 정산을 위해 PIN을 입력해주세요"
        />
      )}

      {/* 포인트 차감 PIN 인증 모달 (일반 포인트 정산) */}
      {showPointPinModal && pointAction === 'deduct' && !wishToComplete && (
        <PinInput
          onSuccess={async () => {
            setShowPointPinModal(false);
            try {
              if (!childId) {
                throw new Error('자녀 정보를 찾을 수 없습니다.');
              }

              const amount = parseInt(deductAmount);
              if (isNaN(amount) || amount <= 0) {
                throw new Error('차감할 포인트를 올바르게 입력해주세요.');
              }
              if (amount > childCurrentPoint) {
                throw new Error('현재 포인트보다 많이 차감할 수 없어요');
              }

              await deductChildPoint(childId, amount);
              setToastMessage(`포인트 ${amount.toLocaleString()}P가 차감되었어요`);
              // 자녀 정보 갱신
              const childUser = await getUser(childId);
              if (childUser) {
                setChildCurrentPoint(childUser.totalPoint || 0);
              }
              setPointAction(null);
              setDeductAmount('');
              setDeductReasonType('');
              setDeductReasonCustom('');
            } catch (error) {
              setToastMessage(error instanceof Error ? error.message : '포인트 차감에 실패했어요');
            }
          }}
          onCancel={() => {
            setShowPointPinModal(false);
            // PIN 인증 취소 시 차감 입력 모달로 돌아감
          }}
          title="PIN 입력"
          description="포인트 정산을 위해 PIN을 입력해주세요"
        />
      )}

      {/* 포인트 사용하기 모달 (부모 전용) */}
      {showPointUseModal && user?.role === 'PARENT' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-5">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-800 mb-6">포인트 사용하기</h3>
            
            {/* 사용 가능 포인트 표시 */}
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
              <p className="text-sm text-gray-600 mb-1">사용 가능 포인트</p>
              <p className="text-2xl font-bold text-yellow-900">
                {childCurrentPoint.toLocaleString()}P
              </p>
            </div>
            
            {/* 보상 종류 선택 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                보상 항목 <span className="text-red-500">*</span>
              </label>
              <select
                value={rewardType}
                onChange={(e) => {
                  setRewardType(e.target.value);
                  if (e.target.value !== '기타') {
                    setRewardCustomText('');
                  }
                }}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-green-400 text-base"
              >
                <option value="">보상 종류를 선택하세요</option>
                <option value="선물">선물</option>
                <option value="용돈">용돈</option>
                <option value="음식">음식</option>
                <option value="기타">기타</option>
              </select>
            </div>

            {/* 기타 선택 시 텍스트 입력 필드 */}
            {rewardType === '기타' && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  보상 내용 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={rewardCustomText}
                  onChange={(e) => setRewardCustomText(e.target.value)}
                  placeholder="예: 놀이공원 가기, 장난감 사주기"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-green-400 text-base"
                />
              </div>
            )}

            {/* 포인트 사용 입력 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                포인트 사용 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={deductPointAmount}
                onChange={(e) => {
                  const value = e.target.value;
                  // 빈 값이거나 숫자만 허용
                  if (value === '' || /^\d+$/.test(value)) {
                    setDeductPointAmount(value);
                  }
                }}
                placeholder="사용할 포인트를 입력하세요"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-green-400 text-base"
              />
              <p className="text-xs text-gray-500 mt-1">
                최대 {childCurrentPoint.toLocaleString()}P까지 입력 가능
              </p>
            </div>

            {/* 사용 사유 입력 (선택) */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                사용 사유 (선택)
              </label>
              <input
                type="text"
                value={useReason}
                onChange={(e) => setUseReason(e.target.value)}
                placeholder="예: 장난감 구매, 용돈 지급"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-green-400 text-base"
              />
            </div>

            {/* 차감 포인트 및 남은 포인트 표시 */}
            {deductPointAmount && (() => {
              const inputValue = Number(deductPointAmount);
              if (isNaN(inputValue) || inputValue < 0) return null;
              
              const deductAmount = inputValue;
              const remainingPoint = Math.max(0, childCurrentPoint - deductAmount);
              const isValid = deductAmount >= 0 && deductAmount <= childCurrentPoint;
              
              return (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">차감 포인트</span>
                    <span className="text-lg font-bold text-gray-800">
                      -{deductAmount.toLocaleString()}P
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-green-200">
                    <span className="text-sm text-gray-600">차감 후 남은 포인트</span>
                    <span className={`text-lg font-bold ${remainingPoint < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                      {remainingPoint.toLocaleString()}P
                    </span>
                  </div>
                  {!isValid && (
                    <p className="text-xs text-red-600 mt-2">
                      {deductAmount < 0 ? '0 이상의 값을 입력해주세요' : '포인트가 부족해요'}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* 버튼 영역 */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowPointUseModal(false);
                  setRewardType('');
                  setRewardCustomText('');
                  setDeductPointAmount('');
                  setUseReason('');
                }}
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  // 유효성 검사
                  if (!rewardType) {
                    alert('보상 종류를 선택해주세요');
                    return;
                  }

                  if (rewardType === '기타' && !rewardCustomText.trim()) {
                    alert('보상 내용을 입력해주세요');
                    return;
                  }

                  if (!deductPointAmount) {
                    alert('차감할 포인트를 입력해주세요');
                    return;
                  }

                  const deductAmount = Number(deductPointAmount);
                  
                  // 유효성 검사
                  if (isNaN(deductAmount) || deductAmount < 0) {
                    alert('올바른 포인트를 입력해주세요');
                    return;
                  }

                  if (deductAmount > childCurrentPoint) {
                    alert('포인트가 부족해요');
                    return;
                  }

                  if (!childId) {
                    alert('자녀 정보를 찾을 수 없습니다.');
                    return;
                  }

                  try {
                    // 포인트 차감
                    await deductChildPoint(childId, deductAmount);
                    
                    // 보상 내용 기록 (Firestore 저장)
                    const rewardContent = rewardType === '기타' ? rewardCustomText : rewardType;
                    const rewardTextRaw = rewardType === '기타' ? rewardCustomText : rewardType;
                    
                    // 포인트 사용 기록 저장 (통계/분석용)
                    if (user?.id) {
                      await savePointUsageRecord(
                        childId,
                        user.id,
                        rewardType, // rewardTypeRaw: 원본 그대로
                        rewardTextRaw, // rewardTextRaw: 항상 저장
                        deductAmount
                      );
                    }

                    // 자녀 정보 갱신 (balanceAfter 계산을 위해)
                    const childUser = await getUser(childId);
                    const newTotalPoint = childUser?.totalPoint || 0;
                    if (childUser) {
                      setChildCurrentPoint(newTotalPoint);
                    }

                    // 포인트 사용 이력 추가 (pointHistory 컬렉션)
                    const { addPointHistory } = await import('../firebase/pointHistory');
                    // 사용 사유: 입력한 사유가 있으면 사용, 없으면 "소원 사용"
                    const reason = useReason.trim() || '소원 사용';
                    await addPointHistory(
                      childId,
                      'use',
                      -deductAmount, // 사용이므로 음수
                      reason,
                      'parent',
                      rewardTextRaw, // rewardTitle: 보상 항목 (예: "로블록스", "장난감") - 필수
                      user?.id || '', // parentId - 필수
                      undefined, // missionId: null
                      newTotalPoint // balanceAfter - 필수
                    );

                    // 모달 닫기 및 상태 초기화
                    setShowPointUseModal(false);
                    setRewardType('');
                    setRewardCustomText('');
                    setDeductPointAmount('');
                    setUseReason('');
                    
                    // 완료 토스트 메시지
                    setToastMessage(`${rewardContent} 보상을 지급했어요 ✨`);
                  } catch (error) {
                    alert(error instanceof Error ? error.message : '보상 지급에 실패했어요');
                  }
                }}
                disabled={(() => {
                  // 보상 종류 검증
                  if (!rewardType) return true;
                  if (rewardType === '기타' && !rewardCustomText.trim()) return true;
                  
                  // 차감 포인트 검증
                  if (!deductPointAmount) return true;
                  
                  const inputValue = Number(deductPointAmount);
                  if (isNaN(inputValue) || inputValue < 0) return true;
                  
                  // 보유 포인트 이하인지 확인
                  if (inputValue > childCurrentPoint) return true;
                  
                  return false;
                })()}
                className="flex-1 py-3 bg-green-500 text-white rounded-xl font-semibold hover:bg-green-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                보상 주기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast 메시지 */}
      {toastMessage && (
        <Toast
          message={toastMessage}
          type="success"
          duration={2000}
          onClose={() => setToastMessage(null)}
        />
      )}


      {/* 미션 삭제 확인 모달 */}
      {showDeleteModal && missionToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-5">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-gray-800 mb-4">미션 삭제</h3>
            <p className="text-base text-gray-700 mb-6 leading-relaxed">
              이 미션을 삭제할까요?<br />
              삭제하면 다시 되돌릴 수 없어요.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setMissionToDelete(null);
                }}
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  try {
                    if (missionToDelete) {
                      await deleteMission(missionToDelete);
                      setShowDeleteModal(false);
                      setMissionToDelete(null);
                    }
                  } catch (error) {
                    alert(error instanceof Error ? error.message : '미션 삭제에 실패했습니다.');
                  }
                }}
                className="flex-1 py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-colors"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 리뷰 모달 */}
      <ReviewModal
        isOpen={showReviewModal}
        onClose={() => {
          // 모달 닫기(X) 버튼은 "나중에 할게요"와 동일하게 처리
          const reviewPromptState = {
            hasAsked: false,
            dismissedAt: Date.now(),
          };
          localStorage.setItem('reviewPromptState', JSON.stringify(reviewPromptState));
          setShowReviewModal(false);
        }}
        onReview={() => {
          // 평가하기를 눌렀으면 더 이상 노출하지 않음
          const reviewPromptState = {
            hasAsked: true,
          };
          localStorage.setItem('reviewPromptState', JSON.stringify(reviewPromptState));
          setShowReviewModal(false);
        }}
        onPostpone={() => {
          // 나중에 할게요를 눌렀으면 현재 시각 저장 (7일 후 재노출 가능)
          const reviewPromptState = {
            hasAsked: false,
            dismissedAt: Date.now(),
          };
          localStorage.setItem('reviewPromptState', JSON.stringify(reviewPromptState));
          setShowReviewModal(false);
        }}
      />

      {/* 완료 미션 상세 모달 */}
      {completedMission && (
        <CompletedMissionModal
          mission={completedMission}
          onClose={() => setCompletedMission(null)}
        />
      )}
    </PageLayout>
  );
};

export default ChildManagement;




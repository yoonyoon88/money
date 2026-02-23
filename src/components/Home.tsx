import React, { useState, useMemo, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import MissionCard from './MissionCard';
import MissionEditModal from './MissionEditModal';
import { getUser } from '../firebase/users';
import { db } from '../firebase/config';
import Character from './Character';
import PinInput from './PinInput';
import Toast from './Toast';
import { checkAndUpdateExpiredMissions } from '../firebase/missions';
import { Mission } from '../types';

const Home: React.FC = () => {
  const { user, missions, loading, selectedChildId, setSelectedChildId, createMission, retryMission, updateMission, markMissionAsNotCompleted, requestRetryByParent, isParentVerified, setIsParentVerified } = useApp();
  const navigate = useNavigate();
  const [showPinInput, setShowPinInput] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED'>('ALL');
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [selectedChildName, setSelectedChildName] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null); // Toast 메시지 상태
  const [showEditModal, setShowEditModal] = useState<boolean>(false); // 공통 편집 모달 표시 여부
  const [editingMission, setEditingMission] = useState<Mission | null>(null); // 편집 중인 미션
  const [isRetryRequest, setIsRetryRequest] = useState<boolean>(false); // 재도전 요청인지 여부
  const [currentTime, setCurrentTime] = useState<number>(Date.now()); // 현재 시간 (리렌더링 트리거용)
  // 자녀 목록 (name, uid) - Firestore에서 조회한 정보
  const [childrenList, setChildrenList] = useState<Array<{ name: string; uid: string }>>([]);
  const [newMission, setNewMission] = useState({
    title: '',
    rewardPoint: 100,
    dueDate: '',
    missionType: 'DAILY' as 'DAILY' | 'WEEKLY',
    description: '',
  });

  // 마감일 선택을 위한 상태 (날짜, 시간, 분 분리)
  const [dueDateParts, setDueDateParts] = useState({
    date: '',
    hour: '0',
    minute: '0',
  });

  // 자녀 목록 정보 가져오기 (childrenIds 배열 기준)
  useEffect(() => {
    if (!user?.childrenIds || user.childrenIds.length === 0 || !db) {
      setChildrenList([]);
      return;
    }

    // 모든 자녀 정보를 병렬로 조회
    Promise.all(
      user.childrenIds.map(async (childId) => {
        try {
          // childId일 가능성이 있으므로 getUser 호출 (문서가 없으면 조용히 null 반환)
          const childUser = await getUser(childId);
          if (childUser) {
            return { name: childUser.name, uid: childId };
          }
          // childId가 user 문서가 아닐 수 있으므로 조용히 skip
          return null;
        } catch (error) {
          // childId일 가능성이 있으므로 조용히 처리
          return null;
        }
      })
    ).then((children) => {
      // null 값 필터링 (childId가 user 문서가 아닌 경우)
      const validChildren = children.filter((child) => child !== null);
      setChildrenList(validChildren);
    });
  }, [user?.childrenIds]);

  // 선택된 자녀의 이름 가져오기
  useEffect(() => {
    if (selectedChildId && db) {
      getUser(selectedChildId).then((childUser) => {
        if (childUser) {
          setSelectedChildName(childUser.name);
        } else {
          setSelectedChildName(null);
        }
      }).catch((error) => {
        setSelectedChildName(null);
      });
    } else {
      setSelectedChildName(null);
    }
  }, [selectedChildId]);

  // ==========================================================================
  // 컴포넌트는 "user가 이미 준비된 상태"만 가정
  // ==========================================================================
  // 
  // 로그인/세션 관리는 AppContext에서만 처리
  // 이 컴포넌트는 user와 loading 상태만 확인하여 UI를 렌더링
  // ==========================================================================

  // 현재 시간을 주기적으로 업데이트 (1초마다) - 즉시 반영을 위해
  useEffect(() => {
    // 즉시 한 번 실행 (마운트 시)
    setCurrentTime(Date.now());
    
    // 1초마다 업데이트 (더 빠른 반응성)
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000); // 1초마다 업데이트

    return () => clearInterval(interval);
  }, []);

  // 마감 체크: missions 또는 currentTime이 변경될 때마다 마감 처리 적용
  const checkedMissions = useMemo(() => {
    const now = new Date(currentTime);
    return checkAndUpdateExpiredMissions(missions, now);
  }, [missions, currentTime]);

  // 승인 대기 미션 (DONE_PENDING) - 상단 강조 표시용
  // 모든 hooks는 early return 전에 호출해야 함
  const pendingMissions = useMemo(() => {
    if (!user || user.role !== 'PARENT' || !selectedChildId) return [];
    return checkedMissions.filter(
      (mission) => mission.childId === selectedChildId && (mission.status === 'SUBMITTED' || mission.status === 'PENDING_REVIEW')
    );
  }, [checkedMissions, user, selectedChildId]);

  // 전체 미션 목록 (필터 적용)
  const filteredMissions = useMemo(() => {
    if (!user || user.role !== 'PARENT' || !selectedChildId) return [];
    // 선택된 자녀의 미션만 필터링
    const childMissions = checkedMissions.filter((m) => m.childId === selectedChildId);

    if (filter === 'ALL') return childMissions;
    if (filter === 'PENDING') return childMissions.filter((m) => m.status === 'SUBMITTED' || m.status === 'PENDING_REVIEW');
    if (filter === 'APPROVED') return childMissions.filter((m) => m.status === 'APPROVED' || m.status === 'COMPLETED');
    return childMissions.filter((m) => m.status === 'TODO' || m.status === 'IN_PROGRESS');
  }, [checkedMissions, filter, user, selectedChildId]);

  // loading 중이면 로딩 UI 표시
  // hooks 호출 후에 early return
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFEF9] flex items-center justify-center">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    );
  }

  // user가 없으면 임시 로그인 대기 (useEffect에서 처리 중)
  if (!user) {
    return (
      <div className="min-h-screen bg-[#FFFEF9] flex items-center justify-center">
        <p className="text-gray-500">로그인 중...</p>
      </div>
    );
  }

  // 부모가 아니면 홈으로 리다이렉트 (App.tsx에서 role에 따라 분기됨)
  if (user.role !== 'PARENT') {
    return <Navigate to="/" replace />;
  }

  // 아이 화면 진입 시에는 PIN 검증하지 않음
  // PIN은 부모 기능(미션 추가, 승인, 자녀 관리) 진입 시에만 요구

  // 부모 기능 접근 시 PIN 확인 (미션 추가, 승인, 자녀 관리 등)
  const handleParentAction = (action: () => void) => {
    if (!isParentVerified) {
      setShowPinInput(true);
      return;
    }
    action();
  };

  // PIN 입력 모달 표시
  if (showPinInput) {
    return (
      <PinInput
        onSuccess={() => {
          setIsParentVerified(true);
          setShowPinInput(false);
        }}
        onCancel={() => {
          setShowPinInput(false);
        }}
        title="PIN 입력"
        description="부모 기능에 접근하려면 PIN을 입력해주세요"
      />
    );
  }

  // 부모인 경우: 자녀가 있는지 체크
  const hasChildren = user.childrenIds && user.childrenIds.length > 0;

  // 자녀가 없으면 안내 화면 표시
  if (!hasChildren) {
    return (
      <div className="min-h-screen bg-[#FFFEF9] flex items-center justify-center px-5">
        <div className="text-center max-w-md w-full">
          <div className="mb-6 flex justify-center">
            <Character size="large" showSpeechBubble speechText="자녀를 추가해주세요" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-3">자녀를 먼저 추가해주세요</h2>
          <p className="text-gray-600 text-base mb-6">
            미션을 관리하려면 자녀 계정을 추가해야 합니다.
          </p>
          <button
            onClick={() => {
              // 자녀 추가는 부모 기능이므로 PIN 확인 필요
              handleParentAction(() => {
                navigate('/add-child');
              });
            }}
            className="w-full py-4 bg-blue-500 text-white rounded-2xl font-bold text-lg shadow-lg hover:bg-blue-600 transition-colors"
          >
            자녀 추가하기
          </button>
        </div>
      </div>
    );
  }

  // 자녀가 있지만 선택되지 않은 경우: 자녀 선택 화면 표시
  // selectedChildId가 null이면 반드시 자녀 선택 화면만 표시 (미션 화면 절대 표시 안 함)
  if (!selectedChildId) {
    return (
      <div className="min-h-screen bg-[#FFFEF9] flex items-center justify-center px-5">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">자녀를 선택하세요</h2>
            <p className="text-gray-600 text-base">관리할 자녀를 선택해주세요</p>
          </div>
          <div className="space-y-3">
            {childrenList.length === 0 ? (
              // 자녀 정보 로딩 중
              <div className="text-center py-8 text-gray-400">
                <p className="text-sm">자녀 정보를 불러오는 중...</p>
              </div>
            ) : (
              childrenList.map((child) => (
                <button
                  key={child.uid}
                  onClick={() => {
                    // 자녀 선택은 PIN 없이 가능
                    // 1. 선택한 childId(uid)를 AppContext의 selectedChildId에 저장
                    setSelectedChildId(child.uid);
                    
                    // 2. 선택된 자녀의 이름 저장
                    setSelectedChildName(child.name);
                    
                    // 3. 명확한 화면 전환을 위해 스크롤을 맨 위로 이동
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    
                    // selectedChildId가 설정되면 같은 컴포넌트 내에서 
                    // 미션 관리 화면으로 자동 전환됨 (조건부 렌더링)
                  }}
                  className="w-full py-4 px-5 bg-white rounded-2xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors text-left active:scale-95"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Character size="small" />
                      <div>
                        <h3 className="text-lg font-bold text-gray-800">{child.name}</h3>
                        <p className="text-sm text-gray-500 mt-1">미션을 관리하려면 선택하세요</p>
                      </div>
                    </div>
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="mt-6">
            {/* v1.0: 자녀 수 제한 (1명만 가능) */}
            {user.childrenIds && user.childrenIds.length >= 1 ? (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-line text-center">
                  현재는 한 명의 자녀만 관리할 수 있어요 🙂{'\n'}
                  다자녀 관리는 추후 업데이트에서 제공될 예정이에요.
                </p>
              </div>
            ) : (
              <button
                onClick={() => {
                  // 자녀 추가는 부모 기능이므로 PIN 확인 필요
                  handleParentAction(() => {
                    navigate('/add-child');
                  });
                }}
                className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              >
                + 자녀 추가하기
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const handleMissionClick = (missionId: string) => {
    // 부모는 제출된 미션(DONE_PENDING) 클릭 시 승인 화면으로 이동
    // 승인 화면은 부모 기능이므로 Approval 컴포넌트에서 PIN 확인
    // childId를 state로 전달하여 승인 후 해당 자녀 홈으로 돌아올 수 있도록 함
    const mission = checkedMissions.find(m => m.id === missionId);
    if (mission && (mission.status === 'SUBMITTED' || mission.status === 'PENDING_REVIEW')) {
      navigate('/approval', { 
        state: { childId: selectedChildId } 
      });
    }
  };

  // 공통 편집 팝업 열기 (재도전 요청 처리 또는 수정하기)
  const handleEditMission = async (missionId: string) => {
    const mission = checkedMissions.find(m => m.id === missionId);
    if (!mission) {
      return;
    }

    // EXPIRED 상태면 바로 재도전 요청 처리
    if (mission.status === 'EXPIRED') {
      try {
        await requestRetryByParent(missionId);
        setToastMessage('재도전 요청이 완료되었습니다.');
      } catch (error) {
        setToastMessage('재도전 요청에 실패했어요. 다시 시도해주세요.');
      }
      return;
    }

    // IN_PROGRESS 또는 RETRY_REQUESTED 상태면 수정 팝업 오픈
    if (mission.status === 'IN_PROGRESS' || mission.status === 'RETRY_REQUESTED') {
      setEditingMission(mission);
      setIsRetryRequest(mission.status === 'RETRY_REQUESTED');
      setShowEditModal(true);
    }
  };

  // 미션 수정 핸들러
  const handleUpdateMission = async (
    missionId: string,
    title: string,
    description: string,
    rewardPoint: number,
    dueDate: string,
    missionType: 'DAILY' | 'WEEKLY'
  ) => {
    try {
      await updateMission(missionId, title, description, rewardPoint, dueDate, missionType);
      setToastMessage('미션이 수정되었습니다.');
      setShowEditModal(false);
      setEditingMission(null);
    } catch (error) {
      setToastMessage(error instanceof Error ? error.message : '미션 수정에 실패했습니다.');
    }
  };

  // 미진행 처리 핸들러
  const handleMarkAsNotCompleted = async (missionId: string) => {
    try {
      await markMissionAsNotCompleted(missionId);
      setToastMessage('미진행으로 처리되었습니다.');
      setShowEditModal(false);
      setEditingMission(null);
    } catch (error) {
      setToastMessage(error instanceof Error ? error.message : '미진행 처리에 실패했습니다.');
    }
  };

  // TODO: 재도전 및 부분 승인 기능은 현재 미지원
  // 재도전 실행 (사용 안 함)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleRetrySubmit = async () => {
    // const retryMissionId: string | null = null;
    // const retryDueDateParts = { date: '', hour: '0', minute: '0' };
    setToastMessage('재도전 기능은 현재 지원되지 않습니다.');
  };

  // 부분 승인 핸들러 (사용 안 함)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handlePartialApprove = (missionId: string) => {
    setToastMessage('부분 승인 기능은 현재 지원되지 않습니다.');
  };

  // 부분 승인 실행 (사용 안 함)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handlePartialSubmit = async () => {
    setToastMessage('부분 승인 기능은 현재 지원되지 않습니다.');
  };

  // selectedChildId가 설정된 경우에만 부모 홈(미션 관리 화면) 렌더링
  // 이 시점에서 selectedChildId는 반드시 설정되어 있어야 함
  // (위의 83번 줄에서 이미 체크했으므로 이론적으로는 도달하지 않아야 함)
  if (!selectedChildId) {
    // 안전장치: 혹시 모를 경우를 대비한 추가 체크
    return (
      <div className="min-h-screen bg-[#FFFEF9] flex items-center justify-center">
        <p className="text-gray-500">자녀를 선택해주세요</p>
      </div>
    );
  }

  // 선택된 자녀 기준의 부모 홈(미션 관리 화면) 렌더링
  return (
    <div className="min-h-screen bg-[#FFFEF9] pb-8">
      {/* Header */}
      <div className="bg-white px-5 pt-12 pb-6">
        {/* 자녀 선택 변경 버튼 */}
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => {
              // 자녀 선택 화면으로 돌아가는 것은 PIN 없이 가능
              setSelectedChildId(null);
              setSelectedChildName(null);
              setIsParentVerified(false); // 자녀 선택 화면으로 돌아가면 PIN 확인 해제
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">자녀 선택</span>
          </button>
          {selectedChildName && (
            <div className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
              {selectedChildName}의 미션
            </div>
          )}
        </div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-gray-600 text-base mb-1">안녕하세요,</p>
            <h1 className="text-3xl font-bold text-gray-800">{user.name}</h1>
          </div>
          <div className="bg-yellow-100 rounded-full px-4 py-2 flex items-center gap-2">
            <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
            </svg>
            <span className="text-lg font-bold text-yellow-700">{user.totalPoint.toLocaleString()}</span>
          </div>
        </div>

      </div>

      {/* 승인 대기 미션 섹션 (강조 표시) */}
      {pendingMissions.length > 0 && (
        <div className="px-5 mt-6">
          <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold text-orange-800">확인이 필요한 미션</h2>
              <span className="px-3 py-1 bg-orange-200 text-orange-700 rounded-full text-sm font-bold">
                {pendingMissions.length}
              </span>
            </div>
            <div className="space-y-2">
              {pendingMissions.map((mission) => (
                <MissionCard
                  key={mission.id}
                  mission={mission}
                  onClick={() => handleMissionClick(mission.id)}
                  isParentMode={true}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 전체 미션 목록 섹션 */}
      <div className="px-5 mt-4">
        <h2 className="text-xl font-bold text-gray-800 mb-4">전체 미션</h2>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setFilter('ALL')}
            className={`
              flex-1 py-3 px-4 rounded-xl text-base font-medium transition-colors
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
              flex-1 py-3 px-4 rounded-xl text-base font-medium transition-colors
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
              flex-1 py-3 px-4 rounded-xl text-base font-medium transition-colors
              ${filter === 'APPROVED' 
                ? 'bg-green-100 border-2 border-green-300 text-green-800' 
                : 'bg-white border-2 border-gray-200 text-gray-600'}
            `}
          >
            완료됨
          </button>
        </div>
      </div>

      {/* Mission List */}
      <div className="px-5">
        {filteredMissions.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="mb-4 flex justify-center">
              <Character size="large" showSpeechBubble speechText="미션을 만들어주세요" />
            </div>
            <p className="text-lg">아직 미션이 없어요</p>
            <p className="text-sm text-gray-400 mt-1">새로운 미션을 추가해보세요</p>
          </div>
        ) : (
          filteredMissions.map((mission) => (
            <MissionCard
              key={mission.id}
              mission={mission}
              onClick={() => handleMissionClick(mission.id)}
              isParentMode={true}
              onEdit={
                (mission.status === 'RETRY_REQUESTED' || mission.status === 'EXPIRED' || mission.status === 'IN_PROGRESS')
                  ? handleEditMission
                  : undefined
              }
            />
          ))
        )}
      </div>

      {/* 미션 추가하기 버튼 */}
      <div className="px-5 mt-6">
        <button
          onClick={() => {
            handleParentAction(() => {
              setShowCreateModal(true);
            });
          }}
          className="w-full py-4 bg-blue-500 text-white rounded-2xl font-bold text-lg shadow-lg hover:bg-blue-600 transition-colors"
        >
          + 미션 추가하기
        </button>
      </div>


      {/* 미션 생성 모달 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-5">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-800">미션 추가하기</h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewMission({
                    title: '',
                    rewardPoint: 100,
                    dueDate: '',
                    missionType: 'DAILY',
                    description: '',
                  });
                  setDueDateParts({
                    date: '',
                    hour: '0',
                    minute: '0',
                  });
                }}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* 미션 타입 선택 */}
              <div>
                <label className="block text-gray-700 font-medium mb-2">미션 종류</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setNewMission({ ...newMission, missionType: 'DAILY' })}
                    className={`flex-1 py-2 px-4 rounded-xl font-medium transition-colors ${
                      newMission.missionType === 'DAILY'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    일별
                  </button>
                  <button
                    onClick={() => setNewMission({ ...newMission, missionType: 'WEEKLY' })}
                    className={`flex-1 py-2 px-4 rounded-xl font-medium transition-colors ${
                      newMission.missionType === 'WEEKLY'
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    주간
                  </button>
                </div>
              </div>

              {/* 미션명 */}
              <div>
                <label className="block text-gray-700 font-medium mb-2">미션명</label>
                <input
                  type="text"
                  value={newMission.title}
                  onChange={(e) => setNewMission({ ...newMission, title: e.target.value })}
                  placeholder="예: 숙제하기"
                  className="w-full p-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 text-base"
                />
              </div>

              {/* 보상 포인트 */}
              <div>
                <label className="block text-gray-700 font-medium mb-2">보상 포인트</label>
                <input
                  type="number"
                  value={newMission.rewardPoint}
                  onChange={(e) =>
                    setNewMission({ ...newMission, rewardPoint: parseInt(e.target.value) || 0 })
                  }
                  min="0"
                  className="w-full p-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 text-base"
                />
              </div>

              {/* 마감일 */}
              <div>
                <label className="block text-gray-700 font-medium mb-2">마감일</label>
                <div className="space-y-3">
                  {/* 날짜 선택 */}
                  <input
                    type="date"
                    value={dueDateParts.date}
                    onChange={(e) => {
                      const newParts = { ...dueDateParts, date: e.target.value };
                      setDueDateParts(newParts);
                      // datetime-local 형식으로 변환하여 저장
                      if (newParts.date) {
                        const datetimeValue = `${newParts.date}T${String(newParts.hour).padStart(2, '0')}:${String(newParts.minute).padStart(2, '0')}:00`;
                        setNewMission({ ...newMission, dueDate: datetimeValue });
                      }
                    }}
                    className="w-full p-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 text-base"
                  />
                  {/* 시간 선택 (1시간 단위) */}
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-sm text-gray-600 mb-1">시간</label>
                      <select
                        value={dueDateParts.hour}
                        onChange={(e) => {
                          const newParts = { ...dueDateParts, hour: e.target.value };
                          setDueDateParts(newParts);
                          // datetime-local 형식으로 변환하여 저장
                          if (newParts.date) {
                            const datetimeValue = `${newParts.date}T${String(newParts.hour).padStart(2, '0')}:${String(newParts.minute).padStart(2, '0')}:00`;
                            setNewMission({ ...newMission, dueDate: datetimeValue });
                          }
                        }}
                        className="w-full p-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 text-base"
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>
                            {String(i).padStart(2, '0')}시
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* 분 선택 (30분 단위) */}
                    <div className="flex-1">
                      <label className="block text-sm text-gray-600 mb-1">분</label>
                      <select
                        value={dueDateParts.minute}
                        onChange={(e) => {
                          const newParts = { ...dueDateParts, minute: e.target.value };
                          setDueDateParts(newParts);
                          // datetime-local 형식으로 변환하여 저장
                          if (newParts.date) {
                            const datetimeValue = `${newParts.date}T${String(newParts.hour).padStart(2, '0')}:${String(newParts.minute).padStart(2, '0')}:00`;
                            setNewMission({ ...newMission, dueDate: datetimeValue });
                          }
                        }}
                        className="w-full p-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 text-base"
                      >
                        <option value="0">00분</option>
                        <option value="30">30분</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewMission({
                    title: '',
                    rewardPoint: 100,
                    dueDate: '',
                    missionType: 'DAILY',
                    description: '',
                  });
                  setDueDateParts({
                    date: '',
                    hour: '0',
                    minute: '0',
                  });
                }}
                className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  if (!newMission.title.trim()) {
                    alert('미션명을 입력해주세요.');
                    return;
                  }
                  if (!dueDateParts.date) {
                    alert('마감일을 선택해주세요.');
                    return;
                  }
                  if (newMission.rewardPoint <= 0) {
                    alert('보상 포인트는 0보다 커야 합니다.');
                    return;
                  }

                  try {
                    // ISO 형식으로 변환
                    const dueDateISO = new Date(newMission.dueDate).toISOString();
                    await createMission(
                      newMission.title,
                      newMission.rewardPoint,
                      dueDateISO,
                      newMission.missionType,
                      newMission.description
                    );
                    setShowCreateModal(false);
                    setNewMission({
                      title: '',
                      rewardPoint: 100,
                      dueDate: '',
                      missionType: 'DAILY',
                      description: '',
                    });
                    setDueDateParts({
                      date: '',
                      hour: '0',
                      minute: '0',
                    });
                    // 미션 추가 완료 피드백
                    setToastMessage('미션이 추가되었어요 ✨');
                  } catch (error) {
                    alert(error instanceof Error ? error.message : '미션 생성에 실패했습니다.');
                  }
                }}
                className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors"
              >
                추가하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 공통 편집 팝업 */}
      <MissionEditModal
        mission={editingMission}
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingMission(null);
          setIsRetryRequest(false);
        }}
        onEdit={handleUpdateMission}
        onMarkAsNotCompleted={handleMarkAsNotCompleted}
        isRetryRequest={isRetryRequest}
      />

      {/* 기존 재도전 모달 (하위 호환성 유지, 사용 안 함) */}
      {false && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-5">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-800">재도전 미션 생성</h2>
              <button
                onClick={() => {
                  // setShowRetryModal(false);
                  // setRetryMissionId(null);
                  // setRetryDueDateParts({ date: '', hour: '0', minute: '0' });
                }}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-xl">
                <p className="text-sm text-gray-600 mb-2">새로운 마감일을 선택해주세요</p>
                <p className="text-xs text-gray-500">기존 미션 정보는 그대로 유지됩니다</p>
              </div>

              {/* 마감일 선택 */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">마감일</label>
                <input
                  type="date"
                  value={''}
                  onChange={(e) => {
                    // setRetryDueDateParts({ ...retryDueDateParts, date: e.target.value });
                  }}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full p-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 text-base"
                />
              </div>

              {/* 시간 선택 */}
              {false && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">마감 시간</label>
                  <div className="flex gap-2">
                    {/* 시간 선택 */}
                    <div className="flex-1">
                      <select
                        value={'0'}
                        onChange={(e) => {
                          // setRetryDueDateParts({ ...retryDueDateParts, hour: e.target.value });
                        }}
                        className="w-full p-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 text-base"
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>
                            {String(i).padStart(2, '0')}시
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* 분 선택 (30분 단위) */}
                    <div className="flex-1">
                      <select
                        value={'0'}
                        onChange={(e) => {
                          // setRetryDueDateParts({ ...retryDueDateParts, minute: e.target.value });
                        }}
                        className="w-full p-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 text-base"
                      >
                        <option value="0">00분</option>
                        <option value="30">30분</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  // setShowRetryModal(false);
                  // setRetryMissionId(null);
                  // setRetryDueDateParts({ date: '', hour: '0', minute: '0' });
                }}
                className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => handleRetrySubmit()}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors"
              >
                재도전 생성
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 부분 승인 모달 (사용 안 함) */}
      {false && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-5">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-800">부분 승인하기</h2>
              <button
                onClick={() => {
                  // setShowPartialModal(false);
                  // setPartialMissionId(null);
                  // setPartialPoint(0);
                }}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-xl">
                <p className="text-sm text-gray-600 mb-2">부분 승인할 포인트를 입력해주세요</p>
                {(() => {
                  const mission = checkedMissions.find(m => m.id === '');
                  if (!mission) return null;
                  const rewardPoint = mission?.rewardPoint;
                  if (typeof rewardPoint !== 'number') return null;
                  return (
                    <p className="text-xs text-gray-500">
                      전체 보상: {rewardPoint}P
                    </p>
                  );
                })()}
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">부분 승인 포인트</label>
                <input
                  type="number"
                  min="1"
                  max={(() => {
                    const mission = checkedMissions.find(m => m.id === '');
                    return mission?.rewardPoint ?? 0;
                  })()}
                  value={0}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (!isNaN(value) && value > 0) {
                      const mission = checkedMissions.find(m => m.id === '');
                      const maxPoint = mission?.rewardPoint ?? 0;
                      // setPartialPoint(Math.min(value, maxPoint));
                    }
                  }}
                  className="w-full p-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 text-base"
                  placeholder="포인트 입력"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  // setShowPartialModal(false);
                  // setPartialMissionId(null);
                  // setPartialPoint(0);
                }}
                className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handlePartialSubmit}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
              >
                부분 승인
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
    </div>
  );
};

export default Home;


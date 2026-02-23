import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { canApproveMission, canRejectMission } from '../utils/permissions';
import { getUser } from '../firebase/users';
import Character from './Character';
import Toast from './Toast';
import PageLayout from './PageLayout';
import { NORMAL_HEADER_HEIGHT } from '../constants/layout';

/**
 * 부모 전용 승인 화면
 * - SUBMITTED 또는 REQUEST 상태의 미션만 표시
 * - 부모가 만든 미션이거나 자녀의 미션만 표시
 * 
 * 네비게이션 규칙:
 * - 승인/반려 후: 해당 자녀 홈으로 이동 (selectedChildId 유지)
 * - 뒤로가기: 해당 자녀 홈으로 이동
 */
const Approval: React.FC = () => {
  const { user, missions, approveMission, rejectMission, selectedChildId } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  // 처리 중인 미션 ID (버튼 비활성화용)
  const [processingMissionId, setProcessingMissionId] = useState<string | null>(null);
  // 네비게이션 중복 이동 방지 플래그
  const isNavigatingRef = React.useRef(false);
  // Toast 메시지 상태
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // 첫 번째 미션의 아이 이름 (헤더 타이틀용)
  const [headerChildName, setHeaderChildName] = useState<string | null>(null);
  // 재도전 확인 모달 상태
  const [showRetryConfirm, setShowRetryConfirm] = useState(false);
  const [pendingRetryMissionId, setPendingRetryMissionId] = useState<string | null>(null);

  // 현재 자녀 ID (location.state 또는 selectedChildId)
  const currentChildId = (location.state as { childId?: string })?.childId || selectedChildId;
  // 특정 미션 ID (location.state에서 전달받음, 선택적)
  const targetMissionId = (location.state as { missionId?: string })?.missionId;

  // 자녀 홈으로 이동하는 헬퍼 함수
  // 네비게이션 중복 이동 방지: 이미 이동 중이면 early return
  const navigateToChildHome = () => {
    // 중복 이동 방지: 이미 이동 중이면 early return
    if (isNavigatingRef.current) {
      return;
    }
    isNavigatingRef.current = true;

    if (currentChildId) {
      // 해당 자녀 홈으로 이동 (replace로 히스토리 스택에 쌓이지 않음)
      navigate(`/parent/child/${currentChildId}`, { replace: true });
    } else {
      // 자녀 ID가 없으면 부모 대시보드로 이동
      navigate('/parent', { replace: true });
    }
  };

  // 사용자가 없거나 부모가 아니면 접근 제한
  if (!user || user.role !== 'PARENT') {
    return (
      <PageLayout headerHeight={NORMAL_HEADER_HEIGHT} className="flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg mb-2">부모만 접근할 수 있는 화면입니다.</p>
          <button
            onClick={() => navigate('/role-select')}
            className="text-blue-500 hover:underline"
          >
            역할 선택으로 돌아가기
          </button>
        </div>
      </PageLayout>
    );
  }

  // PIN 인증은 ParentRouteGuard에서 처리되므로 여기서는 제거

  // 부모 권한 체크 (이미 위에서 체크했으므로 항상 true)
  const isUserParent = true;

  // 부모가 승인할 수 있는 제출된 미션만 필터링
  // SUBMITTED + RESUBMITTED 모두 승인 대상
  // targetMissionId가 있으면 해당 미션만 필터링
  const submittedMissions = useMemo(() => {
    if (!isUserParent) {
      return [];
    }
    const allSubmissions = missions.filter(mission => {
      // canApproveMission 함수가 이미 상태와 권한을 모두 체크하므로
      // 이 함수의 결과만 사용하면 됨
      return canApproveMission(user, mission);
    });
    
    // targetMissionId가 있으면 해당 미션만 반환
    if (targetMissionId) {
      return allSubmissions.filter(mission => mission.id === targetMissionId);
    }
    
    return allSubmissions;
  }, [missions, user, isUserParent, targetMissionId]);

  // 헤더 타이틀용 아이 이름 가져오기 (첫 번째 미션의 childId 사용)
  useEffect(() => {
    if (submittedMissions.length > 0) {
      const firstMissionChildId = submittedMissions[0].childId;
      getUser(firstMissionChildId)
        .then((childUser) => {
          if (childUser) {
            setHeaderChildName(childUser.name);
          } else {
            setHeaderChildName(null);
          }
        })
        .catch((error) => {
          setHeaderChildName(null);
        });
    } else {
      setHeaderChildName(null);
    }
  }, [submittedMissions]);

  /**
   * 미션 승인 처리
   * - 권한 체크
   * - Firestore 트랜잭션으로 미션 상태 업데이트 및 포인트 적립
   * - 완료 후 부모 홈으로 이동
   * - 중복 호출 방지: 처리 중인 경우 early return
   */
  const handleApprove = async (missionId: string) => {
    // 중복 호출 방지: 이미 처리 중이면 early return
    if (processingMissionId !== null) {
      return;
    }

    const mission = missions.find(m => m.id === missionId);
    if (!mission) {
      alert('미션 정보를 불러올 수 없어요');
      return;
    }

    // 권한 체크
    if (!canApproveMission(user, mission)) {
      alert('이 미션은 이미 처리되었어요');
      return;
    }

    // 처리 중 상태 설정
    setProcessingMissionId(missionId);

    try {
      // Firestore 트랜잭션으로 미션 상태 업데이트 및 포인트 적립
      await approveMission(missionId);
      // 승인 완료 피드백
      setToastMessage('미션을 승인했어요 ✨');
      // 화면 이동을 먼저 처리 (데이터 초기화보다 우선)
      navigateToChildHome();
    } catch (error) {
      alert(error instanceof Error ? error.message : '승인 처리가 완료되지 않았어요');
      setProcessingMissionId(null);
    }
  };

  /**
   * 미션 재도전 요청 확인 모달 열기
   * - 부모가 "다시 해볼까요?" 버튼을 클릭했을 때 호출
   * - 확인 모달을 먼저 표시
   */
  const handleRejectClick = (missionId: string) => {
    const mission = missions.find(m => m.id === missionId);
    if (!mission) {
      alert('미션 정보를 불러올 수 없어요');
      return;
    }

    // 권한 체크
    if (!canRejectMission(user, mission)) {
      alert('이 미션은 이미 처리되었어요');
      return;
    }

    // 확인 모달 표시
    setPendingRetryMissionId(missionId);
    setShowRetryConfirm(true);
  };

  /**
   * 미션 재도전 요청 처리
   * - 부모가 확인 모달에서 "네, 다시 도전하게 할게요" 버튼을 클릭했을 때 호출
   * - 상태를 REQUEST로 변경하여 아이가 다시 도전할 수 있도록 함
   */
  const handleConfirmRetry = async () => {
    if (!pendingRetryMissionId) {
      return;
    }

    // 중복 호출 방지: 이미 처리 중이면 early return
    if (processingMissionId !== null) {
      return;
    }

    const missionId = pendingRetryMissionId;
    
    // 모달 닫기
    setShowRetryConfirm(false);
    setPendingRetryMissionId(null);

    // 처리 중 상태 설정
    setProcessingMissionId(missionId);

    try {
      // Firestore에 미션 재도전 요청 업데이트 (REQUEST 상태로 변경)
      await rejectMission(missionId);
      // 재도전 요청 완료 피드백
      setToastMessage('다시 도전하게 했어요 💪');
      // 화면 이동을 먼저 처리 (데이터 초기화보다 우선)
      navigateToChildHome();
    } catch (error) {
      alert(error instanceof Error ? error.message : '처리가 완료되지 않았어요');
      setProcessingMissionId(null);
    }
  };

  /**
   * 재도전 요청 취소
   * - 부모가 확인 모달에서 "지금은 그대로 둘게요" 버튼을 클릭했을 때 호출
   */
  const handleCancelRetry = () => {
    setShowRetryConfirm(false);
    setPendingRetryMissionId(null);
  };

  // 부모가 아닌 경우 접근 제한
  if (!isUserParent) {
    return (
      <PageLayout headerHeight={NORMAL_HEADER_HEIGHT} className="flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg mb-2">부모만 접근할 수 있는 화면입니다.</p>
          <button
            onClick={() => navigate('/')}
            className="text-blue-500 hover:underline"
          >
            홈으로 돌아가기
          </button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout headerHeight={NORMAL_HEADER_HEIGHT} className="pb-8">
      {/* Header */}
      <div className="bg-white px-5 pt-4 pb-4 flex items-center gap-4">
        <button
          onClick={navigateToChildHome}
          className="w-10 h-10 flex items-center justify-center"
        >
          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-gray-800">
          {headerChildName ? `${headerChildName}의 미션` : '미션 승인'}
        </h1>
      </div>

      <div className="px-5 mt-6">
        {/* 처리 중일 때는 Empty State를 표시하지 않고 로딩 상태 표시 */}
        {processingMissionId !== null ? (
          <div className="text-center py-12">
            <div className="mb-4 flex justify-center">
              <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <p className="text-gray-500 text-lg">처리 중...</p>
          </div>
        ) : submittedMissions.length === 0 ? (
          <div className="text-center py-12">
            <div className="mb-4 flex justify-center">
              <Character size="large" showSpeechBubble speechText="확인할 미션이 없어요" />
            </div>
            <p className="text-gray-400 text-lg">확인할 미션이 없어요</p>
            <p className="text-sm text-gray-300 mt-2">자녀가 미션을 제출하면 여기에 표시됩니다</p>
          </div>
        ) : (
          submittedMissions.map(mission => {
            // 아이 이름은 각 미션마다 필요하므로 별도 상태로 관리하지 않고
            // 헤더에는 첫 번째 미션의 아이 이름만 표시
            const isProcessing = processingMissionId === mission.id;

            return (
            <div key={mission.id} className="bg-white rounded-2xl p-5 mb-4 shadow-sm border-2 border-gray-100">

              {/* Mission Title */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                    mission.missionType === 'DAILY' ? 'bg-blue-500' : 'bg-orange-500'
                  }`}>
                    {mission.missionType === 'DAILY' ? '일' : '주'}
                  </div>
                  <h2 className="text-xl font-bold text-gray-800">{mission.title}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-green-600">+{mission.rewardPoint}</span>
                  <span className="text-sm text-gray-500">포인트</span>
                </div>
              </div>


              {/* 아이가 작성한 메모 */}
              {mission.memo && (
                <div className="mb-4">
                  <p className="text-sm text-gray-500 mb-2">아이가 작성한 메모</p>
                  <p className="text-gray-700 text-base bg-gray-50 p-4 rounded-xl">
                    {mission.memo}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => handleApprove(mission.id)}
                  disabled={!canApproveMission(user, mission) || isProcessing}
                  className={`flex-1 py-4 rounded-xl font-bold text-base transition-colors ${
                    canApproveMission(user, mission) && !isProcessing
                      ? 'bg-green-500 text-white hover:bg-green-600 active:bg-green-700'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {isProcessing ? '처리 중...' : '👍 미션 완료!'}
                </button>
                <button
                  onClick={() => handleRejectClick(mission.id)}
                  disabled={!canRejectMission(user, mission) || isProcessing}
                  className={`flex-1 py-4 rounded-xl font-bold text-base transition-colors border-2 ${
                    canRejectMission(user, mission) && !isProcessing
                      ? 'bg-white border-red-400 text-red-600 hover:bg-red-50 active:bg-red-100'
                      : 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {isProcessing ? '처리 중...' : '다시 해볼까요?'}
                </button>
              </div>
            </div>
            );
          })
        )}
      </div>

      {/* 재도전 요청 확인 모달 */}
      {showRetryConfirm && (
        <>
          {/* 배경 오버레이 */}
          <div
            className="fixed inset-0 bg-black/30 z-50"
            onClick={handleCancelRetry}
          />
          {/* 모달 */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
              {/* 제목 */}
              <h3 className="text-xl font-bold text-gray-800 mb-4">
                다시 도전하게 할까요?
              </h3>
              {/* 본문 */}
              <p className="text-base text-gray-600 mb-6 leading-relaxed whitespace-pre-line">
                아이가 한 번 더 도전해볼 수 있어요.{'\n'}괜찮다면 다시 진행할게요.
              </p>
              {/* 버튼 */}
              <div className="flex gap-3">
                <button
                  onClick={handleCancelRetry}
                  className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
                >
                  지금은 그대로 둘게요
                </button>
                <button
                  onClick={handleConfirmRetry}
                  className="flex-1 py-3 px-4 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600 transition-colors"
                >
                  네, 다시 도전하게 할게요
                </button>
              </div>
            </div>
          </div>
        </>
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
    </PageLayout>
  );
};

export default Approval;


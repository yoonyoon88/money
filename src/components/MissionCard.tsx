import React from 'react';
import { Mission } from '../types';
import { formatDueDate } from '../utils/missionDateUtils';
import { useApp } from '../context/AppContext';
import { getInterpretedStatus, isParentRequestedRetry, isChildRetrying, isChildRequestedRetry } from '../utils/missionStatusUtils';
import { canEditMission } from '../utils/permissions';

interface MissionCardProps {
  mission: Mission;
  onClick?: () => void;
  isParentMode?: boolean;
  isPreview?: boolean; // 미리보기 모드 (보호자가 아이 화면을 볼 때)
  onDelete?: (missionId: string) => void;
  onEdit?: (missionId: string) => void; // 수정 핸들러 (부모 화면)
  onRetry?: (missionId: string) => void; // 재도전 허용 (부모 화면)
  onRetryRequest?: (missionId: string) => void; // 다시 도전 요청 (아이 화면)
  onApproveRetry?: (missionId: string) => void; // 재도전 요청 승인 (부모 화면, 선택)
  onRejectRetry?: (missionId: string) => void; // 재도전 요청 거절 (부모 화면, 선택)
  onPartialApprove?: (missionId: string) => void; // 부분 승인
  onFail?: (missionId: string) => void; // 실패 처리
  currentTime?: number; // 현재 시간 (밀리초, 디버그용)
  isFavorite?: boolean; // 자주 쓰는 미션 템플릿 여부 (부모 화면)
  onToggleFavorite?: (missionId: string) => void;
}

const MissionCard: React.FC<MissionCardProps> = ({ 
  mission, 
  onClick, 
  isParentMode = false,
  isPreview = false,
  onDelete,
  onEdit,
  onRetry,
  onRetryRequest,
  onApproveRetry,
  onRejectRetry,
  onPartialApprove,
  onFail,
  currentTime = Date.now(),
  isFavorite = false,
  onToggleFavorite,
}) => {
  // 현재 로그인 사용자 정보 및 컨텍스트 함수 가져오기
  const { user: authUser, approveRetry, rejectRetry } = useApp();


  // 상태 해석: 유틸 함수를 사용하여 일관된 상태 판별
  const interpretedStatus = getInterpretedStatus(mission);
  const isExpired = mission.status === 'EXPIRED';
  const isCompleted = interpretedStatus === 'COMPLETED' || interpretedStatus === 'APPROVED';
  // 승인대기 기준: status === 'SUBMITTED' 단 하나만 사용
  const isPending = mission.status === 'SUBMITTED';
  const isInProgress = interpretedStatus === 'IN_PROGRESS' || interpretedStatus === 'TODO';
  // 부모가 재도전 요청한 경우만 RESUBMITTED로 인식
  const isResubmitted = isParentRequestedRetry(mission);
  // 아이가 재도전 중인지 확인 (IN_PROGRESS && retryRequestedBy === 'parent')
  const isChildRetryingNow = isChildRetrying(mission);
  // 아이가 재도전 요청한 상태인지 확인 (RETRY_REQUESTED && retryRequestedBy === 'child')
  const isChildRequestedRetryNow = isChildRequestedRetry(mission);
  
  // 디버깅: 부모 모드에서 재도전 요청 상태 확인
  if (isParentMode && import.meta.env.DEV) {
    console.log('[MissionCard] 재도전 요청 상태 체크', {
      missionId: mission.id,
      status: mission.status,
      retryRequestedBy: mission.retryRequestedBy,
      isChildRequestedRetryNow,
      hasOnClick: !!onClick,
      hasOnApproveRetry: !!onApproveRetry,
      hasOnRejectRetry: !!onRejectRetry,
      onApproveRetryType: typeof onApproveRetry,
      onRejectRetryType: typeof onRejectRetry,
    });
  }
  
  const isRetryApproved = mission.status === 'RETRY_APPROVED';
  const isRetryRejected = mission.status === 'RETRY_REJECTED';
  const isNotCompleted = mission.status === 'NOT_COMPLETED';
  
  // TODO: 반복 미션 기능은 출시 이후 재도입 예정. 현재는 단일 미션만 지원
  // 미션 수정 가능 여부 확인 (단일 미션 기준으로만 판단)
  const canEdit = canEditMission(mission);
  
  // 재도전 요청 버튼 표시 조건:
  // - 부모 모드가 아님 (!isParentMode) - 아이 화면에서만 표시
  // - 미리보기 모드가 아님 (!isPreview) - 보호자가 미리보기할 때 숨김
  // - EXPIRED 상태
  // - RETRY_REQUESTED가 아님
  // - onRetryRequest prop이 전달됨
  const canShowRetryRequestButton = 
    !isParentMode && 
    !isPreview && 
    isExpired && 
    !isResubmitted &&
    !!onRetryRequest;


  // 상태 배지
  // 재요청(RETRY_REQUESTED)과 확인 중(PENDING_REVIEW)을 명확히 구분
  const getStatusBadge = () => {
    if (mission.status === 'COMPLETED' || mission.status === 'APPROVED') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
          완료
        </span>
      );
    } else if (mission.status === 'SUBMITTED') {
      // 확인 중: 아이가 제출한 미션을 부모가 확인 중인 상태
      // UI 뱃지 '확인중'은 status === 'SUBMITTED' 일 때만 표시
      return (
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
          확인 중
        </span>
      );
    } else if (mission.status === 'PARTIAL_APPROVED') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
          부분 승인
        </span>
      );
    } else if (mission.status === 'EXPIRED') {
      // 실패(기한 초과) 상태
      return (
        <span className="bg-red-100 text-red-600 text-xs font-semibold px-2 py-1 rounded-full">
          실패
        </span>
      );
    } else if (isParentRequestedRetry(mission)) {
      // 재도전 요청: 부모가 '다시 해볼까'를 눌러 아이가 재도전 요청한 상태
      return (
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
          {isParentMode ? '아이 재도전 중' : '재도전 중'}
        </span>
      );
    } else if (isChildRequestedRetry(mission) && (mission.status === 'RETRY_REQUESTED' || mission.status === 'REQUEST')) {
      // 아이가 재도전 요청한 상태
      return (
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
          재도전 요청됨
        </span>
      );
    } else if (mission.status === 'RETRY_APPROVED') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
          재도전 승인
        </span>
      );
    } else if (mission.status === 'RETRY_REJECTED') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
          재도전 거절
        </span>
      );
    } else if (mission.status === 'NOT_COMPLETED') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          미진행
        </span>
      );
    } else {
      // 아이 화면: 진행 중 배지 (가볍게 pulse)
      if (!isParentMode) {
        return (
          <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-1 rounded-full font-medium animate-pulse">
            진행 중
          </span>
        );
      }
      return (
        <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full font-medium">
          진행 중
        </span>
      );
    }
  };

  const getRewardColor = () => {
    if (mission.rewardPoint >= 300) {
      return 'text-green-600';
    } else if (mission.rewardPoint >= 150) {
      return 'text-orange-500';
    }
    return 'text-orange-400';
  };

  // TODO: 반복 미션 기능은 출시 이후 재도입 예정. 현재는 단일 미션만 지원
  // 반복 미션 아이콘 및 문구는 제거됨

  const renderFavoriteButton = () => {
    if (!isParentMode || !onToggleFavorite) return null;
    const icon = isFavorite ? '★' : '☆';
    const colorClass = isFavorite ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-300';
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(mission.id);
        }}
        className={`mr-1 text-base ${colorClass}`}
        aria-label={isFavorite ? '자주 쓰는 미션 해제' : '자주 쓰는 미션으로 저장'}
      >
        {icon}
      </button>
    );
  };

  // 부모 화면
  if (isParentMode) {
    // 재도전 요청된 미션은 카드 클릭 시 승인/거절 화면으로 이동
    const isClickable = isChildRequestedRetryNow && onClick;
    
    return (
      <div 
        className={`rounded-2xl p-3 mb-2 shadow-sm border-2 ${isExpired ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'} ${isClickable ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
        onClick={(e) => {
          if (import.meta.env.DEV) {
            console.log('[MissionCard] 카드 클릭 이벤트 발생', { 
              missionId: mission.id, 
              status: mission.status,
              retryRequestedBy: mission.retryRequestedBy,
              isChildRequestedRetryNow,
              hasOnClick: !!onClick,
              isClickable
            });
          }
          if (isClickable) {
            e.stopPropagation();
            onClick();
          }
        }}
      >
        {(isChildRequestedRetryNow || (mission.status === 'RETRY_REQUESTED' && mission.retryRequestedBy === 'child')) ? (
          // 아이가 재도전 요청한 상태
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {renderFavoriteButton()}
                  <h3 className="text-base font-bold text-gray-800">
                    {mission.title}
                  </h3>
                  {getStatusBadge()}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">아이가 재도전을 요청했어요</p>
                  <div className={`text-sm font-semibold ${getRewardColor()}`}>
                    +{mission.rewardPoint}P
                  </div>
                </div>
              </div>
            </div>
            {/* 승인/거절 버튼 - 컨텍스트 함수를 기본으로 사용하고, props가 있으면 우선 사용 */}
            <div className="flex gap-2 mt-3">
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (import.meta.env.DEV) {
                    console.log('[MissionCard] 승인하기 버튼 클릭', { missionId: mission.id });
                  }
                  try {
                    if (onApproveRetry) {
                      onApproveRetry(mission.id);
                    } else if (approveRetry) {
                      await approveRetry(mission.id);
                    }
                  } catch (error) {
                    if (import.meta.env.DEV) {
                      console.error('[MissionCard] 재도전 승인 처리 실패', error);
                    }
                  }
                }}
                className="flex-1 py-2.5 bg-green-500 text-white rounded-xl text-sm font-medium hover:bg-green-600 transition-colors"
              >
                승인하기
              </button>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (import.meta.env.DEV) {
                    console.log('[MissionCard] 거절하기 버튼 클릭', { missionId: mission.id });
                  }
                  try {
                    if (onRejectRetry) {
                      onRejectRetry(mission.id);
                    } else if (rejectRetry) {
                      await rejectRetry(mission.id);
                    }
                  } catch (error) {
                    if (import.meta.env.DEV) {
                      console.error('[MissionCard] 재도전 거절 처리 실패', error);
                    }
                  }
                }}
                className="flex-1 py-2.5 bg-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-400 transition-colors"
              >
                거절하기
              </button>
            </div>
          </div>
        ) : isResubmitted || isChildRetryingNow ? (
          <div
            onClick={onClick}
            className="cursor-pointer hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {renderFavoriteButton()}
                  <h3 className="text-base font-bold text-gray-800">
                    {mission.title}
                  </h3>
                  {getStatusBadge()}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">아이가 다시 도전하고 있어요</p>
                  <div className={`text-sm font-semibold ${getRewardColor()}`}>
                    +{mission.rewardPoint}P
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : isPending ? (
          <div
            onClick={onClick}
            className="cursor-pointer hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {renderFavoriteButton()}
                  <h3 className="text-base font-bold text-gray-800">
                    {mission.title}
                  </h3>
                  {getStatusBadge()}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">아이의 결과를 확인해주세요</p>
                  <div className={`text-sm font-semibold ${getRewardColor()}`}>
                    +{mission.rewardPoint}P
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : isExpired ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
                <span className="text-xl">⏰</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  {renderFavoriteButton()}
                  <h3 className="text-base font-bold text-gray-800">
                    {mission.title}
                  </h3>
                  {getStatusBadge()}
                </div>
              </div>
            </div>

            <div className="text-sm text-gray-600">
              <p>시간이 지나 도전이 종료되었어요</p>
            </div>
            {isExpired && onEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(mission.id);
                }}
                className="w-full mt-2 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                재도전 요청
              </button>
            )}
          </div>
        ) : isNotCompleted ? (
          <div className="flex items-center justify-between opacity-60">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                {renderFavoriteButton()}
                <h3 className="text-base font-bold text-gray-500">
                  {mission.title}
                </h3>
                {getStatusBadge()}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">{formatDueDate(mission.dueAt, currentTime)}</p>
                <div className="text-sm font-semibold text-gray-400">
                  +{mission.rewardPoint}P
                </div>
              </div>
            </div>
          </div>
        ) : isCompleted ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {renderFavoriteButton()}
                  <h3 className="text-base font-bold text-gray-800">
                    {mission.title}
                  </h3>
                  {getStatusBadge()}
                </div>
                <div className="flex items-center justify-between">
                  {mission.approvedAt && (
                    <p className="text-xs text-gray-500">
                      {new Date(mission.approvedAt).toLocaleDateString('ko-KR', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })} 완료
                    </p>
                  )}
                  <div className={`text-sm font-semibold ${getRewardColor()}`}>
                    +{mission.rewardPoint}P
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : isPending ? (
          <div
            onClick={onClick}
            className="cursor-pointer hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                {renderFavoriteButton()}
                  <h3 className="text-base font-bold text-gray-800">
                  {mission.title}
                </h3>
                {getStatusBadge()}
              </div>
                <p className="text-xs text-gray-500">{formatDueDate(mission.dueAt, currentTime)}</p>
            </div>
            </div>
          </div>
        ) : (
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (onEdit && canEdit) {
                onEdit(mission.id);
              }
            }}
            className="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded-xl p-1.5 -m-1.5 transition-colors"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                {renderFavoriteButton()}
                <h3 className="text-base font-bold text-gray-800">
                  {mission.title}
                </h3>
                {getStatusBadge()}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">{formatDueDate(mission.dueAt, currentTime)}</p>
                <div className={`text-sm font-semibold ${getRewardColor()}`}>
                  +{mission.rewardPoint}P
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(mission.id);
                  }}
                  className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
                  aria-label="미션 삭제"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 아이 화면
  // 클릭 가능 여부 규칙:
  // - TODO: 클릭 가능
  // - IN_PROGRESS: 클릭 가능 (수행 화면으로 이동)
  // - RESUBMITTED: 클릭 가능 (미션 다시 수행 화면으로 이동)
  // - SUBMITTED: 클릭 불가
  // - APPROVED/COMPLETED/EXPIRED: 클릭 불가
  const isClickable = !isExpired && !isCompleted && !isPending && (isInProgress || isResubmitted);
  
  return (
    <div
      onClick={isClickable ? onClick : undefined}
      className={`
        rounded-2xl shadow-md border border-gray-100 p-4 transition duration-200 ease-out
        ${isExpired ? 'bg-gray-50' : 'bg-white'}
        ${
          isClickable
            ? 'cursor-pointer hover:shadow-lg active:scale-[0.98]'
            : isExpired
              ? 'opacity-80 cursor-not-allowed'
              : 'opacity-60 cursor-not-allowed'
        }
      `}
    >
      {isResubmitted ? (
        // ✅ RESUBMITTED 미션 UI (아이)
        // 의미: 부모가 '다시 해볼까'를 눌러 아이가 재도전 요청한 상태
        // 아이 액션: 클릭 가능, 미션 다시 수행 화면으로 이동
        // 레이아웃: 완료 카드와 동일한 구조로 통일
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            {/* 좌측: 상태 아이콘 (원형 배경) - 재도전 아이콘 1개만 사용 */}
            <div className="w-12 h-12 rounded-full bg-orange-400 flex items-center justify-center">
              <span className="text-2xl">🔄</span>
            </div>
            {/* 중앙: 미션 제목 + 상태 배지 + 상태 설명 문구 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-bold text-gray-800 line-clamp-2">{mission.title}</h3>
                {getStatusBadge()}
              </div>
              <p className="text-xs text-gray-500">
                {isChildRetryingNow ? '괜찮아 🙂 다시 한 번 도전해보자!' : '다시 한 번 도전해보자!'}
              </p>
            </div>
          </div>
          {/* 우측: 포인트 또는 보조 텍스트 (아이콘 사용 금지) */}
          <div className="text-base font-bold text-green-600">
            +{mission.rewardPoint}P
          </div>
        </div>
      ) : isPending ? (
        // ✅ SUBMITTED 미션 UI (아이)
        // 의미: 아이가 미션을 완료하여 제출했고 현재 부모가 확인 중인 상태
        // 아이 액션: 수정 불가, 재제출 불가
        // 레이아웃: 완료 카드와 동일한 구조로 통일
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            {/* 좌측: 상태 아이콘 (원형 배경) - 모래시계 아이콘 1개만 사용 */}
            <div className="w-12 h-12 rounded-full bg-blue-400 flex items-center justify-center">
              <span className="text-2xl">⏳</span>
            </div>
            {/* 중앙: 미션 제목 + 상태 배지 + 상태 설명 문구 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-bold text-gray-800 line-clamp-2">
                  {mission.title}
                </h3>
                {getStatusBadge()}
              </div>
              <p className="text-xs text-gray-500">부모가 확인 중이에요</p>
            </div>
          </div>
          {/* 우측: 포인트 또는 보조 텍스트 (아이콘 사용 금지) */}
          <div className="text-base font-bold text-green-600">
            +{mission.rewardPoint}P
          </div>
        </div>
      ) : isInProgress ? (
        // ✅ IN_PROGRESS 미션 UI (아이) - 고급 카드
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-500 text-xl flex-shrink-0">
              <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="text-base font-semibold text-gray-800 line-clamp-2">
                  {mission.title}
                </h3>
                {getStatusBadge()}
              </div>
            </div>
          </div>
          <div className="text-base font-bold text-green-600 flex-shrink-0">
            +{mission.rewardPoint}P
          </div>
        </div>
      ) : isCompleted ? (
        // ✅ APPROVED/COMPLETED 미션 UI (아이)
        // 의미: 부모가 승인 완료한 상태
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            {/* 좌측: 상태 아이콘 (원형 배경) - 초록 체크 아이콘 */}
            <div className="w-10 h-10 rounded-full bg-green-400 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            {/* 중앙: 미션 제목 */}
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-gray-800 line-clamp-2">
                {mission.title}
              </h3>
            </div>
          </div>
          {/* 우측: 포인트 + 완료 문구 */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <div className="text-base font-bold text-green-600">
              +{mission.rewardPoint}P
            </div>
            <div className="text-xs text-green-600 font-medium">
              미션 완료! 잘했어요 🎉
            </div>
          </div>
        </div>
      ) : isExpired ? (
        // ✅ 만료된 미션 UI (아이) - 실패 상태
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl text-gray-600">⏰</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2 mb-1">
                <h3 className="text-base font-bold text-gray-800 line-clamp-2">
                  {mission.title}
                </h3>
                {getStatusBadge()}
              </div>
              <p className="text-xs text-gray-500">
                마감시간 초과 · {formatDueDate(mission.dueAt, currentTime)}
              </p>
            </div>
          </div>
          
          {/* 만료 메시지 */}
          <div className="text-xs text-gray-600 space-y-1">
            <p>시간이 지났어요 😢</p>
            {!isPreview && (
              <p>부모에게 다시 도전해달라고 요청할 수 있어요</p>
            )}
          </div>

          {/* 다시 도전 요청 버튼 (현재 로그인 사용자가 아이(CHILD)일 때만 표시) */}
          {canShowRetryRequestButton && onRetryRequest && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRetryRequest(mission.id);
              }}
              className="w-full py-3 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600 transition-colors mt-1"
            >
              다시 한 번 도전해볼까? 💪
            </button>
          )}
        </div>
      ) : isRetryApproved ? (
        // ✅ 재도전 승인된 미션 UI (아이)
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-12 h-12 rounded-full bg-blue-400 flex items-center justify-center">
              <span className="text-2xl">💪</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-bold text-gray-800">
                  {mission.title}
                </h3>
                {getStatusBadge()}
              </div>
            </div>
          </div>
          
          {/* 재도전 승인 메시지 */}
          <div className="text-xs text-gray-600 space-y-1">
            <p className="font-medium text-blue-600">다시 도전할 수 있어요! 힘내요 💪</p>
            <p className="text-gray-500">{formatDueDate(mission.dueAt, currentTime)}</p>
          </div>
        </div>
      ) : isRetryRejected ? (
        // ✅ 재도전 거절된 미션 UI (아이)
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center">
              <span className="text-2xl">😢</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-bold text-gray-800">
                  {mission.title}
                </h3>
                {getStatusBadge()}
              </div>
            </div>
          </div>
          
          {/* 재도전 거절 메시지 */}
          <div className="text-xs text-gray-600 space-y-1">
            <p className="font-medium text-gray-700">이번에는 여기까지예요 😢</p>
            <p className="text-gray-500">다음 미션에서 다시 도전해요!</p>
          </div>
        </div>
      ) : (
        // 기본 상태 (TODO 등)
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-12 h-12 rounded-full bg-blue-400 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-bold text-gray-800 line-clamp-2">{mission.title}</h3>
                {getStatusBadge()}
              </div>
              <p className="text-xs text-gray-500">{formatDueDate(mission.dueAt, currentTime)}</p>
            </div>
          </div>
          <div className="text-base font-bold text-green-600 flex-shrink-0">
            +{mission.rewardPoint}P
          </div>
        </div>
      )}
    </div>
  );
};

export default MissionCard;

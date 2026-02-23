import React from 'react';
import { Mission } from '../types';
import { formatDueDate } from '../utils/missionDateUtils';
import { useApp } from '../context/AppContext';
import { getInterpretedStatus, isParentRequestedRetry, isChildRetrying } from '../utils/missionStatusUtils';
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
  onPartialApprove?: (missionId: string) => void; // 부분 승인
  onFail?: (missionId: string) => void; // 실패 처리
  currentTime?: number; // 현재 시간 (밀리초, 디버그용)
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
  onPartialApprove,
  onFail,
  currentTime = Date.now(),
}) => {
  // 현재 로그인 사용자 정보 가져오기 (role 확인용)
  const { user: authUser } = useApp();


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
      return (
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
          {isParentMode ? '기한 만료' : '⏰ 시간 초과'}
        </span>
      );
    } else if (isParentRequestedRetry(mission)) {
      // 재도전 요청: 부모가 '다시 해볼까'를 눌러 아이가 재도전 요청한 상태
      return (
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
          {isParentMode ? '아이 재도전 중' : '재도전 중'}
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
      return (
        <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
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

  // 부모 화면
  if (isParentMode) {
    return (
      <div className={`rounded-2xl p-4 mb-3 shadow-sm border-2 ${isExpired ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'}`}>
        {isResubmitted || isChildRetryingNow ? (
          // ✅ RESUBMITTED 또는 아이 재도전 중 미션 UI (부모)
          // 의미: 부모가 '다시 해볼까'를 눌러 아이가 재도전 요청한 상태
          // 부모 액션: 미션 수정하기, 승인, 반려
          <div
            onClick={onClick}
            className="cursor-pointer hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-bold text-gray-800">
                    {mission.title}
                  </h3>
                  {getStatusBadge()}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">아이가 다시 도전하고 있어요</p>
                  <div className={`text-base font-semibold ${getRewardColor()}`}>
                    +{mission.rewardPoint}P
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : isPending ? (
          // ✅ SUBMITTED 미션 UI (부모)
          // 의미: 아이가 미션을 완료하여 제출했고 현재 부모가 확인 중인 상태
          // 부모 액션: 승인, 부분 승인, 반려
          <div
            onClick={onClick}
            className="cursor-pointer hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-bold text-gray-800">
                    {mission.title}
                  </h3>
                  {getStatusBadge()}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">아이의 결과를 확인해주세요</p>
                  <div className={`text-base font-semibold ${getRewardColor()}`}>
                    +{mission.rewardPoint}P
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : isExpired ? (
          // ✅ 만료된 미션 UI (부모) - 버튼 없음, 문구만 표시
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center">
                <span className="text-2xl">⏰</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-bold text-gray-800">
                    {mission.title}
                  </h3>
                  {getStatusBadge()}
                </div>
              </div>
            </div>

            {/* 만료 메시지 */}
            <div className="text-sm text-gray-600">
              <p>시간이 지나 도전이 종료되었어요</p>
            </div>
            {/* 재도전 요청 또는 수정하기 버튼 */}
            {isExpired && onEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(mission.id);
                }}
                className="w-full mt-3 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
              >
                재도전 요청
              </button>
            )}
          </div>
        ) : isNotCompleted ? (
          // 미진행 미션 (회색 톤, 비활성화)
          <div className="flex items-center justify-between opacity-60">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-lg font-bold text-gray-500">
                  {mission.title}
                </h3>
                {getStatusBadge()}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">{formatDueDate(mission.dueAt, currentTime)}</p>
                <div className="text-base font-semibold text-gray-400">
                  +{mission.rewardPoint}P
                </div>
              </div>
            </div>
          </div>
        ) : isCompleted ? (
          // 완료된 미션
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-bold text-gray-800">
                    {mission.title}
                  </h3>
                  {getStatusBadge()}
                </div>
                <div className="flex items-center justify-between">
                  {mission.approvedAt && (
                    <p className="text-sm text-gray-500">
                      {new Date(mission.approvedAt).toLocaleDateString('ko-KR', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })} 완료
                    </p>
                  )}
                  <div className={`text-base font-semibold ${getRewardColor()}`}>
                    +{mission.rewardPoint}P
                  </div>
                </div>
              </div>
            </div>
            {/* TODO: 반복 미션 기능은 출시 이후 재도입 예정. 현재는 단일 미션만 지원 */}
          </div>
        ) : isPending ? (
          // 확인 중 미션 (클릭 가능)
          <div
            onClick={onClick}
            className="cursor-pointer hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-lg font-bold text-gray-800">
                  {mission.title}
                </h3>
                {getStatusBadge()}
              </div>
              <p className="text-sm text-gray-500">{formatDueDate(mission.dueAt, currentTime)}</p>
            </div>
            </div>
          </div>
        ) : (
          // 진행 중 미션 - 카드 전체 클릭 가능 (재도전 요청과 동일하게)
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (onEdit && canEdit) {
                onEdit(mission.id);
              }
            }}
            className="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded-xl p-2 -m-2 transition-colors"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-lg font-bold text-gray-800">
                  {mission.title}
                </h3>
                {getStatusBadge()}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">{formatDueDate(mission.dueAt, currentTime)}</p>
                <div className={`text-base font-semibold ${getRewardColor()}`}>
                  +{mission.rewardPoint}P
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* 삭제 버튼 */}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(mission.id);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  aria-label="미션 삭제"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        rounded-2xl mb-3 shadow-sm border-2
        ${isExpired ? 'bg-gray-50 border-gray-200 p-4 pb-5' : 'bg-white p-4'}
        ${isClickable ? 'cursor-pointer hover:shadow-md transition-shadow' : 'opacity-60 cursor-not-allowed'}
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
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-bold text-gray-800">{mission.title}</h3>
                {getStatusBadge()}
              </div>
              <p className="text-sm text-gray-500">
                {isChildRetryingNow ? '괜찮아 🙂 다시 한 번 도전해보자!' : '다시 한 번 도전해보자!'}
              </p>
            </div>
          </div>
          {/* 우측: 포인트 또는 보조 텍스트 (아이콘 사용 금지) */}
          <div className={`text-lg font-bold ${getRewardColor()}`}>
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
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-bold text-gray-800">
                  {mission.title}
                </h3>
                {getStatusBadge()}
              </div>
              <p className="text-sm text-gray-500">부모가 확인 중이에요</p>
            </div>
          </div>
          {/* 우측: 포인트 또는 보조 텍스트 (아이콘 사용 금지) */}
          <div className={`text-lg font-bold ${getRewardColor()}`}>
            +{mission.rewardPoint}P
          </div>
        </div>
      ) : isInProgress ? (
        // ✅ IN_PROGRESS 미션 UI (아이)
        // 의미: 아이가 직접 수행 중인 미션
        // 아이 액션: 클릭 가능, 수행 화면으로 이동
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            {/* 좌측: 상태 아이콘 (원형 배경) - 파란색 시계 아이콘 */}
            <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            {/* 중앙: 미션 제목 + 상태 배지 */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-bold text-gray-800">
                  {mission.title}
                </h3>
                {getStatusBadge()}
              </div>
            </div>
          </div>
          {/* 우측: 포인트 */}
          <div className={`text-lg font-bold ${getRewardColor()}`}>
            +{mission.rewardPoint}P
          </div>
        </div>
      ) : isCompleted ? (
        // ✅ APPROVED/COMPLETED 미션 UI (아이)
        // 의미: 부모가 승인 완료한 상태
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            {/* 좌측: 상태 아이콘 (원형 배경) - 초록 체크 아이콘 */}
            <div className="w-12 h-12 rounded-full bg-green-400 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            {/* 중앙: 미션 제목 + 상태 배지 */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-bold text-gray-800">
                  {mission.title}
                </h3>
                {getStatusBadge()}
              </div>
            </div>
          </div>
          {/* 우측: 포인트 + 완료 문구 */}
          <div className="flex flex-col items-end gap-1">
            <div className={`text-lg font-bold ${getRewardColor()}`}>
              +{mission.rewardPoint}P
            </div>
            <div className="text-xs text-green-600 font-medium">
              미션 완료! 잘했어요 🎉
            </div>
          </div>
        </div>
      ) : isExpired ? (
        // ✅ 만료된 미션 UI (아이)
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">⏰</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-bold text-gray-800 truncate">
                  {mission.title}
                </h3>
                {getStatusBadge()}
              </div>
            </div>
          </div>
          
          {/* 만료 메시지 */}
          <div className="text-sm text-gray-600 space-y-1">
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
                <h3 className="text-lg font-bold text-gray-800">
                  {mission.title}
                </h3>
                {getStatusBadge()}
              </div>
            </div>
          </div>
          
          {/* 재도전 승인 메시지 */}
          <div className="text-sm text-gray-600 space-y-1">
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
                <h3 className="text-lg font-bold text-gray-800">
                  {mission.title}
                </h3>
                {getStatusBadge()}
              </div>
            </div>
          </div>
          
          {/* 재도전 거절 메시지 */}
          <div className="text-sm text-gray-600 space-y-1">
            <p className="font-medium text-gray-700">이번에는 여기까지예요 😢</p>
            <p className="text-gray-500">다음 미션에서 다시 도전해요!</p>
          </div>
        </div>
      ) : (
        // 기본 상태 (TODO 등)
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-12 h-12 rounded-full bg-blue-400 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-bold text-gray-800">{mission.title}</h3>
                {getStatusBadge()}
              </div>
              <p className="text-sm text-gray-500">{formatDueDate(mission.dueAt, currentTime)}</p>
            </div>
          </div>
          <div className={`text-lg font-bold ${getRewardColor()}`}>
            +{mission.rewardPoint}P
          </div>
        </div>
      )}
    </div>
  );
};

export default MissionCard;

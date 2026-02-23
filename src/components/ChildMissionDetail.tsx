import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { subscribeMission } from '../firebase/missions';
import { Mission } from '../types';
import PageLayout from './PageLayout';
import { NORMAL_HEADER_HEIGHT } from '../constants/layout';

// 아이 기준 수행 가능한 미션 상태 목록
// - TODO: 아직 시작하지 않은 미션
// - IN_PROGRESS: 아이가 진행 중인 미션
// - RESUBMITTED: 부모가 '다시 해볼까'를 눌러 아이가 재도전 요청한 상태
// 하위 호환성: REQUEST(RESUBMITTED), RETRY_REQUESTED(RESUBMITTED)
const PERFORMABLE_STATUSES = [
  'TODO',              // 아직 시작하지 않은 미션
  'IN_PROGRESS',       // 아이가 진행 중인 미션
  'RESUBMITTED',       // 부모가 '다시 해볼까'를 눌러 아이가 재도전 요청한 상태
  'REQUEST',           // RESUBMITTED와 동일 의미 (하위 호환성)
  'RETRY_REQUESTED',   // RESUBMITTED와 동일 의미 (하위 호환성)
] as const;

/**
 * 아이 전용 미션 수행 화면
 * - 수행 가능한 상태(PERFORMABLE_STATUSES)의 미션만 접근 가능
 * - 메모 입력 및 제출
 * - 제출 후 부모 승인 대기 상태로 전환
 * - 미션 ID 기준으로 조회 (role 체크 없음)
 * - childId 검증 (조회 성공 후)
 */
const ChildMissionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { submitMission, selectedChildId } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [mission, setMission] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(true);
  const [missionNotFound, setMissionNotFound] = useState(false); // 미션 조회 실패
  const [unauthorized, setUnauthorized] = useState(false); // 권한 실패 (childId 불일치)
  const [memo, setMemo] = useState('');

  // 현재 접근한 childId (location.state 우선, 없으면 selectedChildId)
  const currentChildId = (location.state as { childId?: string })?.childId || selectedChildId;

  // 미션 조회 (미션 ID 기준)
  useEffect(() => {
    if (!id) {
      setLoading(false);
      setMissionNotFound(true);
      return;
    }

    // 상태 초기화
    setMissionNotFound(false);
    setUnauthorized(false);
    setLoading(true);

    const unsubscribe = subscribeMission(id, (missionData) => {
      // 조회 실패 (미션이 존재하지 않음)
      if (!missionData) {
        setMission(null);
        setMissionNotFound(true);
        setUnauthorized(false);
        setLoading(false);
        return;
      }

      // 조회 성공 - childId 검증
      // currentChildId가 로딩 중이면 검증하지 않음 (방어 로직)
      // location.state.childId가 없고 selectedChildId도 null이면 검증 건너뜀
      if (currentChildId === null || currentChildId === undefined) {
        setMission(missionData);
        setLoading(false);
        return;
      }

      // 조회 성공 시에만 childId 일치 여부 검증
      if (missionData.childId !== currentChildId) {
        setMission(null);
        setMissionNotFound(false);
        setUnauthorized(true);
        setLoading(false);
        return;
      }

      // 조회 성공 및 권한 검증 통과
      setMission(missionData);
      setMissionNotFound(false);
      setUnauthorized(false);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [id, currentChildId, selectedChildId, location.state]);

  // loading 중이면 로딩 UI 표시
  if (loading) {
    return (
      <PageLayout headerHeight={NORMAL_HEADER_HEIGHT} className="flex items-center justify-center">
        <p className="text-gray-500">로딩 중...</p>
      </PageLayout>
    );
  }

  // 미션 조회 실패 (미션이 존재하지 않음)
  if (missionNotFound) {
    return (
      <PageLayout headerHeight={NORMAL_HEADER_HEIGHT} className="flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg mb-2">미션을 찾을 수 없어요</p>
          <button
            onClick={() => {
              // 이전 페이지로 돌아가기 (또는 역할 선택)
              if (location.state?.from) {
                navigate(location.state.from);
              } else {
                navigate('/role-select');
              }
            }}
            className="text-blue-500 hover:underline"
          >
            돌아가기
          </button>
        </div>
      </PageLayout>
    );
  }

  // 권한 실패 (childId 불일치)
  if (unauthorized) {
    return (
      <PageLayout headerHeight={NORMAL_HEADER_HEIGHT} className="flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg mb-2">이 미션을 찾을 수 없어요</p>
          <button
            onClick={() => {
              // currentChildId가 있으면 해당 자녀 화면으로, 없으면 역할 선택으로
              if (currentChildId) {
                navigate(`/child/${currentChildId}`);
              } else {
                navigate('/role-select');
              }
            }}
            className="text-blue-500 hover:underline"
          >
            돌아가기
          </button>
        </div>
      </PageLayout>
    );
  }

  // 반복 미션: 반복 요일 설명 문장 생성
  const getRepeatDaysDescription = (): string | null => {
    if (!mission?.isRepeat || !mission?.repeatDays || mission.repeatDays.length === 0) {
      return null;
    }

    // 모든 요일이 선택된 경우 (매일)
    if (mission.repeatDays.length === 7) {
      return '이 미션은 매일 하는 미션이에요';
    }

    // 요일 이름 배열
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const selectedDayNames = mission.repeatDays
      .sort((a, b) => a - b) // 오름차순 정렬
      .map(day => dayNames[day])
      .join('·');

    return `이 미션은 ${selectedDayNames}에 하는 미션이에요`;
  };

  // 미션이 없으면 에러 (방어 로직)
  if (!mission) {
    return (
      <PageLayout headerHeight={NORMAL_HEADER_HEIGHT} className="flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg mb-2">미션 정보를 불러올 수 없습니다</p>
          <button
            onClick={() => {
              if (currentChildId) {
                navigate(`/child/${currentChildId}`);
              } else {
                navigate('/role-select');
              }
            }}
            className="text-blue-500 hover:underline"
          >
            돌아가기
          </button>
        </div>
      </PageLayout>
    );
  }

  // 수행 가능한 상태가 아니면 접근 불가
  if (!PERFORMABLE_STATUSES.includes(mission.status as any)) {
    return (
      <PageLayout headerHeight={NORMAL_HEADER_HEIGHT} className="flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg mb-2">
            {mission.status === 'SUBMITTED' 
              ? '이미 제출한 미션이에요! 부모님 확인 중입니다 😊' 
              : mission.status === 'APPROVED'
              ? '완료된 미션이에요! 포인트가 지급되었습니다 ✨'
              : '제출할 수 없는 미션이에요'}
          </p>
          <button
            onClick={() => navigate(`/child/${mission.childId}`)}
            className="text-blue-500 hover:underline"
          >
            홈으로 돌아가기
          </button>
        </div>
      </PageLayout>
    );
  }

  const formatDueDate = (dueAt: string, missionType: string): string => {
    const date = new Date(dueAt);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const missionDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    // 주간 미션인 경우
    if (missionType === 'WEEKLY') {
      const dayOfWeek = date.getDay();
      const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
      return `이번 주 ${dayNames[dayOfWeek]}요일까지`;
    }

    // 일별 미션인 경우
    if (missionDate.getTime() === today.getTime()) {
      const hours = date.getHours();
      return `오늘 ${hours}시까지`;
    } else if (missionDate.getTime() === tomorrow.getTime()) {
      const hours = date.getHours();
      return `내일 ${hours}시까지`;
    } else {
      return `${date.getMonth() + 1}월 ${date.getDate()}일 ${date.getHours()}시까지`;
    }
  };

  const handleSubmit = async () => {
    // 제출 가능한 상태인지 확인
    if (!PERFORMABLE_STATUSES.includes(mission.status as any)) {
      alert('이미 제출했거나 제출할 수 없는 미션이에요.');
      return;
    }

    // 메모 필수 입력 검증
    if (!memo.trim()) {
      alert('메모를 입력해주세요.');
      return;
    }

    try {
      // currentChildId를 전달하여 권한 체크
      await submitMission(mission.id, memo.trim(), currentChildId);
      alert('제출 완료! 부모님이 확인하시면 포인트가 지급돼요 😊');
      // 제출 완료 화면이 히스토리 스택에 남지 않도록 replace 사용
      navigate(`/child/${mission.childId}`, { replace: true });
    } catch (error) {
      alert(error instanceof Error ? error.message : '미션 제출이 완료되지 않았어요');
    }
  };

  return (
    <PageLayout headerHeight={NORMAL_HEADER_HEIGHT} className="pb-8">
      {/* Header */}
      <div className="bg-white px-5 pt-4 pb-4 flex items-center gap-4">
        <button
          onClick={() => navigate(`/child/${mission.childId}`)}
          className="w-10 h-10 flex items-center justify-center"
        >
          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-gray-800">미션 결과 알려주기</h1>
      </div>

      <div className="px-5 mt-6">
        {/* Mission Info */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm border-2 border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base ${
              mission.missionType === 'DAILY' ? 'bg-blue-500' : 'bg-orange-500'
            }`}>
              {mission.missionType === 'DAILY' ? '일' : '주'}
            </div>
            <h2 className="text-2xl font-bold text-gray-800">{mission.title}</h2>
          </div>
          
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg font-bold text-green-600">+{mission.rewardPoint}</span>
            <span className="text-sm text-gray-500">포인트</span>
          </div>

          <div className="mb-3">
            <p className="text-sm text-gray-500 mb-1">마감일</p>
            <p className="text-base font-medium text-gray-700">
              {formatDueDate(mission.dueAt, mission.missionType)}
            </p>
          </div>

          {mission.description && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-gray-600 text-base">{mission.description}</p>
            </div>
          )}
          
          {/* 반복 미션 설명 (상세 화면에서만 표시) */}
          {getRepeatDaysDescription() && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-sm text-gray-500">{getRepeatDaysDescription()}</p>
            </div>
          )}
        </div>

        {/* Memo (필수사항) */}
        <div className="mb-6">
          <label className="block text-gray-700 font-medium mb-2">
            메모 <span className="text-red-500 text-sm">*</span>
          </label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="오늘 어떻게 했는지 부모님께 알려주세요 😊"
            maxLength={200}
            rows={4}
            className="w-full p-4 border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-orange-400 text-base resize-none"
          />
          <p className="text-xs text-gray-400 mt-1 text-right">{memo.length}/200</p>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          className="w-full py-4 rounded-2xl font-bold text-lg shadow-md transition-colors bg-orange-400 text-white hover:bg-orange-500 active:bg-orange-600"
        >
          완료했어요! ✨
        </button>
      </div>
    </PageLayout>
  );
};

export default ChildMissionDetail;


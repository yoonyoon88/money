import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { useApp } from '../context/AppContext';
import { getSubscriptionPlan } from '../types';
import { hasPremiumAccess } from '../utils/subscription';
import { subscribeMission } from '../firebase/missions';
import { storage, db } from '../firebase/config';
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
  const { submitMission, selectedChildId, user } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [mission, setMission] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(true);
  const [missionNotFound, setMissionNotFound] = useState(false); // 미션 조회 실패
  const [unauthorized, setUnauthorized] = useState(false); // 권한 실패 (childId 불일치)
  const [memo, setMemo] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  // 미리보기 URL 메모리 해제 (언마운트 시)
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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

  /** 이미지 압축: 최대 1200px, quality 0.85 */
  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }
      img.onload = () => {
        const maxSize = 1200;
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height * maxSize) / width;
            width = maxSize;
          } else {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : resolve(file)),
          'image/jpeg',
          0.85
        );
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  };

  const handleSubmit = async () => {
    if (!PERFORMABLE_STATUSES.includes(mission.status as any)) {
      alert('이미 제출했거나 제출할 수 없는 미션이에요.');
      return;
    }
    if (!memo.trim()) {
      alert('메모를 입력해주세요.');
      return;
    }

    setSubmitting(true);
    try {
      if (selectedFile && user) {
        const blob = await compressImage(selectedFile);
        const storageRef = ref(
          storage,
          `missions/${user.id}/${mission.id}/photo.jpg`
        );
        await uploadBytes(storageRef, blob);
        const downloadURL = await getDownloadURL(storageRef);
        await updateDoc(doc(db, 'missions', mission.id), {
          photoUrl: downloadURL,
        });
      }
      await submitMission(mission.id, memo.trim(), currentChildId);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setSelectedFile(null);
      alert('제출 완료! 부모님이 확인하시면 포인트가 지급돼요 😊');
      navigate(`/child/${mission.childId}`, { replace: true });
    } catch (error) {
      alert(error instanceof Error ? error.message : '미션 제출이 완료되지 않았어요');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageLayout headerHeight={NORMAL_HEADER_HEIGHT} className="pb-8">
      {/* Header */}
      <header className="bg-white px-5 pt-4 pb-4 flex items-center gap-4">
        <button
          onClick={() => navigate(`/child/${mission.childId}`)}
          className="w-10 h-10 flex items-center justify-center"
        >
          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-gray-800">미션 결과 알려주기</h1>
      </header>

      <div className="mx-auto px-4 pb-28">
        {/* 미션 요약 카드 */}
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs ${
              mission.missionType === 'DAILY' ? 'bg-blue-500' : 'bg-orange-500'
            }`}>
              {mission.missionType === 'DAILY' ? '일' : '주'}
            </div>
            <h2 className="text-base font-semibold text-gray-800">{mission.title}</h2>
          </div>
          <p className="text-green-500 font-bold text-sm">+{mission.rewardPoint} 포인트</p>
          <p className="text-xs text-gray-500 mt-0.5">
              {formatDueDate(mission.dueAt, mission.missionType)}
            </p>
          {mission.description && (
            <p className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-100 leading-tight">
              {mission.description}
            </p>
          )}
          {getRepeatDaysDescription() && (
            <p className="text-xs text-gray-400 mt-0.5 leading-tight">
              {getRepeatDaysDescription()}
            </p>
          )}
        </div>

        {/* 메모 입력 영역 */}
        <label className="block mt-4 mb-2 text-sm font-medium text-gray-600">
          오늘 어떻게 했는지 알려주세요 😊
          </label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          placeholder="부모님께 전할 말을 적어주세요"
            maxLength={200}
          className="w-full bg-white rounded-xl p-4 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none min-h-[90px]"
        />
        <p className="text-xs text-right text-gray-400 mt-1">{memo.length}/200</p>

        {/* 사진 첨부 카드 - 프리미엄만 표시 */}
        {hasPremiumAccess(getSubscriptionPlan(user)) && (
        <div className="mt-4 p-3 bg-white rounded-xl border border-gray-100">
          <p className="text-sm text-gray-500 mb-2">📷 사진 첨부 (선택)</p>
          <input
            type="file"
            accept="image/*"
            id="photoInput"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) {
                const file = e.target.files[0];
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setSelectedFile(file);
                setPreviewUrl(URL.createObjectURL(file));
              }
            }}
          />
          {previewUrl ? (
            <div className="relative border-2 border-dashed border-gray-200 rounded-lg overflow-hidden">
              <img
                src={previewUrl}
                alt="미리보기"
                className="w-full object-cover max-h-48"
              />
              <button
                type="button"
                onClick={() => {
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setSelectedFile(null);
                  setPreviewUrl(null);
                }}
                className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded"
              >
                삭제
              </button>
            </div>
          ) : (
            <label
              htmlFor="photoInput"
              className="block border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-orange-300 hover:bg-orange-50/30 transition-colors"
            >
              <p className="text-sm text-gray-400">
                사진을 선택하면 여기에 미리보기가 표시됩니다
              </p>
              <span className="inline-block mt-1 text-sm text-orange-500 font-medium">사진 선택하기</span>
            </label>
          )}
        </div>
        )}
        </div>

      {/* 하단 고정 완료 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 mx-auto bg-white border-t border-gray-200 p-4 pb-[env(safe-area-inset-bottom)]">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-orange-500 hover:bg-orange-600 transition text-white py-4 rounded-2xl text-lg font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? '처리 중...' : '완료했어요! ✨'}
        </button>
      </div>
    </PageLayout>
  );
};

export default ChildMissionDetail;


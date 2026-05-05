import React, { useState } from 'react';
import { Mission } from '../types';
import PhotoViewer from './PhotoViewer';

interface CompletedMissionModalProps {
  mission: Mission;
  onClose: () => void;
}

function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return '-';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '-';
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const period = hours >= 12 ? '오후' : '오전';
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const displayMinute = String(minutes).padStart(2, '0');
  return `${year}년 ${month}월 ${day}일 ${period} ${displayHour}:${displayMinute}`;
}

const CompletedMissionModal: React.FC<CompletedMissionModalProps> = ({ mission, onClose }) => {
  const completedTime = formatDateTime(mission.approvedAt ?? mission.completedAt);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);

  return (
    <>
      {/* 배경 오버레이 */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* 바텀시트 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-50 pb-[env(safe-area-inset-bottom)]">
        {/* 핸들 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* 헤더 */}
        <div className="px-5 pt-2 pb-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-green-500 text-lg">✅</span>
            <h3 className="text-base font-semibold text-gray-800">완료된 미션</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="닫기"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* 제목 + 포인트 */}
          <div className="bg-green-50 rounded-2xl p-4">
            <h4 className="text-lg font-bold text-gray-800 leading-snug">{mission.title}</h4>
            <p className="text-green-600 font-semibold text-sm mt-1">+{mission.rewardPoint} 포인트 획득 🎉</p>
          </div>

          {/* 미션 설명 */}
          {mission.description ? (
            <div>
              <p className="text-xs font-medium text-gray-400 mb-1">미션 내용</p>
              <p className="text-sm text-gray-700 leading-relaxed">{mission.description}</p>
            </div>
          ) : null}

          {/* 완료 일시 */}
          <div>
            <p className="text-xs font-medium text-gray-400 mb-1">완료 일시</p>
            <p className="text-sm text-gray-700">{completedTime}</p>
          </div>

          {/* 아이 메모 */}
          {mission.memo ? (
            <div>
              <p className="text-xs font-medium text-gray-400 mb-1">아이가 남긴 메모</p>
              <div className="bg-yellow-50 rounded-xl px-4 py-3">
                <p className="text-sm text-gray-700 leading-relaxed">{mission.memo}</p>
              </div>
            </div>
          ) : null}

          {/* 부모 승인 코멘트 */}
          {mission.parentMemo ? (
            <div>
              <p className="text-xs font-medium text-gray-400 mb-1">부모 코멘트</p>
              <div className="bg-blue-50 rounded-xl px-4 py-3">
                <p className="text-sm text-gray-700 leading-relaxed">{mission.parentMemo}</p>
              </div>
            </div>
          ) : null}

          {/* 사진 보기 버튼 */}
          {mission.photoUrl ? (
            <div>
              <button
                type="button"
                onClick={() => setShowPhotoViewer(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700 transition-colors"
              >
                <span>📷</span>
                <span>사진 보기</span>
              </button>
            </div>
          ) : null}
        </div>

        {/* 닫기 버튼 */}
        <div className="px-5 pt-2 pb-4">
          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-semibold text-sm transition-colors"
          >
            닫기
          </button>
        </div>
      </div>

      {/* 사진 전체화면 뷰어 */}
      {showPhotoViewer && mission.photoUrl && (
        <PhotoViewer url={mission.photoUrl} onClose={() => setShowPhotoViewer(false)} />
      )}
    </>
  );
};

export default CompletedMissionModal;

import React, { useState, useEffect } from 'react';
import { Mission } from '../types';

interface MissionEditModalProps {
  mission: Mission | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (missionId: string, title: string, description: string, rewardPoint: number, dueDate: string, missionType: 'DAILY' | 'WEEKLY') => Promise<void>;
  onMarkAsNotCompleted: (missionId: string) => Promise<void>;
  isRetryRequest?: boolean; // 재도전 요청인지 여부
}

/**
 * 공통 미션 편집 팝업
 * 
 * 재도전 요청과 수정하기가 모두 이 팝업으로 진입합니다.
 * 
 * 선택지:
 * 1. 미션 수정하기 - 미션 정보를 수정하고 다시 진행 중 상태로 전환
 * 2. 미진행으로 처리 - 완료하지 않은 상태로 종료 (삭제 아님)
 */
const MissionEditModal: React.FC<MissionEditModalProps> = ({
  mission,
  isOpen,
  onClose,
  onEdit,
  onMarkAsNotCompleted,
  isRetryRequest = false,
}) => {
  const [activeTab, setActiveTab] = useState<'edit' | 'notCompleted'>('edit');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rewardPoint, setRewardPoint] = useState(100);
  const [dueDate, setDueDate] = useState('');
  const [dueHour, setDueHour] = useState('0');
  const [dueMinute, setDueMinute] = useState('0');
  const [missionType, setMissionType] = useState<'DAILY' | 'WEEKLY'>('DAILY');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 미션 데이터로 폼 초기화
  useEffect(() => {
    if (mission && isOpen) {
      setTitle(mission.title);
      setDescription(mission.description || '');
      setRewardPoint(mission.rewardPoint);
      setMissionType(mission.missionType);

      // dueAt을 날짜와 시간으로 분리
      if (mission.dueAt) {
        const dueDateObj = new Date(mission.dueAt);
        const year = dueDateObj.getFullYear();
        const month = String(dueDateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dueDateObj.getDate()).padStart(2, '0');
        setDueDate(`${year}-${month}-${day}`);
        setDueHour(String(dueDateObj.getHours()).padStart(2, '0'));
        setDueMinute(String(dueDateObj.getMinutes()).padStart(2, '0'));
      } else {
        // 기본값: 오늘 날짜, 현재 시간 + 1시간
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setHours(tomorrow.getHours() + 1);
        const year = tomorrow.getFullYear();
        const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const day = String(tomorrow.getDate()).padStart(2, '0');
        setDueDate(`${year}-${month}-${day}`);
        setDueHour(String(tomorrow.getHours()).padStart(2, '0'));
        setDueMinute(String(tomorrow.getMinutes()).padStart(2, '0'));
      }

      // 재도전 요청인 경우 기본적으로 'edit' 탭 선택
      setActiveTab('edit');
    }
  }, [mission, isOpen]);

  if (!isOpen || !mission) {
    return null;
  }

  const handleEditSubmit = async () => {
    if (!title.trim()) {
      alert('미션 제목을 입력해주세요.');
      return;
    }

    if (!dueDate) {
      alert('마감일을 선택해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 날짜와 시간을 합쳐서 ISO string 생성
      const dateStr = dueDate;
      const hour = parseInt(dueHour, 10);
      const minute = parseInt(dueMinute, 10);
      const dueDateTime = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
      const dueDateISO = dueDateTime.toISOString();

      await onEdit(mission.id, title, description, rewardPoint, dueDateISO, missionType);
      onClose();
    } catch (error) {
      alert(error instanceof Error ? error.message : '미션 수정에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNotCompletedSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onMarkAsNotCompleted(mission.id);
      onClose();
    } catch (error) {
      alert(error instanceof Error ? error.message : '미진행 처리에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end z-50">
      <div className="bg-white rounded-t-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-800">
            {isRetryRequest ? '재도전 요청 처리' : '미션 수정하기'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 탭 선택 */}
        <div className="px-6 pt-4 pb-2">
          <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setActiveTab('edit')}
              className={`flex-1 py-3 px-4 rounded-lg text-base font-medium transition-colors ${
                activeTab === 'edit'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600'
              }`}
            >
              미션 수정하기
            </button>
            <button
              onClick={() => setActiveTab('notCompleted')}
              className={`flex-1 py-3 px-4 rounded-lg text-base font-medium transition-colors ${
                activeTab === 'notCompleted'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600'
              }`}
            >
              미진행으로 처리
            </button>
          </div>
        </div>

        {/* 내용 영역 */}
        <div className="px-6 py-4">
          {activeTab === 'edit' ? (
            <div className="space-y-4">
              {/* 미션 제목 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  미션 제목
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="예: 방 정리하기"
                />
              </div>

              {/* 포인트 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  포인트
                </label>
                <input
                  type="number"
                  value={rewardPoint}
                  onChange={(e) => setRewardPoint(parseInt(e.target.value, 10) || 0)}
                  min="0"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 마감 시간 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  마감 시간
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={dueHour}
                    onChange={(e) => setDueHour(e.target.value)}
                    className="w-20 px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                  <span className="self-center text-gray-500">:</span>
                  <select
                    value={dueMinute}
                    onChange={(e) => setDueMinute(e.target.value)}
                    className="w-20 px-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {[0, 15, 30, 45].map((m) => (
                      <option key={m} value={m}>
                        {String(m).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 설명 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  설명 (선택)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="미션에 대한 설명을 입력하세요"
                />
              </div>

              {/* 미션 타입 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  미션 타입
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMissionType('DAILY')}
                    className={`flex-1 py-3 px-4 rounded-xl font-medium transition-colors ${
                      missionType === 'DAILY'
                        ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                        : 'bg-gray-100 text-gray-600 border-2 border-transparent'
                    }`}
                  >
                    일일 미션
                  </button>
                  <button
                    onClick={() => setMissionType('WEEKLY')}
                    className={`flex-1 py-3 px-4 rounded-xl font-medium transition-colors ${
                      missionType === 'WEEKLY'
                        ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                        : 'bg-gray-100 text-gray-600 border-2 border-transparent'
                    }`}
                  >
                    주간 미션
                  </button>
                </div>
              </div>

              {/* 수정하기 버튼 */}
              <button
                onClick={handleEditSubmit}
                disabled={isSubmitting}
                className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-6"
              >
                {isSubmitting ? '처리 중...' : '수정 완료'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-gray-700 text-sm leading-relaxed">
                  이 미션을 완료하지 않은 상태로 종료합니다.
                  <br />
                  포인트는 지급되지 않으며, 기록으로 남습니다.
                </p>
              </div>

              <button
                onClick={handleNotCompletedSubmit}
                disabled={isSubmitting}
                className="w-full py-4 bg-gray-600 text-white rounded-xl font-bold text-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-6"
              >
                {isSubmitting ? '처리 중...' : '미진행으로 처리'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MissionEditModal;


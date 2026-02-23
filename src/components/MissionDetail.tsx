import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import PageLayout from './PageLayout';
import { NORMAL_HEADER_HEIGHT } from '../constants/layout';

const MissionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, missions, submitMission } = useApp();
  const navigate = useNavigate();
  
  const [memo, setMemo] = useState('');

  // 부모는 미션 상세 화면 접근 불가 (제출 화면이므로)
  if (!user || user.role !== 'CHILD') {
    return (
      <PageLayout headerHeight={NORMAL_HEADER_HEIGHT} className="flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg mb-2">아이만 접근할 수 있는 화면입니다.</p>
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

  const mission = missions.find(m => m.id === id);

  if (!mission) {
    return (
      <PageLayout headerHeight={NORMAL_HEADER_HEIGHT} className="flex items-center justify-center">
        <p className="text-gray-500">미션을 찾을 수 없어요</p>
      </PageLayout>
    );
  }

  const handleSubmit = async () => {
    try {
      await submitMission(mission.id, memo);
      alert('제출되었습니다! 부모님의 승인을 기다려주세요.');
      // 제출 완료 화면이 히스토리 스택에 남지 않도록 replace 사용
      navigate('/', { replace: true });
    } catch (error) {
      alert(error instanceof Error ? error.message : '미션 제출이 완료되지 않았어요');
    }
  };

  return (
    <PageLayout headerHeight={NORMAL_HEADER_HEIGHT} className="pb-8">
      {/* Header */}
      <div className="bg-white px-5 pt-4 pb-4 flex items-center gap-4">
        <button
          onClick={() => navigate('/')}
          className="w-10 h-10 flex items-center justify-center"
        >
          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-gray-800">미션 수행하기</h1>
      </div>

      <div className="px-5 mt-6">
        {/* Mission Info */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
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
          <p className="text-gray-600 text-base">{mission.description}</p>
        </div>

        {/* Memo */}
        <div className="mb-6">
          <label className="block text-gray-700 font-medium mb-2">메모</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder=""
            className="w-full h-32 p-4 border-2 border-gray-200 rounded-2xl resize-none focus:outline-none focus:border-green-400 text-base"
          />
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          className="w-full py-4 bg-orange-400 text-white rounded-2xl font-bold text-lg shadow-md hover:bg-orange-500 transition-colors"
        >
          제출하기
        </button>
      </div>
    </PageLayout>
  );
};

export default MissionDetail;


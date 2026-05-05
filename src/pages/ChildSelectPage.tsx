import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getActiveChildren } from '../firebase/users';
import Header from '../components/Header';
import Character from '../components/Character';

/**
 * 역할 선택에서 "아이" 선택 후 표시되는 자녀 선택 페이지.
 * - 자녀 1명: 자동 선택 후 아이 홈으로 이동
 * - 자녀 2명 이상: 선택 화면 표시
 */
const ChildSelectPage: React.FC = () => {
  const { user, setDeviceRole, setSelectedChildId } = useApp();
  const navigate = useNavigate();
  const [children, setChildren] = useState<Array<{ id: string; name: string; gender?: 'male' | 'female' }>>([]);
  const [loading, setLoading] = useState(true);

  // 로그인되지 않은 경우 (ProtectedRoute에서 이미 처리되지만 방어적)
  if (!user) {
    return null;
  }

  // 아이 계정인 경우: 본인으로 바로 이동
  useEffect(() => {
    if (user.role === 'CHILD') {
      setDeviceRole('CHILD');
      setSelectedChildId(user.id);
      navigate(`/child/${user.id}`, { replace: true });
    }
  }, [user.role, user.id, setDeviceRole, setSelectedChildId, navigate]);

  // 부모 계정: 자녀 목록 로드 (삭제된 자녀 제외)
  useEffect(() => {
    if (user.role !== 'PARENT' || !user.id) {
      setChildren([]);
      setLoading(false);
      return;
    }

    getActiveChildren(user.id).then((list) => {
      setChildren(list);
      setLoading(false);
    });
  }, [user.role, user.id]);

  // 자녀 1명일 경우 자동 선택 후 이동
  useEffect(() => {
    if (user.role !== 'PARENT' || loading || children.length !== 1) return;
    const only = children[0];
    setDeviceRole('CHILD');
    setSelectedChildId(only.id);
    navigate(`/child/${only.id}`, { replace: true });
  }, [user.role, loading, children, setDeviceRole, setSelectedChildId, navigate]);

  const handleSelectChild = (childId: string) => {
    setSelectedChildId(childId);
    setDeviceRole('CHILD');
    navigate(`/child/${childId}`);
  };

  const handleBack = () => {
    navigate('/role-select');
  };

  // 아이 계정이면 리다이렉트 중 (아무것도 안 보여도 됨)
  if (user.role === 'CHILD') {
    return (
      <div className="min-h-screen bg-[#FFFEF9] flex items-center justify-center">
        <p className="text-gray-500 text-sm">이동 중...</p>
      </div>
    );
  }

  // 부모 + 자녀 1명이면 자동 이동 중
  if (user.role === 'PARENT' && !loading && children.length === 1) {
    return (
      <div className="min-h-screen bg-[#FFFEF9] flex items-center justify-center">
        <p className="text-gray-500 text-sm">이동 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFEF9] mx-auto">
      <Header showBackButton onBack={handleBack} />
      <div className="px-5 py-6">
        <h1 className="text-xl font-bold text-gray-800 mb-6">
          어떤 아이로 로그인할까요?
        </h1>

        {loading ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">자녀 정보를 불러오는 중...</p>
          </div>
        ) : children.length === 0 ? (
          <div className="text-center py-8">
            <Character size="large" showSpeechBubble speechText="자녀를 추가해주세요" className="mx-auto mb-4" />
            <p className="text-gray-500 text-base mb-4">등록된 자녀가 없어요</p>
            <button
              onClick={() => navigate('/add-child')}
              className="px-6 py-3 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600 transition-colors"
            >
              자녀 추가하기
            </button>
            <button
              onClick={handleBack}
              className="block w-full mt-3 py-2.5 text-gray-500 text-sm font-medium hover:text-gray-700"
            >
              뒤로 가기
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {children.map((child) => (
              <button
                key={child.id}
                type="button"
                onClick={() => handleSelectChild(child.id)}
                className="w-full py-4 px-5 bg-white rounded-2xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all text-left flex items-center gap-4 active:scale-[0.98]"
              >
                <Character size="medium" gender={child.gender} />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-gray-800 truncate">{child.name}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">탭하여 이 아이로 로그인</p>
                </div>
                <svg className="w-6 h-6 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChildSelectPage;

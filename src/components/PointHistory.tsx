import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { subscribePointHistory, PointHistory } from '../firebase/pointHistory';
import { getUser } from '../firebase/users';
import Character from './Character';
import PageLayout from './PageLayout';
import { NORMAL_HEADER_HEIGHT } from '../constants/layout';

/**
 * 포인트 내역 화면
 * - 부모/아이 모두 조회 가능
 * - 읽기 전용
 */
const PointHistoryPage: React.FC = () => {
  const { user } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // childId는 URL 파라미터 또는 context에서 가져오기
  const childIdFromUrl = searchParams.get('childId');
  const childId = childIdFromUrl || (user?.role === 'CHILD' ? user.id : null);
  
  const [pointHistory, setPointHistory] = useState<PointHistory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPoint, setCurrentPoint] = useState<number>(0); // 현재 남은 포인트
  const [activeTab, setActiveTab] = useState<'ALL' | 'EARN' | 'USE'>('ALL'); // 탭 상태

  // 부모/아이 여부 확인
  const isParent = user?.role === 'PARENT';
  const isChild = user?.role === 'CHILD';

  // childId가 없으면 에러
  useEffect(() => {
    if (!childId) {
      setError('자녀 정보를 찾을 수 없습니다.');
      setLoading(false);
      return;
    }

    // 권한 체크: 부모는 자신의 자녀만, 아이는 본인만 조회 가능
    if (isParent && user?.childrenIds && !user.childrenIds.includes(childId)) {
      setError('접근 권한이 없습니다.');
      setLoading(false);
      return;
    }

    if (isChild && user?.id !== childId) {
      setError('접근 권한이 없습니다.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // 현재 포인트 조회
    getUser(childId)
      .then((childUser) => {
        if (childUser) {
          setCurrentPoint(childUser.totalPoint || 0);
        }
      })
      .catch((error) => {
        // childId일 가능성이 있으므로 조용히 처리 (에러 throw하지 않음)
      });

    // 포인트 사용 이력 구독
    const unsubscribe = subscribePointHistory(childId, (history) => {
      setPointHistory(history);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [childId, isParent, isChild, user]);

  // 날짜 포맷팅 (YYYY.MM.DD)
  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}.${month}.${day}`;
    } catch (error) {
      return '';
    }
  };

  // 탭별 필터링된 내역
  const filteredHistory = useMemo(() => {
    if (activeTab === 'ALL') {
      return pointHistory; // 모든 내역
    } else if (activeTab === 'EARN') {
      return pointHistory.filter((item) => item.type === 'earn'); // 적립만
    } else if (activeTab === 'USE') {
      return pointHistory.filter((item) => item.type === 'use'); // 사용만
    }
    return [];
  }, [pointHistory, activeTab]);

  // 로딩 스켈레톤
  if (loading) {
    return (
      <PageLayout headerHeight={NORMAL_HEADER_HEIGHT}>
        {/* Header */}
        <div className="bg-white px-5 pt-4 pb-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 flex items-center justify-center"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-800">포인트 내역</h1>
        </div>

        {/* 스켈레톤 */}
        <div className="px-5 mt-6">
          {/* 요약 카드 스켈레톤 */}
          <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border-2 border-gray-200 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-32 mb-2"></div>
            <div className="h-10 bg-gray-200 rounded w-24"></div>
          </div>
          {/* 리스트 스켈레톤 */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-4 mb-3 shadow-sm border-2 border-gray-200 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gray-200"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
                <div className="h-6 bg-gray-200 rounded w-16"></div>
              </div>
            </div>
          ))}
        </div>
      </PageLayout>
    );
  }

  // 에러 상태
  if (error) {
    return (
      <PageLayout headerHeight={NORMAL_HEADER_HEIGHT}>
        {/* Header */}
        <div className="bg-white px-5 pt-4 pb-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 flex items-center justify-center"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-800">포인트 내역</h1>
        </div>

        {/* 에러 메시지 */}
        <div className="px-5 mt-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border-2 border-red-200 text-center">
            <div className="mb-4 flex justify-center">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-gray-700 text-lg font-medium mb-2">오류가 발생했어요</p>
            <p className="text-gray-500 text-sm">{error}</p>
            <button
              onClick={() => navigate(-1)}
              className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
            >
              돌아가기
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  // 빈 상태 문구 (탭별)
  const getEmptyMessage = () => {
    if (activeTab === 'ALL') {
      return {
        title: '아직 포인트 내역이 없어요',
        description: '미션을 완료하거나 포인트를 사용하면\n여기에 표시돼요',
      };
    } else if (activeTab === 'EARN') {
      return {
        title: '아직 적립된 포인트가 없어요',
        description: '',
      };
    } else if (activeTab === 'USE') {
      return {
        title: '아직 포인트를 사용한 기록이 없어요',
        description: '',
      };
    }
    return {
      title: '아직 포인트 내역이 없어요',
      description: '',
    };
  };

  return (
    <PageLayout headerHeight={NORMAL_HEADER_HEIGHT} className="pb-8">
      {/* Header */}
      <div className="bg-white px-5 pt-4 pb-4 flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center"
        >
          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-gray-800">포인트 내역</h1>
      </div>

      {/* 상단 요약 영역 - 남은 포인트 카드 */}
      <div className="px-5 mt-6">
        <div className="bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 rounded-2xl p-6 shadow-sm border-2 border-yellow-300">
          <p className="text-sm text-yellow-900/80 font-medium mb-2">지금 사용할 수 있는 포인트예요</p>
          <p className="text-4xl font-extrabold text-yellow-900">
            {currentPoint.toLocaleString()}P
          </p>
        </div>
      </div>

      {/* 탭 구성 */}
      <div className="px-5 mt-6">
        <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm transition-colors ${
              activeTab === 'ALL'
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            전체
          </button>
          <button
            onClick={() => setActiveTab('EARN')}
            className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm transition-colors ${
              activeTab === 'EARN'
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            적립
          </button>
          <button
            onClick={() => setActiveTab('USE')}
            className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm transition-colors ${
              activeTab === 'USE'
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            사용
          </button>
        </div>
      </div>

      {/* 포인트 내역 리스트 */}
      <div className="px-5 mt-6">
        {filteredHistory.length === 0 ? (
          // 빈 상태
          <div className="text-center py-12">
            <div className="mb-4 flex justify-center">
              <Character size="large" showSpeechBubble speechText={getEmptyMessage().title} />
            </div>
            <p className="text-gray-400 text-lg mb-2">{getEmptyMessage().title}</p>
            {getEmptyMessage().description && (
              <p className="text-sm text-gray-300 whitespace-pre-line text-center">
                {getEmptyMessage().description}
              </p>
            )}
          </div>
        ) : (
          // 내역 리스트 (최신순 정렬 - 이미 subscribePointHistory에서 정렬됨)
          filteredHistory.map((item) => {
            const isEarn = item.type === 'earn';
            const isUse = item.type === 'use';
            
            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl p-4 mb-3 shadow-sm border-2 border-gray-200"
              >
                <div className="flex items-center gap-3">
                  {/* 아이콘 */}
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isEarn ? 'bg-green-100' : 'bg-orange-100'
                  }`}>
                    <span className="text-2xl">
                      {isEarn ? '➕' : '➖'}
                    </span>
                  </div>

                  {/* 사유 및 날짜 */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-gray-800 mb-1 truncate">
                      {item.reason}
                    </h3>
                    {item.rewardTitle && (
                      <p className="text-sm text-gray-600 mb-1">
                        {item.rewardTitle}
                      </p>
                    )}
                    <p className="text-sm text-gray-500">
                      {formatDate(item.createdAt)}
                    </p>
                  </div>

                  {/* 포인트 수치 */}
                  <div className={`text-lg font-bold flex-shrink-0 ${
                    item.amount > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {item.amount > 0 ? '+' : ''}{item.amount}P
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </PageLayout>
  );
};

export default PointHistoryPage;

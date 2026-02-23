import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getUser } from '../firebase/users';
import { db } from '../firebase/config';
import Character from '../components/Character';

const SelectChild: React.FC = () => {
  const { user } = useApp();
  const navigate = useNavigate();
  const [childrenList, setChildrenList] = useState<Array<{ name: string; uid: string }>>([]);
  const [loading, setLoading] = useState(true);

  // 부모만 접근 가능
  if (!user || user.role !== 'PARENT') {
    return (
      <div className="min-h-screen bg-[#FFFEF9] flex items-center justify-center px-5">
        <div className="text-center">
          <p className="text-gray-500 text-lg mb-2">부모만 접근할 수 있는 화면입니다.</p>
          <button
            onClick={() => navigate('/')}
            className="text-blue-500 hover:underline"
          >
            홈으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  // 자녀 목록 정보 가져오기 (childrenIds 배열 기준)
  useEffect(() => {
    if (!user?.childrenIds || user.childrenIds.length === 0 || !db) {
      setChildrenList([]);
      setLoading(false);
      return;
    }

    // 모든 자녀 정보를 병렬로 조회
    Promise.all(
      user.childrenIds.map(async (childId) => {
        try {
          // childId일 가능성이 있으므로 getUser 호출 (문서가 없으면 조용히 null 반환)
          const childUser = await getUser(childId);
          if (childUser) {
            return { name: childUser.name, uid: childId };
          }
          // childId가 user 문서가 아닐 수 있으므로 조용히 skip
          return null;
        } catch (error) {
          // childId일 가능성이 있으므로 조용히 처리
          return null;
        }
      })
    ).then((children) => {
      // null 값 필터링 (childId가 user 문서가 아닌 경우)
      const validChildren = children.filter((child) => child !== null);
      setChildrenList(validChildren);
      setLoading(false);
    });
  }, [user?.childrenIds]);

  // 자녀 선택 핸들러
  const handleChildSelect = (childUid: string) => {
    // 기본 자녀로 저장
    localStorage.setItem('defaultChildId', childUid);
    // 자녀 화면으로 이동
    navigate(`/child/${childUid}`);
  };

  return (
    <div className="min-h-screen bg-[#FFFEF9] flex items-center justify-center px-5">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">자녀를 선택하세요</h2>
          <p className="text-gray-600 text-base">관리할 자녀를 선택해주세요</p>
        </div>
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-sm">자녀 정보를 불러오는 중...</p>
            </div>
          ) : childrenList.length === 0 ? (
            <div className="text-center py-8">
              <Character size="large" showSpeechBubble speechText="자녀를 추가해주세요" className="mx-auto mb-4" />
              <p className="text-gray-400 text-base mb-2">아직 자녀가 없어요</p>
              <button
                onClick={() => navigate('/add-child')}
                className="mt-4 px-6 py-3 bg-blue-500 text-white rounded-xl font-bold hover:bg-blue-600 transition-colors"
              >
                자녀 추가하기
              </button>
            </div>
          ) : (
            childrenList.map((child) => {
              const isDefault = localStorage.getItem('defaultChildId') === child.uid;
              return (
                <button
                  key={child.uid}
                  onClick={() => handleChildSelect(child.uid)}
                  className={`w-full py-4 px-5 bg-white rounded-2xl border-2 transition-all text-left active:scale-98 flex items-center gap-4 ${
                    isDefault 
                      ? 'border-green-400 bg-green-50' 
                      : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                  }`}
                >
                  <Character size="medium" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-gray-800">{child.name}</h3>
                      {isDefault && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                          기본 자녀
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {isDefault ? '현재 기본 자녀입니다' : '자녀를 변경하려면 선택하세요'}
                    </p>
                  </div>
                  <svg className="w-6 h-6 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              );
            })
          )}
        </div>
        <div className="mt-6">
          {/* v1.0: 자녀 수 제한 (1명만 가능) */}
          {childrenList.length >= 1 ? (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-line text-center">
                현재는 한 명의 자녀만 관리할 수 있어요 🙂{'\n'}
                다자녀 관리는 추후 업데이트에서 제공될 예정이에요.
              </p>
            </div>
          ) : (
            <button
              onClick={() => navigate('/add-child')}
              className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors"
            >
              + 자녀 추가하기
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SelectChild;


import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getUser } from '../firebase/users';
import { db } from '../firebase/config';
import Header from '../components/Header';

interface ChildInfo {
  uid: string;
  name: string;
  totalPoint: number;
  gender: 'male' | 'female' | undefined;
}

const ChildrenManagement: React.FC = () => {
  const { user } = useApp();
  const navigate = useNavigate();
  const [childrenInfo, setChildrenInfo] = useState<ChildInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // 자녀 정보 가져오기
  useEffect(() => {
    if (!user?.childrenIds || user.childrenIds.length === 0 || !db) {
      setChildrenInfo([]);
      setLoading(false);
      return;
    }

    // 모든 자녀 정보를 병렬로 조회
    Promise.all(
      user.childrenIds.map(async (childId) => {
        try {
          const childUser = await getUser(childId);
          if (!childUser) {
            return null;
          }
          return {
            uid: childId,
            name: childUser.name,
            totalPoint: childUser.totalPoint || 0,
            gender: childUser.gender,
          };
        } catch (error) {
          return null;
        }
      })
    ).then((children) => {
      const validChildren: ChildInfo[] = children.filter(
        (c): c is ChildInfo => c !== null
      );
      setChildrenInfo(validChildren);
      setLoading(false);
    });
  }, [user?.childrenIds]);

  // 부모만 접근 가능
  if (!user || user.role !== 'PARENT') {
    return (
      <div className="min-h-screen bg-[#FFFEF9] flex items-center justify-center px-5">
        <div className="text-center">
          <p className="text-gray-500 text-lg mb-2">부모만 접근할 수 있는 화면입니다.</p>
          <button
            onClick={() => navigate('/parent')}
            className="text-blue-500 hover:underline"
          >
            부모 홈으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFEF9]">
      <Header showBackButton={true} onBack={() => navigate('/parent')} />
      
      <div className="px-5 pb-24">
        {/* 화면 타이틀 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">자녀 관리</h1>
          <p className="text-sm text-gray-500 mt-1">관리할 자녀를 추가하고 관리하세요</p>
        </div>

        {/* 자녀 목록 */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">자녀 정보를 불러오는 중...</p>
          </div>
        ) : childrenInfo.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-base">등록된 자녀가 없습니다</p>
            <p className="text-sm text-gray-400 mt-1">하단 버튼을 눌러 자녀를 추가해주세요</p>
          </div>
        ) : (
          <div className="space-y-3">
            {childrenInfo.map((child) => (
              <div
                key={child.uid}
                className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-800">{child.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      포인트: {child.totalPoint.toLocaleString()}P
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 하단 고정 버튼 */}
      <div 
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <button
          onClick={() => navigate('/add-child')}
          className="w-full py-4 bg-green-500 text-white rounded-2xl font-bold text-lg shadow-lg hover:bg-green-600 active:bg-green-700 transition-colors"
        >
          + 자녀 추가하기
        </button>
      </div>
    </div>
  );
};

export default ChildrenManagement;


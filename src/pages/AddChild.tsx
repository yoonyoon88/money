import React, { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getSubscriptionPlan } from '../types';
import { db } from '../firebase/config';
import { getMaxChildren } from '../utils/planLimit';
import { getVisibleChildrenCount } from '../firebase/users';
import { hasPremiumAccess } from '../utils/subscription';
import { collection, addDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { safeUserUpdate } from '../utils/firestoreSafeUpdate';
import Header from '../components/Header';
import Character from '../components/Character';

const AddChild: React.FC = () => {
  const { user } = useApp();
  const navigate = useNavigate();
  const [childName, setChildName] = useState('');
  const [gender, setGender] = useState<'female' | 'male'>('female');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUsageGuide, setShowUsageGuide] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [visibleChildrenCount, setVisibleChildrenCount] = useState<number>(0);

  // Soft Delete 반영: 홈에 보이는 자녀 수만 한도에 사용
  useEffect(() => {
    if (user?.role === 'PARENT' && user?.id) {
      getVisibleChildrenCount(user.id).then(setVisibleChildrenCount);
    }
  }, [user?.id, user?.role]);

  // 최초 1회만 사용법 안내 팝업 표시
  useEffect(() => {
    const hasSeenGuide = localStorage.getItem('hasSeenUsageGuide');
    if (!hasSeenGuide) {
      setShowUsageGuide(true);
    }
  }, []);

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

  const subscriptionPlan = getSubscriptionPlan(user);
  const effectivePlan = hasPremiumAccess(subscriptionPlan) ? 'premium' : subscriptionPlan;
  const maxChildren = getMaxChildren(effectivePlan);

  useEffect(() => {
    if (visibleChildrenCount >= maxChildren) {
      setShowLimitModal(true);
    }
  }, [visibleChildrenCount, maxChildren]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const limit = getMaxChildren(effectivePlan);
    if (visibleChildrenCount >= limit) {
      setError(
        hasPremiumAccess(subscriptionPlan)
          ? '최대 5명까지 관리할 수 있어요.'
          : '현재는 한 명의 자녀만 관리할 수 있어요 😊'
      );
      return;
    }

    // 유효성 검사
    if (!childName.trim()) {
      setError('자녀 이름을 입력해주세요.');
      return;
    }

    if (!db) {
      setError('Firebase가 초기화되지 않았습니다.');
      return;
    }

    if (!user || !user.id) {
      setError('로그인 정보를 찾을 수 없습니다.');
      return;
    }

    setLoading(true);

    try {
      // 1. Firestore users 컬렉션에 새 문서 생성
      const childDocRef = await addDoc(collection(db, 'users'), {
        role: 'CHILD',
        name: childName.trim(),
        parentId: user.id,
        totalPoint: 0,
        gender: gender,
        isDeleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const childUid = childDocRef.id;

      // 2. 부모의 childrenIds 배열에 자녀 UID 추가
      await safeUserUpdate(user.id, {
        childrenIds: arrayUnion(childUid),
        updatedAt: serverTimestamp(),
      });

      // 3. 성공 시 부모 홈으로 이동 (온보딩 흐름 개선)
      // 부모 홈에서 '첫 미션 만들기' 유도 카드가 표시됨
      navigate('/parent', { replace: true });
    } catch (err: any) {
      let errorMessage = '자녀 추가에 실패했습니다.';
      
      if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setLoading(false);
    }
  };

  // 사용법 팝업 닫기 핸들러
  const handleCloseUsageGuide = () => {
    setShowUsageGuide(false);
    localStorage.setItem('hasSeenUsageGuide', 'true');
  };

  return (
    <div className="min-h-screen bg-[#FFFEF9]">
      <Header />
      
      {/* 사용법 안내 모달 (최초 1회만 표시) */}
      {showUsageGuide && (
        <>
          {/* 배경 오버레이 */}
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={handleCloseUsageGuide}
          />
          {/* 모달 카드 */}
          <div className="fixed inset-0 flex items-center justify-center z-50 px-5">
            <div
              className="bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50 rounded-3xl shadow-2xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 헤더 - 닫기 버튼 */}
              <div className="px-6 pt-6 pb-4 flex items-center justify-end">
                <button
                  onClick={handleCloseUsageGuide}
                  className="p-2 hover:bg-white/50 rounded-full transition-colors"
                  aria-label="닫기"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* 내용 */}
              <div className="px-6 pb-6 flex-1 overflow-y-auto">
                {/* 제목 */}
                <h2 className="text-xl font-bold text-gray-800 mb-6 text-center">
                  용돈 관리는 이렇게 진행돼요 👇
                </h2>
                
                <div className="space-y-4">
                  {/* 1단계 */}
                  <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 border border-white/50">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0">① 📝</span>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-gray-800 mb-1">
                          부모가 미션을 만들어요
                        </h3>
                        <p className="text-xs text-gray-600 leading-relaxed">
                          아이가 할 일을 정해 주세요
                        </p>
                      </div>
                    </div>
                  </div>
                  {/* 2단계 */}
                  <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 border border-white/50">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0">② 🧒</span>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-gray-800 mb-1">
                          아이가 미션을 완료해요
                        </h3>
                        <p className="text-xs text-gray-600 leading-relaxed">
                          끝나면 '완료' 버튼을 눌러요
                        </p>
                      </div>
                    </div>
                  </div>
                  {/* 3단계 */}
                  <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 border border-white/50">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0">③ ✅</span>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-gray-800 mb-1">
                          부모가 확인해요
                        </h3>
                        <p className="text-xs text-gray-600 leading-relaxed">
                          확인하면 포인트가 지급돼요
                        </p>
                      </div>
                    </div>
                  </div>
                  {/* 4단계 */}
                  <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 border border-white/50">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0">④ 🎁</span>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-gray-800 mb-1">
                          포인트로 소원을 이뤄요
                        </h3>
                        <p className="text-xs text-gray-600 leading-relaxed">
                          모은 포인트로 아이의 소원을 함께 실현해요
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* 하단 버튼 영역 */}
              <div className="px-6 pb-6 pt-4 border-t border-white/50">
                <button
                  onClick={handleCloseUsageGuide}
                  className="w-full py-3.5 bg-green-500 text-white rounded-xl font-semibold text-base shadow-md hover:bg-green-600 active:bg-green-700 transition-colors"
                >
                  다음
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 사용법 팝업이 표시되는 동안 자녀 추가 폼 숨김 */}
      {!showUsageGuide && (
        <div className="flex items-center justify-center min-h-screen px-5">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-2xl shadow-lg p-8">
              {/* 프로필 아이콘 */}
              <div className="mb-6 flex justify-center">
                <div className="w-24 h-24 rounded-full bg-yellow-100 border-4 border-yellow-200 flex items-center justify-center">
                  <Character size="large" gender={gender} />
                </div>
              </div>

              {/* 타이틀 */}
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800 mb-2">
                  자녀 추가하기
                </h1>
                <p className="text-sm text-gray-500">
                  새로운 자녀 계정을 생성합니다
                </p>
              </div>

              {/* 입력 필드 */}
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* 자녀 이름 */}
                <div>
                  <label htmlFor="childName" className="block text-sm font-medium text-gray-700 mb-2">
                    자녀 이름
                  </label>
                  <input
                    id="childName"
                    type="text"
                    value={childName}
                    onChange={(e) => setChildName(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                    placeholder="자녀 이름을 입력하세요"
                  />
                </div>

                {/* 성별 선택 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    성별
                  </label>
                  <div className="flex gap-3">
                    {/* 여자 버튼 */}
                    <button
                      type="button"
                      onClick={() => setGender('female')}
                      className={`flex-1 py-3 px-4 rounded-xl border-2 transition-colors ${
                        gender === 'female'
                          ? 'bg-green-50 border-green-500'
                          : 'bg-white border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <div className={`w-4 h-4 rounded-full border-2 ${
                          gender === 'female'
                            ? 'bg-blue-500 border-blue-500'
                            : 'border-gray-400'
                        }`} />
                        <span className="text-base font-medium text-gray-800">여자</span>
                      </div>
                    </button>

                    {/* 남자 버튼 */}
                    <button
                      type="button"
                      onClick={() => setGender('male')}
                      className={`flex-1 py-3 px-4 rounded-xl border-2 transition-colors ${
                        gender === 'male'
                          ? 'bg-green-50 border-green-500'
                          : 'bg-white border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <div className={`w-4 h-4 rounded-full border-2 ${
                          gender === 'male'
                            ? 'bg-blue-500 border-blue-500'
                            : 'border-gray-400'
                        }`} />
                        <span className="text-base font-medium text-gray-800">남자</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* 에러 메시지 */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <p className="text-sm text-red-600 whitespace-pre-line">{error}</p>
                  </div>
                )}

                {/* 버튼 영역 */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => navigate('/parent')}
                    className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !childName.trim()}
                    className="flex-1 py-3 bg-green-500 text-white rounded-xl font-semibold hover:bg-green-600 transition-colors disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                  >
                    {loading ? '추가 중...' : '자녀 추가하기'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[85%] max-w-sm rounded-2xl bg-white p-6">
            <h2 className="mb-2 text-lg font-semibold text-gray-800">
              자녀 추가 제한에 도달했습니다
            </h2>
            <p className="mb-4 text-sm text-gray-600">
              현재 플랜에서는 최대 {maxChildren}명까지 등록할 수 있어요.
            </p>
            {!hasPremiumAccess(subscriptionPlan) && (
              <button
                type="button"
                onClick={() => navigate('/parent/subscription')}
                className="mb-2 w-full rounded-lg bg-gradient-to-r from-purple-500 to-indigo-500 py-2 text-white transition-colors hover:from-purple-600 hover:to-indigo-600"
              >
                프리미엄으로 업그레이드
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowLimitModal(false);
                navigate('/parent');
              }}
              className="w-full rounded-lg bg-gray-100 py-2 text-gray-700 transition-colors hover:bg-gray-200"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddChild;


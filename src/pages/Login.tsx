import React, { useState, FormEvent, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword, AuthError, sendPasswordResetEmail, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';
import Header from '../components/Header';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '../constants/policyUrls';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoLogin, setAutoLogin] = useState(false);
  const [saveEmail, setSaveEmail] = useState(false);
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  
  // DOM 요소 직접 참조를 위한 ref (모바일 state 비동기 문제 해결)
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // 저장된 이메일 불러오기 (컴포넌트 마운트 시)
  useEffect(() => {
    const savedEmail = localStorage.getItem('savedEmail');
    if (savedEmail) {
      setEmail(savedEmail);
      setSaveEmail(true); // 저장된 이메일이 있으면 체크박스도 체크 상태로
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    // form submit 기본 동작 방지 (페이지 새로고침 방지) - 최우선 처리
    e.preventDefault();
    e.stopPropagation();
    
    console.log('login submit prevented');

    // 이미 로딩 중이면 중복 호출 방지
    if (loading) {
      console.log('login already in progress, ignoring duplicate call');
      return;
    }

    try {
      // DOM에서 직접 최신 값 가져오기 (모바일 state 비동기 문제 해결)
      const emailElement = emailInputRef.current || document.getElementById('email') as HTMLInputElement;
      const passwordElement = passwordInputRef.current || document.getElementById('password') as HTMLInputElement;
      
      const currentEmail = emailElement?.value?.trim() || '';
      const currentPassword = passwordElement?.value?.trim() || '';

      // 입력값 검증 (DOM 값 기준)
      if (!currentEmail || !currentPassword) {
        setError('이메일과 비밀번호를 모두 입력해주세요.');
        return;
      }

      // DOM 값과 state 동기화 (다음 렌더링을 위해)
      if (currentEmail !== email) {
        setEmail(currentEmail);
      }
      if (currentPassword !== password) {
        setPassword(currentPassword);
      }

      setError(null);
      setLoading(true);
      console.log('login attempt started');

      // 실제 로그인 로직 실행 (Firebase v9 modular 방식)
      try {
        const userCredential = await signInWithEmailAndPassword(auth, currentEmail, currentPassword);
        const user = userCredential.user;
        
        console.log('signIn success', user.uid);
        
        // 로그인 성공 시 설정 저장
        if (autoLogin) {
          localStorage.setItem('autoLogin', 'true');
        } else {
          localStorage.removeItem('autoLogin');
        }
        
        if (saveEmail) {
          localStorage.setItem('savedEmail', currentEmail);
        } else {
          localStorage.removeItem('savedEmail');
        }

        // 로그인 성공 후 onAuthStateChanged를 통해 리디렉션 처리
        // AppContext의 onAuthStateChanged에서 user 상태 변경을 감지하여
        // App.tsx의 LoginRoute가 자동으로 역할 선택 페이지로 리디렉션
        // onAuthStateChanged는 signInWithEmailAndPassword 직후 자동으로 호출됨
        
        // 로딩 상태 해제 (onAuthStateChanged가 즉시 호출되어 리디렉션 처리)
        setLoading(false);
      } catch (err) {
        // 로그인 실패 시 반드시 로딩 상태 원복
        console.log('signIn failed', err);
        setLoading(false);
        
        // 에러 코드 기반 분기 처리
        const authError = err as AuthError;
        let errorMessage = '로그인 오류가 발생했습니다. 관리자에게 문의하세요.';
        
        if (authError.code === 'auth/user-not-found' || 
            authError.code === 'auth/wrong-password' || 
            authError.code === 'auth/invalid-credential') {
          errorMessage = '이메일 또는 비밀번호가 올바르지 않습니다.';
        } else if (authError.code === 'auth/network-request-failed') {
          errorMessage = '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.';
        } else if (authError.code === 'auth/too-many-requests') {
          errorMessage = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
        }
        
        setError(errorMessage);
      }
    } catch (err) {
      // 예상치 못한 에러 처리
      console.error('unexpected error in handleSubmit', err);
      setLoading(false);
      setError('로그인 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
  };

  // 비밀번호 재설정 모달 열기
  const handlePasswordResetClick = () => {
    setShowPasswordResetModal(true);
    setResetEmail('');
    setResetError(null);
  };

  // 비밀번호 재설정 모달 닫기
  const handleClosePasswordResetModal = () => {
    setShowPasswordResetModal(false);
    setResetEmail('');
    setResetError(null);
  };

  // 비밀번호 재설정 메일 발송
  const handleSendPasswordResetEmail = async () => {
    const trimmedEmail = resetEmail.trim();

    // 1. 이메일 입력값이 비어있으면
    if (!trimmedEmail) {
      setResetError('이메일을 입력해주세요.');
      return;
    }

    // 2. 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setResetError('올바른 이메일 형식이 아닙니다.');
      return;
    }

    // 3. Firestore users 컬렉션에서 이메일 조회
    setResetError(null);
    setPasswordResetLoading(true);

    try {
      // Firestore에서 이메일로 사용자 조회
      const usersQuery = query(
        collection(db, 'users'),
        where('email', '==', trimmedEmail)
      );
      const querySnapshot = await getDocs(usersQuery);

      // 결과가 0개이면
      if (querySnapshot.empty) {
        setResetError('가입된 이메일이 아닙니다. 회원가입을 확인해주세요.');
        setPasswordResetLoading(false);
        return;
      }

      // 결과가 존재하면 sendPasswordResetEmail 호출
      await sendPasswordResetEmail(auth, trimmedEmail);
      alert('비밀번호 재설정 메일이 발송되었습니다.');
      handleClosePasswordResetModal();
    } catch (err) {
      const authError = err as AuthError;
      // Firebase auth 에러 처리
      if (authError.code) {
        if (authError.code === 'auth/user-not-found') {
          setResetError('등록되지 않은 이메일입니다.');
        } else if (authError.code === 'auth/invalid-email') {
          setResetError('올바른 이메일 형식이 아닙니다.');
        } else if (authError.code === 'auth/too-many-requests') {
          setResetError('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
        } else {
          setResetError('비밀번호 재설정 메일 발송에 실패했습니다. 다시 시도해주세요.');
        }
      } else {
        // Firestore 에러 또는 기타 에러
        setResetError('오류가 발생했습니다. 다시 시도해주세요.');
      }
    } finally {
      setPasswordResetLoading(false);
    }
  };

  // 키보드 Enter 키 처리 (모바일 키보드 완료 버튼 포함)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, field: 'email' | 'password') => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      
      if (field === 'email') {
        // 이메일 필드에서 Enter 시 비밀번호 필드로 포커스
        // 모바일에서 키보드가 닫히지 않도록 약간의 지연 후 포커스
        setTimeout(() => {
          const passwordInput = passwordInputRef.current || document.getElementById('password') as HTMLInputElement;
          passwordInput?.focus();
        }, 50);
      } else if (field === 'password') {
        // 비밀번호 필드에서 Enter 시 로그인 실행
        // 모바일 키보드 완료 버튼 처리
        // form submit 이벤트를 시뮬레이션하여 handleSubmit 호출
        const formEvent = {
          preventDefault: () => {},
          stopPropagation: () => {},
        } as FormEvent;
        handleSubmit(formEvent);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF7D6]">
      <Header showBackButton={false} />
      <div className="flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl p-8">
          {/* 로고 영역 - 앱 아이콘 */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-44 h-44 sm:w-48 sm:h-48 rounded-2xl overflow-hidden flex items-center justify-center mb-4">
              <img 
                src="/app-icon.png"
                alt="용돈주세요 앱 아이콘"
                className="w-full h-full object-cover rounded-2xl"
                onError={(e) => {
                  // 이미지 로드 실패 시 대체 UI
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    parent.innerHTML = `
                      <div class="w-full h-full flex items-center justify-center bg-yellow-200 rounded-2xl">
                        <span class="text-4xl sm:text-5xl">👶</span>
                      </div>
                    `;
                  }
                }}
              />
            </div>
            {/* 서비스 설명 */}
            <p className="text-center text-gray-600 text-base font-medium">
              아이와 함께 미션으로 용돈을 관리해요
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm text-gray-600 mb-1.5">
                이메일
              </label>
              <input
                id="email"
                ref={emailInputRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={(e) => {
                  // 모바일에서 입력 완료 시 state 확실히 업데이트
                  const value = e.target.value.trim();
                  if (value !== email) {
                    setEmail(value);
                  }
                }}
                onKeyDown={(e) => handleKeyDown(e, 'email')}
                required
                disabled={loading}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-1 focus:ring-green-400 focus:border-green-400 disabled:bg-gray-50 disabled:cursor-not-allowed text-gray-700"
                placeholder="이메일을 입력하세요"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm text-gray-600 mb-1.5">
                비밀번호
              </label>
              <input
                id="password"
                ref={passwordInputRef}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={(e) => {
                  // 모바일에서 입력 완료 시 state 확실히 업데이트
                  const value = e.target.value.trim();
                  if (value !== password) {
                    setPassword(value);
                  }
                }}
                onKeyDown={(e) => handleKeyDown(e, 'password')}
                required
                disabled={loading}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-1 focus:ring-green-400 focus:border-green-400 disabled:bg-gray-50 disabled:cursor-not-allowed text-gray-700"
                placeholder="비밀번호를 입력하세요"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            {/* 아이디 저장 및 자동 로그인 체크박스 - 한 줄로 배치 */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 flex-1">
                <input
                  id="saveEmail"
                  type="checkbox"
                  checked={saveEmail}
                  onChange={(e) => setSaveEmail(e.target.checked)}
                  disabled={loading}
                  className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500 focus:ring-2 disabled:opacity-50"
                />
                <label htmlFor="saveEmail" className="text-sm text-gray-600 cursor-pointer select-none">
                  아이디 저장
                </label>
              </div>
              <div className="flex items-center gap-2 flex-1">
                <input
                  id="autoLogin"
                  type="checkbox"
                  checked={autoLogin}
                  onChange={(e) => setAutoLogin(e.target.checked)}
                  disabled={loading}
                  className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500 focus:ring-2 disabled:opacity-50"
                />
                <label htmlFor="autoLogin" className="text-sm text-gray-600 cursor-pointer select-none">
                  자동 로그인
                </label>
              </div>
            </div>

            {/* 로그인 버튼 - Primary 강조 */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-green-600 text-white rounded-xl font-bold text-lg shadow-md hover:bg-green-700 active:bg-green-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {loading ? '로그인 중...' : '로그인'}
            </button>

            {/* 비밀번호 찾기 버튼 */}
            <button
              type="button"
              onClick={handlePasswordResetClick}
              disabled={loading}
              className="w-full text-center mt-3 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              style={{
                color: '#4A6CF7',
                fontSize: '13px',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              비밀번호를 잊으셨나요?
            </button>

            {/* 회원가입 버튼 - Secondary (outline) */}
            <Link
              to="/signup"
              className="block w-full py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-medium text-base hover:border-gray-400 hover:bg-gray-50 transition-colors text-center"
            >
              회원가입
            </Link>
          </form>

          {/* 최하단 약관 링크 영역 */}
          <div className="mt-6 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  window.open(PRIVACY_POLICY_URL, '_blank', 'noopener,noreferrer');
                }}
                className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2 transition-colors"
              >
                개인정보처리방침
              </button>
              <span className="text-xs text-gray-400">·</span>
              <button
                type="button"
                onClick={() => {
                  window.open(TERMS_OF_SERVICE_URL, '_blank', 'noopener,noreferrer');
                }}
                className="text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2 transition-colors"
              >
                서비스 이용약관
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* 비밀번호 재설정 모달 */}
      {showPasswordResetModal && (
        <>
          {/* 배경 오버레이 */}
          <div
            className="fixed inset-0 bg-black/30 z-50"
            onClick={handleClosePasswordResetModal}
          />
          {/* 모달 카드 */}
          <div className="fixed inset-0 flex items-center justify-center z-50 px-5">
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 제목 */}
              <h3 className="text-xl font-bold text-gray-800 mb-6">
                비밀번호 재설정
              </h3>

              {/* 이메일 입력 */}
              <div className="mb-4">
                <label htmlFor="resetEmail" className="block text-sm text-gray-600 mb-1.5">
                  이메일
                </label>
                <input
                  id="resetEmail"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => {
                    setResetEmail(e.target.value);
                    setResetError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSendPasswordResetEmail();
                    }
                  }}
                  disabled={passwordResetLoading}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-1 focus:ring-green-400 focus:border-green-400 disabled:bg-gray-50 disabled:cursor-not-allowed text-gray-700"
                  placeholder="이메일을 입력하세요"
                  autoFocus
                />
              </div>

              {/* 에러 메시지 */}
              {resetError && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-red-600 text-sm">{resetError}</p>
                </div>
              )}

              {/* 버튼 영역 */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleClosePasswordResetModal}
                  disabled={passwordResetLoading}
                  className="flex-1 py-2.5 px-4 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSendPasswordResetEmail}
                  disabled={passwordResetLoading}
                  className="flex-1 py-2.5 px-4 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {passwordResetLoading ? '발송 중...' : '메일 발송'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Login;


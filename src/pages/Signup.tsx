import React, { useState, FormEvent, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '../constants/policyUrls';

const Signup: React.FC = () => {
  const navigate = useNavigate();
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [parentPin, setParentPin] = useState<string[]>(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    // 유효성 검사
    if (!name.trim()) {
      setError('이름을 입력해주세요.');
      return;
    }

    if (password.length < 8) {
      setError('비밀번호는 8자리 이상이어야 해요.');
      return;
    }

    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    // PIN 검증 (부모만 가입 가능하므로 항상 PIN 필요)
    const pinString = parentPin.join('');
    if (pinString.length !== 4) {
      setError('PIN은 4자리 숫자여야 합니다.');
      return;
    }
    if (!/^\d{4}$/.test(pinString)) {
      setError('PIN은 숫자만 입력 가능합니다.');
      return;
    }

    setLoading(true);

    try {
      // Firebase Auth로 계정 생성
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Firestore에 사용자 정보 저장 (부모만 가입 가능)
      if (db) {
        const userData: any = {
          name: name.trim() || '부모님', // 입력값이 없으면 기본값 사용
          role: 'PARENT', // 부모로 고정
          totalPoint: 0,
          email: email,
          childrenIds: [],
          parentPin: parentPin.join(''),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        await setDoc(doc(db, 'users', user.uid), userData);
      }

      // 회원가입 성공 시 홈으로 이동 (자녀가 없으면 자녀 추가 안내 화면 표시)
      // onAuthStateChanged가 자동으로 사용자 정보를 로드하므로
      // 약간의 지연 후 이동 (사용자 정보가 로드될 시간 확보)
      setTimeout(() => {
        navigate('/');
      }, 500);
    } catch (err: any) {
      let errorMessage = '회원가입에 실패했습니다.';
      let isEmailDuplicate = false;
      
      // 이메일 중복 체크 (가장 우선 처리)
      if (err.code === 'auth/email-already-in-use') {
        errorMessage = '이미 가입된 이메일이에요.\n로그인해 주세요.';
        isEmailDuplicate = true;
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = '유효하지 않은 이메일입니다.';
      } else if (err.code === 'auth/weak-password') {
        errorMessage = '비밀번호는 8자리 이상이어야 해요.';
      } else if (err.code === 'auth/network-request-failed') {
        errorMessage = '네트워크 연결을 확인해주세요.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setLoading(false);
      
      // 이메일 중복 오류 시 이메일 입력 필드에 포커스
      if (isEmailDuplicate && emailInputRef.current) {
        setTimeout(() => {
          emailInputRef.current?.focus();
          emailInputRef.current?.select();
        }, 100);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFEF9] flex items-center justify-center px-5 py-8">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {/* 타이틀 */}
          <h1 className="text-2xl font-bold text-gray-800 mb-6">회원가입</h1>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 기본 정보 영역 */}
            <div className="space-y-4">
              <div className="pb-3 border-b border-gray-200">
                <h2 className="text-base font-semibold text-gray-700">기본 정보</h2>
              </div>

              <div>
                <label htmlFor="name" className="block text-sm text-gray-600 mb-1.5">
                  이름
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-1 focus:ring-green-400 focus:border-green-400 disabled:bg-gray-50 disabled:cursor-not-allowed text-gray-700"
                  placeholder="이름을 입력하세요"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm text-gray-600 mb-1.5">
                  이메일
                </label>
                <input
                  ref={emailInputRef}
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-1 focus:ring-green-400 focus:border-green-400 disabled:bg-gray-50 disabled:cursor-not-allowed text-gray-700"
                  placeholder="비밀번호를 입력하세요 (8자 이상)"
                  minLength={8}
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm text-gray-600 mb-1.5">
                  비밀번호 확인
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-1 focus:ring-green-400 focus:border-green-400 disabled:bg-gray-50 disabled:cursor-not-allowed text-gray-700"
                  placeholder="비밀번호를 다시 입력하세요"
                  minLength={8}
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-red-600 text-sm whitespace-pre-line">{error}</p>
              </div>
            )}

            {/* 부모 설정 영역 */}
            <div className="space-y-4 pt-4 border-t border-gray-200">
              <div className="pb-3">
                <h2 className="text-base font-semibold text-gray-700">부모 설정</h2>
              </div>

              {/* 부모 PIN 입력 */}
              <div>
                <label htmlFor="parentPin" className="block text-sm text-gray-600 mb-2">
                  부모 PIN <span className="text-red-500 text-sm">*</span>
                </label>
                <div className="flex justify-center gap-3 mb-2">
                  {parentPin.map((digit, index) => (
                    <input
                      key={index}
                      type="password"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => {
                        const value = e.target.value;
                        // 숫자만 허용
                        if (value && !/^\d$/.test(value)) {
                          return;
                        }
                        const newPin = [...parentPin];
                        newPin[index] = value;
                        setParentPin(newPin);
                        // 다음 입력 필드로 포커스 이동
                        if (value && index < 3) {
                          const nextInput = document.getElementById(`pin-${index + 1}`);
                          nextInput?.focus();
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Backspace' && !parentPin[index] && index > 0) {
                          const prevInput = document.getElementById(`pin-${index - 1}`);
                          prevInput?.focus();
                        }
                      }}
                      id={`pin-${index}`}
                      disabled={loading}
                      className="w-16 h-16 text-center text-2xl font-bold border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-green-400 disabled:bg-gray-50 disabled:cursor-not-allowed"
                      autoComplete="off"
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-500 text-center mt-2">
                  부모 전용 기능 보호를 위한 4자리 비밀번호
                </p>
              </div>
            </div>

            {/* 약관 안내 영역 */}
            <div className="py-3 space-y-2">
              <p className="text-xs text-gray-500 text-center leading-relaxed">
                회원가입 시 개인정보처리방침 및 서비스 이용약관에 동의한 것으로 간주합니다.
              </p>
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => {
                    window.open(PRIVACY_POLICY_URL, '_blank', 'noopener,noreferrer');
                  }}
                  className="text-xs text-gray-600 hover:text-gray-800 underline underline-offset-2 transition-colors"
                >
                  개인정보처리방침
                </button>
                <span className="text-xs text-gray-400">·</span>
                <button
                  type="button"
                  onClick={() => {
                    window.open(TERMS_OF_SERVICE_URL, '_blank', 'noopener,noreferrer');
                  }}
                  className="text-xs text-gray-600 hover:text-gray-800 underline underline-offset-2 transition-colors"
                >
                  서비스 이용약관
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-green-600 text-white rounded-xl font-bold text-lg shadow-md hover:bg-green-700 active:bg-green-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {loading ? '가입 중...' : '회원가입'}
            </button>

            <div className="text-center mt-4">
              <p className="text-sm text-gray-600">
                이미 계정이 있으신가요?{' '}
                <Link to="/login" className="text-green-500 hover:text-green-600 font-medium">
                  로그인
                </Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Signup;


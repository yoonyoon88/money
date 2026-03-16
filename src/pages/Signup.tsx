import React, { useState, FormEvent, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '../constants/policyUrls';
import { getInitialSubscriptionForNewUser } from '../subscription/core';

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
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);

        // parentPin은 최초 생성시에만 기록하고, 기존 문서는 덮어쓰지 않음
        if (!snap.exists()) {
          const userData: any = {
            uid: user.uid,
            name: name.trim() || '부모님', // 입력값이 없으면 기본값 사용
            role: 'PARENT', // 부모로 고정
            totalPoint: 0,
            email: email,
            childrenIds: [],
            parentPin: parentPin.join(''),
            // 구독 기본값 (현재는 모두 프리미엄, 추후 이 함수만 수정해서 일반 사용자로 전환)
            ...getInitialSubscriptionForNewUser(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          await setDoc(userRef, userData, { merge: true });
        }
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
    <div className="mx-auto min-h-screen bg-white flex flex-col overflow-hidden">
      <main className="flex-1 overflow-y-auto px-5 pb-20">
      <h1 className="text-xl font-bold mb-1 text-gray-800">회원가입</h1>
      <p className="text-xs text-gray-400 mb-4">1분이면 시작할 수 있어요</p>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-3 min-h-0">
        <div className="flex flex-col gap-3">
              <div>
            <label htmlFor="name" className="block text-xs text-gray-500 mb-1">이름</label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={loading}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-100 transition disabled:bg-gray-50 disabled:cursor-not-allowed text-gray-700"
                  placeholder="이름을 입력하세요"
                />
              </div>
              <div>
            <label htmlFor="email" className="block text-xs text-gray-500 mb-1">이메일</label>
                <input
                  ref={emailInputRef}
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-100 transition disabled:bg-gray-50 disabled:cursor-not-allowed text-gray-700"
                  placeholder="이메일을 입력하세요"
                />
              </div>
              <div>
            <label htmlFor="password" className="block text-xs text-gray-500 mb-1">비밀번호</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-100 transition disabled:bg-gray-50 disabled:cursor-not-allowed text-gray-700"
              placeholder="8자 이상"
                  minLength={8}
                />
              </div>
              <div>
            <label htmlFor="confirmPassword" className="block text-xs text-gray-500 mb-1">비밀번호 확인</label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-100 transition disabled:bg-gray-50 disabled:cursor-not-allowed text-gray-700"
              placeholder="비밀번호 다시 입력"
                  minLength={8}
                />
              </div>
            </div>

            {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2.5">
            <p className="text-red-600 text-xs whitespace-pre-line">{error}</p>
              </div>
            )}

        <div className="mt-1">
          <label htmlFor="parentPin" className="block text-xs text-gray-500 mt-2 mb-1">
            부모 PIN <span className="text-red-500">*</span>
                </label>
          <div className="flex gap-2">
                  {parentPin.map((digit, index) => (
                    <input
                      key={index}
                      type="password"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => {
                        const value = e.target.value;
                  if (value && !/^\d$/.test(value)) return;
                        const newPin = [...parentPin];
                        newPin[index] = value;
                        setParentPin(newPin);
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
                className="w-12 h-12 rounded-lg border border-gray-200 text-center text-base focus:border-purple-500 focus:ring-1 focus:ring-purple-100 transition disabled:bg-gray-50 disabled:cursor-not-allowed"
                      autoComplete="off"
                    />
                  ))}
                </div>
          <p className="text-[10px] text-gray-400 mt-1.5">부모 전용 기능 보호용 4자리</p>
            </div>

        <div className="mt-1">
          <p className="text-[10px] text-gray-400 text-center mt-2">
            회원가입 시{' '}
                <button
                  type="button"
              onClick={() => window.open(PRIVACY_POLICY_URL, '_blank', 'noopener,noreferrer')}
              className="text-purple-500 underline"
                >
                  개인정보처리방침
                </button>
            {' · '}
                <button
                  type="button"
              onClick={() => window.open(TERMS_OF_SERVICE_URL, '_blank', 'noopener,noreferrer')}
              className="text-purple-500 underline"
                >
              이용약관
                </button>
            에 동의합니다.
          </p>
            </div>

        <div className="mt-auto pt-2">
            <button
              type="submit"
              disabled={loading}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-500 text-white rounded-xl py-3.5 font-semibold shadow-md active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            >
            {loading ? '가입 중...' : '가입하기'}
            </button>
          <p className="text-xs text-center mt-2 text-gray-400">
                이미 계정이 있으신가요?{' '}
            <Link to="/login" className="text-purple-600 font-medium ml-1">로그인</Link>
              </p>
            </div>
          </form>
      </main>
    </div>
  );
};

export default Signup;


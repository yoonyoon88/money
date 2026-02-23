import React, { useState, useRef, useEffect } from 'react';
import { reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { useApp } from '../context/AppContext';

interface PinResetModalProps {
  isOpen: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

type Step = 'password' | 'newPin' | 'confirmPin';

/**
 * PIN 재설정 모달 컴포넌트
 * 
 * 플로우:
 * 1. 부모 계정 비밀번호 재입력 (reauthenticate)
 * 2. 새 PIN 입력 (4자리)
 * 3. PIN 확인 (4자리)
 * 4. Firestore에 parentPin 업데이트
 */
const PinResetModal: React.FC<PinResetModalProps> = ({
  isOpen,
  onSuccess,
  onCancel,
}) => {
  const { user } = useApp();
  const [step, setStep] = useState<Step>('password');
  const [password, setPassword] = useState('');
  const [newPin, setNewPin] = useState<string[]>(['', '', '', '']);
  const [confirmPin, setConfirmPin] = useState<string[]>(['', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const pinInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const confirmPinInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 모달이 열릴 때 상태 초기화
  useEffect(() => {
    if (isOpen) {
      setStep('password');
      setPassword('');
      setNewPin(['', '', '', '']);
      setConfirmPin(['', '', '', '']);
      setError(null);
      setLoading(false);
      setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // 비밀번호 인증
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const currentUser = auth.currentUser;
    const userEmail = currentUser?.email || user?.email;

    if (!currentUser || !userEmail) {
      setError('로그인 정보를 찾을 수 없습니다.');
      setLoading(false);
      return;
    }

    try {
      // Firebase 재인증
      const credential = EmailAuthProvider.credential(userEmail, password);
      await reauthenticateWithCredential(currentUser, credential);
      
      // 인증 성공 시 새 PIN 입력 단계로 이동
      setStep('newPin');
      setPassword('');
      setLoading(false);
      setTimeout(() => {
        pinInputRefs.current[0]?.focus();
      }, 100);
    } catch (err: any) {
      setError(err.message || '비밀번호가 올바르지 않습니다.');
      setLoading(false);
      setPassword('');
    }
  };

  // 새 PIN 입력 핸들러
  const handleNewPinChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) {
      return;
    }

    const newPinArray = [...newPin];
    newPinArray[index] = value;
    setNewPin(newPinArray);
    setError(null);

    if (value && index < 3) {
      pinInputRefs.current[index + 1]?.focus();
    }

    // 4자리 모두 입력되면 확인 단계로 이동
    if (newPinArray.every(digit => digit !== '') && newPinArray.join('').length === 4) {
      setStep('confirmPin');
      setTimeout(() => {
        confirmPinInputRefs.current[0]?.focus();
      }, 100);
    }
  };

  // PIN 확인 입력 핸들러
  const handleConfirmPinChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) {
      return;
    }

    const confirmPinArray = [...confirmPin];
    confirmPinArray[index] = value;
    setConfirmPin(confirmPinArray);
    setError(null);

    if (value && index < 3) {
      confirmPinInputRefs.current[index + 1]?.focus();
    }

    // 4자리 모두 입력되면 자동으로 검증 및 저장
    if (confirmPinArray.every(digit => digit !== '') && confirmPinArray.join('').length === 4) {
      handlePinSave(confirmPinArray.join(''));
    }
  };

  // PIN 저장
  const handlePinSave = async (confirmedPin: string) => {
    const newPinString = newPin.join('');
    
    // PIN 일치 확인
    if (newPinString !== confirmedPin) {
      setError('PIN이 일치하지 않습니다.');
      setConfirmPin(['', '', '', '']);
      setTimeout(() => {
        confirmPinInputRefs.current[0]?.focus();
      }, 100);
      return;
    }

    if (!user || !db) {
      setError('사용자 정보를 찾을 수 없습니다.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Firestore에 parentPin 업데이트
      const userDocRef = doc(db, 'users', user.id);
      await updateDoc(userDocRef, {
        parentPin: newPinString,
        updatedAt: serverTimestamp(),
      });

      // 성공 시 콜백 호출
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'PIN 재설정에 실패했습니다.');
      setLoading(false);
    }
  };

  // 백스페이스 처리
  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  ) => {
    if (e.key === 'Backspace' && !(step === 'newPin' ? newPin : confirmPin)[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  // 모달이 열려있지 않으면 렌더링하지 않음
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-5 bg-black bg-opacity-50"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 닫기 버튼 */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="닫기"
          disabled={loading}
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* 헤더 */}
        <div className="flex flex-col items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            {step === 'password' && '비밀번호 확인'}
            {step === 'newPin' && '새 PIN 입력'}
            {step === 'confirmPin' && 'PIN 확인'}
          </h2>
          <p className="text-gray-600 text-sm text-center">
            {step === 'password' && '보안을 위해 계정 비밀번호를 입력해 주세요'}
            {step === 'newPin' && '새로운 PIN 4자리를 입력해주세요'}
            {step === 'confirmPin' && 'PIN을 다시 한 번 입력해주세요'}
          </p>
        </div>

        <div className="space-y-4">
          {/* Step 1: 비밀번호 입력 */}
          {step === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  비밀번호
                </label>
                <input
                  ref={passwordInputRef}
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  required
                  disabled={loading}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  placeholder="비밀번호를 입력하세요"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-red-600 text-sm text-center font-medium">{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={loading || !password}
                  className="flex-1 py-3 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {loading ? '확인 중...' : '다음'}
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={loading}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors disabled:bg-gray-200 disabled:cursor-not-allowed"
                >
                  취소
                </button>
              </div>
            </form>
          )}

          {/* Step 2: 새 PIN 입력 */}
          {step === 'newPin' && (
            <div className="space-y-4">
              <div className="flex justify-center gap-3">
                {newPin.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (pinInputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleNewPinChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e, pinInputRefs)}
                    className="w-16 h-16 text-center text-2xl font-bold border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  />
                ))}
              </div>

              <button
                onClick={onCancel}
                className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
            </div>
          )}

          {/* Step 3: PIN 확인 */}
          {step === 'confirmPin' && (
            <div className="space-y-4">
              <div className="flex justify-center gap-3">
                {confirmPin.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (confirmPinInputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleConfirmPinChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e, confirmPinInputRefs)}
                    className={`w-16 h-16 text-center text-2xl font-bold border-2 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors ${
                      error
                        ? 'border-red-300 bg-red-50'
                        : 'border-gray-300'
                    }`}
                  />
                ))}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-red-600 text-sm text-center font-medium">{error}</p>
                </div>
              )}

              {loading && (
                <div className="text-center py-2">
                  <p className="text-gray-600 text-sm">PIN을 저장하는 중...</p>
                </div>
              )}

              <button
                onClick={onCancel}
                disabled={loading}
                className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors disabled:bg-gray-200 disabled:cursor-not-allowed"
              >
                취소
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PinResetModal;


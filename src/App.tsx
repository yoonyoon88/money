import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { useBackHandler } from './hooks/useBackHandler';
import AppLayout from './layouts/AppLayout';
import Home from './components/Home';
import ChildHome from './components/ChildHome';
import ParentDashboard from './components/ParentDashboard';
import ParentLayout from './components/ParentLayout';
import ParentReport from './components/ParentReport';
import ParentSettings from './components/ParentSettings';
import ChildManagement from './components/ChildManagement';
import RoleSelection from './components/RoleSelection';
import ParentRouteGuard from './components/ParentRouteGuard';
import MissionDetail from './components/MissionDetail';
import ChildMissionDetail from './components/ChildMissionDetail';
import Approval from './components/Approval';
import PointHistoryPage from './components/PointHistory';
import Login from './pages/Login';
import Signup from './pages/Signup';
import OnboardingScreen from './pages/OnboardingScreen';
import AddChild from './pages/AddChild';
import ChildSelectPage from './pages/ChildSelectPage';
import Settings from './pages/Settings';
import PolicyWebView from './pages/PolicyWebView';
import ChildrenManagement from './pages/ChildrenManagement';
import SubscribePage from './pages/SubscribePage';
import SupportDeveloperPage from './pages/SupportDeveloperPage';
import SupportThankYouPage from './pages/SupportThankYouPage';
import { initBilling } from './services/billingService';

// 역할 선택 화면 가드: 이미 역할이 선택되었으면 적절한 화면으로 리다이렉트
const RoleSelectionGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { hasSelectedRole, deviceRole, user } = useApp();

  // 방어적 체크: user가 없으면 children 렌더링 (ProtectedRoute에서 이미 처리되지만 안전을 위해)
  if (!user) {
    return <>{children}</>;
  }

  // 역할이 이미 선택되었으면 적절한 화면으로 리다이렉트
  if (hasSelectedRole && deviceRole) {
    if (deviceRole === 'PARENT') {
      return <Navigate to="/parent" replace />;
    } else if (deviceRole === 'CHILD') {
      const defaultChildId = localStorage.getItem('defaultChildId');
      
      // user.role에 따라 분기 처리 (방어적 체크)
      if (user.role === 'PARENT' && user.childrenIds && user.childrenIds.length > 0) {
        const firstChildId = defaultChildId || user.childrenIds[0];
        return <Navigate to={`/child/${firstChildId}`} replace />;
      } else if (user.role === 'CHILD') {
        return <Navigate to={`/child/${user.id}`} replace />;
      }
      // user.role이 'PARENT'이지만 childrenIds가 없는 경우는 children 렌더링
    }
  }

  return <>{children}</>;
};

// 로그인 후 최초 진입 화면: 기기 역할에 따라 자동 진입
const HomeRouter: React.FC = () => {
  const { user, deviceRole, hasSelectedRole } = useApp();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 역할이 선택되지 않았으면 역할 선택 화면으로 이동
  if (!hasSelectedRole) {
    return <Navigate to="/role-select" replace />;
  }

  // 기기 역할에 따라 적절한 화면으로 이동
  if (deviceRole === 'PARENT') {
    // 보호자 기기: 보호자 홈으로 이동
    return <Navigate to="/parent" replace />;
  } else if (deviceRole === 'CHILD') {
    // 아이 기기: 기본 자녀 선택 또는 첫 번째 자녀로 이동
    const defaultChildId = localStorage.getItem('defaultChildId');
    if (user.role === 'PARENT' && user.childrenIds && user.childrenIds.length > 0) {
      // 부모 계정이지만 아이 기기로 설정한 경우: 첫 번째 자녀로 이동
      const firstChildId = defaultChildId || user.childrenIds[0];
      return <Navigate to={`/child/${firstChildId}`} replace />;
    } else if (user.role === 'CHILD') {
      // 아이 계정인 경우: 자신의 화면으로 이동
      return <Navigate to={`/child/${user.id}`} replace />;
    } else {
      // 자녀가 없는 경우: 보호자 홈으로 이동 (임시)
      return <Navigate to="/parent" replace />;
    }
  }

  // 역할이 null인 경우 역할 선택 화면으로 이동
  return <Navigate to="/role-select" replace />;
};

// 인증 보호 라우트
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useApp();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFEF9] flex items-center justify-center">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// 로그인 화면 라우트 (이미 로그인된 경우 자동 리디렉션)
const LoginRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, isAuthChecked, isAuthLoading } = useApp();

  // 인증 상태 확인 중이면 로딩 UI 표시
  if (loading || !isAuthChecked || isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#FFFEF9] flex items-center justify-center">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    );
  }

  // 이미 로그인되어 있으면 역할 선택 페이지로 자동 리디렉션
  if (user) {
    console.log('[LoginRoute] 이미 로그인된 사용자 감지, 역할 선택 페이지로 리디렉션');
    return <Navigate to="/role-select" replace />;
  }

  return <>{children}</>;
};

// 인증 상태 확인 중 Splash 화면
const AuthLoadingScreen: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#FFFEF9] flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4">
          <div className="w-full h-full border-4 border-green-200 border-t-green-600 rounded-full animate-spin"></div>
        </div>
        <p className="text-gray-500 text-sm">로딩 중...</p>
      </div>
    </div>
  );
};

// App 내부 컴포넌트: 인증 상태 확인 후 라우터 렌더링
const AppRoutes: React.FC = () => {
  const { loading, isAuthChecked, authLoading } = useApp();

  // Google Play Billing 초기화 (콘솔 로그 없이 조용히 실행)
  useEffect(() => {
    initBilling();
  }, []);

  // 안드로이드 뒤로가기 버튼 처리 (앱 전체에서 1회만 등록)
  useBackHandler();

  // 인증 상태 확인 중이거나 Firestore 사용자 데이터 로딩 중에는 Splash 화면 표시
  // authLoading이 false가 되기 전까지는 어떤 화면도 렌더하지 않음 (플리커 방지)
  if (loading || !isAuthChecked || authLoading) {
    return <AuthLoadingScreen />;
  }

  return (
    <AppLayout>
      <Routes>
          <Route 
            path="/login" 
            element={
              <LoginRoute>
                <Login />
              </LoginRoute>
            } 
          />
          <Route path="/signup" element={<Signup />} />
          <Route path="/onboarding" element={<OnboardingScreen />} />
          <Route path="/policy" element={<PolicyWebView />} />
          <Route
            path="/role-select"
            element={
              <ProtectedRoute>
                <RoleSelectionGuard>
                  <RoleSelection />
                </RoleSelectionGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/parent"
            element={
              <ProtectedRoute>
                <ParentRouteGuard>
                  <ParentLayout />
                </ParentRouteGuard>
              </ProtectedRoute>
            }
          >
            <Route index element={<ParentDashboard />} />
            <Route path="report" element={<ParentReport />} />
            <Route path="settings" element={<ParentSettings />} />
            <Route path="subscription" element={<SubscribePage />} />
            <Route path="support" element={<SupportDeveloperPage />} />
            <Route path="support/thanks" element={<SupportThankYouPage />} />
          </Route>
          <Route
            path="/parent/child/:childId"
            element={
              <ProtectedRoute>
                <ParentRouteGuard>
                  <ChildManagement />
                </ParentRouteGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/add-child"
            element={
              <ProtectedRoute>
                <ParentRouteGuard>
                  <AddChild />
                </ParentRouteGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/parent/children"
            element={
              <ProtectedRoute>
                <ParentRouteGuard>
                  <ChildrenManagement />
                </ParentRouteGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/select-child"
            element={
              <ProtectedRoute>
                <ChildSelectPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/child/:childId"
            element={
              <ProtectedRoute>
                <ChildHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <HomeRouter />
              </ProtectedRoute>
            }
          />
          <Route
            path="/mission/:id"
            element={
              <ProtectedRoute>
                <MissionDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/child-mission/:id"
            element={
              <ProtectedRoute>
                <ChildMissionDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/approval"
            element={
              <ProtectedRoute>
                <ParentRouteGuard>
                  <Approval />
                </ParentRouteGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <ParentRouteGuard>
                  <Settings />
                </ParentRouteGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/points/history"
            element={
              <ProtectedRoute>
                <PointHistoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/support-developer"
            element={
              <ProtectedRoute>
                <ParentRouteGuard>
                  <SupportDeveloperPage />
                </ParentRouteGuard>
              </ProtectedRoute>
            }
          />
      </Routes>
    </AppLayout>
  );
};

function App() {
  return (
    <AppProvider>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AppRoutes />
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;

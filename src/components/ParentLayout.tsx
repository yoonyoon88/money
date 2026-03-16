import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';

const ParentLayout: React.FC = () => {
  return (
    <div className="mx-auto flex min-h-screen w-full flex-col bg-[#F9FAFB]">
      <main className="flex-1 overflow-y-auto pb-[96px]">
        <Outlet />
      </main>

      <nav
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] bg-white border-t border-gray-200 flex justify-around items-center px-6 pt-2 pb-3"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
        }}
      >
        <NavLink
            to="/parent"
            end
            className={({ isActive }) =>
              `flex flex-col items-center text-xs ${
                isActive ? 'font-semibold text-blue-600' : 'text-gray-400'
              }`
            }
          >
            <span className="mb-0.5">🏠</span>
            홈
          </NavLink>
          <NavLink
            to="/parent/report"
            className={({ isActive }) =>
              `flex flex-col items-center text-xs ${
                isActive ? 'font-semibold text-blue-600' : 'text-gray-400'
              }`
            }
          >
            <span className="mb-0.5">📊</span>
            리포트
          </NavLink>
          <NavLink
            to="/parent/settings"
            className={({ isActive }) =>
              `flex flex-col items-center text-xs ${
                isActive ? 'font-semibold text-blue-600' : 'text-gray-400'
              }`
            }
          >
            <span className="mb-0.5">⚙</span>
            설정
          </NavLink>
      </nav>
    </div>
  );
};

export default ParentLayout;

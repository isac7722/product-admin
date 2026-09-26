import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  Link,
  NavLink,
  Outlet,
  RouterProvider,
  ScrollRestoration,
  useLocation,
} from "react-router-dom";
import {
  Products,
  ProductEditor,
  ProductLayout,
  EditProduct,
  Rates,
} from "./products";
import { GroupPage } from "./groups";
import { CatalogLayout, VariantDetails } from "./catalog";
import { Files } from "./files";
import { Imports, ImportDetail } from "./imports";
import { NavigationGuard } from "./navigation";
import { api } from "./api";
import "./style.css";
import { SizeSettingsPage } from "./sizes";
import { Icon, type IconName } from "./icons";

function Shell() {
  const [menu, setMenu] = useState(false);
  const [connected, setConnected] = useState(false);
  const location = useLocation();
  useEffect(() => {
    void api("/health")
      .then(() => setConnected(true))
      .catch(() => setConnected(false));
  }, []);
  useEffect(() => {
    setMenu(false);
    requestAnimationFrame(() =>
      document.querySelector<HTMLHeadingElement>("h1")?.focus(),
    );
  }, [location.pathname]);
  return (
    <div className="app">
      <a className="skip" href="#content">
        본문으로 이동
      </a>
      <header className="mobile-header">
        <button
          aria-label="메뉴 열기"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          <Icon name="menu" />
        </button>
        <strong>제품 관리</strong>
      </header>
      {menu && (
        <button
          className="menu-overlay"
          aria-label="메뉴 닫기"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <Link className="brand" to="/products">
          <span className="brand-icon" aria-hidden>
            <Icon name="blanket" size={23} />
          </span>
          <span>
            제품 관리<small>PRODUCT ADMIN</small>
          </span>
        </Link>
        <p className="nav-label">워크스페이스</p>
        <nav aria-label="주 메뉴">
          {[
            ["/products", "blanket", "제품"],
            ["/files", "images", "컬러칩"],
            ["/rates", "rates", "자재·공임 단가"],
            ["/imports", "upload", "엑셀 가져오기"],
          ].map(([path, icon, label]) => (
            <NavLink
              key={path}
              to={path}
              className={
                path === "/products" &&
                location.pathname.startsWith("/catalog/")
                  ? "active"
                  : undefined
              }
            >
              <Icon name={icon as IconName} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <nav aria-label="관리 메뉴">
            <NavLink
              to="/settings/sizes"
              className={
                location.pathname.startsWith("/settings/")
                  ? "active"
                  : undefined
              }
            >
              <Icon name="settings" />
              설정
            </NavLink>
          </nav>
          <div className="connection-status">
            <span className={`connection ${connected ? "connected" : ""}`} />
            {connected ? "로컬 서버 연결됨" : "서버 연결 확인 필요"}
          </div>
        </div>
      </aside>
      <main id="content" className="content">
        <div className="workspace-bar">
          <span>
            워크스페이스 <Icon name="next" size={13} /> 제품 관리
          </span>
          <span>개인 공간</span>
        </div>
        <NavigationGuard>
          <Outlet />
          <ScrollRestoration
            getKey={(location) => location.pathname + location.search}
          />
        </NavigationGuard>
      </main>
    </div>
  );
}
const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: "/", element: <Products /> },
      { path: "/products", element: <Products /> },
      { path: "/products/new", element: <ProductEditor /> },
      {
        path: "/catalog/:id",
        element: <CatalogLayout />,
        children: [
          { index: true, element: <VariantDetails /> },
          { path: "edit", element: <EditProduct /> },
        ],
      },
      {
        path: "/products/:id/*",
        element: <ProductLayout />,
      },
      { path: "/groups/:id", element: <GroupPage /> },
      { path: "/groups/:id/sales", element: <GroupPage sales /> },
      { path: "/rates", element: <Rates /> },
      { path: "/files", element: <Files /> },
      { path: "/imports", element: <Imports /> },
      { path: "/imports/:id", element: <ImportDetail /> },
      { path: "/settings/sizes", element: <SizeSettingsPage /> },
      {
        path: "/settings/dimensions",
        element: <SizeSettingsPage kind="dimensions" />,
      },
      {
        path: "*",
        element: (
          <section className="panel">
            <h1>페이지를 찾을 수 없습니다</h1>
            <Link to="/products">제품 목록으로 이동</Link>
          </section>
        ),
      },
    ],
  },
]);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

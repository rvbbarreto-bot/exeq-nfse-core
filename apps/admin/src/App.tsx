import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { isAuthenticated } from "./lib/auth.js";
import { ChannelPage } from "./pages/ChannelPage.js";
import { CatalogDetailPage } from "./pages/CatalogDetailPage.js";
import { CatalogsPage } from "./pages/CatalogsPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { ChargeDetailPage } from "./pages/ChargeDetailPage.js";
import { ChargesPage } from "./pages/ChargesPage.js";
import { IssueDetailPage } from "./pages/IssueDetailPage.js";
import { IssuesPage } from "./pages/IssuesPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { MasterDataPage } from "./pages/MasterDataPage.js";
import { WebhookDetailPage } from "./pages/WebhookDetailPage.js";
import { WebhooksPage } from "./pages/WebhooksPage.js";

const qc = new QueryClient();

function PrivateRoute({ children }: { children: ReactNode }) {
  return isAuthenticated() ? children : <Navigate to="/login" replace />;
}

export function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <DashboardPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/issues"
            element={
              <PrivateRoute>
                <IssuesPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/issues/:id"
            element={
              <PrivateRoute>
                <IssueDetailPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/charges"
            element={
              <PrivateRoute>
                <ChargesPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/charges/:id"
            element={
              <PrivateRoute>
                <ChargeDetailPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/webhooks"
            element={
              <PrivateRoute>
                <WebhooksPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/webhooks/:id"
            element={
              <PrivateRoute>
                <WebhookDetailPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/channel"
            element={
              <PrivateRoute>
                <ChannelPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/catalogs"
            element={
              <PrivateRoute>
                <CatalogsPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/catalogs/:id"
            element={
              <PrivateRoute>
                <CatalogDetailPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/master-data"
            element={
              <PrivateRoute>
                <MasterDataPage />
              </PrivateRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

import { Routes, Route, Outlet, Navigate } from "react-router-dom";

import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { ProtectedRoute } from "@/components/routing/ProtectedRoute";
import { Landing } from "@/pages/Landing";
import { Login } from "@/pages/auth/Login";
import { Directory } from "@/pages/Directory";
import { BusinessProfile } from "@/pages/BusinessProfile";
import { CardTap } from "@/pages/CardTap";
import { Register } from "@/pages/auth/Register";
import { VerifyClaimLink } from "@/pages/auth/VerifyClaimLink";
import { AppLayout } from "@/pages/app/AppLayout";
import { Dashboard } from "@/pages/app/Dashboard";
import { Profile } from "@/pages/app/Profile";
import { Vouches } from "@/pages/app/Vouches";
import { Network } from "@/pages/app/Network";
import { AppDirectory } from "@/pages/app/AppDirectory";
import { Verify } from "@/pages/app/Verify";
import { Introductions } from "@/pages/app/Introductions";
import { Card } from "@/pages/app/Card";
import { AdminReview } from "@/pages/admin/AdminReview";
import { AdminVouchReviews } from "@/pages/admin/AdminVouchReviews";

function PublicLayout() {
  return (
    <>
      <NavBar />
      <Outlet />
      <Footer />
    </>
  );
}

function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/directory" element={<Directory />} />
          <Route path="/business/:id" element={<BusinessProfile />} />
          <Route path="/m/:businessId" element={<CardTap />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-claim/:token" element={<VerifyClaimLink />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="profile" element={<Profile />} />
            <Route path="vouches" element={<Vouches />} />
            <Route path="network" element={<Network />} />
            <Route path="directory" element={<AppDirectory />} />
            <Route path="business/:id" element={<BusinessProfile inApp />} />
            <Route path="verify" element={<Verify />} />
            <Route path="introductions" element={<Introductions />} />
            <Route path="card" element={<Card />} />
            <Route path="admin" element={<AdminReview />} />
            <Route path="admin/vouch-reviews" element={<AdminVouchReviews />} />
          </Route>
        </Route>
        <Route path="/admin" element={<Navigate to="/app/admin" replace />} />
      </Routes>
    </>
  );
}

export default App;

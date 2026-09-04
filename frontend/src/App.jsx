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
import { NetworkRequests } from "@/pages/app/network/NetworkRequests";
import { NetworkConnections } from "@/pages/app/network/NetworkConnections";
import { AppDirectory } from "@/pages/app/AppDirectory";
import { Verify } from "@/pages/app/Verify";
import { Plan } from "@/pages/app/Plan";
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
            {/* Network is a section, not a page — the sidebar expands to
                its three children and there is no combined view. Bare
                /app/network lands on Connections, which is what a member
                means by "my network"; the redirect also keeps every old link
                and bookmark working. */}
            <Route path="network" element={<Navigate to="/app/network/connections" replace />} />
            <Route path="network/requests" element={<NetworkRequests />} />
            <Route path="network/connections" element={<NetworkConnections />} />
            <Route path="directory" element={<AppDirectory />} />
            <Route path="business/:id" element={<BusinessProfile inApp />} />
            <Route path="verify" element={<Verify />} />
            <Route path="plan" element={<Plan />} />
            {/* /app/levels was one page explaining all three axes at once.
                It was split: verification kept this page, the vouch ladder
                moved onto /app/vouches where you can act on it, and the tier
                table became /app/plan. The "what does this mark mean" half of
                its job went to components/badge/BadgeExplainer.jsx instead,
                because that question gets asked in front of somebody else's
                badge, where no page can reach it.

                Verification gets the redirect because it is what the page was
                originally FOR — /app/verify was its route until the other two
                axes were bolted on. Deep links carrying #vouch or #membership
                lose their hash here; every internal link was repointed, so
                this only catches a member's own old bookmarks. */}
            <Route path="levels" element={<Navigate to="/app/verify" replace />} />
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

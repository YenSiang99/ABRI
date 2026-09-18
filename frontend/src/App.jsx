import { Routes, Route, Outlet, Navigate } from "react-router-dom";

import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { ProtectedRoute } from "@/components/routing/ProtectedRoute";
import { Landing } from "@/pages/Landing";
import { Login } from "@/pages/auth/Login";
import { Directory } from "@/pages/Directory";
import { BusinessProfile } from "@/pages/BusinessProfile";
import { CheckBusiness } from "@/pages/CheckBusiness";
import { CardTap } from "@/pages/CardTap";
import { Register } from "@/pages/auth/Register";
import { VerifyClaimLink } from "@/pages/auth/VerifyClaimLink";
import { AppLayout } from "@/pages/app/AppLayout";
import { Dashboard } from "@/pages/app/Dashboard";
import { Profile } from "@/pages/app/Profile";
import { Vouches } from "@/pages/app/Vouches";
import { NetworkRequests } from "@/pages/app/network/NetworkRequests";
import { NetworkConnections } from "@/pages/app/network/NetworkConnections";
import { NetworkFollowing } from "@/pages/app/network/NetworkFollowing";
import { AppDirectory } from "@/pages/app/AppDirectory";
import { Feed } from "@/pages/app/feed/Feed";
import { CheckHistory } from "@/pages/app/CheckHistory";
import { Inbox } from "@/pages/app/Inbox";
import { AsksBoard } from "@/pages/app/asks/AsksBoard";
import { AskDetail } from "@/pages/app/asks/AskDetail";
import { RedirectAskToRequest } from "@/pages/app/asks/RedirectAskToRequest";
import { ProjectsBoard } from "@/pages/app/projects/ProjectsBoard";
import { ProjectDetail } from "@/pages/app/projects/ProjectDetail";
import { Verify } from "@/pages/app/Verify";
import { Plan } from "@/pages/app/Plan";
import { Card } from "@/pages/app/Card";
import { AdminReview } from "@/pages/admin/AdminReview";
import { AdminVouchReviews } from "@/pages/admin/AdminVouchReviews";
import { AdminSsmReviews } from "@/pages/admin/AdminSsmReviews";
import { AdminAskReviews } from "@/pages/admin/AdminAskReviews";

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
          {/* Public, and that is the feature. The invite this screen produces
              is an unsolicited message with a link in it — the shape of a
              scam — so the recipient has to be able to check the sender
              without creating an account first. See
              backend/src/routes/businesses.js's /lookup handler. */}
          <Route path="/check" element={<CheckBusiness />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-claim/:token" element={<VerifyClaimLink />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="inbox" element={<Inbox />} />
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
            <Route path="network/following" element={<NetworkFollowing />} />
            {/* The network's trust activity. No :id child and no public
                counterpart — a logged-out firehose of who-vouched-for-whom is
                a scrape of the trust graph, which is the asset the product
                sells. See backend/src/routes/feed.js. */}
            <Route path="feed" element={<Feed />} />
            {/* No public counterpart. A request states commercial intent with
                a named business behind it; readable without a session, the
                board is a scraping surface rather than a listing.

                RENAMED FROM /app/asks in Sept 2026 — the product calls these
                Requests and Offers now. The old paths stay as redirects rather
                than being deleted, the same way /app/check and /app/levels did:
                bookmarks and every activity-event destination written before
                the rename still land. */}
            <Route path="requests" element={<AsksBoard />} />
            <Route path="requests/:id" element={<AskDetail />} />
            <Route path="asks" element={<Navigate to="/app/requests" replace />} />
            <Route path="asks/:id" element={<RedirectAskToRequest />} />
            {/* Siblings, not nested — this router has no nested groups, and
              ProjectDetail renders standalone with its own back link, exactly
              as AskDetail does.

              No public counterpart, and for a stronger reason than the asks
              board has: a project's thread is private to the businesses in it
              under every visibility setting. What IS public — a completed
              public project's title, dates and participants — is published on
              the profiles themselves, which is where somebody looking a
              business up is already standing. */}
            <Route path="projects" element={<ProjectsBoard />} />
            <Route path="projects/:id" element={<ProjectDetail />} />
            <Route path="directory" element={<AppDirectory />} />
            {/* /app/check was the in-app twin of the public check-a-business
                screen. It went when the directory learned to match
                registration numbers and domains — two search boxes for one
                member, with nothing to say which to use. Redirected rather
                than dropped: the route was live, so it is in histories and
                bookmarks, and an unknown /app/* path renders an empty shell
                rather than a 404. Same treatment /app/levels got. */}
            <Route path="check" element={<Navigate to="/app/directory" replace />} />
            <Route path="checks" element={<CheckHistory />} />
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
            <Route path="admin/ask-reviews" element={<AdminAskReviews />} />
            <Route path="admin/ssm-reviews" element={<AdminSsmReviews />} />
          </Route>
        </Route>
        <Route path="/admin" element={<Navigate to="/app/admin" replace />} />
      </Routes>
    </>
  );
}

export default App;

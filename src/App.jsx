import { Routes, Route, Outlet } from "react-router-dom";

import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { ProtectedRoute } from "@/components/routing/ProtectedRoute";
import { Landing } from "@/pages/Landing";
import { Login } from "@/pages/Login";
import { Directory } from "@/pages/Directory";
import { BusinessProfile } from "@/pages/BusinessProfile";
import { Register } from "@/pages/Register";
import { AppLayout } from "@/pages/app/AppLayout";
import { Dashboard } from "@/pages/app/Dashboard";
import { Profile } from "@/pages/app/Profile";
import { Vouches } from "@/pages/app/Vouches";
import { Network } from "@/pages/app/Network";
import { Verify } from "@/pages/app/Verify";
import { Introductions } from "@/pages/app/Introductions";
import { Card } from "@/pages/app/Card";
import { AdminReview } from "@/pages/admin/AdminReview";

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
          <Route path="/register" element={<Register />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="profile" element={<Profile />} />
            <Route path="vouches" element={<Vouches />} />
            <Route path="network" element={<Network />} />
            <Route path="verify" element={<Verify />} />
            <Route path="introductions" element={<Introductions />} />
            <Route path="card" element={<Card />} />
          </Route>
        </Route>
        <Route path="/admin" element={<AdminReview />} />
      </Routes>
    </>
  );
}

export default App;

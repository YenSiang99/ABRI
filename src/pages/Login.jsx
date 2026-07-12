import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

const fieldClass =
  "w-full rounded-sm border border-grey-300 px-3.5 py-2.5 text-sm text-ink outline-none focus:border-ink";
const labelClass = "text-[13px] font-bold text-ink";

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Enter your email and password to continue.");
      return;
    }
    setError("");
    navigate("/app");
  }

  return (
    <div className="mx-auto max-w-[420px] px-6 py-24">
      <div className="rounded-lg border border-grey-200 bg-white p-8">
        <span className="text-[11px] font-bold tracking-[0.14em] text-grey-500 uppercase">
          Member login
        </span>
        <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-ink">
          Welcome back
        </h1>
        <p className="mt-2 text-[14px] text-grey-600">
          Log in to manage your verified profile, vouches, and network.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className={cn(fieldClass, "mt-1.5")}
              autoFocus
            />
          </div>

          <div>
            <label className={labelClass}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={cn(fieldClass, "mt-1.5")}
            />
          </div>

          {error && <p className="text-[12.5px] text-red-600">{error}</p>}

          <button
            type="submit"
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-sm border border-transparent bg-yellow px-5 py-2.5 text-[14px] font-bold text-yellow-ink transition-all hover:-translate-y-px hover:bg-yellow-hi hover:shadow-md"
          >
            Log in
          </button>
        </form>

        <p className="mt-6 text-center text-[13.5px] text-grey-500">
          Not verified yet?{" "}
          <Link to="/register" className="font-bold text-ink hover:underline">
            Claim your business
          </Link>
        </p>
      </div>
    </div>
  );
}

export { Login };

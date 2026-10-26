import logo from "@/assets/home/logo.png";
import logoWhite from "@/assets/home/logo-white.png";
import { cn } from "@/lib/utils";

// The ABRI logo (mark over the wordmark). Its lettering is black, so dark mode
// swaps in the white-lettered version.
function AbriLogo({ className }) {
  return (
    <>
      <img src={logo} alt="ABRI" className={cn("w-auto dark:hidden", className)} />
      <img src={logoWhite} alt="ABRI" className={cn("hidden w-auto dark:block", className)} />
    </>
  );
}

export { AbriLogo };

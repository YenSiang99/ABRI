import logo from "@/assets/home/logo.png";
import logoWhite from "@/assets/home/logo-white.png";
import { cn } from "@/lib/utils";

// The ABRI logo (mark over the wordmark). Light mode shows the original: yellow
// A, black check, black lettering. Dark mode swaps in the designer's dark
// version, with the check and lettering in white.
function AbriLogo({ className }) {
  return (
    <>
      <img src={logo} alt="ABRI" className={cn("w-auto dark:hidden", className)} />
      <img src={logoWhite} alt="ABRI" className={cn("hidden w-auto dark:block", className)} />
    </>
  );
}

export { AbriLogo };

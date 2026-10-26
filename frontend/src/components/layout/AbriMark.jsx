import mark from "@/assets/home/mark.png";
import markWhite from "@/assets/home/mark-white.png";
import { cn } from "@/lib/utils";

// The ABRI mark alone (the A with the check), for spaces too small for the full
// logo. Follows AbriLogo: black check in light mode, the designer's white check
// in dark mode — unless `onLight` pins the black check for a mark that always
// sits on a light tile.
function AbriMark({ className, onLight = false }) {
  if (onLight) return <img src={mark} alt="ABRI" className={cn("w-auto", className)} />;
  return (
    <>
      <img src={mark} alt="ABRI" className={cn("w-auto dark:hidden", className)} />
      <img src={markWhite} alt="ABRI" className={cn("hidden w-auto dark:block", className)} />
    </>
  );
}

export { AbriMark };

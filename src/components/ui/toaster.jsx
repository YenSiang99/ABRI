import { Toast } from "@base-ui/react/toast";
import { CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toastManager } from "@/lib/toast";

function ToastList() {
  const { toasts } = Toast.useToastManager();

  return toasts.map((item) => (
    <Toast.Root
      key={item.id}
      toast={item}
      className={cn(
        "[--gap:0.6rem] [--peek:0.6rem] [--scale:calc(max(0,1-(var(--toast-index)*0.08)))] [--shrink:calc(1-var(--scale))] [--height:var(--toast-frontmost-height,var(--toast-height))]",
        "absolute right-0 bottom-0 left-auto z-[calc(1000-var(--toast-index))] w-full origin-bottom rounded-xl border border-border bg-popover text-popover-foreground shadow-md select-none",
        "[transform:translateY(calc(0px-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))]",
        "data-starting-style:[transform:translateY(150%)] data-ending-style:opacity-0 data-ending-style:[transform:translateY(150%)]",
        "h-[var(--height)] [transition:transform_0.35s_cubic-bezier(0.22,1,0.36,1),opacity_0.35s,height_0.15s]",
      )}
    >
      <Toast.Content className="flex h-full items-center gap-3 overflow-hidden p-3.5">
        {item.type === "success" && (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-yellow" />
        )}
        <div className="min-w-0 flex-1">
          <Toast.Title className="text-sm font-semibold" />
          {item.description && (
            <Toast.Description className="mt-0.5 text-xs text-muted-foreground" />
          )}
        </div>
        <Toast.Close className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ));
}

function Toaster() {
  return (
    <Toast.Provider toastManager={toastManager}>
      <Toast.Portal>
        <Toast.Viewport className="fixed right-4 bottom-4 z-100 w-[min(22rem,calc(100vw-2rem))] outline-none">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

export { Toaster };

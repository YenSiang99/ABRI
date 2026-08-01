import { Toast } from "@base-ui/react/toast";

export const toastManager = Toast.createToastManager();

function base(title, options = {}) {
  return toastManager.add({ title, ...options });
}

export const toast = Object.assign(base, {
  success: (title, options = {}) => base(title, { type: "success", ...options }),
  error: (title, options = {}) => base(title, { type: "error", ...options }),
});

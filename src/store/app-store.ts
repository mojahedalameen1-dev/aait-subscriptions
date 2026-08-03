import { create } from "zustand";
export type View =
  | "employee"
  | "dashboard"
  | "subscriptions"
  | "requests"
  | "reports"
  | "roles"
  | "audit";
export type WorkspaceMode = "employee" | "admin";
type AppState = {
  workspace: WorkspaceMode;
  view: View;
  requestOpen: boolean;
  renewalTarget: string | null;
  setWorkspace: (workspace: WorkspaceMode) => void;
  setView: (view: View) => void;
  setRequestOpen: (open: boolean) => void;
  setRenewalTarget: (id: string | null) => void;
};
export const useAppStore = create<AppState>((set) => ({
  workspace: "employee",
  view: "employee",
  requestOpen: false,
  renewalTarget: null,
  setWorkspace: (workspace) => set({ workspace }),
  setView: (view) => set({ view }),
  setRequestOpen: (requestOpen) => set({ requestOpen }),
  setRenewalTarget: (renewalTarget) => set({ renewalTarget }),
}));

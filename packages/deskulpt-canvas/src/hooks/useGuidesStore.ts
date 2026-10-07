import { create } from "zustand";
import type { Guide } from "../utils/snap";

interface GuidesState {
  guides: Guide[];
  setGuides: (guides: Guide[]) => void;
  clearGuides: () => void;
}

export const useGuidesStore = create<GuidesState>((set) => ({
  guides: [],
  setGuides: (guides) => set({ guides }),
  clearGuides: () => set({ guides: [] }),
}));

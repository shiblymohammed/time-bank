import { create } from 'zustand';
import { demoItems, Item } from '../data/items';
type Store = {
  items: Item[];
  saved: string[];
  accepted: string[];
  recent: string[];
  toggleSave: (id: string) => void;
  accept: (id: string) => void;
  publish: (item: Item) => void;
  remember: (query: string) => void;
  toast: string;
  notify: (text: string) => void;
};
export const useStore = create<Store>((set) => ({
  items: demoItems,
  saved: [],
  accepted: [],
  recent: ['Photography', 'Language'],
  toast: '',
  toggleSave: (id) =>
    set((s) => ({
      saved: s.saved.includes(id) ? s.saved.filter((value) => value !== id) : [...s.saved, id],
    })),
  accept: (id) =>
    set((s) => ({ accepted: s.accepted.includes(id) ? s.accepted : [...s.accepted, id] })),
  publish: (item) => set((s) => ({ items: [item, ...s.items] })),
  remember: (query) =>
    set((s) => ({ recent: [query, ...s.recent.filter((value) => value !== query)].slice(0, 5) })),
  notify: (toast) => set({ toast }),
}));


import { create } from 'zustand';

export type LayerType = 'image' | 'text' | 'shape' | 'sticker' | 'drawing';

export interface EditorLayer {
  id: string;
  type: LayerType;
  name: string;
  visible: boolean;
  locked: boolean;
  order: number;
}

interface LayerStore {
  layers: EditorLayer[];
  selectedLayerId: string | null;

  addLayer: (layer: EditorLayer) => void;
  removeLayer: (id: string) => void;
  selectLayer: (id: string | null) => void;
  toggleVisibility: (id: string) => void;
  toggleLock: (id: string) => void;
  renameLayer: (id: string, name: string) => void;
  reorderLayers: (layers: EditorLayer[]) => void;
  clearLayers: () => void;
}

export const useLayerStore = create<LayerStore>((set) => ({
  layers: [],
  selectedLayerId: null,

  addLayer: (layer) =>
    set((state) => ({
      layers: [...state.layers, layer],
    })),

  removeLayer: (id) =>
    set((state) => ({
      layers: state.layers.filter((layer) => layer.id !== id),
      selectedLayerId:
        state.selectedLayerId === id ? null : state.selectedLayerId,
    })),

  selectLayer: (id) => set({ selectedLayerId: id }),

  toggleVisibility: (id) =>
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, visible: !layer.visible } : layer,
      ),
    })),

  toggleLock: (id) =>
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, locked: !layer.locked } : layer,
      ),
    })),

  renameLayer: (id, name) =>
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, name } : layer,
      ),
    })),

  reorderLayers: (layers) => set({ layers }),

  clearLayers: () => set({ layers: [], selectedLayerId: null }),
}));

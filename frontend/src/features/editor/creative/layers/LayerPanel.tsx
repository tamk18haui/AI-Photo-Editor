
import { useState } from 'react';
import { useLayerStore } from '../../store/layerStore';

const layerTypeLabels: Record<string, string> = {
  image: 'Ảnh',
  text: 'Văn bản',
  shape: 'Hình khối',
  sticker: 'Sticker',
  drawing: 'Nét vẽ',
};

export default function LayerPanel() {
  const layers = useLayerStore((state) => state.layers);
  const selectedLayerId = useLayerStore(
    (state) => state.selectedLayerId,
  );
  const selectLayer = useLayerStore((state) => state.selectLayer);
  const toggleVisibility = useLayerStore(
    (state) => state.toggleVisibility,
  );
  const toggleLock = useLayerStore((state) => state.toggleLock);
  const renameLayer = useLayerStore((state) => state.renameLayer);
  const removeLayer = useLayerStore((state) => state.removeLayer);

  const [editingLayerId, setEditingLayerId] = useState<string | null>(
    null,
  );
  const [editingName, setEditingName] = useState('');

  const startRename = (id: string, name: string) => {
    setEditingLayerId(id);
    setEditingName(name);
  };

  const finishRename = () => {
    if (editingLayerId && editingName.trim()) {
      renameLayer(editingLayerId, editingName.trim());
    }

    setEditingLayerId(null);
    setEditingName('');
  };

  return (
    <section className="layer-panel">
      <h3>Quản lý lớp</h3>
      <p>{layers.length} lớp</p>

      {layers.length === 0 ? (
        <p>Chưa có lớp nào. Hãy thêm ảnh, chữ hoặc hình khối.</p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
          }}
        >
          {[...layers]
            .sort((a, b) => b.order - a.order)
            .map((layer) => (
              <li
                key={layer.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px',
                  marginBottom: '6px',
                  border:
                    selectedLayerId === layer.id
                      ? '2px solid #2563eb'
                      : '1px solid #d1d5db',
                  borderRadius: '8px',
                  background:
                    selectedLayerId === layer.id
                      ? '#eff6ff'
                      : '#ffffff',
                  opacity: layer.visible ? 1 : 0.55,
                }}
              >
                <button
                  type="button"
                  onClick={() => selectLayer(layer.id)}
                  aria-pressed={selectedLayerId === layer.id}
                  title="Chọn lớp"
                >
                  {layerTypeLabels[layer.type] ?? layer.type}
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingLayerId === layer.id ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(event) =>
                        setEditingName(event.target.value)
                      }
                      onBlur={finishRename}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') finishRename();
                        if (event.key === 'Escape') {
                          setEditingLayerId(null);
                          setEditingName('');
                        }
                      }}
                      aria-label="Tên lớp mới"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => selectLayer(layer.id)}
                      onDoubleClick={() =>
                        startRename(layer.id, layer.name)
                      }
                      title="Nhấn đúp để đổi tên"
                      style={{
                        border: 0,
                        background: 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {layer.name}
                    </button>
                  )}

                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    Lớp {layer.order}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggleVisibility(layer.id)}
                  aria-label={
                    layer.visible ? 'Ẩn lớp' : 'Hiện lớp'
                  }
                  title={layer.visible ? 'Ẩn lớp' : 'Hiện lớp'}
                >
                  {layer.visible ? '👁️' : '🚫'}
                </button>

                <button
                  type="button"
                  onClick={() => toggleLock(layer.id)}
                  aria-label={layer.locked ? 'Mở khóa lớp' : 'Khóa lớp'}
                  title={layer.locked ? 'Mở khóa' : 'Khóa'}
                >
                  {layer.locked ? '🔒' : '🔓'}
                </button>

                <button
                  type="button"
                  onClick={() => removeLayer(layer.id)}
                  aria-label={`Xóa lớp ${layer.name}`}
                  title="Xóa lớp"
                >
                  🗑️
                </button>
              </li>
            ))}
        </ul>
      )}

      <p style={{ fontSize: '12px', color: '#6b7280' }}>
        Nhấn đúp vào tên lớp để đổi tên
      </p>
    </section>
  );
}

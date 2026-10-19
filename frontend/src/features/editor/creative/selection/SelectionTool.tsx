
import { useLayerStore } from '../../store/layerStore';

interface SelectionToolProps {
  onSelectionChange?: (layerId: string | null) => void;
}

const layerTypeLabels: Record<string, string> = {
  image: 'Ảnh',
  text: 'Văn bản',
  shape: 'Hình khối',
  sticker: 'Sticker',
  drawing: 'Nét vẽ',
};

export default function SelectionTool({
  onSelectionChange,
}: SelectionToolProps) {
  const layers = useLayerStore((state) => state.layers);
  const selectedLayerId = useLayerStore(
    (state) => state.selectedLayerId,
  );
  const selectLayer = useLayerStore((state) => state.selectLayer);

  const handleSelect = (layerId: string | null) => {
    selectLayer(layerId);
    onSelectionChange?.(layerId);
  };

  const selectedLayer = layers.find(
    (layer) => layer.id === selectedLayerId,
  );

  return (
    <section className="selection-tool">
      <h3>Chọn đối tượng</h3>

      <p>
        {selectedLayer
          ? `Đang chọn: ${selectedLayer.name}`
          : 'Chưa chọn đối tượng'}
      </p>

      {layers.length === 0 ? (
        <p>Chưa có đối tượng để chọn.</p>
      ) : (
        <div>
          <label htmlFor="selection-layer">Đối tượng</label>

          <select
            id="selection-layer"
            value={selectedLayerId ?? ''}
            onChange={(event) =>
              handleSelect(event.target.value || null)
            }
          >
            <option value="">-- Bỏ chọn --</option>

            {layers.map((layer) => (
              <option key={layer.id} value={layer.id}>
                {layer.name} ({layerTypeLabels[layer.type] ?? layer.type})
                {layer.locked ? ' - Đã khóa' : ''}
                {!layer.visible ? ' - Đang ẩn' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedLayer && (
        <div>
          <p>
            <strong>Tên:</strong> {selectedLayer.name}
          </p>
          <p>
            <strong>Loại:</strong>{' '}
            {layerTypeLabels[selectedLayer.type] ?? selectedLayer.type}
          </p>
          <p>
            <strong>Trạng thái:</strong>{' '}
            {selectedLayer.visible ? 'Đang hiện' : 'Đang ẩn'}
          </p>
          <p>
            <strong>Khóa:</strong>{' '}
            {selectedLayer.locked ? 'Có' : 'Không'}
          </p>

          <button
            type="button"
            onClick={() => handleSelect(null)}
          >
            Bỏ chọn đối tượng
          </button>
        </div>
      )}
    </section>
  );
}

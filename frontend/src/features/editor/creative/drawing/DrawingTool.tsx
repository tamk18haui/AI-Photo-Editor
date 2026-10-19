
import { useState } from 'react';

export type DrawingToolType = 'pen' | 'marker' | 'highlighter' | 'eraser';

export interface DrawingSettings {
  tool: DrawingToolType;
  color: string;
  width: number;
  opacity: number;
  enabled: boolean;
}

interface DrawingToolProps {
  onDrawingChange?: (settings: DrawingSettings) => void;
}

export default function DrawingTool({
  onDrawingChange,
}: DrawingToolProps) {
  const [tool, setTool] = useState<DrawingToolType>('pen');
  const [color, setColor] = useState('#000000');
  const [width, setWidth] = useState(4);
  const [opacity, setOpacity] = useState(100);
  const [enabled, setEnabled] = useState(false);

  const notifyChange = (settings: DrawingSettings) => {
    onDrawingChange?.(settings);
  };

  const updateSettings = (
    changes: Partial<DrawingSettings>,
  ) => {
    const nextSettings: DrawingSettings = {
      tool,
      color,
      width,
      opacity,
      enabled,
      ...changes,
    };

    if (changes.tool !== undefined) setTool(changes.tool);
    if (changes.color !== undefined) setColor(changes.color);
    if (changes.width !== undefined) setWidth(changes.width);
    if (changes.opacity !== undefined) setOpacity(changes.opacity);
    if (changes.enabled !== undefined) setEnabled(changes.enabled);

    notifyChange(nextSettings);
  };

  return (
    <div className="drawing-tool">
      <h3>Công cụ vẽ</h3>

      <label htmlFor="drawing-tool-type">Loại công cụ</label>
      <select
        id="drawing-tool-type"
        value={tool}
        onChange={(event) =>
          updateSettings({
            tool: event.target.value as DrawingToolType,
          })
        }
      >
        <option value="pen">Bút thường</option>
        <option value="marker">Bút dạ</option>
        <option value="highlighter">Bút đánh dấu</option>
        <option value="eraser">Tẩy</option>
      </select>

      <label htmlFor="drawing-color">Màu sắc</label>
      <input
        id="drawing-color"
        type="color"
        value={color}
        disabled={tool === 'eraser'}
        onChange={(event) =>
          updateSettings({ color: event.target.value })
        }
      />

      <label htmlFor="drawing-width">
        Độ dày: {width}px
      </label>
      <input
        id="drawing-width"
        type="range"
        min={1}
        max={50}
        value={width}
        onChange={(event) =>
          updateSettings({ width: Number(event.target.value) })
        }
      />

      <label htmlFor="drawing-opacity">
        Độ mờ: {opacity}%
      </label>
      <input
        id="drawing-opacity"
        type="range"
        min={10}
        max={100}
        value={opacity}
        onChange={(event) =>
          updateSettings({ opacity: Number(event.target.value) })
        }
      />

      <button
        type="button"
        onClick={() => updateSettings({ enabled: !enabled })}
      >
        {enabled ? 'Tắt chế độ vẽ' : 'Bật chế độ vẽ'}
      </button>

      <p>
        Trạng thái: {enabled ? 'Đang bật' : 'Đang tắt'}
      </p>

      <p>
        Công cụ hiện tại: {
          tool === 'pen'
            ? 'Bút thường'
            : tool === 'marker'
              ? 'Bút dạ'
              : tool === 'highlighter'
                ? 'Bút đánh dấu'
                : 'Tẩy'
        }
      </p>
    </div>
  );
}

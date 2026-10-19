
import { useState } from 'react';

export type ShapeType =
  | 'rectangle'
  | 'rounded-rectangle'
  | 'square'
  | 'circle'
  | 'ellipse'
  | 'triangle'
  | 'right-triangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'star'
  | 'heart'
  | 'arrow'
  | 'line'
  | 'cross'
  | 'speech-bubble';

interface ShapeOption {
  value: ShapeType;
  label: string;
}

interface ShapeToolProps {
  onAddShape?: (shape: ShapeType) => void;
}

const shapeOptions: ShapeOption[] = [
  { value: 'rectangle', label: 'Hình chữ nhật' },
  { value: 'rounded-rectangle', label: 'Hình chữ nhật bo góc' },
  { value: 'square', label: 'Hình vuông' },
  { value: 'circle', label: 'Hình tròn' },
  { value: 'ellipse', label: 'Hình elip' },
  { value: 'triangle', label: 'Hình tam giác' },
  { value: 'right-triangle', label: 'Hình tam giác vuông' },
  { value: 'diamond', label: 'Hình thoi' },
  { value: 'pentagon', label: 'Hình ngũ giác' },
  { value: 'hexagon', label: 'Hình lục giác' },
  { value: 'star', label: 'Ngôi sao' },
  { value: 'heart', label: 'Trái tim' },
  { value: 'arrow', label: 'Mũi tên' },
  { value: 'line', label: 'Đường thẳng' },
  { value: 'cross', label: 'Dấu cộng' },
  { value: 'speech-bubble', label: 'Bong bóng thoại' },
];

export default function ShapeTool({ onAddShape }: ShapeToolProps) {
  const [selectedShape, setSelectedShape] =
    useState<ShapeType>('rectangle');

  const handleAddShape = () => {
    onAddShape?.(selectedShape);
  };

  return (
    <div className="shape-tool">
      <label htmlFor="shape-select">Chọn hình khối</label>

      <select
        id="shape-select"
        value={selectedShape}
        onChange={(event) =>
          setSelectedShape(event.target.value as ShapeType)
        }
      >
        {shapeOptions.map((shape) => (
          <option key={shape.value} value={shape.value}>
            {shape.label}
          </option>
        ))}
      </select>

      <button type="button" onClick={handleAddShape}>
        Thêm hình
      </button>
    </div>
  );
}

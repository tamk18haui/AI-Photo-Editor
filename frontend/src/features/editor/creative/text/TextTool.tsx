
import { useState } from 'react';

interface TextToolProps {
  onAddText?: (text: string) => void;
}

export default function TextTool({ onAddText }: TextToolProps) {
  const [text, setText] = useState('');

  const handleAddText = () => {
    const value = text.trim();

    if (!value) {
      return;
    }

    onAddText?.(value);
    setText('');
  };

  return (
    <div>
      <label htmlFor="creative-text-input">Nhập nội dung muốn thêm vào</label>

      <input
        id="creative-text-input"
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}

      />

      <button type="button" onClick={handleAddText}>
        Thêm
      </button>
    </div>
  );
}

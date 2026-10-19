
import { useMemo, useState } from 'react';

export type StickerCategory =
  | 'all'
  | 'emoji'
  | 'love'
  | 'decoration'
  | 'animals'
  | 'food'
  | 'travel'
  | 'symbols';

export interface StickerItem {
  id: string;
  name: string;
  emoji: string;
  category: Exclude<StickerCategory, 'all'>;
}

interface StickerToolProps {
  onAddSticker?: (sticker: StickerItem) => void;
}

const stickerGroups: {
  category: Exclude<StickerCategory, 'all'>;
  items: [string, string][];
}[] = [
  {
    category: 'emoji',
    items: [
      ['Mặt cười', '😊'],
      ['Cười lớn', '😂'],
      ['Mắt trái tim', '😍'],
      ['Mặt ngầu', '😎'],
      ['Mặt khóc', '😭'],
      ['Mặt ngạc nhiên', '😲'],
      ['Mặt suy nghĩ', '🤔'],
      ['Mặt tức giận', '😡'],
      ['Mặt nháy mắt', '😉'],
      ['Mặt hôn', '😘'],
      ['Mặt đáng yêu', '🥰'],
      ['Mặt buồn', '😢'],
      ['Mặt lè lưỡi', '😜'],
      ['Mặt cười ngại', '😳'],
      ['Mặt ngủ', '😴'],
      ['Mặt mệt mỏi', '🥱'],
      ['Mặt robot', '🤖'],
      ['Mặt ma', '👻'],
      ['Mặt người ngoài hành tinh', '👽'],
      ['Mặt nóng', '🥵'],
    ],
  },
  {
    category: 'love',
    items: [
      ['Trái tim đỏ', '❤️'],
      ['Trái tim hồng', '💗'],
      ['Trái tim lấp lánh', '💖'],
      ['Trái tim đang lớn', '💓'],
      ['Trái tim màu cam', '🧡'],
      ['Trái tim màu vàng', '💛'],
      ['Trái tim màu xanh lá', '💚'],
      ['Trái tim màu xanh', '💙'],
      ['Trái tim màu tím', '💜'],
      ['Trái tim màu đen', '🖤'],
      ['Trái tim trắng', '🤍'],
      ['Trái tim tan vỡ', '💔'],
      ['Hai trái tim', '💕'],
      ['Trái tim có mũi tên', '💘'],
      ['Nụ hôn', '💋'],
      ['Hoa hồng', '🌹'],
      ['Nhẫn', '💍'],
      ['Cặp đôi', '💑'],
    ],
  },
  {
    category: 'decoration',
    items: [
      ['Ngôi sao', '⭐'],
      ['Sao lấp lánh', '✨'],
      ['Sao xoay', '💫'],
      ['Pháo hoa', '🎆'],
      ['Pháo giấy', '🎉'],
      ['Bóng bay', '🎈'],
      ['Hoa anh đào', '🌸'],
      ['Hoa hướng dương', '🌻'],
      ['Hoa tulip', '🌷'],
      ['Bông hoa', '💐'],
      ['Bướm', '🦋'],
      ['Cầu vồng', '🌈'],
      ['Đám mây', '☁️'],
      ['Mặt trời', '☀️'],
      ['Mặt trăng', '🌙'],
      ['Tia chớp', '⚡'],
      ['Ngọn lửa', '🔥'],
      ['Giọt nước', '💧'],
      ['Tuyết', '❄️'],
      ['Lá xanh', '🍃'],
    ],
  },
  {
    category: 'animals',
    items: [
      ['Mèo', '🐱'],
      ['Chó', '🐶'],
      ['Thỏ', '🐰'],
      ['Gấu', '🐻'],
      ['Gấu trúc', '🐼'],
      ['Cáo', '🦊'],
      ['Sư tử', '🦁'],
      ['Hổ', '🐯'],
      ['Ếch', '🐸'],
      ['Khỉ', '🐵'],
      ['Heo', '🐷'],
      ['Chuột', '🐭'],
      ['Kỳ lân', '🦄'],
      ['Ong', '🐝'],
      ['Bọ rùa', '🐞'],
      ['Cá', '🐠'],
      ['Cá heo', '🐬'],
      ['Bạch tuộc', '🐙'],
    ],
  },
  {
    category: 'food',
    items: [
      ['Dâu tây', '🍓'],
      ['Quả đào', '🍑'],
      ['Quả cherry', '🍒'],
      ['Quả dưa hấu', '🍉'],
      ['Quả bơ', '🥑'],
      ['Quả cam', '🍊'],
      ['Quả táo', '🍎'],
      ['Quả chuối', '🍌'],
      ['Bánh ngọt', '🍰'],
      ['Bánh donut', '🍩'],
      ['Kem', '🍦'],
      ['Kẹo', '🍬'],
      ['Trà sữa', '🧋'],
      ['Cà phê', '☕'],
      ['Pizza', '🍕'],
      ['Hamburger', '🍔'],
    ],
  },
  {
    category: 'travel',
    items: [
      ['Máy ảnh', '📸'],
      ['Máy bay', '✈️'],
      ['Địa cầu', '🌍'],
      ['Biển', '🌊'],
      ['Hòn đảo', '🏝️'],
      ['Núi', '⛰️'],
      ['Lều cắm trại', '⛺'],
      ['Tên lửa', '🚀'],
      ['Xe hơi', '🚗'],
      ['Tàu hỏa', '🚆'],
      ['Địa điểm', '📍'],
      ['Vali', '🧳'],
      ['La bàn', '🧭'],
      ['Ô', '☂️'],
    ],
  },
  {
    category: 'symbols',
    items: [
      ['Dấu tích', '✅'],
      ['Dấu X', '❌'],
      ['Dấu hỏi', '❓'],
      ['Dấu chấm than', '❗'],
      ['Mũi tên phải', '➡️'],
      ['Mũi tên lên', '⬆️'],
      ['Mũi tên xuống', '⬇️'],
      ['Mũi tên trái', '⬅️'],
      ['Bong bóng thoại', '💬'],
      ['Bong bóng suy nghĩ', '💭'],
      ['Vương miện', '👑'],
      ['Huy chương', '🏅'],
      ['Cúp', '🏆'],
      ['Quà tặng', '🎁'],
      ['Chuông', '🔔'],
      ['Đồng hồ', '⏰'],
    ],
  },
];

const stickers: StickerItem[] = stickerGroups.flatMap(
  ({ category, items }) =>
    items.map(([name, emoji], index) => ({
      id: `${category}-${index}`,
      name,
      emoji,
      category,
    })),
);

const categoryLabels: Record<StickerCategory, string> = {
  all: 'Tất cả sticker',
  emoji: 'Biểu cảm',
  love: 'Trái tim & tình yêu',
  decoration: 'Trang trí',
  animals: 'Động vật',
  food: 'Đồ ăn & thức uống',
  travel: 'Du lịch',
  symbols: 'Ký hiệu',
};

export default function StickerTool({
  onAddSticker,
}: StickerToolProps) {
  const [category, setCategory] =
    useState<StickerCategory>('all');
  const [search, setSearch] = useState('');
  const [selectedSticker, setSelectedSticker] =
    useState<StickerItem | null>(null);

  const filteredStickers = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return stickers.filter((sticker) => {
      const matchesCategory =
        category === 'all' || sticker.category === category;

      const matchesSearch =
        sticker.name.toLowerCase().includes(keyword);

      return matchesCategory && matchesSearch;
    });
  }, [category, search]);

  const handleAddSticker = () => {
    if (selectedSticker) {
      onAddSticker?.(selectedSticker);
    }
  };

  return (
    <div className="sticker-tool">
      <h3>Thư viện sticker</h3>

      <p>{filteredStickers.length} sticker</p>

      <label htmlFor="sticker-search">Tìm kiếm</label>
      <input
        id="sticker-search"
        type="search"
        placeholder="Tìm theo tên sticker..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      <label htmlFor="sticker-category">Danh mục</label>
      <select
        id="sticker-category"
        value={category}
        onChange={(event) =>
          setCategory(event.target.value as StickerCategory)
        }
      >
        {Object.entries(categoryLabels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <div
        className="sticker-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: '8px',
          marginTop: '12px',
          marginBottom: '12px',
        }}
      >
        {filteredStickers.map((sticker) => (
          <button
            key={sticker.id}
            type="button"
            title={sticker.name}
            aria-label={sticker.name}
            aria-pressed={selectedSticker?.id === sticker.id}
            onClick={() => setSelectedSticker(sticker)}
            style={{
              fontSize: '28px',
              padding: '8px 4px',
              minHeight: '52px',
              background:
                selectedSticker?.id === sticker.id
                  ? '#eff6ff'
                  : '#ffffff',
              border:
                selectedSticker?.id === sticker.id
                  ? '2px solid #2563eb'
                  : '1px solid #d1d5db',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            {sticker.emoji}
          </button>
        ))}
      </div>

      {filteredStickers.length === 0 && (
        <p>Không tìm thấy sticker phù hợp.</p>
      )}

      {selectedSticker && (
        <p>Đã chọn: {selectedSticker.name}</p>
      )}

      <button
        type="button"
        disabled={!selectedSticker}
        onClick={handleAddSticker}
      >
        Thêm sticker
      </button>
    </div>
  );
}

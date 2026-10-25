// Editor V4.3 - one source of truth for filter thumbnails, canvas preview and PNG export.
export const FILTER_PRESETS = [
  {
    "id": "original",
    "name": "Gốc",
    "filter": "none",
    "group": "Cơ bản"
  },
  {
    "id": "bw",
    "name": "Đen trắng",
    "filter": "grayscale(1)",
    "group": "Cơ bản"
  },
  {
    "id": "vintage",
    "name": "Vintage",
    "filter": "sepia(.55) contrast(.92)",
    "group": "Cơ bản"
  },
  {
    "id": "warm",
    "name": "Ấm áp",
    "filter": "sepia(.28) saturate(1.14)",
    "group": "Cơ bản"
  },
  {
    "id": "cool",
    "name": "Lạnh",
    "filter": "hue-rotate(18deg) saturate(.92)",
    "group": "Cơ bản"
  },
  {
    "id": "vivid",
    "name": "Rực rỡ",
    "filter": "saturate(1.65) contrast(1.1)",
    "group": "Cơ bản"
  },
  {
    "id": "soft",
    "name": "Mềm mại",
    "filter": "contrast(.87) saturate(.85)",
    "group": "Cơ bản"
  },
  {
    "id": "dramatic",
    "name": "Điện ảnh",
    "filter": "contrast(1.32) saturate(.9)",
    "group": "Cơ bản"
  },
  {
    "id": "golden",
    "name": "Giờ vàng",
    "filter": "sepia(.24) saturate(1.32) brightness(1.08)",
    "group": "Chân dung"
  },
  {
    "id": "portrait",
    "name": "Chân dung",
    "filter": "brightness(1.07) contrast(.96) saturate(1.13)",
    "group": "Chân dung"
  },
  {
    "id": "peach",
    "name": "Đào hồng",
    "filter": "sepia(.13) hue-rotate(-12deg) saturate(1.18)",
    "group": "Chân dung"
  },
  {
    "id": "cream",
    "name": "Kem sữa",
    "filter": "brightness(1.12) contrast(.85) saturate(.77)",
    "group": "Chân dung"
  },
  {
    "id": "blush",
    "name": "Hồng phấn",
    "filter": "sepia(.19) hue-rotate(330deg) brightness(1.08)",
    "group": "Chân dung"
  },
  {
    "id": "fade",
    "name": "Phai nhẹ",
    "filter": "contrast(.78) saturate(.68) brightness(1.12)",
    "group": "Chân dung"
  },
  {
    "id": "street",
    "name": "Đường phố",
    "filter": "contrast(1.22) saturate(.9)",
    "group": "Đường phố"
  },
  {
    "id": "urban",
    "name": "Urban",
    "filter": "grayscale(.25) contrast(1.3)",
    "group": "Đường phố"
  },
  {
    "id": "cinema",
    "name": "Cinematic",
    "filter": "contrast(1.2) saturate(.72) sepia(.14)",
    "group": "Đường phố"
  },
  {
    "id": "night",
    "name": "Phố đêm",
    "filter": "contrast(1.45) brightness(.84) saturate(1.3)",
    "group": "Đường phố"
  },
  {
    "id": "steel",
    "name": "Thép lạnh",
    "filter": "saturate(.65) hue-rotate(22deg) contrast(1.24)",
    "group": "Đường phố"
  },
  {
    "id": "neon-night",
    "name": "Neon City",
    "filter": "saturate(1.7) hue-rotate(15deg) contrast(1.23)",
    "group": "Đường phố"
  },
  {
    "id": "forest",
    "name": "Rừng xanh",
    "filter": "hue-rotate(13deg) saturate(1.2) contrast(1.05)",
    "group": "Phong cảnh"
  },
  {
    "id": "sky",
    "name": "Bầu trời",
    "filter": "saturate(1.24) hue-rotate(8deg) brightness(1.07)",
    "group": "Phong cảnh"
  },
  {
    "id": "desert",
    "name": "Sa mạc",
    "filter": "sepia(.32) saturate(1.18) contrast(1.13)",
    "group": "Phong cảnh"
  },
  {
    "id": "ocean",
    "name": "Đại dương",
    "filter": "hue-rotate(28deg) saturate(1.2) contrast(1.08)",
    "group": "Phong cảnh"
  },
  {
    "id": "sunset",
    "name": "Hoàng hôn",
    "filter": "sepia(.38) saturate(1.45) contrast(1.06)",
    "group": "Phong cảnh"
  },
  {
    "id": "spring",
    "name": "Mùa xuân",
    "filter": "saturate(1.3) brightness(1.11) contrast(.93)",
    "group": "Phong cảnh"
  },
  {
    "id": "film35",
    "name": "Film 35",
    "filter": "sepia(.26) contrast(.95) saturate(.78)",
    "group": "Hoài cổ"
  },
  {
    "id": "matte",
    "name": "Matte",
    "filter": "contrast(.77) brightness(1.07) saturate(.8)",
    "group": "Hoài cổ"
  },
  {
    "id": "retro-blue",
    "name": "Retro xanh",
    "filter": "hue-rotate(26deg) sepia(.12) saturate(.8)",
    "group": "Hoài cổ"
  },
  {
    "id": "sepia",
    "name": "Sepia",
    "filter": "sepia(.95) contrast(1.06)",
    "group": "Hoài cổ"
  },
  {
    "id": "old-photo",
    "name": "Ảnh cũ",
    "filter": "grayscale(.42) sepia(.55) contrast(.91)",
    "group": "Hoài cổ"
  },
  {
    "id": "mono-soft",
    "name": "Mono dịu",
    "filter": "grayscale(1) contrast(.82) brightness(1.09)",
    "group": "Hoài cổ"
  },
  {
    "id": "pop",
    "name": "Pop Art",
    "filter": "saturate(1.95) contrast(1.33)",
    "group": "Sáng tạo"
  },
  {
    "id": "ice",
    "name": "Băng giá",
    "filter": "hue-rotate(42deg) saturate(.83) brightness(1.13)",
    "group": "Sáng tạo"
  },
  {
    "id": "dream",
    "name": "Mơ màng",
    "filter": "brightness(1.16) contrast(.78) saturate(1.22)",
    "group": "Sáng tạo"
  },
  {
    "id": "moody",
    "name": "Tâm trạng",
    "filter": "brightness(.87) contrast(1.16) saturate(.61)",
    "group": "Sáng tạo"
  }
] as const;
export const FILTER_MAP: Record<string,string> = Object.fromEntries(FILTER_PRESETS.map(p => [p.id,p.filter]));
export const FRAME_PRESETS = [
  {
    "id": "none",
    "name": "Không khung"
  },
  {
    "id": "simple",
    "name": "Khung trắng"
  },
  {
    "id": "polaroid",
    "name": "Polaroid"
  },
  {
    "id": "film",
    "name": "Cuộn phim"
  },
  {
    "id": "minimal",
    "name": "Tối giản"
  },
  {
    "id": "gold",
    "name": "Ánh kim"
  },
  {
    "id": "noir",
    "name": "Đen nhám"
  },
  {
    "id": "editorial",
    "name": "Tạp chí"
  },
  {
    "id": "rounded",
    "name": "Góc bo"
  },
  {
    "id": "double",
    "name": "Viền kép"
  },
  {
    "id": "vintage",
    "name": "Retro"
  },
  {
    "id": "neon",
    "name": "Neon"
  },
  {
    "id": "pastel",
    "name": "Pastel"
  },
  {
    "id": "postcard",
    "name": "Bưu thiếp"
  }
] as const;

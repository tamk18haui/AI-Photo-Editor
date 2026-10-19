
type AssetCardProps = {
  name: string;
  imageUrl: string;
  selected?: boolean;
  onSelect?: () => void;
};

export default function AssetCard({
  name,
  imageUrl,
  selected = false,
  onSelect,
}: AssetCardProps) {
  return (
    <div
      onClick={onSelect}
      style={{
        border: selected ? "2px solid #2563eb" : "1px solid #ddd",
        borderRadius: "8px",
        padding: "8px",
        cursor: "pointer",
      }}
    >
      <img
        src={imageUrl}
        alt={name}
        style={{
          width: "100%",
          height: "140px",
          objectFit: "cover",
          borderRadius: "4px",
        }}
      />

      <p
        style={{
          margin: "8px 0 0",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </p>
    </div>
  );
}

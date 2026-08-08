interface AvatarProps {
  name: string;
  color: string;
  size?: number;
  online?: boolean;
}

export default function Avatar({ name, color, size = 40, online }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="rounded-full flex items-center justify-center text-white font-medium"
        style={{
          width: size,
          height: size,
          backgroundColor: color,
          fontSize: size * 0.38,
        }}
      >
        {initials || '?'}
      </div>
      {online && (
        <div
          className="absolute bottom-0 right-0 bg-green-500 rounded-full border-2 border-white"
          style={{ width: size * 0.3, height: size * 0.3 }}
        />
      )}
    </div>
  );
}

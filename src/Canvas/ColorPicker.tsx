import { useCallback } from 'react';

interface ColorPickerProps {
  onSelect: (color: string | null) => void;
  onClose: () => void;
}

const COLORS = [
  { name: '无颜色', value: null, hex: 'transparent' },
  { name: '红色', value: '1', hex: '#ef4444' },
  { name: '橙色', value: '2', hex: '#f97316' },
  { name: '黄色', value: '3', hex: '#eab308' },
  { name: '绿色', value: '4', hex: '#22c55e' },
  { name: '青色', value: '5', hex: '#06b6d4' },
  { name: '蓝色', value: '6', hex: '#3b82f6' },
  { name: '紫色', value: '7', hex: '#a855f7' },
  { name: '灰色', value: '8', hex: '#6b7280' },
];

export default function ColorPicker({ onSelect, onClose }: ColorPickerProps) {
  const handleColorClick = useCallback((color: string | null) => {
    onSelect(color);
    onClose();
  }, [onSelect, onClose]);

  return (
    <div className="color-picker">
      {COLORS.map((color) => (
        <button
          key={color.name}
          className="color-picker-btn"
          title={color.name}
          onClick={() => handleColorClick(color.value)}
          style={{
            background: color.value === null ? 'var(--bg-primary)' : color.hex,
            border: color.value === null ? '2px dashed var(--border)' : 'none',
          }}
        />
      ))}
    </div>
  );
}

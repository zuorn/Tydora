import { useState, useEffect } from 'react';
import { loadCanvasSettings, saveCanvasSettings, type CanvasSettings } from './canvas-settings';

interface CanvasSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CanvasSettings({ isOpen, onClose }: CanvasSettingsProps) {
  const [settings, setSettings] = useState<CanvasSettings>(loadCanvasSettings());

  useEffect(() => {
    if (isOpen) {
      setSettings(loadCanvasSettings());
    }
  }, [isOpen]);

  const handleChange = (key: keyof CanvasSettings, value: any) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    saveCanvasSettings(updated);
  };

  if (!isOpen) return null;

  return (
    <div className="canvas-settings-overlay">
      <div className="canvas-settings-modal">
        <div className="canvas-settings-header">
          <h2>白板设置</h2>
          <button className="canvas-settings-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="canvas-settings-content">
          {/* Storage Location */}
          <div className="canvas-settings-section">
            <h3>新建白板存储位置</h3>
            <div className="canvas-settings-group">
              <label className="canvas-settings-radio">
                <input
                  type="radio"
                  name="storageLocation"
                  value="vault-root"
                  checked={settings.storageLocation === 'vault-root'}
                  onChange={() => handleChange('storageLocation', 'vault-root')}
                />
                <span>仓库根目录</span>
              </label>
              <label className="canvas-settings-radio">
                <input
                  type="radio"
                  name="storageLocation"
                  value="current-folder"
                  checked={settings.storageLocation === 'current-folder'}
                  onChange={() => handleChange('storageLocation', 'current-folder')}
                />
                <span>当前文件所在的文件夹</span>
              </label>
              <label className="canvas-settings-radio">
                <input
                  type="radio"
                  name="storageLocation"
                  value="custom-folder"
                  checked={settings.storageLocation === 'custom-folder'}
                  onChange={() => handleChange('storageLocation', 'custom-folder')}
                />
                <span>指定附件文件夹</span>
              </label>
              {settings.storageLocation === 'custom-folder' && (
                <input
                  type="text"
                  className="canvas-settings-input"
                  value={settings.customFolder}
                  onChange={(e) => handleChange('customFolder', e.target.value)}
                  placeholder="assets"
                />
              )}
            </div>
          </div>

          {/* Alignment Options */}
          <div className="canvas-settings-section">
            <h3>对齐选项</h3>
            <div className="canvas-settings-group">
              <label className="canvas-settings-toggle">
                <input
                  type="checkbox"
                  checked={settings.snapToGrid}
                  onChange={(e) => handleChange('snapToGrid', e.target.checked)}
                />
                <span>对齐网格</span>
              </label>
              {settings.snapToGrid && (
                <div className="canvas-settings-inline">
                  <label>网格大小：</label>
                  <input
                    type="number"
                    className="canvas-settings-input-small"
                    value={settings.gridSize}
                    onChange={(e) => handleChange('gridSize', parseInt(e.target.value) || 15)}
                    min="5"
                    max="50"
                  />
                  <span>px</span>
                </div>
              )}
              <label className="canvas-settings-toggle">
                <input
                  type="checkbox"
                  checked={settings.snapToObjects}
                  onChange={(e) => handleChange('snapToObjects', e.target.checked)}
                />
                <span>对齐物体</span>
              </label>
            </div>
          </div>

          {/* Display Options */}
          <div className="canvas-settings-section">
            <h3>显示选项</h3>
            <div className="canvas-settings-group">
              <div className="canvas-settings-inline">
                <label>隐藏卡片内容缩放阈值：</label>
                <input
                  type="number"
                  className="canvas-settings-input-small"
                  value={settings.hideContentZoomThreshold}
                  onChange={(e) => handleChange('hideContentZoomThreshold', parseFloat(e.target.value) || 0.3)}
                  min="0.1"
                  max="1"
                  step="0.1"
                />
                <span>（缩放低于此值时隐藏卡片内容）</span>
              </div>
              <label className="canvas-settings-toggle">
                <input
                  type="checkbox"
                  checked={settings.minimapEnabled}
                  onChange={(e) => handleChange('minimapEnabled', e.target.checked)}
                />
                <span>启用小地图</span>
              </label>
              {settings.minimapEnabled && (
                <div className="canvas-settings-inline">
                  <label>小地图位置：</label>
                  <select
                    className="canvas-settings-select"
                    value={settings.minimapPosition}
                    onChange={(e) => handleChange('minimapPosition', e.target.value)}
                  >
                    <option value="top-left">左上角</option>
                    <option value="bottom-left">左下角</option>
                    <option value="bottom-right">右下角</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Default Card Sizes */}
          <div className="canvas-settings-section">
            <h3>默认卡片大小</h3>
            <div className="canvas-settings-group">
              <div className="canvas-settings-inline">
                <label>文本卡片：</label>
                <input
                  type="number"
                  className="canvas-settings-input-small"
                  value={settings.defaultTextCardSize.width}
                  onChange={(e) => handleChange('defaultTextCardSize', {
                    ...settings.defaultTextCardSize,
                    width: parseInt(e.target.value) || 400
                  })}
                />
                <span>x</span>
                <input
                  type="number"
                  className="canvas-settings-input-small"
                  value={settings.defaultTextCardSize.height}
                  onChange={(e) => handleChange('defaultTextCardSize', {
                    ...settings.defaultTextCardSize,
                    height: parseInt(e.target.value) || 200
                  })}
                />
                <span>px</span>
              </div>
              <div className="canvas-settings-inline">
                <label>笔记卡片：</label>
                <input
                  type="number"
                  className="canvas-settings-input-small"
                  value={settings.defaultNoteCardSize.width}
                  onChange={(e) => handleChange('defaultNoteCardSize', {
                    ...settings.defaultNoteCardSize,
                    width: parseInt(e.target.value) || 400
                  })}
                />
                <span>x</span>
                <input
                  type="number"
                  className="canvas-settings-input-small"
                  value={settings.defaultNoteCardSize.height}
                  onChange={(e) => handleChange('defaultNoteCardSize', {
                    ...settings.defaultNoteCardSize,
                    height: parseInt(e.target.value) || 400
                  })}
                />
                <span>px</span>
              </div>
              <div className="canvas-settings-inline">
                <label>多媒体卡片：</label>
                <input
                  type="number"
                  className="canvas-settings-input-small"
                  value={settings.defaultMediaCardSize.width}
                  onChange={(e) => handleChange('defaultMediaCardSize', {
                    ...settings.defaultMediaCardSize,
                    width: parseInt(e.target.value) || 400
                  })}
                />
                <span>x</span>
                <input
                  type="number"
                  className="canvas-settings-input-small"
                  value={settings.defaultMediaCardSize.height}
                  onChange={(e) => handleChange('defaultMediaCardSize', {
                    ...settings.defaultMediaCardSize,
                    height: parseInt(e.target.value) || 300
                  })}
                />
                <span>px</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

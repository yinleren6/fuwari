# Fix Public Links Plugin

这个 Obsidian 插件会自动修复图片链接格式，将 `public/` 开头的链接转换为 `/public/` 格式。

## 功能

1. **自动修复**：当你粘贴图片时，插件会自动检测并修复链接格式
2. **手动修复**：通过命令面板运行 "Fix public/ links in current file" 来手动修复当前文件的所有链接

## 使用方法

### 启用插件

1. 打开 Obsidian 设置
2. 进入"社区插件"
3. 关闭"安全模式"（如果还没关闭）
4. 在已安装插件列表中找到 "Fix Public Links"
5. 启用插件

### 自动修复

粘贴图片后，插件会自动将：
```markdown
![image](public/assets/images/example.png)
```

转换为：
```markdown
![image](/public/assets/images/example.png)
```

### 手动修复

1. 按 `Ctrl/Cmd + P` 打开命令面板
2. 搜索 "Fix public/ links in current file"
3. 执行命令，当前文件中所有 `public/` 开头的链接都会被修复

## 工作原理

插件监听文件创建事件（粘贴图片时会创建文件），然后自动扫描当前文件并修复所有匹配的链接。

## 版本历史

- **1.0.0** (2026-04-19): 初始版本
  - 自动修复粘贴图片时的链接
  - 添加手动修复命令

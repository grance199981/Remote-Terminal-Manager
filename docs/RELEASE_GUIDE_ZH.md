# 发布 Windows exe 到 GitHub Releases

本项目推荐采用：

- Git 仓库保存源码、配置和文档；
- GitHub Releases 保存可直接运行的 Windows exe。

这样用户可以直接下载图形界面软件，同时仓库本体不会因为二进制文件变得很大。

## 1. 本地构建

在项目根目录执行：

```powershell
cmd /c npm.cmd run package:win
```

构建完成后，exe 会生成在：

```text
apps/desktop/release/
```

例如：

```text
apps/desktop/release/Remote-Terminal-Manager-0.1.0-portable-x64-native-scale.exe
```

## 2. 推送源码到 GitHub

如果是第一次推送：

```powershell
git remote add origin https://github.com/你的用户名/你的仓库名.git
git branch -M main
git push -u origin main
```

之后更新源码时：

```powershell
git push
```

## 3. 在 GitHub Releases 上传 exe

1. 打开 GitHub 仓库页面。
2. 点击 `Releases`。
3. 点击 `Draft a new release`。
4. 新建 tag，例如 `v0.1.0`。
5. Release title 填写：`Remote Terminal Manager v0.1.0`。
6. 在附件区域上传 `apps/desktop/release/` 下的 exe。
7. 点击 `Publish release`。

## 4. README 下载链接

README 中可以使用这个链接指向最新版：

```text
https://github.com/你的用户名/你的仓库名/releases/latest
```

也可以使用相对链接：

```markdown
[下载最新版](../../releases/latest)
```

## 5. 为什么不把 exe 直接提交到 Git

exe 是构建产物，通常接近几十 MB 或更大。如果每次都提交到 Git：

- 仓库克隆会越来越慢；
- Git 历史会膨胀；
- 删除旧 exe 后历史里仍然保留；
- 不利于代码审查。

GitHub Releases 正是用于发布 exe、zip、dmg 等成品文件的地方。
